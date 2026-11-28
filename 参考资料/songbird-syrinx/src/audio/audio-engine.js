/**
 * @fileoverview WebAudio Coordinator for the Songbird Syrinx Bio-Acoustic Instrument
 * Connects the 4x-oversampled SyrinxProcessor AudioWorklet to a psychoacoustic ear-comfort
 * EQ contour, warm woodland early-reflection space, and real-time sonogram analyser.
 */

import { SOUND_SPEED_AVIAN_MPS } from '../driver/birdsong-presets.js';

export class SyrinxAudioEngine {
  constructor() {
    this.ctx = null;
    this.workletNode = null;
    this.analyser = null;
    this.freqBins = null;
    this.timeBins = null;
    this.isReady = false;
    this.isInitializing = false;

    this.telemetry = {
      rmsL: 0.0,
      rmsR: 0.0,
      closedRatioL: 0.0,
      closedRatioR: 0.0,
      flowL: 0.0,
      flowR: 0.0,
      f0L: 1520.0,
      f0R: 2710.0,
      activeL: false,
      activeR: false,
      ptpL: 0.44,
      ptpR: 0.47,
      fOec: 2350.0,
      fTrach1: 2180.0,
      uL: 0.0,
      uR: 0.0,
    };

    this._pendingParams = null;
  }

  /**
   * Unlocks and initializes WebAudio on the very first tactile user gesture.
   */
  async unlock() {
    if (this.isReady) {
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({
        latencyHint: 'interactive',
        sampleRate: 48000,
      });

      const workletUrl = new URL('./syrinx-worklet.js', import.meta.url).href;
      await this.ctx.audioWorklet.addModule(workletUrl);

      this.workletNode = new AudioWorkletNode(this.ctx, 'syrinx-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data && e.data.type === 'telemetry') {
          Object.assign(this.telemetry, e.data);
        }
      };

      // High-time-resolution dry FFT analyser (21.3 ms window, tapped directly at the dry physical syrinx output!)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.12;
      this.freqBins = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeBins = new Float32Array(this.analyser.fftSize);

      // Psychoacoustic ear-comfort shaping: keeps crystalline 2.8-6.8 kHz bird song, finch formants,
      // and lyrebird mucosal clicks clear while gently cushioning the 3.6 kHz human ear-canal peak
      const earComfortDip = this.ctx.createBiquadFilter();
      earComfortDip.type = 'peaking';
      earComfortDip.frequency.value = 3600;
      earComfortDip.Q.value = 1.25;
      earComfortDip.gain.value = -1.6;

      const warmShelf = this.ctx.createBiquadFilter();
      warmShelf.type = 'highshelf';
      warmShelf.frequency.value = 6400;
      warmShelf.gain.value = -1.4;

      const silkLowpass = this.ctx.createBiquadFilter();
      silkLowpass.type = 'lowpass';
      silkLowpass.frequency.value = 10400;
      silkLowpass.Q.value = 0.55;

      // Dry path + cozy sunlit woodland early reflections (20% wet for natural distance & softness)
      const dryGain = this.ctx.createGain();
      dryGain.gain.value = 0.80;

      const wetGain = this.ctx.createGain();
      wetGain.gain.value = 0.20;

      const convolver = this.ctx.createConvolver();
      convolver.buffer = this._buildNaturalAcousticSpace(this.ctx, 0.58);

      const wetFilter = this.ctx.createBiquadFilter();
      wetFilter.type = 'lowpass';
      wetFilter.frequency.value = 4600;

      // Transparent -2.0 dBFS safety limiter so natural 18-22 dB Nightingale crescendos are never squashed
      const masterLimiter = this.ctx.createDynamicsCompressor();
      masterLimiter.threshold.value = -2.0;
      masterLimiter.knee.value = 3.0;
      masterLimiter.ratio.value = 12.0;
      masterLimiter.attack.value = 0.002;
      masterLimiter.release.value = 0.08;

      // Smooth 25 ms fade-in envelope on initial WebAudio unlock so waking hardware never clicks
      const outFadeGain = this.ctx.createGain();
      const t0 = this.ctx.currentTime;
      outFadeGain.gain.setValueAtTime(0.0001, t0);
      outFadeGain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.025);

      // Tap dry physical beak radiation directly for an un-reverbed, un-compressed scientific sonogram
      this.workletNode.connect(this.analyser);
      this.workletNode.connect(earComfortDip);
      earComfortDip.connect(warmShelf);
      warmShelf.connect(silkLowpass);

