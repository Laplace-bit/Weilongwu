/**
 * @fileoverview Entrypoint for the Interactive Oscine Syrinx Bio-Acoustic Web Instrument
 */

import { SyrinxAudioEngine } from './audio/audio-engine.js';
import { SyrinxAnatomyModel } from './physics/anatomy-model.js';
import { SyrinxAnatomicalRenderer } from './render/anatomical-renderer.js';
import { FloatingLabelsRenderer } from './render/floating-labels.js';
import { BioacousticKymograph } from './render/kymograph.js';
import { TactileController } from './interaction/tactile-controller.js';
import { SynthBirdEngine } from './synth/synthbird-engine.js';

class SyrinxBioacousticApp {
  constructor() {
    this.canvas = document.getElementById('syrinx-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.audio = new SyrinxAudioEngine();
    this.model = new SyrinxAnatomyModel();
    this.synth = new SynthBirdEngine(this.model, this.audio);
    this.model.synthEngine = this.synth;
    this.synth.mountUI(document.body);
    this.anatRenderer = new SyrinxAnatomicalRenderer(this.model);
    this.labelsRenderer = new FloatingLabelsRenderer(this.model);
    this.kymograph = new BioacousticKymograph();
    this.controller = new TactileController(
      this.canvas,
      this.model,
      this.audio,
      this.anatRenderer,
      this.labelsRenderer
    );

    this.dpr = 1;
    this.lastTimestamp = performance.now();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();

    // Sync initial offline preview telemetry
    this.audio.updateParams(this.model.getAudioParams());

    requestAnimationFrame((ts) => this.loop(ts));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.model.setViewport(w, h);
    const u = this.model.layout.uiScale || 1;
    document.documentElement.style.setProperty('--u', u.toFixed(4));
    if (this.model.layout.isPortrait) {
      const synthBottom = Math.round(h - this.model.layout.kymoY + 6 * u);
      const synthTopClear = Math.round(this.model.layout.selectorY + this.model.layout.selectorH + 8 * u);
      document.documentElement.style.setProperty('--safe-side', `${this.model.layout.safeSide}px`);
      document.documentElement.style.setProperty('--synth-bottom', `${synthBottom}px`);
      document.documentElement.style.setProperty('--synth-top-clear', `${synthTopClear}px`);
    }
  }

  renderSingleFrame(dt) {
    this.model.step(dt, this.audio.telemetry);
    this.audio.updateParams(this.model.getAudioParams());

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const { width, height } = this.model.layout;
    this.anatRenderer.render(ctx, dt, this.audio.telemetry);
    this.labelsRenderer.render(ctx, dt, this.audio.telemetry);
    this.kymograph.render(ctx, width, height, this.model, this.audio, dt);

    ctx.restore();
  }

  loop(timestamp) {
    const dt = Math.min(0.05, Math.max(0.001, (timestamp - this.lastTimestamp) * 0.001));
    this.lastTimestamp = timestamp;
    this.renderSingleFrame(dt);
    requestAnimationFrame((ts) => this.loop(ts));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new SyrinxBioacousticApp();
});
