import type { Vec3, WaterfowlLocomotionMode, WeatherType } from '../types';

export interface HeadLookAtResult {
  yaw: number;
  pitch: number;
  active: boolean;
}

export interface WaterfowlPoseResult {
  yOffset: number;
  rollZ: number;
  neckPitchX: number;
  wakeVisible: boolean;
  wakeScale: number;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Pure procedural animation & locomotion rig helpers shared across T1/T2/T3
 * actors. Keeps rain-only umbrella discipline, LookAt neck/head constraints,
 * and waterfowl waddle-vs-swim animation completely deterministic and testable.
 */
export const LocomotionRig = {
  /**
   * Enforces the rain-only umbrella invariant:
   * Umbrellas NEVER stay open in sunny weather or once the villager is indoors/sheltered.
   */
  shouldOpenUmbrella(
    weather: WeatherType,
    isSheltered: boolean,
    atHomeBlend: number,
    hasUmbrella: boolean
  ): boolean {
    if (!hasUmbrella) return false;
    if (weather !== 'rain') return false;
    if (isSheltered || atHomeBlend >= 0.85) return false;
    return true;
  },

  /**
   * Computes bounded relative head yaw & pitch for looking at a world target
   * (e.g. caged Hwamei singing overhead, approaching player, or watchtower gong).
   */
  computeHeadLookAt(
    actorPos: Vec3,
    actorBodyYaw: number,
    eyeHeight: number,
    target: Vec3 | null | undefined,
    maxYawRad = 1.05,
    maxPitchRad = 0.58
  ): HeadLookAtResult {
    if (!target) {
      return { yaw: 0, pitch: 0, active: false };
    }
    const dx = target.x - actorPos.x;
    const dz = target.z - actorPos.z;
    const horizDist = Math.hypot(dx, dz);
    if (horizDist < 0.08) {
      return { yaw: 0, pitch: 0, active: false };
    }
    const worldYaw = Math.atan2(dx, dz);
    const relYaw = wrapAngle(worldYaw - actorBodyYaw);
    // Only turn head if target is within natural human peripheral arc (~135 deg)
    if (Math.abs(relYaw) > 2.35) {
      return { yaw: 0, pitch: 0, active: false };
    }
    const dy = target.y - (actorPos.y + eyeHeight);
    // Negative X rotation tilts Three.js head upward
    const rawPitch = -Math.atan2(dy, horizDist);
    return {
      yaw: clamp(relYaw, -maxYawRad, maxYawRad),
      pitch: clamp(rawPitch, -maxPitchRad, maxPitchRad),
      active: true,
    };
  },

  /**
   * Amphibian waterfowl animation rig:
   * - `waddle`: shore walking with lateral duck/goose body roll & hidden water wake
   * - `swim`: buoyant pond bobbing + expanding water wake ring + occasional water dip
   * - `nest`: tucked restful neck inside shoreline reed nest
   */
  computeWaterfowlPose(
    mode: WaterfowlLocomotionMode,
    timeSec: number,
    phaseOffset: number,
    speed: number
  ): WaterfowlPoseResult {
    if (mode === 'nest') {
      return {
        yOffset: 0.04 + Math.sin(timeSec * 1.1 + phaseOffset * 3) * 0.008,
        rollZ: 0,
        neckPitchX: 0.28 + Math.sin(timeSec * 0.8 + phaseOffset) * 0.04,
        wakeVisible: false,
        wakeScale: 0.45,
      };
    }

    if (mode === 'waddle') {
      const moveFactor = clamp(speed / 0.85, 0.2, 1.2);
      const stride = timeSec * 5.8 * moveFactor + phaseOffset * 6;
      return {
        yOffset: Math.abs(Math.sin(stride)) * 0.032 * moveFactor,
        rollZ: Math.sin(stride) * 0.14 * moveFactor,
        neckPitchX: 0.08 + Math.sin(stride * 2) * 0.06,
        wakeVisible: false,
        wakeScale: 0.4,
      };
    }

    // Swim mode on pond water
    const dip = Math.max(0, Math.sin(timeSec * 1.15 + phaseOffset * 5) - 0.75) * 1.45;
    const wCycle = (timeSec * 0.55 + phaseOffset) % 1;
    return {
      yOffset: Math.sin(timeSec * 2.6 + phaseOffset * 3) * 0.024,
      rollZ: Math.sin(timeSec * 2.1 + phaseOffset * 2) * 0.035,
      neckPitchX: dip * 0.45,
      wakeVisible: true,
      wakeScale: 0.85 + wCycle * 1.35,
    };
  },
};
