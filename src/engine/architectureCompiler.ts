import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  INNER_OPEN_OUTER_BAYS,
  OUTER_OPEN_OUTER_BAYS,
  groundHeightAt,
  isDragonApexBay,
  isRingRoomPartitionBoundary,
  sampleInnerWeilongCurve,
  sampleOuterWeilongCurve,
  surfaceTypeAt,
} from './worldMath';
import {
  CollisionLayer,
  type ArchBoxWallSpec,
  type ArchColumnSpec,
  type ArchDynamicGateSpec,
  type ArchPropColliderSpec,
  type GroundingRules,
  type NavObstacleFootprint,
  type SocketDef,
  type SurfaceMaterialKind,
} from './spatialTypes';
import type { ArchitectureBlueprint } from './architectureData';

export interface StaticArchBoxEntry {
  id: string;
  archKind: 'wall' | 'beam' | 'lintel' | 'jamb' | 'door_leaf' | 'curb' | 'chamber' | 'column' | 'roof';
  box: THREE.Box3;
}

export interface CompiledArchitecture {
  blueprint: ArchitectureBlueprint;
  /** Merged static architectural wall + column + planter BVH for Capsule Sweep & Slide. */
  staticBvh: MeshBVH;
  staticGeometry: THREE.BufferGeometry;
  /** Overhead beam/eave/sheathing/purlin BVH used by SceneValidator for [FLOAT_ERROR] upward raycasts. */
  ceilingBvh: MeshBVH;
  ceilingGeometry: THREE.BufferGeometry;
  /** Dynamic gate specs (Doumen) toggled without rebuilding static BVH. */
  dynamicGates: ArchDynamicGateSpec[];
  /** Synchronized NavMesh / 2D obstacle footprints derived from the same SSOT data. */
  navObstacles: NavObstacleFootprint[];
  /** Synchronized prop collider specs. */
  propColliders: ArchPropColliderSpec[];
  /** Bounding boxes of all STATIC_ARCH walls/beams/columns for plaque clearance & [CLIP_ERROR] audits. */
  staticArchBoxes: StaticArchBoxEntry[];
  dispose: () => void;
}

export interface MountSocketOptions {
  mode: 'hang' | 'plaque';
  /** Optional slight upward embed for hanging clasps (default 0.01m). */
  embedOffset?: number;
  /** Extra outward clearance along socket normal when resolving plaque-vs-beam intersection (default 0.015m). */
  clearanceMargin?: number;
  /** Host IDs allowed to touch/overlap slightly if explicitly attached (e.g., wall face). */
  excludeArchIds?: string[];
  /** If true, throw an error when a plaque cannot be shifted clear of structural beams. */
  strict?: boolean;
}

export interface MountSocketResult {
  socketId: string;
  position: THREE.Vector3;
  shiftedDistance: number;
  intersectedIds: string[];
}

export interface PlaceOnGroundResult {
  groundY: number;
  surface: SurfaceMaterialKind;
  wrappedInPlanter: boolean;
  planterGroup?: THREE.Group;
  finalMinY: number;
}

/**
 * Helper to create a clean position-only non-indexed BoxGeometry transformed into world space,
 * ready for fast, leak-free mergeGeometries() + MeshBVH compilation.
 */
function createWorldColliderBox(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  rotY = 0
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  // Strip unused attributes so mergeGeometries never mismatches normals/uvs
  for (const attr of Object.keys(geo.attributes)) {
    if (attr !== 'position') {
      geo.deleteAttribute(attr);
    }
  }
  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  mat.compose(new THREE.Vector3(cx, cy, cz), quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(mat);
  return geo;
}

function createWorldColliderCylinder(
  radius: number,
  height: number,
  cx: number,
  cy: number,
  cz: number,
  radialSegments = 8
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, height, radialSegments).toNonIndexed();
  for (const attr of Object.keys(geo.attributes)) {
    if (attr !== 'position') {
      geo.deleteAttribute(attr);
    }
  }
  geo.translate(cx, cy, cz);
  return geo;
}

/**
 * Computes the intersection volume (in m^3) between two AABBs.
 */
