/**
 * @fileoverview 19th-Century Chromolithograph & Hand-Colored Ornithological Plate Renderer
 *
 * Modeled directly after John Gerrard Keulemans, John Gould & H.C. Richter, John James Audubon
 * & Robert Havell, and 19th-century Meyers / Cuvier copperplate avian anatomy plates.
 *
 * Combines full-bleed laid cotton-rag paper, limestone lithographic crayon grain, wet-on-wet
 * watercolor washes, imbricated anatomical feather tracts (pterylae), multi-tiered folded wing
 * coverts and stepped primaries, feathered bill bases with open side-profile gape, asymmetrical
 * botanical boughs, and a recessed hand-tinted copperplate syringeal dissection cutaway.
 */

import { SPECIES_PRESETS } from '../driver/birdsong-presets.js';
import { clamp, lerp } from '../physics/anatomy-model.js';

const SERIF_STACK = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';

const PALETTE = {
  inkSepia: '#2A2018',
  inkSepiaMid: '#5A4938',
  inkSepiaSoft: 'rgba(62, 46, 32, 0.30)',
  inkEtch: 'rgba(46, 33, 22, 0.38)',
  vellumCenter: '#FCF8EE',
  vellumEdge: '#E8DBC2',
  ringLight: '#FAF3E4',
  ringShadow: '#D8C6A3',
  ringStroke: '#6B5540',
  cartilageWash: 'rgba(116, 158, 168, 0.34)',
  cartilageStroke: '#486C76',
  valveCore: '#C45342',
  valvePad: 'rgba(220, 114, 94, 0.76)',
  valveStroke: '#782C22',
  membraneStroke: '#A65432',
  cushionRest: 'rgba(132, 168, 176, 0.17)',
  cushionStroke: 'rgba(78, 114, 124, 0.44)',
  airSacRest: 'rgba(136, 172, 180, 0.22)',
  flowCalm: 'rgba(72, 116, 132, 0.42)',
  flowSinging: 'rgba(188, 82, 42, 0.66)',
  accentVermilion: '#B84228',
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHexRgb(hex) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
    return { r: 238, g: 228, b: 210 };
  }
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16) || 238,
    g: parseInt(full.slice(2, 4), 16) || 228,
    b: parseInt(full.slice(4, 6), 16) || 210,
  };
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = parseHexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function blendHex(hexA, hexB, t, alpha = 1.0) {
  const a = parseHexRgb(hexA);
  const b = parseHexRgb(hexB);
  const u = clamp(t, 0, 1);
  const nr = Math.round(lerp(a.r, b.r, u));
  const ng = Math.round(lerp(a.g, b.g, u));
  const nb = Math.round(lerp(a.b, b.b, u));
  return alpha >= 0.999 ? `rgb(${nr}, ${ng}, ${nb})` : `rgba(${nr}, ${ng}, ${nb}, ${alpha})`;
}

/**
 * Shifts a pigment hex toward warm sunlit gouache (+amt) or chromatic watercolor shadow (-amt),
 * preserving hue purity (gamboge/raw-sienna for yellows, alizarin carmine for reds, warm buff
 * for creams, and burnt sepia-umber for earth/slate) just like 19th-century hand-colored plates.
 */
function tonePigment(hex, amt, alpha = 1.0) {
  const { r, g, b } = parseHexRgb(hex);
  let nr, ng, nb;
  if (amt >= 0) {
    nr = Math.round(lerp(r, 255, amt * 0.85));
    ng = Math.round(lerp(g, 251, amt * 0.82));
    nb = Math.round(lerp(b, 236, amt * 0.72));
  } else {
    const k = clamp(-amt, 0, 1);
    let sr = 44, sg = 30, sb = 20;
    if (r > 195 && g > 165 && b < 155) {
      // Luminous yellows (Canary) shade toward warm gamboge / golden raw-sienna, never grey soot
      sr = 158; sg = 118; sb = 20;
    } else if (r > 175 && r > g * 1.65) {
      // Vermilion / scarlet (Cardinal) shades toward rich deep alizarin carmine / madder
      sr = 98; sg = 14; sb = 16;
    } else if (r > 218 && g > 210 && b > 190) {
      // Ivory / pearl-white underparts shade toward warm parchment buff, never dark charcoal
      sr = 164; sg = 144; sb = 118;
    }
    nr = Math.round(lerp(r, sr, k * 0.82));
    ng = Math.round(lerp(g, sg, k * 0.84));
    nb = Math.round(lerp(b, sb, k * 0.85));
  }
  return alpha >= 0.999 ? `rgb(${nr}, ${ng}, ${nb})` : `rgba(${nr}, ${ng}, ${nb}, ${alpha})`;
}

export class SyrinxAnatomicalRenderer {
  constructor(model) {
    this.model = model;

    // Offscreen cached rag-paper & atmospheric wash canvas
    this._paperCanvas = document.createElement('canvas');
    this._paperW = 0;
    this._paperH = 0;
    this._paperSpecies = -1;

    // Reusable 160x160 limestone lithographic crayon grain pattern
    this._grainCanvas = null;
    this._grainPattern = null;

    // Precomputed anatomical feather shingles, soft contour wisps, & cutaway rim feathers
    this._featherShingles = this._generateFeatherShingles();
    this._cutawayRimFeathers = this._generateCutawayRimFeathers();

    // Fine ink airflow filaments rising continuously from belly air sacs -> syrinx -> windpipe -> open beak
    this.particles = [];
    for (let i = 0; i < 72; i++) {
      this.particles.push({
        side: i % 2 === 0 ? 'L' : 'R',
        s: (i / 72) * 1.28,
        lane: (Math.random() - 0.5) * 1.30,
        size: 0.80 + Math.random() * 0.80,
        curSpeed: 0.0,
      });
    }

    // Rising bilateral acoustic voice wavelets traveling up the windpipe & out of the open beak
    this.voicePulses = [];
    this._pulseCooldownL = 0.0;
    this._pulseCooldownR = 0.04;

    // Concentric engraved acoustic wavefront arcs radiating from the singing bill
    this.soundWaves = [];
    this._waveCooldown = 0.0;

    // Hit-testable regions for Specimen Index Slips & Auto-Sing Cartouche
    this.speciesHitNodes = [];
    this.autoSingButtonHit = null;
  }

  _ensureLithoGrain(ctx) {
    if (this._grainPattern) return this._grainPattern;
    const sz = 180;
    const gc = document.createElement('canvas');
    gc.width = sz;
    gc.height = sz;
    const gctx = gc.getContext('2d');
    const rng = mulberry32(18740912);

    // Cold-press Whatman watercolor paper dimples (pigment granulation settling into paper valleys)
    for (let i = 0; i < 2600; i++) {
      const x = rng() * sz;
      const y = rng() * sz;
      const r = 0.55 + rng() * 1.35;
      const dark = rng() > 0.44;
      gctx.fillStyle = dark
        ? `rgba(54, 38, 22, ${(0.022 + rng() * 0.044).toFixed(3)})`
        : `rgba(255, 252, 244, ${(0.032 + rng() * 0.058).toFixed(3)})`;
      gctx.beginPath();
      gctx.arc(x, y, r, 0, Math.PI * 2);
      gctx.fill();
    }

    // Delicate dry-brush sable & flax paper tooth whispers
    gctx.lineWidth = 0.55;
    for (let i = 0; i < 360; i++) {
      const x = rng() * sz;
      const y = rng() * sz;
      const len = 2.2 + rng() * 5.0;
      const ang = -0.58 + (rng() - 0.5) * 0.48;
      gctx.strokeStyle = `rgba(60, 42, 26, ${(0.018 + rng() * 0.032).toFixed(3)})`;
      gctx.beginPath();
      gctx.moveTo(x, y);
      gctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      gctx.stroke();
    }

    this._grainCanvas = gc;
    this._grainPattern = ctx.createPattern(gc, 'repeat');
    return this._grainPattern;
  }

  /**
   * Paints an organic multi-lobed wet-on-wet watercolor glaze puddle with natural capillary
   * pigment pooling ("tea-stain / watercolor bloom" rim) in subtractive multiply blending.
   */
  _drawWatercolorPuddle(pctx, cx, cy, rx, ry, rot, hexCol, alpha, edgeBloom = 0.05, seed = 101) {
    const rng = mulberry32(seed);
    const lobes = 18;
    const pts = [];
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const wobble = 0.86 + 0.24 * Math.sin(a * 3 + rng() * 2.2) + (rng() - 0.5) * 0.12;
      pts.push({
        x: Math.cos(a) * rx * wobble,
        y: Math.sin(a) * ry * wobble,
      });
    }

    pctx.save();
    pctx.translate(cx, cy);
    pctx.rotate(rot);
    pctx.globalCompositeOperation = 'multiply';

