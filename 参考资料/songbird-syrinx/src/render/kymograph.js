/**
 * @fileoverview Archival Vellum Kymograph — Dry Scientific Song Sonogram (0.15 - 8.0 kHz)
 *
 * Scrolls dry real-time spectral harmonics (tapped directly at the avian beak before room reverb
 * or monitor limiting, 1024-pt 21.3 ms window) in iron-gall sepia alongside subtle cycle-counted
 * Prussian-blue (Left Voice) and Venetian-vermilion (Right Voice) fundamental traces at a
 * frame-rate-independent 120 px/s velocity with 1.0 s copperplate bottom-border ticks.
 */

import { clamp } from '../physics/anatomy-model.js';

const MIN_FREQ_HZ = 60.0;
const MAX_FREQ_HZ = 8000.0;
const SCROLL_PX_PER_SEC = 120.0;
const SERIF_STACK = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';

export class BioacousticKymograph {
  constructor() {
    this.offCanvas = document.createElement('canvas');
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: false });
    this.bufW = 0;
    this.bufH = 0;
    this._scrollCarry = 0.0;
    this._tickOffsetPx = 0.0;
    this._curStripY = null;
    this._lastViewportKey = '';
  }

  _ensureBuffer(w, h) {
    const targetW = Math.max(120, Math.floor(w));
    const targetH = Math.max(48, Math.floor(h));
    if (this.bufW === targetW && this.bufH === targetH) return;
    this.bufW = targetW;
    this.bufH = targetH;
    this.offCanvas.width = targetW;
    this.offCanvas.height = targetH;
    this.offCtx.clearRect(0, 0, targetW, targetH);
  }

  _freqToY(freqHz, height) {
    const norm = clamp((freqHz - MIN_FREQ_HZ) / (MAX_FREQ_HZ - MIN_FREQ_HZ), 0, 1);
    return height - 1 - norm * (height - 2);
  }

  render(ctx, width, height, model, audioEngine, dt = 1 / 60) {
    const isPortrait = Boolean(model.layout.isPortrait);
    const u = isPortrait ? model.layout.uiScale || 1 : 1;
    const safeDt = clamp(dt, 0.001, 0.05);

    const marginX = Math.max(46, Math.min(88, width * 0.058));
    const stripW = isPortrait
      ? Math.max(150, width - model.layout.safeSide * 2)
      : Math.max(180, width - marginX * 2 - 28);
    const stripH = isPortrait ? model.layout.kymoH : 72;
    const stripX = isPortrait ? model.layout.safeSide : marginX + 10;

    const isSynth = Boolean(model.currentSpecies?.isSynthBird);
    const targetStripY = isPortrait
      ? isSynth
        ? (model.layout.kymoYSynth ?? model.layout.kymoY)
        : (model.layout.kymoYNatural ?? model.layout.kymoY)
      : height - stripH - 26;

    const vpKey = `${width}x${height}:${isPortrait ? 1 : 0}`;
    if (this._curStripY === null || this._lastViewportKey !== vpKey) {
      this._curStripY = targetStripY;
      this._lastViewportKey = vpKey;
    } else if (isPortrait) {
      const slideFollow = 1.0 - Math.exp(-safeDt * 7.5);
      this._curStripY += (targetStripY - this._curStripY) * slideFollow;
      if (Math.abs(targetStripY - this._curStripY) < 0.25) {
        this._curStripY = targetStripY;
      }
    } else {
      this._curStripY = targetStripY;
    }
    const stripY = Math.round(this._curStripY);

    this._ensureBuffer(stripW, stripH);

    // 1. Frame-rate-independent horizontal scroll (scaled proportionally in 9:16 portrait!)
    const pxPerSec = isPortrait ? SCROLL_PX_PER_SEC * 0.72 * u : SCROLL_PX_PER_SEC;
    const deltaPx = safeDt * pxPerSec;
    this._scrollCarry += deltaPx;
    this._tickOffsetPx = (this._tickOffsetPx + deltaPx) % pxPerSec;
    const scrollPx = Math.floor(this._scrollCarry);
    if (scrollPx > 0) {
      this._scrollCarry -= scrollPx;
      const octx = this.offCtx;
      octx.globalCompositeOperation = 'copy';
      octx.drawImage(this.offCanvas, -scrollPx, 0);
      octx.globalCompositeOperation = 'source-over';
      octx.clearRect(this.bufW - scrollPx, 0, scrollPx, this.bufH);

      const spec = audioEngine.getSpectrum();
      const telem = audioEngine.telemetry;
      const d = model.dofs;

      // Paint genuine dry FFT spectrum (zero synthetic overtone ticks or fake click rectangles!)
      if (spec && spec.bins) {
        const { bins, nyquist } = spec;
        const binCount = bins.length;
        const dfRow = (MAX_FREQ_HZ - MIN_FREQ_HZ) / Math.max(1, this.bufH - 1);
        const rowThick = 1.35 * u;
        for (let py = 0; py < this.bufH; py++) {
          const norm = 1.0 - py / (this.bufH - 1);
          const fCenter = MIN_FREQ_HZ + norm * (MAX_FREQ_HZ - MIN_FREQ_HZ);
          const fLo = Math.max(MIN_FREQ_HZ, fCenter - 0.52 * dfRow);
          const fHi = Math.min(MAX_FREQ_HZ, fCenter + 0.52 * dfRow);
          const binLo = clamp(Math.floor((fLo / nyquist) * binCount), 0, binCount - 1);
          const binHi = clamp(Math.ceil((fHi / nyquist) * binCount), binLo, binCount - 1);
          let maxBin = 0;
          for (let b = binLo; b <= binHi; b++) {
            if (bins[b] > maxBin) maxBin = bins[b];
          }
          const mag = maxBin / 255.0;
          if (mag > 0.08) {
            const ink = Math.pow((mag - 0.08) / 0.92, 1.18);
            octx.fillStyle = `rgba(68, 52, 36, ${clamp(ink * 0.84, 0, 0.88).toFixed(3)})`;
            octx.fillRect(this.bufW - scrollPx, py, scrollPx, rowThick);
          }
        }
      }

      // Fine cycle-counted Left/Right voice f0 traces gated strictly on true limit-cycle oscillation
      const leftActive = telem.activeL !== undefined
        ? Boolean(telem.activeL)
        : (d.pSub.value > telem.ptpL && d.gapL.value > -0.01);
      const rightActive = telem.activeR !== undefined
        ? Boolean(telem.activeR)
        : (d.pSub.value > telem.ptpR && d.gapR.value > -0.01);

      const traceH = (isPortrait ? 1.65 : 1.5) * u;
      if (leftActive && telem.f0L >= MIN_FREQ_HZ && telem.f0L <= MAX_FREQ_HZ) {
        const yL = this._freqToY(telem.f0L, this.bufH);
        const alphaL = clamp(0.48 + (telem.rmsL || 0) * 0.42, 0.48, 0.84);
        octx.fillStyle = `rgba(28, 104, 134, ${alphaL.toFixed(3)})`;
        octx.fillRect(this.bufW - scrollPx, yL - traceH * 0.5, scrollPx, traceH);
      }
      if (rightActive && telem.f0R >= MIN_FREQ_HZ && telem.f0R <= MAX_FREQ_HZ) {
        const yR = this._freqToY(telem.f0R, this.bufH);
        const alphaR = clamp(0.48 + (telem.rmsR || 0) * 0.42, 0.48, 0.84);
        octx.fillStyle = `rgba(184, 62, 38, ${alphaR.toFixed(3)})`;
        octx.fillRect(this.bufW - scrollPx, yR - traceH * 0.5, scrollPx, traceH);
      }
    }

    // 2. Render Double-Ruled Archival Watercolor Paper Sonogram Frame
    ctx.save();
    ctx.fillStyle = 'rgba(251, 246, 235, 0.68)';
    ctx.fillRect(stripX, stripY, stripW, stripH);

    // Outer & inner copperplate hairline borders
    const inset = 2.5 * u;
    ctx.strokeStyle = 'rgba(104, 84, 62, 0.42)';
    ctx.lineWidth = 0.82 * u;
    ctx.strokeRect(stripX, stripY, stripW, stripH);
    ctx.strokeStyle = 'rgba(104, 84, 62, 0.20)';
    ctx.lineWidth = 0.52 * u;
    ctx.strokeRect(stripX + inset, stripY + inset, stripW - inset * 2, stripH - inset * 2);

    // Horizontal kilohertz hairlines (2, 4, 6 kHz across 0.15 - 8.0 kHz)
    for (const kHz of [2, 4, 6]) {
      const gy = stripY + this._freqToY(kHz * 1000, stripH);
      ctx.strokeStyle = 'rgba(108, 88, 66, 0.14)';
      ctx.lineWidth = 0.7 * u;
      ctx.beginPath();
      ctx.moveTo(stripX + 4 * u, gy);
      ctx.lineTo(stripX + stripW - 4 * u, gy);
      ctx.stroke();

      if (!isPortrait) {
        // Tiny copperplate tick mark + exterior label on wide screens
        ctx.strokeStyle = 'rgba(104, 84, 62, 0.52)';
        ctx.beginPath();
        ctx.moveTo(stripX - 3.5, gy);
        ctx.lineTo(stripX, gy);
        ctx.stroke();

        ctx.font = `italic 10.5px ${SERIF_STACK}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(84, 68, 50, 0.78)';
        ctx.fillText(`${kHz} kHz`, stripX - 6, gy + 3.5);
      }
    }

    // Subtle 1.0-second copperplate time-calibration hairlines along bottom rule (zero text clutter)
    ctx.strokeStyle = 'rgba(104, 84, 62, 0.34)';
    ctx.lineWidth = 0.65 * u;
    for (let tx = stripX + stripW - this._tickOffsetPx; tx > stripX + 4 * u; tx -= pxPerSec) {
      ctx.beginPath();
      ctx.moveTo(tx, stripY + stripH - inset);
      ctx.lineTo(tx, stripY + stripH);
      ctx.stroke();
    }

    // Clip spectrogram cleanly inside inner rule
    const clipPad = Math.max(2, Math.round(2 * u));
    ctx.save();
    ctx.beginPath();
    ctx.rect(stripX + clipPad, stripY + clipPad, stripW - clipPad * 2, stripH - clipPad * 2);
    ctx.clip();
    ctx.drawImage(this.offCanvas, stripX, stripY);
    ctx.restore();

    // In 9:16 portrait mode, tuck crisp kHz ticks & labels inside the left rule to respect video safe margins
    if (isPortrait) {
      ctx.save();
      ctx.font = `italic ${(9.2 * u).toFixed(1)}px ${SERIF_STACK}`;
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(251, 246, 235, 0.95)';
      ctx.shadowBlur = 3.5 * u;
      for (const kHz of [2, 4, 6]) {
        const gy = stripY + this._freqToY(kHz * 1000, stripH);
        ctx.fillStyle = 'rgba(84, 68, 50, 0.80)';
        ctx.fillText(`${kHz}k`, stripX + 5.5 * u, gy + 3.0 * u);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
