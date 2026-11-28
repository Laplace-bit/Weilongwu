/**
 * @fileoverview 2D Viscoelastic Songbird Syrinx Model
 *
 * Maintains the real biomechanical state of the songbird's vocal organ in physiological units,
 * integrates muscle + pointer forces via damped viscoelastic springs, computes mid-song poke
 * warbling, and exposes normalized coordinates nestled inside the perched songbird illustration.
 */

import { SPECIES_PRESETS } from '../driver/birdsong-presets.js';

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

const DOF_DEFS = {
  pSub:        { min: -0.85, max: 5.20, rest: 0.18, stiffness: 64.0, damping: 14.5 },
  pIcas:       { min: -0.85, max: 5.20, rest: 0.18, stiffness: 60.0, damping: 14.0 },
  gapL:        { min: -0.075, max: 0.54, rest: 0.088, stiffness: 90.0, damping: 16.5 },
  gapR:        { min: -0.075, max: 0.54, rest: 0.086, stiffness: 90.0, damping: 16.5 },
  tensionL:    { min: -1.15, max: 1.75, rest: 0.00, stiffness: 84.0, damping: 15.5 },
  tensionR:    { min: -1.15, max: 1.75, rest: 0.00, stiffness: 84.0, damping: 15.5 },
  mtmStretchL: { min: 0.00, max: 1.48, rest: 0.88, stiffness: 78.0, damping: 14.5 },
  mtmStretchR: { min: 0.00, max: 1.48, rest: 0.90, stiffness: 78.0, damping: 14.5 },
  pessulusX:   { min: -1.50, max: 1.50, rest: 0.0,  stiffness: 95.0, damping: 16.5 },
  pessulusY:   { min: -1.50, max: 1.50, rest: 0.0,  stiffness: 95.0, damping: 16.5 },
  tracheaLenMm:{ min: 11.0, max: 142.0, rest: 40.5, stiffness: 58.0, damping: 12.5 },
  tracheaWidth:{ min: 0.28, max: 2.20, rest: 1.00, stiffness: 68.0, damping: 14.0 },
  trachBendX:  { min: -1.35, max: 1.35, rest: 0.00, stiffness: 86.0, damping: 14.5 },
  oecVolMl:    { min: 0.015, max: 2.85, rest: 0.62, stiffness: 60.0, damping: 14.0 },
  beakGapeMm:  { min: 0.18, max: 27.5, rest: 0.35, stiffness: 66.0, damping: 14.5 },
};

export class SyrinxAnatomyModel {
  constructor() {
    this.time = 0.0;

    this.dofs = {};
    for (const [k, def] of Object.entries(DOF_DEFS)) {
      this.dofs[k] = {
        value: def.rest,
        vel: 0.0,
        rest: def.rest,
        min: def.min,
        max: def.max,
        baseStiffness: def.stiffness,
        baseDamping: def.damping,
        stiffness: def.stiffness,
        damping: def.damping,
      };
    }

    // Autonomous Birdsong Driver state
    this.activeSpeciesIndex = 0; // Default: Wood Thrush
    this.driverPlaying = false;
    this.driverTime = 0.0;
    this.synthEngine = null;
    this._synthBronchCoupling = null;

    // Optional Shift-drag per-voice melody loopers
    this.branchLoops = {
      L: { recording: false, active: false, samples: [], duration: 0, cursor: 0 },
      R: { recording: false, active: false, samples: [], duration: 0, cursor: 0 },
    };

    // Active pointer grabs: Map<pointerId, GrabState>
    this.activeGrabs = new Map();
    this.hoveredPart = null;
    this.manualTracheaBlend = 0.0;

    // Emergent warble / flutter when poked or stretched mid-song
    this.warble = {
      ampL: 0.0,
      ampR: 0.0,
      ampPressure: 0.0,
      ampTrachea: 0.0,
      phaseL: 0.0,
      phaseR: 1.7,
      ripples: [],
    };

    this.layout = {
      width: 1280,
      height: 800,
      cx: 640,
      cy: 410,
      scale: 260,
    };
    this.landmarks = {};
    this.applySpeciesMorphology(this.currentSpecies, true);
  }

  get currentSpecies() {
    return SPECIES_PRESETS[this.activeSpeciesIndex];
  }

  /**
   * Updates the physical organ's resting morphology, tissue equilibria, and superfast/heavy
   * viscoelastic muscle kinetics to match the selected bird species!
   */
  applySpeciesMorphology(sp, snapImmediate = false) {
    if (!sp || !sp.organ) return;
    const org = sp.organ;
    const speedScale = org.muscleSpeedScale || 1.0;
    const dampScale = Math.sqrt(speedScale);

    this.dofs.tracheaLenMm.rest = org.tracheaLenMm;
    this.dofs.tracheaWidth.rest = 1.0;
    this.dofs.trachBendX.rest = 0.0;
    this.dofs.tensionL.rest = 0.0;
    this.dofs.tensionR.rest = 0.0;
    this.dofs.mtmStretchL.rest = org.restMtmL;
    this.dofs.mtmStretchR.rest = org.restMtmR;
    this.dofs.gapL.rest = org.restGapL;
    this.dofs.gapR.rest = org.restGapR;
    this.dofs.oecVolMl.rest = org.restOecMl;
    this.dofs.beakGapeMm.rest = org.restBeakMm;

    for (const [k, d] of Object.entries(this.dofs)) {
      const isSyringealMuscle =
        k === 'tensionL' || k === 'tensionR' || k === 'gapL' || k === 'gapR' || k === 'mtmStretchL' || k === 'mtmStretchR';
      d.stiffness = d.baseStiffness * (isSyringealMuscle ? speedScale : 1.0);
      d.damping = d.baseDamping * (isSyringealMuscle ? dampScale : 1.0);
      if (snapImmediate) {
        d.value = d.rest;
        d.vel = 0.0;
      }
    }
  }

