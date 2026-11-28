import * as THREE from 'three';
import { groundHeightAt } from './worldMath';
import type { CompiledArchitecture } from './architectureCompiler';
import {
  CollisionLayer,
  type CollisionBody,
  type ContainerDomainDef,
} from './spatialTypes';

export interface MoveCapsuleOptions {
  /** Override dynamic Doumen gate state (defaults to kernel's current doumenOpen). */
  doumenOpen?: boolean;
  /** Keep custom Y elevation instead of snapping to groundHeightAt (e.g., swimming waterfowl). */
  preserveY?: boolean;
  /** Skip dynamic entity-vs-entity separation (e.g., single-body station probe). */
  skipDynamicSeparation?: boolean;
}

export interface MoveCapsuleResult {
  x: number;
  y: number;
  z: number;
  collidedStatic: boolean;
  collidedDynamic: boolean;
  scatterX: number;
  scatterZ: number;
  subSteps: number;
}

export interface ContainerClampResult {
  x: number;
  y: number;
  z: number;
  wasOutside: boolean;
  distanceOutside: number;
}

const MAX_DT = 0.05;
const WORLD_BOUND_RADIUS = 88;
const POND_CENTER_Z = 38.6;
const POND_RX = 16.0;
const POND_RZ = 10.6;

/**
 * Unified 3-Stage Spatial Physics Kernel:
 * 1. Static Architecture Capsule-vs-BVH Slide (three-mesh-bvh triangle closest-point projection + dynamic Doumen gates + PROPS + POND_WATER bitmask)
 * 2. Dynamic Entity-vs-Entity 2D Position-Based Separation + Poultry Scatter (followed by static BVH re-clip so nobody is pushed into walls)
 * 3. Sub-stepping anti-tunneling whenever displacement > radius * 0.5 and frame dt clamped <= 0.05s
 *
 * Also enforces runtime ContainerDomain bounds for Koi fish & caged songbirds.
 */
export class SpatialPhysicsKernel {
  private compiled: CompiledArchitecture;
  private bodies = new Map<string, CollisionBody>();
  private domains = new Map<string, ContainerDomainDef>();
  private doumenOpen = false;

  // Reusable scratch vectors to eliminate per-frame GC allocations
  private readonly _box = new THREE.Box3();
  private readonly _pt = new THREE.Vector3();
  private readonly _closest = new THREE.Vector3();
  private readonly _bestClosest = new THREE.Vector3();
  private readonly _triNormal = new THREE.Vector3();
  private readonly _ray = new THREE.Ray();

  constructor(compiled: CompiledArchitecture) {
    this.compiled = compiled;
    this.registerContainerDomain(compiled.blueprint.pondDomain);
    this.registerContainerDomain(compiled.blueprint.vatDomain);
  }

  getCompiledArchitecture(): CompiledArchitecture {
    return this.compiled;
  }

  setDoumenOpen(open: boolean): void {
    this.doumenOpen = open;
  }

  isDoumenOpen(): boolean {
    return this.doumenOpen;
  }

  registerBody(body: CollisionBody): CollisionBody {
    const stored: CollisionBody = {
      active: true,
      weight: 1.0,
      ...body,
    };
    this.bodies.set(body.id, stored);
    return stored;
  }

  unregisterBody(id: string): void {
    this.bodies.delete(id);
  }

  getBody(id: string): CollisionBody | undefined {
    return this.bodies.get(id);
  }

  listBodies(): CollisionBody[] {
    return Array.from(this.bodies.values());
  }

  /**
   * Explicit teleport / time-scrub sync (updates kernel body state atomically).
   */
  syncBodyPosition(id: string, x: number, y: number, z: number): void {
    const body = this.bodies.get(id);
    if (!body) return;
    body.x = x;
    body.y = y;
    body.z = z;
  }

  registerContainerDomain(def: ContainerDomainDef): void {
    this.domains.set(def.id, { ...def });
  }

  getContainerDomain(id: string): ContainerDomainDef | undefined {
    return this.domains.get(id);
  }

