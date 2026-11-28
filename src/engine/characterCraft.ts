import * as THREE from 'three';
import { attachSubsurfaceShader, HANDCRAFTED_PAL } from './proceduralTextures';
import { createSoftPillowGeometry, createTurnedLatheGeometry } from './sculptHelpers';

/**
 * Shared Character Craft & Continuous Physics Motion System
 * Guided by `agents/skills/cinematic-slide-craft/SKILL.md`:
 * - Second-order damped springs (`Spring1D`) & framerate-independent `damp()`
 * - Virtual mass layering (head / torso / limbs / secondary cloth ribbons & sash tails)
 * - Tactile PBR woven cotton/linen micro-normal & roughness maps with physical cloth sheen
 * - Contoured facial silhouette, pleated drapery robes, and 2-segment elbow/knee articulation
 */

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.max(0, dt)));
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * Math.max(0, dt)));
}

/**
 * Zero-GC second-order critically/under-damped spring for organic secondary motion
 * (sash tails, hat ribbons, lantern/fan sway, breathing weight transfer).
 */
export class Spring1D {
  value: number;
  velocity = 0;
  readonly stiffness: number;
  readonly damping: number;

  constructor(initial = 0, stiffness = 140, damping = 16) {
    this.value = initial;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  step(target: number, dt: number): number {
    const clampedDt = Math.min(dt, 0.05);
    const force = (target - this.value) * this.stiffness;
    const accel = force - this.velocity * this.damping;
    this.velocity += accel * clampedDt;
    this.value += this.velocity * clampedDt;
    return this.value;
  }

  snap(target: number): number {
    this.value = target;
    this.velocity = 0;
    return target;
  }
}

/** Virtual mass layering presets matching cinematic-slide-craft motion hierarchy */
export const VIRTUAL_MASS = {
  torsoLambda: 11,
  limbLambda: 16,
  headLambda: 9,
  clothStiffness: 115,
  clothDamping: 12,
} as const;

let cachedFabricMaps: { normal: THREE.CanvasTexture; roughness: THREE.CanvasTexture } | null = null;
let cachedStrawMaps: { normal: THREE.CanvasTexture; roughness: THREE.CanvasTexture } | null = null;

function makeHeightToNormal(hCanvas: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = hCanvas.width;
  const h = hCanvas.height;
  const src = hCanvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(w, h);
  const dst = img.data;
  const at = (x: number, y: number) => src[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Procedural tactile woven Hakka cotton/linen micro-normal & roughness maps (cross-hatch warp/weft).
 */
export function getWovenFabricMaps(): {
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  if (cachedFabricMaps) return cachedFabricMaps;
  const S = 128;
  const hCanvas = document.createElement('canvas');
  hCanvas.width = S;
  hCanvas.height = S;
  const hctx = hCanvas.getContext('2d')!;
  const rCanvas = document.createElement('canvas');
  rCanvas.width = S;
  rCanvas.height = S;
  const rctx = rCanvas.getContext('2d')!;

  const hImg = hctx.createImageData(S, S);
  const rImg = rctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const idx = (y * S + x) * 4;
      const warp = Math.sin(x * Math.PI * 0.5);
      const weft = Math.sin(y * Math.PI * 0.5);
      const checker = ((x >> 1) + (y >> 1)) & 1 ? 1 : -1;
      const slub = Math.sin(x * 0.19 + y * 0.05) * 0.18 + Math.cos(y * 0.23 - x * 0.04) * 0.14;
      const weave = 0.5 + 0.22 * (checker > 0 ? warp : weft) + slub * 0.28;
      const hv = Math.max(20, Math.min(240, Math.round(weave * 255)));
      const rv = Math.max(150, Math.min(246, Math.round((0.86 - weave * 0.16) * 255)));
      hImg.data[idx] = hImg.data[idx + 1] = hImg.data[idx + 2] = hv;
      hImg.data[idx + 3] = 255;
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }
  hctx.putImageData(hImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);

  const nTex = new THREE.CanvasTexture(makeHeightToNormal(hCanvas, 2.2));
  nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping;
  nTex.repeat.set(5, 5);
  const rTex = new THREE.CanvasTexture(rCanvas);
  rTex.wrapS = rTex.wrapT = THREE.RepeatWrapping;
  rTex.repeat.set(5, 5);
  cachedFabricMaps = { normal: nTex, roughness: rTex };
  return cachedFabricMaps;
}

/**
 * Procedural concentric woven bamboo-straw normal & roughness maps for Hakka Douli & Liangmao hats.
 */
export function getWovenStrawMaps(): {
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  if (cachedStrawMaps) return cachedStrawMaps;
  const S = 128;
  const hCanvas = document.createElement('canvas');
  hCanvas.width = S;
  hCanvas.height = S;
  const hctx = hCanvas.getContext('2d')!;
  const rCanvas = document.createElement('canvas');
  rCanvas.width = S;
  rCanvas.height = S;
  const rctx = rCanvas.getContext('2d')!;
  const hImg = hctx.createImageData(S, S);
  const rImg = rctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const idx = (y * S + x) * 4;
      const rib = Math.sin(y * 0.82) * 0.35 + Math.sin(x * 0.45 + Math.floor(y / 6) * 1.4) * 0.25;
      const hv = Math.max(20, Math.min(240, Math.round((0.5 + rib) * 255)));
      const rv = Math.max(130, Math.min(238, Math.round((0.78 - rib * 0.18) * 255)));
      hImg.data[idx] = hImg.data[idx + 1] = hImg.data[idx + 2] = hv;
      hImg.data[idx + 3] = 255;
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }
  hctx.putImageData(hImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  const nTex = new THREE.CanvasTexture(makeHeightToNormal(hCanvas, 2.8));
  nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping;
  nTex.repeat.set(3, 3);
  const rTex = new THREE.CanvasTexture(rCanvas);
  rTex.wrapS = rTex.wrapT = THREE.RepeatWrapping;
  rTex.repeat.set(3, 3);
  cachedStrawMaps = { normal: nTex, roughness: rTex };
  return cachedStrawMaps;
}

export function createCraftFabricMat(
  hex: number,
  sheenHex: number,
  trackMat: <T extends THREE.Material>(m: T) => T,
  roughness = 0.84,
  sheen = 0.58
): THREE.MeshPhysicalMaterial {
  const fm = getWovenFabricMaps();
  return trackMat(
    new THREE.MeshPhysicalMaterial({
      color: hex,
      normalMap: fm.normal,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughnessMap: fm.roughness,
      roughness,
      metalness: 0.0,
      sheen,
      sheenRoughness: 0.66,
      sheenColor: new THREE.Color(sheenHex),
    })
  );
}

export function createCraftSkinMat(
  key: string,
  trackMat: <T extends THREE.Material>(m: T) => T,
  hex: number = HANDCRAFTED_PAL.skin
): THREE.MeshStandardMaterial {
  return attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.62,
        metalness: 0.0,
      })
    ),
    {
      key,
      tintHex: 0xf7a482,
      backStrength: 0.36,
      wrapStrength: 0.26,
      power: 2.6,
    }
  );
}