export function computeBoxOverlapVolume(a: THREE.Box3, b: THREE.Box3): number {
  const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  if (ox <= 0) return 0;
  const oy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  if (oy <= 0) return 0;
  const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (oz <= 0) return 0;
  return ox * oy * oz;
}

/**
 * Single Source of Truth (SSOT) Architecture Compiler, Semantic Socket Registry,
 * and Grounding Contract Enforcer.
 *
 * Reads one ArchitectureBlueprint and synchronously compiles:
 * 1. Visual structural metadata & bounding boxes (`STATIC_ARCH`)
 * 2. High-precision `three-mesh-bvh` Static Collider + Overhead Ceiling/Beam BVH
 * 3. NavMesh / 2D Obstacle Mask footprints
 * Plus provides `mountToSocket()` and `placeOnGround()` to eliminate magic coordinates.
 */
export class ArchitectureCompiler {
  readonly blueprint: ArchitectureBlueprint;
  private sockets = new Map<string, SocketDef>();
  private extraWallColliderGeos: THREE.BufferGeometry[] = [];
  private extraCeilingAnchorGeos: THREE.BufferGeometry[] = [];
  private extraStaticArchBoxes: StaticArchBoxEntry[] = [];
  private registeredPropColliders: ArchPropColliderSpec[] = [];
  private registeredPlanters: Array<{ id: string; x: number; z: number; radius: number; height: number }> = [];
  private compiled: CompiledArchitecture | null = null;
  private planterFactory?: (radius: number, height: number) => THREE.Group;

  constructor(blueprint: ArchitectureBlueprint) {
    this.blueprint = blueprint;
    this.registeredPropColliders = [...blueprint.defaultPropColliders];
    this.registeredPlanters = blueprint.planters.map((p) => ({ ...p }));
  }

  /**
   * Optional visual factory used when placeOnGround() auto-wraps a tree/shrub
   * placed on paved concrete/stone into a traditional carved stone planter pot.
   */
  setPlanterFactory(factory: (radius: number, height: number) => THREE.Group): void {
    this.planterFactory = factory;
  }

  /**
   * Registers a bespoke architectural stone basin, tree well, or terracotta planter pot
   * so getSurfaceMaterialAt(x, z) recognizes it as 'planter_pot' under the Grounding Contract.
   */
  registerPlanter(id: string, x: number, z: number, radius: number, height: number): void {
    this.registeredPlanters.push({ id, x, z, radius, height });
  }

  registerSocket(def: SocketDef): void {
    this.sockets.set(def.id, {
      ...def,
      position: [...def.position] as [number, number, number],
      normal: [...def.normal] as [number, number, number],
    });
  }

  getSocket(id: string): SocketDef | undefined {
    return this.sockets.get(id);
  }

  listSockets(): SocketDef[] {
    return Array.from(this.sockets.values());
  }

  /**
   * Registers an overhead beam, purlin, lantern arm, or eave underside box into the
   * ceiling/overhead raycast BVH so hanging props mounted beneath it pass [FLOAT_ERROR] audits.
   */
  registerOverheadAnchorBox(
    id: string,
    w: number,
    h: number,
    d: number,
    cx: number,
    cy: number,
    cz: number,
    rotY = 0,
    alsoRegisterArchBox = false
  ): void {
    this.extraCeilingAnchorGeos.push(createWorldColliderBox(w, h, d, cx, cy, cz, rotY));
    if (alsoRegisterArchBox) {
      const box = this.computeBoxFromTransform(w, h, d, cx, cy, cz, rotY);
      this.extraStaticArchBoxes.push({ id, archKind: 'beam', box });
    }
    this.compiled = null;
  }

  /**
   * Registers an additional static architectural wall/structure collider & bounding box
   * (e.g., village cottages or shelter walls) into the SSOT compiler.
   */
  registerExtraStaticArchBox(
    id: string,
    w: number,
    h: number,
    d: number,
    cx: number,
    cy: number,
    cz: number,
    rotY = 0,
    archKind: StaticArchBoxEntry['archKind'] = 'wall',
    collides = true
  ): void {
    if (collides) {
      this.extraWallColliderGeos.push(createWorldColliderBox(w, h, d, cx, cy, cz, rotY));
    }
    this.extraStaticArchBoxes.push({
      id,
      archKind,
      box: this.computeBoxFromTransform(w, h, d, cx, cy, cz, rotY),
    });
    this.compiled = null;
  }

