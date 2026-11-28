import type { SurfaceType } from '../types/game';

/**
 * 1:1 Spatial Geometry & Pure Physics/Collision Math for the Meizhou Oval Double-Weilongwu.
 *
 * Coordinate system:
 *   +X = East, -X = West
 *   +Z = South (Front He-Ping & Half-Moon Pond)
 *   -Z = North (Huatai, Inner Weilong, Weilong Alley, Outer Weilong, Rear Forest)
 *   +Y = Up
 */

export const OVAL_CENTER_Z = 9.65;
export const FRONT_STRAIGHT_HALF_W = 19.5;
export const CORNER_RADIUS = 9.5;
export const FRONT_WALL_OUTER_Z = 21.8;
export const FRONT_WALL_INNER_Z = 16.55;
export const FRONT_CENTER_Z = 19.15;

// Inner Weilong semi-ellipse (for z <= OVAL_CENTER_Z)
export const INNER_RING_RX = 29.0;
export const INNER_RING_RZ = 32.5;
export const INNER_RING_HALF_DEPTH = 2.6; // radial thickness 5.2m -> inner wall at -2.6, outer wall at +2.6
export const INNER_BAY_COUNT = 64; // 32 physical rooms (2 bays per room)
export const INNER_OPEN_OUTER_BAYS = new Set<number>([12, 13, 24, 25, 38, 39, 50, 51]);

// Outer Weilong concentric semi-ellipse (behind northern arc, separated by walkable 3.2m Weilong Alley)
export const OUTER_RING_RX = 37.4;
export const OUTER_RING_RZ = 40.9;
export const OUTER_RING_HALF_DEPTH = 2.6;
export const OUTER_BAY_COUNT = 52; // 26 physical rooms (2 bays per room)
export const OUTER_OPEN_OUTER_BAYS = new Set<number>([20, 21, 30, 31]);

export const HUATAI_RADIUS = 26.2;

export interface RingSample {
  x: number;
  z: number;
  nx: number; // outward unit normal X
  nz: number; // outward unit normal Z
  tx: number; // tangent X
  tz: number; // tangent Z
  yBase: number;
}

export interface Aabb2D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  dynamicGate?: 'doumen_east' | 'doumen_west';
}

export interface CircleCollider2D {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export interface OrientedSegment2D {
  id: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfThick: number;
}

export interface MoveResult {
  x: number;
  z: number;
  y: number;
  collided: boolean;
  crossedThreshold: boolean;
}

export interface JiaobeiOutcome {
  type: 'sheng' | 'xiao' | 'yin';
  title: string;
  hakkaQuote: string;
  meaning: string;
}

/**
 * Shared predicate for the open Dragon Hall apex at the north crown of Inner Weilong.
 */
export function isDragonApexBay(bayIndex: number, bayCount: number, isOuterRing: boolean): boolean {
  const midIdx = Math.floor(bayCount / 2);
  return !isOuterRing && bayIndex >= midIdx - 2 && bayIndex < midIdx + 2;
}

/**
 * Shared predicate determining which slice boundaries carry full-depth radial room partition walls
 * ("一格一格的实体房间") dividing the Inner & Outer Weilong rings into discrete physical rooms.
 */
export function isRingRoomPartitionBoundary(
  sliceIndex: number,
  bayCount: number,
  isOuterRing: boolean
): boolean {
  if (sliceIndex <= 0 || sliceIndex >= bayCount) return false;
  if (sliceIndex % 2 !== 0) return false;
  // Keep Dragon Hall grand central apex open (spanning bays 30..33 -> skip internal divider at 32)
  const midIdx = Math.floor(bayCount / 2);
  if (!isOuterRing && sliceIndex === midIdx) return false;
  return true;
}

/**
 * Evaluates a point + outward normal along the smooth G1-continuous Inner Weilong horseshoe
 * from SE corner (t=0) -> East -> North Dragon Hall (t=0.5) -> West -> SW corner (t=1).
 */
export function sampleInnerWeilongCurve(t: number): RingSample {
  const clamped = Math.max(0, Math.min(1, t));
  const cornerSpan = 0.16;

  let x = 0;
  let z = 0;
  let nx = 0;
  let nz = -1;

  if (clamped < cornerSpan) {
    // SE smooth quarter-circle fillet centered at (+19.5, 9.65), radius 9.5
    const u = clamped / cornerSpan;
    const ang = (1 - u) * (Math.PI * 0.5); // PI/2 -> 0
    x = FRONT_STRAIGHT_HALF_W + Math.cos(ang) * CORNER_RADIUS;
    z = OVAL_CENTER_Z + Math.sin(ang) * CORNER_RADIUS;
    nx = Math.cos(ang);
    nz = Math.sin(ang);
  } else if (clamped > 1 - cornerSpan) {
    // SW smooth quarter-circle fillet centered at (-19.5, 9.65), radius 9.5
    const u = (clamped - (1 - cornerSpan)) / cornerSpan;
    const ang = Math.PI - u * (Math.PI * 0.5); // PI -> PI/2
    x = -FRONT_STRAIGHT_HALF_W + Math.cos(ang) * CORNER_RADIUS;
    z = OVAL_CENTER_Z + Math.sin(ang) * CORNER_RADIUS;
    nx = Math.cos(ang);
    nz = Math.sin(ang);
  } else {
    // Grand Northern Semi-Ellipse (phi: 0 -> PI)
    const u = (clamped - cornerSpan) / (1 - 2 * cornerSpan);
    const phi = u * Math.PI;
    x = Math.cos(phi) * INNER_RING_RX;
    z = OVAL_CENTER_Z - Math.sin(phi) * INNER_RING_RZ;
    const gx = Math.cos(phi) / INNER_RING_RX;
    const gz = -Math.sin(phi) / INNER_RING_RZ;
    const glen = Math.hypot(gx, gz) || 1;
    nx = gx / glen;
    nz = gz / glen;
  }

  const tx = nz;
  const tz = -nx;

  const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / INNER_RING_RZ));
  const yBase = 0.28 + northFactor * 1.65;

  return { x, z, nx, nz, tx, tz, yBase };
}

