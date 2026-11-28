import type { WeatherMode } from '../types/game';

/**
 * Physical speed of sound in water-saturated avian air-sac gas (41°C, 4.5% CO2, 100% RH),
 * matching `syrinx-worklet.js` and `birdsong-presets.js` from songbird-syrinx.
 */
export const SOUND_SPEED_AVIAN_MPS = 356.0;

// ============================================================================
// 1. CORE BIO-ACOUSTIC DATA STRUCTURES (SPECIES-AGNOSTIC)
// ============================================================================

/**
 * Physical morphometry of an avian syrinx & vocal tract, mapped 1:1 to `SyrinxProcessor`.
 */
export interface AvianOrganSpec {
  readonly id: string;
  readonly name: string;
  readonly latin: string;
  readonly bodyMassG: number;
  readonly tracheaLenMm: number;
  readonly trachDiamMm: number;
  readonly massLMg: number;
  readonly massRMg: number;
  readonly stiffLK0: number;
  readonly stiffRK0: number;
  readonly gammaL: number;
  readonly gammaR: number;
  readonly labialThickMmL: number;
  readonly labialThickMmR: number;
  readonly asymRestL: number;
  readonly asymRestR: number;
  readonly oecNeckMm: number;
  readonly restOecMl: number;
  readonly minSongOecMl: number;
  readonly maxSongOecMl: number;
  readonly beakGapeScale: number;
  readonly restBeakMm: number;
  readonly restMtmL: number;
  readonly restMtmR: number;
  readonly restGapL: number;
  readonly restGapR: number;
  readonly tractCoupling: number;
  readonly hornPickup: number;
  readonly hasBronchidesmus: number;
  readonly leftGain: number;
  readonly rightGain: number;
}

export type AvianVoiceChannel = 'auto' | 'left' | 'right' | 'duet';

export type SyllableOrnamentKind =
  | 'none'
  | 'flute_vibrato'    // Smooth delayed singing vibrato bloom (婉转吟揉)
  | 'liquid_warble'    // Sinous medium-fast brook warble (流水啭鸣)
  | 'sparkle_trill'    // Crisp rapid high trill with amplitude shimmer (清脆花舌颤音)
  | 'water_bubble'     // Downward-curved liquid water-drop modulation (滚珠水泡音)
  | 'mordent_turn'     // Quick graceful musical turn / mordent ornament (回音装饰)
  | 'grace_scoop';     // Fast crisp acciaccatura pickup scoop into main tone (灵动倚音)

export interface SyllableOrnament {
  kind: SyllableOrnamentKind;
  rateHz: number;       // Modulation frequency (Hz)
  depthRatio: number;   // Pitch excursion fraction (e.g., 0.03 = ±3%)
  delayFrac: number;    // 0..1 normalized onset delay (e.g., late vibrato bloom)
  ampPulse: number;     // 0..0.65 amplitude pulsation coupled to ornament
}

/**
 * Single control point along a continuous syllable pitch & dynamics trajectory.
 */
export interface PitchKeyframe {
  /** Normalized syllable time in [0, 1] */
  t: number;
  /** Frequency multiplier relative to the syllable's root Hz (e.g., 1.0 -> 1.38 -> 1.12) */
  ratio: number;
  /** Optional relative vocal energy weight in [0.15, 1.25] */
  energy?: number;
}

/**
 * Atomic continuous vocal element sung on a single expiratory gesture.
 */
export interface AvianSyllable {
  /** Duration of phonation in seconds */
  durationSec: number;
  /** Silent articulatory separation before next syllable in seconds */
  gapAfterSec: number;
  /** Reference pitch in Hz (multiplied by keyframe ratios) */
  rootHz: number;
  /** Smooth melodic pitch spline keyframes (2–7 points, evaluated with Catmull-Rom) */
  contour: PitchKeyframe[];
  /** Optional second-voice harmonic ratio (for true two-voice oscine syrinx duets) */
  harmonyRatio?: number;
  /** Optional delay [0..0.6] before second voice enters during a biphonic bloom */
  harmonyEntryFrac?: number;
  /** Voice routing: auto L/R handoff, left contralto, right soprano, or dual-bronchus duet */
  voice: AvianVoiceChannel;
  /** Normalized vocal intensity (0.4..1.18) */
  intensity: number;
  /** Vocal timbre clarity / MTM stretch offset (-0.06..+0.08) */
  timbreBright: number;
  /** Expressive melodic ornament layer */
  ornament: SyllableOrnament;
  /** True if this gap is an active sub-atmospheric inspiratory mini-breath */
  miniBreathAfter: boolean;
}

export type AvianPhraseCategory =
  | 'intro'
  | 'lyrical'
  | 'warble'
  | 'call'
  | 'cascade'
  | 'trill'
  | 'duet'
  | 'coda';

export type AvianMotifArchetype =
  | 'grace_chirp'
  | 'flute_arch'
  | 'double_call'
  | 'liquid_warble'
  | 'sparkle_trill'
  | 'biphonic_flourish'
  | 'cascading_run'
  | 'rising_salute'
  | 'lyrical_flute_scoop'
  | 'nightingale_crescendo'
  | 'huamei_signature_call'
  | 'pentatonic_melisma'
  | 'question_answer_duet'
  | 'pearl_cascade'
  | 'silky_trill_bloom'
  | 'sighing_glissando'
  | 'water_bubble_roll'
  | 'whisper_subsong'
  | 'ornate_coda';

/**
 * Coherent musical figure made of 1–7 syllables.
 */
export interface AvianMotif {
  archetype: AvianMotifArchetype;
  category: AvianPhraseCategory;
  syllables: AvianSyllable[];
  /** Natural phrase-ending inspiratory mini-breath duration (seconds) */
  breathAfterSec: number;
}

export type MotifTransformKind =
  | 'echo_humanized'     // Warm near-echo with organic rubato & micro-inflection
  | 'transpose_up'       // Musical upward step (major 2nd / minor 3rd / 4th)
  | 'transpose_down'     // Gentle downward resolution
  | 'invert_contour'     // Mirrors pitch contour around center (arch <-> valley)
  | 'ornament_embellish' // Adds lyrical vibrato, warble, or mordent flourish
  | 'accelerando_spark'  // Tightens timing & brightens register for lively excitement
  | 'rubato_stretch'     // Broadens phrasing with expressive lyrical linger
  | 'soft_answer'        // Question-and-answer antiphonal delicate echo
  | 'biphonic_bloom';    // Enriches climax syllables with a true 2-voice syrinx harmony

export type AvianMood = 'dawn_euphoria' | 'courtyard_lyrical' | 'dusk_tender' | 'rain_pensive' | 'excited_showcase';

export interface CircadianVocalSchedule {
  activity: number;      // 0..1 vocal urge
  isSleeping: boolean;
  mood: AvianMood;
  pauseMinSec: number;
  pauseMaxSec: number;
  motifsMin: number;
  motifsMax: number;
  vigor: number;         // 0.55..1.18
  tempoScale: number;    // 0.85..1.15
}

/**
 * Complete species vocal identity pluggable into `AvianSongDirector`.
 */
export interface AvianSpeciesVocalProfile {
  readonly id: string;
  readonly organ: AvianOrganSpec;
  /** Natural fundamental frequency range [minHz, maxHz] for this species */
  readonly tessituraHz: readonly [number, number];
  /** L/R bronchus crossover frequency band [lowHz, highHz] */
  readonly crossoverHz: readonly [number, number];
  /** Preferred musical interval ratios used for transpositions & melismas */
  readonly scaleRatios: readonly number[];
  /** Weighted archetype repertoire for spontaneous improvisation */
  readonly repertoire: ReadonlyArray<{ archetype: AvianMotifArchetype; weight: number }>;
  /** Probability [0..1] of performing laughingthrush-style theme-and-variation repeats */
  readonly variationRepeatProb: number;
  /** Probability [0..1] of enriching phrases with biphonic dual-bronchus harmonies */
  readonly duetAffinity: number;
  /** Circadian + weather activity evaluator */
  readonly evaluateCircadian: (timeOfDay: number, weather: WeatherMode) => CircadianVocalSchedule;
}

/**
 * Real-time motor command vector sent directly to `syrinx-worklet.js`.
 */
export interface AvianSyrinxFrame {
  pSub: number;
  pIcas: number;
  gapL: number;
  gapR: number;
  tensionL: number;
  tensionR: number;
  mtmStretchL: number;
  mtmStretchR: number;
  tracheaLenMm: number;
  tracheaWidth: number;
  oecVolMl: number;
  beakGapeMm: number;
  targetFreqHz: number;
}

/**
 * Real-time visual animation cue vector synchronized 1:1 with the physical syrinx.
 */
export interface AvianAnimCue {
  isSinging: boolean;
  isSleeping: boolean;
  isBreathingIn: boolean;
  singIntensity: number;
  beakOpen01: number;
  throatPulse01: number;
  pitchNorm01: number;
  excitedLevel: number;
  currentMotif: AvianMotifArchetype | 'idle' | 'sleep';
  circadianActivity: number;
}

export interface AvianDirectorFrame {
  syrinx: AvianSyrinxFrame;
  anim: AvianAnimCue;
}

// ============================================================================
// 2. MATH & PHYSICAL BIOMECHANICS INVERSE SOLVERS (1:1 WITH SYRINX-WORKLET)
// ============================================================================

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const diff = edge1 - edge0;
  if (Math.abs(diff) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / diff, 0, 1);
  return t * t * (3 - 2 * t);
}