  /**
   * Registers a prop collider (furniture, vat, bench, planter) synchronously into both
   * the SpatialPhysicsKernel PROPS layer and the NavMesh obstacle mask.
   */
  registerPropCollider(spec: ArchPropColliderSpec): void {
    const existingIdx = this.registeredPropColliders.findIndex((p) => p.id === spec.id);
    if (existingIdx >= 0) {
      this.registeredPropColliders[existingIdx] = spec;
    } else {
      this.registeredPropColliders.push(spec);
    }
    if (this.compiled) {
      this.compiled.propColliders = [...this.registeredPropColliders];
      this.syncPropNavObstacle(this.compiled.navObstacles, spec);
    }
  }

  /**
   * Maps world coordinates to a semantic SurfaceMaterialKind for the Grounding Contract.
   */
  getSurfaceMaterialAt(x: number, z: number): SurfaceMaterialKind {
    // Check registered raised stone/ceramic planters first
    for (let i = 0; i < this.registeredPlanters.length; i++) {
      const p = this.registeredPlanters[i];
      if (Math.hypot(x - p.x, z - p.z) <= p.radius + 0.12) {
        return 'planter_pot';
      }
    }
    const base = surfaceTypeAt(x, z);
    if (base === 'water_stone') {
      const pd = this.blueprint.pondDomain;
      const dx = (x - pd.cx) / (pd.rx ?? 15.9);
      const dz = Math.max(0, z - pd.cz) / (pd.rz ?? 10.5);
      if (z >= pd.cz && dx * dx + dz * dz <= 1.0) {
        return 'water';
      }
      return 'stone';
    }
    if (base === 'courtyard') return 'concrete';
    if (base === 'slate' || base === 'cobble') return 'stone';
    if (base === 'wood_2f') return 'wood';
    return 'soil';
  }