/**
 * Evaluates a point + outward normal along the Second Concentric Outer Weilong Ring (外围龙)
 * wrapping the northern ~205° arc behind the Inner Ring.
 */
export function sampleOuterWeilongCurve(t: number): RingSample {
  const clamped = Math.max(0, Math.min(1, t));
  const phiStart = -0.05 * Math.PI;
  const phiEnd = 1.05 * Math.PI;
  const phi = phiStart + clamped * (phiEnd - phiStart);

  const x = Math.cos(phi) * OUTER_RING_RX;
  const z = OVAL_CENTER_Z - Math.sin(phi) * OUTER_RING_RZ;
  const gx = Math.cos(phi) / OUTER_RING_RX;
  const gz = -Math.sin(phi) / OUTER_RING_RZ;
  const glen = Math.hypot(gx, gz) || 1;
  const nx = gx / glen;
  const nz = gz / glen;
  const tx = nz;
  const tz = -nx;

  const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / OUTER_RING_RZ));
  const yBase = 0.72 + northFactor * 1.95;

  return { x, z, nx, nz, tx, tz, yBase };
}

export function signedDistFromInnerEllipse(x: number, z: number): number {
  const dz = OVAL_CENTER_Z - z;
  const q = Math.hypot(x / INNER_RING_RX, dz / INNER_RING_RZ);
  const avgR = (INNER_RING_RX + INNER_RING_RZ) * 0.5;
  return (q - 1.0) * avgR;
}

export function signedDistFromOuterEllipse(x: number, z: number): number {
  const dz = OVAL_CENTER_Z - z;
  const q = Math.hypot(x / OUTER_RING_RX, dz / OUTER_RING_RZ);
  const avgR = (OUTER_RING_RX + OUTER_RING_RZ) * 0.5;
  return (q - 1.0) * avgR;
}

export function isInsidePond(x: number, z: number): boolean {
  if (z < 38.8) return false;
  const dx = x / 16.2;
  const dz = (z - 38.6) / 10.8;
  return dx * dx + dz * dz < 1.0;
}

export function isOnStoneJetty(x: number, z: number): boolean {
  return Math.abs(x) <= 3.8 && z >= 36.2 && z <= 39.6;
}

export function isInsideHuatai(x: number, z: number): boolean {
  if (z > -5.6) return false;
  return signedDistFromInnerEllipse(x, z) <= -INNER_RING_HALF_DEPTH - 0.1;
}

export function isInsideInnerWeilong(x: number, z: number): boolean {
  if (z <= OVAL_CENTER_Z) {
    const d = signedDistFromInnerEllipse(x, z);
    return d >= -INNER_RING_HALF_DEPTH - 0.3 && d <= INNER_RING_HALF_DEPTH + 0.3;
  }
  if (Math.abs(x) >= FRONT_STRAIGHT_HALF_W - 0.4 && z <= FRONT_WALL_OUTER_Z + 0.3) {
    const cx = x >= 0 ? FRONT_STRAIGHT_HALF_W : -FRONT_STRAIGHT_HALF_W;
    const dist = Math.hypot(x - cx, z - OVAL_CENTER_Z);
    return (
      dist >= CORNER_RADIUS - INNER_RING_HALF_DEPTH - 0.3 &&
      dist <= CORNER_RADIUS + INNER_RING_HALF_DEPTH + 0.3
    );
  }
  return false;
}

export function isInsideWeilongAlley(x: number, z: number): boolean {
  if (z > OVAL_CENTER_Z + 1.5) return false;
  const dIn = signedDistFromInnerEllipse(x, z);
  const dOut = signedDistFromOuterEllipse(x, z);
  return dIn > INNER_RING_HALF_DEPTH + 0.2 && dOut < -OUTER_RING_HALF_DEPTH - 0.2;
}

export function isInsideOuterWeilong(x: number, z: number): boolean {
  if (z > OVAL_CENTER_Z + 2.2) return false;
  const dOut = signedDistFromOuterEllipse(x, z);
  return dOut >= -OUTER_RING_HALF_DEPTH - 0.3 && dOut <= OUTER_RING_HALF_DEPTH + 0.3;
}

/**
 * Continuous architectural floor / terrain elevation function groundHeightAt(x, z).
 */
