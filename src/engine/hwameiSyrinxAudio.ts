import syrinxWorkletCode from './syrinx-worklet.js?raw';
import { HWAMEI_ORGAN, type SyrinxMotorParams } from './hwameiSongEngine';
import type { SpatialAcousticParams } from './hwameiAcoustics';

/**
 * Spatialized physical avian syrinx synthesizer for the courtyard Chinese Hwamei.
 *
 * Audio graph (reusing `SyrinxProcessor` from songbird-syrinx + real courtyard acoustics):
 *   AudioWorkletNode('syrinx-processor')
 *     -> earComfortDip (3600 Hz, -1.6 dB) -> warmShelf (6400 Hz, -1.4 dB)
 *     -> distanceAirOcclusionLP (dynamic 1150–12200 Hz lowpass)
 *     -> StereoPannerNode (listener-relative horizontal pan)
 *     -> split:
 *         [dry] -> directGainNode -> safetyLimiter -> destinationBus
 *         [wet] -> reverbSendNode -> courtyardConvolver -> wetFilter -> safetyLimiter -> destinationBus
 *
 * Loaded via Vite `?raw` + Blob URL so it works with zero external HTTP fetches or 404s.
 */
export class HwameiSpatialSyrinxPlayer {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private blobUrl: string | null = null;

  // Spatial acoustic processing nodes
  private spatialLowpass: BiquadFilterNode | null = null;
  private stereoPanner: StereoPannerNode | null = null;
  private directGainNode: GainNode | null = null;
  private reverbSendNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;

  // Graceful fallback oscillator voice if AudioWorklet is unsupported in a restricted browser
  private fallbackOsc: OscillatorNode | null = null;
  private fallbackGain: GainNode | null = null;

  private isReady = false;
  private isInitializing = false;
  private disposed = false;
  private organSent = false;

  /**
   * Initializes the physical syrinx worklet inside an already-unlocked AudioContext
   * and connects its spatialized output into `destinationBus`.
   */
  public async init(ctx: AudioContext, destinationBus: AudioNode): Promise<void> {
    if (this.isReady || this.isInitializing || this.disposed) return;
    this.isInitializing = true;
    this.ctx = ctx;

    try {
      // Psychoacoustic ear-comfort shaping from songbird-syrinx/src/audio/audio-engine.js
      const earComfortDip = ctx.createBiquadFilter();
      earComfortDip.type = 'peaking';
      earComfortDip.frequency.value = 3600;
      earComfortDip.Q.value = 1.25;
      earComfortDip.gain.value = -1.6;

      const warmShelf = ctx.createBiquadFilter();
      warmShelf.type = 'highshelf';
      warmShelf.frequency.value = 6400;
      warmShelf.gain.value = -1.4;

      // Dynamic physical air-absorption + architectural wall-occlusion lowpass filter
      const spatialLowpass = ctx.createBiquadFilter();
      spatialLowpass.type = 'lowpass';
      spatialLowpass.frequency.value = 10400;
      spatialLowpass.Q.value = 0.58;
      this.spatialLowpass = spatialLowpass;

      // Smooth stereo panning driven by listener right-vector dot product
      const panner =
        typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      this.stereoPanner = panner;

      // Direct path & Hakka stone-courtyard early-reflection / reverberation send
      const directGain = ctx.createGain();
      directGain.gain.value = 0.0;
      this.directGainNode = directGain;

      const reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.0;
      this.reverbSendNode = reverbSend;

      const convolver = ctx.createConvolver();
      convolver.buffer = this.buildCourtyardImpulseResponse(ctx, 0.92);

      const wetFilter = ctx.createBiquadFilter();
      wetFilter.type = 'lowpass';
      wetFilter.frequency.value = 4200;

      // Transparent safety limiter so close-up forte crescendos stay musical & unclipped
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3.0;
      limiter.knee.value = 4.0;
      limiter.ratio.value = 10.0;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.08;

      const outGain = ctx.createGain();
      outGain.gain.value = 0.78;
      this.masterGainNode = outGain;

      // Wire shared spatial processing chain
      earComfortDip.connect(warmShelf);
      warmShelf.connect(spatialLowpass);

      const panOut: AudioNode = panner ? spatialLowpass.connect(panner) : spatialLowpass;
      panOut.connect(directGain);
      panOut.connect(reverbSend);
      reverbSend.connect(convolver);
      convolver.connect(wetFilter);

      directGain.connect(limiter);
      wetFilter.connect(limiter);
      limiter.connect(outGain);
      outGain.connect(destinationBus);

      // Load 4x-oversampled SyrinxProcessor AudioWorklet via zero-404 Blob URL
      if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        const blob = new Blob([syrinxWorkletCode], { type: 'application/javascript' });
        this.blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(this.blobUrl);
        if (this.disposed) return;

        const workletNode = new AudioWorkletNode(ctx, 'syrinx-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        workletNode.connect(earComfortDip);
        this.workletNode = workletNode;
        this.sendOrganMorphometry();
        this.isReady = true;
      } else {
        this.initFallbackVoice(ctx, earComfortDip);
        this.isReady = true;
      }
    } catch {
      // Fallback cleanly to subtle sine voice only if AudioWorklet fails in an exotic environment
      if (this.ctx && this.spatialLowpass && !this.disposed) {
        this.initFallbackVoice(this.ctx, this.spatialLowpass);
        this.isReady = true;
      }
    } finally {
      this.isInitializing = false;
    }
  }

