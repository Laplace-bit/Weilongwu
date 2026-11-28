import {
  buildCurvedRingWallSegments,
  buildWallColliders,
  type Aabb2D,
  type OrientedSegment2D,
} from './worldMath';
import { isUnderRoof } from './weatherPhysics';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface SpatialAcousticParams {
  /** Euclidean 3D distance from birdcage to listener in meters */
  distance: number;
  /** Number of solid architectural walls intersected between source and listener */
  wallCrossings: number;
  /** Final direct-path acoustic gain in [0, 1] */
  directGain: number;
  /** Courtyard / architectural reverberation send gain in [0, 1] */
  reverbSend: number;
  /** Combined air-absorption + wall-occlusion lowpass cutoff in Hz */
  lowpassHz: number;
  /** Stereo pan in [-1, +1] (-1 = left ear, +1 = right ear) */
  pan: number;
  /** True when listener is close enough for audio to be audible */
  audible: boolean;
}

const ACOUSTIC_WALLS: Aabb2D[] = buildWallColliders().filter((w) => !w.id.startsWith('prop_'));
const ACOUSTIC_CURVED_WALLS: OrientedSegment2D[] = buildCurvedRingWallSegments();

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function segmentIntersectsAabb2D(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tmin = 0;
  let tmax = 1;

  if (Math.abs(dx) < 1e-8) {
    if (x0 < minX || x0 > maxX) return false;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - x0) * inv;
    let t2 = (maxX - x0) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  if (Math.abs(dz) < 1e-8) {
    if (z0 < minZ || z0 > maxZ) return false;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - z0) * inv;
    let t2 = (maxZ - z0) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  return tmax >= 0.01 && tmin <= 0.99;
}

function segmentsIntersect2D(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): boolean {
  const rX = x1 - x0;
  const rZ = z1 - z0;
  const sX = bx - ax;
  const sZ = bz - az;
  const denom = rX * sZ - rZ * sX;
  if (Math.abs(denom) < 1e-8) return false;
  const qX = ax - x0;
  const qZ = az - z0;
  const t = (qX * sZ - qZ * sX) / denom;
  const u = (qX * rZ - qZ * rX) / denom;
  return t > 0.01 && t < 0.99 && u >= 0 && u <= 1;
}

/**
 * Counts how many solid architectural masonry walls / curved Weilong partitions
 * lie along the horizontal line of sight between source (birdcage) and listener.
 * Respects open/closed Doumen gates dynamically!
 */
export function countAcousticWallCrossings(
  sx: number,
  sz: number,
  lx: number,
  lz: number,
  doumenOpen: boolean
): number {
  const dist2D = Math.hypot(lx - sx, lz - sz);
  if (dist2D < 0.25) return 0;

  let hits = 0;

  for (let i = 0; i < ACOUSTIC_WALLS.length; i++) {
    const w = ACOUSTIC_WALLS[i];
    if (w.dynamicGate && doumenOpen) continue;
    if (segmentIntersectsAabb2D(sx, sz, lx, lz, w.minX, w.maxX, w.minZ, w.maxZ)) {
      hits += 1;
      if (hits >= 4) return hits;
    }
  }

  for (let i = 0; i < ACOUSTIC_CURVED_WALLS.length; i++) {
    const seg = ACOUSTIC_CURVED_WALLS[i];
    if (segmentsIntersect2D(sx, sz, lx, lz, seg.ax, seg.az, seg.bx, seg.bz)) {
      hits += 1;
      if (hits >= 4) return hits;
    }
  }

  return hits;
}

/**
 * Physically grounded 3D sound propagation model for the courtyard Hwamei birdcage:
 * - Inverse-distance spherical spreading with smooth near-field saturation & far-field rolloff
 * - Atmospheric high-frequency air absorption proportional to distance
 * - Architectural wall occlusion & courtyard diffraction (sound still bends gently over the open skywell!)
 * - Listener stereo panning & subtle behind-head pinna high-frequency shadowing
 * - Distance- and enclosure-aware dry/wet courtyard reverberation balance
 */
