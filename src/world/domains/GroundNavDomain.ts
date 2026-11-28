import type { Vec2 } from '../types';
import { classifyZone, computeZoneBridgeWaypoints, type RoamZone } from '../../engine/freeRoamSystem';

export interface GroundZoneMeta {
  id: string;
  roamZone: RoamZone;
  sheltered: boolean;
  center: Vec2;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const GROUND_ZONES: readonly GroundZoneMeta[] = [
  {
    id: 'zone_heping',
    roamZone: 'heping',
    sheltered: false,
    center: { x: 0, z: 28.5 },
    minX: -20,
    maxX: 20,
    minZ: 21.5,
    maxZ: 34.0,
  },
  {
    id: 'zone_pond_promenade',
    roamZone: 'heping',
    sheltered: false,
    center: { x: 0, z: 35.2 },
    minX: -16.5,
    maxX: 16.5,
    minZ: 34.0,
    maxZ: 37.1,
  },
  {
    id: 'zone_lower_hall',
    roamZone: 'courtyard',
    sheltered: true,
    center: { x: 0, z: 18.8 },
    minX: -8.5,
    maxX: 8.5,
    minZ: 16.5,
    maxZ: 21.2,
  },
  {
    id: 'zone_qiantianjing',
    roamZone: 'courtyard',
    sheltered: false,
    center: { x: 0, z: 13.5 },
    minX: -4.2,
    maxX: 4.2,
    minZ: 10.6,
    maxZ: 16.4,
  },
  {
    id: 'zone_eaves_west',
    roamZone: 'courtyard',
    sheltered: true,
    center: { x: -5.4, z: 13.6 },
    minX: -7.0,
    maxX: -4.3,
    minZ: 9.5,
    maxZ: 17.0,
  },
  {
    id: 'zone_eaves_east',
    roamZone: 'courtyard',
    sheltered: true,
    center: { x: 5.4, z: 13.6 },
    minX: 4.3,
    maxX: 7.0,
    minZ: 9.5,
    maxZ: 17.0,
  },
  {
    id: 'zone_hall_center',
    roamZone: 'courtyard',
    sheltered: true,
    center: { x: 0, z: 2.0 },
    minX: -6.5,
    maxX: 6.5,
    minZ: -3.5,
    maxZ: 9.5,
  },
  {
    id: 'zone_west_wing',
    roamZone: 'west_lane',
    sheltered: true,
    center: { x: -11.4, z: 11.5 },
    minX: -15.5,
    maxX: -8.5,
    minZ: -2.0,
    maxZ: 18.5,
  },
  {
    id: 'zone_east_wing',
    roamZone: 'east_lane',
    sheltered: true,
    center: { x: 11.4, z: 11.5 },
    minX: 8.5,
    maxX: 15.5,
    minZ: -2.0,
    maxZ: 18.5,
  },
  {
    id: 'zone_huatai',
    roamZone: 'huatai',
    sheltered: false,
    center: { x: 0, z: -15.5 },
    minX: -11.5,
    maxX: 11.5,
    minZ: -22.5,
    maxZ: -8.5,
  },
  {
    id: 'zone_village_west',
    roamZone: 'village_west',
    sheltered: false,
    center: { x: -24.5, z: 24.0 },
    minX: -36.0,
    maxX: -20.0,
    minZ: 8.0,
    maxZ: 36.0,
  },
  {
    id: 'zone_village_east',
    roamZone: 'village_east',
    sheltered: false,
    center: { x: 24.5, z: 24.0 },
    minX: 20.0,
    maxX: 36.0,
    minZ: 8.0,
    maxZ: 36.0,
  },
];

/**
 * Semantic Ground Navigation Domain with sheltered-zone lookup and doorway-aware
 * multi-zone route planning respecting Doumen gate state.
 */
export class GroundNavDomain {
  public readonly zones: readonly GroundZoneMeta[] = GROUND_ZONES;

  public getZoneAt(x: number, z: number): GroundZoneMeta {
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
        return zone;
      }
    }
    return this.zones[0];
  }

  public isSheltered(x: number, z: number): boolean {
    const zMeta = this.getZoneAt(x, z);
    return zMeta.sheltered;
  }

  public findNearestShelteredPoint(x: number, z: number): Vec2 {
    let best: GroundZoneMeta = this.zones[2];
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      if (!zone.sheltered) continue;
      const dx = zone.center.x - x;
      const dz = zone.center.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = zone;
      }
    }
    return { x: best.center.x, z: best.center.z };
  }

  /**
   * Computes doorway-aware waypoints between two world points.
   * When `doumenOpen === false`, avoids routing through closed side Doumen portals.
   */
  public planPath(start: Vec2, goal: Vec2, doumenOpen = true): Vec2[] {
    const fromRoam = classifyZone(start.x, start.z);
    const toRoam = classifyZone(goal.x, goal.z);
    if (fromRoam === toRoam) {
      return [{ x: start.x, z: start.z }, { x: goal.x, z: goal.z }];
    }
    const bridges = computeZoneBridgeWaypoints(fromRoam, toRoam);
    // If Doumen side doors are closed, prefer routing via front gate (x=0, z=21.2)
    if (!doumenOpen && (fromRoam === 'west_lane' || fromRoam === 'east_lane')) {
      return [
        { x: start.x, z: start.z },
        { x: start.x > 0 ? 11.2 : -11.2, z: 22.8 },
        { x: 0, z: 23.2 },
        { x: goal.x, z: goal.z },
      ];
    }
    return [{ x: start.x, z: start.z }, ...bridges, { x: goal.x, z: goal.z }];
  }
}