export function createCraftStrawMat(
  hex: number,
  trackMat: <T extends THREE.Material>(m: T) => T,
  roughness = 0.78
): THREE.MeshStandardMaterial {
  const sm = getWovenStrawMaps();
  return trackMat(
    new THREE.MeshStandardMaterial({
      color: hex,
      normalMap: sm.normal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: sm.roughness,
      roughness,
      metalness: 0.02,
    })
  );
}

/**
 * Generates a draped Hakka tunic/robe with natural vertical cloth pleats & waist-to-hem fall
 * so character silhouettes read as tailored layered fabric instead of smooth cones/cylinders.
 */
export function createPleatedRobeGeometry(
  profile: Array<[number, number]>,
  radialSegments = 22,
  pleatCount = 9,
  pleatDepth = 0.012
): THREE.LatheGeometry {
  const geo = createTurnedLatheGeometry(profile, radialSegments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(0.01, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.015) continue;
    const ang = Math.atan2(z, x);
    // Pleats strengthen smoothly toward lower hem and soften near shoulders/collar
    const heightNorm = (y - minY) / spanY;
    const drapeWeight = Math.max(0, 1 - heightNorm * 1.12);
    const fold =
      (Math.sin(ang * pleatCount + heightNorm * 0.45) * 0.65 +
        Math.cos(ang * (pleatCount * 2 - 1) - heightNorm * 0.6) * 0.35) *
      pleatDepth *
      drapeWeight;
    // Slight front-back anatomical oval flattening for authentic torso proportion
    const chestOvalX = 1.04;
    const chestOvalZ = 0.90;
    const nr = r + fold;
    const scale = nr / r;
    pos.setXYZ(i, x * scale * chestOvalX, y, z * scale * chestOvalZ);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a sculpted stylized-realistic head geometry with delicate jawline taper,
 * cheekbones, forehead crown, and slightly recessed eye-plane contour.
 * Facing direction is configurable (`faceSign`: +1 for +Z villagers, -1 for -Z player avatar).
 */
export function createSculptedHeadGeometry(faceSign: 1 | -1 = 1): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.158, 18, 14);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const fz = z * faceSign;
    // Elongate head slightly vertically (anatomical cranium-to-chin ratio)
    y *= 1.12;
    // Taper lower jaw & chin delicately
    if (y < -0.02) {
      const jawT = Math.min(1, (-y - 0.02) / 0.15);
      x *= 1.0 - jawT * 0.26;
      if (fz > 0) z += faceSign * jawT * 0.012; // soft defined chin
      else z *= 1.0 - jawT * 0.14;
    }
    // Slight brow & cheekbone fullness on front face
    if (fz > 0.06 && y > -0.04 && y < 0.05) {
      const cheek = Math.exp(-Math.pow((Math.abs(x) - 0.068) / 0.045, 2));
      z += faceSign * cheek * 0.008;
    }
    // Gentle back-of-cranium volume
    if (fz < -0.04 && y > 0.02) {
      z -= faceSign * 0.01;
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

export interface CraftFaceOptions {
  faceSign: 1 | -1;
  skinMat: THREE.Material;
  hairMat: THREE.Material;
  cheekMat: THREE.Material;
  lipMat: THREE.Material;
  eyeIrisMat: THREE.Material;
  scleraMat: THREE.Material;
  catchlightMat: THREE.Material;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  castShadow: boolean;
  isElder?: boolean;
  isChild?: boolean;
}

/**
 * Adds rich sculpted facial anatomy onto a head group:
 * contoured cranium/jaw, nose bridge & tip, sculpted ears, recessed sclera + glossy iris + catchlight,
 * arched eyebrows, warm smile curve, and soft rosy cheeks.
 */
export function populateCraftFace(headGroup: THREE.Group, opts: CraftFaceOptions): void {
  const {
    faceSign: fs,
    skinMat,
    hairMat,
    cheekMat,
    lipMat,
    eyeIrisMat,
    scleraMat,
    catchlightMat,
    trackGeo,
    castShadow,
    isElder = false,
    isChild = false,
  } = opts;

  const headMesh = new THREE.Mesh(trackGeo(createSculptedHeadGeometry(fs)), skinMat);
  headMesh.castShadow = castShadow;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);

  // Subtle tapered neck cylinder connecting collar to jawline cleanly
  const neck = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.054, 0.064, 0.11, 10)), skinMat);
  neck.position.set(0, -0.175, -fs * 0.008);
  headGroup.add(neck);

  // Sculpted ears with gentle lobe tilt
  const earGeo = trackGeo(createSoftPillowGeometry(0.022, 0.044, 0.018, 8, 6));
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(sx * 0.152, -0.005, -fs * 0.012);
    ear.rotation.y = sx * 0.26 * fs;
    ear.rotation.z = -sx * 0.08;
    headGroup.add(ear);
  }

  // Sculpted nose bridge + delicate rounded tip
  const noseBridge = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.011, 0.017, 0.046, 8)),
    skinMat
  );
  noseBridge.position.set(0, -0.004, fs * 0.154);
  noseBridge.rotation.x = fs * 0.24;
  headGroup.add(noseBridge);

  const noseTip = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.016, 8, 6)), skinMat);
  noseTip.scale.set(1.05, 0.82, 0.92);
  noseTip.position.set(0, -0.026, fs * 0.165);
  headGroup.add(noseTip);

  // Expressive eyes: soft almond sclera + glossy dark iris + crisp catchlight glint + arched brow
  const eyeScale = isChild ? 1.15 : 1.0;
  const scleraGeo = trackGeo(new THREE.SphereGeometry(0.021 * eyeScale, 10, 8));
  const irisGeo = trackGeo(new THREE.SphereGeometry(0.0145 * eyeScale, 10, 8));
  const glintGeo = trackGeo(new THREE.SphereGeometry(0.0045 * eyeScale, 6, 6));
  const browGeo = trackGeo(new THREE.CapsuleGeometry(0.0065, 0.036, 4, 6));
  browGeo.rotateZ(Math.PI * 0.5);

  for (const sx of [-1, 1]) {
    const ex = sx * 0.056;
    const ey = isChild ? 0.008 : 0.016;
    const ez = fs * 0.138;

    const sclera = new THREE.Mesh(scleraGeo, scleraMat);
    sclera.scale.set(1.18, 0.82, 0.55);
    sclera.position.set(ex, ey, ez);
    headGroup.add(sclera);

    const iris = new THREE.Mesh(irisGeo, eyeIrisMat);
    iris.scale.set(1.0, 1.0, 0.62);
    iris.position.set(ex, ey, ez + fs * 0.008);
    headGroup.add(iris);

    const glint = new THREE.Mesh(glintGeo, catchlightMat);
    glint.position.set(ex + 0.005, ey + 0.005, ez + fs * 0.0155);
    headGroup.add(glint);

    const brow = new THREE.Mesh(browGeo, hairMat);
    brow.position.set(ex, ey + 0.034, ez + fs * 0.006);
    brow.rotation.z = -sx * (isElder ? 0.04 : 0.14);
    brow.rotation.y = -sx * fs * 0.18;
    headGroup.add(brow);
  }

  // Soft rosy cheeks & gentle curved smile
  const cheekGeo = trackGeo(new THREE.SphereGeometry(0.024, 8, 6));
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, cheekMat);
    cheek.scale.set(1.2, 0.72, 0.35);
    cheek.position.set(sx * 0.076, -0.024, fs * 0.132);
    headGroup.add(cheek);
  }

  const smileGeo = trackGeo(new THREE.TorusGeometry(0.024, 0.0048, 6, 12, Math.PI * 0.72));
  const smile = new THREE.Mesh(smileGeo, lipMat);
  smile.position.set(0, -0.056, fs * 0.145);
  smile.rotation.z = Math.PI + Math.PI * 0.14;
  if (fs < 0) smile.rotation.y = Math.PI;
  headGroup.add(smile);
}

