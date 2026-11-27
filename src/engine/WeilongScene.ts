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
  resolvePlayerMovement,
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
import { createSoftPillowGeometry } from './sculptHelpers';
import { HakkaAudioEngine } from './audioEngine';

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
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
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
  private envMaps: Record<WeatherMode, THREE.Texture>;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private lensPass: ShaderPass | null = null;
  private mats: MaterialLibrary;
  private arch: ArchitectureRefs;
  private props: PropAnimationRefs;
  private living: LivingWorldRefs;
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
    uSunDir: { value: THREE.Vector3 };
    uMoonDir: { value: THREE.Vector3 };
    uSunStr: { value: number };
    uMoonStr: { value: number };
    uStarStr: { value: number };
    uTime: { value: number };
  };
  private cloudGroup: THREE.Group;
  private cloudTopMat: THREE.MeshBasicMaterial;
  private cloudBotMat: THREE.MeshBasicMaterial;
  private rainPoints: THREE.Points;
  private fireflyPoints: THREE.Points;
  private umbrellaHeldGroup: THREE.Group;

  // Game & Player State (100% free-walking + weighted momentum & spring suspension)
  private mode: GameMode = 'title';
  private weather: WeatherMode = 'sunny';
  private cameraView: CameraViewMode = 'walk';
  private playerPos = new THREE.Vector3(0, 0, 31.0);
  private playerVelX = 0;
  private playerVelZ = 0;
  private eyeYVel = 0;
  private playerYaw = 0; // 0 = looking North (-Z)
  private playerPitch = -0.02;
  private targetYaw = 0;
  private targetPitch = -0.02;
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
  private xrayActive = false;
  private taijiActive = false;
  private holdingUmbrella = false;
  private gunSlitActive = false;
  private fiveElementsLit = 0;
  private almanacIdx = 0;
  private studyLampBright = 1.2;

  // Active Prop Animation Timers
  private millSpinTimer = 0;
  private cradleRockTimer = 0;
  private birdcageSwingTimer = 0;
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

  // Input State
  private keysHeld = new Set<string>();
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private dragMoved = false;
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
    container.appendChild(this.renderer.domElement);

    // Scene & Custom Physical Outdoor Sky + Courtyard Bounce IBL (baked per weather via PMREM)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6fb4e0);
    this.scene.fog = new THREE.FogExp2(0xd8e5e6, 0.0024);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMaps = {
      sunny: this.bakePhysicalOutdoorEnv(pmrem, 'sunny'),
      rain: this.bakePhysicalOutdoorEnv(pmrem, 'rain'),
      lantern: this.bakePhysicalOutdoorEnv(pmrem, 'lantern'),
    };
    this.scene.environment = this.envMaps.sunny;
    pmrem.dispose();

    // Poetic Multi-Band Gouache Sky Dome (adapted from refindex.html 10_sky.js)
    this.skyUniforms = {
      uZen: { value: new THREE.Color(0x2a76be) },
      uMid: { value: new THREE.Color(0x67b3e2) },
      uHor: { value: new THREE.Color(0xf6e6c8) },
      uHs: { value: new THREE.Color(0xfff1cc) },
      uGnd: { value: new THREE.Color(0x88b8a8) },
      uSunDir: { value: new THREE.Vector3(46, 36, 32).normalize() },
      uMoonDir: { value: new THREE.Vector3(-24, 34, -46).normalize() },
      uSunStr: { value: 1.0 },
      uMoonStr: { value: 0.0 },
      uStarStr: { value: 0.0 },
      uTime: { value: 0.0 },
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
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform float uSunStr;
        uniform float uMoonStr;
        uniform float uStarStr;
        uniform float uTime;
        varying vec3 vDir;

        float sHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.24, y));
          col = mix(col, uZen, smoothstep(0.20, 0.78, y));
          col = mix(col, uGnd, smoothstep(0.02, -0.18, y));

          // Warm sunlit horizon scatter (refindex.html skyCol)
          float sDot = max(dot(d, normalize(uSunDir)), 0.0);
          float hBloom = pow(1.0 - clamp(abs(y), 0.0, 1.0), 3.4);
          col = mix(col, uHs, hBloom * (0.28 + 0.42 * pow(sDot, 2.0)) * uSunStr);

          // Crisp golden painted sun disc & halo
          if (uSunStr > 0.01) {
            float halo = pow(sDot, 28.0) * 0.45 + pow(sDot, 160.0) * 0.85;
            float disc = smoothstep(0.9988, 0.9994, sDot);
            col += vec3(1.0, 0.95, 0.80) * (halo + disc * 1.4) * uSunStr;
          }

          // Painted full moon with soft lunar seas & halo in lantern night
          if (uMoonStr > 0.01) {
            vec3 md = normalize(uMoonDir);
            float mDot = dot(d, md);
            float mHalo = pow(max(mDot, 0.0), 22.0) * 0.32 + pow(max(mDot, 0.0), 140.0) * 0.55;
            col += vec3(0.75, 0.85, 1.0) * mHalo * uMoonStr;
            float mDisc = smoothstep(0.9978, 0.9985, mDot);
            if (mDisc > 0.001) {
              vec3 up = vec3(0.0, 1.0, 0.0);
              vec3 mx = normalize(cross(up, md));
              vec3 my = cross(md, mx);
              vec2 muv = vec2(dot(d - md, mx), dot(d - md, my)) * 18.0;
              float maria = 0.88 + 0.12 * sin(muv.x * 2.2 + sin(muv.y * 2.6));
              vec3 moonCol = vec3(1.0, 0.96, 0.85) * maria;
              col = mix(col, moonCol, mDisc * uMoonStr);
            }
          }

          // Delicate twinkling starfield above horizon at night
          if (uStarStr > 0.01 && y > 0.06) {
            vec2 sp = vec2(atan(d.z, d.x), asin(clamp(y, -1.0, 1.0))) * 46.0;
            vec2 cell = floor(sp);
            vec2 f = fract(sp) - 0.5;
            float rnd = sHash(cell);
            if (rnd > 0.92) {
              float dist = length(f);
              float tw = 0.65 + 0.35 * sin(uTime * (2.2 + rnd * 4.0) + rnd * 50.0);
              float star = smoothstep(0.16, 0.02, dist) * tw * smoothstep(0.06, 0.25, y);
              col += vec3(1.0, 0.96, 0.86) * star * uStarStr * 1.1;
            }
          }

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.poeticSky = new THREE.Mesh(new THREE.SphereGeometry(250, 32, 20), poeticSkyMat);
    this.scene.add(this.poeticSky);

    // Sculpted Painterly Cotton Clouds (refindex.html 66_air.js gouache clouds!)
    this.cloudTopMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8, fog: true });
    this.cloudBotMat = new THREE.MeshBasicMaterial({ color: 0xefd3bc, fog: true });
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
      this.sunLight.shadow.radius = 2.6;
      this.sunLight.shadow.camera.left = -52;
      this.sunLight.shadow.camera.right = 52;
      this.sunLight.shadow.camera.top = 56;
      this.sunLight.shadow.camera.bottom = -56;
      this.sunLight.shadow.camera.near = 4;
      this.sunLight.shadow.camera.far = 165;
      this.sunLight.shadow.bias = -0.00035;
      this.sunLight.shadow.normalBias = 0.025;
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

    // Build Procedural Materials, Architecture, Composite Props & Living Hakka Community
    this.mats = createMaterialLibrary(this.renderer);
    this.arch = buildWeilongArchitecture(this.mats, this.isSoftwareGl);
    this.props = buildWeilongProps(this.mats, this.isSoftwareGl);
    this.living = buildLivingWorld(this.mats, this.isSoftwareGl);
    this.scene.add(this.arch.root);
    this.scene.add(this.props.root);
    this.scene.add(this.living.root);

    // Held Oil-Paper Umbrella attached to Camera
    this.umbrellaHeldGroup = this.buildHeldUmbrella();
    this.umbrellaHeldGroup.visible = false;
    this.camera.add(this.umbrellaHeldGroup);
    this.scene.add(this.camera);

    // Pooled Zero-GC Rain & Firefly Particle Systems
    this.rainPoints = this.buildRainParticles();
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);

    this.fireflyPoints = this.buildFireflyParticles();
    this.fireflyPoints.visible = false;
    this.scene.add(this.fireflyPoints);

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
    mode: WeatherMode
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
        const bot = new THREE.Mesh(puffGeoB, this.cloudBotMat);
        bot.position.set(ox, oy, oz);
        bot.scale.set(sx, sy, sz);
        cg.add(bot);
      }
      // Asymmetric billowing sunlit cream-washi upper crests
      for (const [ox, oy, oz, sx, sy, sz] of [
        [-4.2 * mirror, 0.4, 0.25, 3.6, 2.0, 2.7],
        [-1.1 * mirror, 1.65, -0.1, 4.7, 3.1, 3.1],
        [2.6 * mirror, 1.15, 0.15, 3.9, 2.45, 2.8],
        [5.6 * mirror, 0.25, -0.2, 2.8, 1.6, 2.2],
        [-2.2 * mirror, 0.85, 1.15, 2.9, 1.9, 2.3],
        [0.9 * mirror, 2.35, -0.45, 2.6, 2.0, 2.2],
      ]) {
        const top = new THREE.Mesh(puffGeoA, this.cloudTopMat);
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

  private buildRainParticles(): THREE.Points {
    const count = 480;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 68;
      positions[i * 3 + 1] = Math.random() * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 95 - 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd9ebf5,
      size: 0.16,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
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

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('wheel', this.handleWheel, { passive: true });
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('webglcontextlost', this.handleContextLost);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
  }

  private handleWheel = (e: WheelEvent): void => {
    if (this.mode !== 'playing' || this.cameraView !== 'aerial') return;
    this.aerialDist = THREE.MathUtils.clamp(this.aerialDist + e.deltaY * 0.045, 28, 105);
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
  }

  private handleWindowBlur = (): void => {
    this.keysHeld.clear();
    this.isDragging = false;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.isDragging = false;
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.mode !== 'playing') return;
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
      } else if (e.code === 'Digit3') {
        this.applyWeather('lantern');
      } else if (e.code === 'KeyX') {
        this.toggleXray();
      } else if (e.code === 'KeyT') {
        this.toggleTaijiOverlay();
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
    this.isDragging = true;
    this.dragMoved = false;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isDragging || this.mode !== 'playing') return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY) > 6) {
      this.dragMoved = true;
    }
    if (this.cameraView === 'aerial') {
      this.aerialAngle -= dx * 0.005;
      this.aerialPitch = THREE.MathUtils.clamp(this.aerialPitch + dy * 0.004, 0.28, 1.25);
    } else {
      this.targetYaw -= dx * 0.0045;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - dy * 0.0038, -0.78, 0.72);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.mode !== 'playing') return;

    // Clean click (without drag) raycasts strictly against lightweight interactable hit spheres
    if (!this.dragMoved) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      _rayOrigin.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _rayOrigin.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(_rayOrigin, this.camera);
      this.raycaster.far = 14;
      const hits = this.raycaster.intersectObjects(this.props.interactableMeshes, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData?.interactableId as string | undefined;
        if (id) {
          this.triggerInteractionById(id);
          return;
        }
      }
      // Fallback: if standing close to an interactable, click also triggers it
      if (this.nearbyInteractable) {
        this.triggerInteractionById(this.nearbyInteractable.id);
      }
    }
  };

  // =========================================================================
  // PUBLIC CONTROLS FOR REACT SHELL
  // =========================================================================

  public setMode(mode: GameMode): void {
    this.mode = mode;
    if (mode !== 'playing') {
      this.keysHeld.clear();
      this.isDragging = false;
      this.gunSlitActive = false;
      this.playerVelX = 0;
      this.playerVelZ = 0;
      this.eyeYVel = 0;
    } else {
      this.audio.unlock();
      // Reset camera rotation smoothly to player's facing direction
      this.playerYaw = this.targetYaw;
      this.playerPitch = this.targetPitch;
      this.camera.fov = this.cameraView === 'aerial' ? 46 : 56;
      this.camera.updateProjectionMatrix();
    }
    this.emitHudSnapshot(true);
  }

  public resetToEntrance(): void {
    this.playerPos.set(0, 0, 31.0);
    this.playerVelX = 0;
    this.playerVelZ = 0;
    this.eyeYVel = 0;
    this.playerYaw = 0;
    this.targetYaw = 0;
    this.playerPitch = -0.02;
    this.targetPitch = -0.02;
    this.cameraView = 'walk';
    this.gunSlitActive = false;
    this.camera.fov = 56;
    this.camera.updateProjectionMatrix();
    this.emitHudSnapshot(true);
  }

  public setCameraView(view: CameraViewMode): void {
    this.cameraView = view;
    this.gunSlitActive = false;
    this.camera.fov = view === 'aerial' ? 46 : 56;
    this.camera.updateProjectionMatrix();
    this.emitHudSnapshot(true);
  }

  public toggleCameraView(): void {
    this.setCameraView(this.cameraView === 'walk' ? 'aerial' : 'walk');
  }

  public applyWeather(weather: WeatherMode): void {
    this.weather = weather;
    this.audio.setWeatherAmbience(weather);
    this.arch.skyDome.visible = false;
    this.poeticSky.visible = true;
    this.scene.environment = this.envMaps[weather];

    if (weather === 'sunny') {
      this.renderer.toneMappingExposure = 1.06;
      this.skyUniforms.uZen.value.setHex(0x2874bc);
      this.skyUniforms.uMid.value.setHex(0x63b2e0);
      this.skyUniforms.uHor.value.setHex(0xf7e6c4);
      this.skyUniforms.uHs.value.setHex(0xfff1cc);
      this.skyUniforms.uGnd.value.setHex(0x88b8a8);
      this.skyUniforms.uSunStr.value = 1.0;
      this.skyUniforms.uMoonStr.value = 0.0;
      this.skyUniforms.uStarStr.value = 0.0;
      this.cloudTopMat.color.setHex(0xfff8e8);
      this.cloudBotMat.color.setHex(0xefd1b8);
      this.cloudGroup.visible = true;

      this.scene.background = new THREE.Color(0x63b2e0);
      (this.scene.fog as THREE.FogExp2).color.setHex(0xdae6e2);
      (this.scene.fog as THREE.FogExp2).density = 0.0021;
      this.scene.environmentIntensity = 0.68;
      this.sunLight.color.setHex(0xfff0cf);
      this.sunLight.intensity = 2.85;
      this.sunLight.position.set(46, 36, 32);
      this.hemiLight.color.setHex(0x98ccf0);
      this.hemiLight.groundColor.setHex(0xa88a60);
      this.hemiLight.intensity = 0.72;
      this.groundBounceLight.color.setHex(0xf6cfa0);
      this.groundBounceLight.intensity = 0.64;
      this.skyRimLight.color.setHex(0x9bd2f8);
      this.skyRimLight.intensity = 0.46;

      // Sync shared physical optical uniforms (GI radiosity, SSS, wetness)
      physicalEnvUniforms.uSunDir.value.set(46, 36, 32).normalize();
      physicalEnvUniforms.uSunColor.value.setHex(0xfff0d2);
      physicalEnvUniforms.uBounceColor.value.setHex(0xf0c990);
      physicalEnvUniforms.uSkyColor.value.setHex(0x88c8ec);
      physicalEnvUniforms.uWetness.value = 0.0;
      physicalEnvUniforms.uNightFactor.value = 0.0;

      // Dry surface clearcoat calibration
      this.mats.wettableMaterials.forEach((m) => {
        const isTile = m === this.mats.roofTile || m === this.mats.roofTileDark;
        m.clearcoat = isTile ? 0.08 : 0.0;
        m.clearcoatRoughness = isTile ? 0.45 : 0.28;
      });
      this.mats.huataiCobble.roughness = 0.82;
      this.mats.windowLattice.emissiveIntensity = 0.08;
      this.mats.lanternPaper.emissiveIntensity = 0.42;
      this.arch.lanternLights.forEach((l) => (l.intensity = 0.16));
      if (this.bloomPass) {
        this.bloomPass.strength = 0.22;
        this.bloomPass.threshold = 0.94;
      }
      if (this.lensPass) {
        this.lensPass.uniforms.uVignette.value = 0.20;
      }
      this.rainPoints.visible = false;
      this.arch.rainCurtainMeshes.forEach((m) => (m.visible = false));
      this.fireflyPoints.visible = false;
    } else if (weather === 'rain') {
      // 烟雨客乡 (Celadon Ink-Wash Misty Rain with physical wet stone & tile clearcoat film!)
      this.renderer.toneMappingExposure = 1.02;
      this.skyUniforms.uZen.value.setHex(0x52748e);
      this.skyUniforms.uMid.value.setHex(0x84a0b2);
      this.skyUniforms.uHor.value.setHex(0xc8d7d6);
      this.skyUniforms.uHs.value.setHex(0xdbe5e2);
      this.skyUniforms.uGnd.value.setHex(0x6c8684);
      this.skyUniforms.uSunStr.value = 0.12;
      this.skyUniforms.uMoonStr.value = 0.0;
      this.skyUniforms.uStarStr.value = 0.0;
      this.cloudTopMat.color.setHex(0xcfdce0);
      this.cloudBotMat.color.setHex(0x8ca2b0);
      this.cloudGroup.visible = true;

      this.scene.background = new THREE.Color(0x9bb2bc);
      (this.scene.fog as THREE.FogExp2).color.setHex(0xa6bcc2);
      (this.scene.fog as THREE.FogExp2).density = 0.0064;
      this.scene.environmentIntensity = 0.64;
      this.sunLight.color.setHex(0xdbe8ef);
      this.sunLight.intensity = 1.3;
      this.sunLight.position.set(16, 40, 18);
      this.hemiLight.color.setHex(0xa8c2d0);
      this.hemiLight.groundColor.setHex(0x5c6862);
      this.hemiLight.intensity = 0.88;
      this.groundBounceLight.color.setHex(0x9cb4b2);
      this.groundBounceLight.intensity = 0.36;
      this.skyRimLight.color.setHex(0xb8d4e0);
      this.skyRimLight.intensity = 0.38;

      physicalEnvUniforms.uSunDir.value.set(16, 40, 18).normalize();
      physicalEnvUniforms.uSunColor.value.setHex(0xd6e6ee);
      physicalEnvUniforms.uBounceColor.value.setHex(0x8fa8a4);
      physicalEnvUniforms.uSkyColor.value.setHex(0x9cb8c6);
      physicalEnvUniforms.uWetness.value = 1.0;
      physicalEnvUniforms.uNightFactor.value = 0.0;

      // Engage physical rainwater dielectric film (IOR ~1.333 clearcoat sheen on tiles, slabs & courtyard!)
      this.mats.wettableMaterials.forEach((m) => {
        const isTile = m === this.mats.roofTile || m === this.mats.roofTileDark;
        m.clearcoat = isTile ? 0.66 : 0.78;
        m.clearcoatRoughness = isTile ? 0.22 : 0.14;
      });
      this.mats.huataiCobble.roughness = 0.32;
      this.mats.windowLattice.emissiveIntensity = 0.95;
      this.mats.lanternPaper.emissiveIntensity = 1.25;
      this.arch.lanternLights.forEach((l) => (l.intensity = 1.45));
      if (this.bloomPass) {
        this.bloomPass.strength = 0.18;
        this.bloomPass.threshold = 0.90;
      }
      if (this.lensPass) {
        this.lensPass.uniforms.uVignette.value = 0.25;
      }
      this.rainPoints.visible = true;
      this.arch.rainCurtainMeshes.forEach((m) => (m.visible = true));
      this.fireflyPoints.visible = false;
    } else {
      // 上元灯夜 (Poetic Indigo Moonlit Lantern Festival Night with warm crimson-gold GI bounce!)
      this.renderer.toneMappingExposure = 1.16;
      this.skyUniforms.uZen.value.setHex(0x0b1630);
      this.skyUniforms.uMid.value.setHex(0x1b335c);
      this.skyUniforms.uHor.value.setHex(0x4b4868);
      this.skyUniforms.uHs.value.setHex(0x7c5a64);
      this.skyUniforms.uGnd.value.setHex(0x152236);
      this.skyUniforms.uSunStr.value = 0.0;
      this.skyUniforms.uMoonStr.value = 1.0;
      this.skyUniforms.uStarStr.value = 1.0;
      this.cloudTopMat.color.setHex(0x3a4d70);
      this.cloudBotMat.color.setHex(0x1d2a44);
      this.cloudGroup.visible = true;

      this.scene.background = new THREE.Color(0x14223d);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x1b2b48);
      (this.scene.fog as THREE.FogExp2).density = 0.0044;
      this.scene.environmentIntensity = 0.34;
      this.sunLight.color.setHex(0x88a8de);
      this.sunLight.intensity = 0.68;
      this.sunLight.position.set(-24, 34, -46);
      this.hemiLight.color.setHex(0x3a5688);
      this.hemiLight.groundColor.setHex(0x4a2e1a);
      this.hemiLight.intensity = 0.52;
      this.groundBounceLight.color.setHex(0xd47634);
      this.groundBounceLight.intensity = 0.42;
      this.skyRimLight.color.setHex(0x6b92d4);
      this.skyRimLight.intensity = 0.34;

      physicalEnvUniforms.uSunDir.value.set(-24, 34, -46).normalize();
      physicalEnvUniforms.uSunColor.value.setHex(0x8caee4);
      physicalEnvUniforms.uBounceColor.value.setHex(0xd47434);
      physicalEnvUniforms.uSkyColor.value.setHex(0x2d4878);
      physicalEnvUniforms.uWetness.value = 0.0;
      physicalEnvUniforms.uNightFactor.value = 1.0;

      this.mats.wettableMaterials.forEach((m) => {
        const isTile = m === this.mats.roofTile || m === this.mats.roofTileDark;
        m.clearcoat = isTile ? 0.14 : 0.04;
        m.clearcoatRoughness = 0.38;
      });
      this.mats.huataiCobble.roughness = 0.68;
      this.mats.windowLattice.emissiveIntensity = 1.75;
      this.mats.lanternPaper.emissiveIntensity = 2.75;
      this.arch.lanternLights.forEach((l) => {
        l.distance = 28;
        l.intensity = 6.4;
      });
      if (this.bloomPass) {
        this.bloomPass.strength = 0.46;
        this.bloomPass.threshold = 0.84;
      }
      if (this.lensPass) {
        this.lensPass.uniforms.uVignette.value = 0.28;
      }
      this.rainPoints.visible = false;
      this.arch.rainCurtainMeshes.forEach((m) => (m.visible = false));
      this.fireflyPoints.visible = true;
    }
    this.emitHudSnapshot(true);
  }

  public toggleXray(): void {
    this.xrayActive = !this.xrayActive;
    this.mats.rammedEarthXray.opacity = this.xrayActive ? 0.24 : 1.0;
    this.mats.rammedEarthXray.needsUpdate = true;
    this.audio.playInteractionSound('int_tianjie_xray');
    this.emitHudSnapshot(true);
  }

  public toggleTaijiOverlay(): void {
    this.taijiActive = !this.taijiActive;
    this.props.taijiOverlay.visible = this.taijiActive;
    this.audio.playInteractionSound('int_dragon_taiji');
    this.emitHudSnapshot(true);
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
        customMandarin = this.doumenOpen
          ? '抽开重型横木栓，双开厚木斗门吱呀敞开，可自由出入禾坪！'
          : '合拢重型厚木斗门并落栓上锁，整座围龙屋即成坚固堡垒。';
        break;

      case 'int_xiatang_umbrella':
        this.holdingUmbrella = !this.holdingUmbrella;
        this.umbrellaHeldGroup.visible = this.holdingUmbrella;
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
        this.birdcageSwingTimer = 4.0;
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

      case 'int_tianjie_xray':
        this.toggleXray();
        break;

      case 'int_gallery_pulley':
        this.pulleyRaised = !this.pulleyRaised;
        break;

      case 'int_watchtower_gong':
        this.trauma = 0.55;
        this.birdsFlightTimer = 6.5;
        this.props.startledBirds.visible = true;
        this.gunSlitActive = !this.gunSlitActive;
        this.camera.fov = this.gunSlitActive ? 34 : 62;
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
          this.props.fiveElementBeam.visible = true;
          customMandarin = '金木水火土五行石已全部点亮！聚气化胎金光直指北方龙厅！';
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

      case 'int_dragon_taiji':
        this.toggleTaijiOverlay();
        break;

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
    } else if (this.mode === 'playing') {
      if (this.cameraView === 'aerial') {
        if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) this.aerialAngle -= dt * 0.9;
        if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) this.aerialAngle += dt * 0.9;
        if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) {
          this.aerialDist = Math.max(28, this.aerialDist - dt * 22);
        }
        if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) {
          this.aerialDist = Math.min(105, this.aerialDist + dt * 22);
        }
        const horiz = Math.cos(this.aerialPitch) * this.aerialDist;
        const cy = Math.sin(this.aerialPitch) * this.aerialDist + 1.8;
        const cx = Math.sin(this.aerialAngle) * horiz;
        const cz = Math.cos(this.aerialAngle) * horiz - 3.5;
        this.camera.position.set(cx, cy, cz);
        this.camera.lookAt(0, 2.5, -5.0);
      } else {
        this.updatePlayerMovement(dt);
      }
    }

    // 2. Ambient World, Water, Clouds & Living Community Animations
    this.skyUniforms.uTime.value = t;
    this.arch.updateWater(
      t,
      this.weather === 'lantern' ? 1.0 : 0.0,
      this.weather === 'rain' ? 1.0 : 0.0
    );
    this.living.update(dt, t, this.weather);

    // Gentle cloud drift across the valley sky
    for (const c of this.cloudGroup.children) {
      const d = c.userData;
      c.position.x = ((d.baseX + t * d.speed + 150) % 300) - 150;
      c.position.y = d.baseY + Math.sin(t * 0.22 + d.phase) * 0.7;
    }

    // Swimming Koi in Half-Moon Pond
    for (const child of this.arch.koiGroup.children) {
      const d = child.userData;
      d.orbitAngle += dt * d.speed;
      const nx = d.centerX + Math.cos(d.orbitAngle) * d.orbitRadiusX;
      const nz = d.centerZ + Math.sin(d.orbitAngle) * d.orbitRadiusZ;
      child.rotation.y = Math.atan2(nx - child.position.x, nz - child.position.z);
      child.position.x = nx;
      child.position.z = nz;
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

    // Birdcage swinging
    if (this.birdcageSwingTimer > 0) {
      this.birdcageSwingTimer = Math.max(0, this.birdcageSwingTimer - dt);
      this.props.birdcageGroup.rotation.z = Math.sin(t * 5.2) * 0.24 * Math.min(1, this.birdcageSwingTimer * 0.4);
    } else {
      this.props.birdcageGroup.rotation.z = Math.sin(t * 1.4) * 0.03;
    }

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

    // Ding Lantern gentle descent when inspected/lit
    const targetDingY = this.dingLanternLit ? 2.85 : 3.55;
    this.props.dingLanternGroup.position.y = THREE.MathUtils.damp(
      this.props.dingLanternGroup.position.y,
      targetDingY,
      3.5,
      dt
    );
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

    // Weather particles: Rain falling & Night Fireflies drifting
    if (this.rainPoints.visible) {
      const attr = this.rainPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        let ry = attr.getY(i) - dt * 17.5;
        if (ry < 0) ry = 22;
        attr.setY(i, ry);
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

    // Throttled HUD sync (max ~8Hz during movement)
    if (nowMs - this.lastHudEmitMs > 130) {
      this.emitHudSnapshot(false);
      this.lastHudEmitMs = nowMs;
    }
  }

  private updatePlayerMovement(dt: number): void {
    // Keyboard look turn with Q / E optional or ArrowLeft / ArrowRight when desired
    if (this.keysHeld.has('KeyQ')) this.targetYaw += dt * 1.9;

    // Exponentially damp camera look angles
    const lookSmooth = 1 - Math.exp(-14 * dt);
    this.playerYaw += (this.targetYaw - this.playerYaw) * lookSmooth;
    this.playerPitch += (this.targetPitch - this.playerPitch) * lookSmooth;

    // Compute horizontal movement vector relative to yaw (yaw = 0 faces -Z North)
    _forward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
    _right.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));
    _moveDir.set(0, 0, 0);

    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) _moveDir.add(_forward);
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) _moveDir.sub(_forward);
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) _moveDir.add(_right);
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) _moveDir.sub(_right);

    const isSprinting = this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight');
    const maxSpeed = isSprinting ? 8.5 : 5.4;

    // Weighted horizontal inertia: smooth acceleration on start & weighty natural deceleration on stop
    let targetVx = 0;
    let targetVz = 0;
    if (_moveDir.lengthSq() > 0.001) {
      _moveDir.normalize();
      targetVx = _moveDir.x * maxSpeed;
      targetVz = _moveDir.z * maxSpeed;
    }
    const accelRate = _moveDir.lengthSq() > 0.001 ? 13.5 : 10.5;
    this.playerVelX = THREE.MathUtils.damp(this.playerVelX, targetVx, accelRate, dt);
    this.playerVelZ = THREE.MathUtils.damp(this.playerVelZ, targetVz, accelRate, dt);

    const horizSpeed = Math.hypot(this.playerVelX, this.playerVelZ);
    let targetGroundY = groundHeightAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);

    if (horizSpeed > 0.03) {
      const prevX = this.playerPos.x;
      const prevZ = this.playerPos.z;
      const nextX = prevX + this.playerVelX * dt;
      const nextZ = prevZ + this.playerVelZ * dt;

      const res = resolvePlayerMovement(
        prevX,
        prevZ,
        nextX,
        nextZ,
        this.playerPos.y,
        this.doumenOpen
      );

      const movedDist = Math.hypot(res.x - prevX, res.z - prevZ);
      // Dampen velocity cleanly if colliding against stone masonry
      if (movedDist < horizSpeed * dt * 0.25) {
        this.playerVelX *= 0.45;
        this.playerVelZ *= 0.45;
      }
      this.playerPos.x = res.x;
      this.playerPos.z = res.z;
      targetGroundY = res.y;

      if (res.crossedThreshold) {
        this.thresholdBumpTimer = 0.45;
      }

      // Gait-synced camera stride + 6-surface procedural footstep foley
      this.walkPhase += movedDist * 2.25;
      this.stepDistAccum += movedDist;
      if (this.stepDistAccum >= 1.65) {
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

    // Decaying trauma camera shake (e.g. Watchtower Gong boom)
    let shakePitch = 0;
    let shakeYaw = 0;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 0.9);
      const mag = this.trauma * this.trauma * 0.045;
      shakePitch = (Math.random() - 0.5) * mag;
      shakeYaw = (Math.random() - 0.5) * mag;
    }

    const strideFactor = Math.min(1, horizSpeed / 5.4);
    const gaitBob = Math.sin(this.walkPhase) * 0.036 * strideFactor;
    const gaitRoll = Math.cos(this.walkPhase * 0.5) * 0.0045 * strideFactor;
    const eyeHeight = 1.66 + gaitBob + thresholdLift;
    this.camera.position.set(this.playerPos.x, this.playerPos.y + eyeHeight, this.playerPos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.playerPitch + shakePitch, this.playerYaw + shakeYaw, gaitRoll);

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

    this.callbacks.onHudUpdate({
      currentNodeId: node.id,
      currentNodeName: `${node.number} · ${node.name}`,
      currentZoneName: node.zoneName,
      currentSurface: surf,
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      playerYaw: this.playerYaw,
      nearbyInteractable: this.nearbyInteractable,
      visitedNodes: Array.from(this.visitedNodes),
      triggeredInteractions: Array.from(this.triggeredInteractions),
      inspectedArtifacts: Array.from(this.inspectedArtifacts),
      fiveElementsLit: this.fiveElementsLit,
      holdingUmbrella: this.holdingUmbrella,
      xrayActive: this.xrayActive,
      taijiActive: this.taijiActive,
      doumenOpen: this.doumenOpen,
      gunSlitActive: this.gunSlitActive,
      weather: this.weather,
      cameraView: this.cameraView,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
    this.resizeObserver?.disconnect();

    this.poeticSky.geometry.dispose();
    (this.poeticSky.material as THREE.Material).dispose();
    this.cloudTopMat.dispose();
    this.cloudBotMat.dispose();
    this.rainPoints.geometry.dispose();
    (this.rainPoints.material as THREE.Material).dispose();
    this.fireflyPoints.geometry.dispose();
    (this.fireflyPoints.material as THREE.Material).dispose();
    this.envMaps.sunny.dispose();
    this.envMaps.rain.dispose();
    this.envMaps.lantern.dispose();
    this.composer?.dispose();
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
