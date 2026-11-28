import {
  OVAL_CENTER_Z,
  INNER_RING_RX,
  INNER_RING_RZ,
  OUTER_RING_RX,
  OUTER_RING_RZ,
  sampleInnerWeilongCurve,
} from './worldMath';

/**
 * Exact concave catenary roof slope height (反宇举折) matching architectureBuilder.ts.
 * f = 0 is eave edge, f = 1 is ridge apex.
 */
export function computeGableSlopeY(
  eaveY: number,
  ridgeY: number,
  f: number,
  sag = 0.22
): number {
  const clamped = Math.max(0, Math.min(1, f));
  const eaveLift = clamped === 0 ? 0.035 : 0;
  return (
    eaveY +
    (ridgeY - eaveY) * clamped -
    sag * Math.sin(clamped * Math.PI) * (1.0 - 0.16 * clamped) +
    eaveLift
  );
}

/**
 * Computes the world Y of the lantern group center so its top hanging hook/cord
 * meets `anchorY` cleanly with zero floating gap and zero roof penetration.
 * Matches createCraftedLantern() geometry: top collar is at local +0.26,
 * cord + brass hook terminates at local +(0.26 + cordLen).
 */
export function computeLanternCenterY(
  anchorY: number,
  scale: number,
  cordLen: number
): number {
  return anchorY - (0.26 + cordLen) * scale;
}

/**
 * Computes the exact top world Y of a lantern's hanging cord/hook given its center Y.
 */
export function computeLanternTopY(
  centerY: number,
  scale: number,
  cordLen: number
): number {
  return centerY + (0.26 + cordLen) * scale;
}

/**
 * Computes an exact under-eave hanging anchor along the Inner Weilong Ring inner slope
 * (at the inner eave purlin fP = 0.14 between inner eave and ridge).
 */
export function computeInnerWeilongLanternAnchor(t: number): {
  x: number;
  y: number;
  z: number;
  eaveX: number;
  eaveZ: number;
  eaveY: number;
} {
  const s = sampleInnerWeilongCurve(t);
  const halfDepth = 2.6;
  const overhang = 0.62;
  const wallHeight = 3.15;
  const ridgeHeight = 5.42;
  const eaveInX = s.x - s.nx * (halfDepth + overhang);
  const eaveInZ = s.z - s.nz * (halfDepth + overhang);
  const eaveInY = s.yBase + wallHeight - 0.12;
  const ridgeY = s.yBase + ridgeHeight;
  const fP = 0.14;
  const ringSag = 0.20;
  const px = eaveInX + (s.x - eaveInX) * fP;
  const pz = eaveInZ + (s.z - eaveInZ) * fP;
  const sagVal = -ringSag * Math.sin(fP * Math.PI) * (1.0 - 0.16 * fP);
  // Bottom edge of the inner eave purlin (purlin center is at slopeY - 0.16, height 0.14 => bottom -0.22)
  const purlinBottomY = eaveInY + (ridgeY - eaveInY) * fP + sagVal - 0.22;
  return {
    x: px,
    y: purlinBottomY,
    z: pz,
    eaveX: eaveInX,
    eaveZ: eaveInZ,
    eaveY: eaveInY,
  };
}

/**
 * Analytical test: returns true if world position (x, z) lies underneath any roof
 * of the Double-Weilongwu compound (used to cull rain streaks indoors and keep
 * indoor hall floors dry while open skywells, courtyards, and pond receive rain).
 */
