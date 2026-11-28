/**
 * @fileoverview Autonomous Songbird Songs & Natural-History Chromolithograph Plumage Profiles
 *
 * Calibrated directly against peer-reviewed syringeal physiology & empirical field/lab recordings:
 *  - Wood Thrush (Hylocichla mustelina): Greenewalt (1968), Suthers (1990), Zollinger et al. (2008)
 *  - Northern Cardinal (Cardinalis cardinalis): Suthers (1990 Nature), Riede et al. (2006 PNAS)
 *  - Waterslager Canary (Serinus canaria, Belgian Waterslager): Nottebohm & Nottebohm (1976), Hartley & Suthers (1989)
 *  - Zebra Finch (Taeniopygia guttata): Fee et al. (1998), Goller & Cooper (2004), Düring et al. (2013), Amador et al. (2013)
 *  - Common Nightingale (Luscinia megarhynchos): Todt & Hultsch (1998), Goller & Larsen (2002), Brumm (2004)
 *  - Superb Lyrebird (Menura novaehollandiae): Ames (1971), Zann & Dunstan (2008), Dalziell et al. (2013), Dalziell & Welbergen (2016)
 */

export const SOUND_SPEED_AVIAN_MPS = 356.0; // Water-saturated expired avian air-sac gas (41°C, 4.5% CO2, 100% RH)

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Physical Titze (1988) PTP mirror used by solveSpeciesTension so aerodynamic collagen stiffening
 * and Van der Pol relaxation period shifts match syrinx-worklet.js to <15 cents.
 */
function estimateBranchPtp(organ, branch, effGapMm = 0.080, tensionEst = 0.35) {
  const isL = branch === 'L';
  const thick = clamp(isL ? (organ.labialThickMmL ?? 0.38) : (organ.labialThickMmR ?? 0.30), 0.18, 1.10);
  const thickFactor = clamp(0.76 + 0.10 / (thick + 0.16), 0.84, 1.12);
  const basePtp = (0.39 + 0.27 * clamp(tensionEst + 0.25, 0.0, 1.8)) * thickFactor;
  const delta = effGapMm - 0.080;
  if (effGapMm >= 0.080) return basePtp * (1.0 + (delta / 0.135) ** 2);
  if (effGapMm > 0.005) return basePtp * (1.0 + 0.42 * ((0.080 - effGapMm) / 0.080) ** 2);
  return basePtp * 1.45;
}

/**
 * Closed-form + 2-pass physical inverse solver for a species' specific hemi-syrinx tissue mechanics
 * (Newton's 2nd law omega0 = sqrt(k_eff / m_labia) + Fung exponential collagen law + nonlinear Van der Pol /
 * Duffing / SNILC / mucosal-wall limit-cycle period calibration).
 */