export function groundHeightAt(x: number, z: number, _currentY = 0): number {
  if (isOnStoneJetty(x, z)) {
    const t = Math.max(0, Math.min(1, (z - 36.4) / 3.0));
    return -t * 0.38;
  }
  if (isInsidePond(x, z)) {
    return -0.65;
  }

  if (z >= FRONT_WALL_OUTER_Z) {
    return 0.0;
  }

  if (z >= FRONT_WALL_INNER_Z && Math.abs(x) <= FRONT_STRAIGHT_HALF_W + 0.2) {
    return 0.25;
  }

  if (Math.abs(x) <= 11.4 && z >= -5.6 && z < FRONT_WALL_INNER_Z) {
    if (z >= 10.6) return 0.15; // 前天井
    if (z >= 5.4) return 0.45; // 中堂
    if (z >= 0.2) return 0.35; // 后天井
    return 0.85; // 上堂
  }

  if (Math.abs(x) > 11.4 && Math.abs(x) <= 18.6 && z >= -4.2 && z < FRONT_WALL_INNER_Z) {
    return 0.32;
  }

  if (z >= -5.6 && z < FRONT_WALL_INNER_Z) {
    const dIn = signedDistFromInnerEllipse(x, z);
    if (z <= OVAL_CENTER_Z && dIn < -INNER_RING_HALF_DEPTH) {
      return 0.22;
    }
    if (z > OVAL_CENTER_Z) {
      const cx = x >= 0 ? FRONT_STRAIGHT_HALF_W : -FRONT_STRAIGHT_HALF_W;
      const cornerDist = Math.hypot(x - cx, z - OVAL_CENTER_Z);
      if (cornerDist < CORNER_RADIUS - INNER_RING_HALF_DEPTH) {
        return 0.22;
      }
    }
  }

  if (isInsideHuatai(x, z)) {
    const northFrac = Math.max(0, Math.min(1, (-5.6 - z) / 14.8));
    const radialNorm = Math.min(1, Math.hypot(x / 24.0, (z + 8.5) / 15.0));
    const dome = Math.cos(radialNorm * Math.PI * 0.44) * 0.34;
    return 0.85 + northFrac * 0.88 + dome;
  }

  if (isInsideInnerWeilong(x, z)) {
    const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / INNER_RING_RZ));
    return 0.28 + northFactor * 1.65;
  }

  if (isInsideWeilongAlley(x, z)) {
    const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / 36.8));
    return 0.45 + northFactor * 1.72;
  }

  if (isInsideOuterWeilong(x, z)) {
    const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / OUTER_RING_RZ));
    return 0.72 + northFactor * 1.95;
  }

  // Smoothly rising rear & side Lingnan terrain outside Outer Ring
  const dOut = z <= OVAL_CENTER_Z ? signedDistFromOuterEllipse(x, z) : Math.max(0, Math.abs(x) - 31.5);
  if (z < OVAL_CENTER_Z && dOut > OUTER_RING_HALF_DEPTH) {
    const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / 48.0));
    const undul = Math.sin(x * 0.08) * 0.28 + Math.cos(z * 0.09) * 0.22;
    return 0.4 + northFactor * 2.55 + Math.min(3.0, Math.max(0, dOut - 3) * 0.08) + undul;
  }

  return Math.sin(x * 0.07) * 0.14;
}

export function surfaceTypeAt(x: number, z: number, _y = 0): SurfaceType {
  if (isOnStoneJetty(x, z) || isInsidePond(x, z)) return 'water_stone';
  if (z >= FRONT_WALL_OUTER_Z && z < 36.6 && Math.abs(x) <= 35.0) return 'courtyard';
  if (isInsideHuatai(x, z)) return 'cobble';
  if (isInsideOuterWeilong(x, z)) return 'wood_2f';
  if (isInsideInnerWeilong(x, z) || isInsideWeilongAlley(x, z)) return 'slate';
  if (z < FRONT_WALL_OUTER_Z && Math.abs(x) <= 27.0 && z >= -5.8) return 'slate';
  return 'forest';
}

export function detectNodeIdAt(x: number, z: number, _y = 0): string {
  if (z >= 36.0) return 'node_01_pond';
  if (z >= FRONT_WALL_OUTER_Z) return 'node_02_heping';

  if (z >= FRONT_WALL_INNER_Z && Math.abs(x) <= FRONT_STRAIGHT_HALF_W) {
    return 'node_03_xiatang';
  }

  if (Math.abs(x) <= 11.4 && z >= -5.6 && z < FRONT_WALL_INNER_Z) {
    if (z >= 10.6) return 'node_04_front_skywell';
    if (z >= 5.4) return 'node_05_zhongtang';
    if (z >= 0.2) return 'node_06_rear_skywell';
    return 'node_07_shangtang';
  }

  if (x < -11.4 && x >= -18.8 && z >= -4.2 && z < FRONT_WALL_INNER_Z) {
    if (z >= 8.2) return 'node_08_bedroom';
    if (z >= 1.5) return 'node_10_well';
    return 'node_09_study';
  }

  if (x > 11.4 && x <= 18.8 && z >= -4.2 && z < FRONT_WALL_INNER_Z) {
    if (z >= 8.2) return 'node_11_kitchen';
    if (z >= 1.5) return 'node_13_poultry';
    return 'node_12_granary';
  }

  if (
    z >= -5.6 &&
    z < FRONT_WALL_INNER_Z &&
    !isInsideInnerWeilong(x, z) &&
    !isInsideOuterWeilong(x, z) &&
    !isInsideWeilongAlley(x, z)
  ) {
    const dIn = z <= OVAL_CENTER_Z ? signedDistFromInnerEllipse(x, z) : -5;
    if (dIn < -INNER_RING_HALF_DEPTH) {
      return 'node_14_tianjie';
    }
  }

  if (isInsideHuatai(x, z)) return 'node_17_huatai';

  if (isInsideInnerWeilong(x, z)) {
    const phiDeg = (Math.atan2(OVAL_CENTER_Z - z, x) * 180) / Math.PI;
    if (phiDeg >= 78 && phiDeg <= 102) return 'node_19_dragon_hall';
    if (phiDeg > 134) return 'node_18e_daily';
    if (phiDeg > 118) return 'node_18a_weaving';
    if (phiDeg > 102) return 'node_18b_music';
    if (phiDeg >= 62) return 'node_18c_qiaopi';
    if (phiDeg >= 44) return 'node_18d_carpentry';
    return 'node_18e_daily';
  }

  if (isInsideWeilongAlley(x, z)) return 'node_15_gallery';
  if (isInsideOuterWeilong(x, z)) {
    if (x >= 8.0 && z <= -12.0) return 'node_16_watchtower';
    return 'node_15_gallery';
  }

  if (z < OVAL_CENTER_Z) return 'node_20_forest';
  return 'node_02_heping';
}