  /**
   * Clamps a world-space position strictly inside a registered ContainerDomain
   * (Half-Moon Pond, Courtyard Vat, or Birdcage).
   */
  clampToContainer(domainId: string, x: number, y: number, z: number): ContainerClampResult {
    const d = this.domains.get(domainId);
    if (!d) {
      return { x, y, z, wasOutside: false, distanceOutside: 0 };
    }

    let nx = x;
    let ny = y;
    let nz = z;
    let wasOutside = false;
    let distOut = 0;

    // Vertical bounds
    if (ny < d.minY) {
      distOut = Math.max(distOut, d.minY - ny);
      ny = d.minY;
      wasOutside = true;
    } else if (ny > d.maxY) {
      distOut = Math.max(distOut, ny - d.maxY);
      ny = d.maxY;
      wasOutside = true;
    }

    if (d.kind === 'pond_ellipse') {
      const rx = Math.max(0.5, (d.rx ?? 15.5) - d.margin);
      const rz = Math.max(0.5, (d.rz ?? 10.2) - d.margin);
      const minZ = (d.minZ ?? d.cz) + d.margin * 0.4;
      if (nz < minZ) {
        distOut = Math.max(distOut, minZ - nz);
        nz = minZ;
        wasOutside = true;
      }
      const dx = nx - d.cx;
      const dz = Math.max(0, nz - d.cz);
      const norm = Math.hypot(dx / rx, dz / rz);
      if (norm > 1.0) {
        distOut = Math.max(distOut, (norm - 1.0) * Math.min(rx, rz));
        nx = d.cx + dx / norm;
        nz = d.cz + dz / norm;
        wasOutside = true;
      }
      // Re-enforce minZ north bank chord in case radial projection pulled nz north of minZ
      if (nz < minZ) {
        nz = minZ;
        const zNorm = Math.min(0.999, Math.max(0, (nz - d.cz) / rz));
        const maxChordX = rx * Math.sqrt(Math.max(0, 1 - zNorm * zNorm));
        if (Math.abs(nx - d.cx) > maxChordX) {
          nx = d.cx + Math.sign(nx - d.cx) * maxChordX;
        }
        wasOutside = true;
      }
    } else if (d.kind === 'cylinder') {
      const maxR = Math.max(0.05, (d.radius ?? 0.3) - d.margin);
      const dx = nx - d.cx;
      const dz = nz - d.cz;
      const dist = Math.hypot(dx, dz);
      if (dist > maxR && dist > 1e-6) {
        distOut = Math.max(distOut, dist - maxR);
        nx = d.cx + (dx / dist) * maxR;
        nz = d.cz + (dz / dist) * maxR;
        wasOutside = true;
      }
    } else if (d.kind === 'box') {
      const halfX = Math.max(0.05, (d.rx ?? 0.3) - d.margin);
      const halfZ = Math.max(0.05, (d.rz ?? 0.3) - d.margin);
      if (nx < d.cx - halfX) {
        distOut = Math.max(distOut, d.cx - halfX - nx);
        nx = d.cx - halfX;
        wasOutside = true;
      } else if (nx > d.cx + halfX) {
        distOut = Math.max(distOut, nx - (d.cx + halfX));
        nx = d.cx + halfX;
        wasOutside = true;
      }
      if (nz < d.cz - halfZ) {
        distOut = Math.max(distOut, d.cz - halfZ - nz);
        nz = d.cz - halfZ;
        wasOutside = true;
      } else if (nz > d.cz + halfZ) {
        distOut = Math.max(distOut, nz - (d.cz + halfZ));
        nz = d.cz + halfZ;
        wasOutside = true;
      }
    }

    return { x: nx, y: ny, z: nz, wasOutside, distanceOutside: distOut };
  }

