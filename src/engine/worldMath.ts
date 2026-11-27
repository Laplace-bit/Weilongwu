import type { SurfaceType } from '../types/game';

/**
 * 1:1 Spatial Geometry & Pure Movement Math for the Meizhou Oval Double-Weilongwu
 * matching /public/assets/aistudio/image_2a7cd311.png.
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

// Outer Weilong concentric semi-ellipse (behind northern arc, separated by walkable 3.2m Weilong Alley)
export const OUTER_RING_RX = 37.4;
export const OUTER_RING_RZ = 40.9;
export const OUTER_RING_HALF_DEPTH = 2.6;

// Legacy alias kept for compatibility with AR Taiji overlay
export const WEILONG_CENTER_Z = OVAL_CENTER_Z;
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
    // Outward normal of ellipse (x/Rx)^2 + ((z-cz)/Rz)^2 = 1
    const gx = Math.cos(phi) / INNER_RING_RX;
    const gz = -Math.sin(phi) / INNER_RING_RZ;
    const glen = Math.hypot(gx, gz) || 1;
    nx = gx / glen;
    nz = gz / glen;
  }

  // Tangent pointing CCW (east -> north -> west)
  const tx = nz;
  const tz = -nx;

  // Authentic Meizhou gradual floor rise from South wings up toward Northern Dragon Hall
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

/**
 * Normalized elliptical radius metric for the northern oval (z <= OVAL_CENTER_Z).
 * Returns radial distance in meters from the Inner Ring centerline (negative = inside Huatai, positive = outside).
 */
export function signedDistFromInnerEllipse(x: number, z: number): number {
  const dz = OVAL_CENTER_Z - z;
  const q = Math.hypot(x / INNER_RING_RX, dz / INNER_RING_RZ);
  const avgR = (INNER_RING_RX + INNER_RING_RZ) * 0.5;
  return (q - 1.0) * avgR;
}

/**
 * Normalized elliptical radius metric relative to the Outer Weilong Ring centerline.
 */
export function signedDistFromOuterEllipse(x: number, z: number): number {
  const dz = OVAL_CENTER_Z - z;
  const q = Math.hypot(x / OUTER_RING_RX, dz / OUTER_RING_RZ);
  const avgR = (OUTER_RING_RX + OUTER_RING_RZ) * 0.5;
  return (q - 1.0) * avgR;
}

/**
 * Returns true if (x, z) is inside the Half-Moon Pond water basin.
 * Crescent centered at (0, 38.6), bulging south to z ~ 49.4.
 */
export function isInsidePond(x: number, z: number): boolean {
  if (z < 38.8) return false;
  const dx = x / 16.2;
  const dz = (z - 38.6) / 10.8;
  return dx * dx + dz * dz < 1.0;
}

/**
 * Returns true if (x, z) is on the stone jetty steps dipping toward Half-Moon Pond.
 */
export function isOnStoneJetty(x: number, z: number): boolean {
  return Math.abs(x) <= 3.8 && z >= 36.2 && z <= 39.6;
}

/**
 * Returns true if (x, z) is inside the wide sun-baked Huatai semicircular yard behind Upper Hall.
 */
export function isInsideHuatai(x: number, z: number): boolean {
  if (z > -5.6) return false;
  return signedDistFromInnerEllipse(x, z) <= -INNER_RING_HALF_DEPTH - 0.1;
}

/**
 * Returns true if (x, z) is inside the Inner Weilong Ring rooms (内围龙).
 */
export function isInsideInnerWeilong(x: number, z: number): boolean {
  if (z <= OVAL_CENTER_Z) {
    const d = signedDistFromInnerEllipse(x, z);
    return d >= -INNER_RING_HALF_DEPTH - 0.3 && d <= INNER_RING_HALF_DEPTH + 0.3;
  }
  // Curved SW / SE corner fillets
  if (Math.abs(x) >= FRONT_STRAIGHT_HALF_W - 0.4 && z <= FRONT_WALL_OUTER_Z + 0.3) {
    const cx = x >= 0 ? FRONT_STRAIGHT_HALF_W : -FRONT_STRAIGHT_HALF_W;
    const dist = Math.hypot(x - cx, z - OVAL_CENTER_Z);
    return dist >= CORNER_RADIUS - INNER_RING_HALF_DEPTH - 0.3 && dist <= CORNER_RADIUS + INNER_RING_HALF_DEPTH + 0.3;
  }
  return false;
}