/**
 * Generates static AABB colliders for straight masonry walls, interior room partitions,
 * and solid rectangular furniture/altars/beds/stoves so nothing clips.
 */
export function buildWallColliders(): Aabb2D[] {
  const walls: Aabb2D[] = [];
  const add = (
    id: string,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    opts?: { dynamicGate?: 'doumen_east' | 'doumen_west' }
  ) => {
    walls.push({ id, minX, maxX, minZ, maxZ, ...opts });
  };

  // --- Front Straight Facade Wall at z = 21.65 (3 portals: main, West Doumen, East Doumen) ---
  add('front_outer_w1', -19.6, -17.4, 21.4, 22.0);
  add('front_outer_w_door', -17.4, -14.8, 21.4, 22.0, { dynamicGate: 'doumen_west' });
  add('front_outer_w2', -14.8, -2.0, 21.4, 22.0);
  add('front_outer_e1', 2.0, 14.8, 21.4, 22.0);
  add('front_outer_e_door', 14.8, 17.4, 21.4, 22.0, { dynamicGate: 'doumen_east' });
  add('front_outer_e2', 17.4, 19.6, 21.4, 22.0);
  // Main portal recessed alcove side walls
  add('front_alcove_w', -2.18, -1.82, 20.25, 21.65);
  add('front_alcove_e', 1.82, 2.18, 20.25, 21.65);

  // --- Front Straight Wing Inner Wall at z = 16.55 ---
  add('front_inner_w', -12.8, -2.6, 16.35, 16.75);
  add('front_inner_e', 2.6, 12.8, 16.35, 16.75);

  // --- Front Skywell Flanking White Chambers ---
  add('skywell_chamber_w', -8.45, -5.35, 11.55, 15.65);
  add('skywell_chamber_e', 5.35, 8.45, 11.55, 15.65);

  // --- Central Axis Side Partition Walls (wide openings to West/East wings) ---
  add('axis_w_mid', -11.6, -11.2, 7.6, 10.6);
  add('axis_w_rear', -11.6, -11.2, -2.5, 0.8);
  add('axis_e_mid', 11.2, 11.6, 7.6, 10.6);
  add('axis_e_rear', 11.2, 11.6, -2.5, 0.8);

  // --- Upper Hall Rear Ancestral Shrine Wall at z = -5.6 ---
  add('shangtang_rear_altar', -4.45, 4.45, -5.85, -5.35);

  // --- West Horizontal Wing Outer Wall (x = -18.4) & Room Dividers ---
  add('west_wing_outer_1', -18.6, -18.2, 13.8, 16.4);
  add('west_wing_outer_2', -18.6, -18.2, 5.4, 10.0);
  add('west_wing_outer_3', -18.6, -18.2, -1.0, 1.4);
  add('west_div_1', -18.2, -14.2, 8.05, 8.35);
  add('west_div_2', -18.2, -14.2, 1.25, 1.55);

  // --- East Horizontal Wing Outer Wall (x = +18.4) & Room Dividers ---
  add('east_wing_outer_1', 18.2, 18.6, 13.8, 16.4);
  add('east_wing_outer_2', 18.2, 18.6, 5.4, 10.0);
  add('east_wing_outer_3', 18.2, 18.6, -1.0, 1.4);
  add('east_div_1', 14.2, 18.2, 8.05, 8.35);
  add('east_div_2', 14.2, 18.2, 1.25, 1.55);

  // --- Solid Architectural Furniture & Shrine Colliders (exact propsBuilder.ts footprints) ---
  add('prop_middle_table', -0.95, 0.95, 7.38, 8.62); // Eight-Immortals table
  add('prop_upper_altar', -1.85, 1.85, -5.15, -3.88); // Upper Hall ancestral altar
  add('prop_dragon_shrine', -1.22, 1.22, -24.18, -23.02); // Dragon Hall land shrine
  add('prop_bogong_shrine', -1.18, 1.18, -47.4, -45.6); // Rear forest Bogong shrine
  add('prop_bedroom_bed', -17.35, -15.05, 12.75, 14.45); // West canopy bed
  add('prop_bedroom_chest', -17.45, -16.15, 9.65, 10.75); // West camphor chest & mirror
  add('prop_study_desk', -16.9, -15.5, -2.4, -0.8); // West study desk
  add('prop_kitchen_stove', 15.75, 17.5, 10.9, 15.1); // East 3-wok stove
  add('prop_kitchen_leicha', 13.85, 14.95, 9.25, 10.35); // East Leicha table
  add('prop_granary_winnower', 15.35, 17.05, -2.25, -0.95); // East winnowing machine
  add('prop_front_bench', -7.45, -4.95, 22.45, 23.15); // Elders sitting bench on He-Ping
  add('prop_huatai_woodpile', -10.3, -8.1, -15.65, -13.95); // Huatai firewood stack

  return walls;
}

