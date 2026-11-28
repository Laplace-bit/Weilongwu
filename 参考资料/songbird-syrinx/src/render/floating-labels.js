/**
 * @fileoverview Archival Copperplate Callouts — Plain-English Floating Labels
 *
 * Renders 8 clear, accessible, zero-Latin callouts tethered to the moving vocal anatomy
 * in classic 19th-century natural-history plate typography (engraved serif titles, italic
 * English status notes, hairline sepia leader lines, and open-circle copperplate nibs).
 *
 * Includes phrase-level envelope holds, Schmitt-trigger hysteresis, and minimum dwell-time
 * stabilization so auto-play trills and syllable gates never cause jarring rapid text flicker.
 */

import { clamp, lerp } from '../physics/anatomy-model.js';

const SERIF_STACK = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';

function fmtFreq(hz) {
  if (!Number.isFinite(hz) || hz <= 40) return '—';
  if (hz < 200) {
    return `${Math.round(hz)} Hz`;
  }
  if (hz < 950) {
    return `${Math.round(hz / 10) * 10} Hz`;
  }
  return `${(Math.round(hz / 100) / 10).toFixed(1)} kHz`;
}

const CALLOUT_SPECS = [
  // RIGHT MARGIN (5 essential parts, top -> bottom)
  {
    id: 'beak',
    relatedIds: ['beak'],
    side: 'right',
    title: 'Beak',
    portraitTitle: 'Beak',
    category: (_d, _t, env, prevCat) => {
      const g = env.beakMm;
      if (prevCat === 'wide' && g > 8.2) return 'wide';
      if (prevCat === 'clamped' && g < 1.7) return 'clamped';
      if (prevCat === 'narrow' && g >= 1.5 && g < 3.8) return 'narrow';
      if (g > 9.4) return 'wide';
      if (g < 1.5) return 'clamped';
      if (g < 2.9) return 'narrow';
      return 'mid';
    },
    format: (cat, _env, autoPlay) => {
      if (cat === 'wide') return 'Wide open · Brighter tone';
      if (cat === 'clamped') return 'Clamped shut · Muffled hum';
      if (cat === 'narrow') return 'Nearly closed · Pure whistle';
      return autoPlay ? 'Shaping song tone' : 'Drag to open or close';
    },
    portraitFormat: (cat, _env, autoPlay) => {
      if (cat === 'wide') return 'Wide · Bright tone';
      if (cat === 'clamped') return 'Shut · Muffled hum';
      if (cat === 'narrow') return 'Narrow · Pure whistle';
      return autoPlay ? 'Shaping song tone' : 'Drag to open/close';
    },
  },
  {
    id: 'oec',
    relatedIds: ['oec'],
    side: 'right',
    title: 'Throat Chamber',
    portraitTitle: 'Throat Chamber',
    category: (_d, _t, env, prevCat) => {
      const v = env.oecMl;
      if (prevCat === 'puffed' && v > 0.46) return 'puffed';
      if (prevCat === 'tight' && v < 0.22) return 'tight';
      if (v > 0.56) return 'puffed';
      if (v < 0.16) return 'tight';
      return 'rest';
    },
    format: (cat, _env, autoPlay) => {
      if (cat === 'puffed') return 'Expanded · Warm resonance';
      if (cat === 'tight') return 'Compressed · Crisp & bright';
      return autoPlay ? 'Tuning vocal warmth' : 'Drag to shape vocal warmth';
    },
    portraitFormat: (cat, _env, autoPlay) => {
      if (cat === 'puffed') return 'Expanded · Warm';
      if (cat === 'tight') return 'Tight · Crisp tone';
      return autoPlay ? 'Tuning warmth' : 'Drag for warmth';
    },
  },
  {
    id: 'trachea',
    relatedIds: ['trachea'],
    side: 'right',
    title: 'Windpipe',
    portraitTitle: 'Windpipe',
    category: () => 'pipe',
    format: (_cat, env, autoPlay) =>
      autoPlay
        ? `Resonant tube (${env.dispTrachMm} × ${env.dispBoreMm} mm)`
        : `Stretch or widen (${env.dispTrachMm} × ${env.dispBoreMm} mm)`,
    portraitFormat: (_cat, env, autoPlay) =>
      autoPlay
        ? `Tube (${env.dispTrachMm} × ${env.dispBoreMm} mm)`
        : `Stretch (${env.dispTrachMm} × ${env.dispBoreMm} mm)`,
  },
  {
    id: 'labiaR',
    relatedIds: ['labiaR', 'muscleVSR', 'bronchusR', 'mtmR'],
    side: 'right',
    title: 'Right Voice (High Notes)',
    portraitTitle: 'Right Voice (High)',
    category: (d, _t, env) => {
      if (env.singHoldR > 0) return 'singing';
      if (d.gapR.value <= -0.012) return 'closed';
      return 'idle';
    },
    format: (cat, env, autoPlay) => {
      if (cat === 'singing') return `Singing · ${fmtFreq(env.dispF0R)}`;
      if (cat === 'closed') return autoPlay ? 'Resting · Muted' : 'Closed · Muted';
      return 'Pull to bend high notes';
    },
    portraitFormat: (cat, env, autoPlay) => {
      if (cat === 'singing') return `Singing · ${fmtFreq(env.dispF0R)}`;
      if (cat === 'closed') return autoPlay ? 'Resting · Muted' : 'Closed · Muted';
      return 'Pull to bend notes';
    },
  },
  {
    id: 'airSacCaudal',
    relatedIds: ['airSacCaudal'],
    side: 'right',
    pinned: true,
    fixedNorm: { nx: 0.114, ny: 0.268 },
    title: 'Belly Air Sacs (Breath)',
    portraitTitle: 'Belly Air Sacs',
    category: (_d, _t, env) => (env.breathHold > 0 ? 'blowing' : 'idle'),
    format: (cat, _env, autoPlay) => {
      if (cat === 'blowing') return 'Blowing air to sing';
      return autoPlay ? 'Taking a quick breath' : 'Squeeze up to blow air';
    },
    portraitFormat: (cat, _env, autoPlay) => {
      if (cat === 'blowing') return 'Blowing air to sing';
      return autoPlay ? 'Quick mini-breath' : 'Squeeze up to blow';
    },
  },

  // LEFT MARGIN (3 essential parts, positioned cleanly below the Specimen Folio slips)
  {
    id: 'pessulus',
    relatedIds: ['pessulus'],
    side: 'left',
    title: 'Center Splitter',
    portraitTitle: 'Center Splitter',
    category: () => 'static',
    format: () => 'Anchors & merges the two voices',
    portraitFormat: () => 'Merges both voices',
  },
  {
    id: 'labiaL',
    relatedIds: ['labiaL', 'muscleVSL', 'bronchusL', 'mtmL'],
    side: 'left',
    title: 'Left Voice (Low Notes)',
    portraitTitle: 'Left Voice (Low)',
    category: (d, _t, env) => {
      if (env.singHoldL > 0) return 'singing';
      if (d.gapL.value <= -0.012) return 'closed';
      return 'idle';
    },
    format: (cat, env, autoPlay) => {
      if (cat === 'singing') return `Singing · ${fmtFreq(env.dispF0L)}`;
      if (cat === 'closed') return autoPlay ? 'Resting · Muted' : 'Closed · Muted';
      return 'Pull to bend low notes';
    },
    portraitFormat: (cat, env, autoPlay) => {
      if (cat === 'singing') return `Singing · ${fmtFreq(env.dispF0L)}`;
      if (cat === 'closed') return autoPlay ? 'Resting · Muted' : 'Closed · Muted';
      return 'Pull to bend notes';
    },
  },
  {
    id: 'icasL',
    relatedIds: ['icasL', 'icasR'],
    side: 'left',
    title: 'Chest Air Cushion',
    portraitTitle: 'Chest Air Cushion',
    category: () => 'static',
    format: () => 'Surrounds syrinx · Aids clicks & tone',
    portraitFormat: () => 'Aids clicks & tone',
  },
];