  /**
   * Compiles the SSOT ArchitectureBlueprint into synchronized Static BVH,
   * Overhead Anchor BVH, NavMesh Obstacles, and STATIC_ARCH Box3 registry.
   */
  compile(): CompiledArchitecture {
    if (this.compiled) {
      return this.compiled;
    }

    const staticGeos: THREE.BufferGeometry[] = [];
    const ceilingGeos: THREE.BufferGeometry[] = [];
    const navObstacles: NavObstacleFootprint[] = [];
    const staticArchBoxes: StaticArchBoxEntry[] = [];

    // 1. Straight Architectural Walls
    for (const wall of this.blueprint.walls) {
      const cy = wall.yBase + wall.h * 0.5;
      const rotY = wall.rotY ?? 0;
      const box = this.computeBoxFromTransform(wall.w, wall.h, wall.d, wall.x, cy, wall.z, rotY);
      staticArchBoxes.push({ id: wall.id, archKind: wall.archKind, box });

      if (wall.collides) {
        staticGeos.push(createWorldColliderBox(wall.w, wall.h, wall.d, wall.x, cy, wall.z, rotY));
        navObstacles.push({
          id: wall.id,
          kind: 'aabb',
          minX: box.min.x,
          maxX: box.max.x,
          minZ: box.min.z,
          maxZ: box.max.z,
          layer: CollisionLayer.STATIC_ARCH,
        });
      }
      if (wall.isOverheadAnchor) {
        ceilingGeos.push(createWorldColliderBox(wall.w, wall.h, wall.d, wall.x, cy, wall.z, rotY));
      }
    }

    // 2. Structural Lintels, Tie Beams, and Veranda Eave Purlins
    for (const beam of this.blueprint.beams) {
      const cy = beam.yBase + beam.h * 0.5;
      const rotY = beam.rotY ?? 0;
      const box = this.computeBoxFromTransform(beam.w, beam.h, beam.d, beam.x, cy, beam.z, rotY);
      staticArchBoxes.push({ id: beam.id, archKind: beam.archKind, box });
      if (beam.isOverheadAnchor) {
        ceilingGeos.push(createWorldColliderBox(beam.w, beam.h, beam.d, beam.x, cy, beam.z, rotY));
      }
    }

    // 3. Colonnade Columns
    for (const col of this.blueprint.columns) {
      const rad = col.radius ?? 0.26;
      const cy = col.yBase + col.height * 0.5;
      staticGeos.push(createWorldColliderCylinder(rad, col.height, col.x, cy, col.z, 8));
      staticArchBoxes.push({
        id: col.id,
        archKind: 'column',
        box: new THREE.Box3(
          new THREE.Vector3(col.x - rad, col.yBase, col.z - rad),
          new THREE.Vector3(col.x + rad, col.yBase + col.height, col.z + rad)
        ),
      });
      navObstacles.push({
        id: col.id,
        kind: 'circle',
        cx: col.x,
        cz: col.z,
        radius: rad,
        layer: CollisionLayer.STATIC_ARCH,
      });
    }

    // 4. Curved Inner & Outer Weilong Rings (generated from the exact same curve equations as visual rings!)
    const compileRing = (
      ringName: string,
      sampleFn: (t: number) => ReturnType<typeof sampleInnerWeilongCurve>,
      cfg: ArchitectureBlueprint['curvedRings']['inner'] | ArchitectureBlueprint['curvedRings']['outer'],
      openOuterBays: Set<number>
    ) => {
      const samples = [];
      for (let i = 0; i <= cfg.bayCount; i++) {
        samples.push(sampleFn(i / cfg.bayCount));
      }
      for (let i = 0; i < cfg.bayCount; i++) {
        const s0 = samples[i];
        const s1 = samples[i + 1];
        const sm = sampleFn((i + 0.5) / cfg.bayCount);
        const bayYaw = Math.atan2(sm.nx, sm.nz);
        const isApex = isDragonApexBay(i, cfg.bayCount, cfg.isOuterRing);

        // Inner curved courtyard wall (open doorway bays vs solid bays)
        const inX = sm.x - sm.nx * (cfg.halfDepth - 0.16);
        const inZ = sm.z - sm.nz * (cfg.halfDepth - 0.16);
        const inLen = Math.hypot(
          s1.x - s1.nx * cfg.halfDepth - (s0.x - s0.nx * cfg.halfDepth),
          s1.z - s1.nz * cfg.halfDepth - (s0.z - s0.nz * cfg.halfDepth)
        );
        if (isApex) {
          if (i % 2 === 0) {
            const cx = s0.x - s0.nx * (cfg.halfDepth - 0.25);
            const cz = s0.z - s0.nz * (cfg.halfDepth - 0.25);
            staticGeos.push(createWorldColliderCylinder(0.24, cfg.wallHeight, cx, s0.yBase + cfg.wallHeight * 0.5, cz, 8));
            navObstacles.push({
              id: `${ringName}_apex_col_${i}`,
              kind: 'circle',
              cx,
              cz,
              radius: 0.24,
              layer: CollisionLayer.STATIC_ARCH,
            });
          }
        } else if (i % 2 === 0) {
          // Doorway flanking piers
          const doorW = Math.min(1.18, Math.max(0.88, inLen * 0.62));
          const pierW = Math.max(0.24, (inLen - doorW) * 0.5);
          const lx = inX - sm.tx * (doorW * 0.5 + pierW * 0.5);
          const lz = inZ - sm.tz * (doorW * 0.5 + pierW * 0.5);
          const rx = inX + sm.tx * (doorW * 0.5 + pierW * 0.5);
          const rz = inZ + sm.tz * (doorW * 0.5 + pierW * 0.5);
          staticGeos.push(createWorldColliderBox(pierW + 0.14, cfg.wallHeight, 0.32, lx, sm.yBase + cfg.wallHeight * 0.5, lz, bayYaw));
          staticGeos.push(createWorldColliderBox(pierW + 0.14, cfg.wallHeight, 0.32, rx, sm.yBase + cfg.wallHeight * 0.5, rz, bayYaw));
          navObstacles.push(
            {
              id: `${ringName}_pierL_${i}`,
              kind: 'obb',
              cx: lx,
              cz: lz,
              halfW: (pierW + 0.14) * 0.5,
              halfD: 0.16,
              yaw: bayYaw,
              layer: CollisionLayer.STATIC_ARCH,
            },
            {
              id: `${ringName}_pierR_${i}`,
              kind: 'obb',
              cx: rx,
              cz: rz,
              halfW: (pierW + 0.14) * 0.5,
              halfD: 0.16,
              yaw: bayYaw,
              layer: CollisionLayer.STATIC_ARCH,
            }
          );
        } else {
          // Solid windowed wall bay
          staticGeos.push(createWorldColliderBox(inLen + 0.18, cfg.wallHeight, 0.32, inX, sm.yBase + cfg.wallHeight * 0.5, inZ, bayYaw));
          navObstacles.push({
            id: `${ringName}_in_${i}`,
            kind: 'obb',
            cx: inX,
            cz: inZ,
            halfW: (inLen + 0.18) * 0.5,
            halfD: 0.16,
            yaw: bayYaw,
            layer: CollisionLayer.STATIC_ARCH,
          });
        }

        // Outer convex ring wall
        const outX = sm.x + sm.nx * (cfg.halfDepth - 0.18);
        const outZ = sm.z + sm.nz * (cfg.halfDepth - 0.18);
        const outLen = Math.hypot(
          s1.x + s1.nx * cfg.halfDepth - (s0.x + s0.nx * cfg.halfDepth),
          s1.z + s1.nz * cfg.halfDepth - (s0.z + s0.nz * cfg.halfDepth)
        );
        if (!openOuterBays.has(i)) {
          staticGeos.push(createWorldColliderBox(outLen + 0.22, cfg.wallHeight, 0.44, outX, sm.yBase + cfg.wallHeight * 0.5, outZ, bayYaw));
          navObstacles.push({
            id: `${ringName}_out_${i}`,
            kind: 'obb',
            cx: outX,
            cz: outZ,
            halfW: (outLen + 0.22) * 0.5,
            halfD: 0.22,
            yaw: bayYaw,
            layer: CollisionLayer.STATIC_ARCH,
          });
        }

        // Full-depth radial room partition walls
        if (isRingRoomPartitionBoundary(i, cfg.bayCount, cfg.isOuterRing)) {
          const partYaw = Math.atan2(s0.nx, s0.nz);
          const fullDepth = cfg.halfDepth * 1.92;
          staticGeos.push(createWorldColliderBox(0.28, cfg.wallHeight, fullDepth, s0.x, s0.yBase + cfg.wallHeight * 0.5, s0.z, partYaw));
          navObstacles.push({
            id: `${ringName}_part_${i}`,
            kind: 'obb',
            cx: s0.x,
            cz: s0.z,
            halfW: 0.14,
            halfD: fullDepth * 0.5,
            yaw: partYaw,
            layer: CollisionLayer.STATIC_ARCH,
          });
        }

        // Curved inner eave purlin ceiling anchor band (for hanging inner Weilong lanterns!)
        if (!cfg.isOuterRing) {
          const purlinX = sm.x - sm.nx * (cfg.halfDepth + cfg.overhang * 0.86);
          const purlinZ = sm.z - sm.nz * (cfg.halfDepth + cfg.overhang * 0.86);
          const purlinY = sm.yBase + cfg.wallHeight + 0.04;
          ceilingGeos.push(createWorldColliderBox(inLen + 0.4, 0.28, 0.42, purlinX, purlinY, purlinZ, bayYaw));
        }
      }
    };

    compileRing('inner_ring', sampleInnerWeilongCurve, this.blueprint.curvedRings.inner, INNER_OPEN_OUTER_BAYS);
    compileRing('outer_ring', sampleOuterWeilongCurve, this.blueprint.curvedRings.outer, OUTER_OPEN_OUTER_BAYS);

    // 5. Built-in Architectural Tree Planters
    for (const planter of this.registeredPlanters) {
      const py = groundHeightAt(planter.x, planter.z, 0);
      staticGeos.push(createWorldColliderCylinder(planter.radius, planter.height + 0.4, planter.x, py + (planter.height + 0.4) * 0.5, planter.z, 10));
      navObstacles.push({
        id: planter.id,
        kind: 'circle',
        cx: planter.x,
        cz: planter.z,
        radius: planter.radius,
        layer: CollisionLayer.PROPS,
      });
    }

    // 6. Dynamic Doumen Gates (nav obstacle entries marked dynamicGate: true; BVH handles them dynamically in SpatialPhysicsKernel)
    for (const gate of this.blueprint.dynamicGates) {
      navObstacles.push({
        id: gate.id,
        kind: 'aabb',
        minX: gate.centerX - gate.width * 0.5,
        maxX: gate.centerX + gate.width * 0.5,
        minZ: gate.z - gate.depth * 0.5,
        maxZ: gate.z + gate.depth * 0.5,
        dynamicGate: true,
        layer: CollisionLayer.STATIC_ARCH,
      });
    }

    // 7. Registered Prop Colliders -> NavMesh Obstacles
    for (const prop of this.registeredPropColliders) {
      this.syncPropNavObstacle(navObstacles, prop);
    }

    // 8. Append any extra static arch & ceiling anchor geometries registered by builders
    for (const g of this.extraWallColliderGeos) {
      staticGeos.push(g.clone());
    }
    for (const g of this.extraCeilingAnchorGeos) {
      ceilingGeos.push(g.clone());
    }
    for (const b of this.extraStaticArchBoxes) {
      staticArchBoxes.push(b);
    }

    const staticGeometry =
      staticGeos.length > 0
        ? mergeGeometries(staticGeos, false)
        : createWorldColliderBox(0.1, 0.1, 0.1, 0, -100, 0);
    const ceilingGeometry =
      ceilingGeos.length > 0
        ? mergeGeometries(ceilingGeos, false)
        : createWorldColliderBox(0.1, 0.1, 0.1, 0, -100, 0);

    staticGeos.forEach((g) => g.dispose());
    ceilingGeos.forEach((g) => g.dispose());

    if (!staticGeometry || !ceilingGeometry) {
      throw new Error('[ArchitectureCompiler] Failed to merge BVH collider geometries');
    }

    const staticBvh = new MeshBVH(staticGeometry);
    const ceilingBvh = new MeshBVH(ceilingGeometry);

    this.compiled = {
      blueprint: this.blueprint,
      staticBvh,
      staticGeometry,
      ceilingBvh,
      ceilingGeometry,
      dynamicGates: [...this.blueprint.dynamicGates],
      navObstacles,
      propColliders: [...this.registeredPropColliders],
      staticArchBoxes,
      dispose: () => {
        staticGeometry.dispose();
        ceilingGeometry.dispose();
      },
    };

    return this.compiled;
  }

