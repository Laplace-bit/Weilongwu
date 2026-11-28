import type { WeatherMode } from '../types/game';
import {
  AvianSongDirector,
  CHINESE_HWAMEI_PROFILE,
  SOUND_SPEED_AVIAN_MPS,
  evaluatePasserineCircadianSchedule,
  solveAvianOec,
  solveAvianTension,
  type AvianAnimCue,
  type AvianDirectorFrame,
  type AvianMotifArchetype,
  type AvianOrganSpec,
  type AvianSyrinxFrame,
  type CircadianVocalSchedule,
} from './avianSongArchitecture';

// Re-export the full general-purpose bio-acoustic birdsong architecture for reuse across scenes
export {
  AvianRepertoireGrammar,
  AvianSongDirector,
  CHINESE_HWAMEI_PROFILE,
  LINGNAN_BULBUL_PROFILE,
  MOUNTAIN_THRUSH_PROFILE,
  MotifMutator,
  PitchContourEvaluator,
  SOUND_SPEED_AVIAN_MPS,
  solveAvianOec,
  solveAvianTension,
  type AvianAnimCue,
  type AvianDirectorFrame,
  type AvianMood,
  type AvianMotif,
  type AvianMotifArchetype,
  type AvianOrganSpec,
  type AvianSpeciesVocalProfile,
  type AvianSyllable,
  type AvianSyrinxFrame,
  type CircadianVocalSchedule,
  type MotifTransformKind,
  type PitchKeyframe,
  type SyllableOrnament,
  type SyllableOrnamentKind,
} from './avianSongArchitecture';

export type HwameiOrganSpec = AvianOrganSpec;
export type SyrinxMotorParams = AvianSyrinxFrame;
export type HwameiAnimState = AvianAnimCue;
export type HwameiFrameOutput = AvianDirectorFrame;
export type HwameiMotifKind = AvianMotifArchetype;

export const HWAMEI_ORGAN: HwameiOrganSpec = CHINESE_HWAMEI_PROFILE.organ;

export interface CircadianActivityProfile {
  activity: number;
  isSleeping: boolean;
  pauseMinSec: number;
  pauseMaxSec: number;
  phrasesMin: number;
  phrasesMax: number;
  vigor: number;
}

export function solveSpeciesTension(
  targetFreqHz: number,
  branch: 'L' | 'R',
  organ: HwameiOrganSpec = HWAMEI_ORGAN,
  mtmStretch = 0.90,
  pSubEst = 1.65,
  gapEst = 0.080
): number {
  return solveAvianTension(targetFreqHz, branch, organ, mtmStretch, pSubEst, gapEst);
}

export function solveSpeciesOec(
  targetFreqHz: number,
  organ: HwameiOrganSpec = HWAMEI_ORGAN
): { oecVolMl: number; beakGapeMm: number } {
  return solveAvianOec(targetFreqHz, organ);
}

export function evaluateHwameiCircadianActivity(
  timeOfDay: number,
  weather: WeatherMode
): CircadianActivityProfile {
  const s: CircadianVocalSchedule = evaluatePasserineCircadianSchedule(timeOfDay, weather);
  return {
    activity: s.activity,
    isSleeping: s.isSleeping,
    pauseMinSec: s.pauseMinSec,
    pauseMaxSec: s.pauseMaxSec,
    phrasesMin: s.motifsMin,
    phrasesMax: s.motifsMax,
    vigor: s.vigor,
  };
}

/**
 * Chinese Hwamei (画眉鸟) vocal controller powered by the reusable `AvianSongDirector`
 * and `CHINESE_HWAMEI_PROFILE`.
 */
export class HwameiSongController extends AvianSongDirector {
  constructor(options?: { seed?: number; initialDelaySec?: number }) {
    super(CHINESE_HWAMEI_PROFILE, options);
  }
}
