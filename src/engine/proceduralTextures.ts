import * as THREE from 'three';

/**
 * Shared handcrafted mineral / gouache color system inspired by refindex.html ("The Tea Ride"),
 * fused with authentic Meizhou Hakka Weilongwu architectural pigments.
 */
export const HANDCRAFTED_PAL = {
  // Cerulean & Indigo mineral blues
  cer: 0x4f9fc8,
  cerDark: 0x2f7fb5,
  deepBlue: 0x2c70b2,
  navy: 0x1b3f66,
  ink: 0x1d2a44,
  // Warm washi creams, sandstone & honeyed woods
  white: 0xf7f4ec,
  cream: 0xfbf3e0,
  paper: 0xf3e7cf,
  tan: 0xe3c08f,
  stone: 0xd8c9a6,
  wood: 0xb3804f,
  brown: 0xa5644a,
  umber: 0x7d4a30,
  // Vivid folk & blossom accents
  verm: 0xd4552b,
  red: 0xd8402a,
  orange: 0xee9a35,
  lemon: 0xf4d03f,
  peach: 0xefb07c,
  pink: 0xf5b3b4,
  blossomLight: 0xfadcd6,
  blossomDeep: 0xee9aa0,
  lilac: 0xa99cc8,
  skin: 0xf3cfa8,
  cheek: 0xe88d7c,
  // Lush jade, willow & pond teals
  pine: 0x3b8668,
  leaf: 0x5d9c5c,
  sage: 0x9cba7c,
  willow: 0xa6cc64,
  willowBright: 0xc2d972,
  mint: 0xaed3be,
  teal: 0x52a6a2,
} as const;

export interface PhysicalEnvUniforms {
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uBounceColor: { value: THREE.Color };
  uSkyColor: { value: THREE.Color };
  uWetness: { value: number };
  uNightFactor: { value: number };
  uTime: { value: number };
}

/**
 * Shared real-time physical lighting & optical uniforms synchronized every frame/weather
 * across all PBR GI radiosity, subsurface scattering (SSS), wetness, and water shaders.
 */
export const physicalEnvUniforms: PhysicalEnvUniforms = {
  uSunDir: { value: new THREE.Vector3(0.60, 0.56, 0.57).normalize() },
  uSunColor: { value: new THREE.Color(0xfff0d2) },
  uBounceColor: { value: new THREE.Color(0xecc992) },
  uSkyColor: { value: new THREE.Color(0x88c8ec) },
  uWetness: { value: 0.0 },
  uNightFactor: { value: 0.0 },
  uTime: { value: 0.0 },
};

export interface MaterialLibrary {
  limeWall: THREE.MeshStandardMaterial;
  limeWallInterior: THREE.MeshStandardMaterial;
  limeRidge: THREE.MeshStandardMaterial;
  rammedEarth: THREE.MeshStandardMaterial;
  roofTile: THREE.MeshPhysicalMaterial;
  roofTileDark: THREE.MeshPhysicalMaterial;
  roofSheathing: THREE.MeshStandardMaterial;
  graniteSlab: THREE.MeshPhysicalMaterial;
  granitePlinth: THREE.MeshPhysicalMaterial;
  courtyardEarth: THREE.MeshPhysicalMaterial;
  huataiCobble: THREE.MeshPhysicalMaterial;
  darkTimber: THREE.MeshPhysicalMaterial;
  weatheredWoodDoor: THREE.MeshStandardMaterial;
  windowLattice: THREE.MeshPhysicalMaterial;
  redCouplet: THREE.MeshStandardMaterial;
  redLacquer: THREE.MeshPhysicalMaterial;
  gildedGold: THREE.MeshStandardMaterial;
  bronzeMetal: THREE.MeshStandardMaterial;
  goldenGrain: THREE.MeshStandardMaterial;
  indigoCloth: THREE.MeshPhysicalMaterial;
  terracotta: THREE.MeshPhysicalMaterial;
  bambooGreen: THREE.MeshStandardMaterial;
  foliageDeep: THREE.MeshStandardMaterial;
  foliageBright: THREE.MeshStandardMaterial;
  foliageMid: THREE.MeshStandardMaterial;
  foliageSprigDeep: THREE.MeshStandardMaterial;
  foliageSprigMid: THREE.MeshStandardMaterial;
  foliageSprigBright: THREE.MeshStandardMaterial;
  blossomSprig: THREE.MeshStandardMaterial;
  grassDecal: THREE.MeshStandardMaterial;
  mossDecal: THREE.MeshStandardMaterial;
  forestGround: THREE.MeshStandardMaterial;
  gardenSoil: THREE.MeshStandardMaterial;
  lanternPaper: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  plaqueLongxi: THREE.MeshStandardMaterial;
  plaqueGengdu: THREE.MeshStandardMaterial;
  plaqueJiaxun: THREE.MeshStandardMaterial;
  skySunny: THREE.MeshBasicMaterial;
  skyRain: THREE.MeshBasicMaterial;
  skyNight: THREE.MeshBasicMaterial;
  wettableMaterials: THREE.MeshPhysicalMaterial[];
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
  bounceReceive?: number;
  crimsonBleed?: number;
  wettable?: boolean;
  roofRunoff?: boolean;
}