  selectSpecies(index, forcePlay = undefined) {
    if (index === this.activeSpeciesIndex && this.driverPlaying && forcePlay === false) {
      this.driverPlaying = false;
      return;
    }
    this.activeSpeciesIndex = clamp(index, 0, SPECIES_PRESETS.length - 1);
    const sp = this.currentSpecies;
    const shouldPlay = forcePlay !== undefined ? Boolean(forcePlay) : sp.autoPlayOnSelect !== false;
    this.applySpeciesMorphology(sp, !this.driverPlaying && !shouldPlay);
    this.driverPlaying = shouldPlay;
    if (shouldPlay) {
      this.driverTime = 0.0;
    }
    this.updateLandmarks();
  }

  toggleDriver() {
    this.driverPlaying = !this.driverPlaying;
    this.applySpeciesMorphology(this.currentSpecies, false);
  }

  cycleSpecies(delta) {
    const count = SPECIES_PRESETS.length;
    const nextIdx = ((this.activeSpeciesIndex + delta) % count + count) % count;
    this.selectSpecies(nextIdx);
  }

  /** Injects a gentle physical poke / warble ripple into a part */
  triggerTissuePoke(partId, nx, ny, strength = 0.65) {
    const s = clamp(strength, 0.15, 1.5);
    this.warble.ripples.push({ partId, nx, ny, age: 0.0, strength: s });
    if (this.warble.ripples.length > 12) this.warble.ripples.shift();

    if (partId.endsWith('L') || partId === 'pessulus') {
      this.warble.ampL = clamp(this.warble.ampL + 0.58 * s, 0, 1.35);
    }
    if (partId.endsWith('R') || partId === 'pessulus') {
      this.warble.ampR = clamp(this.warble.ampR + 0.58 * s, 0, 1.35);
    }
    if (partId === 'airSacCaudal' || partId === 'icasL' || partId === 'icasR') {
      this.warble.ampPressure = clamp(this.warble.ampPressure + 0.62 * s, 0, 1.35);
    }
    if (partId === 'trachea' || partId === 'oec') {
      this.warble.ampTrachea = clamp(this.warble.ampTrachea + 0.55 * s, 0, 1.25);
    }
  }

  clearAllLoops() {
    this.branchLoops.L = { recording: false, active: false, samples: [], duration: 0, cursor: 0 };
    this.branchLoops.R = { recording: false, active: false, samples: [], duration: 0, cursor: 0 };
  }

  startBranchLoopRecording(branch) {
    const loop = this.branchLoops[branch];
    if (!loop) return;
    loop.recording = true;
    loop.active = false;
    loop.samples = [];
    loop.duration = 0;
    loop.cursor = 0;
  }

  finishBranchLoopRecording(branch) {
    const loop = this.branchLoops[branch];
    if (!loop || !loop.recording) return;
    loop.recording = false;
    if (loop.samples.length >= 12 && loop.duration >= 0.35) {
      loop.active = true;
      loop.cursor = 0;
    } else {
      loop.samples = [];
      loop.active = false;
    }
  }

