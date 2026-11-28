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
  sampleClosedLoopPath,
  sampleFlockOrbit,
  samplePondSwimPath,
  type PathPoint2D,
} from './livingPaths';
import {
  createCuppedPetalGeometry,
  createSoftPillowGeometry,
  createTaperedCurveGeometry,
  createTurnedLatheGeometry,
} from './sculptHelpers';

import { evaluateLivingBehavior } from './livingBehavior';

export interface LivingWorldRefs {
  root: THREE.Group;
  update: (dt: number, t: number, weather: WeatherMode, timeOfDay?: number) => void;
  dispose: () => void;
}

interface WalkingVillagerAnim {
  group: THREE.Group;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  head: THREE.Object3D;
  waypoints: readonly PathPoint2D[];
  speed: number;
  phaseOffset: number;
  carryPole?: THREE.Object3D;
  pinwheel?: THREE.Object3D;
  hasUmbrella?: boolean;
  rainUmbrella?: THREE.Group;
  isChild?: boolean;
}

interface IdleVillagerAnim {
  group: THREE.Group;
  head: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  torso: THREE.Object3D;
  kind: 'rake' | 'wash' | 'fan' | 'chat' | 'tea' | 'bow' | 'tend';
  phaseOffset: number;
  ripple?: THREE.Mesh;
  rakeGroup?: THREE.Group;
  baseX: number;
  baseZ: number;
  baseYaw: number;
  shelterX?: number;
  shelterZ?: number;
  shelterYaw?: number;
}

interface PoultryAnim {
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
}

interface QuadrupedAnim {
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