  /**
   * Unified entry point for ALL dynamic character/player/animal movement.
   * Accepts desired displacement delta, applies anti-tunneling sub-stepping,
   * Stage 1 Static BVH Slide, and Stage 2 Dynamic Entity Separation + Static Re-clip.
   */
  moveCapsule(
    entityId: string,
    desiredDelta: { x: number; y?: number; z: number },
    dt: number,
    opts?: MoveCapsuleOptions
  ): MoveCapsuleResult {
    const body = this.bodies.get(entityId);
    if (!body) {
      throw new Error(`[SpatialPhysicsKernel] Unknown entity "${entityId}"`);
    }

    // Clamp frame dt <= 0.05s to prevent lag-spike tunneling
    const clampedDt = Math.min(Math.max(dt, 0), MAX_DT);
    const dtScale = dt > MAX_DT && dt > 1e-6 ? clampedDt / dt : 1.0;

    const totalDx = desiredDelta.x * dtScale;
    const totalDz = desiredDelta.z * dtScale;
    const totalDy = (desiredDelta.y ?? 0) * dtScale;

    const dist = Math.hypot(totalDx, totalDz);
    const maxStep = Math.max(0.06, body.radius * 0.5);
    const subSteps = Math.max(1, Math.min(24, Math.ceil(dist / maxStep)));

    const stepDx = totalDx / subSteps;
    const stepDz = totalDz / subSteps;
    const stepDy = totalDy / subSteps;
    const doumenOpen = opts?.doumenOpen ?? this.doumenOpen;

    let x = body.x;
    let y = body.y;
    let z = body.z;
    let collidedStatic = false;
    let collidedDynamic = false;
    let scatterX = 0;
    let scatterZ = 0;

    for (let s = 0; s < subSteps; s++) {
      x += stepDx;
      z += stepDz;
      y = opts?.preserveY ? y + stepDy : groundHeightAt(x, z, y);

      // Stage 1: Static Architecture Capsule-vs-BVH Slide + Dynamic Gates + Props + Pond Mask
      const staticRes = this.resolveStaticCapsule(x, y, z, body.radius, body.height, body.mask, doumenOpen);
      x = staticRes.x;
      z = staticRes.z;
      if (staticRes.hit) collidedStatic = true;

      // Stage 2: Dynamic Entity-vs-Entity 2D Position-Based Separation + Poultry Scatter
      if (!opts?.skipDynamicSeparation && !body.kinematicOnly) {
        const dynRes = this.resolveDynamicSeparation(body, x, y, z);
        x = dynRes.x;
        z = dynRes.z;
        scatterX += dynRes.scatterX;
        scatterZ += dynRes.scatterZ;

        if (dynRes.pushed) {
          collidedDynamic = true;
          // Re-clip against static BVH so dynamic separation can NEVER push any entity into a wall!
          const reclip = this.resolveStaticCapsule(x, y, z, body.radius, body.height, body.mask, doumenOpen);
          x = reclip.x;
          z = reclip.z;
          if (reclip.hit) collidedStatic = true;
        }
      }
    }

    // Apply small scatter push for poultry/waterfowl fleeing approaching people, then re-clip statically
    if ((scatterX !== 0 || scatterZ !== 0) && !body.kinematicOnly) {
      const sMag = Math.hypot(scatterX, scatterZ);
      const maxScatterStep = Math.min(0.18, sMag * Math.max(0.016, clampedDt) * 3.4);
      x += (scatterX / sMag) * maxScatterStep;
      z += (scatterZ / sMag) * maxScatterStep;
      const reclip = this.resolveStaticCapsule(x, y, z, body.radius, body.height, body.mask, doumenOpen);
      x = reclip.x;
      z = reclip.z;
    }

    // Clamp to outer scenic valley boundary
    const worldR = Math.hypot(x, z);
    if (worldR > WORLD_BOUND_RADIUS) {
      const scale = WORLD_BOUND_RADIUS / worldR;
      x *= scale;
      z *= scale;
      collidedStatic = true;
    }

    const finalY = opts?.preserveY ? y : groundHeightAt(x, z, y);
    body.x = x;
    body.y = finalY;
    body.z = z;

    return {
      x,
      y: finalY,
      z,
      collidedStatic,
      collidedDynamic,
      scatterX,
      scatterZ,
      subSteps,
    };
  }