  step(dt, audioTelemetry) {
    const safeDt = clamp(dt, 0.001, 0.05);
    this.time += safeDt;

    // 1. Baseline / Autonomous Song Targets
    const targets = {};
    for (const [k, d] of Object.entries(this.dofs)) {
      targets[k] = d.rest;
    }

    const org = this.currentSpecies.organ;

    if (this.driverPlaying) {
      this.driverTime += safeDt;
      const motor = this.currentSpecies.evaluate(this.driverTime);
      for (const k of Object.keys(this.dofs)) {
        if (k in motor) targets[k] = motor[k];
      }
      if ('demoMidiL' in motor) targets.demoMidiL = motor.demoMidiL;
      if ('demoMidiR' in motor) targets.demoMidiR = motor.demoMidiR;
      if ('demoEffMidiL' in motor) targets.demoEffMidiL = motor.demoEffMidiL;
      if ('demoEffMidiR' in motor) targets.demoEffMidiR = motor.demoEffMidiR;
    } else {
      // Allometric resting breath cycle (25-110 breaths/min scaled by avian body mass, silent below PTP,
      // gently cycling between positive expiration and sub-atmospheric inspiration!)
      const fResp = clamp(2.9 * Math.pow(org.bodyMassG || 40.0, -0.22), 0.65, 1.85);
      const breathSin = Math.sin(this.time * 2.0 * Math.PI * fResp);
      targets.pSub = 0.05 + 0.14 * breathSin;
      targets.pIcas = 0.05 + 0.13 * breathSin;
      const inspAbduct = Math.max(0.0, -breathSin) * 0.032;
      targets.gapL = org.restGapL + inspAbduct;
      targets.gapR = org.restGapR + inspAbduct;
    }

    // 1b. SynthBird Live QWERTY / Macro Synthesizer Targets (layers cleanly underneath mouse grabs!)
    let synthVoicePlaying = false;
    if (this.synthEngine) {
      const res = this.synthEngine.stepAndApplyTargets(safeDt, targets, org);
      synthVoicePlaying = Boolean(res?.activeVoicePlay);
      this._synthBronchCoupling = res?.bronchCoupling ?? null;
    } else {
      this._synthBronchCoupling = null;
    }

    // 2. Optional Shift-drag Voice Loops
    for (const branch of ['L', 'R']) {
      const loop = this.branchLoops[branch];
      if (loop.recording) {
        loop.duration += safeDt;
        loop.samples.push({
          t: loop.duration,
          tension: this.dofs[`tension${branch}`].value,
          gap: this.dofs[`gap${branch}`].value,
          mtm: this.dofs[`mtmStretch${branch}`].value,
        });
        if (loop.duration > 7.5) {
          this.finishBranchLoopRecording(branch);
        }
      } else if (loop.active && loop.samples.length > 1) {
        loop.cursor = (loop.cursor + safeDt) % loop.duration;
        const idxApprox = (loop.cursor / loop.duration) * (loop.samples.length - 1);
        const i0 = Math.floor(idxApprox);
        const i1 = (i0 + 1) % loop.samples.length;
        const frac = idxApprox - i0;
        const s0 = loop.samples[i0];
        const s1 = loop.samples[i1];
        targets[`tension${branch}`] = lerp(s0.tension, s1.tension, frac);
        targets[`gap${branch}`] = lerp(s0.gap, s1.gap, frac);
        targets[`mtmStretch${branch}`] = lerp(s0.mtm, s1.mtm, frac);
      }
    }

    // 3. Apply Live Tactile Pointer Grabs (supports multi-touch!)
    let userControllingPressure = false;
    let vocalOrganEngaged = false;
    let grabbedLeftVoice = false;
    let grabbedRightVoice = false;
    let grabbedUpperTract = false;
    let holdingTrachea = false;
    const directlyHeldDofs = new Set();
    let maxGrabIntensity = 0.0;

    for (const grab of this.activeGrabs.values()) {
      for (const [dofName, val] of Object.entries(grab.dofTargets)) {
        targets[dofName] = val;
        directlyHeldDofs.add(dofName);
      }
      if (grab.partId === 'airSacCaudal') {
        userControllingPressure = true;
      }
      if (grab.partId === 'trachea') {
        holdingTrachea = true;
      }
      if (
        grab.partId === 'labiaL' ||
        grab.partId === 'muscleVSL' ||
        grab.partId === 'mtmL' ||
        grab.partId === 'bronchusL'
      ) {
        grabbedLeftVoice = true;
      } else if (
        grab.partId === 'labiaR' ||
        grab.partId === 'muscleVSR' ||
        grab.partId === 'mtmR' ||
        grab.partId === 'bronchusR'
      ) {
        grabbedRightVoice = true;
      } else if (
        grab.partId === 'beak' ||
        grab.partId === 'oec' ||
        grab.partId === 'trachea' ||
        grab.partId === 'pessulus'
      ) {
        grabbedUpperTract = true;
      }
      if (
        grab.partId !== 'airSacCaudal' &&
        grab.partId !== 'icasL' &&
        grab.partId !== 'icasR'
      ) {
        vocalOrganEngaged = true;
        maxGrabIntensity = Math.max(maxGrabIntensity, grab.intensity || 0.72);
      }
      if (grab.pointerSpeed > 0.65) {
        const boost = clamp((grab.pointerSpeed - 0.65) * 0.075, 0, 0.38);
        if (grab.partId.endsWith('L') || grab.partId === 'pessulus') {
          this.warble.ampL = clamp(this.warble.ampL + boost, 0, 1.35);
        }
        if (grab.partId.endsWith('R') || grab.partId === 'pessulus') {
          this.warble.ampR = clamp(this.warble.ampR + boost, 0, 1.35);
        }
        if (grab.partId === 'airSacCaudal' || grab.partId === 'icasL' || grab.partId === 'icasR') {
          this.warble.ampPressure = clamp(this.warble.ampPressure + boost, 0, 1.35);
        }
        if (grab.partId === 'trachea' || grab.partId === 'oec') {
          this.warble.ampTrachea = clamp(this.warble.ampTrachea + boost * 1.15, 0, 1.35);
        }
      }
    }

    const trBlendRate = 1.0 - Math.exp(-safeDt * (holdingTrachea ? 16.0 : 7.0));
    this.manualTracheaBlend = lerp(this.manualTracheaBlend, holdingTrachea ? 1.0 : 0.0, trBlendRate);

    // 4. Smart Species-Specific Active-Voice & Breath Engagement during manual drags
    const anyBranchLoopActive = this.branchLoops.L.active || this.branchLoops.R.active;
    if (!this.driverPlaying && !synthVoicePlaying && (vocalOrganEngaged || userControllingPressure || anyBranchLoopActive)) {
      if (!directlyHeldDofs.has('gapL') && !this.branchLoops.L.active) targets.gapL = org.restGapL;
      if (!directlyHeldDofs.has('gapR') && !this.branchLoops.R.active) targets.gapR = org.restGapR;
    }

    if (!userControllingPressure && (vocalOrganEngaged || anyBranchLoopActive)) {
      const reflexP = 1.62 + 0.72 * maxGrabIntensity;
      targets.pSub = Math.max(targets.pSub, reflexP);
      if (!directlyHeldDofs.has('pIcas')) {
        targets.pIcas = Math.max(targets.pIcas, reflexP * 0.98);
      }
    }

    // Physiological manual mandible-parting reflex (Guardrail #2):
    // Birds rest silently with closed bills (~0.35 mm), and naturally part their mandibles when phonating manually!
    if (!this.driverPlaying && !synthVoicePlaying && !directlyHeldDofs.has('beakGapeMm') && (vocalOrganEngaged || userControllingPressure || anyBranchLoopActive)) {
      const gScale = org.beakGapeScale || 1.0;
      const organGape = (vocalOrganEngaged || anyBranchLoopActive) ? 4.4 * gScale : 0.0;
      const breathGape = userControllingPressure
        ? clamp((targets.pSub - 0.36) * 2.35, 0.0, 5.4) * gScale
        : 0.0;
      targets.beakGapeMm = Math.max(targets.beakGapeMm, org.restBeakMm + Math.max(organGape, breathGape));
    }

    // Solo unilateral isolation when touching ONLY Left or ONLY Right voice with Auto-Play OFF,
    // and un-muting grabbed hemi-syrinx during Auto-Play rests!
    if (grabbedLeftVoice) {
      if (!directlyHeldDofs.has('gapL')) {
        targets.gapL = Math.max(targets.gapL, Math.max(0.062, org.restGapL));
      }
      if (!this.driverPlaying && !synthVoicePlaying && !grabbedRightVoice && !directlyHeldDofs.has('gapR') && !this.branchLoops.R.active) {
        targets.gapR = -0.032;
      }
    }
    if (grabbedRightVoice) {
      if (!directlyHeldDofs.has('gapR')) {
        targets.gapR = Math.max(targets.gapR, 0.082);
      }
      if (!this.driverPlaying && !synthVoicePlaying && !grabbedLeftVoice && !directlyHeldDofs.has('gapL') && !this.branchLoops.L.active) {
        targets.gapL = -0.032;
      }
    }
    if (grabbedUpperTract && targets.gapL <= 0.01 && targets.gapR <= 0.01) {
      if (!directlyHeldDofs.has('gapL')) targets.gapL = Math.max(0.062, org.restGapL);
      if (!directlyHeldDofs.has('gapR')) targets.gapR = Math.max(org.restGapR, 0.010);
    }

    // Exaggerated manual windpipe longitudinal tracheal-pull tension coupling (stretching plunges bass; compressing shoots piccolo!)
    if (holdingTrachea) {
      const baseTr = org.tracheaLenMm || 40.5;
      const pipePull = clamp((baseTr - targets.tracheaLenMm) / (0.58 * baseTr), -1.05, 0.95);
      if (!directlyHeldDofs.has('tensionL')) {
        targets.tensionL = clamp(targets.tensionL + pipePull, -1.15, 1.75);
      }
      if (!directlyHeldDofs.has('tensionR')) {
        targets.tensionR = clamp(targets.tensionR + pipePull, -1.15, 1.75);
      }
    }

    // 5. Exaggerated Center Splitter (Pessulus) Differential Two-Voice Chord & Timbre Coupling
    const px = targets.pessulusX;
    const py = targets.pessulusY;
    if (Math.abs(px) > 0.002 || Math.abs(py) > 0.002) {
      if (!directlyHeldDofs.has('tensionL')) {
        targets.tensionL = clamp(targets.tensionL - 0.92 * py - 0.90 * px, -1.15, 1.75);
      }
      if (!directlyHeldDofs.has('tensionR')) {
        targets.tensionR = clamp(targets.tensionR - 0.92 * py + 0.90 * px, -1.15, 1.75);
      }
      if (!directlyHeldDofs.has('mtmStretchL')) {
        targets.mtmStretchL = clamp(targets.mtmStretchL - 0.52 * px - 0.32 * py, 0.00, 1.48);
      }
      if (!directlyHeldDofs.has('mtmStretchR')) {
        targets.mtmStretchR = clamp(targets.mtmStretchR + 0.52 * px - 0.32 * py, 0.00, 1.48);
      }
      if (!directlyHeldDofs.has('gapL')) {
        targets.gapL = clamp(targets.gapL - 0.11 * px, -0.065, 0.50);
      }
      if (!directlyHeldDofs.has('gapR')) {
        targets.gapR = clamp(targets.gapR + 0.11 * px, -0.065, 0.50);
      }
    }

    // 6. Decay Emergent Warble Flutter (at species-specific superfast/basal muscle twitch frequency!)
    const decay = Math.exp(-safeDt * 4.4);
    this.warble.ampL *= decay;
    this.warble.ampR *= decay;
    this.warble.ampPressure *= decay;
    this.warble.ampTrachea *= decay;
    const wHz = org.warbleHz || 19.0;
    this.warble.phaseL += safeDt * 2.0 * Math.PI * wHz;
    this.warble.phaseR += safeDt * 2.0 * Math.PI * (wHz * 1.15);

    for (let i = this.warble.ripples.length - 1; i >= 0; i--) {
      this.warble.ripples[i].age += safeDt;
      if (this.warble.ripples[i].age > 0.78) {
        this.warble.ripples.splice(i, 1);
      }
    }

    // 7. Integrate Viscoelastic Springs (<=0.25 ms sub-steps + Elemans et al. 2008 superfast syringeal muscle kinetics!)
    const nSub = Math.max(16, Math.ceil(safeDt / 0.00025));
    const subDt = safeDt / nSub;
    const speedScale = org.muscleSpeedScale || 1.0;
    const omegaSuperfast = 325.0 * Math.sqrt(speedScale);
    const omegaCranial = 185.0;

    for (const [k, d] of Object.entries(this.dofs)) {
      let kSpring = d.stiffness;
      let cDamp = d.damping;
      if (directlyHeldDofs.has(k)) {
        kSpring = d.stiffness * 5.2;
        cDamp = d.damping * 2.35;
      } else if ((this.driverPlaying || synthVoicePlaying) && k !== 'pessulusX' && k !== 'pessulusY') {
        const isSuperfast =
          k === 'tensionL' ||
          k === 'tensionR' ||
          k === 'gapL' ||
          k === 'gapR' ||
          k === 'mtmStretchL' ||
          k === 'mtmStretchR' ||
          k === 'pSub' ||
          k === 'pIcas';
        const omega = isSuperfast ? omegaSuperfast : omegaCranial;
        kSpring = omega * omega;
        cDamp = 2.0 * omega; // Critical damping (zeta = 1.0 -> zero overshoot & crisp 22-25 Hz trills/clicks!)
      }
      for (let s = 0; s < nSub; s++) {
        const force = kSpring * (targets[k] - d.value) - cDamp * d.vel;
        d.vel += force * subDt;
        d.value = clamp(d.value + d.vel * subDt, d.min, d.max);
      }
    }

    this.updateLandmarks(audioTelemetry);
  }