  /**
   * Semantic Socket Assembly Interface:
   * Eliminates hardcoded world coordinates for lanterns, birdcages, Ding lanterns, and plaques.
   * - mode='hang': reads local Box3 and snaps max.y strictly to socket.position.y (+ small clasp embed).
   * - mode='plaque': checks plaque Box3 against all STATIC_ARCH beam/wall boxes; if intersecting,
   *   automatically shifts outward along socket.normal so plaques NEVER clip beams or lintels!
   */
  mountToSocket(
    object: THREE.Object3D,
    socketId: string,
    opts: MountSocketOptions
  ): MountSocketResult {
    const socket = this.sockets.get(socketId);
    if (!socket) {
      throw new Error(`[ArchitectureCompiler] Unknown semantic socket "${socketId}"`);
    }

    const compiled = this.compile();
    const [sx, sy, sz] = socket.position;
    const normal = new THREE.Vector3(socket.normal[0], socket.normal[1], socket.normal[2]);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    else normal.normalize();

    if (opts.mode === 'hang') {
      const embed = Math.min(0.025, Math.max(0, opts.embedOffset ?? 0.01));
      object.position.set(sx, 0, sz);
      object.updateMatrixWorld(true);
      const localBox = new THREE.Box3().setFromObject(object);
      const topY = Number.isFinite(localBox.max.y) ? localBox.max.y : 0;
      object.position.set(sx, sy - topY + embed, sz);
      object.updateMatrixWorld(true);

      object.userData.hanging = true;
      object.userData.socketId = socketId;
      object.userData.hangingAnchorY = sy;
      object.userData.hostId = socket.hostId;
      object.userData.spatialAuditKind = 'hanging';

      return {
        socketId,
        position: object.position.clone(),
        shiftedDistance: 0,
        intersectedIds: [],
      };
    }

    // mode === 'plaque'
    const margin = opts.clearanceMargin ?? 0.018;
    const excludeSet = new Set(opts.excludeArchIds ?? []);
    object.position.set(sx, sy, sz);
    object.updateMatrixWorld(true);

    let totalShift = 0;
    const intersectedIds: string[] = [];

    for (let iter = 0; iter < 5; iter++) {
      const objBox = new THREE.Box3().setFromObject(object);
      let maxPush = 0;
      let hitAny = false;

      for (let i = 0; i < compiled.staticArchBoxes.length; i++) {
        const entry = compiled.staticArchBoxes[i];
        if (excludeSet.has(entry.id)) continue;
        const vol = computeBoxOverlapVolume(objBox, entry.box);
        if (vol > 0.0005) {
          hitAny = true;
          if (!intersectedIds.includes(entry.id)) {
            intersectedIds.push(entry.id);
          }
          // Compute penetration depth along socket normal
          let depth = 0;
          if (Math.abs(normal.z) >= Math.abs(normal.x) && Math.abs(normal.z) >= Math.abs(normal.y)) {
            depth = normal.z > 0 ? entry.box.max.z - objBox.min.z : objBox.max.z - entry.box.min.z;
          } else if (Math.abs(normal.x) >= Math.abs(normal.y)) {
            depth = normal.x > 0 ? entry.box.max.x - objBox.min.x : objBox.max.x - entry.box.min.x;
          } else {
            depth = normal.y > 0 ? entry.box.max.y - objBox.min.y : objBox.max.y - entry.box.min.y;
          }
          maxPush = Math.max(maxPush, Math.max(0.02, depth) + margin);
        }
      }

      if (!hitAny) break;
      if (opts.strict && iter === 4) {
        throw new Error(
          `[ArchitectureCompiler] Plaque at socket "${socketId}" still intersects STATIC_ARCH [${intersectedIds.join(', ')}]`
        );
      }
      object.position.addScaledVector(normal, maxPush);
      object.updateMatrixWorld(true);
      totalShift += maxPush;
    }

    object.userData.mountedPlaque = true;
    object.userData.socketId = socketId;
    object.userData.hostId = socket.hostId;
    object.userData.spatialAuditKind = 'plaque';

    return {
      socketId,
      position: object.position.clone(),
      shiftedDistance: totalShift,
      intersectedIds,
    };
  }

