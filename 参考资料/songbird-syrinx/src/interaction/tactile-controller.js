/**
 * @fileoverview Multi-Pointer Tactile Songbird Controller
 *
 * Handles direct grabbing, stretching, squeezing, and mid-song poking of the songbird's
 * vocal anatomy, plus tapping the Bird Song cards to hear each species sing.
 */

import { clamp } from '../physics/anatomy-model.js';

export class TactileController {
  constructor(canvas, model, audioEngine, anatomicalRenderer, labelsRenderer) {
    this.canvas = canvas;
    this.model = model;
    this.audio = audioEngine;
    this.anatRenderer = anatomicalRenderer;
    this.labelsRenderer = labelsRenderer;
    this._cardSwipe = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.model.clearAllLoops();
      } else if (e.key === ' ') {
        e.preventDefault();
        this.audio.unlock();
        this.model.toggleDriver();
      }
    });
  }

  hitTest(x, y) {
    // 1. Auto-Sing Toggle Pill Button
    const btn = this.anatRenderer.autoSingButtonHit;
    if (btn && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      return 'plexus';
    }

    // 2. Four Bird Song Selector Cards
    for (const spNode of this.anatRenderer.speciesHitNodes) {
      if (
        x >= spNode.x &&
        x <= spNode.x + spNode.w &&
        y >= spNode.y &&
        y <= spNode.y + spNode.h
      ) {
        return spNode.partId;
      }
    }

    const { nx, ny } = this.model.toNorm(x, y);
    const L = this.model.landmarks;

    // 3. Internal Vocal Anatomy Hit Zones (nearest-anchor resolution across comparative syringeal micro-structures!)
    const labLx = 0.5 * (L.mlLx + L.llLx);
    const labRx = 0.5 * (L.mlRx + L.llRx);
    const microParts = [
      { id: 'pessulus', ax: L.pessX - 0.005, ay: L.pessY, r: 0.032 },
      { id: 'labiaL', ax: labLx, ay: L.mlLy, r: 0.035 },
      { id: 'labiaR', ax: labRx, ay: L.mlRy, r: 0.035 },
      { id: 'mtmL', ax: L.mtmLx, ay: L.mtmLy, r: 0.032 },
      { id: 'mtmR', ax: L.mtmRx, ay: L.mtmRy, r: 0.032 },
      { id: 'muscleVSL', ax: L.vsLx, ay: L.vsLy, r: 0.038 },
      { id: 'muscleVSR', ax: L.vsRx, ay: L.vsRy, r: 0.038 },
      { id: 'bronchusL', ax: L.bronchusLx, ay: L.bronchusLy, r: 0.036 },
      { id: 'bronchusR', ax: L.bronchusRx, ay: L.bronchusRy, r: 0.036 },
    ];
    const touchSlop = this.model.layout.isPortrait ? 1.32 : 1.0;
    let bestMicroId = null;
    let bestMicroDist = Infinity;
    for (const mp of microParts) {
      const dist = Math.hypot(nx - mp.ax, ny - mp.ay);
      if (dist < mp.r * touchSlop && dist < bestMicroDist) {
        bestMicroDist = dist;
        bestMicroId = mp.id;
      }
    }
    if (bestMicroId) return bestMicroId;

    // Side-Profile Singing Beak (right-facing upper & lower mandibles above throat pouch)
    if (
      nx >= L.headCx + 0.095 &&
      nx <= L.headCx + 0.42 &&
      ny >= L.headCy - 0.145 &&
      ny <= L.headCy + 0.042
    ) {
      return 'beak';
    }

    // Supra-glottal pharynx & Dorsal Cervical-Esophageal Chamber (OEC, Riede et al. 2004, 2006 PNAS)
    if (
      ny >= L.glottisY - 0.046 &&
      ny <= L.glottisY + 0.011 &&
      nx >= L.oecBackX - 0.028 &&
      nx <= L.oecFrontX + 0.048
    ) {
      return 'oec';
    }

    // Inclined & Bendable Cervical Windpipe (Trachea) + Dorsal Esophageal Pouch behind upper trachea
    if (ny > L.glottisY + 0.011 && ny < L.tympanumY - 0.006) {
      const uTr = clamp((ny - L.glottisY) / Math.max(0.05, L.tympanumY - L.glottisY), 0, 1);
      const axisX =
        L.glottisX +
        (L.syrinxCx - L.glottisX) * uTr +
        4.0 * uTr * (1.0 - uTr) * (L.trachCurveX || 0);
      if (
        ny <= L.oecCenterY + (L.oecDropY || 0) + 0.042 &&
        nx < axisX - L.trachHalfW - 0.004 &&
        nx >= L.oecBackX - 0.032
      ) {
        return 'oec';
      }
      if (Math.abs(nx - axisX) <= L.trachHalfW + 0.044) {
        return 'trachea';
      }
    }

    // Compact Bilobed Belly Air Sacs
    if (
      ny >= 0.172 &&
      ny <= L.caudalBottomY + 0.045 &&
      Math.abs(nx - L.sacCx) <= L.caudalOuterX + 0.050
    ) {
      return 'airSacCaudal';
    }

    // Chest Air Cushion (ICAS)
    if (
      ny >= L.tympanumY - 0.06 &&
      ny < 0.195 &&
      Math.abs(nx - L.syrinxCx) <= L.icasHalfW + 0.045
    ) {
      return nx < L.syrinxCx ? 'icasL' : 'icasR';
    }

    // 4. Floating Plain-English Labels (grabbing a label manipulates its connected part!)
    for (const box of this.labelsRenderer.hitBoxes) {
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        return box.partId;
      }
    }

    return null;
  }

  _onPointerDown(e) {
    if (e.button === 2) return;
    this.audio.unlock();

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = this.hitTest(x, y);
    if (!hit) return;

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // Synthetic pointer
    }

    if (hit === 'plexus') {
      this.model.toggleDriver();
      return;
    }

    if (hit === 'species_prev') {
      this.model.cycleSpecies(-1);
      return;
    }

    if (hit === 'species_next') {
      this.model.cycleSpecies(1);
      return;
    }

    if (hit.startsWith('species_')) {
      const idx = parseInt(hit.split('_')[1], 10);
      if (this.model.layout.isPortrait) {
        this._cardSwipe = { pointerId: e.pointerId, startX: x, swiped: false };
      } else if (this.model.activeSpeciesIndex === idx) {
        this.model.toggleDriver();
      } else {
        this.model.selectSpecies(idx);
      }
      return;
    }

    let loopBranch = null;
    if (e.shiftKey) {
      if (hit.endsWith('L')) loopBranch = 'L';
      else if (hit.endsWith('R')) loopBranch = 'R';
      if (loopBranch) this.model.startBranchLoopRecording(loopBranch);
    }

    this._beginTissueGrab(e.pointerId, hit, x, y, loopBranch);
  }

  _beginTissueGrab(pointerId, partId, x, y, recordingBranch = null) {
    const norm = this.model.toNorm(x, y);
    const d = this.model.dofs;

    const initDofs = {};
    for (const [k, obj] of Object.entries(d)) {
      initDofs[k] = obj.value;
    }

    this.model.triggerTissuePoke(partId, norm.nx, norm.ny, 0.62);
    if (partId === 'labiaL' || partId === 'mtmL' || partId === 'bronchusL' || partId === 'muscleVSL') {
      this.audio.pokeLabia('L', 0.38);
    } else if (partId === 'labiaR' || partId === 'mtmR' || partId === 'bronchusR' || partId === 'muscleVSR') {
      this.audio.pokeLabia('R', 0.38);
    } else if (partId === 'pessulus') {
      this.audio.pokeLabia('both', 0.34);
    }

    const grab = {
      pointerId,
      partId,
      recordingBranch,
      startNx: norm.nx,
      startNy: norm.ny,
      lastNx: norm.nx,
      lastNy: norm.ny,
      lastTime: performance.now(),
      screenX: x,
      screenY: y,
      pointerSpeed: 0.0,
      intensity: 0.6,
      initDofs,
      dofTargets: {},
    };

    this._updateGrabTargets(grab, norm.nx, norm.ny);
    this.model.activeGrabs.set(pointerId, grab);
    this.canvas.style.cursor = 'grabbing';
  }

  _onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this._cardSwipe && this._cardSwipe.pointerId === e.pointerId) {
      const u = this.model.layout.uiScale || 1;
      const dx = x - this._cardSwipe.startX;
      if (!this._cardSwipe.swiped && Math.abs(dx) > 26 * u) {
        this._cardSwipe.swiped = true;
        this.model.cycleSpecies(dx < 0 ? 1 : -1);
      }
      return;
    }

    const grab = this.model.activeGrabs.get(e.pointerId);
    if (grab) {
      const norm = this.model.toNorm(x, y);
      const now = performance.now();
      const dt = Math.max(0.004, (now - grab.lastTime) * 0.001);
      const dist = Math.hypot(norm.nx - grab.lastNx, norm.ny - grab.lastNy);
      grab.pointerSpeed = dist / dt;
      grab.lastNx = norm.nx;
      grab.lastNy = norm.ny;
      grab.lastTime = now;
      grab.screenX = x;
      grab.screenY = y;

      this._updateGrabTargets(grab, norm.nx, norm.ny);
      return;
    }

    const hit = this.hitTest(x, y);
    this.model.hoveredPart = hit;
    if (!hit) {
      this.canvas.style.cursor = 'default';
    } else if (hit === 'plexus' || hit.startsWith('species_')) {
      this.canvas.style.cursor = 'pointer';
    } else {
      this.canvas.style.cursor = 'grab';
    }
  }

  _onPointerUp(e) {
    if (this._cardSwipe && this._cardSwipe.pointerId === e.pointerId) {
      const wasSwiped = this._cardSwipe.swiped;
      this._cardSwipe = null;
      if (!wasSwiped) {
        this.model.toggleDriver();
      }
      return;
    }

    const grab = this.model.activeGrabs.get(e.pointerId);
    if (!grab) return;

    if (grab.recordingBranch) {
      this.model.finishBranchLoopRecording(grab.recordingBranch);
    }

    this.model.activeGrabs.delete(e.pointerId);
    if (this.model.activeGrabs.size === 0) {
      this.canvas.style.cursor = this.model.hoveredPart ? 'grab' : 'default';
    }
  }

  _updateGrabTargets(grab, nx, ny) {
    const dnx = nx - grab.startNx;
    const dny = ny - grab.startNy;
    const init = grab.initDofs;
    const tgt = {};

    grab.intensity = clamp(0.50 + Math.hypot(dnx, dny) * 2.6, 0.45, 1.0);

    const L = this.model.landmarks;
    const org = this.model.currentSpecies.organ;
    switch (grab.partId) {
      case 'airSacCaudal': {
        const inwardSqueeze = Math.abs(grab.startNx - L.sacCx) - Math.abs(nx - L.sacCx);
        const compress = -dny * 16.5 + inwardSqueeze * 11.5;
        const baseStart = this.model.driverPlaying ? init.pSub : Math.max(init.pSub, 0.90);
        const pSub = clamp(baseStart + compress, 0.02, 5.20);
        tgt.pSub = pSub;
        tgt.pIcas = clamp(pSub * 0.96, 0.02, 5.15);
        break;
      }

      case 'icasL':
      case 'icasR': {
        const inward = Math.abs(grab.startNx - L.syrinxCx) - Math.abs(nx - L.syrinxCx) - dny * 1.1;
        tgt.pIcas = clamp(Math.max(init.pIcas, 0.80) + inward * 18.0, 0.02, 5.20);
        break;
      }

      case 'bronchusL': {
        const baseGapL = init.gapL < 0.015 ? Math.max(0.062, org.restGapL) : init.gapL;
        tgt.gapL = clamp(baseGapL - dnx * 1.85, -0.075, 0.54);
        tgt.tensionL = clamp(init.tensionL - dny * 3.1, -1.15, 1.75);
        break;
      }

      case 'bronchusR': {
        const baseGapR = init.gapR < 0.015 ? 0.082 : init.gapR;
        tgt.gapR = clamp(baseGapR + dnx * 1.85, -0.075, 0.54);
        tgt.tensionR = clamp(init.tensionR - dny * 3.1, -1.15, 1.75);
        break;
      }

      case 'labiaL': {
        const baseGapL = clamp(init.gapL < 0.015 ? Math.max(0.062, org.restGapL) : init.gapL, 0.058, 0.105);
        tgt.tensionL = clamp(init.tensionL - dny * 4.5, -1.15, 1.75);
        tgt.gapL = clamp(baseGapL - dnx * 1.15, -0.065, 0.48);
        tgt.mtmStretchL = clamp(init.mtmStretchL - dnx * 2.8, 0.00, 1.48);
        break;
      }

      case 'labiaR': {
        const baseGapR = clamp(init.gapR < 0.015 ? 0.082 : init.gapR, 0.064, 0.105);
        tgt.tensionR = clamp(init.tensionR - dny * 4.5, -1.15, 1.75);
        tgt.gapR = clamp(baseGapR + dnx * 1.15, -0.065, 0.48);
        tgt.mtmStretchR = clamp(init.mtmStretchR + dnx * 2.8, 0.00, 1.48);
        break;
      }

      case 'mtmL': {
        const stretchDelta = dny * 2.8 - dnx * 3.4;
        tgt.mtmStretchL = clamp(init.mtmStretchL + stretchDelta, 0.00, 1.48);
        tgt.tensionL = clamp(init.tensionL - dny * 2.9, -1.15, 1.75);
        break;
      }

      case 'mtmR': {
        const stretchDelta = dny * 2.8 + dnx * 3.4;
        tgt.mtmStretchR = clamp(init.mtmStretchR + stretchDelta, 0.00, 1.48);
        tgt.tensionR = clamp(init.tensionR - dny * 2.9, -1.15, 1.75);
        break;
      }

      case 'muscleVSL': {
        tgt.tensionL = clamp(init.tensionL - dny * 4.8 - dnx * 1.45, -1.15, 1.75);
        break;
      }

      case 'muscleVSR': {
        tgt.tensionR = clamp(init.tensionR - dny * 4.8 + dnx * 1.45, -1.15, 1.75);
        break;
      }

      case 'pessulus': {
        tgt.pessulusX = clamp(init.pessulusX + dnx * 5.8, -1.50, 1.50);
        tgt.pessulusY = clamp(init.pessulusY + dny * 5.5, -1.50, 1.50);
        break;
      }

      case 'trachea': {
        // Pulling DOWN stretches the windpipe downward into the chest (longer tube, deeper bass);
        // pushing/pulling UP compresses the windpipe upward toward the throat (shorter tube, bright piccolo);
        // dragging sideways bends the flexible tracheal tube & widens/pinches its bore!
        tgt.tracheaLenMm = clamp(init.tracheaLenMm + dny * 295.0, 11.0, 142.0);
        tgt.trachBendX = clamp((init.trachBendX || 0) + dnx * 4.8, -1.35, 1.35);
        const trMidX = 0.5 * (L.glottisX + L.syrinxCx);
        const radialDelta = Math.abs(nx - trMidX) - Math.abs(grab.startNx - trMidX);
        tgt.tracheaWidth = clamp(init.tracheaWidth + radialDelta * 8.5, 0.28, 2.20);
        break;
      }

      case 'oec': {
        const dirSign = grab.startNx < L.glottisX - 0.010 ? -1.0 : 1.0;
        const throatExpand = dirSign * dnx * 3.0 + dny * 1.6;
        tgt.oecVolMl = clamp(init.oecVolMl + throatExpand * 3.1, 0.015, 2.85);
        break;
      }

      case 'beak': {
        const gapeDelta = dnx * 48.0 - dny * 56.0;
        tgt.beakGapeMm = clamp(init.beakGapeMm + gapeDelta, 0.18, 27.5);
        break;
      }

      default:
        break;
    }

    grab.dofTargets = tgt;
  }
}
