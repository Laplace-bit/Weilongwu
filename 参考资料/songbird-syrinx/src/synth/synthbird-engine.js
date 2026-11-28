/**
 * @fileoverview SynthBird (Automaton syrinx-VII) — Ableton-Style QWERTY Polyphonic Controller
 * & Physical Syrinx Macro Synthesizer + Archival Lab-Plate Right Sidebar UI
 *
 * Drives the exact same 4x-oversampled bilateral avian syrinx ODE + tracheal waveguide + dorsal OEC
 * physical model via 12-TET keyboard pitch allocation (Duo / Interval / Drone), portamento,
 * SNILC membrane grit, mucosal-collision pluck transients, physical windpipe elongation, and
 * resonant throat-wah sweeps.
 */

import { solveSpeciesTension, solveSpeciesOec } from '../driver/birdsong-presets.js';
import { clamp, lerp } from '../physics/anatomy-model.js';

// Normal-mode calibration for the coupled 4D caudal+rostral mucosal oscillator so A4 = 440.0 Hz in 12-TET
const TWO_MASS_MODE_RATIO = 1.0488;

// Ableton-style 18-key chromatic computer keyboard map (C .. F across 1.5 octaves)
export const QWERTY_NOTE_DEFS = [
  { code: 'KeyA', label: 'A', note: 'C', semi: 0, black: false, xSlot: 0 },
  { code: 'KeyW', label: 'W', note: 'C#', semi: 1, black: true, xSlot: 0.65 },
  { code: 'KeyS', label: 'S', note: 'D', semi: 2, black: false, xSlot: 1 },
  { code: 'KeyE', label: 'E', note: 'D#', semi: 3, black: true, xSlot: 1.72 },
  { code: 'KeyD', label: 'D', note: 'E', semi: 4, black: false, xSlot: 2 },
  { code: 'KeyF', label: 'F', note: 'F', semi: 5, black: false, xSlot: 3 },
  { code: 'KeyT', label: 'T', note: 'F#', semi: 6, black: true, xSlot: 3.63 },
  { code: 'KeyG', label: 'G', note: 'G', semi: 7, black: false, xSlot: 4 },
  { code: 'KeyY', label: 'Y', note: 'G#', semi: 8, black: true, xSlot: 4.68 },
  { code: 'KeyH', label: 'H', note: 'A', semi: 9, black: false, xSlot: 5 },
  { code: 'KeyU', label: 'U', note: 'A#', semi: 10, black: true, xSlot: 5.73 },
  { code: 'KeyJ', label: 'J', note: 'B', semi: 11, black: false, xSlot: 6 },
  { code: 'KeyK', label: 'K', note: 'C', semi: 12, black: false, xSlot: 7 },
  { code: 'KeyO', label: 'O', note: 'C#', semi: 13, black: true, xSlot: 7.65 },
  { code: 'KeyL', label: 'L', note: 'D', semi: 14, black: false, xSlot: 8 },
  { code: 'KeyP', label: 'P', note: 'D#', semi: 15, black: true, xSlot: 8.72 },
  { code: 'Semicolon', label: ';', note: 'E', semi: 16, black: false, xSlot: 9 },
  { code: 'Quote', label: "'", note: 'F', semi: 17, black: false, xSlot: 10 },
];

const CODE_TO_SEMI = new Map(QWERTY_NOTE_DEFS.map((k) => [k.code, k.semi]));
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const INTERVAL_NAMES = {
  '-12': '−1 Oct',
  '-7': '−5th',
  '-5': '−4th',
  '0': 'Unison',
  '3': 'm3',
  '4': 'M3',
  '5': '4th',
  '7': '5th',
  '10': 'm7',
  '12': '+1 Oct',
  '19': 'Oct+5th',
};

export const SYNTHBIRD_PRESETS = [
  {
    id: 'glass_flute',
    name: 'Glass Flute',
    mode: 'duo',
    octave: 5,
    breath: 1.66,
    glideMs: 28,
    detuneCents: 4,
    intervalSt: 7,
    grit: 0.04,
    pluck: 0.10,
    tubeMm: 36,
    wah: 0.58,
    lfoRate: 3.2,
    lfoDepth: 0.14,
    lfoTarget: 'wah',
  },
  {
    id: 'acid_wah',
    name: 'Acid Bird-Wah',
    mode: 'duo',
    octave: 3,
    breath: 2.38,
    glideMs: 42,
    detuneCents: 14,
    intervalSt: 7,
    grit: 0.66,
    pluck: 0.68,
    tubeMm: 62,
    wah: 0.34,
    lfoRate: 3.2,
    lfoDepth: 0.54,
    lfoTarget: 'wah',
  },
  {
    id: 'retro_pluck',
    name: 'Retro Pluck',
    mode: 'duo',
    octave: 4,
    breath: 2.08,
    glideMs: 8,
    detuneCents: 11,
    intervalSt: 7,
    grit: 0.42,
    pluck: 0.94,
    tubeMm: 82,
    wah: 0.62,
    lfoRate: 6.2,
    lfoDepth: 0.18,
    lfoTarget: 'tube',
  },
  {
    id: 'biphonic_ring',
    name: 'Biphonic Ring',
    mode: 'interval',
    octave: 4,
    breath: 2.25,
    glideMs: 18,
    detuneCents: 16,
    intervalSt: 7,
    grit: 0.50,
    pluck: 0.84,
    tubeMm: 48,
    wah: 0.72,
    lfoRate: 2.5,
    lfoDepth: 0.28,
    lfoTarget: 'grit',
  },
  {
    id: 'cyber_growl',
    name: 'Cyber-Growl',
    mode: 'drone',
    octave: 2,
    breath: 2.85,
    glideMs: 52,
    detuneCents: 22,
    intervalSt: 12,
    grit: 0.92,
    pluck: 0.58,
    tubeMm: 124,
    wah: 0.46,
    lfoRate: 1.6,
    lfoDepth: 0.40,
    lfoTarget: 'wah',
  },
  {
    id: 'scifi_theremin',
    name: 'Sci-Fi Theremin',
    mode: 'duo',
    octave: 5,
    breath: 1.78,
    glideMs: 215,
    detuneCents: 16,
    intervalSt: 12,
    grit: 0.14,
    pluck: 0.04,
    tubeMm: 30,
    wah: 0.66,
    lfoRate: 5.8,
    lfoDepth: 0.34,
    lfoTarget: 'pitch',
  },
];