/**
 * Returns true if (x, z) is inside the walkable concentric Weilong Alley (围龙巷) between Inner and Outer rings.
 */
export function isInsideWeilongAlley(x: number, z: number): boolean {
  if (z > OVAL_CENTER_Z + 1.5) return false;
  const dIn = signedDistFromInnerEllipse(x, z);
  const dOut = signedDistFromOuterEllipse(x, z);
  return dIn > INNER_RING_HALF_DEPTH + 0.2 && dOut < -OUTER_RING_HALF_DEPTH - 0.2;
}

/**
 * Returns true if (x, z) is inside the Second Concentric Outer Weilong Ring (外围龙).
 */
export function isInsideOuterWeilong(x: number, z: number): boolean {
  if (z > OVAL_CENTER_Z + 2.2) return false;
  const dOut = signedDistFromOuterEllipse(x, z);
  return dOut >= -OUTER_RING_HALF_DEPTH - 0.3 && dOut <= OUTER_RING_HALF_DEPTH + 0.3;
}

/**
 * Continuous architectural floor / terrain elevation function groundHeightAt(x, z).
 * Faithful to Meizhou's "由南至北，步步高升" rising axis:
 * Pond (-0.5) -> He-Ping (0.0) -> Lower Hall (0.25) -> Front Skywell (0.15) ->
 * Middle Hall (0.45) -> Rear Skywell (0.35) -> Upper Hall (0.85) ->
 * Huatai sloping dome (0.90..1.85) -> Inner Weilong / Dragon Hall (1.95) ->
 * Weilong Alley (2.10) -> Outer Weilong Ring (2.68) -> Rear Forest Hill (3.1+).
 */
export function groundHeightAt(x: number, z: number, _currentY = 0): number {
  // Half-Moon Pond basin (South)
  if (isOnStoneJetty(x, z)) {
    const t = Math.max(0, Math.min(1, (z - 36.4) / 3.0));
    return -t * 0.38;
  }
  if (isInsidePond(x, z)) {
    return -0.65;
  }

  // Expansive He-Ping forecourt (South of front wall z = 21.8)
  if (z >= FRONT_WALL_OUTER_Z) {
    return 0.0;
  }

  // Front Straight Wing (下堂横长廊)
  if (z >= FRONT_WALL_INNER_Z && Math.abs(x) <= FRONT_STRAIGHT_HALF_W + 0.2) {
    return 0.25;
  }

  // Central Axis Three Halls & Twin Skywells
  if (Math.abs(x) <= 11.4 && z >= -5.6 && z < FRONT_WALL_INNER_Z) {
    if (z >= 10.6) return 0.15; // 前天井 (sunken four-waters skywell)
    if (z >= 5.4) return 0.45; // 中堂 (Middle Hall)
    if (z >= 0.2) return 0.35; // 后天井 (Rear Skywell)
    return 0.85; // 上堂 (Upper Hall raised granite dais)
  }

  // East & West Flanking Horizontal Wings (两横屋)
  if (Math.abs(x) > 11.4 && Math.abs(x) <= 18.6 && z >= -4.2 && z < FRONT_WALL_INNER_Z) {
    return 0.32;
  }

  // Inner Crescent Tianjie Courtyards (东西天街)
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

  // Wide Sun-Baked Semicircular Huatai Courtyard (化胎)
  if (isInsideHuatai(x, z)) {
    const northFrac = Math.max(0, Math.min(1, (-5.6 - z) / 14.8));
    const radialNorm = Math.min(1, Math.hypot(x / 24.0, (z + 8.5) / 15.0));
    const dome = Math.cos(radialNorm * Math.PI * 0.44) * 0.34;
    return 0.85 + northFrac * 0.88 + dome;
  }

  // Inner Weilong Ring (内围龙) including Dragon Hall at northern apex
  if (isInsideInnerWeilong(x, z)) {
    const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / INNER_RING_RZ));
    return 0.28 + northFactor * 1.65;
  }

  // Concentric Weilong Alley (围龙巷)
  if (isInsideWeilongAlley(x, z)) {
    const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / 36.8));
    return 0.45 + northFactor * 1.72;
  }

  // Second Concentric Outer Weilong Ring (外围龙)
  if (isInsideOuterWeilong(x, z)) {
    const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / OUTER_RING_RZ));
    return 0.72 + northFactor * 1.95;
  }

  // Rear & Side Lush Lingnan Forest Grounds outside Outer Ring
  const dOut = z <= OVAL_CENTER_Z ? signedDistFromOuterEllipse(x, z) : Math.max(0, Math.abs(x) - 31.5);
  if (z < OVAL_CENTER_Z && dOut > OUTER_RING_HALF_DEPTH) {
    const northFactor = Math.max(0, Math.min(1, (OVAL_CENTER_Z - z) / 48.0));
    const undul = Math.sin(x * 0.08) * 0.28 + Math.cos(z * 0.09) * 0.22;
    return 0.4 + northFactor * 2.55 + Math.min(3.0, Math.max(0, dOut - 3) * 0.08) + undul;
  }

  return Math.sin(x * 0.07) * 0.14;
}