  getAudioParams() {
    const d = this.dofs;
    const w = this.warble;
    const org = this.currentSpecies.organ;
    const flutterL = w.ampL * Math.sin(w.phaseL);
    const flutterR = w.ampR * Math.sin(w.phaseR);
    const flutterP = w.ampPressure * Math.sin(w.phaseL * 0.82);

    return {
      pSub: clamp(d.pSub.value + 0.42 * flutterP, -0.85, 5.2),
      pIcas: clamp(d.pIcas.value + 0.36 * flutterP, -0.85, 5.2),
      gapL: clamp(d.gapL.value + 0.028 * flutterL, -0.075, 0.54),
      gapR: clamp(d.gapR.value + 0.028 * flutterR, -0.075, 0.54),
      tensionL: clamp(d.tensionL.value + 0.12 * flutterL, -1.15, 1.75),
      tensionR: clamp(d.tensionR.value + 0.12 * flutterR, -1.15, 1.75),
      mtmStretchL: d.mtmStretchL.value,
      mtmStretchR: d.mtmStretchR.value,
      tracheaLenMm: clamp(d.tracheaLenMm.value + 2.2 * w.ampTrachea * Math.sin(w.phaseL * 1.1), 11.0, 145.0),
      tracheaWidth: d.tracheaWidth.value,
      oecVolMl: d.oecVolMl.value,
      beakGapeMm: d.beakGapeMm.value,
      // Comparative species organ morphometry & tissue biomechanics
      massLMg: org.massLMg,
      massRMg: org.massRMg,
      stiffLK0: org.stiffLK0,
      stiffRK0: org.stiffRK0,
      gammaL: org.gammaL,
      gammaR: org.gammaR,
      trachDiamMm: org.trachDiamMm,
      labialThickMmL: org.labialThickMmL,
      labialThickMmR: org.labialThickMmR,
      asymRestL: org.asymRestL,
      asymRestR: org.asymRestR,
      oecNeckMm: org.oecNeckMm,
      tractCoupling: org.tractCoupling,
      hornPickup: org.hornPickup || 0.0,
      hasBronchidesmus:
        this._synthBronchCoupling !== null && this.currentSpecies.isSynthBird
          ? this._synthBronchCoupling
          : org.hasBronchidesmus
            ? 1.0
            : 0.0,
      leftGain: org.leftGain,
      rightGain: org.rightGain,
    };
  }

