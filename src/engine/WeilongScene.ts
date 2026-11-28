import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type {
  CameraViewMode,
  GameMode,
  HudSnapshot,
  InteractableDef,
  SubtitleState,
  WeatherMode,
} from '../types/game';
import {
  INTERACTABLES,
  LUNAR_ALMANAC_DAYS,
  ROOM_NODES,
} from '../data/weilongData';
import {
  detectNodeIdAt,
  evaluateJiaobei,
  groundHeightAt,
  surfaceTypeAt,
} from './worldMath';
import {
  createMaterialLibrary,
  physicalEnvUniforms,
  type MaterialLibrary,
} from './proceduralTextures';
import { buildWeilongArchitecture, type ArchitectureRefs } from './architectureBuilder';
import { buildWeilongProps, type PropAnimationRefs } from './propsBuilder';
import { buildLivingWorld, type LivingWorldRefs } from './livingWorldBuilder';
import { buildPlayerAvatar, type PlayerAvatarRefs } from './playerAvatar';
import { createSoftPillowGeometry } from './sculptHelpers';
import { HakkaAudioEngine } from './audioEngine';
import {
  computeDayNightState,
  formatHourClock,
  getChineseShichenLabel,
  getLocalTimeOfDay,
  normalizeHour,
} from './dayNightCycle';
import { evaluateLivingBehavior } from './livingBehavior';
import { computeLightningEnvelope, isUnderRoof } from './weatherPhysics';
import {
  GTA_CAMERA_PRESETS,
  computeCameraRelativeMove,
  computeSoftFollowYaw,
  computeThirdPersonCameraPose,
  cycleCameraView,
  dampAngle,
  normalizeAngle,
  shortestAngleDelta,
} from './gtaCamera';
import { HwameiSongController, type HwameiAnimState } from './hwameiSongEngine';
import {
  computeHwameiSpatialAcoustics,
  type SpatialAcousticParams,
} from './hwameiAcoustics';
import { SpatialPhysicsKernel } from './spatialPhysicsKernel';
import { SceneValidator } from './sceneValidator';
import {
  COLLISION_MASKS,
  CollisionLayer,
  DEFAULT_CAPSULE_DIMS,
  type ContainedEntityRef,
  type StationSlot,
  type ValidationReport,
} from './spatialTypes';

// Pre-allocated scratch vectors for zero-GC per-frame Hwamei spatial audio
const _hwameiWorldPos = new THREE.Vector3();
const _listenerForward = new THREE.Vector3();
const _listenerRight = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Pillar 4: Subtle physical 35mm lens optics shader (natural cos^4 optical vignette,
 * delicate edge chromatic dispersion, and soft highlight halation before ACES output).
 */
