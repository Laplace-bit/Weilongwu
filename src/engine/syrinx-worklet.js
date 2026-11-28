/**
 * @fileoverview Comparative Physical Avian Syrinx Model (AudioWorkletProcessor)
 *
 * Pure emergent biomechanics & aeroacoustics across 6 avian species (5 Oscines + Basal Menurae):
 *  - Newton + Fung Tissue Mechanics: omega_0 = sqrt(k_eff / m_labia) with species-specific labial mass
 *    (0.12 mg Zebra Finch right labium up to 3.20 mg Superb Lyrebird left labium) & exponential collagen law
 *  - Four-Dimensional Two-Mass Caudal–Rostral Mucosal Ribbon Dynamics: coupled rostral mode (uRost, vRost)
 *    with convergent/divergent intraglottal drive unlocking Fee et al. (1998) subharmonics in slack overdrive
 *    plus true SNILC saddle-node ghost bottleneck (Amador et al. 2013)
 *  - Pure Emergent Rothenberg Supraglottal Inertance & Lossy Quarter-Wave Reactance: orifice-dependent fluid
 *    inertance scaled by tracheal bore D_trach and bounded tan(pi/2 * f0 / F1) input reactance
 *  - Kirchhoff-Realistic Tracheal Digital Waveguide (Q1 ~ 5-6, abduction venting) + Instantaneous Carinal
 *    Junction Coupling Z_0*(U_L + U_R) (Nowicki & Capranica 1986) + Fletcher et al. (2006) 2-Pole Shunt-Compliance
 *    OEC Resonator & Dynamic Avian Beak-Aperture Differentiator Radiation
 *  - Sub-atmospheric inspiratory mini-breaths (Hartley & Suthers 1989) & C1-continuous 2-pole parameter smoothing.
 */