  setViewport(width, height) {
    this.layout.width = width;
    this.layout.height = height;
    const rawPortrait = height > width * 1.05 || width < 680;
    const isSquare = !rawPortrait && height >= width * 0.95;
    const isPortrait = rawPortrait || isSquare;
    this.layout.isPortrait = isPortrait;
    this.layout.isSquare = isSquare;

    if (isPortrait) {
      const u = isSquare
        ? clamp(Math.min(width / 560, height / 620), 0.85, 2.80)
        : clamp(Math.min(width / 405, height / 720), 0.78, 2.80);
      const safeSide = isSquare
        ? Math.round(Math.max(18 * u, width * 0.045))
        : Math.round(Math.max(15 * u, width * 0.056));
      const safeTop = Math.round(height * (isSquare ? 0.042 : 0.078));
      const safeBottom = Math.round(height * (isSquare ? 0.042 : 0.106));

      const selectorY = safeTop;
      const selectorH = Math.round(34 * u);

      const kymoH = Math.round(46 * u);
      const kymoYSynth = height - safeBottom - kymoH;

      const stageTop = selectorY + selectorH + Math.round(4 * u);
      const stageBot = kymoYSynth - Math.round(88 * u);
      const stageH = Math.max(200 * u, stageBot - stageTop);

      const cx = width * 0.508;
      const cy = stageTop + stageH * 0.455;
      const scale = Math.min(width * (isSquare ? 0.46 : 0.65), stageH * 0.605);
      const birdBottomClearY = Math.round(cy + scale * 0.96 + 8 * u);
      const kymoYNatural = Math.min(
        kymoYSynth,
        Math.max(kymoYSynth - Math.round(74 * u), birdBottomClearY)
      );

      this.layout.uiScale = u;
      this.layout.safeSide = safeSide;
      this.layout.safeTop = safeTop;
      this.layout.safeBottom = safeBottom;
      this.layout.kymoH = kymoH;
      this.layout.kymoY = kymoYSynth;
      this.layout.kymoYSynth = kymoYSynth;
      this.layout.kymoYNatural = kymoYNatural;
      this.layout.selectorH = selectorH;
      this.layout.selectorY = selectorY;

      this.layout.cx = cx;
      this.layout.cy = cy;
      this.layout.scale = scale;
    } else {
      const usableH = Math.max(320, height - 118);
      // Shift bird slightly right on wide screens to balance the left-side Bird Song selector cards
      const sideOffset = width >= 920 ? Math.min(48, width * 0.032) : 0;
      this.layout.uiScale = 1;
      this.layout.cx = width * 0.5 + sideOffset;
      this.layout.cy = usableH * 0.495 + 4;
      this.layout.scale = Math.min(width * 0.300, usableH * 0.435);
    }
    this.updateLandmarks();
  }