  /**
   * Probes whether a stationary capsule fits cleanly without clipping STATIC_ARCH
   * (and optionally PROPS). Used directly by SceneValidator Rule 4 ([STATION_ERROR]).
   */
  probeCapsuleClearance(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    mask: number,
    doumenOpen = true
  ): { clear: boolean; penetration: number; resolvedX: number; resolvedZ: number } {
    const res = this.resolveStaticCapsule(x, y, z, radius, height, mask, doumenOpen);
    let penetration = Math.hypot(res.x - x, res.z - z);

    // Also guard against a station placed completely inside the interior of a thick wall/chamber box
    if ((mask & CollisionLayer.STATIC_ARCH) !== 0 && penetration <= 0.03) {
      const yMid = y + height * 0.5;
      for (let i = 0; i < this.compiled.staticArchBoxes.length; i++) {
        const entry = this.compiled.staticArchBoxes[i];
        if (entry.archKind !== 'wall' && entry.archKind !== 'chamber' && entry.archKind !== 'column') {
          continue;
        }
        const b = entry.box;
        if (
          x > b.min.x - radius &&
          x < b.max.x + radius &&
          z > b.min.z - radius &&
          z < b.max.z + radius &&
          yMid > b.min.y &&
          yMid < b.max.y
        ) {
          const dMin = Math.min(
            Math.abs(x - (b.min.x - radius)),
            Math.abs(b.max.x + radius - x),
            Math.abs(z - (b.min.z - radius)),
            Math.abs(b.max.z + radius - z)
          );
          penetration = Math.max(penetration, dMin);
        }
      }
    }

    return {
      clear: penetration <= 0.03,
      penetration,
      resolvedX: res.x,
      resolvedZ: res.z,
    };
  }

  /**
   * Exact raycast against the compiled static architectural BVH (for camera arm pull-in).
   */
  raycastStaticBvh(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number
  ): { hit: boolean; distance: number; point: THREE.Vector3 | null } {
    this._ray.origin.copy(origin);
    this._ray.direction.copy(direction).normalize();
    const hit = this.compiled.staticBvh.raycastFirst(this._ray, THREE.DoubleSide);
    if (hit && hit.distance <= maxDistance) {
      return { hit: true, distance: hit.distance, point: hit.point.clone() };
    }
    return { hit: false, distance: maxDistance, point: null };
  }

  /**
   * Exact upward raycast against compiled overhead beams, eaves, purlins, and roof anchors
   * (used by SceneValidator Rule 3 [FLOAT_ERROR]).
   */
  raycastOverheadAnchor(
    origin: THREE.Vector3,
    maxDistance: number
  ): { hit: boolean; distance: number; point: THREE.Vector3 | null } {
    this._ray.origin.copy(origin);
    this._ray.direction.set(0, 1, 0);
    const hit = this.compiled.ceilingBvh.raycastFirst(this._ray, THREE.DoubleSide);
    if (hit && hit.distance <= maxDistance) {
      return { hit: true, distance: hit.distance, point: hit.point.clone() };
    }
    // Fallback: also test staticBvh (e.g., granite portal lintel / wall jamb overhang)
    const hitArch = this.compiled.staticBvh.raycastFirst(this._ray, THREE.DoubleSide);
    if (hitArch && hitArch.distance <= maxDistance) {
      return { hit: true, distance: hitArch.distance, point: hitArch.point.clone() };
    }
    return { hit: false, distance: maxDistance, point: null };
  }