export function createSeededRng(seed?: number): () => number {
  if (seed === undefined) return () => Math.random();
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function estimateBranchPtp(
  organ: AvianOrganSpec,
  branch: 'L' | 'R',
  effGapMm = 0.080,
  tensionEst = 0.35
): number {
  const isL = branch === 'L';
  const thick = clamp(isL ? organ.labialThickMmL : organ.labialThickMmR, 0.18, 1.10);
  const thickFactor = clamp(0.76 + 0.10 / (thick + 0.16), 0.84, 1.12);
  const basePtp = (0.39 + 0.27 * clamp(tensionEst + 0.25, 0.0, 1.8)) * thickFactor;
  const delta = effGapMm - 0.080;
  if (effGapMm >= 0.080) return basePtp * (1.0 + (delta / 0.135) ** 2);
  if (effGapMm > 0.005) return basePtp * (1.0 + 0.42 * ((0.080 - effGapMm) / 0.080) ** 2);
  return basePtp * 1.45;
}

/**
 * Closed-form + 2-pass physical inverse solver for hemi-syrinx tissue mechanics
 * (Newton's 2nd law + Fung exponential collagen law + Van der Pol / Duffing / SNILC calibration).
 */
export function solveAvianTension(
  targetFreqHz: number,
  branch: 'L' | 'R',
  organ: AvianOrganSpec,
  mtmStretch = 0.90,
  pSubEst = 1.65,
  gapEst = 0.080
): number {
  const isL = branch === 'L';
  const massMg = isL ? organ.massLMg : organ.massRMg;
  const k0Nm = isL ? organ.stiffLK0 : organ.stiffRK0;
  const gamma = isL ? organ.gammaL : organ.gammaR;
  const asym0 = isL ? organ.asymRestL : organ.asymRestR;

  const pSubPos = Math.max(0.45, pSubEst);
  const mtmClamped = clamp(mtmStretch, 0.0, 1.48);
  const mtmFactor = 0.68 + 0.56 * mtmClamped;
  const stackMode = clamp((0.52 - mtmClamped) / 0.38, 0.0, 1.0);
  const gritOverdrive = clamp((0.12 - mtmClamped) / 0.12, 0.0, 1.0);
  const c3 = 0.07 + 0.24 * stackMode + 0.12 * gritOverdrive;
  const snilcCrit = 2.0 * Math.sqrt(c3);
  const eta = clamp(
    asym0 + 0.62 * stackMode + 0.26 * gritOverdrive + 0.014 * pSubPos,
    0.01,
    snilcCrit * (0.97 + 0.05 * gritOverdrive)
  );

  let ten = 0.25;
  for (let pass = 0; pass < 2; pass++) {
    const ptp = estimateBranchPtp(organ, branch, gapEst, ten);
    const excessP = Math.max(0.0, pSubPos - ptp);
    const muEst = clamp(1.16 * Math.pow(excessP / (ptp + 0.34), 0.68), 0.0, 1.32);

    const aScale = 0.056 + 0.062 * stackMode + 0.024 * gritOverdrive;
    const wallRatio = clamp((aScale * 0.60 - Math.max(0.02, gapEst)) / aScale, 0.0, 0.65);
    const periodFactor =
      1.036 +
      0.038 * muEst * muEst +
      0.345 * eta * eta -
      0.115 * c3 -
      0.065 * wallRatio * (0.65 + 1.55 * stackMode);

    const fLin = clamp(targetFreqHz, 48.0, 7400.0) * clamp(periodFactor, 0.90, 1.48);
    const omegaReq = 2.0 * Math.PI * fLin;
    const kNeeded = omegaReq * omegaReq * (massMg * 1e-6);
    const aeroStiff = 0.065 * k0Nm * excessP;
    const kMuscle = Math.max(0.0020 * k0Nm, kNeeded - aeroStiff);
    ten = clamp(Math.log(kMuscle / (k0Nm * mtmFactor)) / gamma, -1.15, 1.75);
  }
  return ten;
}

/**
 * Physical shunt-compliance OEC inverse tracker (Riede et al., 2006; Fletcher et al., 2006).
 */
export function solveAvianOec(
  targetFreqHz: number,
  organ: AvianOrganSpec
): { oecVolMl: number; beakGapeMm: number } {
  const f = clamp(targetFreqHz, 520, 7000);
  const gapeScale = organ.beakGapeScale || 1.0;
  let baseGapeMm: number;
  if (f < 1200) {
    baseGapeMm = lerp(1.25, 2.45, clamp((f - 520) / 680, 0, 1));
  } else {
    baseGapeMm = lerp(2.45, 10.6, Math.pow(clamp((f - 1200) / 5400, 0, 1), 0.88));
  }
  const beakGapeMm = clamp(baseGapeMm * gapeScale, 0.45, 24.0);
  const beakAreaM2 = Math.pow(beakGapeMm * 0.001, 1.28) * 0.0068 + 2.4e-7;
  const aBeakM = Math.sqrt(beakAreaM2 / Math.PI);
  const neckBaseM = organ.oecNeckMm * 0.001;
  const kConst = SOUND_SPEED_AVIAN_MPS / (2.0 * Math.PI);
  const minVol = organ.minSongOecMl;
  const maxVol = organ.maxSongOecMl;

  let oecVolMl = clamp(
    (((kConst / f) ** 2 * beakAreaM2) / (neckBaseM + 1.70 * aBeakM)) * 1e6,
    minVol,
    maxVol
  );
  for (let iter = 0; iter < 2; iter++) {
    const deepEsophNeck = 0.022 * Math.max(0.0, oecVolMl - 1.45);
    const neckLenM = neckBaseM + deepEsophNeck + 1.70 * aBeakM;
    oecVolMl = clamp((((kConst / f) ** 2 * beakAreaM2) / neckLenM) * 1e6, minVol, maxVol);
  }
  return { oecVolMl, beakGapeMm };
}

// ============================================================================
// 3. CLASS: PitchContourEvaluator — LIQUID SPLINE MELODY & ORNAMENT ENGINE
// ============================================================================

export interface EvaluatedSyllablePoint {
  freqHz: number;
  harmonyHz: number | null;
  energy01: number;
  isPhonating: boolean;
}

/**
 * Evaluates continuous, liquid Catmull-Rom pitch splines, singing vibrato blooms,
 * liquid brook warbles, mordent turns, water-bubble drops, and grace-note scoops.
 */
export class PitchContourEvaluator {
  /**
   * Monotonic Catmull-Rom interpolation across arbitrary PitchKeyframes.
   * Produces silky, non-robotic S-curve glissandos with zero sharp corners.
   */
  public static sampleSpline(
    keyframes: readonly PitchKeyframe[],
    u: number
  ): { ratio: number; energy: number } {
    const n = keyframes.length;
    if (n === 0) return { ratio: 1.0, energy: 1.0 };
    if (n === 1) return { ratio: keyframes[0].ratio, energy: keyframes[0].energy ?? 1.0 };

    const t = clamp(u, 0, 1);
    if (t <= keyframes[0].t) {
      return { ratio: keyframes[0].ratio, energy: keyframes[0].energy ?? 1.0 };
    }
    if (t >= keyframes[n - 1].t) {
      return { ratio: keyframes[n - 1].ratio, energy: keyframes[n - 1].energy ?? 1.0 };
    }

    // Locate segment [i, i + 1]
    let i = 0;
    while (i < n - 2 && t > keyframes[i + 1].t) {
      i += 1;
    }

    const p0 = keyframes[Math.max(0, i - 1)];
    const p1 = keyframes[i];
    const p2 = keyframes[i + 1];
    const p3 = keyframes[Math.min(n - 1, i + 2)];

    const span = Math.max(1e-5, p2.t - p1.t);
    const s = clamp((t - p1.t) / span, 0, 1);
    const s2 = s * s;
    const s3 = s2 * s;

    // Centripetal-damped Catmull-Rom (0.5 tension) prevents unnatural pitch overshoot
    const interp = (v0: number, v1: number, v2: number, v3: number): number => {
      const m1 = 0.5 * (v2 - v0);
      const m2 = 0.5 * (v3 - v1);
      const h00 = 2 * s3 - 3 * s2 + 1;
      const h10 = s3 - 2 * s2 + s;
      const h01 = -2 * s3 + 3 * s2;
      const h11 = s3 - s2;
      return h00 * v1 + h10 * m1 + h01 * v2 + h11 * m2;
    };

    const ratio = clamp(interp(p0.ratio, p1.ratio, p2.ratio, p3.ratio), 0.35, 3.2);
    const e0 = p0.energy ?? 1.0;
    const e1 = p1.energy ?? 1.0;
    const e2 = p2.energy ?? 1.0;
    const e3 = p3.energy ?? 1.0;
    const energy = clamp(interp(e0, e1, e2, e3), 0.1, 1.35);
    return { ratio, energy };
  }

  /**
   * Evaluates a syllable at local time `localSec` within `[0, syllable.durationSec]`.
   */
  public static evaluateSyllable(
    syl: AvianSyllable,
    localSec: number,
    phaseSeed = 0
  ): EvaluatedSyllablePoint {
    if (localSec < 0 || localSec >= syl.durationSec || syl.durationSec <= 1e-4) {
      return { freqHz: syl.rootHz, harmonyHz: null, energy01: 0, isPhonating: false };
    }

    const u = clamp(localSec / syl.durationSec, 0, 1);
    const { ratio, energy } = PitchContourEvaluator.sampleSpline(syl.contour, u);

    // Expressive musical attack & lyrical release envelope
    const attackEnd = Math.min(0.16, 0.035 / Math.max(0.12, syl.durationSec));
    const releaseStart = Math.max(0.68, 1.0 - Math.min(0.22, 0.055 / Math.max(0.12, syl.durationSec)));
    const env = smoothstep(0, attackEnd, u) * smoothstep(1.0, releaseStart, u);

    // Ornament pitch & amplitude modulation (gives singing true 婉转 fluidity!)
    const orn = syl.ornament;
    let ornPitchMul = 1.0;
    let ornAmpMul = 1.0;

    if (orn.kind !== 'none') {
      const onset = smoothstep(orn.delayFrac, Math.min(1.0, orn.delayFrac + 0.24), u);
      const phase = 2.0 * Math.PI * orn.rateHz * localSec + phaseSeed;

      switch (orn.kind) {
        case 'flute_vibrato': {
          // Warm singing vibrato that blossoms smoothly on sustained melodic tones
          const vib = Math.sin(phase);
          ornPitchMul = 1.0 + orn.depthRatio * onset * vib;
          ornAmpMul = 1.0 - orn.ampPulse * 0.35 * onset * (0.5 - 0.5 * vib);
          break;
        }
        case 'liquid_warble': {
          // Asymmetric sinuous brook-warble (fundamental + gentle 2nd harmonic inflection)
          const wave = Math.sin(phase) + 0.28 * Math.sin(phase * 2.0 + 0.6);
          ornPitchMul = 1.0 + orn.depthRatio * onset * wave;
          ornAmpMul = 1.0 - orn.ampPulse * onset * (0.5 - 0.5 * Math.sin(phase));
          break;
        }
        case 'sparkle_trill': {
          // Crisp accelerating trill with gentle vocal gating
          const accelPhase = phase * (0.92 + 0.18 * u);
          const tr = Math.sin(accelPhase);
          ornPitchMul = 1.0 + orn.depthRatio * onset * tr;
          ornAmpMul = 1.0 - orn.ampPulse * onset * smoothstep(0.3, -0.7, tr);
          break;
        }
        case 'water_bubble': {
          // Downward-sweeping liquid droplet curve repeating at rateHz (like Waterslager/Hwamei water-roll)
          const cycle = (localSec * orn.rateHz + phaseSeed * 0.15) % 1;
          const drop = 1.0 - 2.0 * Math.pow(cycle, 0.65);
          const bubbleGate = smoothstep(0.0, 0.16, cycle) * smoothstep(1.0, 0.72, cycle);
          ornPitchMul = 1.0 + orn.depthRatio * onset * drop;
          ornAmpMul = lerp(1.0, 0.55 + 0.45 * bubbleGate, onset * clamp(orn.ampPulse * 1.4, 0.2, 1));
          break;
        }
        case 'mordent_turn': {
          // Crisp classical ornamental turn near the start or crest of the note
          const turnWindow = smoothstep(orn.delayFrac, orn.delayFrac + 0.06, u) *
            smoothstep(orn.delayFrac + 0.34, orn.delayFrac + 0.22, u);
          const turnWave = Math.sin(((u - orn.delayFrac) / 0.28) * Math.PI * 2.0);
          ornPitchMul = 1.0 + orn.depthRatio * turnWindow * turnWave;
          break;
        }
        case 'grace_scoop': {
          // Swift crisp upward scoop on the opening 18% of the note ("y-eeee~")
          const scoop = Math.exp(-u / 0.085);
          ornPitchMul = 1.0 - orn.depthRatio * scoop;
          break;
        }
      }
    }

    const freqHz = clamp(syl.rootHz * ratio * ornPitchMul, 580, 6600);
    let harmonyHz: number | null = null;
    if (syl.voice === 'duet' && syl.harmonyRatio) {
      const entry = syl.harmonyEntryFrac ?? 0.12;
      if (u >= entry) {
        const shimmer = 1.0 + 0.025 * Math.sin(2.0 * Math.PI * 9.5 * localSec + phaseSeed);
        harmonyHz = clamp(freqHz * syl.harmonyRatio * shimmer, 800, 6800);
      }
    }

    const energy01 = clamp(env * energy * syl.intensity * ornAmpMul, 0, 1.15);
    return {
      freqHz,
      harmonyHz,
      energy01,
      isPhonating: energy01 > 0.05,
    };
  }
}

// ============================================================================
// 4. CLASS: MotifMutator — GENERAL-PURPOSE THEME-AND-VARIATION TRANSFORMER
// ============================================================================

/**
 * Transforms any `AvianMotif` into musically coherent variations (transposition,
 * inversion, ornamentation, rubato stretch, soft antiphonal reply, biphonic bloom),
 * giving bird songs near-infinite organic diversity while retaining natural avian structure.
 */
export class MotifMutator {
  public static mutate(
    source: AvianMotif,
    transform: MotifTransformKind,
    profile: AvianSpeciesVocalProfile,
    rng: () => number
  ): AvianMotif {
    const [minHz, maxHz] = profile.tessituraHz;
    const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);

    const cloneSyllable = (s: AvianSyllable): AvianSyllable => ({
      ...s,
      contour: s.contour.map((k) => ({ ...k })),
      ornament: { ...s.ornament },
    });

    const syllables = source.syllables.map(cloneSyllable);

    switch (transform) {
      case 'echo_humanized': {
        const microKey = rand(0.985, 1.028);
        const tempoMul = rand(0.93, 1.07);
        for (const s of syllables) {
          s.rootHz = clamp(s.rootHz * microKey, minHz, maxHz);
          s.durationSec *= tempoMul;
          s.intensity = clamp(s.intensity * rand(0.94, 1.06), 0.45, 1.15);
        }
        break;
      }

      case 'transpose_up': {
        // Pick a consonant upward musical step (whole step, minor 3rd, major 3rd, or 4th)
        const steps = [1.06, 1.122, 1.189, 1.26];
        const step = steps[Math.floor(rng() * steps.length)];
        for (const s of syllables) {
          s.rootHz = clamp(s.rootHz * step, minHz, maxHz * 0.96);
          s.intensity = clamp(s.intensity * 1.05, 0.5, 1.16);
        }
        break;
      }

      case 'transpose_down': {
        const steps = [0.94, 0.89, 0.84];
        const step = steps[Math.floor(rng() * steps.length)];
        for (const s of syllables) {
          s.rootHz = clamp(s.rootHz * step, minHz * 0.96, maxHz);
          s.durationSec *= rand(1.02, 1.12);
        }
        break;
      }

      case 'invert_contour': {
        for (const s of syllables) {
          const avgRatio =
            s.contour.reduce((acc, k) => acc + k.ratio, 0) / Math.max(1, s.contour.length);
          s.contour = s.contour.map((k) => ({
            ...k,
            ratio: clamp(2.0 * avgRatio - k.ratio, 0.55, 2.2),
          }));
        }
        break;
      }

      case 'ornament_embellish': {
        const ornPool: SyllableOrnamentKind[] = [
          'flute_vibrato',
          'liquid_warble',
          'mordent_turn',
          'water_bubble',
        ];
        const chosen = ornPool[Math.floor(rng() * ornPool.length)];
        for (let i = 0; i < syllables.length; i++) {
          const s = syllables[i];
          // Embellish the longest / most lyrical syllables
          if (s.durationSec >= 0.20 || i === syllables.length - 1) {
            s.ornament = {
              kind: chosen,
              rateHz:
                chosen === 'flute_vibrato'
                  ? rand(6.2, 8.8)
                  : chosen === 'liquid_warble'
                  ? rand(11.0, 15.5)
                  : chosen === 'water_bubble'
                  ? rand(13.5, 18.5)
                  : rand(8.0, 12.0),
              depthRatio:
                chosen === 'flute_vibrato'
                  ? rand(0.022, 0.040)
                  : chosen === 'liquid_warble'
                  ? rand(0.055, 0.095)
                  : rand(0.065, 0.11),
              delayFrac: chosen === 'flute_vibrato' ? 0.24 : 0.10,
              ampPulse: chosen === 'flute_vibrato' ? 0.14 : 0.28,
            };
          }
        }
        break;
      }

      case 'accelerando_spark': {
        const n = Math.max(1, syllables.length);
        for (let i = 0; i < n; i++) {
          const frac = i / Math.max(1, n - 1);
          syllables[i].durationSec *= lerp(0.95, 0.72, frac);
          syllables[i].gapAfterSec *= 0.74;
          syllables[i].rootHz = clamp(syllables[i].rootHz * lerp(1.0, 1.14, frac), minHz, maxHz);
        }
        break;
      }

      case 'rubato_stretch': {
        for (const s of syllables) {
          s.durationSec *= rand(1.14, 1.32);
          s.gapAfterSec *= rand(1.05, 1.25);
          if (s.ornament.kind === 'none' && s.durationSec > 0.28) {
            s.ornament = {
              kind: 'flute_vibrato',
              rateHz: rand(5.8, 7.6),
              depthRatio: rand(0.020, 0.034),
              delayFrac: 0.28,
              ampPulse: 0.12,
            };
          }
        }
        break;
      }

      case 'soft_answer': {
        const lift = rand(1.12, 1.28);
        for (const s of syllables) {
          s.rootHz = clamp(s.rootHz * lift, minHz, maxHz);
          s.intensity = clamp(s.intensity * 0.76, 0.45, 0.88);
          s.durationSec *= rand(0.88, 1.04);
        }
        break;
      }

      case 'biphonic_bloom': {
        const harmRatios = [1.25, 1.333, 1.498, 1.667]; // major 3rd, 4th, 5th, major 6th
        const ratio = harmRatios[Math.floor(rng() * harmRatios.length)];
        for (let i = 0; i < syllables.length; i++) {
          const s = syllables[i];
          if (s.durationSec >= 0.22 || i === syllables.length - 1) {
            s.voice = 'duet';
            s.harmonyRatio = ratio;
            s.harmonyEntryFrac = rand(0.10, 0.28);
            s.rootHz = clamp(s.rootHz, minHz, Math.min(2550, maxHz * 0.68));
          }
        }
        break;
      }
    }

    return {
      archetype: source.archetype,
      category: source.category,
      syllables,
      breathAfterSec: clamp(source.breathAfterSec * rand(0.88, 1.18), 0.08, 0.34),
    };
  }
}