export class FloatingLabelsRenderer {
  constructor(model) {
    this.model = model;
    this.state = new Map();
    this.statusState = new Map();
    this.hitBoxes = [];
    this._lastSpeciesIdx = -1;

    this.env = {
      singHoldL: 0,
      singHoldR: 0,
      breathHold: 0,
      smoothF0L: 1600,
      smoothF0R: 3000,
      beakMm: 4.5,
      oecMl: 0.35,
      smoothTrachMm: 38,
      smoothBoreMm: 2.7,
    };
  }

  _updateSmoothedTelemetry(safeDt, telem) {
    const d = this.model.dofs;
    const org = this.model.currentSpecies.organ;
    const env = this.env;
    const t = telem || {};

    // Reset holds cleanly when switching species
    if (this._lastSpeciesIdx !== this.model.activeSpeciesIndex) {
      this._lastSpeciesIdx = this.model.activeSpeciesIndex;
      this.statusState.clear();
      env.singHoldL = 0;
      env.singHoldR = 0;
      env.breathHold = 0;
      env.smoothTrachMm = d.tracheaLenMm.value;
      env.smoothBoreMm = (org.trachDiamMm || 2.65) * d.tracheaWidth.value;
    }

    const autoPlay = Boolean(this.model.driverPlaying) && this.model.activeGrabs.size === 0;
    const holdDur = autoPlay ? 1.25 : 0.16;

    const ptpL = t.ptpL ?? 0.48;
    const ptpR = t.ptpR ?? 0.52;
    const activeL = t.activeL !== undefined
      ? Boolean(t.activeL)
      : (d.gapL.value > -0.008 && d.pSub.value > ptpL && (t.f0L || 0) > 45);
    const activeR = t.activeR !== undefined
      ? Boolean(t.activeR)
      : (d.gapR.value > -0.008 && d.pSub.value > ptpR && (t.f0R || 0) > 45);
    const activeBreath = d.pSub.value >= Math.min(ptpL, ptpR);

    if (activeL) {
      if (env.singHoldL <= 0) {
        env.smoothF0L = t.f0L;
      } else {
        const rateF = 1.0 - Math.exp(-safeDt * (autoPlay ? 5.0 : 16.0));
        env.smoothF0L = lerp(env.smoothF0L, t.f0L, rateF);
      }
      env.singHoldL = holdDur;
    } else {
      env.singHoldL = Math.max(0, env.singHoldL - safeDt);
    }

    if (activeR) {
      if (env.singHoldR <= 0) {
        env.smoothF0R = t.f0R;
      } else {
        const rateF = 1.0 - Math.exp(-safeDt * (autoPlay ? 5.0 : 16.0));
        env.smoothF0R = lerp(env.smoothF0R, t.f0R, rateF);
      }
      env.singHoldR = holdDur;
    } else {
      env.singHoldR = Math.max(0, env.singHoldR - safeDt);
    }

    if (activeBreath) {
      env.breathHold = autoPlay ? 1.30 : 0.18;
    } else {
      env.breathHold = Math.max(0, env.breathHold - safeDt);
    }

    const rateSlow = 1.0 - Math.exp(-safeDt * (autoPlay ? 3.5 : 18.0));
    env.beakMm = lerp(env.beakMm, d.beakGapeMm.value, rateSlow);
    env.oecMl = lerp(env.oecMl, d.oecVolMl.value, rateSlow);
    env.smoothTrachMm = lerp(env.smoothTrachMm, d.tracheaLenMm.value, rateSlow);
    env.smoothBoreMm = lerp(env.smoothBoreMm, (org.trachDiamMm || 2.65) * d.tracheaWidth.value, rateSlow);
  }