      silkLowpass.connect(dryGain);
      silkLowpass.connect(convolver);
      convolver.connect(wetFilter);
      wetFilter.connect(wetGain);

      dryGain.connect(masterLimiter);
      wetGain.connect(masterLimiter);
      masterLimiter.connect(outFadeGain);
      outFadeGain.connect(this.ctx.destination);

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.isReady = true;
      if (this._pendingParams) {
        this.updateParams(this._pendingParams);
        this._pendingParams = null;
      }
    } catch (err) {
      console.error('SyrinxAudioEngine initialization error:', err);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Generates a warm, airy woodland glade impulse response in memory (zero external assets).
   */
  _buildNaturalAcousticSpace(ctx, durationSec) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const buffer = ctx.createBuffer(2, length, rate);
    let seed = 0x5f3759df;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed * 4.656612873077393e-10;
    };

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp = 0.0;
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        const env = 0.62 * Math.exp(-t * 13.5) + 0.38 * Math.exp(-t * 5.2);
        const n = rand();
        lp += (0.38 - 0.20 * (t / durationSec)) * (n - lp);
        data[i] = lp * env * 0.38;
      }
      const taps = ch === 0 ? [0.0085, 0.0185, 0.0320] : [0.0098, 0.0205, 0.0355];
      const gains = [0.20, -0.12, 0.08];
      for (let k = 0; k < taps.length; k++) {
        const idx = Math.floor(taps[k] * rate);
        if (idx < length) data[idx] += gains[k];
      }
    }
    return buffer;
  }

  updateParams(params) {
    if (!this.isReady || !this.workletNode) {
      this._pendingParams = params;
      this._computeOfflinePreview(params);
      return;
    }
    this.workletNode.port.postMessage({ type: 'params', params });
  }

  pokeLabia(branch = 'both', strength = 0.5) {
    if (this.isReady && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'poke', branch, strength });
    }
  }

  getSpectrum() {
    if (!this.isReady || !this.analyser || !this.freqBins) return null;
    this.analyser.getByteFrequencyData(this.freqBins);
    return {
      bins: this.freqBins,
      nyquist: this.ctx.sampleRate * 0.5,
    };
  }

  _computeOfflinePreview(p) {
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const pSubSigned = clamp(p.pSub ?? 0.18, -0.85, 5.2);
    const pIcasSigned = clamp(p.pIcas ?? 0.18, -0.85, 5.2);
    const pSub = Math.max(0.0, pSubSigned);
    const pIcas = Math.max(0.0, pIcasSigned);
    const tm = pSubSigned >= 0.0 ? pIcasSigned - 0.82 * pSubSigned : (pIcasSigned - pSubSigned) * 0.50;
    const effGapL = (p.gapL ?? 0.088) - 0.042 * tm;
    const effGapR = (p.gapR ?? 0.086) - 0.042 * tm;

    const calcPtp = (g, t, thick = 0.38) => {
      const thickClamped = clamp(thick, 0.18, 1.10);
      const thickFactor = clamp(0.76 + 0.10 / (thickClamped + 0.16), 0.84, 1.12);
      const base = (0.39 + 0.27 * clamp(t + 0.25, 0, 1.8)) * thickFactor;
      const d = g - 0.080;
      if (g >= 0.080) return base * (1 + (d / 0.135) ** 2);
      if (g > 0.005) return base * (1 + 0.42 * ((0.080 - g) / 0.080) ** 2);
      const oc = 0.005 - g;
      return base * (1.45 + 320 * oc + 8500 * oc * oc);
    };
    const tenL = clamp(p.tensionL ?? 0.0, -1.15, 1.75);
    const tenR = clamp(p.tensionR ?? 0.0, -1.15, 1.75);
    const ptpL = calcPtp(effGapL, tenL, p.labialThickMmL ?? 0.44);
    const ptpR = calcPtp(effGapR, tenR, p.labialThickMmR ?? 0.30);

    const icasSupport = clamp((pIcas + 0.28) / (pSub * 0.96 + 0.28), 0.35, 1.00);
    const pEff = pSub * (0.52 + 0.48 * icasSupport);

    const mtmL = clamp(p.mtmStretchL ?? 0.88, 0, 1.48);
    const mtmR = clamp(p.mtmStretchR ?? 0.90, 0, 1.48);
    const mFactorL = 0.68 + 0.56 * mtmL;
    const mFactorR = 0.68 + 0.56 * mtmR;

    const stackL = clamp((0.52 - mtmL) / 0.38, 0, 1);
    const stackR = clamp((0.52 - mtmR) / 0.38, 0, 1);
    const gritL = clamp((0.12 - mtmL) / 0.12, 0, 1);
    const gritR = clamp((0.12 - mtmR) / 0.12, 0, 1);
    const c3L = 0.07 + 0.24 * stackL + 0.12 * gritL;
    const c3R = 0.07 + 0.24 * stackR + 0.12 * gritR;
    const snilcCritL = 2.0 * Math.sqrt(c3L);
    const snilcCritR = 2.0 * Math.sqrt(c3R);
    const etaL = clamp((p.asymRestL ?? 0.03) + 0.62 * stackL + 0.26 * gritL + 0.014 * pSub, 0.01, snilcCritL * (0.97 + 0.05 * gritL));
    const etaR = clamp((p.asymRestR ?? 0.03) + 0.62 * stackR + 0.26 * gritR + 0.014 * pSub, 0.01, snilcCritR * (0.97 + 0.05 * gritR));

    const k0L = clamp(p.stiffLK0 ?? 44.0, 2.0, 140.0);
    const k0R = clamp(p.stiffRK0 ?? 60.0, 2.0, 140.0);
    const kEffL = k0L * Math.exp(clamp(p.gammaL ?? 3.85, 2.0, 5.2) * tenL) * mFactorL + 0.065 * k0L * Math.max(0, pSub - ptpL);
    const kEffR = k0R * Math.exp(clamp(p.gammaR ?? 3.85, 2.0, 5.2) * tenR) * mFactorR + 0.065 * k0R * Math.max(0, pSub - ptpR);

    const omegaL = clamp(Math.sqrt(kEffL / (clamp(p.massLMg ?? 0.58, 0.05, 8.0) * 1e-6)), 2 * Math.PI * 48, 2 * Math.PI * 7600);
    const omegaR = clamp(Math.sqrt(kEffR / (clamp(p.massRMg ?? 0.24, 0.05, 8.0) * 1e-6)), 2 * Math.PI * 48, 2 * Math.PI * 7900);

    const modeCal = p.hornPickup ? 1.0488 : 1.0;
    this.telemetry.ptpL = ptpL;
    this.telemetry.ptpR = ptpR;
    this.telemetry.f0L = ((omegaL / (2 * Math.PI)) / (1.028 + 0.33 * etaL * etaL)) * modeCal;
    this.telemetry.f0R = ((omegaR / (2 * Math.PI)) / (1.028 + 0.33 * etaR * etaR)) * modeCal;
    this.telemetry.activeL = Boolean(effGapL > 0.006 && pEff > ptpL);
    this.telemetry.activeR = Boolean(effGapR > 0.006 && pEff > ptpR);

    const effDiamMm = clamp((p.trachDiamMm ?? 2.65) * (p.tracheaWidth ?? 1.0), 0.65, 9.5);
    const lEff = clamp(p.tracheaLenMm ?? 40.5, 11, 145) * 0.001 + 0.61 * 0.5 * (effDiamMm * 0.001);
    this.telemetry.fTrach1 = SOUND_SPEED_AVIAN_MPS / (4.0 * lEff);

    const oecMl = clamp(p.oecVolMl ?? 0.62, 0.015, 2.90);
    const volM3 = oecMl * 1e-6;
    const beakAreaM2 = Math.pow(clamp(p.beakGapeMm ?? 0.35, 0.18, 28.0) * 0.001, 1.28) * 0.0068 + 2.4e-7;
    const neckBaseM = clamp(p.oecNeckMm ?? 2.35, 1.1, 6.0) * 0.001;
    const deepEsophNeck = 0.022 * Math.max(0.0, oecMl - 1.45);
    const neckLenM = neckBaseM + deepEsophNeck + 1.70 * Math.sqrt(beakAreaM2 / Math.PI);
    this.telemetry.fOec = clamp(
      (SOUND_SPEED_AVIAN_MPS / (2 * Math.PI)) * Math.sqrt(beakAreaM2 / (volM3 * neckLenM)),
      360,
      7400
    );
  }
}