/**
 * Generates cylindrical colliders for all architectural timber columns, lantern posts,
 * circular stone wells/vats/mills, and foreground hero trees.
 */
export function buildCircleColliders(): CircleCollider2D[] {
  const circles: CircleCollider2D[] = [];
  const add = (id: string, x: number, z: number, radius: number) => {
    circles.push({ id, x, z, radius });
  };

  // Lower Hall columns
  for (const cx of [-2.4, 2.4, -13.0, 13.0, -18.2, 18.2]) {
    add(`col_lower_${cx}`, cx, 16.65, 0.25);
  }
  // Middle Hall columns
  for (const cx of [-9.2, -5.2, -2.4, 2.4, 5.2, 9.2]) {
    add(`col_mid_s_${cx}`, cx, 10.2, 0.25);
    add(`col_mid_n_${cx}`, cx, 5.7, 0.25);
  }
  // Rear Skywell columns
  for (const sx of [-4.7, 4.7]) {
    add(`col_rsky_s_${sx}`, sx, 3.8, 0.25);
    add(`col_rsky_n_${sx}`, sx, 1.4, 0.25);
  }
  // Upper Hall columns
  for (const cx of [-10.4, -5.4, -2.5, 2.5, 5.4, 10.4]) {
    add(`col_up_s_${cx}`, cx, -0.1, 0.25);
    add(`col_up_n_${cx}`, cx, -5.1, 0.25);
  }
  // He-Ping pavilion lantern posts
  for (const [px, pz] of [
    [-16.5, 35.4],
    [16.5, 35.4],
    [-19.5, 24.5],
    [19.5, 24.5],
  ] as [number, number][]) {
    add(`lantern_post_${px}_${pz}`, px, pz, 0.3);
  }
  // Circular courtyard & room props
  add('prop_skywell_vat', -3.4, 13.6, 0.65);
  add('prop_rear_mill', -2.2, 2.8, 0.68);
  add('prop_west_well', -15.2, 4.8, 0.82);
  add('prop_east_coop', 16.1, 4.8, 0.68);
  add('prop_weaving_loom', -17.0, -16.6, 0.72);
  add('prop_music_drum', -9.9, -20.9, 0.56);
  add('prop_qiaopi_trunk', 9.9, -20.9, 0.62);
  add('prop_carpentry_bench', 17.0, -16.6, 0.78);
  // Foreground weeping willows & hero camphor trunks
  for (const [wx, wz, r] of [
    [-17.4, 39.2, 0.48],
    [17.4, 39.6, 0.48],
    [-13.8, 49.4, 0.45],
    [13.4, 49.6, 0.45],
    [0.8, 50.8, 0.48],
    [39.5, 16.5, 0.65],
    [43.0, 9.5, 0.72],
    [44.5, 2.5, 0.7],
    [42.0, 22.0, 0.58],
    [-42.5, 15.0, 0.65],
    [-45.0, 6.0, 0.7],
  ] as [number, number, number][]) {
    add(`tree_trunk_${wx}_${wz}`, wx, wz, r);
  }

  return circles;
}

/**
 * Generates exact 1:1 oriented wall segments for the Inner & Outer Curved Weilong Rings:
 * - Inner courtyard walls (solid window bays + framed walk-in doorway piers on even bays, Dragon Hall open)
 * - Outer perimeter walls (solid bays, open pass-through archways matching openOuterBays)
 * - Full-depth radial room partition walls dividing every 2-bay room ("一格一格的实体房间")
 */
