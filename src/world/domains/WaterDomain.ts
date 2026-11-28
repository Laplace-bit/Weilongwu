import type { Vec2, Vec3 } from '../types';

export interface WaterPortal {
  id: string;
  shorePoint: Vec2;
  waterPoint: Vec2;
  normalToWaterYaw: number;
}

/**
 * Half-Moon Pond Water Domain + Shoreline Portals.
 * Enables amphibian T2 waterfowl (geese & ducks) to transition smoothly
 * between `waddle` on the pond promenade/bank and `swim` on the pond surface.
 */
export class WaterDomain {
  public readonly centerX = 0;
  public readonly centerZ = 42.6;
  public readonly radiusX = 15.2;
  public readonly radiusZ = 5.9;
  public readonly waterSurfaceY = -0.2;
  public readonly frontBankZ = 37.65;

  public readonly portals: readonly WaterPortal[] = [
    {
      id: 'portal_pond_west',
      shorePoint: { x: -10.8, z: 36.55 },
      waterPoint: { x: -10.2, z: 39.2 },
      normalToWaterYaw: 0.18,
    },
    {
      id: 'portal_pond_center',
      shorePoint: { x: 0.0, z: 36.45 },
      waterPoint: { x: 0.0, z: 39.1 },
      normalToWaterYaw: 0.0,
    },
    {
      id: 'portal_pond_east',
      shorePoint: { x: 10.8, z: 36.55 },
      waterPoint: { x: 10.2, z: 39.2 },
      normalToWaterYaw: -0.18,
    },
  ];

  public getPortal(id?: string): WaterPortal {
    if (id) {
      const found = this.portals.find((p) => p.id === id);
      if (found) return found;
    }
    return this.portals[0];
  }

  public isInWater(x: number, z: number): boolean {
    if (z < this.frontBankZ) return false;
    const nx = (x - this.centerX) / this.radiusX;
    const nz = (z - this.centerZ) / this.radiusZ;
    return nx * nx + nz * nz <= 1.0;
  }

  public clampToWater(pos: Vec3): Vec3 {
    let x = pos.x;
    let z = Math.max(this.frontBankZ + 0.45, pos.z);
    const nx = (x - this.centerX) / (this.radiusX - 0.8);
    const nz = (z - this.centerZ) / (this.radiusZ - 0.6);
    const d = Math.hypot(nx, nz);
    if (d > 1.0) {
      x = this.centerX + (nx / d) * (this.radiusX - 0.8);
      z = Math.max(this.frontBankZ + 0.45, this.centerZ + (nz / d) * (this.radiusZ - 0.6));
    }
    return { x, y: this.waterSurfaceY, z };
  }

  public clampToShorePromenade(pos: Vec2): Vec2 {
    return {
      x: Math.max(-14.2, Math.min(14.2, pos.x)),
      z: Math.max(34.6, Math.min(36.7, pos.z)),
    };
  }
}