  /**
   * Grounding & Surface Material Contract:
   * Places any static ground object so its real Box3.min.y equals exact groundY,
   * mathematically eliminating floating or half-buried assets.
   * Enforces allowedSurface rules (e.g., trees requiring ['soil', 'planter_pot'] placed on
   * concrete/stone are automatically wrapped in a sized traditional planter pot or rejected).
   */
  placeOnGround(
    object: THREE.Object3D,
    x: number,
    z: number,
    rules: GroundingRules
  ): PlaceOnGroundResult {
    const baseGroundY =
      rules.overrideGroundY !== undefined
        ? rules.overrideGroundY
        : groundHeightAt(x, z, rules.referenceY ?? 0);
    let surface = this.getSurfaceMaterialAt(x, z);
    let targetGroundY = baseGroundY;
    let wrappedInPlanter = false;
    let planterGroup: THREE.Group | undefined;

    if (rules.allowedSurface && !rules.allowedSurface.includes(surface)) {
      const canAutoWrap =
        Boolean(rules.autoWrapPlanter) &&
        (surface === 'concrete' || surface === 'stone') &&
        rules.allowedSurface.includes('planter_pot');

      if (canAutoWrap) {
        const radius = rules.planterRadius ?? 1.15;
        const height = rules.planterHeight ?? 0.48;
        planterGroup = this.planterFactory
          ? this.planterFactory(radius, height)
          : this.createDefaultPlanterMesh(radius, height);
        planterGroup.position.set(x, baseGroundY, z);
        planterGroup.userData.grounded = true;
        planterGroup.userData.expectedGroundY = baseGroundY;
        planterGroup.userData.groundId = `${rules.id}_auto_planter`;
        planterGroup.userData.spatialAuditKind = 'planter';
        planterGroup.userData.skipClipAudit = true;

        this.registeredPlanters.push({ id: `${rules.id}_auto_planter`, x, z, radius, height });
        this.registerPropCollider({
          id: `${rules.id}_auto_planter`,
          kind: 'circle',
          cx: x,
          cz: z,
          radius,
          height,
          layer: CollisionLayer.PROPS,
        });

        surface = 'planter_pot';
        targetGroundY = baseGroundY + height - 0.06;
        wrappedInPlanter = true;
      } else {
        throw new Error(
          `[GROUND_CONTRACT_VIOLATION] Object "${rules.id}" at (${x.toFixed(2)}, ${z.toFixed(2)}) requires surface [${rules.allowedSurface.join(', ')}], got "${surface}"`
        );
      }
    }

    // Clamp intentional embed depth <= 0.015m so grounding audit tolerance (0.02m) always holds
    const embed = Math.min(0.015, Math.max(0, rules.embedDepth ?? 0));

    object.position.set(x, 0, z);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
    object.position.set(x, targetGroundY - minY - embed, z);
    object.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(object);

    object.userData.grounded = true;
    object.userData.expectedGroundY = targetGroundY;
    object.userData.groundId = rules.id;
    object.userData.surfaceMaterial = surface;
    object.userData.autoWrappedPlanter = wrappedInPlanter;
    object.userData.spatialAuditKind = rules.auditKind ?? 'decoration';
    if (rules.skipClipAudit) {
      object.userData.skipClipAudit = true;
    }

    return {
      groundY: targetGroundY,
      surface,
      wrappedInPlanter,
      planterGroup,
      finalMinY: finalBox.min.y,
    };
  }