/**
 * Classifies the 6 distinct architectural surface materials for the procedural footstep audio matrix.
 */
export function surfaceTypeAt(x: number, z: number, _y = 0): SurfaceType {
  if (isOnStoneJetty(x, z) || isInsidePond(x, z)) {
    return 'water_stone';
  }
  if (z >= FRONT_WALL_OUTER_Z && z < 36.6 && Math.abs(x) <= 35.0) {
    return 'courtyard';
  }
  if (isInsideHuatai(x, z)) {
    return 'cobble';
  }
  if (isInsideOuterWeilong(x, z)) {
    return 'wood_2f'; // Timber floorboards inside elevated Outer Weilong gallery & lookout
  }
  if (isInsideInnerWeilong(x, z) || isInsideWeilongAlley(x, z)) {
    return 'slate';
  }
  if (z < FRONT_WALL_OUTER_Z && Math.abs(x) <= 27.0 && z >= -5.8) {
    return 'slate';
  }
  return 'forest';
}

/**
 * Maps any 3D player position to one of the 24 authentic Meizhou Double-Weilongwu spaces.
 */
export function detectNodeIdAt(x: number, z: number, _y = 0): string {
  // South Outer Field
  if (z >= 36.0) return 'node_01_pond';
  if (z >= FRONT_WALL_OUTER_Z) return 'node_02_heping';

  // Front Straight Hall (下堂)
  if (z >= FRONT_WALL_INNER_Z && Math.abs(x) <= FRONT_STRAIGHT_HALF_W) {
    return 'node_03_xiatang';
  }

  // Central Axis: Front Skywell, Middle Hall, Rear Skywell, Upper Hall
  if (Math.abs(x) <= 11.4 && z >= -5.6 && z < FRONT_WALL_INNER_Z) {
    if (z >= 10.6) return 'node_04_front_skywell';
    if (z >= 5.4) return 'node_05_zhongtang';
    if (z >= 0.2) return 'node_06_rear_skywell';
    return 'node_07_shangtang';
  }

  // West Horizontal Wing (左横屋)
  if (x < -11.4 && x >= -18.8 && z >= -4.2 && z < FRONT_WALL_INNER_Z) {
    if (z >= 8.2) return 'node_08_bedroom';
    if (z >= 1.5) return 'node_10_well';
    return 'node_09_study';
  }

  // East Horizontal Wing (右横屋)
  if (x > 11.4 && x <= 18.8 && z >= -4.2 && z < FRONT_WALL_INNER_Z) {
    if (z >= 8.2) return 'node_11_kitchen';
    if (z >= 1.5) return 'node_13_poultry';
    return 'node_12_granary';
  }

  // Inner Crescent Tianjie Courtyards (天街)
  if (z >= -5.6 && z < FRONT_WALL_INNER_Z && !isInsideInnerWeilong(x, z) && !isInsideOuterWeilong(x, z) && !isInsideWeilongAlley(x, z)) {
    const dIn = z <= OVAL_CENTER_Z ? signedDistFromInnerEllipse(x, z) : -5;
    if (dIn < -INNER_RING_HALF_DEPTH) {
      return 'node_14_tianjie';
    }
  }

  // Sun-Baked Huatai Courtyard (化胎)
  if (isInsideHuatai(x, z)) {
    return 'node_17_huatai';
  }

  // Inner Weilong Ring (内围龙 — Dragon Hall & 5 Themed Wedge Rooms)
  if (isInsideInnerWeilong(x, z)) {
    const phiDeg = (Math.atan2(OVAL_CENTER_Z - z, x) * 180) / Math.PI; // 0 (East) -> 90 (North) -> 180 (West)
    if (phiDeg >= 78 && phiDeg <= 102) return 'node_19_dragon_hall';
    if (phiDeg > 134) return 'node_18e_daily';
    if (phiDeg > 118) return 'node_18a_weaving';
    if (phiDeg > 102) return 'node_18b_music';
    if (phiDeg >= 62) return 'node_18c_qiaopi';
    if (phiDeg >= 44) return 'node_18d_carpentry';
    return 'node_18e_daily';
  }

  // Concentric Weilong Alley (围龙巷) & Outer Weilong Ring (外围龙)
  if (isInsideWeilongAlley(x, z)) {
    return 'node_15_gallery';
  }
  if (isInsideOuterWeilong(x, z)) {
    if (x >= 8.0 && z <= -12.0) {
      return 'node_16_watchtower';
    }
    return 'node_15_gallery';
  }

  // Rear Fengshui Forest & Village Surroundings
  if (z < OVAL_CENTER_Z) {
    return 'node_20_forest';
  }

  return 'node_02_heping';
}