export interface SubsurfaceOptions {
  key: string;
  /** RGB transmission/scatter tint (e.g. sunlit chartreuse for foliage, warm peach for skin/blossom) */
  tintHex: number;
  /** Backlit Henyey-Greenstein forward-scattering intensity */
  backStrength?: number;
  /** Broad wrap-diffuse translucency strength */
  wrapStrength?: number;
  /** Sharpness exponent of backlit transmission lobe */
  power?: number;
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
 * Injects physically-inspired Global Illumination (courtyard warm sandstone radiosity bounce,
 * vermilion gate/lantern color bleeding, turquoise pond caustic lift, multi-scale crevice AO),
 * handcrafted gouache brushwork, and rain-wetness porosity + puddle roughness modulation.
 */
function attachWorldPatinaShader(
  mat: THREE.MeshStandardMaterial,
  opts: WorldPatinaOptions
): void {
  const macroFreq = (opts.macroFreq ?? 0.13).toFixed(4);
  const macroStrength = (opts.macroStrength ?? 0.16).toFixed(4);
  const mossStrength = (opts.mossStrength ?? 0.12).toFixed(4);
  const groundAoHeight = (opts.groundAoHeight ?? 0.0).toFixed(4);
  const groundAoStrength = (opts.groundAoStrength ?? 0.22).toFixed(4);
  const eaveAoHeight = (opts.eaveAoHeight ?? 0.0).toFixed(4);
  const bounceReceive = (opts.bounceReceive ?? 0.24).toFixed(4);
  const crimsonBleed = (opts.crimsonBleed ?? 0.16).toFixed(4);
  const isWettable = opts.wettable ? '1.0' : '0.0';
  const hasRoofRunoff = opts.roofRunoff ? '1.0' : '0.0';

  mat.customProgramCacheKey = () => `handcrafted_patina_${opts.key}_gi_v4`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = physicalEnvUniforms.uSunDir;
    shader.uniforms.uSunColor = physicalEnvUniforms.uSunColor;
    shader.uniforms.uBounceColor = physicalEnvUniforms.uBounceColor;
    shader.uniforms.uSkyColor = physicalEnvUniforms.uSkyColor;
    shader.uniforms.uWetness = physicalEnvUniforms.uWetness;
    shader.uniforms.uNightFactor = physicalEnvUniforms.uNightFactor;
    shader.uniforms.uTime = physicalEnvUniforms.uTime;

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
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uBounceColor;
        uniform vec3 uSkyColor;
        uniform float uWetness;
        uniform float uNightFactor;
        uniform float uTime;
        varying vec3 vPatinaWorldPos;
        varying vec3 vPatinaWorldNormal;
        ${GLSL_PATINA_NOISE}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float patinaRoughMod = 0.0;
        float patinaWetPuddle = 0.0;
        float patinaRoofStream = 0.0;
        float patinaGroundRipple = 0.0;
        {
          vec2 wpXZ = vPatinaWorldPos.xz;
          vec3 wn = normalize(vPatinaWorldNormal);
          float nMacro = patinaFbm(wpXZ * ${macroFreq} + vec2(vPatinaWorldPos.y * 0.2, -vPatinaWorldPos.y * 0.15));
          // Long painterly brush streak + fine washi paper / stone mineral micro-grain
          float nBrush = patinaFbm(vec2(wpXZ.x * 0.55 + wpXZ.y * 0.25, vPatinaWorldPos.y * 1.85));
          float nGrain = patinaNoise(wpXZ * 4.6 + vec2(vPatinaWorldPos.y * 5.8, -vPatinaWorldPos.y * 3.1));
          patinaRoughMod = (nBrush - 0.5) * 0.14 + (nGrain - 0.5) * 0.07;

          // 1. Handcrafted gouache wash variation: warm sunlit cream vs soft cerulean shadow tint
          float toneShift = (nMacro - 0.5) * 1.65 * ${macroStrength};
          vec3 warmCool = mix(vec3(0.94, 0.97, 1.03), vec3(1.06, 1.01, 0.92), nBrush);
          float grainMod = 0.96 + 0.08 * nGrain;
          diffuseColor.rgb *= clamp(1.0 + toneShift, 0.80, 1.18) * warmCool * grainMod;

          // 2. Delicate mineral jade-sage moss kiss on shaded / northern edges
          float northBias = clamp(-wn.z * 0.22 + 0.48, 0.18, 0.80);
          float mossNoise = patinaFbm(wpXZ * 0.34 + vec2(vPatinaWorldPos.y * 0.55, 3.7));
          float mossMask = smoothstep(0.60, 0.86, mossNoise * 0.78 + northBias * 0.28) * ${mossStrength};
          vec3 jadeMoss = mix(vec3(0.18, 0.34, 0.22), vec3(0.32, 0.45, 0.24), nBrush);
          diffuseColor.rgb = mix(diffuseColor.rgb, jadeMoss, clamp(mossMask, 0.0, 0.42));

          // 3. Physical rain-wetness porosity darkening, calibrated exterior-only roof rivulets,
          //    and outdoor-only ground water-film sheen, drainage flow & impact ripples.
          if (${isWettable} > 0.5 && uWetness > 0.01 && gl_FrontFacing) {
            float upMask = smoothstep(0.28, 0.82, wn.y);

            if (${hasRoofRunoff} > 0.5) {
              // Strictly exterior upward roof slopes only (gl_FrontFacing + wn.y > 0.14)
              if (wn.y > 0.14) {
                float dampRoof = uWetness * (0.24 * upMask + 0.08);
                diffuseColor.rgb *= (1.0 - dampRoof * 0.24);
                // Project horizontal normal to determine tile groove & down-slope flow axes
                vec2 slopeDir = normalize(vec2(wn.x, wn.z) + vec2(0.0001, 0.0002));
                vec2 crossDir = vec2(-slopeDir.y, slopeDir.x);
                float across = dot(wpXZ, crossDir);
                float downSlope = dot(wpXZ, slopeDir);
                // Restrained, narrow barrel-tile valley rivulets proportional to rainfall
                float grooveWave = pow(0.5 + 0.5 * sin(across * 25.5), 6.5);
                float flowPulse1 = 0.5 + 0.5 * sin(downSlope * 7.2 - uTime * 4.8 + across * 2.4);
                float flowPulse2 = 0.5 + 0.5 * sin(downSlope * 12.5 - uTime * 7.6 - across * 4.1);
                float pulse = smoothstep(0.46, 0.94, flowPulse1 * 0.62 + flowPulse2 * 0.38);
                patinaRoofStream = grooveWave * pulse * pow(uWetness, 1.25) * smoothstep(0.14, 0.65, wn.y);
                // Delicate dark-wet specular glint along tile valleys (never brighter than falling rain)
                vec3 runoffGlint = mix(vec3(0.46, 0.58, 0.68), uSkyColor * 0.92, 0.45);
                diffuseColor.rgb = mix(diffuseColor.rgb, runoffGlint, clamp(patinaRoofStream * 0.13, 0.0, 0.14));
              }
            } else {
              // Analytical open-sky mask so indoor hall floors stay dry while skywells & courtyards get wet & drain
              float ax = abs(wpXZ.x);
              float wz = wpXZ.y;
              float covered = 0.0;
              if (ax < 20.1 && wz > 16.0 && wz < 22.3) covered = 1.0;
              else if (ax < 10.7 && wz > 4.6 && wz < 11.3) covered = 1.0;
              else if (ax < 12.7 && wz > -6.6 && wz < 1.2) covered = 1.0;
              else if (ax > 4.95 && ax < 10.7 && wz > 10.6 && wz < 16.5) covered = 1.0;
              else if (ax > 5.05 && ax < 10.7 && wz > 0.1 && wz < 5.6) covered = 1.0;
              else if (ax > 10.4 && ax < 21.5 && wz > -6.2 && wz < 18.9) covered = 1.0;
              else if (wz < 9.9) {
                float dzOval = 9.65 - wz;
                float rIn = length(vec2(wpXZ.x / 23.5, dzOval / 32.5));
                float rOut = length(vec2(wpXZ.x / 31.2, dzOval / 37.8));
                if ((rIn > 0.89 && rIn < 1.12) || (rOut > 0.91 && rOut < 1.10)) covered = 1.0;
              }
              float openSky = 1.0 - covered;
              if (openSky > 0.5) {
                float puddleNoise = patinaFbm(wpXZ * 0.26 + vec2(3.1, -4.7));
                // Natural drainage pooling near Front/Rear Skywell gutters & down He-Ping slope toward pond
                float frontSkywell = (1.0 - smoothstep(3.8, 5.1, ax)) * (1.0 - smoothstep(2.0, 2.8, abs(wz - 13.6)));
                float rearSkywell = (1.0 - smoothstep(4.0, 5.2, ax)) * (1.0 - smoothstep(1.8, 2.6, abs(wz - 2.8)));
                float hepingSlope = smoothstep(22.4, 24.0, wz) * (1.0 - smoothstep(35.8, 37.2, wz));
                float drainBias = clamp(frontSkywell * 0.28 + rearSkywell * 0.28 + hepingSlope * 0.18, 0.0, 0.34);
                patinaWetPuddle = smoothstep(0.36, 0.68, puddleNoise + drainBias) * upMask;
                float dampAmount = uWetness * (0.34 * upMask + 0.48 * patinaWetPuddle + 0.10);
                diffuseColor.rgb *= (1.0 - dampAmount * 0.30);

                // Subtle downhill courtyard sheet-flow streaks draining toward skywell gutters & pond
                float flowCoord = hepingSlope > 0.2 ? wz * 2.4 - uTime * 1.9 : length(wpXZ - vec2(0.0, wz > 8.0 ? 13.6 : 2.8)) * 3.2 + uTime * 1.4;
                float sheetFlow = pow(0.5 + 0.5 * sin(flowCoord + puddleNoise * 5.0), 5.0) * patinaWetPuddle * upMask;
                diffuseColor.rgb = mix(diffuseColor.rgb, uSkyColor * 0.68 + vec3(0.10), clamp(sheetFlow * uWetness * 0.14, 0.0, 0.16));

                // Crisp raindrop impact rings on pooled outdoor stone & courtyard water film
                if (upMask > 0.55 && patinaWetPuddle > 0.18) {
                  vec2 rCell = floor(wpXZ * 1.95);
                  vec2 rF = fract(wpXZ * 1.95) - 0.5;
                  float rSeed = patinaHash(rCell);
                  float rPhase = fract(uTime * 1.25 + rSeed * 6.2831);
                  float rDist = abs(length(rF) - rPhase * 0.42);
                  float rRing = (1.0 - smoothstep(0.0, 0.042, rDist)) * (1.0 - rPhase) * step(0.35, rSeed);
                  patinaGroundRipple = rRing * patinaWetPuddle * uWetness;
                  diffuseColor.rgb += mix(vec3(0.28, 0.36, 0.42), uSkyColor * 0.55, 0.5) * patinaGroundRipple * 0.34;
                }
              }
            }
          }

          // 4. Warm earthy ground-contact AO along vertical bases
          if (${groundAoHeight} > 0.01) {
            float verticalness = 1.0 - abs(wn.y);
            float baseFactor = 1.0 - smoothstep(0.02, ${groundAoHeight}, vPatinaWorldPos.y);
            float irregularBase = baseFactor * (0.72 + 0.42 * nBrush) * verticalness;
            diffuseColor.rgb *= (1.0 - irregularBase * ${groundAoStrength});
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.35, 0.22), clamp(irregularBase * 0.22, 0.0, 0.26));
          }