  private createDefaultPlanterMesh(radius: number, height: number): THREE.Group {
    const g = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.04, height, 10),
      new THREE.MeshStandardMaterial({ color: 0x8f887d, roughness: 0.88 })
    );
    rim.position.y = height * 0.5;
    g.add(rim);
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.84, radius * 0.84, height - 0.05, 10),
      new THREE.MeshStandardMaterial({ color: 0x4b3b2c, roughness: 0.96 })
    );
    soil.position.y = (height - 0.05) * 0.5;
    g.add(soil);
    return g;
  }

  private computeBoxFromTransform(
    w: number,
    h: number,
    d: number,
    cx: number,
    cy: number,
    cz: number,
    rotY: number
  ): THREE.Box3 {
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const halfX = (w * c + d * s) * 0.5;
    const halfZ = (w * s + d * c) * 0.5;
    const halfY = h * 0.5;
    return new THREE.Box3(
      new THREE.Vector3(cx - halfX, cy - halfY, cz - halfZ),
      new THREE.Vector3(cx + halfX, cy + halfY, cz + halfZ)
    );
  }

  private syncPropNavObstacle(obstacles: NavObstacleFootprint[], prop: ArchPropColliderSpec): void {
    const entry: NavObstacleFootprint =
      prop.kind === 'aabb'
        ? {
            id: prop.id,
            kind: 'aabb',
            minX: prop.minX,
            maxX: prop.maxX,
            minZ: prop.minZ,
            maxZ: prop.maxZ,
            layer: prop.layer,
          }
        : {
            id: prop.id,
            kind: 'circle',
            cx: prop.cx,
            cz: prop.cz,
            radius: prop.radius,
            layer: prop.layer,
          };
    const idx = obstacles.findIndex((o) => o.id === prop.id);
    if (idx >= 0) obstacles[idx] = entry;
    else obstacles.push(entry);
  }
}