export function buildCurvedRingWallSegments(): OrientedSegment2D[] {
  const segs: OrientedSegment2D[] = [];

  const buildRing = (
    prefix: string,
    sampleFn: (t: number) => RingSample,
    bayCount: number,
    halfDepth: number,
    openOuterBays: Set<number>,
    isOuterRing: boolean
  ) => {
    const samples: RingSample[] = [];
    for (let i = 0; i <= bayCount; i++) {
      samples.push(sampleFn(i / bayCount));
    }

    for (let i = 0; i < bayCount; i++) {
      const s0 = samples[i];
      const s1 = samples[i + 1];
      const sm = sampleFn((i + 0.5) / bayCount);
      const isDragonApex = isDragonApexBay(i, bayCount, isOuterRing);

      // 1. Inner courtyard wall (at -halfDepth + 0.16)
      const inAx = s0.x - s0.nx * (halfDepth - 0.16);
      const inAz = s0.z - s0.nz * (halfDepth - 0.16);
      const inBx = s1.x - s1.nx * (halfDepth - 0.16);
      const inBz = s1.z - s1.nz * (halfDepth - 0.16);
      const inLen = Math.hypot(inBx - inAx, inBz - inAz);

      if (!isDragonApex) {
        if (i % 2 === 1) {
          // Solid windowed wall bay
          segs.push({
            id: `${prefix}_in_${i}`,
            ax: inAx,
            az: inAz,
            bx: inBx,
            bz: inBz,
            halfThick: 0.16,
          });
        } else {
          // Even bay: open walk-in doorway (clear width ~1.18m) with narrow side piers only if bay is wide enough
          const doorW = Math.min(1.24, Math.max(0.98, inLen * 0.64));
          const pierW = (inLen - doorW) * 0.5;
          if (pierW > 0.22) {
            const dirX = (inBx - inAx) / (inLen || 1);
            const dirZ = (inBz - inAz) / (inLen || 1);
            segs.push({
              id: `${prefix}_in_pierL_${i}`,
              ax: inAx,
              az: inAz,
              bx: inAx + dirX * pierW,
              bz: inAz + dirZ * pierW,
              halfThick: 0.15,
            });
            segs.push({
              id: `${prefix}_in_pierR_${i}`,
              ax: inBx - dirX * pierW,
              az: inBz - dirZ * pierW,
              bx: inBx,
              bz: inBz,
              halfThick: 0.15,
            });
          }
        }
      }

      // 2. Outer perimeter wall (at +halfDepth - 0.18)
      if (!openOuterBays.has(i)) {
        const outAx = s0.x + s0.nx * (halfDepth - 0.18);
        const outAz = s0.z + s0.nz * (halfDepth - 0.18);
        const outBx = s1.x + s1.nx * (halfDepth - 0.18);
        const outBz = s1.z + s1.nz * (halfDepth - 0.18);
        segs.push({
          id: `${prefix}_out_${i}`,
          ax: outAx,
          az: outAz,
          bx: outBx,
          bz: outBz,
          halfThick: 0.22,
        });
      }

      // 3. Full-depth radial room partition wall dividing rooms (一格一格实体隔间)
      if (isRingRoomPartitionBoundary(i, bayCount, isOuterRing)) {
        // Span cleanly from inner wall face to outer wall face
        const rAx = s0.x - s0.nx * (halfDepth - 0.2);
        const rAz = s0.z - s0.nz * (halfDepth - 0.2);
        const rBx = s0.x + s0.nx * (halfDepth - 0.2);
        const rBz = s0.z + s0.nz * (halfDepth - 0.2);
        segs.push({
          id: `${prefix}_part_${i}`,
          ax: rAx,
          az: rAz,
          bx: rBx,
          bz: rBz,
          halfThick: 0.14,
        });
      }
      void sm;
    }

    // End cap walls closing open South ends of Outer Ring slightly? Keep Outer Ring ends open to alley!
  };

  buildRing('inner', sampleInnerWeilongCurve, INNER_BAY_COUNT, INNER_RING_HALF_DEPTH, INNER_OPEN_OUTER_BAYS, false);
  buildRing('outer', sampleOuterWeilongCurve, OUTER_BAY_COUNT, OUTER_RING_HALF_DEPTH, OUTER_OPEN_OUTER_BAYS, true);

  return segs;
}

const STATIC_WALLS = buildWallColliders();
const STATIC_CIRCLES = buildCircleColliders();
const CURVED_WALL_SEGMENTS = buildCurvedRingWallSegments();

function pointToSegmentDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { distSq: number; closestX: number; closestZ: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  let t = 0;
  if (lenSq > 1e-6) {
    t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  }
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return { distSq: dx * dx + dz * dz, closestX: cx, closestZ: cz };
}

/**
 * Validates that a candidate tree trunk coordinate (x, z) does NOT intersect or crowd
 * any building footprint, masonry wall, curved Weilong room, pond water, or cottage.
 * Used both at build time in architectureBuilder.ts and in automated unit tests!
 */