  toScreen(nx, ny) {
    return {
      x: this.layout.cx + nx * this.layout.scale,
      y: this.layout.cy + ny * this.layout.scale,
    };
  }

  toNorm(x, y) {
    return {
      nx: (x - this.layout.cx) / this.layout.scale,
      ny: (y - this.layout.cy) / this.layout.scale,
    };
  }

  /**
   * Computes calm, natural 2D coordinates for the perched songbird (zero outer body deformation!)
   * while rendering authentic comparative internal syringeal morphometry across all 6 species:
   * tracheal bore & ring count, fused oscine tympanum vs. unfused basal Menurae rings,
   * Canary 1.48x left muscle hypertrophy, Cardinal/Thrush bronchial lateralization, and Finch SNILC bow.
   */
  updateLandmarks(telem = null) {
    const d = this.dofs;
    const w = this.warble;
    const org = this.currentSpecies.organ;

    // Keep outer bird neck & head posture 100% calm and species-proportioned (0.0000 px head drift on pipe sweeps!)
    const baseSpeciesTrach = Math.min(this.currentSpecies?.baseTracheaMm || 37.5, 64.0);
    const trachNorm = clamp((baseSpeciesTrach - 37.5) / 34.0, -0.35, 0.80);
    const neckStretch = trachNorm * 0.048;

    // Comparative tracheal bore (1.8 mm narrow Zebra Finch pipe up to 4.6 mm wide Lyrebird organ pipe!)
    const speciesBoreScale = clamp(Math.pow((org.trachDiamMm || 2.65) / 2.65, 0.58), 0.76, 1.38);
    const cutBaseTrachHalfW = 0.032 * speciesBoreScale;

    // Stationary outer bird head/neck anchors (0.0000 px outer bird deformation!)
    const syrinxCx = 0.082;
    const glottisX = 0.162;
    const baseGlottisY = -0.282 - neckStretch;
    const headCx = 0.165;
    const headCy = baseGlottisY - 0.112;
    const beakBaseY = headCy - 0.030;

    // Elastic accordion windpipe elongation/compression + lateral bending + Poisson bore coupling!
    const origTrachMm = org.tracheaLenMm || 40.5;
    const trStretchNorm = clamp(
      (d.tracheaLenMm.value - origTrachMm) / Math.max(16.0, origTrachMm * 0.85),
      -0.92,
      1.45
    );
    const glottisY = baseGlottisY + 0.012 * trStretchNorm;
    const tympanumY =
      -0.022 +
      0.070 * trStretchNorm +
      0.016 * clamp(d.pessulusY.value, -1.45, 1.45);
    const trachExtraCoil = Math.max(0.0, trStretchNorm - 0.25);
    const trachFlutter = 0.014 * w.ampTrachea * Math.sin(w.phaseL * 0.88);
    const trachCurveX = clamp(
      0.044 * (d.trachBendX?.value || 0.0) + 0.024 * trachExtraCoil + trachFlutter,
      -0.048,
      0.048
    );
    const poissonMul = clamp(1.0 - 0.10 * trStretchNorm, 0.85, 1.12);
    const trachHalfW =
      cutBaseTrachHalfW *
      clamp(0.48 + 0.52 * d.tracheaWidth.value, 0.54, 1.48) *
      poissonMul;

    // Dorsal cervical-esophageal + supra-glottal Oropharyngeal-Esophageal Cavity (OEC, Riede et al. 2004, 2006 PNAS)
    const oecExpand = clamp((d.oecVolMl.value - 0.03) / 2.25, -0.06, 1.16);
    const oecPos = Math.max(0.0, oecExpand);
    const oecHalfW = 0.042 + 0.038 * oecPos;
    const oecCenterY = glottisY + 0.016 + 0.024 * oecPos;
    const oecDropY = 0.024 * oecPos;
    const oecFrontX = glottisX + 0.034 + 0.014 * oecPos;
    const oecBackX = glottisX - 0.044 - 0.056 * Math.pow(oecPos, 0.85);
    const beakOpenNorm = clamp((d.beakGapeMm.value - 0.20) / 22.0, 0.0, 1.12);

    // Expressive Center Splitter (Pessulus) rocking & axial plunge at the bronchial fork (stays cleanly inside cutaway!)
    const pessX = syrinxCx + 0.026 * clamp(d.pessulusX.value, -1.35, 1.35);
    const pessY = tympanumY + 0.052 + 0.032 * clamp(d.pessulusY.value, -1.35, 1.35);
    const pessTilt = clamp(d.pessulusX.value * 0.34, -0.44, 0.44);

    // Comparative bronchial, labial & muscular lateralization scales
    const bronchScaleL = clamp(org.leftBronchusScale || 1.0, 0.72, 1.35);
    const bronchScaleR = clamp(org.rightBronchusScale || 1.0, 0.72, 1.35);
    const padScaleL = clamp(org.leftPadScale || 1.0, 0.68, 1.44);
    const padScaleR = clamp(org.rightPadScale || 1.0, 0.68, 1.44);
    const muscScaleL = clamp(org.leftMuscleScale || 1.0, 0.74, 1.54);
    const muscScaleR = clamp(org.rightMuscleScale || 1.0, 0.74, 1.54);

    // Expressive Left & Right Voice Valve Clefts & Medial Membranes
    const cleftVisL = clamp(0.004 + 0.135 * Math.max(-0.025, d.gapL.value), 0.002, 0.052);
    const cleftVisR = clamp(0.004 + 0.135 * Math.max(-0.025, d.gapR.value), 0.002, 0.052);

    const pSubVal = d.pSub.value;
    const pIcasVal = d.pIcas.value;
    const tmRaw = pSubVal >= 0.0 ? pIcasVal - 0.82 * pSubVal : (pIcasVal - pSubVal) * 0.50;
    const tmDelta = clamp(tmRaw, -1.6, 1.6);
    const mtmBowL = clamp(0.018 * tmDelta + 0.036 * (0.78 - d.mtmStretchL.value), -0.036, 0.054);
    const mtmBowR = clamp(0.018 * tmDelta + 0.036 * (0.78 - d.mtmStretchR.value), -0.036, 0.054);

    // True biomechanical syringeal contraction: +tension shortens vS upward (-y) & bulges muscle belly;
    // -tension (pulling down) elongates muscle & draws MVC/ML and labial pads downward (+y)!
    const stretchL = clamp(d.tensionL.value, -1.15, 1.75) * 0.032;
    const stretchR = clamp(d.tensionR.value, -1.15, 1.75) * 0.032;

    // Left & Right Voice Cushions (ML tethered to pessulus lateral wall + paired MVC sesamoid nodules, Düring et al. 2013!)
    const pessWallW = org.clade === 'menurae' ? 0.028 : 0.023;
    const mlLx = pessX - (pessWallW + 0.007 * padScaleL) - 0.16 * mtmBowL;
    const mlLy = pessY + 0.024 - 0.68 * stretchL;
    const llLx = mlLx - cleftVisL - 0.020 * bronchScaleL;
    const llLy = mlLy - 0.004;
    const mvcLx = mlLx - 0.005;
    const mvcLy = mlLy + 0.018;

    const mlRx = pessX + (pessWallW + 0.007 * padScaleR) + 0.16 * mtmBowR;
    const mlRy = pessY + 0.024 - 0.68 * stretchR;
    const llRx = mlRx + cleftVisR + 0.020 * bronchScaleR;
    const llRy = mlRy - 0.004;
    const mvcRx = mlRx + 0.005;
    const mvcRy = mlRy + 0.018;

    // Bronchial Wall Midpoints
    const bronchusLx = llLx - 0.023 * bronchScaleL;
    const bronchusLy = llLy + 0.042;
    const bronchusRx = llRx + 0.023 * bronchScaleR;
    const bronchusRy = llRy + 0.042;

    // Medial Membranes (MTM — exact u=0.5 midpoint of the drawn medial tympaniform membrane curve!)
    const mtmSpanL = clamp(0.058 + 0.052 * d.mtmStretchL.value + 0.40 * Math.max(0.0, stretchL), 0.050, 0.138);
    const mtmLx = mlLx + 0.0065 - 0.725 * mtmBowL;
    const mtmLy = mlLy + 0.014 + mtmSpanL * 0.55;

    const mtmSpanR = clamp(0.058 + 0.052 * d.mtmStretchR.value + 0.40 * Math.max(0.0, stretchR), 0.050, 0.138);
    const mtmRx = mlRx - 0.0065 + 0.725 * mtmBowR;
    const mtmRy = mlRy + 0.014 + mtmSpanR * 0.55;

    // Pitch Muscles (vS belly sweeping ventromedially toward MVC — bulges crimson on contraction!)
    const vsBulgeL = (0.016 + 0.022 * clamp(d.tensionL.value + 0.75, 0.0, 1.95)) * muscScaleL;
    const vsLx = syrinxCx - trachHalfW - 0.020 - 0.16 * cleftVisL - 0.22 * vsBulgeL;
    const vsLy = tympanumY - 0.004 - 0.22 * stretchL;

    const vsBulgeR = (0.016 + 0.022 * clamp(d.tensionR.value + 0.75, 0.0, 1.95)) * muscScaleR;
    const vsRx = syrinxCx + trachHalfW + 0.020 + 0.16 * cleftVisR + 0.22 * vsBulgeR;
    const vsRy = tympanumY - 0.004 - 0.22 * stretchR;

    // Expressive Chest Air Cushion (ICAS) & Bilobed Abdominal Air Sacs bellows (expands on sub-atmospheric mini-breaths!)
    const icasComp = clamp((pIcasVal - 0.16) / 4.2, -0.16, 0.96);
    const icasHalfW = 0.144 - 0.052 * icasComp;

    const sacCx = 0.038;
    const caudalComp = clamp((pSubVal - 0.16) / 4.2, -0.16, 0.96);
    const caudalBottomY = 0.336 - 0.086 * caudalComp;
    const caudalOuterX = 0.136 - 0.046 * caudalComp;

    const vibL = telem ? clamp(telem.rmsL * 0.034, 0, 0.040) : 0;
    const vibR = telem ? clamp(telem.rmsR * 0.034, 0, 0.040) : 0;

    this.landmarks = {
      syrinxCx,
      sacCx,
      glottisX,
      baseGlottisY,
      cutBaseTrachHalfW,
      trachHalfW,
      trStretchNorm,
      trachCurveX,
      speciesBoreScale,
      clade: org.clade || 'oscine',
      intrinsicMusclePairs: org.intrinsicMusclePairs ?? 4,
      trachRings: org.trachRings ?? 12,
      tympanumFusedRings: org.tympanumFusedRings ?? 4,
      tympanumScale: org.tympanumScale ?? 1.0,
      hasSemilunaris: Boolean(org.hasSemilunaris),
      hasBronchidesmus: Boolean(org.hasBronchidesmus),
      bronchScaleL,
      bronchScaleR,
      padScaleL,
      padScaleR,
      muscScaleL,
      muscScaleR,
      tympanumY,
      glottisY,
      oecHalfW,
      oecCenterY,
      oecDropY,
      oecExpand: oecPos,
      oecFrontX,
      oecBackX,
      headCx,
      headCy,
      beakBaseY,
      beakOpenNorm,
      pessX,
      pessY,
      pessTilt,
      stretchL,
      stretchR,
      cleftVisL,
      cleftVisR,
      mtmBowL,
      mtmBowR,
      mtmSpanL,
      mtmSpanR,
      mlLx,
      mlLy,
      llLx,
      llLy,
      mvcLx,
      mvcLy,
      mlRx,
      mlRy,
      llRx,
      llRy,
      mvcRx,
      mvcRy,
      bronchusLx,
      bronchusLy,
      bronchusRx,
      bronchusRy,
      mtmLx,
      mtmLy,
      mtmRx,
      mtmRy,
      vsLx,
      vsLy,
      vsBulgeL,
      vsRx,
      vsRy,
      vsBulgeR,
      icasHalfW,
      icasComp,
      caudalBottomY,
      caudalOuterX,
      caudalComp,
      vibL,
      vibR,
      warbleL: w.ampL * Math.sin(w.phaseL),
      warbleR: w.ampR * Math.sin(w.phaseR),
    };
  }

