import type { SurfaceType, WeatherMode } from '../types/game';

export interface HakkaAudioConfig {
  /**
   * Optional external looping BGM URL (e.g. '/audio/hakka-guzheng.mp3').
   * When omitted, the engine synthesizes a soothing traditional Hakka D-major
   * pentatonic Guzheng + Bamboo Xiao melody seamlessly via Web Audio API.
   */
  bgmUrl?: string;
}

// D-Major Chinese Pentatonic Scale (宫商角徵羽: D E F# A B) across 2 octaves
const PENTATONIC_GUZHENG = [
  293.66, // D4
  329.63, // E4
  369.99, // F#4
  440.0,  // A4
  493.88, // B4
  587.33, // D5
  659.25, // E5
  739.99, // F#5
  880.0,  // A5
];

// Pastoral 16-beat Hakka mountain-song inspired phrase indices into PENTATONIC_GUZHENG (-1 = rest)
const GUZHENG_PHRASE = [
  0, 3, 4, 5, 4, 3, 2, -1,
  3, 5, 6, 7, 5, 4, 3, -1,
  5, 7, 8, 7, 6, 5, 4, 3,
  2, 3, 4, 3, 2, 0, -1, -1,
];

const FLUTE_PHRASE = [
  -1, -1, 5, -1, 6, -1, 5, 4,
  -1, -1, 7, -1, 6, 5, 4, -1,
  -1, 8, -1, 7, 5, -1, 4, -1,
  3, -1, 2, -1, 0, -1, -1, -1,
];

/**
 * 100% browser-autoplay-compliant procedural Web Audio API soundscape,
 * traditional Hakka pentatonic Guzheng/Xiao BGM synthesizer, time+weather
 * ambient crossfade engine, and 6-surface Foley system.
 */
