import * as THREE from 'three';
import { HANDCRAFTED_PAL, type MaterialLibrary } from './proceduralTextures';
import { INTERACTABLES } from '../data/weilongData';
import { groundHeightAt } from './worldMath';
import {
  createCuppedPetalGeometry,
  createPaintedWoodMat,
  createSoftPillowGeometry,
  createTaperedCurveGeometry,
  createTurnedLatheGeometry,
} from './sculptHelpers';

export interface PropAnimationRefs {
  root: THREE.Group;
  interactableMeshes: THREE.Object3D[];
  millUpperStone: THREE.Group;
  cradleBody: THREE.Group;
  birdcageGroup: THREE.Group;
  bellowsHandle: THREE.Mesh;
  wokSteamGroup: THREE.Group;
  leichaPestle: THREE.Group;
  winnowerCrank: THREE.Group;
  pulleyGrainSack: THREE.Group;
  loomShuttle: THREE.Mesh;
  carpentryBeam: THREE.Mesh;
  dingLanternGroup: THREE.Group;
  jiaobeiLeft: THREE.Mesh;
  jiaobeiRight: THREE.Mesh;
  incenseSmokeGroup: THREE.Group;
  fiveElementStones: THREE.Mesh[];
  studyLampLight: THREE.PointLight;
  dryingClothes: THREE.Mesh[];
  chickens: THREE.Group[];
  startledBirds: THREE.Group;
  grainMatGroups: THREE.Group[];
  grainTarpCovers: THREE.Mesh[];
  grainStaticRake: THREE.Group;
  updateGrainDrying: (
    spreadProgress: number,
    basketFill: number,
    matDeployed: number,
    timeSec: number,
    isGathering: boolean
  ) => void;
  updateHwameiBird: (timeSec: number, dt: number, excited: number) => void;
  updateDingLanternHeight: (worldY: number) => void;
  dispose: () => void;
}

/**
 * Builds all 33 handcrafted woodcarving picture-book interactive props and shrines
 * across all 24 spaces of the 1:1 Oval Double-Weilongwu, plus 4 sculpted coop chickens.
 */
