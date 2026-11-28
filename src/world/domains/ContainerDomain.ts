import type { Vec3 } from '../types';
import ambientConfig from '../configs/actors_ambient.json';
import { GroundNavDomain } from './GroundNavDomain';
import { WaterDomain } from './WaterDomain';
import { AirDomain } from './AirDomain';

export type ContainerShape =
  | {
      id: string;
      shape: 'cylinder';
      center: Vec3;
      radius: number;
      yMin: number;
      yMax: number;
    }
  | {
      id: string;
      shape: 'box' | 'zone_volume';
      center: Vec3;
      halfExtents: Vec3;
    }
  | {
      id: string;
      shape: 'pond_ellipse';
      center: Vec3;
      rx: number;
      rz: number;
      minZ: number;
      yMin: number;
      yMax: number;
    };

/**
 * Hard mathematical containment bounds for T3 micro-ecology actors
 * (vat goldfish, pond koi, caged Hwamei, flower-volume butterflies, fireflies).
 * Final step of every T3 update calls `clamp()` so nothing can ever escape.
 */
export class ContainerDomain {
  private readonly containers = new Map<string, ContainerShape>();

  constructor(defs?: readonly ContainerShape[]) {
    const source = defs ?? (ambientConfig.containers as unknown as ContainerShape[]);
    for (let i = 0; i < source.length; i++) {
      this.containers.set(source[i].id, source[i]);
    }
  }

  public register(def: ContainerShape): void {
    this.containers.set(def.id, def);
  }

  public get(id: string): ContainerShape | undefined {
    return this.containers.get(id);
  }

  public contains(id: string, pos: Vec3, tolerance = 0.001): boolean {
    const c = this.containers.get(id);
    if (!c) return true;

    if (c.shape === 'cylinder') {
      const dx = pos.x - c.center.x;
      const dz = pos.z - c.center.z;
      const dist = Math.hypot(dx, dz);
      return (
        dist <= c.radius + tolerance &&
        pos.y >= c.yMin - tolerance &&
        pos.y <= c.yMax + tolerance
      );
    }

    if (c.shape === 'pond_ellipse') {
      const nx = (pos.x - c.center.x) / Math.max(0.01, c.rx);
      const nz = (pos.z - c.center.z) / Math.max(0.01, c.rz);
      return (
        nx * nx + nz * nz <= 1.0 + tolerance &&
        pos.z >= c.minZ - tolerance &&
        pos.y >= c.yMin - tolerance &&
        pos.y <= c.yMax + tolerance
      );
    }

    return (
      Math.abs(pos.x - c.center.x) <= c.halfExtents.x + tolerance &&
      Math.abs(pos.y - c.center.y) <= c.halfExtents.y + tolerance &&
      Math.abs(pos.z - c.center.z) <= c.halfExtents.z + tolerance
    );
  }

  /**
   * Clamps `pos` IN-PLACE and returns it so hot loops perform zero allocations.
   */
  public clampInPlace(id: string, pos: Vec3): Vec3 {
    const c = this.containers.get(id);
    if (!c) return pos;

    if (c.shape === 'cylinder') {
      const dx = pos.x - c.center.x;
      const dz = pos.z - c.center.z;
      const dist = Math.hypot(dx, dz);
      if (dist > c.radius && dist > 1e-6) {
        const s = c.radius / dist;
        pos.x = c.center.x + dx * s;
        pos.z = c.center.z + dz * s;
      }
      pos.y = Math.max(c.yMin, Math.min(c.yMax, pos.y));
      return pos;
    }

    if (c.shape === 'pond_ellipse') {
      pos.z = Math.max(c.minZ, pos.z);
      const nx = (pos.x - c.center.x) / Math.max(0.01, c.rx);
      const nz = (pos.z - c.center.z) / Math.max(0.01, c.rz);
      const d = Math.hypot(nx, nz);
      if (d > 1.0) {
        pos.x = c.center.x + (nx / d) * c.rx;
        pos.z = Math.max(c.minZ, c.center.z + (nz / d) * c.rz);
      }
      pos.y = Math.max(c.yMin, Math.min(c.yMax, pos.y));
      return pos;
    }

    pos.x = Math.max(
      c.center.x - c.halfExtents.x,
      Math.min(c.center.x + c.halfExtents.x, pos.x)
    );
    pos.y = Math.max(
      c.center.y - c.halfExtents.y,
      Math.min(c.center.y + c.halfExtents.y, pos.y)
    );
    pos.z = Math.max(
      c.center.z - c.halfExtents.z,
      Math.min(c.center.z + c.halfExtents.z, pos.z)
    );
    return pos;
  }
}

/**
 * Unified SpatialDomainRegistry combining Ground, Water, Air, and Container domains.
 */
export class SpatialDomainRegistry {
  public readonly ground: GroundNavDomain;
  public readonly water: WaterDomain;
  public readonly air: AirDomain;
  public readonly containers: ContainerDomain;

  constructor() {
    this.ground = new GroundNavDomain();
    this.water = new WaterDomain();
    this.air = new AirDomain();
    this.containers = new ContainerDomain();
  }
}