    pctx.beginPath();
    for (let i = 0; i < lobes; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % lobes];
      const mx = 0.5 * (p0.x + p1.x);
      const my = 0.5 * (p0.y + p1.y);
      if (i === 0) pctx.moveTo(mx, my);
      else pctx.quadraticCurveTo(p0.x, p0.y, mx, my);
    }
    pctx.closePath();

    const maxR = Math.max(rx, ry) * 1.08;
    const g = pctx.createRadialGradient(-rx * 0.12, -ry * 0.10, maxR * 0.06, 0, 0, maxR);
    g.addColorStop(0, hexToRgba(hexCol, alpha * 0.72));
    g.addColorStop(0.68, hexToRgba(hexCol, alpha));
    g.addColorStop(0.91, tonePigment(hexCol, -0.14, alpha + edgeBloom));
    g.addColorStop(1, hexToRgba(hexCol, 0));
    pctx.fillStyle = g;
    pctx.fill();

    if (edgeBloom > 0.015) {
      pctx.strokeStyle = tonePigment(hexCol, -0.22, edgeBloom * 0.85);
      pctx.lineWidth = 0.75;
      pctx.stroke();
    }
    pctx.restore();
  }

  /**
   * Builds structured imbricated feather tracts (pterylae) tailored to the sleek, slender
   * passerine silhouette:
   *  - Crown & Nape rows (relative to headCx, headCy)
   *  - Dorsal Mantle & Scapular rows
   *  - Trim Pectoral (Right Breast) contour rows
   *  - Taut Flank & Undertail Covert rows
   */
  _generateFeatherShingles() {
    const rng = mulberry32(18690315);
    const items = [];

    // 1. Imbricated Crown, Occiput & Upper Nape Featherlet Rows (relative to headCx, headCy)
    for (let row = 0; row < 5; row++) {
      const v = row / 4;
      const count = 8 + row * 2;
      for (let k = 0; k < count; k++) {
        const u = k / (count - 1);
        const dxOff = lerp(0.072 - v * 0.025, -0.138 - v * 0.030, u) + (rng() - 0.5) * 0.008;
        const archTop = -0.126 + 0.52 * Math.pow(dxOff + 0.018, 2);
        const dyOff = archTop + 0.012 + v * 0.032 + (rng() - 0.5) * 0.005;
        if (Math.hypot(dxOff - 0.026, dyOff + 0.056) < 0.042) continue;
        if (dxOff > -0.02 && dyOff > -0.020) continue;

        items.push({
          zone: 'crown',
          nx: dxOff,
          ny: dyOff,
          len: 0.026 + v * 0.006 + rng() * 0.005,
          wid: 0.0095 + v * 0.0025,
          ang: lerp(2.90, 2.36, u) + (rng() - 0.5) * 0.10,
          tone: lerp(0.10, -0.12, u) + (rng() - 0.5) * 0.06,
          alpha: 0.28 + rng() * 0.14,
        });
      }
    }

    // 2. Sleek Dorsal Mantle, Back & Rump Scalloped Contour Feathers
    for (let row = 0; row < 9; row++) {
      const uRow = row / 8;
      const nyBase = lerp(-0.27, 0.30, uRow);
      const xOuter = lerp(-0.04, -0.39, uRow);
      const xInner = nyBase < -0.10 ? 0.03 : -0.10;
      const cols = 4 + (row % 2);
      for (let c = 0; c < cols; c++) {
        const uc = (c + 0.35 * (row % 2)) / cols;
        const nx = lerp(xOuter + 0.015, xInner, uc) + (rng() - 0.5) * 0.010;
        const ny = nyBase + uc * 0.028 + (rng() - 0.5) * 0.008;
        items.push({
          zone: 'mantle',
          nx,
          ny,
          len: 0.044 + uRow * 0.010 + rng() * 0.008,
          wid: 0.017 + rng() * 0.004,
          ang: 2.30 + (rng() - 0.5) * 0.12,
          tone: lerp(0.06, -0.14, uc) + (rng() - 0.5) * 0.06,
          alpha: 0.26 + rng() * 0.14,
        });
      }
    }

    // 3. Trim Pectoral Breast Contour Feathers (outside sleek cutaway)
    for (let row = 0; row < 9; row++) {
      const uRow = row / 8;
      const nyBase = lerp(-0.22, 0.26, uRow);
      const innerX = nyBase < -0.06 ? 0.215 : lerp(0.225, 0.175, clamp((nyBase + 0.06) / 0.34, 0, 1));
      const outerX = lerp(0.275, 0.215, Math.pow(clamp((nyBase + 0.05) / 0.35, 0, 1), 1.2));
      if (outerX <= innerX + 0.010) continue;
      const cols = 3;
      for (let c = 0; c < cols; c++) {
        const uc = (c + 0.4 * (row % 2)) / cols;
        const nx = lerp(innerX, outerX - 0.008, uc) + (rng() - 0.5) * 0.006;
        const ny = nyBase + (rng() - 0.5) * 0.008;
        items.push({
          zone: 'breast',
          nx,
          ny,
          len: 0.038 + uRow * 0.008 + rng() * 0.006,
          wid: 0.015 + rng() * 0.003,
          ang: lerp(1.66, 1.42, uc) + (rng() - 0.5) * 0.10,
          tone: lerp(-0.04, 0.08, uc) + (rng() - 0.5) * 0.05,
          alpha: 0.22 + rng() * 0.12,
        });
      }
    }

    // 4. Taut Lower Flank & Undertail Covert Feathers (zero pot-belly!)
    for (let i = 0; i < 34; i++) {
      const u = i / 33;
      const nx = lerp(-0.36, 0.15, u) + (rng() - 0.5) * 0.012;
      const topY = nx > -0.08 ? 0.335 : lerp(0.24, 0.34, clamp((-0.08 - nx) / 0.28, 0, 1));
      const botY = lerp(0.425, 0.382, clamp((nx + 0.36) / 0.52, 0, 1));
      if (botY <= topY + 0.008) continue;
      const v = rng();
      const ny = lerp(topY, botY, v);
      items.push({
        zone: 'belly',
        nx,
        ny,
        len: 0.038 + rng() * 0.010,
        wid: 0.014 + rng() * 0.004,
        ang: lerp(2.38, 1.98, u) + (rng() - 0.5) * 0.12,
        tone: lerp(-0.04, -0.14, v) + (rng() - 0.5) * 0.05,
        alpha: 0.22 + rng() * 0.12,
      });
    }

    return items;
  }

  _generateCutawayRimFeathers() {
    const rng = mulberry32(18820504);
    const rim = [];
    for (const sgn of [-1, 1]) {
      const count = 22;
      for (let i = 0; i < count; i++) {
        rim.push({
          sgn,
          u: i / (count - 1),
          jitter: (rng() - 0.5) * 0.005,
          lenMul: 0.82 + rng() * 0.32,
          tone: (rng() - 0.45) * 0.12,
        });
      }
    }
    return rim;
  }

  /**
   * Paints an authentic 19th-century watercolor & sable-brush contour feather crescent
   * (delicate translucent glaze + hairline scalloped distal vane arc + 3 fine barbule whispers,
   * kept whisper-soft on luminous cream and yellow underparts so plumage stays clean and silky).
   */
  _drawFeatherShingle(ctx, x, y, lenPx, widPx, angle, baseHex, toneShift, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const { r, g, b } = parseHexRgb(baseHex);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const paleDamp = lum > 205 ? 0.52 : 1.0;

    const washCol = tonePigment(baseHex, toneShift * 0.58, alpha * 0.30 * paleDamp);
    const edgeInk = tonePigment(baseHex, -0.38, clamp(alpha * 0.52 * paleDamp, 0.06, 0.32));

    const fg = ctx.createLinearGradient(0, 0, lenPx, 0);
    fg.addColorStop(0, hexToRgba(baseHex, 0.0));
    fg.addColorStop(0.48, washCol);
    fg.addColorStop(1, hexToRgba(baseHex, alpha * 0.14 * paleDamp));

    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(lenPx * 0.50, -widPx * 0.86, lenPx, 0);
    ctx.quadraticCurveTo(lenPx * 0.50, widPx * 0.86, 0, 0);
    ctx.closePath();
    ctx.fill();

    // Fine sable-brush scalloped distal vane crescent (Audubon / Keulemans feather-tip line)
    ctx.strokeStyle = edgeInk;
    ctx.lineWidth = 0.46;
    ctx.beginPath();
    ctx.moveTo(lenPx * 0.50, -widPx * 0.48);
    ctx.quadraticCurveTo(lenPx * 1.02, 0, lenPx * 0.50, widPx * 0.48);
    ctx.stroke();

    // Three gossamer barbule whispers along the feather tip
    ctx.strokeStyle = tonePigment(baseHex, -0.30, clamp(alpha * 0.30 * paleDamp, 0.04, 0.20));
    ctx.lineWidth = 0.34;
    ctx.beginPath();
    ctx.moveTo(lenPx * 0.28, 0);
    ctx.lineTo(lenPx * 0.92, 0);
    ctx.moveTo(lenPx * 0.42, -widPx * 0.16);
    ctx.lineTo(lenPx * 0.84, -widPx * 0.30);
    ctx.moveTo(lenPx * 0.42, widPx * 0.16);
    ctx.lineTo(lenPx * 0.84, widPx * 0.30);
    ctx.stroke();

    ctx.restore();
  }

  render(ctx, dt, audioTelemetry) {
    const { width, height } = this.model.layout;
    const L = this.model.landmarks;
    const d = this.model.dofs;

    this._stepParticles(dt, audioTelemetry);

    // 1. Full-Bleed Cold-Press Whatman Watercolor Paper & Wet-on-Wet Botanical Wash
    this._drawBackgroundAndHeader(ctx, width, height);

    // 2. Botanical Bough, Sheathed Rectrices, Watercolor Passerine Plumage, & Multi-Tiered Wing
    this._drawBirdExteriorBack(ctx, L, audioTelemetry);

    // 3. Recessed Vellum Dissection Cavity Framed by Shingled Contour Feathers
    this._drawCutawayWindow(ctx, L);

    // Clip all internal dissected organs strictly inside the vellum cutaway window so extreme tactile
    // stretching/bending never pokes cartilage or mucosa outside the feathered dissection margin!
    ctx.save();
    this._buildCutawayCavityPath(ctx, L);
    ctx.clip();

    // 4. Translucent Pleural Chest Air Cushion (ICAS) & Paired Thoracic/Abdominal Air Sacs
    this._drawAirSacs(ctx, L, d, audioTelemetry);

    // 5. Dorsal Cervical-Esophageal & Supra-Glottal OEC Resonator (anatomically dorsal/behind upper trachea!)
    this._drawThroatPouch(ctx, L, audioTelemetry);

    // 6. Shaded Cylindrical Windpipe Lumen & Acoustic Standing-Wave Wash
    this._drawAirwayLumensAndWaves(ctx, L, audioTelemetry);

    // 7. Fine Ink Breath Streamlines (routed through parabronchial lungs; reverses on inspiratory mini-breaths!)
    this._drawAirflowStreamlines(ctx, L, d, audioTelemetry);

    // 8. Tendon-Anchored Striated Syringeal Musculature (reciprocal abductors/adductors & ventromedial vS)
    this._drawMusculature(ctx, L, d);

    // 9. Annular Tracheal Cartilage Rings, Cooperative Tympanum, Pessulus, & Foreshortened Transverse B2-B3 Rings
    this._drawSkeleton(ctx, L, d);

    // 10. Tethered Mucosal Labia, Ivory MVC Sesamoids, Superficial B1 Arch, & Elastic MTM
    this._drawVibratoryTissues(ctx, L, d, audioTelemetry);

    ctx.restore();

    // 11. Deep-Set Orbital Eye, Feathered Horn Bill (Open Side Gape), Acoustic Arcs, & Scuted Feet
    this._drawBirdFaceAndFeet(ctx, L, audioTelemetry);

    // 12. Hand-Ruled Watercolor Specimen Slips & Auto-Sing Cartouche (Top-Left)
    this._drawSongSelectorPanel(ctx, width, height);

    // 13. Copperplate Tactile Ripples & Drag Caliper Tether
    this._drawTactileOverlays(ctx);
  }

  _stepParticles(dt, telem) {
    const safeDt = clamp(dt, 0.001, 0.05);
    const d = this.model.dofs;
    const pSub = d.pSub.value;
    const openL = Math.max(0.0, d.gapL.value + 0.025);
    const openR = Math.max(0.0, d.gapR.value + 0.025);
    const rmsL = telem?.rmsL || 0;
    const rmsR = telem?.rmsR || 0;
    const totalRms = rmsL + rmsR;
    const smoothRate = 1.0 - Math.exp(-safeDt * 14.0);

    const activeL = Boolean(telem?.activeL) && rmsL > 0.055;
    const activeR = Boolean(telem?.activeR) && rmsR > 0.055;
    const activeAnyVoice = activeL || activeR;
    const anyLoopActive = Boolean(this.model.branchLoops?.L?.active || this.model.branchLoops?.R?.active);
    const synthPlaying = Boolean(
      this.model.currentSpecies.isSynthBird &&
        (this.model.synthEngine?.displayMidiL !== null || this.model.synthEngine?.displayMidiR !== null)
    );
    const isEngaged =
      Boolean(this.model.driverPlaying) ||
      this.model.activeGrabs.size > 0 ||
      anyLoopActive ||
      synthPlaying ||
      activeAnyVoice;

    if (!isEngaged) {
      // Quiet resting perch: bird breathes silently through its nares with closed bill — fade streamlines to 0!
      for (const p of this.particles) {
        p.curSpeed = lerp(p.curSpeed ?? 0.0, 0.0, smoothRate);
        p.s += safeDt * p.curSpeed * 0.58;
      }
    } else if (pSub < -0.14) {
      // Active inspiratory mini-breath (pSub < -0.14 kPa): reverse airflow inward from parted bill -> trachea -> lungs -> air sacs!
      const inMag = -0.82 * Math.sqrt(-pSub);
      const inSpdL = inMag * clamp(openL * 5.2, 0.15, 1.35);
      const inSpdR = inMag * clamp(openR * 5.2, 0.15, 1.35);
      for (const p of this.particles) {
        const targetSpd = p.side === 'L' ? inSpdL : inSpdR;
        p.curSpeed = lerp(p.curSpeed ?? targetSpd, targetSpd, smoothRate);
        p.s += safeDt * p.curSpeed * 0.58;
        if (p.s <= 0.02) {
          p.s = 1.06 + Math.random() * 0.12;
          p.lane = (Math.random() - 0.5) * 1.25;
        }
      }
    } else {
      const pDrive = Math.max(0.0, pSub - 0.18);
      const speedBaseL = 0.96 * Math.sqrt(pDrive) * clamp(openL * 6.8, 0.0, 1.45);
      const speedBaseR = 0.96 * Math.sqrt(pDrive) * clamp(openR * 6.8, 0.0, 1.45);
      const pipeCarrySpeed = 0.55 * (speedBaseL + speedBaseR) + 0.72 * (activeAnyVoice ? totalRms : 0.0);

      for (const p of this.particles) {
        const isL = p.side === 'L';
        const branchOpen = isL ? d.gapL.value > -0.012 : d.gapR.value > -0.012;
        let targetSpd = isL ? speedBaseL : speedBaseR;

        if (p.s < 0.34) {
          if (!branchOpen) targetSpd = 0.0;
        } else if (p.s < 0.48) {
          targetSpd = branchOpen ? Math.max(targetSpd * 1.75, pipeCarrySpeed) : pipeCarrySpeed * 0.85;
        } else {
          targetSpd = Math.max(targetSpd * 1.18, pipeCarrySpeed);
        }

        p.curSpeed = lerp(p.curSpeed ?? targetSpd, targetSpd, smoothRate);
        p.s += safeDt * p.curSpeed * 0.58;

        if (p.s >= 1.34) {
          p.s = Math.random() * 0.06;
          p.lane = (Math.random() - 0.5) * 1.30;
          p.curSpeed *= 0.35;
        }
      }
    }

    this._pulseCooldownL -= safeDt;
    if (activeL && d.gapL.value > -0.01 && this._pulseCooldownL <= 0) {
      this.voicePulses.push({
        side: 'L',
        s: 0.37,
        amp: clamp(rmsL * 0.95, 0.25, 1.0),
        freqNorm: clamp(((telem?.f0L || 1400) - 400) / 3600, 0, 1),
      });
      this._pulseCooldownL = lerp(0.16, 0.085, clamp(rmsL, 0, 1));
    }

    this._pulseCooldownR -= safeDt;
    if (activeR && d.gapR.value > -0.01 && this._pulseCooldownR <= 0) {
      this.voicePulses.push({
        side: 'R',
        s: 0.37,
        amp: clamp(rmsL * 0.1 + rmsR * 0.95, 0.25, 1.0),
        freqNorm: clamp(((telem?.f0R || 2600) - 800) / 4200, 0, 1),
      });
      this._pulseCooldownR = lerp(0.15, 0.078, clamp(rmsR, 0, 1));
    }

    for (let i = this.voicePulses.length - 1; i >= 0; i--) {
      const vp = this.voicePulses[i];
      const speed = vp.s < 0.96 ? 1.44 : 1.05;
      vp.s += safeDt * speed;
      if (vp.s > 1.36) {
        this.voicePulses.splice(i, 1);
      }
    }

    this._waveCooldown -= safeDt;
    if (activeAnyVoice && totalRms > 0.08 && this._waveCooldown <= 0) {
      this.soundWaves.push({
        age: 0.0,
        amp: clamp(totalRms * 0.85, 0.22, 1.0),
      });
      this._waveCooldown = lerp(0.24, 0.12, clamp(totalRms, 0, 1));
    }
    for (let i = this.soundWaves.length - 1; i >= 0; i--) {
      this.soundWaves[i].age += safeDt;
      if (this.soundWaves[i].age > 1.25) {
        this.soundWaves.splice(i, 1);
      }
    }
  }

  _ensurePaperCache(width, height) {
    const spIdx = this.model.activeSpeciesIndex;
    if (
      this._paperW === width &&
      this._paperH === height &&
      this._paperSpecies === spIdx
    ) {
      return;
    }
    this._paperW = width;
    this._paperH = height;
    this._paperSpecies = spIdx;
    this._paperCanvas.width = width;
    this._paperCanvas.height = height;

    const pctx = this._paperCanvas.getContext('2d');
    const rng = mulberry32(182700 + spIdx * 97);

    // 1. Warm J. Whatman cold-press cotton-rag watercolor sheet (pure luminous Audubon / Gould negative space!)
    const plateGrad = pctx.createRadialGradient(
      this.model.layout.cx, this.model.layout.cy - 24, Math.min(width, height) * 0.08,
      width * 0.50, height * 0.50, Math.max(width, height) * 0.84
    );
    plateGrad.addColorStop(0, '#FDFBF4');
    plateGrad.addColorStop(0.65, '#F8F2E4');
    plateGrad.addColorStop(1, '#ECE1CB');
    pctx.fillStyle = plateGrad;
    pctx.fillRect(0, 0, width, height);

    // 2. Whisper-soft continuous lithographic chalk ground solely beneath the botanical bough
    //    (keeps the sky around the bird's head, crest & breast completely pure and luminous like Plate 73 & Gould!)
    const { cx, cy, scale } = this.model.layout;
    pctx.save();
    pctx.globalCompositeOperation = 'multiply';
    pctx.translate(cx - scale * 0.04, cy + scale * 0.62);
    pctx.scale(1.0, 0.34);
    const groundR = scale * 0.96;
    const boughAtmos = pctx.createRadialGradient(0, 0, scale * 0.05, 0, 0, groundR);
    boughAtmos.addColorStop(0, 'rgba(198, 194, 162, 0.055)');
    boughAtmos.addColorStop(0.55, 'rgba(208, 198, 170, 0.028)');
    boughAtmos.addColorStop(1, 'rgba(208, 198, 170, 0)');
    pctx.fillStyle = boughAtmos;
    pctx.beginPath();
    pctx.arc(0, 0, groundR, 0, Math.PI * 2);
    pctx.fill();
    pctx.restore();

    // 3. Organic cold-press paper dimple tooth & natural cotton-flax inclusions
    const dimpleCount = Math.min(3200, Math.floor((width * height) / 480));
    for (let i = 0; i < dimpleCount; i++) {
      const dx = rng() * width;
      const dy = rng() * height;
      const dr = 0.6 + rng() * 1.8;
      pctx.fillStyle = rng() > 0.46
        ? `rgba(146, 122, 88, ${(0.014 + rng() * 0.024).toFixed(3)})`
        : `rgba(255, 253, 247, ${(0.035 + rng() * 0.055).toFixed(3)})`;
      pctx.beginPath();
      pctx.arc(dx, dy, dr, 0, Math.PI * 2);
      pctx.fill();
    }

    const fiberCount = Math.min(1400, Math.floor((width * height) / 920));
    for (let i = 0; i < fiberCount; i++) {
      const fx = rng() * width;
      const fy = rng() * height;
      const flen = 1.6 + rng() * 4.8;
      const fang = rng() * Math.PI * 2;
      pctx.strokeStyle = rng() > 0.38
        ? `rgba(128, 102, 70, ${(0.020 + rng() * 0.036).toFixed(3)})`
        : `rgba(255, 253, 246, ${(0.045 + rng() * 0.065).toFixed(3)})`;
      pctx.lineWidth = 0.58;
      pctx.beginPath();
      pctx.moveTo(fx, fy);
      pctx.lineTo(fx + Math.cos(fang) * flen, fy + Math.sin(fang) * flen);
      pctx.stroke();
    }
  }

  _drawBackgroundAndHeader(ctx, _width, _height) {
    this._ensurePaperCache(_width, _height);
    ctx.drawImage(this._paperCanvas, 0, 0);
  }

  /**
   * Draws an organic, hand-painted Audubon/Gould watercolor leaf with mottled sap-green &
   * russet-ochre glazes, natural wavy/serrated margins, paper-reserve midrib, and fine sepia venation.
   */
  _drawBotanicalLeaf(ctx, ox, oy, angle, lenScale, widScale, topCol, underCol, curlSide = 0, lobed = false, alpha = 1.0) {
    const scale = this.model.layout.scale;
    const p = this.model.toScreen(ox, oy);
    const Lpx = scale * lenScale;
    const Wpx = scale * widScale;
    const grain = this._ensureLithoGrain(ctx);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);

    // Slender watercolor-and-sepia petiole stem
    ctx.strokeStyle = '#6A533A';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(-Lpx * 0.12, 0);
    ctx.quadraticCurveTo(-Lpx * 0.04, -1.5, 2, 0);
    ctx.stroke();

    const buildLeaf = () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      if (lobed) {
        ctx.bezierCurveTo(Lpx * 0.14, -Wpx * 0.88, Lpx * 0.34, -Wpx * 1.04, Lpx * 0.48, -Wpx * 0.64);
        ctx.bezierCurveTo(Lpx * 0.60, -Wpx * 0.96, Lpx * 0.80, -Wpx * 0.70, Lpx * 0.98, 0.04 * Wpx);
        ctx.quadraticCurveTo(Lpx * 1.03, Wpx * 0.09, Lpx * 0.94, Wpx * 0.20);
        ctx.bezierCurveTo(Lpx * 0.78, Wpx * 0.78, Lpx * 0.58, Wpx * 0.96, Lpx * 0.46, Wpx * 0.64);
        ctx.bezierCurveTo(Lpx * 0.32, Wpx * 1.00, Lpx * 0.14, Wpx * 0.84, 0, 0);
      } else {
        // Organic undulating Audubon acuminate leaf blade with graceful drooping tip
        ctx.bezierCurveTo(Lpx * 0.16, -Wpx * 0.94, Lpx * 0.44, -Wpx * 0.98, Lpx * 0.68, -Wpx * 0.52);
        ctx.bezierCurveTo(Lpx * 0.84, -Wpx * 0.24, Lpx * 0.95, 0.02 * Wpx, Lpx * 1.04, Wpx * 0.16);
        ctx.quadraticCurveTo(Lpx * 0.92, Wpx * 0.24, Lpx * 0.78, Wpx * 0.46);
        ctx.bezierCurveTo(Lpx * 0.52, Wpx * 0.94, Lpx * 0.20, Wpx * 0.86, 0, 0);
      }
      ctx.closePath();
    };

    // Luminous sunlit two-half leaf blade modeling (sunlit upper half, slightly deeper olive lower half)
    const lg = ctx.createLinearGradient(0, -Wpx * 0.95, Lpx * 0.85, Wpx * 0.95);
    lg.addColorStop(0, tonePigment(topCol, 0.24, 0.90));
    lg.addColorStop(0.46, hexToRgba(topCol, 0.92));
    lg.addColorStop(0.54, tonePigment(topCol, -0.10, 0.93));
    lg.addColorStop(1, blendHex(topCol, underCol, 0.58, 0.92));
    buildLeaf();
    ctx.fillStyle = lg;
    ctx.fill();

    ctx.save();
    ctx.clip();

    // Mottled wet-into-wet watercolor pigment blooms (warm sap-ochre sun spot + soft russet tip glaze)
    ctx.globalCompositeOperation = 'multiply';
    const mottle1 = ctx.createRadialGradient(Lpx * 0.34, -Wpx * 0.26, 2, Lpx * 0.34, -Wpx * 0.26, Lpx * 0.44);
    mottle1.addColorStop(0, hexToRgba('#C8B86A', 0.24));
    mottle1.addColorStop(1, 'rgba(200, 184, 106, 0)');
    ctx.fillStyle = mottle1;
    ctx.fillRect(0, -Wpx * 1.2, Lpx * 1.1, Wpx * 2.4);

    const tipBlush = ctx.createRadialGradient(Lpx * 0.90, Wpx * 0.08, 2, Lpx * 0.78, 0, Lpx * 0.48);
    tipBlush.addColorStop(0, hexToRgba(underCol, 0.44));
    tipBlush.addColorStop(0.70, hexToRgba(underCol, 0.18));
    tipBlush.addColorStop(1, hexToRgba(underCol, 0));
    ctx.fillStyle = tipBlush;
    ctx.fillRect(0, -Wpx * 1.2, Lpx * 1.1, Wpx * 2.4);

    if (curlSide !== 0 && !lobed) {
      // Soft wet-on-wet warm russet/underside margin glaze instead of a hard geometric sticker!
      const sgn = curlSide > 0 ? 1 : -1;
      const edgeG = ctx.createRadialGradient(Lpx * 0.56, sgn * Wpx * 0.76, 1, Lpx * 0.56, sgn * Wpx * 0.72, Lpx * 0.38);
      edgeG.addColorStop(0, hexToRgba(underCol, 0.48));
      edgeG.addColorStop(1, hexToRgba(underCol, 0));
      ctx.fillStyle = edgeG;
      ctx.fillRect(0, -Wpx * 1.2, Lpx * 1.1, Wpx * 2.4);
    }
    ctx.globalCompositeOperation = 'source-over';

    if (grain) {
      ctx.fillStyle = grain;
      ctx.fillRect(-4, -Wpx * 1.3, Lpx * 1.15, Wpx * 2.6);
    }

    // Subtle sunlit sap-yellow highlight whisper alongside a delicate tapered olive-sepia ink midrib (NO white vector stripe!)
    ctx.strokeStyle = 'rgba(232, 228, 178, 0.28)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(2, -0.7);
    ctx.quadraticCurveTo(Lpx * 0.54, -Wpx * 0.05 - 0.7, Lpx * 0.94, Wpx * 0.11);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(52, 42, 24, 0.46)';
    ctx.lineWidth = 0.68;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Lpx * 0.54, -Wpx * 0.05, Lpx * 0.98, Wpx * 0.12);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(52, 42, 24, 0.30)';
    ctx.lineWidth = 0.44;
    const veins = lobed ? 4 : 6;
    for (let v = 1; v <= veins; v++) {
      const u = v / (veins + 1.25);
      const vx = Lpx * u;
      const vy = -Wpx * 0.04 * Math.sin(u * Math.PI);
      const span = Wpx * Math.sin(u * Math.PI * 0.92) * 0.74;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.quadraticCurveTo(vx + Lpx * 0.09, vy + sgn * span * 0.50, vx + Lpx * 0.22, vy + sgn * span * 0.84);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Delicate sepia watercolor drying rim & fine botanical pen contour
    buildLeaf();
    ctx.strokeStyle = 'rgba(52, 40, 24, 0.46)';
    ctx.lineWidth = 0.58;
    ctx.stroke();

    ctx.restore();
  }

  _drawBerryCluster(ctx, ox, oy, count, berryCol, hiCol) {
    const scale = this.model.layout.scale;
    const c = this.model.toScreen(ox, oy);
    const r = Math.max(3.6, scale * 0.020);
    const offsets = [
      [-0.85, -0.45],
      [0.85, -0.40],
      [-0.25, 0.68],
      [0.72, 0.58],
    ];
    ctx.save();
    for (let i = 0; i < Math.min(count, offsets.length); i++) {
      const bx = c.x + offsets[i][0] * r * 1.15;
      const by = c.y + offsets[i][1] * r * 1.15;
      const bg = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r * 1.15);
      bg.addColorStop(0, hiCol);
      bg.addColorStop(0.45, berryCol);
      bg.addColorStop(1, tonePigment(berryCol, -0.45));
      ctx.fillStyle = bg;
      ctx.strokeStyle = 'rgba(48, 22, 16, 0.55)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.ellipse(bx, by, r * 1.10, r * 0.88, offsets[i][0] * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#241410';
      ctx.beginPath();
      ctx.arc(bx + offsets[i][0] * r * 0.55, by + offsets[i][1] * r * 0.45, 1.0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWattlePomPoms(ctx, ox, oy) {
    const scale = this.model.layout.scale;
    const base = this.model.toScreen(ox, oy);
    const r = Math.max(4.6, scale * 0.026);
    const puffs = [
      [0, 0, 1.0],
      [-1.4, 0.9, 0.92],
      [1.2, 1.2, 0.88],
      [-0.5, 2.2, 0.84],
      [0.9, 2.5, 0.78],
    ];
    const rng = mulberry32(Math.round((ox + 5) * 1000));
    ctx.save();
    ctx.strokeStyle = '#788254';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y - r * 0.8);
    ctx.quadraticCurveTo(base.x - r * 0.4, base.y + r * 1.4, base.x + r * 0.3, base.y + r * 2.7);
    ctx.stroke();

    for (const [dx, dy, sc] of puffs) {
      const px = base.x + dx * r;
      const py = base.y + dy * r;
      const pr = r * sc;
      const g = ctx.createRadialGradient(px - pr * 0.25, py - pr * 0.25, pr * 0.1, px, py, pr);
      g.addColorStop(0, '#FFFBE2');
      g.addColorStop(0.65, '#F2DC7E');
      g.addColorStop(1, '#C8A442');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      for (let s = 0; s < 22; s++) {
        const ang = (s / 22) * Math.PI * 2 + rng() * 0.25;
        const rad = pr * (0.62 + rng() * 0.46);
        ctx.fillStyle = s % 2 === 0 ? '#9B7B28' : '#FFF9D4';
        ctx.beginPath();
        ctx.arc(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad, 0.90, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawPhyllodeLeaf(ctx, ox, oy, angle, lenScale, alpha = 1.0) {
    const scale = this.model.layout.scale;
    const p = this.model.toScreen(ox, oy);
    const Lpx = scale * lenScale;
    const Wpx = scale * 0.042;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);

    const g = ctx.createLinearGradient(0, -Wpx, Lpx, Wpx);
    g.addColorStop(0, '#8A9D6C');
    g.addColorStop(0.58, '#728656');
    g.addColorStop(1, '#9BA67E');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(56, 64, 42, 0.50)';
    ctx.lineWidth = 0.78;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(Lpx * 0.28, -Wpx * 0.88, Lpx * 0.72, -Wpx * 0.52, Lpx, Wpx * 0.24);
    ctx.bezierCurveTo(Lpx * 0.70, Wpx * 0.94, Lpx * 0.26, Wpx * 0.82, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(52, 60, 36, 0.34)';
    ctx.lineWidth = 0.50;
    for (const off of [-0.30, 0.0, 0.32]) {
      ctx.beginPath();
      ctx.moveTo(4, off * Wpx * 0.28);
      ctx.quadraticCurveTo(Lpx * 0.52, off * Wpx * 0.86, Lpx * 0.95, Wpx * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawDogwoodBlossom(ctx, ox, oy, scaleMul = 1.0) {
    // Authentic spring Cornus florida (Flowering Dogwood): 4 creamy-white notched involucral bracts + chartreuse-gold central floret cluster!
    const scale = this.model.layout.scale;
    const c = this.model.toScreen(ox, oy);
    const br = Math.max(5.5, scale * 0.032 * scaleMul);
    ctx.save();
    ctx.translate(c.x, c.y);
    for (let b = 0; b < 4; b++) {
      const ang = (b / 4) * Math.PI * 2 + 0.38;
      ctx.save();
      ctx.rotate(ang);
      const bg = ctx.createRadialGradient(br * 0.55, 0, 1, br * 0.62, 0, br * 1.05);
      bg.addColorStop(0, '#FFFDF7');
      bg.addColorStop(0.75, '#F5EFE0');
      bg.addColorStop(1, '#E2D6BE');
      ctx.fillStyle = bg;
      ctx.strokeStyle = 'rgba(96, 78, 56, 0.42)';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(br * 0.36, -br * 0.72, br * 1.16, -br * 0.68, br * 1.32, -br * 0.14);
      // Characteristic rust-tipped apical notch of Cornus florida bract!
      ctx.quadraticCurveTo(br * 1.18, 0, br * 1.32, br * 0.14);
      ctx.bezierCurveTo(br * 1.16, br * 0.68, br * 0.36, br * 0.72, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(164, 92, 68, 0.55)';
      ctx.beginPath();
      ctx.arc(br * 1.24, 0, br * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Tight cluster of tiny chartreuse-yellow true flowers at the center
    for (const [fx, fy] of [[0, 0], [-0.16, -0.14], [0.16, -0.12], [-0.14, 0.16], [0.15, 0.15]]) {
      ctx.fillStyle = '#C4C256';
      ctx.strokeStyle = 'rgba(78, 82, 32, 0.55)';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.arc(fx * br, fy * br, br * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawWildBlossom(ctx, ox, oy, petalCol, centerCol) {
    const scale = this.model.layout.scale;
    const c = this.model.toScreen(ox, oy);
    const pr = Math.max(4.5, scale * 0.025);
    ctx.save();
    ctx.translate(c.x, c.y);
    for (let p = 0; p < 5; p++) {
      const ang = (p / 5) * Math.PI * 2 - 0.3;
      ctx.save();
      ctx.rotate(ang);
      const pg = ctx.createRadialGradient(pr * 0.5, 0, 1, pr * 0.6, 0, pr * 0.9);
      pg.addColorStop(0, '#FFFFFF');
      pg.addColorStop(1, petalCol);
      ctx.fillStyle = pg;
      ctx.strokeStyle = 'rgba(92, 72, 52, 0.38)';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(pr * 0.45, -pr * 0.68, pr * 1.25, -pr * 0.56, pr * 1.32, 0);
      ctx.bezierCurveTo(pr * 1.25, pr * 0.56, pr * 0.45, pr * 0.68, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = centerCol;
    ctx.beginPath();
    ctx.arc(0, 0, pr * 0.32, 0, Math.PI * 2);
    ctx.fill();
    for (let s = 0; s < 9; s++) {
      const sa = (s / 9) * Math.PI * 2;
      ctx.fillStyle = '#8C5E1A';
      ctx.beginPath();
      ctx.arc(Math.cos(sa) * pr * 0.44, Math.sin(sa) * pr * 0.44, 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawTreeFernFrond(ctx, ox, oy, angle, lenScale, flip = 1, alpha = 1.0) {
    const scale = this.model.layout.scale;
    const p = this.model.toScreen(ox, oy);
    const Lpx = scale * lenScale;
    const Wpx = scale * 0.135;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.scale(1, flip);

    ctx.strokeStyle = '#536840';
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(-Lpx * 0.06, 0);
    ctx.quadraticCurveTo(Lpx * 0.48, -Wpx * 0.24, Lpx, Wpx * 0.08);
    ctx.stroke();

    const pinnae = 14;
    for (let i = 1; i <= pinnae; i++) {
      const u = i / (pinnae + 0.6);
      const rx = Lpx * u;
      const ry = -Wpx * 0.24 * 4 * u * (1 - u) + Wpx * 0.08 * u * u;
      const pinLen = Wpx * Math.sin(u * Math.PI * 0.92) * 0.92;
      const pinW = Math.max(1.7, scale * 0.0115 * (1.0 - 0.45 * u));

      for (const sgn of [-1, 1]) {
        ctx.fillStyle = sgn < 0 ? '#5D7E4B' : '#789662';
        ctx.strokeStyle = 'rgba(44, 58, 34, 0.40)';
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(rx + pinLen * 0.32, ry + sgn * pinLen * 0.62 - pinW * 0.5, rx + pinLen * 0.52, ry + sgn * pinLen);
        ctx.quadraticCurveTo(rx + pinLen * 0.12, ry + sgn * pinLen * 0.68 + pinW * 0.5, rx - pinW * 0.4, ry);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Draws an authentic 19th-century chromolithograph songbird in ~37-deg perched posture:
   *  1. Layered, sheathed rectrices with inner/outer web contrast & diagonal vane barbules
   *  2. Asymmetrical, gnarled museum-folio botanical bough & layered background/foreground flora
   *  3. Multi-layered wet-on-wet watercolor & limestone-grained plumage with imbricated feather tracts
   *  4. Five-tiered ornithological folded wing (scapulars, lesser/median/greater coverts, secondaries, stepped primaries)
   */
  _drawBirdExteriorBack(ctx, L, telem) {
    const scale = this.model.layout.scale;
    const plum = this.model.currentSpecies.plumage;
    const m = plum.morph || { chestTrim: 1, dorsalTrim: 1, bellyTuck: 1, tailLenMul: 1, headSlim: 1, wingReach: 1 };
    const flora = plum.botanicalType || 'dogwood';
    const breathLift = clamp((this.model.dofs.pSub.value - 0.18) * 0.008, -0.005, 0.016);
    const singBob = clamp(((telem?.rmsL || 0) + (telem?.rmsR || 0)) * 0.008, 0, 0.012);
    const grain = this._ensureLithoGrain(ctx);

    const headCx = L.headCx;
    const headCy = L.headCy - singBob;

    ctx.save();

    // 0. Soft Background Foliage Leaves Anchored Directly to the Bough Forks (or Coiled Patch Loops on SynthBird!)
    if (flora === 'patchcable') {
      // Background coiled cloth-braided modular patch loops behind main instrumentation cable
      ctx.save();
      for (const [cxN, cyN, rxN, ryN, rot, col] of [
        [-0.64, 0.720, 0.088, 0.044, -0.35, 'rgba(34, 86, 110, 0.56)'],
        [0.52, 0.715, 0.082, 0.040, 0.32, 'rgba(158, 62, 38, 0.52)'],
      ]) {
        const lp = this.model.toScreen(cxN, cyN);
        ctx.strokeStyle = 'rgba(42, 30, 22, 0.42)';
        ctx.lineWidth = Math.max(2.4, scale * 0.0085);
        ctx.beginPath();
        ctx.ellipse(lp.x, lp.y, scale * rxN, scale * ryN, rot, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, scale * 0.0055);
        ctx.stroke();
      }
      ctx.restore();
    } else if (flora === 'dogwood') {
      this._drawBotanicalLeaf(ctx, -0.64, 0.695, -2.26, 0.24, 0.096, '#7A925E', '#8EA26C', 0, false, 0.68);
      this._drawBotanicalLeaf(ctx, 0.50, 0.690, -0.46, 0.22, 0.088, '#7E9662', '#92A670', 0, false, 0.62);
    } else if (flora === 'briar' || flora === 'wildrose') {
      this._drawBotanicalLeaf(ctx, -0.64, 0.695, -2.24, 0.23, 0.090, '#668254', '#8C9A6A', 0, false, 0.68);
      this._drawBotanicalLeaf(ctx, 0.50, 0.690, -0.44, 0.22, 0.084, '#688456', '#8E9B6C', 0, false, 0.60);
    } else if (flora === 'mallow') {
      this._drawBotanicalLeaf(ctx, -0.66, 0.695, -2.22, 0.22, 0.104, '#849B6E', '#9E8666', 0, true, 0.68);
      this._drawBotanicalLeaf(ctx, 0.52, 0.692, -0.42, 0.20, 0.094, '#849B6E', '#9E8666', 0, true, 0.58);
    } else if (flora === 'treefern') {
      this._drawTreeFernFrond(ctx, 0.50, 0.695, -0.34, 0.26, 1, 0.60);
    } else {
      this._drawPhyllodeLeaf(ctx, -0.64, 0.696, -2.32, 0.25, 0.66);
    }

    // 1. Sleek Elongated Tail Rectrices (sweeping gracefully down-left behind the bough!)
    if (plum.hasLyreTail) {
      // Superb Lyrebird (Gould Birds of Australia adult male Menura novaehollandiae):
      // Sweeps ~1.4x body length from tail root (-0.43, 0.40) into an expansive S-curved lyre with drooping gossamer filamentary curtains!
      for (let f = 0; f < 12; f++) {
        const u = f / 11;
        const r0 = this.model.toScreen(-0.44 + u * 0.032, 0.40 + u * 0.036);
        const r1 = this.model.toScreen(lerp(-1.26, -0.92, u), lerp(0.64, 0.99, u));
        const ctrlX = 0.5 * (r0.x + r1.x) - scale * (0.062 - u * 0.028);
        const ctrlY = 0.5 * (r0.y + r1.y) - scale * (0.048 - u * 0.024);
        ctx.strokeStyle = 'rgba(104, 90, 74, 0.66)';
        ctx.lineWidth = 0.76;
        ctx.beginPath();
        ctx.moveTo(r0.x, r0.y);
        ctx.quadraticCurveTo(ctrlX, ctrlY, r1.x, r1.y);
        ctx.stroke();

        // Drooping gossamer filamentary lateral barbs lacking barbules (Menura median lacy plumes!)
        ctx.strokeStyle = 'rgba(128, 112, 94, 0.34)';
        ctx.lineWidth = 0.42;
        for (let b = 1; b <= 16; b++) {
          const bu = b / 16.8;
          const om = 1 - bu;
          const bx = om * om * r0.x + 2 * om * bu * ctrlX + bu * bu * r1.x;
          const by = om * om * r0.y + 2 * om * bu * ctrlY + bu * bu * r1.y;
          const droop = scale * (0.024 + 0.016 * Math.sin(bu * Math.PI));
          ctx.beginPath();
          ctx.moveTo(bx - droop * 0.55, by - droop * 0.36);
          ctx.quadraticCurveTo(bx - 1, by, bx, by);
          ctx.quadraticCurveTo(bx + droop * 0.22, by + droop * 0.62, bx + droop * 0.34, by + droop * 1.18);
          ctx.stroke();
        }
      }

      // Two elongated slender central median wire plumes arching gracefully past the lyre
      for (const [wx, wy] of [[-1.34, 0.70], [-1.22, 0.89]]) {
        const w0 = this.model.toScreen(-0.43, 0.415);
        const w1 = this.model.toScreen(wx, wy);
        ctx.strokeStyle = 'rgba(196, 184, 166, 0.86)';
        ctx.lineWidth = 0.94;
        ctx.beginPath();
        ctx.moveTo(w0.x, w0.y);
        ctx.quadraticCurveTo(0.5 * (w0.x + w1.x) - scale * 0.052, 0.5 * (w0.y + w1.y) - scale * 0.042, w1.x, w1.y);
        ctx.stroke();
      }

      // Two broad S-curved outer lyriform ribbon rectrices with crescentic rufous window-notches & tapered dark curled tips!
      for (const [rx0, ry0, cx1, cy1, cx2, cy2, tx, ty, curlDir] of [
        [-0.45, 0.40, -0.78, 0.43, -1.04, 0.52, -1.28, 0.62, -1],
        [-0.40, 0.44, -0.62, 0.68, -0.82, 0.88, -1.04, 0.99, 1],
      ]) {
        const p0 = this.model.toScreen(rx0, ry0);
        const pc1 = this.model.toScreen(cx1, cy1);
        const pc2 = this.model.toScreen(cx2, cy2);
        const pTip = this.model.toScreen(tx, ty);
        const fw = scale * 0.038;

        ctx.save();
        const ribGrad = ctx.createLinearGradient(p0.x, p0.y, pTip.x, pTip.y);
        ribGrad.addColorStop(0, '#D8CCB6');
        ribGrad.addColorStop(0.50, '#F4ECE0');
        ribGrad.addColorStop(0.78, '#DFD3BC');
        ribGrad.addColorStop(0.90, '#3C281E');
        ribGrad.addColorStop(1, '#18100C');
        ctx.fillStyle = ribGrad;
        ctx.strokeStyle = 'rgba(46, 30, 18, 0.68)';
        ctx.lineWidth = 0.72;
        ctx.beginPath();
        ctx.moveTo(p0.x - fw * 0.22, p0.y - fw * 0.18);
        ctx.bezierCurveTo(pc1.x - fw * 0.52, pc1.y - fw * 0.34, pc2.x - fw * 0.62, pc2.y - fw * 0.28, pTip.x - fw * 0.18, pTip.y - fw * 0.10);
        // Smoothly tapered curved terminal vane curl (no stamped geometric oval!)
        ctx.quadraticCurveTo(pTip.x - fw * 0.42, pTip.y + curlDir * fw * 0.44, pTip.x + fw * 0.18, pTip.y + curlDir * fw * 0.36);
        ctx.bezierCurveTo(pc2.x + fw * 0.46, pc2.y + fw * 0.32, pc1.x + fw * 0.40, pc1.y + fw * 0.30, p0.x + fw * 0.22, p0.y + fw * 0.18);
        ctx.closePath();
        ctx.fill();

        ctx.save();
        ctx.clip();
        if (grain) {
          ctx.fillStyle = grain;
          ctx.fillRect(Math.min(p0.x, pTip.x) - 55, Math.min(p0.y, pTip.y) - 55, Math.abs(p0.x - pTip.x) + 110, Math.abs(pTip.y - p0.y) + 110);
        }
        // 11 crescentic rufous-chestnut window notches tapering naturally toward the dark terminal curl!
        for (let b = 1; b <= 10; b++) {
          const bu = b / 12.2;
          const om = 1 - bu;
          const bx = om * om * om * p0.x + 3 * om * om * bu * pc1.x + 3 * om * bu * bu * pc2.x + bu * bu * bu * pTip.x;
          const by = om * om * om * p0.y + 3 * om * om * bu * pc1.y + 3 * om * bu * bu * pc2.y + bu * bu * bu * pTip.y;
          const wScale = 1.0 - 0.35 * bu;
          ctx.fillStyle = 'rgba(154, 60, 24, 0.80)';
          ctx.beginPath();
          ctx.moveTo(bx - fw * 0.08, by - fw * 0.04);
          ctx.quadraticCurveTo(bx + curlDir * fw * 0.38 * wScale, by - fw * 0.24 * wScale, bx + fw * 0.72 * wScale, by + fw * 0.12 * wScale);
          ctx.quadraticCurveTo(bx + curlDir * fw * 0.32 * wScale, by + fw * 0.24 * wScale, bx - fw * 0.08, by - fw * 0.04);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.stroke();

        // Dark horn outer rachis shaft
        ctx.strokeStyle = 'rgba(42, 28, 16, 0.74)';
        ctx.lineWidth = 0.80;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(pc1.x - fw * 0.18, pc1.y - fw * 0.08, pc2.x - fw * 0.20, pc2.y - fw * 0.08, pTip.x, pTip.y);
        ctx.stroke();
        ctx.restore();
      }
    } else if (plum.isCyborg) {
      // Stamped Anodized-Aluminum & Blued-Steel Mechanical Tail Vanes with Vernier Ticks & Brass Rivets!
      const tailLenMul = m.tailLenMul ?? 1.08;
      const tailBaseX = -0.418;
      const tailBaseY = 0.402;
      for (let tIdx = 0; tIdx < 5; tIdx++) {
        const normIdx = (tIdx - 2.0) / 2.0;
        const forkNotch = Math.abs(normIdx) * 0.018 - 0.008;
        const rootPt = this.model.toScreen(tailBaseX + normIdx * 0.011, tailBaseY + normIdx * 0.012);
        const dxTail = (-0.43 + normIdx * 0.021) * tailLenMul;
        const dyTail = (0.43 + normIdx * 0.018 + forkNotch) * tailLenMul;
        const tipPt = this.model.toScreen(tailBaseX + dxTail, tailBaseY + dyTail);
        const vaneW = scale * 0.025;
        const ang = Math.atan2(tipPt.y - rootPt.y, tipPt.x - rootPt.x);
        const len = Math.hypot(tipPt.x - rootPt.x, tipPt.y - rootPt.y);

        ctx.save();
        ctx.translate(rootPt.x, rootPt.y);
        ctx.rotate(ang);

        if (tIdx > 0) {
          ctx.fillStyle = 'rgba(20, 26, 30, 0.22)';
          ctx.fillRect(0, -vaneW * 0.46, len * 0.96, vaneW * 0.22);
        }

        const isAlum = tIdx % 2 === 1;
        const vg = ctx.createLinearGradient(0, -vaneW * 0.5, 0, vaneW * 0.5);
        vg.addColorStop(0, isAlum ? '#DCE2E4' : '#6A8692');
        vg.addColorStop(0.45, isAlum ? '#9EAAB0' : '#435C66');
        vg.addColorStop(1, isAlum ? '#68747A' : '#26343B');
        ctx.fillStyle = vg;

        ctx.beginPath();
        ctx.moveTo(0, -vaneW * 0.34);
        ctx.lineTo(len * 0.90, -vaneW * 0.36);
        ctx.lineTo(len, -vaneW * 0.06);
        ctx.lineTo(len * 0.93, vaneW * 0.32);
        ctx.lineTo(0, vaneW * 0.30);
        ctx.closePath();
        ctx.fill();

        if (grain) {
          ctx.save();
          ctx.clip();
          ctx.fillStyle = grain;
          ctx.fillRect(0, -vaneW, len + 4, vaneW * 2);
          ctx.restore();
        }

        // Chamfered copperplate edge + milled stiffening rib + proximal brass rivet
        ctx.strokeStyle = 'rgba(28, 36, 42, 0.66)';
        ctx.lineWidth = 0.62;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(248, 250, 246, 0.42)';
        ctx.lineWidth = 0.52;
        ctx.beginPath();
        ctx.moveTo(len * 0.08, -vaneW * 0.04);
        ctx.lineTo(len * 0.88, -vaneW * 0.04);
        ctx.stroke();

        if (tIdx === 2) {
          // Etched vernier calibration ticks along central tail vane
          ctx.strokeStyle = 'rgba(26, 34, 38, 0.52)';
          ctx.lineWidth = 0.45;
          for (let k = 2; k <= 10; k++) {
            const tx = (k / 12) * len;
            ctx.beginPath();
            ctx.moveTo(tx, -vaneW * 0.34);
            ctx.lineTo(tx, -vaneW * (k % 2 === 0 ? 0.12 : 0.22));
            ctx.stroke();
          }
        }

        ctx.fillStyle = '#C89B4E';
        ctx.strokeStyle = 'rgba(46, 32, 16, 0.72)';
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.arc(len * 0.12, 0, Math.max(1.2, vaneW * 0.14), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }
    } else {
      // Sleek, Hand-Painted Overlapping Folded Rectrices (Steuerfedern) with Soft Tonal Vanes & Sepia Shafts
      const tailLenMul = m.tailLenMul ?? (plum.hasMask ? 1.24 : plum.tailColor ? 1.12 : plum.hasZebraBars ? 0.88 : 1.06);
      const tailBaseX = -0.418;
      const tailBaseY = 0.402;
      const tailMain = plum.tailColor || plum.wing;

      for (let tIdx = 0; tIdx < 5; tIdx++) {
        const normIdx = (tIdx - 2.0) / 2.0; // -1 .. +1 tightly shingled passerine tail
        const forkNotch = Math.abs(normIdx) * 0.020 - 0.009;
        const rootPt = this.model.toScreen(tailBaseX + normIdx * 0.011, tailBaseY + normIdx * 0.012);
        const dxTail = (-0.43 + normIdx * 0.020) * tailLenMul;
        const dyTail = (0.43 + normIdx * 0.018 + forkNotch) * tailLenMul;
        const tipPt = this.model.toScreen(tailBaseX + dxTail, tailBaseY + dyTail);
        const featherW = scale * 0.026;

        const ang = Math.atan2(tipPt.y - rootPt.y, tipPt.x - rootPt.x);
        const len = Math.hypot(tipPt.x - rootPt.x, tipPt.y - rootPt.y);

        ctx.save();
        ctx.translate(rootPt.x, rootPt.y);
        ctx.rotate(ang);

        // Soft cast shadow onto underlying rectrix so overlapping feathers separate tonally without white stripes!
        if (tIdx > 0) {
          ctx.fillStyle = 'rgba(34, 22, 14, 0.16)';
          ctx.beginPath();
          ctx.moveTo(0, -featherW * 0.36);
          ctx.quadraticCurveTo(len * 0.55, -featherW * 0.52, len * 0.98, -featherW * 0.08);
          ctx.lineTo(len * 0.94, 0);
          ctx.closePath();
          ctx.fill();
        }

        // Watercolor outer web (softly sunlit) + deeper shaded inner web
        const tg = ctx.createLinearGradient(0, -featherW * 0.52, 0, featherW * 0.52);
        tg.addColorStop(0, tonePigment(tailMain, 0.16));
        tg.addColorStop(0.46, tailMain);
        tg.addColorStop(1, tonePigment(tailMain, -0.26));
        ctx.fillStyle = tg;

        ctx.beginPath();
        ctx.moveTo(0, -featherW * 0.30);
        ctx.bezierCurveTo(len * 0.46, -featherW * 0.44, len * 0.88, -featherW * 0.34, len, -featherW * 0.02);
        ctx.quadraticCurveTo(len * 0.96, featherW * 0.28, len * 0.80, featherW * 0.36);
        ctx.quadraticCurveTo(len * 0.42, featherW * 0.40, 0, featherW * 0.26);
        ctx.closePath();
        ctx.fill();

        ctx.save();
        ctx.clip();
        if (grain) {
          ctx.fillStyle = grain;
          ctx.fillRect(0, -featherW, len + 4, featherW * 2);
        }
        if (plum.hasZebraBars && tIdx >= 2) {
          // Gould Zebra Finch: 5 crisp black-and-white transverse bars starting proximally on basal uppertail coverts/central rectrices!
          for (let b = 0; b < 5; b++) {
            const bx = len * (0.06 + b * 0.145);
            ctx.fillStyle = b % 2 === 0 ? 'rgba(26, 20, 16, 0.90)' : 'rgba(250, 245, 234, 0.94)';
            ctx.beginPath();
            ctx.ellipse(bx + len * 0.03, 0, len * 0.046, featherW * 0.96, 0.16, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Gossamer diagonal barbule texture
        ctx.strokeStyle = 'rgba(38, 24, 15, 0.12)';
        ctx.lineWidth = 0.40;
        for (let v = 1; v < 13; v++) {
          const vx = (v / 13) * len * 0.92;
          ctx.beginPath();
          ctx.moveTo(vx, 0);
          ctx.lineTo(vx + 5, -featherW * 0.36);
          ctx.moveTo(vx, 0);
          ctx.lineTo(vx + 5, featherW * 0.36);
          ctx.stroke();
        }
        ctx.restore();

        // Fine sepia lithographic feather outline + dark horn rachis shaft (NO bright white ruler lines!)
        ctx.strokeStyle = 'rgba(42, 28, 18, 0.44)';
        ctx.lineWidth = 0.54;
        ctx.beginPath();
        ctx.moveTo(len * 0.06, -featherW * 0.32);
        ctx.bezierCurveTo(len * 0.48, -featherW * 0.44, len * 0.88, -featherW * 0.34, len, -featherW * 0.02);
        ctx.quadraticCurveTo(len * 0.96, featherW * 0.28, len * 0.80, featherW * 0.36);
        ctx.quadraticCurveTo(len * 0.42, featherW * 0.40, 0, featherW * 0.26);
        ctx.stroke();

        ctx.strokeStyle = tonePigment(tailMain, -0.42, 0.56);
        ctx.lineWidth = 0.52;
        ctx.beginPath();
        ctx.moveTo(2, -0.3);
        ctx.lineTo(len * 0.95, -featherW * 0.02);
        ctx.stroke();

        ctx.restore();
      }
    }

    // 2. Sinuous Audubon / Gould Hand-Painted Watercolor Bough (or Vintage Braided Patch-Cable & Vacuum-Tube Perch!)
    if (flora === 'patchcable') {
      const bPtsTop = [
        this.model.toScreen(-1.08, 0.778),
        this.model.toScreen(-0.48, 0.702),
        this.model.toScreen(0.04, 0.674),
        this.model.toScreen(0.50, 0.692),
        this.model.toScreen(0.86, 0.726),
      ];
      const cabThick = [0.025, 0.024, 0.024, 0.023, 0.021].map((v) => Math.max(4.5, scale * v));

      // Exposed braided copper ground & cloth signal leads fraying softly on the left vignette
      const leadUp = this.model.toScreen(-1.14, 0.706);
      const leadDn = this.model.toScreen(-1.16, 0.838);
      ctx.save();
      for (const [endPt, col] of [
        [leadUp, 'rgba(184, 108, 52, 0.78)'],
        [leadDn, 'rgba(34, 86, 110, 0.72)'],
      ]) {
        const lg = ctx.createLinearGradient(bPtsTop[0].x + 28, bPtsTop[0].y, endPt.x, endPt.y);
        lg.addColorStop(0, col);
        lg.addColorStop(1, 'rgba(140, 110, 80, 0.08)');
        ctx.strokeStyle = lg;
        ctx.lineWidth = Math.max(1.8, scale * 0.0072);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bPtsTop[0].x + 24, bPtsTop[0].y + cabThick[0] * 0.5);
        ctx.quadraticCurveTo(0.5 * (bPtsTop[0].x + endPt.x), endPt.y - 6, endPt.x, endPt.y);
        ctx.stroke();
      }
      ctx.restore();

      // Main heavy woven-cloth instrumentation patch cable
      ctx.save();
      const buildCable = () => {
        ctx.beginPath();
        ctx.moveTo(bPtsTop[0].x, bPtsTop[0].y);
        ctx.bezierCurveTo(bPtsTop[1].x, bPtsTop[1].y, bPtsTop[2].x - 32, bPtsTop[2].y, bPtsTop[2].x, bPtsTop[2].y);
        ctx.bezierCurveTo(bPtsTop[2].x + 32, bPtsTop[2].y, bPtsTop[3].x, bPtsTop[3].y, bPtsTop[4].x, bPtsTop[4].y);
        ctx.lineTo(bPtsTop[4].x, bPtsTop[4].y + cabThick[4]);
        ctx.bezierCurveTo(
          bPtsTop[3].x, bPtsTop[3].y + cabThick[3],
          bPtsTop[2].x + 32, bPtsTop[2].y + cabThick[2],
          bPtsTop[2].x, bPtsTop[2].y + cabThick[2]
        );
        ctx.bezierCurveTo(
          bPtsTop[2].x - 32, bPtsTop[2].y + cabThick[2],
          bPtsTop[1].x, bPtsTop[1].y + cabThick[1],
          bPtsTop[0].x, bPtsTop[0].y + cabThick[0]
        );
        ctx.closePath();
      };

      const cabGrad = ctx.createLinearGradient(0, bPtsTop[2].y, 0, bPtsTop[0].y + cabThick[0]);
      cabGrad.addColorStop(0, '#9B876E');
      cabGrad.addColorStop(0.30, '#625242');
      cabGrad.addColorStop(0.72, '#3C322A');
      cabGrad.addColorStop(1, '#241E1A');
      buildCable();
      ctx.fillStyle = cabGrad;
      ctx.fill();

      ctx.save();
      ctx.clip();
      // Woven diagonal herringbone cloth-overbraid cross-hatching (Prussian-blue & warm-brass tracer threads!)
      const spanX0 = bPtsTop[0].x;
      const spanX1 = bPtsTop[4].x;
      const stepPx = Math.max(5.5, scale * 0.018);
      ctx.lineWidth = 0.72;
      for (let x = spanX0 - 20; x < spanX1 + 20; x += stepPx) {
        const idx = Math.round((x - spanX0) / stepPx);
        ctx.strokeStyle = idx % 3 === 0 ? 'rgba(42, 108, 134, 0.46)' : idx % 3 === 1 ? 'rgba(210, 168, 96, 0.34)' : 'rgba(24, 18, 14, 0.42)';
        ctx.beginPath();
        ctx.moveTo(x, bPtsTop[2].y - 16);
        ctx.lineTo(x + 28, bPtsTop[0].y + cabThick[0] + 22);
        ctx.moveTo(x + 28, bPtsTop[2].y - 16);
        ctx.lineTo(x, bPtsTop[0].y + cabThick[0] + 22);
        ctx.stroke();
      }
      if (grain) {
        ctx.fillStyle = grain;
        ctx.fillRect(spanX0 - 10, bPtsTop[2].y - 10, (spanX1 - spanX0) + 20, 120);
      }
      const leftFade = ctx.createLinearGradient(bPtsTop[0].x, 0, bPtsTop[0].x + scale * 0.14, 0);
      leftFade.addColorStop(0, '#F5EFE0');
      leftFade.addColorStop(1, 'rgba(245, 239, 224, 0)');
      ctx.fillStyle = leftFade;
      ctx.fillRect(bPtsTop[0].x - 6, bPtsTop[0].y - 12, scale * 0.15, cabThick[0] + 28);
      ctx.restore();

      buildCable();
      ctx.strokeStyle = 'rgba(34, 26, 20, 0.66)';
      ctx.lineWidth = 0.78;
      ctx.stroke();
      ctx.restore();

      // Right-end Machined Brass & Satin-Nickel 1/4-inch TRS Phone Plug!
      const plugBase = { x: bPtsTop[4].x - 2, y: bPtsTop[4].y + cabThick[4] * 0.5 };
      const plugAng = 0.105;
      ctx.save();
      ctx.translate(plugBase.x, plugBase.y);
      ctx.rotate(plugAng);
      const brlL = scale * 0.105;
      const brlR = cabThick[4] * 0.78;

      // Coiled spring strain relief
      ctx.strokeStyle = 'rgba(72, 66, 58, 0.82)';
      ctx.lineWidth = 1.15;
      for (let s = 0; s < 5; s++) {
        const sx = -scale * 0.036 + s * (scale * 0.0072);
        ctx.beginPath();
        ctx.moveTo(sx, -brlR * 0.72);
        ctx.lineTo(sx + 1.5, brlR * 0.72);
        ctx.stroke();
      }

      // Knurled brass barrel housing
      const brlGrad = ctx.createLinearGradient(0, -brlR, 0, brlR);
      brlGrad.addColorStop(0, '#F0DBA8');
      brlGrad.addColorStop(0.42, '#C59B4E');
      brlGrad.addColorStop(0.82, '#826128');
      brlGrad.addColorStop(1, '#4E3816');
      ctx.fillStyle = brlGrad;
      ctx.strokeStyle = 'rgba(42, 30, 16, 0.76)';
      ctx.lineWidth = 0.75;
      ctx.fillRect(0, -brlR, brlL, brlR * 2);
      ctx.strokeRect(0, -brlR, brlL, brlR * 2);

      // Diamond knurl band on brass barrel
      ctx.strokeStyle = 'rgba(56, 38, 16, 0.34)';
      ctx.lineWidth = 0.48;
      for (let kx = brlL * 0.16; kx < brlL * 0.76; kx += 4.2) {
        ctx.beginPath();
        ctx.moveTo(kx, -brlR + 1);
        ctx.lineTo(kx + 4, brlR - 1);
        ctx.moveTo(kx + 4, -brlR + 1);
        ctx.lineTo(kx, brlR - 1);
        ctx.stroke();
      }

      // Satin-nickel TRS sleeve + ring + bakelite insulator bands + tip!
      const tipL = scale * 0.125;
      const shR = brlR * 0.46;
      const nkGrad = ctx.createLinearGradient(0, -shR, 0, shR);
      nkGrad.addColorStop(0, '#F6F8F7');
      nkGrad.addColorStop(0.48, '#B8C2C6');
      nkGrad.addColorStop(1, '#58646A');
      ctx.fillStyle = nkGrad;
      ctx.fillRect(brlL, -shR, tipL * 0.74, shR * 2);
      ctx.strokeRect(brlL, -shR, tipL * 0.74, shR * 2);

      // Two black bakelite TRS insulator rings
      ctx.fillStyle = '#1D1A18';
      ctx.fillRect(brlL + tipL * 0.44, -shR, Math.max(1.8, tipL * 0.055), shR * 2);
      ctx.fillRect(brlL + tipL * 0.68, -shR, Math.max(1.8, tipL * 0.055), shR * 2);

      // Conical TRS plug tip
      ctx.fillStyle = nkGrad;
      ctx.beginPath();
      ctx.moveTo(brlL + tipL * 0.74, -shR * 0.82);
      ctx.lineTo(brlL + tipL * 0.90, -shR * 1.06);
      ctx.quadraticCurveTo(brlL + tipL * 1.06, 0, brlL + tipL * 0.90, shR * 1.06);
      ctx.lineTo(brlL + tipL * 0.74, shR * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Ribbed Teal-Glazed Porcelain Stand-Off Insulators & Glowing Glass 12AX7 Vacuum Tubes on the Perch!
      const tubeGlow = clamp(0.32 + ((telem?.rmsL || 0) + (telem?.rmsR || 0)) * 0.68, 0.32, 1.0);
      for (const [vxN, vyN, tilt, isTube] of [
        [-0.56, 0.700, -0.24, false],
        [-0.76, 0.706, -0.34, true],
        [0.44, 0.688, 0.18, false],
        [0.64, 0.696, 0.28, true],
      ]) {
        const vp = this.model.toScreen(vxN, vyN);
        ctx.save();
        ctx.translate(vp.x, vp.y);
        ctx.rotate(tilt);

        if (!isTube) {
          // Ribbed glazed teal-ceramic stand-off insulator with brass terminal nut
          const insW = scale * 0.030;
          const insH = scale * 0.052;
          ctx.fillStyle = '#B88E46';
          ctx.fillRect(-insW * 0.56, -4, insW * 1.12, 6);
          for (let r = 0; r < 3; r++) {
            const ry = -8 - r * (insH * 0.30);
            const rw = insW * (1.0 - r * 0.12);
            const cg = ctx.createLinearGradient(-rw, ry, rw, ry);
            cg.addColorStop(0, '#7CA2AC');
            cg.addColorStop(0.45, '#4A6E78');
            cg.addColorStop(1, '#2B434B');
            ctx.fillStyle = cg;
            ctx.strokeStyle = 'rgba(28, 38, 42, 0.66)';
            ctx.lineWidth = 0.55;
            ctx.beginPath();
            ctx.ellipse(0, ry, rw * 0.58, insH * 0.16, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.fillStyle = '#D8AE60';
          ctx.beginPath();
          ctx.arc(0, -8 - insH * 0.82, Math.max(1.8, scale * 0.0065), 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Miniature 12AX7 glass dual-triode vacuum tube with warm glowing amber cathode filament!
          const tbW = scale * 0.040;
          const tbH = scale * 0.106;

          // Ambient warm filament bloom on cotton-rag paper
          const amb = ctx.createRadialGradient(0, -tbH * 0.48, 1, 0, -tbH * 0.48, tbW * 1.45);
          amb.addColorStop(0, `rgba(244, 146, 54, ${(0.28 * tubeGlow).toFixed(3)})`);
          amb.addColorStop(1, 'rgba(244, 146, 54, 0)');
          ctx.fillStyle = amb;
          ctx.beginPath();
          ctx.arc(0, -tbH * 0.48, tbW * 1.45, 0, Math.PI * 2);
          ctx.fill();

          // Brass & bakelite 9-pin noval socket collar gripping the cable
          ctx.fillStyle = '#2B2420';
          ctx.strokeStyle = 'rgba(24, 18, 14, 0.78)';
          ctx.lineWidth = 0.65;
          ctx.fillRect(-tbW * 0.56, -tbH * 0.14, tbW * 1.12, tbH * 0.20);
          ctx.strokeRect(-tbW * 0.56, -tbH * 0.14, tbW * 1.12, tbH * 0.20);
          ctx.fillStyle = '#C99C4E';
          ctx.fillRect(-tbW * 0.60, -2, tbW * 1.20, 4.5);

          // Translucent borosilicate glass envelope + chrome getter dome + central exhaust tip
          const buildBulb = () => {
            ctx.beginPath();
            ctx.moveTo(-tbW * 0.48, -tbH * 0.14);
            ctx.lineTo(-tbW * 0.48, -tbH * 0.76);
            ctx.quadraticCurveTo(-tbW * 0.46, -tbH * 0.96, -tbW * 0.10, -tbH * 0.98);
            ctx.lineTo(0, -tbH * 1.08);
            ctx.lineTo(tbW * 0.10, -tbH * 0.98);
            ctx.quadraticCurveTo(tbW * 0.46, -tbH * 0.96, tbW * 0.48, -tbH * 0.76);
            ctx.lineTo(tbW * 0.48, -tbH * 0.14);
            ctx.closePath();
          };
          buildBulb();
          const gls = ctx.createLinearGradient(-tbW * 0.5, 0, tbW * 0.5, 0);
          gls.addColorStop(0, 'rgba(236, 244, 242, 0.68)');
          gls.addColorStop(0.45, 'rgba(252, 246, 232, 0.38)');
          gls.addColorStop(1, 'rgba(148, 168, 174, 0.58)');
          ctx.fillStyle = gls;
          ctx.fill();

          // Internal dark-grey anode plates & mica spacers
          ctx.fillStyle = 'rgba(54, 62, 68, 0.78)';
          ctx.fillRect(-tbW * 0.26, -tbH * 0.70, tbW * 0.52, tbH * 0.42);
          ctx.strokeStyle = 'rgba(180, 172, 154, 0.72)';
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(-tbW * 0.38, -tbH * 0.72);
          ctx.lineTo(tbW * 0.38, -tbH * 0.72);
          ctx.moveTo(-tbW * 0.38, -tbH * 0.26);
          ctx.lineTo(tbW * 0.38, -tbH * 0.26);
          ctx.stroke();

          // Glowing orange-amber heater filament core!
          const fil = ctx.createRadialGradient(0, -tbH * 0.48, 0.5, 0, -tbH * 0.48, tbW * 0.36);
          fil.addColorStop(0, `rgba(255, 238, 172, ${(0.95 * tubeGlow).toFixed(3)})`);
          fil.addColorStop(0.45, `rgba(242, 118, 34, ${(0.86 * tubeGlow).toFixed(3)})`);
          fil.addColorStop(1, 'rgba(214, 72, 22, 0)');
          ctx.fillStyle = fil;
          ctx.beginPath();
          ctx.arc(0, -tbH * 0.48, tbW * 0.36, 0, Math.PI * 2);
          ctx.fill();

          // Silvered barium getter flash at top of glass dome
          ctx.save();
          buildBulb();
          ctx.clip();
          const getG = ctx.createLinearGradient(0, -tbH * 1.08, 0, -tbH * 0.74);
          getG.addColorStop(0, 'rgba(58, 68, 74, 0.84)');
          getG.addColorStop(0.65, 'rgba(148, 160, 166, 0.52)');
          getG.addColorStop(1, 'rgba(148, 160, 166, 0)');
          ctx.fillStyle = getG;
          ctx.fillRect(-tbW * 0.5, -tbH * 1.1, tbW, tbH * 0.38);
          ctx.restore();

          // Specular glass highlight + sepia-steel envelope contour
          ctx.strokeStyle = 'rgba(255, 253, 248, 0.76)';
          ctx.lineWidth = 0.80;
          ctx.beginPath();
          ctx.moveTo(-tbW * 0.32, -tbH * 0.20);
          ctx.lineTo(-tbW * 0.32, -tbH * 0.76);
          ctx.stroke();

          buildBulb();
          ctx.strokeStyle = 'rgba(46, 56, 62, 0.68)';
          ctx.lineWidth = 0.68;
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      const twigUp0 = this.model.toScreen(-0.52, 0.706);
      const twigUp1 = this.model.toScreen(-0.98, 0.635);
      const twigDn0 = this.model.toScreen(-0.58, 0.718);
      const twigDn1 = this.model.toScreen(-1.05, 0.842);
      const twigR0 = this.model.toScreen(0.46, 0.696);
      const twigR1 = this.model.toScreen(0.98, 0.805);

      // Delicate fading sepia-and-wash vignette branchlets (authentic unfinished edge of 19th-c. watercolor plates!)
      ctx.save();
      for (const [pA, pB, cX, cY, wBase] of [
        [twigUp0, twigUp1, 0.5 * (twigUp0.x + twigUp1.x) - scale * 0.04, twigUp0.y - scale * 0.02, 0.0085],
        [twigDn0, twigDn1, twigDn0.x - scale * 0.18, twigDn0.y + scale * 0.035, 0.0080],
        [twigR0, twigR1, twigR0.x + scale * 0.22, twigR0.y + scale * 0.022, 0.0075],
      ]) {
        const tg = ctx.createLinearGradient(pA.x, pA.y, pB.x, pB.y);
        tg.addColorStop(0, 'rgba(104, 78, 54, 0.86)');
        tg.addColorStop(0.65, 'rgba(116, 90, 64, 0.52)');
        tg.addColorStop(1, 'rgba(128, 102, 76, 0.08)');
        ctx.strokeStyle = tg;
        ctx.lineWidth = Math.max(1.5, scale * wBase);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.quadraticCurveTo(cX, cY, pB.x, pB.y);
        ctx.stroke();
      }
      ctx.restore();

      // Sinuous tapering main watercolor bough (allometrically thicker 1.40x forest limb for 1,000 g Superb Lyrebird!)
      const boughScale = plum.hasLyreTail ? 1.40 : 1.0;
      const bPtsTop = [
        this.model.toScreen(-1.12, 0.788),
        this.model.toScreen(-0.48, 0.702),
        this.model.toScreen(0.04, 0.674),
        this.model.toScreen(0.50, 0.692),
        this.model.toScreen(1.06, 0.748),
      ];
      const bThick = [0.038, 0.032, 0.026, 0.018, 0.003].map((v) => Math.max(1.4, scale * v * boughScale));

      ctx.save();
      const buildBough = () => {
        ctx.beginPath();
        ctx.moveTo(bPtsTop[0].x, bPtsTop[0].y + bThick[0] * 0.32);
        ctx.bezierCurveTo(bPtsTop[1].x, bPtsTop[1].y, bPtsTop[2].x - 32, bPtsTop[2].y, bPtsTop[2].x, bPtsTop[2].y);
        ctx.bezierCurveTo(bPtsTop[2].x + 32, bPtsTop[2].y, bPtsTop[3].x, bPtsTop[3].y, bPtsTop[4].x, bPtsTop[4].y);
        ctx.lineTo(bPtsTop[4].x + 3, bPtsTop[4].y + bThick[4] * 0.6);
        ctx.bezierCurveTo(
          bPtsTop[3].x, bPtsTop[3].y + bThick[3],
          bPtsTop[2].x + 32, bPtsTop[2].y + bThick[2],
          bPtsTop[2].x, bPtsTop[2].y + bThick[2]
        );
        ctx.bezierCurveTo(
          bPtsTop[2].x - 32, bPtsTop[2].y + bThick[2],
          bPtsTop[1].x, bPtsTop[1].y + bThick[1],
          bPtsTop[0].x, bPtsTop[0].y + bThick[0] * 0.76
        );
        ctx.closePath();
      };

      // Transparent sunlit raw-sienna & warm-umber watercolor bark wash (leaving paper-lit top highlight!)
      const barkGrad = ctx.createLinearGradient(0, bPtsTop[2].y - 2, 0, bPtsTop[0].y + bThick[0]);
      barkGrad.addColorStop(0, '#DFCEB2');
      barkGrad.addColorStop(0.24, '#B29574');
      barkGrad.addColorStop(0.66, '#7C6046');
      barkGrad.addColorStop(1, '#4C3726');
      buildBough();
      ctx.fillStyle = barkGrad;
      ctx.fill();

      ctx.clip();
      // Wet-into-wet watercolor moss & burnt-umber bark mottling in multiply mode
      ctx.globalCompositeOperation = 'multiply';
      for (const [lx, ly, lrx, col, al] of [
        [-0.68, 0.720, 0.068, '#9BA87E', 0.34],
        [-0.22, 0.688, 0.052, '#A8946C', 0.28],
        [0.12, 0.684, 0.046, '#7E5E42', 0.24],
        [0.36, 0.694, 0.054, '#9AA87C', 0.30],
      ]) {
        const lp = this.model.toScreen(lx, ly);
        const mg = ctx.createRadialGradient(lp.x, lp.y, 1, lp.x, lp.y, scale * lrx);
        mg.addColorStop(0, hexToRgba(col, al));
        mg.addColorStop(1, hexToRgba(col, 0));
        ctx.fillStyle = mg;
        ctx.fillRect(lp.x - scale * lrx, lp.y - scale * 0.04, scale * lrx * 2, scale * 0.08);
      }
      ctx.globalCompositeOperation = 'source-over';

      if (grain) {
        ctx.fillStyle = grain;
        ctx.fillRect(bPtsTop[0].x - 10, bPtsTop[2].y - 10, bPtsTop[4].x - bPtsTop[0].x + 20, 110);
      }

      // Fine sepia pen bark fissures & lenticel knots
      ctx.strokeStyle = 'rgba(42, 28, 18, 0.34)';
      ctx.lineWidth = 0.56;
      for (let f = 0; f < 7; f++) {
        const fyOff = (0.18 + (f / 6) * 0.74) * bThick[2];
        ctx.beginPath();
        ctx.moveTo(bPtsTop[0].x + f * 12, bPtsTop[0].y + fyOff * 0.9);
        ctx.quadraticCurveTo(bPtsTop[2].x, bPtsTop[2].y + fyOff, bPtsTop[4].x - f * 10, bPtsTop[4].y + fyOff * 0.25);
        ctx.stroke();
      }

      // Soft Whatman paper vignette fade on both extreme ends of the bough (hand-painted unfinished plate edges)
      const leftFade = ctx.createLinearGradient(bPtsTop[0].x, 0, bPtsTop[0].x + scale * 0.24, 0);
      leftFade.addColorStop(0, '#F5EFE0');
      leftFade.addColorStop(0.50, 'rgba(245, 239, 224, 0.52)');
      leftFade.addColorStop(1, 'rgba(245, 239, 224, 0)');
      ctx.fillStyle = leftFade;
      ctx.fillRect(bPtsTop[0].x - 6, bPtsTop[0].y - 14, scale * 0.26, bThick[0] + 28);

      const rightFade = ctx.createLinearGradient(bPtsTop[4].x - scale * 0.16, 0, bPtsTop[4].x + 6, 0);
      rightFade.addColorStop(0, 'rgba(245, 239, 224, 0)');
      rightFade.addColorStop(1, 'rgba(245, 239, 224, 0.78)');
      ctx.fillStyle = rightFade;
      ctx.fillRect(bPtsTop[4].x - scale * 0.16, bPtsTop[4].y - 12, scale * 0.18, 28);
      ctx.restore();

      // Crisp sepia-ink upper & lower bough contours fading softly toward vignette ends
      ctx.strokeStyle = 'rgba(56, 40, 26, 0.48)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.moveTo(bPtsTop[0].x + scale * 0.18, lerp(bPtsTop[0].y, bPtsTop[1].y, 0.30));
      ctx.bezierCurveTo(bPtsTop[1].x, bPtsTop[1].y, bPtsTop[2].x - 32, bPtsTop[2].y, bPtsTop[2].x, bPtsTop[2].y);
      ctx.bezierCurveTo(bPtsTop[2].x + 32, bPtsTop[2].y, bPtsTop[3].x, bPtsTop[3].y, bPtsTop[4].x - scale * 0.06, lerp(bPtsTop[3].y, bPtsTop[4].y, 0.88));
      ctx.stroke();

      // Foreground asymmetrical spring breeding-season watercolor leaves & blossoms anchored to the raised bough (zero autumn fruit!)
      if (flora === 'dogwood') {
        this._drawBotanicalLeaf(ctx, -0.68, 0.682, -2.88, 0.30, 0.118, '#6E8852', '#8AA068', 1, false);
        this._drawBotanicalLeaf(ctx, -0.82, 0.762, 2.52, 0.28, 0.110, '#5D7846', '#7C925C', -1, false);
        this._drawBotanicalLeaf(ctx, -0.94, 0.652, -2.42, 0.22, 0.090, '#829A66', '#98AE7A', 1, false);
        this._drawBotanicalLeaf(ctx, 0.58, 0.712, 0.28, 0.30, 0.116, '#708A54', '#8CA26A', 1, false);
        this._drawBotanicalLeaf(ctx, 0.78, 0.758, 0.58, 0.26, 0.104, '#617B49', '#7E945E', -1, false);
        this._drawDogwoodBlossom(ctx, -0.74, 0.676, 1.0);
        this._drawDogwoodBlossom(ctx, 0.72, 0.704, 0.90);
      } else if (flora === 'briar') {
        this._drawBotanicalLeaf(ctx, -0.68, 0.682, -2.86, 0.30, 0.112, '#4E6D42', '#7C8A56', 1, false);
        this._drawBotanicalLeaf(ctx, -0.82, 0.765, 2.52, 0.27, 0.102, '#5E7C4E', '#889460', -1, false);
        this._drawBotanicalLeaf(ctx, 0.58, 0.712, 0.30, 0.30, 0.112, '#4E6D42', '#7C8A56', 1, false);
        this._drawBotanicalLeaf(ctx, 0.78, 0.758, 0.58, 0.25, 0.098, '#5E7C4E', '#889460', 0, false);
        this._drawWildBlossom(ctx, -0.74, 0.674, '#FCF8EC', '#E5B842');
        this._drawWildBlossom(ctx, 0.72, 0.704, '#FFFDF5', '#E5B842');
      } else if (flora === 'mallow') {
        this._drawBotanicalLeaf(ctx, -0.70, 0.682, -2.82, 0.27, 0.132, '#849B6E', '#9E8362', 0, true);
        this._drawBotanicalLeaf(ctx, -0.84, 0.768, 2.48, 0.24, 0.114, '#738B5E', '#92795A', 0, true);
        this._drawBotanicalLeaf(ctx, 0.58, 0.712, 0.34, 0.27, 0.132, '#849B6E', '#9E8362', 0, true);
        this._drawBotanicalLeaf(ctx, 0.79, 0.758, 0.62, 0.23, 0.112, '#738B5E', '#92795A', 0, true);
        this._drawWildBlossom(ctx, -0.74, 0.674, '#F9E6DF', '#E2B448');
        this._drawWildBlossom(ctx, 0.72, 0.702, '#FAF0E6', '#E2B448');
      } else if (flora === 'wildrose') {
        this._drawBotanicalLeaf(ctx, -0.68, 0.682, -2.84, 0.27, 0.106, '#537345', '#829464', 0, false);
        this._drawBotanicalLeaf(ctx, -0.82, 0.765, 2.50, 0.25, 0.098, '#48683B', '#798B5C', -1, false);
        this._drawBotanicalLeaf(ctx, 0.58, 0.712, 0.30, 0.27, 0.106, '#537345', '#829464', 1, false);
        this._drawBotanicalLeaf(ctx, 0.78, 0.754, 0.58, 0.24, 0.094, '#48683B', '#798B5C', 0, false);
        this._drawWildBlossom(ctx, -0.74, 0.672, '#FAD8DC', '#E6B63E');
        this._drawWildBlossom(ctx, 0.70, 0.702, '#FCE6E8', '#E6B63E');
      } else if (flora === 'treefern') {
        // Position left fern fronds gently along the lower bough so the sweeping S-lyre tail plumes shine unobstructed!
        this._drawTreeFernFrond(ctx, -0.62, 0.730, 2.54, 0.30, -1);
        this._drawTreeFernFrond(ctx, -0.82, 0.758, 2.76, 0.24, -1);
        this._drawTreeFernFrond(ctx, 0.56, 0.708, 0.18, 0.38, 1);
        this._drawTreeFernFrond(ctx, 0.74, 0.742, 0.32, 0.29, 1);
      } else {
        this._drawPhyllodeLeaf(ctx, -0.66, 0.686, 2.52, 0.34);
        this._drawPhyllodeLeaf(ctx, -0.84, 0.660, -2.72, 0.28);
        this._drawPhyllodeLeaf(ctx, 0.58, 0.704, 0.56, 0.32);
        this._drawPhyllodeLeaf(ctx, 0.78, 0.746, 0.36, 0.28);
        this._drawWattlePomPoms(ctx, -0.76, 0.678);
        this._drawWattlePomPoms(ctx, 0.72, 0.690);
      }
    }

    // 3. Crown Plumes (Audubon Plate 159 / Fuertes Swept-Back Scarlet Cardinal Crest, Lyrebird Pileum, or SynthBird Telemetry Aerials!)
    if (plum.isCyborg) {
      // Twin swept-back machined brass & blued-steel cranial tuning aerials with porcelain bead tips
      ctx.save();
      for (const [bxOff, byOff, txOff, tyOff, beadCol] of [
        [-0.044, -0.104, -0.176, -0.212, '#1D566E'],
        [-0.078, -0.074, -0.194, -0.148, '#B83E24'],
      ]) {
        const bp = this.model.toScreen(headCx + bxOff, headCy + byOff);
        const tp = this.model.toScreen(headCx + txOff, headCy + tyOff);

        // Knurled brass feed-through bushing on occipital plate
        ctx.fillStyle = '#C99C4E';
        ctx.strokeStyle = 'rgba(42, 30, 16, 0.76)';
        ctx.lineWidth = 0.62;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, Math.max(2.6, scale * 0.0082), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tapered spring-steel aerial whip
        ctx.strokeStyle = 'rgba(44, 58, 66, 0.88)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(bp.x, bp.y);
        ctx.quadraticCurveTo(0.5 * (bp.x + tp.x) + 3, 0.5 * (bp.y + tp.y) - 3, tp.x, tp.y);
        ctx.stroke();

        // Glazed porcelain tip bead
        ctx.fillStyle = beadCol;
        ctx.strokeStyle = 'rgba(30, 24, 20, 0.72)';
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, Math.max(2.0, scale * 0.0064), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    } else if (plum.hasCrest) {
      const culY = headCy - (plum.culmenDepth ?? 0.094);
      const cFront = this.model.toScreen(headCx + 0.098, culY - 0.001);
      const cApex = this.model.toScreen(headCx - 0.090, headCy - 0.244);
      const cRear = this.model.toScreen(headCx - 0.136, headCy - 0.018);

      // Cohesive scarlet watercolor crest body sweeping in an organic convex-to-swept-back curve from culmen to peak!
      const crestBaseG = ctx.createLinearGradient(cRear.x, cRear.y, cApex.x + 12, cApex.y);
      crestBaseG.addColorStop(0, tonePigment(plum.crown, -0.22));
      crestBaseG.addColorStop(0.55, plum.crown);
      crestBaseG.addColorStop(1, tonePigment(plum.crown, 0.16));
      ctx.fillStyle = crestBaseG;
      ctx.beginPath();
      ctx.moveTo(cFront.x, cFront.y + 4);
      ctx.bezierCurveTo(
        cFront.x - scale * 0.036, cFront.y - scale * 0.068,
        cApex.x + scale * 0.072, cApex.y + scale * 0.016,
        cApex.x, cApex.y
      );
      ctx.bezierCurveTo(
        cApex.x - scale * 0.014, cApex.y + scale * 0.060,
        cRear.x - scale * 0.020, cRear.y - scale * 0.070,
        cRear.x + 6, cRear.y + 8
      );
      ctx.closePath();
      ctx.fill();

      // Fanned, softly pointed scarlet occipital crest plumes cascading down the back of the crest (Fuertes / Audubon!)
      const plumes = [
        [0.064, -0.092, -0.090, -0.244, 0.024],
        [0.038, -0.104, -0.114, -0.224, 0.023],
        [0.012, -0.108, -0.130, -0.198, 0.022],
        [-0.016, -0.106, -0.142, -0.170, 0.021],
        [-0.044, -0.098, -0.146, -0.138, 0.019],
        [-0.072, -0.084, -0.144, -0.106, 0.018],
        [-0.094, -0.066, -0.138, -0.078, 0.016],
      ];
      for (let i = plumes.length - 1; i >= 0; i--) {
        const [bx, by, tx, ty, pwNorm] = plumes[i];
        const bp = this.model.toScreen(headCx + bx, headCy + by + 0.014);
        const tp = this.model.toScreen(headCx + tx, headCy + ty);
        const pw = scale * pwNorm;
        const cg = ctx.createLinearGradient(bp.x, bp.y, tp.x, tp.y);
        cg.addColorStop(0, tonePigment(plum.crown, -0.18));
        cg.addColorStop(0.58, plum.crown);
        cg.addColorStop(1, tonePigment(plum.crown, 0.18));
        ctx.fillStyle = cg;
        ctx.strokeStyle = 'rgba(84, 14, 12, 0.26)';
        ctx.lineWidth = 0.46;
        ctx.beginPath();
        ctx.moveTo(bp.x + pw * 0.48, bp.y + 5);
        ctx.quadraticCurveTo(0.5 * (bp.x + tp.x) + pw * 0.34, 0.5 * (bp.y + tp.y) - pw * 0.22, tp.x, tp.y);
        ctx.quadraticCurveTo(0.5 * (bp.x + tp.x) - pw * 0.20, 0.5 * (bp.y + tp.y) + pw * 0.34, bp.x - pw * 0.48, bp.y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Crisp fine sepia-carmine pen line along the sweeping forecrown ridge
      ctx.strokeStyle = 'rgba(78, 16, 12, 0.42)';
      ctx.lineWidth = 0.58;
      ctx.beginPath();
      ctx.moveTo(cFront.x, cFront.y + 1);
      ctx.bezierCurveTo(
        cFront.x - scale * 0.036, cFront.y - scale * 0.068,
        cApex.x + scale * 0.072, cApex.y + scale * 0.016,
        cApex.x, cApex.y
      );
      ctx.stroke();
    } else if (plum.hasLyreTail) {
      for (let c = 3; c >= 0; c--) {
        const u = c / 3;
        const pPt = this.model.toScreen(
          lerp(headCx + 0.010, headCx - 0.078, u),
          lerp(headCy - 0.114, headCy - 0.068, u * u)
        );
        this._drawFeatherShingle(
          ctx,
          pPt.x,
          pPt.y,
          scale * 0.042,
          scale * 0.015,
          lerp(2.86, 2.44, u),
          plum.crown,
          (1.5 - c) * 0.03,
          0.62
        );
      }
    }

    // 4. Sleek, Athletic ~40-deg Perched Songbird Silhouette (Audubon / Gould / Keulemans Proportions — ZERO Pudgy Belly!)
    const isConicalBill = plum.billStyle === 'conical';
    const isCardinalBill = Boolean(plum.hasMask);
    const culmenRootY = headCy - (plum.culmenDepth ?? (isCardinalBill ? 0.094 : isConicalBill ? 0.076 : 0.066));
    const gonysRootY = headCy + (plum.gonysDepth ?? (isCardinalBill ? 0.022 : isConicalBill ? 0.008 : -0.004));

    const hCrown = this.model.toScreen(headCx - 0.010, headCy - 0.128 * m.headSlim);
    const occiput = this.model.toScreen(headCx - 0.120 * m.headSlim, headCy - 0.024);
    const napeHollow = this.model.toScreen(headCx - 0.156, headCy + 0.082);
    const mantleMid = this.model.toScreen(-0.172 * m.dorsalTrim, -0.092);
    const rumpBack = this.model.toScreen(-0.388 * m.dorsalTrim, 0.242);
    const tailBaseTop = this.model.toScreen(-0.460, 0.376);
    const tailBaseBot = this.model.toScreen(-0.360, 0.426);
    const undertailVent = this.model.toScreen(-0.185, 0.414 * m.bellyTuck);
    const bellyVentral = this.model.toScreen(
      0.052,
      Math.max(L.caudalBottomY + 0.062, 0.400 * m.bellyTuck) + 0.20 * breathLift
    );
    const breastLowerX = Math.max(0.228, 0.242 * m.chestTrim) + 0.42 * breathLift;
    const breastUpperX = Math.max(0.248, 0.266 * m.chestTrim) + 0.36 * breathLift;
    const gularFrontX = Math.max(headCx + 0.098, L.oecFrontX + 0.020);
    const throatHollowX = lerp(gularFrontX, breastUpperX, 0.56) - 0.005;

    const breastLower = this.model.toScreen(breastLowerX, 0.165);
    const breastUpper = this.model.toScreen(breastUpperX, -0.048);
    const throatHollow = this.model.toScreen(throatHollowX, -0.206);
    const gularFront = this.model.toScreen(gularFrontX, headCy + 0.068);
    const chinHinge = this.model.toScreen(headCx + 0.100, gonysRootY + 0.004);
    const beakRoot = this.model.toScreen(headCx + 0.092, headCy - 0.034);
    const foreheadTip = this.model.toScreen(headCx + 0.102, culmenRootY - 0.002);

    const buildBodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(hCrown.x, hCrown.y);
      ctx.bezierCurveTo(
        hCrown.x - scale * 0.064, hCrown.y + 1,
        occiput.x + scale * 0.012, occiput.y - scale * 0.046,
        occiput.x, occiput.y
      );
      ctx.bezierCurveTo(
        occiput.x - scale * 0.016, occiput.y + scale * 0.036,
        napeHollow.x + scale * 0.018, napeHollow.y - scale * 0.030,
        napeHollow.x, napeHollow.y
      );
      ctx.bezierCurveTo(
        napeHollow.x - scale * 0.048, napeHollow.y + scale * 0.048,
        mantleMid.x + scale * 0.068, mantleMid.y - scale * 0.066,
        mantleMid.x, mantleMid.y
      );
      ctx.bezierCurveTo(
        mantleMid.x - scale * 0.082, mantleMid.y + scale * 0.088,
        rumpBack.x + scale * 0.048, rumpBack.y - scale * 0.096,
        rumpBack.x, rumpBack.y
      );
      ctx.quadraticCurveTo(tailBaseTop.x + 4, 0.5 * (rumpBack.y + tailBaseTop.y), tailBaseTop.x, tailBaseTop.y);
      ctx.quadraticCurveTo(0.5 * (tailBaseTop.x + tailBaseBot.x) - 3, tailBaseBot.y + 3, tailBaseBot.x, tailBaseBot.y);
      ctx.quadraticCurveTo(
        0.5 * (tailBaseBot.x + undertailVent.x),
        0.5 * (tailBaseBot.y + undertailVent.y) + scale * 0.008,
        undertailVent.x,
        undertailVent.y
      );
      ctx.bezierCurveTo(
        undertailVent.x + scale * 0.075, undertailVent.y - scale * 0.004,
        bellyVentral.x - scale * 0.095, bellyVentral.y + scale * 0.008,
        bellyVentral.x, bellyVentral.y
      );
      ctx.bezierCurveTo(
        bellyVentral.x + scale * 0.132, bellyVentral.y - scale * 0.018,
        breastLower.x - scale * 0.016, breastLower.y + scale * 0.132,
        breastLower.x, breastLower.y
      );
      ctx.bezierCurveTo(
        breastLower.x + scale * 0.016, breastLower.y - scale * 0.092,
        breastUpper.x + scale * 0.010, breastUpper.y + scale * 0.096,
        breastUpper.x, breastUpper.y
      );
      ctx.bezierCurveTo(
        breastUpper.x - scale * 0.006, breastUpper.y - scale * 0.068,
        throatHollow.x + scale * 0.006, throatHollow.y + scale * 0.052,
        throatHollow.x, throatHollow.y
      );
      ctx.bezierCurveTo(
        throatHollow.x - scale * 0.004, throatHollow.y - scale * 0.048,
        gularFront.x + scale * 0.022, gularFront.y + scale * 0.042,
        gularFront.x, gularFront.y
      );
      ctx.bezierCurveTo(
        gularFront.x - scale * 0.008, gularFront.y - scale * 0.032,
        chinHinge.x + scale * 0.016, chinHinge.y + scale * 0.020,
        chinHinge.x, chinHinge.y
      );
      ctx.quadraticCurveTo(beakRoot.x, beakRoot.y, foreheadTip.x, foreheadTip.y);
      ctx.bezierCurveTo(
        foreheadTip.x - scale * 0.024, foreheadTip.y - scale * 0.034,
        hCrown.x + scale * 0.062, hCrown.y,
        hCrown.x, hCrown.y
      );
      ctx.closePath();
    };

    ctx.save();
    buildBodyPath();
    // Luminous Whatman rag-paper reserve base so subtractive watercolor glazes glow from within!
    ctx.fillStyle = '#FDF9EE';
    ctx.fill();
    ctx.clip();

    const bboxX = tailBaseTop.x - 28;
    const bboxY = hCrown.y - 28;
    const bboxW = (breastUpper.x - tailBaseTop.x) + 86;
    const bboxH = (bellyVentral.y - hCrown.y) + 80;
    const bellyCol = plum.bellyShade || plum.breast;

    if (plum.isCyborg) {
      // Retro-Analog 1960s Buchla/Moog Watercolor Metallic Chassis Armor (Brushed Aluminum, Slate-Teal Enamel & Bakelite)
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const chassisGrad = ctx.createLinearGradient(occiput.x, hCrown.y, breastUpper.x, bellyVentral.y);
      chassisGrad.addColorStop(0.0, 'rgba(66, 94, 106, 0.94)');     // Buchla slate-teal cranial dome
      chassisGrad.addColorStop(0.28, 'rgba(84, 108, 118, 0.90)');   // Anodized cervical collar
      chassisGrad.addColorStop(0.56, 'rgba(154, 166, 172, 0.86)');  // Brushed warm-aluminum thoracic shell
      chassisGrad.addColorStop(0.84, 'rgba(218, 224, 222, 0.88)');  // Sunlit satin-aluminum sternum
      chassisGrad.addColorStop(1.0, 'rgba(62, 72, 80, 0.92)');      // Dark gunmetal/bakelite lower keel
      ctx.fillStyle = chassisGrad;
      ctx.fillRect(bboxX, bboxY, bboxW, bboxH);
      ctx.restore();

      // Sunlit specular brushed-aluminum highlight band sweeping down the anterior throat & breastplate
      const specCenter = this.model.toScreen(0.185, 0.085);
      const specGrad = ctx.createRadialGradient(
        specCenter.x + scale * 0.03, specCenter.y - scale * 0.05, scale * 0.02,
        specCenter.x - scale * 0.02, specCenter.y + scale * 0.04, scale * 0.36
      );
      specGrad.addColorStop(0, 'rgba(252, 253, 250, 0.86)');
      specGrad.addColorStop(0.45, 'rgba(226, 232, 230, 0.56)');
      specGrad.addColorStop(1, 'rgba(164, 176, 182, 0)');
      ctx.fillStyle = specGrad;
      ctx.fillRect(bboxX, bboxY, bboxW, bboxH);

      // Fine diagonal brushed-metal hairline striations across chassis plates
      ctx.strokeStyle = 'rgba(255, 255, 252, 0.16)';
      ctx.lineWidth = 0.45;
      for (let s = -18; s < 28; s++) {
        const y0 = bboxY + s * (scale * 0.028);
        ctx.beginPath();
        ctx.moveTo(bboxX, y0);
        ctx.lineTo(bboxX + bboxW, y0 - scale * 0.14);
        ctx.stroke();
      }

      // Dark-bakelite & gunmetal lower ventral belly/flank chassis pan
      const panTopL = this.model.toScreen(-0.42, 0.31);
      const panTopM = this.model.toScreen(-0.04, 0.345);
      const panTopR = this.model.toScreen(0.22, 0.285);
      ctx.fillStyle = 'rgba(42, 50, 56, 0.64)';
      ctx.beginPath();
      ctx.moveTo(panTopL.x, panTopL.y);
      ctx.quadraticCurveTo(panTopM.x, panTopM.y + 6, panTopR.x, panTopR.y);
      ctx.lineTo(bboxX + bboxW, bboxY + bboxH);
      ctx.lineTo(bboxX, bboxY + bboxH);
      ctx.closePath();
      ctx.fill();

      // Articulated Copperplate Armor Seams & Bevel Highlights (Cranial Dome, Cervical Ring, Sternum Plate, Ventral Pan)
      const drawArmorSeam = (pts) => {
        ctx.strokeStyle = 'rgba(24, 32, 38, 0.72)';
        ctx.lineWidth = 0.92;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(252, 253, 248, 0.48)';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y + 1.15);
        ctx.quadraticCurveTo(pts[1].x, pts[1].y + 1.15, pts[2].x, pts[2].y + 1.15);
        ctx.stroke();
      };

      // 1. Cranial helmet visor seam
      drawArmorSeam([
        this.model.toScreen(headCx - 0.125, headCy - 0.032),
        this.model.toScreen(headCx - 0.015, headCy - 0.008),
        this.model.toScreen(headCx + 0.105, headCy + 0.012),
      ]);
      // 2. Articulated cervical neck-ring collar
      drawArmorSeam([
        this.model.toScreen(headCx - 0.158, headCy + 0.078),
        this.model.toScreen(headCx - 0.010, headCy + 0.105),
        this.model.toScreen(throatHollowX + 0.012, -0.205),
      ]);
      // 3. Dorsal scapular-to-sternum housing seam
      drawArmorSeam([
        this.model.toScreen(-0.24, -0.14),
        this.model.toScreen(0.02, -0.10),
        this.model.toScreen(0.27, -0.05),
      ]);
      // 4. Lower bakelite keel seam
      drawArmorSeam([panTopL, panTopM, panTopR]);

      // Circular recessed ear-transducer port on auricular cheek plate
      const earHub = this.model.toScreen(headCx - 0.024, headCy - 0.010);
      const earR = Math.max(4.2, scale * 0.018);
      ctx.fillStyle = 'rgba(42, 56, 64, 0.80)';
      ctx.strokeStyle = 'rgba(238, 224, 188, 0.65)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.arc(earHub.x, earHub.y, earR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#C99C4E';
      ctx.beginPath();
      ctx.arc(earHub.x, earHub.y, earR * 0.34, 0, Math.PI * 2);
      ctx.fill();

      // 5 Recessed Dorsal Mantle Cooling Louvers (warm amber vacuum-tube manifold glow proportional to breath pressure!)
      const ventGlow = clamp((this.model.dofs.pSub.value - 0.22) * 0.48, 0.08, 0.78);
      for (let v = 0; v < 5; v++) {
        const vu = v / 4;
        const vp0 = this.model.toScreen(lerp(-0.145, -0.285, vu), lerp(-0.155, 0.035, vu));
        const vp1 = this.model.toScreen(lerp(-0.085, -0.215, vu), lerp(-0.130, 0.060, vu));
        ctx.strokeStyle = 'rgba(22, 28, 34, 0.82)';
        ctx.lineWidth = Math.max(2.2, scale * 0.0075);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(vp0.x, vp0.y);
        ctx.lineTo(vp1.x, vp1.y);
        ctx.stroke();

        ctx.strokeStyle = `rgba(244, 138, 48, ${ventGlow.toFixed(3)})`;
        ctx.lineWidth = Math.max(1.0, scale * 0.0034);
        ctx.beginPath();
        ctx.moveTo(vp0.x + 0.8, vp0.y + 0.4);
        ctx.lineTo(vp1.x - 0.8, vp1.y - 0.2);
        ctx.stroke();
      }

      // Brass & steel micro-rivets along the anterior breastplate & cranial plates (outside cutaway!)
      const chassisRivets = [
        [headCx - 0.092, headCy - 0.044], [headCx - 0.052, headCy - 0.082], [headCx + 0.056, headCy - 0.088],
        [0.222, -0.14], [0.236, -0.04], [0.238, 0.06], [0.228, 0.16], [0.202, 0.25],
        [0.142, 0.358], [0.065, 0.376], [-0.015, 0.378], [-0.095, 0.368],
      ];
      for (const [rxN, ryN] of chassisRivets) {
        const rp = this.model.toScreen(rxN, ryN);
        ctx.fillStyle = '#D4AC62';
        ctx.strokeStyle = 'rgba(34, 26, 18, 0.68)';
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, Math.max(1.25, scale * 0.0040), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Cold-Press Whatman Watercolor Paper Granulation Across Cyborg Chassis
      if (grain) {
        ctx.fillStyle = grain;
        ctx.fillRect(bboxX, bboxY, bboxW, bboxH);
      }
      ctx.restore(); // End cyborg body clip

      // Crisp Copperplate Outer Chassis Contour (skipping downy ventral feather tufts!)
      buildBodyPath();
      ctx.strokeStyle = 'rgba(34, 44, 50, 0.62)';
      ctx.lineWidth = 0.82;
      ctx.stroke();
    } else {
      // (a) Transparent Wet-on-Wet Watercolor Base Wash (Crown -> Nape -> Mantle -> Sunlit Breast)
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const dorsalGrad = ctx.createLinearGradient(occiput.x, hCrown.y, breastUpper.x, bellyVentral.y * 0.5 + breastLower.y * 0.5);
      dorsalGrad.addColorStop(0, hexToRgba(plum.crown, 0.95));
      dorsalGrad.addColorStop(0.24, hexToRgba(plum.nape || plum.crown, 0.92));
      if (plum.hasSpots) {
        // Hylocichla mustelina field mark: bright cinnamon-rufous crown/nape grading into warm olive-brown mantle & rump!
        dorsalGrad.addColorStop(0.46, hexToRgba('#8C6A42', 0.90));
        dorsalGrad.addColorStop(0.68, hexToRgba('#766644', 0.88));
      } else {
        dorsalGrad.addColorStop(0.56, hexToRgba(plum.body, 0.88));
      }
      dorsalGrad.addColorStop(0.84, hexToRgba(plum.breast, 0.86));
      dorsalGrad.addColorStop(1, hexToRgba(bellyCol, 0.90));
      ctx.fillStyle = dorsalGrad;
      ctx.fillRect(bboxX, bboxY, bboxW, bboxH);
      ctx.restore();

      // (b) Luminous Sunlit Paper-Reserve Throat & Upper Breast Glaze (lifting dorsal pigment cleanly off ventral plumage)
      if (!plum.hasMask) {
        const gularPt = this.model.toScreen(headCx + 0.072, headCy + 0.078);
        const gularCol = plum.cheek || plum.breast;
        const gularGrad = ctx.createRadialGradient(
          gularPt.x + scale * 0.02, gularPt.y - scale * 0.01, scale * 0.015,
          gularPt.x, gularPt.y, scale * 0.21
        );
        gularGrad.addColorStop(0, tonePigment(plum.breast, 0.24, 0.96));
        gularGrad.addColorStop(0.56, hexToRgba(gularCol, 0.72));
        gularGrad.addColorStop(0.86, hexToRgba(gularCol, 0.20));
        gularGrad.addColorStop(1, hexToRgba(gularCol, 0));
        ctx.fillStyle = gularGrad;
        ctx.fillRect(bboxX, bboxY, bboxW, bboxH);

        if (plum.throatPatch) {
          const chinPt = this.model.toScreen(headCx + 0.078, headCy + 0.032);
          const tg = ctx.createRadialGradient(chinPt.x, chinPt.y, 2, chinPt.x - scale * 0.01, chinPt.y + scale * 0.015, scale * 0.102);
          tg.addColorStop(0, hexToRgba(plum.throatPatch, 0.88));
          tg.addColorStop(0.62, hexToRgba(plum.throatPatch, 0.52));
          tg.addColorStop(1, hexToRgba(plum.throatPatch, 0));
          ctx.fillStyle = tg;
          ctx.fillRect(bboxX, bboxY, bboxW, bboxH);
        }
      }

      const breastCenter = this.model.toScreen(0.155, 0.145);
      const breastGrad = ctx.createRadialGradient(
        breastCenter.x + scale * 0.055, breastCenter.y - scale * 0.06, scale * 0.03,
        breastCenter.x - scale * 0.03, breastCenter.y + scale * 0.04, scale * 0.39
      );
      breastGrad.addColorStop(0, tonePigment(plum.breast, 0.26, 0.94));
      breastGrad.addColorStop(0.46, hexToRgba(plum.breast, 0.88));
      breastGrad.addColorStop(0.76, hexToRgba(bellyCol, 0.56));
      breastGrad.addColorStop(0.94, hexToRgba(bellyCol, 0.14));
      breastGrad.addColorStop(1, hexToRgba(bellyCol, 0));
      ctx.fillStyle = breastGrad;
      ctx.fillRect(bboxX, bboxY, bboxW, bboxH);

      // Soft, rimless wet-into-wet pigment richness on crown & mantle + warm cylindrical form shadow along lower flank
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const crownBloom = ctx.createRadialGradient(
        occiput.x + scale * 0.03, hCrown.y + scale * 0.06, 2,
        occiput.x + scale * 0.03, hCrown.y + scale * 0.06, scale * 0.16
      );
      crownBloom.addColorStop(0, hexToRgba(plum.crown, 0.16));
      crownBloom.addColorStop(1, hexToRgba(plum.crown, 0));
      ctx.fillStyle = crownBloom;
      ctx.fillRect(bboxX, bboxY, bboxW, bboxH);

      const formShadow = ctx.createLinearGradient(
        this.model.toScreen(0.24, -0.06).x,
        this.model.toScreen(0.24, -0.06).y,
        this.model.toScreen(-0.30, 0.44).x,
        this.model.toScreen(-0.30, 0.44).y
      );
      formShadow.addColorStop(0, tonePigment(bellyCol, -0.25, 0));
      formShadow.addColorStop(0.64, tonePigment(bellyCol, -0.25, 0.04));
      formShadow.addColorStop(1, tonePigment(bellyCol, -0.36, 0.20));
      ctx.fillStyle = formShadow;
      ctx.fillRect(bboxX, bboxY, bboxW, bboxH);
      ctx.restore();

      // (c) Delicate Sable-Brush Watercolor Feather Crescents Across Crown, Mantle, Breast & Flank (*Pterylae*)
      for (const sh of this._featherShingles) {
        const nx = sh.zone === 'crown' ? headCx + sh.nx : sh.nx;
        const ny = sh.zone === 'crown' ? headCy + sh.ny : sh.ny;
        const pt = this.model.toScreen(nx, ny);
        const zoneCol =
          sh.zone === 'crown'
            ? plum.crown
            : sh.zone === 'mantle'
              ? plum.body
              : sh.zone === 'breast'
                ? plum.breast
                : bellyCol;
        this._drawFeatherShingle(
          ctx,
          pt.x,
          pt.y,
          scale * sh.len,
          scale * sh.wid,
          sh.ang,
          zoneCol,
          sh.tone,
          sh.alpha
        );
      }

      // (d) Silky Radiating Auricular (Ear-Covert) Feather Patch
      if (!plum.cheekPatch && !plum.hasMask) {
        const aurOrigin = this.model.toScreen(headCx + 0.012, headCy - 0.030);
        const aurWash = ctx.createRadialGradient(
          aurOrigin.x - scale * 0.028, aurOrigin.y + scale * 0.018, 2,
          aurOrigin.x - scale * 0.028, aurOrigin.y + scale * 0.018, scale * 0.064
        );
        aurWash.addColorStop(0, tonePigment(plum.crown, -0.14, 0.24));
        aurWash.addColorStop(1, tonePigment(plum.crown, -0.14, 0));
        ctx.fillStyle = aurWash;
        ctx.beginPath();
        ctx.arc(aurOrigin.x - scale * 0.028, aurOrigin.y + scale * 0.018, scale * 0.064, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 0.48;
        for (let a = 0; a < 20; a++) {
          const u = a / 19;
          const ang = lerp(2.42, 3.04, u);
          const r0 = scale * (0.015 + (a % 3) * 0.006);
          const r1 = r0 + scale * (0.030 + 0.012 * Math.sin(u * Math.PI));
          ctx.strokeStyle = a % 3 === 0
            ? tonePigment(plum.cheek || plum.breast, 0.22, 0.28)
            : 'rgba(52, 36, 22, 0.18)';
          ctx.beginPath();
          ctx.moveTo(aurOrigin.x + Math.cos(ang) * r0, aurOrigin.y + Math.sin(ang) * r0 * 0.72);
          ctx.quadraticCurveTo(
            aurOrigin.x + Math.cos(ang + 0.08) * (0.5 * (r0 + r1)),
            aurOrigin.y + Math.sin(ang + 0.08) * (0.5 * (r0 + r1)) * 0.78 + 1.0,
            aurOrigin.x + Math.cos(ang + 0.14) * r1,
            aurOrigin.y + Math.sin(ang + 0.14) * r1 * 0.82 + 1.8
          );
          ctx.stroke();
        }
      }

      // (e) Species-Specific Watercolor Field Marks (Gould Zebra Finch & Audubon Plate LXXIII Wood Thrush)
      if (plum.cheekPatch) {
        const chk = this.model.toScreen(headCx - 0.032, headCy - 0.004);
        const cg = ctx.createRadialGradient(chk.x + 2, chk.y - 2, 2, chk.x, chk.y, scale * 0.052);
        cg.addColorStop(0, '#F58540');
        cg.addColorStop(0.68, plum.cheekPatch);
        cg.addColorStop(0.92, 'rgba(182, 70, 26, 0.72)');
        cg.addColorStop(1, 'rgba(182, 70, 26, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(chk.x, chk.y, scale * 0.050, scale * 0.042, -0.14, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 0.48;
        for (let k = 0; k < 12; k++) {
          const u = k / 11;
          const fy = chk.y - scale * 0.028 + u * scale * 0.056;
          ctx.strokeStyle = k % 2 === 0 ? 'rgba(255, 198, 138, 0.34)' : 'rgba(128, 44, 14, 0.26)';
          ctx.beginPath();
          ctx.moveTo(chk.x + scale * 0.028, fy - 1.0);
          ctx.quadraticCurveTo(chk.x, fy + 0.7, chk.x - scale * 0.042, fy + 2.2);
          ctx.stroke();
        }

        // White lore patch framed by posterior tear-drop stripe & anterior black malar border (Gould Plate!)
        const lorePt = this.model.toScreen(headCx + 0.068, headCy - 0.022);
        const lg = ctx.createRadialGradient(lorePt.x, lorePt.y, 1, lorePt.x, lorePt.y, scale * 0.036);
        lg.addColorStop(0, 'rgba(253, 250, 242, 0.96)');
        lg.addColorStop(0.76, 'rgba(248, 242, 230, 0.82)');
        lg.addColorStop(1, 'rgba(248, 242, 230, 0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.ellipse(lorePt.x, lorePt.y, scale * 0.028, scale * 0.040, 0.10, 0, Math.PI * 2);
        ctx.fill();

        const tearTop = this.model.toScreen(headCx + 0.036, headCy - 0.036);
        const tearBot = this.model.toScreen(headCx + 0.040, headCy + 0.024);
        const malarTop = this.model.toScreen(headCx + 0.090, headCy - 0.026);
        const malarBot = this.model.toScreen(headCx + 0.094, headCy + 0.020);
        ctx.strokeStyle = 'rgba(22, 17, 15, 0.90)';
        ctx.lineWidth = Math.max(1.5, scale * 0.0092);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tearTop.x, tearTop.y);
        ctx.quadraticCurveTo(tearTop.x + 1.5, 0.5 * (tearTop.y + tearBot.y), tearBot.x, tearBot.y);
        ctx.moveTo(malarTop.x, malarTop.y);
        ctx.quadraticCurveTo(malarTop.x - 1.0, 0.5 * (malarTop.y + malarBot.y), malarBot.x, malarBot.y);
        ctx.stroke();
      }

      if (plum.hasSpots) {
        // Audubon Plate LXXIII Wood Thrush: Crisp dark submalar streak + cordate sepia-umber watercolor breast & flank spots!
        const mal0 = this.model.toScreen(headCx + 0.094, headCy + 0.002);
        const mal1 = this.model.toScreen(headCx + 0.048, headCy + 0.018);
        ctx.strokeStyle = 'rgba(42, 24, 14, 0.70)';
        ctx.lineWidth = Math.max(1.2, scale * 0.0060);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mal0.x, mal0.y);
        ctx.quadraticCurveTo(0.5 * (mal0.x + mal1.x) + 1.2, 0.5 * (mal0.y + mal1.y) + 1.2, mal1.x, mal1.y);
        ctx.stroke();

        const spots = [
          // Gular & upper pectoral collar outside smooth throat contour
          [0.232, -0.22, 0.72], [0.244, -0.17, 0.78], [0.250, -0.11, 0.84],
          // Sleek right breast rows outside cutaway
          [0.236, -0.05, 0.90], [0.252, -0.01, 0.92], [0.234, 0.05, 0.92],  [0.248, 0.10, 0.94],
          [0.228, 0.15, 0.92],  [0.238, 0.20, 0.88],  [0.212, 0.25, 0.88],  [0.188, 0.295, 0.86],
          // Lower breast & taut ventral belly rows below air-sac cutaway
          [0.156, 0.345, 0.88], [0.110, 0.368, 0.90], [0.060, 0.380, 0.90], [0.008, 0.378, 0.88],
          [-0.046, 0.372, 0.86], [-0.102, 0.366, 0.86], [-0.158, 0.362, 0.84],
          // Lateral flank tracts between cutaway & sleek folded wing
          [-0.088, 0.16, 0.84], [-0.118, 0.21, 0.90], [-0.096, 0.26, 0.88], [-0.146, 0.28, 0.92],
          [-0.122, 0.32, 0.88], [-0.188, 0.33, 0.90], [-0.232, 0.35, 0.84],
        ];
        for (const [sx, sy, sz] of spots) {
          const spPt = this.model.toScreen(sx, sy);
          // Hylocichla mustelina field mark: bold round-oval sepia-black spots (not elongated streaks/teardrops!)
          const rx = scale * 0.0126 * sz;
          const ry = scale * 0.0144 * sz;
          ctx.save();
          ctx.translate(spPt.x, spPt.y);
          ctx.rotate(-0.14 + sx * 0.18);
          const sg = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, ry * 1.12);
          sg.addColorStop(0, 'rgba(24, 13, 7, 0.95)');
          sg.addColorStop(0.74, 'rgba(46, 25, 13, 0.86)');
          sg.addColorStop(1, 'rgba(84, 48, 24, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // (f) Fine Sable-Brush Watercolor Barbule Hairlines + Subtle Wild-Plumage Mantle Shaft-Streaks
      const barbRng = mulberry32(18910422);
      ctx.lineCap = 'round';

      const isCanary = this.model.currentSpecies.id === 'yellow_canary';
      const streakAlpha = isCanary ? 0.03 : plum.hasCrest ? 0.12 : plum.hasSpots ? 0.18 : 0.24;
      for (let s = 0; s < 18; s++) {
        const u = s / 17;
        const sx = lerp(-0.08, -0.37, u) + (barbRng() - 0.5) * 0.036;
        const sy = lerp(-0.22, 0.23, u) + (barbRng() - 0.5) * 0.044;
        const p0 = this.model.toScreen(sx, sy);
        const p1 = this.model.toScreen(sx - 0.038, sy + 0.042);
        ctx.strokeStyle = tonePigment(plum.wingEdge || plum.body, -0.35, streakAlpha);
        ctx.lineWidth = Math.max(0.70, scale * 0.0036);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(0.5 * (p0.x + p1.x) - 1.2, 0.5 * (p0.y + p1.y) + 0.8, p1.x, p1.y);
        ctx.stroke();

        ctx.strokeStyle = tonePigment(plum.wingBar || plum.body, 0.26, streakAlpha * 0.75);
        ctx.lineWidth = Math.max(0.55, scale * 0.0026);
        ctx.beginPath();
        ctx.moveTo(p0.x + 1.2, p0.y - 0.7);
        ctx.lineTo(p1.x + 1.2, p1.y - 0.7);
        ctx.stroke();
      }

      ctx.lineWidth = 0.48;
      for (let b = 0; b < 190; b++) {
        const rx = lerp(-0.42, 0.28, barbRng());
        const ry = lerp(-0.44, 0.40, barbRng());
        // Skip interior of diagonal dissection cavity
        if (rx > -0.08 && rx < 0.22 && ry > -0.26 && ry < 0.35) continue;

        const isHead = ry < -0.20;
        const nx = isHead ? headCx + (rx + 0.04) * 0.36 : rx;
        const ny = isHead ? headCy + (ry + 0.33) * 0.48 : ry;

        const flowAng = isHead
          ? lerp(2.85, 2.30, clamp((headCx + 0.09 - nx) / 0.24, 0, 1))
          : nx > 0.14
            ? lerp(1.65, 1.98, clamp((ny + 0.24) / 0.62, 0, 1))
            : lerp(2.28, 2.04, clamp((ny + 0.20) / 0.62, 0, 1));

        const lenNorm = isHead ? 0.019 + barbRng() * 0.010 : 0.028 + barbRng() * 0.016;
        const p0 = this.model.toScreen(nx, ny);
        const p1 = this.model.toScreen(
          nx + Math.cos(flowAng) * lenNorm,
          ny + Math.sin(flowAng) * lenNorm
        );

        const sunlit = barbRng() > 0.56;
        const baseCol = isHead ? plum.crown : nx > 0.12 ? plum.breast : ny > 0.30 ? bellyCol : plum.body;
        ctx.strokeStyle = sunlit
          ? tonePigment(baseCol, 0.28, 0.18 + barbRng() * 0.12)
          : tonePigment(baseCol, -0.38, 0.16 + barbRng() * 0.12);

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(0.5 * (p0.x + p1.x), 0.5 * (p0.y + p1.y) + 0.9, p1.x, p1.y);
        ctx.stroke();
      }

      if (plum.hasZebraBars) {
        // John Gould & H.C. Richter (Amadina castanotis): fine undulating throat ripples + velvety black breast crescent!
        for (let b = 0; b < 13; b++) {
          const by = -0.262 + b * 0.0154;
          const pBarL = this.model.toScreen(0.194, by + 0.010);
          const pBarR = this.model.toScreen(0.285, by - 0.005);
          const barG = ctx.createLinearGradient(pBarL.x, pBarL.y, pBarR.x, pBarR.y);
          if (b % 2 === 0) {
            barG.addColorStop(0, 'rgba(30, 24, 22, 0.18)');
            barG.addColorStop(0.28, 'rgba(30, 24, 22, 0.78)');
            barG.addColorStop(1, 'rgba(30, 24, 22, 0.86)');
          } else {
            barG.addColorStop(0, 'rgba(252, 249, 242, 0.20)');
            barG.addColorStop(0.28, 'rgba(252, 249, 242, 0.88)');
            barG.addColorStop(1, 'rgba(252, 249, 242, 0.94)');
          }
          ctx.strokeStyle = barG;
          ctx.lineWidth = Math.max(0.85, scale * 0.0042);
          ctx.beginPath();
          ctx.moveTo(pBarL.x, pBarL.y);
          ctx.quadraticCurveTo(0.5 * (pBarL.x + pBarR.x), pBarL.y + 2.6, pBarR.x, pBarR.y);
          ctx.stroke();
        }

        // Feathered velvet-black pectoral crescent band separating throat ripples from pearl-white belly
        const bandL = this.model.toScreen(0.206, -0.052);
        const bandR = this.model.toScreen(0.288, -0.064);
        const bandG = ctx.createLinearGradient(bandL.x, bandL.y, bandR.x, bandR.y);
        bandG.addColorStop(0, 'rgba(22, 16, 15, 0.36)');
        bandG.addColorStop(0.26, 'rgba(22, 16, 15, 0.92)');
        bandG.addColorStop(1, 'rgba(22, 16, 15, 0.95)');
        ctx.fillStyle = bandG;
        ctx.beginPath();
        ctx.moveTo(bandL.x, bandL.y - scale * 0.007);
        ctx.quadraticCurveTo(0.5 * (bandL.x + bandR.x), bandL.y - scale * 0.001, bandR.x, bandR.y - scale * 0.010);
        ctx.lineTo(bandR.x, bandR.y + scale * 0.011);
        ctx.quadraticCurveTo(0.5 * (bandL.x + bandR.x), bandL.y + scale * 0.017, bandL.x, bandL.y + scale * 0.008);
        ctx.closePath();
        ctx.fill();

        // Rich rufous-chestnut flank plumage tract hugging beneath the folded wing cleanly clear of the cutaway border!
        const flkTopR = this.model.toScreen(-0.098, 0.228);
        const flkTopL = this.model.toScreen(-0.342, 0.348);
        const flkBotL = this.model.toScreen(-0.272, 0.400);
        const flkBotR = this.model.toScreen(-0.088, 0.304);
        const flkG = ctx.createLinearGradient(flkTopR.x, flkTopR.y, flkBotL.x, flkBotL.y);
        flkG.addColorStop(0, 'rgba(184, 68, 24, 0.88)');
        flkG.addColorStop(0.60, 'rgba(168, 58, 20, 0.90)');
        flkG.addColorStop(1, 'rgba(142, 48, 16, 0.68)');
        ctx.fillStyle = flkG;
        ctx.beginPath();
        ctx.moveTo(flkTopR.x, flkTopR.y);
        ctx.quadraticCurveTo(0.5 * (flkTopR.x + flkTopL.x), 0.5 * (flkTopR.y + flkTopL.y) - scale * 0.014, flkTopL.x, flkTopL.y);
        ctx.quadraticCurveTo(0.5 * (flkTopL.x + flkBotL.x) - 3, 0.5 * (flkTopL.y + flkBotL.y) + 2, flkBotL.x, flkBotL.y);
        ctx.quadraticCurveTo(0.5 * (flkBotL.x + flkBotR.x) + 4, 0.5 * (flkBotL.y + flkBotR.y) + scale * 0.010, flkBotR.x, flkBotR.y);
        ctx.quadraticCurveTo(flkTopR.x + scale * 0.008, 0.5 * (flkTopR.y + flkBotR.y), flkTopR.x, flkTopR.y);
        ctx.closePath();
        ctx.fill();

        const whiteDots = [
          [-0.116, 0.254], [-0.152, 0.274], [-0.190, 0.296], [-0.228, 0.318], [-0.266, 0.340],
          [-0.128, 0.290], [-0.168, 0.312], [-0.208, 0.334], [-0.248, 0.356], [-0.284, 0.376],
        ];
        for (const [wx, wy] of whiteDots) {
          const wp = this.model.toScreen(wx, wy);
          ctx.fillStyle = 'rgba(72, 24, 10, 0.32)';
          ctx.beginPath();
          ctx.ellipse(wp.x + 0.5, wp.y + 0.5, scale * 0.0086, scale * 0.0058, -0.48, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(254, 251, 244, 0.96)';
          ctx.beginPath();
          ctx.ellipse(wp.x, wp.y, scale * 0.0078, scale * 0.0052, -0.48, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // (g) Cold-Press Whatman Watercolor Paper Granulation Across Bird Plumage
      if (grain) {
        ctx.fillStyle = grain;
        ctx.fillRect(bboxX, bboxY, bboxW, bboxH);
      }

      ctx.restore(); // End body clip

      // (h) Hairline Sepia Watercolor Contour + Delicate Downy Ventral Crescents Rooted Strictly Inside the Sleek Edge
      buildBodyPath();
      ctx.strokeStyle = 'rgba(56, 38, 24, 0.30)';
      ctx.lineWidth = 0.65;
      ctx.stroke();

      const evalCubicPt = (a, b, c, dPt, t) => {
        const om = 1 - t;
        return {
          x: om * om * om * a.x + 3 * om * om * t * b.x + 3 * om * t * t * c.x + t * t * t * dPt.x,
          y: om * om * om * a.y + 3 * om * om * t * b.y + 3 * om * t * t * c.y + t * t * t * dPt.y,
        };
      };

      ctx.save();
      const c1a = { x: undertailVent.x + scale * 0.075, y: undertailVent.y - scale * 0.004 };
      const c1b = { x: bellyVentral.x - scale * 0.095, y: bellyVentral.y + scale * 0.008 };
      const c2a = { x: bellyVentral.x + scale * 0.132, y: bellyVentral.y - scale * 0.018 };
      const c2b = { x: breastLower.x - scale * 0.016, y: breastLower.y + scale * 0.132 };

      for (let i = 0; i < 20; i++) {
        const u = (i + 0.5) / 20;
        const pt = u < 0.48
          ? evalCubicPt(undertailVent, c1a, c1b, bellyVentral, u / 0.48)
          : evalCubicPt(bellyVentral, c2a, c2b, breastLower, (u - 0.48) / 0.52);
        const tuftCol = u < 0.52 ? bellyCol : plum.breast;
        this._drawFeatherShingle(
          ctx,
          pt.x + (u < 0.48 ? 2 : -4),
          pt.y - 3.5,
          scale * 0.024,
          scale * 0.009,
          lerp(2.48, 1.88, u),
          tuftCol,
          -0.04,
          0.34
        );
      }
      ctx.restore();
    }

    // 5. Sleek Five-Tiered Hand-Painted Folded Wing (or Articulated Stamped-Metal Cyborg Wing & Patch Wires!)
    const wr = m.wingReach ?? 1.0;
    const wCarpal = this.model.toScreen(-0.082, -0.114);
    const wScapular = this.model.toScreen(-0.215 * m.dorsalTrim, -0.098);
    const wDorsalMid = this.model.toScreen(-0.435 * wr, 0.228);
    const wTip = this.model.toScreen(-0.618 * wr, 0.512 * wr);
    const wVentralLow = this.model.toScreen(-0.348 * wr, 0.338);
    const wVentralHigh = this.model.toScreen(-0.154, 0.108);

    const buildCovertWingBed = () => {
      ctx.beginPath();
      ctx.moveTo(wCarpal.x, wCarpal.y);
      ctx.quadraticCurveTo(0.5 * (wCarpal.x + wScapular.x) + 3, wCarpal.y - scale * 0.018, wScapular.x, wScapular.y);
      ctx.bezierCurveTo(
        wScapular.x - scale * 0.075, wScapular.y + scale * 0.085,
        wDorsalMid.x + scale * 0.042, wDorsalMid.y - scale * 0.078,
        wDorsalMid.x, wDorsalMid.y
      );
      ctx.quadraticCurveTo(0.5 * (wDorsalMid.x + wVentralLow.x), wVentralLow.y - 3, wVentralLow.x, wVentralLow.y - scale * 0.012);
      ctx.bezierCurveTo(
        wVentralLow.x + scale * 0.075, wVentralLow.y - scale * 0.055,
        wVentralHigh.x - scale * 0.032, wVentralHigh.y + scale * 0.072,
        wVentralHigh.x, wVentralHigh.y
      );
      ctx.bezierCurveTo(
        wVentralHigh.x + scale * 0.036, wVentralHigh.y - scale * 0.080,
        wCarpal.x + scale * 0.024, wCarpal.y + scale * 0.046,
        wCarpal.x, wCarpal.y
      );
      ctx.closePath();
    };

    if (plum.isCyborg) {
      ctx.save();
      // Cast shadow of articulated mechanical wing onto chassis flank
      ctx.fillStyle = 'rgba(20, 28, 34, 0.18)';
      ctx.beginPath();
      ctx.moveTo(wCarpal.x + 3, wCarpal.y + 5);
      ctx.bezierCurveTo(wVentralHigh.x + 8, wVentralHigh.y + 8, wVentralLow.x + 8, wVentralLow.y + 7, wTip.x + 4, wTip.y + 3);
      ctx.lineTo(wTip.x, wTip.y);
      ctx.bezierCurveTo(wVentralLow.x, wVentralLow.y, wVentralHigh.x, wVentralHigh.y, wCarpal.x, wCarpal.y);
      ctx.closePath();
      ctx.fill();

      // (i) 6 Stamped Blued-Steel & Brushed-Aluminum Primary Airfoil Blades (with milled lightening slots!)
      for (let pIdx = 0; pIdx < 6; pIdx++) {
        const u = pIdx / 5;
        const pRoot = this.model.toScreen(lerp(-0.225, -0.355, u) * wr, lerp(0.145, 0.132, u));
        const pTipPt = this.model.toScreen(lerp(-0.415, -0.618, u) * wr, lerp(0.345, 0.512, u) * wr);
        const ang = Math.atan2(pTipPt.y - pRoot.y, pTipPt.x - pRoot.x);
        const len = Math.hypot(pTipPt.x - pRoot.x, pTipPt.y - pRoot.y);
        const fw = scale * 0.023;

        ctx.save();
        ctx.translate(pRoot.x, pRoot.y);
        ctx.rotate(ang);

        const isSteel = pIdx % 2 === 0;
        const bg = ctx.createLinearGradient(0, -fw * 0.5, 0, fw * 0.5);
        bg.addColorStop(0, isSteel ? '#6C8490' : '#DCE2E4');
        bg.addColorStop(0.5, isSteel ? '#3A4E58' : '#A2AEB4');
        bg.addColorStop(1, isSteel ? '#1E2A30' : '#647076');
        ctx.fillStyle = bg;
        ctx.strokeStyle = 'rgba(22, 30, 36, 0.74)';
        ctx.lineWidth = 0.60;
        ctx.beginPath();
        ctx.moveTo(0, -fw * 0.42);
        ctx.lineTo(len * 0.88, -fw * 0.36);
        ctx.lineTo(len, -fw * 0.04);
        ctx.lineTo(len * 0.88, fw * 0.34);
        ctx.lineTo(0, fw * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Milled oblong lightening slot on each blade
        ctx.fillStyle = 'rgba(20, 26, 30, 0.52)';
        ctx.beginPath();
        ctx.ellipse(len * 0.56, 0, len * 0.16, fw * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // (ii) Two-Tone Buchla Slate-Teal & Brushed-Aluminum Upper Wing Cowling
      const wg = ctx.createLinearGradient(wCarpal.x, wCarpal.y, wDorsalMid.x, wVentralLow.y);
      wg.addColorStop(0, '#5A7986');
      wg.addColorStop(0.46, '#435E6A');
      wg.addColorStop(0.76, '#A6B2B8');
      wg.addColorStop(1, '#68767E');
      buildCovertWingBed();
      ctx.fillStyle = wg;
      ctx.fill();

      ctx.save();
      ctx.clip();

      // Overlapping stamped aluminum secondary & covert armor plates inside cowling
      for (let r = 0; r < 5; r++) {
        const u = r / 4;
        const pA = this.model.toScreen(lerp(-0.11, -0.28, u), lerp(-0.07, 0.05, u));
        const pB = this.model.toScreen(lerp(-0.22, -0.41, u), lerp(0.16, 0.27, u));
        ctx.strokeStyle = 'rgba(24, 34, 40, 0.58)';
        ctx.lineWidth = 0.82;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(248, 250, 246, 0.38)';
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(pA.x + 1.1, pA.y + 0.5);
        ctx.lineTo(pB.x + 1.1, pB.y + 0.5);
        ctx.stroke();
      }

      // Transverse covert step-bevel & row of brass rivets
      const stepL = this.model.toScreen(-0.34, 0.14);
      const stepR = this.model.toScreen(-0.12, -0.02);
      ctx.strokeStyle = 'rgba(22, 30, 36, 0.72)';
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.moveTo(stepL.x, stepL.y);
      ctx.quadraticCurveTo(0.5 * (stepL.x + stepR.x), 0.5 * (stepL.y + stepR.y) + 5, stepR.x, stepR.y);
      ctx.stroke();

      for (let rv = 0; rv < 6; rv++) {
        const ru = rv / 5;
        const rvx = lerp(stepL.x + 6, stepR.x - 4, ru);
        const rvy = lerp(stepL.y - 3, stepR.y - 3, ru);
        ctx.fillStyle = '#D4AC62';
        ctx.beginPath();
        ctx.arc(rvx, rvy, Math.max(1.2, scale * 0.0038), 0, Math.PI * 2);
        ctx.fill();
      }

      if (grain) {
        ctx.fillStyle = grain;
        ctx.fillRect(wTip.x - 10, wCarpal.y - 20, (wCarpal.x - wTip.x) + 40, (wTip.y - wCarpal.y) + 40);
      }
      ctx.restore(); // End wing cowling clip

      buildCovertWingBed();
      ctx.strokeStyle = 'rgba(26, 36, 42, 0.70)';
      ctx.lineWidth = 0.85;
      ctx.stroke();

      // Knurled Brass Carpal Pivot Bearing Hub at Wing Shoulder!
      const hubR = Math.max(4.6, scale * 0.020);
      const hubG = ctx.createRadialGradient(wCarpal.x - 1, wCarpal.y - 1, 1, wCarpal.x, wCarpal.y, hubR);
      hubG.addColorStop(0, '#F5E3B4');
      hubG.addColorStop(0.55, '#C89B4E');
      hubG.addColorStop(1, '#6E5020');
      ctx.fillStyle = hubG;
      ctx.strokeStyle = 'rgba(38, 26, 14, 0.78)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.arc(wCarpal.x, wCarpal.y, hubR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wCarpal.x - hubR * 0.55, wCarpal.y - hubR * 0.2);
      ctx.lineTo(wCarpal.x + hubR * 0.55, wCarpal.y + hubR * 0.2);
      ctx.stroke();

      // Two Miniature Cloth-Braided Buchla Patch-Wires (Prussian Blue L & Venetian Vermilion R) Plugged into Brass Jacks!
      for (const [j1x, j1y, j2x, j2y, sag, wireCol] of [
        [-0.125, -0.052, -0.285, 0.138, 0.042, '#1D566E'],
        [-0.162, 0.014, -0.342, 0.218, 0.048, '#B83E24'],
      ]) {
        const p1 = this.model.toScreen(j1x, j1y);
        const p2 = this.model.toScreen(j2x, j2y);
        const ctrl = {
          x: 0.5 * (p1.x + p2.x) - scale * sag * 0.55,
          y: 0.5 * (p1.y + p2.y) + scale * sag,
        };

        // Brass 3.5 mm banana/patch jacks
        for (const jp of [p1, p2]) {
          ctx.fillStyle = '#D6AE62';
          ctx.strokeStyle = 'rgba(34, 24, 14, 0.78)';
          ctx.lineWidth = 0.60;
          ctx.beginPath();
          ctx.arc(jp.x, jp.y, Math.max(2.3, scale * 0.0078), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // Drop shadow + woven cloth patch cord
        ctx.strokeStyle = 'rgba(18, 24, 28, 0.28)';
        ctx.lineWidth = Math.max(2.2, scale * 0.0072);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y + 1.4);
        ctx.quadraticCurveTo(ctrl.x, ctrl.y + 1.8, p2.x, p2.y + 1.4);
        ctx.stroke();

        ctx.strokeStyle = wireCol;
        ctx.lineWidth = Math.max(1.8, scale * 0.0062);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, p2.x, p2.y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 250, 240, 0.30)';
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y - 0.5);
        ctx.quadraticCurveTo(ctrl.x, ctrl.y - 0.5, p2.x, p2.y - 0.5);
        ctx.stroke();
      }

      ctx.restore();
    } else {
      const outerWebMargin = blendHex(plum.wing, plum.wingBar || plum.wing, 0.42);
      const covertTipTone = blendHex(plum.wing, plum.wingBar || plum.wing, 0.46);

      ctx.save();
      // Soft watercolor shadow of folded wing resting gently against the flank
      ctx.fillStyle = 'rgba(42, 28, 18, 0.12)';
      ctx.beginPath();
      ctx.moveTo(wCarpal.x + 2, wCarpal.y + 4);
      ctx.bezierCurveTo(wVentralHigh.x + 7, wVentralHigh.y + 7, wVentralLow.x + 7, wVentralLow.y + 6, wTip.x + 3, wTip.y + 2);
      ctx.lineTo(wTip.x, wTip.y);
      ctx.bezierCurveTo(wVentralLow.x, wVentralLow.y, wVentralHigh.x, wVentralHigh.y, wCarpal.x, wCarpal.y);
      ctx.closePath();
      ctx.fill();

      // (i) Individually Painted Stepped Primary Flight Feathers (Handschwingen P4..P9)
      for (let pIdx = 0; pIdx < 6; pIdx++) {
        const u = pIdx / 5;
        const pRoot = this.model.toScreen(lerp(-0.225, -0.355, u) * wr, lerp(0.145, 0.132, u));
        const pTipPt = this.model.toScreen(lerp(-0.415, -0.618, u) * wr, lerp(0.345, 0.512, u) * wr);
        const ang = Math.atan2(pTipPt.y - pRoot.y, pTipPt.x - pRoot.x);
        const len = Math.hypot(pTipPt.x - pRoot.x, pTipPt.y - pRoot.y);
        const fw = scale * 0.024;

        ctx.save();
        ctx.translate(pRoot.x, pRoot.y);
        ctx.rotate(ang);

        // Soft contact shadow onto the primary feather beneath
        if (pIdx > 0) {
          ctx.fillStyle = 'rgba(34, 22, 14, 0.16)';
          ctx.beginPath();
          ctx.moveTo(len * 0.12, fw * 0.34);
          ctx.quadraticCurveTo(len * 0.60, fw * 0.52, len * 0.98, fw * 0.12);
          ctx.lineTo(len * 0.94, 0);
          ctx.closePath();
          ctx.fill();
        }

        const pg = ctx.createLinearGradient(0, -fw * 0.52, 0, fw * 0.52);
        pg.addColorStop(0, tonePigment(plum.wingEdge, -0.24));
        pg.addColorStop(0.50, plum.wingEdge);
        pg.addColorStop(0.84, blendHex(plum.wingEdge, outerWebMargin, 0.65));
        pg.addColorStop(1, outerWebMargin);
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.moveTo(0, -fw * 0.42);
        ctx.bezierCurveTo(len * 0.55, -fw * 0.46, len * 0.90, -fw * 0.26, len, -fw * 0.02);
        ctx.quadraticCurveTo(len * 0.98, fw * 0.25, len * 0.84, fw * 0.35);
        ctx.quadraticCurveTo(len * 0.48, fw * 0.42, 0, fw * 0.34);
        ctx.closePath();
        ctx.fill();

        // Gossamer barbule texture
        ctx.strokeStyle = 'rgba(34, 22, 14, 0.11)';
        ctx.lineWidth = 0.38;
        for (let v = 2; v <= 9; v++) {
          const vx = (v / 10) * len;
          ctx.beginPath();
          ctx.moveTo(vx, 0);
          ctx.lineTo(vx + 4, fw * 0.30);
          ctx.stroke();
        }

        // Fine sepia lithographic feather outline + hairline dark horn shaft (no bright white stripe!)
        ctx.strokeStyle = 'rgba(40, 26, 16, 0.48)';
        ctx.lineWidth = 0.52;
        ctx.beginPath();
        ctx.moveTo(len * 0.08, -fw * 0.42);
        ctx.bezierCurveTo(len * 0.55, -fw * 0.46, len * 0.90, -fw * 0.26, len, -fw * 0.02);
        ctx.quadraticCurveTo(len * 0.98, fw * 0.25, len * 0.84, fw * 0.35);
        ctx.quadraticCurveTo(len * 0.48, fw * 0.42, len * 0.08, fw * 0.34);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(34, 20, 12, 0.52)';
        ctx.lineWidth = 0.46;
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(len * 0.95, -fw * 0.02);
        ctx.stroke();

        ctx.restore();
      }

      // Sleek Upper Covert & Secondary Wing Mantle Bed
      const wg = ctx.createLinearGradient(wCarpal.x, wCarpal.y, wDorsalMid.x, wVentralLow.y);
      wg.addColorStop(0, plum.body);
      wg.addColorStop(0.56, plum.wing);
      wg.addColorStop(1, plum.wingEdge);
      buildCovertWingBed();
      ctx.fillStyle = wg;
      ctx.fill();

      ctx.save();
      ctx.clip();

      // (ii) Overlapping Rounded Tertials & Secondaries (Armschwingen) with Soft Watercolor Vane Gradients
      for (let sIdx = 4; sIdx >= 0; sIdx--) {
        const u = sIdx / 4;
        const sRoot = this.model.toScreen(lerp(-0.155, -0.285, u) * wr, lerp(0.012, 0.048, u));
        const sTip = this.model.toScreen(lerp(-0.315, -0.448, u) * wr, lerp(0.245, 0.308, u));
        const ang = Math.atan2(sTip.y - sRoot.y, sTip.x - sRoot.x);
        const len = Math.hypot(sTip.x - sRoot.x, sTip.y - sRoot.y);
        const fw = scale * 0.035;

        ctx.save();
        ctx.translate(sRoot.x, sRoot.y);
        ctx.rotate(ang);

        // Subtle overlap shadow cast onto adjacent secondary
        ctx.fillStyle = 'rgba(34, 22, 14, 0.14)';
        ctx.beginPath();
        ctx.moveTo(len * 0.10, fw * 0.42);
        ctx.quadraticCurveTo(len * 0.65, fw * 0.60, len * 0.99, fw * 0.08);
        ctx.lineTo(len * 0.94, 0);
        ctx.closePath();
        ctx.fill();

        const sg = ctx.createLinearGradient(0, -fw * 0.5, 0, fw * 0.5);
        sg.addColorStop(0, tonePigment(plum.wingEdge, -0.20));
        sg.addColorStop(0.52, plum.wing);
        sg.addColorStop(0.86, outerWebMargin);
        sg.addColorStop(1, tonePigment(outerWebMargin, 0.08));
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(0, -fw * 0.44);
        ctx.quadraticCurveTo(len * 0.64, -fw * 0.50, len, -fw * 0.02);
        ctx.quadraticCurveTo(len * 0.72, fw * 0.50, 0, fw * 0.42);
        ctx.closePath();
        ctx.fill();

        // Delicate sepia ink outer margin & shaft (no bright white ruler stripe!)
        ctx.strokeStyle = 'rgba(40, 26, 16, 0.42)';
        ctx.lineWidth = 0.50;
        ctx.beginPath();
        ctx.moveTo(len * 0.10, fw * 0.40);
        ctx.quadraticCurveTo(len * 0.70, fw * 0.48, len, -fw * 0.02);
        ctx.quadraticCurveTo(len * 0.66, -fw * 0.48, len * 0.12, -fw * 0.42);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(38, 24, 15, 0.38)';
        ctx.lineWidth = 0.44;
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(len * 0.93, -fw * 0.02);
        ctx.stroke();

        ctx.restore();
      }

      // (iii) Greater Secondary Coverts & (iv) Median Coverts — Individually Imbricated Ovate Feathers!
      const covertTiers = [
        { x0: -0.136, y0: -0.024, dx: -0.029, dy: 0.023, cnt: 7, len: 0.112, wid: 0.032 },
        { x0: -0.106, y0: -0.074, dx: -0.027, dy: 0.020, cnt: 7, len: 0.086, wid: 0.029 },
      ];
      for (const tier of covertTiers) {
        for (let r = tier.cnt - 1; r >= 0; r--) {
          const root = this.model.toScreen((tier.x0 + r * tier.dx) * wr, tier.y0 + r * tier.dy);
          const lenPx = scale * tier.len;
          const widPx = scale * tier.wid;
          const ang = 2.24 + r * 0.022;

          ctx.save();
          ctx.translate(root.x, root.y);
          ctx.rotate(ang);

          // Soft cast shadow beneath rounded distal covert tip
          ctx.fillStyle = 'rgba(36, 22, 14, 0.15)';
          ctx.beginPath();
          ctx.moveTo(lenPx * 0.32, -widPx * 0.44);
          ctx.quadraticCurveTo(lenPx * 1.07, 0.03, lenPx * 0.32, widPx * 0.50);
          ctx.closePath();
          ctx.fill();

          const cg = ctx.createLinearGradient(0, 0, lenPx, 0);
          cg.addColorStop(0, tonePigment(plum.wing, -0.14));
          cg.addColorStop(0.66, plum.wing);
          cg.addColorStop(0.90, covertTipTone);
          cg.addColorStop(1, tonePigment(covertTipTone, 0.10));
          ctx.fillStyle = cg;

          ctx.beginPath();
          ctx.moveTo(0, -widPx * 0.38);
          ctx.quadraticCurveTo(lenPx * 0.62, -widPx * 0.50, lenPx, 0);
          ctx.quadraticCurveTo(lenPx * 0.62, widPx * 0.50, 0, widPx * 0.38);
          ctx.closePath();
          ctx.fill();

          // Hairline sepia ink feather margin & central shaft (replaces floating white U-brackets!)
          ctx.strokeStyle = 'rgba(42, 28, 18, 0.38)';
          ctx.lineWidth = 0.46;
          ctx.beginPath();
          ctx.moveTo(lenPx * 0.18, -widPx * 0.40);
          ctx.quadraticCurveTo(lenPx * 0.64, -widPx * 0.50, lenPx, 0);
          ctx.quadraticCurveTo(lenPx * 0.64, widPx * 0.50, lenPx * 0.18, widPx * 0.40);
          ctx.moveTo(lenPx * 0.16, 0);
          ctx.lineTo(lenPx * 0.88, 0);
          ctx.stroke();

          ctx.restore();
        }
      }

      // (v) Soft Shingled Lesser Coverts & Scapular Drape Blending Seamlessly into the Mantle
      for (let s = 0; s < 10; s++) {
        const u = s / 9;
        const sp = this.model.toScreen(lerp(-0.086, -0.250, u), lerp(-0.114, -0.044, u) + (s % 2) * 0.011);
        this._drawFeatherShingle(ctx, sp.x, sp.y, scale * 0.058, scale * 0.022, 2.26, plum.body, 0.05 - u * 0.08, 0.54);
      }

      ctx.restore(); // End upper covert wing clip

      if (grain) {
        ctx.save();
        buildCovertWingBed();
        ctx.clip();
        ctx.fillStyle = grain;
        ctx.fillRect(wTip.x - 10, wCarpal.y - 20, (wCarpal.x - wTip.x) + 40, (wTip.y - wCarpal.y) + 40);
        ctx.restore();
      }

      // Pillowy Scapular & Pectoral Wing-Pocket Feather Overlap tucking the carpal bend softly into the breast/shoulder!
      const pocketGrad = ctx.createRadialGradient(
        wCarpal.x + scale * 0.012, wCarpal.y + scale * 0.042, 2,
        wCarpal.x + scale * 0.004, wCarpal.y + scale * 0.048, scale * 0.082
      );
      pocketGrad.addColorStop(0, hexToRgba(plum.body, 0.72));
      pocketGrad.addColorStop(0.65, hexToRgba(plum.body, 0.34));
      pocketGrad.addColorStop(1, hexToRgba(plum.body, 0));
      ctx.fillStyle = pocketGrad;
      ctx.beginPath();
      ctx.arc(wCarpal.x + scale * 0.004, wCarpal.y + scale * 0.048, scale * 0.082, 0, Math.PI * 2);
      ctx.fill();

      for (let f = 0; f < 7; f++) {
        const u = f / 6;
        const fp = this.model.toScreen(lerp(-0.082, -0.148, u), lerp(-0.114, 0.092, u));
        const pocketCol = u > 0.50 ? plum.breast : plum.body;
        this._drawFeatherShingle(ctx, fp.x, fp.y, scale * 0.044, scale * 0.017, lerp(2.26, 1.98, u), pocketCol, 0.03, 0.42);
      }

      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Draws a recessed hand-tinted vellum anatomical dissection cavity tucked comfortably inside the
   * breast contour and framed by a crisp parchment bevel + soft downy plumage wisps (or a bolted
   * aluminum/brass surgical inspection bezel on SynthBird!).
   */
  _getCutawayFrameGeom(L) {
    const baseGlottisY = L.baseGlottisY ?? L.glottisY;
    const topY = baseGlottisY - 0.056;
    const botY = 0.352;
    const neckMidY = lerp(baseGlottisY, -0.022, 0.52);
    const neckMidX = lerp(L.glottisX, L.syrinxCx, 0.52) + clamp((L.trachCurveX || 0) * 0.78, -0.044, 0.048);
    const neckHalfW = Math.max(
      (L.cutBaseTrachHalfW || 0.032) + 0.036,
      Math.min(L.trachHalfW + 0.030, 0.084),
      Math.abs((L.glottisX - (L.oecBackX ?? (L.glottisX - 0.05)))) * 0.68
    );
    const chestHalfW = 0.150;
    const oecBackLim = Math.min(L.glottisX - 0.064, L.oecBackLim ?? (L.oecBackX - 0.016));
    const oecFrontLim = Math.max(L.glottisX + 0.062, L.oecFrontX + 0.014);
    return { topY, botY, neckMidX, neckMidY, neckHalfW, chestHalfW, oecBackLim, oecFrontLim };
  }

  _buildCutawayCavityPath(ctx, L) {
    const g = this._getCutawayFrameGeom(L);
    const wTopL = this.model.toScreen(g.oecBackLim, g.topY + 0.028);
    const wTopR = this.model.toScreen(g.oecFrontLim, g.topY + 0.022);
    const wTopCap = this.model.toScreen(0.5 * (g.oecBackLim + g.oecFrontLim), g.topY - 0.003);

    const wNeckL = this.model.toScreen(g.neckMidX - g.neckHalfW, g.neckMidY);
    const wNeckR = this.model.toScreen(g.neckMidX + g.neckHalfW, g.neckMidY);

    const wChestL = this.model.toScreen(L.syrinxCx - g.chestHalfW * 0.96 - 0.010, 0.125);
    const wChestR = this.model.toScreen(L.syrinxCx + g.chestHalfW * 0.94 + 0.006, 0.125);
    const wBotL = this.model.toScreen(L.sacCx - 0.108, g.botY - 0.030);
    const wBotR = this.model.toScreen(L.sacCx + 0.092, g.botY - 0.032);
    const wBotMid = this.model.toScreen(L.sacCx - 0.006, g.botY);

    ctx.beginPath();
    ctx.moveTo(wTopL.x, wTopL.y);
    ctx.quadraticCurveTo(wTopCap.x, wTopCap.y, wTopR.x, wTopR.y);
    ctx.bezierCurveTo(
      wTopR.x + 2, 0.5 * (wTopR.y + wNeckR.y),
      wNeckR.x - 3, wNeckR.y - 12,
      wNeckR.x, wNeckR.y
    );
    ctx.bezierCurveTo(
      wChestR.x - 2, wNeckR.y + 18,
      wChestR.x + 2, wBotR.y - 16,
      wBotR.x, wBotR.y
    );
    ctx.quadraticCurveTo(wBotMid.x, wBotMid.y + 3, wBotL.x, wBotL.y);
    ctx.bezierCurveTo(
      wChestL.x - 4, wBotL.y - 16,
      wChestL.x + 2, wNeckL.y + 18,
      wNeckL.x, wNeckL.y
    );
    ctx.bezierCurveTo(
      wNeckL.x + 3, wNeckL.y - 12,
      wTopL.x - 2, 0.5 * (wTopL.y + wNeckL.y),
      wTopL.x, wTopL.y
    );
    ctx.closePath();
    return { g, wTopCap, wChestL, wChestR, wBotMid };
  }

  _drawCutawayWindow(ctx, L) {
    const scale = this.model.layout.scale;
    const plum = this.model.currentSpecies.plumage;
    const grain = this._ensureLithoGrain(ctx);
    const buildCavity = () => this._buildCutawayCavityPath(ctx, L);
    const { g, wTopCap, wChestL, wChestR, wBotMid } = this._buildCutawayCavityPath(ctx, L);
    const { topY, botY, neckMidX, neckMidY, neckHalfW, chestHalfW, oecBackLim, oecFrontLim } = g;

    ctx.save();
    buildCavity();
    const cavCenter = this.model.toScreen(0.5 * (L.syrinxCx + L.sacCx), 0.10);
    const cavGrad = ctx.createRadialGradient(
      cavCenter.x, cavCenter.y, scale * 0.035,
      cavCenter.x, cavCenter.y, scale * 0.34
    );
    cavGrad.addColorStop(0, PALETTE.vellumCenter);
    cavGrad.addColorStop(0.76, '#F7F0E2');
    cavGrad.addColorStop(1, '#E8DAC2');
    ctx.fillStyle = cavGrad;
    ctx.fill();

    // Soft recessed parchment bevel shadow + Whatman paper tooth inside dissection window
    ctx.save();
    ctx.clip();
    if (grain) {
      ctx.fillStyle = grain;
      ctx.fillRect(wChestL.x - 20, wTopCap.y - 10, (wChestR.x - wChestL.x) + 40, (wBotMid.y - wTopCap.y) + 30);
    }
    for (const [lw, alpha] of [[8.5, 0.045], [4.0, 0.075], [1.4, 0.13]]) {
      ctx.strokeStyle = `rgba(98, 74, 48, ${alpha})`;
      ctx.lineWidth = lw;
      buildCavity();
      ctx.stroke();
    }
    ctx.restore();

    if (plum.isCyborg) {
      // Bolted Brushed-Aluminum & Antique-Brass Surgical Inspection Bezel Framing the Living Biological Syrinx!
      buildCavity();
      ctx.strokeStyle = 'rgba(34, 44, 52, 0.84)';
      ctx.lineWidth = 4.6;
      ctx.stroke();

      buildCavity();
      ctx.strokeStyle = 'rgba(222, 228, 228, 0.90)';
      ctx.lineWidth = 3.0;
      ctx.stroke();

      buildCavity();
      ctx.strokeStyle = 'rgba(196, 152, 74, 0.88)';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      // 14 miniature slotted brass machine screws evenly spaced around the surgical bezel flange
      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        const sgn = sideIdx === 0 ? -1 : 1;
        for (let k = 0; k < 7; k++) {
          const u = (k + 0.5) / 7;
          const ny = lerp(topY + 0.032, botY - 0.028, u);
          let nxEdge;
          if (ny < neckMidY + 0.02) {
            const topEdgeX = sgn < 0 ? oecBackLim : oecFrontLim;
            const neckEdgeX = sgn < 0 ? neckMidX - neckHalfW : neckMidX + neckHalfW;
            const tNeck = clamp((ny - (topY + 0.032)) / Math.max(0.04, neckMidY + 0.02 - (topY + 0.032)), 0, 1);
            nxEdge = lerp(topEdgeX, neckEdgeX, tNeck);
          } else {
            const neckEdgeX = sgn < 0 ? neckMidX - neckHalfW : neckMidX + neckHalfW;
            const chestOuterX = sgn < 0 ? L.syrinxCx - chestHalfW * 0.96 - 0.010 : L.syrinxCx + chestHalfW * 0.94 + 0.006;
            const botOuterX = sgn < 0 ? L.sacCx - 0.108 : L.sacCx + 0.092;
            const tBody = clamp((ny - neckMidY) / Math.max(0.1, botY - neckMidY), 0, 1);
            const baseSpine = lerp(neckEdgeX, botOuterX, tBody);
            nxEdge = lerp(baseSpine, chestOuterX, Math.sin(tBody * Math.PI * 0.92) * 0.78);
          }
          const sp = this.model.toScreen(nxEdge + sgn * 0.0035, ny);
          const sr = Math.max(1.45, scale * 0.0046);
          ctx.fillStyle = '#DFBA6E';
          ctx.strokeStyle = 'rgba(42, 30, 16, 0.80)';
          ctx.lineWidth = 0.52;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(sp.x - sr * 0.65, sp.y - sr * 0.25);
          ctx.lineTo(sp.x + sr * 0.65, sp.y + sr * 0.25);
          ctx.stroke();
        }
      }
    } else {
      // Fine copperplate sepia-ochre margin line
      buildCavity();
      ctx.strokeStyle = 'rgba(112, 86, 58, 0.42)';
      ctx.lineWidth = 0.72;
      ctx.stroke();

      // Soft downy plumage wisps overlapping the cutaway border gently in the bird's own breast/mantle hue (zero dark wire U-loops!)
      for (const rf of this._cutawayRimFeathers) {
        const { sgn, u, jitter, lenMul } = rf;
        const ny = lerp(topY + 0.034, botY - 0.034, u) + jitter;
        let nxEdge;
        if (ny < neckMidY + 0.02) {
          const topEdgeX = sgn < 0 ? oecBackLim - 0.001 : oecFrontLim + 0.002;
          const neckEdgeX = sgn < 0 ? neckMidX - neckHalfW - 0.002 : neckMidX + neckHalfW + 0.002;
          const tNeck = clamp((ny - (topY + 0.034)) / Math.max(0.04, neckMidY + 0.02 - (topY + 0.034)), 0, 1);
          nxEdge = lerp(topEdgeX, neckEdgeX, tNeck);
        } else {
          const neckEdgeX = sgn < 0 ? neckMidX - neckHalfW - 0.002 : neckMidX + neckHalfW + 0.002;
          const chestOuterX = sgn < 0 ? L.syrinxCx - chestHalfW * 0.96 - 0.010 : L.syrinxCx + chestHalfW * 0.94 + 0.006;
          const botOuterX = sgn < 0 ? L.sacCx - 0.108 : L.sacCx + 0.092;
          const tBody = clamp((ny - neckMidY) / Math.max(0.1, botY - neckMidY), 0, 1);
          const baseSpine = lerp(neckEdgeX, botOuterX, tBody);
          nxEdge = lerp(baseSpine, chestOuterX, Math.sin(tBody * Math.PI * 0.92) * 0.78);
        }

        const rootPt = this.model.toScreen(nxEdge + sgn * 0.018, ny - 0.008);
        const tipPt = this.model.toScreen(nxEdge - sgn * 0.003, ny + 0.008);
        const ang = Math.atan2(tipPt.y - rootPt.y, tipPt.x - rootPt.x);
        const baseHex = sgn < 0 && ny < 0.04 ? plum.body : plum.breast;
        const lenPx = scale * 0.026 * lenMul;
        const widPx = scale * 0.0095;

        ctx.save();
        ctx.translate(rootPt.x, rootPt.y);
        ctx.rotate(ang);
        ctx.fillStyle = hexToRgba(baseHex, 0.78);
        ctx.beginPath();
        ctx.moveTo(0, -widPx * 0.65);
        ctx.quadraticCurveTo(lenPx * 0.65, -widPx * 0.42, lenPx, 0);
        ctx.quadraticCurveTo(lenPx * 0.65, widPx * 0.42, 0, widPx * 0.65);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = tonePigment(baseHex, -0.24, 0.22);
        ctx.lineWidth = 0.36;
        ctx.beginPath();
        ctx.moveTo(lenPx * 0.25, 0);
        ctx.lineTo(lenPx * 0.95, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  _drawPartHighlightGlow(ctx, partId, pathFn) {
    const isHovered = this.model.hoveredPart === partId;
    let isGrabbed = false;
    for (const g of this.model.activeGrabs.values()) {
      if (g.partId === partId) isGrabbed = true;
    }
    if (!isHovered && !isGrabbed) return;

    ctx.save();
    pathFn();
    ctx.strokeStyle = isGrabbed ? 'rgba(184, 66, 40, 0.72)' : 'rgba(184, 66, 40, 0.38)';
    ctx.lineWidth = isGrabbed ? 3.6 : 2.3;
    ctx.stroke();
    ctx.restore();
  }

  _drawAirSacs(ctx, L, d, telem) {
    const pSub = d.pSub.value;
    const pIcas = d.pIcas.value;
    const ptpMin = Math.min(telem?.ptpL || 0.66, telem?.ptpR || 0.72);
    const abovePtp = pSub > ptpMin;

    // 0. Recessed Dorsolateral Avian Lungs (Rigid Parabronchial Parenchyma behind Bronchi & ICAS)
    ctx.save();
    for (const sgn of [-1, 1]) {
      const lungTop = this.model.toScreen(L.syrinxCx + sgn * 0.050, L.tympanumY - 0.038);
      const lungOuterTop = this.model.toScreen(L.syrinxCx + sgn * 0.134, 0.022);
      const lungOuterBot = this.model.toScreen(L.syrinxCx + sgn * 0.138, 0.138);
      const lungBot = this.model.toScreen(L.syrinxCx + sgn * 0.056, 0.184);
      const lungMed = this.model.toScreen(L.syrinxCx + sgn * 0.038, 0.078);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lungTop.x, lungTop.y);
      ctx.bezierCurveTo(
        lungOuterTop.x, lungTop.y + 4,
        lungOuterBot.x + sgn * 3, lungOuterBot.y - 6,
        lungBot.x, lungBot.y
      );
      ctx.quadraticCurveTo(lungMed.x, 0.5 * (lungBot.y + lungTop.y) + 5, lungTop.x, lungTop.y);
      ctx.closePath();

      const lungCx = 0.5 * (lungMed.x + lungOuterTop.x);
      const lungCy = 0.5 * (lungTop.y + lungBot.y);
      const lungR = Math.max(16, Math.hypot(lungOuterBot.x - lungMed.x, lungBot.y - lungTop.y) * 0.65);
      const lungGrad = ctx.createRadialGradient(lungCx, lungCy, 3, lungCx, lungCy, lungR);
      lungGrad.addColorStop(0, 'rgba(208, 126, 114, 0.34)');
      lungGrad.addColorStop(0.7, 'rgba(182, 102, 92, 0.26)');
      lungGrad.addColorStop(1, 'rgba(146, 78, 70, 0.16)');
      ctx.fillStyle = lungGrad;
      ctx.fill();

      ctx.clip();
      ctx.strokeStyle = 'rgba(118, 54, 48, 0.18)';
      ctx.lineWidth = 0.48;
      const xMin = Math.min(lungMed.x, lungOuterBot.x) - 10;
      const xMax = Math.max(lungMed.x, lungOuterBot.x) + 10;
      for (let hx = xMin; hx <= xMax; hx += 4.6) {
        ctx.beginPath();
        ctx.moveTo(hx, lungTop.y - 4);
        ctx.lineTo(hx + sgn * 12, lungBot.y + 4);
        ctx.stroke();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(lungTop.x, lungTop.y);
      ctx.bezierCurveTo(
        lungOuterTop.x, lungTop.y + 4,
        lungOuterBot.x + sgn * 3, lungOuterBot.y - 6,
        lungBot.x, lungBot.y
      );
      ctx.quadraticCurveTo(lungMed.x, 0.5 * (lungBot.y + lungTop.y) + 5, lungTop.x, lungTop.y);
      ctx.setLineDash([1.8, 2.2]);
      ctx.strokeStyle = 'rgba(132, 68, 60, 0.28)';
      ctx.lineWidth = 0.60;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // 1. Translucent Pearlescent Interclavicular Air Sac (ICAS / Chest Air Cushion) enclosing the syrinx
    const icasBotCx = lerp(L.syrinxCx, L.sacCx, 0.55);
    const icasBotHalfW = L.icasHalfW * 0.82;
    const icasBotY = 0.216 - 0.018 * (L.icasComp || 0);
    const icasTopL = this.model.toScreen(L.syrinxCx - L.trachHalfW - 0.020, L.tympanumY - 0.052);
    const icasTopR = this.model.toScreen(L.syrinxCx + L.trachHalfW + 0.020, L.tympanumY - 0.052);
    const icasSideL = this.model.toScreen(L.syrinxCx - L.icasHalfW * 0.88, 0.100);
    const icasSideR = this.model.toScreen(L.syrinxCx + L.icasHalfW * 0.88, 0.100);
    const icasBotL = this.model.toScreen(icasBotCx - icasBotHalfW, icasBotY);
    const icasBotR = this.model.toScreen(icasBotCx + icasBotHalfW, icasBotY);
    const icasMidBot = this.model.toScreen(icasBotCx, icasBotY - 0.022);

    const buildIcasPath = () => {
      ctx.beginPath();
      ctx.moveTo(icasTopL.x, icasTopL.y);
      ctx.bezierCurveTo(
        icasSideL.x - 6, icasTopL.y + 10,
        icasSideL.x - 6, icasBotL.y - 10,
        icasBotL.x, icasBotL.y
      );
      ctx.quadraticCurveTo(icasMidBot.x, icasMidBot.y - 5, icasBotR.x, icasBotR.y);
      ctx.bezierCurveTo(
        icasSideR.x + 6, icasBotR.y - 10,
        icasSideR.x + 6, icasTopR.y + 10,
        icasTopR.x, icasTopR.y
      );
      ctx.closePath();
    };

    ctx.save();
    buildIcasPath();
    const icasGrad = ctx.createRadialGradient(
      icasMidBot.x, icasSideL.y, 4,
      icasMidBot.x, icasSideL.y, Math.max(22, icasSideR.x - icasSideL.x)
    );
    if (pIcas > 0.85) {
      const a = clamp(0.12 + 0.068 * pIcas, 0.12, 0.42);
      icasGrad.addColorStop(0, `rgba(252, 236, 206, ${(a * 0.72).toFixed(3)})`);
      icasGrad.addColorStop(1, `rgba(210, 146, 72, ${a.toFixed(3)})`);
    } else {
      icasGrad.addColorStop(0, 'rgba(236, 246, 246, 0.12)');
      icasGrad.addColorStop(1, PALETTE.cushionRest);
    }
    ctx.fillStyle = icasGrad;
    ctx.fill();

    ctx.setLineDash([1.6, 2.4]);
    ctx.strokeStyle = PALETTE.cushionStroke;
    ctx.lineWidth = 0.76;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    this._drawPartHighlightGlow(ctx, 'icasL', buildIcasPath);
    this._drawPartHighlightGlow(ctx, 'icasR', buildIcasPath);

    // 2. Paired Pear-Lobed Thoracic/Abdominal Air Sacs anchored via the parabronchial lung ostia (never directly onto syrinx!)
    const lobePeakL = this.model.toScreen(L.syrinxCx - 0.060, 0.176);
    const lobePeakR = this.model.toScreen(L.syrinxCx + 0.060, 0.176);
    const sacBotNormY = L.caudalBottomY - 0.006;
    const sacOuterNormY = lerp(0.176, sacBotNormY, 0.56);
    const topSaddle = this.model.toScreen(L.sacCx, lerp(0.176, sacBotNormY, 0.24));
    const sacOuterL = this.model.toScreen(L.sacCx - L.caudalOuterX * 0.90, sacOuterNormY);
    const sacOuterR = this.model.toScreen(L.sacCx + L.caudalOuterX * 0.90, sacOuterNormY);
    const sacBotL = this.model.toScreen(L.sacCx - L.caudalOuterX * 0.48, sacBotNormY);
    const sacBotR = this.model.toScreen(L.sacCx + L.caudalOuterX * 0.48, sacBotNormY);
    // Proportional cleft depth prevents Bezier self-intersection even at max expiratory squeeze (pSub = 4.8 kPa)!
    const sacCleft = this.model.toScreen(L.sacCx, lerp(0.176, sacBotNormY, 0.78));

    const buildCaudalSacPath = () => {
      ctx.beginPath();
      ctx.moveTo(lobePeakL.x, lobePeakL.y);
      ctx.bezierCurveTo(
        sacOuterL.x - 5, lobePeakL.y + 10,
        sacOuterL.x - 4, sacBotL.y - 4,
        sacBotL.x, sacBotL.y
      );
      ctx.quadraticCurveTo(sacCleft.x - 5, sacCleft.y + 3, sacCleft.x, sacCleft.y);
      ctx.quadraticCurveTo(sacCleft.x + 5, sacCleft.y + 3, sacBotR.x, sacBotR.y);
      ctx.bezierCurveTo(
        sacOuterR.x + 4, sacBotR.y - 4,
        sacOuterR.x + 5, lobePeakR.y + 10,
        lobePeakR.x, lobePeakR.y
      );
      ctx.bezierCurveTo(
        lobePeakR.x - 8, topSaddle.y + 3,
        lobePeakL.x + 8, topSaddle.y + 3,
        lobePeakL.x, lobePeakL.y
      );
      ctx.closePath();
    };

    ctx.save();
    buildCaudalSacPath();
    const pressNorm = clamp(pSub / 3.5, 0, 1);
    const sacG = ctx.createRadialGradient(
      topSaddle.x - 5, topSaddle.y + 8, 4,
      topSaddle.x, topSaddle.y + 14, Math.max(24, sacOuterR.x - sacOuterL.x)
    );
    if (abovePtp) {
      sacG.addColorStop(0, `rgba(255, 242, 216, ${(0.34 + 0.14 * pressNorm).toFixed(3)})`);
      sacG.addColorStop(0.65, `rgba(222, 162, 88, ${(0.20 + 0.16 * pressNorm).toFixed(3)})`);
      sacG.addColorStop(1, `rgba(182, 114, 52, ${(0.26 + 0.16 * pressNorm).toFixed(3)})`);
    } else {
      sacG.addColorStop(0, 'rgba(244, 250, 250, 0.28)');
      sacG.addColorStop(1, PALETTE.airSacRest);
    }
    ctx.fillStyle = sacG;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 252, 244, 0.52)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(lobePeakL.x - 3, lobePeakL.y + 7);
    ctx.quadraticCurveTo(sacOuterL.x + 2, 0.5 * (lobePeakL.y + sacBotL.y), sacBotL.x - 2, sacBotL.y - 4);
    ctx.moveTo(lobePeakR.x - 3, lobePeakR.y + 7);
    ctx.quadraticCurveTo(sacOuterR.x - 3, 0.5 * (lobePeakR.y + sacBotR.y), sacBotR.x - 3, sacBotR.y - 4);
    ctx.stroke();

    buildCaudalSacPath();
    ctx.strokeStyle = abovePtp ? 'rgba(148, 84, 34, 0.58)' : 'rgba(68, 104, 114, 0.52)';
    ctx.lineWidth = 0.85;
    ctx.stroke();
    ctx.restore();

    this._drawPartHighlightGlow(ctx, 'airSacCaudal', buildCaudalSacPath);
  }

  _sampleAirwayPath(side, s, L, singBob = 0) {
    const isL = side === 'L';
    const sgn = isL ? -1 : 1;
    const headCx = L.headCx;
    const headCy = L.headCy - singBob;
    const cleftX = isL ? 0.5 * (L.mlLx + L.llLx) : 0.5 * (L.mlRx + L.llRx);
    const cleftY = isL ? L.mlLy + 0.022 : L.mlRy + 0.022;
    const cleftHw = (isL ? L.cleftVisL : L.cleftVisR) * 0.58;
    const tympX = L.syrinxCx + sgn * L.trachHalfW * 0.36;
    const tympY = L.tympanumY - 0.012;
    const glotX = L.glottisX + sgn * L.trachHalfW * 0.28;
    const glotY = L.glottisY;
    const mouthInX = headCx + 0.104;
    const mouthInY = headCy - 0.032;
    const mouthExitX = headCx + 0.252;
    const mouthExitY = headCy - 0.040 - 0.015 * L.beakOpenNorm;

    if (s < 0.36) {
      // Avian respiratory pathway (Duncker 1971): Posterior Air Sacs -> Dorsolateral Parabronchial Lungs -> Primary Bronchi -> Syrinx!
      const u = clamp(s / 0.36, 0, 1);
      const om = 1.0 - u;
      const startX = L.sacCx + sgn * L.caudalOuterX * 0.48;
      const startY = L.caudalBottomY - 0.032;
      const lungCtrlX = L.syrinxCx + sgn * 0.106;
      const lungCtrlY = 0.098;
      return {
        nx: om * om * startX + 2.0 * om * u * lungCtrlX + u * u * cleftX,
        ny: om * om * startY + 2.0 * om * u * lungCtrlY + u * u * cleftY,
        halfW: lerp(0.038, cleftHw, Math.pow(u, 0.85)),
      };
    } else if (s < 0.48) {
      const u = (s - 0.36) / 0.12;
      return {
        nx: lerp(cleftX, tympX, u),
        ny: lerp(cleftY, tympY, u),
        halfW: lerp(cleftHw, L.trachHalfW * 0.46, u),
      };
    } else if (s < 0.78) {
      const u = (s - 0.48) / 0.30;
      const bendOff = 4.0 * u * (1.0 - u) * (L.trachCurveX || 0);
      return {
        nx: lerp(tympX, glotX, u) + bendOff,
        ny: lerp(tympY, glotY, u),
        halfW: L.trachHalfW * 0.46,
      };
    } else if (s < 0.94) {
      const u = (s - 0.78) / 0.16;
      const om = 1.0 - u;
      const ctrlX = L.glottisX + 0.026 + sgn * 0.008;
      const ctrlY = L.glottisY - 0.024 - 0.008 * L.oecExpand;
      return {
        nx: om * om * glotX + 2.0 * om * u * ctrlX + u * u * mouthInX,
        ny: om * om * glotY + 2.0 * om * u * ctrlY + u * u * mouthInY,
        halfW:
          lerp(L.trachHalfW * 0.46, 0.016 + 0.022 * L.beakOpenNorm, u) +
          0.016 * L.oecExpand * Math.sin(u * Math.PI),
      };
    } else if (s < 1.09) {
      const u = (s - 0.94) / 0.15;
      return {
        nx: lerp(mouthInX, mouthExitX, u),
        ny: lerp(mouthInY, mouthExitY, u),
        halfW: lerp(0.016 + 0.022 * L.beakOpenNorm, 0.020 + 0.034 * L.beakOpenNorm, u),
      };
    } else {
      const u = clamp((s - 1.09) / 0.27, 0, 1.25);
      return {
        nx: mouthExitX + u * 0.19,
        ny: mouthExitY - u * 0.045 - u * u * 0.055,
        halfW: 0.020 + 0.034 * L.beakOpenNorm + u * 0.052,
      };
    }
  }

  _drawAirwayLumensAndWaves(ctx, L, telem) {
    const curveX = L.trachCurveX || 0;
    const midY = 0.5 * (L.glottisY + L.tympanumY);
    const midCtrlX = 0.5 * (L.glottisX + L.syrinxCx) + 2.0 * curveX;

    const glottisL = this.model.toScreen(L.glottisX - L.trachHalfW, L.glottisY);
    const glottisR = this.model.toScreen(L.glottisX + L.trachHalfW, L.glottisY);
    const tympL = this.model.toScreen(L.syrinxCx - L.trachHalfW * 1.06, L.tympanumY);
    const tympR = this.model.toScreen(L.syrinxCx + L.trachHalfW * 1.06, L.tympanumY);
    const ctrlL = this.model.toScreen(midCtrlX - L.trachHalfW * 1.03, midY);
    const ctrlR = this.model.toScreen(midCtrlX + L.trachHalfW * 1.03, midY);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(glottisL.x, glottisL.y);
    ctx.quadraticCurveTo(ctrlL.x, ctrlL.y, tympL.x, tympL.y);
    ctx.lineTo(tympR.x, tympR.y);
    ctx.quadraticCurveTo(ctrlR.x, ctrlR.y, glottisR.x, glottisR.y);
    ctx.closePath();

    const minX = Math.min(tympL.x, glottisL.x, ctrlL.x) - 10;
    const maxX = Math.max(tympR.x, glottisR.x, ctrlR.x) + 10;
    const tubeGrad = ctx.createLinearGradient(minX + 10, 0, maxX - 10, 0);
    tubeGrad.addColorStop(0, '#E8DAC0');
    tubeGrad.addColorStop(0.32, '#FCF7EC');
    tubeGrad.addColorStop(0.74, '#EFE3CC');
    tubeGrad.addColorStop(1, '#D5C2A2');
    ctx.fillStyle = tubeGrad;
    ctx.fill();

    const totalEnergy = clamp(((telem?.rmsL || 0) + (telem?.rmsR || 0)) * 0.85, 0, 1.0);
    if (totalEnergy > 0.03) {
      ctx.clip();
      const steps = 18;
      const travelPhase = this.model.time * 18.5;
      const spanX = maxX - minX;
      for (let k = 0; k < steps; k++) {
        const u0 = k / steps;
        const u1 = (k + 1) / steps;
        const uMid = 0.5 * (u0 + u1);
        const endTaper = Math.sin(Math.PI * uMid);
        const travelingCrest = Math.pow(0.5 + 0.5 * Math.sin(uMid * 9.5 - travelPhase), 1.6);
        const alpha = clamp(totalEnergy * endTaper * travelingCrest * 0.20, 0, 0.20);

        const yA = this.model.toScreen(0, lerp(L.tympanumY, L.glottisY, u0)).y;
        const yB = this.model.toScreen(0, lerp(L.tympanumY, L.glottisY, u1)).y;
        ctx.fillStyle = `rgba(206, 104, 48, ${alpha.toFixed(3)})`;
        ctx.fillRect(minX, Math.min(yA, yB), spanX, Math.abs(yB - yA) + 1);
      }
    }
    ctx.restore();
  }

  _drawStreamlineParticle(ctx, p, L, d, telem, singBob) {
    const rawSpd = p.curSpeed ?? 0.35;
    const isInspiring = rawSpd < -0.02;
    const spd = Math.abs(rawSpd);
    const speedFade = clamp((spd - 0.055) * 1.65, 0, 1);
    if (speedFade <= 0.02) return;

    const fadeBirth = clamp(p.s / 0.075, 0, 1);
    const fadeExit = clamp((1.33 - p.s) / 0.16, 0, 1);
    const openMouthFade = p.s > 0.94 ? clamp((L.beakOpenNorm - 0.025) * 6.0, 0, 1) : 1.0;
    const envFade = fadeBirth * fadeExit * speedFade * openMouthFade;
    if (envFade <= 0.02) return;

    const ds = clamp(0.014 + spd * 0.016, 0.014, 0.036);
    const c0 = this._sampleAirwayPath(p.side, Math.max(0, p.s - ds * 0.5), L, singBob);
    const c1 = this._sampleAirwayPath(p.side, Math.min(1.34, p.s + ds * 0.5), L, singBob);

    const p0 = this.model.toScreen(c0.nx + p.lane * c0.halfW * 0.52, c0.ny);
    const p1 = this.model.toScreen(c1.nx + p.lane * c1.halfW * 0.52, c1.ny);

    const branchRms = p.side === 'L' ? (telem?.rmsL || 0) : (telem?.rmsR || 0);
    const isSinging = !isInspiring && branchRms > 0.05 && d.pSub.value > 0.55;

    ctx.strokeStyle = isInspiring
      ? `rgba(62, 128, 152, ${(0.44 * envFade).toFixed(3)})`
      : isSinging
        ? `rgba(${p.side === 'L' ? '48, 96, 128' : '184, 72, 38'}, ${(0.52 * envFade).toFixed(3)})`
        : `rgba(74, 114, 128, ${(0.34 * envFade).toFixed(3)})`;
    ctx.lineWidth = p.size * (isSinging ? 1.05 : 0.85);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  _drawVoicePulseCrescent(ctx, vp, L, singBob) {
    const scale = this.model.layout.scale;
    const fadeBirth = clamp((vp.s - 0.37) / 0.05, 0, 1);
    const fadeExit = clamp((0.90 - vp.s) / 0.10, 0, 1);
    const alpha = clamp(vp.amp * fadeBirth * fadeExit * 0.70, 0, 0.72);
    if (alpha <= 0.02) return;

    const c0 = this._sampleAirwayPath(vp.side, vp.s, L, singBob);
    const c1 = this._sampleAirwayPath(vp.side, Math.min(1.36, vp.s + 0.025), L, singBob);
    const p0 = this.model.toScreen(c0.nx, c0.ny);
    const p1 = this.model.toScreen(c1.nx, c1.ny);

    const tx = p1.x - p0.x;
    const ty = p1.y - p0.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const ux = tx / tLen;
    const uy = ty / tLen;
    const nx = -uy;
    const ny = ux;

    const sideShift =
      vp.s < 0.82 ? (vp.side === 'L' ? -1 : 1) * scale * 0.008 * (1.0 - (vp.s - 0.37) / 0.45) : 0;
    const cx = p0.x + nx * sideShift;
    const cy = p0.y + ny * sideShift;

    const halfSpan = Math.max(3.0, c0.halfW * scale * (vp.s > 0.96 ? 1.12 : 0.70));
    const bow = Math.max(2.4, halfSpan * 0.46);

    const colRgb = vp.side === 'L' ? '44, 92, 126' : '184, 66, 40';
    ctx.strokeStyle = `rgba(${colRgb}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = lerp(1.15, 1.70, vp.amp);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - nx * halfSpan, cy - ny * halfSpan);
    ctx.quadraticCurveTo(cx + ux * bow, cy + uy * bow, cx + nx * halfSpan, cy + ny * halfSpan);
    ctx.stroke();
  }

  _drawAirflowStreamlines(ctx, L, d, telem) {
    const singBob = clamp(((telem?.rmsL || 0) + (telem?.rmsR || 0)) * 0.010, 0, 0.015);
    ctx.save();
    for (const p of this.particles) {
      if (p.s <= 0.87) {
        this._drawStreamlineParticle(ctx, p, L, d, telem, singBob);
      }
    }
    ctx.restore();
  }

  /**
   * Draws a copperplate fusiform syringeal muscle spindle with pearly aponeurotic tendon tips
   * and fine curved sepia myofibril engraving lines.
   */
  _drawMuscleCushion(ctx, pStart, pEnd, bulgePx, activation, partId = null) {
    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const midX = 0.5 * (pStart.x + pEnd.x);
    const midY = 0.5 * (pStart.y + pEnd.y);
    const actClamp = clamp(activation, 0, 1.15);
    const w = bulgePx * (0.94 + 0.28 * actClamp);

    const buildPath = () => {
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.quadraticCurveTo(midX + nx * w, midY + ny * w, pEnd.x, pEnd.y);
      ctx.quadraticCurveTo(midX - nx * w, midY - ny * w, pStart.x, pStart.y);
      ctx.closePath();
    };

    ctx.save();
    buildPath();
    const actColor = clamp(actClamp / 1.25, 0, 1);
    const r = Math.round(lerp(214, 146, actColor));
    const g = Math.round(lerp(136, 36, actColor));
    const b = Math.round(lerp(118, 28, actColor));

    // Pearly-ivory aponeurotic tendon ends blending into deep arterial rose-madder contractile belly!
    const mg = ctx.createLinearGradient(pStart.x, pStart.y, pEnd.x, pEnd.y);
    mg.addColorStop(0, '#EFE2CA');
    mg.addColorStop(0.15, `rgb(${r}, ${g}, ${b})`);
    mg.addColorStop(0.85, `rgb(${r}, ${g}, ${b})`);
    mg.addColorStop(1, '#EADBC0');
    ctx.fillStyle = mg;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // Cylindrical cross-axis shading across the fusiform muscle belly (Meyers copperplate relief)
    const cylG = ctx.createLinearGradient(
      midX - nx * w,
      midY - ny * w,
      midX + nx * w,
      midY + ny * w
    );
    cylG.addColorStop(0, 'rgba(255, 246, 232, 0.28)');
    cylG.addColorStop(0.45, 'rgba(255, 246, 232, 0.0)');
    cylG.addColorStop(1, 'rgba(58, 20, 14, 0.26)');
    ctx.fillStyle = cylG;
    ctx.fillRect(
      Math.min(pStart.x, pEnd.x) - w - 4,
      Math.min(pStart.y, pEnd.y) - w - 4,
      Math.abs(pEnd.x - pStart.x) + w * 2 + 8,
      Math.abs(pEnd.y - pStart.y) + w * 2 + 8
    );

    ctx.strokeStyle = `rgba(64, 24, 18, ${(0.26 + 0.16 * actColor).toFixed(3)})`;
    ctx.lineWidth = 0.52 + 0.16 * actColor;
    for (let f = -3; f <= 3; f++) {
      const off = (f / 3.5) * w * 0.88;
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.quadraticCurveTo(midX + nx * off, midY + ny * off, pEnd.x, pEnd.y);
      ctx.stroke();
    }
    ctx.restore();

    buildPath();
    ctx.strokeStyle = 'rgba(98, 38, 30, 0.70)';
    ctx.lineWidth = 0.80 + 0.22 * actColor;
    ctx.stroke();
    ctx.restore();

    if (partId) {
      this._drawPartHighlightGlow(ctx, partId, buildPath);
    }
  }

  _drawMusculature(ctx, L, d) {
    const scale = this.model.layout.scale;
    const isMenurae = L.clade === 'menurae' || L.intrinsicMusclePairs === 3;
    const mScaleL = L.muscScaleL ?? 1.0;
    const mScaleR = L.muscScaleR ?? 1.0;

    // 0. Extrinsic M. sternotrachealis (ST) straps diverging caudolaterally from distal trachea toward sternal margin
    // (prominent in basal Menurae & visible as slender pearly-rose oblique bands behind intrinsic muscles in Oscines!)
    ctx.save();
    for (const sgn of [-1, 1]) {
      const stOrig = this.model.toScreen(
        L.syrinxCx + sgn * L.trachHalfW * 0.96,
        L.tympanumY - (isMenurae ? 0.088 : 0.068)
      );
      const stIns = this.model.toScreen(
        L.syrinxCx + sgn * (L.icasHalfW * (isMenurae ? 0.96 : 0.88)),
        L.tympanumY + (isMenurae ? 0.018 : 0.002)
      );
      const stW = Math.max(1.5, scale * (isMenurae ? 0.0072 : 0.0044));
      ctx.strokeStyle = isMenurae ? 'rgba(176, 88, 72, 0.62)' : 'rgba(184, 108, 92, 0.38)';
      ctx.lineWidth = stW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stOrig.x, stOrig.y);
      ctx.quadraticCurveTo(0.5 * (stOrig.x + stIns.x), stOrig.y + 4, stIns.x, stIns.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(104, 48, 38, 0.34)';
      ctx.lineWidth = 0.55;
      ctx.stroke();
    }
    ctx.restore();

    // Basal Menurae (Superb Lyrebird) possess a prominent fibrous sub-pessular bronchidesmus web
    // spanning between the medial walls of the primary bronchi (Ames 1971; King 1989)!
    if (L.hasBronchidesmus) {
      const ibTopL = this.model.toScreen(L.mlLx + 0.012, L.pessY + 0.030);
      const ibTopR = this.model.toScreen(L.mlRx - 0.012, L.pessY + 0.030);
      const ibBotL = this.model.toScreen(L.mlLx + 0.024, L.mlLy + L.mtmSpanL + 0.036);
      const ibBotR = this.model.toScreen(L.mlRx - 0.024, L.mlRy + L.mtmSpanR + 0.036);
      ctx.save();
      ctx.fillStyle = 'rgba(232, 214, 186, 0.48)';
      ctx.strokeStyle = 'rgba(128, 94, 62, 0.56)';
      ctx.lineWidth = 0.78;
      ctx.beginPath();
      ctx.moveTo(ibTopL.x, ibTopL.y);
      ctx.quadraticCurveTo(0.5 * (ibTopL.x + ibTopR.x), ibTopL.y + 3, ibTopR.x, ibTopR.y);
      ctx.lineTo(ibBotR.x, ibBotR.y);
      ctx.quadraticCurveTo(0.5 * (ibBotL.x + ibBotR.x), ibBotL.y - 4, ibBotL.x, ibBotL.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Delicate transverse collagen fiber striations across the bronchidesmus
      ctx.strokeStyle = 'rgba(128, 94, 62, 0.28)';
      ctx.lineWidth = 0.50;
      for (const u of [0.32, 0.64]) {
        const yRow = lerp(ibTopL.y, ibBotL.y, u);
        ctx.beginPath();
        ctx.moveTo(lerp(ibTopL.x, ibBotL.x, u) + 2, yRow);
        ctx.quadraticCurveTo(0.5 * (ibTopL.x + ibTopR.x), yRow + 1.5, lerp(ibTopR.x, ibBotR.x, u) - 2, yRow);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Reciprocal EMG neuromuscular activation (Goller & Suthers 1996):
    //   - Abductors (vTB) contract on inspiration / bronchial opening (gap > rest)
    //   - Adductors (dTB / dS) contract when pinching a bronchus closed (gap < rest)
    const abductActL = clamp(0.24 + Math.max(0.0, d.gapL.value - 0.068) * 4.6, 0.16, 1.38);
    const abductActR = clamp(0.24 + Math.max(0.0, d.gapR.value - 0.068) * 4.6, 0.16, 1.38);
    const adductActL = clamp(0.24 + Math.max(0.0, 0.082 - d.gapL.value) * 6.8, 0.16, 1.38);
    const adductActR = clamp(0.24 + Math.max(0.0, 0.082 - d.gapR.value) * 6.8, 0.16, 1.38);
    const tensActL = clamp((d.tensionL.value + 0.55) / 1.45, 0.05, 1.38);
    const tensActR = clamp((d.tensionR.value + 0.55) / 1.45, 0.05, 1.38);

    if (isMenurae) {
      // SUBORDER MENURAE (Superb Lyrebird): ONLY 3 pairs of elongated strap-like intrinsic muscles
      // originating high on the trachea and inserting onto the syringeal membranes rather than B2 half-rings (Ames 1971)!
      const strapTopYL = L.tympanumY - 0.132;
      const strapBulgeL = scale * 0.0086 * mScaleL;
      const strapBulgeR = scale * 0.0086 * mScaleR;

      // Lateral & oblique membrane-inserting straps (Pairs 1 & 2)
      this._drawMuscleCushion(
        ctx,
        this.model.toScreen(L.syrinxCx - L.trachHalfW - 0.016, strapTopYL),
        this.model.toScreen(L.bronchusLx - 0.014, L.llLy + 0.018),
        strapBulgeL * 0.92,
        Math.max(abductActL, adductActL * 0.85),
        'bronchusL'
      );
      this._drawMuscleCushion(
        ctx,
        this.model.toScreen(L.syrinxCx + L.trachHalfW + 0.016, strapTopYL),
        this.model.toScreen(L.bronchusRx + 0.014, L.llRy + 0.018),
        strapBulgeR * 0.92,
        Math.max(abductActR, adductActR * 0.85),
        'bronchusR'
      );

      // Ventromedial longitudinal strap (Pair 3) inserting near cranial MTM / MVC
      this._drawMuscleCushion(
        ctx,
        this.model.toScreen(L.syrinxCx - L.trachHalfW * 0.72, strapTopYL + 0.018),
        this.model.toScreen(L.mvcLx ?? (L.mlLx - 0.006), L.mvcLy ?? (L.mlLy + 0.016)),
        scale * L.vsBulgeL * 0.44,
        tensActL,
        'muscleVSL'
      );
      this._drawMuscleCushion(
        ctx,
        this.model.toScreen(L.syrinxCx + L.trachHalfW * 0.72, strapTopYL + 0.018),
        this.model.toScreen(L.mvcRx ?? (L.mlRx + 0.006), L.mvcRy ?? (L.mlRy + 0.016)),
        scale * L.vsBulgeR * 0.44,
        tensActR,
        'muscleVSR'
      );
      return;
    }

    // TRUE SONGBIRDS / PASSERI (4 paired intrinsic muscles: dTB, dS, vTB, vS — visibly asymmetric in Canary 1.48x Left!)
    const tymScale = L.tympanumScale ?? 1.0;

    // 1. Deeper dorsolateral oblique ADDUCTOR slips (dTB & dS) contracting when closing the bronchial valve!
    const dOrigY = L.tympanumY - 0.058 * tymScale;
    this._drawMuscleCushion(
      ctx,
      this.model.toScreen(L.syrinxCx - L.trachHalfW * 1.12, dOrigY),
      this.model.toScreen(L.bronchusLx - 0.024 * mScaleL, L.bronchusLy - 0.016),
      scale * 0.0080 * mScaleL,
      adductActL,
      null
    );
    this._drawMuscleCushion(
      ctx,
      this.model.toScreen(L.syrinxCx + L.trachHalfW * 1.12, dOrigY),
      this.model.toScreen(L.bronchusRx + 0.024 * mScaleR, L.bronchusRy - 0.016),
      scale * 0.0080 * mScaleR,
      adductActR,
      null
    );

    // 2. M. tracheobronchialis ventralis (vTB) — primary ABDUCTOR coursing laterally from distal trachea to lateral B2
    const tbOrigY = L.tympanumY - 0.052 * tymScale;
    const tbTopL = this.model.toScreen(L.syrinxCx - L.trachHalfW - 0.016 * mScaleL, tbOrigY);
    const tbBotL = this.model.toScreen(L.bronchusLx - 0.020 * mScaleL, L.bronchusLy + 0.006);
    this._drawMuscleCushion(ctx, tbTopL, tbBotL, scale * 0.0112 * mScaleL, abductActL, 'bronchusL');

    const tbTopR = this.model.toScreen(L.syrinxCx + L.trachHalfW + 0.016 * mScaleR, tbOrigY);
    const tbBotR = this.model.toScreen(L.bronchusRx + 0.020 * mScaleR, L.bronchusRy + 0.006);
    this._drawMuscleCushion(ctx, tbTopR, tbBotR, scale * 0.0112 * mScaleR, abductActR, 'bronchusR');

    // 3. M. syringealis ventralis (vS) — primary pitch tensor coursing VENTROMEDIALLY across tympanum to insert
    //    onto the Medial Ventral Cartilage (MVC) in the cranial MTM / ventral B2 tip (Düring et al. 2013)!
    const vsOrigY = L.tympanumY - 0.044 * tymScale;
    const vsTopL = this.model.toScreen(L.syrinxCx - L.trachHalfW * 0.72, vsOrigY);
    const vsBotL = this.model.toScreen(
      (L.mvcLx ?? (L.mlLx - 0.006)) - 0.003 * mScaleL,
      (L.mvcLy ?? (L.mlLy + 0.016)) + 0.006
    );
    this._drawMuscleCushion(ctx, vsTopL, vsBotL, scale * L.vsBulgeL * 0.58, tensActL, 'muscleVSL');

    const vsTopR = this.model.toScreen(L.syrinxCx + L.trachHalfW * 0.72, vsOrigY);
    const vsBotR = this.model.toScreen(
      (L.mvcRx ?? (L.mlRx + 0.006)) + 0.003 * mScaleR,
      (L.mvcRy ?? (L.mlRy + 0.016)) + 0.006
    );
    this._drawMuscleCushion(ctx, vsTopR, vsBotR, scale * L.vsBulgeR * 0.58, tensActR, 'muscleVSR');
  }

  _drawThroatPouch(ctx, L, telem) {
    // Anatomically accurate Oropharyngeal-Esophageal Cavity (OEC, Riede et al. 2004; Fletcher et al. 2006):
    // Supra-glottal pharyngeal arch above the laryngeal glottis + inflatable DORSAL cervical-esophageal chamber
    // expanding dorsocaudally BEHIND (-x) the upper cervical trachea!
    const dropY = L.oecDropY || 0;
    const exp = L.oecExpand || 0;
    const pharTopBack = this.model.toScreen(L.glottisX - 0.022 - 0.018 * exp, L.glottisY - 0.028 - 0.010 * exp);
    const pharTopFront = this.model.toScreen(L.oecFrontX, L.glottisY - 0.024 - 0.008 * exp);
    const glotVentral = this.model.toScreen(L.glottisX + L.trachHalfW * 0.96 + 0.012 * exp, L.glottisY + 0.022 + dropY * 0.35);
    const esophDorsalMid = this.model.toScreen(L.oecBackX, L.oecCenterY + dropY * 0.75);
    const esophCaudalApex = this.model.toScreen(
      lerp(L.oecBackX, L.glottisX - L.trachHalfW * 0.85, 0.52),
      (L.oecBottomY ?? (L.glottisY + 0.085)) + dropY * 0.90
    );
    const trachDorsalJoin = this.model.toScreen(
      L.glottisX - L.trachHalfW * 0.72,
      (L.oecBottomY ?? (L.glottisY + 0.085)) - 0.006 + dropY * 0.65
    );

    const buildOecPath = () => {
      ctx.beginPath();
      ctx.moveTo(pharTopBack.x, pharTopBack.y);
      ctx.quadraticCurveTo(
        0.5 * (pharTopBack.x + pharTopFront.x),
        pharTopBack.y - 4.5,
        pharTopFront.x,
        pharTopFront.y
      );
      ctx.quadraticCurveTo(
        pharTopFront.x + 5,
        0.5 * (pharTopFront.y + glotVentral.y),
        glotVentral.x,
        glotVentral.y
      );
      ctx.quadraticCurveTo(
        0.5 * (glotVentral.x + trachDorsalJoin.x),
        trachDorsalJoin.y - 2,
        trachDorsalJoin.x,
        trachDorsalJoin.y
      );
      ctx.quadraticCurveTo(
        esophCaudalApex.x - 4,
        esophCaudalApex.y + 4,
        esophDorsalMid.x,
        esophDorsalMid.y
      );
      ctx.bezierCurveTo(
        esophDorsalMid.x - 4,
        0.5 * (esophDorsalMid.y + pharTopBack.y),
        pharTopBack.x - 4,
        pharTopBack.y + 6,
        pharTopBack.x,
        pharTopBack.y
      );
      ctx.closePath();
    };

    ctx.save();
    buildOecPath();
    ctx.fillStyle = 'rgba(249, 242, 230, 0.90)';
    ctx.fill();

    const energy = clamp(((telem?.rmsL || 0) + (telem?.rmsR || 0)) * 0.6, 0, 1);
    const pouchCx = 0.56 * esophDorsalMid.x + 0.44 * glotVentral.x;
    const pouchCy = 0.52 * esophDorsalMid.y + 0.48 * pharTopBack.y;
    const oecGrad = ctx.createRadialGradient(
      pouchCx - 3, pouchCy - 2, 2,
      pouchCx, pouchCy, Math.max(18, Math.hypot(glotVentral.x - esophDorsalMid.x, esophCaudalApex.y - pharTopBack.y) * 0.68)
    );
    oecGrad.addColorStop(0, `rgba(252, 224, 208, ${(0.46 + 0.14 * energy).toFixed(3)})`);
    oecGrad.addColorStop(0.68, `rgba(218, 150, 130, ${(0.38 + 0.14 * energy).toFixed(3)})`);
    oecGrad.addColorStop(1, `rgba(172, 102, 86, ${(0.32 + 0.12 * energy).toFixed(3)})`);
    ctx.fillStyle = oecGrad;
    ctx.fill();

    // Longitudinal esophageal mucosal rugae inside the dorsal cervical-esophageal pouch
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(136, 76, 64, 0.24)';
    ctx.lineWidth = 0.54;
    for (const u of [0.28, 0.56]) {
      const rx0 = lerp(esophDorsalMid.x + 3, glotVentral.x - 6, u);
      ctx.beginPath();
      ctx.moveTo(rx0 + 2, pharTopBack.y + 4);
      ctx.quadraticCurveTo(rx0 - 3, esophDorsalMid.y, lerp(esophCaudalApex.x, trachDorsalJoin.x, u), esophCaudalApex.y - 2);
      ctx.stroke();
    }
    ctx.restore();

    buildOecPath();
    ctx.strokeStyle = 'rgba(136, 78, 66, 0.48)';
    ctx.lineWidth = 0.80;
    ctx.stroke();
    ctx.restore();

    this._drawPartHighlightGlow(ctx, 'oec', buildOecPath);
  }

  /**
   * Draws true 3D curved cartilaginous tracheal rings (no zipper beads!), a sculpted flared
   * syringeal tympanum drum (no pill-capsules!), stippled bony carinal pessulus, and C-shaped bronchial half-rings.
   */
  _drawSkeleton(ctx, L, d) {
    const scale = this.model.layout.scale;
    const numRings = L.trachRings ?? 12;
    const fusedRings = L.tympanumFusedRings ?? 4;
    const tymScale = L.tympanumScale ?? 1.0;
    const stretchNorm = L.trStretchNorm ?? 0.0;
    const curveX = L.trachCurveX ?? 0.0;
    const trSpanRatio = clamp((L.tympanumY - L.glottisY) / 0.260, 0.52, 1.65);
    const ringH = Math.max(
      1.5,
      scale *
        clamp(0.105 / numRings, 0.0062, 0.0108) *
        clamp(1.0 - 0.14 * stretchNorm, 0.78, 1.18)
    );
    const tymTopOffset = fusedRings > 0 ? 0.044 * tymScale : 0.038;
    const wallTopY = L.glottisY + 0.008;
    const wallBotY = L.tympanumY - tymTopOffset;
    const wallMidY = 0.5 * (wallTopY + wallBotY);
    const wallCtrlX = 0.5 * (L.glottisX + L.syrinxCx) + 2.0 * curveX;

    const buildTracheaHitPath = () => {
      const topL = this.model.toScreen(L.glottisX - L.trachHalfW - 0.02, L.glottisY);
      const topR = this.model.toScreen(L.glottisX + L.trachHalfW + 0.02, L.glottisY);
      const botR = this.model.toScreen(L.syrinxCx + L.trachHalfW + 0.02, L.tympanumY);
      const botL = this.model.toScreen(L.syrinxCx - L.trachHalfW - 0.02, L.tympanumY);
      const cL = this.model.toScreen(wallCtrlX - L.trachHalfW - 0.02, wallMidY);
      const cR = this.model.toScreen(wallCtrlX + L.trachHalfW + 0.02, wallMidY);
      ctx.beginPath();
      ctx.moveTo(topL.x, topL.y);
      ctx.lineTo(topR.x, topR.y);
      ctx.quadraticCurveTo(cR.x, cR.y, botR.x, botR.y);
      ctx.lineTo(botL.x, botL.y);
      ctx.quadraticCurveTo(cL.x, cL.y, topL.x, topL.y);
      ctx.closePath();
    };
    this._drawPartHighlightGlow(ctx, 'trachea', buildTracheaHitPath);

    ctx.save();
    // 0. Cranial Laryngeal Cricoid & Paired Arytenoid Cartilages guarding the Glottis into the OEC!
    for (const sgn of [-1, 1]) {
      const aryBase = this.model.toScreen(L.glottisX + sgn * L.trachHalfW * 0.96, L.glottisY + 0.006);
      const aryTip = this.model.toScreen(L.glottisX + sgn * L.trachHalfW * 0.34, L.glottisY - 0.014);
      const aryMid = this.model.toScreen(L.glottisX + sgn * L.trachHalfW * 1.12, L.glottisY - 0.006);
      ctx.fillStyle = '#F3EAD6';
      ctx.strokeStyle = 'rgba(104, 82, 58, 0.58)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.moveTo(aryBase.x, aryBase.y);
      ctx.quadraticCurveTo(aryMid.x, aryMid.y, aryTip.x, aryTip.y);
      ctx.quadraticCurveTo(0.5 * (aryBase.x + aryTip.x), aryBase.y - 1.5, aryBase.x, aryBase.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Slender outer curved tracheal perichondrium walls (bore-scaled & elastically bendable!)
    const glL = this.model.toScreen(L.glottisX - L.trachHalfW, wallTopY);
    const glR = this.model.toScreen(L.glottisX + L.trachHalfW, wallTopY);
    const tyL = this.model.toScreen(L.syrinxCx - L.trachHalfW, wallBotY);
    const tyR = this.model.toScreen(L.syrinxCx + L.trachHalfW, wallBotY);
    const wCtrlL = this.model.toScreen(wallCtrlX - L.trachHalfW, wallMidY);
    const wCtrlR = this.model.toScreen(wallCtrlX + L.trachHalfW, wallMidY);
    ctx.strokeStyle = 'rgba(102, 80, 58, 0.45)';
    ctx.lineWidth = 0.82;
    ctx.beginPath();
    ctx.moveTo(glL.x, glL.y);
    ctx.quadraticCurveTo(wCtrlL.x, wCtrlL.y, tyL.x, tyL.y);
    ctx.moveTo(glR.x, glR.y);
    ctx.quadraticCurveTo(wCtrlR.x, wCtrlR.y, tyR.x, tyR.y);
    ctx.stroke();

    // 1. Elastic Accordion Cartilaginous Tracheal Rings + Stretched Inter-Annular Ligaments!
    const ringStartY = L.glottisY + 0.014;
    const ringEndY = L.tympanumY - tymTopOffset - 0.006;
    const warpU = (uLinear) =>
      clamp(uLinear + 0.18 * uLinear * (1.0 - uLinear) * clamp(stretchNorm, -0.9, 1.2), 0.01, 0.99);
    const sampleSpine = (uLinear) => {
      const u = warpU(uLinear);
      const cxN = lerp(L.glottisX, L.syrinxCx, u) + 4.0 * u * (1.0 - u) * curveX;
      const cyN = lerp(ringStartY, ringEndY, u);
      const txN = (L.syrinxCx - L.glottisX) + 4.0 * (1.0 - 2.0 * u) * curveX;
      const tyN = Math.max(0.04, ringEndY - ringStartY);
      const tLen = Math.hypot(txN, tyN) || 1.0;
      // Unit normal pointing laterally right across the local curved tube axis
      const nrmX = tyN / tLen;
      const nrmY = -txN / tLen;
      return { cxN, cyN, nrmX, nrmY };
    };

    const ligAlpha = clamp(0.22 + 0.28 * Math.max(0.0, stretchNorm), 0.14, 0.56);
    const elastinAlpha = clamp(0.34 * Math.max(0.0, stretchNorm), 0.0, 0.44);

    for (let i = 0; i < numRings; i++) {
      const u = (i + 0.5) / numRings;
      const sp = sampleSpine(u);
      const hw = L.trachHalfW * 1.03;
      const pL = this.model.toScreen(sp.cxN - sp.nrmX * hw, sp.cyN - sp.nrmY * hw);
      const pR = this.model.toScreen(sp.cxN + sp.nrmX * hw, sp.cyN + sp.nrmY * hw);

      if (i < numRings - 1) {
        const uNext = (i + 1.5) / numRings;
        const spNext = sampleSpine(uNext);
        const uMidLig = (i + 1.0) / numRings;
        const spLig = sampleSpine(uMidLig);
        const hwLig = L.trachHalfW * 0.95;
        const ligL = this.model.toScreen(spLig.cxN - spLig.nrmX * hwLig, spLig.cyN - spLig.nrmY * hwLig);
        const ligR = this.model.toScreen(spLig.cxN + spLig.nrmX * hwLig, spLig.cyN + spLig.nrmY * hwLig);

        ctx.strokeStyle = `rgba(138, 108, 76, ${ligAlpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.7, ringH * 0.30 * trSpanRatio);
        ctx.beginPath();
        ctx.moveTo(ligL.x + 1, ligL.y);
        ctx.quadraticCurveTo(0.5 * (ligL.x + ligR.x), 0.5 * (ligL.y + ligR.y) + ringH * 0.22, ligR.x - 1, ligR.y);
        ctx.stroke();

        // Fine longitudinal elastin fibers visible across stretched inter-annular gaps when pulled down!
        if (elastinAlpha > 0.02) {
          ctx.strokeStyle = `rgba(148, 112, 74, ${elastinAlpha.toFixed(3)})`;
          ctx.lineWidth = 0.55;
          for (const lat of [-0.55, 0.0, 0.55]) {
            const aPt = this.model.toScreen(sp.cxN + sp.nrmX * hwLig * lat, sp.cyN + sp.nrmY * hwLig * lat);
            const bPt = this.model.toScreen(spNext.cxN + spNext.nrmX * hwLig * lat, spNext.cyN + spNext.nrmY * hwLig * lat);
            ctx.beginPath();
            ctx.moveTo(aPt.x, aPt.y);
            ctx.lineTo(bPt.x, bPt.y);
            ctx.stroke();
          }
        }
      }

      const rg = ctx.createLinearGradient(pL.x, pL.y, pR.x, pR.y);
      rg.addColorStop(0, '#DFD0B4');
      rg.addColorStop(0.28, '#FDF9F0');
      rg.addColorStop(0.72, '#EADBC0');
      rg.addColorStop(1, '#C2AE8C');

      ctx.fillStyle = rg;
      ctx.strokeStyle = 'rgba(104, 82, 58, 0.52)';
      ctx.lineWidth = 0.64;

      const axX = -sp.nrmY * ringH * 0.46;
      const axY = sp.nrmX * ringH * 0.46;
      ctx.beginPath();
      ctx.moveTo(pL.x - axX, pL.y - axY);
      ctx.quadraticCurveTo(
        0.5 * (pL.x + pR.x) - axX * 0.30,
        0.5 * (pL.y + pR.y) - axY * 0.30,
        pR.x - axX,
        pR.y - axY
      );
      ctx.quadraticCurveTo(pR.x + sp.nrmX * 1.2, pR.y + sp.nrmY * 1.2, pR.x + axX, pR.y + axY);
      ctx.quadraticCurveTo(
        0.5 * (pL.x + pR.x) + axX * 1.65,
        0.5 * (pL.y + pR.y) + axY * 1.65,
        pL.x + axX,
        pL.y + axY
      );
      ctx.quadraticCurveTo(pL.x - sp.nrmX * 1.2, pL.y - sp.nrmY * 1.2, pL.x - axX, pL.y - axY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 2. Caudal Tracheosyringeal Junction:
    //    - Oscines (fusedRings >= 3): Flared ossified ivory-cartilage Tympanum drum with fused suture lines!
    //    - Basal Menurae (fusedRings === 0, Lyrebird): Unfused articulated caudal tracheal rings & flexible membrane sleeve!
    if (fusedRings > 0) {
      // Cooperative whole-tympanum rock during manual pessulus chord-joystick drag (UX-02: pessulus is synostotically fused to tympanum!)
      const tymTilt = (L.pessTilt || 0) * 0.42;
      const cosTym = Math.cos(tymTilt);
      const sinTym = Math.sin(tymTilt);
      const rotTym = (dxN, dyN) =>
        this.model.toScreen(
          L.syrinxCx + dxN * cosTym - dyN * sinTym,
          L.tympanumY + dxN * sinTym + dyN * cosTym
        );
      const flare = 1.12 + 0.10 * tymScale;
      const tymTopL = rotTym(-L.trachHalfW * 1.02, -tymTopOffset);
      const tymTopR = rotTym(L.trachHalfW * 1.02, -tymTopOffset);
      const tymBotL = rotTym(-L.trachHalfW * flare, 0.009);
      const tymBotR = rotTym(L.trachHalfW * flare, 0.009);

      const tymGrad = ctx.createLinearGradient(tymBotL.x, 0, tymBotR.x, 0);
      tymGrad.addColorStop(0, 'rgba(218, 204, 176, 0.80)');
      tymGrad.addColorStop(0.32, 'rgba(252, 247, 235, 0.86)');
      tymGrad.addColorStop(0.72, 'rgba(234, 220, 194, 0.80)');
      tymGrad.addColorStop(1, 'rgba(194, 178, 148, 0.84)');
      ctx.fillStyle = tymGrad;
      ctx.strokeStyle = 'rgba(104, 82, 58, 0.60)';
      ctx.lineWidth = 0.84;
      ctx.beginPath();
      ctx.moveTo(tymTopL.x, tymTopL.y);
      ctx.quadraticCurveTo(0.5 * (tymTopL.x + tymTopR.x), 0.5 * (tymTopL.y + tymTopR.y) + 1.5, tymTopR.x, tymTopR.y);
      ctx.quadraticCurveTo(0.5 * (tymTopR.x + tymBotR.x) + 1, 0.5 * (tymTopR.y + tymBotR.y), tymBotR.x, tymBotR.y);
      ctx.quadraticCurveTo(0.5 * (tymBotL.x + tymBotR.x), 0.5 * (tymBotL.y + tymBotR.y) + 2.5, tymBotL.x, tymBotL.y);
      ctx.quadraticCurveTo(0.5 * (tymTopL.x + tymBotL.x) - 1, 0.5 * (tymTopL.y + tymBotL.y), tymTopL.x, tymTopL.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(104, 82, 58, 0.28)';
      ctx.lineWidth = 0.55;
      for (let sIdx = 1; sIdx < fusedRings; sIdx++) {
        const u = sIdx / fusedRings;
        const sxL = lerp(tymTopL.x, tymBotL.x, u);
        const syL = lerp(tymTopL.y, tymBotL.y, u);
        const sxR = lerp(tymTopR.x, tymBotR.x, u);
        const syR = lerp(tymTopR.y, tymBotR.y, u);
        ctx.beginPath();
        ctx.moveTo(sxL + 1, syL);
        ctx.quadraticCurveTo(0.5 * (sxL + sxR), 0.5 * (syL + syR) + 1.8, sxR - 1, syR);
        ctx.stroke();
      }
    } else {
      // Menurae unfused caudal tracheal membrane sleeve + 3 articulated discrete rings!
      const slvTopL = this.model.toScreen(L.syrinxCx - L.trachHalfW * 0.98, L.tympanumY - tymTopOffset);
      const slvTopR = this.model.toScreen(L.syrinxCx + L.trachHalfW * 0.98, L.tympanumY - tymTopOffset);
      const slvBotL = this.model.toScreen(L.syrinxCx - L.trachHalfW * 1.12, L.tympanumY + 0.010);
      const slvBotR = this.model.toScreen(L.syrinxCx + L.trachHalfW * 1.12, L.tympanumY + 0.010);
      ctx.fillStyle = 'rgba(228, 206, 174, 0.44)';
      ctx.strokeStyle = 'rgba(124, 92, 64, 0.46)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.moveTo(slvTopL.x, slvTopL.y);
      ctx.lineTo(slvTopR.x, slvTopR.y);
      ctx.lineTo(slvBotR.x, slvBotR.y);
      ctx.lineTo(slvBotL.x, slvBotL.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      for (let c = 0; c < 3; c++) {
        const u = (c + 0.5) / 3.0;
        const cy = lerp(L.tympanumY - tymTopOffset + 0.004, L.tympanumY + 0.006, u);
        const hw = L.trachHalfW * lerp(1.02, 1.12, u);
        const cL = this.model.toScreen(L.syrinxCx - hw, cy);
        const cR = this.model.toScreen(L.syrinxCx + hw, cy);
        ctx.fillStyle = '#F5EBDA';
        ctx.strokeStyle = 'rgba(98, 76, 52, 0.58)';
        ctx.lineWidth = 0.66;
        ctx.beginPath();
        ctx.moveTo(cL.x, cL.y - ringH * 0.40);
        ctx.quadraticCurveTo(0.5 * (cL.x + cR.x), cL.y - ringH * 0.12, cR.x, cR.y - ringH * 0.40);
        ctx.lineTo(cR.x, cR.y + ringH * 0.40);
        ctx.quadraticCurveTo(0.5 * (cL.x + cR.x), cL.y + ringH * 0.68, cL.x, cL.y + ringH * 0.40);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // 3. Stippled Bone-Ivory Carinal Center Splitter (Pessulus) + Cranial Membrana Semilunaris (when present!)
    const pTilt = (L.pessTilt || 0) * 0.65;
    const cosT = Math.cos(pTilt);
    const sinT = Math.sin(pTilt);
    const rotPess = (dxN, dyN) =>
      this.model.toScreen(L.pessX + dxN * cosT - dyN * sinT, L.pessY + dxN * sinT + dyN * cosT);

    if (L.hasSemilunaris) {
      // Delicate crescentic mucosal sail rising cranially atop the pessulus (Nightingale & Superb Lyrebird!)
      const semiTip = rotPess(0, -0.064);
      const semiBaseL = rotPess(-0.011, -0.028);
      const semiBaseR = rotPess(0.011, -0.028);
      ctx.fillStyle = 'rgba(236, 174, 152, 0.62)';
      ctx.strokeStyle = 'rgba(164, 78, 56, 0.68)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.moveTo(semiBaseL.x, semiBaseL.y);
      ctx.quadraticCurveTo(semiBaseL.x + 1, semiTip.y + 4, semiTip.x, semiTip.y);
      ctx.quadraticCurveTo(semiBaseR.x - 1, semiTip.y + 4, semiBaseR.x, semiBaseR.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const pessW = L.clade === 'menurae' ? 0.030 : 0.025;
    const pessApex = rotPess(0, -0.038);
    const pessBaseL = rotPess(-pessW, 0.028);
    const pessBaseR = rotPess(pessW, 0.028);
    const pessKeelBot = rotPess(0, 0.039);
    const pessCtrlL = rotPess(-pessW * 1.24, 0.002);
    const pessCtrlR = rotPess(pessW * 1.24, 0.002);

    const buildPessulusPath = () => {
      ctx.beginPath();
      ctx.moveTo(pessApex.x, pessApex.y);
      ctx.quadraticCurveTo(pessCtrlL.x, pessCtrlL.y, pessBaseL.x, pessBaseL.y);
      ctx.quadraticCurveTo(pessKeelBot.x, pessKeelBot.y + 2.5, pessBaseR.x, pessBaseR.y);
      ctx.quadraticCurveTo(pessCtrlR.x, pessCtrlR.y, pessApex.x, pessApex.y);
      ctx.closePath();
    };

    const pg = ctx.createLinearGradient(pessBaseL.x, pessApex.y, pessBaseR.x, pessKeelBot.y);
    pg.addColorStop(0, '#FCF6E8');
    pg.addColorStop(1, '#D4C09C');
    buildPessulusPath();
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = PALETTE.ringStroke;
    ctx.lineWidth = 0.95;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(104, 82, 58, 0.32)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(pessApex.x, pessApex.y + 3);
    ctx.lineTo(pessKeelBot.x, pessKeelBot.y - 2);
    ctx.stroke();

    this._drawPartHighlightGlow(ctx, 'pessulus', buildPessulusPath);

    // 4. Foreshortened Transverse C-Shaped Bronchial Half-Rings (B2 & B3 here; B1's superficial ventral arch
    //    is drawn over the rostral LL neck in _drawVibratoryTissues so all 3 half-rings B1, B2, B3 read clearly! Düring et al. 2013)
    for (const side of ['L', 'R']) {
      const isL = side === 'L';
      const sgn = isL ? -1 : 1;
      const bScale = isL ? (L.bronchScaleL ?? 1.0) : (L.bronchScaleR ?? 1.0);
      const llX = isL ? L.llLx : L.llRx;
      const llY = isL ? L.llLy : L.llRy;
      const mlX = isL ? L.mlLx : L.mlRx;
      const gapVal = d ? (isL ? d.gapL.value : d.gapR.value) : 0.085;
      const pivotTilt = clamp((gapVal - 0.075) * 0.16, -0.012, 0.016);
      const cleftVis = isL ? L.cleftVisL : L.cleftVisR;
      const cleftFlare = clamp((cleftVis - 0.024) * 0.36, -0.008, 0.026);

      for (let b = 1; b <= 2; b++) {
        const u = b / 2.0;
        const by = llY + 0.024 + (b - 1) * 0.028;
        const medEnd = this.model.toScreen(
          lerp(mlX, llX, 0.24) + sgn * u * 0.012 * bScale,
          by + pivotTilt
        );
        const latShoulder = this.model.toScreen(
          llX + sgn * ((0.024 + u * 0.018) * bScale + cleftFlare * (1.0 - 0.25 * u)),
          by - 0.004 - pivotTilt * 0.6
        );
        const ventArch = this.model.toScreen(
          lerp(mlX, llX, 0.68) + sgn * u * 0.016 * bScale,
          by + 0.009
        );
        const bandThick = Math.max(1.7, scale * (b === 1 ? 0.0068 : 0.0056) * clamp(0.75 + 0.25 * bScale, 0.80, 1.18));

        ctx.save();
        ctx.lineCap = 'round';
        // Subtle recessed dorsal cartilage horn peeking behind the medial MTM margin
        ctx.strokeStyle = 'rgba(138, 114, 84, 0.42)';
        ctx.lineWidth = bandThick * 0.72;
        ctx.beginPath();
        ctx.moveTo(medEnd.x - sgn * 3.0, medEnd.y - 2.6);
        ctx.quadraticCurveTo(0.5 * (medEnd.x + latShoulder.x), medEnd.y - 3.6, latShoulder.x, latShoulder.y);
        ctx.stroke();

        // Foreshortened transverse ventral C-ring arch wrapping horizontally across the bronchus!
        ctx.strokeStyle = 'rgba(94, 72, 48, 0.72)';
        ctx.lineWidth = bandThick + 1.3;
        ctx.beginPath();
        ctx.moveTo(medEnd.x, medEnd.y);
        ctx.quadraticCurveTo(ventArch.x, ventArch.y, latShoulder.x, latShoulder.y);
        ctx.stroke();

        const cg = ctx.createLinearGradient(medEnd.x, medEnd.y, latShoulder.x, latShoulder.y);
        cg.addColorStop(0, '#FCF6E8');
        cg.addColorStop(0.55, b === 1 ? '#F7EFE0' : '#EBE0C6');
        cg.addColorStop(1, '#CBB692');
        ctx.strokeStyle = cg;
        ctx.lineWidth = bandThick;
        ctx.beginPath();
        ctx.moveTo(medEnd.x, medEnd.y);
        ctx.quadraticCurveTo(ventArch.x, ventArch.y, latShoulder.x, latShoulder.y);
        ctx.stroke();

        // Rounded hyaline cartilage medial chondral knob at the open MTM border
        ctx.fillStyle = '#FCF7EB';
        ctx.strokeStyle = 'rgba(94, 72, 48, 0.65)';
        ctx.lineWidth = 0.62;
        ctx.beginPath();
        ctx.arc(medEnd.x, medEnd.y, bandThick * 0.56, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  _drawVibratoryTissues(ctx, L, d, telem) {
    const scale = this.model.layout.scale;
    const t = this.model.time;

    for (const side of ['L', 'R']) {
      const isL = side === 'L';
      const sgn = isL ? -1 : 1;

      const mlX = isL ? L.mlLx : L.mlRx;
      const mlY = isL ? L.mlLy : L.mlRy;
      const llX = isL ? L.llLx : L.llRx;
      const llY = isL ? L.llLy : L.llRy;
      const mtmBow = isL ? L.mtmBowL : L.mtmBowR;
      const mtmSpan = isL ? L.mtmSpanL : L.mtmSpanR;
      const mtmStr = isL ? d.mtmStretchL.value : d.mtmStretchR.value;
      const tens = isL ? d.tensionL.value : d.tensionR.value;
      const vib = isL ? L.vibL : L.vibR;
      const closedRatio = isL ? (telem?.closedRatioL || 0) : (telem?.closedRatioR || 0);
      const warbleDisp = (isL ? L.warbleL : L.warbleR) * 0.012;

      // 1. Translucent Elastic Medial Tympaniform Membrane (MTM — slackens wide & buzzy vs. pulls razor-taut!)
      const mtmTop = this.model.toScreen(mlX + warbleDisp, mlY + 0.020);
      const mtmCtrl = this.model.toScreen(
        mlX - sgn * (0.022 - mtmBow * 1.45) + warbleDisp,
        mlY + mtmSpan * 0.60
      );
      const mtmBot = this.model.toScreen(mlX + sgn * 0.018, mlY + mtmSpan + 0.030);

      const buildMtmPath = () => {
        ctx.beginPath();
        ctx.moveTo(mtmTop.x, mtmTop.y);
        ctx.quadraticCurveTo(mtmCtrl.x, mtmCtrl.y, mtmBot.x, mtmBot.y);
      };

      const slackGain = clamp(1.30 - 0.42 * mtmStr, 0.72, 1.30);
      ctx.save();
      if (vib > 0.0018) {
        for (const phaseOff of [-1, 1]) {
          const flutter = phaseOff * vib * scale * 1.05 * slackGain * Math.sin(t * 54.0 + (isL ? 0 : 1.9));
          ctx.strokeStyle = 'rgba(188, 92, 52, 0.38)';
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(mtmTop.x, mtmTop.y);
          ctx.quadraticCurveTo(mtmCtrl.x + flutter, mtmCtrl.y, mtmBot.x, mtmBot.y);
          ctx.stroke();
        }
      }
      buildMtmPath();
      ctx.strokeStyle = PALETTE.membraneStroke;
      ctx.lineWidth = lerp(1.88, 1.12, clamp((mtmStr - 0.08) / 1.15, 0, 1));
      ctx.stroke();
      ctx.restore();

      this._drawPartHighlightGlow(ctx, isL ? 'mtmL' : 'mtmR', buildMtmPath);

      // 2. Species-Scaled Rose-Coral Mucosal Labial Cushions:
      //    - Medial Labium (ML) cranially tethered to the lateral periosteal base of the pessulus (King 1989; Düring et al. 2013)
      //    - Paired ivory Medial Ventral Cartilage (MVC) sesamoid embedded in cranial MTM (vS tendon insertion!)
      //    - Superficial ventral arch of Bronchial Half-Ring B1 embracing the lateral bronchial wall over rostral LL!
      const padScale = isL ? (L.padScaleL ?? 1.0) : (L.padScaleR ?? 1.0);
      const bScale = isL ? (L.bronchScaleL ?? 1.0) : (L.bronchScaleR ?? 1.0);
      const mlPt = this.model.toScreen(mlX + warbleDisp, mlY);
      const llPt = this.model.toScreen(llX - warbleDisp, llY);
      const tensNorm = clamp(tens / 1.45, -0.78, 1.15);
      const padRx = scale * 0.0142 * padScale * clamp(1.0 - 0.24 * tensNorm, 0.68, 1.28);
      const padRy = scale * 0.0224 * (0.72 + 0.28 * padScale) * clamp(1.0 + 0.26 * tensNorm, 0.78, 1.36);

      // Cranial mucosal fold tethering ML cleanly onto the lateral base of the pessulus (ZERO mid-lumen floating!)
      const pTilt = (L.pessTilt || 0) * 0.65;
      const pessW = L.clade === 'menurae' ? 0.030 : 0.025;
      const pessAnchor = this.model.toScreen(
        L.pessX + sgn * pessW * 0.86 * Math.cos(pTilt) - 0.024 * Math.sin(pTilt),
        L.pessY + sgn * pessW * 0.86 * Math.sin(pTilt) + 0.024 * Math.cos(pTilt)
      );
      ctx.save();
      ctx.strokeStyle = 'rgba(178, 94, 78, 0.76)';
      ctx.lineWidth = Math.max(2.2, padRx * 0.92);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pessAnchor.x, pessAnchor.y);
      ctx.quadraticCurveTo(0.5 * (pessAnchor.x + mlPt.x), pessAnchor.y + 2, mlPt.x - sgn * padRx * 0.25, mlPt.y - padRy * 0.55);
      ctx.stroke();
      ctx.restore();

      if (vib > 0.0020) {
        ctx.save();
        for (let g = 0; g < 2; g++) {
          const ph = t * (isL ? 44.0 : 56.0) + g * Math.PI;
          const dxWave = Math.sin(ph) * vib * scale * 1.25;
          ctx.strokeStyle = 'rgba(196, 86, 62, 0.36)';
          ctx.lineWidth = 0.90;
          ctx.beginPath();
          ctx.ellipse(mlPt.x - sgn * dxWave, mlPt.y, padRx * 1.06, padRy, sgn * 0.18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(llPt.x + sgn * dxWave, llPt.y, padRx * 1.06, padRy, -sgn * 0.18, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      const buildLabiaPath = () => {
        ctx.beginPath();
        ctx.ellipse(mlPt.x, mlPt.y, padRx, padRy, sgn * 0.18, 0, Math.PI * 2);
        ctx.moveTo(llPt.x + padRx, llPt.y);
        ctx.ellipse(llPt.x, llPt.y, padRx, padRy, -sgn * 0.18, 0, Math.PI * 2);
      };

      const padHueT = clamp((tensNorm + 0.6) / 1.6, 0, 1);
      const padFill = `rgb(${Math.round(lerp(222, 198, padHueT))}, ${Math.round(lerp(138, 82, padHueT))}, ${Math.round(lerp(118, 68, padHueT))})`;

      ctx.save();
      for (const [pt, ang] of [[mlPt, sgn * 0.18], [llPt, -sgn * 0.18]]) {
        ctx.fillStyle = padFill;
        ctx.strokeStyle = PALETTE.valveStroke;
        ctx.lineWidth = 0.92;
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, padRx, padRy, ang, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = PALETTE.valveCore;
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, padRx * 0.48, padRy * 0.54, ang, 0, Math.PI * 2);
        ctx.fill();
      }

      // Paired Ivory-Hyaline Medial Ventral Cartilage (MVC) sesamoid nodule in cranial MTM (Düring et al. 2013)!
      const mvcPt = this.model.toScreen(
        (isL ? (L.mvcLx ?? (mlX - 0.006)) : (L.mvcRx ?? (mlX + 0.006))) + warbleDisp * 0.6,
        isL ? (L.mvcLy ?? (mlY + 0.016)) : (L.mvcRy ?? (mlY + 0.016))
      );
      const mvcRx = Math.max(2.1, scale * 0.0062);
      const mvcRy = Math.max(1.6, scale * 0.0044);
      ctx.fillStyle = '#FCF6E8';
      ctx.strokeStyle = 'rgba(98, 76, 52, 0.72)';
      ctx.lineWidth = 0.70;
      ctx.beginPath();
      ctx.ellipse(mvcPt.x, mvcPt.y, mvcRx, mvcRy, -sgn * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Superficial transverse ventral arch of First Bronchial Half-Ring (B1) cradling lateral LL!
      const gapVal = isL ? d.gapL.value : d.gapR.value;
      const b1Tilt = clamp((gapVal - 0.075) * 0.16, -0.012, 0.016);
      const b1Med = this.model.toScreen(lerp(mlX, llX, 0.48), llY - 0.012 + b1Tilt);
      const b1Lat = this.model.toScreen(llX + sgn * 0.023 * bScale, llY - 0.008 - b1Tilt * 0.5);
      const b1Ctrl = this.model.toScreen(lerp(mlX, llX, 0.86) + sgn * 0.008 * bScale, llY - 0.003);
      const b1Thick = Math.max(1.8, scale * 0.0070 * clamp(0.75 + 0.25 * bScale, 0.82, 1.18));
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(94, 72, 48, 0.74)';
      ctx.lineWidth = b1Thick + 1.2;
      ctx.beginPath();
      ctx.moveTo(b1Med.x, b1Med.y);
      ctx.quadraticCurveTo(b1Ctrl.x, b1Ctrl.y, b1Lat.x, b1Lat.y);
      ctx.stroke();
      ctx.strokeStyle = '#FCF7EB';
      ctx.lineWidth = b1Thick;
      ctx.beginPath();
      ctx.moveTo(b1Med.x, b1Med.y);
      ctx.quadraticCurveTo(b1Ctrl.x, b1Ctrl.y, b1Lat.x, b1Lat.y);
      ctx.stroke();

      const isPinchedShut = gapVal <= -0.01;
      if (closedRatio > 0.04 || isPinchedShut) {
        const cleftMidX = 0.5 * (mlPt.x + llPt.x);
        const cleftMidY = 0.5 * (mlPt.y + llPt.y);
        ctx.strokeStyle = isPinchedShut
          ? 'rgba(104, 68, 56, 0.78)'
          : `rgba(196, 84, 38, ${clamp(0.38 + closedRatio * 1.25, 0.38, 0.90).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cleftMidX, cleftMidY - padRy * 0.65);
        ctx.lineTo(cleftMidX, cleftMidY + padRy * 0.65);
        ctx.stroke();
      }
      ctx.restore();

      this._drawPartHighlightGlow(ctx, isL ? 'labiaL' : 'labiaR', buildLabiaPath);
    }

    const singBob = clamp(((telem?.rmsL || 0) + (telem?.rmsR || 0)) * 0.009, 0, 0.014);
    ctx.save();
    for (const vp of this.voicePulses) {
      if (vp.s <= 0.90) {
        this._drawVoicePulseCrescent(ctx, vp, L, singBob);
      }
    }
    ctx.restore();
  }

  /**
   * Draws authentic Keulemans/Gould/Audubon lateral-profile facial anatomy:
   *  - Deep-set jewel-like orbital eye with concentric periorbital featherlets & radial iris
   *  - Clean open side-profile singing bill (open air between mandibles — NO solid red backing wedge!)
   *  - Feathered culmen/lore base & chin malar tufts overlapping the keratin bill base
   *  - Articulated scuted tarsometatarsus & anisodactyl toes wrapping the 3D bark cylinder
   */
  _drawBirdFaceAndFeet(ctx, L, telem) {
    const scale = this.model.layout.scale;
    const plum = this.model.currentSpecies.plumage;
    const m = {
      chestTrim: 1.0,
      dorsalTrim: 1.0,
      bellyTuck: 1.0,
      tailLenMul: 1.0,
      headSlim: 1.0,
      wingReach: 1.0,
      ...(plum.morph || {}),
    };
    const d = this.model.dofs;
    const totalRms = (telem?.rmsL || 0) + (telem?.rmsR || 0);
    const singBob = clamp(totalRms * 0.008, 0, 0.012);
    const headCx = L.headCx;
    const headCy = L.headCy - singBob;

    const isConical = plum.billStyle === 'conical';
    const isCardinal = Boolean(plum.hasMask);
    const isLyre = Boolean(plum.hasLyreTail);

    ctx.save();

    // 1. Cardinal Velvet-Black Forehead, Lores & Pointed Chin-Bib Mask (Audubon Plate 159 / Fuertes)!
    // Wraps narrow culmen base, covers lores up to the anterior/ventral eye margin (leaving posterior crown & ear-coverts scarlet),
    // and sweeps down into a velvet-black chin & upper-throat bib!
    if (plum.hasMask) {
      const mFore = this.model.toScreen(headCx + 0.103, headCy - 0.093);
      const mForeRear = this.model.toScreen(headCx + 0.076, headCy - 0.088);
      const mEyeFront = this.model.toScreen(headCx + 0.035, headCy - 0.062);
      const mEyeUnder = this.model.toScreen(headCx + 0.020, headCy - 0.040);
      // Cardinalis cardinalis full velvet-black throat gorget wrapping around the upper anterior cutaway throat!
      const mMalarRear = this.model.toScreen(headCx + 0.042, headCy + 0.034);
      const mBibTip = this.model.toScreen(headCx + 0.092, headCy + 0.074);
      const mChin = this.model.toScreen(headCx + 0.112, headCy + 0.032);
      const mBillMid = this.model.toScreen(headCx + 0.092, headCy - 0.034);

      const mg = ctx.createRadialGradient(
        mEyeFront.x + 10,
        mEyeUnder.y + 8,
        2,
        mEyeFront.x + 8,
        mEyeUnder.y + 10,
        scale * 0.125
      );
      mg.addColorStop(0, 'rgba(18, 13, 12, 0.96)');
      mg.addColorStop(0.80, 'rgba(26, 18, 17, 0.92)');
      mg.addColorStop(1, 'rgba(38, 24, 22, 0.72)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.moveTo(mFore.x, mFore.y);
      ctx.quadraticCurveTo(0.5 * (mFore.x + mForeRear.x), mFore.y - 1.2, mForeRear.x, mForeRear.y);
      ctx.quadraticCurveTo(0.5 * (mForeRear.x + mEyeFront.x), mForeRear.y + 3, mEyeFront.x, mEyeFront.y);
      ctx.quadraticCurveTo(mEyeUnder.x - 2.2, 0.5 * (mEyeFront.y + mEyeUnder.y), mEyeUnder.x, mEyeUnder.y);
      ctx.quadraticCurveTo(mMalarRear.x - 3, 0.5 * (mEyeUnder.y + mMalarRear.y), mMalarRear.x, mMalarRear.y);
      ctx.quadraticCurveTo(0.5 * (mMalarRear.x + mBibTip.x), mBibTip.y - 1.5, mBibTip.x, mBibTip.y);
      ctx.quadraticCurveTo(mChin.x + 1.5, 0.5 * (mBibTip.y + mChin.y), mChin.x, mChin.y);
      ctx.quadraticCurveTo(mBillMid.x, 0.5 * (mChin.y + mFore.y), mFore.x, mFore.y);
      ctx.closePath();
      ctx.fill();

      // Delicate feathered black barbule fringe along the posterior loral & malar mask border
      ctx.strokeStyle = 'rgba(20, 14, 13, 0.62)';
      ctx.lineWidth = 0.56;
      const maskFringe = [
        [headCx + 0.068, headCy - 0.083, -3.2, -0.4],
        [headCx + 0.048, headCy - 0.072, -3.4, 0.2],
        [headCx + 0.022, headCy - 0.036, -3.6, 1.0],
        [headCx + 0.032, headCy - 0.012, -3.6, 1.3],
        [headCx + 0.044, headCy + 0.014, -3.5, 1.5],
        [headCx + 0.064, headCy + 0.032, -3.2, 1.8],
        [headCx + 0.082, headCy + 0.043, -2.6, 2.0],
      ];
      for (const [fx, fy, dx, dy] of maskFringe) {
        const fp = this.model.toScreen(fx, fy);
        ctx.beginPath();
        ctx.moveTo(fp.x + 1.4, fp.y);
        ctx.lineTo(fp.x + dx, fp.y + dy);
        ctx.stroke();
      }
    }

    // 2. Deep-Set Jewel-Like Naturalist Eye (or SynthBird Phosphor-Green CRT Oscilloscope Eye!)
    const blinkPhase = this.model.time % 4.6;
    const isBlinking = !plum.isCyborg && blinkPhase > 4.48;
    const eyePt = this.model.toScreen(headCx + 0.026, headCy - 0.056);
    const eyeScale = plum.isCyborg ? 1.24 : isLyre ? 1.14 : plum.tailColor ? 1.05 : 1.0;
    const eyeR = Math.max(3.9, scale * 0.0186 * eyeScale);

    // Soft recessed orbital socket shading
    const sockG = ctx.createRadialGradient(eyePt.x, eyePt.y, eyeR * 0.62, eyePt.x, eyePt.y, eyeR * 1.95);
    sockG.addColorStop(0, 'rgba(38, 24, 14, 0.20)');
    sockG.addColorStop(1, 'rgba(38, 24, 14, 0)');
    ctx.fillStyle = sockG;
    ctx.beginPath();
    ctx.arc(eyePt.x, eyePt.y, eyeR * 1.95, 0, Math.PI * 2);
    ctx.fill();

    if (plum.isCyborg) {
      // Knurled Antique-Brass Circular Oscilloscope Bezel + Live Phosphor-Green CRT Waveform Eye!
      const bezR = eyeR * 1.28;
      const bezG = ctx.createLinearGradient(eyePt.x - bezR, eyePt.y - bezR, eyePt.x + bezR, eyePt.y + bezR);
      bezG.addColorStop(0, '#F5E2B2');
      bezG.addColorStop(0.48, '#C89B4E');
      bezG.addColorStop(1, '#5E4218');
      ctx.fillStyle = bezG;
      ctx.strokeStyle = 'rgba(26, 20, 14, 0.86)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.arc(eyePt.x, eyePt.y, bezR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 4 cardinal bezel notch ticks
      ctx.strokeStyle = 'rgba(42, 28, 12, 0.72)';
      ctx.lineWidth = 0.65;
      for (let k = 0; k < 4; k++) {
        const ka = (k * Math.PI) / 2 + Math.PI * 0.25;
        ctx.beginPath();
        ctx.moveTo(eyePt.x + Math.cos(ka) * eyeR * 1.02, eyePt.y + Math.sin(ka) * eyeR * 1.02);
        ctx.lineTo(eyePt.x + Math.cos(ka) * bezR * 0.96, eyePt.y + Math.sin(ka) * bezR * 0.96);
        ctx.stroke();
      }

      // Deep P1 Cathode-Ray Screen with Graticule & Live Two-Voice Syrinx Trace
      ctx.save();
      ctx.beginPath();
      ctx.arc(eyePt.x, eyePt.y, eyeR * 0.98, 0, Math.PI * 2);
      const crtG = ctx.createRadialGradient(eyePt.x, eyePt.y, eyeR * 0.1, eyePt.x, eyePt.y, eyeR);
      crtG.addColorStop(0, '#123824');
      crtG.addColorStop(0.75, '#092015');
      crtG.addColorStop(1, '#04100A');
      ctx.fillStyle = crtG;
      ctx.fill();
      ctx.clip();

      // CRT graticule crosshairs
      ctx.strokeStyle = 'rgba(92, 236, 144, 0.24)';
      ctx.lineWidth = 0.48;
      ctx.beginPath();
      ctx.moveTo(eyePt.x - eyeR, eyePt.y);
      ctx.lineTo(eyePt.x + eyeR, eyePt.y);
      ctx.moveTo(eyePt.x, eyePt.y - eyeR);
      ctx.lineTo(eyePt.x, eyePt.y + eyeR);
      ctx.stroke();

      // Live phosphor-green waveform trace (oscillates with L/R syrinx voices when active, calm baseline when silent!)
      const ampL = clamp((telem?.rmsL || 0) * 0.62, 0, 0.56);
      const ampR = clamp((telem?.rmsR || 0) * 0.62, 0, 0.56);
      const wFL = clamp(((telem?.f0L || 260) / 220) * 1.6, 1.1, 6.2);
      const wFR = clamp(((telem?.f0R || 390) / 220) * 1.6, 1.4, 7.8);
      const ph = this.model.time * 18.0;

      for (const [glowW, glowA] of [
        [2.2, 0.32],
        [1.05, 0.96],
      ]) {
        ctx.strokeStyle = `rgba(104, 252, 158, ${glowA})`;
        ctx.lineWidth = glowW;
        ctx.beginPath();
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
          const u = (i / steps) * 2 - 1; // -1 .. +1
          const win = 1 - u * u * 0.35;
          let wy = 0;
          if (ampL + ampR > 0.03) {
            wy =
              (ampL * Math.sin(u * Math.PI * wFL + ph) +
                ampR * Math.sin(u * Math.PI * wFR - ph * 1.17)) *
              eyeR *
              0.78 *
              win;
          } else {
            // Subtle idle standby calibration pulse
            const blip = Math.exp(-Math.pow((u - ((this.model.time * 0.9) % 2 - 1)) * 5.5, 2));
            wy = -blip * eyeR * 0.22;
          }
          const px = eyePt.x + u * eyeR * 0.92;
          const py = eyePt.y + wy;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Convex CRT glass catchlight
      ctx.fillStyle = 'rgba(235, 255, 242, 0.52)';
      ctx.beginPath();
      ctx.ellipse(eyePt.x - eyeR * 0.28, eyePt.y - eyeR * 0.34, eyeR * 0.28, eyeR * 0.14, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(12, 24, 18, 0.90)';
      ctx.lineWidth = 0.80;
      ctx.beginPath();
      ctx.arc(eyePt.x, eyePt.y, eyeR * 0.98, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Superciliary brow feather arch (subtle painterly shadow)
      ctx.strokeStyle = plum.hasMask ? 'rgba(92, 20, 14, 0.34)' : 'rgba(42, 28, 18, 0.28)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.moveTo(eyePt.x + eyeR * 1.32, eyePt.y - eyeR * 0.68);
      ctx.quadraticCurveTo(eyePt.x - eyeR * 0.10, eyePt.y - eyeR * 1.42, eyePt.x - eyeR * 1.48, eyePt.y - eyeR * 0.52);
      ctx.stroke();

      if (isLyre) {
        // Bare powder-slate-blue periorbital skin patch of Menura novaehollandiae (smooth bare skin, no feather dots!)
        const lyreSkin = ctx.createRadialGradient(eyePt.x, eyePt.y, eyeR * 0.45, eyePt.x - 1.5, eyePt.y, eyeR * 1.66);
        lyreSkin.addColorStop(0, 'rgba(96, 134, 170, 0.88)');
        lyreSkin.addColorStop(0.68, 'rgba(82, 114, 148, 0.68)');
        lyreSkin.addColorStop(1, 'rgba(68, 92, 118, 0.14)');
        ctx.fillStyle = lyreSkin;
        ctx.beginPath();
        ctx.ellipse(eyePt.x - eyeR * 0.18, eyePt.y + 0.4, eyeR * 1.56, eyeR * 1.24, -0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(46, 66, 88, 0.42)';
        ctx.lineWidth = 0.62;
        ctx.beginPath();
        ctx.ellipse(eyePt.x, eyePt.y, eyeR * 1.12, eyeR * 1.04, -0.06, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Delicate concentric periorbital eyelid featherlets (prominent cream on Thrush, subtle rim on Canary/Cardinal/Finch!)
        const ringCol = plum.eyeRing || '#F5ECDA';
        const ringAlpha = plum.eyeRingAlpha ?? 0.65;
        ctx.fillStyle = hexToRgba(ringCol, ringAlpha);
        for (let p = 0; p < 18; p++) {
          const ang = (p / 18) * Math.PI * 2;
          const rx = eyePt.x + Math.cos(ang) * eyeR * 1.07;
          const ry = eyePt.y + Math.sin(ang) * eyeR * 1.00;
          ctx.beginPath();
          ctx.ellipse(rx, ry, eyeR * 0.17, eyeR * 0.10, ang, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isBlinking) {
        ctx.fillStyle = plum.crown;
        ctx.beginPath();
        ctx.ellipse(eyePt.x, eyePt.y, eyeR * 1.02, eyeR * 0.86, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#241812';
        ctx.lineWidth = 0.95;
        ctx.beginPath();
        ctx.moveTo(eyePt.x - eyeR, eyePt.y);
        ctx.quadraticCurveTo(eyePt.x, eyePt.y + eyeR * 0.34, eyePt.x + eyeR, eyePt.y);
        ctx.stroke();
      } else {
        const isCrimsonIris = plum.eyeIris === '#B82418' || plum.eyeIris === '#8E1E14';
        const irisG = ctx.createRadialGradient(
          eyePt.x + eyeR * 0.22,
          eyePt.y + eyeR * 0.24,
          eyeR * 0.08,
          eyePt.x,
          eyePt.y,
          eyeR * 1.00
        );
        irisG.addColorStop(0, isCrimsonIris ? '#E64A36' : '#8A5636');
        irisG.addColorStop(0.55, plum.eyeIris || '#2B1B14');
        irisG.addColorStop(1, isCrimsonIris ? '#2D0705' : '#100A07');
        ctx.fillStyle = irisG;
        ctx.beginPath();
        ctx.ellipse(eyePt.x, eyePt.y, eyeR * 1.00, eyeR * 0.94, -0.06, 0, Math.PI * 2);
        ctx.fill();

        // Warm translucent lower-right corneal refraction crescent inside the iris
        ctx.strokeStyle = isCrimsonIris ? 'rgba(252, 128, 98, 0.34)' : 'rgba(222, 158, 96, 0.28)';
        ctx.lineWidth = Math.max(0.75, eyeR * 0.14);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(eyePt.x + eyeR * 0.02, eyePt.y, eyeR * 0.72, 0.15, Math.PI * 0.62);
        ctx.stroke();

        // Deep velvet pupil
        ctx.fillStyle = '#080504';
        ctx.beginPath();
        ctx.arc(eyePt.x + eyeR * 0.03, eyePt.y, eyeR * 0.52, 0, Math.PI * 2);
        ctx.fill();

        // Wet-glass upper-left pinpoint sky catchlight + tiny secondary corneal glint (Keulemans / Fuertes style!)
        ctx.fillStyle = 'rgba(255, 253, 248, 0.95)';
        ctx.beginPath();
        ctx.ellipse(
          eyePt.x - eyeR * 0.24,
          eyePt.y - eyeR * 0.28,
          Math.max(0.95, eyeR * 0.21),
          Math.max(0.72, eyeR * 0.15),
          -0.55,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 250, 240, 0.68)';
        ctx.beginPath();
        ctx.arc(eyePt.x + eyeR * 0.12, eyePt.y - eyeR * 0.42, Math.max(0.55, eyeR * 0.085), 0, Math.PI * 2);
        ctx.fill();

        // Fine sepia eyelid margin contour
        ctx.strokeStyle = 'rgba(22, 14, 10, 0.88)';
        ctx.lineWidth = 0.76;
        ctx.beginPath();
        ctx.ellipse(eyePt.x, eyePt.y, eyeR * 1.01, eyeR * 0.95, -0.06, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 3. Sculpted Horn-Keratin Lateral Singing Bill (or Machined Split-Caliper Metal Mandibles on SynthBird!)
    const open = L.beakOpenNorm;
    const billLen = plum.billLen ?? (isCardinal ? 0.160 : isConical ? 0.140 : isLyre ? 0.205 : 0.184);
    const culmenDepth = plum.culmenDepth ?? (isCardinal ? 0.092 : isConical ? 0.074 : 0.066);
    const gonysDepth = plum.gonysDepth ?? (isCardinal ? 0.022 : isConical ? 0.008 : -0.004);
    const culmenArch = plum.culmenArch ?? (isCardinal ? 0.021 : isConical ? 0.012 : 0.007);
    const culmenRootY = headCy - culmenDepth;
    const commissureY = headCy - 0.034;
    const gonysRootY = headCy + gonysDepth;

    const baseX = headCx + 0.104;
    const rictus = this.model.toScreen(headCx + 0.088, commissureY);
    const uBase = this.model.toScreen(baseX - 0.005, culmenRootY);
    const uTipNx = baseX + billLen - 0.008 * open;
    // Menura novaehollandiae shows a subtle insectivorous/foraging decurve at the maxilla tip!
    const uTipNy = commissureY + (isLyre ? 0.014 : isCardinal ? 0.007 : 0.004) - 0.048 * open;
    const uTip = this.model.toScreen(uTipNx, uTipNy);
    const uArch = this.model.toScreen(
      baseX + billLen * 0.52,
      lerp(culmenRootY, uTipNy, 0.32) - culmenArch
    );
    const uTomCtrl = this.model.toScreen(
      baseX + billLen * 0.48,
      lerp(commissureY, uTipNy, 0.52) - 0.004
    );

    const lBase = this.model.toScreen(baseX - 0.005, gonysRootY);
    const lTipNx = baseX - 0.002 + billLen * 0.94 - 0.015 * open;
    const lTipNy = commissureY + (isLyre ? 0.008 : 0.004) + 0.070 * open;
    const lTip = this.model.toScreen(lTipNx, lTipNy);
    const lKeel = this.model.toScreen(
      baseX + billLen * 0.46,
      lerp(gonysRootY, lTipNy, 0.56) + (isCardinal ? 0.015 : isConical ? 0.010 : 0.005)
    );
    const lTomCtrl = this.model.toScreen(
      baseX + billLen * 0.44,
      lerp(commissureY, lTipNy, 0.50) + 0.003
    );

    const buildBeakHitPath = () => {
      ctx.beginPath();
      ctx.moveTo(uBase.x, uBase.y);
      ctx.quadraticCurveTo(uArch.x, uArch.y, uTip.x, uTip.y);
      ctx.quadraticCurveTo(uTomCtrl.x, uTomCtrl.y, rictus.x, rictus.y);
      ctx.quadraticCurveTo(lTomCtrl.x, lTomCtrl.y, lTip.x, lTip.y);
      ctx.quadraticCurveTo(lKeel.x, lKeel.y, lBase.x, lBase.y);
      ctx.quadraticCurveTo(rictus.x - 3, rictus.y, uBase.x, uBase.y);
      ctx.closePath();
    };

    // Escaping breath streamlines gliding cleanly through the open air between the mandibles!
    ctx.save();
    for (const p of this.particles) {
      if (p.s >= 0.98) {
        this._drawStreamlineParticle(ctx, p, L, d, telem, singBob);
      }
    }
    ctx.restore();

    if (plum.isCyborg) {
      // Machined Split-Caliper Steel & Brass Mandibles with Acoustic Copper Waveguide Flare & Brass Pivot Screw!
      if (open > 0.03) {
        const gapeSpan = 0.40;
        const rictTop = this.model.toScreen(lerp(headCx + 0.088, uTipNx, gapeSpan), lerp(commissureY, uTipNy, gapeSpan));
        const rictBot = this.model.toScreen(lerp(headCx + 0.088, lTipNx, gapeSpan), lerp(commissureY, lTipNy, gapeSpan));
        const hornG = ctx.createLinearGradient(rictus.x, rictus.y, 0.5 * (rictTop.x + rictBot.x), 0.5 * (rictTop.y + rictBot.y));
        hornG.addColorStop(0, 'rgba(184, 108, 44, 0.86)');
        hornG.addColorStop(0.65, 'rgba(218, 156, 78, 0.54)');
        hornG.addColorStop(1, 'rgba(218, 156, 78, 0.08)');
        ctx.fillStyle = hornG;
        ctx.beginPath();
        ctx.moveTo(rictus.x, rictus.y);
        ctx.lineTo(rictTop.x, rictTop.y);
        ctx.quadraticCurveTo(0.5 * (rictTop.x + rictBot.x) - 2, 0.5 * (rictTop.y + rictBot.y), rictBot.x, rictBot.y);
        ctx.closePath();
        ctx.fill();
      }

      // Upper machined brushed-steel caliper maxilla
      const uMetal = ctx.createLinearGradient(uBase.x, uBase.y, uBase.x, rictus.y + 4);
      uMetal.addColorStop(0, '#EEF2F2');
      uMetal.addColorStop(0.45, '#A0B0B8');
      uMetal.addColorStop(1, '#4C5C66');
      ctx.fillStyle = uMetal;
      ctx.strokeStyle = 'rgba(24, 32, 38, 0.84)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(uBase.x, uBase.y);
      ctx.quadraticCurveTo(uArch.x, uArch.y, uTip.x, uTip.y);
      ctx.quadraticCurveTo(uTomCtrl.x, uTomCtrl.y, rictus.x, rictus.y);
      ctx.lineTo(uBase.x, uBase.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Milled flute groove + acoustic vent port on upper caliper
      ctx.strokeStyle = 'rgba(30, 40, 46, 0.58)';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.moveTo(uBase.x + 5, lerp(uBase.y, rictus.y, 0.55));
      ctx.lineTo(lerp(uBase.x, uTip.x, 0.72), lerp(0.5 * (uBase.y + rictus.y), uTip.y, 0.72));
      ctx.stroke();

      // Lower machined antique-brass caliper mandible
      const lBrass = ctx.createLinearGradient(lBase.x, rictus.y, lBase.x, lKeel.y + 4);
      lBrass.addColorStop(0, '#F4DFAC');
      lBrass.addColorStop(0.52, '#C89B4E');
      lBrass.addColorStop(1, '#705020');
      ctx.fillStyle = lBrass;
      ctx.strokeStyle = 'rgba(38, 26, 14, 0.82)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(rictus.x, rictus.y);
      ctx.quadraticCurveTo(lTomCtrl.x, lTomCtrl.y, lTip.x, lTip.y);
      ctx.quadraticCurveTo(lKeel.x, lKeel.y, lBase.x, lBase.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Slotted brass mandible pivot screw at rictus hinge!
      const pivR = Math.max(2.4, scale * 0.0082);
      ctx.fillStyle = '#E6C274';
      ctx.strokeStyle = 'rgba(36, 24, 12, 0.86)';
      ctx.lineWidth = 0.68;
      ctx.beginPath();
      ctx.arc(rictus.x + 1.2, rictus.y, pivR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rictus.x + 1.2 - pivR * 0.65, rictus.y - pivR * 0.25);
      ctx.lineTo(rictus.x + 1.2 + pivR * 0.65, rictus.y + pivR * 0.25);
      ctx.stroke();
    } else {
      // Subtle shadowed oral-gape recess in the basal 34% of the open mouth + slender rose tongue tip (Keulemans singing gape)
      if (open > 0.03) {
        const gapeSpan = 0.34;
        const rictTop = this.model.toScreen(
          lerp(headCx + 0.088, uTipNx, gapeSpan),
          lerp(commissureY, uTipNy, gapeSpan)
        );
        const rictBot = this.model.toScreen(
          lerp(headCx + 0.088, lTipNx, gapeSpan),
          lerp(commissureY, lTipNy, gapeSpan)
        );
        const gapeGrad = ctx.createLinearGradient(rictus.x, rictus.y, 0.5 * (rictTop.x + rictBot.x), 0.5 * (rictTop.y + rictBot.y));
        gapeGrad.addColorStop(0, 'rgba(96, 36, 30, 0.74)');
        gapeGrad.addColorStop(0.65, 'rgba(138, 62, 52, 0.48)');
        gapeGrad.addColorStop(1, 'rgba(164, 82, 68, 0.10)');
        ctx.fillStyle = gapeGrad;
        ctx.beginPath();
        ctx.moveTo(rictus.x, rictus.y);
        ctx.lineTo(rictTop.x, rictTop.y);
        ctx.quadraticCurveTo(
          0.5 * (rictTop.x + rictBot.x) - 2.6,
          0.5 * (rictTop.y + rictBot.y),
          rictBot.x,
          rictBot.y
        );
        ctx.closePath();
        ctx.fill();

        if (open > 0.14) {
          const tTip = this.model.toScreen(
            baseX + billLen * 0.54,
            lerp(commissureY, lTipNy, 0.54)
          );
          ctx.fillStyle = 'rgba(202, 106, 94, 0.86)';
          ctx.strokeStyle = 'rgba(116, 44, 36, 0.44)';
          ctx.lineWidth = 0.55;
          ctx.beginPath();
          ctx.moveTo(rictus.x + 2, rictus.y + 1.0);
          ctx.quadraticCurveTo(0.5 * (rictus.x + tTip.x), tTip.y - 1.5, tTip.x, tTip.y);
          ctx.quadraticCurveTo(0.5 * (rictus.x + tTip.x), tTip.y + 1.6, rictus.x + 2, rictus.y + 2.4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // Upper mandible (maxilla) with translucent watercolor horn-keratin shading & operculate nostril
      const uGrad = ctx.createLinearGradient(uBase.x, uBase.y, uBase.x, rictus.y + 4);
      uGrad.addColorStop(0, tonePigment(plum.beakUpper, 0.24));
      uGrad.addColorStop(0.50, plum.beakUpper);
      uGrad.addColorStop(1, tonePigment(plum.beakUpper, -0.24));
      ctx.fillStyle = uGrad;
      ctx.strokeStyle = 'rgba(44, 26, 16, 0.74)';
      ctx.lineWidth = 0.78;
      ctx.beginPath();
      ctx.moveTo(uBase.x, uBase.y);
      ctx.quadraticCurveTo(uArch.x, uArch.y, uTip.x, uTip.y);
      ctx.quadraticCurveTo(uTomCtrl.x, uTomCtrl.y, rictus.x, rictus.y);
      ctx.quadraticCurveTo(uBase.x - 2.0, 0.5 * (rictus.y + uBase.y), uBase.x, uBase.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Sunlit paper-reserve culmen horn ridge highlight
      ctx.strokeStyle = 'rgba(255, 251, 242, 0.58)';
      ctx.lineWidth = 0.76;
      ctx.beginPath();
      ctx.moveTo(uBase.x + 3, uBase.y + 1.3);
      ctx.quadraticCurveTo(uArch.x, uArch.y + 1.3, uTip.x - 2.5, uTip.y + 0.6);
      ctx.stroke();

      // Operculate nostril (naris) nestled in a soft nasal fossa
      const narisPt = this.model.toScreen(
        baseX + billLen * 0.20,
        lerp(culmenRootY, commissureY, 0.56) - 0.008 * open
      );
      ctx.fillStyle = 'rgba(34, 20, 14, 0.74)';
      ctx.beginPath();
      ctx.ellipse(
        narisPt.x,
        narisPt.y,
        Math.max(1.4, scale * 0.0068),
        Math.max(0.80, scale * 0.0032),
        -0.16 - 0.15 * open,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 248, 236, 0.34)';
      ctx.lineWidth = 0.48;
      ctx.beginPath();
      ctx.arc(narisPt.x, narisPt.y - 0.3, Math.max(1.2, scale * 0.0055), Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();

      // Lower mandible (mandibula / gonys) with warm reflected belly light
      const lGrad = ctx.createLinearGradient(lBase.x, rictus.y, lBase.x, lKeel.y + 4);
      lGrad.addColorStop(0, tonePigment(plum.beakLower, -0.14));
      lGrad.addColorStop(0.55, plum.beakLower);
      lGrad.addColorStop(1, tonePigment(plum.beakLower, 0.14));
      ctx.fillStyle = lGrad;
      ctx.strokeStyle = 'rgba(46, 28, 18, 0.70)';
      ctx.lineWidth = 0.80;
      ctx.beginPath();
      ctx.moveTo(rictus.x, rictus.y);
      ctx.quadraticCurveTo(lTomCtrl.x, lTomCtrl.y, lTip.x, lTip.y);
      ctx.quadraticCurveTo(lKeel.x, lKeel.y, lBase.x, lBase.y);
      ctx.quadraticCurveTo(rictus.x + 1, 0.5 * (lBase.y + rictus.y), rictus.x, rictus.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cohesive Feathered Loral & Chin Margin overlapping the keratin bill base (no comb-teeth!)
      const billFeatherCol = plum.hasMask ? '#1C1514' : plum.crown;
      const chinFeatherCol = plum.hasMask ? '#1C1514' : plum.cheek || plum.breast;
      ctx.fillStyle = hexToRgba(billFeatherCol, 0.92);
      ctx.beginPath();
      ctx.moveTo(uBase.x - 3.5, uBase.y - 0.5);
      ctx.quadraticCurveTo(uBase.x + 2.8, 0.5 * (uBase.y + rictus.y), rictus.x + 0.5, rictus.y);
      ctx.quadraticCurveTo(uBase.x - 3.5, 0.5 * (uBase.y + rictus.y), uBase.x - 3.5, uBase.y - 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = hexToRgba(chinFeatherCol, 0.90);
      ctx.beginPath();
      ctx.moveTo(rictus.x + 0.5, rictus.y);
      ctx.quadraticCurveTo(lBase.x + 2.2, 0.5 * (rictus.y + lBase.y), lBase.x - 2.5, lBase.y + 0.5);
      ctx.quadraticCurveTo(lBase.x - 4.0, 0.5 * (rictus.y + lBase.y), rictus.x + 0.5, rictus.y);
      ctx.closePath();
      ctx.fill();

      if (!isConical) {
        // Delicate insectivore rictal bristles at the gape corner
        ctx.strokeStyle = 'rgba(38, 24, 16, 0.42)';
        ctx.lineWidth = 0.52;
        for (let b = -1; b <= 1; b++) {
          ctx.beginPath();
          ctx.moveTo(rictus.x + 1.5, rictus.y - 1.1 + b * 1.7);
          ctx.lineTo(rictus.x + 6.2, rictus.y + 2.0 + b * 2.0);
          ctx.stroke();
        }
      }
    }

    this._drawPartHighlightGlow(ctx, 'beak', buildBeakHitPath);

    // 4. Directional Copperplate Acoustic Wavefront Arcs Radiating Cleanly Ahead of the Singing Bill Tip!
    const waveOrigin = this.model.toScreen(
      baseX + billLen + 0.022,
      0.5 * (uTipNy + lTipNy)
    );
    const arcHalfSpan = lerp(0.24, 0.42, open);
    const aimAngle = -0.18;
    ctx.save();
    for (const w of this.soundWaves) {
      const prog = w.age / 1.25;
      const alpha = (1.0 - prog) * w.amp * 0.44;
      if (alpha <= 0.01) continue;

      const r = (0.032 + w.age * 0.19) * scale;
      ctx.strokeStyle = `rgba(168, 66, 36, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.80;
      ctx.setLineDash([4, 2.5]);
      ctx.beginPath();
      ctx.arc(waveOrigin.x, waveOrigin.y, r, aimAngle - arcHalfSpan, aimAngle + arcHalfSpan);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // 5. Allometrically Scaled Avian Tarsometatarsus & Anisodactyl Feet (or Articulated Stainless-Steel Cyborg Tarsi & Claws!)
    const legCol = plum.legColor || '#C49674';
    const bodyMassG = this.model.currentSpecies.organ?.bodyMassG ?? 35.0;
    const hockDrop = bodyMassG <= 14 ? 0.036 : bodyMassG <= 22 ? 0.018 : isLyre ? -0.008 : 0.0;
    const legRobust = plum.isCyborg ? 1.12 : isLyre ? 1.42 : bodyMassG <= 14 ? 0.86 : bodyMassG <= 22 ? 0.92 : 1.0;
    const clawMul = isLyre ? 1.68 : 1.0;
    const bellyBaseY = Math.max(L.caudalBottomY + 0.062, 0.400 * m.bellyTuck);
    const ventBaseY = 0.414 * m.bellyTuck;
    const legSpecs = [
      { thighNx: 0.062, thighNy: bellyBaseY - 0.032 + hockDrop * 0.45, hockNx: 0.028 + hockDrop * 0.35, hockNy: 0.506 + hockDrop, footNx: 0.136, footNy: 0.676, shade: 0.16 },
      { thighNx: -0.092, thighNy: ventBaseY - 0.030 + hockDrop * 0.45, hockNx: -0.138 + hockDrop * 0.35, hockNy: 0.520 + hockDrop, footNx: -0.022, footNy: 0.678, shade: 0.0 },
    ];

    for (const lg of legSpecs) {
      const thighPt = this.model.toScreen(lg.thighNx, lg.thighNy);
      const hockPt = this.model.toScreen(lg.hockNx, lg.hockNy);
      const footPt = this.model.toScreen(lg.footNx, lg.footNy);
      const tarsusW = Math.max(1.9, scale * 0.0096 * legRobust);

      // Soft watercolor cast shadow of gripping foot onto the perch
      ctx.fillStyle = 'rgba(26, 20, 14, 0.22)';
      ctx.beginPath();
      ctx.ellipse(footPt.x + scale * 0.014, footPt.y + scale * 0.010, scale * 0.036, scale * 0.009, 0.06, 0, Math.PI * 2);
      ctx.fill();

      if (plum.isCyborg) {
        // Articulated Stainless-Steel & Brass Mechanical Tarsus, Hydraulic Tibial Cylinder & Caliper Claws!
        const cylAng = Math.atan2(hockPt.y - thighPt.y, hockPt.x - thighPt.x);
        const cylLen = Math.hypot(hockPt.x - thighPt.x, hockPt.y - thighPt.y);

        // (a) Twin-grooved stainless-steel tarsal strut from hock clevis to ankle hub
        ctx.strokeStyle = 'rgba(24, 32, 38, 0.88)';
        ctx.lineWidth = tarsusW + 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hockPt.x, hockPt.y);
        ctx.lineTo(footPt.x, footPt.y);
        ctx.stroke();

        ctx.strokeStyle = lg.shade > 0 ? '#9EAAB0' : '#C4CED2';
        ctx.lineWidth = tarsusW;
        ctx.beginPath();
        ctx.moveTo(hockPt.x, hockPt.y);
        ctx.lineTo(footPt.x, footPt.y);
        ctx.stroke();

        // Parallel hydraulic return capillary along rear of tarsus
        ctx.strokeStyle = '#B88E46';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(hockPt.x - tarsusW * 0.72, hockPt.y + 1);
        ctx.lineTo(footPt.x - tarsusW * 0.72, footPt.y + 1);
        ctx.stroke();

        // (b) Machined aluminum/brass tibial servo housing (replaces downy feather cuff!)
        ctx.save();
        ctx.translate(thighPt.x, thighPt.y);
        ctx.rotate(cylAng);
        const sleeveW = tarsusW * 2.15;
        const sg = ctx.createLinearGradient(0, -sleeveW * 0.5, 0, sleeveW * 0.5);
        sg.addColorStop(0, '#DCE2E4');
        sg.addColorStop(0.5, '#687C86');
        sg.addColorStop(1, '#2E3C44');
        ctx.fillStyle = sg;
        ctx.strokeStyle = 'rgba(22, 30, 36, 0.84)';
        ctx.lineWidth = 0.72;
        ctx.fillRect(-4, -sleeveW * 0.5, cylLen * 0.68, sleeveW);
        ctx.strokeRect(-4, -sleeveW * 0.5, cylLen * 0.68, sleeveW);

        // Chrome piston rod extending to hock clevis
        ctx.fillStyle = '#E8ECEC';
        ctx.fillRect(cylLen * 0.68, -tarsusW * 0.52, cylLen * 0.32, tarsusW * 1.04);
        ctx.strokeRect(cylLen * 0.68, -tarsusW * 0.52, cylLen * 0.32, tarsusW * 1.04);
        ctx.restore();

        // Brass clevis pivot pins at hock & ankle!
        for (const [jp, rMul] of [
          [hockPt, 0.92],
          [footPt, 0.84],
        ]) {
          ctx.fillStyle = '#DFB86A';
          ctx.strokeStyle = 'rgba(34, 24, 12, 0.86)';
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.arc(jp.x, jp.y, tarsusW * rMul, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // (c) Mechanical posterior hallux & 3 anterior phalangeal caliper digits gripping the cloth patch cable!
        const toeW = Math.max(1.6, scale * 0.0080 * legRobust);
        const halluxMid = this.model.toScreen(lg.footNx - 0.026, lg.footNy + 0.011);
        const halluxTip = this.model.toScreen(lg.footNx - 0.020, lg.footNy + 0.029);

        ctx.strokeStyle = 'rgba(24, 32, 38, 0.88)';
        ctx.lineWidth = toeW + 1.1;
        ctx.beginPath();
        ctx.moveTo(footPt.x - 1, footPt.y);
        ctx.quadraticCurveTo(halluxMid.x, halluxMid.y, halluxTip.x, halluxTip.y - 2);
        ctx.stroke();
        ctx.strokeStyle = '#AEB8BE';
        ctx.lineWidth = toeW * 0.86;
        ctx.stroke();

        ctx.fillStyle = '#1E2A32';
        ctx.beginPath();
        ctx.moveTo(halluxTip.x - 1.6, halluxTip.y - 3.2);
        ctx.quadraticCurveTo(halluxTip.x + 1.8, halluxTip.y + 2.4, halluxTip.x + 5.6, halluxTip.y + 3.6);
        ctx.quadraticCurveTo(halluxTip.x + 0.8, halluxTip.y - 1.6, halluxTip.x - 1.6, halluxTip.y - 3.2);
        ctx.fill();

        const frontToes = [
          { dx: 0.016, dy: 0.025, clawDx: 1.2 },
          { dx: 0.038, dy: 0.030, clawDx: 2.5 },
          { dx: 0.056, dy: 0.023, clawDx: 3.4 },
        ];
        for (const ft of frontToes) {
          const tMid = this.model.toScreen(lg.footNx + ft.dx * 0.65, lg.footNy - 0.003 + ft.dy * 0.36);
          const tEnd = this.model.toScreen(lg.footNx + ft.dx, lg.footNy + ft.dy);

          ctx.strokeStyle = 'rgba(24, 32, 38, 0.88)';
          ctx.lineWidth = toeW + 1.1;
          ctx.beginPath();
          ctx.moveTo(footPt.x, footPt.y);
          ctx.quadraticCurveTo(tMid.x, tMid.y, tEnd.x, tEnd.y);
          ctx.stroke();

          ctx.strokeStyle = lg.shade > 0 ? '#9EA8AE' : '#C6D0D4';
          ctx.lineWidth = toeW * 0.88;
          ctx.beginPath();
          ctx.moveTo(footPt.x, footPt.y);
          ctx.quadraticCurveTo(tMid.x, tMid.y, tEnd.x, tEnd.y);
          ctx.stroke();

          // Tiny brass phalangeal knuckle rivet
          ctx.fillStyle = '#D8B062';
          ctx.beginPath();
          ctx.arc(tMid.x, tMid.y, Math.max(1.1, toeW * 0.46), 0, Math.PI * 2);
          ctx.fill();

          const clawTipX = tEnd.x + ft.clawDx;
          const clawTipY = tEnd.y + Math.max(3.6, scale * 0.0155);
          ctx.fillStyle = '#1E2A32';
          ctx.beginPath();
          ctx.moveTo(tEnd.x - toeW * 0.42, tEnd.y - 0.8);
          ctx.quadraticCurveTo(tEnd.x + ft.clawDx * 0.9, tEnd.y + 2.0, clawTipX, clawTipY);
          ctx.quadraticCurveTo(tEnd.x, tEnd.y + 2.1, tEnd.x + toeW * 0.42, tEnd.y - 0.8);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // (a) Slender scuted avian tarsometatarsus + delicate intertarsal heel condyle (drawn before downy tibial cuff!)
        ctx.fillStyle = tonePigment(legCol, -0.16 - lg.shade);
        ctx.beginPath();
        ctx.arc(hockPt.x, hockPt.y - 0.5, tarsusW * 0.60, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(64, 42, 26, 0.82)';
        ctx.lineWidth = tarsusW + 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hockPt.x, hockPt.y - 1);
        ctx.lineTo(footPt.x, footPt.y);
        ctx.stroke();

        ctx.strokeStyle = tonePigment(legCol, -lg.shade);
        ctx.lineWidth = tarsusW;
        ctx.beginPath();
        ctx.moveTo(hockPt.x, hockPt.y - 1);
        ctx.lineTo(footPt.x, footPt.y);
        ctx.stroke();

        // Sunlit anterior tarsal highlight & 8 fine transverse acrotarsial scute divisions
        ctx.strokeStyle = 'rgba(255, 248, 232, 0.42)';
        ctx.lineWidth = 0.62;
        ctx.beginPath();
        ctx.moveTo(hockPt.x + 0.7, hockPt.y);
        ctx.lineTo(footPt.x + 0.7, footPt.y - 1);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(58, 38, 22, 0.42)';
        ctx.lineWidth = 0.52;
        for (let sc = 1; sc <= 8; sc++) {
          const u = sc / 9.0;
          const sx = lerp(hockPt.x, footPt.x, u);
          const sy = lerp(hockPt.y, footPt.y, u);
          ctx.beginPath();
          ctx.moveTo(sx - tarsusW * 0.46, sy + 0.6);
          ctx.lineTo(sx + tarsusW * 0.46, sy - 0.6);
          ctx.stroke();
        }

        // (b) Soft, opaque downy crural (tibial) feather cuff overlapping the upper hock joint naturally (no wire edges!)
        const tibCol = plum.bellyShade || plum.breast;
        const tibGrad = ctx.createLinearGradient(thighPt.x, thighPt.y - scale * 0.018, hockPt.x, hockPt.y);
        tibGrad.addColorStop(0, tonePigment(tibCol, -lg.shade * 0.35, 0.96));
        tibGrad.addColorStop(0.68, tonePigment(tibCol, -0.05 - lg.shade * 0.55, 0.94));
        tibGrad.addColorStop(1, tonePigment(tibCol, -0.12 - lg.shade * 0.70, 0.92));
        ctx.fillStyle = tibGrad;
        ctx.beginPath();
        ctx.moveTo(thighPt.x - scale * 0.024, thighPt.y - scale * 0.018);
        ctx.quadraticCurveTo(hockPt.x - scale * 0.010, 0.5 * (thighPt.y + hockPt.y) + 2, hockPt.x - tarsusW * 0.75, hockPt.y - 1.5);
        ctx.quadraticCurveTo(hockPt.x, hockPt.y + 1.2, hockPt.x + tarsusW * 0.80, hockPt.y - 1.0);
        ctx.quadraticCurveTo(thighPt.x + scale * 0.012, 0.5 * (thighPt.y + hockPt.y), thighPt.x + scale * 0.022, thighPt.y - scale * 0.016);
        ctx.closePath();
        ctx.fill();

        // Gossamer sepia feather-edge whisper on the distal tibial cuff only
        ctx.strokeStyle = 'rgba(58, 42, 28, 0.16)';
        ctx.lineWidth = 0.44;
        ctx.beginPath();
        ctx.moveTo(lerp(thighPt.x, hockPt.x, 0.45) - scale * 0.008, lerp(thighPt.y, hockPt.y, 0.45));
        ctx.quadraticCurveTo(hockPt.x - scale * 0.006, lerp(thighPt.y, hockPt.y, 0.78), hockPt.x - tarsusW * 0.70, hockPt.y - 1.5);
        ctx.stroke();

        // (c) Opposable Posterior Hallux (Digit I) & Curved Keratin Claw gripping under the bough (long digging hallux claw in Menura!)
        const halluxMid = this.model.toScreen(lg.footNx - 0.026 * (isLyre ? 1.24 : 1.0), lg.footNy + 0.011);
        const halluxTip = this.model.toScreen(lg.footNx - 0.020 * (isLyre ? 1.26 : 1.0), lg.footNy + 0.029 * (isLyre ? 1.18 : 1.0));
        const toeW = Math.max(1.6, scale * 0.0080 * legRobust);

        ctx.strokeStyle = 'rgba(64, 42, 26, 0.82)';
        ctx.lineWidth = toeW + 1.0;
        ctx.beginPath();
        ctx.moveTo(footPt.x - 1, footPt.y);
        ctx.quadraticCurveTo(halluxMid.x, halluxMid.y, halluxTip.x, halluxTip.y - 2);
        ctx.stroke();
        ctx.strokeStyle = tonePigment(legCol, -0.06 - lg.shade);
        ctx.lineWidth = toeW * 0.90;
        ctx.stroke();

        ctx.fillStyle = '#241812';
        ctx.beginPath();
        ctx.moveTo(halluxTip.x - 1.6, halluxTip.y - 3.2);
        ctx.quadraticCurveTo(halluxTip.x + 1.8 * clawMul, halluxTip.y + 2.4 * clawMul, halluxTip.x + 5.4 * clawMul, halluxTip.y + 3.4 * clawMul);
        ctx.quadraticCurveTo(halluxTip.x + 0.8 * clawMul, halluxTip.y - 1.6, halluxTip.x - 1.6, halluxTip.y - 3.2);
        ctx.fill();

        // (d) Three Forward-Wrapping Anterior Digits (II, III, IV) + Scutes + Curved Claws
        const toeReach = isLyre ? 1.24 : bodyMassG <= 14 ? 0.88 : 1.0;
        const frontToes = [
          { dx: 0.016 * toeReach, dy: 0.025 * toeReach, clawDx: 1.2 * clawMul },
          { dx: 0.038 * toeReach, dy: 0.030 * toeReach, clawDx: 2.5 * clawMul },
          { dx: 0.056 * toeReach, dy: 0.023 * toeReach, clawDx: 3.4 * clawMul },
        ];
        for (const ft of frontToes) {
          const tMid = this.model.toScreen(lg.footNx + ft.dx * 0.65, lg.footNy - 0.003 + ft.dy * 0.36);
          const tEnd = this.model.toScreen(lg.footNx + ft.dx, lg.footNy + ft.dy);

          ctx.strokeStyle = 'rgba(64, 42, 26, 0.82)';
          ctx.lineWidth = toeW + 1.05;
          ctx.beginPath();
          ctx.moveTo(footPt.x, footPt.y);
          ctx.quadraticCurveTo(tMid.x, tMid.y, tEnd.x, tEnd.y);
          ctx.stroke();

          ctx.strokeStyle = tonePigment(legCol, -lg.shade);
          ctx.lineWidth = toeW;
          ctx.beginPath();
          ctx.moveTo(footPt.x, footPt.y);
          ctx.quadraticCurveTo(tMid.x, tMid.y, tEnd.x, tEnd.y);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(58, 38, 22, 0.46)';
          ctx.lineWidth = 0.50;
          for (let sc = 1; sc <= 3; sc++) {
            const su = sc / 3.8;
            const sx = lerp(footPt.x, tEnd.x, su);
            const sy = lerp(footPt.y, tEnd.y, su);
            ctx.beginPath();
            ctx.moveTo(sx - toeW * 0.45, sy + 0.45);
            ctx.lineTo(sx + toeW * 0.45, sy - 0.45);
            ctx.stroke();
          }

          const clawTipX = tEnd.x + ft.clawDx;
          const clawTipY = tEnd.y + Math.max(3.4, scale * 0.015 * clawMul);
          ctx.fillStyle = '#241812';
          ctx.beginPath();
          ctx.moveTo(tEnd.x - toeW * 0.40, tEnd.y - 0.8);
          ctx.quadraticCurveTo(tEnd.x + ft.clawDx * 0.9, tEnd.y + 2.0, clawTipX, clawTipY);
          ctx.quadraticCurveTo(tEnd.x, tEnd.y + 2.1, tEnd.x + toeW * 0.40, tEnd.y - 0.8);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  /**
   * Draws a miniature watercolor perched-bird vignette inside each specimen index slip!
   */
  _drawMiniPortraitMedallion(ctx, sp, cx, cy, r) {
    const p = sp.plumage;
    ctx.save();

    ctx.fillStyle = 'rgba(250, 244, 232, 0.88)';
    ctx.strokeStyle = 'rgba(104, 84, 62, 0.40)';
    ctx.lineWidth = 0.72;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();

    // Soft botanical or lab-amber watercolor wash accent
    if (p.isCyborg) {
      ctx.fillStyle = 'rgba(42, 108, 128, 0.20)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.25, cy + r * 0.28, r * 0.78, r * 0.36, -0.45, 0, Math.PI * 2);
      ctx.fill();
      // Tiny swept-back brass aerial whip
      ctx.strokeStyle = 'rgba(44, 58, 66, 0.82)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.08, cy - r * 0.48);
      ctx.lineTo(cx - r * 0.56, cy - r * 0.82);
      ctx.stroke();
    } else if (p.hasLyreTail) {
      ctx.strokeStyle = 'rgba(148, 76, 40, 0.62)';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.55, cy + r * 0.75);
      ctx.quadraticCurveTo(cx - r * 0.85, cy - r * 0.25, cx - r * 0.42, cy - r * 0.78);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.tailColor ? 'rgba(182, 82, 42, 0.18)' : 'rgba(136, 154, 112, 0.22)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.3, cy + r * 0.3, r * 0.78, r * 0.36, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sleek ~40-deg perched songbird silhouette
    const bg = ctx.createLinearGradient(cx - r * 0.5, cy - r * 0.6, cx + r * 0.36, cy + r * 0.8);
    bg.addColorStop(0, p.crown);
    bg.addColorStop(0.6, p.body);
    bg.addColorStop(1, p.wing);
    ctx.fillStyle = bg;
    ctx.strokeStyle = p.isCyborg ? 'rgba(30, 40, 46, 0.62)' : 'rgba(48, 34, 22, 0.40)';
    ctx.lineWidth = 0.58;
    ctx.beginPath();
    if (p.hasCrest) {
      ctx.moveTo(cx - r * 0.72, cy + r * 0.84);
      ctx.quadraticCurveTo(cx - r * 0.44, cy - r * 0.16, cx - r * 0.24, cy - r * 0.88);
      ctx.quadraticCurveTo(cx + r * 0.04, cy - r * 0.62, cx + r * 0.26, cy - r * 0.24);
      ctx.quadraticCurveTo(cx + r * 0.30, cy - r * 0.02, cx + r * 0.28, cy + r * 0.08);
      ctx.quadraticCurveTo(cx + r * 0.20, cy + r * 0.78, cx - r * 0.72, cy + r * 0.84);
    } else {
      ctx.moveTo(cx - r * 0.72, cy + r * 0.84);
      ctx.quadraticCurveTo(cx - r * 0.40, cy - r * 0.54, cx - r * 0.02, cy - r * 0.54);
      ctx.quadraticCurveTo(cx + r * 0.30, cy - r * 0.48, cx + r * 0.28, cy + r * 0.06);
      ctx.quadraticCurveTo(cx + r * 0.20, cy + r * 0.78, cx - r * 0.72, cy + r * 0.84);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = p.breast;
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.10, cy + r * 0.44, r * 0.26, r * 0.38, -0.24, 0, Math.PI * 2);
    ctx.fill();

    if (p.isCyborg) {
      // Tiny pink living syrinx window + brass collar seam inside cyborg medallion!
      ctx.fillStyle = 'rgba(218, 128, 118, 0.82)';
      ctx.strokeStyle = '#C89B4E';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.04, cy + r * 0.38, r * 0.14, r * 0.22, -0.20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (p.hasMask) {
      ctx.fillStyle = '#1B1312';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.25, cy - r * 0.20);
      ctx.quadraticCurveTo(cx + r * 0.08, cy - r * 0.14, cx + r * 0.14, cy + r * 0.18);
      ctx.lineTo(cx + r * 0.26, cy + r * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    if (p.cheekPatch) {
      ctx.fillStyle = p.cheekPatch;
      ctx.beginPath();
      ctx.arc(cx - r * 0.02, cy + r * 0.04, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    const ms = r / 11.8;
    if (p.hasSpots) {
      ctx.fillStyle = '#4A2816';
      ctx.beginPath();
      ctx.arc(cx + r * 0.05, cy + r * 0.40, 1.0 * ms, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.15, cy + r * 0.56, 1.0 * ms, 0, Math.PI * 2);
      ctx.fill();
    }

    const slender = p.billStyle !== 'conical';
    ctx.fillStyle = p.beakUpper;
    ctx.strokeStyle = '#3B261A';
    ctx.lineWidth = 0.56 * ms;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.24, cy - r * (slender ? 0.12 : 0.18));
    ctx.lineTo(cx + r * (slender ? 0.80 : 0.68), cy - r * 0.03);
    ctx.lineTo(cx + r * 0.24, cy + r * (slender ? 0.04 : 0.11));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (p.isCyborg) {
      ctx.fillStyle = '#C89B4E';
      ctx.beginPath();
      ctx.arc(cx + r * 0.05, cy - r * 0.16, 2.35 * ms, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5CF58E';
      ctx.beginPath();
      ctx.arc(cx + r * 0.05, cy - r * 0.16, 1.55 * ms, 0, Math.PI * 2);
      ctx.fill();
    } else {
      if (p.hasLyreTail) {
        ctx.fillStyle = 'rgba(92, 130, 168, 0.78)';
        ctx.beginPath();
        ctx.arc(cx + r * 0.05, cy - r * 0.16, 2.3 * ms, 0, Math.PI * 2);
        ctx.fill();
      } else if ((p.eyeRingAlpha ?? 0.65) > 0.5) {
        ctx.fillStyle = hexToRgba(p.eyeRing || '#FAF3E4', p.eyeRingAlpha ?? 0.65);
        ctx.beginPath();
        ctx.arc(cx + r * 0.05, cy - r * 0.16, 1.9 * ms, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#140D0A';
      ctx.beginPath();
      ctx.arc(cx + r * 0.05, cy - r * 0.16, 1.35 * ms, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 253, 248, 0.90)';
      ctx.beginPath();
      ctx.arc(cx + r * 0.02, cy - r * 0.19, 0.48 * ms, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(104, 84, 62, 0.42)';
    ctx.lineWidth = 0.72 * ms;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawSongSelectorPanel(ctx, width, height) {
    if (this.model.layout.isPortrait) {
      this._drawPortraitTopSelector(ctx, width);
      return;
    }

    const compact = width < 820;
    const panelX = compact ? 16 : 24;
    const panelY = 20;
    const cardW = compact ? 176 : 228;

    ctx.save();

    const btnH = 34;
    this.autoSingButtonHit = { x: panelX, y: panelY, w: cardW, h: btnH };
    const isBtnHov = this.model.hoveredPart === 'plexus';
    const playing = this.model.driverPlaying;
    const isSynth = Boolean(this.model.currentSpecies.isSynthBird);

    ctx.fillStyle = playing
      ? 'rgba(248, 238, 222, 0.88)'
      : isBtnHov
        ? 'rgba(244, 235, 214, 0.84)'
        : 'rgba(251, 246, 235, 0.68)';
    ctx.fillRect(panelX, panelY, cardW, btnH);

    if (playing) {
      // Soft Venetian-vermilion watercolor wash accent inside active cartouche
      const btnWash = ctx.createLinearGradient(panelX, panelY, panelX + cardW, panelY);
      btnWash.addColorStop(0, 'rgba(176, 62, 36, 0.16)');
      btnWash.addColorStop(0.5, 'rgba(176, 62, 36, 0.06)');
      btnWash.addColorStop(1, 'rgba(176, 62, 36, 0.12)');
      ctx.fillStyle = btnWash;
      ctx.fillRect(panelX + 1, panelY + 1, cardW - 2, btnH - 2);
    }

    ctx.strokeStyle = playing ? 'rgba(158, 56, 32, 0.72)' : 'rgba(102, 82, 60, 0.44)';
    ctx.lineWidth = playing ? 1.05 : 0.80;
    ctx.strokeRect(panelX, panelY, cardW, btnH);
    ctx.strokeStyle = playing ? 'rgba(158, 56, 32, 0.30)' : 'rgba(102, 82, 60, 0.18)';
    ctx.lineWidth = 0.52;
    ctx.strokeRect(panelX + 2.5, panelY + 2.5, cardW - 5, btnH - 5);

    ctx.fillStyle = playing ? '#8C2C16' : PALETTE.inkSepia;
    ctx.font = `600 12.2px ${SERIF_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      isSynth
        ? playing
          ? '❚❚  Pause Synth Sequence'
          : '▶  Auto-Play Synth Sequence'
        : playing
          ? '❚❚  Pause Bird Song'
          : '▶  Auto-Sing Bird Song',
      panelX + cardW * 0.5,
      panelY + 21.5
    );

    this.speciesHitNodes = [];
    const startY = panelY + btnH + 7;
    const cardH = 38;
    const gapY = 5;

    for (let idx = 0; idx < SPECIES_PRESETS.length; idx++) {
      const sp = SPECIES_PRESETS[idx];
      const cy = startY + idx * (cardH + gapY);
      const isSelected = this.model.activeSpeciesIndex === idx;
      const isActiveSong = isSelected && (playing || Boolean(sp.isSynthBird));
      const isHov = this.model.hoveredPart === `species_${idx}`;

      ctx.fillStyle = isActiveSong
        ? 'rgba(252, 246, 233, 0.88)'
        : isSelected
          ? 'rgba(251, 246, 235, 0.82)'
          : isHov
            ? 'rgba(246, 239, 224, 0.78)'
            : 'rgba(251, 246, 235, 0.56)';
      ctx.fillRect(panelX, cy, cardW, cardH);

      ctx.strokeStyle = isActiveSong
        ? sp.badgeColor
        : isSelected
          ? 'rgba(98, 78, 56, 0.56)'
          : 'rgba(108, 88, 66, 0.26)';
      ctx.lineWidth = isActiveSong ? 1.25 : 0.75;
      ctx.strokeRect(panelX, cy, cardW, cardH);

      if (isSelected) {
        ctx.strokeStyle = isActiveSong ? sp.badgeColor : 'rgba(98, 78, 56, 0.22)';
        ctx.lineWidth = 0.52;
        ctx.strokeRect(panelX + 2.5, cy + 2.5, cardW - 5, cardH - 5);
      }

      this._drawMiniPortraitMedallion(ctx, sp, panelX + 19.5, cy + cardH * 0.5, 11.8);

      ctx.textAlign = 'left';
      ctx.font = `600 12.2px ${SERIF_STACK}`;
      ctx.fillStyle = PALETTE.inkSepia;
      ctx.fillText(sp.commonName, panelX + 38, cy + 16.5);

      if (!compact) {
        ctx.font = `italic 10.6px ${SERIF_STACK}`;
        ctx.fillStyle = isActiveSong ? '#9E3820' : PALETTE.inkSepiaMid;
        ctx.fillText(sp.subtitle, panelX + 38, cy + 30.5);
      }

      this.speciesHitNodes.push({
        index: idx,
        partId: `species_${idx}`,
        x: panelX,
        y: cy,
        w: cardW,
        h: cardH,
      });
    }

    ctx.restore();
    void height;
  }

  _drawPortraitTopSelector(ctx, width) {
    const {
      uiScale: u = 1,
      selectorY = 56,
      selectorH = 34,
    } = this.model.layout;

    const playing = this.model.driverPlaying;
    const activeIdx = this.model.activeSpeciesIndex;
    const sp = SPECIES_PRESETS[activeIdx];
    const isActiveSong = playing || Boolean(sp.isSynthBird);

    // No separate play/pause button on mobile: tapping the species lockup toggles auto-play
    this.autoSingButtonHit = null;

    const midX = width * 0.5;
    const midY = selectorY + selectorH * 0.5;
    const arrowOffset = Math.round(124 * u);
    const leftCx = midX - arrowOffset;
    const rightCx = midX + arrowOffset;

    ctx.save();

    const nameFont = `600 ${(12.2 * u).toFixed(1)}px ${SERIF_STACK}`;
    const subFont = `italic ${(10.0 * u).toFixed(1)}px ${SERIF_STACK}`;
    ctx.font = nameFont;
    const nameW = ctx.measureText(sp.commonName).width;
    ctx.font = subFont;
    const subW = ctx.measureText(sp.subtitle).width;

    const medR = 11.2 * u;
    const gap = 8.5 * u;
    const maxTextW = Math.max(70 * u, (arrowOffset - 18 * u) * 2 - medR * 2 - gap);
    const textBlockW = Math.min(maxTextW, Math.max(nameW, subW));
    const lockupW = medR * 2 + gap + textBlockW;
    const lockupLeft = midX - lockupW * 0.5;
    const medCx = lockupLeft + medR;
    const textX = lockupLeft + medR * 2 + gap;

    // 1. Mini bird portrait medallion next to the name + subtext (borderless header)
    this._drawMiniPortraitMedallion(ctx, sp, medCx, midY, medR);

    // 2. Species name + italic subtext (with soft rag-paper halo, no box border, no 1/7 counter)
    ctx.save();
    ctx.shadowColor = 'rgba(247, 241, 229, 0.94)';
    ctx.shadowBlur = 4 * u;
    const isNameHov = this.model.hoveredPart === `species_${activeIdx}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.font = nameFont;
    ctx.fillStyle = playing
      ? '#922E18'
      : isNameHov
        ? '#523A24'
        : PALETTE.inkSepia;
    ctx.fillText(sp.commonName, textX, midY - 5.6 * u, maxTextW);

    ctx.font = subFont;
    ctx.fillStyle = isActiveSong ? '#9E3820' : PALETTE.inkSepiaMid;
    ctx.fillText(sp.subtitle, textX, midY + 7.0 * u, maxTextW);
    ctx.restore();

    // 3. Two clean vector chevron arrows flanking on the sides
    const chevHalfH = 4.3 * u;
    const chevHalfW = 2.6 * u;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.38 * u;

    ctx.strokeStyle =
      this.model.hoveredPart === 'species_prev' ? '#8C2C16' : 'rgba(62, 48, 34, 0.78)';
    ctx.beginPath();
    ctx.moveTo(leftCx + chevHalfW * 0.6, midY - chevHalfH);
    ctx.lineTo(leftCx - chevHalfW * 0.8, midY);
    ctx.lineTo(leftCx + chevHalfW * 0.6, midY + chevHalfH);
    ctx.stroke();

    ctx.strokeStyle =
      this.model.hoveredPart === 'species_next' ? '#8C2C16' : 'rgba(62, 48, 34, 0.78)';
    ctx.beginPath();
    ctx.moveTo(rightCx - chevHalfW * 0.6, midY - chevHalfH);
    ctx.lineTo(rightCx + chevHalfW * 0.8, midY);
    ctx.lineTo(rightCx - chevHalfW * 0.6, midY + chevHalfH);
    ctx.stroke();

    const hitPadY = Math.round(6 * u);
    const arrowHitW = Math.round(40 * u);
    const centerLeft = leftCx + arrowHitW * 0.5;
    const centerRight = rightCx - arrowHitW * 0.5;

    this.speciesHitNodes = [
      {
        partId: 'species_prev',
        x: leftCx - arrowHitW * 0.5,
        y: selectorY - hitPadY,
        w: arrowHitW,
        h: selectorH + hitPadY * 2,
      },
      {
        partId: 'species_next',
        x: rightCx - arrowHitW * 0.5,
        y: selectorY - hitPadY,
        w: arrowHitW,
        h: selectorH + hitPadY * 2,
      },
      {
        index: activeIdx,
        partId: `species_${activeIdx}`,
        x: centerLeft,
        y: selectorY - hitPadY,
        w: Math.max(80 * u, centerRight - centerLeft),
        h: selectorH + hitPadY * 2,
      },
    ];

    ctx.restore();
  }

  _drawTactileOverlays(ctx) {
    ctx.save();
    for (const rip of this.model.warble.ripples) {
      const pt = this.model.toScreen(rip.nx, rip.ny);
      const prog = rip.age / 0.72;
      const r = 6 + prog * 36 * rip.strength;
      const alpha = (1.0 - prog) * 0.42;
      ctx.strokeStyle = `rgba(184, 66, 40, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const grab of this.model.activeGrabs.values()) {
      const anchorNorm = this.model.getPartAnchorNorm(grab.partId);
      const aPt = this.model.toScreen(anchorNorm.nx, anchorNorm.ny);

      ctx.strokeStyle = 'rgba(168, 58, 34, 0.58)';
      ctx.lineWidth = 1.15;
      ctx.setLineDash([3, 2.5]);
      ctx.beginPath();
      ctx.moveTo(aPt.x, aPt.y);
      ctx.lineTo(grab.screenX, grab.screenY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = PALETTE.accentVermilion;
      ctx.beginPath();
      ctx.arc(aPt.x, aPt.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(168, 58, 34, 0.72)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(grab.screenX, grab.screenY, 8.0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