export class HakkaAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;

  private muted = false;
  private volume = 0.72;
  private unlocked = false;
  private noiseBuffer: AudioBuffer | null = null;
  private config: HakkaAudioConfig;

  // Optional external BGM audio element (if user mounts bgmUrl)
  private externalBgmAudio: HTMLAudioElement | null = null;
  private externalBgmSource: MediaElementAudioSourceNode | null = null;

  // Continuous ambient layers with smooth crossfade
  private rainGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private waterGain: GainNode | null = null;
  private waterSource: AudioBufferSourceNode | null = null;
  private cricketGain: GainNode | null = null;
  private cricketOscA: OscillatorNode | null = null;
  private cricketOscB: OscillatorNode | null = null;
  private cricketLfo: OscillatorNode | null = null;

  // Scheduler timers for procedural Guzheng/Xiao BGM & daytime birdsong
  private bgmTimer: number | null = null;
  private birdTimer: number | null = null;
  private bgmStep = 0;

  // Cached environmental mix targets
  private lastTimeOfDay = 10.5;
  private lastWeather: WeatherMode = 'sunny';
  private lastDistToPond = 12;

  constructor(config: HakkaAudioConfig = {}) {
    this.config = config;
  }

  /**
   * Must ONLY be called from an explicit user gesture (pointerdown, click, keydown).
   * Strictly avoids creating or resuming AudioContext during background/autostart mounts.
   */
  public unlock(): void {
    this.unlocked = true;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = 0.58;
      this.bgmBus.connect(this.masterGain);

      this.ambienceBus = this.ctx.createGain();
      this.ambienceBus.gain.value = 0.85;
      this.ambienceBus.connect(this.masterGain);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.92;
      this.sfxBus.connect(this.masterGain);

      // Gentle courtyard acoustic echo for Guzheng & Xiao bamboo flute
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.value = 0.36;
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.value = 0.28;
      const delayFilter = this.ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 2100;
      this.delayNode.connect(delayFilter);
      delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      delayFilter.connect(this.bgmBus);

      this.createNoiseBuffer();
      this.initAmbientLayers();
      this.startBgmLoop();
      this.startBirdsongLoop();
      this.applyAmbienceMix();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Ignore browser autoplay block if triggered non-interactively
      });
    }
    if (this.externalBgmAudio && !this.muted && this.externalBgmAudio.paused) {
      void this.externalBgmAudio.play().catch(() => {
        // Fallback to procedural BGM seamlessly
      });
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.12);
    }
    if (this.externalBgmAudio) {
      this.externalBgmAudio.muted = muted;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.volume > 0 && this.muted) {
      this.muted = false;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.08
      );
    }
    if (this.externalBgmAudio) {
      this.externalBgmAudio.volume = this.volume * 0.55;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setWeatherAmbience(weather: WeatherMode): void {
    this.lastWeather = weather;
    this.applyAmbienceMix();
  }

  /**
   * Smoothly crossfades rain, night crickets, pond water murmur, and daytime birdsong
   * based on 24-hour time, weather, and player distance to Half-Moon Pond.
   */
  public updateAmbience(timeOfDay: number, weather: WeatherMode, distToPond: number): void {
    this.lastTimeOfDay = timeOfDay;
    this.lastWeather = weather;
    this.lastDistToPond = distToPond;
    this.applyAmbienceMix();
  }

  private applyAmbienceMix(): void {
    if (!this.ctx || !this.unlocked) return;
    const now = this.ctx.currentTime;
    const h = ((this.lastTimeOfDay % 24) + 24) % 24;
    const isRain = this.lastWeather === 'rain';

    // Night factor for summer crickets (ramps up after 18:30, fades by 05:45)
    let nightMix = 0;
    if (h >= 19.5 || h < 5.0) nightMix = 1.0;
    else if (h >= 18.0) nightMix = (h - 18.0) / 1.5;
    else if (h < 6.2) nightMix = 1.0 - (h - 5.0) / 1.2;
    if (isRain) nightMix *= 0.25;

    // Gentle pond water lapping scales with proximity to Half-Moon Pond
    const pondProximity = Math.max(0, 1 - this.lastDistToPond / 28);
    const targetWater = 0.012 + pondProximity * 0.055;
    const targetRain = isRain ? 0.13 : 0.0;
    const targetCricket = nightMix * 0.022;

    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(targetRain, now, 0.45);
    }
    if (this.waterGain) {
      this.waterGain.gain.setTargetAtTime(targetWater, now, 0.35);
    }
    if (this.cricketGain) {
      this.cricketGain.gain.setTargetAtTime(targetCricket, now, 0.55);
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Soft pink-ish filtered noise for natural rain & water sound
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.18) * 1.4));
    }
    this.noiseBuffer = buf;
  }

  private initAmbientLayers(): void {
    if (!this.ctx || !this.noiseBuffer || !this.ambienceBus) return;

    // 1. Rain patter layer (bandpass filtered pink noise)
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this.noiseBuffer;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1480;
    rainFilter.Q.value = 0.55;
    const rainGain = this.ctx.createGain();
    rainGain.gain.value = 0;
    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(this.ambienceBus);
    rainSrc.start();
    this.rainSource = rainSrc;
    this.rainGain = rainGain;

    // 2. Gentle Half-Moon Pond water murmur (warm low-mid bandpass)
    const waterSrc = this.ctx.createBufferSource();
    waterSrc.buffer = this.noiseBuffer;
    waterSrc.loop = true;
    const waterFilter = this.ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 460;
    waterFilter.Q.value = 1.25;
    const waterGain = this.ctx.createGain();
    waterGain.gain.value = 0;
    waterSrc.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(this.ambienceBus);
    waterSrc.start();
    this.waterSource = waterSrc;
    this.waterGain = waterGain;

    // 3. Nighttime summer crickets (soft dual-harmonic amplitude-modulated chirp)
    const cricketGain = this.ctx.createGain();
    cricketGain.gain.value = 0;
    const cricketModGain = this.ctx.createGain();
    cricketModGain.gain.value = 0.5;

    const oscA = this.ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 4180;
    const oscB = this.ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 4310;

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4.2;
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth);
    lfoDepth.connect(cricketModGain.gain);

    oscA.connect(cricketModGain);
    oscB.connect(cricketModGain);
    cricketModGain.connect(cricketGain);
    cricketGain.connect(this.ambienceBus);

    oscA.start();
    oscB.start();
    lfo.start();
    this.cricketOscA = oscA;
    this.cricketOscB = oscB;
    this.cricketLfo = lfo;
    this.cricketGain = cricketGain;
  }

  private startBgmLoop(): void {
    if (!this.ctx || !this.bgmBus) return;

    // If user configured an external looping BGM file URL, mount it cleanly
    if (this.config.bgmUrl) {
      try {
        const audio = new Audio(this.config.bgmUrl);
        audio.loop = true;
        audio.crossOrigin = 'anonymous';
        audio.volume = this.volume * 0.55;
        audio.muted = this.muted;
        this.externalBgmAudio = audio;
        this.externalBgmSource = this.ctx.createMediaElementSource(audio);
        this.externalBgmSource.connect(this.bgmBus);
        void audio.play().catch(() => {
          // Will resume on next gesture
        });
        return;
      } catch {
        // Fall through to procedural Hakka pentatonic BGM
      }
    }

    // Seamless procedural Hakka pastoral Guzheng + Bamboo Xiao BGM (every 720ms beat)
    if (this.bgmTimer !== null) return;
    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;

      const idx = this.bgmStep % GUZHENG_PHRASE.length;
      const gNote = GUZHENG_PHRASE[idx];
      const fNote = FLUTE_PHRASE[idx];

      // Subtle tempo/density softening at night
      const h = ((this.lastTimeOfDay % 24) + 24) % 24;
      const isNight = h >= 20.0 || h < 5.5;
      const dynamicScale = isNight ? 0.72 : 1.0;

      if (gNote >= 0) {
        this.playGuzhengPluck(PENTATONIC_GUZHENG[gNote], 0.068 * dynamicScale);
        // Gentle octave bass resonance on phrase downbeats
        if (idx % 8 === 0) {
          this.playGuzhengPluck(PENTATONIC_GUZHENG[0] * 0.5, 0.055 * dynamicScale, 0.04);
        }
      }

      if (fNote >= 0) {
        this.playBambooXiaoNote(PENTATONIC_GUZHENG[fNote], 1.35, 0.044 * dynamicScale);
      }

      this.bgmStep = (this.bgmStep + 1) % GUZHENG_PHRASE.length;
    }, 760);
  }

  private playGuzhengPluck(freq: number, volume: number, delay = 0): void {
    if (!this.ctx || !this.bgmBus) return;
    const now = this.ctx.currentTime + delay;

    // Warm plucked string: fundamental triangle + soft 2nd harmonic sine with exponential decay
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.0, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.2, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 1.3), now + 1.4);

    const gain1 = this.ctx.createGain();
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain1.gain.exponentialRampToValueAtTime(0.0005, now + 2.1);

    const gain2 = this.ctx.createGain();
    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.linearRampToValueAtTime(volume * 0.28, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.0004, now + 0.95);

    osc1.connect(filter);
    osc2.connect(gain2);
    gain2.connect(filter);
    filter.connect(gain1);
    gain1.connect(this.bgmBus);
    if (this.delayNode) gain1.connect(this.delayNode);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 2.2);
    osc2.stop(now + 1.05);
  }

  private playBambooXiaoNote(freq: number, duration: number, volume: number): void {
    if (!this.ctx || !this.bgmBus) return;
    const now = this.ctx.currentTime + 0.08;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    // Gentle expressive pitch grace glide
    osc.frequency.setValueAtTime(freq * 0.985, now);
    osc.frequency.linearRampToValueAtTime(freq, now + 0.16);

    // Subtle breath vibrato
    const vib = this.ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 4.6;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = freq * 0.006;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(volume, now + 0.28);
    env.gain.setValueAtTime(volume * 0.88, now + duration * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0005, now + duration);

    osc.connect(env);
    env.connect(this.bgmBus);
    if (this.delayNode) env.connect(this.delayNode);

    osc.start(now);
    vib.start(now);
    osc.stop(now + duration + 0.05);
    vib.stop(now + duration + 0.05);
  }

  private startBirdsongLoop(): void {
    if (this.birdTimer !== null) return;
    this.birdTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
      const h = ((this.lastTimeOfDay % 24) + 24) % 24;
      const isSunnyDay = this.lastWeather === 'sunny' && h >= 5.8 && h <= 18.2;
      if (!isSunnyDay) return;
      if (Math.random() > 0.52) return;

      // Gentle Lingnan mountain warbler 2-3 note trill
      const base = 1850 + Math.random() * 900;
      this.playAmbienceChirp(base, base * 1.28, 0.11, 0.022, 0);
      this.playAmbienceChirp(base * 1.24, base * 0.94, 0.12, 0.02, 0.14);
      if (Math.random() > 0.4) {
        this.playAmbienceChirp(base * 1.05, base * 1.38, 0.14, 0.018, 0.29);
      }
    }, 3400);
  }

  private playAmbienceChirp(
    freqStart: number,
    freqEnd: number,
    duration: number,
    volume: number,
    delay: number
  ): void {
    if (!this.ctx || !this.ambienceBus) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freqEnd), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0004, now + duration);
    osc.connect(gain);
    gain.connect(this.ambienceBus);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /**
   * 6-surface procedural footstep matrix.
   */
  public playFootstep(surface: SurfaceType): void {
    if (this.muted || !this.unlocked) return;
    if (!this.ctx || this.ctx.state !== 'running' || !this.noiseBuffer || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const pitchJitter = 0.92 + Math.random() * 0.16;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    if (surface === 'water_stone') {
      filter.type = 'bandpass';
      filter.frequency.value = 1800 * pitchJitter;
      filter.Q.value = 1.6;
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    } else if (surface === 'courtyard') {
      filter.type = 'lowpass';
      filter.frequency.value = 650 * pitchJitter;
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    } else if (surface === 'slate') {
      filter.type = 'bandpass';
      filter.frequency.value = 1100 * pitchJitter;
      filter.Q.value = 2.5;
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    } else if (surface === 'cobble') {
      filter.type = 'highpass';
      filter.frequency.value = 2200 * pitchJitter;
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    } else if (surface === 'wood_2f') {
      filter.type = 'lowpass';
      filter.frequency.value = 420 * pitchJitter;
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      this.playTone(195 * pitchJitter, 165 * pitchJitter, 0.14, 'sawtooth', 0.025);
    } else {
      filter.type = 'bandpass';
      filter.frequency.value = 3100 * pitchJitter;
      filter.Q.value = 0.8;
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    }

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    src.start(now);
    src.stop(now + 0.14);
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0
  ): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoiseBurst(freq: number, q: number, duration: number, volume: number, delay = 0): void {
    if (!this.ctx || !this.noiseBuffer || !this.sfxBus || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  /**
   * Plays tailored procedural audio matched to each Weilongwu interactable.
   */
  public playInteractionSound(interactableId: string): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;

    switch (interactableId) {
      case 'int_pond_water':
      case 'int_pond_mallet':
      case 'int_well_windlass':
        this.playNoiseBurst(1200, 1.2, 0.25, 0.14);
        this.playTone(540, 260, 0.18, 'sine', 0.1);
        this.playTone(760, 420, 0.14, 'sine', 0.07, 0.1);
        break;

      case 'int_skywell_vat':
        this.playTone(175, 162, 0.55, 'sine', 0.18);
        this.playTone(355, 340, 0.3, 'triangle', 0.06);
        break;

      case 'int_skywell_birdcage':
        this.playTone(1950, 2650, 0.12, 'sine', 0.08, 0);
        this.playTone(2550, 1850, 0.11, 'sine', 0.08, 0.14);
        this.playTone(2150, 2900, 0.14, 'sine', 0.07, 0.28);
        break;

      case 'int_doumen_gate':
        this.playTone(140, 92, 0.55, 'sawtooth', 0.06);
        this.playTone(185, 130, 0.4, 'sawtooth', 0.04, 0.12);
        break;

      case 'int_zhongtang_abacus':
        for (let i = 0; i < 4; i++) {
          this.playTone(1350 + i * 160, 820, 0.045, 'triangle', 0.09, i * 0.065);
        }
        break;

      case 'int_rear_mill':
      case 'int_kitchen_leicha':
        this.playNoiseBurst(520, 2.2, 0.6, 0.12);
        this.playTone(110, 96, 0.55, 'triangle', 0.06);
        break;

      case 'int_kitchen_bellows':
        this.playNoiseBurst(900, 0.9, 0.35, 0.14, 0);
        this.playNoiseBurst(1250, 1.0, 0.35, 0.12, 0.35);
        this.playNoiseBurst(3400, 2.5, 0.12, 0.07, 0.22);
        break;

      case 'int_shangtang_jiaobei':
        this.playTone(780, 480, 0.08, 'triangle', 0.14, 0);
        this.playTone(860, 520, 0.07, 'triangle', 0.12, 0.11);
        this.playTone(720, 510, 0.05, 'triangle', 0.07, 0.21);
        break;

      case 'int_bedroom_cradle': {
        const notes = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25];
        notes.forEach((f, idx) => {
          this.playTone(f, f * 0.995, 0.38, 'sine', 0.07, idx * 0.24);
        });
        break;
      }

      case 'int_watchtower_gong':
        this.playTone(158, 152, 2.2, 'triangle', 0.22);
        this.playTone(318, 305, 1.8, 'sine', 0.12);
        this.playTone(487, 462, 1.3, 'sine', 0.07);
        this.playNoiseBurst(900, 1.4, 0.18, 0.16);
        break;

      case 'int_huatai_stones': {
        const chord = [392.0, 440.0, 523.25, 587.33, 783.99];
        chord.forEach((f, idx) => {
          this.playTone(f, f, 0.65, 'sine', 0.065, idx * 0.09);
        });
        break;
      }

      case 'int_music_han': {
        const melody = [523.25, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25];
        melody.forEach((f, idx) => {
          this.playTone(f, f * 1.005, 0.28, 'triangle', 0.08, idx * 0.19);
        });
        this.playTone(120, 82, 0.25, 'sine', 0.15, 0);
        this.playTone(120, 82, 0.25, 'sine', 0.14, 0.76);
        break;
      }

      case 'int_qiaopi_letter': {
        const waltz = [440, 523.25, 659.25, 587.33, 523.25, 440];
        waltz.forEach((f, idx) => {
          this.playTone(f, f * 0.996, 0.4, 'sine', 0.06, idx * 0.26);
        });
        this.playNoiseBurst(2600, 1.8, 1.2, 0.015);
        break;
      }

      case 'int_granary_winnower':
      case 'int_weaving_loom':
        for (let i = 0; i < 4; i++) {
          this.playTone(320 + (i % 2) * 140, 190, 0.08, 'triangle', 0.09, i * 0.12);
        }
        this.playNoiseBurst(750, 0.9, 0.45, 0.08);
        break;

      case 'int_carpentry_mortise':
        this.playTone(460, 220, 0.09, 'triangle', 0.14, 0);
        this.playTone(620, 310, 0.08, 'triangle', 0.12, 0.16);
        break;

      default:
        this.playTone(587.33, 659.25, 0.22, 'sine', 0.075);
        this.playTone(880, 880, 0.28, 'sine', 0.045, 0.08);
        break;
    }
  }

  public dispose(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.birdTimer !== null) {
      window.clearInterval(this.birdTimer);
      this.birdTimer = null;
    }
    if (this.externalBgmAudio) {
      this.externalBgmAudio.pause();
      this.externalBgmAudio = null;
    }
    const stopSafe = (node: { stop: () => void } | null) => {
      if (!node) return;
      try {
        node.stop();
      } catch {
        // ignore
      }
    };
    stopSafe(this.rainSource);
    stopSafe(this.waterSource);
    stopSafe(this.cricketOscA);
    stopSafe(this.cricketOscB);
    stopSafe(this.cricketLfo);
    this.rainSource = null;
    this.waterSource = null;
    this.cricketOscA = null;
    this.cricketOscB = null;
    this.cricketLfo = null;

    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
