import * as THREE from 'three';
import type { WeatherMode } from '../types/game';
import {
  attachSubsurfaceShader,
  getWoodcarveMicroMaps,
  HANDCRAFTED_PAL,
  type MaterialLibrary,
} from './proceduralTextures';
import { groundHeightAt } from './worldMath';
import {
  sampleFlockOrbit,
  sampleOpenPolyline,
  samplePondSwimPath,
  type PathPoint2D,
} from './livingPaths';
import {
  createCuppedPetalGeometry,
  createSoftPillowGeometry,
  createTaperedCurveGeometry,
  createTurnedLatheGeometry,
} from './sculptHelpers';
import {
  buildArticulatedArm,
  buildArticulatedLeg,
  buildHakkaLapelAndSash,
  createCraftFabricMat,
  createCraftSkinMat,
  createCraftStrawMat,
  createPleatedRobeGeometry,
  damp,
  dampAngle,
  populateCraftFace,
  Spring1D,
  VIRTUAL_MASS,
} from './characterCraft';
import {
  classifyZone,
  computeZoneBridgeWaypoints,
  FreeRoamSystem,
  type MinimapBlip,
  type RoamAgentState,
} from './freeRoamSystem';
import { evaluateLivingBehavior } from './livingBehavior';

export interface GrainLiveState {
  spread: number;
  basketFill: number;
  matDeployed: number;
  isGathering: boolean;
}

export interface LivingWorldRefs {
  root: THREE.Group;
  update: (
    dt: number,
    t: number,
    weather: WeatherMode,
    timeOfDay?: number,
    doumenOpen?: boolean
  ) => void;
  getGrainLiveState: () => GrainLiveState;
  getMinimapBlips: () => MinimapBlip[];
  dispose: () => void;
}

interface WalkingVillagerAnim {
  id: string;
  group: THREE.Group;
  torso: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftElbow: THREE.Object3D;
  rightElbow: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  head: THREE.Object3D;
  sashTailL: THREE.Object3D;
  sashTailR: THREE.Object3D;
  sashSpring: Spring1D;
  waypoints: readonly PathPoint2D[];
  speed: number;
  phaseOffset: number;
  carryPole?: THREE.Object3D;
  pinwheel?: THREE.Object3D;
  hasUmbrella?: boolean;
  rainUmbrella?: THREE.Group;
  isChild?: boolean;
  roamAgent: RoamAgentState;
  homeRoom: { x: number; z: number; yaw: number };
  homeAnchor: { x: number; z: number } | null;
  homeRoute: PathPoint2D[];
  homeBlendSmooth: number;
  stridePhase: number;
}

interface IdleVillagerAnim {
  id: string;
  group: THREE.Group;
  head: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftElbow: THREE.Object3D;
  rightElbow: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  torso: THREE.Object3D;
  sashTailL: THREE.Object3D;
  sashTailR: THREE.Object3D;
  sashSpring: Spring1D;
  kind: 'rake' | 'wash' | 'fan' | 'chat' | 'tea' | 'bow' | 'tend';
  phaseOffset: number;
  ripple?: THREE.Mesh;
  rakeGroup?: THREE.Group;
  baseX: number;
  baseZ: number;
  baseYaw: number;
  seated?: boolean;
  homeRoute: PathPoint2D[];
  homeYaw: number;
  homeBlendSmooth: number;
  stridePhase: number;
  curX: number;
  curZ: number;
  curYaw: number;
}

interface PoultryAnim {
  id: string;
  group: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Object3D;
  baseX: number;
  baseZ: number;
  wanderR: number;
  phaseOffset: number;
  speed: number;
  isChick?: boolean;
  leaderIdx?: number;
  roamAgent?: RoamAgentState;
  coopTarget: { x: number; z: number; entryX: number; entryZ: number };
  homeAnchor: { x: number; z: number } | null;
  coopBlendSmooth: number;
}

interface WaterfowlAnim {
  group: THREE.Group;
  neck: THREE.Object3D;
  wake: THREE.Mesh;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phaseOffset: number;
  dir: 1 | -1;
  nestX: number;
  nestZ: number;
  nestYaw: number;
  nestBlendSmooth: number;
}

interface QuadrupedAnim {
  id: string;
  group: THREE.Group;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  legs: THREE.Object3D[];
  kind: 'dog_patrol' | 'puppy_hop' | 'cat_loaf' | 'buffalo' | 'goat';
  waypoints?: readonly PathPoint2D[];
  speed: number;
  phaseOffset: number;
  baseX: number;
  baseZ: number;
  baseY: number;
  roamAgent: RoamAgentState;
  homeRouteTail: PathPoint2D[];
  homeYaw: number;
  homeAnchor: { x: number; z: number } | null;
  homeRoute: PathPoint2D[];
  homeBlendSmooth: number;
  gaitPhase: number;
}

interface CraneAnim {
  group: THREE.Group;
  leftWing: THREE.Object3D;
  rightWing: THREE.Object3D;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  alt: number;
  speed: number;
  phaseOffset: number;
  roostX: number;
  roostY: number;
  roostZ: number;
  roostYaw: number;
}

interface ButterflyAnim {
  group: THREE.Group;
  leftWing: THREE.Object3D;
  rightWing: THREE.Object3D;
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phaseOffset: number;
  perchX: number;
  perchY: number;
  perchZ: number;
}

interface SmokePuff {
  mesh: THREE.Mesh;
  phase: number;
}

interface SkyLanternItem {
  group: THREE.Group;
  baseX: number;
  baseZ: number;
  phase: number;
  speed: number;
  swayAmp: number;
}

/**
 * Builds the living, bustling Hakka Weilongwu community in the handcrafted
 * carved-wood / gouache picture-book aesthetic:
 * - 19 animated Hakka villagers with turned robes, diagonal lapels, bent-knee seated rigs,
 *   and finely detailed traditional headwear & props
 * - 14 animated poultry (2 roosters with curved iridescent tail plumes, 6 hens, 6 fluffy chicks)
 * - 7 animated pond waterfowl (3 S-necked white geese & 4 mallard ducks with wakes)
 * - 6 domestic village animals (village dog, spotted puppy, tabby ginger cat, crescent-horned
 *   water buffalo, 2 wooly white goats)
 * - 6 soaring feathered cranes, 12 cupped-wing butterflies, curling kitchen chimney smoke,
 *   drifting peach-blossom petals (sunny), and 28 turned paper sky lanterns (lantern night).
 */