const PHYSICAL_LENS_OPTICS_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.22 },
    uChromatic: { value: 0.00072 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uChromatic;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);
      float edgeMask = smoothstep(0.08, 0.55, r2);
      vec2 offset = centered * uChromatic * edgeMask;

      float r = texture2D(tDiffuse, vUv + offset).r;
      vec4 base = texture2D(tDiffuse, vUv);
      float b = texture2D(tDiffuse, vUv - offset).b;
      vec3 col = vec3(r, base.g, b);

      // Physical cos^4 natural optical falloff toward frame corners
      float cosFalloff = 1.0 / pow(1.0 + r2 * 0.95, 2.0);
      col *= mix(1.0, cosFalloff, uVignette);

      gl_FragColor = vec4(col, base.a);
    }
  `,
};

export interface WeilongCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onSubtitle: (sub: SubtitleState) => void;
  onInspectArtifact: (artifactId: string) => void;
}

const NODE_MAP = new Map(ROOM_NODES.map((n) => [n.id, n]));
const INTERACTABLE_MAP = new Map(INTERACTABLES.map((i) => [i.id, i]));

// Module-scoped scratch vectors for zero-GC animation loop
const _camTargetPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _rayOrigin = new THREE.Vector2();

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class WeilongSceneController {
  private container: HTMLElement;
  private callbacks: WeilongCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envMaps: Record<'sunny' | 'rain' | 'night', THREE.Texture>;
  private activeEnvKey: 'sunny' | 'rain' | 'night' = 'sunny';
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private lensPass: ShaderPass | null = null;
  private mats: MaterialLibrary;
  private arch: ArchitectureRefs;
  private physicsKernel: SpatialPhysicsKernel;
  private props: PropAnimationRefs;
  private living: LivingWorldRefs;
  private playerAvatar: PlayerAvatarRefs;
  private sceneValidator: SceneValidator;
  private validationReport: ValidationReport | null = null;
  public audio: HakkaAudioEngine;

  // Lighting & Poetic Atmosphere (1 shadow caster + zero-shadow GI bounce & sky rim)
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private groundBounceLight: THREE.DirectionalLight;
  private skyRimLight: THREE.DirectionalLight;
  private poeticSky: THREE.Mesh;
  private skyUniforms: {
    uZen: { value: THREE.Color };
    uMid: { value: THREE.Color };
    uHor: { value: THREE.Color };
    uHs: { value: THREE.Color };
    uGnd: { value: THREE.Color };
    uTwilightCol: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uMoonDir: { value: THREE.Vector3 };
    uSunStr: { value: number };
    uMoonStr: { value: number };
    uStarStr: { value: number };
    uTwilight: { value: number };
    uRain: { value: number };
    uTime: { value: number };
    uLightning: { value: number };
    uLightningDir: { value: THREE.Vector3 };
  };
  private cloudGroup: THREE.Group;
  private cloudUniforms: {
    uTopCol: { value: THREE.Color };
    uBotCol: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uRain: { value: number };
    uOpacity: { value: number };
    uTime: { value: number };
    uLightning: { value: number };
    uLightningDir: { value: THREE.Vector3 };
  };
  private cloudVolumetricMat: THREE.ShaderMaterial;
  private rainStreaks: THREE.LineSegments;
  private rainStreakData: Float32Array = new Float32Array(0);
  private lightningElapsed = 10;
  private lightningActive = false;
  private lightningIntensity = 0;
  private nextLightningInSec = 5.5;
  private lightningSeed = 17;
  private readonly lightningTintColor = new THREE.Color(0xcde0ff);
  private fireflyPoints: THREE.Points;
  private umbrellaHeldGroup: THREE.Group;

  // Game, Day-Night Cycle & GTA Player / Camera Rig State
  private mode: GameMode = 'title';
  private weather: WeatherMode = 'sunny';
  private cameraView: CameraViewMode = 'third_mid';
  private timeOfDay = getLocalTimeOfDay();
  private timePlaying = true;
  private timeSpeed = 1;
  private timePeriodLabel = getChineseShichenLabel(this.timeOfDay).label;
  private formattedTime = formatHourClock(this.timeOfDay);
  private playerPos = new THREE.Vector3(0, 0, 31.0);
  private playerVelX = 0;
  private playerVelZ = 0;
  private eyeYVel = 0;
  private characterYaw = 0; // Character body heading (0 = facing North -Z)
  private cameraYaw = 0; // GTA free-orbit camera yaw (0 = looking North -Z)
  private cameraPitch = -0.18; // Slight downward GTA over-the-shoulder angle
  private targetCameraYaw = 0;
  private targetCameraPitch = -0.18;
  private desiredThirdPersonDist = GTA_CAMERA_PRESETS.third_mid.distance;
  private smoothedThirdPersonDist = GTA_CAMERA_PRESETS.third_mid.distance;
  private smoothCamPos = new THREE.Vector3(0, 2.6, 36.0);
  private smoothLookAt = new THREE.Vector3(0, 1.6, 29.8);
  private cameraRigInitialized = false;
  private timeSinceManualOrbit = 3.0;
  private lookBackHeld = false;
  private virtualMoveRight = 0;
  private virtualMoveForward = 0;
  private virtualAutoSprint = false;
  private virtualSprintToggle = false;
  private isSprintingNow = false;
  private aerialAngle = 0;
  private aerialPitch = 0.42;
  private aerialDist = 72;
  private walkPhase = 0;
  private stepDistAccum = 0;
  private thresholdBumpTimer = 0;
  private trauma = 0;
  private titleTime = 0;

  // Interactive States
  private visitedNodes = new Set<string>(['node_02_heping']);
  private triggeredInteractions = new Set<string>();
  private inspectedArtifacts = new Set<string>();
  private nearbyInteractable: InteractableDef | null = null;
  private doumenOpen = false;
  private doumenAngle = 0;
  private holdingUmbrella = false;
  private gunSlitActive = false;
  private fiveElementsLit = 0;
  private almanacIdx = 0;
  private studyLampBright = 1.2;

  // Active Prop Animation Timers & Physical Hwamei Song Engine
  private millSpinTimer = 0;
  private cradleRockTimer = 0;
  private birdcageSwingTimer = 0;
  private hwameiSong = new HwameiSongController();
  private lastHwameiAnim: HwameiAnimState | null = null;
  private lastHwameiSpatial: SpatialAcousticParams | null = null;
  private bellowsTimer = 0;
  private leichaTimer = 0;
  private winnowerTimer = 0;
  private pulleyRaised = false;
  private loomTimer = 0;
  private carpentryAssembled = false;
  private dingLanternLit = false;
  private jiaobeiAnimTimer = 0;
  private jiaobeiFlipL = 0;
  private jiaobeiFlipR = Math.PI;
  private birdsFlightTimer = 0;

  // Input State (Desktop Pointer Lock + Mouse Drag + Multi-Touch Orbit/Pinch)
  private keysHeld = new Set<string>();
  private pointerLocked = false;
  private middleMouseDown = false;
  private activePointers = new Map<
    number,
    { x: number; y: number; startX: number; startY: number; pointerType: string }
  >();
  private dragMoved = false;
  private lastPinchDist: number | null = null;
  private raycaster = new THREE.Raycaster();

  // Loop & Throttling
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = performance.now();
  private lastHudEmitMs = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, callbacks: WeilongCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();
    this.audio = new HakkaAudioEngine();

    // Renderer configured strictly per Three.js & Software-WebGL guard guidelines
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = Math.max(320, container.clientWidth || window.innerWidth);
    const h = Math.max(240, container.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // Scene & Custom Physical Outdoor Sky + Courtyard Bounce IBL (baked per weather via PMREM)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6fb4e0);
    this.scene.fog = new THREE.FogExp2(0xd8e5e6, 0.0024);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMaps = {
      sunny: this.bakePhysicalOutdoorEnv(pmrem, 'sunny'),
      rain: this.bakePhysicalOutdoorEnv(pmrem, 'rain'),
      night: this.bakePhysicalOutdoorEnv(pmrem, 'night'),
    };
    this.scene.environment = this.envMaps.sunny;
    pmrem.dispose();

    // Enhanced Atmospheric Sky Dome: Rayleigh/Mie scattering, vivid dawn/dusk horizon bands,
    // drifting multi-octave high-altitude clouds, crisp sun corona, lunar maria & twinkling Milky Way!
    this.skyUniforms = {
      uZen: { value: new THREE.Color(0x2a76be) },
      uMid: { value: new THREE.Color(0x67b3e2) },
      uHor: { value: new THREE.Color(0xf6e6c8) },
      uHs: { value: new THREE.Color(0xfff1cc) },
      uGnd: { value: new THREE.Color(0x88b8a8) },
      uTwilightCol: { value: new THREE.Color(0xf69664) },
      uSunDir: { value: new THREE.Vector3(46, 36, 32).normalize() },
      uMoonDir: { value: new THREE.Vector3(-24, 34, -46).normalize() },
      uSunStr: { value: 1.0 },
      uMoonStr: { value: 0.0 },
      uStarStr: { value: 0.0 },
      uTwilight: { value: 0.0 },
      uRain: { value: 0.0 },
      uTime: { value: 0.0 },
      uLightning: { value: 0.0 },
      uLightningDir: { value: new THREE.Vector3(-0.35, 0.42, -0.82).normalize() },
    };
    const poeticSkyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZen;
        uniform vec3 uMid;
        uniform vec3 uHor;
        uniform vec3 uHs;
        uniform vec3 uGnd;
        uniform vec3 uTwilightCol;
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform float uSunStr;
        uniform float uMoonStr;
        uniform float uStarStr;
        uniform float uTwilight;
        uniform float uRain;
        uniform float uTime;
        uniform float uLightning;
        uniform vec3 uLightningDir;
        varying vec3 vDir;

        float sHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float vNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x),
            mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float cloudFbm(vec2 p) {
          float v = 0.0;
          float a = 0.52;
          mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          for (int i = 0; i < 5; i++) {
            v += a * vNoise(p);
            p = rot * p * 2.04 + vec2(1.7, -0.9);
            a *= 0.49;
          }
          return v;
        }

        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;

          // Multi-band Rayleigh atmospheric gradient
          vec3 col = mix(uHor, uMid, smoothstep(-0.02, 0.25, y));
          col = mix(col, uZen, smoothstep(0.18, 0.78, y));
          col = mix(col, uGnd, smoothstep(0.02, -0.18, y));

          vec3 sunD = normalize(uSunDir);
          float sDot = max(dot(d, sunD), 0.0);
          float horizonBand = pow(1.0 - clamp(abs(y), 0.0, 1.0), 3.6);

          // Mie forward scatter & golden/crimson dawn-dusk twilight ribbon (晨昏霞光)
          float mieScatter = pow(sDot, 4.0) * 0.34 + pow(sDot, 16.0) * 0.28;
          col = mix(col, uHs, horizonBand * (0.24 + 0.46 * pow(sDot, 2.0)) * (uSunStr + uTwilight * 0.65));
          col += uTwilightCol * horizonBand * (0.36 + 0.52 * pow(sDot, 1.8)) * uTwilight * (1.0 - uRain * 0.75);
          col += uHs * mieScatter * uSunStr * 0.45;

          // Crisp golden painted sun disc & luminous atmospheric corona (softly veiled in storm)
          if (uSunStr > 0.01) {
            float halo = pow(sDot, 28.0) * 0.42 + pow(sDot, 180.0) * 0.92;
            float disc = smoothstep(0.9987, 0.99935, sDot);
            col += mix(vec3(1.0, 0.95, 0.82), vec3(1.0, 0.72, 0.44), uTwilight * 0.75) * (halo + disc * 1.55) * uSunStr;
          }

          // Multi-layer volumetric sky clouds: airy sunlit cirrus in sunny mode;
          // rich billowing, domain-warped multi-tier storm clouds with sheet lightning in rain mode!
          if (y > 0.015) {
            vec2 skyUv = d.xz / (y + 0.24);
            float horizonFade = smoothstep(0.015, 0.16, y);

            // Sunny high-altitude wispy cumulus layer
            vec2 driftA = skyUv * 0.58 + vec2(uTime * 0.0045, uTime * 0.0018);
            vec2 driftB = skyUv * 1.24 + vec2(-uTime * 0.0032, uTime * 0.0028);
            float wisp = cloudFbm(driftA) * 0.65 + cloudFbm(driftB) * 0.35;
            float sunnyMask = smoothstep(0.50, 0.78, wisp) * horizonFade * (1.0 - smoothstep(0.75, 0.98, y) * 0.35);

            vec3 sunnyLit = mix(vec3(0.99, 0.97, 0.92), uTwilightCol * 1.15, uTwilight * 0.82);
            sunnyLit = mix(sunnyLit, vec3(0.28, 0.36, 0.52), uStarStr * 0.88);
            vec3 sunnyShade = mix(uMid * 0.94, vec3(0.14, 0.20, 0.34), uStarStr * 0.85);
            float sunRim = smoothstep(0.35, 0.95, sDot) * (uSunStr + uTwilight * 0.8);
            vec3 sunnyCol = mix(sunnyShade, sunnyLit, 0.58 + 0.42 * sunRim);
            col = mix(col, sunnyCol, sunnyMask * 0.42 * (1.0 - uRain * 0.75));

            // Volumetric multi-layer brooding storm clouds (high-contrast billowing cumulonimbus deck)
            if (uRain > 0.02) {
              vec2 windVec = vec2(uTime * 0.016, uTime * 0.007);
              // Domain warp for organic rolling Lingnan thunderstorm eddies
              vec2 warp = vec2(
                cloudFbm(skyUv * 0.46 + windVec * 0.65 + vec2(2.3, -1.1)),
                cloudFbm(skyUv * 0.46 - windVec * 0.45 + vec2(-3.7, 4.2))
              );
              vec2 stormUvHi = skyUv * 0.56 + windVec * 0.48 + (warp - 0.5) * 0.68;
              vec2 stormUvMid = skyUv * 0.98 + windVec * 0.95 + (warp - 0.5) * 0.88;
              vec2 stormUvLo = skyUv * 1.55 + windVec * 1.42 + (warp - 0.5) * 0.72;

              float rawHi = cloudFbm(stormUvHi);
              float rawMid = cloudFbm(stormUvMid);
              float rawLo = cloudFbm(stormUvLo);
              // Stretch narrow FBM distribution around 0.5 for rich, sculptural billowing cloud relief
              float upperCover = smoothstep(0.37, 0.67, rawHi);
              float midBillow = smoothstep(0.40, 0.68, rawMid);
              float lowBelly = smoothstep(0.44, 0.71, rawLo);

              // Directional offset sample for authentic top-crest silver light vs heavy dark rain-belly relief
              float rawMidLit = cloudFbm(stormUvMid + vec2(0.065, 0.055));
              float crestRelief = clamp((rawMid - rawMidLit) * 5.2 + 0.52, 0.0, 1.0);
              float stormDensity = clamp(upperCover * 0.78 + midBillow * 0.55 + lowBelly * 0.45, 0.0, 1.0);

              float dayBright = mix(0.24, 1.0, 1.0 - uStarStr);
              // Luminous silver-blue cloud breaks, cool slate-indigo mid-layers, brooding charcoal thunderhead bellies
              vec3 stormGap = vec3(0.70, 0.77, 0.83) * dayBright;
              vec3 stormSilver = vec3(0.54, 0.61, 0.68) * dayBright;
              vec3 stormSlate = vec3(0.28, 0.34, 0.42) * dayBright;
              vec3 stormBelly = vec3(0.13, 0.17, 0.24) * dayBright;

              vec3 stormCol = mix(stormGap, stormSilver, upperCover);
              stormCol = mix(stormCol, stormSlate, midBillow * (0.55 + 0.45 * (1.0 - crestRelief)));
              stormCol = mix(stormCol, stormBelly, lowBelly * (0.68 + 0.32 * (1.0 - crestRelief)));
              // Silver-rimmed cloud crests catching diffused high-altitude skylight
              float silverRim = midBillow * (1.0 - lowBelly * 0.75) * smoothstep(0.52, 0.92, crestRelief);
              stormCol += vec3(0.24, 0.28, 0.32) * silverRim * dayBright;

              // Natural localized intra-cloud sheet lightning glow illuminating cloud crevices from within!
              if (uLightning > 0.005) {
                float lAlign = max(dot(d, normalize(uLightningDir)), 0.0);
                float sheetCone = pow(lAlign, 4.5) * 0.85 + pow(lAlign, 18.0) * 0.95;
                float creviceScatter = (0.35 + 0.65 * (1.0 - lowBelly * 0.7)) * (0.55 + 0.45 * crestRelief);
                vec3 flashTint = vec3(0.76, 0.84, 1.0);
                stormCol += flashTint * uLightning * (0.14 + sheetCone * 1.15) * creviceScatter;
              }

              // Keep storm cloud banks clearly sculpted down to low elevation angles right above roofline
              float mistMask = smoothstep(0.01, 0.11, y);
              col = mix(col, stormCol, stormDensity * mistMask * uRain * 0.96);
              // Subtle distant horizon glow during lightning
              if (uLightning > 0.005) {
                col += vec3(0.20, 0.24, 0.32) * uLightning * (1.0 - mistMask) * 0.45 * uRain;
              }
            }
          }

          // Detailed full moon with lunar maria & cool silver corona at night
          if (uMoonStr > 0.01) {
            vec3 md = normalize(uMoonDir);
            float mDot = dot(d, md);
            float mHalo = pow(max(mDot, 0.0), 20.0) * 0.28 + pow(max(mDot, 0.0), 150.0) * 0.58;
            col += vec3(0.76, 0.87, 1.0) * mHalo * uMoonStr;
            float mDisc = smoothstep(0.9978, 0.9985, mDot);
            if (mDisc > 0.001) {
              vec3 up = vec3(0.0, 1.0, 0.0);
              vec3 mx = normalize(cross(up, md));
              vec3 my = cross(md, mx);
              vec2 muv = vec2(dot(d - md, mx), dot(d - md, my)) * 20.0;
              float maria = 0.86 + 0.14 * sin(muv.x * 2.1 + sin(muv.y * 2.5)) * cos(muv.y * 1.8 - muv.x * 0.9);
              vec3 moonCol = vec3(1.0, 0.97, 0.88) * maria;
              col = mix(col, moonCol, mDisc * uMoonStr);
            }
          }

          // Multi-scale twinkling starfield & subtle diagonal Milky Way band on clear nights
          if (uStarStr > 0.01 && y > 0.05) {
            float elevFade = smoothstep(0.05, 0.26, y);
            // Soft Milky Way glow band across zenith
            float mwAxis = abs(dot(d, normalize(vec3(0.55, 0.28, -0.78))));
            float mwBand = exp(-mwAxis * mwAxis * 12.0) * (0.45 + 0.55 * vNoise(d.xz * 7.5 + 3.1));
            col += vec3(0.18, 0.24, 0.42) * mwBand * elevFade * uStarStr * 0.42;

            // Bright primary stars
            vec2 sp1 = vec2(atan(d.z, d.x), asin(clamp(y, -1.0, 1.0))) * 44.0;
            vec2 c1 = floor(sp1);
            vec2 f1 = fract(sp1) - 0.5;
            float r1 = sHash(c1);
            if (r1 > 0.915) {
              float tw = 0.62 + 0.38 * sin(uTime * (2.0 + r1 * 4.2) + r1 * 55.0);
              float star = smoothstep(0.16, 0.015, length(f1)) * tw * elevFade;
              vec3 starTint = mix(vec3(0.84, 0.92, 1.0), vec3(1.0, 0.94, 0.80), fract(r1 * 17.3));
              col += starTint * star * uStarStr * 1.15;
            }
            // Fine secondary star dust
            vec2 sp2 = vec2(atan(d.z, d.x), asin(clamp(y, -1.0, 1.0))) * 92.0;
            vec2 c2 = floor(sp2);
            vec2 f2 = fract(sp2) - 0.5;
            float r2 = sHash(c2 + 19.7);
            if (r2 > 0.945) {
              float tw2 = 0.55 + 0.45 * sin(uTime * (3.1 + r2 * 3.5) + r2 * 40.0);
              float star2 = smoothstep(0.14, 0.02, length(f2)) * tw2 * elevFade;
              col += vec3(0.92, 0.95, 1.0) * star2 * uStarStr * 0.68;
            }
          }

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.poeticSky = new THREE.Mesh(new THREE.SphereGeometry(250, 36, 22), poeticSkyMat);
    this.scene.add(this.poeticSky);

    // Volumetric Multi-Shaded 3D Clouds (sunlit billowing cotton in clear weather; brooding layered storm clouds in rain)
    this.cloudUniforms = {
      uTopCol: { value: new THREE.Color(0xfff8e8) },
      uBotCol: { value: new THREE.Color(0xefd3bc) },
      uSunDir: { value: new THREE.Vector3(46, 36, 32).normalize() },
      uRain: { value: 0.0 },
      uOpacity: { value: 0.9 },
      uTime: { value: 0.0 },
      uLightning: { value: 0.0 },
      uLightningDir: { value: new THREE.Vector3(-0.35, 0.42, -0.82).normalize() },
    };
    this.cloudVolumetricMat = new THREE.ShaderMaterial({
      uniforms: this.cloudUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying float vLocalY;
        uniform float uTime;
        uniform float uRain;
        void main() {
          vec3 pos = position;
          // Gentle organic slow billowing heave in wind
          float puff = sin(pos.x * 1.4 + uTime * 0.25) * cos(pos.z * 1.2 - uTime * 0.18) * (0.06 + uRain * 0.08);
          pos += normal * puff;
          vLocalY = position.y;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopCol;
        uniform vec3 uBotCol;
        uniform vec3 uSunDir;
        uniform float uRain;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uLightning;
        uniform vec3 uLightningDir;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying float vLocalY;

        float cNoise(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        }

        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 L = normalize(uSunDir);

          // Volumetric top-crest vs heavy shaded underbelly gradient
          float upGrad = smoothstep(-0.65, 0.78, N.y * 0.72 + vLocalY * 0.35);
          float sunWrap = clamp(dot(N, L) * 0.48 + 0.52, 0.0, 1.0);
          // Subtle billowing internal density variation (eliminates flat grey polygon look)
          float billow = 0.5 + 0.5 * sin(vWorldPos.x * 0.11 + uTime * 0.08) * cos(vWorldPos.z * 0.09 - uTime * 0.06 + vWorldPos.y * 0.16);
          float shadeMix = clamp(upGrad * 0.68 + sunWrap * 0.32 * (1.0 - uRain * 0.45) + (billow - 0.5) * 0.18, 0.0, 1.0);

          vec3 col = mix(uBotCol, uTopCol, shadeMix);
          // Delicate silver-blue sunlit rim scattering along cloud edges in storm
          float rim = pow(1.0 - abs(dot(N, V)), 2.2);
          col += mix(uTopCol * 0.14, vec3(0.22, 0.28, 0.34), uRain) * rim * (0.4 + 0.6 * upGrad);

          // Intra-cloud lightning illumination pulsing through nearby storm clouds
          if (uLightning > 0.005 && uRain > 0.05) {
            vec3 dirToCloud = normalize(vWorldPos);
            float lProx = pow(max(dot(dirToCloud, normalize(uLightningDir)), 0.0), 3.0);
            col += vec3(0.72, 0.82, 1.0) * uLightning * (0.16 + lProx * 0.85) * (0.5 + 0.5 * rim);
          }

          // Soft painterly Fresnel-feathered silhouette + organic billow edge + distance mist fade
          float edgeSoft = pow(clamp(abs(dot(N, V)), 0.0, 1.0), mix(0.76, 1.38, uRain));
          float dist = length(vWorldPos - cameraPosition);
          float distFade = 1.0 - smoothstep(155.0, 230.0, dist);
          float rainAlphaMod = mix(0.88, 0.64 + 0.24 * billow, uRain);
          float alpha = clamp(edgeSoft * uOpacity * distFade * rainAlphaMod, 0.0, 0.90);
          if (alpha < 0.02) discard;

          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.cloudGroup = this.buildSculptedClouds();
    this.scene.add(this.cloudGroup);

    // Camera (340m far clip to show poetic sky, clouds & Shan-Shui mountains crisply)
    this.camera = new THREE.PerspectiveCamera(56, w / h, 0.14, 340);

    // Warm Golden-Morning Painterly Lighting Rig (<= 1 Shadow Caster!)
    this.hemiLight = new THREE.HemisphereLight(0x98ccf0, 0x9c825c, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1cf, 2.75);
    this.sunLight.position.set(46, 36, 32);
    if (!this.isSoftwareGl) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.sunLight.shadow.radius = 2.4;
      this.sunLight.shadow.camera.left = -52;
      this.sunLight.shadow.camera.right = 52;
      this.sunLight.shadow.camera.top = 56;
      this.sunLight.shadow.camera.bottom = -56;
      this.sunLight.shadow.camera.near = 4;
      this.sunLight.shadow.camera.far = 165;
      // Tight shadow bias & normalBias to eliminate interior floor seam light-leak bands!
      this.sunLight.shadow.bias = -0.00022;
      this.sunLight.shadow.normalBias = 0.012;
    }
    this.scene.add(this.sunLight);

    // Pillar 1: Zero-shadow warm courtyard radiosity bounce fill (bouncing sunlit He-Ping upward onto eaves & walls)
    this.groundBounceLight = new THREE.DirectionalLight(0xf6cfa0, 0.62);
    this.groundBounceLight.position.set(-18, -14, 34);
    this.groundBounceLight.castShadow = false;
    this.scene.add(this.groundBounceLight);

    // Pillar 1: Zero-shadow cool azure sky rim fill separating silhouettes & roof ridges against mountain mist
    this.skyRimLight = new THREE.DirectionalLight(0x9bd2f8, 0.46);
    this.skyRimLight.position.set(-36, 28, -32);
    this.skyRimLight.castShadow = false;
    this.scene.add(this.skyRimLight);

    // Build Procedural Materials, SSOT Architecture, Unified Physics Kernel, Socketed Props & Living Community
    this.mats = createMaterialLibrary(this.renderer);
    this.arch = buildWeilongArchitecture(this.mats, this.isSoftwareGl);
    this.physicsKernel = new SpatialPhysicsKernel(this.arch.compiled);
    this.props = buildWeilongProps(this.mats, this.isSoftwareGl, this.arch.compiler);
    this.living = buildLivingWorld(this.mats, this.isSoftwareGl, this.physicsKernel);
    this.playerAvatar = buildPlayerAvatar(this.mats, this.isSoftwareGl);
    this.playerAvatar.root.position.copy(this.playerPos);
    this.scene.add(this.arch.root);
    this.scene.add(this.props.root);
    this.scene.add(this.living.root);
    this.scene.add(this.playerAvatar.root);

    // Register Player capsule in unified SpatialPhysicsKernel
    this.physicsKernel.registerBody({
      id: 'player',
      x: this.playerPos.x,
      y: this.playerPos.y,
      z: this.playerPos.z,
      radius: DEFAULT_CAPSULE_DIMS.PLAYER.radius,
      height: DEFAULT_CAPSULE_DIMS.PLAYER.height,
      layer: CollisionLayer.PLAYER,
      mask: COLLISION_MASKS.PLAYER,
      weight: 1.4,
    });

    // Register Hwamei birdcage runtime ContainerDomain anchored to socketed birdcage world pos
    const [bcX, bcY, bcZ] = this.props.birdcageWorldPos;
    this.physicsKernel.registerContainerDomain({
      id: 'hwamei_birdcage',
      label: '画眉鸟笼容器',
      kind: 'cylinder',
      cx: bcX,
      cz: bcZ,
      radius: 0.30,
      minY: bcY - 1.42,
      maxY: bcY - 0.78,
      margin: 0.02,
    });

    // Held Oil-Paper Umbrella attached to Camera (used in First-Person mode)
    this.umbrellaHeldGroup = this.buildHeldUmbrella();
    this.umbrellaHeldGroup.visible = false;
    this.camera.add(this.umbrellaHeldGroup);
    this.scene.add(this.camera);

    // Pooled Zero-GC Wind-Slanted Rain Streaks & Firefly Particle Systems
    this.rainStreaks = this.buildRainStreaks();
    this.rainStreaks.userData.isWorldVfx = true;
    this.rainStreaks.visible = false;
    this.scene.add(this.rainStreaks);

    this.fireflyPoints = this.buildFireflyParticles();
    this.fireflyPoints.userData.isWorldVfx = true;
    this.fireflyPoints.visible = false;
    this.scene.add(this.fireflyPoints);

    // Automated Startup 3D Scene Static Integrity Linter (SceneValidator)
    const stations: StationSlot[] = [
      ...this.living.getStations(),
      { id: 'station_main_entrance', label: 'Main Entrance', x: 0, y: 0, z: 31.0, radius: 0.32, height: 1.72 },
      { id: 'station_lower_hall', label: 'Lower Hall Center', x: 0, y: 0.25, z: 19.6, radius: 0.32, height: 1.72 },
      { id: 'station_upper_hall', label: 'Upper Hall Worship', x: 0, y: 0.85, z: -1.8, radius: 0.32, height: 1.72 },
    ];
    const containedEntities: ContainedEntityRef[] = [
      ...this.arch.koiGroup.children.map((child, idx) => ({
        id: `pond_koi_${idx}`,
        domainId: 'half_moon_pond',
        object: child,
      })),
      { id: 'vat_koi_0', domainId: 'courtyard_water_vat', object: this.props.vatKoi },
      { id: 'caged_hwamei_0', domainId: 'hwamei_birdcage', object: this.props.hwameiBirdObject },
    ];

    this.sceneValidator = new SceneValidator();
    this.scene.add(this.sceneValidator.getDebugWireframeGroup());
    const runValidation = () =>
      this.sceneValidator.validateAll({
        sceneRoot: this.scene,
        compiled: this.arch.compiled,
        physicsKernel: this.physicsKernel,
        stations,
        containedEntities,
      });
    this.validationReport = runValidation();
    document.body.dataset.sceneValidatorErrors = String(this.validationReport.totalErrors);
    document.body.dataset.sceneValidatorPassed = String(this.validationReport.passed);
    (window as unknown as Record<string, unknown>).__SCENE_VALIDATOR__ = {
      report: this.validationReport,
      revalidate: () => {
        this.validationReport = runValidation();
        document.body.dataset.sceneValidatorErrors = String(this.validationReport.totalErrors);
        document.body.dataset.sceneValidatorPassed = String(this.validationReport.passed);
        return this.validationReport;
      },
    };

    // Pillar 4: Physical Camera Post-Processing Pipeline (GPU-only so software WebGL never stalls)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2))),
        0.22,
        0.48,
        0.94
      );
      this.composer.addPass(this.bloomPass);
      this.lensPass = new ShaderPass(PHYSICAL_LENS_OPTICS_SHADER);
      this.composer.addPass(this.lensPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.applyWeather('sunny');
    this.emitHudSnapshot(true);
    this.startLoop();
  }

  /**
   * Pillar 1 & 2: Generates a physical outdoor sky + sunlit courtyard bounce PMREM environment
   * tailored to each weather state so metallic gold, cinnabar lacquer, porcelain, and wet stone
   * reflect authentic sky gradients, solar highlights, jade hills, and warm earth radiosity.
   */
  private bakePhysicalOutdoorEnv(
    pmrem: THREE.PMREMGenerator,
    mode: 'sunny' | 'rain' | 'night'
  ): THREE.Texture {
    const envScene = new THREE.Scene();
    const disposables: Array<{ dispose: () => void }> = [];

    const cfg =
      mode === 'sunny'
        ? {
            zenith: 0x3a88d4,
            horizon: 0xf7e8cb,
            ground: 0xc29e70,
            hills: 0x4f8a6e,
            sunCol: 0xfff4d6,
            sunInt: 3.4,
            sunPos: [14, 11, 10] as [number, number, number],
          }
        : mode === 'rain'
          ? {
              zenith: 0x6c8698,
              horizon: 0xcad6d8,
              ground: 0x5d6b66,
              hills: 0x4d6b66,
              sunCol: 0xe6eff2,
              sunInt: 1.4,
              sunPos: [5, 16, 6] as [number, number, number],
            }
          : {
              zenith: 0x102042,
              horizon: 0x3b385a,
              ground: 0x4b2f1c,
              hills: 0x1a2842,
              sunCol: 0xffa652,
              sunInt: 2.2,
              sunPos: [0, 3, 12] as [number, number, number],
            };

    // Sky hemisphere dome
    const skyGeo = new THREE.SphereGeometry(28, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uZen: { value: new THREE.Color(cfg.zenith) },
        uHor: { value: new THREE.Color(cfg.horizon) },
        uHill: { value: new THREE.Color(cfg.hills) },
        uGnd: { value: new THREE.Color(cfg.ground) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vD;
        void main() {
          vD = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZen;
        uniform vec3 uHor;
        uniform vec3 uHill;
        uniform vec3 uGnd;
        varying vec3 vD;
        void main() {
          float y = vD.y;
          vec3 col = mix(uHor, uZen, smoothstep(0.05, 0.72, y));
          col = mix(col, uHill, smoothstep(0.08, -0.08, y) * (1.0 - smoothstep(-0.08, -0.26, y)));
          col = mix(col, uGnd, smoothstep(-0.08, -0.35, y));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));
    disposables.push(skyGeo, skyMat);

    // High-dynamic-range solar / lantern specular emitter disc (soft broad canopy in overcast rain)
    const emitterRadius = mode === 'rain' ? 12.0 : 3.2;
    const emitterScale = mode === 'rain' ? 0.58 : cfg.sunInt;
    const emitterGeo = new THREE.SphereGeometry(emitterRadius, 12, 10);
    const emitterMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cfg.sunCol).multiplyScalar(emitterScale),
    });
    const emitter = new THREE.Mesh(emitterGeo, emitterMat);
    emitter.position.set(cfg.sunPos[0], cfg.sunPos[1], cfg.sunPos[2]);
    envScene.add(emitter);
    disposables.push(emitterGeo, emitterMat);

    // Warm sunlit courtyard reflector card below horizon for authentic upward GI sheen
    const bounceGeo = new THREE.PlaneGeometry(24, 24);
    const bounceMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cfg.ground).multiplyScalar(mode === 'sunny' ? 1.35 : 0.9),
    });
    const bounceCard = new THREE.Mesh(bounceGeo, bounceMat);
    bounceCard.rotation.x = -Math.PI * 0.5;
    bounceCard.position.y = -10;
    envScene.add(bounceCard);
    disposables.push(bounceGeo, bounceMat);

    const rt = pmrem.fromScene(envScene, 0.035);
    disposables.forEach((d) => d.dispose());
    return rt.texture;
  }

  private buildSculptedClouds(): THREE.Group {
    const group = new THREE.Group();
    const puffGeoA = createSoftPillowGeometry(1, 1.4, 0.78, 12, 9);
    const puffGeoB = createSoftPillowGeometry(1, 4.7, 0.72, 12, 9);
    const cloudConfigs: Array<[number, number, number, number, number]> = [
      [-92, 42, -108, 1.38, 0.42],
      [-32, 48, -126, 1.72, 0.36],
      [38, 45, -118, 1.56, 0.45],
      [96, 40, -96, 1.32, 0.38],
      [-115, 38, -28, 1.25, 0.34],
      [112, 42, -18, 1.34, 0.4],
      [-74, 46, 78, 1.18, 0.35],
      [68, 44, 86, 1.3, 0.38],
      [2, 54, -142, 1.9, 0.3],
      [-58, 39, -76, 1.08, 0.48],
      [64, 40, -72, 1.15, 0.44],
      [-14, 46, 102, 1.22, 0.36],
    ];

    cloudConfigs.forEach(([cx, cy, cz, sc, speed], idx) => {
      const cg = new THREE.Group();
      cg.position.set(cx, cy, cz);
      cg.rotation.y = (idx % 2 === 0 ? 1 : -1) * 0.28 + idx * 0.14;
      cg.userData = { baseX: cx, baseY: cy, baseZ: cz, speed, phase: idx * 1.1 };

      const mirror = idx % 2 === 0 ? 1 : -1;
      // Flat-bottomed soft shaded cumulus underbelly
      for (const [ox, oy, oz, sx, sy, sz] of [
        [-4.8 * mirror, -0.85, 0.3, 4.2, 1.25, 2.8],
        [-0.4 * mirror, -1.05, 0.0, 5.8, 1.45, 3.4],
        [4.4 * mirror, -0.75, -0.35, 3.8, 1.15, 2.6],
        [7.4 * mirror, -0.55, 0.2, 2.4, 0.9, 1.9],
      ]) {
        const bot = new THREE.Mesh(puffGeoB, this.cloudVolumetricMat);
        bot.position.set(ox, oy, oz);
        bot.scale.set(sx, sy, sz);
        cg.add(bot);
      }
      // Asymmetric billowing upper crests
      for (const [ox, oy, oz, sx, sy, sz] of [
        [-4.2 * mirror, 0.4, 0.25, 3.6, 2.0, 2.7],
        [-1.1 * mirror, 1.65, -0.1, 4.7, 3.1, 3.1],
        [2.6 * mirror, 1.15, 0.15, 3.9, 2.45, 2.8],
        [5.6 * mirror, 0.25, -0.2, 2.8, 1.6, 2.2],
        [-2.2 * mirror, 0.85, 1.15, 2.9, 1.9, 2.3],
        [0.9 * mirror, 2.35, -0.45, 2.6, 2.0, 2.2],
      ]) {
        const top = new THREE.Mesh(puffGeoA, this.cloudVolumetricMat);
        top.position.set(ox, oy, oz);
        top.scale.set(sx, sy, sz);
        cg.add(top);
      }

      cg.scale.setScalar(sc);
      group.add(cg);
    });

    return group;
  }

  private buildHeldUmbrella(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0.32, 0.22, -0.58);
    g.rotation.set(0.15, 0, -0.18);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.9, 8),
      this.mats.darkTimber
    );
    pole.position.y = -0.25;
    g.add(pole);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.2, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xc9422c,
        roughness: 0.45,
        side: THREE.DoubleSide,
      })
    );
    canopy.position.y = 0.22;
    g.add(canopy);
    return g;
  }

  /**
   * Builds a depth-layered, wind-slanted rain streak system (LineSegments) with
   * analytical roof-occlusion culling so rain never falls through covered ceilings!
   */
  private buildRainStreaks(): THREE.LineSegments {
    const count = this.isSoftwareGl ? 720 : 1400;
    const positions = new Float32Array(count * 6); // 2 vertices (head + tail) per streak
    const colors = new Float32Array(count * 6);
    // Per-streak metadata: [x, y, z, speed, length, windTiltX]
    this.rainStreakData = new Float32Array(count * 6);

    const spawnStreak = (i: number, randomY: boolean) => {
      // Sample around the compound and skywells, avoiding covered roof footprints for streaks below roof height
      let sx = 0;
      let sz = 0;
      const isNearBand = i < count * 0.42;
      const rangeX = isNearBand ? 32 : 76;
      const rangeZ = isNearBand ? 46 : 98;
      // Bias near-band slightly toward courtyard & skywells
      for (let attempt = 0; attempt < 6; attempt++) {
        sx = (Math.random() - 0.5) * rangeX;
        sz = (Math.random() - 0.5) * rangeZ + (isNearBand ? 10 : 2);
        if (!isUnderRoof(sx, sz)) break;
      }
      const sy = randomY ? Math.random() * 26 : 21 + Math.random() * 7;
      const speed = isNearBand ? 21.5 + Math.random() * 7.0 : 25.0 + Math.random() * 8.0;
      const len = isNearBand ? 0.52 + Math.random() * 0.36 : 0.78 + Math.random() * 0.52;
      const windX = -0.14 - Math.random() * 0.05; // cohesive gentle Lingnan monsoon wind lean
      const base = i * 6;
      this.rainStreakData[base] = sx;
      this.rainStreakData[base + 1] = sy;
      this.rainStreakData[base + 2] = sz;
      this.rainStreakData[base + 3] = speed;
      this.rainStreakData[base + 4] = len;
      this.rainStreakData[base + 5] = windX;

      const tailX = sx - windX * len;
      const tailY = sy + len;
      const tailZ = sz - 0.07 * len;
      positions[base] = sx;
      positions[base + 1] = sy;
      positions[base + 2] = sz;
      positions[base + 3] = tailX;
      positions[base + 4] = tailY;
      positions[base + 5] = tailZ;

      // Crisp bright falling head -> faint translucent tail for true motion-blur depth feel
      const depthBright = isNearBand ? 0.96 : 0.72;
      colors[base] = 0.84 * depthBright;
      colors[base + 1] = 0.91 * depthBright;
      colors[base + 2] = 0.98 * depthBright;
      colors[base + 3] = 0.38 * depthBright;
      colors[base + 4] = 0.46 * depthBright;
      colors[base + 5] = 0.54 * depthBright;
    };

    for (let i = 0; i < count; i++) {
      spawnStreak(i, true);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      depthTest: true,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    return lines;
  }

  private buildFireflyParticles(): THREE.Points {
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Cluster half in Rear Fengshui Forest and half around Half-Moon Pond
      if (i < 55) {
        positions[i * 3] = (Math.random() - 0.5) * 34;
        positions[i * 3 + 1] = 2.8 + Math.random() * 3.8;
        positions[i * 3 + 2] = -46 - Math.random() * 14;
      } else {
        positions[i * 3] = (Math.random() - 0.5) * 30;
        positions[i * 3 + 1] = 0.5 + Math.random() * 2.2;
        positions[i * 3 + 2] = 38 + Math.random() * 11;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe478,
      size: 0.24,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    document.addEventListener('mousemove', this.handleLockedMouseMove);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('wheel', this.handleWheel, { passive: true });
    dom.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    dom.addEventListener('webglcontextlost', this.handleContextLost);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
  }

  private handleContextMenu = (e: MouseEvent): void => {
    if (this.mode === 'playing') {
      e.preventDefault();
    }
  };

  private handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    document.body.dataset.pointerLocked = locked ? 'true' : 'false';
    if (!locked) {
      this.middleMouseDown = false;
    }
    this.emitHudSnapshot(true);
  };

  private handlePointerLockError = (): void => {
    this.pointerLocked = false;
    document.body.dataset.pointerLocked = 'false';
  };

  private applyCameraOrbitDelta(dx: number, dy: number, isTouch: boolean): void {
    const yawSens = isTouch ? 0.0058 : 0.0036;
    const pitchSens = isTouch ? 0.0048 : 0.003;
    this.timeSinceManualOrbit = 0;

    if (this.cameraView === 'aerial') {
      this.aerialAngle -= dx * (isTouch ? 0.006 : 0.0046);
      this.aerialPitch = THREE.MathUtils.clamp(
        this.aerialPitch + dy * (isTouch ? 0.0048 : 0.0036),
        0.26,
        1.25
      );
    } else if (this.cameraView === 'first_person') {
      this.targetCameraYaw = normalizeAngle(this.targetCameraYaw - dx * yawSens);
      this.targetCameraPitch = THREE.MathUtils.clamp(
        this.targetCameraPitch - dy * pitchSens,
        -0.82,
        0.74
      );
    } else {
      // Authentic GTA third-person free orbit: moving mouse/finger right turns view right, moving up looks up
      this.targetCameraYaw = normalizeAngle(this.targetCameraYaw - dx * yawSens);
      this.targetCameraPitch = THREE.MathUtils.clamp(
        this.targetCameraPitch - dy * pitchSens,
        -0.88,
        0.58
      );
    }
  }

  private handleLockedMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked || this.mode !== 'playing') return;
    // Clamp occasional browser pointer-lock spike values
    const dx = THREE.MathUtils.clamp(e.movementX || 0, -140, 140);
    const dy = THREE.MathUtils.clamp(e.movementY || 0, -140, 140);
    if (dx === 0 && dy === 0) return;
    this.applyCameraOrbitDelta(dx, dy, false);
  };

  private handleWheel = (e: WheelEvent): void => {
    if (this.mode !== 'playing') return;
    if (this.cameraView === 'aerial') {
      this.aerialDist = THREE.MathUtils.clamp(this.aerialDist + e.deltaY * 0.045, 28, 105);
    } else if (this.cameraView !== 'first_person') {
      const preset = GTA_CAMERA_PRESETS[this.cameraView];
      this.desiredThirdPersonDist = THREE.MathUtils.clamp(
        this.desiredThirdPersonDist + e.deltaY * 0.0045,
        preset.minDistance,
        preset.maxDistance
      );
    }
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(320, this.container.clientWidth || window.innerWidth);
    const h = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    }
    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private handleWindowBlur = (): void => {
    this.keysHeld.clear();
    this.activePointers.clear();
    this.lastPinchDist = null;
    this.middleMouseDown = false;
    this.lookBackHeld = false;
    this.virtualMoveRight = 0;
    this.virtualMoveForward = 0;
    this.virtualAutoSprint = false;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.handleWindowBlur();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.mode !== 'playing') return;
    this.audio.unlock();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!this.keysHeld.has(e.code)) {
      // Edge-triggered one-shots
      if (e.code === 'KeyE' || e.code === 'Space') {
        this.triggerNearbyInteraction();
      } else if (e.code === 'Digit1') {
        this.applyWeather('sunny');
      } else if (e.code === 'Digit2') {
        this.applyWeather('rain');
      } else if (e.code === 'KeyV') {
        this.toggleCameraView();
      }
    }
    this.keysHeld.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'playing') return;
    this.audio.unlock();

    // Middle mouse button = GTA classic Rear-View Look-Back
    if (e.pointerType === 'mouse' && e.button === 1) {
      e.preventDefault();
      this.middleMouseDown = true;
      return;
    }

    // If pointer is already locked on desktop, left click triggers nearby interaction
    if (this.pointerLocked && e.pointerType === 'mouse') {
      if (e.button === 0 && this.nearbyInteractable) {
        this.triggerInteractionById(this.nearbyInteractable.id);
      }
      return;
    }

    this.activePointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
    });

    if (this.activePointers.size === 1) {
      this.dragMoved = false;
      this.lastPinchDist = null;
    } else if (this.activePointers.size === 2) {
      this.dragMoved = true;
      const pts = Array.from(this.activePointers.values());
      this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'playing' || this.pointerLocked) return;
    const prev = this.activePointers.get(e.pointerId);
    if (!prev) return;

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY) > 6) {
      this.dragMoved = true;
    }

    // Two-finger pinch-to-zoom on mobile/touchpad
    if (this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.lastPinchDist !== null) {
        const delta = this.lastPinchDist - curDist;
        if (this.cameraView === 'aerial') {
          this.aerialDist = THREE.MathUtils.clamp(this.aerialDist + delta * 0.16, 28, 105);
        } else if (this.cameraView !== 'first_person') {
          const preset = GTA_CAMERA_PRESETS[this.cameraView];
          this.desiredThirdPersonDist = THREE.MathUtils.clamp(
            this.desiredThirdPersonDist + delta * 0.02,
            preset.minDistance,
            preset.maxDistance
          );
        }
      }
      this.lastPinchDist = curDist;
      return;
    }

    this.applyCameraOrbitDelta(dx, dy, prev.pointerType !== 'mouse');
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button === 1) {
      this.middleMouseDown = false;
      return;
    }

    const tracked = this.activePointers.get(e.pointerId);
    if (!tracked) return;
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size < 2) {
      this.lastPinchDist = null;
    }
    if (this.mode !== 'playing' || this.activePointers.size > 0) return;

    // Clean click/tap (without drag): raycast interactables first; on desktop mouse also lock pointer for GTA look!
    if (!this.dragMoved) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      _rayOrigin.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _rayOrigin.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(_rayOrigin, this.camera);
      this.raycaster.far = 16;
      const hits = this.raycaster.intersectObjects(this.props.interactableMeshes, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData?.interactableId as string | undefined;
        if (id) {
          this.triggerInteractionById(id);
          return;
        }
      }

      if (tracked.pointerType === 'mouse' && e.button === 0 && this.cameraView !== 'aerial') {
        // GTA PC feel: clicking canvas engages free mouse-look via Pointer Lock (graceful fallback if blocked)
        this.requestPointerLock();
      } else if (this.nearbyInteractable) {
        this.triggerInteractionById(this.nearbyInteractable.id);
      }
    }
  };

  // =========================================================================
  // PUBLIC CONTROLS FOR REACT SHELL & MOBILE TOUCH CONTROLS
  // =========================================================================

  public requestPointerLock(): void {
    try {
      const dom = this.renderer.domElement;
      if (
        this.mode === 'playing' &&
        typeof dom.requestPointerLock === 'function' &&
        document.pointerLockElement !== dom
      ) {
        const res = dom.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            // Silently fall back to drag-to-orbit if sandbox/browser blocks pointer lock
          });
        }
      }
    } catch {
      // Drag-to-orbit fallback remains seamlessly active
    }
  }

  public exitPointerLock(): void {
    try {
      if (document.pointerLockElement && typeof document.exitPointerLock === 'function') {
        document.exitPointerLock();
      }
    } catch {
      // Ignore
    }
  }

  public isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  public setVirtualMove(right: number, forward: number, autoSprint = false): void {
    this.virtualMoveRight = THREE.MathUtils.clamp(right, -1, 1);
    this.virtualMoveForward = THREE.MathUtils.clamp(forward, -1, 1);
    this.virtualAutoSprint = autoSprint;
  }

  public setVirtualSprint(active: boolean): void {
    this.virtualSprintToggle = active;
    this.emitHudSnapshot(true);
  }

  public setLookBack(active: boolean): void {
    this.lookBackHeld = active;
  }

  public setMode(mode: GameMode, fromUserGesture = false): void {
    this.mode = mode;
    if (mode !== 'playing') {
      this.exitPointerLock();
      this.keysHeld.clear();
      this.activePointers.clear();
      this.lastPinchDist = null;
      this.middleMouseDown = false;
      this.lookBackHeld = false;
      this.virtualMoveRight = 0;
      this.virtualMoveForward = 0;
      this.virtualAutoSprint = false;
      this.gunSlitActive = false;
      this.playerVelX = 0;
      this.playerVelZ = 0;
      this.eyeYVel = 0;
    } else {
      if (fromUserGesture) {
        this.audio.unlock();
      }
      this.cameraYaw = this.targetCameraYaw;
      this.cameraPitch = this.targetCameraPitch;
      this.cameraRigInitialized = false;
      const preset = GTA_CAMERA_PRESETS[this.cameraView];
      this.camera.fov = preset.fov;
      this.camera.updateProjectionMatrix();
    }
    this.syncAvatarAndUmbrellaVisibility();
    this.emitHudSnapshot(true);
  }

  public resetToEntrance(): void {
    this.playerPos.set(0, 0, 31.0);
    this.physicsKernel.syncBodyPosition('player', this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.playerVelX = 0;
    this.playerVelZ = 0;
    this.eyeYVel = 0;
    this.characterYaw = 0;
    this.cameraYaw = 0;
    this.targetCameraYaw = 0;
    this.cameraPitch = -0.18;
    this.targetCameraPitch = -0.18;
    this.cameraView = 'third_mid';
    this.desiredThirdPersonDist = GTA_CAMERA_PRESETS.third_mid.distance;
    this.smoothedThirdPersonDist = GTA_CAMERA_PRESETS.third_mid.distance;
    this.cameraRigInitialized = false;
    this.gunSlitActive = false;
    this.camera.fov = GTA_CAMERA_PRESETS.third_mid.fov;
    this.camera.updateProjectionMatrix();
    this.playerAvatar.root.position.copy(this.playerPos);
    this.playerAvatar.root.rotation.y = this.characterYaw;
    this.syncAvatarAndUmbrellaVisibility();
    this.emitHudSnapshot(true);
  }

  public setPlayerPose(x: number, z: number, yaw: number, pitch = -0.16): void {
    const gy = groundHeightAt(x, z, 0);
    this.playerPos.set(x, gy, z);
    this.physicsKernel.syncBodyPosition('player', x, gy, z);
    this.eyeYVel = 0;
    this.playerVelX = 0;
    this.playerVelZ = 0;
    this.characterYaw = normalizeAngle(yaw);
    this.cameraYaw = normalizeAngle(yaw);
    this.targetCameraYaw = normalizeAngle(yaw);
    this.cameraPitch = pitch;
    this.targetCameraPitch = pitch;
    if (this.cameraView === 'aerial') {
      this.cameraView = 'third_mid';
    }
    this.cameraRigInitialized = false;
    this.playerAvatar.root.position.copy(this.playerPos);
    this.playerAvatar.root.rotation.y = this.characterYaw;
    this.visitedNodes.add(detectNodeIdAt(x, z, gy));
    this.syncAvatarAndUmbrellaVisibility();
    this.emitHudSnapshot(true);
  }

  public setCameraView(view: CameraViewMode): void {
    const prevView = this.cameraView;
    this.cameraView = view;
    this.gunSlitActive = false;
    const preset = GTA_CAMERA_PRESETS[view];
    if (!preset.isAerial && !preset.isFirstPerson) {
      this.desiredThirdPersonDist = preset.distance;
      if (prevView === 'first_person' || prevView === 'aerial') {
        this.cameraRigInitialized = false;
        this.targetCameraPitch = THREE.MathUtils.clamp(this.targetCameraPitch, -0.5, 0.25);
        if (Math.abs(this.targetCameraPitch) < 0.04) {
          this.targetCameraPitch = -0.16;
        }
      }
    } else if (preset.isFirstPerson) {
      // Align first-person look cleanly with camera heading
      this.characterYaw = this.cameraYaw;
      this.targetCameraPitch = THREE.MathUtils.clamp(this.targetCameraPitch, -0.45, 0.45);
    }
    if (preset.isAerial) {
      this.exitPointerLock();
    }
    this.camera.fov = preset.fov;
    this.camera.updateProjectionMatrix();
    this.syncAvatarAndUmbrellaVisibility();
    this.emitHudSnapshot(true);
  }

  public toggleCameraView(): void {
    this.setCameraView(cycleCameraView(this.cameraView));
  }

  private syncAvatarAndUmbrellaVisibility(): void {
    const isFirstPersonPlaying =
      this.mode === 'playing' && this.cameraView === 'first_person';
    this.playerAvatar.setVisible(!isFirstPersonPlaying);
    this.umbrellaHeldGroup.visible = isFirstPersonPlaying && this.holdingUmbrella;
    this.playerAvatar.umbrellaInHand.visible = !isFirstPersonPlaying && this.holdingUmbrella;
  }

  public setTimeOfDay(hour: number): void {
    this.timeOfDay = normalizeHour(hour);
    this.applyAtmosphereForTime(true);
    this.emitHudSnapshot(true);
  }

  public setTimePlaying(playing: boolean): void {
    this.timePlaying = playing;
    this.emitHudSnapshot(true);
  }

  public setTimeSpeed(speed: number): void {
    this.timeSpeed = Math.max(1, Math.min(120, speed));
    this.emitHudSnapshot(true);
  }

  public setVolume(vol: number): void {
    this.audio.unlock();
    this.audio.setVolume(vol);
    this.emitHudSnapshot(true);
  }

  public applyWeather(weather: WeatherMode): void {
    this.weather = weather;
    this.audio.setWeatherAmbience(weather);
    this.applyAtmosphereForTime(true);
    this.emitHudSnapshot(true);
  }

  /**
   * Synchronizes sky dome, celestial light orbit, GI bounce, fog, clouds, wet dielectric clearcoat,
   * lantern & window emissives, grain mats, fireflies, rain, and water reflections from 24h time & weather.
   */
  private applyAtmosphereForTime(forceEnvCheck = false): void {
    const dn = computeDayNightState(this.timeOfDay, this.weather);
    const behavior = evaluateLivingBehavior(this.timeOfDay, this.weather);

    this.timePeriodLabel = dn.periodLabel;
    this.formattedTime = dn.formattedTime;

    this.arch.skyDome.visible = false;
    this.poeticSky.visible = true;

    const desiredEnv: 'sunny' | 'rain' | 'night' =
      this.weather === 'rain' ? 'rain' : dn.nightFactor > 0.52 ? 'night' : 'sunny';
    if (forceEnvCheck || desiredEnv !== this.activeEnvKey) {
      this.activeEnvKey = desiredEnv;
      this.scene.environment = this.envMaps[desiredEnv];
    }

    this.renderer.toneMappingExposure = dn.exposure;
    this.scene.environmentIntensity = dn.envIntensity;

    // Sky shader uniforms
    this.skyUniforms.uZen.value.setHex(dn.skyZenith);
    this.skyUniforms.uMid.value.setHex(dn.skyMid);
    this.skyUniforms.uHor.value.setHex(dn.skyHorizon);
    this.skyUniforms.uHs.value.setHex(dn.skySunGlow);
    this.skyUniforms.uGnd.value.setHex(dn.skyGround);
    this.skyUniforms.uTwilightCol.value.setHex(
      dn.dawnFactor >= dn.duskFactor ? 0xf8ad78 : 0xf27d52
    );
    this.skyUniforms.uSunDir.value.set(dn.sunDir[0], dn.sunDir[1], dn.sunDir[2]);
    this.skyUniforms.uMoonDir.value.set(dn.moonDir[0], dn.moonDir[1], dn.moonDir[2]);
    this.skyUniforms.uSunStr.value = dn.sunStrength;
    this.skyUniforms.uMoonStr.value = dn.moonStrength;
    this.skyUniforms.uStarStr.value = dn.starStrength;
    this.skyUniforms.uTwilight.value = dn.twilightFactor;
    this.skyUniforms.uRain.value = dn.rainFactor;

    this.cloudUniforms.uTopCol.value.setHex(dn.cloudTopColor);
    this.cloudUniforms.uBotCol.value.setHex(dn.cloudBotColor);
    this.cloudUniforms.uSunDir.value.set(dn.sunDir[0], dn.sunDir[1], dn.sunDir[2]).normalize();
    this.cloudUniforms.uRain.value = dn.rainFactor;
    const cloudFade = Math.max(dn.rainFactor * 0.65, 1 - dn.nightFactor * 1.15);
    this.cloudUniforms.uOpacity.value = Math.min(0.92, 0.88 * cloudFade);
    this.cloudGroup.visible = cloudFade > 0.04;

    (this.scene.background as THREE.Color).setHex(dn.skyMid);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(dn.fogColor);
    fog.density = dn.fogDensity;

    // Brief subtle cool-white thunderstorm lightning ambient boost during intra-cloud flashes
    const flash = this.weather === 'rain' && this.lightningActive
      ? computeLightningEnvelope(this.lightningElapsed) * this.lightningIntensity
      : 0;
    this.skyUniforms.uLightning.value = flash;
    this.cloudUniforms.uLightning.value = flash;

    // Primary celestial directional light tracks Sun by day and Moon by night (keeping y >= 12 for crisp shadows)
    const useMoon = dn.nightFactor > 0.5;
    const ld = useMoon ? dn.moonDir : dn.sunDir;
    const lightY = Math.max(0.24, Math.abs(ld[1]));
    this.sunLight.position.set(ld[0] * 64, lightY * 58, ld[2] * 64);
    this.sunLight.color.setHex(dn.sunLightColor);
    if (flash > 0.02) {
      this.sunLight.color.lerp(this.lightningTintColor, flash * 0.45);
    }
    this.sunLight.intensity = dn.sunLightIntensity + flash * 0.62;

    this.hemiLight.color.setHex(dn.hemiSkyColor);
    this.hemiLight.groundColor.setHex(dn.hemiGroundColor);
    this.hemiLight.intensity = dn.hemiIntensity + flash * 0.36;

    this.groundBounceLight.color.setHex(dn.bounceLightColor);
    this.groundBounceLight.intensity = dn.bounceLightIntensity;

    this.skyRimLight.color.setHex(dn.rimLightColor);
    this.skyRimLight.intensity = dn.rimLightIntensity + flash * 0.28;

    // Shared physical environment shader uniforms
    physicalEnvUniforms.uSunDir.value.set(ld[0], lightY, ld[2]).normalize();
    physicalEnvUniforms.uSunColor.value.setHex(dn.sunLightColor);
    physicalEnvUniforms.uBounceColor.value.setHex(dn.bounceLightColor);
    physicalEnvUniforms.uSkyColor.value.setHex(dn.hemiSkyColor);
    physicalEnvUniforms.uWetness.value = dn.rainFactor;
    physicalEnvUniforms.uNightFactor.value = dn.nightFactor;

    // Physical rainwater dielectric film on roof tiles, courtyard slabs & cobbles
    const isRain = this.weather === 'rain';
    this.mats.wettableMaterials.forEach((m) => {
      const isTile = m === this.mats.roofTile || m === this.mats.roofTileDark;
      if (isRain) {
        m.clearcoat = isTile ? 0.54 : 0.78;
        m.clearcoatRoughness = isTile ? 0.26 : 0.12;
      } else {
        m.clearcoat = isTile ? 0.08 + dn.nightFactor * 0.06 : dn.nightFactor * 0.04;
        m.clearcoatRoughness = isTile ? 0.42 : 0.30;
      }
    });
    this.mats.huataiCobble.roughness = isRain ? 0.30 : THREE.MathUtils.lerp(0.82, 0.68, dn.nightFactor);

    // Warm lanterns & interior lattice windows glow automatically at dusk, night, or rain
    const dingBoost = this.dingLanternLit ? 1.15 : 0;
    this.mats.windowLattice.emissiveIntensity = 0.08 + dn.windowGlow * 1.68;
    this.mats.lanternPaper.emissiveIntensity = 0.36 + dn.lanternGlow * 2.38 + dingBoost * 0.6;
    const lanternIntensity = 0.14 + dn.lanternGlow * 6.2;
    for (let i = 0; i < this.arch.lanternLights.length; i++) {
      const l = this.arch.lanternLights[i];
      l.distance = 28;
      l.intensity = lanternIntensity;
    }

    if (this.bloomPass) {
      this.bloomPass.strength = 0.20 + dn.lanternGlow * 0.24;
      this.bloomPass.threshold = THREE.MathUtils.lerp(0.94, 0.84, dn.nightFactor);
    }
    if (this.lensPass) {
      this.lensPass.uniforms.uVignette.value = 0.20 + dn.nightFactor * 0.08 + dn.rainFactor * 0.04;
    }

    // Rain curtains, wind-slanted rain streaks & fireflies
    this.rainStreaks.visible = isRain;
    for (let i = 0; i < this.arch.rainCurtainMeshes.length; i++) {
      this.arch.rainCurtainMeshes[i].visible = isRain;
    }
    this.fireflyPoints.visible = behavior.firefliesActive;
  }

  public markArtifactInspected(artifactId: string): void {
    this.inspectedArtifacts.add(artifactId);
    this.emitHudSnapshot(true);
  }

  public triggerNearbyInteraction(): void {
    if (this.nearbyInteractable) {
      this.triggerInteractionById(this.nearbyInteractable.id);
    }
  }

  public triggerInteractionById(id: string): void {
    const def = INTERACTABLE_MAP.get(id);
    if (!def) return;

    this.triggeredInteractions.add(id);
    this.audio.playInteractionSound(id);

    let customHakka = def.hakkaQuote;
    let customMandarin = def.mandarinSub;
    let customNote = def.culturalNote;

    // Trigger bespoke 3D animations & interactive micro-gameplay per prop!
    switch (id) {
      case 'int_doumen_gate':
        this.doumenOpen = !this.doumenOpen;
        this.physicsKernel.setDoumenOpen(this.doumenOpen);
        customMandarin = this.doumenOpen
          ? '抽开重型横木栓，双开厚木斗门吱呀敞开，可自由出入禾坪！'
          : '合拢重型厚木斗门并落栓上锁，整座围龙屋即成坚固堡垒。';
        break;

      case 'int_xiatang_umbrella':
        this.holdingUmbrella = !this.holdingUmbrella;
        this.syncAvatarAndUmbrellaVisibility();
        if (def.artifactId) this.callbacks.onInspectArtifact(def.artifactId);
        break;

      case 'int_zhongtang_abacus':
      case 'int_zhongtang_genealogy':
      case 'int_bedroom_mirror':
      case 'int_weaving_loom':
      case 'int_qiaopi_letter':
        if (id === 'int_weaving_loom') this.loomTimer = 3.5;
        if (def.artifactId) this.callbacks.onInspectArtifact(def.artifactId);
        break;

      case 'int_skywell_birdcage':
        this.birdcageSwingTimer = 4.2;
        this.hwameiSong.excite(7.0);
        break;

      case 'int_rear_mill':
        this.millSpinTimer = 4.2;
        break;

      case 'int_shangtang_incense':
        this.props.incenseSmokeGroup.visible = true;
        break;

      case 'int_shangtang_jiaobei': {
        this.jiaobeiAnimTimer = 1.6;
        const outcome = evaluateJiaobei(Math.random(), Math.random());
        this.jiaobeiFlipL = outcome.type === 'yin' ? Math.PI : 0;
        this.jiaobeiFlipR = outcome.type === 'xiao' ? 0 : Math.PI;
        customHakka = outcome.hakkaQuote;
        customMandarin = `${outcome.title} — ${outcome.meaning}`;
        break;
      }

      case 'int_shangtang_lantern':
        this.dingLanternLit = !this.dingLanternLit;
        this.mats.lanternPaper.emissiveIntensity = this.dingLanternLit ? 2.1 : 0.45;
        break;

      case 'int_bedroom_cradle':
        this.cradleRockTimer = 5.0;
        break;

      case 'int_study_lamp':
        this.studyLampBright = this.studyLampBright > 2.2 ? 0.6 : this.studyLampBright + 0.9;
        this.props.studyLampLight.intensity = this.studyLampBright;
        break;

      case 'int_kitchen_bellows':
        this.bellowsTimer = 3.6;
        this.props.wokSteamGroup.visible = true;
        break;

      case 'int_kitchen_leicha':
        this.leichaTimer = 4.0;
        break;

      case 'int_granary_winnower':
        this.winnowerTimer = 4.2;
        break;

      case 'int_gallery_pulley':
        this.pulleyRaised = !this.pulleyRaised;
        break;

      case 'int_watchtower_gong':
        this.trauma = 0.55;
        this.birdsFlightTimer = 6.5;
        this.props.startledBirds.visible = true;
        this.gunSlitActive = !this.gunSlitActive;
        this.camera.fov = this.gunSlitActive ? 34 : 56;
        this.camera.updateProjectionMatrix();
        break;

      case 'int_huatai_stones': {
        this.fiveElementsLit = Math.min(5, this.fiveElementsLit + 1);
        const names = ['金', '木', '水', '火', '土'];
        for (let i = 0; i < this.fiveElementsLit; i++) {
          const mat = this.props.fiveElementStones[i].material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 1.45;
        }
        if (this.fiveElementsLit >= 5) {
          customMandarin = '金木水火土五行石已全部点亮，护佑客家宗祠风调雨顺！';
        } else {
          customMandarin = `已点亮第 ${this.fiveElementsLit}/5 块五行石（${names[this.fiveElementsLit - 1]}），再轻触可齐聚五行。`;
        }
        break;
      }

      case 'int_carpentry_mortise':
        this.carpentryAssembled = !this.carpentryAssembled;
        customMandarin = this.carpentryAssembled
          ? '梁架穿枋顺卯口严丝合缝咬合归位，客家穿斗木构组装完成！'
          : '拆解穿斗榫卯节点，清晰观察柱头卯口与梁枋燕尾榫。';
        break;

      case 'int_daily_almanac': {
        const entry = LUNAR_ALMANAC_DAYS[this.almanacIdx % LUNAR_ALMANAC_DAYS.length];
        this.almanacIdx++;
        customMandarin = `撕下老黄历新页：${entry}`;
        break;
      }

      default:
        break;
    }

    this.callbacks.onSubtitle({
      id: `${id}-${Date.now()}`,
      title: def.name,
      hakkaQuote: customHakka,
      mandarinSub: customMandarin,
      culturalNote: customNote,
      tier: def.tier,
      timestamp: Date.now(),
    });
    this.emitHudSnapshot(true);
  }

  // =========================================================================
  // MAIN SIMULATION & SOFTWARE-WEBGL PACED RENDER LOOP
  // =========================================================================

  private startLoop(): void {
    this.lastTimeMs = performance.now();
    this.tick();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.updateScene(dt, now);
    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateScene(dt: number, nowMs: number): void {
    const t = nowMs * 0.001;
    physicalEnvUniforms.uTime.value = t;

    // 1. Camera Mode Choreography
    if (this.mode === 'title') {
      // Iconic elevated aerial vantage matching /public/assets/aistudio/image_2a7cd311.png
      this.titleTime += dt * 0.11;
      const orbitX = Math.sin(this.titleTime) * 15;
      const orbitZ = 62 + Math.cos(this.titleTime * 0.7) * 5;
      const orbitY = 29.5 + Math.sin(this.titleTime * 0.8) * 1.4;
      this.camera.position.set(orbitX, orbitY, orbitZ);
      this.camera.lookAt(0, 2.5, -5.0);
      this.playerAvatar.update(dt, 0, false, this.walkPhase, 0, this.holdingUmbrella, t);
    } else if (this.mode === 'playing') {
      if (this.cameraView === 'aerial') {
        const aerialTurn =
          (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0) -
          (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0) +
          this.virtualMoveRight;
        const aerialZoom =
          (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0) -
          (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0) +
          this.virtualMoveForward;
        this.aerialAngle += aerialTurn * dt * 0.95;
        this.aerialDist = THREE.MathUtils.clamp(this.aerialDist - aerialZoom * dt * 24, 28, 105);
        const horiz = Math.cos(this.aerialPitch) * this.aerialDist;
        const cy = Math.sin(this.aerialPitch) * this.aerialDist + 1.8;
        const cx = Math.sin(this.aerialAngle) * horiz;
        const cz = Math.cos(this.aerialAngle) * horiz - 3.5;
        this.camera.position.set(cx, cy, cz);
        this.camera.lookAt(0, 2.5, -5.0);
        this.playerAvatar.update(dt, 0, false, this.walkPhase, 0, this.holdingUmbrella, t);
      } else {
        this.updatePlayerMovement(dt, t);
      }
    }

    // 2. Smooth 24-Hour Day-Night Cycle, Thunderstorm Scheduler, Water Optics, Clouds & Audio Ambience
    if (this.mode === 'playing' && this.timePlaying) {
      // Base 1x speed = 1 game hour every 30s (full 24h in 12min); 60x = full 24h in 12s!
      this.timeOfDay = normalizeHour(this.timeOfDay + (dt / 30) * this.timeSpeed);
    }

    // Occasional natural thunderstorm intra-cloud lightning + speed-of-sound delayed thunder
    if (this.weather === 'rain') {
      if (this.lightningActive) {
        this.lightningElapsed += dt;
        if (this.lightningElapsed > 0.50) {
          this.lightningActive = false;
        }
      } else {
        this.nextLightningInSec -= dt;
        if (this.nextLightningInSec <= 0) {
          this.lightningSeed = (this.lightningSeed * 1664525 + 1013904223) >>> 0;
          const rA = (this.lightningSeed % 1000) / 1000;
          this.lightningSeed = (this.lightningSeed * 1664525 + 1013904223) >>> 0;
          const rB = (this.lightningSeed % 1000) / 1000;
          const az = -Math.PI * 0.85 + rA * Math.PI * 1.7;
          const el = 0.26 + rB * 0.28;
          this.skyUniforms.uLightningDir.value
            .set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
            .normalize();
          this.cloudUniforms.uLightningDir.value.copy(this.skyUniforms.uLightningDir.value);
          this.lightningIntensity = 0.58 + rB * 0.36;
          this.lightningElapsed = 0;
          this.lightningActive = true;
          this.nextLightningInSec = 13.5 + rA * 11.5; // tasteful ~13.5–25s interval
          const distanceMeters = 460 + rA * 820; // ~1.3s to 3.7s sound delay
          this.audio.playThunder(distanceMeters, this.lightningIntensity);
        }
      }
    } else {
      this.lightningActive = false;
      this.nextLightningInSec = 5.5;
    }

    this.applyAtmosphereForTime(false);

    const dnNow = computeDayNightState(this.timeOfDay, this.weather);
    this.skyUniforms.uTime.value = t;
    this.cloudUniforms.uTime.value = t;
    this.arch.updateWater(
      t,
      dnNow.nightFactor,
      dnNow.rainFactor,
      dnNow.skyZenith,
      dnNow.skyHorizon,
      dnNow.sunLightColor,
      dnNow.lanternGlow
    );
    this.living.update(dt, t, this.weather, this.timeOfDay, this.doumenOpen);
    const grainState = this.living.getGrainLiveState();
    this.props.updateGrainDrying(
      grainState.spread,
      grainState.basketFill,
      grainState.matDeployed,
      t,
      grainState.isGathering
    );

    const distToPond = Math.hypot(this.playerPos.x, this.playerPos.z - 42.5);
    this.audio.updateAmbience(this.timeOfDay, this.weather, distToPond);

    // Gentle cloud drift across the valley sky (slightly swifter & lower-slung in rain storm)
    const cloudSpeedMul = this.weather === 'rain' ? 2.15 : 1.0;
    const cloudDropY = this.weather === 'rain' ? -4.5 : 0.0;
    for (const c of this.cloudGroup.children) {
      const d = c.userData;
      c.position.x = ((d.baseX + t * d.speed * cloudSpeedMul + 150) % 300) - 150;
      c.position.y = d.baseY + cloudDropY + Math.sin(t * 0.22 + d.phase) * 0.7;
    }

    // Swimming Koi in Half-Moon Pond — strictly clamped inside half_moon_pond ContainerDomain
    for (const child of this.arch.koiGroup.children) {
      const d = child.userData;
      d.orbitAngle += dt * d.speed;
      const rawX = d.centerX + Math.cos(d.orbitAngle) * d.orbitRadiusX;
      const rawZ = d.centerZ + Math.sin(d.orbitAngle) * d.orbitRadiusZ;
      const clamped = this.physicsKernel.clampToContainer(
        'half_moon_pond',
        rawX,
        child.position.y,
        rawZ
      );
      child.rotation.y = Math.atan2(clamped.x - child.position.x, clamped.z - child.position.z);
      child.position.set(clamped.x, clamped.y, clamped.z);
    }

    // Courtyard Ceramic Vat Carp — gentle figure-8 clamped strictly inside courtyard_water_vat ContainerDomain
    {
      const vatX = -3.4;
      const vatY = 0.15;
      const vatZ = 13.6;
      const desiredWorldX = vatX + Math.cos(t * 0.65) * 0.16;
      const desiredWorldZ = vatZ + Math.sin(t * 1.3) * 0.11;
      const clampedVat = this.physicsKernel.clampToContainer(
        'courtyard_water_vat',
        desiredWorldX,
        vatY + 0.82,
        desiredWorldZ
      );
      const nextLocalX = clampedVat.x - vatX;
      const nextLocalY = clampedVat.y - vatY;
      const nextLocalZ = clampedVat.z - vatZ;
      const dx = nextLocalX - this.props.vatKoi.position.x;
      const dz = nextLocalZ - this.props.vatKoi.position.z;
      if (dx * dx + dz * dz > 1e-8) {
        this.props.vatKoi.rotation.y = Math.atan2(dx, dz);
      }
      this.props.vatKoi.position.set(nextLocalX, nextLocalY, nextLocalZ);
    }

    // Floating golden interaction beacons subtle bob
    for (const obj of this.props.root.children) {
      if (obj.userData?.isBeacon) {
        obj.position.y = obj.userData.baseY + Math.sin(t * 2.2 + obj.position.x) * 0.08;
        obj.rotation.y += dt * 1.1;
      }
    }

    // Smoothly swing Doumen heavy wooden gates
    const targetDoumen = this.doumenOpen ? Math.PI * 0.56 : 0;
    this.doumenAngle = THREE.MathUtils.damp(this.doumenAngle, targetDoumen, 4.5, dt);
    this.arch.doumenEastLeft.rotation.y = -this.doumenAngle;
    this.arch.doumenEastRight.rotation.y = this.doumenAngle;
    this.arch.doumenWestLeft.rotation.y = this.doumenAngle;
    this.arch.doumenWestRight.rotation.y = -this.doumenAngle;

    // Grain mill spinning
    if (this.millSpinTimer > 0) {
      this.millSpinTimer = Math.max(0, this.millSpinTimer - dt);
      this.props.millUpperStone.rotation.y -= dt * 1.8;
    }

    // Baby cradle gentle rocking
    if (this.cradleRockTimer > 0) {
      this.cradleRockTimer = Math.max(0, this.cradleRockTimer - dt);
      this.props.cradleBody.rotation.z = Math.sin(t * 4.5) * 0.22 * Math.min(1, this.cradleRockTimer);
    } else {
      this.props.cradleBody.rotation.z = THREE.MathUtils.damp(this.props.cradleBody.rotation.z, 0, 5, dt);
    }

    // Birdcage swinging + physical avian syrinx Chinese Hwamei songbird & 3D spatial sound propagation
    if (this.birdcageSwingTimer > 0) {
      this.birdcageSwingTimer = Math.max(0, this.birdcageSwingTimer - dt);
      this.props.birdcageGroup.rotation.z =
        Math.sin(t * 5.2) * 0.16 * Math.min(1, this.birdcageSwingTimer * 0.4);
    } else {
      this.props.birdcageGroup.rotation.z = Math.sin(t * 1.4) * 0.022;
    }

    const hwameiOut = this.hwameiSong.update(dt, this.timeOfDay, this.weather);
    this.lastHwameiAnim = hwameiOut.anim;
    this.props.updateHwameiBird(t, dt, hwameiOut.anim);

    // Real-time 3D acoustic propagation from perched Hwamei world position to camera listener
    this.props.birdcageGroup.getWorldPosition(_hwameiWorldPos);
    _hwameiWorldPos.y -= 1.10; // Perch height inside the hanging cage
    this.camera.getWorldDirection(_listenerForward);
    _listenerRight.crossVectors(_listenerForward, _worldUp);
    if (_listenerRight.lengthSq() < 1e-6) {
      _listenerRight.set(1, 0, 0);
    } else {
      _listenerRight.normalize();
    }
    const hwameiSpatial = computeHwameiSpatialAcoustics(
      _hwameiWorldPos,
      this.camera.position,
      _listenerForward,
      _listenerRight,
      { doumenOpen: this.doumenOpen }
    );
    this.lastHwameiSpatial = hwameiSpatial;
    this.audio.updateHwameiSyrinx(hwameiOut.syrinx, hwameiSpatial);

    // Kitchen bellows & Leicha mortar pestle
    if (this.bellowsTimer > 0) {
      this.bellowsTimer = Math.max(0, this.bellowsTimer - dt);
      this.props.bellowsHandle.position.z = 2.05 + Math.sin(t * 9.0) * 0.22;
    }
    if (this.props.wokSteamGroup.visible) {
      this.props.wokSteamGroup.children.forEach((p, idx) => {
        p.position.y = ((t * 0.8 + idx * 0.35) % 1.4);
      });
    }
    if (this.leichaTimer > 0) {
      this.leichaTimer = Math.max(0, this.leichaTimer - dt);
      this.props.leichaPestle.rotation.y -= dt * 5.0;
    }

    // Winnowing machine crank
    if (this.winnowerTimer > 0) {
      this.winnowerTimer = Math.max(0, this.winnowerTimer - dt);
      this.props.winnowerCrank.rotation.z -= dt * 8.0;
    }

    // 2F Pulley grain sack vertical hoist
    const targetSackY = this.pulleyRaised ? 4.2 : 1.2;
    this.props.pulleyGrainSack.position.y = THREE.MathUtils.damp(
      this.props.pulleyGrainSack.position.y,
      targetSackY,
      2.6,
      dt
    );

    // Weaving loom shuttle
    if (this.loomTimer > 0) {
      this.loomTimer = Math.max(0, this.loomTimer - dt);
      this.props.loomShuttle.position.x = Math.sin(t * 10.0) * 0.48;
    }

    // Carpentry mortise-and-tenon beam seating
    const targetBeamY = this.carpentryAssembled ? 1.56 : 1.98;
    this.props.carpentryBeam.position.y = THREE.MathUtils.damp(
      this.props.carpentryBeam.position.y,
      targetBeamY,
      6.0,
      dt
    );

    // Ding Lantern gentle descent when inspected/lit (ceiling golden cord stays anchored to ridge purlin!)
    const targetDingY = this.dingLanternLit ? 2.85 : 3.55;
    const nextDingY = THREE.MathUtils.damp(
      this.props.dingLanternGroup.position.y,
      targetDingY,
      3.5,
      dt
    );
    this.props.updateDingLanternHeight(nextDingY);
    this.props.dingLanternGroup.rotation.y += dt * 0.35;

    // Jiaobei divination bounce arc
    if (this.jiaobeiAnimTimer > 0) {
      this.jiaobeiAnimTimer = Math.max(0, this.jiaobeiAnimTimer - dt);
      const arc = Math.sin((this.jiaobeiAnimTimer / 1.6) * Math.PI);
      this.props.jiaobeiLeft.position.y = 1.95 + arc * 0.72;
      this.props.jiaobeiRight.position.y = 1.95 + arc * 0.85;
      this.props.jiaobeiLeft.rotation.x += dt * 12;
      this.props.jiaobeiRight.rotation.z += dt * 11;
    } else {
      this.props.jiaobeiLeft.position.y = 1.95;
      this.props.jiaobeiRight.position.y = 1.95;
      this.props.jiaobeiLeft.rotation.set(Math.PI * 0.5, 0.3, this.jiaobeiFlipL);
      this.props.jiaobeiRight.rotation.set(Math.PI * 0.5, -0.4, this.jiaobeiFlipR);
    }

    // Incense smoke rising
    if (this.props.incenseSmokeGroup.visible) {
      this.props.incenseSmokeGroup.children.forEach((p, idx) => {
        p.position.y = ((t * 0.55 + idx * 0.3) % 1.9);
        p.position.x = Math.sin(t * 2 + idx) * 0.08;
      });
    }

    // Swaying drying indigo shirts & pecking chickens
    this.props.dryingClothes.forEach((cloth, idx) => {
      cloth.rotation.x = Math.sin(t * 2.1 + idx) * 0.14;
    });
    this.props.chickens.forEach((hen, idx) => {
      hen.rotation.z = Math.max(0, Math.sin(t * 3.2 + idx * 1.7)) * 0.25;
    });

    // Startled flock circling after Watchtower Gong strike
    if (this.birdsFlightTimer > 0) {
      this.birdsFlightTimer = Math.max(0, this.birdsFlightTimer - dt);
      this.props.startledBirds.rotation.y += dt * 0.65;
      this.props.startledBirds.position.y = Math.sin(t * 2.0) * 0.7;
      if (this.birdsFlightTimer <= 0) {
        this.props.startledBirds.visible = false;
      }
    }

    // Weather particles: Wind-slanted roof-occluded rain streaks & Night Fireflies drifting
    if (this.rainStreaks.visible) {
      const attr = this.rainStreaks.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const data = this.rainStreakData;
      const count = data.length / 6;
      const gust = Math.sin(t * 0.7) * 0.03;
      for (let i = 0; i < count; i++) {
        const b = i * 6;
        const speed = data[b + 3];
        const len = data[b + 4];
        const windX = data[b + 5] + gust;
        let rx = data[b] + windX * speed * dt;
        let ry = data[b + 1] - speed * dt;
        let rz = data[b + 2] + 0.07 * speed * dt;

        // Respawn at cloud-base when hitting ground OR entering a covered roof volume below eave height
        const minY = isUnderRoof(rx, rz) ? 6.6 : 0.05;
        if (ry < minY) {
          ry = 22.0 + ((i * 37) % 100) * 0.06;
          if (rx < -42) rx += 84;
          if (rz > 56) rz -= 104;
        }
        data[b] = rx;
        data[b + 1] = ry;
        data[b + 2] = rz;

        arr[b] = rx;
        arr[b + 1] = ry;
        arr[b + 2] = rz;
        arr[b + 3] = rx - windX * len;
        arr[b + 4] = ry + len;
        arr[b + 5] = rz - 0.07 * len;
      }
      attr.needsUpdate = true;
    }
    if (this.fireflyPoints.visible) {
      const attr = this.fireflyPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const fy = attr.getY(i) + Math.sin(t * 1.9 + i) * dt * 0.38;
        attr.setY(i, fy);
      }
      attr.needsUpdate = true;
    }

    // Throttled HUD & GTA Minimap live sync (~10Hz for fluid radar & entity blips)
    if (nowMs - this.lastHudEmitMs > 100) {
      this.emitHudSnapshot(false);
      this.lastHudEmitMs = nowMs;
    }
  }

  private updatePlayerMovement(dt: number, timeSec: number): void {
    const preset = GTA_CAMERA_PRESETS[this.cameraView];
    const isFirstPerson = preset.isFirstPerson;

    // Optional Q camera orbit left
    if (this.keysHeld.has('KeyQ')) {
      this.targetCameraYaw = normalizeAngle(this.targetCameraYaw + dt * 1.9);
      this.timeSinceManualOrbit = 0;
    }

    // Track time since manual orbit for GTA gentle auto-follow
    this.timeSinceManualOrbit = Math.min(10, this.timeSinceManualOrbit + dt);

    // Combine Keyboard (WASD / Arrows) + Mobile Analog Joystick intents
    const keyFwd =
      (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0) -
      (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0);
    const keyRight =
      (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0) -
      (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0);

    const inputForward = THREE.MathUtils.clamp(keyFwd + this.virtualMoveForward, -1, 1);
    const inputRight = THREE.MathUtils.clamp(keyRight + this.virtualMoveRight, -1, 1);

    // Smooth GTA camera yaw & pitch damping (shortest-arc yaw prevents +/-PI spin)
    this.cameraYaw = dampAngle(this.cameraYaw, this.targetCameraYaw, 18, dt);
    this.cameraPitch = THREE.MathUtils.damp(this.cameraPitch, this.targetCameraPitch, 18, dt);

    // Compute camera-relative movement vector & character heading (signature GTA feel)
    const move = computeCameraRelativeMove(inputForward, inputRight, this.cameraYaw);

    const isSprinting =
      move.magnitude > 0.12 &&
      (this.keysHeld.has('ShiftLeft') ||
        this.keysHeld.has('ShiftRight') ||
        this.virtualSprintToggle ||
        this.virtualAutoSprint);
    this.isSprintingNow = isSprinting;

    const maxSpeed = isSprinting ? 8.6 : 5.2;
    const targetVx = move.moveX * maxSpeed;
    const targetVz = move.moveZ * maxSpeed;

    // Weighted horizontal inertia: responsive start & weighty natural deceleration on stop
    const accelRate = move.magnitude > 0.01 ? (isSprinting ? 12.5 : 14.0) : 11.0;
    this.playerVelX = THREE.MathUtils.damp(this.playerVelX, targetVx, accelRate, dt);
    this.playerVelZ = THREE.MathUtils.damp(this.playerVelZ, targetVz, accelRate, dt);

    const horizSpeed = Math.hypot(this.playerVelX, this.playerVelZ);
    let targetGroundY = groundHeightAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);

    // Character body rotation: turns smoothly into movement direction in 3rd-person, matches camera in 1st-person
    const prevCharYaw = this.characterYaw;
    if (isFirstPerson) {
      this.characterYaw = this.cameraYaw;
    } else if (move.facingYaw !== null && move.magnitude > 0.05) {
      this.characterYaw = dampAngle(this.characterYaw, move.facingYaw, 12.5, dt);
    }
    const turnRate = shortestAngleDelta(prevCharYaw, this.characterYaw) / Math.max(dt, 0.008);

    // GTA Soft Auto-Follow: gently swings camera behind character when walking without recent manual look
    if (!isFirstPerson && !this.pointerLocked && this.activePointers.size === 0) {
      this.targetCameraYaw = computeSoftFollowYaw(
        this.targetCameraYaw,
        this.characterYaw,
        horizSpeed,
        inputForward,
        this.timeSinceManualOrbit,
        dt
      );
    }

    if (horizSpeed > 0.03) {
      const prevX = this.playerPos.x;
      const prevZ = this.playerPos.z;
      const desiredDelta = {
        x: this.playerVelX * dt,
        z: this.playerVelZ * dt,
      };

      // Route ALL player locomotion through unified 3-stage SpatialPhysicsKernel (Capsule vs BVH Slide + Dynamic Separation + Sub-stepping)
      const res = this.physicsKernel.moveCapsule('player', desiredDelta, dt, {
        doumenOpen: this.doumenOpen,
      });

      const movedDist = Math.hypot(res.x - prevX, res.z - prevZ);
      if (movedDist < horizSpeed * dt * 0.25) {
        this.playerVelX *= 0.45;
        this.playerVelZ *= 0.45;
      }
      this.playerPos.x = res.x;
      this.playerPos.z = res.z;
      targetGroundY = res.y;

      // Detect threshold crossing ("忌踩门槛" step-over lift curve)
      let crossedThreshold = false;
      if (Math.abs(res.x) < 2.2) {
        for (const tz of [21.65, 16.55, 10.2, 5.7, -0.1]) {
          if ((prevZ - tz) * (res.z - tz) < 0) {
            crossedThreshold = true;
            break;
          }
        }
      }
      if (crossedThreshold) {
        this.thresholdBumpTimer = 0.45;
      }

      // Gait-synced stride + 6-surface procedural footstep foley
      this.walkPhase += movedDist * (isSprinting ? 2.45 : 2.25);
      this.stepDistAccum += movedDist;
      const stepStride = isSprinting ? 1.85 : 1.62;
      if (this.stepDistAccum >= stepStride) {
        this.stepDistAccum = 0;
        const surf = surfaceTypeAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);
        this.audio.playFootstep(surf);
      }
    }

    // 2nd-order damped vertical spring suspension over granite stairs, Huatai slopes & thresholds
    const springK = 140;
    const dampingC = 22;
    const yAccel = (targetGroundY - this.playerPos.y) * springK - this.eyeYVel * dampingC;
    this.eyeYVel += yAccel * dt;
    this.playerPos.y += this.eyeYVel * dt;

    // Subtle 25cm threshold step-over lift curve ("忌踩门槛")
    let thresholdLift = 0;
    if (this.thresholdBumpTimer > 0) {
      this.thresholdBumpTimer = Math.max(0, this.thresholdBumpTimer - dt);
      thresholdLift = Math.sin((this.thresholdBumpTimer / 0.45) * Math.PI) * 0.16;
    }

    // Update playable 3D character avatar transform & procedural gait animation
    this.playerAvatar.root.position.set(
      this.playerPos.x,
      this.playerPos.y + thresholdLift * 0.65,
      this.playerPos.z
    );
    this.playerAvatar.root.rotation.y = this.characterYaw;
    this.playerAvatar.update(
      dt,
      horizSpeed,
      isSprinting,
      this.walkPhase,
      turnRate,
      this.holdingUmbrella,
      timeSec
    );

    // Dynamic GTA Sprint FOV Kick (smoothly widens FOV when sprinting, narrows for gun-slit peep)
    const targetFov = this.gunSlitActive
      ? 34
      : preset.fov + (isSprinting ? preset.sprintFovBoost : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7.5, dt);
      this.camera.updateProjectionMatrix();
    }

    // Decaying trauma camera shake (e.g. Watchtower Gong boom)
    let shakePitch = 0;
    let shakeYaw = 0;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 0.9);
      const mag = this.trauma * this.trauma * 0.045;
      shakePitch = (Math.random() - 0.5) * mag;
      shakeYaw = (Math.random() - 0.5) * mag;
    }

    const lookBackActive =
      this.lookBackHeld || this.middleMouseDown || this.keysHeld.has('KeyB');

    if (isFirstPerson) {
      const strideFactor = Math.min(1, horizSpeed / 5.2);
      const gaitBob = Math.sin(this.walkPhase) * 0.036 * strideFactor;
      const gaitRoll = Math.cos(this.walkPhase * 0.5) * 0.0045 * strideFactor;
      const eyeHeight = preset.pivotHeight + gaitBob + thresholdLift;
      const effectiveYaw = lookBackActive
        ? normalizeAngle(this.cameraYaw + Math.PI)
        : this.cameraYaw;

      this.camera.position.set(
        this.playerPos.x,
        this.playerPos.y + eyeHeight,
        this.playerPos.z
      );
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(
        this.cameraPitch + shakePitch,
        effectiveYaw + shakeYaw,
        gaitRoll
      );
    } else {
      // Smooth third-person spring-arm distance (pulls in quickly on walls, releases gracefully when clear)
      const pose = computeThirdPersonCameraPose({
        playerX: this.playerPos.x,
        playerY: this.playerPos.y + thresholdLift * 0.4,
        playerZ: this.playerPos.z,
        cameraYaw: this.cameraYaw + shakeYaw,
        cameraPitch: this.cameraPitch + shakePitch,
        desiredDistance: this.desiredThirdPersonDist,
        shoulderOffset: preset.shoulderOffset,
        pivotHeight: preset.pivotHeight,
        lookAhead: preset.lookAhead,
        lookBack: lookBackActive,
        doumenOpen: this.doumenOpen,
      });

      const distLambda = pose.resolvedDistance < this.smoothedThirdPersonDist ? 24 : 7.5;
      this.smoothedThirdPersonDist = THREE.MathUtils.damp(
        this.smoothedThirdPersonDist,
        pose.resolvedDistance,
        distLambda,
        dt
      );

      // Recompute final position using smoothed arm distance so wall recovery is silky smooth
      const finalPose = computeThirdPersonCameraPose({
        playerX: this.playerPos.x,
        playerY: this.playerPos.y + thresholdLift * 0.4,
        playerZ: this.playerPos.z,
        cameraYaw: this.cameraYaw + shakeYaw,
        cameraPitch: this.cameraPitch + shakePitch,
        desiredDistance: this.smoothedThirdPersonDist,
        shoulderOffset: preset.shoulderOffset,
        pivotHeight: preset.pivotHeight,
        lookAhead: preset.lookAhead,
        lookBack: lookBackActive,
        doumenOpen: this.doumenOpen,
      });

      _camTargetPos.set(finalPose.camX, finalPose.camY, finalPose.camZ);
      _camLookTarget.set(finalPose.lookX, finalPose.lookY, finalPose.lookZ);

      if (!this.cameraRigInitialized || lookBackActive) {
        this.smoothCamPos.copy(_camTargetPos);
        this.smoothLookAt.copy(_camLookTarget);
        this.cameraRigInitialized = true;
      } else {
        const posAlpha = 1 - Math.exp(-16 * dt);
        const lookAlpha = 1 - Math.exp(-20 * dt);
        this.smoothCamPos.lerp(_camTargetPos, posAlpha);
        this.smoothLookAt.lerp(_camLookTarget, lookAlpha);
      }

      this.camera.position.copy(this.smoothCamPos);
      this.camera.lookAt(this.smoothLookAt);
    }

    // Track visited space & find nearest interactable within reach
    const nodeId = detectNodeIdAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);
    this.visitedNodes.add(nodeId);

    let closest: InteractableDef | null = null;
    let closestDist = Infinity;
    for (const item of INTERACTABLES) {
      const [ix, iy, iz] = item.position;
      const dist = Math.hypot(
        this.playerPos.x - ix,
        (this.playerPos.y + 1.0 - iy) * 0.65,
        this.playerPos.z - iz
      );
      if (dist <= item.radius && dist < closestDist) {
        closest = item;
        closestDist = dist;
      }
    }
    this.nearbyInteractable = closest;
  }

  private emitHudSnapshot(force: boolean): void {
    const nodeId = detectNodeIdAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);
    const node = NODE_MAP.get(nodeId) || ROOM_NODES[1];
    const surf = surfaceTypeAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);

    if (force) {
      this.lastHudEmitMs = performance.now();
    }

    document.body.dataset.cameraView = this.cameraView;
    if (this.lastHwameiAnim) {
      document.body.dataset.hwameiSinging = this.lastHwameiAnim.isSinging ? '1' : '0';
      document.body.dataset.hwameiSleeping = this.lastHwameiAnim.isSleeping ? '1' : '0';
      document.body.dataset.hwameiMotif = this.lastHwameiAnim.currentMotif;
    }
    if (this.lastHwameiSpatial) {
      document.body.dataset.hwameiDist = this.lastHwameiSpatial.distance.toFixed(2);
      document.body.dataset.hwameiGain = this.lastHwameiSpatial.directGain.toFixed(3);
      document.body.dataset.hwameiWalls = String(this.lastHwameiSpatial.wallCrossings);
      document.body.dataset.hwameiLpf = String(Math.round(this.lastHwameiSpatial.lowpassHz));
    }

    this.callbacks.onHudUpdate({
      currentNodeId: node.id,
      currentNodeName: `${node.number} · ${node.name}`,
      currentZoneName: node.zoneName,
      currentSurface: surf,
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      playerYaw: this.characterYaw,
      cameraYaw: this.cameraYaw,
      nearbyInteractable: this.nearbyInteractable,
      visitedNodes: Array.from(this.visitedNodes),
      triggeredInteractions: Array.from(this.triggeredInteractions),
      inspectedArtifacts: Array.from(this.inspectedArtifacts),
      fiveElementsLit: this.fiveElementsLit,
      holdingUmbrella: this.holdingUmbrella,
      doumenOpen: this.doumenOpen,
      gunSlitActive: this.gunSlitActive,
      weather: this.weather,
      cameraView: this.cameraView,
      pointerLocked: this.pointerLocked,
      isSprinting: this.isSprintingNow || this.virtualSprintToggle,
      timeOfDay: this.timeOfDay,
      timePlaying: this.timePlaying,
      timeSpeed: this.timeSpeed,
      timePeriodLabel: this.timePeriodLabel,
      formattedTime: this.formattedTime,
      volume: this.audio.getVolume(),
      minimapBlips: this.living.getMinimapBlips(),
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.exitPointerLock();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    document.removeEventListener('mousemove', this.handleLockedMouseMove);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('wheel', this.handleWheel);
    dom.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
    this.resizeObserver?.disconnect();

    this.poeticSky.geometry.dispose();
    (this.poeticSky.material as THREE.Material).dispose();
    this.cloudVolumetricMat.dispose();
    this.rainStreaks.geometry.dispose();
    (this.rainStreaks.material as THREE.Material).dispose();
    this.fireflyPoints.geometry.dispose();
    (this.fireflyPoints.material as THREE.Material).dispose();
    this.envMaps.sunny.dispose();
    this.envMaps.rain.dispose();
    this.envMaps.night.dispose();
    this.composer?.dispose();
    this.sceneValidator.dispose();
    delete (window as unknown as Record<string, unknown>).__SCENE_VALIDATOR__;
    this.playerAvatar.dispose();
    this.living.dispose();
    this.arch.dispose();
    this.props.dispose();
    this.mats.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