// ============================================================================
// 5. EXPRESSIVE MOTIF FACTORY LIBRARY (19 LYRICAL & ORNATE ARCHETYPES)
// ============================================================================

interface MotifBuildCtx {
  baseHz: number;
  vigor: number;
  tempoScale: number;
  profile: AvianSpeciesVocalProfile;
  rng: () => number;
}

function buildMotifByArchetype(
  archetype: AvianMotifArchetype,
  ctx: MotifBuildCtx
): AvianMotif {
  const { baseHz, vigor, tempoScale, profile, rng } = ctx;
  const [minHz, maxHz] = profile.tessituraHz;
  const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const pickScale = (idxOffset = 0) => {
    const arr = profile.scaleRatios;
    const idx = clamp(Math.floor(rng() * arr.length) + idxOffset, 0, arr.length - 1);
    return arr[idx];
  };
  const hz = (r: number) => clamp(baseHz * r, minHz, maxHz);
  const dur = (s: number) => clamp(s / tempoScale, 0.065, 1.6);
  const v = clamp(vigor, 0.55, 1.18);

  const noOrn: SyllableOrnament = {
    kind: 'none',
    rateHz: 0,
    depthRatio: 0,
    delayFrac: 0,
    ampPulse: 0,
  };

  switch (archetype) {
    case 'grace_chirp': {
      // Playful 2–3 buoyant upward pickup notes ("jiu-jiu-jui!")
      const count = rng() < 0.45 ? 3 : 2;
      const syllables: AvianSyllable[] = [];
      for (let i = 0; i < count; i++) {
        syllables.push({
          durationSec: dur(rand(0.11, 0.17)),
          gapAfterSec: dur(rand(0.055, 0.095)),
          rootHz: hz(rand(0.95, 1.14) * (1 + i * 0.075)),
          contour: [
            { t: 0.0, ratio: 0.88, energy: 0.72 },
            { t: 0.38, ratio: 1.18, energy: 1.05 },
            { t: 1.0, ratio: rand(1.26, 1.44), energy: 0.85 },
          ],
          voice: 'auto',
          intensity: 0.80 * v,
          timbreBright: 0.02,
          ornament: { kind: 'grace_scoop', rateHz: 0, depthRatio: 0.14, delayFrac: 0, ampPulse: 0 },
          miniBreathAfter: false,
        });
      }
      return { archetype, category: 'intro', syllables, breathAfterSec: rand(0.10, 0.18) };
    }

    case 'lyrical_flute_scoop': {
      // 婉转起挑笛音: gentle dip -> soaring crystalline flute crest -> tender falling sigh
      return {
        archetype,
        category: 'lyrical',
        syllables: [
          {
            durationSec: dur(rand(0.58, 0.92)),
            gapAfterSec: dur(rand(0.05, 0.09)),
            rootHz: hz(rand(0.94, 1.18)),
            contour: [
              { t: 0.0, ratio: 0.94, energy: 0.65 },
              { t: 0.18, ratio: 0.84, energy: 0.82 }, // tender downward scoop
              { t: 0.56, ratio: rand(1.42, 1.66), energy: 1.12 }, // radiant lyrical peak
              { t: 0.82, ratio: rand(1.30, 1.46), energy: 0.96 },
              { t: 1.0, ratio: rand(1.06, 1.22), energy: 0.62 },
            ],
            voice: 'auto',
            intensity: 0.96 * v,
            timbreBright: 0.03,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(6.4, 8.6),
              depthRatio: rand(0.024, 0.038),
              delayFrac: 0.32,
              ampPulse: 0.14,
            },
            miniBreathAfter: true,
          },
          {
            durationSec: dur(rand(0.24, 0.38)),
            gapAfterSec: 0,
            rootHz: hz(rand(1.16, 1.38)),
            contour: [
              { t: 0.0, ratio: 1.18, energy: 0.90 },
              { t: 0.50, ratio: 0.98, energy: 0.95 },
              { t: 1.0, ratio: 0.86, energy: 0.58 },
            ],
            voice: 'auto',
            intensity: 0.86 * v,
            timbreBright: 0.01,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(6.0, 7.8),
              depthRatio: 0.02,
              delayFrac: 0.25,
              ampPulse: 0.10,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.14, 0.24),
      };
    }

    case 'huamei_signature_call': {
      // 画眉经典回环调 ("di-lu-weee~" — sparkling 3-part signature laughingthrush phrase)
      const root = hz(rand(0.96, 1.24));
      return {
        archetype,
        category: 'call',
        syllables: [
          {
            durationSec: dur(rand(0.14, 0.21)),
            gapAfterSec: dur(rand(0.035, 0.06)),
            rootHz: root,
            contour: [
              { t: 0.0, ratio: 1.15, energy: 0.95 },
              { t: 0.55, ratio: 0.92, energy: 0.88 },
              { t: 1.0, ratio: 1.05, energy: 0.78 },
            ],
            voice: 'auto',
            intensity: 0.94 * v,
            timbreBright: 0.03,
            ornament: noOrn,
            miniBreathAfter: false,
          },
          {
            durationSec: dur(rand(0.13, 0.19)),
            gapAfterSec: dur(rand(0.03, 0.055)),
            rootHz: root * 1.12,
            contour: [
              { t: 0.0, ratio: 0.86, energy: 0.84 },
              { t: 0.5, ratio: 1.16, energy: 1.02 },
              { t: 1.0, ratio: 0.96, energy: 0.85 },
            ],
            voice: 'auto',
            intensity: 0.96 * v,
            timbreBright: 0.03,
            ornament: { kind: 'mordent_turn', rateHz: 11, depthRatio: 0.06, delayFrac: 0.12, ampPulse: 0.15 },
            miniBreathAfter: false,
          },
          {
            durationSec: dur(rand(0.36, 0.56)),
            gapAfterSec: 0,
            rootHz: root * 1.18,
            contour: [
              { t: 0.0, ratio: 0.95, energy: 0.80 },
              { t: 0.35, ratio: 1.38, energy: 1.12 },
              { t: 0.75, ratio: 1.44, energy: 1.04 },
              { t: 1.0, ratio: 1.24, energy: 0.72 },
            ],
            voice: 'auto',
            intensity: 1.04 * v,
            timbreBright: 0.05,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(7.0, 9.5),
              depthRatio: 0.032,
              delayFrac: 0.30,
              ampPulse: 0.16,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.13, 0.22),
      };
    }

    case 'pentatonic_melisma': {
      // 五声花腔滑音: continuous singing melisma gliding through 4–5 pentatonic intervals
      const r1 = pickScale(0);
      const r2 = pickScale(1);
      const r3 = pickScale(2);
      const r4 = pickScale(1);
      return {
        archetype,
        category: 'lyrical',
        syllables: [
          {
            durationSec: dur(rand(0.56, 0.88)),
            gapAfterSec: dur(rand(0.04, 0.075)),
            rootHz: hz(rand(0.88, 1.08)),
            contour: [
              { t: 0.0, ratio: r1, energy: 0.76 },
              { t: 0.24, ratio: r2, energy: 0.98 },
              { t: 0.52, ratio: r3 * 1.12, energy: 1.10 },
              { t: 0.78, ratio: r4 * 1.04, energy: 0.96 },
              { t: 1.0, ratio: r1 * 1.18, energy: 0.78 },
            ],
            voice: 'auto',
            intensity: 0.96 * v,
            timbreBright: 0.04,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(6.5, 8.8),
              depthRatio: 0.025,
              delayFrac: 0.45,
              ampPulse: 0.12,
            },
            miniBreathAfter: false,
          },
          {
            durationSec: dur(rand(0.28, 0.44)),
            gapAfterSec: 0,
            rootHz: hz(rand(1.05, 1.28)),
            contour: [
              { t: 0.0, ratio: 1.24, energy: 0.95 },
              { t: 0.45, ratio: 1.04, energy: 1.0 },
              { t: 1.0, ratio: 1.32, energy: 0.86 },
            ],
            voice: 'auto',
            intensity: 0.94 * v,
            timbreBright: 0.03,
            ornament: { kind: 'mordent_turn', rateHz: 10, depthRatio: 0.055, delayFrac: 0.18, ampPulse: 0.12 },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.14, 0.24),
      };
    }

    case 'nightingale_crescendo': {
      // 渐强吟唱: 4 repeated liquid flute pulses swelling gracefully from pianissimo into a bright soaring bloom
      const syllables: AvianSyllable[] = [];
      const root = hz(rand(0.95, 1.25));
      for (let i = 0; i < 4; i++) {
        const frac = i / 3;
        syllables.push({
          durationSec: dur(lerp(0.18, 0.28, frac)),
          gapAfterSec: dur(lerp(0.085, 0.04, frac)),
          rootHz: root * lerp(1.0, 1.08, frac),
          contour: [
            { t: 0.0, ratio: 0.96, energy: 0.82 },
            { t: 0.55, ratio: 1.06 + frac * 0.14, energy: 1.06 },
            { t: 1.0, ratio: 1.02 + frac * 0.10, energy: 0.88 },
          ],
          voice: 'auto',
          intensity: lerp(0.56, 1.08, frac) * v,
          timbreBright: lerp(-0.02, 0.05, frac),
          ornament:
            i === 3
              ? { kind: 'flute_vibrato', rateHz: 7.8, depthRatio: 0.03, delayFrac: 0.22, ampPulse: 0.14 }
              : noOrn,
          miniBreathAfter: i === 2,
        });
      }
      return { archetype, category: 'lyrical', syllables, breathAfterSec: rand(0.15, 0.25) };
    }

    case 'liquid_warble': {
      // 流水啭鸣: rolling liquid brook warble with graceful two-part arching inflection
      return {
        archetype,
        category: 'warble',
        syllables: [
          {
            durationSec: dur(rand(0.46, 0.72)),
            gapAfterSec: dur(rand(0.04, 0.075)),
            rootHz: hz(rand(1.08, 1.38)),
            contour: [
              { t: 0.0, ratio: 0.92, energy: 0.78 },
              { t: 0.35, ratio: 1.22, energy: 1.05 },
              { t: 0.72, ratio: 1.05, energy: 0.98 },
              { t: 1.0, ratio: 1.26, energy: 0.85 },
            ],
            voice: 'auto',
            intensity: 0.96 * v,
            timbreBright: 0.03,
            ornament: {
              kind: 'liquid_warble',
              rateHz: rand(11.5, 15.8),
              depthRatio: rand(0.075, 0.115),
              delayFrac: 0.06,
              ampPulse: 0.28,
            },
            miniBreathAfter: true,
          },
          {
            durationSec: dur(rand(0.30, 0.46)),
            gapAfterSec: 0,
            rootHz: hz(rand(1.15, 1.46)),
            contour: [
              { t: 0.0, ratio: 1.14, energy: 0.92 },
              { t: 0.45, ratio: 0.92, energy: 0.98 },
              { t: 1.0, ratio: 1.18, energy: 0.76 },
            ],
            voice: 'auto',
            intensity: 0.92 * v,
            timbreBright: 0.02,
            ornament: {
              kind: 'liquid_warble',
              rateHz: rand(12.5, 16.5),
              depthRatio: 0.075,
              delayFrac: 0.08,
              ampPulse: 0.24,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.13, 0.23),
      };
    }

    case 'water_bubble_roll': {
      // 水泡滚珠: cascading liquid water-drop bubbles (Waterslager / Hwamei signature)
      return {
        archetype,
        category: 'warble',
        syllables: [
          {
            durationSec: dur(rand(0.55, 0.84)),
            gapAfterSec: dur(rand(0.04, 0.07)),
            rootHz: hz(rand(1.06, 1.36)),
            contour: [
              { t: 0.0, ratio: 1.08, energy: 0.82 },
              { t: 0.40, ratio: 1.24, energy: 1.02 },
              { t: 0.80, ratio: 0.98, energy: 0.96 },
              { t: 1.0, ratio: 0.88, energy: 0.70 },
            ],
            voice: 'auto',
            intensity: 0.94 * v,
            timbreBright: 0.01,
            ornament: {
              kind: 'water_bubble',
              rateHz: rand(13.5, 18.5),
              depthRatio: rand(0.11, 0.16),
              delayFrac: 0.04,
              ampPulse: 0.34,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.12, 0.21),
      };
    }

    case 'question_answer_duet': {
      // 一问一答对唱: warm left-bronchus questioning arch answered by sparkling high right-bronchus flute
      return {
        archetype,
        category: 'call',
        syllables: [
          {
            durationSec: dur(rand(0.32, 0.46)),
            gapAfterSec: dur(rand(0.09, 0.15)),
            rootHz: hz(rand(0.86, 1.04)),
            contour: [
              { t: 0.0, ratio: 0.94, energy: 0.85 },
              { t: 0.45, ratio: 1.18, energy: 1.04 },
              { t: 1.0, ratio: 1.32, energy: 0.92 }, // rising question inflection
            ],
            voice: 'left',
            intensity: 0.98 * v,
            timbreBright: 0.0,
            ornament: { kind: 'flute_vibrato', rateHz: 6.5, depthRatio: 0.022, delayFrac: 0.30, ampPulse: 0.10 },
            miniBreathAfter: true,
          },
          {
            durationSec: dur(rand(0.34, 0.50)),
            gapAfterSec: 0,
            rootHz: hz(rand(1.38, 1.66)),
            contour: [
              { t: 0.0, ratio: 1.16, energy: 0.86 },
              { t: 0.35, ratio: 1.02, energy: 0.96 },
              { t: 0.72, ratio: 0.86, energy: 0.88 },
              { t: 1.0, ratio: 0.92, energy: 0.65 }, // gentle lyrical answer
            ],
            voice: 'right',
            intensity: 0.84 * v,
            timbreBright: 0.04,
            ornament: { kind: 'flute_vibrato', rateHz: 7.8, depthRatio: 0.026, delayFrac: 0.25, ampPulse: 0.12 },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.14, 0.24),
      };
    }

    case 'pearl_cascade':
    case 'cascading_run': {
      // 珠落玉盘下行: 5–7 pearly crystalline descending notes with subtle rhythmic swing
      const steps = Math.floor(rand(5, 7.6));
      const startHz = hz(rand(1.42, 1.78));
      const syllables: AvianSyllable[] = [];
      for (let i = 0; i < steps; i++) {
        const frac = i / Math.max(1, steps - 1);
        const stepRatio = lerp(1.0, rand(0.56, 0.66), Math.pow(frac, 0.88));
        const isLast = i === steps - 1;
        syllables.push({
          durationSec: dur(isLast ? rand(0.24, 0.36) : rand(0.085, 0.13)),
          gapAfterSec: isLast ? 0 : dur(rand(0.028, 0.052)),
          rootHz: clamp(startHz * stepRatio, minHz, maxHz),
          contour: isLast
            ? [
                { t: 0.0, ratio: 1.05, energy: 0.92 },
                { t: 0.45, ratio: 0.94, energy: 0.98 },
                { t: 1.0, ratio: 1.08, energy: 0.72 }, // delicate upturned finish!
              ]
            : [
                { t: 0.0, ratio: 1.08, energy: 0.96 },
                { t: 1.0, ratio: 0.90, energy: 0.78 },
              ],
          voice: 'auto',
          intensity: lerp(0.98, 0.84, frac) * v,
          timbreBright: lerp(0.05, 0.01, frac),
          ornament: isLast
            ? { kind: 'flute_vibrato', rateHz: 7.0, depthRatio: 0.024, delayFrac: 0.25, ampPulse: 0.10 }
            : noOrn,
          miniBreathAfter: false,
        });
      }
      return { archetype, category: 'cascade', syllables, breathAfterSec: rand(0.13, 0.22) };
    }

    case 'silky_trill_bloom':
    case 'sparkle_trill': {
      // 花舌颤音收尾: sparkling rapid right-bronchus trill melting into a glowing pure held whistle
      const root = hz(rand(1.32, 1.66));
      return {
        archetype,
        category: 'trill',
        syllables: [
          {
            durationSec: dur(rand(0.42, 0.66)),
            gapAfterSec: dur(rand(0.018, 0.035)),
            rootHz: root,
            contour: [
              { t: 0.0, ratio: 0.95, energy: 0.82 },
              { t: 0.55, ratio: 1.06, energy: 1.05 },
              { t: 1.0, ratio: 1.14, energy: 0.96 },
            ],
            voice: 'right',
            intensity: 0.98 * v,
            timbreBright: 0.05,
            ornament: {
              kind: 'sparkle_trill',
              rateHz: rand(17.5, 23.0),
              depthRatio: rand(0.085, 0.125),
              delayFrac: 0.05,
              ampPulse: 0.36,
            },
            miniBreathAfter: false,
          },
          {
            durationSec: dur(rand(0.28, 0.44)),
            gapAfterSec: 0,
            rootHz: clamp(root * rand(1.08, 1.24), minHz, maxHz),
            contour: [
              { t: 0.0, ratio: 0.96, energy: 0.92 },
              { t: 0.40, ratio: 1.12, energy: 1.06 },
              { t: 1.0, ratio: 1.02, energy: 0.68 },
            ],
            voice: 'right',
            intensity: 0.94 * v,
            timbreBright: 0.04,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(7.2, 9.2),
              depthRatio: 0.028,
              delayFrac: 0.22,
              ampPulse: 0.14,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.14, 0.23),
      };
    }

    case 'biphonic_flourish': {
      // 双管二声部和鸣: true simultaneous dual-bronchus harmonic duet (warm contralto + crystalline upper fifth/sixth)
      const harm = rng() < 0.5 ? 1.498 : 1.667;
      return {
        archetype,
        category: 'duet',
        syllables: [
          {
            durationSec: dur(rand(0.58, 0.90)),
            gapAfterSec: 0,
            rootHz: hz(rand(0.88, 1.12)),
            contour: [
              { t: 0.0, ratio: 0.92, energy: 0.78 },
              { t: 0.32, ratio: 1.16, energy: 1.06 },
              { t: 0.68, ratio: 1.28, energy: 1.12 },
              { t: 1.0, ratio: 1.04, energy: 0.72 },
            ],
            harmonyRatio: harm,
            harmonyEntryFrac: rand(0.14, 0.26),
            voice: 'duet',
            intensity: 1.04 * v,
            timbreBright: 0.04,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(6.8, 9.0),
              depthRatio: 0.026,
              delayFrac: 0.30,
              ampPulse: 0.14,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.16, 0.26),
      };
    }

    case 'sighing_glissando': {
      // 悠扬长叹滑落: tender expressive high-to-low flute glissando with soft vibrato tail
      return {
        archetype,
        category: 'coda',
        syllables: [
          {
            durationSec: dur(rand(0.52, 0.80)),
            gapAfterSec: 0,
            rootHz: hz(rand(1.26, 1.54)),
            contour: [
              { t: 0.0, ratio: 1.06, energy: 0.88 },
              { t: 0.22, ratio: 1.14, energy: 1.04 },
              { t: 0.64, ratio: 0.82, energy: 0.88 },
              { t: 1.0, ratio: 0.68, energy: 0.50 },
            ],
            voice: 'auto',
            intensity: 0.88 * v,
            timbreBright: 0.0,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(5.8, 7.6),
              depthRatio: 0.024,
              delayFrac: 0.38,
              ampPulse: 0.12,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.18, 0.28),
      };
    }

    case 'whisper_subsong': {
      // 轻声低吟: soft intimate low-pressure courtyard warble (for calm midday/rain moods)
      return {
        archetype,
        category: 'warble',
        syllables: [
          {
            durationSec: dur(rand(0.38, 0.58)),
            gapAfterSec: dur(rand(0.06, 0.11)),
            rootHz: hz(rand(0.84, 1.06)),
            contour: [
              { t: 0.0, ratio: 0.94, energy: 0.72 },
              { t: 0.35, ratio: 1.14, energy: 0.88 },
              { t: 0.70, ratio: 0.98, energy: 0.84 },
              { t: 1.0, ratio: 1.08, energy: 0.64 },
            ],
            voice: 'left',
            intensity: 0.64 * v,
            timbreBright: -0.02,
            ornament: {
              kind: 'liquid_warble',
              rateHz: rand(9.5, 13.0),
              depthRatio: 0.062,
              delayFrac: 0.10,
              ampPulse: 0.20,
            },
            miniBreathAfter: true,
          },
          {
            durationSec: dur(rand(0.28, 0.42)),
            gapAfterSec: 0,
            rootHz: hz(rand(0.92, 1.15)),
            contour: [
              { t: 0.0, ratio: 1.08, energy: 0.80 },
              { t: 0.55, ratio: 0.90, energy: 0.76 },
              { t: 1.0, ratio: 0.98, energy: 0.54 },
            ],
            voice: 'left',
            intensity: 0.58 * v,
            timbreBright: -0.03,
            ornament: { kind: 'flute_vibrato', rateHz: 6.0, depthRatio: 0.02, delayFrac: 0.25, ampPulse: 0.10 },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.16, 0.26),
      };
    }

    case 'ornate_coda': {
      // 婉转余韵尾音: graceful 2-note closing cadence with upward turn + lingering shimmer
      return {
        archetype,
        category: 'coda',
        syllables: [
          {
            durationSec: dur(rand(0.18, 0.26)),
            gapAfterSec: dur(rand(0.04, 0.07)),
            rootHz: hz(rand(1.12, 1.34)),
            contour: [
              { t: 0.0, ratio: 0.92, energy: 0.84 },
              { t: 0.5, ratio: 1.16, energy: 1.0 },
              { t: 1.0, ratio: 1.02, energy: 0.82 },
            ],
            voice: 'auto',
            intensity: 0.88 * v,
            timbreBright: 0.02,
            ornament: { kind: 'mordent_turn', rateHz: 11, depthRatio: 0.05, delayFrac: 0.15, ampPulse: 0.10 },
            miniBreathAfter: false,
          },
          {
            durationSec: dur(rand(0.46, 0.72)),
            gapAfterSec: 0,
            rootHz: hz(rand(1.02, 1.24)),
            contour: [
              { t: 0.0, ratio: 1.08, energy: 0.92 },
              { t: 0.32, ratio: 1.28, energy: 1.02 },
              { t: 0.76, ratio: 1.04, energy: 0.84 },
              { t: 1.0, ratio: 0.94, energy: 0.48 },
            ],
            voice: 'auto',
            intensity: 0.84 * v,
            timbreBright: 0.02,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(6.2, 8.2),
              depthRatio: 0.028,
              delayFrac: 0.28,
              ampPulse: 0.14,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.20, 0.30),
      };
    }

    case 'double_call': {
      // Classic ringing 2–3x laughingthrush motif ("di-li-yoo~ di-li-yoo~")
      const count = rng() < 0.62 ? 2 : 3;
      const root = hz(rand(1.02, 1.32));
      const syllables: AvianSyllable[] = [];
      for (let i = 0; i < count; i++) {
        syllables.push({
          durationSec: dur(rand(0.26, 0.38)),
          gapAfterSec: i === count - 1 ? 0 : dur(rand(0.065, 0.11)),
          rootHz: clamp(root * (1 + i * 0.065), minHz, maxHz),
          contour: [
            { t: 0.0, ratio: 0.92, energy: 0.82 },
            { t: 0.36, ratio: rand(1.32, 1.52), energy: 1.08 },
            { t: 0.78, ratio: 1.12, energy: 0.94 },
            { t: 1.0, ratio: 1.02, energy: 0.68 },
          ],
          voice: 'auto',
          intensity: (0.94 + i * 0.04) * v,
          timbreBright: 0.03,
          ornament: {
            kind: 'flute_vibrato',
            rateHz: rand(7.2, 9.6),
            depthRatio: 0.024,
            delayFrac: 0.32,
            ampPulse: 0.12,
          },
          miniBreathAfter: i < count - 1,
        });
      }
      return { archetype, category: 'call', syllables, breathAfterSec: rand(0.13, 0.22) };
    }

    case 'rising_salute': {
      // 晨光高亢清啸: proud soaring upward whistle crescendo
      return {
        archetype,
        category: 'call',
        syllables: [
          {
            durationSec: dur(rand(0.11, 0.16)),
            gapAfterSec: dur(rand(0.025, 0.045)),
            rootHz: hz(rand(0.92, 1.10)),
            contour: [
              { t: 0.0, ratio: 0.92, energy: 0.80 },
              { t: 1.0, ratio: 1.16, energy: 0.96 },
            ],
            voice: 'auto',
            intensity: 0.88 * v,
            timbreBright: 0.02,
            ornament: noOrn,
            miniBreathAfter: false,
          },
          {
            durationSec: dur(rand(0.48, 0.74)),
            gapAfterSec: 0,
            rootHz: hz(rand(1.02, 1.24)),
            contour: [
              { t: 0.0, ratio: 0.92, energy: 0.78 },
              { t: 0.42, ratio: 1.36, energy: 1.06 },
              { t: 0.82, ratio: rand(1.62, 1.84), energy: 1.14 },
              { t: 1.0, ratio: 1.56, energy: 0.86 },
            ],
            voice: 'auto',
            intensity: 1.06 * v,
            timbreBright: 0.05,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(7.8, 10.4),
              depthRatio: 0.030,
              delayFrac: 0.42,
              ampPulse: 0.14,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.15, 0.25),
      };
    }

    case 'flute_arch':
    default: {
      // Classic pure lyrical flute arch with late singing vibrato
      return {
        archetype: 'flute_arch',
        category: 'lyrical',
        syllables: [
          {
            durationSec: dur(rand(0.56, 0.88)),
            gapAfterSec: 0,
            rootHz: hz(rand(0.96, 1.24)),
            contour: [
              { t: 0.0, ratio: 0.90, energy: 0.72 },
              { t: 0.42, ratio: rand(1.42, 1.68), energy: 1.10 },
              { t: 0.78, ratio: 1.26, energy: 0.95 },
              { t: 1.0, ratio: 0.96, energy: 0.62 },
            ],
            voice: 'auto',
            intensity: 0.96 * v,
            timbreBright: 0.03,
            ornament: {
              kind: 'flute_vibrato',
              rateHz: rand(6.4, 8.8),
              depthRatio: 0.028,
              delayFrac: 0.28,
              ampPulse: 0.14,
            },
            miniBreathAfter: false,
          },
        ],
        breathAfterSec: rand(0.13, 0.22),
      };
    }
  }
}

// ============================================================================
// 6. CLASS: AvianRepertoireGrammar — MARKOV PHRASE GRAMMAR + NOVELTY MEMORY
// ============================================================================

/**
 * Generates non-repeating, musically structured song bouts using a bio-acoustic
 * Markov grammar (`intro -> theme -> variation -> contrast -> flourish -> coda`)
 * paired with a sliding novelty memory so the bird never loops stale phrases.
 */
export class AvianRepertoireGrammar {
  private readonly recentArchetypes: AvianMotifArchetype[] = [];
  private readonly memorySize = 6;
  private tonalCenterShift = 1.0;

  private recordMotif(kind: AvianMotifArchetype): void {
    this.recentArchetypes.push(kind);
    if (this.recentArchetypes.length > this.memorySize) {
      this.recentArchetypes.shift();
    }
  }

  private pickNovelArchetype(
    candidates: ReadonlyArray<{ archetype: AvianMotifArchetype; weight: number }>,
    rng: () => number
  ): AvianMotifArchetype {
    let total = 0;
    const adjusted: number[] = new Array(candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i].archetype;
      // Strongly penalize recently sung motifs to maximize real-time diversity!
      let recencyPenalty = 1.0;
      for (let m = this.recentArchetypes.length - 1; m >= 0; m--) {
        if (this.recentArchetypes[m] === a) {
          const age = this.recentArchetypes.length - 1 - m; // 0 = most recent
          recencyPenalty *= age === 0 ? 0.10 : age === 1 ? 0.28 : 0.55;
        }
      }
      const w = Math.max(0.01, candidates[i].weight * recencyPenalty);
      adjusted[i] = w;
      total += w;
    }

    let r = rng() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= adjusted[i];
      if (r <= 0) return candidates[i].archetype;
    }
    return candidates[candidates.length - 1].archetype;
  }

  /**
   * Composes a complete improvised multi-phrase song bout tailored to mood, vigor, and species profile.
   */
  public composeBout(
    profile: AvianSpeciesVocalProfile,
    schedule: CircadianVocalSchedule,
    isShowcase: boolean,
    rng: () => number
  ): AvianMotif[] {
    const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);

    // Smooth random walk in musical key center so consecutive bouts drift naturally across keys
    const targetShift = rand(0.88, 1.15);
    this.tonalCenterShift = clamp(this.tonalCenterShift * 0.35 + targetShift * 0.65, 0.86, 1.16);

    const [minHz, maxHz] = profile.tessituraHz;
    const midHz = Math.sqrt(minHz * maxHz) * 0.86 * this.tonalCenterShift;
    const moodTempo =
      schedule.mood === 'dawn_euphoria'
        ? 1.06
        : schedule.mood === 'dusk_tender' || schedule.mood === 'rain_pensive'
        ? 0.90
        : schedule.mood === 'excited_showcase'
        ? 1.08
        : 1.0;
    const tempoScale = clamp(schedule.tempoScale * moodTempo * rand(0.93, 1.08), 0.78, 1.22);

    const minCount = isShowcase ? 5 : schedule.motifsMin;
    const maxCount = isShowcase ? 8 : schedule.motifsMax;
    const targetMotifs = Math.max(2, Math.floor(rand(minCount, maxCount + 0.99)));

    const ctx: MotifBuildCtx = {
      baseHz: midHz,
      vigor: isShowcase ? Math.max(1.04, schedule.vigor) : schedule.vigor,
      tempoScale,
      profile,
      rng,
    };

    const bout: AvianMotif[] = [];

    // 1. Opening gesture (playful grace notes, tender subsong, or direct lyrical call)
    if (schedule.mood === 'rain_pensive' && !isShowcase && rng() < 0.60) {
      const m = buildMotifByArchetype('whisper_subsong', ctx);
      bout.push(m);
      this.recordMotif('whisper_subsong');
    } else if (isShowcase || rng() < 0.52) {
      const openKind: AvianMotifArchetype =
        rng() < 0.65 ? 'grace_chirp' : 'nightingale_crescendo';
      bout.push(buildMotifByArchetype(openKind, ctx));
      this.recordMotif(openKind);
    }

    // Build mood-weighted candidate pool
    const pool = profile.repertoire.map((entry) => {
      let w = entry.weight;
      if (schedule.mood === 'rain_pensive' || schedule.mood === 'dusk_tender') {
        if (
          entry.archetype === 'whisper_subsong' ||
          entry.archetype === 'sighing_glissando' ||
          entry.archetype === 'lyrical_flute_scoop' ||
          entry.archetype === 'pentatonic_melisma'
        ) {
          w *= 1.8;
        }
        if (entry.archetype === 'sparkle_trill' || entry.archetype === 'rising_salute') {
          w *= 0.45;
        }
      } else if (schedule.mood === 'dawn_euphoria' || isShowcase) {
        if (
          entry.archetype === 'huamei_signature_call' ||
          entry.archetype === 'biphonic_flourish' ||
          entry.archetype === 'pentatonic_melisma' ||
          entry.archetype === 'silky_trill_bloom' ||
          entry.archetype === 'pearl_cascade'
        ) {
          w *= 1.45;
        }
      }
      return { archetype: entry.archetype, weight: w };
    });

    // 2. Improvised thematic body with authentic avian Theme-and-Variation phrasing
    const transforms: MotifTransformKind[] = [
      'transpose_up',
      'ornament_embellish',
      'echo_humanized',
      'soft_answer',
      'invert_contour',
      'accelerando_spark',
      'rubato_stretch',
      'transpose_down',
    ];

    while (bout.length < targetMotifs - 1) {
      const kind = this.pickNovelArchetype(pool, rng);
      const motif = buildMotifByArchetype(kind, ctx);
      bout.push(motif);
      this.recordMotif(kind);

      // Laughingthrush / Songbird Theme-and-Variation repeat!
      if (bout.length < targetMotifs - 1 && rng() < profile.variationRepeatProb) {
        let tx = transforms[Math.floor(rng() * transforms.length)];
        // Occasional thrilling dual-bronchus biphonic harmony bloom on the repeat!
        if (rng() < profile.duetAffinity * 0.42) {
          tx = 'biphonic_bloom';
        }
        bout.push(MotifMutator.mutate(motif, tx, profile, rng));
      }
    }

    // 3. Poetic closing cadence (coda)
    if (bout.length < targetMotifs) {
      const codaChoices: AvianMotifArchetype[] =
        schedule.mood === 'dusk_tender' || schedule.mood === 'rain_pensive'
          ? ['sighing_glissando', 'ornate_coda']
          : ['ornate_coda', 'sighing_glissando', 'pearl_cascade', 'silky_trill_bloom'];
      const codaKind = codaChoices[Math.floor(rng() * codaChoices.length)];
      const coda = buildMotifByArchetype(codaKind, ctx);
      coda.breathAfterSec = rand(0.22, 0.34);
      bout.push(coda);
      this.recordMotif(codaKind);
    }

    return bout;
  }
}

// ============================================================================
// 7. CLASS: AvianSongDirector — REUSABLE REAL-TIME PERFORMANCE ENGINE
// ============================================================================

interface FlatSyllableEvent {
  motifArchetype: AvianMotifArchetype;
  syllable: AvianSyllable;
  startSec: number;
  endSec: number;
  gapEndSec: number;
  isMiniBreath: boolean;
  phaseSeed: number;
}

/**
 * General-purpose, reusable real-time birdsong performance director.
 * Plug in any `AvianSpeciesVocalProfile` (e.g., Chinese Hwamei, Mountain Thrush, Bulbul)
 * and call `update(dt, timeOfDay, weather)` every frame to drive both the physical
 * `SyrinxProcessor` AudioWorklet and synchronized 3D beak/throat/posture animations.
 */
export class AvianSongDirector {
  public readonly profile: AvianSpeciesVocalProfile;
  private readonly rng: () => number;
  private readonly grammar = new AvianRepertoireGrammar();

  private state: 'resting' | 'singing' = 'resting';
  private restTimerSec = 1.6;
  private timeline: FlatSyllableEvent[] = [];
  private timelineTotalSec = 0;
  private boutClockSec = 0;
  private excitedTimerSec = 0;
  private breathClockSec = 0;
  private totalBoutsSung = 0;
  private totalSyllablesComposed = 0;

  private readonly restSyrinx: AvianSyrinxFrame;
  private smoothSyrinx: AvianSyrinxFrame;
  private smoothBeak01 = 0;
  private smoothThroat01 = 0;
  private smoothSing01 = 0;
  private smoothPitch01 = 0.45;

  constructor(
    profile: AvianSpeciesVocalProfile,
    options?: { seed?: number; initialDelaySec?: number }
  ) {
    this.profile = profile;
    this.rng = createSeededRng(options?.seed);
    const o = profile.organ;
    this.restSyrinx = {
      pSub: 0.06,
      pIcas: 0.06,
      gapL: o.restGapL,
      gapR: o.restGapR,
      tensionL: 0.12,
      tensionR: 0.14,
      mtmStretchL: o.restMtmL,
      mtmStretchR: o.restMtmR,
      tracheaLenMm: o.tracheaLenMm,
      tracheaWidth: 1.0,
      oecVolMl: o.restOecMl,
      beakGapeMm: o.restBeakMm,
      targetFreqHz: 0,
    };
    this.smoothSyrinx = { ...this.restSyrinx };
    if (options?.initialDelaySec !== undefined) {
      this.restTimerSec = Math.max(0, options.initialDelaySec);
    } else {
      this.restTimerSec = 1.3 + this.rng() * 2.2;
    }
  }

  private randRange(lo: number, hi: number): number {
    return lo + this.rng() * (hi - lo);
  }

  /**
   * Immediately wakes/excites the bird into a lively showcase performance bout!
   */
  public excite(durationSec = 7.0): void {
    this.excitedTimerSec = Math.max(this.excitedTimerSec, durationSec);
    const showcaseSchedule: CircadianVocalSchedule = {
      activity: 1.0,
      isSleeping: false,
      mood: 'excited_showcase',
      pauseMinSec: 2.2,
      pauseMaxSec: 5.5,
      motifsMin: 5,
      motifsMax: 8,
      vigor: 1.08,
      tempoScale: 1.06,
    };
    this.startNewBout(showcaseSchedule, true);
  }

  private startNewBout(schedule: CircadianVocalSchedule, isShowcase: boolean): void {
    this.totalBoutsSung += 1;
    const motifs = this.grammar.composeBout(this.profile, schedule, isShowcase, this.rng);

    const events: FlatSyllableEvent[] = [];
    let cursor = 0;
    for (let m = 0; m < motifs.length; m++) {
      const motif = motifs[m];
      for (let s = 0; s < motif.syllables.length; s++) {
        const syl = motif.syllables[s];
        const isLastInMotif = s === motif.syllables.length - 1;
        const gap = isLastInMotif ? motif.breathAfterSec : syl.gapAfterSec;
        const startSec = cursor;
        const endSec = startSec + syl.durationSec;
        const gapEndSec = endSec + Math.max(0.015, gap);
        events.push({
          motifArchetype: motif.archetype,
          syllable: syl,
          startSec,
          endSec,
          gapEndSec,
          isMiniBreath: isLastInMotif || syl.miniBreathAfter,
          phaseSeed: this.rng() * Math.PI * 2,
        });
        cursor = gapEndSec;
      }
    }

    this.timeline = events;
    this.timelineTotalSec = cursor;
    this.totalSyllablesComposed += events.length;
    this.boutClockSec = 0;
    this.state = events.length > 0 ? 'singing' : 'resting';
  }

  /**
   * Converts an evaluated musical syllable point into exact 1:1 physical SyrinxProcessor parameters.
   */
  private mapToSyrinx(
    ev: FlatSyllableEvent,
    tBout: number
  ): {
    target: AvianSyrinxFrame;
    isBreathingIn: boolean;
    vocalEnergy: number;
    pitchNorm01: number;
  } {
    const o = this.profile.organ;
    const [minHz, maxHz] = this.profile.tessituraHz;
    const [crossLo, crossHi] = this.profile.crossoverHz;

    // Inter-syllable gap / inspiratory mini-breath window
    if (tBout >= ev.endSec) {
      const gapSpan = Math.max(0.02, ev.gapEndSec - ev.endSec);
      const bt = clamp((tBout - ev.endSec) / gapSpan, 0, 1);
      if (ev.isMiniBreath && gapSpan >= 0.08) {
        const inhEnv = Math.sin(bt * Math.PI);
        const pNeg = -0.32 * inhEnv;
        return {
          target: {
            ...this.restSyrinx,
            pSub: pNeg,
            pIcas: pNeg,
            gapL: 0.16,
            gapR: 0.16,
            oecVolMl: o.restOecMl * 1.10,
            beakGapeMm: o.restBeakMm + 0.55 * inhEnv,
            targetFreqHz: 0,
          },
          isBreathingIn: inhEnv > 0.18,
          vocalEnergy: 0,
          pitchNorm01: 0.35,
        };
      }
      // Brief crisp articulatory silence between notes of a cascade/call
      return {
        target: {
          ...this.restSyrinx,
          pSub: 0.12,
          pIcas: 0.12,
          gapL: 0.11,
          gapR: 0.11,
          targetFreqHz: 0,
        },
        isBreathingIn: false,
        vocalEnergy: 0,
        pitchNorm01: 0.42,
      };
    }

    const syl = ev.syllable;
    const evalPt = PitchContourEvaluator.evaluateSyllable(
      syl,
      tBout - ev.startSec,
      ev.phaseSeed
    );

    if (!evalPt.isPhonating) {
      return {
        target: { ...this.restSyrinx },
        isBreathingIn: false,
        vocalEnergy: 0,
        pitchNorm01: 0.4,
      };
    }

    const fMain = evalPt.freqHz;
    let fL = fMain;
    let fR = fMain;
    let useL = false;
    let useR = false;

    if (syl.voice === 'duet' && evalPt.harmonyHz !== null) {
      fL = fMain;
      fR = evalPt.harmonyHz;
      useL = true;
      useR = true;
    } else if (syl.voice === 'left') {
      fL = fMain;
      useL = true;
    } else if (syl.voice === 'right') {
      fR = fMain;
      useR = true;
    } else {
      // Seamless oscine L/R bronchus crossover around species crossoverHz
      const handoff = smoothstep(crossLo, crossHi, fMain);
      useL = handoff < 0.86;
      useR = handoff > 0.14;
    }

    // Sweet liquid pressure curve: stays cleanly in pure musical oscine range (0.58–2.22 kPa)
    const pSub = clamp(0.46 + 1.66 * evalPt.energy01, 0.06, 2.38);
    const activeL = useL && pSub > 0.50;
    const activeR = useR && pSub > 0.50;

    // Exact SyrinxProcessor valve calibration: 0.080 mm active, -0.048 mm adducted closed
    const gapL = activeL ? 0.080 : activeR ? -0.048 : o.restGapL;
    const gapR = activeR ? 0.080 : activeL ? -0.048 : o.restGapR;

    const mtmL = clamp(o.restMtmL + syl.timbreBright + (activeL ? 0.03 : 0), 0.78, 1.12);
    const mtmR = clamp(o.restMtmR + syl.timbreBright + (activeR ? 0.03 : 0), 0.80, 1.14);

    const tensionL = solveAvianTension(fL, 'L', o, mtmL, pSub, 0.080);
    const tensionR = solveAvianTension(fR, 'R', o, mtmR, pSub, 0.080);

    const dominantHz =
      activeL && activeR ? 0.45 * fL + 0.55 * fR : activeR ? fR : fL;
    const { oecVolMl, beakGapeMm } = solveAvianOec(dominantHz, o);

    const pitchNorm01 = clamp((dominantHz - minHz) / Math.max(400, maxHz - minHz), 0, 1);
    const tracheaLenMm = o.tracheaLenMm - pitchNorm01 * 2.5;
    const effectiveBeakMm = lerp(
      o.restBeakMm,
      beakGapeMm,
      clamp(evalPt.energy01 * 1.08, 0.16, 1.0)
    );

    return {
      target: {
        pSub,
        pIcas: pSub,
        gapL,
        gapR,
        tensionL,
        tensionR,
        mtmStretchL: mtmL,
        mtmStretchR: mtmR,
        tracheaLenMm,
        tracheaWidth: 1.0,
        oecVolMl,
        beakGapeMm: effectiveBeakMm,
        targetFreqHz: dominantHz,
      },
      isBreathingIn: false,
      vocalEnergy: clamp(evalPt.energy01, 0, 1),
      pitchNorm01,
    };
  }

  /**
   * Advances the director by `dt` seconds and returns synchronized syrinx + animation cues.
   */
  public update(dt: number, timeOfDay: number, weather: WeatherMode): AvianDirectorFrame {
    const safeDt = clamp(dt, 0, 0.1);
    this.breathClockSec += safeDt;

    if (this.excitedTimerSec > 0) {
      this.excitedTimerSec = Math.max(0, this.excitedTimerSec - safeDt);
    }

    const schedule = this.profile.evaluateCircadian(timeOfDay, weather);
    const isAwakeByExcite = this.excitedTimerSec > 0.05;
    const effectiveSleeping =
      schedule.isSleeping && !isAwakeByExcite && this.state === 'resting';

    let target: AvianSyrinxFrame = this.restSyrinx;
    let isBreathingIn = false;
    let vocalEnergy = 0;
    let pitchNorm01 = 0.42;
    let currentMotif: AvianAnimCue['currentMotif'] = effectiveSleeping ? 'sleep' : 'idle';

    if (this.state === 'singing') {
      this.boutClockSec += safeDt;
      if (this.boutClockSec >= this.timelineTotalSec || this.timeline.length === 0) {
        this.state = 'resting';
        // Natural non-uniform silence between bouts (occasionally a quick playful reply, occasionally a longer contemplative rest)
        const basePause = this.randRange(schedule.pauseMinSec, schedule.pauseMaxSec);
        const rhythmJitter = this.rng() < 0.25 ? 0.62 : this.rng() < 0.20 ? 1.38 : 1.0;
        this.restTimerSec = basePause * rhythmJitter;
      } else {
        // Locate current active syllable event
        let activeEv: FlatSyllableEvent | null = null;
        for (let i = 0; i < this.timeline.length; i++) {
          if (this.boutClockSec < this.timeline[i].gapEndSec) {
            activeEv = this.timeline[i];
            break;
          }
        }
        if (activeEv) {
          const mapped = this.mapToSyrinx(activeEv, this.boutClockSec);
          target = mapped.target;
          isBreathingIn = mapped.isBreathingIn;
          vocalEnergy = mapped.vocalEnergy;
          pitchNorm01 = mapped.pitchNorm01;
          currentMotif = activeEv.motifArchetype;
        }
      }
    } else {
      if (!effectiveSleeping && schedule.activity > 0.02) {
        this.restTimerSec -= safeDt;
        if (this.restTimerSec <= 0) {
          if (this.rng() < 0.30 + schedule.activity * 0.68) {
            this.startNewBout(schedule, false);
          } else {
            this.restTimerSec = this.randRange(
              schedule.pauseMinSec * 0.48,
              schedule.pauseMaxSec * 0.72
            );
          }
        }
      } else {
        this.restTimerSec = Math.min(this.restTimerSec, 4.5);
      }

      const restBreath = 0.5 + 0.5 * Math.sin(this.breathClockSec * 2.65);
      target = {
        ...this.restSyrinx,
        pSub: 0.05 + 0.03 * restBreath,
        pIcas: 0.05 + 0.03 * restBreath,
        oecVolMl: this.profile.organ.restOecMl * (0.96 + 0.06 * restBreath),
      };
    }

    // Smooth physiological viscoelastic muscle actuation (crisp trills, zero clicks)
    const alphaFast = 1 - Math.exp(-40 * safeDt);
    const alphaMed = 1 - Math.exp(-24 * safeDt);
    const s = this.smoothSyrinx;
    s.pSub += (target.pSub - s.pSub) * alphaFast;
    s.pIcas += (target.pIcas - s.pIcas) * alphaFast;
    s.gapL += (target.gapL - s.gapL) * alphaFast;
    s.gapR += (target.gapR - s.gapR) * alphaFast;
    s.tensionL += (target.tensionL - s.tensionL) * alphaFast;
    s.tensionR += (target.tensionR - s.tensionR) * alphaFast;
    s.mtmStretchL += (target.mtmStretchL - s.mtmStretchL) * alphaMed;
    s.mtmStretchR += (target.mtmStretchR - s.mtmStretchR) * alphaMed;
    s.tracheaLenMm += (target.tracheaLenMm - s.tracheaLenMm) * alphaMed;
    s.tracheaWidth = 1.0;
    s.oecVolMl += (target.oecVolMl - s.oecVolMl) * alphaFast;
    s.beakGapeMm += (target.beakGapeMm - s.beakGapeMm) * alphaFast;
    s.targetFreqHz = target.targetFreqHz;

    const o = this.profile.organ;
    const targetBeak01 = clamp((s.beakGapeMm - o.restBeakMm) / 8.2, 0, 1);
    const oecNorm = clamp(
      (s.oecVolMl - o.minSongOecMl) / Math.max(0.05, o.maxSongOecMl - o.minSongOecMl),
      0,
      1
    );
    const targetThroat01 = clamp(
      vocalEnergy * 0.72 + (vocalEnergy > 0.08 ? (1 - oecNorm) * 0.28 : 0),
      0,
      1
    );

    const animAlpha = 1 - Math.exp(-24 * safeDt);
    this.smoothBeak01 += (targetBeak01 - this.smoothBeak01) * animAlpha;
    this.smoothThroat01 += (targetThroat01 - this.smoothThroat01) * animAlpha;
    this.smoothSing01 += (vocalEnergy - this.smoothSing01) * animAlpha;
    this.smoothPitch01 += (pitchNorm01 - this.smoothPitch01) * (1 - Math.exp(-12 * safeDt));

    return {
      syrinx: { ...s },
      anim: {
        isSinging: this.state === 'singing' && vocalEnergy > 0.06,
        isSleeping: effectiveSleeping,
        isBreathingIn,
        singIntensity: clamp(this.smoothSing01, 0, 1),
        beakOpen01: clamp(this.smoothBeak01, 0, 1),
        throatPulse01: clamp(this.smoothThroat01, 0, 1),
        pitchNorm01: clamp(this.smoothPitch01, 0, 1),
        excitedLevel: clamp(this.excitedTimerSec / 4.0, 0, 1),
        currentMotif,
        circadianActivity: schedule.activity,
      },
    };
  }

  public getDebugStats(): {
    state: string;
    totalBoutsSung: number;
    totalSyllablesComposed: number;
    restTimerSec: number;
  } {
    return {
      state: this.state,
      totalBoutsSung: this.totalBoutsSung,
      totalSyllablesComposed: this.totalSyllablesComposed,
      restTimerSec: this.restTimerSec,
    };
  }
}

// ============================================================================
// 8. REUSABLE CIRCADIAN EVALUATOR & BUILT-IN SPECIES VOCAL PROFILES
// ============================================================================

export function evaluatePasserineCircadianSchedule(
  timeOfDay: number,
  weather: WeatherMode
): CircadianVocalSchedule {
  const h = ((timeOfDay % 24) + 24) % 24;

  if (h < 5.1 || h >= 19.35) {
    return {
      activity: 0,
      isSleeping: true,
      mood: 'dusk_tender',
      pauseMinSec: 30,
      pauseMaxSec: 60,
      motifsMin: 1,
      motifsMax: 2,
      vigor: 0.48,
      tempoScale: 0.88,
    };
  }

  let baseActivity = 0.5;
  let vigor = 0.88;
  let mood: AvianMood = 'courtyard_lyrical';
  let tempoScale = 1.0;

  if (h >= 5.1 && h < 5.75) {
    const u = (h - 5.1) / 0.65;
    baseActivity = 0.22 + 0.66 * u * u;
    vigor = 0.76 + 0.24 * u;
    mood = 'dawn_euphoria';
    tempoScale = 0.98 + 0.06 * u;
  } else if (h >= 5.75 && h <= 9.35) {
    const peak = Math.exp(-Math.pow((h - 7.15) / 1.9, 2));
    baseActivity = 0.78 + 0.22 * peak;
    vigor = 0.96 + 0.14 * peak;
    mood = 'dawn_euphoria';
    tempoScale = 1.04;
  } else if (h > 9.35 && h <= 14.6) {
    const middayDip = Math.exp(-Math.pow((h - 13.0) / 1.5, 2));
    baseActivity = 0.56 - 0.14 * middayDip;
    vigor = 0.86 - 0.08 * middayDip;
    mood = 'courtyard_lyrical';
    tempoScale = 0.96;
  } else if (h > 14.6 && h <= 17.2) {
    const aftPeak = Math.exp(-Math.pow((h - 15.9) / 1.15, 2));
    baseActivity = 0.50 + 0.18 * aftPeak;
    vigor = 0.88 + 0.08 * aftPeak;
    mood = 'courtyard_lyrical';
    tempoScale = 1.0;
  } else {
    const u = clamp((19.35 - h) / 2.15, 0, 1);
    baseActivity = 0.06 + 0.46 * u * u;
    vigor = 0.64 + 0.24 * u;
    mood = 'dusk_tender';
    tempoScale = 0.90;
  }

  if (weather === 'rain') {
    baseActivity *= 0.32;
    vigor *= 0.78;
    mood = 'rain_pensive';
    tempoScale *= 0.92;
  }

  const clamped = clamp(baseActivity, 0, 1);
  return {
    activity: clamped,
    isSleeping: false,
    mood,
    pauseMinSec: 2.3 + (1 - clamped) * 9.2,
    pauseMaxSec: 6.0 + (1 - clamped) * 18.5,
    motifsMin: clamped > 0.7 ? 4 : clamped > 0.38 ? 3 : 2,
    motifsMax: clamped > 0.7 ? 7 : clamped > 0.38 ? 5 : 4,
    vigor,
    tempoScale,
  };
}

/**
 * Profile 1: Chinese Hwamei (中华画眉鸟, Garrulax canorus, ~56 g virtuoso laughingthrush).
 * Famous for extraordinarily rich, liquid, ringing, endlessly varied melodic improvisation (清脆婉转多变).
 */
export const CHINESE_HWAMEI_PROFILE: AvianSpeciesVocalProfile = {
  id: 'chinese_hwamei',
  organ: {
    id: 'chinese_hwamei',
    name: '中华画眉鸟',
    latin: 'Garrulax canorus',
    bodyMassG: 56.0,
    tracheaLenMm: 42.5,
    trachDiamMm: 2.80,
    massLMg: 0.56,
    massRMg: 0.19,
    stiffLK0: 45.0,
    stiffRK0: 86.0,
    gammaL: 3.85,
    gammaR: 3.85,
    labialThickMmL: 0.43,
    labialThickMmR: 0.28,
    asymRestL: 0.03,
    asymRestR: 0.03,
    oecNeckMm: 2.40,
    restOecMl: 0.62,
    minSongOecMl: 0.10,
    maxSongOecMl: 1.42,
    beakGapeScale: 1.0,
    restBeakMm: 0.35,
    restMtmL: 0.90,
    restMtmR: 0.92,
    restGapL: 0.092,
    restGapR: 0.092,
    tractCoupling: 0.030,
    hornPickup: 0.0,
    hasBronchidesmus: 0.0,
    leftGain: 1.05,
    rightGain: 1.03,
  },
  tessituraHz: [1320, 4450],
  crossoverHz: [2280, 2760],
  // Chinese pentatonic + natural harmonic sweet intervals (宫商角徵羽)
  scaleRatios: [0.89, 1.0, 1.125, 1.25, 1.5, 1.667, 1.875],
  repertoire: [
    { archetype: 'huamei_signature_call', weight: 1.65 },
    { archetype: 'lyrical_flute_scoop', weight: 1.60 },
    { archetype: 'pentatonic_melisma', weight: 1.55 },
    { archetype: 'liquid_warble', weight: 1.45 },
    { archetype: 'question_answer_duet', weight: 1.35 },
    { archetype: 'pearl_cascade', weight: 1.30 },
    { archetype: 'water_bubble_roll', weight: 1.25 },
    { archetype: 'silky_trill_bloom', weight: 1.20 },
    { archetype: 'nightingale_crescendo', weight: 1.15 },
    { archetype: 'biphonic_flourish', weight: 1.10 },
    { archetype: 'double_call', weight: 1.05 },
    { archetype: 'flute_arch', weight: 1.05 },
    { archetype: 'rising_salute', weight: 0.95 },
    { archetype: 'sighing_glissando', weight: 0.90 },
    { archetype: 'whisper_subsong', weight: 0.65 },
  ],
  variationRepeatProb: 0.48,
  duetAffinity: 0.55,
  evaluateCircadian: evaluatePasserineCircadianSchedule,
};

/**
 * Profile 2: Ethereal Mountain Thrush (山林画眉/鸫鸟 — serene two-voice woodland flute duet).
 * Reusable out-of-the-box for forest or garden songbird scenes!
 */
export const MOUNTAIN_THRUSH_PROFILE: AvianSpeciesVocalProfile = {
  id: 'mountain_thrush',
  organ: {
    ...CHINESE_HWAMEI_PROFILE.organ,
    id: 'mountain_thrush',
    name: '山林鸫鸟',
    latin: 'Turdus / Hylocichla',
    bodyMassG: 48.0,
    tracheaLenMm: 40.5,
    massLMg: 0.58,
    massRMg: 0.18,
    stiffLK0: 44.0,
    stiffRK0: 88.0,
  },
  tessituraHz: [1420, 4800],
  crossoverHz: [2400, 2900],
  scaleRatios: [1.0, 1.125, 1.25, 1.5, 1.667, 2.0],
  repertoire: [
    { archetype: 'lyrical_flute_scoop', weight: 1.8 },
    { archetype: 'biphonic_flourish', weight: 1.6 },
    { archetype: 'nightingale_crescendo', weight: 1.4 },
    { archetype: 'sighing_glissando', weight: 1.3 },
    { archetype: 'silky_trill_bloom', weight: 1.2 },
    { archetype: 'pentatonic_melisma', weight: 1.1 },
  ],
  variationRepeatProb: 0.35,
  duetAffinity: 0.80,
  evaluateCircadian: evaluatePasserineCircadianSchedule,
};

/**
 * Profile 3: Lingnan Light-Vented Bulbul (岭南白头鹎, Pycnonotus sinensis — cheerful sprightly courtyard singer).
 */
export const LINGNAN_BULBUL_PROFILE: AvianSpeciesVocalProfile = {
  id: 'lingnan_bulbul',
  organ: {
    ...CHINESE_HWAMEI_PROFILE.organ,
    id: 'lingnan_bulbul',
    name: '岭南白头鹎',
    latin: 'Pycnonotus sinensis',
    bodyMassG: 32.0,
    tracheaLenMm: 35.0,
    trachDiamMm: 2.35,
    massLMg: 0.36,
    massRMg: 0.15,
    stiffLK0: 54.0,
    stiffRK0: 96.0,
    restOecMl: 0.44,
    minSongOecMl: 0.08,
    maxSongOecMl: 1.05,
  },
  tessituraHz: [1850, 5200],
  crossoverHz: [2800, 3400],
  scaleRatios: [1.0, 1.125, 1.26, 1.414, 1.5, 1.78],
  repertoire: [
    { archetype: 'grace_chirp', weight: 1.5 },
    { archetype: 'double_call', weight: 1.6 },
    { archetype: 'pearl_cascade', weight: 1.4 },
    { archetype: 'liquid_warble', weight: 1.35 },
    { archetype: 'question_answer_duet', weight: 1.2 },
    { archetype: 'water_bubble_roll', weight: 1.15 },
  ],
  variationRepeatProb: 0.55,
  duetAffinity: 0.30,
  evaluateCircadian: evaluatePasserineCircadianSchedule,
};