  _getStabilizedStatus(spec, safeDt, telem, isGrabbed, isPortrait = false) {
    const d = this.model.dofs;
    const autoPlay = Boolean(this.model.driverPlaying) && !isGrabbed;
    const fmtFn = isPortrait && spec.portraitFormat ? spec.portraitFormat : spec.format;
    const snapEnv = {
      ...this.env,
      dispF0L: this.env.smoothF0L,
      dispF0R: this.env.smoothF0R,
      dispTrachMm: Math.round(this.env.smoothTrachMm),
      dispBoreMm: (Math.round(this.env.smoothBoreMm * 10) / 10).toFixed(1),
    };
    let st = this.statusState.get(spec.id);

    if (!st) {
      const initCat = spec.category(d, telem || {}, snapEnv, null);
      const initText = fmtFn(initCat, snapEnv, autoPlay);
      st = {
        cat: initCat,
        pendingCat: initCat,
        pendingHold: 0,
        dwell: 99,
        textDwell: 99,
        text: initText,
      };
      this.statusState.set(spec.id, st);
      return st.text;
    }

    st.dwell += safeDt;
    st.textDwell += safeDt;
    const nextCat = spec.category(d, telem || {}, snapEnv, st.cat);

    if (isGrabbed) {
      // Immediate tactile responsiveness while user drags this organ
      st.cat = nextCat;
      st.pendingCat = nextCat;
      st.pendingHold = 0;
      if (st.textDwell >= 0.06 || nextCat !== st.cat) {
        st.text = fmtFn(st.cat, snapEnv, false);
        st.textDwell = 0;
      }
      return st.text;
    }

    const minDwell = autoPlay ? 1.05 : 0.24;
    const confirmHold = autoPlay ? 0.25 : 0.05;
    // Allow responsive onset into 'singing' / 'blowing' when starting a song phrase after rest
    const fastAttack =
      (nextCat === 'singing' || nextCat === 'blowing') && st.dwell >= 0.70;

    let catChanged = false;
    if (nextCat !== st.cat) {
      if (st.pendingCat === nextCat) {
        st.pendingHold += safeDt;
      } else {
        st.pendingCat = nextCat;
        st.pendingHold = safeDt;
      }

      if (
        (st.dwell >= minDwell && st.pendingHold >= confirmHold) ||
        (fastAttack && st.pendingHold >= 0.06)
      ) {
        st.cat = nextCat;
        st.dwell = 0;
        st.pendingHold = 0;
        catChanged = true;
      }
    } else {
      st.pendingCat = st.cat;
      st.pendingHold = 0;
    }

    const minTextRefresh = autoPlay ? 0.72 : 0.10;
    if (catChanged || st.textDwell >= minTextRefresh) {
      const candidate = fmtFn(st.cat, snapEnv, autoPlay);
      if (candidate !== st.text) {
        st.text = candidate;
        st.textDwell = 0;
      } else if (catChanged) {
        st.textDwell = 0;
      }
    }

    return st.text;
  }