  private initFallbackVoice(ctx: AudioContext, target: AudioNode): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(target);
    osc.start();
    this.fallbackOsc = osc;
    this.fallbackGain = g;
  }

  /**
   * Sends the calibrated Chinese Hwamei (Garrulax canorus) physical organ morphometry once.
   */
  private sendOrganMorphometry(): void {
    if (!this.workletNode || this.organSent) return;
    this.organSent = true;
    this.workletNode.port.postMessage({
      type: 'params',
      params: {
        massLMg: HWAMEI_ORGAN.massLMg,
        massRMg: HWAMEI_ORGAN.massRMg,
        stiffLK0: HWAMEI_ORGAN.stiffLK0,
        stiffRK0: HWAMEI_ORGAN.stiffRK0,
        gammaL: HWAMEI_ORGAN.gammaL,
        gammaR: HWAMEI_ORGAN.gammaR,
        trachDiamMm: HWAMEI_ORGAN.trachDiamMm,
        labialThickMmL: HWAMEI_ORGAN.labialThickMmL,
        labialThickMmR: HWAMEI_ORGAN.labialThickMmR,
        asymRestL: HWAMEI_ORGAN.asymRestL,
        asymRestR: HWAMEI_ORGAN.asymRestR,
        oecNeckMm: HWAMEI_ORGAN.oecNeckMm,
        tractCoupling: HWAMEI_ORGAN.tractCoupling,
        hornPickup: HWAMEI_ORGAN.hornPickup,
        hasBronchidesmus: HWAMEI_ORGAN.hasBronchidesmus,
        leftGain: HWAMEI_ORGAN.leftGain,
        rightGain: HWAMEI_ORGAN.rightGain,
        masterGain: 0.72,
      },
    });
  }

  /**
   * Builds a procedural Hakka skywell courtyard impulse response (stone paving + whitewashed
   * lime walls + wooden veranda eaves, zero external audio assets).
   */
  private buildCourtyardImpulseResponse(ctx: AudioContext, durationSec: number): AudioBuffer {
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
        // Crisp courtyard early reflections + soft airy open-skywell tail
        const env = 0.56 * Math.exp(-t * 10.5) + 0.44 * Math.exp(-t * 3.6);
        const n = rand();
        lp += (0.42 - 0.24 * (t / durationSec)) * (n - lp);
        data[i] = lp * env * 0.36;
      }
      // Early reflections from opposite Front Skywell wall (~9.5m -> 28 ms), floor & cedar eaves
      const taps =
        ch === 0
          ? [0.0095, 0.0225, 0.0365, 0.0540]
          : [0.0112, 0.0248, 0.0398, 0.0585];
      const gains = [0.24, -0.15, 0.11, -0.07];
      for (let k = 0; k < taps.length; k++) {
        const idx = Math.floor(taps[k] * rate);
        if (idx < length) data[idx] += gains[k];
      }
    }
    return buffer;
  }

  /**
   * Updates real-time syrinx motor parameters AND physical 3D spatial acoustics each frame.
   */
  public update(
    syrinx: SyrinxMotorParams,
    spatial: SpatialAcousticParams,
    muted: boolean
  ): void {
    if (!this.isReady || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // 1. Apply physical spatial acoustic propagation (distance gain, air+wall LPF, stereo pan, courtyard wet send)
    const active = !muted && spatial.audible;
    const targetDirect = active ? spatial.directGain : 0.0;
    const targetWet = active ? spatial.reverbSend : 0.0;

    if (this.directGainNode) {
      this.directGainNode.gain.setTargetAtTime(targetDirect, now, 0.045);
    }
    if (this.reverbSendNode) {
      this.reverbSendNode.gain.setTargetAtTime(targetWet, now, 0.055);
    }
    if (this.spatialLowpass) {
      this.spatialLowpass.frequency.setTargetAtTime(spatial.lowpassHz, now, 0.055);
    }
    if (this.stereoPanner) {
      this.stereoPanner.pan.setTargetAtTime(spatial.pan, now, 0.045);
    }

    // 2. Drive the 4x-oversampled physical avian syrinx worklet (or fallback voice)
    if (this.workletNode) {
      // When completely out of audible range, rest subsyringeal pressure gently to save CPU/headroom
      if (!active) {
        this.workletNode.port.postMessage({
          type: 'params',
          params: {
            pSub: 0.04,
            pIcas: 0.04,
            gapL: HWAMEI_ORGAN.restGapL,
            gapR: HWAMEI_ORGAN.restGapR,
          },
        });
      } else {
        this.workletNode.port.postMessage({
          type: 'params',
          params: {
            pSub: syrinx.pSub,
            pIcas: syrinx.pIcas,
            gapL: syrinx.gapL,
            gapR: syrinx.gapR,
            tensionL: syrinx.tensionL,
            tensionR: syrinx.tensionR,
            mtmStretchL: syrinx.mtmStretchL,
            mtmStretchR: syrinx.mtmStretchR,
            tracheaLenMm: syrinx.tracheaLenMm,
            tracheaWidth: syrinx.tracheaWidth,
            oecVolMl: syrinx.oecVolMl,
            beakGapeMm: syrinx.beakGapeMm,
          },
        });
      }
    } else if (this.fallbackOsc && this.fallbackGain) {
      const f = Math.max(400, syrinx.targetFreqHz || 2200);
      const amp = active && syrinx.pSub > 0.45 ? Math.min(0.18, (syrinx.pSub - 0.4) * 0.09) : 0;
      this.fallbackOsc.frequency.setTargetAtTime(f, now, 0.02);
      this.fallbackGain.gain.setTargetAtTime(amp, now, 0.03);
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.isReady = false;
    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }
    if (this.fallbackOsc) {
      try {
        this.fallbackOsc.stop();
        this.fallbackOsc.disconnect();
      } catch {
        // ignore
      }
      this.fallbackOsc = null;
    }
    if (this.masterGainNode) {
      try {
        this.masterGainNode.disconnect();
      } catch {
        // ignore
      }
      this.masterGainNode = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    this.ctx = null;
  }
}