export function midiToFreq(midi) {
  return 440.0 * Math.pow(2.0, (midi - 69.0) / 12.0);
}

export function midiToName(midi) {
  if (!Number.isFinite(midi) || midi <= 0) return '—';
  const r = Math.round(midi);
  const name = NOTE_NAMES[((r % 12) + 12) % 12];
  const oct = Math.floor(r / 12) - 1;
  return `${name}${oct}`;
}

export class SynthBirdEngine {
  constructor(model, audioEngine) {
    this.model = model;
    this.audio = audioEngine;

    this.activePresetIndex = 0;
    this.voiceMode = 'duo'; // 'duo' | 'interval' | 'drone'
    this.holdEnabled = false;
    this.octave = 4; // C2 (oct 2) .. F7 (oct 6)

    this.params = {
      breath: 1.85,
      glideMs: 28,
      detuneCents: 10,
      intervalSt: 7,
      grit: 0.18,
      pluck: 0.25,
      tubeMm: 44,
      wah: 0.58,
      lfoRate: 4.5,
      lfoDepth: 0.16,
      lfoTarget: 'wah', // 'wah' | 'pitch' | 'tube' | 'grit'
    };

    // Active note state
    this.heldCodes = new Map(); // code -> { midi, semi, order }
    this.pointerHeldMidis = new Map(); // pointerId -> { semi, midi }
    this.mouseHeldMidi = null;
    this.mouseHeldSemi = null;
    this.latchedMidis = [];
    this.droneMidi = null;
    this.droneLeadMidi = null;
    this._noteOrder = 0;
    this.drawerExpanded = false;

    // Continuous DSP/envelope state
    this.curMidiL = 60.0;
    this.curMidiR = 60.0;
    this.wasActiveL = false;
    this.wasActiveR = false;
    this.lastTargetMidiL = null;
    this.lastTargetMidiR = null;
    this.pluckEnv = 0.0;
    this.wahEnv = 0.0;
    this.snapGateTimer = 0.0;
    this.lfoPhase = 0.0;

    // Live UI telemetry for keycap highlighting
    this.displayMidiL = null;
    this.displayMidiR = null;
    this._wasSynthSelected = false;
    this._hasRevealedOnce = false;

    this.sidebarEl = null;
    this.ui = {};

    this.loadPreset(0, true);
    // Start at playable middle register C4 (oct 4) with expressive default patch
    this.octave = 4;
    this._syncUI();
  }

  get isActiveSpecies() {
    return Boolean(this.model.currentSpecies?.isSynthBird);
  }