export interface ArticulatedArmRig {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
}

/**
 * Builds a 2-segment articulated Hakka garment arm (upper sleeve + elbow joint + flared lower cuff + palm/thumb)
 * so walking, raking, carrying, waving, and petting dogs bend organically at the elbow!
 */
export function buildArticulatedArm(opts: {
  side: -1 | 1;
  shoulderPos: [number, number, number];
  upperLen: number;
  lowerLen: number;
  sleeveMat: THREE.Material;
  cuffMat?: THREE.Material;
  skinMat: THREE.Material;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  castShadow: boolean;
}): ArticulatedArmRig {
  const { side, shoulderPos, upperLen, lowerLen, sleeveMat, cuffMat, skinMat, trackGeo, castShadow } = opts;

  const shoulder = new THREE.Group();
  shoulder.position.set(shoulderPos[0], shoulderPos[1], shoulderPos[2]);

  // Rounded shoulder cap + tapered upper sleeve
  const upperGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.054, -upperLen],
        [0.068, -upperLen * 0.55],
        [0.076, -upperLen * 0.12],
        [0.062, 0.02],
        [0.0, 0.035],
      ],
      12
    )
  );
  const upperMesh = new THREE.Mesh(upperGeo, sleeveMat);
  upperMesh.castShadow = castShadow;
  shoulder.add(upperMesh);

  // Elbow joint pivot
  const elbow = new THREE.Group();
  elbow.position.set(0, -upperLen, 0);
  shoulder.add(elbow);

  // Flared Hakka lower sleeve + contrasting cuff trim
  const lowerGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.038, -lowerLen],
        [0.074, -lowerLen + 0.025],
        [0.064, -lowerLen * 0.45],
        [0.058, 0.0],
        [0.044, 0.025],
      ],
      12
    )
  );
  const lowerMesh = new THREE.Mesh(lowerGeo, sleeveMat);
  lowerMesh.castShadow = castShadow;
  elbow.add(lowerMesh);

  if (cuffMat) {
    const cuffGeo = trackGeo(new THREE.TorusGeometry(0.066, 0.011, 6, 12));
    cuffGeo.rotateX(Math.PI * 0.5);
    const cuff = new THREE.Mesh(cuffGeo, cuffMat);
    cuff.position.y = -lowerLen + 0.025;
    elbow.add(cuff);
  }

  // Sculpted hand & thumb
  const hand = new THREE.Group();
  hand.position.set(0, -lowerLen - 0.025, 0);
  const palm = new THREE.Mesh(trackGeo(createSoftPillowGeometry(0.042, 0.048, 0.028, 8, 6)), skinMat);
  hand.add(palm);
  const thumb = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.012, 0.024, 4, 6)), skinMat);
  thumb.position.set(-side * 0.028, 0.004, 0.018);
  thumb.rotation.z = side * 0.45;
  hand.add(thumb);
  elbow.add(hand);

  return { shoulder, elbow, hand };
}

