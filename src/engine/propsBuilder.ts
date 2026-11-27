import * as THREE from 'three';
import type { MaterialLibrary } from './proceduralTextures';
import { INTERACTABLES } from '../data/weilongData';
import {
  groundHeightAt,
  INNER_RING_RX,
  INNER_RING_RZ,
  OUTER_RING_RX,
  OUTER_RING_RZ,
  OVAL_CENTER_Z,
} from './worldMath';

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
  fiveElementBeam: THREE.Mesh;
  studyLampLight: THREE.PointLight;
  dryingClothes: THREE.Mesh[];
  chickens: THREE.Group[];
  startledBirds: THREE.Group;
  taijiOverlay: THREE.Group;
  dispose: () => void;
}

/**
 * Builds finely crafted, grounded composite 3-14 part props across all 24 spaces
 * of the 1:1 Oval Double-Weilongwu, including authentic details from the reference photo
 * (e.g., Huatai stacked firewood bundle, foreground rice-drying mats, carved timber joinery).
 */
export function buildWeilongProps(
  mats: MaterialLibrary,
  isSoftwareGl: boolean
): PropAnimationRefs {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const localMaterials: THREE.Material[] = [];
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

  // Invisible click/raycast hitboxes for every interactable (no floating neon beacons ruining photorealism!)
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
  // 01 & 02. HALF-MOON POND MALLET & HE-PING GOLDEN RICE MATS + RAKE
  // =========================================================================
  const malletGroup = new THREE.Group();
  malletGroup.position.set(-2.4, groundHeightAt(-2.4, 37.8), 37.8);
  const cloth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.05, 0.45)), mats.indigoCloth);
  cloth.position.y = 0.03;
  malletGroup.add(cloth);
  const malletHead = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.05, 0.26, 8)), mats.darkTimber);
  malletHead.rotation.z = Math.PI * 0.5;
  malletHead.position.set(0.1, 0.11, 0);
  malletGroup.add(malletHead);
  const malletHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.025, 0.028, 0.22, 8)), mats.darkTimber);
  malletHandle.rotation.z = Math.PI * 0.5;
  malletHandle.position.set(-0.14, 0.11, 0);
  malletGroup.add(malletHandle);
  root.add(malletGroup);

  // Golden Rice Drying Bamboo Mats on He-Ping Courtyard
  for (const [mx, mz] of [
    [5.2, 29.2],
    [-6.0, 28.8],
  ]) {
    const matGroup = new THREE.Group();
    matGroup.position.set(mx, 0.02, mz);
    const bambooBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.04, 3.8)), mats.rammedEarth);
    bambooBase.position.y = 0.02;
    matGroup.add(bambooBase);
    const grainMound = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.1, 0.11, 3.3)), mats.goldenGrain);
    grainMound.position.y = 0.09;
    grainMound.receiveShadow = true;
    matGroup.add(grainMound);
    root.add(matGroup);
  }
  const rakeGroup = new THREE.Group();
  rakeGroup.position.set(5.2, 0.14, 29.2);
  const rakePole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8)), mats.darkTimber);
  rakePole.rotation.z = 0.55;
  rakePole.position.set(0.55, 0.9, 0);
  rakeGroup.add(rakePole);
  const rakeBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.24, 0.95)), mats.darkTimber);
  rakeBlade.position.set(-0.02, 0.12, 0);
  rakeGroup.add(rakeBlade);
  root.add(rakeGroup);

  // =========================================================================
  // 03. LOWER HALL: OIL-PAPER UMBRELLA STAND & BAMBOO HAT
  // =========================================================================
  const umbGroup = new THREE.Group();
  umbGroup.position.set(-4.2, 0.25, 19.2);
  addShadowDisc(umbGroup, 0.65);
  const umbShaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 1.35, 8)), mats.darkTimber);
  umbShaft.position.y = 0.68;
  umbGroup.add(umbShaft);
  const umbCanopy = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.68, 0.28, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xc9422c, roughness: 0.42 }))
  );
  umbCanopy.position.y = 1.28;
  umbGroup.add(umbCanopy);
  const hatCone = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.38, 0.16, 12)), mats.goldenGrain);
  hatCone.position.set(0.55, 0.16, 0.2);
  umbGroup.add(hatCone);
  root.add(umbGroup);

  // =========================================================================
  // 04. FRONT SKYWELL: TAIPING CERAMIC WATER VAT & BAMBOO BIRDCAGE
  // =========================================================================
  const vatGroup = new THREE.Group();
  vatGroup.position.set(-3.4, 0.15, 13.6);
  addShadowDisc(vatGroup, 0.72);
  const vatPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.42, 0.0),
    new THREE.Vector2(0.62, 0.45),
    new THREE.Vector2(0.58, 0.85),
    new THREE.Vector2(0.5, 0.92),
  ];
  const vatBody = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(vatPoints, 18)), mats.terracotta);
  vatBody.castShadow = castShadow;
  vatGroup.add(vatBody);
  const vatWater = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.49, 14)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x2f6b64, roughness: 0.18, metalness: 0.25 }))
  );
  vatWater.rotation.x = -Math.PI * 0.5;
  vatWater.position.y = 0.82;
  vatGroup.add(vatWater);
  root.add(vatGroup);

  const birdcageGroup = new THREE.Group();
  birdcageGroup.position.set(3.6, 3.1, 13.6);
  const cageCord = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.85, 6)), mats.darkTimber);
  cageCord.position.y = -0.42;
  birdcageGroup.add(cageCord);
  const cageBody = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.52, 10, 1, true)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xc29e59, wireframe: true }))
  );
  cageBody.position.y = -1.1;
  birdcageGroup.add(cageBody);
  const cageBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.3, 0.28, 0.08, 10)), mats.darkTimber);
  cageBase.position.y = -1.36;
  birdcageGroup.add(cageBase);
  const bird = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.08, 8, 6)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x8f6b43, roughness: 0.7 }))
  );
  bird.position.y = -1.12;
  birdcageGroup.add(bird);
  root.add(birdcageGroup);

  // =========================================================================
  // 05. MIDDLE HALL: EIGHT-IMMORTALS TABLE, TAISHI CHAIRS, ABACUS, GENEALOGY
  // =========================================================================
  const tableGroup = new THREE.Group();
  tableGroup.position.set(0, 0.45, 8.0);
  addShadowDisc(tableGroup, 1.35);
  const tableTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 0.1, 1.45)), mats.darkTimber);
  tableTop.position.y = 0.86;
  tableTop.castShadow = castShadow;
  tableGroup.add(tableTop);
  // Carved apron stretcher rails
  const tableApron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.14, 1.25)), mats.weatheredWoodDoor);
  tableApron.position.y = 0.74;
  tableGroup.add(tableApron);
  for (const [lx, lz] of [
    [-0.9, -0.6],
    [0.9, -0.6],
    [-0.9, 0.6],
    [0.9, 0.6],
  ]) {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.86, 0.11)), mats.darkTimber);
    leg.position.set(lx, 0.43, lz);
    tableGroup.add(leg);
  }
  const abacus = new THREE.Group();
  abacus.position.set(-0.55, 0.93, 0.12);
  abacus.add(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.04, 0.26)), mats.redLacquer));
  for (let b = -3; b <= 3; b++) {
    const bead = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.028, 6, 6)), mats.gildedGold);
    bead.position.set(b * 0.065, 0.025, (b % 2) * 0.04);
    abacus.add(bead);
  }
  tableGroup.add(abacus);
  const book = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.06, 0.48)), mats.indigoCloth);
  book.position.set(0.52, 0.94, 0.18);
  tableGroup.add(book);
  const teapot = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.12, 10, 8)), mats.terracotta);
  teapot.position.set(0.12, 1.0, -0.18);
  tableGroup.add(teapot);
  root.add(tableGroup);

  for (const sx of [-1.8, 1.8]) {
    const chair = new THREE.Group();
    chair.position.set(sx, 0.45, 8.0);
    chair.rotation.y = sx < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    addShadowDisc(chair, 0.55);
    const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.08, 0.62)), mats.darkTimber);
    seat.position.y = 0.52;
    chair.add(seat);
    const back = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.68, 0.09)), mats.darkTimber);
    back.position.set(0, 0.88, -0.27);
    chair.add(back);
    for (const [cx, cz] of [
      [-0.28, -0.25],
      [0.28, -0.25],
      [-0.28, 0.25],
      [0.28, 0.25],
    ]) {
      const cleg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.52, 0.08)), mats.darkTimber);
      cleg.position.set(cx, 0.26, cz);
      chair.add(cleg);
    }
    root.add(chair);
  }

  // =========================================================================
  // 06. REAR SKYWELL: BLUESTONE GRAIN MILL
  // =========================================================================
  const millBase = new THREE.Group();
  millBase.position.set(-2.2, 0.35, 2.8);
  addShadowDisc(millBase, 0.72);
  const millPedestal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.52, 0.52, 12)), mats.darkTimber);
  millPedestal.position.y = 0.26;
  millBase.add(millPedestal);
  const millLower = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.58, 0.6, 0.2, 18)), mats.graniteSlab);
  millLower.position.y = 0.62;
  millBase.add(millLower);

  const millUpperStone = new THREE.Group();
  millUpperStone.position.y = 0.82;
  const upperDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.56, 0.2, 18)), mats.graniteSlab);
  millUpperStone.add(upperDisc);
  const pushHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8)), mats.darkTimber);
  pushHandle.position.set(0.42, 0.28, 0);
  millUpperStone.add(pushHandle);
  millBase.add(millUpperStone);
  root.add(millBase);

  // =========================================================================
  // 07. UPPER HALL (ANCESTRAL SANCTUARY): ALTAR, INCENSE, JIAOBEI & DING LANTERN
  // =========================================================================
  const altarGroup = new THREE.Group();
  altarGroup.position.set(0, 0.85, -4.5);
  addShadowDisc(altarGroup, 2.2);
  const altarTable = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 1.05, 1.15)), mats.redLacquer);
  altarTable.position.y = 0.52;
  altarTable.castShadow = castShadow;
  altarGroup.add(altarTable);
  const shrineFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 2.2, 0.5)), mats.gildedGold);
  shrineFrame.position.set(0, 2.15, -0.35);
  altarGroup.add(shrineFrame);
  for (let t = -2; t <= 2; t++) {
    const tablet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.65, 0.08)), mats.redLacquer);
    tablet.position.set(t * 0.45, 1.55, -0.05);
    altarGroup.add(tablet);
  }
  const burner = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.26, 0.2, 0.34, 14)), mats.bronzeMetal);
  burner.position.set(0, 1.22, 0.28);
  altarGroup.add(burner);
  const incenseSmokeGroup = new THREE.Group();
  incenseSmokeGroup.position.set(0, 1.5, 0.28);
  const smokeMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xe6e8eb, transparent: true, opacity: 0.42 }));
  for (let s = 0; s < 6; s++) {
    const puff = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.06 + s * 0.025, 6, 6)), smokeMat);
    puff.position.set(((s % 3) - 1) * 0.08, s * 0.32, 0);
    incenseSmokeGroup.add(puff);
  }
  incenseSmokeGroup.visible = false;
  altarGroup.add(incenseSmokeGroup);
  root.add(altarGroup);

  const jiaobeiGeo = trackGeo(new THREE.CapsuleGeometry(0.05, 0.14, 4, 8));
  const jiaobeiLeft = new THREE.Mesh(jiaobeiGeo, mats.redLacquer);
  jiaobeiLeft.position.set(1.75, 1.95, -4.1);
  jiaobeiLeft.rotation.set(Math.PI * 0.5, 0.3, 0);
  root.add(jiaobeiLeft);
  const jiaobeiRight = new THREE.Mesh(jiaobeiGeo, mats.redLacquer);
  jiaobeiRight.position.set(1.98, 1.95, -4.05);
  jiaobeiRight.rotation.set(Math.PI * 0.5, -0.4, Math.PI);
  root.add(jiaobeiRight);

  const dingLanternGroup = new THREE.Group();
  dingLanternGroup.position.set(-2.2, 3.55, -2.8);
  const dingFrame = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.48, 0.48, 0.72, 8)), mats.lanternPaper);
  dingLanternGroup.add(dingFrame);
  const dingTrimTop = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.48, 0.14, 8)), mats.gildedGold);
  dingTrimTop.position.y = 0.42;
  dingLanternGroup.add(dingTrimTop);
  const dingTrimBot = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.48, 0.55, 0.14, 8)), mats.gildedGold);
  dingTrimBot.position.y = -0.42;
  dingLanternGroup.add(dingTrimBot);
  root.add(dingLanternGroup);

  // =========================================================================
  // 08, 09, 10. WEST WING: CANOPY BED, CRADLE, DRESSING TABLE, WELL, STUDY
  // =========================================================================
  const bedGroup = new THREE.Group();
  bedGroup.position.set(-16.2, 0.32, 13.6);
  addShadowDisc(bedGroup, 1.8);
  const bedFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 0.62, 2.0)), mats.redLacquer);
  bedFrame.position.y = 0.31;
  bedGroup.add(bedFrame);
  const quilt = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.1, 0.18, 1.75)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xb02e26, roughness: 0.78 }))
  );
  quilt.position.y = 0.71;
  bedGroup.add(quilt);
  for (const [px, pz] of [
    [-1.12, -0.92],
    [1.12, -0.92],
    [-1.12, 0.92],
    [1.12, 0.92],
  ]) {
    const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 2.35, 0.11)), mats.darkTimber);
    post.position.set(px, 1.18, pz);
    bedGroup.add(post);
  }
  const canopyTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.45, 0.14, 2.05)), mats.darkTimber);
  canopyTop.position.y = 2.35;
  bedGroup.add(canopyTop);
  root.add(bedGroup);

  const cradleBody = new THREE.Group();
  cradleBody.position.set(-14.2, 0.56, 13.0);
  const cradleBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.75, 0.42, 1.15)), mats.darkTimber);
  cradleBody.add(cradleBox);
  const cradleQuilt = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.16, 0.95)), mats.indigoCloth);
  cradleQuilt.position.y = 0.15;
  cradleBody.add(cradleQuilt);
  root.add(cradleBody);

  const chestGroup = new THREE.Group();
  chestGroup.position.set(-16.8, 0.32, 10.2);
  const chest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.3, 0.75, 0.72)), mats.darkTimber);
  chest.position.y = 0.38;
  chestGroup.add(chest);
  const mirrorDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16)), mats.gildedGold);
  mirrorDisc.rotation.z = Math.PI * 0.5;
  mirrorDisc.position.set(0.1, 1.05, 0);
  chestGroup.add(mirrorDisc);
  root.add(chestGroup);

  const wellGroup = new THREE.Group();
  wellGroup.position.set(-15.2, 0.32, 4.8);
  addShadowDisc(wellGroup, 1.0);
  const wellRing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.72, 0.78, 0.78, 16, 1, true)),
    mats.graniteSlab
  );
  wellRing.position.y = 0.39;
  wellGroup.add(wellRing);
  const wellPostL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 1.75, 0.12)), mats.darkTimber);
  wellPostL.position.set(-0.78, 0.88, 0);
  wellGroup.add(wellPostL);
  const wellPostR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 1.75, 0.12)), mats.darkTimber);
  wellPostR.position.set(0.78, 0.88, 0);
  wellGroup.add(wellPostR);
  const windlassBar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 1.65, 10)), mats.darkTimber);
  windlassBar.rotation.z = Math.PI * 0.5;
  windlassBar.position.y = 1.55;
  wellGroup.add(windlassBar);
  root.add(wellGroup);

  const studyGroup = new THREE.Group();
  studyGroup.position.set(-16.2, 0.32, -1.6);
  const desk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 0.82, 2.2)), mats.darkTimber);
  desk.position.y = 0.41;
  studyGroup.add(desk);
  const lampBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.16, 0.16, 10)), mats.bronzeMetal);
  lampBase.position.set(0, 0.9, 0);
  studyGroup.add(lampBase);
  const lampGlass = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.08, 0.11, 0.32, 10)),
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffe49e,
        emissive: 0xffa030,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.85,
      })
    )
  );
  lampGlass.position.set(0, 1.12, 0);
  studyGroup.add(lampGlass);
  const studyLampLight = new THREE.PointLight(0xffb85c, 1.2, 10, 1.8);
  studyLampLight.position.set(0, 1.3, 0);
  studyGroup.add(studyLampLight);
  root.add(studyGroup);

  // =========================================================================
  // 11, 12, 13. EAST WING: 3-WOK STOVE, LEICHA, WINNOWER, CHICKENS
  // =========================================================================
  const stoveGroup = new THREE.Group();
  stoveGroup.position.set(16.6, 0.32, 13.0);
  const stoveBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.55, 0.92, 4.0)), mats.rammedEarth);
  stoveBody.position.y = 0.46;
  stoveGroup.add(stoveBody);
  const ironMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x262628, roughness: 0.55, metalness: 0.75 }));
  for (const wz of [-1.15, 0, 1.15]) {
    const wok = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.5, 0.4, 0.18, 14)), ironMat);
    wok.position.set(0, 0.94, wz);
    stoveGroup.add(wok);
    const lid = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.48, 0.16, 12)), mats.darkTimber);
    lid.position.set(0, 1.1, wz);
    stoveGroup.add(lid);
  }
  const bellowsBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.5, 0.95)), mats.darkTimber);
  bellowsBox.position.set(-1.05, 0.4, 1.3);
  stoveGroup.add(bellowsBox);
  const bellowsHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8)), mats.darkTimber);
  bellowsHandle.rotation.x = Math.PI * 0.5;
  bellowsHandle.position.set(-1.05, 0.45, 2.05);
  stoveGroup.add(bellowsHandle);

  const wokSteamGroup = new THREE.Group();
  wokSteamGroup.position.set(0, 1.35, 0);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.14, 6, 6)), smokeMat);
    sp.position.set(0, (i % 3) * 0.38, (Math.floor(i / 2) - 1) * 1.1);
    wokSteamGroup.add(sp);
  }
  wokSteamGroup.visible = false;
  stoveGroup.add(wokSteamGroup);
  root.add(stoveGroup);

  const leichaTable = new THREE.Group();
  leichaTable.position.set(14.4, 0.32, 9.8);
  const lDesk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, 0.78, 1.0)), mats.darkTimber);
  lDesk.position.y = 0.39;
  leichaTable.add(lDesk);
  const mortar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.19, 0.24, 14)), mats.terracotta);
  mortar.position.set(0, 0.9, 0);
  leichaTable.add(mortar);
  const teaPaste = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.22, 12)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x3b7a3e, roughness: 0.45 }))
  );
  teaPaste.rotation.x = -Math.PI * 0.5;
  teaPaste.position.set(0, 1.01, 0);
  leichaTable.add(teaPaste);
  const leichaPestle = new THREE.Group();
  leichaPestle.position.set(0, 1.02, 0);
  const pestleStick = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.04, 0.65, 8)), mats.darkTimber);
  pestleStick.position.set(0.08, 0.28, 0);
  pestleStick.rotation.z = -0.25;
  leichaPestle.add(pestleStick);
  leichaTable.add(leichaPestle);
  root.add(leichaTable);

  const winGroup = new THREE.Group();
  winGroup.position.set(16.2, 0.32, -1.6);
  addShadowDisc(winGroup, 1.25);
  const drum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.62, 0.62, 0.68, 14)), mats.darkTimber);
  drum.rotation.x = Math.PI * 0.5;
  drum.position.set(0, 1.15, 0);
  winGroup.add(drum);
  const hopper = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.16, 0.55, 4)), mats.darkTimber);
  hopper.position.set(0, 1.95, 0);
  hopper.rotation.y = Math.PI * 0.25;
  winGroup.add(hopper);
  const chute = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 0.48, 0.56)), mats.darkTimber);
  chute.position.set(-0.78, 1.15, 0);
  winGroup.add(chute);
  const winnowerCrank = new THREE.Group();
  winnowerCrank.position.set(0, 1.15, 0.42);
  const crankArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.42, 0.06)), mats.bronzeMetal);
  crankArm.position.y = 0.18;
  winnowerCrank.add(crankArm);
  winGroup.add(winnowerCrank);
  const wineJar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.36, 0.78, 12)), mats.terracotta);
  wineJar.position.set(0.4, 0.39, 1.4);
  winGroup.add(wineJar);
  const redSeal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12)), mats.redLacquer);
  redSeal.position.set(0.4, 0.8, 1.4);
  winGroup.add(redSeal);
  root.add(winGroup);

  const chickens: THREE.Group[] = [];
  const henWhite = trackMat(new THREE.MeshStandardMaterial({ color: 0xf0e4cf, roughness: 0.85 }));
  const henBrown = trackMat(new THREE.MeshStandardMaterial({ color: 0xa66134, roughness: 0.85 }));
  for (let c = 0; c < 4; c++) {
    const hen = new THREE.Group();
    const hm = c % 2 === 0 ? henBrown : henWhite;
    const hBody = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.18, 8, 6)), hm);
    hBody.scale.set(1.2, 0.9, 0.85);
    hBody.position.y = 0.26;
    hen.add(hBody);
    const hHead = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.09, 6, 6)), hm);
    hHead.position.set(0.2, 0.4, 0);
    hen.add(hHead);
    const comb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 0.06, 0.03)), mats.redLacquer);
    comb.position.set(0.22, 0.48, 0);
    hen.add(comb);
    hen.position.set(14.8 + (c % 2) * 1.1, 0.32, 4.2 + Math.floor(c / 2) * 1.2);
    hen.rotation.y = c * 1.4;
    root.add(hen);
    chickens.push(hen);
  }

  // =========================================================================
  // 15 & 16. WEILONG ALLEY PULLEY GRAIN SACK & OUTER WEILONG ALARM GONG + BIRDS
  // =========================================================================
  const pulleyY = groundHeightAt(0, -27.2, 0);
  const pulleyGrainSack = new THREE.Group();
  pulleyGrainSack.position.set(0, pulleyY + 0.4, -27.2);
  const sack = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.38, 0.78, 10)), mats.rammedEarth);
  pulleyGrainSack.add(sack);
  const rope = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 4.0, 6)), mats.goldenGrain);
  rope.position.y = 2.1;
  pulleyGrainSack.add(rope);
  root.add(pulleyGrainSack);

  const gongY = groundHeightAt(18.7, -25.8, 0);
  const gongGroup = new THREE.Group();
  gongGroup.position.set(18.7, gongY, -25.8);
  gongGroup.rotation.y = -0.5;
  const gongFrameL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 1.65, 0.1)), mats.darkTimber);
  gongFrameL.position.set(-0.62, 0.82, 0);
  gongGroup.add(gongFrameL);
  const gongFrameR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 1.65, 0.1)), mats.darkTimber);
  gongFrameR.position.set(0.62, 0.82, 0);
  gongGroup.add(gongFrameR);
  const gongTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.45, 0.12, 0.12)), mats.darkTimber);
  gongTop.position.set(0, 1.65, 0);
  gongGroup.add(gongTop);
  const gongDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.48, 0.48, 0.07, 20)), mats.gildedGold);
  gongDisc.rotation.x = Math.PI * 0.5;
  gongDisc.position.set(0, 1.05, 0);
  gongGroup.add(gongDisc);
  root.add(gongGroup);

  const startledBirds = new THREE.Group();
  const birdMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x262930, roughness: 0.7 }));
  for (let b = 0; b < 9; b++) {
    const bGroup = new THREE.Group();
    const wL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.04, 0.16)), birdMat);
    wL.position.x = -0.22;
    wL.rotation.z = 0.25;
    const wR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.04, 0.16)), birdMat);
    wR.position.x = 0.22;
    wR.rotation.z = -0.25;
    bGroup.add(wL, wR);
    bGroup.position.set(Math.cos(b) * 12, 10.5 + (b % 3) * 1.4, -8 + Math.sin(b) * 12);
    startledBirds.add(bGroup);
  }
  startledBirds.visible = false;
  root.add(startledBirds);

  // =========================================================================
  // 17. HUATAI FIVE-ELEMENT STONES + RUSTIC STACKED TIMBER/FIREWOOD BUNDLE (1:1 PHOTO DETAIL!)
  // =========================================================================
  // Authentic stacked rustic firewood/timber pile in center of Huatai (clearly visible in photo!)
  const woodPileY = groundHeightAt(-1.4, -14.8, 0);
  const woodPile = new THREE.Group();
  woodPile.position.set(-1.4, woodPileY, -14.8);
  const logGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 2.4, 7));
  for (let l = 0; l < 11; l++) {
    const log = new THREE.Mesh(logGeo, l % 2 === 0 ? mats.darkTimber : mats.weatheredWoodDoor);
    log.rotation.z = Math.PI * 0.5 + ((l % 3) - 1) * 0.14;
    log.rotation.y = (l * 0.62) % Math.PI;
    log.position.set(((l % 4) - 1.5) * 0.45, 0.16 + Math.floor(l / 4) * 0.19, ((l % 3) - 1) * 0.42);
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
        emissiveIntensity: 0.05,
        roughness: 0.52,
        metalness: 0.18,
      })
    );
    const stone = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.42, 0)), sMat);
    stone.scale.set(1.25, 0.52, 1.05);
    stone.position.set(1.2, sy + 0.14, sz);
    root.add(stone);
    fiveElementStones.push(stone);
  });

  const fiveElementBeam = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.32, 0.08, 13.5)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0xf4c95d, transparent: true, opacity: 0.72 }))
  );
  fiveElementBeam.position.set(1.2, 2.0, -14.8);
  fiveElementBeam.rotation.x = 0.085;
  fiveElementBeam.visible = false;
  root.add(fiveElementBeam);

  // Drying Hakka indigo shirts on West Huatai bamboo rack
  const dryingClothes: THREE.Mesh[] = [];
  const rackY = groundHeightAt(-10.5, -11.8, 0);
  const rackPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 3.8, 8)), mats.bambooGreen);
  rackPole.rotation.z = Math.PI * 0.5;
  rackPole.position.set(-10.5, rackY + 1.9, -11.8);
  root.add(rackPole);
  for (let i = 0; i < 3; i++) {
    const shirt = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.85, 1.15)), mats.indigoCloth);
    shirt.position.set(-11.5 + i * 1.0, rackY + 1.32, -11.8);
    root.add(shirt);
    dryingClothes.push(shirt);
  }

  // =========================================================================
  // 18A-E. INNER WEILONG RING THEMED WEDGE ROOM PROPS
  // =========================================================================
  const loomGroup = new THREE.Group();
  loomGroup.position.set(-17.0, groundHeightAt(-17.0, -16.6), -16.6);
  loomGroup.rotation.y = 0.55;
  const loomFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 1.35, 1.1)), mats.darkTimber);
  loomFrame.position.y = 0.68;
  loomGroup.add(loomFrame);
  const loomCloth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 0.05, 0.92)), mats.indigoCloth);
  loomCloth.position.y = 0.85;
  loomGroup.add(loomCloth);
  const loomShuttle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.07, 0.09)), mats.gildedGold);
  loomShuttle.position.set(0, 0.92, 0);
  loomGroup.add(loomShuttle);
  root.add(loomGroup);

  const musicGroup = new THREE.Group();
  musicGroup.position.set(-9.9, groundHeightAt(-9.9, -20.9), -20.9);
  const drumBody = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.52, 14)), mats.redLacquer);
  drumBody.rotation.z = Math.PI * 0.5;
  drumBody.position.set(0, 0.82, 0);
  musicGroup.add(drumBody);
  const drumHead = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.39, 0.39, 0.54, 14)), mats.courtyardEarth);
  drumHead.rotation.z = Math.PI * 0.5;
  drumHead.position.set(0, 0.82, 0);
  musicGroup.add(drumHead);
  root.add(musicGroup);

  const qiaopiGroup = new THREE.Group();
  qiaopiGroup.position.set(9.9, groundHeightAt(9.9, -20.9), -20.9);
  const trunk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 0.58, 0.68)), mats.darkTimber);
  trunk.position.y = 0.29;
  qiaopiGroup.add(trunk);
  const gramoBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.26, 0.42)), mats.redLacquer);
  gramoBox.position.set(0.18, 0.71, 0);
  qiaopiGroup.add(gramoBox);
  const gramoHorn = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.28, 0.48, 12, 1, true)), mats.gildedGold);
  gramoHorn.rotation.z = -0.85;
  gramoHorn.position.set(0.32, 1.08, 0);
  qiaopiGroup.add(gramoHorn);
  const letterPack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.06, 0.22)), mats.courtyardEarth);
  letterPack.position.set(-0.32, 0.62, 0.05);
  qiaopiGroup.add(letterPack);
  root.add(qiaopiGroup);

  const carpGroup = new THREE.Group();
  carpGroup.position.set(17.0, groundHeightAt(17.0, -16.6), -16.6);
  const bench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.8, 0.72, 0.9)), mats.darkTimber);
  bench.position.y = 0.36;
  carpGroup.add(bench);
  const postA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.85, 0.18)), mats.rammedEarth);
  postA.position.set(-0.45, 1.15, 0);
  carpGroup.add(postA);
  const postB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.85, 0.18)), mats.rammedEarth);
  postB.position.set(0.45, 1.15, 0);
  carpGroup.add(postB);
  const carpentryBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.35, 0.16, 0.2)), mats.gildedGold);
  carpentryBeam.position.set(0, 1.85, 0);
  carpGroup.add(carpentryBeam);
  root.add(carpGroup);

  // =========================================================================
  // 19 & 20. DRAGON HALL LAND SHRINE, BOGONG FOREST SHRINE & DOUBLE-RING TAIJI AR OVERLAY
  // =========================================================================
  const dragonShrine = new THREE.Group();
  dragonShrine.position.set(0, groundHeightAt(0, -23.6), -23.6);
  const dsBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 1.05, 0.95)), mats.graniteSlab);
  dsBase.position.y = 0.52;
  dragonShrine.add(dsBase);
  const dsTablet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 1.25, 0.24)), mats.gildedGold);
  dsTablet.position.set(0, 1.65, -0.15);
  dragonShrine.add(dsTablet);
  root.add(dragonShrine);

  const bogongY = groundHeightAt(0, -46.5, 0);
  const bogongGroup = new THREE.Group();
  bogongGroup.position.set(0, bogongY, -46.5);
  addShadowDisc(bogongGroup, 1.3);
  const bPedestal = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.8, 0.72, 1.25)), mats.graniteSlab);
  bPedestal.position.y = 0.36;
  bogongGroup.add(bPedestal);
  const bRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.45, 0.7, 4)), mats.roofTile);
  bRoof.rotation.y = Math.PI * 0.25;
  bRoof.position.y = 2.05;
  bogongGroup.add(bRoof);
  const bStele = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.95, 0.22)), mats.graniteSlab);
  bStele.position.y = 1.18;
  bogongGroup.add(bStele);
  root.add(bogongGroup);

  // Double-Ring Taiji AR Geomancy Overlay (太极脉络透视)
  const taijiOverlay = new THREE.Group();
  const arGold = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xf6cf65, transparent: true, opacity: 0.78, side: THREE.DoubleSide })
  );
  const arJade = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x52c7a8, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
  );
  // Central South-to-North axis spine
  const axisLine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.14, 82)), arGold);
  axisLine.position.set(0, 9.6, 8.0);
  taijiOverlay.add(axisLine);

  // Inner & Outer Elliptical Halo Rings
  const innerArc = new THREE.Mesh(trackGeo(new THREE.RingGeometry(0.97, 1.0, 48, 1, 0, Math.PI)), arGold);
  innerArc.rotation.x = -Math.PI * 0.5;
  innerArc.scale.set(INNER_RING_RX, INNER_RING_RZ, 1);
  innerArc.position.set(0, 9.6, OVAL_CENTER_Z);
  taijiOverlay.add(innerArc);

  const outerArc = new THREE.Mesh(trackGeo(new THREE.RingGeometry(0.98, 1.0, 48, 1, 0, Math.PI)), arGold);
  outerArc.rotation.x = -Math.PI * 0.5;
  outerArc.scale.set(OUTER_RING_RX, OUTER_RING_RZ, 1);
  outerArc.position.set(0, 10.2, OVAL_CENTER_Z);
  taijiOverlay.add(outerArc);

  const southArc = new THREE.Mesh(trackGeo(new THREE.RingGeometry(15.6, 16.6, 42, 1, Math.PI, Math.PI)), arJade);
  southArc.rotation.x = -Math.PI * 0.5;
  southArc.position.set(0, 8.6, 38.6);
  taijiOverlay.add(southArc);

  taijiOverlay.visible = false;
  root.add(taijiOverlay);

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
    fiveElementBeam,
    studyLampLight,
    dryingClothes,
    chickens,
    startledBirds,
    taijiOverlay,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
    },
  };
}
