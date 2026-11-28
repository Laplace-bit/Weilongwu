import type { Vec3 } from '../types';
import { groundHeightAt } from '../../engine/worldMath';

export interface AirRoostPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * Airspace Domain above roof ridges (y: 12~25m) + treetop bird nest roosts.
 */
export class AirDomain {
  public readonly minSafeAltitude = 12.0;
  public readonly maxSafeAltitude = 26.5;

  public readonly roosts: readonly AirRoostPoint[] = [
    { id: 'nest_crane_0', x: -21.5, y: groundHeightAt(-21.5, -48.5, 0) + 6.5, z: -48.5, yaw: 0.4 },
    { id: 'nest_crane_1', x: -12.0, y: groundHeightAt(-12.0, -52.5, 0) + 7.15, z: -52.5, yaw: -0.25 },
    { id: 'nest_crane_2', x: -2.5, y: groundHeightAt(-2.5, -54.5, 0) + 7.8, z: -54.5, yaw: 0.15 },
    { id: 'nest_crane_3', x: 7.5, y: groundHeightAt(7.5, -53.5, 0) + 6.5, z: -53.5, yaw: -0.35 },
    { id: 'nest_crane_4', x: 16.8, y: groundHeightAt(16.8, -50.2, 0) + 7.15, z: -50.2, yaw: 0.5 },
    { id: 'nest_crane_5', x: 23.5, y: groundHeightAt(23.5, -46.8, 0) + 7.8, z: -46.8, yaw: -0.6 },
  ];

  public getRoost(index: number): AirRoostPoint {
    return this.roosts[index % this.roosts.length];
  }

  public clampFlightAltitude(pos: Vec3): Vec3 {
    return {
      x: pos.x,
      y: Math.max(this.minSafeAltitude, Math.min(this.maxSafeAltitude, pos.y)),
      z: pos.z,
    };
  }
}