export function computeHwameiSpatialAcoustics(
  sourcePos: Vec3Like,
  listenerPos: Vec3Like,
  listenerForward: Vec3Like,
  listenerRight: Vec3Like,
  options?: { doumenOpen?: boolean; maxAudibleDist?: number }
): SpatialAcousticParams {
  const doumenOpen = options?.doumenOpen ?? false;
  const maxDist = options?.maxAudibleDist ?? 78.0;

  const dx = sourcePos.x - listenerPos.x;
  const dy = sourcePos.y - listenerPos.y;
  const dz = sourcePos.z - listenerPos.z;
  const distance = Math.hypot(dx, dy, dz);

  if (distance >= maxDist) {
    return {
      distance,
      wallCrossings: 0,
      directGain: 0,
      reverbSend: 0,
      lowpassHz: 1400,
      pan: 0,
      audible: false,
    };
  }

  // 1. Physical spherical-spreading distance attenuation (refDist = 1.9m)
  // Near cage (<=1.8m): ~0.88–1.00; Across Front Skywell (~6m): ~0.46;
  // Middle Hall / He-Ping (~15m): ~0.21; Pond / Huatai (~32m): ~0.08
  const refDist = 1.9;
  const rolloffExp = 1.12;
  const invDistGain = 1.0 / (1.0 + Math.pow(Math.max(0, distance - 0.55) / refDist, rolloffExp));

  // Smooth fade-out approaching maxDist so sound never clips out abruptly
  const farFade =
    distance > maxDist * 0.72
      ? clamp(1.0 - (distance - maxDist * 0.72) / (maxDist * 0.28), 0, 1)
      : 1.0;

  // 2. Architectural masonry wall crossings & roof diffraction
  const wallCrossings = countAcousticWallCrossings(
    sourcePos.x,
    sourcePos.z,
    listenerPos.x,
    listenerPos.z,
    doumenOpen
  );
  // Open-skywell acoustic diffraction allows some sound to spill over/around 1 wall (~0.58x),
  // whereas 2–3+ masonry walls dampen strongly (~0.34x, 0.21x).
  const wallAtten =
    wallCrossings === 0
      ? 1.0
      : wallCrossings === 1
      ? 0.58
      : wallCrossings === 2
      ? 0.34
      : 0.20;

  // High vertical separation (e.g. aerial camera high above eaves) softens wall occlusion slightly
  const aerialRelief = listenerPos.y > 7.0 ? clamp((listenerPos.y - 7.0) / 14.0, 0, 0.65) : 0;
  const effectiveWallAtten = wallAtten + (1.0 - wallAtten) * aerialRelief;

  // 3. Stereo panning & behind-head pinna shadowing
  let pan = 0;
  let headShadowFactor = 1.0;
  if (distance > 1e-4) {
    const invD = 1.0 / distance;
    const dirX = dx * invD;
    const dirY = dy * invD;
    const dirZ = dz * invD;

    const rightLen = Math.hypot(listenerRight.x, listenerRight.y, listenerRight.z) || 1;
    const fwdLen = Math.hypot(listenerForward.x, listenerForward.y, listenerForward.z) || 1;
    const dotRight =
      (dirX * listenerRight.x + dirY * listenerRight.y + dirZ * listenerRight.z) / rightLen;
    const dotForward =
      (dirX * listenerForward.x + dirY * listenerForward.y + dirZ * listenerForward.z) / fwdLen;

    // Soften pan when extremely close (<1.3m) so standing right under the cage feels natural
    const nearPanWeight = clamp((distance - 0.25) / 1.15, 0, 1);
    pan = clamp(dotRight * 0.88 * nearPanWeight, -0.88, 0.88);

    // Subtle pinna high-frequency & level shadowing when sound comes from behind listener
    const behind01 = clamp(-dotForward, 0, 1);
    headShadowFactor = 1.0 - 0.14 * behind01;
  }

  // 4. Atmospheric high-frequency air absorption + wall muffling lowpass cutoff
  // Air absorbs treble over distance: 11.8 kHz at 1m -> ~2.1 kHz at 60m
  const airLowpassHz = 1800 + 10000 * Math.exp(-distance / 24.0);
  const wallLowpassScale =
    wallCrossings === 0
      ? 1.0
      : wallCrossings === 1
      ? 0.56 + 0.34 * aerialRelief
      : wallCrossings === 2
      ? 0.36 + 0.42 * aerialRelief
      : 0.25 + 0.45 * aerialRelief;
  const lowpassHz = clamp(
    airLowpassHz * wallLowpassScale * (0.86 + 0.14 * headShadowFactor),
    1150,
    12200
  );

  // 5. Dry/Wet courtyard reflection balance
  // Up close: crisp direct sound with light veranda reflection.
  // Across the stone skywell / around courtyard walls: richer stone-and-eave reverb tail!
  const directGain = clamp(invDistGain * effectiveWallAtten * headShadowFactor * farFade, 0, 1);
  const listenerIndoors = isUnderRoof(listenerPos.x, listenerPos.z);
  const distWetRatio = clamp((distance - 1.2) / 14.0, 0.12, 0.72);
  const occlusionWetBoost = wallCrossings > 0 ? 0.20 : 0.0;
  const enclosureBoost = listenerIndoors ? 0.10 : 0.0;
  const reverbSend = clamp(
    invDistGain *
      farFade *
      (0.24 + distWetRatio * 0.58 + occlusionWetBoost + enclosureBoost) *
      (wallCrossings >= 2 ? 0.62 : 0.92),
    0,
    0.85
  );

  return {
    distance,
    wallCrossings,
    directGain,
    reverbSend,
    lowpassHz,
    pan,
    audible: directGain + reverbSend > 0.004,
  };
}