          // 5. Crisp cool-indigo under-eave shadow band
          if (${eaveAoHeight} > 0.01) {
            float verticalness = 1.0 - abs(wn.y);
            float eaveBand = smoothstep(${eaveAoHeight} - 0.54, ${eaveAoHeight}, vPatinaWorldPos.y)
                           * (1.0 - smoothstep(${eaveAoHeight}, ${eaveAoHeight} + 0.22, vPatinaWorldPos.y));
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.76, 0.80, 0.88), eaveBand * verticalness * 0.72);
          }
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + patinaRoughMod, 0.12, 0.98);
        if (${isWettable} > 0.5 && uWetness > 0.01 && gl_FrontFacing) {
          if (${hasRoofRunoff} > 0.5) {
            float roofWetMix = clamp(uWetness * 0.42 + patinaRoofStream * 0.48, 0.0, 0.85);
            roughnessFactor = mix(roughnessFactor, 0.34, roofWetMix);
          } else {
            float rainSmooth = uWetness * (0.24 + 0.62 * patinaWetPuddle) + patinaGroundRipple * 0.3;
            roughnessFactor = mix(roughnessFactor, 0.09, clamp(rainSmooth, 0.0, 0.90));
          }
        }`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec3 wnGi = normalize(vPatinaWorldNormal);
          float hAtten = exp(-max(0.0, vPatinaWorldPos.y) * 0.22);
          // Pillar 1: Analytical multi-bounce warm sandstone courtyard radiosity on vertical & downward faces
          float groundFacing = clamp(-wnGi.y * 0.55 + 0.45, 0.0, 1.0);
          float sunVis = clamp(dot(wnGi, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0);
          // Shadowed faces receive stronger perceptual indirect bounce contrast
          float bounceWeight = ${bounceReceive} * hAtten * groundFacing * (1.0 - 0.28 * sunVis);
          vec3 giBounce = uBounceColor * bounceWeight * (1.0 - uNightFactor * 0.78);

          // Pillar 1: Physical Color Bleeding (色彩溢出)
          // (a) Vermilion recessed main gate & red couplets bleeding warm crimson onto nearby white lime walls
          float gateDist = length((vPatinaWorldPos - vec3(0.0, 2.2, 20.8)) * vec3(0.24, 0.42, 0.34));
          float gateBleed = exp(-gateDist * gateDist) * ${crimsonBleed};
          giBounce += vec3(0.95, 0.28, 0.14) * gateBleed * (0.42 + 0.58 * uNightFactor);

          // (b) Warm golden-amber lantern glow bouncing onto interior hall walls & eaves at night
          if (uNightFactor > 0.02) {
            float hallGlow = exp(-length(vPatinaWorldPos.xz - vec2(0.0, 8.0)) * 0.055) * hAtten;
            giBounce += vec3(1.0, 0.52, 0.18) * hallGlow * uNightFactor * 0.26;
          }

          // (c) Turquoise-jade Half-Moon Pond water caustic bounce near the south bank
          float pondDist = length((vPatinaWorldPos.xz - vec2(0.0, 42.5)) * vec2(0.052, 0.085));
          float pondBounce = exp(-pondDist * pondDist) * hAtten * groundFacing * (1.0 - uNightFactor * 0.75);
          giBounce += vec3(0.22, 0.62, 0.64) * pondBounce * 0.14;

          reflectedLight.indirectDiffuse += diffuseColor.rgb * giBounce;
        }`
      );
  };
}

/**
 * Pillar 2: Physically-inspired Subsurface Scattering (SSS) shader hook for foliage,
 * blossoms, willow fronds, lotus petals, silk lanterns, and warm woodcarved villager skin.
 * Synchronized in real time with physicalEnvUniforms.uSunDir & uSunColor.
 */