export function isValidTreePosition(x: number, z: number, minClearance = 2.6): boolean {
  // Never inside Half-Moon Pond or stone coping rim
  if (z >= 36.8 && z <= 51.0) {
    const dx = x / (16.2 + minClearance * 0.45);
    const dz = (z - 38.6) / (10.8 + minClearance * 0.45);
    if (z >= 37.8 && dx * dx + dz * dz < 1.0) return false;
  }

  // Never inside central Front Wing + Three Halls + Flanking Horizontal Wings footprint
  if (Math.abs(x) <= 20.5 + minClearance * 0.5 && z >= -6.5 - minClearance * 0.4 && z <= FRONT_WALL_OUTER_Z + minClearance * 0.65) {
    return false;
  }

  // Never inside Inner Weilong Ring, Weilong Alley, or Outer Weilong Ring walls/rooms
  if (z <= FRONT_WALL_OUTER_Z + minClearance) {
    if (z <= OVAL_CENTER_Z + 2.5) {
      const dIn = signedDistFromInnerEllipse(x, z);
      if (dIn >= -INNER_RING_HALF_DEPTH - minClearance && dIn <= INNER_RING_HALF_DEPTH + minClearance) {
        return false;
      }
      const dOut = signedDistFromOuterEllipse(x, z);
      if (dOut >= -OUTER_RING_HALF_DEPTH - minClearance && dOut <= OUTER_RING_HALF_DEPTH + minClearance) {
        return false;
      }
      // Also disallow trees inside the narrow Weilong Alley (between inner & outer rings)
      if (dIn > INNER_RING_HALF_DEPTH - 0.5 && dOut < -OUTER_RING_HALF_DEPTH + 0.5) {
        return false;
      }
    } else if (Math.abs(x) >= FRONT_STRAIGHT_HALF_W - 1.5) {
      // Curved SW/SE corner fillets
      const cx = x >= 0 ? FRONT_STRAIGHT_HALF_W : -FRONT_STRAIGHT_HALF_W;
      const dist = Math.hypot(x - cx, z - OVAL_CENTER_Z);
      if (
        dist >= CORNER_RADIUS - INNER_RING_HALF_DEPTH - minClearance &&
        dist <= CORNER_RADIUS + INNER_RING_HALF_DEPTH + minClearance
      ) {
        return false;
      }
    }
  }

  // Never crowd any static wall collider or curved wall segment
  for (let i = 0; i < STATIC_WALLS.length; i++) {
    const w = STATIC_WALLS[i];
    if (w.id.startsWith('prop_')) continue;
    const cx = Math.max(w.minX, Math.min(x, w.maxX));
    const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
    if (Math.hypot(x - cx, z - cz) < minClearance) return false;
  }
  for (let i = 0; i < CURVED_WALL_SEGMENTS.length; i++) {
    const s = CURVED_WALL_SEGMENTS[i];
    const r = pointToSegmentDistSq(x, z, s.ax, s.az, s.bx, s.bz);
    if (r.distSq < (minClearance + s.halfThick) * (minClearance + s.halfThick)) return false;
  }

  // Keep clear of He-Ping central drying & entrance axis
  if (Math.abs(x) < 17.5 && z > 21.5 && z < 38.5) return false;

  // Keep clear of NW annex & rear village cottages & Bogong shrine
  if (Math.hypot(x + 31.5, z + 28.0) < 11.5) return false;
  if (Math.hypot(x - 5.5, z + 40.5) < 9.5) return false;
  if (Math.hypot(x - 27.5, z + 37.5) < 8.8) return false;
  if (Math.hypot(x, z + 46.5) < 5.0) return false;
  if (Math.hypot(x + 38, z + 62) < 9.2) return false;
  if (Math.hypot(x - 32, z + 68) < 9.2) return false;
  if (Math.hypot(x + 12, z + 78) < 9.5) return false;
  if (Math.hypot(x - 54, z + 48) < 8.5) return false;

  return true;
}

/**
 * Resolves any entity (player, NPC, or animal) of given radius against all static walls,
 * curved Weilong room walls & radial room partitions, columns, props, and pond water.
 * Uses 3 iterative projection passes so corners and doorways never snag or clip!
 */
export function resolveEntityCollision(
  prevX: number,
  prevZ: number,
  nextX: number,
  nextZ: number,
  radius: number,
  doumenOpen: boolean
): { x: number; z: number; collided: boolean } {
  let x = nextX;
  let z = nextZ;
  let collided = false;

  // World outer perimeter
  if (x < -56) {
    x = -56;
    collided = true;
  } else if (x > 56) {
    x = 56;
    collided = true;
  }
  if (z < -58) {
    z = -58;
    collided = true;
  } else if (z > 50) {
    z = 50;
    collided = true;
  }

  for (let iter = 0; iter < 3; iter++) {
    // 1. Half-Moon Pond water barrier (allow walking onto stone jetty up to z=39.4)
    if (isInsidePond(x, z) && !isOnStoneJetty(x, z)) {
      if (prevZ <= 39.2) {
        z = 38.72;
      } else {
        const dx = x / 16.2;
        const dz = (z - 38.6) / 10.8;
        const len = Math.hypot(dx, dz) || 1;
        x = (dx / len) * (16.2 + radius * 0.6);
        z = 38.6 + (dz / len) * (10.8 + radius * 0.6);
      }
      collided = true;
    }

    // 2. Curved Weilong Inner/Outer walls + full-depth Radial Room Partition walls
    for (let i = 0; i < CURVED_WALL_SEGMENTS.length; i++) {
      const seg = CURVED_WALL_SEGMENTS[i];
      const minDist = radius + seg.halfThick;
      // Fast bounding-box reject
      const minSx = Math.min(seg.ax, seg.bx) - minDist;
      const maxSx = Math.max(seg.ax, seg.bx) + minDist;
      if (x < minSx || x > maxSx) continue;
      const minSz = Math.min(seg.az, seg.bz) - minDist;
      const maxSz = Math.max(seg.az, seg.bz) + minDist;
      if (z < minSz || z > maxSz) continue;

      const hit = pointToSegmentDistSq(x, z, seg.ax, seg.az, seg.bx, seg.bz);
      if (hit.distSq < minDist * minDist) {
        collided = true;
        if (hit.distSq > 1e-6) {
          const dist = Math.sqrt(hit.distSq);
          const push = minDist - dist;
          x += ((x - hit.closestX) / dist) * push;
          z += ((z - hit.closestZ) / dist) * push;
        } else {
          // Exact overlap fallback: push back toward previous position
          const pdx = prevX - hit.closestX;
          const pdz = prevZ - hit.closestZ;
          const plen = Math.hypot(pdx, pdz);
          if (plen > 1e-5) {
            x = hit.closestX + (pdx / plen) * minDist;
            z = hit.closestZ + (pdz / plen) * minDist;
          } else {
            // Normal to segment
            const sx = seg.bx - seg.ax;
            const sz = seg.bz - seg.az;
            const sl = Math.hypot(sx, sz) || 1;
            x += (-sz / sl) * minDist;
            z += (sx / sl) * minDist;
          }
        }
      }
    }

    // 3. Static & Dynamic AABB Wall & Rectangular Furniture Colliders
    for (let i = 0; i < STATIC_WALLS.length; i++) {
      const w = STATIC_WALLS[i];
      if (w.dynamicGate && doumenOpen) continue;
      const closestX = Math.max(w.minX, Math.min(x, w.maxX));
      const closestZ = Math.max(w.minZ, Math.min(z, w.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        collided = true;
        if (distSq > 1e-5) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          x += (dx / dist) * overlap;
          z += (dz / dist) * overlap;
        } else {
          const penLeft = Math.abs(x - w.minX);
          const penRight = Math.abs(w.maxX - x);
          const penTop = Math.abs(z - w.minZ);
          const penBot = Math.abs(w.maxZ - z);
          const minPen = Math.min(penLeft, penRight, penTop, penBot);
          if (minPen === penLeft) x = w.minX - radius;
          else if (minPen === penRight) x = w.maxX + radius;
          else if (minPen === penTop) z = w.minZ - radius;
          else z = w.maxZ + radius;
        }
      }
    }

    // 4. Circular Columns, Lantern Posts, Circular Props & Tree Trunks
    for (let i = 0; i < STATIC_CIRCLES.length; i++) {
      const c = STATIC_CIRCLES[i];
      const minD = radius + c.radius;
      const dx = x - c.x;
      const dz = z - c.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minD * minD) {
        collided = true;
        if (distSq > 1e-5) {
          const dist = Math.sqrt(distSq);
          const push = minD - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        } else {
          x += minD;
        }
      }
    }
  }

  return { x, z, collided };
}