  /**
   * Stage 1: Capsule vs three-mesh-bvh static architectural slide + dynamic gates + props + pond mask.
   */
  private resolveStaticCapsule(
    startX: number,
    y: number,
    startZ: number,
    radius: number,
    height: number,
    mask: number,
    doumenOpen: boolean
  ): { x: number; z: number; hit: boolean } {
    let x = startX;
    let z = startZ;
    let hit = false;

    const segY0 = y + Math.min(radius, height * 0.35);
    const segY1 = Math.max(segY0 + 0.05, y + height - Math.min(radius, height * 0.25));
    const rSq = radius * radius;

    // 1A. three-mesh-bvh Capsule-vs-Triangle Slide (2 solver passes for crisp corners)
    if ((mask & CollisionLayer.STATIC_ARCH) !== 0) {
      for (let pass = 0; pass < 2; pass++) {
        this._box.min.set(x - radius - 0.02, segY0 - radius, z - radius - 0.02);
        this._box.max.set(x + radius + 0.02, segY1 + radius, z + radius + 0.02);

        this.compiled.staticBvh.shapecast({
          intersectsBounds: (box) => box.intersectsBox(this._box),
          intersectsTriangle: (tri) => {
            tri.getNormal(this._triNormal);
            // Ignore near-horizontal floor/ceiling caps so capsule only slides along walls & columns
            if (Math.abs(this._triNormal.y) > 0.72) {
              return false;
            }

            // Evaluate closest point on triangle against vertical capsule segment [segY0, segY1]
            let bestDistSq = Infinity;
            const yMid = (segY0 + segY1) * 0.5;
            const sampleYs = [segY0, yMid, segY1];

            for (let k = 0; k < 3; k++) {
              this._pt.set(x, sampleYs[k], z);
              tri.closestPointToPoint(this._pt, this._closest);
              const dSq = this._pt.distanceToSquared(this._closest);
              if (dSq < bestDistSq) {
                bestDistSq = dSq;
                this._bestClosest.copy(this._closest);
              }
            }

            if (bestDistSq < rSq) {
              const dx = x - this._bestClosest.x;
              const dz = z - this._bestClosest.z;
              const hDist = Math.hypot(dx, dz);
              if (hDist > 1e-5) {
                const push = radius - hDist;
                if (push > 0) {
                  x += (dx / hDist) * push;
                  z += (dz / hDist) * push;
                  hit = true;
                }
              } else {
                // Center sits directly on triangle plane: push along horizontal triangle normal
                const nLen = Math.hypot(this._triNormal.x, this._triNormal.z);
                if (nLen > 1e-5) {
                  x += (this._triNormal.x / nLen) * radius;
                  z += (this._triNormal.z / nLen) * radius;
                  hit = true;
                }
              }
            }
            return false;
          },
        });
      }

      // 1B. Dynamic Doumen Gates (only solid when closed)
      if (!doumenOpen) {
        for (let i = 0; i < this.compiled.dynamicGates.length; i++) {
          const g = this.compiled.dynamicGates[i];
          const pushed = this.pushCircleOutOfAabb(
            x,
            z,
            radius,
            g.centerX - g.width * 0.5,
            g.centerX + g.width * 0.5,
            g.z - g.depth * 0.5,
            g.z + g.depth * 0.5
          );
          if (pushed.hit) {
            x = pushed.x;
            z = pushed.z;
            hit = true;
          }
        }
      }
    }

    // 1C. PROPS Layer (furniture, vats, planters, wells)
    if ((mask & CollisionLayer.PROPS) !== 0) {
      const props = this.compiled.propColliders;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (p.kind === 'aabb') {
          if (p.maxY !== undefined && y > p.maxY) continue;
          const pushed = this.pushCircleOutOfAabb(
            x,
            z,
            radius,
            p.minX ?? 0,
            p.maxX ?? 0,
            p.minZ ?? 0,
            p.maxZ ?? 0
          );
          if (pushed.hit) {
            x = pushed.x;
            z = pushed.z;
            hit = true;
          }
        } else if (p.kind === 'circle') {
          const cx = p.cx ?? 0;
          const cz = p.cz ?? 0;
          const minDist = radius + (p.radius ?? 0.5);
          const dx = x - cx;
          const dz = z - cz;
          const dist = Math.hypot(dx, dz);
          if (dist < minDist) {
            const nx = dist > 1e-5 ? dx / dist : 1;
            const nz = dist > 1e-5 ? dz / dist : 0;
            x = cx + nx * minDist;
            z = cz + nz * minDist;
            hit = true;
          }
        }
      }
    }