  render(ctx, dt, audioTelemetry) {
    const {
      width,
      height,
      cx,
      scale,
      isPortrait = false,
      uiScale = 1,
      safeSide = 24,
      selectorY = 64,
      selectorH = 26,
      kymoY = height - 130,
      kymoYNatural = kymoY,
    } = this.model.layout;

    if (!isPortrait && width < 660) {
      this.hitBoxes = [];
      return;
    }
    if (isPortrait && width < 280) {
      this.hitBoxes = [];
      return;
    }

    if (this._lastIsPortrait !== isPortrait) {
      this._lastIsPortrait = isPortrait;
      this.statusState.clear();
      this.state.clear();
    }

    const u = isPortrait ? uiScale : 1;
    const isSynth = Boolean(this.model.currentSpecies?.isSynthBird);
    const compact = !isPortrait && (width < 980 || (isSynth && width < 1360));
    const safeDt = clamp(dt, 0.001, 0.05);
    const follow = 1.0 - Math.exp(-safeDt * 14.0);

    this._updateSmoothedTelemetry(safeDt, audioTelemetry);

    let leftColX;
    let rightColX;
    let minSpacing;
    let leftBottomLimit;
    let rightBottomLimit;
    let leftTopLimit;
    let rightTopLimit;

    if (isPortrait) {
      leftColX = clamp(
        cx - scale * 0.375,
        safeSide + Math.round(64 * u),
        cx - Math.round(76 * u)
      );
      rightColX = clamp(
        cx + scale * 0.36,
        cx + Math.round(72 * u),
        width - safeSide - Math.round(68 * u)
      );
      minSpacing = Math.round(19.5 * u);
      // Keep left callouts cleanly above the diagonal wing/tail slope on the taller portrait bird
      leftBottomLimit = this.model.layout.cy - Math.round(scale * 0.13);
      rightBottomLimit = isSynth ? kymoY - Math.round(98 * u) : kymoYNatural - Math.round(18 * u);
      leftTopLimit = selectorY + selectorH + Math.round(18 * u);
      rightTopLimit = selectorY + selectorH + Math.round(18 * u);
    } else {
      const sidebarTotalW = isSynth ? clamp(width * 0.205, 256, 286) + 18 : 0;
      const rightReserve = isSynth ? (compact ? 196 : 234) : 210;
      const minRightOffset = isSynth ? Math.max(122, scale * 0.42) : 195;

      leftColX = clamp(cx - scale * 0.90, 268, cx - 205);
      const maxRightColX = width - sidebarTotalW - rightReserve;
      rightColX = clamp(
        cx + scale * (isSynth ? 0.48 : 0.88),
        Math.min(cx + minRightOffset, maxRightColX),
        maxRightColX
      );

      minSpacing = compact ? 50 : 56;
      leftBottomLimit = height - 216;
      rightBottomLimit = height - 216;
      leftTopLimit = leftColX < 485 ? 374 : 64;
      rightTopLimit = 54;
    }

    const leftGroup = [];
    const rightGroup = [];

    for (const spec of CALLOUT_SPECS) {
      const anchorNorm = this.model.getPartAnchorNorm(spec.id);
      const anchorPt = this.model.toScreen(anchorNorm.nx, anchorNorm.ny);

      let st = this.state.get(spec.id);
      if (spec.pinned && spec.fixedNorm) {
        const fixedPt = this.model.toScreen(spec.fixedNorm.nx, spec.fixedNorm.ny);
        const lockedX =
          spec.side === 'left'
            ? leftColX + (fixedPt.x - cx) * (isPortrait ? 0.02 : 0.05)
            : rightColX + (fixedPt.x - cx) * (isPortrait ? 0.02 : 0.05);
        const lockedY = clamp(
          fixedPt.y,
          (spec.side === 'left' ? leftTopLimit : rightTopLimit) + 4 * minSpacing,
          spec.side === 'left' ? leftBottomLimit : rightBottomLimit
        );
        if (!st) {
          st = { x: lockedX, y: lockedY };
        } else {
          st.x = lerp(st.x, lockedX, follow);
          st.y = lockedY;
        }
        this.state.set(spec.id, st);
      } else {
        const desiredX =
          isPortrait && spec.id === 'beak'
            ? clamp(
                Math.max(rightColX, anchorPt.x + 16 * u),
                rightColX,
                width - safeSide - 26 * u
              )
            : spec.side === 'left'
              ? leftColX + (anchorPt.x - cx) * (isPortrait ? 0.02 : 0.05)
              : rightColX + (anchorPt.x - cx) * (isPortrait ? 0.02 : 0.05);
        const desiredY =
          isPortrait && spec.id === 'beak'
            ? anchorPt.y - 12 * u
            : isPortrait && spec.side === 'left'
              ? anchorPt.y - 28 * u
              : anchorPt.y;

        if (!st) {
          st = { x: desiredX, y: desiredY };
          this.state.set(spec.id, st);
        } else {
          st.x = lerp(st.x, desiredX, follow);
          st.y = lerp(st.y, desiredY, follow);
        }
      }

      const item = { spec, anchorPt, st };
      if (spec.side === 'left') leftGroup.push(item);
      else rightGroup.push(item);
    }

    this._resolveVerticalSpacing(leftGroup, leftTopLimit, leftBottomLimit, minSpacing);
    this._resolveVerticalSpacing(rightGroup, rightTopLimit, rightBottomLimit, minSpacing);

    this.hitBoxes = [];

    ctx.save();
    for (const item of [...rightGroup, ...leftGroup]) {
      const { spec, anchorPt, st } = item;
      const isLeft = spec.side === 'left';

      let active = spec.relatedIds.includes(this.model.hoveredPart);
      let grabbed = false;
      for (const g of this.model.activeGrabs.values()) {
        if (spec.relatedIds.includes(g.partId)) {
          active = true;
          grabbed = true;
        }
      }

      // Fine copperplate dotted leader line with monotonic non-contorting shelf (no terminal '|' tick)
      const shelfLen = (isPortrait ? 6.5 : 16) * u;
      const linePad = (isPortrait ? 3.2 : 5.5) * u;
      const lineEndX = isLeft ? st.x + linePad : st.x - linePad;
      const availDx = isLeft ? anchorPt.x - lineEndX : lineEndX - anchorPt.x;
      const hasShelf = availDx > 3.5 * u;
      const effShelf = hasShelf ? Math.min(shelfLen, availDx * 0.42) : 0;
      const elbowX = isLeft ? lineEndX + effShelf : lineEndX - effShelf;

      ctx.strokeStyle = active
        ? '#A83B24'
        : isPortrait
          ? 'rgba(84, 68, 50, 0.36)'
          : 'rgba(84, 68, 50, 0.44)';
      ctx.lineWidth = (active ? (isPortrait ? 0.90 : 1.20) : (isPortrait ? 0.44 : 0.80)) * u;
      ctx.setLineDash(isPortrait ? [1.5 * u, 1.7 * u] : [2.3 * u, 2.0 * u]);
      ctx.beginPath();
      ctx.moveTo(anchorPt.x, anchorPt.y);
      if (hasShelf) {
        ctx.lineTo(elbowX, st.y);
      }
      ctx.lineTo(lineEndX, st.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Open-circle anatomical copperplate nib on the moving tissue
      ctx.fillStyle = active ? '#C84B31' : '#FAF5E8';
      ctx.strokeStyle = active ? '#7D2614' : isPortrait ? 'rgba(78, 61, 44, 0.72)' : '#4E3D2C';
      ctx.lineWidth = (isPortrait ? 0.65 : 1.1) * u;
      ctx.beginPath();
      ctx.arc(
        anchorPt.x,
        anchorPt.y,
        (active ? (isPortrait ? 2.2 : 3.5) : (isPortrait ? 1.35 : 2.3)) * u,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();

      // Engraved Serif Title + Stabilized Italic Plain-English Description (with soft rag-paper halo for legibility)
      ctx.save();
      ctx.shadowColor = 'rgba(247, 241, 229, 0.94)';
      ctx.shadowBlur = 4.0 * u;
      ctx.textAlign = isLeft ? 'right' : 'left';
      const textX = st.x;

      const titleStr = isPortrait && spec.portraitTitle ? spec.portraitTitle : spec.title;
      const titlePx = isPortrait ? (8.4 * u).toFixed(1) : compact ? '12.5' : '13.5';
      const subPx = compact ? '11' : '12';
      const maxTextW = isPortrait
        ? Math.max(46 * u, isLeft ? textX - safeSide * 0.55 : width - safeSide * 0.55 - textX)
        : undefined;

      ctx.font = `600 ${titlePx}px ${SERIF_STACK}`;
      ctx.fillStyle = active ? '#9A321C' : '#261E16';
      if (isPortrait) {
        // Single-line organ label on mobile (no subtext underneath), centered on leader tick
        ctx.textBaseline = 'middle';
        ctx.fillText(titleStr, textX, st.y + 0.5 * u, maxTextW);
        ctx.textBaseline = 'alphabetic';
      } else {
        ctx.fillText(titleStr, textX, st.y - 3);
        const subStr = this._getStabilizedStatus(spec, safeDt, audioTelemetry, grabbed, false);
        ctx.font = `italic ${subPx}px ${SERIF_STACK}`;
        ctx.fillStyle = active ? '#AE432A' : '#5E4E3D';
        ctx.fillText(subStr, textX, st.y + 13);
      }
      ctx.restore();

      const boxW = isPortrait ? (maxTextW || 74 * u) : compact ? 160 : 200;
      const boxH = isPortrait ? 16 * u : 34;
      this.hitBoxes.push({
        partId: spec.id,
        x: isLeft ? textX - boxW : textX - 4 * u,
        y: st.y - (isPortrait ? 8 * u : 18),
        w: boxW + 8 * u,
        h: boxH,
      });
    }
    ctx.restore();
  }

  _resolveVerticalSpacing(group, minY, maxY, minSpacing) {
    if (group.length === 0) return;

    const lastItem = group[group.length - 1];
    if (lastItem.spec.pinned) {
      if (group.length <= 1) return;
      this._resolveVerticalSpacing(
        group.slice(0, -1),
        minY,
        Math.min(maxY, lastItem.st.y - minSpacing),
        minSpacing
      );
      return;
    }

    for (let iter = 0; iter < 5; iter++) {
      group[0].st.y = Math.max(minY, group[0].st.y);
      for (let i = 1; i < group.length; i++) {
        const minAllowed = group[i - 1].st.y + minSpacing;
        if (group[i].st.y < minAllowed) {
          group[i].st.y = minAllowed;
        }
      }
      const last = group[group.length - 1];
      last.st.y = Math.min(maxY, last.st.y);
      for (let i = group.length - 2; i >= 0; i--) {
        const maxAllowed = group[i + 1].st.y - minSpacing;
        if (group[i].st.y > maxAllowed) {
          group[i].st.y = maxAllowed;
        }
      }
    }
  }
}