export function buildLivingWorld(
  mats: MaterialLibrary,
  isSoftwareGl: boolean
): LivingWorldRefs {
  const root = new THREE.Group();
  root.name = 'LivingHakkaCommunity';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const castShadow = !isSoftwareGl;

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Shared handcrafted PBR woodcarving / gouache materials with micro-grain relief
  const woodMicro = getWoodcarveMicroMaps();
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const woodPaintMat = (hex: number, rough = 0.78, metal = 0.02): THREE.MeshStandardMaterial => {
    const key = `${hex}_${rough.toFixed(2)}_${metal.toFixed(2)}`;
    const existing = matCache.get(key);
    if (existing) return existing;
    const m = trackMat(
      new THREE.MeshStandardMaterial({
        color: hex,
        normalMap: woodMicro.normal,
        normalScale: new THREE.Vector2(0.15, 0.15),
        roughnessMap: woodMicro.roughness,
        roughness: rough,
        metalness: metal,
      })
    );
    matCache.set(key, m);
    return m;
  };

  // Woven Hakka linen/cotton fabric with tactile cross-hatch normal + physical sheen (cinematic-slide-craft)
  const clothMat = (hex: number, sheenHex: number, rough = 0.84): THREE.MeshStandardMaterial =>
    createCraftFabricMat(hex, sheenHex, trackMat, rough, 0.56);

  // Warm sculpted skin with soft Subsurface Scattering (SSS) wrap translucency
  const skinMat = createCraftSkinMat('villager_skin', trackMat, HANDCRAFTED_PAL.skin);
  const cheekMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: HANDCRAFTED_PAL.cheek,
        roughness: 0.72,
        metalness: 0.0,
      })
    ),
    {
      key: 'villager_cheek',
      tintHex: 0xf49078,
      backStrength: 0.3,
      wrapStrength: 0.24,
      power: 2.6,
    }
  );
  const lipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9766a,
      roughness: 0.48,
      metalness: 0.0,
    })
  );
  const scleraMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfaf6ee,
      roughness: 0.22,
      metalness: 0.0,
    })
  );
  const eyeIrisMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x261d17,
      roughness: 0.14,
      metalness: 0.0,
      clearcoat: 0.92,
      clearcoatRoughness: 0.08,
    })
  );
  const inkMat = woodPaintMat(HANDCRAFTED_PAL.ink, 0.42);
  const eyeHighlightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const hairDarkMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x232632,
      normalMap: woodMicro.normal,
      normalScale: new THREE.Vector2(0.14, 0.14),
      roughness: 0.48,
      sheen: 0.32,
      sheenRoughness: 0.52,
      sheenColor: new THREE.Color(0x5a637d),
    })
  );
  const hairSilverMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xe2ddd2,
      normalMap: woodMicro.normal,
      normalScale: new THREE.Vector2(0.12, 0.12),
      roughness: 0.56,
      sheen: 0.38,
      sheenRoughness: 0.58,
      sheenColor: new THREE.Color(0xffffff),
    })
  );
  const strawMat = createCraftStrawMat(0xe8cb82, trackMat, 0.8);
  const strawRimMat = createCraftStrawMat(0xc8a35a, trackMat, 0.76);
  const bambooPoleMat = woodPaintMat(0xb89452, 0.64);
  const clothIndigoMat = clothMat(0x2d5e92, 0x82b2e0, 0.84);
  const clothCeruleanMat = clothMat(HANDCRAFTED_PAL.cer, 0x9cd2ef, 0.82);
  const clothVermMat = clothMat(HANDCRAFTED_PAL.verm, 0xf29f7e, 0.8);
  const clothTealMat = clothMat(HANDCRAFTED_PAL.teal, 0x96d9d4, 0.82);
  const clothLemonMat = clothMat(HANDCRAFTED_PAL.lemon, 0xfde99c, 0.8);
  const clothPeachMat = clothMat(HANDCRAFTED_PAL.peach, 0xfbd5b2, 0.82);
  const clothCreamMat = clothMat(HANDCRAFTED_PAL.cream, 0xfffaf0, 0.84);
  const clothNavyMat = clothMat(HANDCRAFTED_PAL.navy, 0x5c84b2, 0.84);
  const clothLilacMat = clothMat(HANDCRAFTED_PAL.lilac, 0xd4c9ea, 0.82);
  const clothSageMat = clothMat(HANDCRAFTED_PAL.sage, 0xc9dfae, 0.84);
  // Glazed celadon porcelain & kiln-fired tea kettle with physical clearcoat IOR 1.54
  const celadonMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x9ec7b8,
      roughness: 0.26,
      metalness: 0.02,
      ior: 1.54,
      clearcoat: 0.88,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.25,
    })
  );
  const clayPotMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x8e4c36,
      normalMap: woodMicro.normal,
      normalScale: new THREE.Vector2(0.16, 0.16),
      roughness: 0.44,
      metalness: 0.02,
      ior: 1.52,
      clearcoat: 0.46,
      clearcoatRoughness: 0.26,
    })
  );

  // Shared sculpted & utility geometries
  const sphereGeo = trackGeo(new THREE.SphereGeometry(1, 12, 10));
  const cylGeo = trackGeo(new THREE.CylinderGeometry(1, 1, 1, 10));
  const coneGeo = trackGeo(new THREE.ConeGeometry(1, 1, 10));
  const boxGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const shadowDiscGeo = trackGeo(new THREE.CircleGeometry(1, 14));
  shadowDiscGeo.rotateX(-Math.PI * 0.5);

  // Pleated tailored Hakka tunic/robe with oval anatomical torso cross-section & hem drapery
  const robeGeo = trackGeo(
    createPleatedRobeGeometry(
      [
        [0.01, -0.04],
        [0.275, -0.04],
        [0.258, 0.08],
        [0.218, 0.24],
        [0.212, 0.38],
        [0.224, 0.54],
        [0.184, 0.61],
        [0.118, 0.64],
        [0.0, 0.64],
      ],
      22,
      10,
      0.012
    )
  );
  const douliGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.42, 0.0],
        [0.34, 0.055],
        [0.21, 0.125],
        [0.08, 0.18],
        [0.024, 0.215],
        [0.0, 0.225],
      ],
      18
    )
  );
  const liangmaoBrimGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.14, 0.045],
        [0.26, 0.036],
        [0.38, 0.015],
        [0.39, 0.0],
        [0.36, -0.012],
        [0.15, 0.0],
      ],
      18
    )
  );
  const liangmaoCurtainGeo = trackGeo(
    new THREE.CylinderGeometry(0.365, 0.39, 0.24, 18, 1, true, -Math.PI * 0.68, Math.PI * 1.36)
  );
  // Subtle pleated undulation on the Hakka hat cloth curtain
  {
    const pos = liangmaoCurtainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const pleat = 1 + 0.035 * Math.sin(a * 14) * (y < 0 ? 1.0 : 0.3);
      pos.setX(i, x * pleat);
      pos.setZ(i, z * pleat);
    }
    liangmaoCurtainGeo.computeVertexNormals();
  }
  const elderCapGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.182, 0.0],
        [0.186, 0.035],
        [0.17, 0.085],
        [0.12, 0.12],
        [0.04, 0.135],
        [0.0, 0.138],
      ],
      14
    )
  );
  const basketGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.18, 0.0],
        [0.23, 0.09],
        [0.265, 0.2],
        [0.275, 0.25],
        [0.245, 0.25],
        [0.22, 0.06],
        [0.0, 0.05],
      ],
      14
    )
  );

  // Turned woodcarving animal & bird geometries
  const chickenBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.23],
        [0.095, -0.19],
        [0.16, -0.08],
        [0.175, 0.04],
        [0.145, 0.15],
        [0.08, 0.22],
        [0.0, 0.24],
      ],
      14
    )
  );
  chickenBodyGeo.rotateX(Math.PI * 0.5);

  const chickenWingGeo = trackGeo(createCuppedPetalGeometry(0.16, 0.24, 0.045));
  const roosterPlumeGeos = [
    trackGeo(
      createTaperedCurveGeometry(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0.16, -0.11),
          new THREE.Vector3(0, 0.26, -0.25),
          new THREE.Vector3(0, 0.16, -0.37),
        ],
        0.04,
        0.008,
        10,
        6
      )
    ),
    trackGeo(
      createTaperedCurveGeometry(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0.13, -0.1),
          new THREE.Vector3(0, 0.19, -0.22),
          new THREE.Vector3(0, 0.09, -0.32),
        ],
        0.036,
        0.008,
        10,
        6
      )
    ),
  ];

  const waterfowlBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.36],
        [0.12, -0.29],
        [0.225, -0.12],
        [0.24, 0.06],
        [0.2, 0.22],
        [0.11, 0.32],
        [0.0, 0.35],
      ],
      16
    )
  );
  waterfowlBodyGeo.rotateX(Math.PI * 0.5);
  const waterfowlWingGeo = trackGeo(createCuppedPetalGeometry(0.24, 0.42, 0.055));

  const gooseNeckGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.12, 0.05),
        new THREE.Vector3(0, 0.28, -0.02),
        new THREE.Vector3(0, 0.41, 0.055),
      ],
      0.075,
      0.052,
      12,
      8
    )
  );
  const duckNeckGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.09, 0.025),
        new THREE.Vector3(0, 0.21, 0.045),
      ],
      0.078,
      0.062,
      8,
      8
    )
  );

  const dogBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.43],
        [0.15, -0.36],
        [0.19, -0.18],
        [0.185, -0.02],
        [0.225, 0.16],
        [0.21, 0.32],
        [0.12, 0.4],
        [0.0, 0.42],
      ],
      16
    )
  );
  dogBodyGeo.rotateX(Math.PI * 0.5);
  const dogTailGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.1, -0.1),
        new THREE.Vector3(0, 0.24, -0.11),
        new THREE.Vector3(0, 0.3, -0.02),
      ],
      0.048,
      0.018,
      10,
      7
    )
  );
  const dogEarGeo = trackGeo(createCuppedPetalGeometry(0.11, 0.18, 0.025));

  const catTailGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.12, 0.03, -0.04),
        new THREE.Vector3(-0.24, 0.07, 0.06),
        new THREE.Vector3(-0.29, 0.14, 0.16),
      ],
      0.036,
      0.018,
      12,
      7
    )
  );

  const buffaloBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -1.04],
        [0.34, -0.92],
        [0.54, -0.6],
        [0.6, -0.12],
        [0.64, 0.36],
        [0.58, 0.78],
        [0.36, 0.98],
        [0.0, 1.04],
      ],
      18
    )
  );
  buffaloBodyGeo.rotateX(Math.PI * 0.5);

  const makeBuffaloHornGeo = (side: -1 | 1) =>
    trackGeo(
      createTaperedCurveGeometry(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(side * 0.3, 0.06, -0.08),
          new THREE.Vector3(side * 0.58, 0.24, -0.2),
          new THREE.Vector3(side * 0.56, 0.48, -0.12),
          new THREE.Vector3(side * 0.38, 0.58, 0.04),
        ],
        0.078,
        0.016,
        14,
        8
      )
    );
  const bufHornLGeo = makeBuffaloHornGeo(-1);
  const bufHornRGeo = makeBuffaloHornGeo(1);

  const makeGoatHornGeo = (side: -1 | 1) =>
    trackGeo(
      createTaperedCurveGeometry(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(side * 0.03, 0.09, -0.04),
          new THREE.Vector3(side * 0.075, 0.16, -0.14),
          new THREE.Vector3(side * 0.09, 0.15, -0.22),
        ],
        0.03,
        0.008,
        10,
        6
      )
    );
  const goatHornLGeo = makeGoatHornGeo(-1);
  const goatHornRGeo = makeGoatHornGeo(1);

  const addShadowDisc = (parent: THREE.Object3D, rX: number, rZ = rX) => {
    const disc = new THREE.Mesh(shadowDiscGeo, mats.contactShadow);
    disc.position.y = 0.022;
    disc.scale.set(rX, 1, rZ);
    parent.add(disc);
  };

  // =========================================================================
  // 1. HANDCRAFTED WOODCARVED HAKKA VILLAGER FACTORY (19 Villagers)
  // =========================================================================
  interface VillagerSpec {
    tunicMat: THREE.MeshStandardMaterial;
    pantsMat: THREE.MeshStandardMaterial;
    apronMat?: THREE.MeshStandardMaterial;
    scarfMat?: THREE.MeshStandardMaterial;
    hat?: 'hakka_curtain' | 'conical' | 'elder_cap' | 'bun' | 'child_tufts';
    elder?: boolean;
    scale?: number;
    seated?: boolean;
  }

  interface BuiltVillager {
    group: THREE.Group;
    torso: THREE.Group;
    head: THREE.Group;
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftElbow: THREE.Group;
    rightElbow: THREE.Group;
    leftHandSocket: THREE.Group;
    rightHandSocket: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
    leftKnee: THREE.Group;
    rightKnee: THREE.Group;
    sashTailL: THREE.Group;
    sashTailR: THREE.Group;
  }

  const createVillager = (spec: VillagerSpec): BuiltVillager => {
    const sc = spec.scale ?? 1.0;
    const g = new THREE.Group();
    addShadowDisc(g, 0.36 * sc, 0.34 * sc);

    const rig = new THREE.Group();
    rig.scale.setScalar(sc);
    g.add(rig);

    const hipY = 0.66;

    // Unified 2-segment articulated legs for BOTH standing and seated villagers so seated
    // villagers smoothly stand up off stools/benches and stride naturally when walking indoors!
    const makeLeg = (side: -1 | 1): { hip: THREE.Group; knee: THREE.Group } =>
      buildArticulatedLeg({
        side,
        hipPos: [side * 0.102, hipY, 0],
        thighLen: 0.32,
        calfLen: 0.34,
        faceSign: 1,
        trouserMat: spec.pantsMat,
        shoeMat: inkMat,
        soleMat: clothCreamMat,
        trackGeo,
        castShadow,
      });

    const leftLegBuilt = makeLeg(-1);
    const rightLegBuilt = makeLeg(1);
    const leftLeg = leftLegBuilt.hip;
    const rightLeg = rightLegBuilt.hip;
    const leftKnee = leftLegBuilt.knee;
    const rightKnee = rightLegBuilt.knee;
    rig.add(leftLeg, rightLeg);

    if (spec.seated) {
      rig.position.y = -0.21 * sc;
      leftLeg.rotation.x = -Math.PI * 0.46;
      rightLeg.rotation.x = -Math.PI * 0.46;
      leftKnee.rotation.x = Math.PI * 0.46;
      rightKnee.rotation.x = Math.PI * 0.46;
    }
    g.userData.rig = rig;
    g.userData.rigScale = sc;
    g.userData.seated = Boolean(spec.seated);

    // Tailored pleated Hakka robe torso with diagonal lapel, 3 frog buttons & swaying waist sash
    const torso = new THREE.Group();
    torso.position.set(0, hipY, 0);
    rig.add(torso);

    const robe = new THREE.Mesh(robeGeo, spec.tunicMat);
    robe.castShadow = castShadow;
    robe.receiveShadow = true;
    torso.add(robe);

    const trimMat = spec.scarfMat ?? clothCreamMat;

    const { sashTailL, sashTailR } = buildHakkaLapelAndSash({
      parent: torso,
      faceSign: 1,
      waistY: 0.22,
      chestY: 0.48,
      radius: 0.215,
      trimMat,
      buttonMat: mats.gildedGold,
      trackGeo,
      castShadow,
    });

    // Traditional Hakka layered front apron with pleated drape
    if (spec.apronMat) {
      const apron = new THREE.Mesh(boxGeo, spec.apronMat);
      apron.scale.set(0.25, 0.41, 0.036);
      apron.position.set(0, 0.14, 0.218);
      apron.castShadow = castShadow;
      torso.add(apron);
    }

    // 2-segment articulated arms (upper sleeve + elbow pivot + flared lower sleeve + cuff + sculpted palm/thumb)
    const leftArmBuilt = buildArticulatedArm({
      side: -1,
      shoulderPos: [-0.23, 0.56, 0],
      upperLen: 0.21,
      lowerLen: 0.21,
      sleeveMat: spec.tunicMat,
      cuffMat: trimMat,
      skinMat,
      trackGeo,
      castShadow,
    });
    const rightArmBuilt = buildArticulatedArm({
      side: 1,
      shoulderPos: [0.23, 0.56, 0],
      upperLen: 0.21,
      lowerLen: 0.21,
      sleeveMat: spec.tunicMat,
      cuffMat: trimMat,
      skinMat,
      trackGeo,
      castShadow,
    });
    const leftArm = leftArmBuilt.shoulder;
    const rightArm = rightArmBuilt.shoulder;
    const leftElbow = leftArmBuilt.elbow;
    const rightElbow = rightArmBuilt.elbow;
    const leftHandSocket = leftArmBuilt.hand;
    const rightHandSocket = rightArmBuilt.hand;
    torso.add(leftArm, rightArm);

    // Sculpted facial anatomy with contoured jaw, nose bridge, glossy catchlight eyes, arched brows & warm smile
    const head = new THREE.Group();
    head.position.set(0, 0.83, 0);
    torso.add(head);

    const hairMat = spec.elder ? hairSilverMat : hairDarkMat;
    populateCraftFace(head, {
      faceSign: 1,
      skinMat,
      hairMat,
      cheekMat,
      lipMat,
      eyeIrisMat,
      scleraMat,
      catchlightMat: eyeHighlightMat,
      trackGeo,
      castShadow,
      isElder: spec.elder,
      isChild: spec.hat === 'child_tufts',
    });

    // Sculpted layered hair crown & traditional Hakka headwear
    const hairCap = new THREE.Mesh(sphereGeo, hairMat);
    hairCap.scale.set(0.168, 0.164, 0.174);
    hairCap.position.set(0, 0.044, -0.022);
    head.add(hairCap);

    // Soft curved front bangs (刘海) for children and women
    if (spec.hat === 'child_tufts' || spec.hat === 'bun' || spec.hat === 'hakka_curtain') {
      for (const sx of [-1, 1]) {
        const bang = new THREE.Mesh(sphereGeo, hairMat);
        bang.scale.set(0.084, 0.058, 0.078);
        bang.position.set(sx * 0.056, 0.114, 0.084);
        bang.rotation.z = -sx * 0.28;
        head.add(bang);
      }
    }

    if (spec.elder && spec.hat !== 'bun') {
      const mustache = new THREE.Mesh(sphereGeo, hairSilverMat);
      mustache.scale.set(0.056, 0.018, 0.022);
      mustache.position.set(0, -0.044, 0.152);
      head.add(mustache);

      const beard = new THREE.Mesh(coneGeo, hairSilverMat);
      beard.scale.set(0.05, 0.145, 0.042);
      beard.rotation.x = Math.PI;
      beard.position.set(0, -0.145, 0.112);
      head.add(beard);
    }

    if (spec.hat === 'hakka_curtain') {
      // Iconic Meizhou Hakka Liangmao (客家凉帽): woven bamboo brim + pleated indigo curtain + silk ribbons
      const brim = new THREE.Mesh(liangmaoBrimGeo, strawMat);
      brim.position.y = 0.14;
      head.add(brim);

      const brimTrim = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.382, 0.016, 6, 20)),
        strawRimMat
      );
      brimTrim.rotation.x = Math.PI * 0.5;
      brimTrim.position.y = 0.145;
      head.add(brimTrim);

      const curtain = new THREE.Mesh(liangmaoCurtainGeo, clothIndigoMat);
      curtain.position.y = 0.025;
      curtain.rotation.y = Math.PI;
      head.add(curtain);

      for (const sx of [-1, 1]) {
        const ribbon = new THREE.Mesh(boxGeo, sx < 0 ? clothVermMat : clothPeachMat);
        ribbon.scale.set(0.032, 0.24, 0.012);
        ribbon.position.set(sx * 0.22, -0.05, -0.25);
        ribbon.rotation.z = sx * 0.18;
        head.add(ribbon);
      }
    } else if (spec.hat === 'conical') {
      const douli = new THREE.Mesh(douliGeo, strawMat);
      douli.position.y = 0.115;
      head.add(douli);
      const band = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.415, 0.014, 6, 18)),
        strawRimMat
      );
      band.rotation.x = Math.PI * 0.5;
      band.position.y = 0.118;
      head.add(band);
    } else if (spec.hat === 'elder_cap') {
      const cap = new THREE.Mesh(elderCapGeo, clothNavyMat);
      cap.position.y = 0.1;
      head.add(cap);
      const capBand = new THREE.Mesh(cylGeo, mats.gildedGold);
      capBand.scale.set(0.172, 0.02, 0.172);
      capBand.position.y = 0.108;
      head.add(capBand);
      const knot = new THREE.Mesh(sphereGeo, clothVermMat);
      knot.scale.setScalar(0.03);
      knot.position.y = 0.245;
      head.add(knot);
    } else if (spec.hat === 'bun') {
      const bun = new THREE.Mesh(sphereGeo, hairMat);
      bun.scale.set(0.082, 0.072, 0.078);
      bun.position.set(0, 0.075, -0.165);
      head.add(bun);
      const pin = new THREE.Mesh(cylGeo, celadonMat);
      pin.scale.set(0.011, 0.21, 0.011);
      pin.rotation.z = Math.PI * 0.42;
      pin.position.set(0, 0.085, -0.165);
      head.add(pin);
      const pinBead = new THREE.Mesh(sphereGeo, mats.gildedGold);
      pinBead.scale.setScalar(0.022);
      pinBead.position.set(0.095, 0.112, -0.165);
      head.add(pinBead);
    } else if (spec.hat === 'child_tufts') {
      for (const sx of [-1, 1]) {
        const tuft = new THREE.Mesh(sphereGeo, hairDarkMat);
        tuft.scale.setScalar(0.066);
        tuft.position.set(sx * 0.14, 0.135, -0.018);
        head.add(tuft);
        const rib = new THREE.Mesh(cylGeo, clothVermMat);
        rib.scale.set(0.052, 0.024, 0.052);
        rib.position.set(sx * 0.14, 0.098, -0.018);
        head.add(rib);
        const tailRib = new THREE.Mesh(boxGeo, clothVermMat);
        tailRib.scale.set(0.02, 0.115, 0.01);
        tailRib.position.set(sx * 0.175, 0.055, -0.026);
        tailRib.rotation.z = sx * 0.32;
        head.add(tailRib);
      }
    }

    return {
      group: g,
      torso,
      head,
      leftArm,
      rightArm,
      leftElbow,
      rightElbow,
      leftHandSocket,
      rightHandSocket,
      leftLeg,
      rightLeg,
      leftKnee,
      rightKnee,
      sashTailL,
      sashTailR,
    };
  };

  // Shared turned oil-paper umbrella factory mounted directly to a villager's rightHandSocket
  const sharedUmbCanopyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.23],
        [0.16, 0.21],
        [0.36, 0.155],
        [0.54, 0.075],
        [0.64, 0.0],
      ],
      18
    )
  );
  const sharedUmbRimGeo = trackGeo(new THREE.TorusGeometry(0.635, 0.018, 6, 20));
  const createHandOilPaperUmbrella = (canopyHex: number): THREE.Group => {
    const umbGroup = new THREE.Group();
    // Oriented so when rightArm.rotation.x = -0.68, the handle rises vertically from the palm!
    umbGroup.rotation.set(0.56, 0, -0.08);

    const handle = new THREE.Mesh(cylGeo, bambooPoleMat);
    handle.scale.set(0.016, 1.18, 0.016);
    handle.position.y = 0.52;
    umbGroup.add(handle);

    const canopy = new THREE.Mesh(
      sharedUmbCanopyGeo,
      trackMat(
        new THREE.MeshStandardMaterial({
          color: canopyHex,
          roughness: 0.48,
          side: THREE.DoubleSide,
        })
      )
    );
    canopy.position.y = 0.94;
    umbGroup.add(canopy);

    for (let r = 0; r < 8; r++) {
      const a = (r / 8) * Math.PI * 2;
      const rib = new THREE.Mesh(cylGeo, bambooPoleMat);
      rib.scale.set(0.008, 0.64, 0.008);
      rib.position.set(Math.cos(a) * 0.3, 1.05, Math.sin(a) * 0.3);
      rib.rotation.z = Math.cos(a) * 1.24;
      rib.rotation.x = -Math.sin(a) * 1.24;
      umbGroup.add(rib);
    }
    const rim = new THREE.Mesh(sharedUmbRimGeo, clothCreamMat);
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = 0.94;
    umbGroup.add(rim);

    const finial = new THREE.Mesh(sphereGeo, mats.gildedGold);
    finial.scale.setScalar(0.036);
    finial.position.y = 1.18;
    umbGroup.add(finial);
    return umbGroup;
  };

  // =========================================================================
  // 2. SHARED WHOLE-MAP FREE-ROAM ENGINE & PHYSICAL ANIMAL SHELTERS/NESTS
  // =========================================================================
  const freeRoam = new FreeRoamSystem(202605);
  const walkingVillagers: WalkingVillagerAnim[] = [];
  const idleVillagers: IdleVillagerAnim[] = [];

  // Dedicated handcrafted shelters & nests for every animal species (Module 4)
  {
    const hayMat = createCraftStrawMat(0xdcb866, trackMat, 0.88);
    const shelterRoot = new THREE.Group();
    shelterRoot.name = 'AnimalSheltersAndNests';
    root.add(shelterRoot);

    // 2.0A Courtyard Pitched-Roof Wooden Doghouse (狗窝) at (-9.6, 22.85), facing South (+Z)
    {
      const dx = -9.6;
      const dz = 22.85;
      const dy = groundHeightAt(dx, dz, 0);
      const doghouse = new THREE.Group();
      doghouse.position.set(dx, dy, dz);
      addShadowDisc(doghouse, 0.86, 0.78);

      const floor = new THREE.Mesh(boxGeo, mats.darkTimber);
      floor.scale.set(1.24, 0.08, 1.12);
      floor.position.y = 0.04;
      doghouse.add(floor);

      // Left, right & back plank walls
      for (const sx of [-0.56, 0.56]) {
        const wall = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
        wall.scale.set(0.08, 0.78, 1.04);
        wall.position.set(sx, 0.45, 0);
        wall.castShadow = castShadow;
        doghouse.add(wall);
      }
      const backWall = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
      backWall.scale.set(1.2, 0.96, 0.08);
      backWall.position.set(0, 0.54, -0.49);
      backWall.castShadow = castShadow;
      doghouse.add(backWall);

      // Front doorway frame pillars + lintel (open arch facing +Z)
      for (const sx of [-0.42, 0.42]) {
        const post = new THREE.Mesh(boxGeo, mats.darkTimber);
        post.scale.set(0.28, 0.78, 0.08);
        post.position.set(sx, 0.45, 0.49);
        doghouse.add(post);
      }
      const lintel = new THREE.Mesh(boxGeo, mats.darkTimber);
      lintel.scale.set(1.16, 0.18, 0.1);
      lintel.position.set(0, 0.84, 0.49);
      doghouse.add(lintel);

      // Pitched Qing-tile gable roof
      for (const sx of [-1, 1]) {
        const slope = new THREE.Mesh(boxGeo, mats.roofTile);
        slope.scale.set(0.86, 0.07, 1.32);
        slope.position.set(sx * 0.36, 1.02, 0.02);
        slope.rotation.z = -sx * 0.46;
        slope.castShadow = castShadow;
        doghouse.add(slope);
      }
      const ridge = new THREE.Mesh(cylGeo, mats.roofTileDark);
      ridge.scale.set(0.055, 1.34, 0.055);
      ridge.rotation.x = Math.PI * 0.5;
      ridge.position.set(0, 1.22, 0.02);
      doghouse.add(ridge);

      // Warm straw cushion inside + ceramic water bowl by entrance
      const bed = new THREE.Mesh(trackGeo(createSoftPillowGeometry(0.46, 1.2, 0.24, 10, 8)), hayMat);
      bed.position.set(0, 0.13, -0.05);
      doghouse.add(bed);

      const bowl = new THREE.Mesh(cylGeo, celadonMat);
      bowl.scale.set(0.14, 0.08, 0.14);
      bowl.position.set(0.56, 0.04, 0.68);
      doghouse.add(bowl);

      shelterRoot.add(doghouse);
    }

    // 2.0B Courtyard Timber Chicken Coop (鸡舍) at (13.4, 22.95)
    {
      const cx = 13.4;
      const cz = 22.95;
      const cy = groundHeightAt(cx, cz, 0);
      const coop = new THREE.Group();
      coop.position.set(cx, cy, cz);
      addShadowDisc(coop, 1.18, 0.92);

      const base = new THREE.Mesh(boxGeo, mats.darkTimber);
      base.scale.set(1.86, 0.1, 1.34);
      base.position.y = 0.05;
      coop.add(base);

      // Slatted coop back & side walls + timber corner posts
      for (const px of [-0.88, 0.88]) {
        for (const pz of [-0.62, 0.62]) {
          const post = new THREE.Mesh(boxGeo, mats.darkTimber);
          post.scale.set(0.09, 1.05, 0.09);
          post.position.set(px, 0.56, pz);
          post.castShadow = castShadow;
          coop.add(post);
        }
      }
      const back = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
      back.scale.set(1.78, 0.98, 0.07);
      back.position.set(0, 0.56, -0.62);
      coop.add(back);
      const eastWall = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
      eastWall.scale.set(0.07, 0.98, 1.26);
      eastWall.position.set(0.88, 0.56, 0);
      coop.add(eastWall);

      // Bamboo slats along front-east & west sides leaving an inviting low coop opening
      for (let s = 0; s < 5; s++) {
        const slat = new THREE.Mesh(cylGeo, bambooPoleMat);
        slat.scale.set(0.018, 0.92, 0.018);
        slat.position.set(0.18 + s * 0.15, 0.54, 0.62);
        coop.add(slat);
      }

      // Sloped Qing-tile shed roof
      const roof = new THREE.Mesh(boxGeo, mats.roofTile);
      roof.scale.set(2.14, 0.08, 1.62);
      roof.position.set(0, 1.16, 0.04);
      roof.rotation.x = 0.2;
      roof.castShadow = castShadow;
      coop.add(roof);

      // Straw floor + wooden roosting perch bars inside
      const strawFloor = new THREE.Mesh(boxGeo, hayMat);
      strawFloor.scale.set(1.66, 0.05, 1.14);
      strawFloor.position.set(0, 0.12, 0);
      coop.add(strawFloor);
      for (const pz of [-0.28, 0.12]) {
        const perch = new THREE.Mesh(cylGeo, bambooPoleMat);
        perch.scale.set(0.025, 1.64, 0.025);
        perch.rotation.z = Math.PI * 0.5;
        perch.position.set(0, 0.36, pz);
        coop.add(perch);
      }
      // Small wooden entry ramp
      const ramp = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
      ramp.scale.set(0.46, 0.04, 0.52);
      ramp.position.set(-0.46, 0.06, 0.82);
      ramp.rotation.x = 0.18;
      coop.add(ramp);

      shelterRoot.add(coop);
    }

    // 2.0C Huatai Corner Chicken Hutch (化胎小鸡舍) at (-3.8, -17.0)
    {
      const hx = -3.8;
      const hz = -17.0;
      const hy = groundHeightAt(hx, hz, 1.0);
      const hutch = new THREE.Group();
      hutch.position.set(hx, hy, hz);
      const base = new THREE.Mesh(boxGeo, mats.darkTimber);
      base.scale.set(1.16, 0.08, 0.96);
      base.position.y = 0.04;
      hutch.add(base);
      const back = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
      back.scale.set(1.12, 0.76, 0.07);
      back.position.set(0, 0.44, -0.44);
      hutch.add(back);
      for (const sx of [-0.54, 0.54]) {
        const side = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
        side.scale.set(0.07, 0.76, 0.9);
        side.position.set(sx, 0.44, 0);
        hutch.add(side);
      }
      const roof = new THREE.Mesh(boxGeo, mats.roofTile);
      roof.scale.set(1.36, 0.07, 1.18);
      roof.position.set(0, 0.88, 0.02);
      roof.rotation.x = 0.18;
      hutch.add(roof);
      const straw = new THREE.Mesh(boxGeo, hayMat);
      straw.scale.set(0.98, 0.04, 0.8);
      straw.position.set(0, 0.1, 0);
      hutch.add(straw);
      shelterRoot.add(hutch);
    }

    // 2.0D Woven Bamboo Cat Basket Nook (下堂竹编猫窝) inside Lower Hall east alcove (3.4, 20.6)
    {
      const bx = 3.4;
      const bz = 20.6;
      const by = groundHeightAt(bx, bz, 0);
      const catNest = new THREE.Group();
      catNest.position.set(bx, by, bz);
      const rim = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.36, 0.068, 8, 18)),
        strawRimMat
      );
      rim.rotation.x = Math.PI * 0.5;
      rim.position.y = 0.09;
      catNest.add(rim);
      const floor = new THREE.Mesh(cylGeo, strawMat);
      floor.scale.set(0.36, 0.05, 0.36);
      floor.position.y = 0.03;
      catNest.add(floor);
      const cushion = new THREE.Mesh(
        trackGeo(createSoftPillowGeometry(0.31, 0.8, 0.28, 10, 8)),
        clothIndigoMat
      );
      cushion.position.y = 0.08;
      catNest.add(cushion);
      shelterRoot.add(catNest);
    }

    // 2.0E East Meadow Timber Buffalo Shed (东草坪牛棚) at (25.6, 43.2)
    {
      const bx = 25.6;
      const bz = 43.2;
      const by = groundHeightAt(bx, bz, 0);
      const shed = new THREE.Group();
      shed.position.set(bx, by, bz);
      addShadowDisc(shed, 2.35, 1.95);
      for (const px of [-1.85, 1.85]) {
        for (const pz of [-1.45, 1.45]) {
          const post = new THREE.Mesh(cylGeo, mats.darkTimber);
          post.scale.set(0.11, 2.55, 0.11);
          post.position.set(px, 1.275, pz);
          post.castShadow = castShadow;
          shed.add(post);
        }
      }
      // Back & east windbreak rails
      for (const ry of [0.65, 1.35]) {
        const backRail = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
        backRail.scale.set(3.8, 0.12, 0.08);
        backRail.position.set(0, ry, -1.45);
        shed.add(backRail);
        const sideRail = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
        sideRail.scale.set(0.08, 0.12, 2.95);
        sideRail.position.set(1.85, ry, 0);
        shed.add(sideRail);
      }
      // Gable tile roof with wooden rafters
      for (const sx of [-1, 1]) {
        const slope = new THREE.Mesh(boxGeo, mats.roofTile);
        slope.scale.set(2.5, 0.1, 3.6);
        slope.position.set(sx * 1.05, 2.86, 0);
        slope.rotation.z = -sx * 0.34;
        slope.castShadow = castShadow;
        shed.add(slope);
      }
      const ridge = new THREE.Mesh(cylGeo, mats.roofTileDark);
      ridge.scale.set(0.08, 3.65, 0.08);
      ridge.rotation.x = Math.PI * 0.5;
      ridge.position.set(0, 3.26, 0);
      shed.add(ridge);
      const bedding = new THREE.Mesh(boxGeo, hayMat);
      bedding.scale.set(3.2, 0.08, 2.4);
      bedding.position.set(0, 0.04, 0);
      shed.add(bedding);
      const manger = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
      manger.scale.set(1.6, 0.45, 0.55);
      manger.position.set(0.4, 0.28, -1.1);
      shed.add(manger);
      const hayHeap = new THREE.Mesh(trackGeo(createSoftPillowGeometry(0.65, 1.4, 0.45, 10, 8)), hayMat);
      hayHeap.position.set(0.4, 0.56, -1.1);
      shed.add(hayHeap);
      shelterRoot.add(shed);
    }

    // 2.0F West Meadow Timber Goat Shed (西草坪羊圈) at (-25.8, 42.4)
    {
      const gx = -25.8;
      const gz = 42.4;
      const gy = groundHeightAt(gx, gz, 0);
      const shed = new THREE.Group();
      shed.position.set(gx, gy, gz);
      addShadowDisc(shed, 1.95, 1.55);
      for (const px of [-1.45, 1.45]) {
        for (const pz of [-1.1, 1.1]) {
          const post = new THREE.Mesh(cylGeo, mats.darkTimber);
          post.scale.set(0.085, 1.92, 0.085);
          post.position.set(px, 0.96, pz);
          post.castShadow = castShadow;
          shed.add(post);
        }
      }
      for (const ry of [0.45, 0.92]) {
        const backRail = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
        backRail.scale.set(2.96, 0.09, 0.07);
        backRail.position.set(0, ry, -1.1);
        shed.add(backRail);
        const sideRail = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
        sideRail.scale.set(0.07, 0.09, 2.25);
        sideRail.position.set(-1.45, ry, 0);
        shed.add(sideRail);
      }
      for (const sx of [-1, 1]) {
        const slope = new THREE.Mesh(boxGeo, mats.roofTile);
        slope.scale.set(1.95, 0.08, 2.85);
        slope.position.set(sx * 0.82, 2.18, 0);
        slope.rotation.z = -sx * 0.34;
        slope.castShadow = castShadow;
        shed.add(slope);
      }
      const bedding = new THREE.Mesh(boxGeo, hayMat);
      bedding.scale.set(2.45, 0.06, 1.85);
      bedding.position.set(0, 0.03, 0);
      shed.add(bedding);
      shelterRoot.add(shed);
    }

    // 2.0G Two Half-Moon Pond Shoreline Reed Waterfowl Nests (水禽芦苇窝) at (-11.8, 39.8) & (11.8, 39.8)
    const reedMat = woodPaintMat(0x5a7f46, 0.82);
    for (const [nx, nz] of [
      [-11.8, 39.8],
      [11.8, 39.8],
    ]) {
      const nest = new THREE.Group();
      nest.position.set(nx, -0.18, nz);
      const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.92, 0.18, 7, 18)), hayMat);
      ring.rotation.x = Math.PI * 0.5;
      ring.position.y = 0.06;
      nest.add(ring);
      const pad = new THREE.Mesh(cylGeo, hayMat);
      pad.scale.set(0.88, 0.08, 0.88);
      pad.position.y = 0.02;
      nest.add(pad);
      // Tufted lakeside reeds shielding each nest
      for (let r = 0; r < 7; r++) {
        const ang = (r / 7) * Math.PI * 1.1 - Math.PI * 0.55 + (nx < 0 ? Math.PI : 0);
        const blade = new THREE.Mesh(cylGeo, reedMat);
        blade.scale.set(0.024, 0.72 + (r % 3) * 0.16, 0.024);
        blade.position.set(Math.cos(ang) * 0.98, 0.36, Math.sin(ang) * 0.98);
        blade.rotation.z = Math.cos(ang) * 0.16;
        nest.add(blade);
      }
      shelterRoot.add(nest);
    }
  }

  // 2A. Two Raking Farmers standing cleanly beside the two unified He-Ping grain mats!
  //     Each 7-tooth wooden grain rake is a single unified rig parented directly to rightHandSocket
  //     so palm, bamboo shaft, crossbar, and all 7 teeth move together with zero detachment!
  const farmerPlacements: Array<[number, number, number, PathPoint2D[], number, THREE.MeshStandardMaterial]> = [
    [
      -8.65,
      28.8,
      Math.PI * 0.5,
      [
        { x: -8.65, z: 28.8 },
        { x: -3.2, z: 24.4 },
        { x: 0.0, z: 23.0 },
        { x: 0.0, z: 20.0 },
        { x: -5.2, z: 19.2 },
      ],
      0.35,
      clothIndigoMat,
    ],
    [
      7.85,
      29.2,
      -Math.PI * 0.5,
      [
        { x: 7.85, z: 29.2 },
        { x: 3.2, z: 24.4 },
        { x: 0.0, z: 23.0 },
        { x: 0.0, z: 20.0 },
        { x: 5.2, z: 19.2 },
      ],
      -0.35,
      clothTealMat,
    ],
  ];
  farmerPlacements.forEach(([fx, fz, yaw, homeRoute, homeYaw, tunic], idx) => {
    const farmer = createVillager({
      tunicMat: tunic,
      pantsMat: clothNavyMat,
      scarfMat: clothCreamMat,
      hat: 'conical',
    });
    farmer.group.position.set(fx, groundHeightAt(fx, fz, 0), fz);
    farmer.group.rotation.y = yaw;

    // Unified 7-tooth wooden grain rake (七齿木谷耙) mounted at origin of rightHandSocket
    const rakeGroup = new THREE.Group();
    const rakeShaftAxis = new THREE.Group();
    // Negative X rotation pitches local -Y shaft FORWARD (+Z) out over the golden rice mat
    rakeShaftAxis.rotation.set(-0.56, 0.06, -0.04);
    rakeGroup.add(rakeShaftAxis);

    const rakePole = new THREE.Mesh(cylGeo, bambooPoleMat);
    rakePole.scale.set(0.023, 1.62, 0.023);
    // Extends +0.36 behind palm (two-handed grip) and -1.26 forward-downward onto the rice mat
    rakePole.position.set(0, -0.45, 0);
    rakePole.castShadow = castShadow;
    rakeShaftAxis.add(rakePole);

    // Crossbar & 7 teeth firmly mounted at the far tip (y = -1.24) of the bamboo shaft
    const rakeHead = new THREE.Group();
    rakeHead.position.set(0, -1.24, 0);
    rakeHead.rotation.x = 0.92; // orient 7 teeth nearly vertical to comb cleanly through the rice
    rakeShaftAxis.add(rakeHead);

    const rakeBar = new THREE.Mesh(boxGeo, mats.darkTimber);
    rakeBar.scale.set(0.66, 0.068, 0.068);
    rakeBar.castShadow = castShadow;
    rakeHead.add(rakeBar);

    for (let t = -3; t <= 3; t++) {
      const tooth = new THREE.Mesh(cylGeo, mats.weatheredWoodDoor);
      tooth.scale.set(0.016, 0.14, 0.016);
      tooth.position.set(t * 0.088, -0.072, 0);
      rakeHead.add(tooth);
    }

    farmer.rightHandSocket.add(rakeGroup);

    root.add(farmer.group);
    idleVillagers.push({
      id: `farmer_${idx}`,
      group: farmer.group,
      head: farmer.head,
      leftArm: farmer.leftArm,
      rightArm: farmer.rightArm,
      leftElbow: farmer.leftElbow,
      rightElbow: farmer.rightElbow,
      leftLeg: farmer.leftLeg,
      rightLeg: farmer.rightLeg,
      leftKnee: farmer.leftKnee,
      rightKnee: farmer.rightKnee,
      torso: farmer.torso,
      sashTailL: farmer.sashTailL,
      sashTailR: farmer.sashTailR,
      sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
      kind: 'rake',
      phaseOffset: idx * 2.1,
      rakeGroup,
      baseX: fx,
      baseZ: fz,
      baseYaw: yaw,
      homeRoute,
      homeYaw,
      homeBlendSmooth: 0,
      stridePhase: 0,
      curX: fx,
      curZ: fz,
      curYaw: yaw,
    });
  });

  // 2B. Shoulder-Pole Pomelo & Tea Carrier (挑担货郎) with arched bamboo pole & 3-cord baskets!
  const carrier = createVillager({
    tunicMat: clothCeruleanMat,
    pantsMat: clothNavyMat,
    scarfMat: clothVermMat,
    hat: 'conical',
  });
  const carryPoleGroup = new THREE.Group();
  carryPoleGroup.position.set(0, 0.62, 0);

  const curvedPoleGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, -0.05, -0.96),
        new THREE.Vector3(0, 0.04, -0.45),
        new THREE.Vector3(0, 0.06, 0),
        new THREE.Vector3(0, 0.04, 0.45),
        new THREE.Vector3(0, -0.05, 0.96),
      ],
      0.022,
      0.022,
      14,
      7
    )
  );
  carryPoleGroup.add(new THREE.Mesh(curvedPoleGeo, bambooPoleMat));

  const leafTinyMat = woodPaintMat(HANDCRAFTED_PAL.willowBright, 0.72);
  for (const sz of [-0.84, 0.84]) {
    // 3 angled suspension cords per basket
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2;
      const cord = new THREE.Mesh(cylGeo, strawRimMat);
      cord.scale.set(0.008, 0.44, 0.008);
      cord.position.set(Math.cos(a) * 0.11, -0.22, sz + Math.sin(a) * 0.11);
      cord.rotation.z = Math.cos(a) * 0.42;
      cord.rotation.x = -Math.sin(a) * 0.42;
      carryPoleGroup.add(cord);
    }

    const basket = new THREE.Mesh(basketGeo, strawMat);
    basket.position.set(0, -0.62, sz);
    carryPoleGroup.add(basket);

    // Heaped golden Meizhou pomelos & vermilion persimmons with tiny green calyx stems!
    const fruitMat =
      sz < 0 ? woodPaintMat(HANDCRAFTED_PAL.orange, 0.58) : woodPaintMat(HANDCRAFTED_PAL.lemon, 0.58);
    for (let f = 0; f < 5; f++) {
      const a = (f / 5) * Math.PI * 2;
      const r = f === 4 ? 0.0 : 0.105;
      const fy = f === 4 ? -0.34 : -0.41;
      const fruit = new THREE.Mesh(sphereGeo, fruitMat);
      fruit.scale.set(0.092, sz < 0 ? 0.075 : 0.105, 0.092);
      fruit.position.set(Math.cos(a) * r, fy, sz + Math.sin(a) * r);
      carryPoleGroup.add(fruit);

      const calyx = new THREE.Mesh(coneGeo, leafTinyMat);
      calyx.scale.set(0.032, 0.03, 0.032);
      calyx.position.set(Math.cos(a) * r, fy + 0.09, sz + Math.sin(a) * r);
      carryPoleGroup.add(calyx);
    }
  }
  carrier.torso.add(carryPoleGroup);
  carrier.rightArm.rotation.x = -0.78;
  root.add(carrier.group);
  const carrierAgent = freeRoam.registerAgent('villager_carrier', 'villager_stroll', -6.5, 25.2, Math.PI * 0.5);
  walkingVillagers.push({
    id: 'villager_carrier',
    group: carrier.group,
    torso: carrier.torso,
    leftArm: carrier.leftArm,
    rightArm: carrier.rightArm,
    leftElbow: carrier.leftElbow,
    rightElbow: carrier.rightElbow,
    leftLeg: carrier.leftLeg,
    rightLeg: carrier.rightLeg,
    leftKnee: carrier.leftKnee,
    rightKnee: carrier.rightKnee,
    head: carrier.head,
    sashTailL: carrier.sashTailL,
    sashTailR: carrier.sashTailR,
    sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
    carryPole: carryPoleGroup,
    waypoints: [
      { x: -13.5, z: 24.4 },
      { x: 13.5, z: 24.4 },
      { x: 13.5, z: 33.2 },
      { x: 4.5, z: 33.2 },
      { x: -4.5, z: 33.2 },
      { x: -13.5, z: 33.2 },
    ],
    speed: 0.017,
    phaseOffset: 0.12,
    roamAgent: carrierAgent,
    homeRoom: { x: 7.4, z: 18.8, yaw: -0.4 },
    homeAnchor: null,
    homeRoute: [],
    homeBlendSmooth: 0,
    stridePhase: 0,
  });

  // 2C. Two Hakka Women in Curtained Hats (客家凉帽) Washing Laundry at Half-Moon Pond Steps!
  const rippleGeo = trackGeo(new THREE.RingGeometry(0.18, 0.27, 22));
  rippleGeo.rotateX(-Math.PI * 0.5);
  const rippleMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xeaf7f8,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  const washerCoords: Array<[number, number, THREE.MeshStandardMaterial]> = [
    [-1.9, 37.35, clothIndigoMat],
    [2.1, 37.45, clothTealMat],
  ];
  washerCoords.forEach(([wx, wz, tunic], idx) => {
    const woman = createVillager({
      tunicMat: tunic,
      pantsMat: clothNavyMat,
      apronMat: clothCreamMat,
      scarfMat: idx === 0 ? clothPeachMat : clothLilacMat,
      hat: 'hakka_curtain',
      seated: true,
      scale: 0.96,
    });
    woman.group.position.set(wx, -0.06, wz);
    woman.group.rotation.y = idx === 0 ? 0.18 : -0.22;
    root.add(woman.group);

    // Handcrafted stave wooden laundry tub with iron hoops + folded cloth + wooden mallet
    const tubX = wx + (idx === 0 ? -0.56 : 0.56);
    const tubZ = wz - 0.12;
    const tubGroup = new THREE.Group();
    tubGroup.position.set(tubX, 0.0, tubZ);
    const tubWall = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.3, 0.25, 0.24, 14)),
      mats.weatheredWoodDoor
    );
    tubWall.position.y = 0.12;
    tubGroup.add(tubWall);
    for (const hy of [0.06, 0.19]) {
      const hoop = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(hy > 0.12 ? 0.292 : 0.268, 0.012, 6, 16)),
        mats.darkTimber
      );
      hoop.rotation.x = Math.PI * 0.5;
      hoop.position.y = hy;
      tubGroup.add(hoop);
    }
    const clothFold = new THREE.Mesh(
      trackGeo(createSoftPillowGeometry(0.21, idx * 3 + 1, 0.62, 10, 8)),
      idx === 0 ? clothPeachMat : clothCreamMat
    );
    clothFold.position.set(0, 0.22, 0);
    tubGroup.add(clothFold);

    // Corrugated wooden washboard resting in front of her
    const washboard = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
    washboard.scale.set(0.34, 0.03, 0.44);
    washboard.position.set(idx === 0 ? 0.56 : -0.56, 0.03, 0.56);
    washboard.rotation.x = 0.24;
    tubGroup.add(washboard);
    root.add(tubGroup);

    const ripple = new THREE.Mesh(rippleGeo, rippleMat);
    ripple.position.set(wx, -0.18, wz + 1.35);
    root.add(ripple);

    idleVillagers.push({
      id: `washer_${idx}`,
      group: woman.group,
      head: woman.head,
      leftArm: woman.leftArm,
      rightArm: woman.rightArm,
      leftElbow: woman.leftElbow,
      rightElbow: woman.rightElbow,
      leftLeg: woman.leftLeg,
      rightLeg: woman.rightLeg,
      leftKnee: woman.leftKnee,
      rightKnee: woman.rightKnee,
      torso: woman.torso,
      sashTailL: woman.sashTailL,
      sashTailR: woman.sashTailR,
      sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
      kind: 'wash',
      phaseOffset: idx * 1.9,
      ripple,
      baseX: wx,
      baseZ: wz,
      baseYaw: idx === 0 ? 0.18 : -0.22,
      seated: true,
      homeRoute: [
        { x: wx, z: wz },
        { x: wx * 0.7, z: 33.5 },
        { x: 0.0, z: 23.4 },
        { x: 0.0, z: 19.6 },
        { x: idx === 0 ? -7.2 : 7.2, z: 19.2 },
      ],
      homeYaw: idx === 0 ? 0.4 : -0.4,
      homeBlendSmooth: 0,
      stridePhase: 0,
      curX: wx,
      curZ: wz,
      curYaw: idx === 0 ? 0.18 : -0.22,
    });
  });

  // 2D. Two Chatting Elders Seated on a Mortised Wooden Bench beside the Main Gate Veranda!
  const benchX = -6.0;
  const benchZ = 22.95;
  const benchY = groundHeightAt(benchX, benchZ, 0);
  const benchGroup = new THREE.Group();
  benchGroup.position.set(benchX, benchY, benchZ);
  addShadowDisc(benchGroup, 1.25, 0.42);
  const seatPlank = new THREE.Mesh(boxGeo, mats.weatheredWoodDoor);
  seatPlank.scale.set(2.2, 0.085, 0.48);
  seatPlank.position.y = 0.45;
  seatPlank.castShadow = castShadow;
  benchGroup.add(seatPlank);
  const seatApron = new THREE.Mesh(boxGeo, mats.darkTimber);
  seatApron.scale.set(1.88, 0.09, 0.34);
  seatApron.position.y = 0.37;
  benchGroup.add(seatApron);
  for (const bx of [-0.82, 0.82]) {
    for (const bz of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(cylGeo, mats.darkTimber);
      leg.scale.set(0.046, 0.45, 0.046);
      leg.position.set(bx, 0.225, bz);
      leg.rotation.z = bx < 0 ? -0.07 : 0.07;
      benchGroup.add(leg);
    }
    const crossBrace = new THREE.Mesh(boxGeo, mats.darkTimber);
    crossBrace.scale.set(0.06, 0.06, 0.34);
    crossBrace.position.set(bx, 0.14, 0);
    benchGroup.add(crossBrace);
  }
  const longStretcher = new THREE.Mesh(boxGeo, mats.darkTimber);
  longStretcher.scale.set(1.66, 0.055, 0.055);
  longStretcher.position.set(0, 0.14, 0);
  benchGroup.add(longStretcher);
  root.add(benchGroup);

  const elderA = createVillager({
    tunicMat: clothNavyMat,
    pantsMat: clothIndigoMat,
    scarfMat: clothCreamMat,
    hat: 'elder_cap',
    elder: true,
    seated: true,
  });
  elderA.group.position.set(benchX - 0.5, benchY, benchZ + 0.02);
  elderA.group.rotation.y = 0.35;
  const fanGroup = new THREE.Group();
  fanGroup.position.set(0, 0.02, 0.08);
  const fanHandle = new THREE.Mesh(cylGeo, bambooPoleMat);
  fanHandle.scale.set(0.014, 0.24, 0.014);
  fanGroup.add(fanHandle);
  const fanFace = new THREE.Mesh(cylGeo, clothCreamMat);
  fanFace.scale.set(0.17, 0.012, 0.17);
  fanFace.rotation.x = Math.PI * 0.5;
  fanFace.position.y = 0.19;
  fanGroup.add(fanFace);
  const fanRim = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.17, 0.011, 6, 18)),
    bambooPoleMat
  );
  fanRim.position.y = 0.19;
  fanGroup.add(fanRim);
  const fanMountain = new THREE.Mesh(coneGeo, clothTealMat);
  fanMountain.scale.set(0.09, 0.07, 0.018);
  fanMountain.position.set(-0.02, 0.17, 0.008);
  fanGroup.add(fanMountain);
  elderA.rightHandSocket.add(fanGroup);
  elderA.rightArm.rotation.x = -0.82;
  root.add(elderA.group);
  idleVillagers.push({
    id: 'elder_a',
    group: elderA.group,
    head: elderA.head,
    leftArm: elderA.leftArm,
    rightArm: elderA.rightArm,
    leftElbow: elderA.leftElbow,
    rightElbow: elderA.rightElbow,
    leftLeg: elderA.leftLeg,
    rightLeg: elderA.rightLeg,
    leftKnee: elderA.leftKnee,
    rightKnee: elderA.rightKnee,
    torso: elderA.torso,
    sashTailL: elderA.sashTailL,
    sashTailR: elderA.sashTailR,
    sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
    kind: 'fan',
    phaseOffset: 0.4,
    baseX: benchX - 0.5,
    baseZ: benchZ + 0.02,
    baseYaw: 0.35,
    seated: true,
    homeRoute: [
      { x: benchX - 0.5, z: benchZ + 0.02 },
      { x: -2.2, z: 23.6 },
      { x: 0.0, z: 23.2 },
      { x: 0.0, z: 19.6 },
      { x: -3.4, z: 19.1 },
    ],
    homeYaw: 0.25,
    homeBlendSmooth: 0,
    stridePhase: 0,
    curX: benchX - 0.5,
    curZ: benchZ + 0.02,
    curYaw: 0.35,
  });

  const elderB = createVillager({
    tunicMat: clothSageMat,
    pantsMat: clothNavyMat,
    scarfMat: clothPeachMat,
    hat: 'bun',
    elder: true,
    seated: true,
    scale: 0.94,
  });
  elderB.group.position.set(benchX + 0.5, benchY, benchZ + 0.02);
  elderB.group.rotation.y = -0.4;
  root.add(elderB.group);
  idleVillagers.push({
    id: 'elder_b',
    group: elderB.group,
    head: elderB.head,
    leftArm: elderB.leftArm,
    rightArm: elderB.rightArm,
    leftElbow: elderB.leftElbow,
    rightElbow: elderB.rightElbow,
    leftLeg: elderB.leftLeg,
    rightLeg: elderB.rightLeg,
    leftKnee: elderB.leftKnee,
    rightKnee: elderB.rightKnee,
    torso: elderB.torso,
    sashTailL: elderB.sashTailL,
    sashTailR: elderB.sashTailR,
    sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
    kind: 'chat',
    phaseOffset: 1.7,
    baseX: benchX + 0.5,
    baseZ: benchZ + 0.02,
    baseYaw: -0.4,
    seated: true,
    homeRoute: [
      { x: benchX + 0.5, z: benchZ + 0.02 },
      { x: -1.8, z: 23.6 },
      { x: 0.0, z: 23.2 },
      { x: 0.0, z: 19.6 },
      { x: -2.2, z: 19.1 },
    ],
    homeYaw: -0.25,
    homeBlendSmooth: 0,
    stridePhase: 0,
    curX: benchX + 0.5,
    curZ: benchZ + 0.02,
    curYaw: -0.4,
  });

  // 2E. Three Joyful Children Playing across open He-Ping paths (completely clear of grain mats!)
  const childSpecs: Array<{
    tunic: THREE.MeshStandardMaterial;
    scarf: THREE.MeshStandardMaterial;
    path: PathPoint2D[];
    speed: number;
    phase: number;
    hasPinwheel: boolean;
  }> = [
    {
      tunic: clothVermMat,
      scarf: clothLemonMat,
      path: [
        { x: -2.0, z: 32.4 },
        { x: 1.8, z: 32.4 },
        { x: 1.8, z: 25.4 },
        { x: -2.0, z: 25.4 },
      ],
      speed: 0.056,
      phase: 0.0,
      hasPinwheel: true,
    },
    {
      tunic: clothLemonMat,
      scarf: clothVermMat,
      path: [
        { x: -2.0, z: 32.4 },
        { x: 1.8, z: 32.4 },
        { x: 1.8, z: 25.4 },
        { x: -2.0, z: 25.4 },
      ],
      speed: 0.056,
      phase: 0.16,
      hasPinwheel: false,
    },
    {
      tunic: clothCeruleanMat,
      scarf: clothPeachMat,
      path: [
        { x: 9.2, z: 32.4 },
        { x: 12.2, z: 32.4 },
        { x: 12.2, z: 25.4 },
        { x: 9.2, z: 25.4 },
      ],
      speed: 0.05,
      phase: 0.45,
      hasPinwheel: false,
    },
  ];

  const pinwheelBladeGeo = trackGeo(createCuppedPetalGeometry(0.085, 0.19, 0.018));
  childSpecs.forEach((cs) => {
    const child = createVillager({
      tunicMat: cs.tunic,
      pantsMat: clothIndigoMat,
      scarfMat: cs.scarf,
      hat: 'child_tufts',
      scale: 0.66,
    });
    let pinwheel: THREE.Group | undefined;
    if (cs.hasPinwheel) {
      const stick = new THREE.Mesh(cylGeo, bambooPoleMat);
      stick.scale.set(0.017, 0.58, 0.017);
      stick.position.set(0.05, -0.25, 0.25);
      stick.rotation.x = 0.65;
      child.rightArm.add(stick);

      pinwheel = new THREE.Group();
      pinwheel.position.set(0.05, -0.02, 0.46);
      const bladeColors = [clothVermMat, clothLemonMat, clothCeruleanMat, clothPeachMat];
      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(pinwheelBladeGeo, bladeColors[b]);
        blade.rotation.z = (b / 4) * Math.PI * 2;
        pinwheel.add(blade);
      }
      const pinCap = new THREE.Mesh(sphereGeo, mats.gildedGold);
      pinCap.scale.setScalar(0.028);
      pinwheel.add(pinCap);
      child.rightArm.add(pinwheel);
      child.rightArm.rotation.x = -0.9;
    }
    root.add(child.group);
    const childStart = cs.path[0];
    const childId = `child_${walkingVillagers.length}`;
    const childAgent = freeRoam.registerAgent(childId, 'child_playful', childStart.x, childStart.z, 0);
    const childHomeRooms = [
      { x: -4.2, z: 18.8, yaw: 0.2 },
      { x: 4.2, z: 18.8, yaw: -0.2 },
      { x: 2.6, z: 18.8, yaw: -0.1 },
    ];
    const homeRoom = childHomeRooms[walkingVillagers.length % childHomeRooms.length];
    walkingVillagers.push({
      id: childId,
      group: child.group,
      torso: child.torso,
      leftArm: child.leftArm,
      rightArm: child.rightArm,
      leftElbow: child.leftElbow,
      rightElbow: child.rightElbow,
      leftLeg: child.leftLeg,
      rightLeg: child.rightLeg,
      leftKnee: child.leftKnee,
      rightKnee: child.rightKnee,
      head: child.head,
      sashTailL: child.sashTailL,
      sashTailR: child.sashTailR,
      sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
      waypoints: cs.path,
      speed: cs.speed,
      phaseOffset: cs.phase,
      pinwheel,
      isChild: true,
      roamAgent: childAgent,
      homeRoom,
      homeAnchor: null,
      homeRoute: [],
      homeBlendSmooth: 0,
      stridePhase: 0,
    });
  });

  // 2F. Graceful Villager Strolling along the Pond Promenade with an 8-Ribbed Oil-Paper Umbrella!
  const umbrellaWalker = createVillager({
    tunicMat: clothPeachMat,
    pantsMat: clothCreamMat,
    apronMat: clothTealMat,
    scarfMat: clothVermMat,
    hat: 'bun',
    scale: 0.96,
  });
  const umbGroup = createHandOilPaperUmbrella(HANDCRAFTED_PAL.verm);
  umbrellaWalker.rightHandSocket.add(umbGroup);
  umbrellaWalker.rightArm.rotation.x = -0.68;
  root.add(umbrellaWalker.group);
  const umbAgent = freeRoam.registerAgent('villager_umbrella', 'villager_stroll', -4.2, 35.0, Math.PI * 0.5);
  walkingVillagers.push({
    id: 'villager_umbrella',
    group: umbrellaWalker.group,
    torso: umbrellaWalker.torso,
    leftArm: umbrellaWalker.leftArm,
    rightArm: umbrellaWalker.rightArm,
    leftElbow: umbrellaWalker.leftElbow,
    rightElbow: umbrellaWalker.rightElbow,
    leftLeg: umbrellaWalker.leftLeg,
    rightLeg: umbrellaWalker.rightLeg,
    leftKnee: umbrellaWalker.leftKnee,
    rightKnee: umbrellaWalker.rightKnee,
    head: umbrellaWalker.head,
    sashTailL: umbrellaWalker.sashTailL,
    sashTailR: umbrellaWalker.sashTailR,
    sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
    hasUmbrella: true,
    waypoints: [
      { x: -13.2, z: 35.1 },
      { x: -5.0, z: 35.3 },
      { x: 5.0, z: 35.3 },
      { x: 13.2, z: 35.1 },
      { x: 13.2, z: 34.4 },
      { x: -13.2, z: 34.4 },
    ],
    speed: 0.015,
    phaseOffset: 0.65,
    roamAgent: umbAgent,
    homeRoom: { x: -6.4, z: 18.8, yaw: 0.3 },
    homeAnchor: null,
    homeRoute: [],
    homeBlendSmooth: 0,
    stridePhase: 0,
  });

  // 2G. Two Tea-Drinking Neighbors Seated in the Front Skywell Courtyard (下堂天井品茗)!
  const teaTableX = 6.0;
  const teaTableZ = 13.4;
  const teaY = groundHeightAt(teaTableX, teaTableZ, 0);
  const teaTableGroup = new THREE.Group();
  teaTableGroup.position.set(teaTableX, teaY, teaTableZ);
  addShadowDisc(teaTableGroup, 0.62);
  // Turned drum-shaped garden tea table (石鼓茶桌)
  const teaTableGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.34, 0.0],
        [0.44, 0.22],
        [0.42, 0.44],
        [0.48, 0.52],
        [0.48, 0.58],
        [0.0, 0.58],
      ],
      16
    )
  );
  teaTableGroup.add(new THREE.Mesh(teaTableGeo, mats.weatheredWoodDoor));

  // Handcrafted purple-clay teapot (紫砂茶壶) with curved spout, handle & lid knob + 3 celadon teacups!
  const potGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.075, 0.0],
        [0.115, 0.05],
        [0.105, 0.1],
        [0.065, 0.125],
        [0.08, 0.135],
        [0.02, 0.155],
        [0.0, 0.165],
      ],
      14
    )
  );
  const teapot = new THREE.Mesh(potGeo, clayPotMat);
  teapot.position.set(0, 0.58, 0);
  teaTableGroup.add(teapot);
  const spout = new THREE.Mesh(
    trackGeo(
      createTaperedCurveGeometry(
        [
          new THREE.Vector3(0.09, 0.04, 0),
          new THREE.Vector3(0.15, 0.09, 0),
          new THREE.Vector3(0.17, 0.125, 0),
        ],
        0.022,
        0.012,
        6,
        6
      )
    ),
    clayPotMat
  );
  spout.position.set(0, 0.58, 0);
  teaTableGroup.add(spout);
  const potHandle = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.045, 0.011, 6, 12, Math.PI * 1.2)),
    clayPotMat
  );
  potHandle.position.set(-0.1, 0.65, 0);
  potHandle.rotation.z = Math.PI * 0.5;
  teaTableGroup.add(potHandle);

  const cupGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.025, 0.0],
        [0.042, 0.032],
        [0.045, 0.05],
        [0.038, 0.05],
      ],
      10
    )
  );
  for (let c = 0; c < 3; c++) {
    const a = (c / 3) * Math.PI * 2 + 0.5;
    const cup = new THREE.Mesh(cupGeo, celadonMat);
    cup.position.set(Math.cos(a) * 0.24, 0.58, Math.sin(a) * 0.24);
    teaTableGroup.add(cup);
  }
  root.add(teaTableGroup);

  const stoolGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.17, 0.0],
        [0.21, 0.18],
        [0.19, 0.36],
        [0.22, 0.42],
        [0.0, 0.42],
      ],
      14
    )
  );

  const teaGuests: Array<[number, number, number, THREE.MeshStandardMaterial]> = [
    [teaTableX - 0.88, teaTableZ, Math.PI * 0.5, clothTealMat],
    [teaTableX + 0.88, teaTableZ, -Math.PI * 0.5, clothLilacMat],
  ];
  teaGuests.forEach(([tx, tz, yaw, tunic], idx) => {
    const stool = new THREE.Mesh(stoolGeo, mats.darkTimber);
    stool.position.set(tx, teaY, tz);
    root.add(stool);

    const guest = createVillager({
      tunicMat: tunic,
      pantsMat: clothNavyMat,
      scarfMat: clothCreamMat,
      hat: idx === 0 ? 'elder_cap' : 'bun',
      seated: true,
    });
    guest.group.position.set(tx, teaY, tz);
    guest.group.rotation.y = yaw;
    root.add(guest.group);
    idleVillagers.push({
      id: `tea_guest_${idx}`,
      group: guest.group,
      head: guest.head,
      leftArm: guest.leftArm,
      rightArm: guest.rightArm,
      leftElbow: guest.leftElbow,
      rightElbow: guest.rightElbow,
      leftLeg: guest.leftLeg,
      rightLeg: guest.rightLeg,
      leftKnee: guest.leftKnee,
      rightKnee: guest.rightKnee,
      torso: guest.torso,
      sashTailL: guest.sashTailL,
      sashTailR: guest.sashTailR,
      sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
      kind: 'tea',
      phaseOffset: idx * 2.4,
      baseX: tx,
      baseZ: tz,
      baseYaw: yaw,
      seated: true,
      homeRoute: [
        { x: tx, z: tz },
        { x: 6.0, z: 10.4 },
        { x: 11.4, z: 11.8 },
        { x: 14.2, z: idx === 0 ? 11.2 : 12.6 },
      ],
      homeYaw: -Math.PI * 0.5,
      homeBlendSmooth: 0,
      stridePhase: 0,
      curX: tx,
      curZ: tz,
      curYaw: yaw,
    });
  });

  // 2H. Respectful Worshipper Offering Three Glowing Incense Sticks in Upper Hall (上堂祖公厅敬香)
  const worshipper = createVillager({
    tunicMat: clothNavyMat,
    pantsMat: clothIndigoMat,
    scarfMat: clothVermMat,
    hat: 'elder_cap',
    elder: true,
  });
  const wy = groundHeightAt(1.8, -1.6, 0.85);
  worshipper.group.position.set(1.8, wy, -1.6);
  worshipper.group.rotation.y = Math.PI;
  const emberMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
  for (let s = -1; s <= 1; s++) {
    const inc = new THREE.Mesh(cylGeo, mats.terracotta);
    inc.scale.set(0.006, 0.34, 0.006);
    inc.position.set(s * 0.018, -0.34, 0.16);
    inc.rotation.x = 0.25;
    worshipper.rightArm.add(inc);
    const tip = new THREE.Mesh(sphereGeo, emberMat);
    tip.scale.setScalar(0.011);
    tip.position.set(s * 0.018, -0.18, 0.2);
    worshipper.rightArm.add(tip);
  }
  root.add(worshipper.group);
  idleVillagers.push({
    id: 'worshipper_0',
    group: worshipper.group,
    head: worshipper.head,
    leftArm: worshipper.leftArm,
    rightArm: worshipper.rightArm,
    leftElbow: worshipper.leftElbow,
    rightElbow: worshipper.rightElbow,
    leftLeg: worshipper.leftLeg,
    rightLeg: worshipper.rightLeg,
    leftKnee: worshipper.leftKnee,
    rightKnee: worshipper.rightKnee,
    torso: worshipper.torso,
    sashTailL: worshipper.sashTailL,
    sashTailR: worshipper.sashTailR,
    sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
    kind: 'bow',
    phaseOffset: 0.9,
    baseX: 1.8,
    baseZ: -1.6,
    baseYaw: Math.PI,
    homeRoute: [
      { x: 1.8, z: -1.6 },
      { x: 0.0, z: 3.4 },
      { x: -11.2, z: 3.4 },
      { x: -14.8, z: -0.8 },
    ],
    homeYaw: Math.PI * 0.5,
    homeBlendSmooth: 0,
    stridePhase: 0,
    curX: 1.8,
    curZ: -1.6,
    curYaw: Math.PI,
  });

  // 2I. Two Hakka Women on the Sun-Warmed Huatai (化胎) Cobble Courtyard with Harvest Baskets
  const huataiWomen: Array<[number, number, number, THREE.MeshStandardMaterial]> = [
    [-6.2, -12.4, 0.65, clothIndigoMat],
    [6.8, -13.0, -0.75, clothCeruleanMat],
  ];
  huataiWomen.forEach(([hx, hz, yaw, tunic], idx) => {
    const hy = groundHeightAt(hx, hz, 1.0);
    const w = createVillager({
      tunicMat: tunic,
      pantsMat: clothNavyMat,
      apronMat: clothCreamMat,
      scarfMat: clothVermMat,
      hat: 'hakka_curtain',
      scale: 0.95,
    });
    w.group.position.set(hx, hy, hz);
    w.group.rotation.y = yaw;
    const basket = new THREE.Mesh(basketGeo, strawMat);
    basket.scale.setScalar(1.22);
    basket.position.set(hx + (idx === 0 ? 0.58 : -0.58), hy, hz + 0.32);
    root.add(basket);
    // Heaped fresh harvest produce inside basket
    const produce = new THREE.Mesh(
      trackGeo(createSoftPillowGeometry(0.24, idx + 7, 0.55, 10, 8)),
      idx === 0 ? leafTinyMat : clothLemonMat
    );
    produce.position.set(hx + (idx === 0 ? 0.58 : -0.58), hy + 0.28, hz + 0.32);
    root.add(produce);

    root.add(w.group);
    idleVillagers.push({
      id: `huatai_woman_${idx}`,
      group: w.group,
      head: w.head,
      leftArm: w.leftArm,
      rightArm: w.rightArm,
      leftElbow: w.leftElbow,
      rightElbow: w.rightElbow,
      leftLeg: w.leftLeg,
      rightLeg: w.rightLeg,
      leftKnee: w.leftKnee,
      rightKnee: w.rightKnee,
      torso: w.torso,
      sashTailL: w.sashTailL,
      sashTailR: w.sashTailR,
      sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
      kind: 'tend',
      phaseOffset: idx * 1.6,
      baseX: hx,
      baseZ: hz,
      baseYaw: yaw,
      homeRoute: [
        { x: hx, z: hz },
        { x: idx === 0 ? -9.8 : 9.8, z: -15.6 },
        { x: idx === 0 ? -13.6 : 13.6, z: -17.2 },
      ],
      homeYaw: idx === 0 ? 0.6 : -0.6,
      homeBlendSmooth: 0,
      stridePhase: 0,
      curX: hx,
      curZ: hz,
      curYaw: yaw,
    });
  });

  // 2J. Three Villagers Strolling Peacefully in the Inner Weilong Horseshoe & Side Wings
  const wingWalkers: Array<{
    tunic: THREE.MeshStandardMaterial;
    scarf: THREE.MeshStandardMaterial;
    hat: VillagerSpec['hat'];
    path: PathPoint2D[];
    speed: number;
    phase: number;
  }> = [
    {
      tunic: clothTealMat,
      scarf: clothLemonMat,
      hat: 'bun',
      path: [
        { x: -12.8, z: -12.2 },
        { x: -7.5, z: -17.5 },
        { x: 0.0, z: -19.2 },
        { x: 7.5, z: -17.5 },
        { x: 12.8, z: -12.2 },
        { x: 6.5, z: -15.8 },
        { x: -6.5, z: -15.8 },
      ],
      speed: 0.014,
      phase: 0.2,
    },
    {
      tunic: clothSageMat,
      scarf: clothVermMat,
      hat: 'conical',
      path: [
        { x: 14.5, z: 13.5 },
        { x: 14.5, z: 3.5 },
        { x: 15.2, z: -5.5 },
        { x: 13.8, z: 4.5 },
      ],
      speed: 0.018,
      phase: 0.5,
    },
    {
      tunic: clothLilacMat,
      scarf: clothCreamMat,
      hat: 'hakka_curtain',
      path: [
        { x: -14.5, z: 13.5 },
        { x: -14.5, z: 3.5 },
        { x: -15.2, z: -5.5 },
        { x: -13.8, z: 4.5 },
      ],
      speed: 0.018,
      phase: 0.82,
    },
  ];

  const rainUmbrellaPalette = [0xc94e34, 0x3f7c8a, 0xd49a3c];
  wingWalkers.forEach((ww, idx) => {
    const v = createVillager({
      tunicMat: ww.tunic,
      pantsMat: clothNavyMat,
      scarfMat: ww.scarf,
      hat: ww.hat,
    });
    const rainUmbrella = createHandOilPaperUmbrella(rainUmbrellaPalette[idx % rainUmbrellaPalette.length]);
    rainUmbrella.visible = false;
    v.rightHandSocket.add(rainUmbrella);
    root.add(v.group);
    const wwStarts: Array<[number, number, { x: number; z: number; yaw: number }]> = [
      [-6.5, -14.8, { x: -4.2, z: -18.2, yaw: 0.1 }],
      [11.2, 26.2, { x: 8.2, z: 19.0, yaw: -0.35 }],
      [-11.2, 26.2, { x: -8.2, z: 19.0, yaw: 0.35 }],
    ];
    const [sx, sz, hRoom] = wwStarts[idx % wwStarts.length];
    const wwId = `villager_roam_${idx}`;
    const wwAgent = freeRoam.registerAgent(wwId, 'villager_stroll', sx, sz, 0);
    walkingVillagers.push({
      id: wwId,
      group: v.group,
      torso: v.torso,
      leftArm: v.leftArm,
      rightArm: v.rightArm,
      leftElbow: v.leftElbow,
      rightElbow: v.rightElbow,
      leftLeg: v.leftLeg,
      rightLeg: v.rightLeg,
      leftKnee: v.leftKnee,
      rightKnee: v.rightKnee,
      head: v.head,
      sashTailL: v.sashTailL,
      sashTailR: v.sashTailR,
      sashSpring: new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping),
      rainUmbrella,
      waypoints: ww.path,
      speed: ww.speed,
      phaseOffset: ww.phase,
      roamAgent: wwAgent,
      homeRoom: hRoom,
      homeAnchor: null,
      homeRoute: [],
      homeBlendSmooth: 0,
      stridePhase: 0,
    });
  });

  // =========================================================================
  // 3. 14 SCULPTED WOODCARVED POULTRY: 2 ROOSTERS, 6 HENS & 6 FLUFFY CHICKS
  //    (Positioned cleanly on open courtyard cobbles — zero mat overlap!)
  // =========================================================================
  const poultryList: PoultryAnim[] = [];
  const beakMat = woodPaintMat(HANDCRAFTED_PAL.orange, 0.52);
  const combMat = woodPaintMat(HANDCRAFTED_PAL.red, 0.56);
  const tailIridescentMat = woodPaintMat(0x1b5c66, 0.42, 0.14);
  const roosterNeckMat = woodPaintMat(0xebaa3d, 0.72);

  const createChicken = (
    kind: 'rooster' | 'hen' | 'chick',
    featherHex: number,
    baseX: number,
    baseZ: number,
    wanderR: number,
    phaseOffset: number,
    leaderIdx?: number
  ) => {
    const g = new THREE.Group();
    const sc = kind === 'rooster' ? 1.18 : kind === 'hen' ? 0.96 : 0.46;
    addShadowDisc(g, 0.22 * sc, 0.2 * sc);

    const body = new THREE.Group();
    body.scale.setScalar(sc);
    g.add(body);

    const fMat = woodPaintMat(featherHex, 0.78);

    // Turned plump ovoid chicken breast & torso
    const torso = new THREE.Mesh(chickenBodyGeo, fMat);
    torso.position.set(0, 0.24, 0);
    torso.rotation.x = -0.14;
    torso.castShadow = castShadow;
    body.add(torso);

    // Cupped layered folded wings + drumstick thighs + slender shanks + 3-toed feet
    const wingMat = kind === 'chick' ? woodPaintMat(0xf5cf45, 0.78) : woodPaintMat(featherHex, 0.74);
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(chickenWingGeo, wingMat);
      wing.position.set(sx * 0.15, 0.25, 0.08);
      wing.rotation.set(-Math.PI * 0.52, sx * 0.22, sx * 1.42);
      wing.scale.set(0.95, 0.9, 1);
      body.add(wing);

      // Feathered thigh
      const thigh = new THREE.Mesh(sphereGeo, fMat);
      thigh.scale.set(0.055, 0.075, 0.062);
      thigh.position.set(sx * 0.062, 0.14, -0.01);
      body.add(thigh);

      // Slender shank + 3 toes
      const leg = new THREE.Mesh(cylGeo, beakMat);
      leg.scale.set(0.014, 0.13, 0.014);
      leg.position.set(sx * 0.06, 0.065, -0.01);
      body.add(leg);

      for (const ta of [-0.45, 0, 0.45]) {
        const toe = new THREE.Mesh(cylGeo, beakMat);
        toe.scale.set(0.008, 0.065, 0.008);
        toe.rotation.x = Math.PI * 0.5;
        toe.rotation.z = ta;
        toe.position.set(sx * 0.06 + Math.sin(ta) * 0.018, 0.012, 0.025);
        body.add(toe);
      }
    }

    // Neck + sculpted head + beak + 3-lobe scalloped comb & double wattles
    const head = new THREE.Group();
    head.position.set(0, 0.37, 0.16);
    body.add(head);

    if (kind !== 'chick') {
      const neck = new THREE.Mesh(cylGeo, kind === 'rooster' ? roosterNeckMat : fMat);
      neck.scale.set(0.065, 0.14, 0.068);
      neck.position.set(0, -0.05, -0.02);
      neck.rotation.x = 0.22;
      head.add(neck);
    }

    const hBall = new THREE.Mesh(sphereGeo, kind === 'rooster' ? roosterNeckMat : fMat);
    hBall.scale.set(0.09, 0.095, 0.1);
    head.add(hBall);

    const beak = new THREE.Mesh(coneGeo, beakMat);
    beak.scale.set(0.032, 0.088, 0.034);
    beak.rotation.x = Math.PI * 0.52;
    beak.position.set(0, -0.012, 0.115);
    head.add(beak);

    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(sphereGeo, inkMat);
      eye.scale.setScalar(0.017);
      eye.position.set(sx * 0.072, 0.024, 0.055);
      head.add(eye);
      const glint = new THREE.Mesh(sphereGeo, eyeHighlightMat);
      glint.scale.setScalar(0.006);
      glint.position.set(sx * 0.077, 0.029, 0.066);
      head.add(glint);
    }

    if (kind === 'rooster' || kind === 'hen') {
      // 3-lobe scalloped red comb (三瓣红冠)
      const lobeCount = kind === 'rooster' ? 3 : 2;
      for (let l = 0; l < lobeCount; l++) {
        const lobe = new THREE.Mesh(sphereGeo, combMat);
        const lh = kind === 'rooster' ? 0.056 - l * 0.008 : 0.034;
        lobe.scale.set(0.022, lh, 0.032);
        lobe.position.set(0, 0.095 + lh * 0.25, 0.045 - l * 0.044);
        head.add(lobe);
      }

      if (kind === 'rooster') {
        // Double scarlet wattles
        for (const sx of [-1, 1]) {
          const wattle = new THREE.Mesh(sphereGeo, combMat);
          wattle.scale.set(0.02, 0.048, 0.022);
          wattle.position.set(sx * 0.022, -0.07, 0.072);
          head.add(wattle);
        }

        // 5 gracefully arched iridescent emerald-teal tail plumes!
        for (let t = -2; t <= 2; t++) {
          const plume = new THREE.Mesh(
            Math.abs(t) <= 1 ? roosterPlumeGeos[0] : roosterPlumeGeos[1],
            t === 0 ? tailIridescentMat : woodPaintMat(0x164a54, 0.44, 0.16)
          );
          plume.position.set(t * 0.022, 0.29, -0.17);
          plume.rotation.y = t * 0.14;
          plume.rotation.z = -t * 0.08;
          body.add(plume);
        }
      } else {
        // Fanned 3-feather hen tail
        for (let t = -1; t <= 1; t++) {
          const feather = new THREE.Mesh(chickenWingGeo, fMat);
          feather.scale.set(0.68, 0.82, 1);
          feather.position.set(t * 0.038, 0.26, -0.19);
          feather.rotation.set(-0.68, t * 0.25, 0);
          body.add(feather);
        }
      }
    }

    const by = groundHeightAt(baseX, baseZ, 0);
    g.position.set(baseX, by, baseZ);
    root.add(g);

    const pId = `${kind}_${poultryList.length}`;
    const isHuataiBird = baseZ < 0;
    const birdIdx = poultryList.length;
    const coopTarget = isHuataiBird
      ? {
          x: -3.8 + ((birdIdx % 3) - 1) * 0.24,
          z: -17.0 + ((birdIdx % 2) - 0.5) * 0.22,
          entryX: -3.8,
          entryZ: -15.9,
        }
      : {
          x: 13.4 + (((birdIdx % 5) - 2) * 0.28),
          z: 22.95 + (((Math.floor(birdIdx / 5) % 2) - 0.5) * 0.34),
          entryX: 12.6,
          entryZ: 24.0,
        };
    const roamAgent =
      kind === 'chick'
        ? undefined
        : freeRoam.registerAgent(
            pId,
            kind === 'rooster' ? 'rooster' : 'hen',
            baseX,
            baseZ,
            phaseOffset
          );

    poultryList.push({
      id: pId,
      group: g,
      body,
      head,
      baseX,
      baseZ,
      wanderR,
      phaseOffset,
      speed: kind === 'chick' ? 1.45 : kind === 'rooster' ? 0.65 : 0.85,
      isChick: kind === 'chick',
      leaderIdx,
      roamAgent,
      coopTarget,
      homeAnchor: null,
      coopBlendSmooth: 0,
    });
  };

  // 2 Proud Roosters (clear of grain mats!)
  createChicken('rooster', 0xd67230, -10.8, 31.0, 1.3, 0.2);
  createChicken('rooster', 0xc95a2a, 4.4, -10.8, 1.5, 2.4);

  // 6 Pecking Hens (indices 2..7, completely clear of grain mats!)
  createChicken('hen', 0xf3e4c4, -11.4, 26.8, 1.35, 0.8); // idx 2: mother hen West He-Ping
  createChicken('hen', 0xd99b56, 11.4, 28.4, 1.35, 1.9);  // idx 3: mother hen East He-Ping
  createChicken('hen', 0xb87646, 10.4, 25.0, 1.25, 3.1);
  createChicken('hen', 0xebd7b2, -12.0, 24.8, 1.2, 4.3);
  createChicken('hen', 0xc88248, 13.4, 31.8, 1.3, 5.2);
  createChicken('hen', 0xf0dfbd, -3.4, -11.5, 1.5, 2.7);

  // 6 Tiny Fluffy Lemon-Yellow Chicks trailing Mother Hens 2 & 3!
  createChicken('chick', HANDCRAFTED_PAL.lemon, -11.8, 27.2, 0.75, 0.4, 2);
  createChicken('chick', HANDCRAFTED_PAL.lemon, -11.0, 27.4, 0.75, 1.3, 2);
  createChicken('chick', 0xf9df6b, -12.0, 26.5, 0.75, 2.2, 2);
  createChicken('chick', HANDCRAFTED_PAL.lemon, 11.8, 28.8, 0.75, 0.9, 3);
  createChicken('chick', 0xf9df6b, 11.0, 29.0, 0.75, 1.8, 3);
  createChicken('chick', HANDCRAFTED_PAL.lemon, 12.1, 28.0, 0.75, 2.9, 3);

  // =========================================================================
  // 4. 7 SCULPTED HALF-MOON POND WATERFOWL: 3 S-NECKED WHITE GEESE & 4 MALLARDS
  // =========================================================================
  const waterfowlList: WaterfowlAnim[] = [];
  const wakeGeo = trackGeo(new THREE.RingGeometry(0.28, 0.39, 20));
  wakeGeo.rotateX(-Math.PI * 0.5);
  const wakeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xeaf8f6,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const duckSpeculumMat = woodPaintMat(0x2867a8, 0.42, 0.14);
  const duckChestMat = woodPaintMat(0x7c452d, 0.76);

  const createWaterfowl = (
    kind: 'goose' | 'duck',
    cx: number,
    cz: number,
    rx: number,
    rz: number,
    speed: number,
    phaseOffset: number,
    dir: 1 | -1
  ) => {
    const g = new THREE.Group();
    const sc = kind === 'goose' ? 1.24 : 0.88;

    const bodyMat = kind === 'goose' ? clothCreamMat : woodPaintMat(0xc8b9a6, 0.78);
    const headMat = kind === 'goose' ? clothCreamMat : woodPaintMat(0x1f6a56, 0.48, 0.12);

    // Turned boat-like buoyant body
    const body = new THREE.Mesh(waterfowlBodyGeo, bodyMat);
    body.scale.set(sc, sc * 0.78, sc);
    body.position.y = 0.08 * sc;
    g.add(body);

    if (kind === 'duck') {
      // Rich chestnut mallard chest
      const chest = new THREE.Mesh(sphereGeo, duckChestMat);
      chest.scale.set(0.18 * sc, 0.14 * sc, 0.16 * sc);
      chest.position.set(0, 0.1 * sc, 0.22 * sc);
      g.add(chest);
    }

    // Sculpted layered folded wings on both flanks (+ blue speculum patch on mallards)
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(
        waterfowlWingGeo,
        kind === 'goose' ? woodPaintMat(0xf6f0e4, 0.76) : woodPaintMat(0xa8927c, 0.78)
      );
      wing.scale.setScalar(sc);
      wing.position.set(sx * 0.21 * sc, 0.13 * sc, 0.16 * sc);
      wing.rotation.set(-Math.PI * 0.5, sx * 0.16, sx * 1.42);
      g.add(wing);

      if (kind === 'duck') {
        const speculum = new THREE.Mesh(boxGeo, duckSpeculumMat);
        speculum.scale.set(0.03 * sc, 0.06 * sc, 0.14 * sc);
        speculum.position.set(sx * 0.23 * sc, 0.11 * sc, -0.06 * sc);
        g.add(speculum);
      }
    }

    // Upturned tail feathers
    const tail = new THREE.Mesh(coneGeo, kind === 'goose' ? clothCreamMat : inkMat);
    tail.scale.set(0.11 * sc, 0.24 * sc, 0.09 * sc);
    tail.position.set(0, 0.17 * sc, -0.35 * sc);
    tail.rotation.x = -0.88;
    g.add(tail);

    // S-curved goose neck OR curved mallard neck
    const neck = new THREE.Group();
    neck.position.set(0, 0.14 * sc, 0.24 * sc);
    g.add(neck);

    const neckMesh = new THREE.Mesh(
      kind === 'goose' ? gooseNeckGeo : duckNeckGeo,
      kind === 'goose' ? clothCreamMat : headMat
    );
    neckMesh.scale.setScalar(sc);
    neck.add(neckMesh);

    const headY = kind === 'goose' ? 0.43 * sc : 0.24 * sc;
    const headZ = kind === 'goose' ? 0.07 * sc : 0.06 * sc;

    const head = new THREE.Mesh(sphereGeo, headMat);
    head.scale.set(0.092 * sc, 0.09 * sc, 0.125 * sc);
    head.position.set(0, headY, headZ);
    neck.add(head);

    if (kind === 'goose') {
      // Iconic Chinese white goose orange forehead knob (额瘤)!
      const knob = new THREE.Mesh(sphereGeo, beakMat);
      knob.scale.set(0.048 * sc, 0.048 * sc, 0.048 * sc);
      knob.position.set(0, headY + 0.042 * sc, headZ + 0.1 * sc);
      neck.add(knob);
    } else {
      // Crisp white mallard neck ring
      const collar = new THREE.Mesh(cylGeo, clothCreamMat);
      collar.scale.set(0.078 * sc, 0.036 * sc, 0.078 * sc);
      collar.position.set(0, 0.11 * sc, 0.03 * sc);
      neck.add(collar);
    }

    // Rounded tapered bill
    const bill = new THREE.Mesh(sphereGeo, beakMat);
    bill.scale.set(0.052 * sc, 0.032 * sc, 0.12 * sc);
    bill.position.set(0, headY - 0.015 * sc, headZ + 0.16 * sc);
    neck.add(bill);

    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(sphereGeo, inkMat);
      eye.scale.setScalar(0.017 * sc);
      eye.position.set(sx * 0.078 * sc, headY + 0.02 * sc, headZ + 0.045 * sc);
      neck.add(eye);
    }

    const wake = new THREE.Mesh(wakeGeo, wakeMat);
    wake.position.y = 0.02;
    g.add(wake);

    root.add(g);
    const wfIdx = waterfowlList.length;
    const westNest = cx < 0 || wfIdx % 2 === 0;
    const nestBaseX = westNest ? -11.8 : 11.8;
    const nestBaseZ = 39.8;
    const slotAngle = (wfIdx % 4) * 1.55;
    waterfowlList.push({
      group: g,
      neck,
      wake,
      cx,
      cz,
      rx,
      rz,
      speed,
      phaseOffset,
      dir,
      nestX: nestBaseX + Math.cos(slotAngle) * 0.42,
      nestZ: nestBaseZ + Math.sin(slotAngle) * 0.36,
      nestYaw: westNest ? 0.8 : -0.8,
      nestBlendSmooth: 0,
    });
  };

  // 3 White Hakka Geese gliding gracefully across Half-Moon Pond
  createWaterfowl('goose', -2.5, 43.4, 5.2, 2.7, 0.28, 0.2, 1);
  createWaterfowl('goose', -2.5, 43.4, 5.2, 2.7, 0.28, 0.65, 1);
  createWaterfowl('goose', 4.2, 43.0, 4.6, 2.4, 0.24, 2.1, -1);

  // 4 Colorful Mallard Ducks paddling in playful orbits
  createWaterfowl('duck', 2.0, 44.5, 6.2, 2.8, 0.38, 1.1, 1);
  createWaterfowl('duck', 2.0, 44.5, 6.2, 2.8, 0.38, 1.48, 1);
  createWaterfowl('duck', -5.2, 42.6, 3.8, 2.1, 0.42, 3.8, -1);
  createWaterfowl('duck', 6.4, 42.2, 3.2, 1.9, 0.36, 4.9, 1);

  // =========================================================================
  // 5. 6 SCULPTED DOMESTIC ANIMALS: DOG, SPOTTED PUPPY, TABBY CAT, BUFFALO & 2 GOATS
  // =========================================================================
  const quadrupeds: QuadrupedAnim[] = [];

  // 5A. Friendly Yellow Village Dog (大黄狗) & Spotted Cream Puppy (小花狗)
  const buildDog = (
    furHex: number,
    collarHex: number,
    sc: number,
    kind: 'dog_patrol' | 'puppy_hop',
    waypoints: readonly PathPoint2D[] | undefined,
    posX: number,
    posZ: number,
    speed: number,
    phaseOffset: number,
    spotted = false
  ) => {
    const g = new THREE.Group();
    addShadowDisc(g, 0.44 * sc, 0.34 * sc);
    const rig = new THREE.Group();
    rig.scale.setScalar(sc);
    g.add(rig);

    const furMat = woodPaintMat(furHex, 0.8);
    const bellyMat = woodPaintMat(HANDCRAFTED_PAL.cream, 0.82);
    const spotMat = woodPaintMat(0x9a6234, 0.8);

    // Turned deep-chest + tucked-waist torso
    const torso = new THREE.Mesh(dogBodyGeo, furMat);
    torso.position.set(0, 0.47, 0);
    torso.castShadow = castShadow;
    rig.add(torso);

    const chest = new THREE.Mesh(sphereGeo, bellyMat);
    chest.scale.set(0.165, 0.16, 0.18);
    chest.position.set(0, 0.44, 0.26);
    rig.add(chest);

    if (spotted) {
      const spotA = new THREE.Mesh(sphereGeo, spotMat);
      spotA.scale.set(0.11, 0.08, 0.15);
      spotA.position.set(0.12, 0.56, -0.05);
      rig.add(spotA);
      const spotB = new THREE.Mesh(sphereGeo, spotMat);
      spotB.scale.set(0.1, 0.08, 0.12);
      spotB.position.set(-0.11, 0.54, 0.12);
      rig.add(spotB);
    }

    // Vermilion / cerulean collar + gilded bell
    const collar = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.155, 0.028, 7, 16)),
      woodPaintMat(collarHex, 0.54)
    );
    collar.position.set(0, 0.55, 0.31);
    collar.rotation.x = 0.95;
    rig.add(collar);
    const bell = new THREE.Mesh(sphereGeo, mats.gildedGold);
    bell.scale.setScalar(0.044);
    bell.position.set(0, 0.44, 0.42);
    rig.add(bell);

    const head = new THREE.Group();
    head.position.set(0, 0.65, 0.39);
    rig.add(head);

    const skull = new THREE.Mesh(sphereGeo, furMat);
    skull.scale.set(0.155, 0.148, 0.175);
    head.add(skull);
    const snout = new THREE.Mesh(sphereGeo, bellyMat);
    snout.scale.set(0.086, 0.072, 0.135);
    snout.position.set(0, -0.032, 0.155);
    head.add(snout);
    const nose = new THREE.Mesh(sphereGeo, inkMat);
    nose.scale.set(0.04, 0.03, 0.036);
    nose.position.set(0, -0.006, 0.275);
    head.add(nose);

    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(sphereGeo, inkMat);
      eye.scale.setScalar(0.024);
      eye.position.set(sx * 0.072, 0.032, 0.142);
      head.add(eye);
      const glint = new THREE.Mesh(sphereGeo, eyeHighlightMat);
      glint.scale.setScalar(0.008);
      glint.position.set(sx * 0.068, 0.039, 0.16);
      head.add(glint);

      // Soft rounded woodcarved floppy dog ears resting along the sides of the head
      const ear = new THREE.Mesh(sphereGeo, spotMat);
      ear.scale.set(0.046, 0.112, 0.068);
      ear.position.set(sx * 0.142, 0.028, -0.015);
      ear.rotation.set(0.12, 0, sx * 0.26);
      head.add(ear);
    }

    // Curved furry wagging tail
    const tail = new THREE.Group();
    tail.position.set(0, 0.54, -0.38);
    tail.add(new THREE.Mesh(dogTailGeo, furMat));
    rig.add(tail);

    // Jointed legs with rounded cream paws
    const legs: THREE.Object3D[] = [];
    for (const [lx, lz] of [
      [-0.12, 0.24],
      [0.12, 0.24],
      [-0.12, -0.24],
      [0.12, -0.24],
    ]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.36, lz);
      const upper = new THREE.Mesh(sphereGeo, furMat);
      upper.scale.set(0.068, 0.1, 0.074);
      upper.position.y = -0.05;
      leg.add(upper);
      const limb = new THREE.Mesh(cylGeo, furMat);
      limb.scale.set(0.052, 0.29, 0.052);
      limb.position.y = -0.19;
      leg.add(limb);
      const paw = new THREE.Mesh(sphereGeo, bellyMat);
      paw.scale.set(0.058, 0.04, 0.074);
      paw.position.set(0, -0.34, 0.02);
      leg.add(paw);
      rig.add(leg);
      legs.push(leg);
    }

    const baseY = groundHeightAt(posX, posZ, 0);
    g.position.set(posX, baseY, posZ);
    root.add(g);
    const dogId = kind === 'puppy_hop' ? 'puppy_0' : 'dog_0';
    const dogAgent = freeRoam.registerAgent(
      dogId,
      kind === 'puppy_hop' ? 'puppy_playful' : 'dog_patrol',
      posX,
      posZ,
      0
    );
    const insideX = kind === 'puppy_hop' ? -9.42 : -9.76;
    const insideZ = kind === 'puppy_hop' ? 22.92 : 22.74;
    quadrupeds.push({
      id: dogId,
      group: g,
      head,
      tail,
      legs,
      kind,
      waypoints,
      speed,
      phaseOffset,
      baseX: posX,
      baseZ: posZ,
      baseY,
      roamAgent: dogAgent,
      homeRouteTail: [
        { x: -9.6, z: 24.3 },
        { x: insideX, z: insideZ },
      ],
      homeYaw: 0.15,
      homeAnchor: null,
      homeRoute: [],
      homeBlendSmooth: 0,
      gaitPhase: 0,
    });
  };

  buildDog(
    0xdc9a46,
    HANDCRAFTED_PAL.verm,
    1.0,
    'dog_patrol',
    [
      { x: -11.4, z: 32.8 },
      { x: -3.0, z: 32.8 },
      { x: 4.5, z: 32.8 },
      { x: 11.4, z: 32.2 },
      { x: 11.4, z: 25.0 },
      { x: 2.5, z: 24.8 },
      { x: -3.6, z: 24.8 },
      { x: -11.4, z: 25.2 },
    ],
    -4.0,
    32.8,
    0.026,
    0.3
  );
  // Spotted cream puppy hopping happily on open central He-Ping cobbles (zero grain mat overlap!)
  buildDog(0xf4e8d0, HANDCRAFTED_PAL.cer, 0.64, 'puppy_hop', undefined, -1.6, 31.8, 1.0, 1.2, true);

  // 5B. Cozy Sunbathing Ginger Tabby Cat (花纹橘猫) curled beside the sunny main gate veranda!
  {
    const cx = 4.1;
    const cz = 22.85;
    const cy = groundHeightAt(cx, cz, 0);
    const catG = new THREE.Group();
    addShadowDisc(catG, 0.34, 0.3);
    const gingerMat = woodPaintMat(0xea9342, 0.78);
    const tabbyStripeMat = woodPaintMat(0xb85e1e, 0.78);
    const earPinkMat = woodPaintMat(0xf4b2a8, 0.8);

    const body = new THREE.Mesh(sphereGeo, gingerMat);
    body.scale.set(0.24, 0.165, 0.29);
    body.position.set(0, 0.145, 0);
    catG.add(body);

    // Warm tabby back stripes
    for (const sz of [-0.11, 0.0, 0.11]) {
      const stripe = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.175, 0.022, 6, 12, Math.PI * 0.9)),
        tabbyStripeMat
      );
      stripe.position.set(0, 0.155, sz);
      stripe.rotation.z = Math.PI * 0.05;
      catG.add(stripe);
    }

    // Tucked cream front paws
    for (const sx of [-0.08, 0.08]) {
      const paw = new THREE.Mesh(sphereGeo, clothCreamMat);
      paw.scale.set(0.055, 0.038, 0.082);
      paw.position.set(sx, 0.04, 0.22);
      catG.add(paw);
    }

    const head = new THREE.Group();
    head.position.set(0.05, 0.245, 0.21);
    catG.add(head);
    const skull = new THREE.Mesh(sphereGeo, gingerMat);
    skull.scale.set(0.128, 0.118, 0.122);
    head.add(skull);
    const muzzle = new THREE.Mesh(sphereGeo, clothCreamMat);
    muzzle.scale.set(0.068, 0.046, 0.055);
    muzzle.position.set(0, -0.028, 0.095);
    head.add(muzzle);
    const pinkNose = new THREE.Mesh(sphereGeo, earPinkMat);
    pinkNose.scale.setScalar(0.018);
    pinkNose.position.set(0, -0.012, 0.145);
    head.add(pinkNose);

    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(coneGeo, gingerMat);
      ear.scale.set(0.048, 0.1, 0.042);
      ear.position.set(sx * 0.082, 0.112, -0.01);
      ear.rotation.z = -sx * 0.22;
      head.add(ear);
      const innerEar = new THREE.Mesh(coneGeo, earPinkMat);
      innerEar.scale.set(0.028, 0.064, 0.02);
      innerEar.position.set(sx * 0.08, 0.108, 0.012);
      innerEar.rotation.z = -sx * 0.22;
      head.add(innerEar);
      // Content sleeping crescent eyes
      const eye = new THREE.Mesh(sphereGeo, inkMat);
      eye.scale.set(0.022, 0.008, 0.014);
      eye.position.set(sx * 0.052, 0.014, 0.112);
      head.add(eye);
    }

    // S-curved animated cat tail
    const tail = new THREE.Group();
    tail.position.set(-0.07, 0.1, -0.24);
    tail.add(new THREE.Mesh(catTailGeo, gingerMat));
    catG.add(tail);

    catG.position.set(cx, cy, cz);
    catG.rotation.y = -0.65;
    root.add(catG);
    const catAgent = freeRoam.registerAgent('cat_0', 'cat_curious', cx, cz, -0.65);
    quadrupeds.push({
      id: 'cat_0',
      group: catG,
      head,
      tail,
      legs: [],
      kind: 'cat_loaf',
      speed: 1.0,
      phaseOffset: 0.7,
      baseX: cx,
      baseZ: cz,
      baseY: cy,
      roamAgent: catAgent,
      homeRouteTail: [
        { x: 0.0, z: 22.6 },
        { x: 0.0, z: 20.6 },
        { x: 3.4, z: 20.6 },
      ],
      homeYaw: -0.45,
      homeAnchor: null,
      homeRoute: [],
      homeBlendSmooth: 0,
      gaitPhase: 0,
    });
  }

  // 5C. Peaceful Grazing Water Buffalo (客家水牛) with Sweeping Crescent Horns on East Pond Meadow!
  {
    const bx = 21.4;
    const bz = 41.2;
    const by = groundHeightAt(bx, bz, 0);
    const bufG = new THREE.Group();
    addShadowDisc(bufG, 1.22, 0.88);

    const hideMat = woodPaintMat(0x3a4859, 0.82);
    const muzzleMat = woodPaintMat(0x526070, 0.76);
    const hornMat = woodPaintMat(0xdcd0b2, 0.62);
    const hoofMat = woodPaintMat(0x26292e, 0.72);

    // Turned massive barrel torso + broad shoulder hump
    const torso = new THREE.Mesh(buffaloBodyGeo, hideMat);
    torso.position.set(0, 1.12, 0);
    torso.castShadow = castShadow;
    bufG.add(torso);

    const hump = new THREE.Mesh(sphereGeo, hideMat);
    hump.scale.set(0.46, 0.34, 0.44);
    hump.position.set(0, 1.54, 0.48);
    bufG.add(hump);

    const head = new THREE.Group();
    head.position.set(0, 1.24, 1.02);
    bufG.add(head);

    const skull = new THREE.Mesh(sphereGeo, hideMat);
    skull.scale.set(0.32, 0.31, 0.45);
    head.add(skull);
    const muzzle = new THREE.Mesh(sphereGeo, muzzleMat);
    muzzle.scale.set(0.25, 0.21, 0.26);
    muzzle.position.set(0, -0.09, 0.34);
    head.add(muzzle);

    for (const sx of [-1, 1]) {
      // Sweeping crescent water-buffalo horns!
      const horn = new THREE.Mesh(sx < 0 ? bufHornLGeo : bufHornRGeo, hornMat);
      horn.position.set(sx * 0.16, 0.2, -0.02);
      head.add(horn);

      // Drooping broad ears
      const ear = new THREE.Mesh(dogEarGeo, hideMat);
      ear.scale.set(1.6, 1.4, 1.4);
      ear.position.set(sx * 0.28, 0.08, -0.06);
      ear.rotation.set(0.1, sx * 0.25, sx * 2.15);
      head.add(ear);

      const eye = new THREE.Mesh(sphereGeo, inkMat);
      eye.scale.setScalar(0.044);
      eye.position.set(sx * 0.24, 0.07, 0.24);
      head.add(eye);

      const nostril = new THREE.Mesh(sphereGeo, inkMat);
      nostril.scale.set(0.036, 0.026, 0.026);
      nostril.position.set(sx * 0.09, -0.1, 0.56);
      head.add(nostril);
    }

    const tail = new THREE.Group();
    tail.position.set(0, 1.16, -0.98);
    const tStem = new THREE.Mesh(cylGeo, hideMat);
    tStem.scale.set(0.04, 0.72, 0.04);
    tStem.position.y = -0.34;
    tail.add(tStem);
    const tTuft = new THREE.Mesh(coneGeo, hoofMat);
    tTuft.scale.set(0.078, 0.22, 0.078);
    tTuft.rotation.x = Math.PI;
    tTuft.position.y = -0.74;
    tail.add(tTuft);
    bufG.add(tail);

    const legs: THREE.Object3D[] = [];
    for (const [lx, lz] of [
      [-0.36, 0.56],
      [0.36, 0.56],
      [-0.36, -0.58],
      [0.36, -0.58],
    ]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.82, lz);
      const upper = new THREE.Mesh(sphereGeo, hideMat);
      upper.scale.set(0.17, 0.22, 0.19);
      upper.position.y = -0.12;
      leg.add(upper);
      const limb = new THREE.Mesh(cylGeo, hideMat);
      limb.scale.set(0.115, 0.66, 0.115);
      limb.position.y = -0.44;
      leg.add(limb);
      const hoof = new THREE.Mesh(cylGeo, hoofMat);
      hoof.scale.set(0.125, 0.12, 0.135);
      hoof.position.y = -0.76;
      leg.add(hoof);
      bufG.add(leg);
      legs.push(leg);
    }

    bufG.position.set(bx, by, bz);
    bufG.rotation.y = -1.25;
    root.add(bufG);
    const bufAgent = freeRoam.registerAgent('buffalo_0', 'buffalo', bx, bz, -1.25);
    quadrupeds.push({
      id: 'buffalo_0',
      group: bufG,
      head,
      tail,
      legs,
      kind: 'buffalo',
      speed: 0.8,
      phaseOffset: 1.4,
      baseX: bx,
      baseZ: bz,
      baseY: by,
      roamAgent: bufAgent,
      homeRouteTail: [
        { x: 24.4, z: 42.2 },
        { x: 25.5, z: 43.3 },
      ],
      homeYaw: -1.1,
      homeAnchor: null,
      homeRoute: [],
      homeBlendSmooth: 0,
      gaitPhase: 0,
    });
  }

  // 5D. Two Fluffy Multi-Puff Wool White Goats (白山羊) Grazing on West Meadow Verge!
  const goatWoolGeo = trackGeo(createSoftPillowGeometry(0.32, 3.1, 0.86, 12, 10));
  const goatSpecs: Array<[number, number, number, number]> = [
    [-21.8, 39.6, 0.92, 0.5],
    [-24.2, 41.2, -0.55, 2.3],
  ];
  goatSpecs.forEach(([gx, gz, yaw, phase]) => {
    const gy = groundHeightAt(gx, gz, 0);
    const goatG = new THREE.Group();
    addShadowDisc(goatG, 0.54, 0.38);

    const woolMat = clothCreamMat;
    const hoofMat = woodPaintMat(0x4b4238, 0.78);
    // Fluffy multi-puff wool coat
    const torso = new THREE.Mesh(goatWoolGeo, woolMat);
    torso.scale.set(0.92, 0.96, 1.48);
    torso.position.set(0, 0.62, 0);
    torso.castShadow = castShadow;
    goatG.add(torso);
    const rumpPuff = new THREE.Mesh(goatWoolGeo, woolMat);
    rumpPuff.scale.set(0.75, 0.78, 0.78);
    rumpPuff.position.set(0, 0.66, -0.26);
    goatG.add(rumpPuff);

    const head = new THREE.Group();
    head.position.set(0, 0.8, 0.44);
    goatG.add(head);
    const skull = new THREE.Mesh(sphereGeo, woolMat);
    skull.scale.set(0.148, 0.155, 0.23);
    head.add(skull);
    const beard = new THREE.Mesh(coneGeo, woolMat);
    beard.scale.set(0.052, 0.16, 0.052);
    beard.rotation.x = Math.PI;
    beard.position.set(0, -0.17, 0.14);
    head.add(beard);
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(sx < 0 ? goatHornLGeo : goatHornRGeo, hoofMat);
      horn.position.set(sx * 0.068, 0.12, -0.02);
      head.add(horn);
      const ear = new THREE.Mesh(dogEarGeo, woolMat);
      ear.scale.set(0.75, 0.7, 0.7);
      ear.position.set(sx * 0.13, 0.05, -0.02);
      ear.rotation.set(0.1, sx * 0.3, sx * 2.2);
      head.add(ear);
      const eye = new THREE.Mesh(sphereGeo, inkMat);
      eye.scale.setScalar(0.022);
      eye.position.set(sx * 0.105, 0.04, 0.12);
      head.add(eye);
    }

    const tail = new THREE.Group();
    tail.position.set(0, 0.72, -0.45);
    const tailStub = new THREE.Mesh(coneGeo, woolMat);
    tailStub.scale.set(0.062, 0.16, 0.062);
    tailStub.rotation.x = -0.58;
    tail.add(tailStub);
    goatG.add(tail);

    const legs: THREE.Object3D[] = [];
    for (const [lx, lz] of [
      [-0.15, 0.26],
      [0.15, 0.26],
      [-0.15, -0.26],
      [0.15, -0.26],
    ]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.46, lz);
      const limb = new THREE.Mesh(cylGeo, woolMat);
      limb.scale.set(0.05, 0.34, 0.05);
      limb.position.y = -0.17;
      leg.add(limb);
      const hoof = new THREE.Mesh(cylGeo, hoofMat);
      hoof.scale.set(0.048, 0.12, 0.052);
      hoof.position.y = -0.4;
      leg.add(hoof);
      goatG.add(leg);
      legs.push(leg);
    }

    goatG.position.set(gx, gy, gz);
    goatG.rotation.y = yaw;
    root.add(goatG);
    const goatIdx = quadrupeds.length;
    const goatId = `goat_${goatIdx}`;
    const goatAgent = freeRoam.registerAgent(goatId, 'goat', gx, gz, yaw);
    const shedSlotX = goatIdx % 2 === 0 ? -25.2 : -26.3;
    const shedSlotZ = goatIdx % 2 === 0 ? 42.2 : 42.7;
    quadrupeds.push({
      id: goatId,
      group: goatG,
      head,
      tail,
      legs,
      kind: 'goat',
      speed: 1.0,
      phaseOffset: phase,
      baseX: gx,
      baseZ: gz,
      baseY: gy,
      roamAgent: goatAgent,
      homeRouteTail: [
        { x: -24.4, z: 41.8 },
        { x: shedSlotX, z: shedSlotZ },
      ],
      homeYaw: 0.85,
      homeAnchor: null,
      homeRoute: [],
      homeBlendSmooth: 0,
      gaitPhase: 0,
    });
  });

  // =========================================================================
  // 6. SKY WILDLIFE & POETIC ATMOSPHERE:
  //    6 FEATHERED CRANES, 12 CUPPED-WING BUTTERFLIES, CHIMNEY SMOKE,
  //    PEACH PETALS (SUNNY), & 28 TURNED PAPER SKY LANTERNS (LANTERN NIGHT)
  // =========================================================================

  // 6A. Six Soaring White Cranes / Egrets (白鹭/仙鹤) with sculpted swept wings & trailing legs!
  const cranes: CraneAnim[] = [];
  const craneWhiteMat = woodPaintMat(HANDCRAFTED_PAL.white, 0.58);
  const craneBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.54],
        [0.09, -0.4],
        [0.16, -0.12],
        [0.17, 0.16],
        [0.11, 0.38],
        [0.0, 0.48],
      ],
      12
    )
  );
  craneBodyGeo.rotateX(Math.PI * 0.5);

  const craneNeckGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0.04, 0.38),
        new THREE.Vector3(0, 0.09, 0.58),
        new THREE.Vector3(0, 0.07, 0.78),
      ],
      0.048,
      0.036,
      8,
      7
    )
  );
  const craneInnerWingGeo = trackGeo(createCuppedPetalGeometry(0.42, 0.96, 0.07));
  const craneOuterWingGeo = trackGeo(createCuppedPetalGeometry(0.34, 0.52, 0.045));

  for (let i = 0; i < 6; i++) {
    const cg = new THREE.Group();
    cg.add(new THREE.Mesh(craneBodyGeo, craneWhiteMat));
    cg.add(new THREE.Mesh(craneNeckGeo, craneWhiteMat));

    const beak = new THREE.Mesh(coneGeo, beakMat);
    beak.scale.set(0.03, 0.24, 0.03);
    beak.rotation.x = Math.PI * 0.5;
    beak.position.set(0, 0.07, 0.92);
    cg.add(beak);

    const crown = new THREE.Mesh(sphereGeo, combMat);
    crown.scale.setScalar(0.04);
    crown.position.set(0, 0.115, 0.76);
    cg.add(crown);

    // Trailing slender crane legs
    for (const sx of [-0.045, 0.045]) {
      const leg = new THREE.Mesh(cylGeo, inkMat);
      leg.scale.set(0.012, 0.55, 0.012);
      leg.rotation.x = Math.PI * 0.48;
      leg.position.set(sx, -0.02, -0.76);
      cg.add(leg);
    }

    const makeWing = (side: -1 | 1): THREE.Group => {
      const wg = new THREE.Group();
      wg.position.set(side * 0.13, 0.04, 0.06);
      const inner = new THREE.Mesh(craneInnerWingGeo, craneWhiteMat);
      inner.rotation.z = -side * Math.PI * 0.5;
      inner.rotation.x = Math.PI * 0.5;
      wg.add(inner);

      const tip = new THREE.Mesh(craneOuterWingGeo, inkMat);
      tip.position.set(side * 0.86, 0.0, -0.04);
      tip.rotation.z = -side * Math.PI * 0.5;
      tip.rotation.x = Math.PI * 0.5;
      tip.rotation.y = side * 0.16;
      wg.add(tip);
      return wg;
    };
    const leftWing = makeWing(-1);
    const rightWing = makeWing(1);
    cg.add(leftWing, rightWing);

    const roostSpots: Array<[number, number, number]> = [
      [-21.5, -48.5, 0.4],
      [-12.0, -52.5, -0.25],
      [-2.5, -54.5, 0.15],
      [7.5, -53.5, -0.35],
      [16.8, -50.2, 0.5],
      [23.5, -46.8, -0.6],
    ];
    const [roostX, roostZ, roostYaw] = roostSpots[i % roostSpots.length];
    const roostY = groundHeightAt(roostX, roostZ, 0) + 6.5 + (i % 3) * 0.65;

    const sc = 0.88 + (i % 3) * 0.14;
    cg.scale.setScalar(sc);
    root.add(cg);
    // Physical woven twig bird nest tucked beneath each crane's treetop roost!
    const nestTwigMat = woodPaintMat(0x6e4e32, 0.9);
    const twigNest = new THREE.Group();
    twigNest.position.set(roostX, roostY - 0.14, roostZ);
    const nestRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.46, 0.11, 6, 14)), nestTwigMat);
    nestRim.rotation.x = Math.PI * 0.5;
    twigNest.add(nestRim);
    const nestBowl = new THREE.Mesh(cylGeo, strawRimMat);
    nestBowl.scale.set(0.42, 0.12, 0.42);
    nestBowl.position.y = -0.05;
    twigNest.add(nestBowl);
    root.add(twigNest);

    cranes.push({
      group: cg,
      leftWing,
      rightWing,
      cx: i < 3 ? 0 : 4,
      cz: i < 3 ? 8 : 16,
      rx: 28 + (i % 3) * 7.5,
      rz: 24 + (i % 2) * 8.0,
      alt: 18.5 + (i % 3) * 3.2,
      speed: 0.022 + (i % 3) * 0.004,
      phaseOffset: i / 6,
      roostX,
      roostY,
      roostZ,
      roostYaw,
    });
  }

  // 6B. Twelve Cupped-Wing Painted Butterflies (双翅彩蝶)
  const butterflies: ButterflyAnim[] = [];
  const bfColors = [
    HANDCRAFTED_PAL.lemon,
    HANDCRAFTED_PAL.pink,
    HANDCRAFTED_PAL.cer,
    HANDCRAFTED_PAL.orange,
    HANDCRAFTED_PAL.lilac,
  ];
  const bfForeWingGeo = trackGeo(createCuppedPetalGeometry(0.11, 0.16, 0.015));
  const bfHindWingGeo = trackGeo(createCuppedPetalGeometry(0.085, 0.115, 0.012));
  const bfCenters: Array<[number, number, number]> = [
    [-10.8, 0.9, 41.8],
    [10.8, 0.95, 42.0],
    [-12.2, 1.1, 43.2],
    [11.8, 1.0, 43.6],
    [-19.5, 1.2, 23.2],
    [19.5, 1.2, 23.2],
    [-14.2, 1.1, 36.2],
    [14.2, 1.1, 36.2],
    [-8.5, 2.2, -16.2],
    [8.5, 2.2, -16.2],
    [-23.0, 1.4, 24.0],
    [23.0, 1.4, 24.0],
  ];
  bfCenters.forEach(([cx, cy, cz], idx) => {
    const bg = new THREE.Group();
    const body = new THREE.Mesh(cylGeo, inkMat);
    body.scale.set(0.014, 0.11, 0.014);
    body.rotation.x = Math.PI * 0.5;
    bg.add(body);

    const wMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: bfColors[idx % bfColors.length],
        side: THREE.DoubleSide,
      })
    );
    const makeBfWing = (side: -1 | 1): THREE.Group => {
      const wg = new THREE.Group();
      const fore = new THREE.Mesh(bfForeWingGeo, wMat);
      fore.rotation.z = -side * Math.PI * 0.42;
      fore.rotation.x = Math.PI * 0.5;
      fore.position.z = 0.025;
      wg.add(fore);

      const hind = new THREE.Mesh(bfHindWingGeo, wMat);
      hind.rotation.z = -side * Math.PI * 0.62;
      hind.rotation.x = Math.PI * 0.5;
      hind.position.z = -0.025;
      wg.add(hind);
      return wg;
    };
    const lw = makeBfWing(-1);
    const rw = makeBfWing(1);
    bg.add(lw, rw);
    root.add(bg);
    const perchGroundY = groundHeightAt(cx, cz, 0);
    butterflies.push({
      group: bg,
      leftWing: lw,
      rightWing: rw,
      cx,
      cy,
      cz,
      rx: 1.4 + (idx % 3) * 0.65,
      rz: 1.2 + (idx % 2) * 0.7,
      speed: 0.7 + (idx % 4) * 0.22,
      phaseOffset: idx * 0.9,
      perchX: cx + (idx % 2 === 0 ? 0.35 : -0.35),
      perchY: perchGroundY + 0.52,
      perchZ: cz + (idx % 3 === 0 ? 0.25 : -0.25),
    });
  });

  // 6C. Curling White Kitchen Chimney Smoke (炊烟袅袅) rising lazily from East Wing stove roof
  const smokeGroup = new THREE.Group();
  const smokePuffGeo = trackGeo(createSoftPillowGeometry(1.0, 4.2, 0.82, 10, 8));
  const smokeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf7f4ec,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    })
  );
  const smokePuffs: SmokePuff[] = [];
  for (let i = 0; i < 12; i++) {
    const puff = new THREE.Mesh(smokePuffGeo, smokeMat);
    smokeGroup.add(puff);
    smokePuffs.push({ mesh: puff, phase: i / 12 });
  }
  root.add(smokeGroup);

  // 6D. Drifting Pink Peach-Blossom Petals (落英缤纷) floating across He-Ping in sunny weather
  const petalCount = 72;
  const petalPositions = new Float32Array(petalCount * 3);
  const petalSpeeds = new Float32Array(petalCount);
  for (let i = 0; i < petalCount; i++) {
    petalPositions[i * 3] = (Math.random() - 0.5) * 64;
    petalPositions[i * 3 + 1] = 0.5 + Math.random() * 11.5;
    petalPositions[i * 3 + 2] = 16 + Math.random() * 34;
    petalSpeeds[i] = 0.45 + Math.random() * 0.45;
  }
  const petalGeo = trackGeo(new THREE.BufferGeometry());
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPositions, 3));
  const petalMat = trackMat(
    new THREE.PointsMaterial({
      color: HANDCRAFTED_PAL.pink,
      size: 0.22,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    })
  );
  const petalPoints = new THREE.Points(petalGeo, petalMat);
  petalPoints.frustumCulled = false;
  root.add(petalPoints);

  // 6E. 28 Turned Paper Sky Lanterns (孔明灯) with Bamboo Cross-Frame & Ember Halo!
  const skyLanternGroup = new THREE.Group();
  const skyLanterns: SkyLanternItem[] = [];
  const slBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.19, -0.3],
        [0.26, -0.1],
        [0.34, 0.14],
        [0.31, 0.28],
        [0.16, 0.34],
        [0.0, 0.35],
      ],
      12
    )
  );
  const slFrameRimGeo = trackGeo(new THREE.TorusGeometry(0.19, 0.012, 5, 12));
  const slFlameGeo = trackGeo(new THREE.SphereGeometry(0.075, 7, 6));
  const slHaloGeo = trackGeo(new THREE.SphereGeometry(0.16, 8, 6));
  const slShellMatA = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffd48e,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    })
  );
  const slShellMatB = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffa66b,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    })
  );
  const slFlameMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfff8dc }));
  const slHaloMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    })
  );

  for (let i = 0; i < 28; i++) {
    const lg = new THREE.Group();
    const shell = new THREE.Mesh(slBodyGeo, i % 2 === 0 ? slShellMatA : slShellMatB);
    lg.add(shell);
    const rim = new THREE.Mesh(slFrameRimGeo, bambooPoleMat);
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = -0.295;
    lg.add(rim);
    const crossA = new THREE.Mesh(boxGeo, bambooPoleMat);
    crossA.scale.set(0.36, 0.012, 0.012);
    crossA.position.y = -0.295;
    lg.add(crossA);
    const crossB = new THREE.Mesh(boxGeo, bambooPoleMat);
    crossB.scale.set(0.012, 0.012, 0.36);
    crossB.position.y = -0.295;
    lg.add(crossB);

    const flame = new THREE.Mesh(slFlameGeo, slFlameMat);
    flame.position.y = -0.22;
    lg.add(flame);
    const halo = new THREE.Mesh(slHaloGeo, slHaloMat);
    halo.position.y = -0.18;
    lg.add(halo);

    const sc = 0.86 + (i % 4) * 0.16;
    lg.scale.setScalar(sc);
    skyLanternGroup.add(lg);
    skyLanterns.push({
      group: lg,
      baseX: Math.sin(i * 2.37) * 38,
      baseZ: 12 + Math.cos(i * 1.71) * 34,
      phase: i / 28,
      speed: 0.022 + (i % 5) * 0.004,
      swayAmp: 1.4 + (i % 3) * 0.6,
    });
  }
  skyLanternGroup.visible = false;
  root.add(skyLanternGroup);

  // =========================================================================
  // 7. ZERO-GC PER-FRAME CONTINUOUS FREE-ROAM + SOCIAL PLAY + HOME/NEST + GRAIN LOOP
  //    Strictly ZERO `visible = false` popping & ZERO teleporting across day/night/weather!
  // =========================================================================
  let fowlClock = 0;
  let craneRoostSmooth = 0;
  let butterflyPerchSmooth = 0;
  let liveGrainSpread = 1.0;
  let liveGrainBasketFill = 0.08;
  let liveGrainMatDeployed = 1.0;
  let liveFarmerHome = 0.0;
  let liveIsGathering = false;
  let lastTimeOfDay = 10.5;
  let initialized = false;

  const buildDynamicHomeRoute = (
    startX: number,
    startZ: number,
    tail: readonly PathPoint2D[]
  ): PathPoint2D[] => {
    const dest = tail[tail.length - 1];
    const fromZone = classifyZone(startX, startZ);
    const toZone = classifyZone(dest.x, dest.z);
    const bridges = computeZoneBridgeWaypoints(fromZone, toZone);
    return [{ x: startX, z: startZ }, ...bridges, ...tail];
  };

  const update = (
    dt: number,
    t: number,
    weather: WeatherMode,
    timeOfDay = 10.5,
    doumenOpen = true
  ) => {
    const b = evaluateLivingBehavior(timeOfDay, weather);
    const scrubbed = !initialized || Math.abs(timeOfDay - lastTimeOfDay) > 0.35;
    initialized = true;
    lastTimeOfDay = timeOfDay;

    // Step whole-map autonomous free-roam & social play coordinator!
    freeRoam.update(dt, doumenOpen, Math.max(0.45, b.walkSpeedScale));

    fowlClock += dt * (1 - b.waterfowlNestBlend * 0.85);
    craneRoostSmooth = scrubbed
      ? b.craneRoostBlend
      : damp(craneRoostSmooth, b.craneRoostBlend, 1.8, dt);
    butterflyPerchSmooth = scrubbed
      ? b.butterflyPerchBlend
      : damp(butterflyPerchSmooth, b.butterflyPerchBlend, 1.9, dt);

    // Progressive Grain Drying & Gathering State (continuous 0..1 on live rain/sun OR timeline scrub!)
    if (scrubbed) {
      liveGrainSpread = b.grainSpreadProgress;
      liveGrainBasketFill = b.grainBasketFill;
      liveGrainMatDeployed = b.grainMatDeployed;
      liveFarmerHome = b.farmerHomeBlend;
      liveIsGathering = b.farmerPhase === 'gathering';
    } else {
      const targetSpread = b.grainSpreadProgress;
      const targetMat = b.grainMatDeployed;
      const spreadDiff = targetSpread - liveGrainSpread;
      // Smooth progressive spreading/sweeping (~4.8s full sweep so user sees farmers gather grain!)
      const sweepRate = weather === 'rain' ? 0.24 : 0.19;
      if (Math.abs(spreadDiff) > 0.004) {
        liveGrainSpread += Math.sign(spreadDiff) * Math.min(Math.abs(spreadDiff), dt * sweepRate);
      } else {
        liveGrainSpread = targetSpread;
      }

      // Mats only roll up once grain is mostly swept (< 0.08), and unroll before grain spreads out!
      if (targetMat < 0.5 && liveGrainSpread < 0.08) {
        liveGrainMatDeployed = Math.max(targetMat, liveGrainMatDeployed - dt * 0.48);
      } else if (targetMat > 0.5) {
        liveGrainMatDeployed = Math.min(targetMat, liveGrainMatDeployed + dt * 0.55);
      } else {
        liveGrainMatDeployed = damp(liveGrainMatDeployed, targetMat, 2.2, dt);
      }

      // Basket fills inversely as grain is swept in, then empties smoothly as farmer carries inside
      const targetBasket =
        liveGrainMatDeployed < 0.15 && b.farmerHomeBlend > 0.6
          ? 0.06
          : THREE.MathUtils.clamp(0.08 + (1 - liveGrainSpread) * 0.92, 0.06, 1.0);
      liveGrainBasketFill = damp(liveGrainBasketFill, targetBasket, 3.0, dt);

      // Farmers stay by the mats actively raking until grain is gathered & mats rolled up!
      const effectiveFarmerHomeTarget =
        liveGrainSpread > 0.06 || (targetMat < 0.5 && liveGrainMatDeployed > 0.12)
          ? 0
          : b.farmerHomeBlend;
      liveFarmerHome = damp(liveFarmerHome, effectiveFarmerHomeTarget, 1.4, dt);
      liveIsGathering =
        (weather === 'rain' && liveGrainSpread > 0.02) ||
        (spreadDiff < -0.01 && liveGrainSpread > 0.02);
    }

    // -----------------------------------------------------------------------
    // 1. FREE-ROAMING VILLAGERS & CHILDREN (whole-map roam + social play + continuous room return)
    // -----------------------------------------------------------------------
    for (let i = 0; i < walkingVillagers.length; i++) {
      const v = walkingVillagers[i];
      v.group.visible = true; // Strictly NEVER vanish!

      const targetHome = v.isChild ? b.childHomeBlend : b.villagerHomeBlend;
      if (scrubbed) {
        v.homeBlendSmooth = targetHome;
        const fallbackStart = v.waypoints[0];
        if (targetHome > 0.04) {
          v.homeAnchor = { x: fallbackStart.x, z: fallbackStart.z };
          v.homeRoute = buildDynamicHomeRoute(fallbackStart.x, fallbackStart.z, [
            { x: v.homeRoom.x, z: v.homeRoom.z },
          ]);
        } else {
          v.homeAnchor = null;
          v.roamAgent.externalControl = false;
          v.roamAgent.x = fallbackStart.x;
          v.roamAgent.z = fallbackStart.z;
          v.roamAgent.waypoints = [];
          v.roamAgent.zone = classifyZone(fallbackStart.x, fallbackStart.z);
          v.roamAgent.pauseTimer = 0.25;
        }
      } else {
        v.homeBlendSmooth = damp(v.homeBlendSmooth, targetHome, 0.95, dt);
      }

      if (v.rainUmbrella) {
        v.rainUmbrella.visible = b.villagersCarryUmbrellas && v.homeBlendSmooth < 0.88;
      }

      let px: number;
      let pz: number;
      let yaw: number;
      let moveSpeed = 0;
      let socialPose = v.roamAgent.socialPose;

      if (v.homeBlendSmooth > 0.04) {
        v.roamAgent.externalControl = true;
        if (!v.homeAnchor) {
          v.homeAnchor = { x: v.roamAgent.x, z: v.roamAgent.z };
          v.homeRoute = buildDynamicHomeRoute(v.homeAnchor.x, v.homeAnchor.z, [
            { x: v.homeRoom.x, z: v.homeRoom.z },
          ]);
        }
        const sample = sampleOpenPolyline(v.homeRoute, v.homeBlendSmooth);
        px = sample.x;
        pz = sample.z;
        const atRoom = v.homeBlendSmooth > 0.96;
        yaw = atRoom ? v.homeRoom.yaw : sample.yaw;
        moveSpeed = atRoom ? 0 : 1.25;
        v.roamAgent.x = px;
        v.roamAgent.z = pz;
        v.roamAgent.yaw = yaw;
        socialPose = 'none';
      } else {
        v.roamAgent.externalControl = false;
        v.homeAnchor = null;
        px = v.roamAgent.x;
        pz = v.roamAgent.z;
        yaw = v.roamAgent.yaw;
        moveSpeed = v.roamAgent.speed;
      }

      const py = groundHeightAt(px, pz, 0);
      const isMoving = moveSpeed > 0.08;
      v.stridePhase += dt * (isMoving ? moveSpeed * (v.isChild ? 4.4 : 3.4) : 0);
      const strideAmp = isMoving ? Math.min(1, moveSpeed / (v.isChild ? 2.1 : 1.35)) : 0;
      const swing = Math.sin(v.stridePhase) * strideAmp;
      const bob = Math.abs(swing) * (v.isChild ? 0.068 : 0.036);

      v.group.position.set(px, py + bob, pz);
      v.group.rotation.y = dampAngle(v.group.rotation.y, yaw, VIRTUAL_MASS.torsoLambda, dt);

      // Articulated 2-segment legs & knees
      v.leftLeg.rotation.x = damp(v.leftLeg.rotation.x, swing * 0.48, VIRTUAL_MASS.limbLambda, dt);
      v.rightLeg.rotation.x = damp(v.rightLeg.rotation.x, -swing * 0.48, VIRTUAL_MASS.limbLambda, dt);
      v.leftKnee.rotation.x = damp(
        v.leftKnee.rotation.x,
        Math.max(0, -swing) * 0.56,
        VIRTUAL_MASS.limbLambda,
        dt
      );
      v.rightKnee.rotation.x = damp(
        v.rightKnee.rotation.x,
        Math.max(0, swing) * 0.56,
        VIRTUAL_MASS.limbLambda,
        dt
      );

      // Expressive arms, elbows & social/play gestures!
      const holdingUmb = Boolean(v.hasUmbrella || (v.rainUmbrella && v.rainUmbrella.visible));
      let targetLeftArmX = -swing * 0.42;
      let targetRightArmX = holdingUmb ? -0.68 : v.carryPole ? -0.78 : v.pinwheel ? -0.9 : swing * 0.42;
      let targetLeftElbowX = -0.18 - Math.max(0, swing) * 0.34;
      let targetRightElbowX = holdingUmb || v.carryPole || v.pinwheel ? -0.32 : -0.18 - Math.max(0, -swing) * 0.34;
      let targetTorsoX = isMoving ? 0.06 * strideAmp : Math.sin(t * 1.4 + v.phaseOffset) * 0.015;
      let targetHeadY = Math.sin(t * 1.2 + v.phaseOffset * 6) * 0.16;

      if (socialPose === 'pet_dog') {
        // Warmly bends slightly forward and pats/waves at the playful village dog!
        targetTorsoX = 0.24;
        targetLeftArmX = -0.72 + Math.sin(t * 6.5 + v.phaseOffset) * 0.22;
        targetLeftElbowX = -0.45;
        if (!holdingUmb && !v.carryPole) {
          targetRightArmX = -0.64 + Math.cos(t * 6.5 + v.phaseOffset) * 0.18;
          targetRightElbowX = -0.42;
        }
        targetHeadY = Math.sin(t * 2.4) * 0.12;
      } else if (socialPose === 'chat') {
        // Animated conversational hand gestures while greeting a neighbor
        targetLeftArmX = -0.42 + Math.sin(t * 3.4 + v.phaseOffset) * 0.22;
        targetLeftElbowX = -0.58;
        if (!holdingUmb && !v.carryPole) {
          targetRightArmX = -0.38 + Math.cos(t * 2.9 + v.phaseOffset) * 0.2;
          targetRightElbowX = -0.52;
        }
        targetHeadY = Math.sin(t * 2.2 + v.phaseOffset) * 0.2;
      } else if (socialPose === 'chase_play') {
        // Joyful raised arms & energetic play bounce!
        targetTorsoX = 0.14;
        targetLeftArmX = -0.58 + Math.sin(t * 8.5 + v.phaseOffset) * 0.35;
        targetLeftElbowX = -0.48;
      }

      v.torso.rotation.x = damp(v.torso.rotation.x, targetTorsoX, VIRTUAL_MASS.torsoLambda, dt);
      v.leftArm.rotation.x = damp(v.leftArm.rotation.x, targetLeftArmX, VIRTUAL_MASS.limbLambda, dt);
      v.rightArm.rotation.x = damp(v.rightArm.rotation.x, targetRightArmX, VIRTUAL_MASS.limbLambda, dt);
      v.leftElbow.rotation.x = damp(v.leftElbow.rotation.x, targetLeftElbowX, VIRTUAL_MASS.limbLambda, dt);
      v.rightElbow.rotation.x = damp(v.rightElbow.rotation.x, targetRightElbowX, VIRTUAL_MASS.limbLambda, dt);
      v.head.rotation.y = damp(v.head.rotation.y, targetHeadY, VIRTUAL_MASS.headLambda, dt);

      // Spring-driven secondary waist sash tail sway
      const sashSwing = v.sashSpring.step(
        (isMoving ? -0.18 - strideAmp * 0.25 : 0) + Math.sin(t * 2.2 + v.phaseOffset) * 0.05,
        dt
      );
      v.sashTailL.rotation.x = sashSwing;
      v.sashTailR.rotation.x = sashSwing * 0.84;

      if (v.carryPole) {
        v.carryPole.rotation.z = swing * 0.055;
      }
      if (v.pinwheel) {
        v.pinwheel.rotation.z += dt * (isMoving ? 10.5 : 4.2);
      }
    }

    // -----------------------------------------------------------------------
    // 2. STORYTELLING VILLAGERS (Farmers, Washers, Elders, Tea, Worshipper, Huatai)
    //    Walk smoothly along doorway-respecting homeRoutes into interior rooms — ZERO popping!
    // -----------------------------------------------------------------------
    for (let i = 0; i < idleVillagers.length; i++) {
      const iv = idleVillagers[i];
      iv.group.visible = true; // Strictly NEVER vanish!
      const ph = t + iv.phaseOffset;

      let targetBlend = 0;
      if (iv.kind === 'rake') targetBlend = liveFarmerHome;
      else if (iv.kind === 'wash') targetBlend = b.washHomeBlend;
      else if (iv.kind === 'fan' || iv.kind === 'chat') targetBlend = b.elderHomeBlend;
      else if (iv.kind === 'tea') targetBlend = b.teaHomeBlend;
      else if (iv.kind === 'bow') targetBlend = b.worshipHomeBlend;
      else if (iv.kind === 'tend') targetBlend = b.huataiHomeBlend;

      iv.homeBlendSmooth = scrubbed
        ? targetBlend
        : damp(iv.homeBlendSmooth, targetBlend, 1.25, dt);

      const hb = iv.homeBlendSmooth;
      const inTransit = hb > 0.03 && hb < 0.97;
      const atHome = hb >= 0.97;

      const sample = sampleOpenPolyline(iv.homeRoute, hb);
      const px = sample.x;
      const pz = sample.z;
      const targetYaw = hb < 0.03 ? iv.baseYaw : atHome ? iv.homeYaw : sample.yaw;
      iv.curX = px;
      iv.curZ = pz;
      iv.curYaw = targetYaw;

      const py = groundHeightAt(px, pz, iv.kind === 'bow' ? 0.85 : iv.kind === 'tend' ? 1.0 : 0);
      if (inTransit) {
        iv.stridePhase += dt * 5.6;
      }
      const walkSwing = inTransit ? Math.sin(iv.stridePhase) : 0;
      const walkBob = inTransit ? Math.abs(walkSwing) * 0.036 : 0;
      const yOffset = iv.kind === 'wash' && hb < 0.03 ? -0.06 : 0;

      iv.group.position.set(px, py + yOffset + walkBob, pz);
      iv.group.rotation.y = dampAngle(iv.group.rotation.y, targetYaw, VIRTUAL_MASS.torsoLambda, dt);

      // Smooth stand-up transition for seated villagers (tea guests, elders, washers) when walking home!
      const isSeatedRole = Boolean(iv.group.userData.seated);
      const rigObj = iv.group.userData.rig as THREE.Group | undefined;
      const rigScale = (iv.group.userData.rigScale as number | undefined) ?? 1;
      const sitBlend = isSeatedRole ? THREE.MathUtils.clamp(1.0 - hb / 0.12, 0, 1) : 0;
      if (rigObj) {
        const targetRigY = -0.21 * rigScale * sitBlend;
        rigObj.position.y = scrubbed ? targetRigY : damp(rigObj.position.y, targetRigY, 10, dt);
      }

      if (sitBlend > 0.05) {
        const hipSit = -Math.PI * 0.46 * sitBlend;
        const kneeSit = Math.PI * 0.46 * sitBlend;
        iv.leftLeg.rotation.x = scrubbed ? hipSit : damp(iv.leftLeg.rotation.x, hipSit, VIRTUAL_MASS.limbLambda, dt);
        iv.rightLeg.rotation.x = scrubbed ? hipSit : damp(iv.rightLeg.rotation.x, hipSit, VIRTUAL_MASS.limbLambda, dt);
        iv.leftKnee.rotation.x = scrubbed ? kneeSit : damp(iv.leftKnee.rotation.x, kneeSit, VIRTUAL_MASS.limbLambda, dt);
        iv.rightKnee.rotation.x = scrubbed ? kneeSit : damp(iv.rightKnee.rotation.x, kneeSit, VIRTUAL_MASS.limbLambda, dt);
      } else if (inTransit) {
        iv.leftLeg.rotation.x = damp(iv.leftLeg.rotation.x, walkSwing * 0.44, VIRTUAL_MASS.limbLambda, dt);
        iv.rightLeg.rotation.x = damp(iv.rightLeg.rotation.x, -walkSwing * 0.44, VIRTUAL_MASS.limbLambda, dt);
        iv.leftKnee.rotation.x = damp(iv.leftKnee.rotation.x, Math.max(0, -walkSwing) * 0.5, VIRTUAL_MASS.limbLambda, dt);
        iv.rightKnee.rotation.x = damp(iv.rightKnee.rotation.x, Math.max(0, walkSwing) * 0.5, VIRTUAL_MASS.limbLambda, dt);
      } else {
        iv.leftLeg.rotation.x = damp(iv.leftLeg.rotation.x, 0, VIRTUAL_MASS.limbLambda, dt);
        iv.rightLeg.rotation.x = damp(iv.rightLeg.rotation.x, 0, VIRTUAL_MASS.limbLambda, dt);
        iv.leftKnee.rotation.x = damp(iv.leftKnee.rotation.x, 0, VIRTUAL_MASS.limbLambda, dt);
        iv.rightKnee.rotation.x = damp(iv.rightKnee.rotation.x, 0, VIRTUAL_MASS.limbLambda, dt);
      }

      const sashSwing = iv.sashSpring.step(inTransit ? -0.26 : Math.sin(ph * 1.4) * 0.04, dt);
      iv.sashTailL.rotation.x = sashSwing;
      iv.sashTailR.rotation.x = sashSwing * 0.85;

      if (iv.ripple) {
        iv.ripple.visible = hb < 0.06;
      }

      if (inTransit) {
        iv.torso.rotation.x = damp(iv.torso.rotation.x, 0.06, VIRTUAL_MASS.torsoLambda, dt);
        iv.leftArm.rotation.set(damp(iv.leftArm.rotation.x, -walkSwing * 0.4, 12, dt), 0, 0);
        iv.rightArm.rotation.set(damp(iv.rightArm.rotation.x, walkSwing * 0.4, 12, dt), 0, 0);
        iv.leftElbow.rotation.x = damp(iv.leftElbow.rotation.x, -0.25, 12, dt);
        iv.rightElbow.rotation.x = damp(iv.rightElbow.rotation.x, -0.25, 12, dt);
        iv.head.rotation.set(0, Math.sin(ph * 1.1) * 0.14, 0);
        if (iv.rakeGroup) iv.rakeGroup.visible = true;
        continue;
      }

      if (atHome) {
        // Resting calmly inside their room!
        iv.torso.rotation.x = damp(iv.torso.rotation.x, Math.sin(ph * 0.7) * 0.025, 6, dt);
        iv.leftArm.rotation.set(damp(iv.leftArm.rotation.x, -0.08, 8, dt), 0, 0);
        iv.rightArm.rotation.set(damp(iv.rightArm.rotation.x, -0.08, 8, dt), 0, 0);
        iv.leftElbow.rotation.x = damp(iv.leftElbow.rotation.x, -0.18, 8, dt);
        iv.rightElbow.rotation.x = damp(iv.rightElbow.rotation.x, -0.18, 8, dt);
        iv.head.rotation.set(0.05, Math.sin(ph * 0.6) * 0.12, 0);
        if (iv.rakeGroup) iv.rakeGroup.visible = false;
        continue;
      }

      // Active daytime storytelling animations!
      switch (iv.kind) {
        case 'rake': {
          if (iv.rakeGroup) iv.rakeGroup.visible = true;
          if (liveIsGathering || b.farmerPhase === 'gathering') {
            // Urgent sweeping & gathering rice inward toward center mound & baskets!
            const rush = Math.sin(ph * 5.6);
            iv.torso.rotation.x = 0.25 + rush * 0.08;
            iv.rightArm.rotation.set(-0.68 + rush * 0.22, -0.08, 0.08);
            iv.leftArm.rotation.set(-0.62 + rush * 0.2, 0.36, -0.16);
            iv.rightElbow.rotation.x = -0.34 - Math.max(0, rush) * 0.22;
            iv.leftElbow.rotation.x = -0.34 - Math.max(0, rush) * 0.22;
            iv.head.rotation.set(0.24, Math.sin(ph * 2.8) * 0.18, 0);
          } else {
            // Rhythmic morning spreading or midday sunny grain turning
            const rate = b.farmerPhase === 'spreading' ? 3.8 : 2.4;
            const stroke = Math.sin(ph * rate);
            iv.torso.rotation.x = 0.16 + stroke * 0.06;
            iv.rightArm.rotation.set(-0.62 + stroke * 0.16, -0.06, 0.06);
            iv.leftArm.rotation.set(-0.56 + stroke * 0.14, 0.34, -0.14);
            iv.rightElbow.rotation.x = -0.26 - stroke * 0.12;
            iv.leftElbow.rotation.x = -0.26 - stroke * 0.12;
            iv.head.rotation.set(0.18, Math.sin(ph * 1.2) * 0.12, 0);
          }
          break;
        }
        case 'wash': {
          const scrub = Math.sin(ph * 4.2);
          iv.torso.rotation.x = 0.32 + scrub * 0.08;
          iv.leftArm.rotation.x = -0.78 + scrub * 0.24;
          iv.rightArm.rotation.x = -0.78 - scrub * 0.24;
          iv.leftElbow.rotation.x = -0.42;
          iv.rightElbow.rotation.x = -0.42;
          if (iv.ripple) {
            const rCycle = (t * 0.65 + iv.phaseOffset * 0.3) % 1;
            const sc = 0.6 + rCycle * 2.6;
            iv.ripple.scale.set(sc, 1, sc);
            (iv.ripple.material as THREE.MeshBasicMaterial).opacity = (1 - rCycle) * 0.55;
          }
          break;
        }
        case 'fan': {
          const fanSpeed = b.weather === 'rain' || b.isNight ? 1.4 : 4.8;
          iv.rightArm.rotation.set(-0.82, 0, -0.15 + Math.sin(ph * fanSpeed) * (b.isNight ? 0.08 : 0.28));
          iv.rightElbow.rotation.x = -0.35;
          iv.head.rotation.set(0, 0.15 + Math.sin(ph * 1.1) * 0.16, 0);
          break;
        }
        case 'chat': {
          iv.head.rotation.set(Math.sin(ph * 2.2) * 0.1, -0.15 + Math.sin(ph * 1.0) * 0.14, 0);
          iv.leftArm.rotation.x = -0.35 + Math.sin(ph * 1.8) * 0.14;
          iv.leftElbow.rotation.x = -0.48;
          break;
        }
        case 'tea': {
          const sip = Math.max(0, Math.sin(ph * 0.85));
          iv.rightArm.rotation.x = -0.35 - sip * 0.55;
          iv.rightElbow.rotation.x = -0.45 - sip * 0.32;
          iv.head.rotation.set(sip * 0.16, 0, 0);
          break;
        }
        case 'bow': {
          const bowCycle = Math.max(0, Math.sin(ph * 0.9));
          iv.torso.rotation.x = bowCycle * 0.32;
          iv.leftArm.rotation.x = -0.75;
          iv.rightArm.rotation.x = -0.75;
          iv.leftElbow.rotation.x = -0.5;
          iv.rightElbow.rotation.x = -0.5;
          break;
        }
        case 'tend': {
          iv.rightArm.rotation.x = -0.45 + Math.sin(ph * 2.1) * 0.25;
          iv.rightElbow.rotation.x = -0.38;
          iv.head.rotation.set(0.12, Math.sin(ph * 1.2) * 0.22, 0);
          break;
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. POULTRY (Whole-map free-roam + flock pecking -> walk continuously into Chicken Coop!)
    // -----------------------------------------------------------------------
    for (let i = 0; i < poultryList.length; i++) {
      const p = poultryList[i];
      p.group.visible = true;
      p.coopBlendSmooth = scrubbed
        ? b.poultryCoopBlend
        : damp(p.coopBlendSmooth, b.poultryCoopBlend, 1.1, dt);
      const cb = p.coopBlendSmooth;

      let tx: number;
      let tz: number;
      let yaw: number;
      let activeForaging = cb < 0.06;

      if (p.isChick && p.leaderIdx !== undefined) {
        const mom = poultryList[p.leaderIdx];
        const a = t * 1.2 + p.phaseOffset * 2.3;
        const spreadR = THREE.MathUtils.lerp(0.62, 0.24, cb);
        tx = mom.group.position.x + Math.cos(a) * spreadR;
        tz = mom.group.position.z + Math.sin(a) * spreadR;
        yaw = Math.atan2(mom.group.position.x - tx, mom.group.position.z - tz);
      } else if (p.roamAgent) {
        if (cb > 0.04) {
          p.roamAgent.externalControl = true;
          if (!p.homeAnchor || scrubbed) {
            p.homeAnchor = scrubbed
              ? { x: p.baseX, z: p.baseZ }
              : { x: p.roamAgent.x, z: p.roamAgent.z };
          }
          const route = buildDynamicHomeRoute(p.homeAnchor.x, p.homeAnchor.z, [
            { x: p.coopTarget.entryX, z: p.coopTarget.entryZ },
            { x: p.coopTarget.x, z: p.coopTarget.z },
          ]);
          const sample = sampleOpenPolyline(route, cb);
          tx = sample.x;
          tz = sample.z;
          yaw = cb > 0.94 ? Math.PI * 0.25 : sample.yaw;
          p.roamAgent.x = tx;
          p.roamAgent.z = tz;
          p.roamAgent.yaw = yaw;
        } else {
          if (scrubbed) {
            p.roamAgent.x = p.baseX;
            p.roamAgent.z = p.baseZ;
            p.roamAgent.waypoints = [];
            p.roamAgent.zone = classifyZone(p.baseX, p.baseZ);
            p.roamAgent.pauseTimer = 0.25;
          }
          p.roamAgent.externalControl = false;
          p.homeAnchor = null;
          tx = p.roamAgent.x;
          tz = p.roamAgent.z;
          yaw = p.roamAgent.yaw;
        }
      } else {
        tx = p.baseX;
        tz = p.baseZ;
        yaw = 0;
      }

      const py = groundHeightAt(tx, tz, 0);
      const coopPerchLift = cb > 0.92 ? 0.14 * ((cb - 0.92) / 0.08) : 0;
      const hop =
        activeForaging && p.isChick
          ? Math.abs(Math.sin(t * 7.5 + p.phaseOffset * 4)) * 0.068
          : 0;
      p.group.position.set(tx, py + hop + coopPerchLift, tz);
      p.group.rotation.y = dampAngle(p.group.rotation.y, yaw, 9.0, dt);

      if (cb > 0.92) {
        // Roosting calmly inside timber chicken coop
        p.body.position.y = -0.04;
        p.body.rotation.x = 0.08;
        p.head.rotation.x = 0.28 + Math.sin(t * 1.1 + p.phaseOffset) * 0.04;
      } else {
        const isFlockPeck = p.roamAgent?.socialPose === 'flock_peck';
        const peckFreq = isFlockPeck ? 4.8 : 3.1;
        const peck = Math.max(0, Math.sin(t * peckFreq + p.phaseOffset * 5) - 0.52) * 1.45;
        p.body.position.y = 0;
        p.body.rotation.x = peck * 0.5;
        p.head.rotation.x = peck * 0.62;
      }
    }

    // -----------------------------------------------------------------------
    // 4. POND WATERFOWL (Swim freely -> glide smoothly into Shoreline Reed Nests!)
    // -----------------------------------------------------------------------
    for (let i = 0; i < waterfowlList.length; i++) {
      const wf = waterfowlList[i];
      wf.group.visible = true;
      wf.nestBlendSmooth = scrubbed
        ? b.waterfowlNestBlend
        : damp(wf.nestBlendSmooth, b.waterfowlNestBlend, 1.0, dt);
      const nb = wf.nestBlendSmooth;

      const sample = samplePondSwimPath(
        wf.cx,
        wf.cz,
        wf.rx,
        wf.rz,
        fowlClock * wf.speed + wf.phaseOffset,
        wf.dir
      );
      const wx = THREE.MathUtils.lerp(sample.x, wf.nestX, nb);
      const wz = THREE.MathUtils.lerp(sample.z, wf.nestZ, nb);
      const swimToNestYaw = Math.atan2(wf.nestX - sample.x, wf.nestZ - sample.z);
      const targetYaw = nb < 0.08 ? sample.yaw : nb > 0.92 ? wf.nestYaw : swimToNestYaw;
      const bob = Math.sin(t * THREE.MathUtils.lerp(2.6, 1.2, nb) + wf.phaseOffset * 3) * THREE.MathUtils.lerp(0.024, 0.008, nb);

      wf.group.position.set(wx, -0.2 + bob + nb * 0.06, wz);
      wf.group.rotation.y = dampAngle(wf.group.rotation.y, targetYaw, 5.0, dt);

      if (nb > 0.85) {
        wf.neck.rotation.x = 0.28 + Math.sin(t * 0.8 + wf.phaseOffset) * 0.04;
        wf.wake.scale.set(0.55, 1, 0.55);
      } else {
        const dip = Math.max(0, Math.sin(t * 1.1 + wf.phaseOffset * 5) - 0.75) * 1.5;
        wf.neck.rotation.x = dip * 0.45;
        const wCycle = (t * 0.55 + wf.phaseOffset) % 1;
        const wScale = 0.85 + wCycle * 1.35;
        wf.wake.scale.set(wScale, 1, wScale);
      }
    }

    // -----------------------------------------------------------------------
    // 5. DOMESTIC ANIMALS (Whole-map free-roam + dog/human play -> continuous shelter return!)
    // -----------------------------------------------------------------------
    for (let i = 0; i < quadrupeds.length; i++) {
      const q = quadrupeds[i];
      q.group.visible = true;
      const ph = t + q.phaseOffset;

      const targetHome =
        q.kind === 'dog_patrol' || q.kind === 'puppy_hop'
          ? b.dogKennelBlend
          : q.kind === 'cat_loaf'
            ? b.catNestBlend
            : b.livestockShedBlend;

      if (scrubbed) {
        q.homeBlendSmooth = targetHome;
        if (targetHome > 0.04) {
          q.homeAnchor = { x: q.baseX, z: q.baseZ };
          q.homeRoute = buildDynamicHomeRoute(q.baseX, q.baseZ, q.homeRouteTail);
        } else {
          q.homeAnchor = null;
          q.roamAgent.externalControl = false;
          q.roamAgent.x = q.baseX;
          q.roamAgent.z = q.baseZ;
          q.roamAgent.waypoints = [];
          q.roamAgent.zone = classifyZone(q.baseX, q.baseZ);
          q.roamAgent.pauseTimer = 0.2;
        }
      } else {
        q.homeBlendSmooth = damp(q.homeBlendSmooth, targetHome, 1.0, dt);
      }

      const hb = q.homeBlendSmooth;
      let px: number;
      let pz: number;
      let yaw: number;
      let speed = 0;
      let socialPose = q.roamAgent.socialPose;

      if (hb > 0.04) {
        q.roamAgent.externalControl = true;
        if (!q.homeAnchor) {
          q.homeAnchor = { x: q.roamAgent.x, z: q.roamAgent.z };
          q.homeRoute = buildDynamicHomeRoute(q.homeAnchor.x, q.homeAnchor.z, q.homeRouteTail);
        }
        const sample = sampleOpenPolyline(q.homeRoute, hb);
        px = sample.x;
        pz = sample.z;
        const settled = hb > 0.95;
        yaw = settled ? q.homeYaw : sample.yaw;
        speed = settled ? 0 : q.roamAgent.profile.speed;
        q.roamAgent.x = px;
        q.roamAgent.z = pz;
        q.roamAgent.yaw = yaw;
        socialPose = 'none';
      } else {
        q.roamAgent.externalControl = false;
        q.homeAnchor = null;
        px = q.roamAgent.x;
        pz = q.roamAgent.z;
        yaw = q.roamAgent.yaw;
        speed = q.roamAgent.speed;
      }

      const groundY = groundHeightAt(px, pz, 0);
      const settled = hb > 0.95;
      const isMoving = speed > 0.06;
      q.gaitPhase += dt * (isMoving ? speed * (q.kind === 'buffalo' ? 3.2 : 5.6) : 0);
      const trot = isMoving ? Math.sin(q.gaitPhase) : 0;

      if (q.kind === 'dog_patrol' || q.kind === 'puppy_hop') {
        const playing = socialPose === 'dog_play' || socialPose === 'chase_play';
        const hopBoost =
          playing
            ? Math.abs(Math.sin(t * 9.5 + q.phaseOffset)) * (q.kind === 'puppy_hop' ? 0.14 : 0.08)
            : isMoving
              ? Math.abs(trot) * 0.045
              : 0;
        const restSink = settled ? (q.kind === 'puppy_hop' ? -0.07 : -0.14) : 0;
        q.group.position.set(px, groundY + hopBoost + restSink, pz);
        q.group.rotation.y = dampAngle(q.group.rotation.y, yaw, 9.5, dt);
        q.tail.rotation.z = Math.sin(t * (playing ? 18.0 : settled ? 1.8 : 10.5)) * (playing ? 0.62 : settled ? 0.08 : 0.4);
        q.head.rotation.y = Math.sin(t * (playing ? 3.6 : 1.6) + q.phaseOffset) * (settled ? 0.06 : 0.22);
        q.head.rotation.x = settled ? 0.24 : playing ? -0.14 : 0;
        if (q.legs.length === 4) {
          const legAmp = settled ? 0 : isMoving ? 0.48 : 0;
          q.legs[0].rotation.x = trot * legAmp;
          q.legs[1].rotation.x = -trot * legAmp;
          q.legs[2].rotation.x = -trot * legAmp;
          q.legs[3].rotation.x = trot * legAmp;
        }
      } else if (q.kind === 'cat_loaf') {
        const stepHop = isMoving ? Math.abs(trot) * 0.025 : 0;
        const nestLift = settled ? 0.09 : 0;
        q.group.position.set(px, groundY + stepHop + nestLift, pz);
        q.group.rotation.y = dampAngle(q.group.rotation.y, yaw, 7.0, dt);
        q.tail.rotation.y = Math.sin(ph * (settled ? 0.8 : isMoving ? 4.2 : 2.2)) * (settled ? 0.1 : 0.34);
        q.head.rotation.y = Math.sin(ph * 0.8) * (settled ? 0.06 : 0.22);
      } else if (q.kind === 'buffalo') {
        const restSink = settled ? -0.24 : 0;
        q.group.position.set(px, groundY + restSink, pz);
        q.group.rotation.y = dampAngle(q.group.rotation.y, yaw, 3.2, dt);
        q.head.rotation.x = settled ? 0.34 : isMoving ? 0.12 : 0.28 + Math.sin(ph * 1.2) * 0.14;
        q.head.rotation.y = settled ? 0 : Math.sin(ph * 0.45) * 0.15;
        q.tail.rotation.z = Math.sin(ph * (settled ? 1.0 : 2.6)) * (settled ? 0.08 : 0.24);
        if (q.legs.length === 4) {
          const legAmp = isMoving && !settled ? 0.28 : 0;
          q.legs[0].rotation.x = trot * legAmp;
          q.legs[1].rotation.x = -trot * legAmp;
          q.legs[2].rotation.x = -trot * legAmp;
          q.legs[3].rotation.x = trot * legAmp;
        }
      } else if (q.kind === 'goat') {
        const restSink = settled ? -0.14 : 0;
        q.group.position.set(px, groundY + restSink, pz);
        q.group.rotation.y = dampAngle(q.group.rotation.y, yaw, 5.5, dt);
        q.head.rotation.x = settled ? 0.26 : isMoving ? 0.1 : 0.38 + Math.sin(ph * 1.9) * 0.2;
        q.tail.rotation.z = Math.sin(ph * (settled ? 1.4 : 5.2)) * (settled ? 0.06 : 0.25);
        if (q.legs.length === 4) {
          const legAmp = isMoving && !settled ? 0.36 : 0;
          q.legs[0].rotation.x = trot * legAmp;
          q.legs[1].rotation.x = -trot * legAmp;
          q.legs[2].rotation.x = -trot * legAmp;
          q.legs[3].rotation.x = trot * legAmp;
        }
      }
    }

    // -----------------------------------------------------------------------
    // 6. WHITE CRANES: Soar over valley -> descend continuously onto their 6 Treetop Twig Nests!
    // -----------------------------------------------------------------------
    for (let i = 0; i < cranes.length; i++) {
      const c = cranes[i];
      const f = sampleFlockOrbit(c.cx, c.cz, c.rx, c.rz, c.alt, t * c.speed + c.phaseOffset);
      const rb = craneRoostSmooth;
      const cx = THREE.MathUtils.lerp(f.x, c.roostX, rb);
      const cy = THREE.MathUtils.lerp(f.y, c.roostY, rb);
      const cz = THREE.MathUtils.lerp(f.z, c.roostZ, rb);
      c.group.position.set(cx, cy, cz);

      const yawDiff = Math.atan2(Math.sin(c.roostYaw - f.yaw), Math.cos(c.roostYaw - f.yaw));
      const yaw = f.yaw + yawDiff * rb;
      const bank = -f.bank * (1 - rb);
      c.group.rotation.set(0, yaw, bank);

      const flap = Math.sin(t * 4.4 + c.phaseOffset * 12) * 0.46 * (1 - rb);
      const folded = 1.02 * rb;
      c.leftWing.rotation.z = flap + folded;
      c.rightWing.rotation.z = -flap - folded;
    }

    // -----------------------------------------------------------------------
    // 7. BUTTERFLIES: Flutter over flowers -> glide down & fold wings on shrub perches (ZERO vanish!)
    // -----------------------------------------------------------------------
    for (let i = 0; i < butterflies.length; i++) {
      const bf = butterflies[i];
      bf.group.visible = true;
      const pb = butterflyPerchSmooth;
      const a = t * bf.speed + bf.phaseOffset;
      const fx = bf.cx + Math.cos(a) * bf.rx;
      const fy = bf.cy + Math.sin(a * 2.3) * 0.35;
      const fz = bf.cz + Math.sin(a * 1.3) * bf.rz;

      bf.group.position.set(
        THREE.MathUtils.lerp(fx, bf.perchX, pb),
        THREE.MathUtils.lerp(fy, bf.perchY, pb),
        THREE.MathUtils.lerp(fz, bf.perchZ, pb)
      );
      bf.group.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a * 1.3));
      const flap = Math.sin(t * 16.0 + bf.phaseOffset * 8) * 0.85 * (1 - pb);
      const fold = 1.32 * pb; // wings fold upright when resting on leaves
      bf.leftWing.rotation.y = flap + fold;
      bf.rightWing.rotation.y = -flap - fold;
    }

    // 8. Curling Kitchen Chimney Smoke (peaks during Hakka meal cooking hours)
    smokeGroup.visible = b.chimneySmokeActive;
    if (b.chimneySmokeActive) {
      for (let i = 0; i < smokePuffs.length; i++) {
        const sp = smokePuffs[i];
        const life = (t * 0.14 + sp.phase) % 1;
        sp.mesh.position.set(
          15.2 + Math.sin(life * 4.5 + t * 0.5) * (0.4 + life * 1.8) + life * 2.2,
          5.4 + life * 8.2,
          6.2 + Math.cos(life * 3.8 + t * 0.4) * (0.3 + life * 1.2) - life * 1.4
        );
        const sc = 0.22 + life * 1.15;
        sp.mesh.scale.set(sc * 1.15, sc * 0.82, sc);
      }
    }

    // 9. Drifting Peach-Blossom Petals (sunny daylight)
    petalPoints.visible = b.petalsActive;
    if (petalPoints.visible) {
      const attr = petalGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < petalCount; i++) {
        let px = attr.getX(i) + Math.sin(t * 0.9 + i) * dt * 0.85 + dt * 0.42;
        let py = attr.getY(i) - dt * petalSpeeds[i];
        let pz = attr.getZ(i) + Math.cos(t * 0.7 + i * 1.3) * dt * 0.35;
        if (py < 0.25) {
          py = 10.5 + (i % 4);
          px = ((i * 19.3) % 62) - 31;
          pz = 18 + ((i * 13.7) % 30);
        }
        if (px > 34) px = -32;
        attr.setXYZ(i, px, py, pz);
      }
      attr.needsUpdate = true;
    }

    // 10. Rising Warm Paper Sky Lanterns (clear night)
    skyLanternGroup.visible = b.skyLanternsActive;
    if (skyLanternGroup.visible) {
      for (let i = 0; i < skyLanterns.length; i++) {
        const sl = skyLanterns[i];
        const lift = (t * sl.speed + sl.phase) % 1;
        sl.group.position.set(
          sl.baseX + Math.sin(t * 0.5 + i) * sl.swayAmp,
          4.5 + lift * 38.0,
          sl.baseZ + Math.cos(t * 0.42 + i * 1.3) * sl.swayAmp
        );
        sl.group.rotation.y = t * 0.25 + i;
      }
    }
  };

  const getGrainLiveState = (): GrainLiveState => ({
    spread: liveGrainSpread,
    basketFill: liveGrainBasketFill,
    matDeployed: liveGrainMatDeployed,
    isGathering: liveIsGathering,
  });

  const getMinimapBlips = (): MinimapBlip[] => {
    const blips = freeRoam.getMinimapBlips();
    // Also include live positions of the storytelling villagers so every villager appears on the GTA minimap!
    for (let i = 0; i < idleVillagers.length; i++) {
      const iv = idleVillagers[i];
      blips.push({
        id: iv.id,
        x: iv.curX,
        z: iv.curZ,
        yaw: iv.curYaw,
        kind: 'villager',
        playing: false,
      });
    }
    return blips;
  };

  return {
    root,
    update,
    getGrainLiveState,
    getMinimapBlips,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
