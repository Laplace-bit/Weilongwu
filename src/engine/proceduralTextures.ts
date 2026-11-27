import * as THREE from 'three';

export interface MaterialLibrary {
  limeWall: THREE.MeshStandardMaterial;
  limeWallInterior: THREE.MeshStandardMaterial;
  limeRidge: THREE.MeshStandardMaterial;
  rammedEarth: THREE.MeshStandardMaterial;
  rammedEarthXray: THREE.MeshStandardMaterial;
  roofTile: THREE.MeshStandardMaterial;
  roofTileDark: THREE.MeshStandardMaterial;
  graniteSlab: THREE.MeshStandardMaterial;
  granitePlinth: THREE.MeshStandardMaterial;
  courtyardEarth: THREE.MeshStandardMaterial;
  huataiCobble: THREE.MeshStandardMaterial;
  darkTimber: THREE.MeshStandardMaterial;
  weatheredWoodDoor: THREE.MeshStandardMaterial;
  windowLattice: THREE.MeshStandardMaterial;
  redCouplet: THREE.MeshStandardMaterial;
  redLacquer: THREE.MeshStandardMaterial;
  gildedGold: THREE.MeshStandardMaterial;
  bronzeMetal: THREE.MeshStandardMaterial;
  goldenGrain: THREE.MeshStandardMaterial;
  indigoCloth: THREE.MeshStandardMaterial;
  terracotta: THREE.MeshStandardMaterial;
  bambooGreen: THREE.MeshStandardMaterial;
  foliageDeep: THREE.MeshStandardMaterial;
  foliageBright: THREE.MeshStandardMaterial;
  foliageMid: THREE.MeshStandardMaterial;
  grassDecal: THREE.MeshStandardMaterial;
  mossDecal: THREE.MeshStandardMaterial;
  forestGround: THREE.MeshStandardMaterial;
  lanternPaper: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  plaqueLongxi: THREE.MeshStandardMaterial;
  plaqueGengdu: THREE.MeshStandardMaterial;
  plaqueJiaxun: THREE.MeshStandardMaterial;
  skySunny: THREE.MeshBasicMaterial;
  skyRain: THREE.MeshBasicMaterial;
  skyNight: THREE.MeshBasicMaterial;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return [canvas, ctx];
}

// Deterministic pseudo-random generator for repeatable photorealistic micro-noise
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  isColor: boolean,
  repX = 1,
  repY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Converts a greyscale height canvas into a true tangent-space RGB normal map via Sobel filter.
 */
function heightCanvasToNormalCanvas(
  heightCanvas: HTMLCanvasElement,
  strength: number
): HTMLCanvasElement {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const [outCanvas, outCtx] = makeCanvas(w, h);
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sample = (x: number, y: number): number => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);
  return outCanvas;
}

interface WorldPatinaOptions {
  key: string;
  macroFreq?: number;
  macroStrength?: number;
  mossStrength?: number;
  groundAoHeight?: number;
  groundAoStrength?: number;
  eaveAoHeight?: number;
}

const GLSL_PATINA_NOISE = /* glsl */ `
  float patinaHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float patinaNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = patinaHash(i);
    float b = patinaHash(i + vec2(1.0, 0.0));
    float c = patinaHash(i + vec2(0.0, 1.0));
    float d = patinaHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float patinaFbm(vec2 p) {
    float v = 0.0;
    v += 0.55 * patinaNoise(p);
    v += 0.30 * patinaNoise(p * 2.13 + vec2(17.3, 9.2));
    v += 0.15 * patinaNoise(p * 4.41 + vec2(-5.7, 23.1));
    return v;
  }
`;

/**
 * Injects world-space anti-tiling macro weathering, organic Lingnan moss/damp patina,
 * and ground-contact ambient occlusion into any MeshStandardMaterial via onBeforeCompile.
 */
function attachWorldPatinaShader(
  mat: THREE.MeshStandardMaterial,
  opts: WorldPatinaOptions
): void {
  const macroFreq = (opts.macroFreq ?? 0.13).toFixed(4);
  const macroStrength = (opts.macroStrength ?? 0.2).toFixed(4);
  const mossStrength = (opts.mossStrength ?? 0.18).toFixed(4);
  const groundAoHeight = (opts.groundAoHeight ?? 0.0).toFixed(4);
  const groundAoStrength = (opts.groundAoStrength ?? 0.28).toFixed(4);
  const eaveAoHeight = (opts.eaveAoHeight ?? 0.0).toFixed(4);

  mat.customProgramCacheKey = () => `patina_${opts.key}`;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPatinaWorldPos;
        varying vec3 vPatinaWorldNormal;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 patinaWp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          patinaWp = instanceMatrix * patinaWp;
        #endif
        patinaWp = modelMatrix * patinaWp;
        vPatinaWorldPos = patinaWp.xyz;
        vec3 patinaWn = objectNormal;
        #ifdef USE_INSTANCING
          patinaWn = mat3( instanceMatrix ) * patinaWn;
        #endif
        vPatinaWorldNormal = normalize( mat3( modelMatrix ) * patinaWn );`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPatinaWorldPos;
        varying vec3 vPatinaWorldNormal;
        ${GLSL_PATINA_NOISE}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 wpXZ = vPatinaWorldPos.xz;
          float nMacro = patinaFbm(wpXZ * ${macroFreq} + vec2(vPatinaWorldPos.y * 0.22, -vPatinaWorldPos.y * 0.17));
          float nDetail = patinaFbm(wpXZ * (${macroFreq} * 2.75) + vec2(11.4, -7.8) + vPatinaWorldPos.y * 0.65);

          // 1. Multi-meter macro tonal clouds to eliminate repeating tile patterns
          float toneShift = (nMacro - 0.5) * 2.0 * ${macroStrength};
          vec3 warmCool = mix(vec3(0.95, 0.96, 0.99), vec3(1.06, 1.01, 0.93), nDetail);
          diffuseColor.rgb *= clamp(1.0 + toneShift, 0.72, 1.22) * warmCool;

          // 2. Organic desaturated Lingnan moss & damp soot in shaded / northern / micro-crevice zones
          float northBias = clamp(-vPatinaWorldNormal.z * 0.22 + 0.52, 0.2, 0.85);
          float mossNoise = patinaFbm(wpXZ * 0.34 + vec2(vPatinaWorldPos.y * 0.55, 3.7));
          float mossMask = smoothstep(0.56, 0.84, mossNoise * 0.78 + northBias * 0.32) * ${mossStrength};
          vec3 lingnanMoss = mix(vec3(0.14, 0.18, 0.09), vec3(0.24, 0.27, 0.14), nDetail);
          diffuseColor.rgb = mix(diffuseColor.rgb, lingnanMoss, clamp(mossMask, 0.0, 0.62));

          // 3. Ground-contact ambient occlusion & capillary rising damp along vertical masonry bases
          if (${groundAoHeight} > 0.01) {
            float verticalness = 1.0 - abs(vPatinaWorldNormal.y);
            float baseFactor = 1.0 - smoothstep(0.02, ${groundAoHeight}, vPatinaWorldPos.y);
            float irregularBase = baseFactor * (0.68 + 0.52 * nDetail) * verticalness;
            diffuseColor.rgb *= (1.0 - irregularBase * ${groundAoStrength});
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.19, 0.10), clamp(irregularBase * 0.38, 0.0, 0.42));
          }

          // 4. Subtle under-eave shadow band near top of vertical walls for crisp architectural depth
          if (${eaveAoHeight} > 0.01) {
            float verticalness = 1.0 - abs(vPatinaWorldNormal.y);
            float eaveBand = smoothstep(${eaveAoHeight} - 0.58, ${eaveAoHeight}, vPatinaWorldPos.y)
                           * (1.0 - smoothstep(${eaveAoHeight}, ${eaveAoHeight} + 0.22, vPatinaWorldPos.y));
            diffuseColor.rgb *= (1.0 - eaveBand * verticalness * 0.26);
          }
        }`
      );
  };
}

/**
 * Multi-biome rural Meizhou valley terrain shader for the outer ground plane:
 * blends golden-brown fallow fields, tree-shaded olive undergrowth, and winding dirt tracks.
 */