  mountUI(container = document.body) {
    if (typeof document === 'undefined' || this.sidebarEl) return;

    const el = document.createElement('aside');
    el.id = 'synthbird-sidebar';
    el.className = 'synth-sidebar is-hidden';
    el.setAttribute('aria-label', 'SynthBird Syrinx Synthesizer Controls');

    el.innerHTML = `
      <div class="synth-plate-inner">
        <div class="synth-mobile-bar" aria-label="SynthBird Quick Controls">
          <div class="synth-mob-preset" role="group" aria-label="Patch Preset">
            <button type="button" class="synth-mob-arrow" id="synth-preset-prev" aria-label="Previous Preset">‹</button>
            <button type="button" class="synth-mob-pname" id="synth-preset-cur" title="Tap to cycle preset">1 Glass Flute</button>
            <button type="button" class="synth-mob-arrow" id="synth-preset-next" aria-label="Next Preset">›</button>
          </div>
          <div class="synth-oct-box synth-mob-oct" title="Keyboard Octave">
            <button type="button" class="synth-oct-btn" id="synth-mob-oct-dn" aria-label="Octave Down">−</button>
            <span class="synth-oct-val" id="synth-mob-oct-val">OCT 4</span>
            <button type="button" class="synth-oct-btn" id="synth-mob-oct-up" aria-label="Octave Up">+</button>
          </div>
          <button type="button" class="synth-drawer-btn" id="synth-drawer-toggle" aria-expanded="false">Sliders ▴</button>
        </div>

        <div class="synth-collapsible-rack" id="synth-collapsible-rack">
          <section class="synth-section synth-desktop-presets" aria-label="Patch Presets">
            <div class="synth-preset-grid" id="synth-preset-grid"></div>
          </section>

          <section class="synth-section synth-routing-bar" aria-label="Voice Allocation and Octave">
            <div class="synth-mode-group" role="group" aria-label="Two-Voice Mode">
              <button type="button" class="synth-seg-btn active" data-mode="duo" title="1 key = unison detuned pair; 2 keys = Left low + Right high chord">DUO</button>
              <button type="button" class="synth-seg-btn" data-mode="interval" title="Every key drives Left root + Right tuned harmonic interval">INTV</button>
              <button type="button" class="synth-seg-btn" data-mode="drone" title="Latches Left Voice pedal drone while Right Voice plays lead">DRONE</button>
            </div>
            <button type="button" class="synth-hold-btn" id="synth-hold-btn" title="Sustain notes hands-free while dragging the organ (Spacebar)">HOLD</button>
            <div class="synth-oct-box" title="Keyboard Octave (Z / X)">
              <button type="button" class="synth-oct-btn" id="synth-oct-dn" aria-label="Octave Down">−</button>
              <span class="synth-oct-val" id="synth-oct-val">OCT 4</span>
              <button type="button" class="synth-oct-btn" id="synth-oct-up" aria-label="Octave Up">+</button>
            </div>
          </section>

          <section class="synth-section" aria-label="Physical Syrinx Controls">
            <div class="synth-knob-grid">
              <label class="synth-ctrl" for="sc-breath">
                <div class="sc-top"><span>Breath</span><output id="so-breath">1.62 kPa</output></div>
                <input id="sc-breath" type="range" min="0.70" max="3.60" step="0.02" value="1.62" />
              </label>
              <label class="synth-ctrl" for="sc-glide">
                <div class="sc-top"><span>Glide</span><output id="so-glide">34 ms</output></div>
                <input id="sc-glide" type="range" min="0" max="350" step="2" value="34" />
              </label>
              <label class="synth-ctrl" for="sc-detune">
                <div class="sc-top"><span id="sl-detune">Detune</span><output id="so-detune">9 ct</output></div>
                <input id="sc-detune" type="range" min="0" max="65" step="1" value="9" />
              </label>
              <label class="synth-ctrl" for="sc-grit">
                <div class="sc-top"><span>Membrane Grit</span><output id="so-grit">6%</output></div>
                <input id="sc-grit" type="range" min="0" max="1" step="0.01" value="0.06" />
              </label>
              <label class="synth-ctrl" for="sc-pluck">
                <div class="sc-top"><span>Click Pluck</span><output id="so-pluck">12%</output></div>
                <input id="sc-pluck" type="range" min="0" max="1" step="0.01" value="0.12" />
              </label>
              <label class="synth-ctrl" for="sc-tube">
                <div class="sc-top"><span>Tube Length</span><output id="so-tube">36 mm</output></div>
                <input id="sc-tube" type="range" min="14" max="136" step="1" value="36" />
              </label>
              <label class="synth-ctrl" for="sc-wah">
                <div class="sc-top"><span>Throat Wah</span><output id="so-wah">56%</output></div>
                <input id="sc-wah" type="range" min="0" max="1" step="0.01" value="0.56" />
              </label>
              <label class="synth-ctrl" for="sc-lfodepth">
                <div class="sc-top"><span>LFO Depth</span><output id="so-lfodepth">14%</output></div>
                <input id="sc-lfodepth" type="range" min="0" max="1" step="0.01" value="0.14" />
              </label>
            </div>

            <div class="synth-lfo-strip">
              <label class="synth-ctrl synth-lfo-rate" for="sc-lforate">
                <div class="sc-top"><span>LFO Rate</span><output id="so-lforate">4.8 Hz</output></div>
                <input id="sc-lforate" type="range" min="0.2" max="18.0" step="0.1" value="4.8" />
              </label>
              <div class="synth-lfo-targets" role="group" aria-label="LFO Modulation Target">
                <button type="button" class="synth-tgt-btn" data-target="wah">Wah</button>
                <button type="button" class="synth-tgt-btn active" data-target="pitch">Pitch</button>
                <button type="button" class="synth-tgt-btn" data-target="tube">Tube</button>
                <button type="button" class="synth-tgt-btn" data-target="grit">Grit</button>
              </div>
            </div>
          </section>
        </div>

        <section class="synth-section synth-kbd-section" aria-label="Interactive QWERTY Keyboard">
          <div class="synth-piano" id="synth-piano"></div>
          <div class="synth-legend">
            <div><b>Z / X</b> Octave (C2–F7) · <b>C / V</b> Breath · <b>Space</b> Hold</div>
          </div>
        </section>
      </div>
    `;

    container.appendChild(el);
    this.sidebarEl = el;

    // Prevent pointer events inside sidebar from triggering canvas grabs underneath
    el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      this.audio.unlock();
    });

    // Build 6 preset buttons
    const presetGrid = el.querySelector('#synth-preset-grid');
    this.ui.presetBtns = SYNTHBIRD_PRESETS.map((p, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'synth-preset-btn';
      btn.id = `synth-preset-${p.id}`;
      btn.innerHTML = `<span class="sp-num">${idx + 1}</span><span>${p.name}</span>`;
      btn.addEventListener('click', () => {
        this.loadPreset(idx, false);
        btn.blur();
      });
      presetGrid.appendChild(btn);
      return btn;
    });

    // Build 18 interactive piano keycaps
    const pianoEl = el.querySelector('#synth-piano');
    this.ui.keyEls = new Map();
    for (const kd of QWERTY_NOTE_DEFS) {
      const keyBtn = document.createElement('button');
      keyBtn.type = 'button';
      keyBtn.className = `synth-key ${kd.black ? 'is-black' : 'is-white'}`;
      keyBtn.style.setProperty('--slot', String(kd.xSlot));
      keyBtn.dataset.semi = String(kd.semi);
      keyBtn.title = `${kd.note} (${kd.label} key)`;
      keyBtn.innerHTML = `<span class="sk-char">${kd.label}</span><span class="sk-note">${kd.note}</span>`;

      keyBtn.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.audio.unlock();
        try {
          keyBtn.setPointerCapture(ev.pointerId);
        } catch (_) {
          // Synthetic event
        }
        this._pressVirtualSemi(kd.semi, ev.pointerId);
      });
      const releaseFn = (ev) => {
        ev.stopPropagation();
        this._releaseVirtualSemi(ev.pointerId, kd.semi);
        keyBtn.blur();
      };
      keyBtn.addEventListener('pointerup', releaseFn);
      keyBtn.addEventListener('pointercancel', releaseFn);

      pianoEl.appendChild(keyBtn);
      this.ui.keyEls.set(kd.semi, keyBtn);
    }

    // Cache controls & bind events
    this.ui.readoutL = el.querySelector('#sv-readout-l');
    this.ui.readoutR = el.querySelector('#sv-readout-r');
    this.ui.modeBtns = Array.from(el.querySelectorAll('.synth-seg-btn'));
    this.ui.holdBtn = el.querySelector('#synth-hold-btn');
    this.ui.octVal = el.querySelector('#synth-oct-val');
    this.ui.mobOctVal = el.querySelector('#synth-mob-oct-val');
    this.ui.mobPresetCur = el.querySelector('#synth-preset-cur');
    this.ui.drawerToggle = el.querySelector('#synth-drawer-toggle');
    this.ui.rangeLabel = el.querySelector('#synth-range-label');
    this.ui.detuneLabel = el.querySelector('#sl-detune');
    this.ui.targetBtns = Array.from(el.querySelectorAll('.synth-tgt-btn'));

    const cyclePreset = (delta) => {
      const count = SYNTHBIRD_PRESETS.length;
      const next = ((this.activePresetIndex + delta) % count + count) % count;
      this.loadPreset(next, false);
    };
    el.querySelector('#synth-preset-prev').addEventListener('click', (ev) => {
      cyclePreset(-1);
      ev.currentTarget.blur();
    });
    el.querySelector('#synth-preset-next').addEventListener('click', (ev) => {
      cyclePreset(1);
      ev.currentTarget.blur();
    });
    this.ui.mobPresetCur.addEventListener('click', (ev) => {
      cyclePreset(1);
      ev.currentTarget.blur();
    });
    el.querySelector('#synth-mob-oct-dn').addEventListener('click', (ev) => {
      this.shiftOctave(-1);
      ev.currentTarget.blur();
    });
    el.querySelector('#synth-mob-oct-up').addEventListener('click', (ev) => {
      this.shiftOctave(1);
      ev.currentTarget.blur();
    });
    this.ui.drawerToggle.addEventListener('click', (ev) => {
      this.setDrawerExpanded(!this.drawerExpanded);
      ev.currentTarget.blur();
    });

    for (const btn of this.ui.modeBtns) {
      btn.addEventListener('click', () => {
        this.setVoiceMode(btn.dataset.mode);
        btn.blur();
      });
    }

    this.ui.holdBtn.addEventListener('click', () => {
      this.toggleHold();
      this.ui.holdBtn.blur();
    });

    el.querySelector('#synth-oct-dn').addEventListener('click', (ev) => {
      this.shiftOctave(-1);
      ev.currentTarget.blur();
    });
    el.querySelector('#synth-oct-up').addEventListener('click', (ev) => {
      this.shiftOctave(1);
      ev.currentTarget.blur();
    });

    for (const btn of this.ui.targetBtns) {
      btn.addEventListener('click', () => {
        this.params.lfoTarget = btn.dataset.target;
        this._syncUI();
        btn.blur();
      });
    }

    const bindSlider = (id, outId, onInput) => {
      const input = el.querySelector(`#${id}`);
      const output = el.querySelector(`#${outId}`);
      this.ui[id] = input;
      this.ui[outId] = output;
      input.addEventListener('input', () => {
        onInput(parseFloat(input.value));
        this._syncReadoutsOnly();
      });
      input.addEventListener('change', () => input.blur());
      input.addEventListener('pointerup', () => input.blur());
    };

    bindSlider('sc-breath', 'so-breath', (v) => { this.params.breath = v; });
    bindSlider('sc-glide', 'so-glide', (v) => { this.params.glideMs = v; });
    bindSlider('sc-detune', 'so-detune', (v) => {
      if (this.voiceMode === 'interval') {
        this.params.intervalSt = Math.round(v);
      } else {
        this.params.detuneCents = v;
      }
    });
    bindSlider('sc-grit', 'so-grit', (v) => { this.params.grit = v; });
    bindSlider('sc-pluck', 'so-pluck', (v) => { this.params.pluck = v; });
    bindSlider('sc-tube', 'so-tube', (v) => { this.params.tubeMm = v; });
    bindSlider('sc-wah', 'so-wah', (v) => { this.params.wah = v; });
    bindSlider('sc-lfodepth', 'so-lfodepth', (v) => { this.params.lfoDepth = v; });
    bindSlider('sc-lforate', 'so-lforate', (v) => { this.params.lfoRate = v; });

    this._bindKeyboardEvents();
    this._syncUI();
  }

  _bindKeyboardEvents() {
    if (typeof window === 'undefined') return;

    // Capture phase ensures Spacebar / QWERTY keys work cleanly on SynthBird without triggering Auto-Sing
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isActiveSpecies) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target?.tagName;
        if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && e.target.type !== 'range')) {
          return;
        }

        const code = e.code;

        if (code === 'Space') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.audio.unlock();
          this.toggleHold();
          return;
        }

        if (code === 'Escape') {
          this.panicReleaseAll();
          return;
        }

        if (code === 'KeyZ') {
          e.preventDefault();
          if (!e.repeat) this.shiftOctave(-1);
          return;
        }
        if (code === 'KeyX') {
          e.preventDefault();
          if (!e.repeat) this.shiftOctave(1);
          return;
        }
        if (code === 'KeyC') {
          e.preventDefault();
          this.params.breath = clamp(this.params.breath - 0.22, 0.70, 3.60);
          this._syncUI();
          return;
        }
        if (code === 'KeyV') {
          e.preventDefault();
          this.params.breath = clamp(this.params.breath + 0.22, 0.70, 3.60);
          this._syncUI();
          return;
        }

        if (!e.repeat && code >= 'Digit1' && code <= 'Digit6') {
          const idx = parseInt(code.slice(5), 10) - 1;
          if (idx >= 0 && idx < SYNTHBIRD_PRESETS.length) {
            e.preventDefault();
            this.audio.unlock();
            this.loadPreset(idx, false);
          }
          return;
        }

        if (CODE_TO_SEMI.has(code)) {
          e.preventDefault();
          if (e.repeat || this.heldCodes.has(code)) return;
          this.audio.unlock();
          const semi = CODE_TO_SEMI.get(code);
          const midi = (this.octave + 1) * 12 + semi;
          this._noteOn(code, midi, semi);
        }
      },
      { capture: true }
    );

    window.addEventListener(
      'keyup',
      (e) => {
        const code = e.code;
        if (this.heldCodes.has(code)) {
          this.heldCodes.delete(code);
        }
      },
      { capture: true }
    );

    window.addEventListener('blur', () => this._releasePhysicalKeys());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._releasePhysicalKeys();
    });
  }

  setDrawerExpanded(expanded) {
    this.drawerExpanded = Boolean(expanded);
    if (!this.sidebarEl) return;
    this.sidebarEl.classList.toggle('is-expanded', this.drawerExpanded);
    if (this.ui.drawerToggle) {
      this.ui.drawerToggle.setAttribute('aria-expanded', String(this.drawerExpanded));
      this.ui.drawerToggle.textContent = this.drawerExpanded ? 'Sliders ▾' : 'Sliders ▴';
      this.ui.drawerToggle.classList.toggle('active', this.drawerExpanded);
    }
  }

  _pressVirtualSemi(semi, pointerId = 'mouse') {
    const hadPhysicalHeld =
      this.heldCodes.size > 0 || this.pointerHeldMidis.size > 0 || this.mouseHeldMidi !== null;
    const midi = (this.octave + 1) * 12 + semi;
    this.pointerHeldMidis.set(pointerId, { semi, midi });
    this.mouseHeldSemi = semi;
    this.mouseHeldMidi = midi;
    this._handleNoteTrigger(midi, hadPhysicalHeld);
  }

  _releaseVirtualSemi(pointerId = 'mouse', semi = null) {
    this.pointerHeldMidis.delete(pointerId);
    if (this.pointerHeldMidis.size === 0 && (semi === null || this.mouseHeldSemi === semi)) {
      this.mouseHeldSemi = null;
      this.mouseHeldMidi = null;
    } else if (this.pointerHeldMidis.size > 0) {
      const last = Array.from(this.pointerHeldMidis.values()).pop();
      this.mouseHeldSemi = last.semi;
      this.mouseHeldMidi = last.midi;
    }
  }

  pressCode(code) {
    if (!CODE_TO_SEMI.has(code) || this.heldCodes.has(code)) return false;
    const semi = CODE_TO_SEMI.get(code);
    const midi = (this.octave + 1) * 12 + semi;
    this._noteOn(code, midi, semi);
    return true;
  }

  releaseCode(code) {
    return this.heldCodes.delete(code);
  }

  _noteOn(code, midi, semi) {
    const hadPhysicalHeld = this.heldCodes.size > 0 || this.mouseHeldMidi !== null;
    this.heldCodes.set(code, { midi, semi, order: ++this._noteOrder });
    this._handleNoteTrigger(midi, hadPhysicalHeld);
  }

  _handleNoteTrigger(midi, hadPhysicalHeld) {
    // Live note press seamlessly takes over from Auto-Play demo sequence
    if (this.model.driverPlaying) {
      this.model.driverPlaying = false;
    }

    if (this.voiceMode === 'drone') {
      if (this.droneMidi === null || (!hadPhysicalHeld && !this.holdEnabled)) {
        this.droneMidi = midi;
        this.droneLeadMidi = null;
      } else if (this.holdEnabled) {
        if (midi <= this.droneMidi - 1) {
          this.droneMidi = midi;
        } else {
          this.droneLeadMidi = midi;
        }
      } else {
        this.droneLeadMidi = midi;
      }
    } else if (this.holdEnabled) {
      if (!hadPhysicalHeld) {
        // Toggle off if tapping the exact single latched note; otherwise start fresh latched chord
        if (this.latchedMidis.length === 1 && this.latchedMidis[0] === midi) {
          this.latchedMidis = [];
        } else {
          this.latchedMidis = [midi];
        }
      } else if (!this.latchedMidis.includes(midi)) {
        this.latchedMidis.push(midi);
      }
    }

    this._triggerArticulation();
  }

  _triggerArticulation() {
    this.pluckEnv = 1.0;
    this.wahEnv = 1.0;
    if (this.params.pluck > 0.18) {
      this.snapGateTimer = 0.014;
      this.audio.pokeLabia('both', 0.14 + 0.34 * this.params.pluck);
    }
  }

  _releasePhysicalKeys() {
    this.heldCodes.clear();
    this.pointerHeldMidis.clear();
    this.mouseHeldMidi = null;
    this.mouseHeldSemi = null;
  }

  panicReleaseAll() {
    this._releasePhysicalKeys();
    this.latchedMidis = [];
    this.droneMidi = null;
    this.droneLeadMidi = null;
    this.holdEnabled = false;
    this._syncUI();
  }

  loadPreset(index, silentInit = false) {
    const idx = clamp(index, 0, SYNTHBIRD_PRESETS.length - 1);
    const p = SYNTHBIRD_PRESETS[idx];
    this.activePresetIndex = idx;
    this.voiceMode = p.mode;
    this.octave = p.octave;
    this.params.breath = p.breath;
    this.params.glideMs = p.glideMs;
    this.params.detuneCents = p.detuneCents;
    this.params.intervalSt = p.intervalSt;
    this.params.grit = p.grit;
    this.params.pluck = p.pluck;
    this.params.tubeMm = p.tubeMm;
    this.params.wah = p.wah;
    this.params.lfoRate = p.lfoRate;
    this.params.lfoDepth = p.lfoDepth;
    this.params.lfoTarget = p.lfoTarget;

    if (!silentInit) {
      this._syncDetuneSliderMode();
      this._syncUI();
    }
  }

  setVoiceMode(mode) {
    if (mode !== 'duo' && mode !== 'interval' && mode !== 'drone') return;
    this.voiceMode = mode;
    if (mode !== 'drone') {
      this.droneLeadMidi = null;
    }
    this._syncDetuneSliderMode();
    this._syncUI();
  }

  toggleHold() {
    this.holdEnabled = !this.holdEnabled;
    if (this.holdEnabled) {
      // Capture any currently held notes into the latch immediately
      const phys = this._getPhysicalSortedMidis();
      if (phys.length > 0) {
        this.latchedMidis = [...phys];
        if (this.voiceMode === 'drone' && this.droneMidi === null) {
          this.droneMidi = phys[0];
          this.droneLeadMidi = phys.length > 1 ? phys[phys.length - 1] : null;
        }
      }
    } else {
      this.latchedMidis = [];
      if (this.heldCodes.size === 0 && this.mouseHeldMidi === null) {
        this.droneMidi = null;
        this.droneLeadMidi = null;
      }
    }
    this._syncUI();
  }

  shiftOctave(delta) {
    const prevOct = this.octave;
    this.octave = clamp(this.octave + delta, 2, 6);
    const diffSemi = (this.octave - prevOct) * 12;
    if (diffSemi !== 0 && this.heldCodes.size === 0 && this.mouseHeldMidi === null) {
      this.latchedMidis = this.latchedMidis.map((m) => clamp(m + diffSemi, 36, 103));
      if (this.droneMidi !== null) this.droneMidi = clamp(this.droneMidi + diffSemi, 36, 103);
      if (this.droneLeadMidi !== null) this.droneLeadMidi = clamp(this.droneLeadMidi + diffSemi, 36, 103);
    }
    this._syncUI();
  }

  _getPhysicalSortedMidis() {
    const list = [];
    for (const item of this.heldCodes.values()) {
      list.push(item.midi);
    }
    for (const item of this.pointerHeldMidis.values()) {
      if (!list.includes(item.midi)) list.push(item.midi);
    }
    if (this.mouseHeldMidi !== null && !list.includes(this.mouseHeldMidi)) {
      list.push(this.mouseHeldMidi);
    }
    list.sort((a, b) => a - b);
    return list;
  }

  _allocateVoices() {
    const phys = this._getPhysicalSortedMidis();

    if (this.voiceMode === 'drone') {
      if (phys.length === 0 && !this.holdEnabled) {
        this.droneMidi = null;
        this.droneLeadMidi = null;
        return { midiL: null, midiR: null };
      }
      if (phys.length >= 2) {
        this.droneMidi = phys[0];
        return { midiL: phys[0], midiR: phys[phys.length - 1] };
      }
      if (phys.length === 1) {
        const m = phys[0];
        if (this.droneMidi === null) this.droneMidi = m;
        if (m === this.droneMidi && this.droneLeadMidi === null) {
          return { midiL: this.droneMidi, midiR: this.droneMidi };
        }
        return { midiL: this.droneMidi, midiR: m };
      }
      // Hold enabled with 0 physical keys held
      if (this.droneMidi !== null) {
        return {
          midiL: this.droneMidi,
          midiR: this.droneLeadMidi !== null ? this.droneLeadMidi : this.droneMidi,
        };
      }
      return { midiL: null, midiR: null };
    }

    const notes = this.holdEnabled
      ? (phys.length > 0 ? Array.from(new Set([...this.latchedMidis, ...phys])).sort((a, b) => a - b) : [...this.latchedMidis].sort((a, b) => a - b))
      : phys;

    if (notes.length === 0) {
      return { midiL: null, midiR: null };
    }

    if (this.voiceMode === 'interval') {
      const root = notes[notes.length - 1];
      return {
        midiL: root,
        midiR: clamp(root + this.params.intervalSt, 33, 108),
      };
    }

    // Default 'duo': 1 note -> unison detuned dual voices; 2+ notes -> lowest = Left, highest = Right
    if (notes.length === 1) {
      return { midiL: notes[0], midiR: notes[0] };
    }
    return { midiL: notes[0], midiR: notes[notes.length - 1] };
  }

  /**
   * Called each physics step from SyrinxAnatomyModel.step()!
   * Updates sidebar visibility, advances LFO + portamento + pluck/wah envelopes,
   * and writes physical syrinx DOF targets when SynthBird is active.
   */
  stepAndApplyTargets(safeDt, targets, organ) {
    const active = this.isActiveSpecies;
    if (active !== this._wasSynthSelected) {
      this._wasSynthSelected = active;
      if (!active) {
        this._releasePhysicalKeys();
        this.displayMidiL = null;
        this.displayMidiR = null;
      }
      if (this.sidebarEl) {
        if (active) {
          if (!this._hasRevealedOnce) {
            this._hasRevealedOnce = true;
            this.sidebarEl.classList.add('is-first-reveal');
            requestAnimationFrame(() => {
              if (!this.sidebarEl || !this.isActiveSpecies) return;
              void this.sidebarEl.offsetWidth;
              this.sidebarEl.classList.remove('is-hidden');
            });
          } else {
            this.sidebarEl.classList.remove('is-first-reveal', 'is-hidden');
          }
        } else {
          this.setDrawerExpanded(false);
          this.sidebarEl.classList.remove('is-first-reveal');
          this.sidebarEl.classList.add('is-hidden');
        }
      }
    }

    if (!active) return { activeVoicePlay: false, bronchCoupling: organ.hasBronchidesmus ? 1.0 : 0.0 };

    // Advance LFO & articulation envelopes
    this.lfoPhase = (this.lfoPhase + safeDt * 2.0 * Math.PI * this.params.lfoRate) % (2.0 * Math.PI);
    const lfoMod = Math.sin(this.lfoPhase) * this.params.lfoDepth;
    this.pluckEnv *= Math.exp(-safeDt / 0.042);
    this.wahEnv *= Math.exp(-safeDt / 0.125);
    this.snapGateTimer = Math.max(0.0, this.snapGateTimer - safeDt);

    const tubeModMm = clamp(
      this.params.tubeMm + (this.params.lfoTarget === 'tube' ? 32.0 * lfoMod : 0.0),
      12.0,
      140.0
    );
    const gritEff = clamp(
      this.params.grit + (this.params.lfoTarget === 'grit' ? 0.44 * lfoMod : 0.0),
      0.0,
      1.0
    );
    const pitchLfoSemi = this.params.lfoTarget === 'pitch' ? 1.35 * lfoMod : 0.0;
    const detuneSemi = (this.voiceMode === 'interval' ? 0.06 : this.params.detuneCents * 0.005);
    const bronchCoupling = clamp(0.28 + 1.85 * this.params.pluck, 0.15, 2.15);

    // Case A: Auto-Play Generative Synth Sequence is running — layer live macro controls onto sequence!
    if (this.model.driverPlaying) {
      const octOffsetSemi = (this.octave - 4) * 12;
      const demoL = targets.demoMidiL || 0;
      const demoR = targets.demoMidiR || 0;
      const effDemoL = targets.demoEffMidiL || demoL;
      const effDemoR = targets.demoEffMidiR || demoR;

      const dispL = demoL > 0 ? clamp(demoL + octOffsetSemi, 34, 102) : null;
      const dispR = demoR > 0
        ? clamp(
            this.voiceMode === 'interval' && dispL !== null ? dispL + this.params.intervalSt : demoR + octOffsetSemi,
            34,
            104
          )
        : null;
      const mL = effDemoL > 0 ? clamp(effDemoL + octOffsetSemi, 34, 102) : null;
      const mR = effDemoR > 0
        ? clamp(
            this.voiceMode === 'interval' && mL !== null ? mL + this.params.intervalSt : effDemoR + octOffsetSemi,
            34,
            104
          )
        : null;

      this.displayMidiL = dispL;
      this.displayMidiR = dispR;

      const mtmL = clamp(lerp(1.06, 0.05, gritEff), 0.02, 1.42);
      const mtmR = clamp(lerp(1.08, 0.06, gritEff * 0.92), 0.02, 1.42);
      targets.mtmStretchL = mtmL;
      targets.mtmStretchR = mtmR;
      targets.tracheaLenMm = tubeModMm;

      const seqBronchCoupling = clamp(0.10 + 0.75 * this.params.pluck, 0.08, 1.15);

      if (targets.pSub > 0.45) {
        const scaleP = this.params.breath / 1.66;
        targets.pSub = clamp(targets.pSub * scaleP, 0.72, 4.2);
        targets.pIcas = clamp(targets.pSub * (1.0 + 0.28 * this.params.pluck), 0.72, 4.6);

        const wahAuto = clamp(
          this.params.wah + (this.params.lfoTarget === 'wah' ? 0.36 * lfoMod : 0.0),
          0.0,
          1.0
        );
        const fTrack = Math.max(mL !== null ? midiToFreq(mL) : 0.0, mR !== null ? midiToFreq(mR) : 440.0);
        const wahFreq = clamp(Math.max(460.0, fTrack) * Math.pow(2.0, (wahAuto - 0.46) * 2.2), 540.0, 5800.0);
        const oec = solveSpeciesOec(organ, wahFreq);
        targets.oecVolMl = oec.oecVolMl;
        targets.beakGapeMm = clamp(oec.beakGapeMm + 6.5 * Math.pow(wahAuto, 1.25), 0.75, 19.5);

        if (mL !== null) {
          const fL = midiToFreq(mL - detuneSemi + pitchLfoSemi) / 1.018;
          targets.tensionL = solveSpeciesTension(organ, 'L', fL, mtmL, targets.pSub, 0.084);
        }
        if (mR !== null) {
          const fR = midiToFreq(mR + detuneSemi + pitchLfoSemi) / 1.018;
          targets.tensionR = solveSpeciesTension(organ, 'R', fR, mtmR, targets.pSub, 0.084);
        }
      }

      this._updateLiveKeyHighlights();
      return { activeVoicePlay: false, bronchCoupling: seqBronchCoupling };
    }

    // Case B: Live QWERTY / Virtual Manual Play
    const { midiL, midiR } = this._allocateVoices();
    const activeL = midiL !== null;
    const activeR = midiR !== null;
    const anyActive = activeL || activeR;

    // Tube Length slider always deforms SynthBird's windpipe live (even while silent!)
    targets.tracheaLenMm = tubeModMm;

    if (!anyActive) {
      this.wasActiveL = false;
      this.wasActiveR = false;
      this.lastTargetMidiL = null;
      this.lastTargetMidiR = null;
      this.displayMidiL = null;
      this.displayMidiR = null;
      this._updateLiveKeyHighlights();
      return { activeVoicePlay: false, bronchCoupling };
    }

    // Re-trigger subtle click pluck when legato pitch changes
    if ((activeL && midiL !== this.lastTargetMidiL) || (activeR && midiR !== this.lastTargetMidiR)) {
      if (this.wasActiveL || this.wasActiveR) {
        this.pluckEnv = Math.max(this.pluckEnv, 0.78);
        this.wahEnv = Math.max(this.wahEnv, 0.72);
      }
      this.lastTargetMidiL = midiL;
      this.lastTargetMidiR = midiR;
    }

    const glideTau = this.params.glideMs * 0.001;
    const glideAlpha = glideTau <= 0.0015 ? 1.0 : 1.0 - Math.exp(-safeDt / glideTau);

    if (activeL) {
      if (!this.wasActiveL || glideAlpha >= 0.999) {
        this.curMidiL = midiL;
      } else {
        this.curMidiL = lerp(this.curMidiL, midiL, glideAlpha);
      }
    }
    if (activeR) {
      if (!this.wasActiveR || glideAlpha >= 0.999) {
        this.curMidiR = midiR;
      } else {
        this.curMidiR = lerp(this.curMidiR, midiR, glideAlpha);
      }
    }
    this.wasActiveL = activeL;
    this.wasActiveR = activeR;

    this.displayMidiL = midiL;
    this.displayMidiR = midiR;

    const mtmL = clamp(lerp(1.06, 0.03, gritEff), 0.02, 1.42);
    const mtmR = clamp(lerp(1.08, 0.04, gritEff * 0.96), 0.02, 1.42);
    const pSub = clamp(this.params.breath, 0.68, 4.20);
    const pIcas = clamp(pSub * (1.00 + 0.58 * this.params.pluck * this.pluckEnv), 0.68, 5.15);

    const openSnapGate = this.snapGateTimer > 0.0 ? -0.012 : 0.084;
    const gapL = activeL ? openSnapGate : -0.048;
    const gapR = activeR ? openSnapGate : -0.048;

    const fL = midiToFreq(this.curMidiL - detuneSemi + pitchLfoSemi);
    const fR = midiToFreq(this.curMidiR + detuneSemi + pitchLfoSemi);
    const fTrack = Math.max(activeL ? fL : 0.0, activeR ? fR : 0.0);

    const wahMod = clamp(
      this.params.wah +
        0.36 * this.params.pluck * this.wahEnv +
        (this.params.lfoTarget === 'wah' ? 0.44 * lfoMod : 0.0),
      0.0,
      1.0
    );
    // Keyboard-tracked OEC Helmholtz formant + expressive mandible wah sweep (Buchla/Moog keytrack + avian OEC tracking!)
    const wahFreq = clamp(Math.max(460.0, fTrack) * Math.pow(2.0, (wahMod - 0.46) * 2.4), 520.0, 6800.0);
    const oec = solveSpeciesOec(organ, wahFreq);
    const oecVolMl = oec.oecVolMl;
    const beakGapeMm = clamp(oec.beakGapeMm + 9.2 * Math.pow(wahMod, 1.32), 0.75, 22.0);

    targets.pSub = pSub;
    targets.pIcas = pIcas;
    targets.gapL = gapL;
    targets.gapR = gapR;
    targets.mtmStretchL = mtmL;
    targets.mtmStretchR = mtmR;
    targets.oecVolMl = oecVolMl;
    targets.beakGapeMm = beakGapeMm;
    if (activeL) {
      targets.tensionL = solveSpeciesTension(organ, 'L', fL / TWO_MASS_MODE_RATIO, mtmL, pSub, 0.084);
    }
    if (activeR) {
      targets.tensionR = solveSpeciesTension(organ, 'R', fR / TWO_MASS_MODE_RATIO, mtmR, pSub, 0.084);
    }

    this._updateLiveKeyHighlights();
    return { activeVoicePlay: true, bronchCoupling };
  }

  _syncDetuneSliderMode() {
    const sl = this.ui['sc-detune'];
    if (!sl) return;
    if (this.voiceMode === 'interval') {
      sl.min = '-12';
      sl.max = '19';
      sl.step = '1';
      sl.value = String(this.params.intervalSt);
      if (this.ui.detuneLabel) this.ui.detuneLabel.textContent = 'Interval';
    } else {
      sl.min = '0';
      sl.max = '65';
      sl.step = '1';
      sl.value = String(Math.round(this.params.detuneCents));
      if (this.ui.detuneLabel) this.ui.detuneLabel.textContent = 'Detune';
    }
  }

  _syncReadoutsOnly() {
    if (!this.sidebarEl) return;
    this.ui['so-breath'].textContent = `${this.params.breath.toFixed(2)} kPa`;
    this.ui['so-glide'].textContent = `${Math.round(this.params.glideMs)} ms`;
    if (this.voiceMode === 'interval') {
      const st = Math.round(this.params.intervalSt);
      const sign = st > 0 ? `+${st}` : `${st}`;
      const tag = INTERVAL_NAMES[String(st)];
      this.ui['so-detune'].textContent = tag ? `${sign} (${tag})` : `${sign} st`;
    } else {
      this.ui['so-detune'].textContent = `${Math.round(this.params.detuneCents)} ct`;
    }
    this.ui['so-grit'].textContent = `${Math.round(this.params.grit * 100)}%`;
    this.ui['so-pluck'].textContent = `${Math.round(this.params.pluck * 100)}%`;
    this.ui['so-tube'].textContent = `${Math.round(this.params.tubeMm)} mm`;
    this.ui['so-wah'].textContent = `${Math.round(this.params.wah * 100)}%`;
    this.ui['so-lfodepth'].textContent = `${Math.round(this.params.lfoDepth * 100)}%`;
    this.ui['so-lforate'].textContent = `${this.params.lfoRate.toFixed(1)} Hz`;
  }

  _syncUI() {
    if (!this.sidebarEl) return;
    this._syncDetuneSliderMode();

    this.ui['sc-breath'].value = String(this.params.breath);
    this.ui['sc-glide'].value = String(this.params.glideMs);
    this.ui['sc-grit'].value = String(this.params.grit);
    this.ui['sc-pluck'].value = String(this.params.pluck);
    this.ui['sc-tube'].value = String(this.params.tubeMm);
    this.ui['sc-wah'].value = String(this.params.wah);
    this.ui['sc-lfodepth'].value = String(this.params.lfoDepth);
    this.ui['sc-lforate'].value = String(this.params.lfoRate);

    this._syncReadoutsOnly();

    this.ui.presetBtns.forEach((btn, idx) => {
      btn.classList.toggle('active', idx === this.activePresetIndex);
    });
    for (const btn of this.ui.modeBtns) {
      btn.classList.toggle('active', btn.dataset.mode === this.voiceMode);
    }
    for (const btn of this.ui.targetBtns) {
      btn.classList.toggle('active', btn.dataset.target === this.params.lfoTarget);
    }
    this.ui.holdBtn.classList.toggle('active', this.holdEnabled);
    this.ui.octVal.textContent = `OCT ${this.octave}`;
    if (this.ui.mobOctVal) {
      this.ui.mobOctVal.textContent = `OCT ${this.octave}`;
    }
    if (this.ui.mobPresetCur) {
      const p = SYNTHBIRD_PRESETS[this.activePresetIndex];
      this.ui.mobPresetCur.textContent = `${this.activePresetIndex + 1} ${p.name}`;
    }

    if (this.ui.rangeLabel) {
      const lowMidi = (this.octave + 1) * 12;
      const highMidi = lowMidi + 17;
      this.ui.rangeLabel.textContent = `${midiToName(lowMidi)} – ${midiToName(highMidi)}`;
    }
  }

  _updateLiveKeyHighlights() {
    if (!this.sidebarEl) return;
    const mL = this.displayMidiL;
    const mR = this.displayMidiR;

    if (this.ui.readoutL) {
      this.ui.readoutL.textContent = mL !== null ? `L ${midiToName(mL)}` : 'L —';
      this.ui.readoutL.classList.toggle('active', mL !== null);
    }
    if (this.ui.readoutR) {
      this.ui.readoutR.textContent = mR !== null ? `R ${midiToName(mR)}` : 'R —';
      this.ui.readoutR.classList.toggle('active', mR !== null);
    }

    const baseMidi = (this.octave + 1) * 12;
    for (const [semi, btn] of this.ui.keyEls.entries()) {
      const keyMidi = baseMidi + semi;
      // Match exact MIDI note, or wrap pitch-class if drone/sequence note lies outside visible 18-key window
      const hitL =
        mL !== null &&
        (keyMidi === mL || ((mL < baseMidi || mL > baseMidi + 17) && semi < 12 && ((mL % 12) + 12) % 12 === semi));
      const hitR =
        mR !== null &&
        (keyMidi === mR || ((mR < baseMidi || mR > baseMidi + 17) && semi < 12 && ((mR % 12) + 12) % 12 === semi));
      btn.classList.toggle('voice-l', hitL);
      btn.classList.toggle('voice-r', hitR);
    }
  }
}