export interface ArticulatedLegRig {
  hip: THREE.Group;
  knee: THREE.Group;
}

/**
 * Builds a 2-segment articulated leg (thigh + knee pivot + calf/trouser cuff + sculpted cloth shoe with white sole).
 */
export function buildArticulatedLeg(opts: {
  side: -1 | 1;
  hipPos: [number, number, number];
  thighLen: number;
  calfLen: number;
  faceSign: 1 | -1;
  trouserMat: THREE.Material;
  shoeMat: THREE.Material;
  soleMat: THREE.Material;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  castShadow: boolean;
}): ArticulatedLegRig {
  const { hipPos, thighLen, calfLen, faceSign: fs, trouserMat, shoeMat, soleMat, trackGeo, castShadow } = opts;

  const hip = new THREE.Group();
  hip.position.set(hipPos[0], hipPos[1], hipPos[2]);

  const thighGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.066, -thighLen],
        [0.078, -thighLen * 0.45],
        [0.086, -0.02],
        [0.072, 0.02],
      ],
      12
    )
  );
  const thighMesh = new THREE.Mesh(thighGeo, trouserMat);
  thighMesh.castShadow = castShadow;
  hip.add(thighMesh);

  const knee = new THREE.Group();
  knee.position.set(0, -thighLen, 0);
  hip.add(knee);

  const calfGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.048, -calfLen + 0.04],
        [0.064, -calfLen * 0.45],
        [0.068, 0.0],
        [0.056, 0.02],
      ],
      12
    )
  );
  const calfMesh = new THREE.Mesh(calfGeo, trouserMat);
  calfMesh.castShadow = castShadow;
  knee.add(calfMesh);

  // Traditional Hakka cloth shoe with contrasting stitched cotton sole (千层底布鞋)
  const shoeUpper = new THREE.Mesh(
    trackGeo(createSoftPillowGeometry(0.064, 0.044, 0.125, 10, 6)),
    shoeMat
  );
  shoeUpper.position.set(0, -calfLen + 0.024, fs * 0.032);
  shoeUpper.castShadow = castShadow;
  knee.add(shoeUpper);

  const sole = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.098, 0.016, 0.185)),
    soleMat
  );
  sole.position.set(0, -calfLen + 0.008, fs * 0.032);
  knee.add(sole);

  return { hip, knee };
}