export function isUnderRoof(x: number, z: number): boolean {
  const ax = Math.abs(x);

  // 1. Front Wing (下堂 / 门楼): length=40, cz=19.15, span=5.25, overhang=0.68 -> halfS=3.305
  if (ax <= 20.34 && z >= 15.84 && z <= 22.46) return true;

  // 2. Middle Hall (中堂): length=21.2, cz=7.95, span=5.8, overhang=0.68 -> halfS=3.58
  if (ax <= 10.94 && z >= 4.37 && z <= 11.53) return true;

  // 3. Upper Hall (上堂 / 祖堂): length=25.2, cz=-2.7, span=6.9, overhang=0.68 -> halfS=4.13
  if (ax <= 12.94 && z >= -6.83 && z <= 1.43) return true;

  // 4. Front Skywell flanking chambers (下廊厢房): extended eaves reach x = ±4.85
  if (ax >= 4.85 && ax <= 10.82 && z >= 10.5 && z <= 16.7) return true;

  // 5. Rear Skywell flanking chambers (上廊厢房): x = ±5.0..10.8, z = 0.0..5.7
  if (ax >= 5.0 && ax <= 10.8 && z >= -0.05 && z <= 5.75) return true;

  // 6. Inner East & West Longitudinal Wings (内横屋): cx=±13.3, cz=6.4, length=24.8, span=4.8, overhang=0.58 -> halfS=2.98
  if (ax >= 10.32 && ax <= 16.28 && z >= -6.3 && z <= 19.1) return true;

  // 7. Outer East & West Longitudinal Wings (外横屋): cx=±18.6, cz=6.4, length=24.8, span=4.8, overhang=0.58
  if (ax >= 15.62 && ax <= 21.58 && z >= -6.3 && z <= 19.1) return true;

  // 8. Curved Inner & Outer Weilong Rings (第一、二层半圆形围龙屋, north of z ≈ 9.65)
  if (z <= OVAL_CENTER_Z + 0.8) {
    const dz = OVAL_CENTER_Z - z;
    // Normalized radial distance against Inner Ring ellipse
    const rIn = Math.hypot(x / INNER_RING_RX, dz / INNER_RING_RZ);
    // halfDepth=2.6 + overhang=0.62 = 3.22m on ~27m radius => ~0.118 band
    if (rIn >= 0.88 && rIn <= 1.13) return true;

    // Normalized radial distance against Outer Ring ellipse
    const rOut = Math.hypot(x / OUTER_RING_RX, dz / OUTER_RING_RZ);
    // halfDepth=2.7 + overhang=0.62 = 3.32m on ~34m radius => ~0.098 band
    if (rOut >= 0.90 && rOut <= 1.11) return true;
  }

  return false;
}

/**
 * Calibrated runoff parameters proportional to rainfall intensity (0..1).
 * Ensures roof rivulets and eave drips remain restrained and physically proportional
 * rather than heavier than the falling rain itself.
 */
export interface RunoffCalibration {
  /** Multiplier for shader tile-valley rivulet highlight (subtle 0..0.14) */
  roofStreamStrength: number;
  /** Opacity multiplier for intermittent eave droplet curtains (0..0.34) */
  eaveCurtainAlpha: number;
  /** Opacity multiplier for ground drip splash rings (0..0.46) */
  dripSplashAlpha: number;
  /** Surface water-film clearcoat/wetness on outdoor stone & earth (0..0.72) */
  groundWetness: number;
  /** Subtle flowing sheen inside skywell drainage gutters (0..0.62) */
  drainGutterFlow: number;
}

export function computeRunoffCalibration(rainIntensity: number): RunoffCalibration {
  const r = Math.max(0, Math.min(1, rainIntensity));
  // Nonlinear runoff response: light rain produces minimal rivulets; steady rain produces calm balanced runoff
  const curved = Math.pow(r, 1.25);
  return {
    roofStreamStrength: curved * 0.13,
    eaveCurtainAlpha: curved * 0.34,
    dripSplashAlpha: curved * 0.46,
    groundWetness: Math.pow(r, 0.85) * 0.72,
    drainGutterFlow: curved * 0.62,
  };
}

/**
 * Natural double-pulse intra-cloud sheet lightning intensity envelope (0..1).
 * Duration is ~0.42s: quick bright rise, brief trough, secondary restrike pulse, soft decay.
 */
export function computeLightningEnvelope(elapsedSec: number): number {
  if (elapsedSec < 0 || elapsedSec > 0.46) return 0;
  // Primary pulse peaks around 0.045s
  const p1 = Math.exp(-Math.pow((elapsedSec - 0.045) / 0.038, 2));
  // Secondary intra-cloud flicker peaks around 0.165s
  const p2 = 0.68 * Math.exp(-Math.pow((elapsedSec - 0.165) / 0.055, 2));
  // Soft trailing cloud-scatter glow
  const tail = 0.22 * Math.exp(-Math.pow((elapsedSec - 0.27) / 0.095, 2));
  return Math.max(0, Math.min(1, p1 + p2 + tail));
}

/**
 * Physical speed-of-sound delay in seconds between lightning flash and thunder arrival (~343 m/s).
 * Clamped to a pleasant theatrical range [0.9s, 4.2s].
 */
export function computeThunderDelaySec(distanceMeters: number): number {
  const speedOfSound = 343;
  const raw = Math.max(0, distanceMeters) / speedOfSound;
  return Math.max(0.9, Math.min(4.2, raw));
}