  getPartAnchorNorm(partId) {
    const L = this.landmarks;
    const plum = this.currentSpecies?.plumage || {};
    switch (partId) {
      case 'beak': {
        const billLen = plum.billLen ?? (plum.hasMask ? 0.142 : plum.billStyle === 'conical' ? 0.124 : plum.hasLyreTail ? 0.194 : 0.172);
        return { nx: L.headCx + 0.104 + billLen * 0.86, ny: L.headCy - 0.040 - 0.030 * L.beakOpenNorm };
      }
      case 'oec':
        return { nx: L.oecFrontX - 0.004, ny: L.glottisY - 0.018 };
      case 'trachea': {
        const midX = lerp(L.glottisX, L.syrinxCx, 0.50) + (L.trachCurveX || 0);
        const midY = lerp(L.glottisY, L.tympanumY, 0.50);
        return { nx: midX + L.trachHalfW, ny: midY };
      }
      case 'pessulus':
        return { nx: L.pessX - 0.010, ny: L.pessY };
      case 'muscleVSL':
        return { nx: L.vsLx, ny: L.vsLy };
      case 'muscleVSR':
        return { nx: L.vsRx, ny: L.vsRy };
      case 'labiaL':
        return { nx: 0.5 * (L.mlLx + L.llLx), ny: L.mlLy };
      case 'labiaR':
        return { nx: 0.5 * (L.mlRx + L.llRx), ny: L.mlRy };
      case 'bronchusL':
        return { nx: L.bronchusLx, ny: L.bronchusLy };
      case 'bronchusR':
        return { nx: L.bronchusRx, ny: L.bronchusRy };
      case 'mtmL':
        return { nx: L.mtmLx, ny: L.mtmLy };
      case 'mtmR':
        return { nx: L.mtmRx, ny: L.mtmRy };
      case 'icasL':
        return { nx: L.syrinxCx - L.icasHalfW * 0.85, ny: 0.146 };
      case 'icasR':
        return { nx: L.syrinxCx + L.icasHalfW * 0.85, ny: 0.146 };
      case 'airSacCaudal':
        return { nx: L.sacCx + L.caudalOuterX * 0.62, ny: L.caudalBottomY - 0.052 };
      default:
        return { nx: 0, ny: 0 };
    }
  }
}