/**
 * Resolves player free-walking movement against all walls, curved Weilong room partitions,
 * timber columns, furniture, trees, and pond water with sub-step sweeping so sprinting
 * never tunnels through a thin interior wall.
 */
export function resolvePlayerMovement(
  prevX: number,
  prevZ: number,
  nextX: number,
  nextZ: number,
  currentY: number,
  doumenOpen: boolean
): MoveResult {
  const playerRadius = 0.42;
  const totalDx = nextX - prevX;
  const totalDz = nextZ - prevZ;
  const stepDist = Math.hypot(totalDx, totalDz);
  // Sub-step every <=0.22m (< half player radius) to make wall tunneling mathematically impossible
  const steps = Math.max(1, Math.min(32, Math.ceil(stepDist / 0.22)));

  let curX = prevX;
  let curZ = prevZ;
  let collided = false;

  for (let s = 1; s <= steps; s++) {
    const targetX = curX + totalDx / steps;
    const targetZ = curZ + totalDz / steps;
    const res = resolveEntityCollision(curX, curZ, targetX, targetZ, playerRadius, doumenOpen);
    curX = res.x;
    curZ = res.z;
    if (res.collided) collided = true;
  }

  // Detect crossing the 25cm high wooden threshold at 下堂 central main portal (z = 21.7)
  const crossedThreshold =
    Math.abs(curX) <= 2.2 &&
    ((prevZ > FRONT_WALL_OUTER_Z - 0.1 && curZ <= FRONT_WALL_OUTER_Z - 0.1) ||
      (prevZ <= FRONT_WALL_OUTER_Z - 0.1 && curZ > FRONT_WALL_OUTER_Z - 0.1));

  const y = groundHeightAt(curX, curZ, currentY);
  return { x: curX, z: curZ, y, collided, crossedThreshold };
}

/**
 * Deterministic-capable Jiaobei (筊杯) divination evaluator.
 */
export function evaluateJiaobei(seedA: number, seedB: number): JiaobeiOutcome {
  const flatA = seedA >= 0.5;
  const flatB = seedB >= 0.5;
  if (flatA !== flatB) {
    return {
      type: 'sheng',
      title: '圣杯 · 一正一反',
      hakkaQuote: '「祖公保佑，万事顺意！」',
      meaning: '阴阳相合，大吉之兆。宗族祖德庇佑，耕读家风长兴。',
    };
  }
  if (flatA && flatB) {
    return {
      type: 'xiao',
      title: '笑杯 · 两面朝上',
      hakkaQuote: '「莫急莫躁，笑口常开！」',
      meaning: '神明含笑未决，心诚再问，凡事从容顺其自然。',
    };
  }
  return {
    type: 'yin',
    title: '阴杯 · 两背朝上',
    hakkaQuote: '「稳打稳扎，静待花开。」',
    meaning: '时运尚在酝酿，宜韬光养晦、勤修内功再行其事。',
  };
}

/**
 * Computes exploration mastery percentage from visited spaces, interactions, and artifacts.
 */
export function calculateMasteryProgress(
  visitedCount: number,
  totalNodes: number,
  interactionsCount: number,
  totalInteractions: number,
  artifactsCount: number,
  totalArtifacts: number
): number {
  const total = totalNodes + totalInteractions + totalArtifacts;
  if (total <= 0) return 0;
  const done =
    Math.min(visitedCount, totalNodes) +
    Math.min(interactionsCount, totalInteractions) +
    Math.min(artifactsCount, totalArtifacts);
  return Math.round((done / total) * 100);
}