export function solveSpeciesTension(organ, branch, targetFreqHz, mtmStretch = 0.80, pSubEst = 1.60, gapEst = 0.082) {
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

  // Two-pass tension solve accounting for tension-dependent PTP, Van der Pol relaxation slowing,
  // SNILC saddle-node ghost bottleneck, Duffing c3 stiffening, & wall-collision rebound
  let ten = 0.25;
  for (let pass = 0; pass < 2; pass++) {
    const ptp = estimateBranchPtp(organ, branch, gapEst, ten);
    const excessP = Math.max(0.0, pSubPos - ptp);
    const muEst = clamp(1.16 * Math.pow(excessP / (ptp + 0.34), 0.68), 0.0, 1.32);

    // Nonlinear limit-cycle frequency ratio (omega_linear / omega_actual):
    //   - Van der Pol relaxation slows period by ~0.040 * mu^2
    //   - SNILC quadraticeta slows period near ghost bottleneck (+0.29 * eta^2), partly offset by c3 & wall rebound
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

/** Backwards-compatible helpers bound to Wood Thrush organ defaults if called standalone */
export function freqToTensionL(fHz, mtmStretch = 0.88, pSubEst = 1.65) {
  return solveSpeciesTension(SPECIES_PRESETS[0].organ, 'L', fHz, mtmStretch, pSubEst);
}

export function freqToTensionR(fHz, mtmStretch = 0.90, pSubEst = 1.65) {
  return solveSpeciesTension(SPECIES_PRESETS[0].organ, 'R', fHz, mtmStretch, pSubEst);
}

/**
 * Species-specific physical shunt-compliance OEC inverse tracker (Riede et al., 2006 PNAS;
 * Fletcher et al., 2006 JASA; Hoese et al., 2000 PNAS; Ohms et al., 2010):
 *  - Monotonically widens beak gape with frequency from narrow low-note whistles up to wide high-note gapes
 *  - Iteratively includes deepEsophNeck so large cervical-esophageal volumes (>1.45 mL in Lyrebird) match syrinx-worklet.js 1:1!
 */
export function solveSpeciesOec(organ, targetFreqHz) {
  const f = clamp(targetFreqHz, 520, 7000);
  const gapeScale = organ.beakGapeScale || 1.0;
  let baseGapeMm;
  if (f < 1200) {
    baseGapeMm = lerp(1.25, 2.45, clamp((f - 520) / 680, 0, 1));
  } else {
    baseGapeMm = lerp(2.45, 10.6, Math.pow(clamp((f - 1200) / 5400, 0, 1), 0.88));
  }
  const beakGapeMm = clamp(baseGapeMm * gapeScale, 0.45, 24.0);
  const beakAreaM2 = Math.pow(beakGapeMm * 0.001, 1.28) * 0.0068 + 2.4e-7;
  const aBeakM = Math.sqrt(beakAreaM2 / Math.PI);
  const neckBaseM = (organ.oecNeckMm || 2.2) * 0.001;
  const kConst = SOUND_SPEED_AVIAN_MPS / (2.0 * Math.PI);
  const minVol = organ.minSongOecMl || 0.08;
  const maxVol = organ.maxSongOecMl || 1.38;

  let oecVolMl = clamp((((kConst / f) ** 2 * beakAreaM2) / (neckBaseM + 1.70 * aBeakM)) * 1e6, minVol, maxVol);
  for (let iter = 0; iter < 2; iter++) {
    const deepEsophNeck = 0.022 * Math.max(0.0, oecVolMl - 1.45);
    const neckLenM = neckBaseM + deepEsophNeck + 1.70 * aBeakM;
    oecVolMl = clamp((((kConst / f) ** 2 * beakAreaM2) / neckLenM) * 1e6, minVol, maxVol);
  }
  return { oecVolMl, beakGapeMm };
}

export const SPECIES_PRESETS = [
  {
    id: 'wood_thrush',
    commonName: 'Wood Thrush',
    scientificName: 'Hylocichla mustelina',
    subtitle: 'Warm Two-Voice Flute Duet',
    plateNumber: 'PLATE I',
    botanicalPlant: 'Flowering Dogwood',
    badgeColor: '#9E5431',
    plumage: {
      crown: '#B85020',
      nape: '#98542B',
      body: '#6E6142',
      wing: '#635336',
      wingEdge: '#443520',
      wingBar: '#DFC9AA',
      tailColor: '#6B583B',
      breast: '#FCF9F0',
      bellyShade: '#EDE2CE',
      cheek: '#EAD9BF',
      beakUpper: '#4A3527',
      beakLower: '#CFA27C',
      eyeIris: '#24140D',
      eyeRing: '#FAF4E6',
      eyeRingAlpha: 0.90,
      legColor: '#CCA07E',
      hasCrest: false,
      hasSpots: true,
      hasMask: false,
      hasZebraBars: false,
      cheekPatch: null,
      billStyle: 'slender',
      billLen: 0.168,
      culmenDepth: 0.066,
      gonysDepth: -0.004,
      culmenArch: 0.008,
      morph: { chestTrim: 0.98, dorsalTrim: 0.96, bellyTuck: 0.98, tailLenMul: 1.06, headSlim: 0.96, wingReach: 1.04 },
      botanicalType: 'dogwood',
    },
    // Comparative physical organ morphometry (48 g Hylocichla mustelina — lateralized dual-flute Turdidae oscine)
    organ: {
      bodyMassG: 48.0,
      clade: 'oscine',
      intrinsicMusclePairs: 4,
      tracheaLenMm: 40.5,
      trachDiamMm: 2.65,
      trachRings: 13,
      tympanumFusedRings: 4,
      tympanumScale: 1.12,
      hasSemilunaris: false,
      hasBronchidesmus: false,
      massLMg: 0.58,
      massRMg: 0.18,
      stiffLK0: 44.0,
      stiffRK0: 88.0,
      gammaL: 3.85,
      gammaR: 3.85,
      labialThickMmL: 0.44,
      labialThickMmR: 0.28,
      asymRestL: 0.03,
      asymRestR: 0.03,
      restMtmL: 0.88,
      restMtmR: 0.90,
      restGapL: 0.088,
      restGapR: 0.086,
      restOecMl: 0.62,
      minSongOecMl: 0.10,
      maxSongOecMl: 1.38,
      oecNeckMm: 2.35,
      restBeakMm: 0.35,
      beakGapeScale: 1.0,
      muscleSpeedScale: 1.08,
      warbleHz: 18.5,
      tractCoupling: 0.030,
      leftGain: 1.04,
      rightGain: 1.02,
      leftMuscleScale: 1.08,
      rightMuscleScale: 0.96,
      leftBronchusScale: 1.16,
      rightBronchusScale: 0.88,
      leftPadScale: 1.22,
      rightPadScale: 0.84,
    },
    baseTracheaMm: 40.5,
    cycleDuration: 4.5,
    evaluate(timeSec) {
      const t = timeSec % 4.5;
      // Classic 3-part Wood Thrush song (Greenewalt 1968; Suthers 1990; Zollinger et al. 2008):
      //   Two evenly spaced woodland phrases (0.12-1.40s and 2.34-3.62s) with inspiratory mini-breaths:
      //   1. Soft pianissimo low contralto introductory "bup-bup" pips (1620 -> 1700 Hz, expanded OEC)
      //   2. Rich two-voice "ee-oh-lay" flute duet (Left warm contralto + Right soprano flute)
      //   3. High 4.0-5.75 kHz independent two-voice FM terminal trill (non-harmonic L/R arches!)
      let pSub = 0.06;
      let pIcas = 0.06;
      let gapL = 0.095;
      let gapR = 0.095;
      let fL = 1720;
      let fR = 3340;
      const mtmL = 0.90;
      const mtmR = 0.92;
      let oecFreq = 2250;
      let singing = false;

      const evalPhrase = (lt, variant) => {
        if (lt >= 0.0 && lt < 0.072) {
          // Pianissimo introductory low "bup" 1
          singing = true;
          const s = lt / 0.072;
          pSub = 0.52 + 0.34 * Math.sin(s * Math.PI);
          pIcas = pSub;
          gapL = 0.080;
          gapR = -0.048;
          fL = variant === 0 ? 1620 : 1560;
          oecFreq = fL;
        } else if (lt >= 0.072 && lt < 0.122) {
          // Quick inspiratory mini-breath
          pSub = -0.28;
          pIcas = -0.26;
          gapL = 0.20;
          gapR = 0.20;
        } else if (lt >= 0.122 && lt < 0.198) {
          // Pianissimo introductory low "bup" 2
          singing = true;
          const s = (lt - 0.122) / 0.076;
          pSub = 0.56 + 0.42 * Math.sin(s * Math.PI);
          pIcas = pSub;
          gapL = 0.080;
          gapR = -0.048;
          fL = variant === 0 ? 1700 : 1640;
          oecFreq = fL;
        } else if (lt >= 0.198 && lt < 0.285) {
          // Deeper preparatory inspiratory mini-breath before central flute chord
          pSub = -0.36;
          pIcas = -0.34;
          gapL = 0.22;
          gapR = 0.22;
        } else if (lt >= 0.285 && lt < 0.745) {
          // Central "ee-oh-lay" warm two-voice woodland flute duet
          singing = true;
          const s = (lt - 0.285) / 0.46;
          const env = smoothstep(0.0, 0.10, s) * (1.0 - smoothstep(0.88, 1.0, s));
          pSub = 0.68 + 1.46 * env;
          pIcas = pSub;
          if (variant === 0) {
            gapR = s < 0.64 ? 0.084 : -0.048;
            gapL = s > 0.26 ? 0.084 : -0.048;
            fR = lerp(3460, 3340, s);
            fL = s < 0.52 ? lerp(2180, 2540, clamp((s - 0.26) / 0.26, 0, 1)) : 2540;
            oecFreq = s < 0.48 ? 3380 : 2540;
          } else {
            gapL = 0.084;
            gapR = (s > 0.22 && s < 0.68) ? 0.082 : -0.048;
            fL = s < 0.36
              ? lerp(2120, 2680, smoothstep(0.0, 0.36, s))
              : s < 0.50
                ? lerp(2680, 1810, (s - 0.36) / 0.14)
                : 1810;
            fR = 3120;
            oecFreq = s < 0.50 ? 2920 : fL;
          }
        } else if (lt >= 0.745 && lt < 0.825) {
          // Inspiratory mini-breath before high terminal trill
          pSub = -0.34;
          pIcas = -0.32;
          gapL = 0.21;
          gapR = 0.21;
        } else if (lt >= 0.825 && lt < 1.25) {
          // High 4.0-5.75 kHz independent two-voice FM terminal trill (Zollinger et al. 2008):
          // Left & Right bronchi trace independent rapid FM arches at incommensurate rates (27 Hz vs 31.5 Hz)!
          singing = true;
          const s = (lt - 0.825) / 0.425;
          const env = smoothstep(0.0, 0.09, s) * (1.0 - smoothstep(0.86, 1.0, s));
          const dtTrill = lt - 0.825;
          const archL = 0.5 - 0.5 * Math.cos(dtTrill * 27.0 * 2.0 * Math.PI);
          const archR = 0.5 + 0.5 * Math.sin(dtTrill * 31.5 * 2.0 * Math.PI);
          pSub = 0.72 + 1.48 * env * (0.64 + 0.36 * archL);
          pIcas = pSub;
          gapL = 0.080;
          gapR = 0.084;
          fL = (variant === 0 ? 3960 : 4080) + 520 * archL;
          fR = (variant === 0 ? 4920 : 5120) + 640 * archR;
          oecFreq = 0.45 * fL + 0.55 * fR;
        }
      };

      if (t >= 0.12 && t < 1.38) {
        evalPhrase(t - 0.12, 0);
      } else if (t >= 2.34 && t < 3.60) {
        evalPhrase(t - 2.34, 1);
      }

      const oec = solveSpeciesOec(this.organ, oecFreq);
      const singBlend = singing ? smoothstep(0.14, 0.62, pSub) : 0.0;
      return {
        pSub,
        pIcas,
        gapL,
        gapR,
        tensionL: solveSpeciesTension(this.organ, 'L', fL, mtmL, Math.max(pSub, 0.85), Math.max(0.04, gapL)),
        tensionR: solveSpeciesTension(this.organ, 'R', fR, mtmR, Math.max(pSub, 1.45), Math.max(0.04, gapR)),
        mtmStretchL: mtmL,
        mtmStretchR: mtmR,
        tracheaLenMm: 40.5 - 0.6 * smoothstep(1850, 5200, oecFreq),
        tracheaWidth: 1.0,
        oecVolMl: lerp(this.organ.restOecMl, oec.oecVolMl, singBlend),
        beakGapeMm: lerp(this.organ.restBeakMm, oec.beakGapeMm, singBlend),
      };
    },
  },

  {
    id: 'northern_cardinal',
    commonName: 'Northern Cardinal',
    scientificName: 'Cardinalis cardinalis',
    subtitle: 'Sweeping Whistle Handoff',
    plateNumber: 'PLATE II',
    botanicalPlant: 'Sweetbriar & Spring Hawthorn',
    badgeColor: '#C8372D',
    plumage: {
      crown: '#DC2C20',
      nape: '#AE241B',
      body: '#B82C22',
      wing: '#96221B',
      wingEdge: '#681510',
      wingBar: '#DE4A3A',
      tailColor: '#A4241C',
      breast: '#EA3829',
      bellyShade: '#CA2B1F',
      cheek: '#DF3325',
      beakUpper: '#E2482C',
      beakLower: '#F05E3E',
      eyeIris: '#2B120E',
      eyeRing: '#361916',
      eyeRingAlpha: 0.42,
      legColor: '#84594B',
      hasCrest: true,
      hasSpots: false,
      hasMask: true,
      hasZebraBars: false,
      cheekPatch: null,
      billStyle: 'conical',
      billLen: 0.138,
      culmenDepth: 0.094,
      gonysDepth: 0.022,
      culmenArch: 0.022,
      morph: { chestTrim: 0.97, dorsalTrim: 0.94, bellyTuck: 0.96, tailLenMul: 1.28, headSlim: 0.96, wingReach: 1.02 },
      botanicalType: 'briar',
    },
    // Comparative physical organ morphometry (45 g Cardinalis cardinalis — steep bilateral register-split oscine, Suthers 1990 & Riede 2006)
    organ: {
      bodyMassG: 45.0,
      clade: 'oscine',
      intrinsicMusclePairs: 4,
      tracheaLenMm: 42.5,
      trachDiamMm: 2.75,
      trachRings: 15,
      tympanumFusedRings: 4,
      tympanumScale: 1.16,
      hasSemilunaris: false,
      hasBronchidesmus: false,
      massLMg: 0.68,
      massRMg: 0.15,
      stiffLK0: 46.0,
      stiffRK0: 104.0,
      gammaL: 3.95,
      gammaR: 3.95,
      labialThickMmL: 0.48,
      labialThickMmR: 0.24,
      asymRestL: 0.03,
      asymRestR: 0.02,
      restMtmL: 0.88,
      restMtmR: 0.92,
      restGapL: 0.088,
      restGapR: 0.011,
      restOecMl: 0.66,
      minSongOecMl: 0.09,
      maxSongOecMl: 1.42,
      oecNeckMm: 2.55,
      restBeakMm: 0.38,
      beakGapeScale: 1.08,
      muscleSpeedScale: 1.22,
      warbleHz: 19.5,
      tractCoupling: 0.032,
      leftGain: 1.24,
      rightGain: 1.18,
      leftMuscleScale: 1.12,
      rightMuscleScale: 1.04,
      leftBronchusScale: 1.26,
      rightBronchusScale: 0.80,
      leftPadScale: 1.32,
      rightPadScale: 0.76,
    },
    baseTracheaMm: 42.5,
    cycleDuration: 3.9,
    evaluate(timeSec) {
      const t = timeSec % 3.9;
      // Suthers (1990 Nature) & Riede et al. (2006 PNAS):
      // Northern Cardinal executes unbroken >2-octave pure whistle sweeps (1.46 kHz <-> 6.38 kHz)
      // by handing the EXACT SAME pitch seamlessly between Right (>3.6 kHz) and Left (<3.6 kHz)
      // bronchi with positive mid-handoff aperture overlap (~12 ms) so zero dropout occurs,
      // while inversely expanding/contracting the dorsal cervical-esophageal OEC (0.10 <-> 1.25 mL)!
      let pSub = 0.05;
      let pIcas = 0.05;
      let gapL = 0.095;
      let gapR = 0.095;
      let fL = 1850;
      let fR = 4450;
      const mtmL = 0.90;
      const mtmR = 0.92;
      let fTrack = 2400;
      let singing = false;

      const applySeamlessHandoff = (fSweep) => {
        // Overlapping pitch-matched handoff across 3350..3850 Hz: at 3600 Hz BOTH valves sit near ~0.078 mm
        // (well above PTP!), guaranteeing 11 unbroken sweeps with ZERO mid-sweep choke!
        const openRight = smoothstep(3280, 3620, fSweep);
        const openLeft = 1.0 - smoothstep(3580, 3920, fSweep);
        gapL = lerp(-0.052, 0.084, openLeft);
        gapR = lerp(-0.052, 0.086, openRight);
        fL = clamp(fSweep, 1400, 3980);
        fR = clamp(fSweep, 3220, 6500);
        fTrack = fSweep;
      };

      if (t >= 0.14 && t < 1.84) {
        // Phrase A: 5 downward "cheer!" sweeps (6280 -> 1480 Hz over 205 ms, period 0.34s + mini-breath)
        const period = 0.34;
        const u = ((t - 0.14) % period) / period;
        if (u < 0.62) {
          singing = true;
          const s = u / 0.62;
          const env = smoothstep(0.0, 0.09, s) * (1.0 - smoothstep(0.89, 1.0, s));
          pSub = 0.72 + 1.66 * env;
          pIcas = pSub;
          const fSweep = lerp(6280, 1480, Math.pow(s, 0.82));
          applySeamlessHandoff(fSweep);
        } else if (u >= 0.68 && u < 0.94) {
          // Active sub-atmospheric inspiratory mini-breath between sweeps
          pSub = -0.38;
          pIcas = -0.36;
          gapL = 0.22;
          gapR = 0.22;
        }
      } else if (t >= 2.00 && t < 3.74) {
        // Phrase B: 6 accelerating upward "whoit!" sweeps (1460 -> 6380 Hz over 175 ms, period 0.29s + mini-breath)
        const period = 0.29;
        const u = ((t - 2.00) % period) / period;
        if (u < 0.62) {
          singing = true;
          const s = u / 0.62;
          const env = smoothstep(0.0, 0.09, s) * (1.0 - smoothstep(0.89, 1.0, s));
          pSub = 0.72 + 1.70 * env;
          pIcas = pSub;
          const fSweep = s < 0.16
            ? lerp(1640, 1460, s / 0.16)
            : lerp(1460, 6380, Math.pow((s - 0.16) / 0.84, 1.12));
          applySeamlessHandoff(fSweep);
        } else if (u >= 0.68 && u < 0.94) {
          pSub = -0.38;
          pIcas = -0.36;
          gapL = 0.22;
          gapR = 0.22;
        }
      }

      const oec = solveSpeciesOec(this.organ, fTrack);
      const singBlend = singing ? smoothstep(0.14, 0.72, pSub) : 0.0;
      return {
        pSub,
        pIcas,
        gapL,
        gapR,
        tensionL: solveSpeciesTension(this.organ, 'L', fL, mtmL, Math.max(pSub, 1.5), Math.max(0.05, gapL)),
        tensionR: solveSpeciesTension(this.organ, 'R', fR, mtmR, Math.max(pSub, 1.5), Math.max(0.05, gapR)),
        mtmStretchL: mtmL,
        mtmStretchR: mtmR,
        tracheaLenMm: 42.5,
        tracheaWidth: 1.0,
        oecVolMl: lerp(this.organ.restOecMl, oec.oecVolMl, singBlend),
        beakGapeMm: lerp(this.organ.restBeakMm, oec.beakGapeMm, singBlend),
      };
    },
  },

  {
    id: 'yellow_canary',
    commonName: 'Waterslager Canary',
    scientificName: 'Serinus canaria',
    subtitle: 'Left-Dominant Water Rolls',
    plateNumber: 'PLATE III',
    botanicalPlant: 'Sweet Briar & Geranium Leaf',
    badgeColor: '#D9A420',
    plumage: {
      crown: '#FAD82A',
      nape: '#E6BF22',
      body: '#E8C72C',
      wing: '#CCA622',
      wingEdge: '#8E7318',
      wingBar: '#FCF4BC',
      tailColor: '#D6B228',
      breast: '#FFF394',
      bellyShade: '#F7E678',
      cheek: '#FDE048',
      beakUpper: '#CCA37C',
      beakLower: '#E4BF9A',
      eyeIris: '#20140E',
      eyeRing: '#DFC34E',
      eyeRingAlpha: 0.40,
      legColor: '#CFA07A',
      hasCrest: false,
      hasSpots: false,
      hasMask: false,
      hasZebraBars: false,
      cheekPatch: null,
      billStyle: 'conical',
      billLen: 0.118,
      culmenDepth: 0.070,
      gonysDepth: 0.005,
      culmenArch: 0.014,
      morph: { chestTrim: 0.92, dorsalTrim: 0.90, bellyTuck: 0.92, tailLenMul: 1.14, headSlim: 0.91, wingReach: 1.05 },
      botanicalType: 'mallow',
    },
    // Comparative physical organ morphometry (18 g Serinus canaria, Belgian Waterslager strain —
    // 1.48x LEFT syringeal muscle hypertrophy producing ~90% Left-bronchus low water-rolls & flutes;
    // Nottebohm & Nottebohm 1976, Dooling et al. 1971, Hartley & Suthers 1989)
    organ: {
      bodyMassG: 18.0,
      clade: 'oscine',
      intrinsicMusclePairs: 4,
      tracheaLenMm: 31.0,
      trachDiamMm: 2.05,
      trachRings: 11,
      tympanumFusedRings: 3,
      tympanumScale: 0.94,
      hasSemilunaris: false,
      hasBronchidesmus: false,
      massLMg: 0.34,
      massRMg: 0.13,
      stiffLK0: 28.0,
      stiffRK0: 58.0,
      gammaL: 3.80,
      gammaR: 3.80,
      labialThickMmL: 0.34,
      labialThickMmR: 0.22,
      asymRestL: 0.05,
      asymRestR: 0.03,
      restMtmL: 0.84,
      restMtmR: 0.90,
      restGapL: 0.086,
      restGapR: 0.008,
      restOecMl: 0.34,
      minSongOecMl: 0.08,
      maxSongOecMl: 0.95,
      oecNeckMm: 1.85,
      restBeakMm: 0.30,
      beakGapeScale: 0.88,
      muscleSpeedScale: 1.52,
      warbleHz: 23.5,
      tractCoupling: 0.026,
      leftGain: 1.34,
      rightGain: 1.08,
      leftMuscleScale: 1.48,
      rightMuscleScale: 0.82,
      leftBronchusScale: 1.16,
      rightBronchusScale: 0.84,
      leftPadScale: 1.08,
      rightPadScale: 0.76,
    },
    baseTracheaMm: 31.0,
    cycleDuration: 5.5,
    evaluate(timeSec) {
      const t = timeSec % 5.5;
      // Nottebohm & Nottebohm (1976), Dooling et al. (1971), & Hartley & Suthers (1989):
      // Belgian Waterslager canary sings ~89% Left-bronchus low-frequency (<2.6 kHz) liquid tours
      // driven by its hypertrophied 1.48x Left musculature, punctuated by active sub-atmospheric
      // inspiratory mini-breaths (-0.38 kPa, gap +0.22 mm) between every syllable:
      //   Tour 1 (0.12-1.56s, Left): Bubbling "Klokkende / Water-Roll" (18.5 Hz, 1460->1060 Hz)
      //   Tour 2 (1.72-2.96s, Left): Deep resonant "Knorr / Bass Roll" (23.5 Hz, 960->780 Hz, warm harmonics)
      //   Tour 3 (3.12-4.48s, Left): Liquid "Hohlrolle / Flute" tour (14.2 Hz, 2420->1840 Hz)
      //   Tour 4 (4.68-5.22s, Right): Brief unilateral sparkling "Bell Tour" (17.0 Hz, 3840->3460 Hz, ~11% R!)
      let pSub = 0.04;
      let pIcas = 0.04;
      let gapL = 0.095;
      let gapR = 0.095;
      let fL = 1480;
      let fR = 3620;
      let mtmL = 0.88;
      const mtmR = 0.92;
      let oecFreq = 1650;
      let singing = false;

      if (t >= 0.12 && t < 1.56) {
        // Tour 1 (Left only): Bubbling Waterslager "Klokkende / Water-Roll" (18.5 Hz + mini-breaths)
        const localT = t - 0.12;
        const period = 1.0 / 18.5;
        const ph = (localT % period) / period;
        const envMacro = smoothstep(0.0, 0.07, localT / 1.44) * (1.0 - smoothstep(0.93, 1.0, localT / 1.44));
        fL = 1320;
        oecFreq = 1320;
        if (ph < 0.56) {
          singing = true;
          const s = ph / 0.56;
          pSub = 0.68 + 1.28 * Math.sin(s * Math.PI) * envMacro;
          pIcas = pSub;
          gapL = 0.084;
          gapR = -0.058;
          mtmL = 0.86;
          fL = lerp(1460, 1060, Math.pow(s, 0.85));
          oecFreq = fL;
        } else if (ph >= 0.62 && ph < 0.94) {
          pSub = -0.38;
          pIcas = -0.36;
          gapL = 0.22;
          gapR = 0.20;
        }
      } else if (t >= 1.72 && t < 2.96) {
        // Tour 2 (Left only): Deep Waterslager "Knorr / Bass Roll" (23.5 Hz + mini-breaths)
        const localT = t - 1.72;
        const period = 1.0 / 23.5;
        const ph = (localT % period) / period;
        const envMacro = smoothstep(0.0, 0.07, localT / 1.24) * (1.0 - smoothstep(0.93, 1.0, localT / 1.24));
        mtmL = 0.34;
        fL = 880;
        oecFreq = 1580;
        if (ph < 0.58) {
          singing = true;
          const s = ph / 0.58;
          pSub = 0.72 + 1.38 * Math.sin(s * Math.PI) * envMacro;
          pIcas = pSub;
          gapL = 0.082;
          gapR = -0.058;
          fL = lerp(960, 780, s);
          oecFreq = 1620;
        } else if (ph >= 0.64 && ph < 0.94) {
          pSub = -0.36;
          pIcas = -0.34;
          gapL = 0.21;
          gapR = 0.20;
        }
      } else if (t >= 3.12 && t < 4.48) {
        // Tour 3 (Left only): Sweet Waterslager "Hohlrolle / Flute" tour (14.2 Hz + mini-breaths)
        const localT = t - 3.12;
        const period = 1.0 / 14.2;
        const ph = (localT % period) / period;
        const envMacro = smoothstep(0.0, 0.07, localT / 1.36) * (1.0 - smoothstep(0.93, 1.0, localT / 1.36));
        fL = 2120;
        oecFreq = 2120;
        if (ph < 0.58) {
          singing = true;
          const s = ph / 0.58;
          pSub = 0.70 + 1.42 * Math.sin(s * Math.PI) * envMacro;
          pIcas = pSub;
          gapL = 0.084;
          gapR = -0.058;
          mtmL = 0.90;
          fL = lerp(2420, 1840, s);
          oecFreq = fL;
        } else if (ph >= 0.64 && ph < 0.94) {
          pSub = -0.38;
          pIcas = -0.36;
          gapL = 0.22;
          gapR = 0.20;
        }
      } else if (t >= 4.68 && t < 5.22) {
        // Tour 4 (Right only, ~11% of voiced song): Unilateral high Bell Tour (17.0 Hz + mini-breaths)
        const localT = t - 4.68;
        const period = 1.0 / 17.0;
        const ph = (localT % period) / period;
        const envMacro = smoothstep(0.0, 0.09, localT / 0.54) * (1.0 - smoothstep(0.90, 1.0, localT / 0.54));
        fR = 3660;
        oecFreq = 3660;
        if (ph < 0.52) {
          singing = true;
          const s = ph / 0.52;
          pSub = 0.74 + 1.34 * Math.sin(s * Math.PI) * envMacro;
          pIcas = pSub;
          gapL = -0.058;
          gapR = 0.088;
          fR = lerp(3840, 3460, s);
          oecFreq = fR;
        } else if (ph >= 0.58 && ph < 0.92) {
          pSub = -0.36;
          pIcas = -0.34;
          gapL = 0.20;
          gapR = 0.22;
        }
      } else if ((t >= 1.56 && t < 1.70) || (t >= 2.96 && t < 3.10) || (t >= 4.48 && t < 4.64)) {
        // Inter-tour inspiratory breath
        pSub = -0.42;
        pIcas = -0.40;
        gapL = 0.24;
        gapR = 0.24;
      }

      const oec = solveSpeciesOec(this.organ, oecFreq);
      const singBlend = singing ? smoothstep(0.14, 0.72, pSub) : 0.0;
      return {
        pSub,
        pIcas,
        gapL,
        gapR,
        tensionL: solveSpeciesTension(this.organ, 'L', fL, mtmL, Math.max(pSub, 1.45), Math.max(0.05, gapL)),
        tensionR: solveSpeciesTension(this.organ, 'R', fR, mtmR, Math.max(pSub, 1.45), Math.max(0.05, gapR)),
        mtmStretchL: mtmL,
        mtmStretchR: mtmR,
        tracheaLenMm: 31.0,
        tracheaWidth: 1.0,
        oecVolMl: lerp(this.organ.restOecMl, oec.oecVolMl, singBlend),
        beakGapeMm: lerp(this.organ.restBeakMm, oec.beakGapeMm, singBlend),
      };
    },
  },

  {
    id: 'zebra_finch',
    commonName: 'Zebra Finch',
    scientificName: 'Taeniopygia guttata',
    subtitle: 'Buzzy Notes & Fast Rhythms',
    plateNumber: 'PLATE IV',
    botanicalPlant: 'Golden Wattle & Eucalyptus',
    badgeColor: '#DF6830',
    plumage: {
      crown: '#7A838C',
      nape: '#707880',
      body: '#84786A',
      wing: '#6E6052',
      wingEdge: '#483D34',
      wingBar: '#CFC4B2',
      tailColor: '#362F2A',
      breast: '#FAF6EE',
      bellyShade: '#EDE4D4',
      cheek: '#FAF5EC',
      beakUpper: '#E23C20',
      beakLower: '#F05234',
      eyeIris: '#B82418',
      eyeRing: '#C8BFB2',
      eyeRingAlpha: 0.42,
      legColor: '#DF743C',
      hasCrest: false,
      hasSpots: false,
      hasMask: false,
      hasZebraBars: true,
      cheekPatch: '#E86A26',
      billStyle: 'conical',
      billLen: 0.114,
      culmenDepth: 0.080,
      gonysDepth: 0.012,
      culmenArch: 0.018,
      morph: { chestTrim: 0.95, dorsalTrim: 0.92, bellyTuck: 0.94, tailLenMul: 0.88, headSlim: 0.94, wingReach: 0.96 },
      botanicalType: 'wattle',
    },
    // Comparative physical organ morphometry (12 g Taeniopygia guttata — 32.5 mm trachea [F1 ~ 2.65 kHz, Daley & Goller 2004],
    // 4 fused tympanum rings [Düring et al. 2013], bilateral SNILC harmonic-stack estrildid [Goller & Cooper 2004, Amador 2013])
    organ: {
      bodyMassG: 12.0,
      clade: 'oscine',
      intrinsicMusclePairs: 4,
      tracheaLenMm: 32.5,
      trachDiamMm: 1.85,
      trachRings: 11,
      tympanumFusedRings: 4,
      tympanumScale: 0.86,
      hasSemilunaris: false,
      hasBronchidesmus: false,
      massLMg: 0.36,
      massRMg: 0.24,
      stiffLK0: 9.4,
      stiffRK0: 18.5,
      gammaL: 4.05,
      gammaR: 4.05,
      labialThickMmL: 0.52,
      labialThickMmR: 0.28,
      asymRestL: 0.34,
      asymRestR: 0.10,
      restMtmL: 0.13,
      restMtmR: 0.86,
      restGapL: 0.064,
      restGapR: 0.004,
      restOecMl: 0.20,
      minSongOecMl: 0.035,
      maxSongOecMl: 0.52,
      oecNeckMm: 1.50,
      restBeakMm: 0.30,
      beakGapeScale: 0.72,
      muscleSpeedScale: 1.58,
      warbleHz: 25.0,
      tractCoupling: 0.028,
      leftGain: 1.30,
      rightGain: 1.14,
      leftMuscleScale: 1.24,
      rightMuscleScale: 1.18,
      leftBronchusScale: 0.96,
      rightBronchusScale: 0.78,
      leftPadScale: 1.16,
      rightPadScale: 0.74,
    },
    baseTracheaMm: 32.5,
    cycleDuration: 2.30,
    evaluate(timeSec) {
      const t = timeSec % 2.30;
      // Fee et al. (1998), Goller & Cooper (2004), Ohms et al. (2010), & Amador et al. (2013 Nature):
      //   - 4 accelerating introductory "tuck" stack notes (0.08s - 0.62s, 565-610 Hz) + mini-breaths
      //   - 3 stereotyped 4-syllable motifs (0.76s - 2.20s, 0.48s each) showcasing authentic estrildid acoustics:
      //       Syl 1 (48 ms): Steep unilateral Right high-to-low FM downsweep (4280 -> 1980 Hz)
      //       Syl 2 (98 ms): Iconic BILATERAL coupled 632 Hz SNILC harmonic stack + dynamic OEC "wah" sweep (2.8 -> 4.6 kHz!)
      //       Syl 3 (46 ms): Crisp unilateral Right high note (3980 -> 3640 Hz)
      //       Syl 4 (82 ms): Broadband noisy / subharmonic slack-overdrive downward slide (760 -> 510 Hz, Fee et al. 1998!)
      let pSub = 0.04;
      let pIcas = 0.04;
      let gapL = 0.088;
      let gapR = 0.088;
      let fL = 632;
      let fR = 3780;
      let mtmL = 0.14;
      let mtmR = 0.88;
      let oecTargetHz = 3650;
      let singing = false;

      // 4 accelerating introductory "tuck" notes with quick inspiratory mini-breaths
      const introStarts = [0.08, 0.24, 0.38, 0.50];
      for (let k = 0; k < introStarts.length; k++) {
        const dt = t - introStarts[k];
        const dur = 0.054;
        if (dt >= 0 && dt < dur) {
          singing = true;
          const s = dt / dur;
          const env = Math.sin(s * Math.PI);
          const build = 0.78 + 0.07 * k;
          pSub = 0.78 + 1.38 * build * env;
          pIcas = pSub * 1.04;
          gapL = 0.060;
          gapR = 0.052;
          mtmL = 0.14;
          mtmR = 0.16;
          fL = 565 + k * 15;
          fR = fL;
          oecTargetHz = 3350 + 300 * s;
        } else if (dt >= dur + 0.012 && dt < dur + 0.052) {
          pSub = -0.34;
          pIcas = -0.32;
          gapL = 0.20;
          gapR = 0.20;
        }
      }

      // 3 stereotyped 4-syllable Zebra Finch motifs (0.76s - 2.20s, 0.48s each)
      if (t >= 0.76 && t < 2.20) {
        const m = (t - 0.76) % 0.48;
        if (m < 0.048) {
          // Syllable 1 (48 ms): Steep unilateral Right high-to-low FM downsweep (4280 -> 1980 Hz)
          singing = true;
          const s = m / 0.048;
          pSub = 0.78 + 1.56 * Math.sin(s * Math.PI);
          pIcas = pSub * 1.03;
          gapL = -0.055;
          gapR = 0.088;
          mtmR = 0.88;
          fR = lerp(4280, 1980, Math.pow(s, 0.85));
          oecTargetHz = lerp(4250, 2350, s);
        } else if (m >= 0.054 && m < 0.082) {
          pSub = -0.35;
          pIcas = -0.33;
          gapL = 0.21;
          gapR = 0.21;
        } else if (m >= 0.086 && m < 0.184) {
          // Syllable 2 (98 ms): BILATERAL coupled 632 Hz SNILC harmonic stack (Goller & Cooper 2004) + OEC "wah" sweep!
          singing = true;
          const s = (m - 0.086) / 0.098;
          const env = smoothstep(0.0, 0.10, s) * (1.0 - smoothstep(0.88, 1.0, s));
          pSub = 0.84 + 1.62 * env;
          pIcas = pSub * 1.05;
          gapL = 0.064;
          gapR = 0.058;
          mtmL = 0.12;
          mtmR = 0.14;
          fL = 632;
          fR = 632;
          oecTargetHz = lerp(2850, 4580, Math.sin(s * Math.PI * 0.86));
        } else if (m >= 0.190 && m < 0.220) {
          pSub = -0.35;
          pIcas = -0.33;
          gapL = 0.21;
          gapR = 0.21;
        } else if (m >= 0.226 && m < 0.272) {
          // Syllable 3 (46 ms): Crisp unilateral Right high note (3980 -> 3640 Hz)
          singing = true;
          const s = (m - 0.226) / 0.046;
          const env = Math.sin(s * Math.PI);
          pSub = 0.80 + 1.58 * env;
          pIcas = pSub * 1.03;
          gapL = -0.055;
          gapR = 0.090;
          mtmR = 0.90;
          fR = lerp(3980, 3640, s);
          oecTargetHz = 3950;
        } else if (m >= 0.278 && m < 0.308) {
          pSub = -0.35;
          pIcas = -0.33;
          gapL = 0.21;
          gapR = 0.21;
        } else if (m >= 0.314 && m < 0.396) {
          // Syllable 4 (82 ms): Broadband noisy / period-doubled slack-MTM overdrive slide (Fee et al. 1998!)
          singing = true;
          const s = (m - 0.314) / 0.082;
          const env = smoothstep(0.0, 0.10, s) * (1.0 - smoothstep(0.88, 1.0, s));
          pSub = 0.95 + 1.65 * env;
          pIcas = pSub * 1.06;
          gapL = 0.072;
          gapR = 0.058;
          mtmL = 0.025;
          mtmR = 0.045;
          fL = lerp(760, 510, s);
          fR = lerp(810, 545, s);
          oecTargetHz = lerp(4150, 2750, s);
        } else if (m >= 0.410 && m < 0.468) {
          pSub = -0.38;
          pIcas = -0.36;
          gapL = 0.22;
          gapR = 0.22;
        }
      }

      const oec = solveSpeciesOec(this.organ, oecTargetHz);
      const singBlend = singing ? smoothstep(0.14, 0.72, pSub) : 0.0;
      return {
        pSub,
        pIcas,
        gapL,
        gapR,
        tensionL: solveSpeciesTension(this.organ, 'L', fL, mtmL, Math.max(pSub, 1.6), Math.max(0.04, gapL)),
        tensionR: solveSpeciesTension(this.organ, 'R', fR, mtmR, Math.max(pSub, 1.6), Math.max(0.04, gapR)),
        mtmStretchL: mtmL,
        mtmStretchR: mtmR,
        tracheaLenMm: 32.5,
        tracheaWidth: 1.0,
        oecVolMl: lerp(this.organ.restOecMl, oec.oecVolMl, singBlend),
        beakGapeMm: lerp(this.organ.restBeakMm, oec.beakGapeMm, singBlend),
      };
    },
  },

  {
    id: 'common_nightingale',
    commonName: 'Common Nightingale',
    scientificName: 'Luscinia megarhynchos',
    subtitle: 'Soft-to-Loud Whistle & Trill',
    plateNumber: 'PLATE V',
    botanicalPlant: 'Wild Dog-Rose & May Blossom',
    badgeColor: '#A65B38',
    plumage: {
      crown: '#8A5738',
      nape: '#7C4D30',
      body: '#925E3D',
      wing: '#76472A',
      wingEdge: '#4E2D19',
      wingBar: '#D8BFA2',
      tailColor: '#BA5428',
      breast: '#F8F2E6',
      bellyShade: '#E6DAC4',
      cheek: '#DFCCB4',
      beakUpper: '#4E392C',
      beakLower: '#BA9270',
      eyeIris: '#20130D',
      eyeRing: '#EFE2CA',
      eyeRingAlpha: 0.60,
      legColor: '#C49678',
      hasCrest: false,
      hasSpots: false,
      hasMask: false,
      hasZebraBars: false,
      cheekPatch: null,
      billStyle: 'slender',
      billLen: 0.166,
      culmenDepth: 0.064,
      gonysDepth: -0.004,
      culmenArch: 0.008,
      morph: { chestTrim: 0.94, dorsalTrim: 0.92, bellyTuck: 0.94, tailLenMul: 1.15, headSlim: 0.93, wingReach: 1.02 },
      botanicalType: 'wildrose',
    },
    // Comparative physical organ morphometry (21 g Luscinia megarhynchos — high-dynamic-range oscine;
    // hasSemilunaris: false per μCT refutation in Düring et al. 2013; Goller & Larsen 2002; Brumm 2004)
    organ: {
      bodyMassG: 21.0,
      clade: 'oscine',
      intrinsicMusclePairs: 4,
      tracheaLenMm: 33.5,
      trachDiamMm: 2.25,
      trachRings: 12,
      tympanumFusedRings: 4,
      tympanumScale: 1.04,
      hasSemilunaris: false,
      hasBronchidesmus: false,
      massLMg: 0.38,
      massRMg: 0.15,
      stiffLK0: 42.0,
      stiffRK0: 86.0,
      gammaL: 3.95,
      gammaR: 3.95,
      labialThickMmL: 0.36,
      labialThickMmR: 0.24,
      asymRestL: 0.04,
      asymRestR: 0.03,
      restMtmL: 0.84,
      restMtmR: 0.88,
      restGapL: 0.086,
      restGapR: 0.010,
      restOecMl: 0.46,
      minSongOecMl: 0.08,
      maxSongOecMl: 1.25,
      oecNeckMm: 2.10,
      restBeakMm: 0.35,
      beakGapeScale: 0.98,
      muscleSpeedScale: 1.36,
      warbleHz: 22.0,
      tractCoupling: 0.030,
      leftGain: 1.28,
      rightGain: 1.16,
      leftMuscleScale: 1.26,
      rightMuscleScale: 1.22,
      leftBronchusScale: 1.04,
      rightBronchusScale: 0.94,
      leftPadScale: 1.06,
      rightPadScale: 0.88,
    },
    baseTracheaMm: 33.5,
    cycleDuration: 4.2,
    evaluate(timeSec) {
      const t = timeSec % 4.2;
      // Todt & Hultsch (1998), Goller & Larsen (2002), & Brumm (2004):
      //   1. Iconic 6-note pure unilateral contralto whistle crescendo ("piu-piu-piu-piu-PIU-PIU!", 0.12-1.98s):
      //      DEAD-FLAT un-vibratoed 1780 Hz pure tones swelling ~18-21 dB from barely-above-PTP whisper (0.55 kPa)
      //      to ringing fortissimo (2.92 kPa), separated by sub-atmospheric inspiratory mini-breaths!
      //   2. Blistering 22 Hz "Schnarrlaut" broadband rattle/roll (2.10-2.82s: 3980 -> 1780 Hz sweeps)
      //   3. Cascading liquid two-voice bell-droplets & high 5.8 kHz crystalline flourish (2.94-3.96s)
      let pSub = 0.04;
      let pIcas = 0.04;
      let gapL = 0.092;
      let gapR = 0.092;
      let fL = 1780;
      let fR = 3550;
      const mtmL = 0.90;
      const mtmR = 0.92;
      let oecFreq = 1780;
      let singing = false;

      const flutes = [
        { t0: 0.12, dur: 0.21, pPeak: 0.55 },
        { t0: 0.42, dur: 0.21, pPeak: 0.78 },
        { t0: 0.72, dur: 0.22, pPeak: 1.12 },
        { t0: 1.03, dur: 0.22, pPeak: 1.58 },
        { t0: 1.34, dur: 0.23, pPeak: 2.18 },
        { t0: 1.66, dur: 0.26, pPeak: 2.92 },
      ];

      for (let idx = 0; idx < flutes.length; idx++) {
        const fl = flutes[idx];
        if (t >= fl.t0 && t < fl.t0 + fl.dur) {
          singing = true;
          const s = (t - fl.t0) / fl.dur;
          const env = smoothstep(0.0, 0.15, s) * (1.0 - smoothstep(0.85, 1.0, s));
          pSub = 0.46 + (fl.pPeak - 0.46) * env;
          pIcas = pSub;
          gapL = 0.080;
          gapR = -0.055; // Strictly pure unilateral dead-flat contralto whistle (0 Hz vibrato!)
          fL = 1780;
          oecFreq = 1780;
        } else if (idx < flutes.length - 1 && t >= fl.t0 + fl.dur + 0.015 && t < flutes[idx + 1].t0 - 0.015) {
          pSub = -0.34;
          pIcas = -0.32;
          gapL = 0.21;
          gapR = 0.20;
        }
      }

      if (t >= 1.94 && t < 2.06) {
        pSub = -0.40;
        pIcas = -0.38;
        gapL = 0.23;
        gapR = 0.23;
      }
      // Blistering 22 Hz Nightingale "Schnarrlaut" broadband rattle/roll (2.08s - 2.82s)
      else if (t >= 2.08 && t < 2.82) {
        const localT = t - 2.08;
        const period = 1.0 / 22.0;
        const ph = (localT % period) / period;
        if (ph < 0.64) {
          singing = true;
          const s = ph / 0.64;
          pSub = 0.82 + 1.72 * Math.sin(s * Math.PI);
          pIcas = pSub;
          const fSweep = lerp(3980, 1780, s);
          const openRight = smoothstep(2620, 3020, fSweep);
          const openLeft = 1.0 - smoothstep(2880, 3280, fSweep);
          gapL = lerp(-0.052, 0.084, openLeft);
          gapR = lerp(-0.052, 0.088, openRight);
          fL = clamp(fSweep, 1720, 3320);
          fR = clamp(fSweep, 2580, 4050);
          oecFreq = fSweep;
        } else {
          // Rapid syringeal valve adduction between 22 Hz Schnarrlaut expiratory pulses
          pSub = 0.42;
          pIcas = 0.46;
          gapL = -0.052;
          gapR = -0.052;
        }
      }
      // Cascading two-voice liquid bell-droplets (2.94s - 3.60s, period = 0.11s)
      else if (t >= 2.94 && t < 3.60) {
        const u = ((t - 2.94) % 0.11) / 0.11;
        if (u < 0.56) {
          singing = true;
          const s = u / 0.56;
          const env = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.86, 1.0, s));
          pSub = 0.80 + 1.82 * env;
          pIcas = pSub;
          gapR = s < 0.72 ? 0.088 : -0.052;
          gapL = s > 0.34 ? 0.082 : -0.052;
          fR = lerp(5280, 3240, clamp(s / 0.72, 0, 1));
          fL = lerp(2580, 1780, clamp((s - 0.34) / 0.66, 0, 1));
          oecFreq = s < 0.65 ? fR : lerp(fR, fL, (s - 0.65) / 0.35);
        } else if (u >= 0.64 && u < 0.94) {
          pSub = -0.34;
          pIcas = -0.32;
          gapL = 0.21;
          gapR = 0.21;
        }
      }
      // Shimmering high 5.8 kHz crystalline bell flourish (3.68s - 3.96s)
      else if (t >= 3.68 && t < 3.96) {
        singing = true;
        const s = (t - 3.68) / 0.28;
        const env = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.86, 1.0, s));
        const mod = 0.5 + 0.5 * Math.sin((t - 3.68) * 26.0 * 2.0 * Math.PI);
        pSub = 0.78 + 1.62 * env;
        pIcas = pSub;
        gapL = 0.076;
        gapR = 0.088;
        fL = 2340 + 210 * mod;
        fR = 5150 + 680 * (1.0 - mod);
        oecFreq = 5100;
      }

      const oec = solveSpeciesOec(this.organ, oecFreq);
      const singBlend = singing ? smoothstep(0.14, 0.58, pSub) : 0.0;
      return {
        pSub,
        pIcas,
        gapL,
        gapR,
        tensionL: solveSpeciesTension(this.organ, 'L', fL, mtmL, Math.max(pSub, 0.55), Math.max(0.04, gapL)),
        tensionR: solveSpeciesTension(this.organ, 'R', fR, mtmR, Math.max(pSub, 1.45), Math.max(0.04, gapR)),
        mtmStretchL: mtmL,
        mtmStretchR: mtmR,
        tracheaLenMm: 33.5 - 0.6 * smoothstep(1800, 5200, oecFreq),
        tracheaWidth: 1.0,
        oecVolMl: lerp(this.organ.restOecMl, oec.oecVolMl, singBlend),
        beakGapeMm: lerp(this.organ.restBeakMm, oec.beakGapeMm, singBlend),
      };
    },
  },

  {
    id: 'superb_lyrebird',
    commonName: 'Superb Lyrebird',
    scientificName: 'Menura novaehollandiae',
    subtitle: 'Whistles, Clicks & Mimicry',
    plateNumber: 'PLATE VI',
    botanicalPlant: 'Silver Tree-Fern & Gum Bark',
    badgeColor: '#6C5642',
    plumage: {
      crown: '#4E3B2E',
      nape: '#463428',
      body: '#5E4736',
      wing: '#864B2B',
      wingEdge: '#42291B',
      wingBar: '#B09072',
      tailColor: '#584233',
      throatPatch: '#A84824',
      breast: '#DED5C4',
      bellyShade: '#C4B8A8',
      cheek: '#B8AA98',
      beakUpper: '#302925',
      beakLower: '#4C423C',
      eyeIris: '#1E140F',
      eyeRing: '#6889A8',
      eyeRingAlpha: 0.35,
      legColor: '#504740',
      hasCrest: false,
      hasSpots: false,
      hasMask: false,
      hasZebraBars: false,
      hasLyreTail: true,
      cheekPatch: null,
      billStyle: 'slender',
      billLen: 0.194,
      culmenDepth: 0.072,
      gonysDepth: -0.002,
      culmenArch: 0.019,
      morph: { chestTrim: 0.96, dorsalTrim: 0.95, bellyTuck: 0.96, tailLenMul: 1.44, headSlim: 0.93, wingReach: 1.02 },
      botanicalType: 'treefern',
    },
    // Comparative physical organ morphometry (1,000 g Menura novaehollandiae — basal suborder Menurae:
    // ONLY 3 pairs of long strap muscles inserting on membranes rather than B2 half-rings, unfused caudal tracheal zone,
    // prominent sub-pessular bronchidesmus web, massive fleshy labia, and wide 94 mm x 4.6 mm organ-pipe trachea;
    // Ames 1971, Zann & Dunstan 2008, Dalziell et al. 2013, Dalziell & Welbergen 2016)
    organ: {
      bodyMassG: 1000.0,
      clade: 'menurae',
      intrinsicMusclePairs: 3,
      tracheaLenMm: 94.0,
      trachDiamMm: 4.60,
      trachRings: 17,
      tympanumFusedRings: 0,
      tympanumScale: 0.68,
      hasSemilunaris: true,
      hasBronchidesmus: true,
      massLMg: 3.20,
      massRMg: 1.35,
      stiffLK0: 30.0,
      stiffRK0: 68.0,
      gammaL: 4.15,
      gammaR: 4.15,
      labialThickMmL: 0.92,
      labialThickMmR: 0.62,
      asymRestL: 0.16,
      asymRestR: 0.09,
      restMtmL: 0.34,
      restMtmR: 0.62,
      restGapL: 0.084,
      restGapR: 0.084,
      restOecMl: 0.88,
      minSongOecMl: 0.24,
      maxSongOecMl: 2.15,
      oecNeckMm: 3.90,
      restBeakMm: 0.42,
      beakGapeScale: 1.12,
      muscleSpeedScale: 0.85,
      warbleHz: 13.5,
      tractCoupling: 0.038,
      leftGain: 1.14,
      rightGain: 1.08,
      leftMuscleScale: 0.84,
      rightMuscleScale: 0.84,
      leftBronchusScale: 1.28,
      rightBronchusScale: 1.16,
      leftPadScale: 1.40,
      rightPadScale: 1.24,
    },
    baseTracheaMm: 94.0,
    cycleDuration: 5.8,
    evaluate(timeSec) {
      const t = timeSec % 5.8;
      // Wild Mound-Display Repertoire (Zann & Dunstan 2008; Dalziell et al. 2013; Dalziell & Welbergen 2016):
      //   1. 0.10-1.56s: Male territorial mound whistle + 5 rhythmic "klik-ik / pilik" mechanical snap-click display notes
      //      (excited 100% by physical mucosal-collision impulses in the 94 mm trachea + OEC — ZERO synthetic sines!)
      //   2. 1.74-2.76s: Wild sympatric Pied Currawong ("curra-wong!") resonant forest calls
      //   3. 2.94-4.12s: Eastern Whipbird long rising whistle (1180 -> 2740 Hz) + explosive 4680 Hz "WHIP!" crack
      //      + mimicked female "choo-choo!" duet response
      //   4. 4.30-5.58s: Staccato 650-1080 Hz Laughing Kookaburra ("koo-koo-ka-ka-ka") territorial laugh finale
      let pSub = 0.05;
      let pIcas = 0.05;
      let gapL = 0.094;
      let gapR = 0.094;
      let fL = 960;
      let fR = 2050;
      let mtmL = 0.72;
      let mtmR = 0.85;
      let oecFreq = 1950;
      let singing = false;

      // Section 1A: Ringing Male Territorial Mound Whistle (0.10s - 0.72s)
      if (t >= 0.10 && t < 0.72) {
        singing = true;
        const s = (t - 0.10) / 0.62;
        const env = smoothstep(0.0, 0.10, s) * (1.0 - smoothstep(0.88, 1.0, s));
        pSub = 0.82 + 1.62 * env;
        pIcas = pSub;
        gapL = -0.052;
        gapR = 0.088;
        mtmR = 0.92;
        fR = s < 0.42
          ? lerp(2280, 2940, smoothstep(0.0, 0.42, s))
          : lerp(2940, 1920, Math.pow((s - 0.42) / 0.58, 0.88));
        oecFreq = fR;
      }
      // Section 1B: 5 Rhythmic Mound-Display "Klik-ik / Pilik" Notes (0.84s - 1.54s, period 0.14s)
      else if (t >= 0.84 && t < 1.54) {
        const period = 0.14;
        const u = ((t - 0.84) % period) / period;
        if (u < 0.44) {
          singing = true;
          const s = u / 0.44;
          const snapEnv = smoothstep(0.0, 0.18, s) * (1.0 - smoothstep(0.68, 1.0, s));
          pSub = 0.85 + 1.15 * snapEnv;
          // Elevated transmural ICAS cushion drives brisk physical valve snap across 0.006 mm -> resonator click!
          pIcas = pSub * (1.12 + 0.36 * (1.0 - snapEnv));
          gapL = lerp(-0.042, 0.088, snapEnv);
          gapR = lerp(-0.042, 0.092, snapEnv);
          mtmL = 0.26;
          mtmR = 0.34;
          fL = lerp(760, 540, s);
          fR = lerp(2580, 2120, s);
          oecFreq = 2280;
        } else if (u >= 0.58 && u < 0.88) {
          pSub = -0.32;
          pIcas = -0.30;
          gapL = 0.20;
          gapR = 0.20;
        }
      }
      // Section 2: Wild Sympatric Pied Currawong ("curra-wong!") Resonant Calls (1.74s - 2.76s)
      else if (t >= 1.74 && t < 1.98) {
        singing = true;
        const s = (t - 1.74) / 0.24;
        const env = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.86, 1.0, s));
        pSub = 0.78 + 1.34 * env;
        pIcas = pSub * 1.03;
        gapL = 0.078;
        gapR = 0.084;
        mtmL = 0.26;
        mtmR = 0.88;
        fL = lerp(920, 1160, Math.pow(s, 0.8));
        fR = lerp(2760, 3440, Math.pow(s, 0.8));
        oecFreq = lerp(1850, 2380, s);
      } else if (t >= 2.06 && t < 2.36) {
        singing = true;
        const s = (t - 2.06) / 0.30;
        const env = smoothstep(0.0, 0.10, s) * (1.0 - smoothstep(0.86, 1.0, s));
        pSub = 0.80 + 1.44 * env;
        pIcas = pSub * 1.03;
        gapL = 0.080;
        gapR = 0.084;
        mtmL = 0.24;
        mtmR = 0.88;
        fL = s < 0.45 ? lerp(1260, 880, s / 0.45) : lerp(880, 980, (s - 0.45) / 0.55);
        fR = fL * 3.0;
        oecFreq = s < 0.45 ? 2480 : 1940;
      } else if (t >= 2.44 && t < 2.76) {
        singing = true;
        const s = (t - 2.44) / 0.32;
        const env = smoothstep(0.0, 0.10, s) * (1.0 - smoothstep(0.88, 1.0, s));
        pSub = 0.82 + 1.52 * env;
        pIcas = pSub * 1.03;
        gapL = 0.082;
        gapR = -0.052;
        mtmL = 0.84;
        fL = s < 0.55 ? lerp(1120, 1820, s / 0.55) : lerp(1820, 1480, (s - 0.55) / 0.45);
        oecFreq = fL;
      }
      // Section 3A: Eastern Whipbird Long Pure Rising Whistle (2.94s - 3.50s: 1180 -> 2740 Hz)
      else if (t >= 2.94 && t < 3.50) {
        singing = true;
        const s = (t - 2.94) / 0.56;
        const env = smoothstep(0.0, 0.12, s) * (0.65 + 0.35 * s) * (1.0 - smoothstep(0.90, 1.0, s));
        pSub = 0.76 + 1.52 * env;
        pIcas = pSub;
        gapL = 0.084;
        gapR = -0.052;
        mtmL = 0.92;
        fL = lerp(1180, 2740, Math.pow(s, 1.45));
        oecFreq = fL;
      }
      // Section 3B: Explosive Eastern Whipbird "WHIP!" Crack (3.53s - 3.65s: 1360 -> 4680 -> 1480 Hz!)
      else if (t >= 3.53 && t < 3.65) {
        singing = true;
        const s = (t - 3.53) / 0.12;
        const env = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.86, 1.0, s));
        pSub = 0.96 + 1.92 * env;
        pIcas = pSub * 1.08;
        const fWhip = s < 0.44
          ? lerp(1360, 4680, s / 0.44)
          : lerp(4680, 1480, (s - 0.44) / 0.56);
        const openRight = smoothstep(2350, 2780, fWhip);
        const openLeft = 1.0 - smoothstep(2680, 3120, fWhip);
        gapL = lerp(-0.052, 0.084, openLeft);
        gapR = lerp(-0.052, 0.092, openRight);
        mtmL = 0.88;
        mtmR = 0.90;
        fL = clamp(fWhip, 1320, 3180);
        fR = clamp(fWhip, 2300, 4720);
        oecFreq = fWhip;
      }
      // Section 3C: Mimicked Female Whipbird "choo-choo!" Antiphonal Duet Answer (3.74-3.89s & 3.95-4.10s)
      else if ((t >= 3.74 && t < 3.89) || (t >= 3.95 && t < 4.10)) {
        singing = true;
        const t0 = t < 3.92 ? 3.74 : 3.95;
        const s = (t - t0) / 0.15;
        const env = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.86, 1.0, s));
        pSub = 0.78 + 1.38 * env;
        pIcas = pSub;
        gapL = 0.082;
        gapR = -0.052;
        mtmL = 0.88;
        fL = lerp(2480, 1720, Math.pow(s, 0.85));
        oecFreq = fL;
      }
      // Section 4: Staccato Laughing Kookaburra ("koo-koo-ka-ka-ka", 650-1080 Hz) Finale (4.30s - 5.56s)
      else if (t >= 4.30 && t < 5.56) {
        const localT = t - 4.30;
        const period = 0.18;
        const k = Math.floor(localT / period);
        const u = (localT % period) / period;
        const arch = Math.sin(clamp((k + 0.5) / 7.0, 0, 1) * Math.PI);
        if (u < 0.62) {
          singing = true;
          const s = u / 0.62;
          const env = smoothstep(0.0, 0.10, s) * (1.0 - smoothstep(0.86, 1.0, s));
          pSub = 0.88 + 1.56 * env * (0.78 + 0.22 * arch);
          pIcas = pSub * 1.04;
          gapL = 0.080;
          gapR = 0.082;
          mtmL = 0.20;
          mtmR = 0.56;
          const baseLaughHz = 660 + 360 * arch;
          fL = lerp(baseLaughHz * 0.94, baseLaughHz * 1.06, Math.sin(s * Math.PI));
          fR = fL * 2.0; // Coupled 2nd-harmonic formant bite in the 650-1080 Hz Kookaburra band!
          oecFreq = clamp(fL * 2.2, 1450, 2380);
        } else if (u >= 0.68 && u < 0.94) {
          pSub = -0.36;
          pIcas = -0.34;
          gapL = 0.21;
          gapR = 0.21;
        }
      } else if ((t >= 1.56 && t < 1.70) || (t >= 2.78 && t < 2.91) || (t >= 4.13 && t < 4.27)) {
        pSub = -0.40;
        pIcas = -0.38;
        gapL = 0.23;
        gapR = 0.23;
      }

      const oec = solveSpeciesOec(this.organ, oecFreq);
      const singBlend = singing ? smoothstep(0.14, 0.72, pSub) : 0.0;
      return {
        pSub,
        pIcas,
        gapL,
        gapR,
        tensionL: solveSpeciesTension(this.organ, 'L', fL, mtmL, Math.max(pSub, 1.45), Math.max(0.05, gapL)),
        tensionR: solveSpeciesTension(this.organ, 'R', fR, mtmR, Math.max(pSub, 1.45), Math.max(0.05, gapR)),
        mtmStretchL: mtmL,
        mtmStretchR: mtmR,
        tracheaLenMm: 94.0 - 1.2 * smoothstep(1400, 3800, oecFreq),
        tracheaWidth: 1.0,
        oecVolMl: lerp(this.organ.restOecMl, oec.oecVolMl, singBlend),
        beakGapeMm: lerp(this.organ.restBeakMm, oec.beakGapeMm, singBlend),
      };
    },
  },
  {
    id: 'synth_bird',
    commonName: 'SynthBird',
    scientificName: 'Automaton syrinx-VII',
    subtitle: 'Playable bird simulation',
    plateNumber: 'PLATE VII',
    botanicalPlant: 'Braided Patch-Cable & Vacuum Tubes',
    badgeColor: '#2E6B5E',
    isSynthBird: true,
    autoPlayOnSelect: false,
    plumage: {
      isCyborg: true,
      crown: '#A8B3B8',
      nape: '#486670',
      body: '#4F6C76',
      wing: '#8D9CA3',
      wingEdge: '#273138',
      wingBar: '#DFD6BE',
      tailColor: '#3A4B54',
      breast: '#DEE2DF',
      bellyShade: '#B6C0BE',
      cheek: '#CBD3D1',
      beakUpper: '#7A8890',
      beakLower: '#AE935E',
      eyeIris: '#4EF28B',
      eyeRing: '#BA9B5C',
      eyeRingAlpha: 0.96,
      legColor: '#76828A',
      hasCrest: false,
      hasSpots: false,
      hasMask: false,
      hasZebraBars: false,
      cheekPatch: null,
      billStyle: 'slender',
      billLen: 0.174,
      culmenDepth: 0.068,
      gonysDepth: -0.002,
      culmenArch: 0.006,
      morph: { chestTrim: 1.00, dorsalTrim: 0.98, bellyTuck: 0.98, tailLenMul: 1.08, headSlim: 0.98, wingReach: 1.04 },
      botanicalType: 'patchcable',
    },
    // Bio-cybernetic wide-compliance two-voice syrinx (spans 5+ octaves from C2 = 65.4 Hz to F7 = 2,794 Hz+!)
    organ: {
      bodyMassG: 54.0,
      clade: 'oscine',
      intrinsicMusclePairs: 4,
      tracheaLenMm: 44.0,
      trachDiamMm: 3.10,
      trachRings: 14,
      tympanumFusedRings: 4,
      tympanumScale: 1.14,
      hasSemilunaris: false,
      hasBronchidesmus: true,
      massLMg: 2.90,
      massRMg: 2.75,
      stiffLK0: 2.40,
      stiffRK0: 2.50,
      gammaL: 5.00,
      gammaR: 5.00,
      labialThickMmL: 0.36,
      labialThickMmR: 0.34,
      asymRestL: 0.03,
      asymRestR: 0.03,
      restMtmL: 0.84,
      restMtmR: 0.86,
      restGapL: 0.084,
      restGapR: 0.084,
      restOecMl: 0.56,
      minSongOecMl: 0.05,
      maxSongOecMl: 2.25,
      oecNeckMm: 2.15,
      restBeakMm: 0.35,
      beakGapeScale: 1.05,
      muscleSpeedScale: 1.45,
      warbleHz: 21.0,
      tractCoupling: 0.036,
      hornPickup: 1.0,
      leftGain: 1.06,
      rightGain: 1.06,
      leftMuscleScale: 1.12,
      rightMuscleScale: 1.12,
      leftBronchusScale: 1.06,
      rightBronchusScale: 1.06,
      leftPadScale: 1.10,
      rightPadScale: 1.08,
    },
    baseTracheaMm: 38.0,
    cycleDuration: 8.0,
    evaluate(timeSec) {
      // 8.0 s (4 bars @ 120 BPM, 32 eighth-note steps) lush harmonic two-voice syrinx pastorale
      // Progression: Cmaj -> G -> Em -> Am -> Fmaj -> C/E -> G -> Cmaj (strictly pure 5ths, 6ths, 10ths & octaves)
      const cycleDur = 8.0;
      const t = ((timeSec % cycleDur) + cycleDur) % cycleDur;
      const stepDur = 0.25;
      const numSteps = 32;
      const stepIdx = Math.floor(t / stepDur) % numSteps;
      const u = (t % stepDur) / stepDur;

      const m2f = (m) => 440.0 * Math.pow(2.0, (m - 69.0) / 12.0);

      // Sustained legato lower counter-voice (C4..G4) + bell-like upper melody (G4..F5), 0 = natural mini-breath
      const seqL = [
        60, 60, 60, 64, 64, 60, 60, 60,
        62, 62, 67, 67, 62, 62, 64,  0,
        60, 60, 64, 64, 65, 65, 65, 65,
        64, 64, 62, 62, 60, 60, 60,  0,
      ];
      const seqR = [
        67, 72, 76, 72, 76, 72, 69, 67,
        71, 74, 74, 76, 71, 69, 71,  0,
        69, 72, 76, 72, 72, 77, 74, 72,
        72, 76, 74, 71, 72, 67, 72,  0,
      ];

      const midiL = seqL[stepIdx];
      const midiR = seqR[stepIdx];
      const prevL = seqL[(stepIdx + numSteps - 1) % numSteps];
      const prevR = seqR[(stepIdx + numSteps - 1) % numSteps];
      const nextL = seqL[(stepIdx + 1) % numSteps];
      const nextR = seqR[(stepIdx + 1) % numSteps];
      const isBreathStep = midiL === 0 && midiR === 0;

      if (isBreathStep) {
        if (u > 0.18 && u < 0.84) {
          return {
            pSub: -0.32,
            pIcas: -0.30,
            gapL: 0.20,
            gapR: 0.20,
            tensionL: 0.0,
            tensionR: 0.2,
            mtmStretchL: 0.94,
            mtmStretchR: 0.96,
            tracheaLenMm: 38.0,
            tracheaWidth: 1.0,
            oecVolMl: 0.56,
            beakGapeMm: 1.6,
          };
        }
        return {
          pSub: 0.08,
          pIcas: 0.08,
          gapL: 0.084,
          gapR: 0.084,
          tensionL: 0.0,
          tensionR: 0.2,
          mtmStretchL: 0.94,
          mtmStretchR: 0.96,
          tracheaLenMm: 38.0,
          tracheaWidth: 1.0,
          oecVolMl: 0.56,
          beakGapeMm: 0.6,
        };
      }

      // Smooth legato breath support so pitch never sags or bends out of tune mid-note
      const phraseEntrance = prevL === 0 && prevR === 0 ? smoothstep(0.0, 0.16, u) : 1.0;
      const phraseRelease = nextL === 0 && nextR === 0 ? 1.0 - 0.32 * smoothstep(0.68, 1.0, u) : 1.0;
      const noteChange = (midiL !== prevL || midiR !== prevR) ? Math.exp(-u * 7.5) : 0.0;

      const phraseWave = 0.5 - 0.5 * Math.cos((t / 4.0) * Math.PI * 2.0);
      const pSub = (1.62 + 0.16 * phraseWave) * (0.45 + 0.55 * phraseEntrance) * phraseRelease;
      const pIcas = pSub * (1.01 + 0.08 * noteChange);
      const gapL = midiL > 0 ? 0.084 : -0.048;
      const gapR = midiR > 0 ? 0.084 : -0.048;

      // Gentle portamento between adjacent notes for natural flute-like phrasing
      const glideT = smoothstep(0.0, 0.14, u);
      const effMidiL = midiL > 0 && prevL > 0 && prevL !== midiL ? lerp(prevL, midiL, glideT) : midiL;
      const effMidiR = midiR > 0 && prevR > 0 && prevR !== midiR ? lerp(prevR, midiR, glideT) : midiR;

      const fL = (effMidiL > 0 ? m2f(effMidiL) : 261.63) / 1.018;
      const fR = (effMidiR > 0 ? m2f(effMidiR) : 523.25) / 1.018;

      // Pure, taut membranes for sweet harmonic overtones + key-tracked OEC formant warmth
      const mtmL = 0.96;
      const mtmR = 0.98;
      const trachMm = 36.0 + 4.0 * Math.sin((t / cycleDur) * Math.PI * 2.0);
      const wahFreq = clamp((effMidiR > 0 ? m2f(effMidiR) : 523.25) * (1.85 + 0.35 * phraseWave), 820.0, 2900.0);
      const oec = solveSpeciesOec(this.organ, wahFreq);

      return {
        pSub,
        pIcas,
        gapL,
        gapR,
        tensionL: solveSpeciesTension(this.organ, 'L', fL, mtmL, pSub, 0.084),
        tensionR: solveSpeciesTension(this.organ, 'R', fR, mtmR, pSub, 0.084),
        mtmStretchL: mtmL,
        mtmStretchR: mtmR,
        tracheaLenMm: trachMm,
        tracheaWidth: 1.0,
        oecVolMl: oec.oecVolMl,
        beakGapeMm: clamp(oec.beakGapeMm + 2.2 * phraseWave + 1.4 * noteChange, 0.8, 14.0),
        demoMidiL: midiL,
        demoMidiR: midiR,
        demoEffMidiL: effMidiL,
        demoEffMidiR: effMidiR,
      };
    },
  },
];