const SOUND_SPEED_AVIAN_MPS = 356.0; // Water-saturated expired avian air-sac gas (41°C, 4.5% CO2, 100% RH)
const OVERSAMPLE = 4; // 4x oversampling (~192 kHz) for unconditional RK2/Heun stability

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothGate(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

/** Smooth C1 softplus valve opening function with variable mucosal sharpness */
function softOpening(gapMm, sharpness = 18.0) {
  const z = gapMm * sharpness;
  if (z > 12.0) return gapMm;
  if (z < -12.0) return 0.0;
  return Math.log1p(Math.exp(z)) / sharpness;
}

class SyrinxProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.fs = sampleRate;
    this.fsInt = sampleRate * OVERSAMPLE;
    this.dt = 1.0 / this.fsInt;

    // Smoothed biomechanical control parameters & comparative species organ constants (Wood Thrush defaults)
    this.target = {
      pSub: 0.18,           // Belly air sac pressure (kPa), range [-0.85, 5.2] (negative = inspiratory mini-breath)
      pIcas: 0.18,          // Chest air cushion pressure (kPa), range [-0.85, 5.2]
      gapL: 0.088,          // Left voice valve half-gap (mm), range [-0.08, 0.54]
      gapR: 0.086,          // Right voice valve half-gap (mm), range [-0.08, 0.54]
      tensionL: 0.00,       // Left muscle activation strain [-1.15, 1.75]
      tensionR: 0.00,       // Right muscle activation strain [-1.15, 1.75]
      mtmStretchL: 0.88,    // Left medial membrane stretch [0.00, 1.48]
      mtmStretchR: 0.90,    // Right medial membrane stretch [0.00, 1.48]
      tracheaLenMm: 40.5,   // Windpipe length (mm), range [11, 145]
      tracheaWidth: 1.0,    // Interactive windpipe bore multiplier [0.28, 2.20]
      oecVolMl: 0.62,       // Throat chamber volume (mL), range [0.015, 2.90]
      beakGapeMm: 0.35,     // Beak opening (mm), range [0.18, 28.0]
      // Species-specific physical organ morphometry (C1-smoothed across live bird switches!)
      massLMg: 0.58,
      massRMg: 0.24,
      stiffLK0: 44.0,
      stiffRK0: 60.0,
      gammaL: 3.85,
      gammaR: 3.85,
      trachDiamMm: 2.65,
      labialThickMmL: 0.44,
      labialThickMmR: 0.30,
      asymRestL: 0.03,
      asymRestR: 0.03,
      oecNeckMm: 2.35,
      tractCoupling: 0.030,
      hornPickup: 0.0,
      hasBronchidesmus: 0.0,
      leftGain: 1.04,
      rightGain: 1.02,
      masterGain: 0.68,
    };

    // 2-pole C1-continuous smoothed control trajectories (zero slope corners on 60 Hz rAF updates)
    this.mid = { ...this.target };
    this.cur = { ...this.target };

    // Left & Right 4D Two-Mass Voice Valve State Variables (caudal u/v, rostral uRost/vRost, & inertive flow)
    this.uL = 0.012;
    this.vL = 0.0;
    this.uRostL = 0.012;
    this.vRostL = 0.0;
    this.flowStateL = 0.0;

    this.uR = -0.012;
    this.vR = 0.0;
    this.uRostR = -0.012;
    this.vRostR = 0.0;
    this.flowStateR = 0.0;

    // Smooth continuous poke envelopes (decoupled from clickEnv — always active on tactile pokes!)
    this.pokeTargetL = 0.0;
    this.pokeEnvL = 0.0;
    this.pokeTargetR = 0.0;
    this.pokeEnvR = 0.0;
    this.pokePhase = 0.0;

    // Audio-rate smoothed resonator damping, waveguide reflection, & phase-coherent stereo states
    this.smoothKSvf = 1.0 / 4.5;
    this.smoothKPh = 1.0 / 6.2;
    this.smoothRSyrinx = 0.72;
    this.smoothRGlottis = -0.76;
    this.panEnvL = 0.0;
    this.panEnvR = 0.0;
    this.voicePowL = 0.0;
    this.voicePowR = 0.0;
    this.smoothPan = 0.0;

    // Fractional-delay Tracheal Digital Waveguide buffers (forward p+ and backward p-, supports up to 150 mm pipe)
    this.wgSize = 512;
    this.wgMask = this.wgSize - 1;
    this.pFwd = new Float32Array(this.wgSize);
    this.pBwd = new Float32Array(this.wgSize);
    this.wgWrite = 0;
    this.wgLossFwd = 0.0;
    this.wgLossBwd = 0.0;
    this.prevOecLow = 0.0;

    // Cytomic TPT Zero-Delay Feedback State-Variable Filter (ZDF SVF) for Shunt-Compliance OEC Resonator
    this.svfIc1eq = 0.0;
    this.svfIc2eq = 0.0;

    // Cranial pharyngeal secondary formant ZDF SVF (anchored to cranial morphometry oecNeckMm)
    this.pharynxIc1eq = 0.0;
    this.pharynxIc2eq = 0.0;

    // Dynamic avian beak piston radiation (ka differentiator), ultrasonic air-absorption LP, & DC blocker
    this.radLp = 0.0;
    this.silkLp = 0.0;
    this.dcX1 = 0.0;
    this.dcY1 = 0.0;
    this.limMid = 0.0;
    this.limEnv = 0.0;

    // Bronchial jet turbulence, inspiratory mini-breath airiness, & physical zero-DC mucosal collision impulse
    this.noiseSeed = 0x13579bdf;
    this.turbLpL = 0.0;
    this.turbBpL = 0.0;
    this.turbLpR = 0.0;
    this.turbBpR = 0.0;
    this.inspLp = 0.0;
    this.prevEffGapL = 0.088;
    this.prevEffGapR = 0.086;
    this.clickTarget = 0.0;
    this.clickMid1 = 0.0;
    this.clickMid2 = 0.0;
    this.clickEnv = 0.0;
    this.clickLp = 0.0;

    // Sub-sample zero-crossing cycle period trackers for true limit-cycle f0 telemetry
    this.prevUL = 0.012;
    this.prevUR = -0.012;
    this.samplesSinceCrossL = 0.0;
    this.samplesSinceCrossR = 0.0;
    this.measF0L = 1520.0;
    this.measF0R = 2710.0;
    this.oscActiveL = false;
    this.oscActiveR = false;

    // Telemetry accumulators (~60 Hz back to main thread for animation & sonogram)
    this.telemCounter = 0;
    this.telemInterval = Math.max(128, Math.floor(this.fs / 60));
    this.sumSqL = 0.0;
    this.sumSqR = 0.0;
    this.closedCountL = 0;
    this.closedCountR = 0;
    this.flowAccL = 0.0;
    this.flowAccR = 0.0;
    this.lastF0L = 1520.0;
    this.lastF0R = 2710.0;
    this.lastPtpL = 0.44;
    this.lastPtpR = 0.47;
    this.lastFOec = 2350.0;
    this.lastFTrach1 = 2180.0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === 'params') {
        const p = msg.params;
        for (const key in p) {
          if (key in this.target && Number.isFinite(p[key])) {
            this.target[key] = p[key];
          }
        }
      } else if (msg.type === 'poke') {
        const branch = msg.branch;
        const strength = clamp(msg.strength || 0.5, -1.6, 1.6);
        if (branch === 'L' || branch === 'both') {
          this.pokeTargetL = clamp(this.pokeTargetL + strength * 0.58, -1.4, 1.4);
        }
        if (branch === 'R' || branch === 'both') {
          this.pokeTargetR = clamp(this.pokeTargetR - strength * 0.58, -1.4, 1.4);
        }
      }
    };
  }

  /** Fast deterministic PRNG in [-1, 1] for bronchial & inspiratory breath airiness */
  nextWhite() {
    let x = this.noiseSeed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseSeed = x;
    return x * 4.656612873077393e-10;
  }

  /**
   * Computes Phonation Threshold Pressure (PTP in kPa) for a voice valve
   * per Titze (1988, Eq. 29: P_th proportional to 1 / T_labia) & Elemans et al. (2009).
   */
  computePTP(effGapMm, tension, labialThickMm = 0.38) {
    const optGap = 0.080;
    const thickClamped = clamp(labialThickMm, 0.18, 1.10);
    const thickFactor = clamp(0.76 + 0.10 / (thickClamped + 0.16), 0.84, 1.12);
    const basePtp = (0.39 + 0.27 * clamp(tension + 0.25, 0.0, 1.8)) * thickFactor;
    const delta = effGapMm - optGap;
    if (effGapMm >= optGap) {
      return basePtp * (1.0 + (delta / 0.135) * (delta / 0.135));
    }
    if (effGapMm > 0.005) {
      const squeeze = (optGap - effGapMm) / optGap;
      return basePtp * (1.0 + 0.42 * squeeze * squeeze);
    }
    const overClose = 0.005 - effGapMm;
    return basePtp * (1.45 + 320.0 * overClose + 8500.0 * overClose * overClose);
  }

  /**
   * Evaluates normalized Van der Pol–Duffing–SNILC caudal labial acceleration dv/dt / omega0
   * with 2-mass convergent/divergent mucosal feedback, viscoelastic wall collision, & carinal coupling.
   */
  labialAccel(
    u,
    v,
    uRost,
    mu,
    etaAsym,
    c3,
    effGapMm,
    aScale,
    pCarina,
    tractCoupling,
    uOther,
    crossGain,
    contactStiff = 1.2,
    mucosalGain = 0.08,
    pokeForce = 0.0
  ) {
    // Strictly dissipative nonlinear tissue damping (-b * u^2 * v with b > 0 ALWAYS):
    // Identical to mu * v * (1 - 3.2 * u^2) when mu >= 0.35, while preventing negative sub-PTP mu
    // from flipping -3.2 * mu * u^2 * v into positive anti-damping and latching (u, v) on the clamp rail!
    const nonlinDamp = 3.2 * Math.max(mu, 0.35);
    const aeroDrive = (mu - nonlinDamp * u * u) * v;
    const elastic = -u - c3 * u * u * u + etaAsym * u * u;

    // Two-mass intraglottal convergent (u > uRost) vs. divergent (u < uRost) pressure asymmetry (Titze 1988; Fee 1998)
    const convDrive = mucosalGain * Math.tanh(1.5 * (u - uRost));

    // Smooth continuous Bernoulli onset micro-seed (eliminates Hopf dead-zone delay with ZERO velocity jump!)
    const ampSq = u * u + v * v;
    const onsetSeed = mu > 0.0 ? 0.22 * mu * Math.exp(-12.0 * ampSq) : 0.0;

    const contactRef = Math.max(0.0, effGapMm);
    const gapNow = contactRef + aScale * u;
    let wallForce = 0.0;
    if (gapNow < 0.0) {
      const pen = -gapNow / aScale;
      wallForce =
        contactStiff * pen * (1.0 + 0.55 * pen) -
        (v < 0.0 ? 2.05 * v : 0.48 * v) * Math.min(pen * 3.2, 1.55);
    }

    const coupling = tractCoupling * pCarina + crossGain * uOther + convDrive + pokeForce + onsetSeed;
    return aeroDrive + elastic + wallForce + coupling;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output.length > 1 ? output[1] : output[0];
    const frames = outL.length;

    // 2-pole C1 smoother (~1.9 ms per pole -> ~3.0 ms zero-corner S-curve) preserves 22-28 Hz trills with 0 pops
    const poleCoeff = 1.0 - Math.exp(-1.0 / (0.0019 * this.fs));
    const morphCoeff = 1.0 - Math.exp(-1.0 / (0.0065 * this.fs)); // Smooth ~10 ms organ morph transition
    const slowCoeff = 1.0 - Math.exp(-1.0 / (0.0045 * this.fs));
    const clickRiseCoeff = 1.0 - Math.exp(-1.0 / (0.0014 * this.fs));
    const clickFallDecay = Math.exp(-1.0 / (0.0032 * this.fs));
    const clickHpCoeff = 1.0 - Math.exp(-1.0 / (0.00085 * this.fs));
    const pokeRiseCoeff = 1.0 - Math.exp(-1.0 / (0.0018 * this.fs));
    const pokeFallDecay = Math.exp(-1.0 / (0.0090 * this.fs));
    const silkAlpha = 1.0 - Math.exp((-2.0 * Math.PI * 14800.0) / this.fsInt);

    const mid = this.mid;
    const cur = this.cur;
    const tgt = this.target;

    for (let i = 0; i < frames; i++) {
      // 1. C1-smooth dynamic physiological DOFs
      mid.pSub += poleCoeff * (tgt.pSub - mid.pSub);
      cur.pSub += poleCoeff * (mid.pSub - cur.pSub);

      mid.pIcas += poleCoeff * (tgt.pIcas - mid.pIcas);
      cur.pIcas += poleCoeff * (mid.pIcas - cur.pIcas);

      mid.gapL += poleCoeff * (tgt.gapL - mid.gapL);
      cur.gapL += poleCoeff * (mid.gapL - cur.gapL);

      mid.gapR += poleCoeff * (tgt.gapR - mid.gapR);
      cur.gapR += poleCoeff * (mid.gapR - cur.gapR);

      mid.tensionL += poleCoeff * (tgt.tensionL - mid.tensionL);
      cur.tensionL += poleCoeff * (mid.tensionL - cur.tensionL);

      mid.tensionR += poleCoeff * (tgt.tensionR - mid.tensionR);
      cur.tensionR += poleCoeff * (mid.tensionR - cur.tensionR);

      mid.mtmStretchL += poleCoeff * (tgt.mtmStretchL - mid.mtmStretchL);
      cur.mtmStretchL += poleCoeff * (mid.mtmStretchL - cur.mtmStretchL);

      mid.mtmStretchR += poleCoeff * (tgt.mtmStretchR - mid.mtmStretchR);
      cur.mtmStretchR += poleCoeff * (mid.mtmStretchR - cur.mtmStretchR);

      mid.tracheaLenMm += poleCoeff * (tgt.tracheaLenMm - mid.tracheaLenMm);
      cur.tracheaLenMm += poleCoeff * (mid.tracheaLenMm - cur.tracheaLenMm);

      mid.tracheaWidth += poleCoeff * (tgt.tracheaWidth - mid.tracheaWidth);
      cur.tracheaWidth += poleCoeff * (mid.tracheaWidth - cur.tracheaWidth);

      mid.oecVolMl += poleCoeff * (tgt.oecVolMl - mid.oecVolMl);
      cur.oecVolMl += poleCoeff * (mid.oecVolMl - cur.oecVolMl);

      mid.beakGapeMm += poleCoeff * (tgt.beakGapeMm - mid.beakGapeMm);
      cur.beakGapeMm += poleCoeff * (mid.beakGapeMm - cur.beakGapeMm);

      mid.masterGain += poleCoeff * (tgt.masterGain - mid.masterGain);
      cur.masterGain += poleCoeff * (mid.masterGain - cur.masterGain);

      // 2. C1-smooth species organ morphometry (pop-free live species switching!)
      mid.massLMg += morphCoeff * (tgt.massLMg - mid.massLMg);
      cur.massLMg += morphCoeff * (mid.massLMg - cur.massLMg);

      mid.massRMg += morphCoeff * (tgt.massRMg - mid.massRMg);
      cur.massRMg += morphCoeff * (mid.massRMg - cur.massRMg);

      mid.stiffLK0 += morphCoeff * (tgt.stiffLK0 - mid.stiffLK0);
      cur.stiffLK0 += morphCoeff * (mid.stiffLK0 - cur.stiffLK0);

      mid.stiffRK0 += morphCoeff * (tgt.stiffRK0 - mid.stiffRK0);
      cur.stiffRK0 += morphCoeff * (mid.stiffRK0 - cur.stiffRK0);

      mid.gammaL += morphCoeff * (tgt.gammaL - mid.gammaL);
      cur.gammaL += morphCoeff * (mid.gammaL - cur.gammaL);

      mid.gammaR += morphCoeff * (tgt.gammaR - mid.gammaR);
      cur.gammaR += morphCoeff * (mid.gammaR - cur.gammaR);

      mid.trachDiamMm += morphCoeff * (tgt.trachDiamMm - mid.trachDiamMm);
      cur.trachDiamMm += morphCoeff * (mid.trachDiamMm - cur.trachDiamMm);

      mid.labialThickMmL += morphCoeff * (tgt.labialThickMmL - mid.labialThickMmL);
      cur.labialThickMmL += morphCoeff * (mid.labialThickMmL - cur.labialThickMmL);

      mid.labialThickMmR += morphCoeff * (tgt.labialThickMmR - mid.labialThickMmR);
      cur.labialThickMmR += morphCoeff * (mid.labialThickMmR - cur.labialThickMmR);

      mid.asymRestL += morphCoeff * (tgt.asymRestL - mid.asymRestL);
      cur.asymRestL += morphCoeff * (mid.asymRestL - cur.asymRestL);

      mid.asymRestR += morphCoeff * (tgt.asymRestR - mid.asymRestR);
      cur.asymRestR += morphCoeff * (mid.asymRestR - cur.asymRestR);

      mid.oecNeckMm += morphCoeff * (tgt.oecNeckMm - mid.oecNeckMm);
      cur.oecNeckMm += morphCoeff * (mid.oecNeckMm - cur.oecNeckMm);

      mid.tractCoupling += morphCoeff * (tgt.tractCoupling - mid.tractCoupling);
      cur.tractCoupling += morphCoeff * (mid.tractCoupling - cur.tractCoupling);

      mid.hornPickup += morphCoeff * (tgt.hornPickup - mid.hornPickup);
      cur.hornPickup += morphCoeff * (mid.hornPickup - cur.hornPickup);

      mid.hasBronchidesmus += morphCoeff * (tgt.hasBronchidesmus - mid.hasBronchidesmus);
      cur.hasBronchidesmus += morphCoeff * (mid.hasBronchidesmus - cur.hasBronchidesmus);

      mid.leftGain += morphCoeff * (tgt.leftGain - mid.leftGain);
      cur.leftGain += morphCoeff * (mid.leftGain - cur.leftGain);

      mid.rightGain += morphCoeff * (tgt.rightGain - mid.rightGain);
      cur.rightGain += morphCoeff * (mid.rightGain - cur.rightGain);

      // Smooth poke envelopes with independent phase advance (never freezes when clickEnv == 0!)
      this.pokeTargetL *= pokeFallDecay;
      this.pokeEnvL += pokeRiseCoeff * (this.pokeTargetL - this.pokeEnvL);
      this.pokeTargetR *= pokeFallDecay;
      this.pokeEnvR += pokeRiseCoeff * (this.pokeTargetR - this.pokeEnvR);
      if (Math.abs(this.pokeEnvL) + Math.abs(this.pokeEnvR) > 1e-5) {
        this.pokePhase = (this.pokePhase + (2.0 * Math.PI * 165.0) / this.fs) % (2.0 * Math.PI);
      }

      // Signed respiratory pressures (pSub < 0 = active inspiratory mini-breath; pSub > 0 = expiratory drive)
      const pSubSigned = clamp(cur.pSub, -0.85, 5.2);
      const pIcasSigned = clamp(cur.pIcas, -0.85, 5.2);
      const pSub = Math.max(0.0, pSubSigned);
      const pIcas = Math.max(0.0, pIcasSigned);

      // Signed transmural delta across MTM: neutral (~0) during symmetric inspiration; collapses if pIcas >> pSub
      const transmuralDelta = pSubSigned >= 0.0
        ? pIcasSigned - 0.82 * pSubSigned
        : (pIcasSigned - pSubSigned) * 0.50;
      const effGapL = cur.gapL - 0.042 * transmuralDelta;
      const effGapR = cur.gapR - 0.042 * transmuralDelta;

      // Smooth C1 valve-opening envelopes
      const valveOpenL = smoothGate(-0.010, 0.026, effGapL);
      const valveOpenR = smoothGate(-0.010, 0.026, effGapR);
      const valveOpenAny = Math.max(valveOpenL, valveOpenR);

      const ptpL = this.computePTP(effGapL, cur.tensionL, cur.labialThickMmL);
      const ptpR = this.computePTP(effGapR, cur.tensionR, cur.labialThickMmR);

      // Passive thermodynamic bound: icasSupport <= 1.0 ensures pEff <= pSub ALWAYS (no pSub < PTP oscillation!),
      // while vented ICAS (pIcas = 0, Goller & Larsen 1997) retains ~69% pSub support for oscine phonation!
      const icasSupport = clamp((pIcas + 0.28) / (pSub * 0.96 + 0.28), 0.35, 1.00);
      const pEff = pSub * (0.52 + 0.48 * icasSupport);

      // 3. Pure Physical Newton + Fung Labial Mechanics: omega_0 = sqrt(k_eff / m_labia)
      const tenL = clamp(cur.tensionL, -1.15, 1.75);
      const tenR = clamp(cur.tensionR, -1.15, 1.75);
      const mtmClampedL = clamp(cur.mtmStretchL, 0.0, 1.48);
      const mtmClampedR = clamp(cur.mtmStretchR, 0.0, 1.48);
      const mtmFactorL = 0.68 + 0.56 * mtmClampedL;
      const mtmFactorR = 0.68 + 0.56 * mtmClampedR;

      const stackModeL = clamp((0.52 - mtmClampedL) / 0.38, 0.0, 1.0);
      const stackModeR = clamp((0.52 - mtmClampedR) / 0.38, 0.0, 1.0);
      const gritOverdriveL = clamp((0.12 - mtmClampedL) / 0.12, 0.0, 1.0);
      const gritOverdriveR = clamp((0.12 - mtmClampedR) / 0.12, 0.0, 1.0);

      const c3L = 0.07 + 0.24 * stackModeL + 0.12 * gritOverdriveL;
      const c3R = 0.07 + 0.24 * stackModeR + 0.12 * gritOverdriveR;
      // SNILC saddle-node threshold 2*sqrt(c3): whistles stay far below; harmonic stacks sit right in the
      // saddle-node ghost bottleneck (~0.94..0.99 * 2*sqrt(c3)), crossing >= 2*sqrt(c3) in extreme overdrive!
      const snilcCritL = 2.0 * Math.sqrt(c3L);
      const snilcCritR = 2.0 * Math.sqrt(c3R);
      const etaL = clamp(
        cur.asymRestL + 0.62 * stackModeL + 0.26 * gritOverdriveL + 0.014 * pSub,
        0.01,
        snilcCritL * (0.97 + 0.05 * gritOverdriveL)
      );
      const etaR = clamp(
        cur.asymRestR + 0.62 * stackModeR + 0.26 * gritOverdriveR + 0.014 * pSub,
        0.01,
        snilcCritR * (0.97 + 0.05 * gritOverdriveR)
      );

      const k0L = clamp(cur.stiffLK0, 2.0, 140.0);
      const k0R = clamp(cur.stiffRK0, 2.0, 140.0);
      const kEffL =
        k0L * Math.exp(clamp(cur.gammaL, 2.0, 5.2) * tenL) * mtmFactorL +
        0.065 * k0L * Math.max(0.0, pSub - ptpL);
      const kEffR =
        k0R * Math.exp(clamp(cur.gammaR, 2.0, 5.2) * tenR) * mtmFactorR +
        0.065 * k0R * Math.max(0.0, pSub - ptpR);

      const massKgL = clamp(cur.massLMg, 0.05, 8.0) * 1e-6;
      const massKgR = clamp(cur.massRMg, 0.05, 8.0) * 1e-6;
      const omegaL = clamp(Math.sqrt(kEffL / massKgL), 2.0 * Math.PI * 48.0, 2.0 * Math.PI * 7600.0);
      const omegaR = clamp(Math.sqrt(kEffR / massKgR), 2.0 * Math.PI * 48.0, 2.0 * Math.PI * 7900.0);

      // Analytical limit-cycle pitch estimate (used prior to / alongside cycle-counted zero-crossing f0)
      const f0EstL = (omegaL / (2.0 * Math.PI)) / (1.028 + 0.33 * etaL * etaL);
      const f0EstR = (omegaR / (2.0 * Math.PI)) / (1.028 + 0.33 * etaR * etaR);

      this.lastPtpL = ptpL;
      this.lastPtpR = ptpR;

      const aScaleL = 0.056 + 0.062 * stackModeL + 0.024 * gritOverdriveL;
      const aScaleR = 0.056 + 0.062 * stackModeR + 0.024 * gritOverdriveR;

      // C0-continuous supercritical Hopf growth/damping across pEff == ptp (unlocks natural 18-22 dB Nightingale crescendos!)
      const excessPL = pEff - ptpL;
      const excessPR = pEff - ptpR;
      const rawMuL = excessPL <= 0.0
        ? clamp((3.8 * excessPL) / (ptpL + 0.16), -4.2, 0.0)
        : clamp(1.16 * Math.pow(excessPL / (ptpL + 0.34), 0.68), 0.0, 1.32);
      const rawMuR = excessPR <= 0.0
        ? clamp((3.8 * excessPR) / (ptpR + 0.16), -4.2, 0.0)
        : clamp(1.16 * Math.pow(excessPR / (ptpR + 0.34), 0.68), 0.0, 1.32);
      const muL = -4.2 * (1.0 - valveOpenL) + rawMuL * valveOpenL;
      const muR = -4.2 * (1.0 - valveOpenR) + rawMuR * valveOpenR;

      const contactStiffL = 0.65 + 1.55 * stackModeL + 0.85 * gritOverdriveL;
      const contactStiffR = 0.65 + 1.55 * stackModeR + 0.85 * gritOverdriveR;
      const sharpL = 20.0 + 64.0 * stackModeL + 28.0 * gritOverdriveL;
      const sharpR = 20.0 + 64.0 * stackModeR + 28.0 * gritOverdriveR;

      // 4D Two-Mass rostral mucosal mode parameters: 1:1 phase-locked ribbon in whistles, subharmonic-capable in slack overdrive!
      const rostDetuneL = 1.02 - 0.44 * gritOverdriveL * clamp(pSub / 2.2, 0.4, 1.15);
      const rostDetuneR = 1.02 - 0.44 * gritOverdriveR * clamp(pSub / 2.2, 0.4, 1.15);
      const rostDampL = 1.15 - 0.72 * gritOverdriveL;
      const rostDampR = 1.15 - 0.72 * gritOverdriveR;
      const mucosalGainL = (0.04 + 0.26 * gritOverdriveL + 0.08 * stackModeL) * clamp(pEff / 1.6, 0.0, 1.5) * valveOpenL;
      const mucosalGainR = (0.04 + 0.26 * gritOverdriveR + 0.08 * stackModeR) * clamp(pEff / 1.6, 0.0, 1.5) * valveOpenR;

      // Bilateral ICAS septum + Menurae sub-pessular bronchidesmus mechanical coupling
      const icasExcess = Math.max(0.0, pIcas - pSub * 1.16);
      const crossGain = clamp(
        0.012 + 0.012 * pIcas + 0.045 * clamp(cur.hasBronchidesmus, 0.0, 2.2) + 0.135 * icasExcess,
        0.006,
        0.42
      );
      const tractCoupling = clamp(cur.tractCoupling, 0.008, 0.075);

      // 4. Bore-Scaled Tracheal Waveguide Geometry & True Lossy Quarter-Wave Reactance
      const effDiamMm = clamp(cur.trachDiamMm * cur.tracheaWidth, 0.65, 9.5);
      const trachMeters = clamp(cur.tracheaLenMm, 11.0, 145.0) * 0.001;
      const lEffMeters = trachMeters + 0.61 * 0.5 * (effDiamMm * 0.001); // Rayleigh glottal end-correction
      const delaySamples = clamp(
        (lEffMeters / SOUND_SPEED_AVIAN_MPS) * this.fsInt - 1.27,
        3.5,
        this.wgSize - 5.0
      );
      const fTrach1 = SOUND_SPEED_AVIAN_MPS / (4.0 * lEffMeters);
      this.lastFTrach1 = fTrach1;

      // Kirchhoff boundary-layer wall loss (wider 4.6 mm Lyrebird pipe sustains cleaner higher-Q standing waves)
      const wgAlpha = clamp(0.58 * Math.pow(effDiamMm / 2.65, 0.36), 0.42, 0.78);

      // Analytical lossy quarter-wave input reactance: Z_in = Im[coth(gamma + j * pi/2 * f0 / F1)]
      // Rises inertively (+skew) as f0 -> F1-, flips compliant (<0) for F1 < f0 < 2*F1!
      const boreInert = Math.pow(2.65 / effDiamMm, 0.85);
      const fActL = this.oscActiveL ? this.measF0L : f0EstL;
      const fActR = this.oscActiveR ? this.measF0R : f0EstR;
      const theta1L = 0.5 * Math.PI * clamp(fActL / Math.max(220.0, fTrach1), 0.02, 3.8);
      const theta1R = 0.5 * Math.PI * clamp(fActR / Math.max(220.0, fTrach1), 0.02, 3.8);
      const cos1L = Math.cos(theta1L);
      const cos1R = Math.cos(theta1R);
      const react1L = (Math.sin(theta1L) * cos1L) / (cos1L * cos1L + 0.035);
      const react1R = (Math.sin(theta1R) * cos1R) / (cos1R * cos1R + 0.035);
      const subFormantL = clamp(0.58 + 0.34 * react1L, 0.18, 1.42);
      const subFormantR = clamp(0.58 + 0.34 * react1R, 0.18, 1.42);
      const inertFactorL = boreInert * subFormantL * (0.55 + 1.05 * stackModeL + 0.45 * gritOverdriveL);
      const inertFactorR = boreInert * subFormantR * (0.55 + 1.05 * stackModeR + 0.45 * gritOverdriveR);
      const gainL = clamp(cur.leftGain, 0.5, 1.6);
      const gainR = clamp(cur.rightGain, 0.5, 1.6);

      // Physical zero-DC mucosal valve-collision transient (excites real tracheal + OEC resonators — ZERO hardcoded sines!)
      const dGapL = Math.abs(effGapL - this.prevEffGapL) * this.fs;
      const dGapR = Math.abs(effGapR - this.prevEffGapR) * this.fs;
      const crossL = (effGapL > 0.006 && this.prevEffGapL <= 0.006) || (effGapL <= 0.006 && this.prevEffGapL > 0.006);
      const crossR = (effGapR > 0.006 && this.prevEffGapR <= 0.006) || (effGapR <= 0.006 && this.prevEffGapR > 0.006);
      this.prevEffGapL = effGapL;
      this.prevEffGapR = effGapR;
      const snapDrive = clamp((pIcas - pSub * 1.10) / 0.55, 0.0, 1.35);
      if (snapDrive > 0.06 && pSub > 0.38 && (crossL || crossR)) {
        const snapSpeed = Math.max(crossL ? dGapL : 0.0, crossR ? dGapR : 0.0);
        if (snapSpeed > 0.95) {
          this.clickTarget = clamp(this.clickTarget + 0.32 * snapDrive * Math.min(snapSpeed * 0.08, 1.0), 0.0, 0.62);
        }
      }
      this.clickTarget *= clickFallDecay;
      this.clickMid1 += clickRiseCoeff * (this.clickTarget - this.clickMid1);
      this.clickMid2 += clickRiseCoeff * (this.clickMid1 - this.clickMid2);
      this.clickEnv += clickRiseCoeff * (this.clickMid2 - this.clickEnv);
      this.clickLp += clickHpCoeff * (this.clickEnv - this.clickLp);
      const mucosalClickImpulse = this.clickEnv - this.clickLp;

      // 5. Fletcher et al. (2006) 2-Pole Shunt-Compliance OEC + Dynamic Avian Beak-Aperture Radiation
      const oecMl = clamp(cur.oecVolMl, 0.015, 2.90);
      const volM3 = oecMl * 1e-6;
      const gapeMm = clamp(cur.beakGapeMm, 0.18, 28.0);
      const beakAreaM2 = Math.pow(gapeMm * 0.001, 1.28) * 0.0068 + 2.4e-7;
      const aBeakM = Math.sqrt(beakAreaM2 / Math.PI);
      const neckBaseM = clamp(cur.oecNeckMm, 1.1, 6.0) * 0.001;
      const deepEsophNeck = 0.022 * Math.max(0.0, oecMl - 1.45);
      const neckLenM = neckBaseM + deepEsophNeck + 1.70 * aBeakM;
      const fOec = clamp(
        (SOUND_SPEED_AVIAN_MPS / (2.0 * Math.PI)) * Math.sqrt(beakAreaM2 / (volM3 * neckLenM)),
        360.0,
        7400.0
      );
      this.lastFOec = fOec;

      // Radiation-limited OEC quality factor (Fletcher et al. 2006):
      // High-Q Helmholtz whistle amplification at narrow/moderate gape + inflated OEC;
      // vents smoothly to low-Q (~1.25) open horn when bill gapes wide (>18 mm)!
      const gapeVent = smoothGate(6.5, 22.0, gapeMm);
      const closedViscDamp = 1.0 - 0.42 * (1.0 - smoothGate(0.20, 1.15, gapeMm));
      const rawRadQ = (2.8 + 3.4 * Math.pow(oecMl / 0.55, 0.42)) * (1.0 - 0.76 * gapeVent) + 0.95 * gapeVent;
      const openOecQ = clamp(rawRadQ * closedViscDamp, 1.18, 7.6);
      const targetOecQ = 1.8 + valveOpenAny * (openOecQ - 1.8);
      this.smoothKSvf += slowCoeff * ((1.0 / targetOecQ) - this.smoothKSvf);
      const kSvf = this.smoothKSvf;

      const gSvf = Math.tan((Math.PI * Math.min(fOec, 0.42 * this.fsInt)) / this.fsInt);
      const a1Svf = 1.0 / (1.0 + gSvf * (gSvf + kSvf));
      const a2Svf = gSvf * a1Svf;
      const a3Svf = gSvf * a2Svf;

      // Cranial pharyngeal secondary resonance anchored strictly to species cranial morphometry (oecNeckMm),
      // completely decoupled from cervical tracheaLenMm (Guardrail #1)!
      const fPharynx = clamp(5400.0 * (1.58 / clamp(cur.oecNeckMm, 1.1, 6.0)), 1450.0, 6600.0);
      const gPh = Math.tan((Math.PI * Math.min(fPharynx, 0.42 * this.fsInt)) / this.fsInt);
      const targetKPh = 0.32 * (1.0 - valveOpenAny) + (1.0 / 5.4) * valveOpenAny;
      this.smoothKPh += slowCoeff * (targetKPh - this.smoothKPh);
      const kPh = this.smoothKPh;
      const a1Ph = 1.0 / (1.0 + gPh * (gPh + kPh));
      const a2Ph = gPh * a1Ph;

      // Dynamic circular-aperture avian beak radiation corner fc = c / (2 * pi * a_beak)
      // (ka < 1 across avian fundamentals -> true +6 dB/oct volume-acceleration differentiator dU_beak/dt!)
      const fRadCorner = clamp(SOUND_SPEED_AVIAN_MPS / (2.0 * Math.PI * Math.max(0.0006, aBeakM)), 3400.0, 21000.0);
      const radShelfAlpha = 1.0 - Math.exp((-2.0 * Math.PI * fRadCorner) / this.fsInt);
      // Compensate differentiator slope (f / fRadCorner) so radiated pressure matches physical 1/(4*pi*r) * rho * dU/dt scale!
      const radDiffNorm = fRadCorner / 3800.0;
      const beakRadCoupling = 0.28 + 0.72 * smoothGate(0.18, 2.10, gapeMm);

      // Smooth voice activity gates
      this.panEnvL += slowCoeff * ((muL > 0.0 ? 1.0 : 0.0) - this.panEnvL);
      this.panEnvR += slowCoeff * ((muR > 0.0 ? 1.0 : 0.0) - this.panEnvR);

      let sampleAccum = 0.0;
      const white = this.nextWhite();
      this.turbLpL += 0.22 * (white - this.turbLpL);
      this.turbBpL += 0.055 * (this.turbLpL - this.turbBpL);
      const jetNoiseL = this.turbLpL - this.turbBpL;

      const whiteR = this.nextWhite();
      this.turbLpR += 0.24 * (whiteR - this.turbLpR);
      this.turbBpR += 0.060 * (this.turbLpR - this.turbBpR);
      const jetNoiseR = this.turbLpR - this.turbBpR;

      // Soft inspiratory mini-breath air rush when pSubSigned < -0.10 kPa and bronchi abduct wide open
      const inspDrive = pSubSigned < -0.08
        ? clamp((-pSubSigned - 0.08) * 0.85, 0.0, 0.65) * smoothGate(0.12, 0.24, Math.max(effGapL, effGapR))
        : 0.0;
      this.inspLp += 0.085 * ((white + whiteR) * 0.5 - this.inspLp);
      const inspBreathFlow = inspDrive * this.inspLp * 0.012;

      const pokeForceL = this.pokeEnvL * Math.sin(this.pokePhase + 0.4) + mucosalClickImpulse * 0.32;
      const pokeForceR = this.pokeEnvR * Math.cos(this.pokePhase + 1.1) - mucosalClickImpulse * 0.30;

      const boreNorm = clamp(effDiamMm / 2.65, 0.32, 2.60);
      const trachImpedance = 1.0 / Math.pow(boreNorm, 0.78);
      const abductVent = smoothGate(0.14, 0.34, Math.max(effGapL, effGapR));

      // Excess pressure envelope factor for faithful 18-22 dB dynamic range above PTP
      const dynDriveL = Math.sqrt(Math.max(0.0, pSub)) * (0.48 + 0.52 * clamp(Math.max(0.0, excessPL) / 1.35, 0.0, 1.55));
      const dynDriveR = Math.sqrt(Math.max(0.0, pSub)) * (0.48 + 0.52 * clamp(Math.max(0.0, excessPR) / 1.35, 0.0, 1.55));

      for (let s = 0; s < OVERSAMPLE; s++) {
        const dInt = delaySamples | 0;
        const frac = delaySamples - dInt;
        const idx0 = (this.wgWrite - dInt + this.wgSize) & this.wgMask;
        const idxM1 = (idx0 + 1) & this.wgMask;
        const idx1 = (idx0 - 1 + this.wgSize) & this.wgMask;
        const idx2 = (idx0 - 2 + this.wgSize) & this.wgMask;

        const y0F = this.pFwd[idxM1];
        const y1F = this.pFwd[idx0];
        const y2F = this.pFwd[idx1];
        const y3F = this.pFwd[idx2];
        const c0F = y1F;
        const c1F = 0.5 * (y2F - y0F);
        const c2F = y0F - 2.5 * y1F + 2.0 * y2F - 0.5 * y3F;
        const c3F = 0.5 * (y3F - y0F) + 1.5 * (y1F - y2F);
        const pFwdGlottis = ((c3F * frac + c2F) * frac + c1F) * frac + c0F;

        const y0B = this.pBwd[idxM1];
        const y1B = this.pBwd[idx0];
        const y2B = this.pBwd[idx1];
        const y3B = this.pBwd[idx2];
        const c0B = y1B;
        const c1B = 0.5 * (y2B - y0B);
        const c2B = y0B - 2.5 * y1B + 2.0 * y2B - 0.5 * y3B;
        const c3B = 0.5 * (y3B - y0B) + 1.5 * (y1B - y2B);
        const pBwdSyrinx = ((c3B * frac + c2B) * frac + c1B) * frac + c0B;

        this.wgLossFwd += wgAlpha * (pFwdGlottis - this.wgLossFwd);
        this.wgLossBwd += wgAlpha * (pBwdSyrinx - this.wgLossBwd);
        const pBack = clamp(this.wgLossBwd, -1.8, 1.8);

        // Instantaneous carinal junction acoustic pressure Z_0*(U_L + U_R) + reflected wave (Nowicki & Capranica 1986)
        const pCarina = clamp(pBack + 0.42 * (this.flowStateL + this.flowStateR) * trachImpedance, -2.2, 2.2);

        const dtWL = this.dt * omegaL;
        const dtWR = this.dt * omegaR;

        const phaseNoiseL = (0.0004 + 0.0032 * stackModeL + 0.0055 * gritOverdriveL) * jetNoiseL * Math.min(pSub, 2.8) * valveOpenL;
        const phaseNoiseR = (0.0004 + 0.0032 * stackModeR + 0.0055 * gritOverdriveR) * jetNoiseR * Math.min(pSub, 2.8) * valveOpenR;

        const a1L = this.labialAccel(
          this.uL, this.vL, this.uRostL, muL, etaL, c3L, effGapL, aScaleL, pCarina, tractCoupling,
          this.uR, crossGain, contactStiffL, mucosalGainL, pokeForceL
        ) + phaseNoiseL;
        const a1R = this.labialAccel(
          this.uR, this.vR, this.uRostR, muR, etaR, c3R, effGapR, aScaleR, pCarina, tractCoupling,
          this.uL, crossGain, contactStiffR, mucosalGainR, pokeForceR
        ) + phaseNoiseR;

        const uLPred = this.uL + dtWL * this.vL;
        const vLPred = this.vL + dtWL * a1L;
        const uRPred = this.uR + dtWR * this.vR;
        const vRPred = this.vR + dtWR * a1R;

        const a2L = this.labialAccel(
          uLPred, vLPred, this.uRostL, muL, etaL, c3L, effGapL, aScaleL, pCarina, tractCoupling,
          uRPred, crossGain, contactStiffL, mucosalGainL, pokeForceL
        );
        const a2R = this.labialAccel(
          uRPred, vRPred, this.uRostR, muR, etaR, c3R, effGapR, aScaleR, pCarina, tractCoupling,
          uLPred, crossGain, contactStiffR, mucosalGainR, pokeForceR
        );

        const prevU_L = this.uL;
        const prevU_R = this.uR;
        this.uL = clamp(this.uL + 0.5 * dtWL * (this.vL + vLPred), -2.4, 2.4);
        this.vL = clamp(this.vL + 0.5 * dtWL * (a1L + a2L), -3.6, 3.6);
        this.uR = clamp(this.uR + 0.5 * dtWR * (this.vR + vRPred), -2.4, 2.4);
        this.vR = clamp(this.vR + 0.5 * dtWR * (a1R + a2R), -3.6, 3.6);

        // Integrate 2nd-order rostral mucosal ribbon mode (uRost, vRost)
        const dtRostL = dtWL * rostDetuneL;
        const dtRostR = dtWR * rostDetuneR;
        const rostGapL = Math.max(0.0, effGapL) + aScaleL * this.uRostL;
        const rostGapR = Math.max(0.0, effGapR) + aScaleR * this.uRostR;
        const rostWallL = rostGapL < 0.0 ? (-rostGapL / aScaleL) * 0.95 : 0.0;
        const rostWallR = rostGapR < 0.0 ? (-rostGapR / aScaleR) * 0.95 : 0.0;
        const aRostL = 1.35 * (this.uL - this.uRostL) - 0.35 * this.uRostL - rostDampL * this.vRostL + rostWallL;
        const aRostR = 1.35 * (this.uR - this.uRostR) - 0.35 * this.uRostR - rostDampR * this.vRostR + rostWallR;
        this.vRostL = clamp(this.vRostL + dtRostL * aRostL, -3.6, 3.6);
        this.uRostL = clamp(this.uRostL + dtRostL * this.vRostL, -2.4, 2.4);
        this.vRostR = clamp(this.vRostR + dtRostR * aRostR, -3.6, 3.6);
        this.uRostR = clamp(this.uRostR + dtRostR * this.vRostR, -2.4, 2.4);

        // Sub-sample upward zero-crossing period tracker for exact telemetry f0L / f0R
        this.samplesSinceCrossL += 1.0;
        if (prevU_L <= 0.0 && this.uL > 0.0 && this.vL > 0.06) {
          const fracCross = -prevU_L / Math.max(1e-9, this.uL - prevU_L);
          const periodSamples = this.samplesSinceCrossL - 1.0 + fracCross;
          if (periodSamples >= this.fsInt / 8200.0 && periodSamples <= this.fsInt / 45.0) {
            const instF0 = this.fsInt / periodSamples;
            this.measF0L = this.oscActiveL ? this.measF0L + 0.35 * (instF0 - this.measF0L) : instF0;
            this.oscActiveL = true;
          }
          this.samplesSinceCrossL = 1.0 - fracCross;
        } else if (this.samplesSinceCrossL > this.fsInt / 38.0) {
          this.oscActiveL = false;
        }

        this.samplesSinceCrossR += 1.0;
        if (prevU_R <= 0.0 && this.uR > 0.0 && this.vR > 0.06) {
          const fracCross = -prevU_R / Math.max(1e-9, this.uR - prevU_R);
          const periodSamples = this.samplesSinceCrossR - 1.0 + fracCross;
          if (periodSamples >= this.fsInt / 8500.0 && periodSamples <= this.fsInt / 45.0) {
            const instF0 = this.fsInt / periodSamples;
            this.measF0R = this.oscActiveR ? this.measF0R + 0.35 * (instF0 - this.measF0R) : instF0;
            this.oscActiveR = true;
          }
          this.samplesSinceCrossR = 1.0 - fracCross;
        } else if (this.samplesSinceCrossR > this.fsInt / 38.0) {
          this.oscActiveR = false;
        }

        const rawGapL = Math.min(
          effGapL + aScaleL * this.uL,
          effGapL + aScaleL * this.uRostL + 0.014 * (1.0 - stackModeL)
        );
        const rawGapR = Math.min(
          effGapR + aScaleR * this.uR,
          effGapR + aScaleR * this.uRostR + 0.014 * (1.0 - stackModeR)
        );
        const openL = softOpening(rawGapL, sharpL);
        const openR = softOpening(rawGapR, sharpR);

        // Pure emergent Rothenberg supraglottal inertive volume velocity
        const backMod = clamp(1.0 - 0.10 * pBack / Math.max(0.45, pSub), 0.72, 1.28);
        const uQsL = (openL / (0.20 + 0.40 * openL)) * dynDriveL * backMod * gainL;
        const uQsR = (openR / (0.20 + 0.40 * openR)) * dynDriveR * backMod * gainR;

        const tauInertL = uQsL > this.flowStateL
          ? 0.000042 + 0.0022 * inertFactorL * openL
          : 0.000006 + 0.00038 * inertFactorL * openL;
        const tauInertR = uQsR > this.flowStateR
          ? 0.000042 + 0.0022 * inertFactorR * openR
          : 0.000006 + 0.00038 * inertFactorR * openR;

        this.flowStateL += (1.0 - Math.exp(-this.dt / tauInertL)) * (uQsL - this.flowStateL);
        this.flowStateR += (1.0 - Math.exp(-this.dt / tauInertR)) * (uQsR - this.flowStateR);

        const flowL = this.flowStateL;
        const flowR = this.flowStateR;

        // Bronchial turbulence + physical mucosal shutter-click excitation + soft inspiratory mini-breath rush
        const wideBreathL = clamp((effGapL - 0.19) * 0.55, 0.0, 0.20);
        const wideBreathR = clamp((effGapR - 0.19) * 0.55, 0.0, 0.20);
        const activeVoice = 0.002 + 0.998 * Math.max(
          this.panEnvL,
          this.panEnvR,
          clamp((effGapL - 0.22) * 3.0, 0.0, 1.0),
          clamp((effGapR - 0.22) * 3.0, 0.0, 1.0)
        );
        const turbGainL =
          (0.00008 + 0.018 * stackModeL + 0.036 * gritOverdriveL + wideBreathL) *
          activeVoice * Math.min(openL * 3.2, 1.0) * Math.pow(pSub, 0.72);
        const turbGainR =
          (0.00008 + 0.018 * stackModeR + 0.036 * gritOverdriveR + wideBreathR) *
          activeVoice * Math.min(openR * 3.2, 1.0) * Math.pow(pSub, 0.72);

        const clickExcite = mucosalClickImpulse * (0.36 + 0.18 * (jetNoiseL + jetNoiseR));
        const totalFlow = flowL + flowR + turbGainL * jetNoiseL + turbGainR * jetNoiseR + clickExcite + inspBreathFlow;

        // Kirchhoff-realistic tracheal boundary reflections (|Rs * Rg| ~ 0.68-0.73 during phonation -> Q1 ~ 5-6;
        // caudal Rs vents -> 0.10 when bronchi abduct wide open during inspiration!)
        const openRSyrinx = clamp((0.87 - 0.22 * (openL + openR)) * (1.0 - 0.84 * abductVent), 0.10, 0.87);
        const targetRSyrinx = 0.36 * (1.0 - valveOpenAny) + openRSyrinx * valveOpenAny;
        const oecAreaRatio = clamp(Math.pow(oecMl / 0.45, 0.42) / boreNorm, 0.45, 2.40);
        const openRGlottis = clamp(-0.76 - 0.06 * clamp(oecAreaRatio - 0.85, -0.5, 1.2), -0.85, -0.68);
        const targetRGlottis = -0.46 * (1.0 - valveOpenAny) + openRGlottis * valveOpenAny;

        this.smoothRSyrinx += 0.008 * (targetRSyrinx - this.smoothRSyrinx);
        this.smoothRGlottis += 0.008 * (targetRGlottis - this.smoothRGlottis);

        const pInject = totalFlow * 0.42 * trachImpedance;
        const newPFwd = pInject + this.smoothRSyrinx * this.wgLossBwd;
        const newPBwd = this.smoothRGlottis * this.wgLossFwd + 0.09 * this.prevOecLow;

        this.pFwd[this.wgWrite] = clamp(newPFwd, -3.6, 3.6);
        this.pBwd[this.wgWrite] = clamp(newPBwd, -3.6, 3.6);
        this.wgWrite = (this.wgWrite + 1) & this.wgMask;

        // Glottal volume velocity entering the OEC shunt compliance: U_glot = (1 - R_glot) * pFwd / Z_0
        const uGlottalOut = (1.0 - this.smoothRGlottis) * pFwdGlottis * 0.56;

        // Fletcher et al. (2006) 2-Pole Shunt-Compliance OEC Low-Pass Transfer Function (v2 = U_beak / U_glottis):
        // Unity gain (0 dB) below f_OEC, true un-cancelled Q_OEC peak at f == f_OEC, -12 dB/oct harmonic suppression above!
        const v3 = uGlottalOut - this.svfIc2eq;
        const v1 = a1Svf * this.svfIc1eq + a2Svf * v3;
        const v2 = this.svfIc2eq + a2Svf * this.svfIc1eq + a3Svf * v3;
        this.svfIc1eq = 2.0 * v1 - this.svfIc1eq;
        this.svfIc2eq = 2.0 * v2 - this.svfIc2eq;
        this.prevOecLow = clamp(v2, -2.5, 2.5);

        // Secondary cranial pharyngeal mode (parallel oral-pharyngeal transmission for bright harmonic stacks & wide gape)
        const vp3 = uGlottalOut - this.pharynxIc2eq;
        const vp1 = a1Ph * this.pharynxIc1eq + a2Ph * vp3;
        const vp2 = this.pharynxIc2eq + gPh * vp1;
        this.pharynxIc1eq = 2.0 * vp1 - this.pharynxIc1eq;
        this.pharynxIc2eq = 2.0 * vp2 - this.pharynxIc2eq;

        const oralDirect = (0.14 + 0.38 * gapeVent) * uGlottalOut;
        const pharynxContribution = (0.18 + 0.34 * Math.max(stackModeL * valveOpenL, stackModeR * valveOpenR) + 0.18 * gapeVent) * vp1;
        const uBeak = v2 + pharynxContribution + oralDirect;

        // True circular-aperture beak piston radiation: P_rad proportional to dU_beak/dt (+6 dB/oct up to fRadCorner!),
        // plus optional cyborg copper waveguide horn / 12AX7 tube pickup (hornPickup = 0.0 on all 6 natural birds)
        this.radLp += radShelfAlpha * (uBeak - this.radLp);
        const dUBeak = (uBeak - this.radLp) * radDiffNorm;
        const hornDirect = clamp(cur.hornPickup, 0.0, 1.5) * Math.max(this.panEnvL, this.panEnvR);
        const radiated = beakRadCoupling * (2.55 * dUBeak + (0.24 + 4.20 * hornDirect) * uBeak);

        this.silkLp += silkAlpha * (radiated - this.silkLp);
        sampleAccum += this.silkLp;

        if (s === OVERSAMPLE - 1) {
          this.sumSqL += this.vL * this.vL;
          this.sumSqR += this.vR * this.vR;
          if (rawGapL <= 0.004) this.closedCountL++;
          if (rawGapR <= 0.004) this.closedCountR++;
          this.flowAccL += flowL;
          this.flowAccR += flowR;
          this.voicePowL += 0.012 * (flowL * flowL - this.voicePowL);
          this.voicePowR += 0.012 * (flowR * flowR - this.voicePowR);
        }
      }

      const rawMono = (sampleAccum / OVERSAMPLE) * cur.masterGain;
      const dcOut = rawMono - this.dcX1 + 0.996 * this.dcY1;
      this.dcX1 = rawMono;
      this.dcY1 = dcOut;

      // C1-continuous envelope soft-knee ceiling: prevents flat-topped tanh harmonic clipping when
      // f0 == F1_trach == f_OEC double-resonances align, preserving pure avian whistle waveforms & 0 d3 pops!
      const absOut = Math.abs(dcOut);
      const limCoeff = absOut > this.limMid
        ? 1.0 - Math.exp(-1.0 / (0.0008 * this.fs))
        : 1.0 - Math.exp(-1.0 / (0.022 * this.fs));
      this.limMid += limCoeff * (absOut - this.limMid);
      this.limEnv += (1.0 - Math.exp(-1.0 / (0.0009 * this.fs))) * (this.limMid - this.limEnv);
      const limGain = 0.74 / Math.pow(1.0 + Math.pow(this.limEnv / 0.76, 2.4), 1.0 / 2.4);
      const cleanSample = Math.tanh(dcOut * limGain * 1.06) * 0.84;

      // Phase-coherent ±8% mid-side educational stereo cue driven by smoothed aerodynamic voice balance:
      // 0.0 deg phase shift across 0-24 kHz, zero >2.6 kHz phase inversion, and 0.0000 DC leak!
      const rawLatPan = (this.voicePowR - this.voicePowL) / (this.voicePowR + this.voicePowL + 0.0006);
      this.smoothPan += slowCoeff * (clamp(rawLatPan, -1.0, 1.0) - this.smoothPan);
      outL[i] = clamp(cleanSample * (1.0 - 0.08 * this.smoothPan), -0.92, 0.92);
      if (outR !== outL) {
        outR[i] = clamp(cleanSample * (1.0 + 0.08 * this.smoothPan), -0.92, 0.92);
      }

      this.lastF0L = this.oscActiveL ? this.measF0L : f0EstL;
      this.lastF0R = this.oscActiveR ? this.measF0R : f0EstR;

      this.telemCounter++;
      if (this.telemCounter >= this.telemInterval) {
        const invN = 1.0 / this.telemCounter;
        const rmsL = Math.sqrt(this.sumSqL * invN);
        const rmsR = Math.sqrt(this.sumSqR * invN);
        this.port.postMessage({
          type: 'telemetry',
          rmsL,
          rmsR,
          closedRatioL: this.closedCountL * invN,
          closedRatioR: this.closedCountR * invN,
          flowL: this.flowAccL * invN,
          flowR: this.flowAccR * invN,
          f0L: this.lastF0L,
          f0R: this.lastF0R,
          activeL: Boolean(this.oscActiveL && rmsL > 0.05 && muL > -0.15),
          activeR: Boolean(this.oscActiveR && rmsR > 0.05 && muR > -0.15),
          ptpL: this.lastPtpL,
          ptpR: this.lastPtpR,
          fOec: this.lastFOec,
          fTrach1: this.lastFTrach1,
          uL: this.uL,
          uR: this.uR,
        });
        this.telemCounter = 0;
        this.sumSqL = 0.0;
        this.sumSqR = 0.0;
        this.closedCountL = 0;
        this.closedCountR = 0;
        this.flowAccL = 0.0;
        this.flowAccR = 0.0;
      }
    }

    return true;
  }
}

registerProcessor('syrinx-processor', SyrinxProcessor);