    // 1D. POND_WATER Layer (Half-Moon Pond basin — blocks Player/Villagers/Poultry, bypassed by WATERFOWL!)
    if ((mask & CollisionLayer.POND_WATER) !== 0 && z >= POND_CENTER_Z - radius) {
      const rx = POND_RX + radius;
      const rz = POND_RZ + radius;
      const dz = Math.max(0, z - POND_CENTER_Z);
      const norm = Math.hypot(x / rx, dz / rz);
      if (norm < 1.0) {
        hit = true;
        if (z < POND_CENTER_Z + 1.15) {
          z = POND_CENTER_Z - radius - 0.02;
        } else {
          const safeNorm = Math.max(0.001, norm);
          x = (x / safeNorm) * 1.005;
          z = POND_CENTER_Z + (dz / safeNorm) * 1.005;
        }
      }
    }

    return { x, z, hit };
  }

  /**
   * Stage 2: 2D Position-Based Dynamic Entity Separation & Poultry Scatter.
   */
  private resolveDynamicSeparation(
    self: CollisionBody,
    x: number,
    y: number,
    z: number
  ): { x: number; z: number; pushed: boolean; scatterX: number; scatterZ: number } {
    let nx = x;
    let nz = z;
    let pushed = false;
    let scatterX = 0;
    let scatterZ = 0;

    const selfWeight = self.weight ?? 1.0;

    for (const other of this.bodies.values()) {
      if (other.id === self.id || other.active === false) continue;
      if (Math.abs(other.y - y) > 1.75) continue;

      const dx = nx - other.x;
      const dz = nz - other.z;
      const distSq = dx * dx + dz * dz;

      // Scatter detection (e.g., chickens fleeing approaching player/villagers without blocking them!)
      if (self.scatterFromMask && (self.scatterFromMask & other.layer) !== 0) {
        const sr = self.scatterRadius ?? 1.75;
        if (distSq < sr * sr && distSq > 1e-6) {
          const d = Math.sqrt(distSq);
          const strength = (sr - d) / sr;
          scatterX += (dx / d) * strength;
          scatterZ += (dz / d) * strength;
        }
      }

      // Position-Based Separation for colliding dynamic layers
      const collides = (self.mask & other.layer) !== 0 && (other.mask & self.layer) !== 0;
      if (!collides) continue;

      const minDist = self.radius + other.radius;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const dirX = dist > 1e-5 ? dx / dist : 1;
        const dirZ = dist > 1e-5 ? dz / dist : 0;
        const overlap = minDist - dist;
        const otherWeight = other.kinematicOnly ? 999 : (other.weight ?? 1.0);
        const selfShare = otherWeight / (selfWeight + otherWeight);
        // Smooth soft-hard hybrid push (prevents jittery ping-pong in crowds)
        const pushAmt = overlap * Math.min(0.85, selfShare);
        nx += dirX * pushAmt;
        nz += dirZ * pushAmt;
        pushed = true;
      }
    }

    return { x: nx, z: nz, pushed, scatterX, scatterZ };
  }

  private pushCircleOutOfAabb(
    x: number,
    z: number,
    radius: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): { x: number; z: number; hit: boolean } {
    const cx = Math.max(minX, Math.min(maxX, x));
    const cz = Math.max(minZ, Math.min(maxZ, z));
    const dx = x - cx;
    const dz = z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) {
      return { x, z, hit: false };
    }
    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      return { x: x + (dx / dist) * push, z: z + (dz / dist) * push, hit: true };
    }
    // Center is strictly inside AABB: exit through closest face
    const dLeft = Math.abs(x - minX);
    const dRight = Math.abs(maxX - x);
    const dBack = Math.abs(z - minZ);
    const dFront = Math.abs(maxZ - z);
    const m = Math.min(dLeft, dRight, dBack, dFront);
    if (m === dLeft) return { x: minX - radius, z, hit: true };
    if (m === dRight) return { x: maxX + radius, z, hit: true };
    if (m === dBack) return { x, z: minZ - radius, hit: true };
    return { x, z: maxZ + radius, hit: true };
  }
}