  // Woven Hakka linen/cotton fabric with physical micro-fiber sheen (Pillar 2)
  const clothMat = (hex: number, sheenHex: number, rough = 0.84): THREE.MeshStandardMaterial => {
    const m = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: hex,
        normalMap: woodMicro.normal,
        normalScale: new THREE.Vector2(0.12, 0.12),
        roughnessMap: woodMicro.roughness,
        roughness: rough,
        metalness: 0.0,
        sheen: 0.48,
        sheenRoughness: 0.72,
        sheenColor: new THREE.Color(sheenHex),
      })
    );
    return m;
  };

  // Warm woodcarved skin with soft Subsurface Scattering (SSS) wrap translucency
  const skinMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: HANDCRAFTED_PAL.skin,
        normalMap: woodMicro.normal,
        normalScale: new THREE.Vector2(0.08, 0.08),
        roughness: 0.66,
        metalness: 0.0,
      })
    ),
    {
      key: 'villager_skin',
      tintHex: 0xf8ad8a,
      backStrength: 0.34,
      wrapStrength: 0.26,
      power: 2.8,
    }
  );
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
  const inkMat = woodPaintMat(HANDCRAFTED_PAL.ink, 0.42);
  const eyeHighlightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const hairDarkMat = woodPaintMat(0x232632, 0.58);
  const hairSilverMat = woodPaintMat(0xe2ddd2, 0.68);
  const strawMat = woodPaintMat(0xe8cb82, 0.82);
  const strawRimMat = woodPaintMat(0xc8a35a, 0.78);
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

  // Turned woodcarving villager geometries
  const robeGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.01, -0.02],
        [0.29, -0.02],
        [0.275, 0.08],
        [0.24, 0.24],
        [0.225, 0.38],
        [0.235, 0.54],
        [0.19, 0.62],
        [0.125, 0.65],
        [0.0, 0.65],
      ],
      16
    )
  );
  const sleeveGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.068, 0.0],
        [0.082, -0.08],
        [0.074, -0.26],
        [0.088, -0.4],
        [0.04, -0.42],
      ],
      12
    )
  );
  const headGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.185],
        [0.09, -0.172],
        [0.155, -0.12],
        [0.184, -0.02],
        [0.182, 0.085],
        [0.145, 0.16],
        [0.075, 0.195],
        [0.0, 0.205],
      ],
      16
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
    leftHandSocket: THREE.Group;
    rightHandSocket: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
  }

  const createVillager = (spec: VillagerSpec): BuiltVillager => {
    const sc = spec.scale ?? 1.0;
    const g = new THREE.Group();
    addShadowDisc(g, 0.36 * sc, 0.34 * sc);

    const rig = new THREE.Group();
    rig.scale.setScalar(sc);
    g.add(rig);

    const hipY = spec.seated ? 0.45 : 0.66;

    // Articulated standing OR true bent-knee seated legs (no diagonal poking!)
    const makeLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.105, hipY, 0);

      if (spec.seated) {
        // Horizontal thigh resting on seat + rounded knee + vertical shin + resting cloth shoe
        const thigh = new THREE.Mesh(cylGeo, spec.pantsMat);
        thigh.scale.set(0.088, 0.32, 0.088);
        thigh.rotation.x = Math.PI * 0.5;
        thigh.position.set(0, -0.02, 0.15);
        leg.add(thigh);

        const knee = new THREE.Mesh(sphereGeo, spec.pantsMat);
        knee.scale.setScalar(0.086);
        knee.position.set(0, -0.025, 0.3);
        leg.add(knee);

        const shin = new THREE.Mesh(cylGeo, spec.pantsMat);
        shin.scale.set(0.076, 0.38, 0.076);
        shin.position.set(0, -0.22, 0.31);
        leg.add(shin);

        const shoe = new THREE.Mesh(sphereGeo, inkMat);
        shoe.scale.set(0.078, 0.048, 0.125);
        shoe.position.set(0, -0.41, 0.36);
        leg.add(shoe);

        const sole = new THREE.Mesh(cylGeo, clothCreamMat);
        sole.scale.set(0.076, 0.018, 0.118);
        sole.position.set(0, -0.435, 0.36);
        leg.add(sole);
      } else {
        const legCyl = new THREE.Mesh(cylGeo, spec.pantsMat);
        legCyl.scale.set(0.082, 0.62, 0.082);
        legCyl.position.set(0, -0.31, 0);
        leg.add(legCyl);

        const cuff = new THREE.Mesh(cylGeo, clothCreamMat);
        cuff.scale.set(0.084, 0.04, 0.084);
        cuff.position.set(0, -0.58, 0);
        leg.add(cuff);

        const shoe = new THREE.Mesh(sphereGeo, inkMat);
        shoe.scale.set(0.078, 0.048, 0.125);
        shoe.position.set(0, -0.62, 0.042);
        leg.add(shoe);

        const sole = new THREE.Mesh(cylGeo, clothCreamMat);
        sole.scale.set(0.075, 0.018, 0.118);
        sole.position.set(0, -0.648, 0.042);
        leg.add(sole);
      }
      return leg;
    };

    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);
    rig.add(leftLeg, rightLeg);

    // Turned wooden-doll Hakka torso with diagonal cross-collar lapel (大襟斜领) & waist sash
    const torso = new THREE.Group();
    torso.position.set(0, hipY, 0);
    rig.add(torso);

    const robe = new THREE.Mesh(robeGeo, spec.tunicMat);
    robe.castShadow = castShadow;
    torso.add(robe);

    const trimMat = spec.scarfMat ?? clothCreamMat;

    // Hakka diagonal cross-collar lapel piping (大襟)
    const lapelDiag = new THREE.Mesh(boxGeo, trimMat);
    lapelDiag.scale.set(0.24, 0.028, 0.032);
    lapelDiag.position.set(0.04, 0.49, 0.215);
    lapelDiag.rotation.z = -0.58;
    torso.add(lapelDiag);

    const lapelVert = new THREE.Mesh(boxGeo, trimMat);
    lapelVert.scale.set(0.028, 0.34, 0.032);
    lapelVert.position.set(0.13, 0.27, 0.22);
    torso.add(lapelVert);

    // Traditional Hakka front apron
    if (spec.apronMat) {
      const apron = new THREE.Mesh(boxGeo, spec.apronMat);
      apron.scale.set(0.26, 0.42, 0.042);
      apron.position.set(0, 0.16, 0.245);
      torso.add(apron);
    }

    // Waist sash + front bow knot
    const sash = new THREE.Mesh(cylGeo, spec.scarfMat ?? clothVermMat);
    sash.scale.set(0.238, 0.068, 0.238);
    sash.position.y = 0.22;
    torso.add(sash);
    const bowKnot = new THREE.Mesh(sphereGeo, spec.scarfMat ?? clothVermMat);
    bowKnot.scale.set(0.052, 0.042, 0.042);
    bowKnot.position.set(-0.07, 0.22, 0.235);
    torso.add(bowKnot);

    // Mandarin stand collar + warm neck cylinder
    const collar = new THREE.Mesh(cylGeo, trimMat);
    collar.scale.set(0.132, 0.065, 0.132);
    collar.position.y = 0.63;
    torso.add(collar);
    const neck = new THREE.Mesh(cylGeo, skinMat);
    neck.scale.set(0.078, 0.09, 0.078);
    neck.position.y = 0.68;
    torso.add(neck);

    // Sculpted tapered wide sleeves + contrasting cuffs + explicit hand sockets for zero-drift prop attachment
    const makeArm = (side: -1 | 1): { arm: THREE.Group; handSocket: THREE.Group } => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.225, 0.56, 0);

      const shoulder = new THREE.Mesh(sphereGeo, spec.tunicMat);
      shoulder.scale.setScalar(0.078);
      arm.add(shoulder);

      const sleeve = new THREE.Mesh(sleeveGeo, spec.tunicMat);
      sleeve.rotation.z = side * 0.13;
      sleeve.castShadow = castShadow;
      arm.add(sleeve);

      const cuff = new THREE.Mesh(cylGeo, trimMat);
      cuff.scale.set(0.088, 0.042, 0.088);
      cuff.position.set(side * 0.05, -0.39, 0);
      cuff.rotation.z = side * 0.13;
      arm.add(cuff);

      const handSocket = new THREE.Group();
      handSocket.position.set(side * 0.056, -0.45, 0.02);
      const hand = new THREE.Mesh(sphereGeo, skinMat);
      hand.scale.set(0.062, 0.068, 0.062);
      handSocket.add(hand);
      arm.add(handSocket);

      return { arm, handSocket };
    };
    const leftArmBuilt = makeArm(-1);
    const rightArmBuilt = makeArm(1);
    const leftArm = leftArmBuilt.arm;
    const rightArm = rightArmBuilt.arm;
    const leftHandSocket = leftArmBuilt.handSocket;
    const rightHandSocket = rightArmBuilt.handSocket;
    torso.add(leftArm, rightArm);

    // Expressive carved-wood doll head with chin contour, tiny nose, smiling eyes & blush
    const head = new THREE.Group();
    head.position.set(0, 0.84, 0);
    torso.add(head);

    const skull = new THREE.Mesh(headGeo, skinMat);
    skull.castShadow = castShadow;
    head.add(skull);

    // Tiny button nose & ears
    const nose = new THREE.Mesh(sphereGeo, skinMat);
    nose.scale.set(0.02, 0.022, 0.024);
    nose.position.set(0, -0.015, 0.184);
    head.add(nose);

    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(sphereGeo, skinMat);
      ear.scale.set(0.032, 0.046, 0.024);
      ear.position.set(sx * 0.182, -0.005, -0.01);
      head.add(ear);

      const eye = new THREE.Mesh(sphereGeo, inkMat);
      eye.scale.set(0.023, 0.026, 0.018);
      eye.position.set(sx * 0.066, 0.018, 0.168);
      head.add(eye);

      const glint = new THREE.Mesh(sphereGeo, eyeHighlightMat);
      glint.scale.setScalar(0.0085);
      glint.position.set(sx * 0.059, 0.026, 0.184);
      head.add(glint);

      const cheek = new THREE.Mesh(sphereGeo, cheekMat);
      cheek.scale.set(0.038, 0.024, 0.016);
      cheek.position.set(sx * 0.104, -0.032, 0.148);
      head.add(cheek);
    }

    // Hair & sculpted traditional Hakka headwear
    const hairMat = spec.elder ? hairSilverMat : hairDarkMat;
    const hairCap = new THREE.Mesh(sphereGeo, hairMat);
    hairCap.scale.set(0.194, 0.19, 0.196);
    hairCap.position.set(0, 0.042, -0.024);
    head.add(hairCap);

    // Soft curved storybook front bangs (刘海) for children and women
    if (spec.hat === 'child_tufts' || spec.hat === 'bun' || spec.hat === 'hakka_curtain') {
      for (const sx of [-1, 1]) {
        const bang = new THREE.Mesh(sphereGeo, hairMat);
        bang.scale.set(0.095, 0.068, 0.088);
        bang.position.set(sx * 0.062, 0.118, 0.092);
        bang.rotation.z = -sx * 0.28;
        head.add(bang);
      }
    }

    if (spec.elder && spec.hat !== 'bun') {
      const mustache = new THREE.Mesh(sphereGeo, hairSilverMat);
      mustache.scale.set(0.065, 0.022, 0.025);
      mustache.position.set(0, -0.065, 0.168);
      head.add(mustache);

      const beard = new THREE.Mesh(coneGeo, hairSilverMat);
      beard.scale.set(0.058, 0.16, 0.048);
      beard.rotation.x = Math.PI;
      beard.position.set(0, -0.175, 0.118);
      head.add(beard);
    }

    if (spec.hat === 'hakka_curtain') {
      // Iconic Meizhou Hakka Liangmao (客家凉帽): turned bamboo brim + pleated indigo curtain + colorful ribbons!
      const brim = new THREE.Mesh(liangmaoBrimGeo, strawMat);
      brim.position.y = 0.15;
      head.add(brim);

      const brimTrim = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.382, 0.016, 6, 20)),
        strawRimMat
      );
      brimTrim.rotation.x = Math.PI * 0.5;
      brimTrim.position.y = 0.155;
      head.add(brimTrim);

      const curtain = new THREE.Mesh(liangmaoCurtainGeo, clothIndigoMat);
      curtain.position.y = 0.035;
      curtain.rotation.y = Math.PI; // open in front so expressive face is visible!
      head.add(curtain);

      // Pair of colorful silk tie ribbons cascading down back-sides
      for (const sx of [-1, 1]) {
        const ribbon = new THREE.Mesh(boxGeo, sx < 0 ? clothVermMat : clothPeachMat);
        ribbon.scale.set(0.032, 0.24, 0.012);
        ribbon.position.set(sx * 0.22, -0.04, -0.25);
        ribbon.rotation.z = sx * 0.18;
        head.add(ribbon);
      }
    } else if (spec.hat === 'conical') {
      const douli = new THREE.Mesh(douliGeo, strawMat);
      douli.position.y = 0.125;
      head.add(douli);
      const band = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.415, 0.014, 6, 18)),
        strawRimMat
      );
      band.rotation.x = Math.PI * 0.5;
      band.position.y = 0.128;
      head.add(band);
    } else if (spec.hat === 'elder_cap') {
      const cap = new THREE.Mesh(elderCapGeo, clothNavyMat);
      cap.position.y = 0.11;
      head.add(cap);
      const capBand = new THREE.Mesh(cylGeo, mats.gildedGold);
      capBand.scale.set(0.186, 0.022, 0.186);
      capBand.position.y = 0.12;
      head.add(capBand);
      const knot = new THREE.Mesh(sphereGeo, clothVermMat);
      knot.scale.setScalar(0.034);
      knot.position.y = 0.26;
      head.add(knot);
    } else if (spec.hat === 'bun') {
      const bun = new THREE.Mesh(sphereGeo, hairMat);
      bun.scale.set(0.088, 0.078, 0.082);
      bun.position.set(0, 0.08, -0.185);
      head.add(bun);
      const pin = new THREE.Mesh(cylGeo, celadonMat);
      pin.scale.set(0.012, 0.22, 0.012);
      pin.rotation.z = Math.PI * 0.42;
      pin.position.set(0, 0.09, -0.185);
      head.add(pin);
      const pinBead = new THREE.Mesh(sphereGeo, mats.gildedGold);
      pinBead.scale.setScalar(0.024);
      pinBead.position.set(0.1, 0.12, -0.185);
      head.add(pinBead);
    } else if (spec.hat === 'child_tufts') {
      for (const sx of [-1, 1]) {
        const tuft = new THREE.Mesh(sphereGeo, hairDarkMat);
        tuft.scale.setScalar(0.072);
        tuft.position.set(sx * 0.155, 0.145, -0.02);
        head.add(tuft);
        const rib = new THREE.Mesh(cylGeo, clothVermMat);
        rib.scale.set(0.058, 0.026, 0.058);
        rib.position.set(sx * 0.155, 0.105, -0.02);
        head.add(rib);
        const tailRib = new THREE.Mesh(boxGeo, clothVermMat);
        tailRib.scale.set(0.022, 0.12, 0.01);
        tailRib.position.set(sx * 0.19, 0.06, -0.03);
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
      leftHandSocket,
      rightHandSocket,
      leftLeg,
      rightLeg,
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
  // 2. PLACE 19 LIVELY HAKKA VILLAGERS + HANDCRAFTED COURTYARD PROPS
  //    (Grain mats are unified in propsBuilder.ts at [-6.0, 28.8] & [5.2, 29.2] — zero overlap!)
  // =========================================================================
  const walkingVillagers: WalkingVillagerAnim[] = [];
  const idleVillagers: IdleVillagerAnim[] = [];

  // 2A. Two Raking Farmers standing cleanly beside the two unified He-Ping grain mats!
  //     Each 7-tooth wooden grain rake is a single unified rig parented directly to rightHandSocket
  //     so palm, bamboo shaft, crossbar, and all 7 teeth move together with zero detachment!
  const farmerPlacements: Array<[number, number, number, number, number, THREE.MeshStandardMaterial]> = [
    [-8.65, 28.8, Math.PI * 0.5, -8.5, 22.8, clothIndigoMat], // West mat [-6.0, 28.8], facing East
    [7.85, 29.2, -Math.PI * 0.5, 8.2, 22.8, clothTealMat],    // East mat [5.2, 29.2], facing West
  ];
  farmerPlacements.forEach(([fx, fz, yaw, shX, shZ, tunic], idx) => {
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
      group: farmer.group,
      head: farmer.head,
      leftArm: farmer.leftArm,
      rightArm: farmer.rightArm,
      torso: farmer.torso,
      kind: 'rake',
      phaseOffset: idx * 2.1,
      rakeGroup,
      baseX: fx,
      baseZ: fz,
      baseYaw: yaw,
      shelterX: shX,
      shelterZ: shZ,
      shelterYaw: 0,
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
  walkingVillagers.push({
    group: carrier.group,
    leftArm: carrier.leftArm,
    rightArm: carrier.rightArm,
    leftLeg: carrier.leftLeg,
    rightLeg: carrier.rightLeg,
    head: carrier.head,
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
      group: woman.group,
      head: woman.head,
      leftArm: woman.leftArm,
      rightArm: woman.rightArm,
      torso: woman.torso,
      kind: 'wash',
      phaseOffset: idx * 1.9,
      ripple,
      baseX: wx,
      baseZ: wz,
      baseYaw: idx === 0 ? 0.18 : -0.22,
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
    group: elderA.group,
    head: elderA.head,
    leftArm: elderA.leftArm,
    rightArm: elderA.rightArm,
    torso: elderA.torso,
    kind: 'fan',
    phaseOffset: 0.4,
    baseX: benchX - 0.5,
    baseZ: benchZ + 0.02,
    baseYaw: 0.35,
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
    group: elderB.group,
    head: elderB.head,
    leftArm: elderB.leftArm,
    rightArm: elderB.rightArm,
    torso: elderB.torso,
    kind: 'chat',
    phaseOffset: 1.7,
    baseX: benchX + 0.5,
    baseZ: benchZ + 0.02,
    baseYaw: -0.4,
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
    walkingVillagers.push({
      group: child.group,
      leftArm: child.leftArm,
      rightArm: child.rightArm,
      leftLeg: child.leftLeg,
      rightLeg: child.rightLeg,
      head: child.head,
      waypoints: cs.path,
      speed: cs.speed,
      phaseOffset: cs.phase,
      pinwheel,
      isChild: true,
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
  walkingVillagers.push({
    group: umbrellaWalker.group,
    leftArm: umbrellaWalker.leftArm,
    rightArm: umbrellaWalker.rightArm,
    leftLeg: umbrellaWalker.leftLeg,
    rightLeg: umbrellaWalker.rightLeg,
    head: umbrellaWalker.head,
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
      group: guest.group,
      head: guest.head,
      leftArm: guest.leftArm,
      rightArm: guest.rightArm,
      torso: guest.torso,
      kind: 'tea',
      phaseOffset: idx * 2.4,
      baseX: tx,
      baseZ: tz,
      baseYaw: yaw,
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
    group: worshipper.group,
    head: worshipper.head,
    leftArm: worshipper.leftArm,
    rightArm: worshipper.rightArm,
    torso: worshipper.torso,
    kind: 'bow',
    phaseOffset: 0.9,
    baseX: 1.8,
    baseZ: -1.6,
    baseYaw: Math.PI,
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
      group: w.group,
      head: w.head,
      leftArm: w.leftArm,
      rightArm: w.rightArm,
      torso: w.torso,
      kind: 'tend',
      phaseOffset: idx * 1.6,
      baseX: hx,
      baseZ: hz,
      baseYaw: yaw,
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
    walkingVillagers.push({
      group: v.group,
      leftArm: v.leftArm,
      rightArm: v.rightArm,
      leftLeg: v.leftLeg,
      rightLeg: v.rightLeg,
      head: v.head,
      rainUmbrella,
      waypoints: ww.path,
      speed: ww.speed,
      phaseOffset: ww.phase,
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

    poultryList.push({
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
    quadrupeds.push({
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
    quadrupeds.push({
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
    quadrupeds.push({
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
    quadrupeds.push({
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
  // 7. ZERO-GC PER-FRAME TIME + WEATHER DYNAMIC BEHAVIOR FSM LOOP
  // =========================================================================
  let walkClock = 0;
  let fowlClock = 0;
  let poultryClock = 0;
  let craneRoostSmooth = 0;
  let farmerShelterSmooth = 0;
  let lastTimeOfDay = 10.5;
  let initialized = false;

  const update = (dt: number, t: number, weather: WeatherMode, timeOfDay = 10.5) => {
    const b = evaluateLivingBehavior(timeOfDay, weather);
    const scrubbed = !initialized || Math.abs(timeOfDay - lastTimeOfDay) > 0.35;
    initialized = true;
    lastTimeOfDay = timeOfDay;

    walkClock += dt * b.walkSpeedScale;
    fowlClock += dt * (b.waterfowlState === 'swimming' ? 1.0 : 0.14);
    poultryClock += dt * (b.poultryState === 'foraging' ? 1.0 : 0.0);

    const targetCraneRoost = b.craneRoostBlend;
    craneRoostSmooth = scrubbed
      ? targetCraneRoost
      : THREE.MathUtils.damp(craneRoostSmooth, targetCraneRoost, 1.8, dt);

    const targetFarmerShelter = b.farmerState === 'resting_indoors' ? 1.0 : 0.0;
    farmerShelterSmooth = scrubbed
      ? targetFarmerShelter
      : THREE.MathUtils.damp(farmerShelterSmooth, targetFarmerShelter, 2.4, dt);

    // 1. Walking villagers (daytime stroll, rain umbrellas & slowed pace, indoors at night)
    for (let i = 0; i < walkingVillagers.length; i++) {
      const v = walkingVillagers[i];
      const shouldShow = v.isChild
        ? b.villagerState === 'outdoor_active'
        : b.villagerState !== 'night_rest';
      v.group.visible = shouldShow;
      if (!shouldShow) continue;

      if (v.rainUmbrella) {
        v.rainUmbrella.visible = b.villagersCarryUmbrellas;
      }

      const p = sampleClosedLoopPath(v.waypoints, walkClock * v.speed + v.phaseOffset);
      const y = groundHeightAt(p.x, p.z, 0);
      const strideRate = (v.isChild ? 9.5 : 5.2) * Math.max(0.35, b.walkSpeedScale);
      const swing = Math.sin(walkClock * strideRate + v.phaseOffset * 10);
      const bob = Math.abs(swing) * (v.isChild ? 0.072 : 0.038) * b.walkSpeedScale;

      v.group.position.set(p.x, y + bob, p.z);
      v.group.rotation.y = p.yaw;
      v.leftLeg.rotation.x = swing * 0.48 * b.walkSpeedScale;
      v.rightLeg.rotation.x = -swing * 0.48 * b.walkSpeedScale;
      v.leftArm.rotation.x = -swing * 0.42 * b.walkSpeedScale;

      const holdingUmb = Boolean(v.hasUmbrella || (v.rainUmbrella && v.rainUmbrella.visible));
      if (holdingUmb) {
        v.rightArm.rotation.x = -0.68;
      } else if (!v.carryPole && !v.pinwheel) {
        v.rightArm.rotation.x = swing * 0.42 * b.walkSpeedScale;
      }
      v.head.rotation.y = Math.sin(t * 1.3 + v.phaseOffset * 6) * 0.18;

      if (v.carryPole) {
        v.carryPole.rotation.z = Math.sin(walkClock * strideRate + v.phaseOffset * 10) * 0.055;
      }
      if (v.pinwheel) {
        v.pinwheel.rotation.z += dt * 7.8;
      }
    }

    // 2. Storytelling idle villagers (Farmers respond to Sun / Rain / Night!)
    for (let i = 0; i < idleVillagers.length; i++) {
      const iv = idleVillagers[i];
      const ph = t + iv.phaseOffset;
      switch (iv.kind) {
        case 'rake': {
          const sx = iv.shelterX ?? iv.baseX;
          const sz = iv.shelterZ ?? iv.baseZ;
          const syaw = iv.shelterYaw ?? 0;
          const fx = THREE.MathUtils.lerp(iv.baseX, sx, farmerShelterSmooth);
          const fz = THREE.MathUtils.lerp(iv.baseZ, sz, farmerShelterSmooth);
          iv.group.position.set(fx, groundHeightAt(fx, fz, 0), fz);

          // Shortest-angle yaw blend between mat facing and veranda rest facing
          const dyaw = Math.atan2(Math.sin(syaw - iv.baseYaw), Math.cos(syaw - iv.baseYaw));
          iv.group.rotation.y = iv.baseYaw + dyaw * farmerShelterSmooth;

          if (iv.rakeGroup) {
            iv.rakeGroup.visible = b.farmerState !== 'resting_indoors';
          }

          if (b.farmerState === 'raking') {
            // Sunny daytime: rhythmic two-handed grain turning with rake teeth skimming the rice mat
            const stroke = Math.sin(ph * 2.4);
            iv.torso.rotation.x = 0.16 + stroke * 0.06;
            iv.rightArm.rotation.set(-0.62 + stroke * 0.14, -0.06, 0.06);
            iv.leftArm.rotation.set(-0.56 + stroke * 0.12, 0.34, -0.14);
            iv.head.rotation.x = 0.18;
            iv.head.rotation.y = Math.sin(ph * 1.2) * 0.12;
          } else if (b.farmerState === 'harvest_rush') {
            // Rainy daytime: urgent rapid scooping & gathering grain before soaking
            const rush = Math.sin(ph * 5.2);
            iv.torso.rotation.x = 0.24 + rush * 0.08;
            iv.rightArm.rotation.set(-0.68 + rush * 0.18, -0.08, 0.08);
            iv.leftArm.rotation.set(-0.62 + rush * 0.16, 0.36, -0.16);
            iv.head.rotation.x = 0.24;
            iv.head.rotation.y = Math.sin(ph * 2.8) * 0.18;
          } else {
            // Night / Post-dusk: grain stowed, resting calmly under front veranda eaves
            iv.torso.rotation.x = Math.sin(ph * 0.8) * 0.03;
            iv.rightArm.rotation.set(-0.08, 0, 0);
            iv.leftArm.rotation.set(-0.08, 0, 0);
            iv.head.rotation.x = 0.0;
            iv.head.rotation.y = Math.sin(ph * 0.7) * 0.16;
          }
          break;
        }
        case 'wash': {
          const activeWash = b.villagerState === 'outdoor_active';
          iv.group.visible = activeWash;
          if (iv.ripple) iv.ripple.visible = activeWash;
          if (!activeWash) break;

          const scrub = Math.sin(ph * 4.2);
          iv.torso.rotation.x = 0.32 + scrub * 0.08;
          iv.leftArm.rotation.x = -0.78 + scrub * 0.24;
          iv.rightArm.rotation.x = -0.78 - scrub * 0.24;
          if (iv.ripple) {
            const rCycle = (t * 0.65 + iv.phaseOffset * 0.3) % 1;
            const sc = 0.6 + rCycle * 2.6;
            iv.ripple.scale.set(sc, 1, sc);
            (iv.ripple.material as THREE.MeshBasicMaterial).opacity = (1 - rCycle) * 0.55;
          }
          break;
        }
        case 'fan': {
          const eldersOut = b.timeOfDay >= 6.2 && b.timeOfDay <= 21.2;
          iv.group.visible = eldersOut;
          if (!eldersOut) break;
          const fanSpeed = b.weather === 'rain' || b.isNight ? 1.4 : 4.8;
          iv.rightArm.rotation.z = -0.15 + Math.sin(ph * fanSpeed) * (b.isNight ? 0.08 : 0.28);
          iv.head.rotation.y = 0.15 + Math.sin(ph * 1.1) * 0.16;
          break;
        }
        case 'chat': {
          const eldersOut = b.timeOfDay >= 6.2 && b.timeOfDay <= 21.2;
          iv.group.visible = eldersOut;
          if (!eldersOut) break;
          iv.head.rotation.x = Math.sin(ph * 2.2) * 0.1;
          iv.head.rotation.y = -0.15 + Math.sin(ph * 1.0) * 0.14;
          iv.leftArm.rotation.x = -0.35 + Math.sin(ph * 1.8) * 0.14;
          break;
        }
        case 'tea': {
          const teaOut = b.weather !== 'rain' && b.timeOfDay >= 7.0 && b.timeOfDay <= 20.5;
          iv.group.visible = teaOut;
          if (!teaOut) break;
          const sip = Math.max(0, Math.sin(ph * 0.85));
          iv.rightArm.rotation.x = -0.35 - sip * 0.55;
          iv.head.rotation.x = sip * 0.16;
          break;
        }
        case 'bow': {
          // Respectful ancestral hall incense offering during daytime & evening hours
          const worshipOut = b.timeOfDay >= 6.0 && b.timeOfDay <= 21.5;
          iv.group.visible = worshipOut;
          if (!worshipOut) break;
          const bowCycle = Math.max(0, Math.sin(ph * 0.9));
          iv.torso.rotation.x = bowCycle * 0.32;
          iv.leftArm.rotation.x = -0.75;
          iv.rightArm.rotation.x = -0.75;
          break;
        }
        case 'tend': {
          const tendOut = b.villagerState === 'outdoor_active';
          iv.group.visible = tendOut;
          if (!tendOut) break;
          iv.rightArm.rotation.x = -0.45 + Math.sin(ph * 2.1) * 0.25;
          iv.head.rotation.y = Math.sin(ph * 1.2) * 0.22;
          break;
        }
      }
    }

    // 3. Animated Poultry (forage daytime -> huddle/shelter in rain -> roost quietly at night)
    for (let i = 0; i < poultryList.length; i++) {
      const p = poultryList[i];
      if (b.poultryState === 'foraging') {
        const ph = poultryClock * p.speed + p.phaseOffset;
        let tx: number;
        let tz: number;
        let yaw: number;

        if (p.isChick && p.leaderIdx !== undefined) {
          const mom = poultryList[p.leaderIdx];
          const a = ph * 1.1 + p.phaseOffset * 2.3;
          tx = mom.group.position.x + Math.cos(a) * 0.65;
          tz = mom.group.position.z + Math.sin(a) * 0.65;
          yaw = Math.atan2(-Math.sin(a), Math.cos(a));
        } else {
          tx = p.baseX + Math.sin(ph * 0.65) * p.wanderR;
          tz = p.baseZ + Math.cos(ph * 0.52) * p.wanderR * 0.78;
          const dx = Math.cos(ph * 0.65) * p.wanderR * 0.65;
          const dz = -Math.sin(ph * 0.52) * p.wanderR * 0.78 * 0.52;
          yaw = Math.atan2(dx, dz);
        }

        const py = groundHeightAt(tx, tz, 0);
        const hop = p.isChick ? Math.abs(Math.sin(t * 7.5 + p.phaseOffset * 4)) * 0.068 : 0;
        p.group.position.set(tx, py + hop, tz);
        p.group.rotation.y = yaw;

        const peck = Math.max(0, Math.sin(t * 3.1 + p.phaseOffset * 5) - 0.55) * 1.45;
        p.body.position.y = 0;
        p.body.rotation.x = peck * 0.5;
        p.head.rotation.x = peck * 0.62;
      } else {
        // Sheltering or night roosting: settled calmly near base / mother hen with tucked head
        const restX = p.isChick && p.leaderIdx !== undefined
          ? poultryList[p.leaderIdx].baseX + Math.cos(p.phaseOffset * 3) * 0.35
          : p.baseX;
        const restZ = p.isChick && p.leaderIdx !== undefined
          ? poultryList[p.leaderIdx].baseZ + Math.sin(p.phaseOffset * 3) * 0.35
          : p.baseZ;
        const py = groundHeightAt(restX, restZ, 0);
        p.group.position.set(restX, py, restZ);
        p.body.position.y = -0.05;
        p.body.rotation.x = 0.08;
        p.head.rotation.x = 0.25 + Math.sin(t * 1.2 + p.phaseOffset) * 0.04;
      }
    }

    // 4. Pond Waterfowl (swim daytime -> calm shore rest at night)
    for (let i = 0; i < waterfowlList.length; i++) {
      const wf = waterfowlList[i];
      const isResting = b.waterfowlState === 'shore_rest';
      const sample = samplePondSwimPath(
        wf.cx,
        wf.cz,
        wf.rx,
        wf.rz,
        fowlClock * wf.speed + wf.phaseOffset,
        wf.dir
      );
      const bob = Math.sin(t * (isResting ? 1.4 : 2.6) + wf.phaseOffset * 3) * (isResting ? 0.012 : 0.024);
      wf.group.position.set(sample.x, -0.2 + bob, sample.z);
      wf.group.rotation.y = sample.yaw;

      if (isResting) {
        wf.neck.rotation.x = 0.28 + Math.sin(t * 0.8 + wf.phaseOffset) * 0.04;
        wf.wake.scale.set(0.65, 1, 0.65);
      } else {
        const dip = Math.max(0, Math.sin(t * 1.1 + wf.phaseOffset * 5) - 0.75) * 1.5;
        wf.neck.rotation.x = dip * 0.45;
        const wCycle = (t * 0.55 + wf.phaseOffset) % 1;
        const wScale = 0.85 + wCycle * 1.35;
        wf.wake.scale.set(wScale, 1, wScale);
      }
    }

    // 5. Domestic Animals (active daytime -> shelter in rain -> peaceful sleep at night)
    for (let i = 0; i < quadrupeds.length; i++) {
      const q = quadrupeds[i];
      const ph = t + q.phaseOffset;
      const resting = b.quadrupedState !== 'active';

      if (q.kind === 'dog_patrol' && q.waypoints) {
        if (resting) {
          // Rests peacefully beside the front gate veranda
          const rx = -4.2;
          const rz = 23.0;
          const ry = groundHeightAt(rx, rz, 0);
          q.group.position.set(rx, ry - 0.14, rz);
          q.group.rotation.y = 0.35;
          q.tail.rotation.z = Math.sin(t * 1.8) * 0.08;
          q.head.rotation.y = Math.sin(t * 0.6) * 0.08;
          q.head.rotation.x = 0.22;
          for (let l = 0; l < q.legs.length; l++) q.legs[l].rotation.x = 0;
        } else {
          const s = sampleClosedLoopPath(q.waypoints, walkClock * q.speed + q.phaseOffset);
          const y = groundHeightAt(s.x, s.z, 0);
          const trot = Math.sin(walkClock * 9.2);
          q.group.position.set(s.x, y + Math.abs(trot) * 0.042, s.z);
          q.group.rotation.y = s.yaw;
          q.tail.rotation.z = Math.sin(t * 11.5) * 0.42;
          q.head.rotation.y = Math.sin(t * 2.1) * 0.16;
          q.head.rotation.x = 0;
          if (q.legs.length === 4) {
            q.legs[0].rotation.x = trot * 0.45;
            q.legs[1].rotation.x = -trot * 0.45;
            q.legs[2].rotation.x = -trot * 0.45;
            q.legs[3].rotation.x = trot * 0.45;
          }
        }
      } else if (q.kind === 'puppy_hop') {
        if (resting) {
          q.group.position.y = q.baseY - 0.08;
          q.tail.rotation.z = Math.sin(ph * 1.6) * 0.08;
          q.head.rotation.z = 0.12;
        } else {
          const hop = Math.abs(Math.sin(ph * 5.2)) * 0.11;
          q.group.position.y = q.baseY + hop;
          q.group.rotation.y = Math.sin(ph * 1.1) * 0.65;
          q.tail.rotation.z = Math.sin(ph * 14.0) * 0.52;
          q.head.rotation.z = Math.sin(ph * 2.2) * 0.18;
        }
      } else if (q.kind === 'cat_loaf') {
        q.tail.rotation.y = Math.sin(ph * (resting ? 0.9 : 2.2)) * (resting ? 0.12 : 0.32);
        q.head.rotation.y = Math.sin(ph * 0.7) * (resting ? 0.06 : 0.2);
      } else if (q.kind === 'buffalo') {
        if (resting) {
          q.group.position.y = q.baseY - 0.26;
          q.head.rotation.x = 0.32 + Math.sin(ph * 0.6) * 0.04;
          q.head.rotation.y = 0;
          q.tail.rotation.z = Math.sin(ph * 1.1) * 0.08;
        } else {
          q.group.position.y = q.baseY;
          q.head.rotation.x = 0.24 + Math.sin(ph * 1.2) * 0.14;
          q.head.rotation.y = Math.sin(ph * 0.45) * 0.15;
          q.tail.rotation.z = Math.sin(ph * 2.6) * 0.24;
        }
      } else if (q.kind === 'goat') {
        if (resting) {
          q.group.position.y = q.baseY - 0.14;
          q.head.rotation.x = 0.25;
          q.tail.rotation.z = Math.sin(ph * 1.5) * 0.06;
        } else {
          q.group.position.y = q.baseY;
          q.head.rotation.x = 0.38 + Math.sin(ph * 1.9) * 0.2;
          q.tail.rotation.z = Math.sin(ph * 5.2) * 0.25;
        }
      }
    }

    // 6. White Cranes: Soar over valley in sunny daytime -> descend at dusk -> roost in rear camphor trees at night/rain!
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

      // Wings flap in flight, fold smoothly along flanks when perched/roosting
      const flap = Math.sin(t * 4.4 + c.phaseOffset * 12) * 0.46 * (1 - rb);
      const folded = 1.02 * rb;
      c.leftWing.rotation.z = flap + folded;
      c.rightWing.rotation.z = -flap - folded;
    }

    // 7. Fluttering Butterflies (sunny daytime only)
    for (let i = 0; i < butterflies.length; i++) {
      const bf = butterflies[i];
      bf.group.visible = b.butterfliesActive;
      if (!b.butterfliesActive) continue;
      const a = t * bf.speed + bf.phaseOffset;
      bf.group.position.set(
        bf.cx + Math.cos(a) * bf.rx,
        bf.cy + Math.sin(a * 2.3) * 0.35,
        bf.cz + Math.sin(a * 1.3) * bf.rz
      );
      bf.group.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a * 1.3));
      const flap = Math.sin(t * 16.0 + bf.phaseOffset * 8) * 0.85;
      bf.leftWing.rotation.y = flap;
      bf.rightWing.rotation.y = -flap;
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

  return {
    root,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