/**
 * Generates static wall colliders matching the 1:1 central halls, wings, and front facade.
 * Every single doorway, skywell arch, wing entry, and Huatai corridor has a generous open gap (>= 2.6m)
 * so the player can walk freely EVERYWHERE without ever hitting an invisible wall.
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

  // --- Front Straight Facade Wall at z = 21.65 (with 3 wide portals!) ---
  // Central recessed main portal: x in [-2.0, +2.0] (4.0m wide open!)
  // Left Doumen doorway (as in photo): x in [-17.4, -14.8] (2.6m wide, openable)
  // Right Doumen doorway: x in [+14.8, +17.4] (2.6m wide, toggles with Doumen bolt!)
  add('front_outer_w1', -19.6, -17.4, 21.4, 22.0);
  add('front_outer_w_door', -17.4, -14.8, 21.4, 22.0, { dynamicGate: 'doumen_west' });
  add('front_outer_w2', -14.8, -2.0, 21.4, 22.0);
  add('front_outer_e1', 2.0, 14.8, 21.4, 22.0);
  add('front_outer_e_door', 14.8, 17.4, 21.4, 22.0, { dynamicGate: 'doumen_east' });
  add('front_outer_e2', 17.4, 19.6, 21.4, 22.0);

  // --- Front Straight Wing Inner Wall at z = 16.55 (wide central & side exits!) ---
  // Central entry to Front Skywell: x in [-2.6, +2.6]
  // West Wing / Tianjie passage: x in [-18.5, -13.0]
  // East Wing / Tianjie passage: x in [+13.0, +18.5]
  add('front_inner_w', -12.8, -2.6, 16.3, 16.8);
  add('front_inner_e', 2.6, 12.8, 16.3, 16.8);

  // --- Front Skywell Flanking White Chambers (matching the 2 white boxes with square windows in photo!) ---
  // West Chamber: x in [-8.4, -5.4], z in [11.6, 15.6]
  add('skywell_chamber_w', -8.4, -5.4, 11.6, 15.6);
  // East Chamber: x in [+5.4, +8.4], z in [11.6, 15.6]
  add('skywell_chamber_e', 5.4, 8.4, 11.6, 15.6);

  // --- Central Axis Side Partition Walls (wide openings to West/East wings) ---
  // West central edge x = -11.4
  add('axis_w_mid', -11.65, -11.15, 7.6, 10.6);
  add('axis_w_rear', -11.65, -11.15, -2.5, 0.8);
  // East central edge x = +11.4
  add('axis_e_mid', 11.15, 11.65, 7.6, 10.6);
  add('axis_e_rear', 11.15, 11.65, -2.5, 0.8);

  // --- Upper Hall (上堂) Rear Ancestral Shrine Wall at z = -5.6 ---
  // Wide passages at x in [-11.4, -4.6] and [+4.6, +11.4] leading straight onto Huatai!
  add('shangtang_rear_altar', -4.4, 4.4, -5.9, -5.3);

  // --- West Horizontal Wing Outer Wall (x = -18.4, open doors at z=12, z=3, z=-2) ---
  add('west_wing_outer_1', -18.65, -18.15, 13.8, 16.4);
  add('west_wing_outer_2', -18.65, -18.15, 5.4, 10.0);
  add('west_wing_outer_3', -18.65, -18.15, -1.0, 1.4);
  // West wing internal dividers
  add('west_div_1', -18.2, -14.2, 8.0, 8.4);
  add('west_div_2', -18.2, -14.2, 1.2, 1.6);

  // --- East Horizontal Wing Outer Wall (x = +18.4, open doors at z=12, z=3, z=-2) ---
  add('east_wing_outer_1', 18.15, 18.65, 13.8, 16.4);
  add('east_wing_outer_2', 18.15, 18.65, 5.4, 10.0);
  add('east_wing_outer_3', 18.15, 18.65, -1.0, 1.4);
  // East wing internal dividers
  add('east_div_1', 14.2, 18.2, 8.0, 8.4);
  add('east_div_2', 14.2, 18.2, 1.2, 1.6);

  return walls;
}

const STATIC_WALLS = buildWallColliders();

/**
 * Checks whether an angular position (in degrees, 0=East, 90=North, 180=West)
 * aligns with an open archway/doorway through the Inner or Outer Weilong Rings.
 */