function attachValleyTerrainShader(mat: THREE.MeshStandardMaterial): void {
  mat.customProgramCacheKey = () => 'lingnan_valley_terrain_v1';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vValleyWorldPos;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 vwp = modelMatrix * vec4( transformed, 1.0 );
        vValleyWorldPos = vwp.xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vValleyWorldPos;
        ${GLSL_PATINA_NOISE}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vValleyWorldPos.xz;
          float nLarge = patinaFbm(p * 0.018);
          float nMed = patinaFbm(p * 0.062 + vec2(14.2, -9.1));
          float nFine = patinaFbm(p * 0.24 + vec2(-13.7, 6.4));

          // Calibrated linear-space Lingnan rural valley palette (matches lush Meizhou valley photo)
          vec3 fallowStraw = vec3(0.155, 0.132, 0.058);
          vec3 oliveMeadow = vec3(0.055, 0.095, 0.030);
          vec3 deepWoodland = vec3(0.026, 0.052, 0.016);
          vec3 dirtTrack = vec3(0.135, 0.108, 0.072);

          vec3 col = mix(deepWoodland, oliveMeadow, smoothstep(0.28, 0.68, nMed));
          col = mix(col, fallowStraw, smoothstep(0.48, 0.80, nLarge) * 0.78);

          // Organic irregular earthy village clearings & footpaths
          float pathField = patinaFbm(p * 0.032 + vec2(nLarge * 2.1, -nMed * 1.9));
          float trackMask = 1.0 - smoothstep(0.47, 0.52, abs(pathField - 0.5) * 10.0);
          col = mix(col, dirtTrack, clamp(trackMask * 0.45, 0.0, 0.45));

          // Micro foliage/soil grain variation
          col *= (0.78 + 0.44 * nFine);
          diffuseColor.rgb = col;
        }`
      );
  };
}

/**
 * Converts a loaded HTMLImageElement / canvas into a greyscale height canvas and runs Sobel normal extraction.
 */
function imageToSobelNormalTexture(
  img: HTMLImageElement,
  aniso: number,
  strength: number,
  repX: number,
  repY: number
): THREE.CanvasTexture {
  const S = 512;
  const [hCanvas, hCtx] = makeCanvas(S, S);
  hCtx.drawImage(img, 0, 0, S, S);
  const imgData = hCtx.getImageData(0, 0, S, S);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    d[i] = lum;
    d[i + 1] = lum;
    d[i + 2] = lum;
    d[i + 3] = 255;
  }
  hCtx.putImageData(imgData, 0, 0);
  const normalCanvas = heightCanvasToNormalCanvas(hCanvas, strength);
  return createTexture(normalCanvas, aniso, false, repX, repY);
}

/**
 * 1. Century-Old Aged Lingnan White Lime Plaster Wall (百年斑驳白灰墙与墙脚苔痕)
 * Features aged bone-ivory lime plaster, jagged flaking patches revealing ochre earth substrate,
 * branching hairline cracks, dark under-eave monsoon runoff streaks, and creeping lower-wall moss.
 */
function makeLimeWallMaps(aniso: number) {
  const S = 512;
  const rand = mulberry32(101);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);
  const [r, rctx] = makeCanvas(S, S);

  // Warm century-aged chalky bone-ivory base (never sterile white)
  ctx.fillStyle = '#ddd6c7';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#8e8e8e';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#dcdcdc';
  rctx.fillRect(0, 0, S, S);

  // Broad trowel plaster clouds & subtle yellowing age blotches
  for (let i = 0; i < 480; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const rad = 14 + rand() * 44;
    const roll = rand();
    if (roll < 0.36) ctx.fillStyle = 'rgba(238,233,220,0.16)';
    else if (roll < 0.72) ctx.fillStyle = 'rgba(162,152,134,0.16)';
    else ctx.fillStyle = 'rgba(138,128,108,0.14)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    hctx.fillStyle = roll < 0.45 ? 'rgba(162,162,162,0.22)' : 'rgba(104,104,104,0.22)';
    hctx.beginPath();
    hctx.arc(x, y, rad * 0.85, 0, Math.PI * 2);
    hctx.fill();
  }

  // Heavy monsoon rainwater drip stains & dark algae streaks descending from roof eaves
  for (let i = 0; i < 95; i++) {
    const x = rand() * S;
    const w = 2.5 + rand() * 16;
    const len = 65 + rand() * 260;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    const mossy = rand() < 0.38;
    g.addColorStop(0, mossy ? 'rgba(54,62,42,0.44)' : 'rgba(68,64,56,0.38)');
    g.addColorStop(0.45, mossy ? 'rgba(72,82,56,0.18)' : 'rgba(96,90,78,0.16)');
    g.addColorStop(1, 'rgba(96,90,78,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, len);
  }

  // Peeling / flaking lime plaster scars exposing dusty ochre-grey rammed earth beneath!
  for (let i = 0; i < 22; i++) {
    const px = rand() * S;
    const py = S * (0.28 + rand() * 0.65);
    const rx = 8 + rand() * 24;
    const ry = 6 + rand() * 16;
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const ang = (k / 9) * Math.PI * 2;
      const jitter = 0.65 + rand() * 0.55;
      const vx = px + Math.cos(ang) * rx * jitter;
      const vy = py + Math.sin(ang) * ry * jitter;
      if (k === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    // Recessed aged earth substrate inside the flaked scar
    ctx.fillStyle = rand() > 0.4 ? 'rgba(132,114,90,0.68)' : 'rgba(108,96,78,0.64)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(64,58,48,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // Etch recessed scar into height map so light catches the flaking plaster lip!
    hctx.fillStyle = 'rgba(42,42,42,0.72)';
    hctx.beginPath();
    hctx.ellipse(px, py, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
    hctx.fill();
    rctx.fillStyle = 'rgba(248,248,248,0.65)';
    rctx.beginPath();
    hctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    rctx.fill();
  }

  // Branching hairline age cracks across the aged plaster
  ctx.lineWidth = 1.1;
  hctx.lineWidth = 1.6;
  for (let cIdx = 0; cIdx < 24; cIdx++) {
    let cx = rand() * S;
    let cy = rand() * S;
    ctx.strokeStyle = 'rgba(72,66,56,0.36)';
    hctx.strokeStyle = 'rgba(32,32,32,0.58)';
    ctx.beginPath();
    hctx.beginPath();
    ctx.moveTo(cx, cy);
    hctx.moveTo(cx, cy);
    const segs = 5 + Math.floor(rand() * 7);
    for (let s = 0; s < segs; s++) {
      cx += (rand() - 0.5) * 28;
      cy += (rand() - 0.25) * 24;
      ctx.lineTo(cx, cy);
      hctx.lineTo(cx, cy);
    }
    ctx.stroke();
    hctx.stroke();
  }

  // Authentic lower-40% rising damp, dark water-splash grime & creeping olive-green moss!
  const dampGrad = ctx.createLinearGradient(0, S * 0.5, 0, S);
  dampGrad.addColorStop(0, 'rgba(112,106,90,0.0)');
  dampGrad.addColorStop(0.38, 'rgba(104,98,82,0.28)');
  dampGrad.addColorStop(0.72, 'rgba(68,72,54,0.62)');
  dampGrad.addColorStop(1, 'rgba(44,52,36,0.86)');
  ctx.fillStyle = dampGrad;
  ctx.fillRect(0, S * 0.5, S, S * 0.5);

  // Velvety olive/emerald moss colonies & dark damp lichen climbing irregularly from wall base
  for (let i = 0; i < 240; i++) {
    const x = rand() * S;
    const tBase = rand() * rand(); // denser near very bottom (y -> S)
    const y = S * (1.0 - tBase * 0.42);
    const rw = 8 + rand() * 32;
    const rh = 6 + rand() * 20;
    const mRoll = rand();
    if (mRoll < 0.42) ctx.fillStyle = 'rgba(62,82,40,0.34)'; // rich olive moss
    else if (mRoll < 0.72) ctx.fillStyle = 'rgba(46,62,32,0.38)'; // deep damp green moss
    else if (mRoll < 0.88) ctx.fillStyle = 'rgba(84,96,52,0.28)'; // sunlit yellow-olive lichen
    else ctx.fillStyle = 'rgba(54,50,42,0.34)'; // dark damp soot
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, (rand() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Velvety high roughness + subtle puffy relief on moss patches
    rctx.fillStyle = 'rgba(250,250,250,0.45)';
    rctx.fillRect(x - rw, y - rh, rw * 2, rh * 2);
    hctx.fillStyle = mRoll < 0.72 ? 'rgba(165,165,165,0.28)' : 'rgba(68,68,68,0.28)';
    hctx.beginPath();
    hctx.ellipse(x, y, rw * 0.7, rh * 0.7, 0, 0, Math.PI * 2);
    hctx.fill();
  }

  // Fine sand grain & weathered chalk micro-pitting
  for (let i = 0; i < 3200; i++) {
    const x = Math.floor(rand() * S);
    const y = Math.floor(rand() * S);
    const shade = rand() > 0.5 ? 168 : 84;
    hctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    hctx.fillRect(x, y, 2, 2);
  }

  const normalCanvas = heightCanvasToNormalCanvas(h, 2.7);
  return {
    map: createTexture(c, aniso, true, 1, 1),
    normal: createTexture(normalCanvas, aniso, false, 1, 1),
    roughness: createTexture(r, aniso, false, 1, 1),
  };
}

/**
 * 1B. Weathered Antique Lime-Mortar Roof Ridges (风化正脊与垂脊灰塑)
 * Replaces flat uniform grey ridges with monsoon-streaked, lichen-flecked aged mortar.
 */
function makeLimeRidgeMaps(aniso: number) {
  const S = 256;
  const rand = mulberry32(155);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);

  ctx.fillStyle = '#b9b6ab';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#848484';
  hctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 240; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const rad = 6 + rand() * 24;
    const roll = rand();
    if (roll < 0.35) ctx.fillStyle = 'rgba(72,70,62,0.26)';
    else if (roll < 0.65) ctx.fillStyle = 'rgba(76,88,52,0.26)'; // moss/lichen stain
    else ctx.fillStyle = 'rgba(206,202,190,0.2)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    hctx.fillStyle = roll < 0.5 ? 'rgba(64,64,64,0.25)' : 'rgba(164,164,164,0.25)';
    hctx.beginPath();
    hctx.arc(x, y, rad * 0.7, 0, Math.PI * 2);
    hctx.fill();
  }
  // Dark rainwater cap grime along edges
  ctx.fillStyle = 'rgba(48,50,42,0.28)';
  ctx.fillRect(0, 0, S, 24);
  ctx.fillRect(0, S - 24, S, 24);

  const normalCanvas = heightCanvasToNormalCanvas(h, 2.4);
  return {
    map: createTexture(c, aniso, true, 3, 1),
    normal: createTexture(normalCanvas, aniso, false, 3, 1),
  };
}

/**
 * 2. Century-Old Weathered Meizhou Qing Clay Roof Tiles (百年苔痕小青瓦)
 * Deep aged charcoal-slate & warm kiln-clay variation, dark monsoon soot in concave troughs,
 * and rich organic Lingnan olive-green moss & pale lichen colonies nestled between tiles.
 */
function makeRoofTileMaps(aniso: number) {
  const S = 512;
  const rand = mulberry32(202);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);
  const [r, rctx] = makeCanvas(S, S);

  ctx.fillStyle = '#474c50';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#282828';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#c8c8c8';
  rctx.fillRect(0, 0, S, S);

  const cols = 16;
  const rows = 16;
  const cw = S / cols;
  const rh = S / rows;

  for (let col = 0; col < cols; col++) {
    const x0 = col * cw;
    const colTint = (rand() - 0.5) * 26;
    const isMossyCol = rand() < 0.34;
    const isSootCol = !isMossyCol && rand() < 0.26;

    for (let row = 0; row < rows; row++) {
      const y0 = row * rh;
      const cellShift = (rand() - 0.5) * 34 + colTint;
      // Occasional warm aged clay-brown replacement tile among silver-grey weathered tiles
      const isWarmClay = rand() < 0.11;
      const baseR = Math.max(
        42,
        Math.min(162, 102 + cellShift + (isWarmClay ? 18 : 0) + (isSootCol ? -16 : 0) + (isMossyCol ? -8 : 0))
      );
      const baseG = Math.max(
        46,
        Math.min(164, 105 + cellShift + (isWarmClay ? 8 : 0) + (isSootCol ? -15 : 0) + (isMossyCol ? 6 : 0))
      );
      const baseB = Math.max(
        44,
        Math.min(162, 106 + cellShift + (isWarmClay ? -6 : 0) + (isSootCol ? -14 : 0) + (isMossyCol ? -12 : 0))
      );

      // Cylindrical barrel-tile shading with darker mossy/sooty rain troughs
      const grad = ctx.createLinearGradient(x0, 0, x0 + cw, 0);
      grad.addColorStop(
        0.0,
        isMossyCol
          ? `rgb(${Math.round(baseR * 0.36)},${Math.round(baseG * 0.46)},${Math.round(baseB * 0.28)})`
          : `rgb(${Math.round(baseR * 0.34)},${Math.round(baseG * 0.36)},${Math.round(baseB * 0.37)})`
      );
      grad.addColorStop(0.24, `rgb(${Math.round(baseR * 0.8)},${Math.round(baseG * 0.81)},${Math.round(baseB * 0.82)})`);
      grad.addColorStop(
        0.5,
        `rgb(${Math.min(208, Math.round(baseR * 1.22))},${Math.min(210, Math.round(baseG * 1.22))},${Math.min(212, Math.round(baseB * 1.2))})`
      );
      grad.addColorStop(0.76, `rgb(${Math.round(baseR * 0.74)},${Math.round(baseG * 0.76)},${Math.round(baseB * 0.76)})`);
      grad.addColorStop(
        1.0,
        isMossyCol
          ? `rgb(${Math.round(baseR * 0.34)},${Math.round(baseG * 0.44)},${Math.round(baseB * 0.26)})`
          : `rgb(${Math.round(baseR * 0.3)},${Math.round(baseG * 0.32)},${Math.round(baseB * 0.33)})`
      );
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y0, cw + 0.5, rh + 0.5);

      const hGrad = hctx.createLinearGradient(x0, 0, x0 + cw, 0);
      hGrad.addColorStop(0.0, '#101010');
      hGrad.addColorStop(0.22, '#787878');
      hGrad.addColorStop(0.5, '#f2f2f2');
      hGrad.addColorStop(0.78, '#787878');
      hGrad.addColorStop(1.0, '#101010');
      hctx.fillStyle = hGrad;
      hctx.fillRect(x0, y0, cw + 0.5, rh + 0.5);

      const rv = Math.round(168 + rand() * 76);
      rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
      rctx.fillRect(x0, y0, cw, rh);

      // Deep dark grime & shadow lip beneath each overlapping clay tile
      ctx.fillStyle = 'rgba(14,18,16,0.68)';
      ctx.fillRect(x0, y0 + rh - 4, cw, 4);
      ctx.fillStyle = 'rgba(205,210,204,0.14)';
      ctx.fillRect(x0 + cw * 0.25, y0 + rh - 6, cw * 0.5, 2);

      hctx.fillStyle = '#0a0a0a';
      hctx.fillRect(x0, y0 + rh - 4, cw, 4);
    }
  }

  // Clustered organic olive-moss patches & pale yellow-green lichen growing across aged clay tiles!
  for (let p = 0; p < 48; p++) {
    const cx = rand() * S;
    const cy = rand() * S;
    const rad = 10 + rand() * 34;
    const mossType = rand();
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rad);
    if (mossType < 0.48) {
      // Deep damp Lingnan roof moss
      g.addColorStop(0, 'rgba(64,84,38,0.62)');
      g.addColorStop(0.6, 'rgba(58,74,36,0.34)');
      g.addColorStop(1, 'rgba(58,74,36,0.0)');
    } else if (mossType < 0.78) {
      // Sun-baked sage/ochre lichen crust
      g.addColorStop(0, 'rgba(116,124,74,0.52)');
      g.addColorStop(0.65, 'rgba(98,104,64,0.24)');
      g.addColorStop(1, 'rgba(98,104,64,0.0)');
    } else {
      // Dark monsoon rain-soot streak
      g.addColorStop(0, 'rgba(32,36,34,0.52)');
      g.addColorStop(0.65, 'rgba(38,42,40,0.22)');
      g.addColorStop(1, 'rgba(38,42,40,0.0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rad * 0.72, rad * 1.25, (rand() - 0.5) * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Make mossy zones ultra-matte velvety in roughness map
    rctx.fillStyle = 'rgba(250,250,250,0.55)';
    rctx.beginPath();
    rctx.arc(cx, cy, rad * 0.8, 0, Math.PI * 2);
    rctx.fill();
  }

  // Fine mineral pitting, lichen speckles & weathered dust
  for (let i = 0; i < 1600; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const sz = 1.2 + rand() * 3.8;
    const mode = rand();
    if (mode < 0.28) ctx.fillStyle = 'rgba(168,168,148,0.26)';
    else if (mode < 0.58) ctx.fillStyle = 'rgba(38,44,34,0.32)';
    else ctx.fillStyle = 'rgba(84,102,48,0.34)';
    ctx.fillRect(x, y, sz, sz);
  }

  const normalCanvas = heightCanvasToNormalCanvas(h, 4.4);
  return {
    map: createTexture(c, aniso, true, 1, 1),
    normal: createTexture(normalCanvas, aniso, false, 1, 1),
    roughness: createTexture(r, aniso, false, 1, 1),
  };
}

/**
 * 3. Moss-Seamed Antique Cut Granite Flagstones & Foundation Plinth (青苔石缝花岗岩 / 麻石)
 * Deep dark-green moss tucked directly into recessed mortar joints, iron-rust weathering,
 * chipped stone edges, and damp discoloration.
 */
function makeGraniteMaps(aniso: number, isPlinth = false) {
  const S = 512;
  const rand = mulberry32(isPlinth ? 319 : 303);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);
  const [r, rctx] = makeCanvas(S, S);

  // Dark damp mossy mortar joints!
  ctx.fillStyle = isPlinth ? '#36422a' : '#3f4733';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#1c1c1c';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#ececec';
  rctx.fillRect(0, 0, S, S);

  const rows = isPlinth ? 6 : 8;
  const cols = isPlinth ? 3 : 4;
  const rh = S / rows;
  const cw = S / cols;

  for (let row = 0; row < rows; row++) {
    const offset = (row % 2) * (cw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const x = col * cw + offset;
      const y = row * rh;
      const v = Math.round((isPlinth ? 114 : 126) + (rand() - 0.5) * 34);
      const warmShift = (rand() - 0.5) * 12;
      ctx.fillStyle = `rgb(${Math.round(v + 3 + warmShift)},${Math.round(v + 1 + warmShift * 0.6)},${Math.round(v - 6)})`;
      ctx.fillRect(x + 3, y + 3, cw - 6, rh - 6);

      // Subtle dark damp edge framing each weathered stone block
      ctx.strokeStyle = 'rgba(48,58,36,0.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 4, y + 4, cw - 8, rh - 8);

      const hv = Math.round(186 + (rand() - 0.5) * 34);
      hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
      hctx.fillRect(x + 3, y + 3, cw - 6, rh - 6);

      const rv = Math.round(168 + rand() * 58);
      rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
      rctx.fillRect(x + 3, y + 3, cw - 6, rh - 6);
    }
  }

  // Organic creeping moss colonies blooming along stone joints & damp corners
  const mossCount = isPlinth ? 130 : 85;
  for (let i = 0; i < mossCount; i++) {
    // Anchor 70% of moss right along horizontal or vertical mortar seams
    const onSeam = rand() < 0.72;
    const x = onSeam && rand() < 0.5 ? Math.floor(rand() * cols) * cw + (rand() - 0.5) * 14 : rand() * S;
    const y = onSeam
      ? Math.floor(rand() * rows) * rh + (rand() - 0.5) * 12
      : isPlinth
        ? S * (0.45 + rand() * 0.55)
        : rand() * S;
    const rad = 6 + rand() * (isPlinth ? 26 : 18);
    const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
    if (rand() < 0.65) {
      g.addColorStop(0, 'rgba(54,76,34,0.68)');
      g.addColorStop(0.55, 'rgba(66,86,40,0.34)');
      g.addColorStop(1, 'rgba(66,86,40,0.0)');
    } else {
      // Warm rust-ochre water oxidation stain on granite
      g.addColorStop(0, 'rgba(116,96,64,0.34)');
      g.addColorStop(1, 'rgba(116,96,64,0.0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rad * 1.25, rad * 0.75, (rand() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();

    rctx.fillStyle = 'rgba(250,250,250,0.5)';
    rctx.beginPath();
    rctx.arc(x, y, rad * 0.75, 0, Math.PI * 2);
    rctx.fill();
  }

  // Extra dark ground-splash dampness along the lower half of foundation plinths
  if (isPlinth) {
    const pg = ctx.createLinearGradient(0, S * 0.45, 0, S);
    pg.addColorStop(0, 'rgba(38,48,28,0)');
    pg.addColorStop(0.6, 'rgba(42,52,30,0.38)');
    pg.addColorStop(1, 'rgba(30,40,22,0.72)');
    ctx.fillStyle = pg;
    ctx.fillRect(0, S * 0.45, S, S * 0.55);
  }

  // Granite quartz/mica mineral speckles & chisel pitting
  for (let i = 0; i < 4800; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const dark = rand() < 0.58;
    ctx.fillStyle = dark ? 'rgba(36,38,32,0.28)' : 'rgba(226,222,212,0.22)';
    ctx.fillRect(x, y, 2, 2);
    hctx.fillStyle = dark ? 'rgba(84,84,84,0.38)' : 'rgba(235,235,235,0.35)';
    hctx.fillRect(x, y, 2, 2);
  }

  const normalCanvas = heightCanvasToNormalCanvas(h, 3.1);
  return {
    map: createTexture(c, aniso, true, isPlinth ? 3 : 4, isPlinth ? 1 : 4),
    normal: createTexture(normalCanvas, aniso, false, isPlinth ? 3 : 4, isPlinth ? 1 : 4),
    roughness: createTexture(r, aniso, false, isPlinth ? 3 : 4, isPlinth ? 1 : 4),
  };
}

/**
 * 4. Century-Weathered Three-Lime-Earth / Concrete He-Ping Forecourt (百年雨渍禾坪)
 * Directly matches the dramatic aged concrete/lime-earth forecourt in the reference photo:
 * deep rainwater mottling, dark soot clouds, hairline cracks, and moss-lined expansion seams.
 */
function makeCourtyardHePingMaps(aniso: number) {
  const S = 512;
  const rand = mulberry32(404);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);
  const [r, rctx] = makeCanvas(S, S);

  ctx.fillStyle = '#9d978c';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#8e8e8e';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#dcdcdc';
  rctx.fillRect(0, 0, S, S);

  // Rich organic rain-soot, sun-bleached chalk, and damp earth weathering clouds
  for (let i = 0; i < 320; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const rad = 18 + rand() * 68;
    const tone = rand();
    if (tone < 0.34) ctx.fillStyle = 'rgba(72,68,60,0.22)'; // dark aged rain patina
    else if (tone < 0.62) ctx.fillStyle = 'rgba(116,110,98,0.19)';
    else if (tone < 0.84) ctx.fillStyle = 'rgba(196,190,176,0.16)'; // sun-bleached lime
    else ctx.fillStyle = 'rgba(84,96,56,0.16)'; // subtle moss-tinted damp cloud
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    const rv = tone < 0.34 ? 'rgba(182,182,182,0.28)' : 'rgba(246,246,246,0.24)';
    rctx.fillStyle = rv;
    rctx.beginPath();
    rctx.arc(x, y, rad, 0, Math.PI * 2);
    rctx.fill();
  }

  // Moss-lined slab expansion joint grid (matching the weathered joints in the reference photo!)
  for (const pos of [0, 256]) {
    // Moss & dark silt halo flanking each expansion seam
    ctx.strokeStyle = 'rgba(62,76,40,0.42)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, S);
    ctx.moveTo(0, pos);
    ctx.lineTo(S, pos);
    ctx.stroke();

    // Sharp recessed crack line
    ctx.strokeStyle = 'rgba(42,40,34,0.68)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, S);
    ctx.moveTo(0, pos);
    ctx.lineTo(S, pos);
    ctx.stroke();

    hctx.strokeStyle = '#242424';
    hctx.lineWidth = 4;
    hctx.beginPath();
    hctx.moveTo(pos, 0);
    hctx.lineTo(pos, S);
    hctx.moveTo(0, pos);
    hctx.lineTo(S, pos);
    hctx.stroke();
  }

  // Random jagged surface stress cracks with tiny green moss flecks
  for (let k = 0; k < 18; k++) {
    let cx = rand() * S;
    let cy = rand() * S;
    ctx.strokeStyle = 'rgba(52,50,42,0.45)';
    ctx.lineWidth = 1.2;
    hctx.strokeStyle = '#363636';
    hctx.lineWidth = 1.8;
    ctx.beginPath();
    hctx.beginPath();
    ctx.moveTo(cx, cy);
    hctx.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += (rand() - 0.5) * 34;
      cy += (rand() - 0.5) * 34;
      ctx.lineTo(cx, cy);
      hctx.lineTo(cx, cy);
      if (rand() < 0.45) {
        ctx.fillStyle = 'rgba(72,92,42,0.38)';
        ctx.fillRect(cx - 2, cy - 2, 5, 4);
      }
    }
    ctx.stroke();
    hctx.stroke();
  }

  // Coarse weathered aggregate & sand grit
  for (let i = 0; i < 4200; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const shade = rand() > 0.5 ? 168 : 88;
    ctx.fillStyle = `rgba(${shade},${shade - 3},${shade - 8},0.22)`;
    ctx.fillRect(x, y, 2, 2);
    hctx.fillStyle = rand() > 0.5 ? '#b0b0b0' : '#646464';
    hctx.fillRect(x, y, 2, 2);
  }

  const normalCanvas = heightCanvasToNormalCanvas(h, 2.3);
  return {
    map: createTexture(c, aniso, true, 5, 3),
    normal: createTexture(normalCanvas, aniso, false, 5, 3),
    roughness: createTexture(r, aniso, false, 5, 3),
  };
}

/**
 * 5. Sun-Baked Huatai Earthen & Mossy River-Cobble Courtyard (化胎古卵石地坪)
 */
function makeHuataiCobbleMaps(aniso: number) {
  const S = 512;
  const rand = mulberry32(505);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);
  const [r, rctx] = makeCanvas(S, S);

  ctx.fillStyle = '#9c8364';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#424242';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#eaeaea';
  rctx.fillRect(0, 0, S, S);

  // Earthy ochre patches, damp humic soil & moss colonies weaving between cobbles
  for (let i = 0; i < 280; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const rad = 14 + rand() * 44;
    const m = rand();
    if (m < 0.36) ctx.fillStyle = 'rgba(136,110,80,0.26)';
    else if (m < 0.66) ctx.fillStyle = 'rgba(182,160,128,0.22)';
    else if (m < 0.88) ctx.fillStyle = 'rgba(80,96,48,0.28)'; // moss creeping between pebbles
    else ctx.fillStyle = 'rgba(68,62,48,0.24)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Embedded river pebbles / cobbles partially flush with mossy packed earth
  const stonePalette = ['#8c8376', '#7b7367', '#a69680', '#6d685e', '#968771'];
  for (let i = 0; i < 440; i++) {
    const cx = rand() * S;
    const cy = rand() * S;
    const rx = 5 + rand() * 9;
    const ry = 4 + rand() * 7;
    const ang = rand() * Math.PI;
    // Faint mossy soil ring around each cobble
    ctx.fillStyle = 'rgba(64,78,38,0.34)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 2.2, ry + 2.2, ang, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = stonePalette[Math.floor(rand() * stonePalette.length)];
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, ang, 0, Math.PI * 2);
    ctx.fill();

    const hg = hctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
    hg.addColorStop(0, '#dcdcdc');
    hg.addColorStop(1, '#444444');
    hctx.fillStyle = hg;
    hctx.beginPath();
    hctx.ellipse(cx, cy, rx, ry, ang, 0, Math.PI * 2);
    hctx.fill();

    rctx.fillStyle = '#a2a2a2';
    rctx.beginPath();
    rctx.ellipse(cx, cy, rx, ry, ang, 0, Math.PI * 2);
    rctx.fill();
  }

  const normalCanvas = heightCanvasToNormalCanvas(h, 2.7);
  return {
    map: createTexture(c, aniso, true, 8, 8),
    normal: createTexture(normalCanvas, aniso, false, 8, 8),
    roughness: createTexture(r, aniso, false, 8, 8),
  };
}

/**
 * 6. Century-Seasoned Cedar & Fir Structural Timber (包浆老杉木柱梁门板)
 * Rich dark oil-smoke patina, vertical drying checks/cracks, silvered weathered streaks,
 * and faint damp moss along lower splash edge.
 */
function makeTimberMaps(aniso: number) {
  const S = 512;
  const rand = mulberry32(606);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);
  const [r, rctx] = makeCanvas(S, S);

  ctx.fillStyle = '#402a1b';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#bcbbbb';
  rctx.fillRect(0, 0, S, S);

  // Fine vertical weathered cedar grain fibers with occasional sun-silvered streaks
  for (let x = 0; x < S; x += 2) {
    const wave = Math.sin(x * 0.14) * 11 + Math.cos(x * 0.37) * 7 + (rand() - 0.5) * 10;
    const silverStreak = rand() < 0.08 ? 22 : 0;
    const R = Math.max(28, Math.min(118, Math.round(64 + wave + silverStreak * 0.85)));
    const G = Math.max(20, Math.min(92, Math.round(43 + wave * 0.65 + silverStreak * 0.8)));
    const B = Math.max(14, Math.min(72, Math.round(28 + wave * 0.45 + silverStreak * 0.72)));
    ctx.fillStyle = `rgb(${R},${G},${B})`;
    ctx.fillRect(x, 0, 2, S);

    const hv = Math.max(32, Math.min(226, Math.round(128 + wave * 3.6)));
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.fillRect(x, 0, 2, S);

    const rv = Math.max(118, Math.min(234, Math.round(174 - wave * 1.8)));
    rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rctx.fillRect(x, 0, 2, S);
  }

  // Deep vertical plank seams & age drying splits (老木干裂纹)
  for (let px = 0; px < S; px += 128) {
    ctx.fillStyle = 'rgba(14,8,4,0.68)';
    ctx.fillRect(px, 0, 3.5, S);
    hctx.fillStyle = '#121212';
    hctx.fillRect(px, 0, 3.5, S);
  }
  for (let k = 0; k < 28; k++) {
    const cx = rand() * S;
    const cy = rand() * S;
    const len = 35 + rand() * 140;
    ctx.fillStyle = 'rgba(16,10,6,0.58)';
    ctx.fillRect(cx, cy, 1.8, len);
    hctx.fillStyle = '#141414';
    hctx.fillRect(cx, cy, 2, len);
  }

  // Subtle weathered smoke-darkening & faint damp moss near lower timber rail
  const baseGrad = ctx.createLinearGradient(0, S * 0.72, 0, S);
  baseGrad.addColorStop(0, 'rgba(38,44,24,0)');
  baseGrad.addColorStop(1, 'rgba(38,46,24,0.44)');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, S * 0.72, S, S * 0.28);

  const normalCanvas = heightCanvasToNormalCanvas(h, 3.0);
  return {
    map: createTexture(c, aniso, true, 1, 2),
    normal: createTexture(normalCanvas, aniso, false, 1, 2),
    roughness: createTexture(r, aniso, false, 1, 2),
  };
}

/**
 * 7. Rammed Earth Layers (夯土墙)
 */
function makeRammedEarthMaps(aniso: number) {
  const S = 512;
  const rand = mulberry32(707);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);

  const layers = ['#b48e64', '#a37d54', '#c19c73', '#99744c', '#b79168', '#a6825b'];
  for (let y = 0; y < S; y += 24) {
    ctx.fillStyle = layers[(y / 24) % layers.length];
    ctx.fillRect(0, y, S, 24);
    ctx.fillStyle = 'rgba(66,44,24,0.28)';
    ctx.fillRect(0, y + 21, S, 3);

    hctx.fillStyle = '#929292';
    hctx.fillRect(0, y, S, 24);
    hctx.fillStyle = '#484848';
    hctx.fillRect(0, y + 21, S, 3);
  }

  for (let i = 0; i < 2400; i++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(74,52,30,0.2)' : 'rgba(232,208,172,0.16)';
    ctx.fillRect(x, y, 4, 2);
    hctx.fillStyle = rand() > 0.5 ? '#b4b4b4' : '#585858';
    hctx.fillRect(x, y, 4, 2);
  }

  const normalCanvas = heightCanvasToNormalCanvas(h, 2.8);
  return {
    map: createTexture(c, aniso, true, 2, 2),
    normal: createTexture(normalCanvas, aniso, false, 2, 2),
  };
}

/**
 * 8. Traditional Dark-Wood Mullioned Window Lattice (客家格窗)
 */
function makeWindowLatticeMap(aniso: number): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  // Deep cool-shadowed interior window glass/void
  ctx.fillStyle = '#1b2025';
  ctx.fillRect(0, 0, S, S);
  // Subtle interior reflection sheen
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(92,118,136,0.26)');
  g.addColorStop(0.5, 'rgba(30,36,42,0.08)');
  g.addColorStop(1, 'rgba(18,22,26,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // Outer dark wooden frame & vertical security bars / mullions
  ctx.strokeStyle = '#3c291d';
  ctx.lineWidth = 22;
  ctx.strokeRect(11, 11, S - 22, S - 22);

  ctx.fillStyle = '#473021';
  // Vertical wooden bars (authentic Hakka 防盗木棂)
  for (let i = 1; i <= 4; i++) {
    ctx.fillRect((S / 5) * i - 5, 16, 10, S - 32);
  }
  // Horizontal middle muntin bar
  ctx.fillRect(16, S * 0.48, S - 32, 12);

  const tex = createTexture(c, aniso, true, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * 9. Sun-Faded Weathered Red Paper Spring Couplet Strip (风化褪色客家春联)
 */
function makeCoupletMap(aniso: number): THREE.CanvasTexture {
  const rand = mulberry32(691);
  const [c, ctx] = makeCanvas(64, 256);
  // Slightly sun-bleached vermilion paper gradient
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#9e3328');
  g.addColorStop(0.5, '#b23d2f');
  g.addColorStop(1, '#8d2d22');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  // Subtle sun-fade & rain mottling
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(218,162,126,0.16)' : 'rgba(58,20,14,0.14)';
    ctx.beginPath();
    ctx.arc(rand() * 64, rand() * 256, 4 + rand() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(208,168,84,0.72)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(5, 5, 54, 246);
  ctx.fillStyle = '#221a16';
  ctx.font = 'bold 28px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = ['耕', '讀', '傳', '家', '世', '澤', '長'];
  chars.forEach((ch, idx) => {
    ctx.fillText(ch, 32, 26 + idx * 33);
  });
  const tex = createTexture(c, aniso, true, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeGrainMap(aniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#d4a33b';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = 'rgba(155,108,24,0.28)';
    ctx.fillRect(0, y, 256, 4);
  }
  for (let i = 0; i < 1600; i++) {
    const x = (i * 43) % 256;
    const y = (i * 83) % 256;
    ctx.fillStyle = i % 3 === 0 ? '#f0c85c' : i % 3 === 1 ? '#b88524' : '#e4b748';
    ctx.fillRect(x, y, 4, 2);
  }
  return createTexture(c, aniso, true, 3, 2);
}

function makePlaqueMaterial(
  aniso: number,
  text: string,
  subtext: string,
  bgColor: string,
  textColor: string,
  borderColor: string
): THREE.MeshStandardMaterial {
  const rand = mulberry32(711 + text.charCodeAt(0));
  const [c, ctx] = makeCanvas(512, 192);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 192);

  // Subtle century-old lacquer patina, dust in corners & fine horizontal wood grain checks
  for (let i = 0; i < 65; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(90,74,52,0.12)' : 'rgba(18,14,10,0.14)';
    ctx.fillRect(rand() * 512, rand() * 192, 18 + rand() * 70, 2 + rand() * 5);
  }
  const dustGrad = ctx.createLinearGradient(0, 0, 0, 48);
  dustGrad.addColorStop(0, 'rgba(138,128,108,0.28)');
  dustGrad.addColorStop(1, 'rgba(138,128,108,0)');
  ctx.fillStyle = dustGrad;
  ctx.fillRect(0, 0, 512, 48);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, 488, 168);
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 464, 144);

  ctx.fillStyle = textColor;
  ctx.font = 'bold 84px "Noto Serif SC", "STSong", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 92);

  if (subtext) {
    ctx.font = '24px "Noto Serif SC", serif';
    ctx.fillStyle = borderColor;
    ctx.fillText(subtext, 256, 148);
  }

  // Faint age wear flecks across gilded lettering
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = 'rgba(34,26,18,0.24)';
    ctx.fillRect(60 + rand() * 392, 36 + rand() * 116, 2 + rand() * 4, 1.5);
  }

  const tex = createTexture(c, aniso, true, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.46,
    metalness: 0.22,
  });
}

/**
 * 10. Procedural Lingnan Sky Domes (Azure Sunny Day matching the photo, Misty Rain, Starry Night)
 */
function makeSkyDomeTexture(
  mode: 'sunny' | 'rain' | 'night',
  aniso: number
): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const rand = mulberry32(mode === 'sunny' ? 901 : mode === 'rain' ? 902 : 903);
  const [c, ctx] = makeCanvas(W, H);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (mode === 'sunny') {
    // Vibrant clear Lingnan azure sky matching /public/assets/aistudio/image_2a7cd311.png
    grad.addColorStop(0.0, '#0c68c2');
    grad.addColorStop(0.24, '#1b86dc');
    grad.addColorStop(0.42, '#5cb2ec');
    grad.addColorStop(0.51, '#b7dcf2');
    grad.addColorStop(0.56, '#d9e8ef');
    grad.addColorStop(1.0, '#7c8b78');
  } else if (mode === 'rain') {
    grad.addColorStop(0.0, '#5a6e7e');
    grad.addColorStop(0.35, '#7c909e');
    grad.addColorStop(0.52, '#a7b6c0');
    grad.addColorStop(1.0, '#5d6864');
  } else {
    grad.addColorStop(0.0, '#070c19');
    grad.addColorStop(0.38, '#101b33');
    grad.addColorStop(0.52, '#1b2944');
    grad.addColorStop(1.0, '#0e131c');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (mode === 'sunny') {
    // Wispy diagonal white cirrus cloud streaks in upper sky (matching photo's upper-right cloud!)
    for (let i = 0; i < 42; i++) {
      const cx = rand() * W;
      const cy = 55 + rand() * 145;
      const rx = 40 + rand() * 120;
      const ry = 6 + rand() * 18;
      const cg = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
      cg.addColorStop(0, 'rgba(255,255,255,0.42)');
      cg.addColorStop(0.55, 'rgba(242,249,255,0.18)');
      cg.addColorStop(1, 'rgba(242,249,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, -0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mode === 'night') {
    // Crisp starfield
    for (let i = 0; i < 360; i++) {
      const sx = rand() * W;
      const sy = rand() * (H * 0.46);
      const sz = rand() < 0.15 ? 2 : 1.2;
      ctx.fillStyle = `rgba(240,245,255,${0.4 + rand() * 0.6})`;
      ctx.fillRect(sx, sy, sz, sz);
    }
  }

  const tex = createTexture(c, aniso, true, 1, 1);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeContactShadowMaterial(): THREE.MeshBasicMaterial {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(12, 10, 8, 0.56)');
  g.addColorStop(0.6, 'rgba(12, 10, 8, 0.22)');
  g.addColorStop(1, 'rgba(12, 10, 8, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
}

function makeFoliageMaps(aniso: number) {
  const S = 256;
  const rand = mulberry32(818);
  const [c, ctx] = makeCanvas(S, S);
  const [h, hctx] = makeCanvas(S, S);

  ctx.fillStyle = '#24471c';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#404040';
  hctx.fillRect(0, 0, S, S);

  const leafShades = ['#1f3f18', '#2d5921', '#3b6d28', '#4c7f2e', '#639337', '#254a1c'];
  for (let i = 0; i < 1400; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const rx = 4 + rand() * 8;
    const ry = 2.5 + rand() * 5;
    const ang = rand() * Math.PI;
    ctx.fillStyle = leafShades[Math.floor(rand() * leafShades.length)];
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
    ctx.fill();

    const hv = Math.round(90 + rand() * 145);
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.beginPath();
    hctx.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
    hctx.fill();
  }
  const normalCanvas = heightCanvasToNormalCanvas(h, 3.2);
  return {
    map: createTexture(c, aniso, true, 2, 2),
    normal: createTexture(normalCanvas, aniso, false, 2, 2),
  };
}

function makeGrassDecalTexture(aniso: number): THREE.CanvasTexture {
  const S = 256;
  const rand = mulberry32(829);
  const [c, ctx] = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);

  // Soft feathered radial base
  const g = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
  g.addColorStop(0, 'rgba(92,108,58,0.52)');
  g.addColorStop(0.55, 'rgba(104,116,66,0.28)');
  g.addColorStop(1, 'rgba(104,116,66,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // Organic scattered grass blades & dry straw flecks
  for (let i = 0; i < 420; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 112;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r;
    const alpha = Math.max(0.08, 0.55 * (1 - r / 120));
    ctx.fillStyle =
      rand() > 0.35
        ? `rgba(74,98,42,${alpha})`
        : `rgba(138,128,74,${alpha})`;
    ctx.fillRect(x, y, 2 + rand() * 5, 2 + rand() * 3);
  }
  const tex = createTexture(c, aniso, true, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * 11. Feathered Deep Velvet Moss & Damp Lichen Patch Decal (建筑墙角/石阶/天井青苔贴片)
 */
function makeMossDecalTexture(aniso: number): THREE.CanvasTexture {
  const S = 256;
  const rand = mulberry32(842);
  const [c, ctx] = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);

  // Dark damp moisture stain halo underneath the moss colony
  const halo = ctx.createRadialGradient(128, 128, 14, 128, 128, 122);
  halo.addColorStop(0, 'rgba(38,52,24,0.72)');
  halo.addColorStop(0.55, 'rgba(48,64,28,0.42)');
  halo.addColorStop(1, 'rgba(48,64,28,0.0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);

  // Clustered spongy moss cushions (deep forest-olive, damp emerald, and golden-green lichen tips)
  const palette = [
    [46, 68, 28],
    [62, 86, 34],
    [36, 52, 22],
    [82, 102, 42],
    [98, 110, 56],
  ];
  for (let i = 0; i < 680; i++) {
    const a = rand() * Math.PI * 2;
    const dist = Math.pow(rand(), 0.72) * 108;
    const x = 128 + Math.cos(a) * dist + (rand() - 0.5) * 14;
    const y = 128 + Math.sin(a) * dist + (rand() - 0.5) * 14;
    const falloff = Math.max(0.05, 1 - dist / 118);
    const [r, g, b] = palette[Math.floor(rand() * palette.length)];
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.28 + rand() * 0.52) * falloff})`;
    const rx = 2.5 + rand() * 7.5;
    const ry = 2.0 + rand() * 6.0;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = createTexture(c, aniso, true, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createMaterialLibrary(renderer: THREE.WebGLRenderer): MaterialLibrary {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.Texture[] = [];

  const lime = makeLimeWallMaps(aniso);
  const ridge = makeLimeRidgeMaps(aniso);
  const earth = makeRammedEarthMaps(aniso);
  const roof = makeRoofTileMaps(aniso);
  const granite = makeGraniteMaps(aniso, false);
  const plinth = makeGraniteMaps(aniso, true);
  const heping = makeCourtyardHePingMaps(aniso);
  const cobble = makeHuataiCobbleMaps(aniso);
  const timber = makeTimberMaps(aniso);
  const winTex = makeWindowLatticeMap(aniso);
  const coupletTex = makeCoupletMap(aniso);
  const grain = makeGrainMap(aniso);
  const foliage = makeFoliageMaps(aniso);
  const grassDecalTex = makeGrassDecalTexture(aniso);
  const mossDecalTex = makeMossDecalTexture(aniso);
  const skySunnyTex = makeSkyDomeTexture('sunny', aniso);
  const skyRainTex = makeSkyDomeTexture('rain', aniso);
  const skyNightTex = makeSkyDomeTexture('night', aniso);

  textures.push(
    lime.map,
    lime.normal,
    lime.roughness,
    ridge.map,
    ridge.normal,
    earth.map,
    earth.normal,
    roof.map,
    roof.normal,
    roof.roughness,
    granite.map,
    granite.normal,
    granite.roughness,
    plinth.map,
    plinth.normal,
    plinth.roughness,
    heping.map,
    heping.normal,
    heping.roughness,
    cobble.map,
    cobble.normal,
    cobble.roughness,
    timber.map,
    timber.normal,
    timber.roughness,
    winTex,
    coupletTex,
    grain,
    foliage.map,
    foliage.normal,
    grassDecalTex,
    mossDecalTex,
    skySunnyTex,
    skyRainTex,
    skyNightTex
  );

  const limeWall = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: lime.map,
    normalMap: lime.normal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: lime.roughness,
    roughness: 0.94,
    metalness: 0.01,
  });

  const limeWallInterior = new THREE.MeshStandardMaterial({
    color: 0xe2dbcc,
    map: lime.map,
    normalMap: lime.normal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.92,
    metalness: 0.01,
  });

  const limeRidge = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ridge.map,
    normalMap: ridge.normal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.92,
    metalness: 0.02,
  });

  const rammedEarth = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: earth.map,
    normalMap: earth.normal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.95,
    metalness: 0.01,
  });

  const rammedEarthXray = new THREE.MeshStandardMaterial({
    color: 0xc59a6d,
    map: earth.map,
    normalMap: earth.normal,
    roughness: 0.86,
    metalness: 0.03,
    transparent: true,
    opacity: 1.0,
  });

  const roofTile = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: roof.map,
    normalMap: roof.normal,
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughnessMap: roof.roughness,
    roughness: 0.86,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const roofTileDark = new THREE.MeshStandardMaterial({
    color: 0x525857,
    normalMap: roof.normal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.84,
    metalness: 0.05,
  });

  const graniteSlab = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: granite.map,
    normalMap: granite.normal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: granite.roughness,
    roughness: 0.86,
    metalness: 0.03,
  });

  const granitePlinth = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: plinth.map,
    normalMap: plinth.normal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: plinth.roughness,
    roughness: 0.9,
    metalness: 0.02,
  });

  const courtyardEarth = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: heping.map,
    normalMap: heping.normal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: heping.roughness,
    roughness: 0.94,
    metalness: 0.01,
  });

  const huataiCobble = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: cobble.map,
    normalMap: cobble.normal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: cobble.roughness,
    roughness: 0.88,
    metalness: 0.02,
  });

  const darkTimber = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: timber.map,
    normalMap: timber.normal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: timber.roughness,
    roughness: 0.74,
    metalness: 0.03,
  });

  const weatheredWoodDoor = new THREE.MeshStandardMaterial({
    color: 0xd8cec2,
    map: timber.map,
    normalMap: timber.normal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: timber.roughness,
    roughness: 0.8,
    metalness: 0.03,
  });

  const windowLattice = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: winTex,
    roughness: 0.48,
    metalness: 0.1,
  });

  const redCouplet = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: coupletTex,
    roughness: 0.82,
    metalness: 0.02,
  });

  const redLacquer = new THREE.MeshStandardMaterial({
    color: 0x7b2119,
    roughness: 0.44,
    metalness: 0.06,
  });

  const gildedGold = new THREE.MeshStandardMaterial({
    color: 0xc8983c,
    roughness: 0.34,
    metalness: 0.78,
  });

  const bronzeMetal = new THREE.MeshStandardMaterial({
    color: 0x77623e,
    roughness: 0.42,
    metalness: 0.72,
  });

  const goldenGrain = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grain,
    roughness: 0.88,
    metalness: 0.02,
  });

  const indigoCloth = new THREE.MeshStandardMaterial({
    color: 0x264166,
    roughness: 0.85,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const terracotta = new THREE.MeshStandardMaterial({
    color: 0x8b4c34,
    roughness: 0.78,
    metalness: 0.03,
  });

  const bambooGreen = new THREE.MeshStandardMaterial({
    color: 0x4f7e34,
    roughness: 0.56,
    metalness: 0.03,
  });

  const foliageDeep = new THREE.MeshStandardMaterial({
    color: 0x7ba368,
    map: foliage.map,
    normalMap: foliage.normal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.86,
    metalness: 0.01,
  });

  const foliageMid = new THREE.MeshStandardMaterial({
    color: 0x9ec27a,
    map: foliage.map,
    normalMap: foliage.normal,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughness: 0.82,
    metalness: 0.01,
  });

  const foliageBright = new THREE.MeshStandardMaterial({
    color: 0xbcd482,
    map: foliage.map,
    normalMap: foliage.normal,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.78,
    metalness: 0.01,
  });

  const grassDecal = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grassDecalTex,
    transparent: true,
    depthWrite: false,
    roughness: 0.94,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const mossDecal = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: mossDecalTex,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    roughness: 0.96,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -1,
  });

  const forestGround = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    normalMap: earth.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.95,
    metalness: 0.0,
  });

  const lanternPaper = new THREE.MeshStandardMaterial({
    color: 0xc93829,
    emissive: 0xff6224,
    emissiveIntensity: 0.28,
    roughness: 0.62,
    metalness: 0.0,
  });

  const contactShadow = makeContactShadowMaterial();
  const plaqueLongxi = makePlaqueMaterial(aniso, '隴西世澤', '梅州客家雙圍龍屋', '#1c1815', '#d9ad48', '#9e762c');
  const plaqueGengdu = makePlaqueMaterial(aniso, '耕讀傳家', '家族私塾書房', '#e4d8bf', '#26201a', '#7c623d');
  const plaqueJiaxun = makePlaqueMaterial(aniso, '敦親睦族', '崇文重教 · 勤儉持家', '#221813', '#cfa042', '#825d25');

  const skySunny = new THREE.MeshBasicMaterial({ map: skySunnyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const skyRain = new THREE.MeshBasicMaterial({ map: skyRainTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const skyNight = new THREE.MeshBasicMaterial({ map: skyNightTex, side: THREE.BackSide, fog: false, depthWrite: false });

  // Attach world-space anti-tiling macro patina, moss & ground-contact AO shaders
  attachWorldPatinaShader(roofTile, {
    key: 'roof_tile',
    macroFreq: 0.11,
    macroStrength: 0.24,
    mossStrength: 0.22,
  });
  attachWorldPatinaShader(limeWall, {
    key: 'lime_wall',
    macroFreq: 0.16,
    macroStrength: 0.14,
    mossStrength: 0.12,
    groundAoHeight: 0.78,
    groundAoStrength: 0.34,
    eaveAoHeight: 3.15,
  });
  attachWorldPatinaShader(limeWallInterior, {
    key: 'lime_wall_int',
    macroFreq: 0.2,
    macroStrength: 0.12,
    mossStrength: 0.06,
    groundAoHeight: 0.62,
    groundAoStrength: 0.24,
  });
  attachWorldPatinaShader(limeRidge, {
    key: 'lime_ridge',
    macroFreq: 0.18,
    macroStrength: 0.18,
    mossStrength: 0.2,
  });
  attachWorldPatinaShader(graniteSlab, {
    key: 'granite_slab',
    macroFreq: 0.13,
    macroStrength: 0.22,
    mossStrength: 0.16,
  });
  attachWorldPatinaShader(granitePlinth, {
    key: 'granite_plinth',
    macroFreq: 0.22,
    macroStrength: 0.18,
    mossStrength: 0.24,
    groundAoHeight: 0.48,
    groundAoStrength: 0.34,
  });
  attachWorldPatinaShader(courtyardEarth, {
    key: 'heping_court',
    macroFreq: 0.075,
    macroStrength: 0.28,
    mossStrength: 0.16,
  });
  attachWorldPatinaShader(huataiCobble, {
    key: 'huatai_cobble',
    macroFreq: 0.12,
    macroStrength: 0.24,
    mossStrength: 0.2,
  });
  attachWorldPatinaShader(darkTimber, {
    key: 'dark_timber',
    macroFreq: 0.25,
    macroStrength: 0.14,
    mossStrength: 0.08,
    groundAoHeight: 0.55,
    groundAoStrength: 0.28,
  });
  attachValleyTerrainShader(forestGround);

  // Load real photographic 8K seamless PBR textures & derive crisp Sobel micro-relief normals on load!
  let isDisposed = false;
  const loader = new THREE.TextureLoader();

  const bindPhotoTexture = (
    url: string,
    normalStrength: number,
    bindings: Array<{
      mat: THREE.MeshStandardMaterial;
      repX: number;
      repY: number;
      normalScale: number;
      tint?: number;
    }>
  ) => {
    loader.load(
      url,
      (loaded) => {
        if (isDisposed) {
          loaded.dispose();
          return;
        }
        const img = loaded.image as HTMLImageElement;
        bindings.forEach((b, idx) => {
          const colorTex = idx === 0 ? loaded : loaded.clone();
          colorTex.colorSpace = THREE.SRGBColorSpace;
          colorTex.wrapS = THREE.RepeatWrapping;
          colorTex.wrapT = THREE.RepeatWrapping;
          colorTex.repeat.set(b.repX, b.repY);
          colorTex.anisotropy = aniso;
          colorTex.needsUpdate = true;

          const normTex = imageToSobelNormalTexture(img, aniso, normalStrength, b.repX, b.repY);
          textures.push(colorTex, normTex);

          b.mat.map = colorTex;
          b.mat.normalMap = normTex;
          b.mat.normalScale.set(b.normalScale, b.normalScale);
          if (b.tint !== undefined) {
            b.mat.color.setHex(b.tint);
          }
          b.mat.needsUpdate = true;
        });
      },
      undefined,
      () => {
        // Fallback procedural canvas maps already bound seamlessly
      }
    );
  };

  // 1. Real 150-year-old Meizhou Qing barrel roof tiles with velvety moss troughs
  bindPhotoTexture('/src/assets/images/tex_roof_tiles_1795759026648.jpg', 3.4, [
    { mat: roofTile, repX: 1, repY: 1, normalScale: 1.45, tint: 0xf4f5f3 },
  ]);

  // 2. Real weathered peeling Lingnan lime plaster walls with creeping bottom moss & eave drip streaks
  bindPhotoTexture('/src/assets/images/tex_lime_wall_1795759029567.jpg', 2.4, [
    { mat: limeWall, repX: 1, repY: 1, normalScale: 1.05, tint: 0xf6f3eb },
    { mat: limeWallInterior, repX: 1, repY: 1, normalScale: 0.72, tint: 0xe6dfd0 },
  ]);

  // 3. Real moss-seamed antique flagstone & weathered He-Ping courtyard paving
  bindPhotoTexture('/src/assets/images/tex_aged_concrete_1795759030054.jpg', 2.8, [
    { mat: courtyardEarth, repX: 16, repY: 4, normalScale: 0.95, tint: 0xa6a59e },
    { mat: graniteSlab, repX: 5, repY: 5, normalScale: 1.15, tint: 0xbcb9b0 },
    { mat: granitePlinth, repX: 4, repY: 0.85, normalScale: 1.25, tint: 0x949289 },
  ]);

  const materials: THREE.Material[] = [
    limeWall,
    limeWallInterior,
    limeRidge,
    rammedEarth,
    rammedEarthXray,
    roofTile,
    roofTileDark,
    graniteSlab,
    granitePlinth,
    courtyardEarth,
    huataiCobble,
    darkTimber,
    weatheredWoodDoor,
    windowLattice,
    redCouplet,
    redLacquer,
    gildedGold,
    bronzeMetal,
    goldenGrain,
    indigoCloth,
    terracotta,
    bambooGreen,
    foliageDeep,
    foliageMid,
    foliageBright,
    grassDecal,
    mossDecal,
    forestGround,
    lanternPaper,
    contactShadow,
    plaqueLongxi,
    plaqueGengdu,
    plaqueJiaxun,
    skySunny,
    skyRain,
    skyNight,
  ];

  return {
    limeWall,
    limeWallInterior,
    limeRidge,
    rammedEarth,
    rammedEarthXray,
    roofTile,
    roofTileDark,
    graniteSlab,
    granitePlinth,
    courtyardEarth,
    huataiCobble,
    darkTimber,
    weatheredWoodDoor,
    windowLattice,
    redCouplet,
    redLacquer,
    gildedGold,
    bronzeMetal,
    goldenGrain,
    indigoCloth,
    terracotta,
    bambooGreen,
    foliageDeep,
    foliageMid,
    foliageBright,
    grassDecal,
    mossDecal,
    forestGround,
    lanternPaper,
    contactShadow,
    plaqueLongxi,
    plaqueGengdu,
    plaqueJiaxun,
    skySunny,
    skyRain,
    skyNight,
    dispose: () => {
      isDisposed = true;
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
