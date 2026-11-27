import type { SurfaceType, WeatherMode } from '../types/game';

/**
 * 100% procedural Web Audio API soundscape & Foley synthesizer.
 * Zero external audio files — covers 6 surface footstep types, rain ambience,
 * and tailored traditional Hakka instrument & prop interactions.
 */
export class HakkaAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private rainGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  public unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setTargetAtTime(muted ? 0 : this.targetRainVolume, this.ctx.currentTime, 0.15);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private targetRainVolume = 0;

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  public setWeatherAmbience(weather: WeatherMode): void {
    this.targetRainVolume = weather === 'rain' ? 0.11 : 0;
    if (!this.ctx || !this.noiseBuffer) return;

    if (weather === 'rain') {
      if (!this.rainSource) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1450;
        filter.Q.value = 0.6;

        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        src.start();
        this.rainSource = src;
        this.rainGain = gain;
      }
      if (this.rainGain) {
        this.rainGain.gain.setTargetAtTime(
          this.muted ? 0 : this.targetRainVolume,
          this.ctx.currentTime,
          0.35
        );
      }
    } else if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.35);
    }
  }

  /**
   * 6-surface procedural footstep matrix.
   */
  public playFootstep(surface: SurfaceType): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.noiseBuffer) return;
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
      // Crisp crunching rounded pebbles on Huatai
      filter.type = 'highpass';
      filter.frequency.value = 2200 * pitchJitter;
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    } else if (surface === 'wood_2f') {
      // Hollow aged fir floorboard thump + subtle creak
      filter.type = 'lowpass';
      filter.frequency.value = 420 * pitchJitter;
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      this.playTone(195 * pitchJitter, 165 * pitchJitter, 0.14, 'sawtooth', 0.025);
    } else {
      // Rustling forest leaf trail
      filter.type = 'bandpass';
      filter.frequency.value = 3100 * pitchJitter;
      filter.Q.value = 0.8;
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    }

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
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
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoiseBurst(freq: number, q: number, duration: number, volume: number, delay = 0): void {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
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
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  /**
   * Plays tailored procedural audio matched to each of the 28 Weilongwu interactables.
   */
  public playInteractionSound(interactableId: string): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    switch (interactableId) {
      case 'int_pond_water':
      case 'int_pond_mallet':
      case 'int_well_windlass':
        this.playNoiseBurst(1200, 1.2, 0.25, 0.14);
        this.playTone(540, 260, 0.18, 'sine', 0.1);
        this.playTone(760, 420, 0.14, 'sine', 0.07, 0.1);
        break;

      case 'int_skywell_vat':
        // Deep hollow ceramic resonance
        this.playTone(175, 162, 0.55, 'sine', 0.18);
        this.playTone(355, 340, 0.3, 'triangle', 0.06);
        break;

      case 'int_skywell_birdcage':
        // Thrush birdsong warble
        this.playTone(1950, 2650, 0.12, 'sine', 0.08, 0);
        this.playTone(2550, 1850, 0.11, 'sine', 0.08, 0.14);
        this.playTone(2150, 2900, 0.14, 'sine', 0.07, 0.28);
        break;

      case 'int_doumen_gate':
        // Heavy wooden axle creak + iron ring knock
        this.playTone(140, 92, 0.55, 'sawtooth', 0.06);
        this.playTone(185, 130, 0.4, 'sawtooth', 0.04, 0.12);
        break;

      case 'int_zhongtang_abacus':
        // Crisp wood bead clicks
        for (let i = 0; i < 4; i++) {
          this.playTone(1350 + i * 160, 820, 0.045, 'triangle', 0.09, i * 0.065);
        }
        break;

      case 'int_rear_mill':
      case 'int_kitchen_leicha':
        // Gritty stone / stoneware circular grinding
        this.playNoiseBurst(520, 2.2, 0.6, 0.12);
        this.playTone(110, 96, 0.55, 'triangle', 0.06);
        break;

      case 'int_kitchen_bellows':
        // Whoosh + crackling embers
        this.playNoiseBurst(900, 0.9, 0.35, 0.14, 0);
        this.playNoiseBurst(1250, 1.0, 0.35, 0.12, 0.35);
        this.playNoiseBurst(3400, 2.5, 0.12, 0.07, 0.22);
        break;

      case 'int_shangtang_jiaobei':
        // Pair of crescent wood blocks bouncing
        this.playTone(780, 480, 0.08, 'triangle', 0.14, 0);
        this.playTone(860, 520, 0.07, 'triangle', 0.12, 0.11);
        this.playTone(720, 510, 0.05, 'triangle', 0.07, 0.21);
        break;

      case 'int_bedroom_cradle': {
        // Gentle Hakka lullaby 《月光光》 pentatonic phrase
        const notes = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25];
        notes.forEach((f, idx) => {
          this.playTone(f, f * 0.995, 0.38, 'sine', 0.07, idx * 0.24);
        });
        break;
      }

      case 'int_watchtower_gong':
        // Booming bronze alarm gong
        this.playTone(158, 152, 2.2, 'triangle', 0.22);
        this.playTone(318, 305, 1.8, 'sine', 0.12);
        this.playTone(487, 462, 1.3, 'sine', 0.07);
        this.playNoiseBurst(900, 1.4, 0.18, 0.16);
        break;

      case 'int_huatai_stones':
      case 'int_dragon_taiji':
      case 'int_tianjie_xray': {
        // Luminous pentatonic harmonic chord
        const chord = [392.0, 440.0, 523.25, 587.33, 783.99];
        chord.forEach((f, idx) => {
          this.playTone(f, f, 0.65, 'sine', 0.065, idx * 0.09);
        });
        break;
      }

      case 'int_music_han': {
        // Guangdong Han Music 《出水莲》 inspired pentatonic motif
        const melody = [523.25, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25];
        melody.forEach((f, idx) => {
          this.playTone(f, f * 1.005, 0.28, 'triangle', 0.08, idx * 0.19);
        });
        this.playTone(120, 82, 0.25, 'sine', 0.15, 0);
        this.playTone(120, 82, 0.25, 'sine', 0.14, 0.76);
        break;
      }

      case 'int_qiaopi_letter': {
        // Warm nostalgic gramophone waltz phrase
        const waltz = [440, 523.25, 659.25, 587.33, 523.25, 440];
        waltz.forEach((f, idx) => {
          this.playTone(f, f * 0.996, 0.4, 'sine', 0.06, idx * 0.26);
        });
        this.playNoiseBurst(2600, 1.8, 1.2, 0.015);
        break;
      }

      case 'int_granary_winnower':
      case 'int_weaving_loom':
        // Rhythmic wooden mechanical clatter
        for (let i = 0; i < 4; i++) {
          this.playTone(320 + (i % 2) * 140, 190, 0.08, 'triangle', 0.09, i * 0.12);
        }
        this.playNoiseBurst(750, 0.9, 0.45, 0.08);
        break;

      case 'int_carpentry_mortise':
        // Solid timber knock seating cleanly into joint
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
    if (this.rainSource) {
      try {
        this.rainSource.stop();
      } catch {
        // ignore
      }
      this.rainSource = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