function isInnerRingOuterArch(phiDeg: number): boolean {
  // 4 wide open archways connecting Inner Weilong rooms out to the curved Weilong Alley (围龙巷):
  // West-SW (~162°), NW (~122°), NE (~58°), East-SE (~18°)
  return (
    Math.abs(phiDeg - 162) < 6.5 ||
    Math.abs(phiDeg - 122) < 6.5 ||
    Math.abs(phiDeg - 58) < 6.5 ||
    Math.abs(phiDeg - 18) < 6.5
  );
}

function isOuterRingRearGate(phiDeg: number): boolean {
  // Wide open rear forest gates at NNW (~108°) and NNE (~72°), plus open south ends (<0° or >180°)
  return (
    phiDeg < 2 ||
    phiDeg > 178 ||
    Math.abs(phiDeg - 108) < 6.5 ||
    Math.abs(phiDeg - 72) < 6.5
  );
}

/**
 * Resolves player free-walking movement against all walls, pond rim, and curved double Weilong walls
 * while guaranteeing every single courtyard, hall, wing, Huatai, Inner Ring room, Weilong Alley,
 * Outer Ring room, and Rear Fengshui Forest is smoothly walkable on foot.
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
  } else if (z > 48) {
    z = 48;
    collided = true;
  }

  // Half-Moon Pond water barrier (allow walking onto stone jetty up to z=39.4)
  if (isInsidePond(x, z) && !isOnStoneJetty(x, z)) {
    if (prevZ <= 39.2) {
      z = 38.75;
    } else {
      const dx = x / 16.2;
      const dz = (z - 38.6) / 10.8;
      const len = Math.hypot(dx, dz) || 1;
      x = (dx / len) * 16.4;
      z = 38.6 + (dz / len) * 11.0;
    }
    collided = true;
  }

  // Curved SW / SE rounded outer wall of Inner Ring (z in [OVAL_CENTER_Z, FRONT_WALL_OUTER_Z])
  if (z > OVAL_CENTER_Z && z <= FRONT_WALL_OUTER_Z + 0.5 && Math.abs(x) > FRONT_STRAIGHT_HALF_W) {
    const cx = x >= 0 ? FRONT_STRAIGHT_HALF_W : -FRONT_STRAIGHT_HALF_W;
    const dist = Math.hypot(x - cx, z - OVAL_CENTER_Z);
    const outerR = CORNER_RADIUS + INNER_RING_HALF_DEPTH;
    if (dist > outerR - 0.35 - playerRadius && dist < outerR + 0.35 + playerRadius) {
      const prevDist = Math.hypot(prevX - cx, prevZ - OVAL_CENTER_Z);
      const pushR = prevDist <= outerR ? outerR - 0.35 - playerRadius : outerR + 0.35 + playerRadius;
      const nx = (x - cx) / (dist || 1);
      const nz = (z - OVAL_CENTER_Z) / (dist || 1);
      x = cx + nx * pushR;
      z = OVAL_CENTER_Z + nz * pushR;
      collided = true;
    }
  }

  // Curved Northern Inner Weilong Outer Wall (with 4 wide open archways to Weilong Alley!)
  if (z <= OVAL_CENTER_Z) {
    const phiDeg = (Math.atan2(OVAL_CENTER_Z - z, x) * 180) / Math.PI;
    const dIn = signedDistFromInnerEllipse(x, z);
    if (!isInnerRingOuterArch(phiDeg)) {
      const wallMin = INNER_RING_HALF_DEPTH - 0.3;
      const wallMax = INNER_RING_HALF_DEPTH + 0.35;
      if (dIn > wallMin - playerRadius && dIn < wallMax + playerRadius) {
        const prevD = signedDistFromInnerEllipse(prevX, prevZ);
        const targetD = prevD <= INNER_RING_HALF_DEPTH ? wallMin - playerRadius : wallMax + playerRadius;
        const delta = targetD - dIn;
        const gx = x / (INNER_RING_RX * INNER_RING_RX);
        const gz = (z - OVAL_CENTER_Z) / (INNER_RING_RZ * INNER_RING_RZ);
        const glen = Math.hypot(gx, gz) || 1;
        x += (gx / glen) * delta;
        z += (gz / glen) * delta;
        collided = true;
      }
    }

    // Curved Northern Outer Weilong Outer Wall (with wide open rear gates to Fengshui Forest!)
    const dOut = signedDistFromOuterEllipse(x, z);
    if (!isOuterRingRearGate(phiDeg)) {
      const wallMin = OUTER_RING_HALF_DEPTH - 0.3;
      const wallMax = OUTER_RING_HALF_DEPTH + 0.38;
      if (dOut > wallMin - playerRadius && dOut < wallMax + playerRadius) {
        const prevD = signedDistFromOuterEllipse(prevX, prevZ);
        const targetD = prevD <= OUTER_RING_HALF_DEPTH ? wallMin - playerRadius : wallMax + playerRadius;
        const delta = targetD - dOut;
        const gx = x / (OUTER_RING_RX * OUTER_RING_RX);
        const gz = (z - OVAL_CENTER_Z) / (OUTER_RING_RZ * OUTER_RING_RZ);
        const glen = Math.hypot(gx, gz) || 1;
        x += (gx / glen) * delta;
        z += (gz / glen) * delta;
        collided = true;
      }
    }
  }

  // AABB static & dynamic wall colliders
  for (const w of STATIC_WALLS) {
    if (w.dynamicGate && doumenOpen) continue;
    const closestX = Math.max(w.minX, Math.min(x, w.maxX));
    const closestZ = Math.max(w.minZ, Math.min(z, w.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < playerRadius * playerRadius) {
      collided = true;
      if (distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const overlap = playerRadius - dist;
        x += (dx / dist) * overlap;
        z += (dz / dist) * overlap;
      } else {
        const penLeft = Math.abs(x - w.minX);
        const penRight = Math.abs(w.maxX - x);
        const penTop = Math.abs(z - w.minZ);
        const penBot = Math.abs(w.maxZ - z);
        const minPen = Math.min(penLeft, penRight, penTop, penBot);
        if (minPen === penLeft) x = w.minX - playerRadius;
        else if (minPen === penRight) x = w.maxX + playerRadius;
        else if (minPen === penTop) z = w.minZ - playerRadius;
        else z = w.maxZ + playerRadius;
      }
    }
  }

  // Detect crossing the 25cm high wooden threshold at 下堂 central main portal (z = 21.7)
  const crossedThreshold =
    Math.abs(x) <= 2.2 &&
    ((prevZ > FRONT_WALL_OUTER_Z - 0.1 && z <= FRONT_WALL_OUTER_Z - 0.1) ||
      (prevZ <= FRONT_WALL_OUTER_Z - 0.1 && z > FRONT_WALL_OUTER_Z - 0.1));

  const y = groundHeightAt(x, z, currentY);
  return { x, z, y, collided, crossedThreshold };
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