/**
 * Adds traditional Hakka diagonal robe lapel trim (大襟滚边), 3 knotted frog buttons (盘扣),
 * layered waist sash, and spring-animated dangling sash ribbon tails.
 */
export function buildHakkaLapelAndSash(opts: {
  parent: THREE.Object3D;
  faceSign: 1 | -1;
  waistY: number;
  chestY: number;
  radius: number;
  trimMat: THREE.Material;
  buttonMat: THREE.Material;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  castShadow: boolean;
}): { sashTailL: THREE.Group; sashTailR: THREE.Group } {
  const { parent, faceSign: fs, waistY, chestY, radius, trimMat, buttonMat, trackGeo, castShadow } = opts;

  // Standing mandarin collar rim
  const collarGeo = trackGeo(new THREE.TorusGeometry(radius * 0.56, 0.022, 8, 18));
  collarGeo.rotateX(Math.PI * 0.5);
  const collar = new THREE.Mesh(collarGeo, trimMat);
  collar.position.y = chestY + 0.15;
  parent.add(collar);

  // Diagonal right-crossing Hakka lapel trim strip (右衽大襟)
  const lapelLen = Math.hypot(radius * 0.72, chestY - waistY + 0.12);
  const lapel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.026, lapelLen, 0.018)), trimMat);
  lapel.position.set(fs * radius * 0.22, (chestY + waistY) * 0.5 + 0.06, fs * (radius * 0.90));
  lapel.rotation.z = -fs * 0.44;
  lapel.rotation.x = fs * 0.08;
  parent.add(lapel);

  // 3 sculpted traditional frog buttons (盘扣) along diagonal lapel
  const btnGeo = trackGeo(new THREE.CapsuleGeometry(0.007, 0.026, 4, 6));
  btnGeo.rotateZ(Math.PI * 0.5);
  for (let b = 0; b < 3; b++) {
    const f = b / 2;
    const btn = new THREE.Mesh(btnGeo, buttonMat);
    btn.position.set(
      fs * (radius * 0.06 + f * radius * 0.36),
      chestY + 0.08 - f * 0.16,
      fs * (radius * 0.94 - f * 0.02)
    );
    btn.rotation.y = fs * f * 0.35;
    parent.add(btn);
  }

  // Layered woven waist sash + knot
  const sashGeo = trackGeo(new THREE.TorusGeometry(radius * 0.98, 0.034, 10, 22));
  sashGeo.rotateX(Math.PI * 0.5);
  const sash = new THREE.Mesh(sashGeo, trimMat);
  sash.scale.set(1.04, 1.0, 0.92);
  sash.position.y = waistY;
  sash.castShadow = castShadow;
  parent.add(sash);

  const knot = new THREE.Mesh(trackGeo(createSoftPillowGeometry(0.044, 0.038, 0.036, 8, 6)), trimMat);
  knot.position.set(fs * radius * 0.45, waistY - 0.01, fs * radius * 0.84);
  parent.add(knot);

  // Two spring-swayed dangling sash ribbon tails
  const tailGeo = trackGeo(createSoftPillowGeometry(0.038, 0.16, 0.014, 8, 6));
  const sashTailL = new THREE.Group();
  sashTailL.position.set(fs * radius * 0.38, waistY - 0.02, fs * radius * 0.86);
  const tMeshL = new THREE.Mesh(tailGeo, trimMat);
  tMeshL.position.y = -0.11;
  sashTailL.add(tMeshL);
  parent.add(sashTailL);

  const sashTailR = new THREE.Group();
  sashTailR.position.set(fs * radius * 0.52, waistY - 0.02, fs * radius * 0.82);
  const tMeshR = new THREE.Mesh(tailGeo, trimMat);
  tMeshR.scale.set(0.88, 0.82, 1.0);
  tMeshR.position.y = -0.095;
  sashTailR.add(tMeshR);
  parent.add(sashTailR);

  return { sashTailL, sashTailR };
}