export function buildWeilongProps(
  mats: MaterialLibrary,
  isSoftwareGl: boolean
): PropAnimationRefs {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const localMaterials: THREE.Material[] = [];
  const localTextures: THREE.Texture[] = [];
  const interactableMeshes: THREE.Object3D[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    localMaterials.push(m);
    return m;
  };

  const castShadow = !isSoftwareGl;
  const shadowDiscGeo = trackGeo(new THREE.CircleGeometry(1, 16));
  shadowDiscGeo.rotateX(-Math.PI * 0.5);

  const addShadowDisc = (parent: THREE.Object3D, radius: number, x = 0, z = 0) => {
    const disc = new THREE.Mesh(shadowDiscGeo, mats.contactShadow);
    disc.scale.set(radius, 1, radius);
    disc.position.set(x, 0.018, z);
    parent.add(disc);
  };

  // Shared artisanal painted wood/ceramic/bamboo materials
  const bambooMat = createPaintedWoodMat(0xc7a35e, trackMat, 0.72);
  const creamSilkMat = createPaintedWoodMat(HANDCRAFTED_PAL.cream, trackMat, 0.78);
  const celadonMat = createPaintedWoodMat(0x9ac6b5, trackMat, 0.36, 0.08);
  const vermMat = createPaintedWoodMat(HANDCRAFTED_PAL.verm, trackMat, 0.58);
  const ceruleanMat = createPaintedWoodMat(HANDCRAFTED_PAL.cer, trackMat, 0.62);
  const lemonMat = createPaintedWoodMat(HANDCRAFTED_PAL.lemon, trackMat, 0.62);
  const peachMat = createPaintedWoodMat(HANDCRAFTED_PAL.peach, trackMat, 0.66);
  const ironMat = createPaintedWoodMat(0x272a30, trackMat, 0.5, 0.72);
  const emberMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xff6b2b })
  );

  // Invisible click/raycast hitboxes for every interactable
  const hitMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
  for (const item of INTERACTABLES) {
    const [ix, iy, iz] = item.position;
    const hitMesh = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(1.18, 8, 6)), hitMat);
    hitMesh.position.set(ix, iy + 0.15, iz);
    hitMesh.userData = { interactableId: item.id };
    root.add(hitMesh);
    interactableMeshes.push(hitMesh);
  }

  // =========================================================================
  // 01 & 02. HALF-MOON POND MALLET & UNIFIED HE-PING GOLDEN RICE MATS + RAKE
  // =========================================================================
  const malletGroup = new THREE.Group();
  malletGroup.position.set(-2.4, groundHeightAt(-2.4, 37.8), 37.8);
  const foldedCloth = new THREE.Mesh(
    trackGeo(createSoftPillowGeometry(0.32, 1.3, 0.22, 12, 8)),
    mats.indigoCloth
  );
  foldedCloth.scale.set(1.1, 1.0, 0.78);
  foldedCloth.position.y = 0.05;
  malletGroup.add(foldedCloth);

  const turnedMalletGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.26],
        [0.032, -0.25],
        [0.024, -0.1],
        [0.048, -0.02],
        [0.064, 0.08],
        [0.058, 0.22],
        [0.04, 0.26],
        [0.0, 0.27],
      ],
      14
    )
  );
  const mallet = new THREE.Mesh(turnedMalletGeo, mats.weatheredWoodDoor);
  mallet.rotation.z = Math.PI * 0.5;
  mallet.rotation.y = 0.28;
  mallet.position.set(0.04, 0.13, 0.04);
  malletGroup.add(mallet);
  root.add(malletGroup);

  // Unified Sculpted Golden Rice Drying Mats on He-Ping Courtyard ([5.2, 29.2] & [-6.0, 28.8])
  // Supports continuous 0%..100% progressive spreading, central gathering mound, dynamic harvest baskets,
  // and neatly rolled bamboo mat stowage at night/rain (zero binary visible popping!).
  const grainMoundGeo = trackGeo(new THREE.PlaneGeometry(4.9, 3.1, 18, 12));
  grainMoundGeo.rotateX(-Math.PI * 0.5);
  {
    const pos = grainMoundGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nx = x / 2.45;
      const nz = z / 1.55;
      const edgeFade = Math.max(0, 1 - nx * nx * 0.85) * Math.max(0, 1 - nz * nz * 0.85);
      const rakeWaves = 0.03 * Math.sin(x * 4.8 + Math.sin(z * 1.4) * 0.6);
      pos.setY(i, 0.025 + (0.14 + rakeWaves) * Math.pow(edgeFade, 0.48));
    }
    grainMoundGeo.computeVertexNormals();
  }
  const centerHeapGeo = trackGeo(
    new THREE.SphereGeometry(1.15, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)
  );
  const rolledMatGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 5.42, 12));
  rolledMatGeo.rotateZ(Math.PI * 0.5);
  const basketShellGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.24, 0.0],
        [0.32, 0.14],
        [0.36, 0.34],
        [0.39, 0.42],
        [0.35, 0.42],
        [0.32, 0.34],
        [0.28, 0.12],
        [0.22, 0.04],
        [0.0, 0.04],
      ],
      14
    )
  );
  const basketGrainGeo = trackGeo(
    new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)
  );

  const matBorderLongGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 5.45, 8));
  matBorderLongGeo.rotateZ(Math.PI * 0.5);
  const matBorderShortGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 3.65, 8));
  matBorderShortGeo.rotateX(Math.PI * 0.5);

  const grainMatGroups: THREE.Group[] = [];
  const grainTarpCovers: THREE.Mesh[] = [];
  const rainTarpMat = createPaintedWoodMat(0x526b5c, trackMat, 0.78);
  const rainTarpGeo = trackGeo(new THREE.PlaneGeometry(5.15, 3.35, 14, 10));
  rainTarpGeo.rotateX(-Math.PI * 0.5);
  {
    const pos = rainTarpGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nx = x / 2.575;
      const nz = z / 1.675;
      const dome = Math.max(0, 1 - nx * nx * 0.8) * Math.max(0, 1 - nz * nz * 0.8);
      const fold = 0.02 * Math.sin(x * 3.8 + z * 1.6);
      pos.setY(i, 0.055 + (0.28 + fold) * Math.pow(dome, 0.55));
    }
    rainTarpGeo.computeVertexNormals();
  }

  interface GrainStationVisual {
    unrolledGroup: THREE.Group;
    rolledBundle: THREE.Mesh;
    spreadLayer: THREE.Mesh;
    centerHeap: THREE.Mesh;
    baskets: Array<{ group: THREE.Group; fill: THREE.Mesh; baseX: number; baseZ: number }>;
    tarpCover: THREE.Mesh;
  }
  const grainStations: GrainStationVisual[] = [];

  for (const [mx, mz] of [
    [5.2, 29.2],
    [-6.0, 28.8],
  ]) {
    const matGroup = new THREE.Group();
    matGroup.position.set(mx, 0.02, mz);

    // Unrolled flat woven bamboo mat pivoted along north edge so it unrolls/rolls smoothly
    const unrolledGroup = new THREE.Group();
    unrolledGroup.position.set(0, 0, -1.8);
    const matInner = new THREE.Group();
    matInner.position.set(0, 0, 1.8);
    const bambooBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.4, 0.036, 3.6)), bambooMat);
    bambooBase.position.y = 0.018;
    bambooBase.receiveShadow = true;
    matInner.add(bambooBase);

    for (const sz of [-1.8, 1.8]) {
      const rail = new THREE.Mesh(matBorderLongGeo, mats.weatheredWoodDoor);
      rail.position.set(0, 0.038, sz);
      matInner.add(rail);
    }
    for (const sx of [-2.7, 2.7]) {
      const rail = new THREE.Mesh(matBorderShortGeo, mats.weatheredWoodDoor);
      rail.position.set(sx, 0.038, 0);
      matInner.add(rail);
    }
    unrolledGroup.add(matInner);
    matGroup.add(unrolledGroup);

    // Neatly rolled bamboo mat cylinder resting on the north edge when retracted at night/rain
    const rolledBundle = new THREE.Mesh(rolledMatGeo, bambooMat);
    rolledBundle.position.set(0, 0.16, -1.8);
    rolledBundle.castShadow = castShadow;
    rolledBundle.receiveShadow = true;
    matGroup.add(rolledBundle);

    // Layer A: Progressive spreading combed golden paddy grain bed
    const spreadLayer = new THREE.Mesh(grainMoundGeo, mats.goldenGrain);
    spreadLayer.position.y = 0.025;
    spreadLayer.receiveShadow = true;
    matGroup.add(spreadLayer);

    // Layer B: Central raked/poured golden grain cone (grows as farmers rake inward, flattens as they spread outward!)
    const centerHeap = new THREE.Mesh(centerHeapGeo, mats.goldenGrain);
    centerHeap.position.y = 0.03;
    centerHeap.castShadow = castShadow;
    centerHeap.receiveShadow = true;
    matGroup.add(centerHeap);

    // Paired woven bamboo harvest baskets (谷筐) beside the mat with dynamic grain fill level
    const stationBaskets: GrainStationVisual['baskets'] = [];
    for (const [bx, bz] of [
      [-3.15, -1.15],
      [3.15, -1.15],
    ]) {
      const bg = new THREE.Group();
      bg.position.set(bx, 0, bz);
      const shell = new THREE.Mesh(basketShellGeo, bambooMat);
      shell.castShadow = castShadow;
      shell.receiveShadow = true;
      bg.add(shell);
      const rim = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.37, 0.024, 6, 16)),
        mats.weatheredWoodDoor
      );
      rim.rotation.x = Math.PI * 0.5;
      rim.position.y = 0.42;
      bg.add(rim);
      const fill = new THREE.Mesh(basketGrainGeo, mats.goldenGrain);
      fill.position.y = 0.12;
      fill.scale.set(0.95, 0.48, 0.95);
      bg.add(fill);
      matGroup.add(bg);
      stationBaskets.push({ group: bg, fill, baseX: bx, baseZ: bz });
    }

    // Rain-shelter woven oilcloth tarp (only smoothly scales over remaining pile if needed)
    const tarpCover = new THREE.Mesh(rainTarpGeo, rainTarpMat);
    tarpCover.position.y = 0.04;
    tarpCover.visible = false;
    tarpCover.castShadow = castShadow;
    tarpCover.receiveShadow = true;
    matGroup.add(tarpCover);
    grainTarpCovers.push(tarpCover);

    root.add(matGroup);
    grainMatGroups.push(matGroup);
    grainStations.push({
      unrolledGroup,
      rolledBundle,
      spreadLayer,
      centerHeap,
      baskets: stationBaskets,
      tarpCover,
    });
  }

  // Handcrafted leaning 7-tooth wooden grain push-rake resting beside East mat (smoothly tucked when stowed)
  const grainStaticRake = new THREE.Group();
  grainStaticRake.position.set(7.6, 0.14, 28.2);
  const rakePole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.028, 0.032, 2.15, 10)), bambooMat);
  rakePole.rotation.z = 0.55;
  rakePole.position.set(0.52, 0.85, 0);
  grainStaticRake.add(rakePole);
  const rakeBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.075, 0.16, 0.94)), mats.darkTimber);
  rakeBlade.position.set(-0.02, 0.12, 0);
  grainStaticRake.add(rakeBlade);
  for (let t = -3; t <= 3; t++) {
    const tooth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 6)), mats.weatheredWoodDoor);
    tooth.position.set(-0.02, 0.03, t * 0.13);
    grainStaticRake.add(tooth);
  }
  root.add(grainStaticRake);

  const updateGrainDrying = (
    spreadProgress: number,
    basketFill: number,
    matDeployed: number,
    timeSec: number,
    isGathering: boolean
  ) => {
    const sp = Math.max(0, Math.min(1, spreadProgress));
    const bf = Math.max(0, Math.min(1, basketFill));
    const md = Math.max(0, Math.min(1, matDeployed));

    for (let i = 0; i < grainStations.length; i++) {
      const st = grainStations[i];
      // 1. Bamboo mat continuously unrolls (md 0 -> 1) and rolls into a neat cylinder (md 1 -> 0)
      st.unrolledGroup.scale.set(1, 1, Math.max(0.015, md));
      st.unrolledGroup.visible = md > 0.02;
      const rollFactor = 1.0 - md;
      const rollScale = 0.32 + rollFactor * 0.78;
      st.rolledBundle.scale.set(1, rollScale, rollScale);
      st.rolledBundle.position.y = 0.16 * rollScale;
      st.rolledBundle.position.z = -1.8 + md * 0.04;
      st.rolledBundle.visible = rollFactor > 0.03;

      // 2. Spread golden rice layer expands outward progressively from center (0% -> 100%)
      const areaFactor = Math.pow(sp, 0.65);
      const sx = 0.16 + areaFactor * 0.84;
      const sz = 0.18 + areaFactor * 0.82;
      const sy = sp > 0.01 ? 0.25 + Math.sin(Math.min(1, sp) * Math.PI * 0.5) * 0.78 : 0.001;
      const rakeRipple = isGathering && sp > 0.05 ? 1 + Math.sin(timeSec * 6.5 + i) * 0.02 : 1;
      st.spreadLayer.scale.set(sx * rakeRipple, sy, sz);
      st.spreadLayer.visible = sp > 0.012 && md > 0.25;

      // 3. Central gathering heap peaks during transitional spreading/raking (sp around 0.1..0.65)
      // and subsides cleanly as rice either flattens evenly (sp -> 1) or enters baskets (sp -> 0)
      const heapBell = Math.sin(Math.min(1, sp * 1.15) * Math.PI) * (isGathering ? 1.25 : 0.92);
      const heapScaleXZ = 0.28 + heapBell * 0.76;
      const heapScaleY = Math.max(0.01, heapBell * 0.44);
      st.centerHeap.scale.set(heapScaleXZ, heapScaleY, heapScaleXZ * 0.82);
      st.centerHeap.visible = heapBell > 0.035 && md > 0.2;

      // 4. Woven harvest baskets smoothly fill up as rice is gathered, and slide closer to the mat edge when active
      for (let b = 0; b < st.baskets.length; b++) {
        const bk = st.baskets[b];
        // Tuck baskets gently toward north veranda edge as mat rolls up
        const stowLerp = 1.0 - md;
        bk.group.position.set(
          bk.baseX * (1 - stowLerp * 0.15),
          0,
          bk.baseZ - stowLerp * 0.65
        );
        const fillH = Math.max(0.02, bf * 0.56);
        bk.fill.scale.set(0.84 + bf * 0.16, fillH, 0.84 + bf * 0.16);
        bk.fill.position.y = 0.07 + bf * 0.25;
        bk.fill.visible = bf > 0.03;
      }

      // Tarp stays tucked away now that grain progressively gathers into baskets (zero abrupt tarp pop!)
      st.tarpCover.visible = false;
    }

    // Push-rake rests neatly flat beside the east end of the rolled bamboo mat when stowed
    const rakeFlat = 1.0 - md;
    grainStaticRake.position.set(7.9 + rakeFlat * 0.65, 0.14 - rakeFlat * 0.08, 28.4 - rakeFlat * 1.15);
    grainStaticRake.rotation.set(0, rakeFlat * 0.42, -rakeFlat * 1.02);
    grainStaticRake.visible = true;
  };

  // =========================================================================
  // 03. LOWER HALL: OIL-PAPER UMBRELLA RACK (4 COLORFUL UMBRELLAS) & DOULI HAT
  // =========================================================================
  const umbGroup = new THREE.Group();
  umbGroup.position.set(-4.2, 0.25, 19.2);
  addShadowDisc(umbGroup, 0.72);
  // Carved wooden umbrella stand barrel
  const standGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.24, 0.0],
        [0.27, 0.18],
        [0.24, 0.44],
        [0.28, 0.56],
        [0.23, 0.58],
        [0.21, 0.08],
        [0.0, 0.08],
      ],
      14
    )
  );
  umbGroup.add(new THREE.Mesh(standGeo, mats.darkTimber));

  // Open vermilion oil-paper umbrella with curved canopy & 8 bamboo ribs
  const umbShaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.02, 0.022, 1.38, 8)), bambooMat);
  umbShaft.position.set(-0.06, 0.72, 0);
  umbShaft.rotation.z = 0.08;
  umbGroup.add(umbShaft);

  const openCanopyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.24],
        [0.18, 0.215],
        [0.42, 0.15],
        [0.64, 0.06],
        [0.74, 0.0],
      ],
      18
    )
  );
  const openCanopy = new THREE.Mesh(
    openCanopyGeo,
    trackMat(new THREE.MeshStandardMaterial({ color: HANDCRAFTED_PAL.verm, roughness: 0.44, side: THREE.DoubleSide }))
  );
  openCanopy.position.set(-0.12, 1.2, 0);
  openCanopy.rotation.z = 0.08;
  umbGroup.add(openCanopy);

  const umbRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.735, 0.016, 6, 20)), creamSilkMat);
  umbRim.rotation.x = Math.PI * 0.5;
  umbRim.rotation.y = 0.08;
  umbRim.position.set(-0.12, 1.2, 0);
  umbGroup.add(umbRim);

  // 3 folded colorful oil-paper umbrellas tucked inside the stand
  const foldedSpecs: Array<[number, number, number, THREE.Material]> = [
    [0.09, 0.06, -0.18, ceruleanMat],
    [0.04, -0.09, 0.16, lemonMat],
    [-0.08, 0.09, -0.14, peachMat],
  ];
  foldedSpecs.forEach(([fx, fz, tilt, mat]) => {
    const fUmb = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.022, 0.88, 10)), mat);
    fUmb.position.set(fx, 0.62, fz);
    fUmb.rotation.z = tilt;
    fUmb.rotation.x = tilt * 0.6;
    umbGroup.add(fUmb);
  });

  // Curved bamboo Douli hat resting beside the stand
  const hatGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.42, 0.0],
        [0.32, 0.055],
        [0.18, 0.125],
        [0.05, 0.18],
        [0.0, 0.195],
      ],
      16
    )
  );
  const hatCone = new THREE.Mesh(hatGeo, bambooMat);
  hatCone.position.set(0.58, 0.02, 0.24);
  hatCone.rotation.z = -0.16;
  umbGroup.add(hatCone);
  root.add(umbGroup);

  // =========================================================================
  // 04. FRONT SKYWELL: GLAZED TAIPING WATER VAT & 12-RIBBED BAMBOO BIRDCAGE
  // =========================================================================
  const vatGroup = new THREE.Group();
  vatGroup.position.set(-3.4, 0.15, 13.6);
  addShadowDisc(vatGroup, 0.74);
  const vatGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.42, 0.0],
        [0.58, 0.24],
        [0.64, 0.52],
        [0.6, 0.8],
        [0.54, 0.89],
        [0.58, 0.94],
        [0.5, 0.94],
        [0.48, 0.84],
      ],
      20
    )
  );
  const vatBody = new THREE.Mesh(vatGeo, mats.terracotta);
  vatBody.castShadow = castShadow;
  vatGroup.add(vatBody);

  // Twin bronze side lug rings on the water vat
  for (const sx of [-1, 1]) {
    const lug = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.065, 0.018, 6, 12)), mats.bronzeMetal);
    lug.position.set(sx * 0.62, 0.68, 0);
    lug.rotation.y = Math.PI * 0.5;
    vatGroup.add(lug);
  }

  const vatWater = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.49, 18)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x2c7872, roughness: 0.16, metalness: 0.22 }))
  );
  vatWater.rotation.x = -Math.PI * 0.5;
  vatWater.position.y = 0.83;
  vatGroup.add(vatWater);

  // Floating green duckweed pads + tiny golden carp inside vat
  const duckweedMat = createPaintedWoodMat(0x55a85e, trackMat, 0.72);
  for (let d = 0; d < 5; d++) {
    const a = d * 1.25;
    const dw = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.055 + (d % 2) * 0.022, 8)), duckweedMat);
    dw.rotation.x = -Math.PI * 0.5;
    dw.position.set(Math.cos(a) * 0.24, 0.838, Math.sin(a) * 0.24);
    vatGroup.add(dw);
  }
  const vatKoi = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.045, 8, 6)), vermMat);
  vatKoi.scale.set(0.6, 0.4, 1.8);
  vatKoi.position.set(-0.08, 0.82, 0.06);
  vatGroup.add(vatKoi);
  root.add(vatGroup);

  // Domed 12-ribbed bamboo birdcage anchored cleanly beneath East Front Skywell veranda eave purlin (x=4.92, bottom y=3.08)
  const birdcageGroup = new THREE.Group();
  birdcageGroup.position.set(4.92, 3.08, 14.65);

  // Forged-brass beam bracket & curved S-hook clasping directly onto the x=4.92 cedar veranda eave purlin
  const eaveMountBracket = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.16, 0.04, 0.06)),
    mats.bronzeMetal
  );
  eaveMountBracket.position.set(0, 0.015, 0);
  birdcageGroup.add(eaveMountBracket);
  const eaveEyeRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.032, 0.009, 6, 12)),
    mats.bronzeMetal
  );
  eaveEyeRing.position.set(0, -0.025, 0);
  birdcageGroup.add(eaveEyeRing);
  const cageCord = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.011, 0.011, 0.64, 6)),
    mats.bronzeMetal
  );
  cageCord.position.y = -0.35;
  birdcageGroup.add(cageCord);
  // Traditional ornate curved brass cage hook (笼钩) + carved gourd finial (葫芦顶)
  const cageHook = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.052, 0.011, 6, 14, Math.PI * 1.45)),
    mats.gildedGold
  );
  cageHook.position.y = -0.70;
  cageHook.rotation.z = -0.3;
  birdcageGroup.add(cageHook);
  const cageFinial = new THREE.Mesh(
    trackGeo(
      createTurnedLatheGeometry(
        [
          [0.015, -0.05],
          [0.038, -0.02],
          [0.024, 0.015],
          [0.030, 0.04],
          [0.008, 0.068],
        ],
        10
      )
    ),
    bambooMat
  );
  cageFinial.position.y = -0.79;
  birdcageGroup.add(cageFinial);

  // Horizontal bamboo hoop rings (spaced cleanly above and below perched Hwamei so its silhouette is unobstructed)
  for (const [ry, rr] of [
    [-1.36, 0.3],
    [-0.96, 0.285],
    [-0.85, 0.245],
  ]) {
    const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(rr, 0.012, 6, 20)), bambooMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = ry;
    birdcageGroup.add(ring);
  }
  // 16 fine vertical bamboo cage ribs arching cleanly into the dome
  const cageRibGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0.3, -1.36, 0),
        new THREE.Vector3(0.3, -1.06, 0),
        new THREE.Vector3(0.24, -0.88, 0),
        new THREE.Vector3(0.0, -0.80, 0),
      ],
      0.007,
      0.006,
      10,
      5
    )
  );
  for (let r = 0; r < 16; r++) {
    const rib = new THREE.Mesh(cageRibGeo, bambooMat);
    rib.rotation.y = (r / 16) * Math.PI * 2;
    birdcageGroup.add(rib);
  }
  const cageBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.31, 0.28, 0.09, 18)), mats.darkTimber);
  cageBase.position.y = -1.4;
  birdcageGroup.add(cageBase);
  // Pair of porcelain seed & water cups clipped inside the lower hoop
  const cupMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xecf0f4, roughness: 0.24, metalness: 0.04 }));
  const cupGeo = trackGeo(new THREE.CylinderGeometry(0.036, 0.028, 0.048, 10));
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(side * 0.22, -1.24, 0.08);
    birdcageGroup.add(cup);
  }
  // Natural turned bamboo perch bar (栖木) spanning cage diameter at y = -1.20
  const perch = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.57, 10)), bambooMat);
  perch.rotation.z = Math.PI * 0.5;
  perch.position.y = -1.2;
  birdcageGroup.add(perch);

  // =========================================================================
  // HIGH-FIDELITY REALISTIC CHINESE HWAMEI SONGBIRD (中华画眉鸟 Garrulax canorus)
  // =========================================================================
  // Procedural streaked olive-brown / warm ochre plumage texture (head/back streaks + warm tawny breast)
  const makeHwameiPlumageTex = (): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    // Base warm olive-ochre-brown gradient from crown/back to softer buff-tawny underside
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#7c5a2c'); // olive-brown crown/upper back
    grad.addColorStop(0.35, '#8e6632'); // warm cinnamon-olive mantle
    grad.addColorStop(0.68, '#ab7e42'); // ochre-tawny breast
    grad.addColorStop(1.0, '#cfb280'); // warm pale-buff belly
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    // Fine dark sepia-umber longitudinal shaft streaks (标志性头顶至背部与胸部的细密暗色纵纹)
    for (let i = 0; i < 260; i++) {
      const sx = ((i * 73) % 256);
      const sy = ((i * 41) % 210);
      const len = 10 + (i % 16);
      const w = 1.1 + (i % 3) * 0.55;
      ctx.fillStyle = sy < 120 ? 'rgba(42, 26, 12, 0.56)' : 'rgba(68, 42, 18, 0.34)';
      ctx.fillRect(sx, sy, w, len);
      // Soft lighter feather barb highlight beside each dark shaft
      ctx.fillStyle = 'rgba(218, 182, 122, 0.22)';
      ctx.fillRect(sx + w, sy + 1, 1.0, len * 0.8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    localTextures.push(tex);
    return tex;
  };
  const hwameiPlumageTex = makeHwameiPlumageTex();
  const hwameiBodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: hwameiPlumageTex,
      roughness: 0.78,
      metalness: 0.0,
    })
  );
  const hwameiWingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b5629,
      map: hwameiPlumageTex,
      roughness: 0.80,
      metalness: 0.0,
    })
  );
  const hwameiPrimaryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4f3518,
      roughness: 0.84,
      metalness: 0.0,
    })
  );
  const hwameiBellyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9a36a,
      roughness: 0.82,
      metalness: 0.0,
    })
  );
  const hwameiWhiteBrowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbfaf4,
      roughness: 0.55,
      metalness: 0.0,
    })
  );
  const hwameiBeakMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9a13d,
      roughness: 0.36,
      metalness: 0.04,
    })
  );
  const hwameiBeakTipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7e5a24,
      roughness: 0.42,
      metalness: 0.04,
    })
  );
  const hwameiEyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111012,
      roughness: 0.12,
      metalness: 0.18,
    })
  );
  const hwameiLegMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb99156,
      roughness: 0.64,
      metalness: 0.02,
    })
  );

  // Root bird assembly seated precisely on the bamboo perch at y = -1.20,
  // posed in a classic three-quarter profile toward Front Skywell so its white eyebrow, curved beak & tail read clearly
  const hwameiRoot = new THREE.Group();
  hwameiRoot.position.set(0, -1.20, 0);
  hwameiRoot.rotation.y = -Math.PI * 0.14;
  birdcageGroup.add(hwameiRoot);

  // 1. Articulated legs & 4-toed claws physically gripping around the r = 0.014 bamboo perch
  const toeCurveFrontGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0.014, 0.003),
        new THREE.Vector3(0, 0.013, 0.014),
        new THREE.Vector3(0, 0.002, 0.019),
        new THREE.Vector3(0, -0.009, 0.014),
      ],
      0.0026,
      0.0014,
      6,
      5
    )
  );
  const toeCurveRearGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0.014, -0.003),
        new THREE.Vector3(0, 0.011, -0.015),
        new THREE.Vector3(0, -0.002, -0.017),
        new THREE.Vector3(0, -0.010, -0.011),
      ],
      0.0026,
      0.0014,
      6,
      5
    )
  );
  const tarsusGeo = trackGeo(new THREE.CylinderGeometry(0.0034, 0.0028, 0.044, 6));
  const thighGeo = trackGeo(new THREE.SphereGeometry(0.015, 8, 6));

  for (const side of [-1, 1]) {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.022, 0, 0);
    // 3 forward toes gripping front of perch + 1 hallux gripping rear of perch
    for (const yaw of [-0.34, 0, 0.34]) {
      const fToe = new THREE.Mesh(toeCurveFrontGeo, hwameiLegMat);
      fToe.rotation.y = yaw;
      legGroup.add(fToe);
    }
    const rToe = new THREE.Mesh(toeCurveRearGeo, hwameiLegMat);
    legGroup.add(rToe);
    // Slender tarsus rising slightly backward to feathered thigh
    const tarsus = new THREE.Mesh(tarsusGeo, hwameiLegMat);
    tarsus.position.set(0, 0.032, -0.006);
    tarsus.rotation.x = -0.26;
    legGroup.add(tarsus);
    const thigh = new THREE.Mesh(thighGeo, hwameiBellyMat);
    thigh.scale.set(0.85, 1.15, 0.95);
    thigh.position.set(0, 0.056, -0.014);
    legGroup.add(thigh);
    hwameiRoot.add(legGroup);
  }

  // 2. Plump natural passerine torso (tilted gracefully upward at ~28° alert Hwamei stance)
  const hwameiBodyGroup = new THREE.Group();
  hwameiBodyGroup.position.set(0, 0.072, -0.008);
  hwameiRoot.add(hwameiBodyGroup);

  const torsoGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.005, -0.088],
        [0.026, -0.068],
        [0.048, -0.032],
        [0.058, 0.008],
        [0.056, 0.046],
        [0.042, 0.076],
        [0.024, 0.094],
        [0.004, 0.100],
      ],
      16
    )
  );
  const torsoMesh = new THREE.Mesh(torsoGeo, hwameiBodyMat);
  torsoMesh.rotation.x = Math.PI * 0.5 - 0.50; // natural uplifted breast & sloped back
  torsoMesh.scale.set(0.88, 1.0, 0.96);
  hwameiBodyGroup.add(torsoMesh);

  // Soft warm buff-ochre chest & belly contour pad
  const chestPad = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.046, 12, 10)), hwameiBellyMat);
  chestPad.scale.set(0.88, 0.96, 1.14);
  chestPad.position.set(0, -0.004, 0.026);
  hwameiBodyGroup.add(chestPad);

  // 3. Sculpted folded layered wings (left & right with covert & dark primary feather tiers)
  const wingShellGeo = trackGeo(new THREE.SphereGeometry(0.054, 12, 10));
  const wingTipGeo = trackGeo(new THREE.ConeGeometry(0.018, 0.082, 7));
  const hwameiWingLeft = new THREE.Group();
  const hwameiWingRight = new THREE.Group();
  for (const [side, wg] of [
    [-1, hwameiWingLeft],
    [1, hwameiWingRight],
  ] as const) {
    wg.position.set(side * 0.038, 0.008, -0.006);
    const covert = new THREE.Mesh(wingShellGeo, hwameiWingMat);
    covert.scale.set(0.36, 0.66, 1.38);
    covert.rotation.set(-0.44, side * 0.14, side * -0.14);
    wg.add(covert);
    // Layered darker primary flight feather tips tapering neatly toward rump
    for (let f = 0; f < 3; f++) {
      const feather = new THREE.Mesh(wingTipGeo, f === 2 ? hwameiPrimaryMat : hwameiWingMat);
      feather.scale.set(0.45, 1.0, 0.95);
      feather.rotation.set(-Math.PI * 0.5 - 0.38 - f * 0.05, side * 0.08, 0);
      feather.position.set(side * (0.005 - f * 0.003), -0.020 - f * 0.006, -0.056 - f * 0.012);
      wg.add(feather);
    }
    hwameiBodyGroup.add(wg);
  }

  // 4. Graduated tiered tail feathers (5 overlapping rounded olive-brown tail blades)
  const hwameiTailPivot = new THREE.Group();
  hwameiTailPivot.position.set(0, -0.026, -0.072);
  hwameiTailPivot.rotation.x = -0.34;
  hwameiBodyGroup.add(hwameiTailPivot);
  const tailBladeGeo = trackGeo(new THREE.BoxGeometry(0.017, 0.004, 0.135));
  for (let tIdx = -2; tIdx <= 2; tIdx++) {
    const absIdx = Math.abs(tIdx);
    const blade = new THREE.Mesh(tailBladeGeo, absIdx === 0 ? hwameiWingMat : hwameiPrimaryMat);
    const lenScale = 1.0 - absIdx * 0.10;
    blade.scale.set(1.0, 1.0, lenScale);
    blade.position.set(tIdx * 0.0085, -absIdx * 0.0022, -0.064 * lenScale);
    blade.rotation.y = -tIdx * 0.065;
    hwameiTailPivot.add(blade);
  }

  // 5. Articulated Hwamei Head Group with ICONIC flush white eye-ring + long sweeping white eyebrow, glossy eyes & decurved amber beak
  // Smooth feathered neck bridge connecting breast to head cleanly
  const neckBridge = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.036, 12, 10)), hwameiBodyMat);
  neckBridge.scale.set(0.86, 1.08, 0.96);
  neckBridge.position.set(0, 0.044, 0.042);
  hwameiBodyGroup.add(neckBridge);

  const hwameiHeadPivot = new THREE.Group();
  hwameiHeadPivot.position.set(0, 0.060, 0.056);
  hwameiBodyGroup.add(hwameiHeadPivot);

  // Rounded olive-brown crown & warm tawny cheek volume with subtle erectile crown feathers
  const headSkull = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.038, 16, 14)), hwameiBodyMat);
  headSkull.scale.set(0.88, 0.94, 1.18);
  headSkull.position.set(0, 0.018, 0.008);
  hwameiHeadPivot.add(headSkull);

  const crownCrest = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.025, 12, 8)), hwameiBodyMat);
  crownCrest.scale.set(0.76, 0.48, 1.32);
  crownCrest.position.set(0, 0.044, -0.004);
  crownCrest.rotation.x = -0.20;
  hwameiHeadPivot.add(crownCrest);

  // Signature snow-white eye-ring (白眼圈) flush on cheek + long sweeping pure-white eyebrow (白色画眉线) extending gracefully to nape!
  const eyeRingGeo = trackGeo(new THREE.TorusGeometry(0.0088, 0.0022, 8, 18));
  const eyeBallGeo = trackGeo(new THREE.SphereGeometry(0.0066, 10, 8));
  const eyeGlintGeo = trackGeo(new THREE.SphereGeometry(0.0018, 6, 6));
  const browStripeLeftGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(-0.0265, 0.024, 0.027),
        new THREE.Vector3(-0.0312, 0.0265, 0.014),
        new THREE.Vector3(-0.0315, 0.0270, -0.004),
        new THREE.Vector3(-0.0262, 0.0245, -0.024),
        new THREE.Vector3(-0.0165, 0.0205, -0.038),
      ],
      0.0042,
      0.0012,
      10,
      6
    )
  );
  const browStripeRightGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0.0265, 0.024, 0.027),
        new THREE.Vector3(0.0312, 0.0265, 0.014),
        new THREE.Vector3(0.0315, 0.0270, -0.004),
        new THREE.Vector3(0.0262, 0.0245, -0.024),
        new THREE.Vector3(0.0165, 0.0205, -0.038),
      ],
      0.0042,
      0.0012,
      10,
      6
    )
  );

  for (const side of [-1, 1]) {
    // Flush crisp white spectacle ring encircling the eye (flattened laterally so it hugs head plumage naturally)
    const eyeRing = new THREE.Mesh(eyeRingGeo, hwameiWhiteBrowMat);
    eyeRing.position.set(side * 0.0272, 0.023, 0.0225);
    eyeRing.rotation.y = side * (Math.PI * 0.5 - 0.28);
    eyeRing.scale.set(1.06, 0.96, 0.52);
    hwameiHeadPivot.add(eyeRing);

    // Glossy obsidian eye recessed cleanly inside the white eye-ring + tiny lively specular catchlight
    const eyeBall = new THREE.Mesh(eyeBallGeo, hwameiEyeMat);
    eyeBall.position.set(side * 0.0262, 0.023, 0.0225);
    eyeBall.scale.set(0.75, 1.0, 1.0);
    hwameiHeadPivot.add(eyeBall);
    const glint = new THREE.Mesh(eyeGlintGeo, hwameiWhiteBrowMat);
    glint.position.set(side * 0.0308, 0.0252, 0.0252);
    hwameiHeadPivot.add(glint);

    // Iconic elongated pure-white "painted eyebrow" supercilium sweeping cleanly back behind the eye
    const brow = new THREE.Mesh(
      side < 0 ? browStripeLeftGeo : browStripeRightGeo,
      hwameiWhiteBrowMat
    );
    hwameiHeadPivot.add(brow);
  }

  // Gently decurved yellow-brown / horn-amber upper & articulated lower beak (微弯黄褐色喙)
  const upperBeakGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0.0205, 0.042),
        new THREE.Vector3(0, 0.0195, 0.059),
        new THREE.Vector3(0, 0.0155, 0.074),
        new THREE.Vector3(0, 0.010, 0.085),
      ],
      0.0080,
      0.0015,
      8,
      7
    )
  );
  const upperBeak = new THREE.Mesh(upperBeakGeo, hwameiBeakMat);
  upperBeak.scale.set(0.78, 0.84, 1.0);
  hwameiHeadPivot.add(upperBeak);
  const beakTip = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.0026, 0.013, 6)), hwameiBeakTipMat);
  beakTip.position.set(0, 0.009, 0.086);
  beakTip.rotation.x = Math.PI * 0.5 + 0.42;
  hwameiHeadPivot.add(beakTip);

  const hwameiLowerBeakPivot = new THREE.Group();
  hwameiLowerBeakPivot.position.set(0, 0.014, 0.042);
  const lowerBeakGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -0.001, 0.017),
        new THREE.Vector3(0, -0.0028, 0.034),
      ],
      0.0062,
      0.0014,
      6,
      6
    )
  );
  const lowerBeak = new THREE.Mesh(lowerBeakGeo, hwameiBeakMat);
  lowerBeak.scale.set(0.74, 0.66, 1.0);
  hwameiLowerBeakPivot.add(lowerBeak);
  hwameiHeadPivot.add(hwameiLowerBeakPivot);

  root.add(birdcageGroup);

  // Natural Hwamei micro-animation driver (alert head turns, singing trill, breathing & tail bob)
  const updateHwameiBird = (timeSec: number, _dt: number, excited: number) => {
    const breath = Math.sin(timeSec * 3.8);
    // Periodic cheerful song bursts + immediate excited song when user taps the cage
    const songCycle = Math.sin(timeSec * 0.65);
    const isSinging = excited > 0.08 || songCycle > 0.68;
    const songAmp = Math.max(excited, isSinging ? (songCycle - 0.68) * 2.8 : 0);

    // Subtle body breathing & lively singing hop/lean
    hwameiBodyGroup.position.y = 0.072 + breath * 0.0025 + Math.abs(Math.sin(timeSec * 10.0)) * songAmp * 0.004;
    hwameiBodyGroup.rotation.x = -0.05 * songAmp + breath * 0.025;

    // Curious passerine head turning & cocking (smooth quantized-feeling glance rhythm)
    const glanceWave = Math.sin(timeSec * 1.15) * 0.42 + Math.sin(timeSec * 2.75) * 0.16;
    hwameiHeadPivot.rotation.y = glanceWave * (1.0 - songAmp * 0.45);
    hwameiHeadPivot.rotation.z = Math.sin(timeSec * 0.85 + 1.2) * 0.14;
    hwameiHeadPivot.rotation.x = -0.22 * songAmp + Math.sin(timeSec * 1.9) * 0.06;

    // Articulated lower mandible trilling open while singing
    const trill = isSinging ? (0.5 + 0.5 * Math.sin(timeSec * 26.0)) * (0.14 + songAmp * 0.24) : 0.0;
    hwameiLowerBeakPivot.rotation.x = trill;

    // Expressive tail dip & occasional subtle wing flick
    hwameiTailPivot.rotation.x = -0.34 + Math.sin(timeSec * 2.4) * 0.06 + Math.sin(timeSec * 14.0) * songAmp * 0.10;
    const wingFlick = Math.pow(Math.max(0, Math.sin(timeSec * 1.7 + 0.5)), 16) * 0.09 + songAmp * 0.05 * Math.sin(timeSec * 16.0);
    hwameiWingLeft.rotation.z = wingFlick;
    hwameiWingRight.rotation.z = -wingFlick;
  };

  // =========================================================================
  // 05. MIDDLE HALL: EIGHT-IMMORTALS TABLE, TAISHI ARMCHAIRS, ABACUS, GENEALOGY
  // =========================================================================
  const tableGroup = new THREE.Group();
  tableGroup.position.set(0, 0.45, 8.0);
  addShadowDisc(tableGroup, 1.4);
  const tableTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.14, 0.09, 1.48)), mats.darkTimber);
  tableTop.position.y = 0.86;
  tableTop.castShadow = castShadow;
  tableGroup.add(tableTop);
  const tableApron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.92, 0.14, 1.26)), mats.weatheredWoodDoor);
  tableApron.position.y = 0.75;
  tableGroup.add(tableApron);
  for (const [lx, lz] of [
    [-0.9, -0.6],
    [0.9, -0.6],
    [-0.9, 0.6],
    [0.9, 0.6],
  ]) {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.105, 0.86, 0.105)), mats.darkTimber);
    leg.position.set(lx, 0.43, lz);
    tableGroup.add(leg);
  }
  // Stretcher bars
  for (const sz of [-0.6, 0.6]) {
    const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.8, 0.05, 0.05)), mats.darkTimber);
    rail.position.set(0, 0.22, sz);
    tableGroup.add(rail);
  }

  // Detailed 9-rod Chinese wooden abacus (九档算盘)
  const abacus = new THREE.Group();
  abacus.position.set(-0.55, 0.92, 0.12);
  abacus.add(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.58, 0.04, 0.28)), mats.redLacquer));
  const divider = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.54, 0.044, 0.022)), mats.darkTimber);
  divider.position.z = -0.04;
  abacus.add(divider);
  const beadGeo = trackGeo(new THREE.SphereGeometry(0.022, 7, 6));
  for (let b = -4; b <= 4; b++) {
    const bx = b * 0.056;
    const topBead = new THREE.Mesh(beadGeo, mats.gildedGold);
    topBead.scale.set(1, 0.7, 1);
    topBead.position.set(bx, 0.022, -0.085);
    abacus.add(topBead);
    for (let k = 0; k < 2; k++) {
      const botBead = new THREE.Mesh(beadGeo, mats.gildedGold);
      botBead.scale.set(1, 0.7, 1);
      botBead.position.set(bx, 0.022, 0.02 + k * 0.048);
      abacus.add(botBead);
    }
  }
  tableGroup.add(abacus);

  // Thread-bound clan genealogy book (线装族谱) with cream page block & title slip
  const bookPages = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.35, 0.05, 0.47)), creamSilkMat);
  bookPages.position.set(0.52, 0.93, 0.18);
  tableGroup.add(bookPages);
  const bookCover = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.365, 0.012, 0.485)), mats.indigoCloth);
  bookCover.position.set(0.52, 0.96, 0.18);
  tableGroup.add(bookCover);
  const bookLabel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.07, 0.014, 0.22)), creamSilkMat);
  bookLabel.position.set(0.42, 0.964, 0.14);
  tableGroup.add(bookLabel);

  // Turned clay teapot + 2 celadon cups
  const potGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.08, 0.0],
        [0.125, 0.06],
        [0.115, 0.12],
        [0.07, 0.15],
        [0.085, 0.165],
        [0.025, 0.19],
        [0.0, 0.2],
      ],
      14
    )
  );
  const teapot = new THREE.Mesh(potGeo, mats.terracotta);
  teapot.position.set(0.1, 0.905, -0.2);
  tableGroup.add(teapot);
  for (const cx of [-0.14, 0.34]) {
    const cup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.042, 0.028, 0.055, 10)), celadonMat);
    cup.position.set(cx, 0.93, -0.22);
    tableGroup.add(cup);
  }
  root.add(tableGroup);

  // Carved Taishi Armchairs (太师椅) flanking the table
  for (const sx of [-1.8, 1.8]) {
    const chair = new THREE.Group();
    chair.position.set(sx, 0.45, 8.0);
    chair.rotation.y = sx < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    addShadowDisc(chair, 0.58);
    const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.7, 0.075, 0.64)), mats.darkTimber);
    seat.position.y = 0.52;
    chair.add(seat);
    // Stepped backrest frame + carved central splat
    const topRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.74, 0.1, 0.085)), mats.darkTimber);
    topRail.position.set(0, 1.22, -0.27);
    chair.add(topRail);
    const splat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.66, 0.055)), mats.weatheredWoodDoor);
    splat.position.set(0, 0.88, -0.27);
    chair.add(splat);
    // Curved armrests & upright stiles
    for (const ax of [-0.31, 0.31]) {
      const stile = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.075, 0.72, 0.075)), mats.darkTimber);
      stile.position.set(ax, 0.88, -0.27);
      chair.add(stile);
      const arm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.07, 0.065, 0.58)), mats.darkTimber);
      arm.position.set(ax, 0.78, 0.0);
      chair.add(arm);
      const armPost = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.065, 0.26, 0.065)), mats.darkTimber);
      armPost.position.set(ax, 0.65, 0.26);
      chair.add(armPost);
    }
    for (const [cx, cz] of [
      [-0.29, -0.26],
      [0.29, -0.26],
      [-0.29, 0.26],
      [0.29, 0.26],
    ]) {
      const cleg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.078, 0.52, 0.078)), mats.darkTimber);
      cleg.position.set(cx, 0.26, cz);
      chair.add(cleg);
    }
    root.add(chair);
  }

  // =========================================================================
  // 06. REAR SKYWELL: CARVED BLUESTONE GRAIN MILL ON MORTISED STAND
  // =========================================================================
  const millBase = new THREE.Group();
  millBase.position.set(-2.2, 0.35, 2.8);
  addShadowDisc(millBase, 0.78);
  // 4-legged mortised timber trestle
  for (const [mx, mz] of [
    [-0.36, -0.36],
    [0.36, -0.36],
    [-0.36, 0.36],
    [0.36, 0.36],
  ]) {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.54, 0.11)), mats.darkTimber);
    leg.position.set(mx, 0.27, mz);
    millBase.add(leg);
  }
  const millBed = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.64, 0.62, 0.1, 18)), mats.darkTimber);
  millBed.position.y = 0.55;
  millBase.add(millBed);
  const millLower = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.58, 0.61, 0.2, 20)), mats.graniteSlab);
  millLower.position.y = 0.7;
  millBase.add(millLower);
  const millSpout = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.09, 0.28)), mats.granitePlinth);
  millSpout.position.set(0, 0.64, 0.64);
  millBase.add(millSpout);

  const millUpperStone = new THREE.Group();
  millUpperStone.position.y = 0.9;
  const upperDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.56, 0.21, 20)), mats.graniteSlab);
  millUpperStone.add(upperDisc);
  const feedHole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.06, 0.22, 10)), mats.darkTimber);
  feedHole.position.set(-0.14, 0.01, 0);
  millUpperStone.add(feedHole);
  const pushHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.036, 0.58, 10)), mats.weatheredWoodDoor);
  pushHandle.position.set(0.42, 0.3, 0);
  millUpperStone.add(pushHandle);
  const tGrip = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.26, 8)), mats.darkTimber);
  tGrip.rotation.x = Math.PI * 0.5;
  tGrip.position.set(0.42, 0.58, 0);
  millUpperStone.add(tGrip);
  millBase.add(millUpperStone);
  root.add(millBase);

  // =========================================================================
  // 07. UPPER HALL (ANCESTRAL SANCTUARY): CARVED ALTAR, TRIPOD CENSER, CRESCENT JIAOBEI & DING LANTERN
  // =========================================================================
  const altarGroup = new THREE.Group();
  altarGroup.position.set(0, 0.85, -4.5);
  addShadowDisc(altarGroup, 2.3);
  const altarTable = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.45, 1.05, 1.18)), mats.redLacquer);
  altarTable.position.y = 0.525;
  altarTable.castShadow = castShadow;
  altarGroup.add(altarTable);
  // Upturned altar end scrolls (翘头案) & gilded front relief panel
  for (const sx of [-2.26, 2.26]) {
    const scroll = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.16, 1.2)), mats.redLacquer);
    scroll.position.set(sx, 1.1, 0);
    altarGroup.add(scroll);
  }
  const altarRelief = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.42, 0.06)), mats.gildedGold);
  altarRelief.position.set(0, 0.62, 0.59);
  altarGroup.add(altarRelief);

  // Tiered gilded woodcarved ancestral shrine canopy (神龛)
  const shrineBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.45, 2.15, 0.32)), mats.darkTimber);
  shrineBack.position.set(0, 2.12, -0.44);
  altarGroup.add(shrineBack);
  const shrineFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.55, 0.22, 0.66)), mats.gildedGold);
  shrineFrame.position.set(0, 3.16, -0.26);
  altarGroup.add(shrineFrame);
  for (const px of [-1.62, -0.58, 0.58, 1.62]) {
    const pillar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.065, 2.08, 10)), mats.gildedGold);
    pillar.position.set(px, 2.1, -0.02);
    altarGroup.add(pillar);
  }
  for (let t = -2; t <= 2; t++) {
    const tabPed = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.1, 0.16)), mats.gildedGold);
    tabPed.position.set(t * 0.52, 1.12, -0.14);
    altarGroup.add(tabPed);
    const tablet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.72, 0.075)), mats.redLacquer);
    tablet.position.set(t * 0.52, 1.52, -0.14);
    altarGroup.add(tablet);
    const tabTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.52, 0.084)), mats.gildedGold);
    tabTrim.position.set(t * 0.52, 1.52, -0.14);
    altarGroup.add(tabTrim);
  }

  // Turned Bronze Tripod Incense Burner (三足双耳铜香炉)
  const censerGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.08],
        [0.16, 0.08],
        [0.25, 0.16],
        [0.27, 0.26],
        [0.22, 0.34],
        [0.26, 0.38],
        [0.21, 0.38],
      ],
      16
    )
  );
  const burner = new THREE.Mesh(censerGeo, mats.bronzeMetal);
  burner.position.set(0, 1.05, 0.28);
  altarGroup.add(burner);
  for (let leg = 0; leg < 3; leg++) {
    const a = (leg / 3) * Math.PI * 2;
    const cLeg = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.022, 0.12, 8)), mats.bronzeMetal);
    cLeg.position.set(Math.cos(a) * 0.14, 1.11, 0.28 + Math.sin(a) * 0.14);
    altarGroup.add(cLeg);
  }
  for (const sx of [-0.26, 0.26]) {
    const ear = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.055, 0.016, 6, 12)), mats.bronzeMetal);
    ear.position.set(sx, 1.38, 0.28);
    altarGroup.add(ear);
  }
  // Twin altar crimson candlesticks
  for (const cx of [-1.15, 1.15]) {
    const holder = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.11, 0.22, 10)), mats.bronzeMetal);
    holder.position.set(cx, 1.16, 0.26);
    altarGroup.add(holder);
    const candle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.034, 0.038, 0.34, 10)), vermMat);
    candle.position.set(cx, 1.44, 0.26);
    altarGroup.add(candle);
    const flame = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.032, 6, 6)), emberMat);
    flame.scale.set(0.75, 1.45, 0.75);
    flame.position.set(cx, 1.65, 0.26);
    altarGroup.add(flame);
  }

  const incenseSmokeGroup = new THREE.Group();
  incenseSmokeGroup.position.set(0, 1.5, 0.28);
  const smokeMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xeaece8, transparent: true, opacity: 0.42 }));
  for (let s = 0; s < 6; s++) {
    const puff = new THREE.Mesh(trackGeo(createSoftPillowGeometry(0.06 + s * 0.024, s, 0.85, 8, 6)), smokeMat);
    puff.position.set(((s % 3) - 1) * 0.08, s * 0.32, 0);
    incenseSmokeGroup.add(puff);
  }
  incenseSmokeGroup.visible = false;
  altarGroup.add(incenseSmokeGroup);
  root.add(altarGroup);

  // Curved crescent-moon wooden Jiaobei blocks (弯月木筊杯)
  const jiaobeiGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(-0.11, -0.02, 0),
        new THREE.Vector3(-0.04, 0.045, 0),
        new THREE.Vector3(0.04, 0.045, 0),
        new THREE.Vector3(0.11, -0.02, 0),
      ],
      0.018,
      0.018,
      10,
      7
    )
  );
  const jiaobeiLeft = new THREE.Mesh(jiaobeiGeo, mats.redLacquer);
  jiaobeiLeft.position.set(1.75, 1.95, -4.1);
  jiaobeiLeft.rotation.set(Math.PI * 0.5, 0.3, 0);
  root.add(jiaobeiLeft);
  const jiaobeiRight = new THREE.Mesh(jiaobeiGeo, mats.redLacquer);
  jiaobeiRight.position.set(1.98, 1.95, -4.05);
  jiaobeiRight.rotation.set(Math.PI * 0.5, -0.4, Math.PI);
  root.add(jiaobeiRight);

  // Octagonal gilded palace Ding Lantern (八角添丁花灯) anchored by taut golden silk cord to Upper Hall ridge purlin (y=7.62)
  const dingAnchorY = 7.62;
  const dingLanternGroup = new THREE.Group();
  dingLanternGroup.position.set(-2.2, 3.55, -2.7);
  const dingBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.36, -0.38],
        [0.5, -0.18],
        [0.52, 0.0],
        [0.5, 0.18],
        [0.36, 0.38],
      ],
      8
    )
  );
  dingLanternGroup.add(new THREE.Mesh(dingBodyGeo, mats.lanternPaper));
  const dingCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.62, 0.28, 8)), mats.gildedGold);
  dingCap.position.y = 0.52;
  dingLanternGroup.add(dingCap);
  const dingFinialRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.048, 0.012, 6, 12)), mats.gildedGold);
  dingFinialRing.position.y = 0.68;
  dingLanternGroup.add(dingFinialRing);
  const dingBot = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.38, 0.46, 0.12, 8)), mats.gildedGold);
  dingBot.position.y = -0.42;
  dingLanternGroup.add(dingBot);
  const dingTassel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.03, 0.085, 0.42, 8)), mats.redLacquer);
  dingTassel.position.y = -0.68;
  dingLanternGroup.add(dingTassel);
  root.add(dingLanternGroup);

  // Ceiling brass rosette & dynamically scaled suspension cord anchored strictly to the Upper Hall ridge purlin
  const dingCeilingRosette = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.075, 0.09, 0.04, 12)),
    mats.bronzeMetal
  );
  dingCeilingRosette.position.set(-2.2, dingAnchorY, -2.7);
  root.add(dingCeilingRosette);
  const dingCordMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 1.0, 8)),
    mats.gildedGold
  );
  root.add(dingCordMesh);

  const updateDingLanternHeight = (worldY: number) => {
    dingLanternGroup.position.y = worldY;
    const cordBottomY = worldY + 0.66;
    const cordHeight = Math.max(0.2, dingAnchorY - cordBottomY);
    dingCordMesh.scale.set(1, cordHeight, 1);
    dingCordMesh.position.set(-2.2, cordBottomY + cordHeight * 0.5, -2.7);
  };
  updateDingLanternHeight(3.55);

  // =========================================================================
  // 08, 09, 10. WEST WING: CARVED CANOPY BED, ROCKER CRADLE, VANITY, WELL, STUDY
  // =========================================================================
  const bedGroup = new THREE.Group();
  bedGroup.position.set(-16.2, 0.32, 13.6);
  addShadowDisc(bedGroup, 1.85);
  const bedFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 0.58, 2.0)), mats.redLacquer);
  bedFrame.position.y = 0.29;
  bedGroup.add(bedFrame);
  // Sculpted puffed brocade quilt + pair of embroidered pillows
  const quilt = new THREE.Mesh(
    trackGeo(createSoftPillowGeometry(1.0, 2.2, 0.22, 14, 10)),
    createPaintedWoodMat(0xb8352a, trackMat, 0.78)
  );
  quilt.scale.set(1.06, 1.0, 0.88);
  quilt.position.set(0, 0.68, 0);
  bedGroup.add(quilt);
  for (const pz of [-0.45, 0.45]) {
    const pillow = new THREE.Mesh(trackGeo(createSoftPillowGeometry(0.24, pz + 4, 0.46, 10, 8)), lemonMat);
    pillow.position.set(-0.78, 0.78, pz);
    bedGroup.add(pillow);
  }
  for (const [px, pz] of [
    [-1.12, -0.92],
    [1.12, -0.92],
    [-1.12, 0.92],
    [1.12, 0.92],
  ]) {
    const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.06, 2.38, 10)), mats.darkTimber);
    post.position.set(px, 1.19, pz);
    bedGroup.add(post);
    // Soft draped bedside curtain panels
    const curtain = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 1.65, 8)), creamSilkMat);
    curtain.position.set(px * 0.92, 1.48, pz * 0.88);
    bedGroup.add(curtain);
  }
  const canopyTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.48, 0.14, 2.08)), mats.darkTimber);
  canopyTop.position.y = 2.38;
  bedGroup.add(canopyTop);
  const canopyFrieze = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.38, 0.24, 1.98)), mats.gildedGold);
  canopyFrieze.position.y = 2.22;
  bedGroup.add(canopyFrieze);
  root.add(bedGroup);

  // Curved Rocker Cradle (摇篮) with arched runners & slatted crib sides
  const cradleBody = new THREE.Group();
  cradleBody.position.set(-14.2, 0.56, 13.0);
  const cradleFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.72, 0.08, 1.12)), mats.weatheredWoodDoor);
  cradleFloor.position.y = -0.14;
  cradleBody.add(cradleFloor);
  for (const sz of [-0.54, 0.54]) {
    const endBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.74, 0.44, 0.06)), mats.darkTimber);
    endBoard.position.set(0, 0.05, sz);
    cradleBody.add(endBoard);
    const rocker = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.46, 0.032, 6, 14, Math.PI * 0.55)),
      mats.darkTimber
    );
    rocker.rotation.z = -Math.PI * 0.775;
    rocker.position.set(0, 0.22, sz);
    cradleBody.add(rocker);
  }
  for (const sx of [-0.34, 0.34]) {
    const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 0.05, 1.12)), mats.darkTimber);
    rail.position.set(sx, 0.22, 0);
    cradleBody.add(rail);
    for (let s = -2; s <= 2; s++) {
      const slat = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6)), bambooMat);
      slat.position.set(sx, 0.04, s * 0.2);
      cradleBody.add(slat);
    }
  }
  const cradleQuilt = new THREE.Mesh(
    trackGeo(createSoftPillowGeometry(0.32, 5.1, 0.36, 10, 8)),
    mats.indigoCloth
  );
  cradleQuilt.scale.set(0.95, 1, 1.45);
  cradleQuilt.position.y = -0.02;
  cradleBody.add(cradleQuilt);
  root.add(cradleBody);

  // Camphor Chest & Carved Bronze Mirror Vanity
  const chestGroup = new THREE.Group();
  chestGroup.position.set(-16.8, 0.32, 10.2);
  const chest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.32, 0.74, 0.72)), mats.weatheredWoodDoor);
  chest.position.y = 0.37;
  chestGroup.add(chest);
  const clasp = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12)), mats.gildedGold);
  clasp.rotation.z = Math.PI * 0.5;
  clasp.position.set(0.66, 0.52, 0);
  chestGroup.add(clasp);
  const mirrorStand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.32, 0.36)), mats.darkTimber);
  mirrorStand.position.set(0.06, 0.9, 0);
  chestGroup.add(mirrorStand);
  const mirrorDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.045, 20)), mats.gildedGold);
  mirrorDisc.rotation.z = Math.PI * 0.5;
  mirrorDisc.position.set(0.1, 1.08, 0);
  chestGroup.add(mirrorDisc);
  root.add(chestGroup);

  // Octagonal Carved Stone Wellhead with Windlass, Rope & Wooden Bucket
  const wellGroup = new THREE.Group();
  wellGroup.position.set(-15.2, 0.32, 4.8);
  addShadowDisc(wellGroup, 1.05);
  const wellBody = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.72, 0.78, 0.76, 8)), mats.graniteSlab);
  wellBody.position.y = 0.38;
  wellGroup.add(wellBody);
  const wellRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.71, 0.085, 8, 8)), mats.granitePlinth);
  wellRim.rotation.x = Math.PI * 0.5;
  wellRim.position.y = 0.76;
  wellGroup.add(wellRim);
  const wellWater = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.62, 12)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x1b4548, roughness: 0.14 }))
  );
  wellWater.rotation.x = -Math.PI * 0.5;
  wellWater.position.y = 0.62;
  wellGroup.add(wellWater);
  for (const wx of [-0.78, 0.78]) {
    const wellPost = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 1.85, 0.12)), mats.darkTimber);
    wellPost.position.set(wx, 0.925, 0);
    wellGroup.add(wellPost);
  }
  const wellRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.18, 0.44, 4)), mats.roofTile);
  wellRoof.rotation.y = Math.PI * 0.25;
  wellRoof.position.y = 2.04;
  wellGroup.add(wellRoof);
  const windlassBar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 1.65, 12)), mats.weatheredWoodDoor);
  windlassBar.rotation.z = Math.PI * 0.5;
  windlassBar.position.y = 1.48;
  wellGroup.add(windlassBar);
  const bucket = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.14, 0.26, 12)), mats.darkTimber);
  bucket.position.set(0, 0.95, 0);
  wellGroup.add(bucket);
  root.add(wellGroup);

  // Scholar Study Desk with Inkstone, Brush Pot & Curved Glass-Chimney Kerosene Lamp
  const studyGroup = new THREE.Group();
  studyGroup.position.set(-16.2, 0.32, -1.6);
  const deskTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.54, 0.09, 2.24)), mats.darkTimber);
  deskTop.position.y = 0.82;
  studyGroup.add(deskTop);
  for (const [dx, dz] of [
    [-0.64, -0.96],
    [0.64, -0.96],
    [-0.64, 0.96],
    [0.64, 0.96],
  ]) {
    const dLeg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.8, 0.1)), mats.darkTimber);
    dLeg.position.set(dx, 0.4, dz);
    studyGroup.add(dLeg);
  }
  // Scroll paper + celadon brush pot + inkstone
  const scrollPaper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.56, 0.014, 0.84)), creamSilkMat);
  scrollPaper.position.set(0.18, 0.87, 0.42);
  studyGroup.add(scrollPaper);
  const brushPot = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.075, 0.22, 12)), celadonMat);
  brushPot.position.set(-0.34, 0.97, -0.58);
  studyGroup.add(brushPot);
  const lampBase = new THREE.Mesh(
    trackGeo(
      createTurnedLatheGeometry(
        [
          [0.0, 0.0],
          [0.15, 0.0],
          [0.14, 0.08],
          [0.09, 0.14],
          [0.11, 0.18],
        ],
        14
      )
    ),
    mats.bronzeMetal
  );
  lampBase.position.set(0, 0.865, 0);
  studyGroup.add(lampBase);
  const chimneyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.08, 0.0],
        [0.115, 0.09],
        [0.095, 0.2],
        [0.068, 0.34],
      ],
      14
    )
  );
  const lampGlass = new THREE.Mesh(
    chimneyGeo,
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffe49e,
        emissive: 0xffa030,
        emissiveIntensity: 0.78,
        transparent: true,
        opacity: 0.84,
      })
    )
  );
  lampGlass.position.set(0, 1.03, 0);
  studyGroup.add(lampGlass);
  const studyLampLight = new THREE.PointLight(0xffb85c, 1.2, 10, 1.8);
  studyLampLight.position.set(0, 1.32, 0);
  studyGroup.add(studyLampLight);
  root.add(studyGroup);

  // =========================================================================
  // 11, 12, 13. EAST WING: 3-WOK HEARTH STOVE, LEICHA, WINNOWER, WINE JARS & 4 SCULPTED COOP CHICKENS
  // =========================================================================
  const stoveGroup = new THREE.Group();
  stoveGroup.position.set(16.6, 0.32, 13.0);
  const stoveBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.56, 0.92, 4.05)), mats.limeWall);
  stoveBody.position.y = 0.46;
  stoveGroup.add(stoveBody);
  const stoveCounter = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.62, 0.08, 4.12)), mats.graniteSlab);
  stoveCounter.position.y = 0.92;
  stoveGroup.add(stoveCounter);
  for (const wz of [-1.18, 0, 1.18]) {
    // Glowing arched firebox mouth
    const firebox = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12, 1, false, 0, Math.PI)), emberMat);
    firebox.rotation.z = Math.PI * 0.5;
    firebox.rotation.y = Math.PI * 0.5;
    firebox.position.set(-0.77, 0.22, wz);
    stoveGroup.add(firebox);

    const wok = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.5, 0.36, 0.16, 18)), ironMat);
    wok.position.set(0, 0.98, wz);
    stoveGroup.add(wok);
    const lid = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.49, 0.18, 14)), mats.weatheredWoodDoor);
    lid.position.set(0, 1.14, wz);
    stoveGroup.add(lid);
    const lidKnob = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.06, 0.018, 6, 10, Math.PI)), mats.darkTimber);
    lidKnob.position.set(0, 1.24, wz);
    stoveGroup.add(lidKnob);
  }
  const bellowsBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.5, 0.95)), mats.darkTimber);
  bellowsBox.position.set(-1.05, 0.4, 1.3);
  stoveGroup.add(bellowsBox);
  const bellowsHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.55, 8)), bambooMat);
  bellowsHandle.rotation.x = Math.PI * 0.5;
  bellowsHandle.position.set(-1.05, 0.45, 2.05);
  stoveGroup.add(bellowsHandle);

  const wokSteamGroup = new THREE.Group();
  wokSteamGroup.position.set(0, 1.38, 0);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(trackGeo(createSoftPillowGeometry(0.15, i + 1, 0.82, 8, 6)), smokeMat);
    sp.position.set(0, (i % 3) * 0.38, (Math.floor(i / 2) - 1) * 1.15);
    wokSteamGroup.add(sp);
  }
  wokSteamGroup.visible = false;
  stoveGroup.add(wokSteamGroup);
  root.add(stoveGroup);

  // Hakka Leicha Table with Turned Ceramic Mortar, Tea Paste & Side Ingredient Bowls
  const leichaTable = new THREE.Group();
  leichaTable.position.set(14.4, 0.32, 9.8);
  const lTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.44, 0.08, 1.04)), mats.darkTimber);
  lTop.position.y = 0.78;
  leichaTable.add(lTop);
  for (const [lx, lz] of [
    [-0.6, -0.42],
    [0.6, -0.42],
    [-0.6, 0.42],
    [0.6, 0.42],
  ]) {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.09, 0.78, 0.09)), mats.darkTimber);
    leg.position.set(lx, 0.39, lz);
    leichaTable.add(leg);
  }
  const mortarGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.18, 0.0],
        [0.24, 0.12],
        [0.3, 0.25],
        [0.26, 0.27],
        [0.2, 0.14],
        [0.0, 0.06],
      ],
      16
    )
  );
  const mortar = new THREE.Mesh(mortarGeo, mats.terracotta);
  mortar.position.set(0, 0.82, 0);
  leichaTable.add(mortar);
  const teaPaste = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.22, 14)),
    createPaintedWoodMat(0x428844, trackMat, 0.42)
  );
  teaPaste.rotation.x = -Math.PI * 0.5;
  teaPaste.position.set(0, 1.02, 0);
  leichaTable.add(teaPaste);
  // Side celadon bowls for roasted peanuts & sesame
  for (const bx of [-0.46, 0.46]) {
    const bowl = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.065, 0.08, 12)), celadonMat);
    bowl.position.set(bx, 0.86, 0.18);
    leichaTable.add(bowl);
  }
  const leichaPestle = new THREE.Group();
  leichaPestle.position.set(0, 1.02, 0);
  const pestleStick = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.044, 0.68, 10)), mats.weatheredWoodDoor);
  pestleStick.position.set(0.08, 0.29, 0);
  pestleStick.rotation.z = -0.25;
  leichaPestle.add(pestleStick);
  leichaTable.add(leichaPestle);
  root.add(leichaTable);

  // Handcrafted Winnowing Fan (风谷机) + 3 Turned Hakka Niangjiu Wine Jars
  const winGroup = new THREE.Group();
  winGroup.position.set(16.2, 0.32, -1.6);
  addShadowDisc(winGroup, 1.3);
  for (const [wx, wz] of [
    [-0.9, -0.32],
    [0.35, -0.32],
    [-0.9, 0.32],
    [0.35, 0.32],
  ]) {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.09, 1.12, 0.09)), mats.darkTimber);
    leg.position.set(wx, 0.56, wz);
    winGroup.add(leg);
  }
  const drum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.64, 0.64, 0.68, 18)), mats.weatheredWoodDoor);
  drum.rotation.x = Math.PI * 0.5;
  drum.position.set(0, 1.15, 0);
  winGroup.add(drum);
  const hopper = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.58, 0.16, 0.56, 4)), mats.darkTimber);
  hopper.position.set(0, 1.95, 0);
  hopper.rotation.y = Math.PI * 0.25;
  winGroup.add(hopper);
  const chute = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 0.48, 0.56)), mats.darkTimber);
  chute.position.set(-0.78, 1.15, 0);
  winGroup.add(chute);
  const winnowerCrank = new THREE.Group();
  winnowerCrank.position.set(0, 1.15, 0.42);
  const crankArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.075, 0.44, 0.055)), mats.bronzeMetal);
  crankArm.position.y = 0.18;
  winnowerCrank.add(crankArm);
  const crankHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8)), bambooMat);
  crankHandle.rotation.x = Math.PI * 0.5;
  crankHandle.position.set(0, 0.38, 0.09);
  winnowerCrank.add(crankHandle);
  winGroup.add(winnowerCrank);

  // 3 Turned Ceramic Wine Jars (客家娘酒坛) with red cloth seals & twine necks
  const wineJarGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.0],
        [0.24, 0.0],
        [0.37, 0.28],
        [0.36, 0.56],
        [0.22, 0.74],
        [0.24, 0.82],
      ],
      16
    )
  );
  for (const [jx, jz, jsc] of [
    [0.42, 1.38, 1.0],
    [-0.22, 1.56, 0.82],
    [0.88, 1.72, 0.76],
  ]) {
    const jg = new THREE.Group();
    jg.position.set(jx, 0, jz);
    jg.scale.setScalar(jsc);
    jg.add(new THREE.Mesh(wineJarGeo, mats.terracotta));
    const redSeal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.27, 0.14, 14)), mats.redLacquer);
    redSeal.position.y = 0.8;
    jg.add(redSeal);
    const twine = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.24, 0.016, 6, 14)), bambooMat);
    twine.rotation.x = Math.PI * 0.5;
    twine.position.y = 0.74;
    jg.add(twine);
    winGroup.add(jg);
  }
  root.add(winGroup);

  // 4 Sculpted Woodcarving Coop Chickens (matching livingWorldBuilder anatomy!) + Bamboo Coop
  const coopBasket = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.45, 0.58, 0.48, 14)),
    bambooMat
  );
  coopBasket.position.set(16.1, 0.56, 4.8);
  root.add(coopBasket);

  const chickens: THREE.Group[] = [];
  const henWhite = createPaintedWoodMat(0xf2e6d0, trackMat, 0.78);
  const henBrown = createPaintedWoodMat(0xb06a38, trackMat, 0.78);
  const beakMat = createPaintedWoodMat(HANDCRAFTED_PAL.orange, trackMat, 0.55);
  const coopBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.22],
        [0.09, -0.18],
        [0.155, -0.07],
        [0.17, 0.05],
        [0.135, 0.16],
        [0.07, 0.21],
        [0.0, 0.23],
      ],
      14
    )
  );
  coopBodyGeo.rotateX(Math.PI * 0.5);
  const coopWingGeo = trackGeo(createCuppedPetalGeometry(0.15, 0.22, 0.04));

  for (let c = 0; c < 4; c++) {
    const hen = new THREE.Group();
    addShadowDisc(hen, 0.22);
    const hm = c % 2 === 0 ? henBrown : henWhite;
    const hBody = new THREE.Mesh(coopBodyGeo, hm);
    hBody.position.y = 0.24;
    hen.add(hBody);
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(coopWingGeo, hm);
      wing.position.set(sx * 0.145, 0.25, 0.07);
      wing.rotation.set(-Math.PI * 0.52, sx * 0.2, sx * 1.42);
      hen.add(wing);
      const leg = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.013, 0.013, 0.13, 6)), beakMat);
      leg.position.set(sx * 0.055, 0.065, 0);
      hen.add(leg);
    }
    const hHead = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.088, 10, 8)), hm);
    hHead.position.set(0, 0.37, 0.17);
    hen.add(hHead);
    const beak = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.028, 0.075, 6)), beakMat);
    beak.rotation.x = Math.PI * 0.52;
    beak.position.set(0, 0.36, 0.26);
    hen.add(beak);
    const comb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.036, 8, 6)), mats.redLacquer);
    comb.scale.set(0.6, 1.1, 1.4);
    comb.position.set(0, 0.46, 0.18);
    hen.add(comb);
    const tail = new THREE.Mesh(coopWingGeo, hm);
    tail.scale.set(0.75, 0.85, 1);
    tail.position.set(0, 0.27, -0.19);
    tail.rotation.x = -0.7;
    hen.add(tail);

    hen.position.set(14.8 + (c % 2) * 1.05, 0.32, 4.1 + Math.floor(c / 2) * 1.15);
    hen.rotation.y = c * 1.4;
    root.add(hen);
    chickens.push(hen);
  }

  // =========================================================================
  // 15 & 16. WEILONG ALLEY PULLEY GRAIN SACK & WATCHTOWER ALARM GONG + BIRDS
  // =========================================================================
  const pulleyY = groundHeightAt(0, -27.2, 0);
  const pulleyGrainSack = new THREE.Group();
  pulleyGrainSack.position.set(0, pulleyY + 0.4, -27.2);
  const sackGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.4],
        [0.32, -0.38],
        [0.42, -0.14],
        [0.39, 0.16],
        [0.2, 0.34],
        [0.25, 0.44],
        [0.0, 0.44],
      ],
      14
    )
  );
  pulleyGrainSack.add(new THREE.Mesh(sackGeo, mats.rammedEarth));
  const sackTie = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.21, 0.024, 6, 12)), mats.goldenGrain);
  sackTie.rotation.x = Math.PI * 0.5;
  sackTie.position.y = 0.34;
  pulleyGrainSack.add(sackTie);
  const rope = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 4.0, 8)), mats.goldenGrain);
  rope.position.y = 2.25;
  pulleyGrainSack.add(rope);
  root.add(pulleyGrainSack);

  // Carved Watchtower Bronze Alarm Gong (黄铜警锣) with Bossed Center & Mallet
  const gongY = groundHeightAt(18.7, -25.8, 0);
  const gongGroup = new THREE.Group();
  gongGroup.position.set(18.7, gongY, -25.8);
  gongGroup.rotation.y = -0.5;
  addShadowDisc(gongGroup, 0.85);
  for (const gx of [-0.64, 0.64]) {
    const framePost = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 1.72, 0.11)), mats.darkTimber);
    framePost.position.set(gx, 0.86, 0);
    gongGroup.add(framePost);
    const foot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.12, 0.56)), mats.darkTimber);
    foot.position.set(gx, 0.06, 0);
    gongGroup.add(foot);
  }
  const gongTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.66, 0.13, 0.14)), mats.darkTimber);
  gongTop.position.set(0, 1.72, 0);
  gongGroup.add(gongTop);
  for (const cx of [-0.26, 0.26]) {
    const cord = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 6)), vermMat);
    cord.position.set(cx, 1.5, 0);
    gongGroup.add(cord);
  }
  const gongDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.49, 0.49, 0.075, 22)), mats.gildedGold);
  gongDisc.rotation.x = Math.PI * 0.5;
  gongDisc.position.set(0, 1.05, 0);
  gongGroup.add(gongDisc);
  const gongBoss = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.16, 12, 8)), mats.gildedGold);
  gongBoss.scale.set(1, 1, 0.45);
  gongBoss.position.set(0, 1.05, 0.03);
  gongGroup.add(gongBoss);
  // Red-wrapped wooden gong mallet resting against right post
  const gongMalletStick = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8)), bambooMat);
  gongMalletStick.position.set(0.5, 0.35, 0.16);
  gongMalletStick.rotation.z = 0.22;
  gongGroup.add(gongMalletStick);
  const gongMalletHead = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.075, 10, 8)), vermMat);
  gongMalletHead.position.set(0.44, 0.62, 0.16);
  gongGroup.add(gongMalletHead);
  root.add(gongGroup);

  // Sculpted Swept-Wing Startled Birds
  const startledBirds = new THREE.Group();
  const birdMat = createPaintedWoodMat(0x282d38, trackMat, 0.65);
  const startledWingGeo = trackGeo(createCuppedPetalGeometry(0.22, 0.48, 0.04));
  for (let b = 0; b < 9; b++) {
    const bGroup = new THREE.Group();
    const wL = new THREE.Mesh(startledWingGeo, birdMat);
    wL.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.48);
    const wR = new THREE.Mesh(startledWingGeo, birdMat);
    wR.rotation.set(Math.PI * 0.5, 0, -Math.PI * 0.48);
    bGroup.add(wL, wR);
    bGroup.position.set(Math.cos(b) * 12, 10.5 + (b % 3) * 1.4, -8 + Math.sin(b) * 12);
    startledBirds.add(bGroup);
  }
  startledBirds.visible = false;
  root.add(startledBirds);

  // =========================================================================
  // 17. HUATAI FIVE-ELEMENT STONES, FIREWOOD STACK & INDIGO CLOTHES RACK
  // =========================================================================
  const woodPileY = groundHeightAt(-1.4, -14.8, 0);
  const woodPile = new THREE.Group();
  woodPile.position.set(-1.4, woodPileY, -14.8);
  addShadowDisc(woodPile, 1.35);
  const logGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 2.35, 9));
  for (let l = 0; l < 11; l++) {
    const log = new THREE.Mesh(logGeo, l % 2 === 0 ? mats.darkTimber : mats.weatheredWoodDoor);
    log.rotation.z = Math.PI * 0.5 + ((l % 3) - 1) * 0.12;
    log.rotation.y = (l * 0.58) % Math.PI;
    log.position.set(((l % 4) - 1.5) * 0.44, 0.15 + Math.floor(l / 4) * 0.18, ((l % 3) - 1) * 0.4);
    log.castShadow = castShadow;
    woodPile.add(log);
  }
  root.add(woodPile);

  const fiveElementStones: THREE.Mesh[] = [];
  const elementColors = [0xe8c468, 0x52a86b, 0x4b94c7, 0xd95638, 0xc29354];
  const stoneZs = [-9.4, -11.4, -13.4, -15.4, -17.4];
  stoneZs.forEach((sz, idx) => {
    const sy = groundHeightAt(1.2, sz, 0);
    const sMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7b8085,
        emissive: elementColors[idx],
        emissiveIntensity: 0.08,
        roughness: 0.48,
        metalness: 0.16,
      })
    );
    const stone = new THREE.Mesh(trackGeo(createSoftPillowGeometry(0.45, idx * 2.1, 0.55, 12, 8)), sMat);
    stone.scale.set(1.2, 0.9, 1.05);
    stone.position.set(1.2, sy + 0.14, sz);
    root.add(stone);
    fiveElementStones.push(stone);
  });

  // West Huatai Bamboo Drying Rack with Forked Stands & 3 Sculpted Hakka Indigo Tunics
  const dryingClothes: THREE.Mesh[] = [];
  const rackY = groundHeightAt(-10.5, -11.8, 0);
  const rackPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 4.0, 8)), mats.bambooGreen);
  rackPole.rotation.z = Math.PI * 0.5;
  rackPole.position.set(-10.5, rackY + 1.92, -11.8);
  root.add(rackPole);
  for (const rx of [-12.35, -8.65]) {
    const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.042, 0.048, 2.0, 8)), mats.bambooGreen);
    post.position.set(rx, rackY + 1.0, -11.8);
    root.add(post);
  }
  const tunicClothGeo = trackGeo(new THREE.PlaneGeometry(0.88, 1.16, 4, 5));
  {
    const pos = tunicClothGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Gentle draped fabric fold curve
      pos.setZ(i, Math.sin(x * 5.2) * 0.055 * (0.5 - y * 0.5));
    }
    tunicClothGeo.computeVertexNormals();
  }
  const clothMats = [mats.indigoCloth, ceruleanMat, mats.indigoCloth];
  for (let i = 0; i < 3; i++) {
    const shirt = new THREE.Mesh(tunicClothGeo, clothMats[i]);
    shirt.position.set(-11.5 + i * 1.0, rackY + 1.32, -11.8);
    root.add(shirt);
    dryingClothes.push(shirt);
  }

  // =========================================================================
  // 18A-D. INNER WEILONG RING THEMED WEDGE ROOM PROPS
  // =========================================================================
  // 18A. Open-Frame Wooden Foot-Treadle Loom (脚踏织布机)
  const loomGroup = new THREE.Group();
  loomGroup.position.set(-17.0, groundHeightAt(-17.0, -16.6), -16.6);
  loomGroup.rotation.y = 0.55;
  for (const [lx, lz] of [
    [-0.72, -0.52],
    [0.72, -0.52],
    [-0.72, 0.52],
    [0.72, 0.52],
  ]) {
    const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 1.42, 0.1)), mats.darkTimber);
    post.position.set(lx, 0.71, lz);
    loomGroup.add(post);
  }
  const loomTopBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.56, 0.1, 0.12)), mats.darkTimber);
  loomTopBar.position.set(0, 1.4, 0);
  loomGroup.add(loomTopBar);
  const loomBeam = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 1.38, 10)), mats.weatheredWoodDoor);
  loomBeam.rotation.z = Math.PI * 0.5;
  loomBeam.position.set(0, 0.85, -0.45);
  loomGroup.add(loomBeam);
  const loomCloth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.16, 0.04, 0.96)), mats.indigoCloth);
  loomCloth.position.set(0, 0.85, 0.04);
  loomGroup.add(loomCloth);
  const loomShuttle = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.045, 0.22, 4, 8)), mats.gildedGold);
  loomShuttle.rotation.z = Math.PI * 0.5;
  loomShuttle.position.set(0, 0.92, 0.08);
  loomGroup.add(loomShuttle);
  root.add(loomGroup);

  // 18B. Han Music Barrel War Drum on Crossed Trestle + Drumsticks
  const musicGroup = new THREE.Group();
  musicGroup.position.set(-9.9, groundHeightAt(-9.9, -20.9), -20.9);
  const barrelDrumGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.28],
        [0.37, -0.28],
        [0.44, -0.14],
        [0.46, 0.0],
        [0.44, 0.14],
        [0.37, 0.28],
        [0.0, 0.28],
      ],
      18
    )
  );
  const drumBody = new THREE.Mesh(barrelDrumGeo, mats.redLacquer);
  drumBody.rotation.z = Math.PI * 0.5;
  drumBody.position.set(0, 0.86, 0);
  musicGroup.add(drumBody);
  const drumHead = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.58, 18)), creamSilkMat);
  drumHead.rotation.z = Math.PI * 0.5;
  drumHead.position.set(0, 0.86, 0);
  musicGroup.add(drumHead);
  for (const rotZ of [-0.52, 0.52]) {
    const trestle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.085, 1.05, 0.52)), mats.darkTimber);
    trestle.rotation.z = rotZ;
    trestle.position.set(0, 0.44, 0);
    musicGroup.add(trestle);
  }
  root.add(musicGroup);

  // 18C. Qiaopi Trunk, Flared Brass-Horn Gramophone & Red-Sealed Letters
  const qiaopiGroup = new THREE.Group();
  qiaopiGroup.position.set(9.9, groundHeightAt(9.9, -20.9), -20.9);
  const trunk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 0.58, 0.7)), mats.weatheredWoodDoor);
  trunk.position.y = 0.29;
  qiaopiGroup.add(trunk);
  for (const bx of [-0.46, 0.46]) {
    const strap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.6, 0.72)), mats.gildedGold);
    strap.position.set(bx, 0.29, 0);
    qiaopiGroup.add(strap);
  }
  const gramoBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.44, 0.26, 0.44)), mats.redLacquer);
  gramoBox.position.set(0.2, 0.71, 0);
  qiaopiGroup.add(gramoBox);
  const vinylDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16)), ironMat);
  vinylDisc.position.set(0.2, 0.85, 0);
  qiaopiGroup.add(vinylDisc);
  const hornGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.032, 0.0],
        [0.055, 0.16],
        [0.12, 0.34],
        [0.29, 0.52],
        [0.34, 0.56],
      ],
      16
    )
  );
  const gramoHorn = new THREE.Mesh(hornGeo, mats.gildedGold);
  gramoHorn.rotation.z = -0.82;
  gramoHorn.position.set(0.08, 0.88, 0);
  qiaopiGroup.add(gramoHorn);
  const letterPack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.065, 0.22)), creamSilkMat);
  letterPack.position.set(-0.32, 0.62, 0.06);
  qiaopiGroup.add(letterPack);
  const letterSeal = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.072, 0.23)), vermMat);
  letterSeal.position.set(-0.32, 0.62, 0.06);
  qiaopiGroup.add(letterSeal);
  root.add(qiaopiGroup);

  // 18D. Mortise-and-Tenon Carpentry Bench
  const carpGroup = new THREE.Group();
  carpGroup.position.set(17.0, groundHeightAt(17.0, -16.6), -16.6);
  const benchTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.85, 0.12, 0.92)), mats.weatheredWoodDoor);
  benchTop.position.y = 0.72;
  carpGroup.add(benchTop);
  for (const [bx, bz] of [
    [-0.78, -0.36],
    [0.78, -0.36],
    [-0.78, 0.36],
    [0.78, 0.36],
  ]) {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.72, 0.11)), mats.darkTimber);
    leg.position.set(bx, 0.36, bz);
    carpGroup.add(leg);
  }
  const postA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.88, 0.18)), mats.rammedEarth);
  postA.position.set(-0.46, 1.18, 0);
  carpGroup.add(postA);
  const postB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.88, 0.18)), mats.rammedEarth);
  postB.position.set(0.46, 1.18, 0);
  carpGroup.add(postB);
  const carpentryBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.38, 0.17, 0.2)), mats.gildedGold);
  carpentryBeam.position.set(0, 1.85, 0);
  carpGroup.add(carpentryBeam);
  root.add(carpGroup);

  // =========================================================================
  // 19 & 20. DRAGON HALL LAND SHRINE, FLYING-EAVE BOGONG FOREST SHRINE & TAIJI AR OVERLAY
  // =========================================================================
  const dragonShrine = new THREE.Group();
  dragonShrine.position.set(0, groundHeightAt(0, -23.6), -23.6);
  const dsBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.3, 1.02, 0.98)), mats.graniteSlab);
  dsBase.position.y = 0.51;
  dragonShrine.add(dsBase);
  const dsLedge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.44, 0.12, 1.08)), mats.granitePlinth);
  dsLedge.position.y = 1.05;
  dragonShrine.add(dsLedge);
  const dsTablet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.84, 1.32, 0.24)), mats.gildedGold);
  dsTablet.position.set(0, 1.72, -0.18);
  dragonShrine.add(dsTablet);
  const dsBorder = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.06, 0.16, 0.34)), mats.redLacquer);
  dsBorder.position.set(0, 2.42, -0.18);
  dragonShrine.add(dsBorder);
  const dsCenser = new THREE.Mesh(censerGeo, mats.bronzeMetal);
  dsCenser.scale.setScalar(0.72);
  dsCenser.position.set(0, 1.1, 0.22);
  dragonShrine.add(dsCenser);
  root.add(dragonShrine);

  // Sculpted Rear Bogong Forest Shrine (林间飞檐伯公亭)
  const bogongY = groundHeightAt(0, -46.5, 0);
  const bogongGroup = new THREE.Group();
  bogongGroup.position.set(0, bogongY, -46.5);
  addShadowDisc(bogongGroup, 1.5);
  const bStep = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.25, 0.22, 1.7)), mats.granitePlinth);
  bStep.position.y = 0.11;
  bogongGroup.add(bStep);
  const bPedestal = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.85, 0.62, 1.3)), mats.graniteSlab);
  bPedestal.position.y = 0.52;
  bogongGroup.add(bPedestal);
  // 4 vermilion shrine pavilion pillars
  for (const [px, pz] of [
    [-0.78, -0.52],
    [0.78, -0.52],
    [-0.78, 0.52],
    [0.78, 0.52],
  ]) {
    const col = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.068, 0.074, 1.38, 10)), mats.redLacquer);
    col.position.set(px, 1.5, pz);
    bogongGroup.add(col);
  }
  // Curved flared pyramidal Qing-tile pavilion roof + gilded finial
  const bRoofGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [1.55, 0.0],
        [1.18, 0.2],
        [0.64, 0.52],
        [0.14, 0.86],
        [0.0, 0.92],
      ],
      4
    )
  );
  const bRoof = new THREE.Mesh(bRoofGeo, mats.roofTile);
  bRoof.rotation.y = Math.PI * 0.25;
  bRoof.position.y = 2.12;
  bogongGroup.add(bRoof);
  const bFinial = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 10, 8)), mats.gildedGold);
  bFinial.position.y = 3.06;
  bogongGroup.add(bFinial);
  const bStele = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.64, 0.98, 0.22)), mats.graniteSlab);
  bStele.position.set(0, 1.32, -0.14);
  bogongGroup.add(bStele);
  // Festive red silk sash draped across the Bogong stele + stone incense burner
  const bSash = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.14, 0.25)), vermMat);
  bSash.position.set(0, 1.68, -0.14);
  bogongGroup.add(bSash);
  const bCenser = new THREE.Mesh(censerGeo, mats.granitePlinth);
  bCenser.scale.setScalar(0.65);
  bCenser.position.set(0, 0.83, 0.34);
  bogongGroup.add(bCenser);
  root.add(bogongGroup);

  return {
    root,
    interactableMeshes,
    millUpperStone,
    cradleBody,
    birdcageGroup,
    bellowsHandle,
    wokSteamGroup,
    leichaPestle,
    winnowerCrank,
    pulleyGrainSack,
    loomShuttle,
    carpentryBeam,
    dingLanternGroup,
    jiaobeiLeft,
    jiaobeiRight,
    incenseSmokeGroup,
    fiveElementStones,
    studyLampLight,
    dryingClothes,
    chickens,
    startledBirds,
    grainMatGroups,
    grainTarpCovers,
    grainStaticRake,
    updateGrainDrying,
    updateHwameiBird,
    updateDingLanternHeight,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
      localTextures.forEach((t) => t.dispose());
    },
  };
}