export function attachSubsurfaceShader(
  mat: THREE.MeshStandardMaterial,
  opts: SubsurfaceOptions
): THREE.MeshStandardMaterial {
  const tint = new THREE.Color(opts.tintHex);
  const backStrength = (opts.backStrength ?? 0.58).toFixed(4);
  const wrapStrength = (opts.wrapStrength ?? 0.26).toFixed(4);
  const power = (opts.power ?? 2.6).toFixed(4);

  mat.customProgramCacheKey = () => `handcrafted_sss_${opts.key}_v1`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = physicalEnvUniforms.uSunDir;
    shader.uniforms.uSunColor = physicalEnvUniforms.uSunColor;
    shader.uniforms.uNightFactor = physicalEnvUniforms.uNightFactor;
    shader.uniforms.uSssTint = { value: tint };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSssWorldPos;
        varying vec3 vSssWorldNormal;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 sssWp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          sssWp = instanceMatrix * sssWp;
        #endif
        sssWp = modelMatrix * sssWp;
        vSssWorldPos = sssWp.xyz;
        vec3 sssWn = objectNormal;
        #ifdef USE_INSTANCING
          sssWn = mat3( instanceMatrix ) * sssWn;
        #endif
        vSssWorldNormal = normalize( mat3( modelMatrix ) * sssWn );`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uNightFactor;
        uniform vec3 uSssTint;
        varying vec3 vSssWorldPos;
        varying vec3 vSssWorldNormal;`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec3 V = normalize(cameraPosition - vSssWorldPos);
          vec3 N = normalize(vSssWorldNormal);
          vec3 L = normalize(uSunDir);
          // View-dependent backlit Henyey-Greenstein approximation (light distorted through thin leaf/petal/skin)
          vec3 H_sss = normalize(L + N * 0.42);
          float backScatter = pow(clamp(dot(V, -H_sss), 0.0, 1.0), ${power}) * ${backStrength};
          // Soft wrap-around diffuse scattering so shaded silhouettes stay luminous & organic
          float wrapScatter = clamp((dot(N, L) + 0.55) / 1.55, 0.0, 1.0) * ${wrapStrength};
          // Subtle rim translucency at grazing angles
          float rimScatter = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.4) * 0.16;
          float dayAtten = 1.0 - uNightFactor * 0.72;
          vec3 sssLight = uSunColor * uSssTint * (backScatter + wrapScatter + rimScatter) * dayAtten;
          reflectedLight.directDiffuse += diffuseColor.rgb * sssLight;
        }`
      );
  };
  return mat;
}

let cachedWoodcarveMaps: {
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} | null = null;

/**
 * Pillar 3: Shared procedural handcrafted woodcarving chisel & mineral-paint micro-relief maps.
 * Eliminates flat plastic/CG uniformity on woodcarved villagers, animals, blossoms, and props.
 */
export function getWoodcarveMicroMaps(): {
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  if (cachedWoodcarveMaps) return cachedWoodcarveMaps;
  const S = 128;
  const rand = mulberry32(9917);
  const [hCanvas, hCtx] = makeCanvas(S, S);
  const [rCanvas, rCtx] = makeCanvas(S, S);

  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, S, S);
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, S, S);

  // Subtle carved wood grain fibers + hand-painted gouache brush micro-strokes
  for (let y = 0; y < S; y++) {
    const wave = Math.sin((y / S) * Math.PI * 10.0) * 6;
    const shade = Math.round(122 + wave + (rand() - 0.5) * 18);
    hCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    hCtx.fillRect(0, y, S, 1);

    const rShade = Math.round(192 + wave * 1.4 + (rand() - 0.5) * 24);
    rCtx.fillStyle = `rgb(${rShade},${rShade},${rShade})`;
    rCtx.fillRect(0, y, S, 1);
  }
  // Fine chisel facets & hand-rubbed wax variations
  for (let i = 0; i < 220; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const w = 8 + rand() * 24;
    const h = 2 + rand() * 5;
    const v = Math.round(112 + rand() * 34);
    hCtx.fillStyle = `rgba(${v},${v},${v},0.32)`;
    hCtx.fillRect(x, y, w, h);

    const rv = Math.round(165 + rand() * 70);
    rCtx.fillStyle = `rgba(${rv},${rv},${rv},0.28)`;
    rCtx.fillRect(x, y, w, h);
  }

  const nCanvas = heightCanvasToNormalCanvas(hCanvas, 1.35);
  const normal = createTexture(nCanvas, 4, false, 2, 2);
  const roughness = createTexture(rCanvas, 4, false, 2, 2);
  cachedWoodcarveMaps = { normal, roughness };
  return cachedWoodcarveMaps;
}

/**
 * Poetic pastoral mineral-pigment valley terrain shader (inspired by refindex.html's 60_land.js):
 * blends jade woodland, sunlit sage tea terraces, warm golden harvest patches, and cream-ochre village tracks.
 */
function attachValleyTerrainShader(mat: THREE.MeshStandardMaterial): void {
  mat.customProgramCacheKey = () => 'handcrafted_valley_terrain_v2';
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
          float nLarge = patinaFbm(p * 0.016);
          float nMed = patinaFbm(p * 0.055 + vec2(14.2, -9.1));
          float nBrush = patinaFbm(vec2(p.x * 0.14 + p.y * 0.08, p.y * 0.22));
          float nFine = patinaNoise(p * 0.65);

          // Luminous linear-space pastoral mineral greens & warm golden fields (refindex.html harmony)
          vec3 pineJade = vec3(0.068, 0.175, 0.112);
          vec3 sageMeadow = vec3(0.165, 0.295, 0.125);
          vec3 teaChartreuse = vec3(0.325, 0.365, 0.135);
          vec3 warmStraw = vec3(0.45, 0.36, 0.155);
          vec3 creamTrack = vec3(0.46, 0.37, 0.23);

          vec3 col = mix(pineJade, sageMeadow, smoothstep(0.24, 0.68, nMed));
          col = mix(col, teaChartreuse, smoothstep(0.42, 0.78, nLarge) * 0.72);
          col = mix(col, warmStraw, smoothstep(0.64, 0.88, nLarge * 0.7 + nBrush * 0.3) * 0.55);

          // Winding warm sandy-cream village footpaths
          float pathField = patinaFbm(p * 0.028 + vec2(nLarge * 2.0, -nMed * 1.8));
          float trackMask = 1.0 - smoothstep(0.47, 0.52, abs(pathField - 0.5) * 10.0);
          col = mix(col, creamTrack, clamp(trackMask * 0.52, 0.0, 0.52));

          // Subtle gouache brushwork texture
          col *= (0.88 + 0.24 * nBrush) * (0.94 + 0.12 * nFine);
          diffuseColor.rgb = col;
        }`
      );
  };
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

  // Warm sunlit washi-ivory lime plaster base (clean handcrafted woodblock warmth!)
  ctx.fillStyle = '#f2ece0';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#8e8e8e';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#dcdcdc';
  rctx.fillRect(0, 0, S, S);

  // Soft hand-troweled gouache plaster clouds & warm mineral variation
  for (let i = 0; i < 420; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const rad = 16 + rand() * 48;
    const roll = rand();
    if (roll < 0.45) ctx.fillStyle = 'rgba(252,248,238,0.22)';
    else if (roll < 0.80) ctx.fillStyle = 'rgba(222,211,192,0.16)';
    else ctx.fillStyle = 'rgba(204,191,170,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    hctx.fillStyle = roll < 0.5 ? 'rgba(154,154,154,0.18)' : 'rgba(112,112,112,0.18)';
    hctx.beginPath();
    hctx.arc(x, y, rad * 0.85, 0, Math.PI * 2);
    hctx.fill();
  }

  // Delicate warm-taupe under-eave wash (soft painterly shadow, never dirty algae streaks)
  for (let i = 0; i < 42; i++) {
    const x = rand() * S;
    const w = 6 + rand() * 22;
    const len = 36 + rand() * 110;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(166,154,136,0.22)');
    g.addColorStop(0.55, 'rgba(182,172,154,0.08)');
    g.addColorStop(1, 'rgba(182,172,154,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, len);
  }

  // Subtle artisanal hand-plaster freckles & faint hairline texture
  for (let i = 0; i < 12; i++) {
    const px = rand() * S;
    const py = S * (0.35 + rand() * 0.55);
    const rx = 6 + rand() * 14;
    const ry = 4 + rand() * 10;
    ctx.fillStyle = 'rgba(196,178,150,0.24)';
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, (rand() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();

    hctx.fillStyle = 'rgba(92,92,92,0.32)';
    hctx.beginPath();
    hctx.ellipse(px, py, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
    hctx.fill();
  }

  // Very gentle warm sandstone dust transition along lowest 14% above granite plinth (zero green sludge!)
  const dampGrad = ctx.createLinearGradient(0, S * 0.82, 0, S);
  dampGrad.addColorStop(0, 'rgba(186,170,144,0.0)');
  dampGrad.addColorStop(0.65, 'rgba(172,156,130,0.20)');
  dampGrad.addColorStop(1, 'rgba(148,134,110,0.34)');
  ctx.fillStyle = dampGrad;
  ctx.fillRect(0, S * 0.82, S, S * 0.18);

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

  // Sun-warmed cream sandstone / three-lime-earth courtyard base (eliminates dark vertical seams!)
  ctx.fillStyle = '#ddd0b8';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#8e8e8e';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#dcdcdc';
  rctx.fillRect(0, 0, S, S);

  // Soft sunlit warm-sand, limestone & subtle ochre brushwork clouds
  for (let i = 0; i < 320; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const rad = 18 + rand() * 68;
    const tone = rand();
    if (tone < 0.34) ctx.fillStyle = 'rgba(182,166,142,0.18)';
    else if (tone < 0.68) ctx.fillStyle = 'rgba(232,220,198,0.20)';
    else if (tone < 0.88) ctx.fillStyle = 'rgba(244,236,218,0.18)';
    else ctx.fillStyle = 'rgba(164,154,132,0.14)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    const rv = tone < 0.34 ? 'rgba(196,196,196,0.22)' : 'rgba(244,244,244,0.22)';
    rctx.fillStyle = rv;
    rctx.beginPath();
    rctx.arc(x, y, rad, 0, Math.PI * 2);
    rctx.fill();
  }

  // Fine staggered stone-flagged courtyard pattern (delicate warm joints, zero dark stripe!)
  const fRows = 8;
  const fCols = 4;
  const frh = S / fRows;
  const fcw = S / fCols;
  for (let r = 0; r < fRows; r++) {
    const xOff = (r % 2) * (fcw * 0.5);
    for (let cIdx = -1; cIdx <= fCols; cIdx++) {
      const fx = cIdx * fcw + xOff;
      const fy = r * frh;
      const shade = Math.round((rand() - 0.5) * 16);
      ctx.fillStyle = `rgba(${216 + shade},${202 + shade},${178 + shade},0.32)`;
      ctx.fillRect(fx + 2, fy + 2, fcw - 4, frh - 4);
      ctx.strokeStyle = 'rgba(154,142,122,0.34)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(fx + 1, fy + 1, fcw - 2, frh - 2);
      hctx.strokeStyle = '#686868';
      hctx.lineWidth = 2;
      hctx.strokeRect(fx + 1, fy + 1, fcw - 2, frh - 2);
    }
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

/**
 * High-detail alpha-cutout botanical leaf sprig texture (香樟/荔枝/茶树羽状枝叶)
 * with branching dark-bark twigs, pointed veined leaves, and airy transparency gaps
 * so canopies look layered, dappled, and natural instead of lumpy solid blobs.
 */
function makeLeafSprigTexture(
  aniso: number,
  palette: [string, string, string, string],
  seed: number
): THREE.CanvasTexture {
  const S = 512;
  const rand = mulberry32(seed);
  const [c, ctx] = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);

  const drawPointedLeaf = (
    x: number,
    y: number,
    len: number,
    wid: number,
    ang: number,
    fillColor: string,
    highlightColor: string
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.25, -wid, len * 0.72, -wid * 0.85, len, 0);
    ctx.bezierCurveTo(len * 0.72, wid * 0.85, len * 0.25, wid, 0, 0);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, -wid * 0.5, len, wid * 0.5);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(0.65, highlightColor);
    grad.addColorStop(1, fillColor);
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle sunlit midrib & lateral veins
    ctx.strokeStyle = 'rgba(235, 248, 195, 0.34)';
    ctx.lineWidth = Math.max(1.2, wid * 0.08);
    ctx.beginPath();
    ctx.moveTo(len * 0.08, 0);
    ctx.lineTo(len * 0.86, 0);
    ctx.stroke();
    ctx.restore();
  };

  // Delicate forked twigs radiating from lower-center
  const branches: Array<{ x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; w: number }> = [
    { x0: 256, y0: 472, cx: 252, cy: 310, x1: 258, y1: 86, w: 6.5 },
    { x0: 254, y0: 365, cx: 185, cy: 312, x1: 106, y1: 224, w: 4.8 },
    { x0: 256, y0: 350, cx: 332, cy: 295, x1: 408, y1: 215, w: 4.8 },
    { x0: 255, y0: 252, cx: 196, cy: 198, x1: 128, y1: 132, w: 3.8 },
    { x0: 257, y0: 242, cx: 320, cy: 185, x1: 388, y1: 122, w: 3.8 },
    { x0: 256, y0: 405, cx: 192, cy: 392, x1: 122, y1: 344, w: 3.6 },
    { x0: 256, y0: 400, cx: 324, cy: 386, x1: 396, y1: 338, w: 3.6 },
  ];

  ctx.lineCap = 'round';
  for (const b of branches) {
    ctx.strokeStyle = '#5c4632';
    ctx.lineWidth = b.w;
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y0);
    ctx.quadraticCurveTo(b.cx, b.cy, b.x1, b.y1);
    ctx.stroke();

    // Populate paired & alternating leaves along each twig
    const steps = 6;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const omt = 1 - t;
      const px = omt * omt * b.x0 + 2 * omt * t * b.cx + t * t * b.x1;
      const py = omt * omt * b.y0 + 2 * omt * t * b.cy + t * t * b.y1;
      const tx = 2 * omt * (b.cx - b.x0) + 2 * t * (b.x1 - b.cx);
      const ty = 2 * omt * (b.cy - b.y0) + 2 * t * (b.y1 - b.cy);
      const baseAng = Math.atan2(ty, tx);

      for (const side of [-1, 1]) {
        const spread = side * (0.45 + rand() * 0.42) + (rand() - 0.5) * 0.24;
        const len = (54 + rand() * 34) * (1.06 - t * 0.24);
        const wid = len * (0.28 + rand() * 0.08);
        const c1 = palette[Math.floor(rand() * palette.length)];
        const c2 = palette[Math.min(palette.length - 1, Math.floor(rand() * palette.length))];
        drawPointedLeaf(px, py, len, wid, baseAng + spread, c1, c2);
      }
      if (s === steps) {
        const len = 50 + rand() * 22;
        drawPointedLeaf(px, py, len, len * 0.31, baseAng + (rand() - 0.5) * 0.2, palette[2], palette[3]);
      }
    }
  }

  // Extra scattered outer rosette leaves for natural feathery depth without filling gaps
  for (let i = 0; i < 18; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 60 + rand() * 140;
    const px = 256 + Math.cos(ang) * rad;
    const py = 248 + Math.sin(ang) * rad * 0.9;
    const len = 46 + rand() * 30;
    const c1 = palette[Math.floor(rand() * palette.length)];
    const c2 = palette[Math.floor(rand() * palette.length)];
    drawPointedLeaf(px, py, len, len * 0.3, ang + (rand() - 0.5) * 0.9, c1, c2);
  }

  const tex = createTexture(c, aniso, true, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Alpha-cutout flowering peach blossom sprig texture (岭南桃花枝) with 5-petal blossoms,
 * pink buds, golden stamens, and delicate sage leaf shoots on dark twigs.
 */
function makeBlossomSprigTexture(aniso: number): THREE.CanvasTexture {
  const S = 512;
  const rand = mulberry32(8421);
  const [c, ctx] = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);

  const twigs = [
    { x0: 256, y0: 470, cx: 248, cy: 300, x1: 266, y1: 88, w: 6 },
    { x0: 252, y0: 365, cx: 175, cy: 305, x1: 98, y1: 210, w: 4.5 },
    { x0: 256, y0: 345, cx: 335, cy: 280, x1: 412, y1: 196, w: 4.5 },
    { x0: 258, y0: 245, cx: 192, cy: 182, x1: 132, y1: 112, w: 3.6 },
    { x0: 260, y0: 235, cx: 330, cy: 172, x1: 392, y1: 112, w: 3.6 },
  ];

  ctx.lineCap = 'round';
  for (const b of twigs) {
    ctx.strokeStyle = '#5c3f33';
    ctx.lineWidth = b.w;
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y0);
    ctx.quadraticCurveTo(b.cx, b.cy, b.x1, b.y1);
    ctx.stroke();
  }

  // Fresh spring sage leaves tucked behind blossoms
  for (let i = 0; i < 24; i++) {
    const b = twigs[i % twigs.length];
    const t = 0.2 + rand() * 0.78;
    const omt = 1 - t;
    const px = omt * omt * b.x0 + 2 * omt * t * b.cx + t * t * b.x1 + (rand() - 0.5) * 32;
    const py = omt * omt * b.y0 + 2 * omt * t * b.cy + t * t * b.y1 + (rand() - 0.5) * 32;
    const ang = rand() * Math.PI * 2;
    const len = 36 + rand() * 24;
    const wid = len * 0.26;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = rand() > 0.5 ? '#6ba364' : '#8ec272';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.3, -wid, len * 0.7, -wid * 0.8, len, 0);
    ctx.bezierCurveTo(len * 0.7, wid * 0.8, len * 0.3, wid, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  // 5-petal peach blossoms clustered organically along twigs
  const drawFlower = (cx: number, cy: number, rad: number) => {
    const rot0 = rand() * Math.PI * 2;
    const petalColors = ['#fad8d4', '#f6b8bc', '#f29ea6', '#fce7df'];
    const pCol = petalColors[Math.floor(rand() * petalColors.length)];
    for (let p = 0; p < 5; p++) {
      const a = rot0 + (p / 5) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      const grad = ctx.createRadialGradient(rad * 0.2, 0, 1, rad * 0.65, 0, rad * 0.85);
      grad.addColorStop(0, '#e36f82');
      grad.addColorStop(0.45, pCol);
      grad.addColorStop(1, '#fff2ee');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(rad * 0.56, 0, rad * 0.54, rad * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Warm golden stamen heart
    ctx.fillStyle = '#e85d76';
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8d868';
    for (let s = 0; s < 5; s++) {
      const sa = rot0 + s * 1.25;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(sa) * rad * 0.16, cy + Math.sin(sa) * rad * 0.16, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  for (let i = 0; i < 42; i++) {
    const b = twigs[i % twigs.length];
    const t = 0.18 + rand() * 0.82;
    const omt = 1 - t;
    const px = omt * omt * b.x0 + 2 * omt * t * b.cx + t * t * b.x1 + (rand() - 0.5) * 66;
    const py = omt * omt * b.y0 + 2 * omt * t * b.cy + t * t * b.y1 + (rand() - 0.5) * 66;
    drawFlower(px, py, 16 + rand() * 16);
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
  const leafSprigDeepTex = makeLeafSprigTexture(aniso, ['#265c42', '#357452', '#448a5b', '#5da163'], 7101);
  const leafSprigMidTex = makeLeafSprigTexture(aniso, ['#3b7c54', '#509658', '#68ad5e', '#86c468'], 7202);
  const leafSprigBrightTex = makeLeafSprigTexture(aniso, ['#5c9e58', '#79b85e', '#9acc68', '#b8de74'], 7303);
  const blossomSprigTex = makeBlossomSprigTexture(aniso);
  const grassDecalTex = makeGrassDecalTexture(aniso);
  const mossDecalTex = makeMossDecalTexture(aniso);
  const skySunnyTex = makeSkyDomeTexture('sunny', aniso);
  const skyRainTex = makeSkyDomeTexture('rain', aniso);
  const skyNightTex = makeSkyDomeTexture('night', aniso);

  // Rich dark loamy humus soil for stone/terracotta tree & shrub planters
  const soilCanvas = (() => {
    const S = 256;
    const rand = mulberry32(9317);
    const [c, ctx] = makeCanvas(S, S);
    const [h, hctx] = makeCanvas(S, S);
    ctx.fillStyle = '#3b2b1e';
    ctx.fillRect(0, 0, S, S);
    hctx.fillStyle = '#707070';
    hctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const rad = 1.2 + rand() * 3.8;
      const shade = rand();
      ctx.fillStyle =
        shade < 0.34 ? '#2c1f15' : shade < 0.72 ? '#493524' : shade < 0.92 ? '#5d4530' : '#73604a';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      const hv = Math.round(52 + rand() * 168);
      hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
      hctx.beginPath();
      hctx.arc(x, y, rad, 0, Math.PI * 2);
      hctx.fill();
    }
    return {
      map: createTexture(c, aniso, true, 2, 2),
      normal: createTexture(heightCanvasToNormalCanvas(h, 3.0), aniso, false, 2, 2),
    };
  })();

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
    leafSprigDeepTex,
    leafSprigMidTex,
    leafSprigBrightTex,
    blossomSprigTex,
    grassDecalTex,
    mossDecalTex,
    skySunnyTex,
    skyRainTex,
    skyNightTex,
    soilCanvas.map,
    soilCanvas.normal
  );

  const limeWall = new THREE.MeshStandardMaterial({
    color: 0xfaf2e1,
    map: lime.map,
    normalMap: lime.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: lime.roughness,
    roughness: 0.9,
    metalness: 0.0,
  });

  const limeWallInterior = new THREE.MeshStandardMaterial({
    color: 0xf4e7ce,
    map: lime.map,
    normalMap: lime.normal,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughness: 0.88,
    metalness: 0.0,
  });

  const limeRidge = new THREE.MeshStandardMaterial({
    color: 0xfbf5e8,
    map: ridge.map,
    normalMap: ridge.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.86,
    metalness: 0.01,
  });

  const rammedEarth = new THREE.MeshStandardMaterial({
    color: 0xe6c89a,
    map: earth.map,
    normalMap: earth.normal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.92,
    metalness: 0.0,
  });

  // Painterly cerulean-indigo Qing barrel tiles (MeshPhysicalMaterial for rain water-film clearcoat & kiln glaze!)
  const roofTile = new THREE.MeshPhysicalMaterial({
    color: 0x7aa4c4,
    map: roof.map,
    normalMap: roof.normal,
    normalScale: new THREE.Vector2(1.42, 1.42),
    roughnessMap: roof.roughness,
    roughness: 0.74,
    metalness: 0.04,
    ior: 1.52,
    clearcoat: 0.08,
    clearcoatRoughness: 0.45,
    side: THREE.FrontSide,
    shadowSide: THREE.DoubleSide,
  });

  const roofTileDark = new THREE.MeshPhysicalMaterial({
    color: 0x35587a,
    normalMap: roof.normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.72,
    metalness: 0.05,
    ior: 1.52,
    clearcoat: 0.1,
    clearcoatRoughness: 0.42,
    side: THREE.FrontSide,
    shadowSide: THREE.DoubleSide,
  });

  // Solid opaque matte interior cedar roof boarding (望板) beneath clay tiles — completely blocks exterior runoff & sky glints from indoors
  const roofSheathing = new THREE.MeshStandardMaterial({
    color: 0x583b26,
    map: timber.map,
    normalMap: timber.normal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.96,
    metalness: 0.0,
    envMapIntensity: 0.22,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
  });

  const graniteSlab = new THREE.MeshPhysicalMaterial({
    color: 0xeadbc0,
    map: granite.map,
    normalMap: granite.normal,
    normalScale: new THREE.Vector2(0.78, 0.78),
    roughnessMap: granite.roughness,
    roughness: 0.82,
    metalness: 0.01,
    ior: 1.54,
    clearcoat: 0.0,
    clearcoatRoughness: 0.24,
  });

  const granitePlinth = new THREE.MeshPhysicalMaterial({
    color: 0xd6c3a1,
    map: plinth.map,
    normalMap: plinth.normal,
    normalScale: new THREE.Vector2(0.88, 0.88),
    roughnessMap: plinth.roughness,
    roughness: 0.85,
    metalness: 0.01,
    ior: 1.54,
    clearcoat: 0.0,
    clearcoatRoughness: 0.28,
  });

  // Warm sun-baked cream-ochre He-Ping forecourt (MeshPhysicalMaterial supports rain film sheen!)
  const courtyardEarth = new THREE.MeshPhysicalMaterial({
    color: 0xf1e1c4,
    map: heping.map,
    normalMap: heping.normal,
    normalScale: new THREE.Vector2(0.62, 0.62),
    roughnessMap: heping.roughness,
    roughness: 0.88,
    metalness: 0.0,
    ior: 1.48,
    clearcoat: 0.0,
    clearcoatRoughness: 0.22,
  });

  const huataiCobble = new THREE.MeshPhysicalMaterial({
    color: 0xead9b8,
    map: cobble.map,
    normalMap: cobble.normal,
    normalScale: new THREE.Vector2(0.88, 0.88),
    roughnessMap: cobble.roughness,
    roughness: 0.82,
    metalness: 0.01,
    ior: 1.52,
    clearcoat: 0.0,
    clearcoatRoughness: 0.24,
  });

  // Honeyed cedar & hand-waxed lacquered Hakka architectural timber
  const darkTimber = new THREE.MeshPhysicalMaterial({
    color: 0xb8764a,
    map: timber.map,
    normalMap: timber.normal,
    normalScale: new THREE.Vector2(0.92, 0.92),
    roughnessMap: timber.roughness,
    roughness: 0.64,
    metalness: 0.01,
    ior: 1.5,
    clearcoat: 0.18,
    clearcoatRoughness: 0.42,
  });

  const weatheredWoodDoor = new THREE.MeshStandardMaterial({
    color: 0xd49a6a,
    map: timber.map,
    normalMap: timber.normal,
    normalScale: new THREE.Vector2(0.98, 0.98),
    roughnessMap: timber.roughness,
    roughness: 0.7,
    metalness: 0.02,
  });

  const windowLattice = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: winTex,
    emissive: 0xffb35c,
    emissiveMap: winTex,
    emissiveIntensity: 0.08,
    roughness: 0.42,
    metalness: 0.05,
    ior: 1.52,
    clearcoat: 0.45,
    clearcoatRoughness: 0.24,
  });

  const redCouplet = new THREE.MeshStandardMaterial({
    color: 0xfff5ee,
    map: coupletTex,
    roughness: 0.72,
    metalness: 0.01,
  });

  const woodMicro = getWoodcarveMicroMaps();

  // Traditional multi-coat cinnabar lacquer (朱漆): crisp clearcoat specular over deep vermilion pigment
  const redLacquer = new THREE.MeshPhysicalMaterial({
    color: HANDCRAFTED_PAL.verm,
    normalMap: woodMicro.normal,
    normalScale: new THREE.Vector2(0.14, 0.14),
    roughness: 0.34,
    metalness: 0.02,
    ior: 1.55,
    clearcoat: 0.82,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.15,
  });

  // Physically calibrated gilded gold leaf & antique cast bronze
  const gildedGold = new THREE.MeshStandardMaterial({
    color: 0xebc052,
    normalMap: woodMicro.normal,
    normalScale: new THREE.Vector2(0.12, 0.12),
    roughness: 0.24,
    metalness: 0.86,
    envMapIntensity: 1.35,
  });

  const bronzeMetal = new THREE.MeshStandardMaterial({
    color: 0x9c7f4d,
    normalMap: woodMicro.normal,
    normalScale: new THREE.Vector2(0.16, 0.16),
    roughness: 0.34,
    metalness: 0.80,
    envMapIntensity: 1.2,
  });

  const goldenGrain = new THREE.MeshStandardMaterial({
    color: 0xffe89c,
    map: grain,
    roughness: 0.82,
    metalness: 0.01,
  });

  // Hand-dyed Hakka indigo cotton cloth with physical micro-fiber velvet sheen
  const indigoCloth = new THREE.MeshPhysicalMaterial({
    color: 0x2c5c8f,
    roughness: 0.86,
    metalness: 0.0,
    sheen: 0.62,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0x8bb6df),
    side: THREE.DoubleSide,
  });

  // Kiln-fired glazed terracotta jars & roof accents
  const terracotta = new THREE.MeshPhysicalMaterial({
    color: 0xc26546,
    normalMap: woodMicro.normal,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughness: 0.64,
    metalness: 0.01,
    ior: 1.52,
    clearcoat: 0.36,
    clearcoatRoughness: 0.32,
  });

  const bambooGreen = new THREE.MeshStandardMaterial({
    color: 0x62a45c,
    roughness: 0.48,
    metalness: 0.01,
  });

  // Rich mineral-jade, leaf, and sunlit sage foliage with backlit Subsurface Scattering (SSS)
  const foliageDeep = new THREE.MeshStandardMaterial({
    color: 0x459272,
    map: foliage.map,
    normalMap: foliage.normal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.78,
    metalness: 0.0,
  });

  const foliageMid = new THREE.MeshStandardMaterial({
    color: 0x6db268,
    map: foliage.map,
    normalMap: foliage.normal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.74,
    metalness: 0.0,
  });

  const foliageBright = new THREE.MeshStandardMaterial({
    color: 0xb2d46e,
    map: foliage.map,
    normalMap: foliage.normal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.7,
    metalness: 0.0,
  });

  // Alpha-cutout layered botanical leaf-sprig & blossom-sprig canopy materials
  const foliageSprigDeep = new THREE.MeshStandardMaterial({
    color: 0xd4edd6,
    map: leafSprigDeepTex,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.74,
    metalness: 0.0,
  });

  const foliageSprigMid = new THREE.MeshStandardMaterial({
    color: 0xe6f4d8,
    map: leafSprigMidTex,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.0,
  });

  const foliageSprigBright = new THREE.MeshStandardMaterial({
    color: 0xf4f9dc,
    map: leafSprigBrightTex,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.66,
    metalness: 0.0,
  });

  const blossomSprig = new THREE.MeshStandardMaterial({
    color: 0xfff5f5,
    map: blossomSprigTex,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.62,
    metalness: 0.0,
  });

  const grassDecal = new THREE.MeshStandardMaterial({
    color: 0xd9eca8,
    map: grassDecalTex,
    transparent: true,
    depthWrite: false,
    roughness: 0.9,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const mossDecal = new THREE.MeshStandardMaterial({
    color: 0x8cc282,
    map: mossDecalTex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -1,
  });

  const forestGround = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    normalMap: earth.normal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.94,
    metalness: 0.0,
  });

  const gardenSoil = new THREE.MeshStandardMaterial({
    color: 0xd9c7b2,
    map: soilCanvas.map,
    normalMap: soilCanvas.normal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.95,
    metalness: 0.0,
  });

  const lanternPaper = new THREE.MeshStandardMaterial({
    color: 0xe64d2e,
    emissive: 0xff8b36,
    emissiveIntensity: 0.42,
    roughness: 0.52,
    metalness: 0.0,
  });

  const contactShadow = makeContactShadowMaterial();
  const plaqueLongxi = makePlaqueMaterial(aniso, '隴西世澤', '梅州客家雙圍龍屋', '#1b2b44', '#f2c65a', '#b58432');
  const plaqueGengdu = makePlaqueMaterial(aniso, '耕讀傳家', '家族私塾書房', '#f5ebd6', '#1d2a44', '#9c713c');
  const plaqueJiaxun = makePlaqueMaterial(aniso, '敦親睦族', '崇文重教 · 勤儉持家', '#242f48', '#ebc054', '#9c6e2a');

  const skySunny = new THREE.MeshBasicMaterial({ map: skySunnyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const skyRain = new THREE.MeshBasicMaterial({ map: skyRainTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const skyNight = new THREE.MeshBasicMaterial({ map: skyNightTex, side: THREE.BackSide, fog: false, depthWrite: false });

  // Pillar 1 & 3: Attach handcrafted GI radiosity, color bleeding, crevice AO & rain-wetness shaders
  attachWorldPatinaShader(roofTile, {
    key: 'roof_tile_runoff',
    macroFreq: 0.11,
    macroStrength: 0.18,
    mossStrength: 0.14,
    bounceReceive: 0.16,
    crimsonBleed: 0.08,
    wettable: true,
    roofRunoff: true,
  });
  attachWorldPatinaShader(roofTileDark, {
    key: 'roof_tile_dark_runoff',
    macroFreq: 0.12,
    macroStrength: 0.12,
    mossStrength: 0.1,
    bounceReceive: 0.12,
    crimsonBleed: 0.06,
    wettable: true,
    roofRunoff: true,
  });
  attachWorldPatinaShader(limeWall, {
    key: 'lime_wall_v3',
    macroFreq: 0.15,
    macroStrength: 0.08,
    mossStrength: 0.02,
    groundAoHeight: 0.52,
    groundAoStrength: 0.14,
    eaveAoHeight: 3.15,
    bounceReceive: 0.34,
    crimsonBleed: 0.28,
    wettable: false,
  });
  attachWorldPatinaShader(limeWallInterior, {
    key: 'lime_wall_int_v3',
    macroFreq: 0.18,
    macroStrength: 0.07,
    mossStrength: 0.01,
    groundAoHeight: 0.42,
    groundAoStrength: 0.12,
    bounceReceive: 0.3,
    crimsonBleed: 0.22,
    wettable: false,
  });
  attachWorldPatinaShader(limeRidge, {
    key: 'lime_ridge_v3',
    macroFreq: 0.18,
    macroStrength: 0.09,
    mossStrength: 0.05,
    bounceReceive: 0.24,
    crimsonBleed: 0.14,
    wettable: false,
  });
  attachWorldPatinaShader(graniteSlab, {
    key: 'granite_slab_v3',
    macroFreq: 0.13,
    macroStrength: 0.11,
    mossStrength: 0.05,
    bounceReceive: 0.22,
    crimsonBleed: 0.24,
    wettable: true,
  });
  attachWorldPatinaShader(granitePlinth, {
    key: 'granite_plinth_v3',
    macroFreq: 0.2,
    macroStrength: 0.12,
    mossStrength: 0.08,
    groundAoHeight: 0.38,
    groundAoStrength: 0.16,
    bounceReceive: 0.25,
    crimsonBleed: 0.22,
    wettable: true,
  });
  attachWorldPatinaShader(courtyardEarth, {
    key: 'heping_court_v3',
    macroFreq: 0.075,
    macroStrength: 0.11,
    mossStrength: 0.03,
    bounceReceive: 0.14,
    crimsonBleed: 0.14,
    wettable: true,
  });
  attachWorldPatinaShader(huataiCobble, {
    key: 'huatai_cobble',
    macroFreq: 0.12,
    macroStrength: 0.15,
    mossStrength: 0.1,
    bounceReceive: 0.18,
    crimsonBleed: 0.08,
    wettable: true,
  });
  attachWorldPatinaShader(darkTimber, {
    key: 'dark_timber',
    macroFreq: 0.24,
    macroStrength: 0.12,
    mossStrength: 0.05,
    groundAoHeight: 0.48,
    groundAoStrength: 0.18,
    bounceReceive: 0.24,
    crimsonBleed: 0.14,
    wettable: false,
  });

  // Pillar 2: Attach physically-based Subsurface Scattering (SSS) to foliage, bamboo & silk lanterns
  attachSubsurfaceShader(foliageDeep, {
    key: 'foliage_deep',
    tintHex: 0x76c968,
    backStrength: 0.48,
    wrapStrength: 0.22,
    power: 2.5,
  });
  attachSubsurfaceShader(foliageMid, {
    key: 'foliage_mid',
    tintHex: 0xa4df6a,
    backStrength: 0.56,
    wrapStrength: 0.26,
    power: 2.4,
  });
  attachSubsurfaceShader(foliageBright, {
    key: 'foliage_bright',
    tintHex: 0xd6ee7c,
    backStrength: 0.64,
    wrapStrength: 0.28,
    power: 2.2,
  });
  attachSubsurfaceShader(foliageSprigDeep, {
    key: 'foliage_sprig_deep',
    tintHex: 0x7fd470,
    backStrength: 0.54,
    wrapStrength: 0.26,
    power: 2.3,
  });
  attachSubsurfaceShader(foliageSprigMid, {
    key: 'foliage_sprig_mid',
    tintHex: 0xafe672,
    backStrength: 0.62,
    wrapStrength: 0.28,
    power: 2.2,
  });
  attachSubsurfaceShader(foliageSprigBright, {
    key: 'foliage_sprig_bright',
    tintHex: 0xdaf280,
    backStrength: 0.68,
    wrapStrength: 0.3,
    power: 2.1,
  });
  attachSubsurfaceShader(blossomSprig, {
    key: 'blossom_sprig',
    tintHex: 0xffc6cc,
    backStrength: 0.62,
    wrapStrength: 0.32,
    power: 2.0,
  });
  attachSubsurfaceShader(bambooGreen, {
    key: 'bamboo_green',
    tintHex: 0x9ce072,
    backStrength: 0.52,
    wrapStrength: 0.24,
    power: 2.4,
  });
  attachSubsurfaceShader(lanternPaper, {
    key: 'lantern_paper',
    tintHex: 0xffa652,
    backStrength: 0.62,
    wrapStrength: 0.34,
    power: 2.0,
  });

  attachValleyTerrainShader(forestGround);

  const wettableMaterials: THREE.MeshPhysicalMaterial[] = [
    roofTile,
    roofTileDark,
    graniteSlab,
    granitePlinth,
    courtyardEarth,
    huataiCobble,
  ];

  let isDisposed = false;
  void isDisposed;

  const materials: THREE.Material[] = [
    limeWall,
    limeWallInterior,
    limeRidge,
    rammedEarth,
    roofTile,
    roofTileDark,
    roofSheathing,
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
    foliageSprigDeep,
    foliageSprigMid,
    foliageSprigBright,
    blossomSprig,
    grassDecal,
    mossDecal,
    forestGround,
    gardenSoil,
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
    roofTile,
    roofTileDark,
    roofSheathing,
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
    foliageSprigDeep,
    foliageSprigMid,
    foliageSprigBright,
    blossomSprig,
    grassDecal,
    mossDecal,
    forestGround,
    gardenSoil,
    lanternPaper,
    contactShadow,
    plaqueLongxi,
    plaqueGengdu,
    plaqueJiaxun,
    skySunny,
    skyRain,
    skyNight,
    wettableMaterials,
    dispose: () => {
      isDisposed = true;
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
