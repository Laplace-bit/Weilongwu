import * as THREE from 'three';
import { getWoodcarveMicroMaps, HANDCRAFTED_PAL, type MaterialLibrary } from './proceduralTextures';

/**
 * Generates a tapered, smoothly-shaded curved tube along a 3D CatmullRomCurve3.
 * Ideal for organic gnarled tree trunks, forked branches, S-curved goose/crane necks,
 * crescent water-buffalo horns, cat tails, and curved timber brackets.
 */
export function createTaperedCurveGeometry(
  controlPoints: THREE.Vector3[],
  radiusStart: number,
  radiusEnd: number,
  tubularSegments = 12,
  radialSegments = 8,
  capEnds = true
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(controlPoints);
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, p);
    // Smooth eased taper with gentle root flare at very bottom if radiusStart > radiusEnd
    const flare = i === 0 && radiusStart > radiusEnd ? 1.18 : 1.0;
    const r = THREE.MathUtils.lerp(radiusStart, radiusEnd, t) * flare;

    const N = frames.normals[i];
    const B = frames.binormals[i];

    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const theta = u * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      n.set(
        cos * N.x + sin * B.x,
        cos * N.y + sin * B.y,
        cos * N.z + sin * B.z
      ).normalize();

      v.copy(p).addScaledVector(n, r);
      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(u, t);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  if (capEnds) {
    // End cap at t = 1
    const tipCenterIdx = positions.length / 3;
    const tipPt = curve.getPointAt(1);
    const tipTan = frames.tangents[tubularSegments];
    positions.push(tipPt.x, tipPt.y, tipPt.z);
    normals.push(tipTan.x, tipTan.y, tipTan.z);
    uvs.push(0.5, 1.0);
    const lastRing = tubularSegments * stride;
    for (let j = 0; j < radialSegments; j++) {
      indices.push(lastRing + j, tipCenterIdx, lastRing + j + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a soft, velvety rounded gouache/woodcarved pillow sphere (no origami facets!)
 * for layered peach blossom clusters, camphor tree canopies, flowering bushes, and cumulus clouds.
 */
export function createSoftPillowGeometry(
  radius: number,
  seed: number,
  squashY = 0.78,
  widthSegs = 14,
  heightSegs = 10
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, widthSegs, heightSegs);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    dir.copy(v).normalize();
    const undulation =
      1.0 +
      0.11 * Math.sin(dir.x * 3.4 + seed) * Math.cos(dir.z * 3.1 - seed * 0.6) +
      0.07 * Math.sin(dir.y * 4.2 + dir.x * 2.5 + seed * 1.4);
    // Gently flatten underside so canopies and clouds feel buoyant and painterly
    const yScale = dir.y < 0 ? squashY * 0.82 : squashY;
    pos.setXYZ(i, v.x * undulation, v.y * undulation * yScale, v.z * undulation);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Wrapper for smooth woodcarved LatheGeometry profiles (robes, jars, lanterns, animal bodies).
 */
export function createTurnedLatheGeometry(
  profile: Array<[number, number]>,
  segments = 16
): THREE.LatheGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted gently cupped petal / wing-feather geometry (curved lengthwise + cupped crosswise).
 */
export function createCuppedPetalGeometry(
  width: number,
  length: number,
  cupDepth = 0.035
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, length, 3, 5);
  // Shift pivot to base of petal (y = 0 -> length)
  geo.translate(0, length * 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const ty = THREE.MathUtils.clamp(y / length, 0, 1);
    const nx = x / (width * 0.5); // -1..1
    // Taper base and pointed tip like a true lotus petal
    const profileW = Math.sin(Math.pow(ty, 0.72) * Math.PI);
    const finalX = x * (0.28 + 0.85 * profileW);
    // Cup inward across width & gently arch outward along length
    const cupZ = (1 - nx * nx) * cupDepth * Math.sin(ty * Math.PI) + Math.pow(ty, 1.8) * length * 0.14;
    pos.setXYZ(i, finalX, y, cupZ);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted V-notched lotus pad with gently upturned wavy rim so pads float gracefully on pond water.
 */
export function createSculptedLotusPadGeometry(radius = 0.56, segments = 22): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(radius, segments, 0.14, Math.PI * 1.91);
  geo.rotateX(-Math.PI * 0.5);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z) / radius;
    const ang = Math.atan2(z, x);
    // Subtle upturned rim + soft organic wave
    const rimLift = Math.pow(r, 2.2) * 0.048 + Math.sin(ang * 5.0) * 0.012 * r;
    pos.setY(i, rimLift);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a gracefully arched, multi-segment weeping willow frond ribbon
 * that drapes outward from the willow canopy and tapers cleanly toward the pond water.
 */
export function createWillowFrondGeometry(
  length: number,
  outwardArch: number,
  widthTop = 0.14,
  segments = 7
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = -t * length;
    // Gentle outward bow near top, then soft vertical drape
    const z = Math.sin(t * Math.PI * 0.65) * outwardArch + t * outwardArch * 0.25;
    // Leafy scalloped width profile tapering to a fine tip
    const leafW = widthTop * (1.0 - t * 0.82) * (0.8 + 0.28 * Math.sin(t * Math.PI * 5.0));
    positions.push(-leafW, y, z, leafW, y, z);
    uvs.push(0, t, 1, t);
    if (i < segments) {
      const row = i * 2;
      indices.push(row, row + 1, row + 3, row, row + 3, row + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export interface LanternSharedGeos {
  melonBody: THREE.BufferGeometry;
  collar: THREE.BufferGeometry;
  cord: THREE.BufferGeometry;
  tasselKnot: THREE.BufferGeometry;
  tasselFringe: THREE.BufferGeometry;
  ribRing: THREE.BufferGeometry;
  miniRoof: THREE.BufferGeometry;
}

export function createLanternSharedGeos(
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T
): LanternSharedGeos {
  // Turned melon-shaped silk palace lantern body (瓜形灯笼)
  const melonProfile: Array<[number, number]> = [
    [0.09, -0.25],
    [0.19, -0.2],
    [0.255, -0.1],
    [0.27, 0.0],
    [0.255, 0.1],
    [0.19, 0.2],
    [0.09, 0.25],
  ];
  const melonBody = trackGeo(createTurnedLatheGeometry(melonProfile, 14));
  // Subtle vertical melon fluting along meridians
  const pos = melonBody.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.02) {
      const ang = Math.atan2(z, x);
      const flute = 1.0 + 0.055 * Math.cos(ang * 8.0);
      pos.setX(i, x * flute);
      pos.setZ(i, z * flute);
    }
  }
  melonBody.computeVertexNormals();

  return {
    melonBody,
    collar: trackGeo(new THREE.CylinderGeometry(0.115, 0.125, 0.055, 10)),
    cord: trackGeo(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 6)),
    tasselKnot: trackGeo(new THREE.SphereGeometry(0.036, 8, 6)),
    tasselFringe: trackGeo(new THREE.CylinderGeometry(0.022, 0.052, 0.25, 8)),
    ribRing: trackGeo(new THREE.TorusGeometry(0.25, 0.01, 5, 14)),
    miniRoof: trackGeo(new THREE.ConeGeometry(0.46, 0.22, 4)),
  };
}

/**
 * Builds a refined handcrafted Hakka melon-ribbed hanging lantern (木托金环瓜形红灯笼).
 */
export function createCraftedLantern(
  mats: MaterialLibrary,
  geos: LanternSharedGeos,
  scale = 1.0,
  cordLen = 0.34
): THREE.Group {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(geos.cord, mats.darkTimber);
  cord.scale.set(1, cordLen / 0.34, 1);
  cord.position.y = 0.26 + cordLen * 0.5;
  g.add(cord);

  const body = new THREE.Mesh(geos.melonBody, mats.lanternPaper);
  g.add(body);

  // Subtle gilded waist band accent
  const band = new THREE.Mesh(geos.ribRing, mats.gildedGold);
  band.rotation.x = Math.PI * 0.5;
  band.scale.set(1.04, 1.04, 0.6);
  g.add(band);

  const topCollar = new THREE.Mesh(geos.collar, mats.gildedGold);
  topCollar.position.y = 0.26;
  g.add(topCollar);

  const botCollar = new THREE.Mesh(geos.collar, mats.gildedGold);
  botCollar.position.y = -0.26;
  g.add(botCollar);

  const knot = new THREE.Mesh(geos.tasselKnot, mats.gildedGold);
  knot.position.y = -0.31;
  g.add(knot);

  const fringe = new THREE.Mesh(geos.tasselFringe, mats.redLacquer);
  fringe.position.y = -0.45;
  g.add(fringe);

  g.scale.setScalar(scale);
  return g;
}

/**
 * Creates a carved Chinese drum stone (抱鼓石) flanking the main recessed portal.
 */
export function createDrumStone(
  mats: MaterialLibrary,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  scale = 1.0
): THREE.Group {
  const g = new THREE.Group();
  // Stepped carved plinth base
  const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.44, 0.24, 0.72)), mats.granitePlinth);
  base.position.set(0, 0.12, 0.06);
  g.add(base);

  const waist = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.16, 0.58)), mats.graniteSlab);
  waist.position.set(0, 0.31, 0.06);
  g.add(waist);

  // Rounded carved stone drum disc facing outward
  const drum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.24, 16)), mats.graniteSlab);
  drum.rotation.z = Math.PI * 0.5;
  drum.position.set(0, 0.58, 0.14);
  g.add(drum);

  // Carved relief boss on both faces of the drum
  const boss = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.28, 12)), mats.granitePlinth);
  boss.rotation.z = Math.PI * 0.5;
  boss.position.set(0, 0.58, 0.14);
  g.add(boss);

  // Rear stone scroll brace tying drum to door jamb
  const brace = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.26, 0.56, 0.28)), mats.granitePlinth);
  brace.position.set(0, 0.48, -0.14);
  g.add(brace);

  g.scale.setScalar(scale);
  return g;
}

/**
 * Creates a carved wooden bracket (雀替 / 花牙) with scrolled woodcarving silhouette.
 */
export function createCarvedBracket(
  mats: MaterialLibrary,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  width = 0.52,
  height = 0.34,
  thickness = 0.1
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.bezierCurveTo(width * 0.72, -height * 0.12, width * 0.45, -height * 0.45, width * 0.22, -height * 0.72);
  shape.quadraticCurveTo(width * 0.08, -height * 0.88, 0, -height);
  shape.closePath();

  const geo = trackGeo(
    new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 2,
    })
  );
  geo.translate(0, 0, -thickness * 0.5);
  return new THREE.Mesh(geo, mats.darkTimber);
}

/**
 * Helper to create a warm woodcarved/gouache matte painted material with subtle
 * procedural woodcarving micro-grain normal & roughness variation (breaking flat CG plastic look).
 */
export function createPaintedWoodMat(
  colorHex: number,
  trackMat: <T extends THREE.Material>(m: T) => T,
  roughness = 0.68,
  metalness = 0.02
): THREE.MeshStandardMaterial {
  const micro = getWoodcarveMicroMaps();
  return trackMat(
    new THREE.MeshStandardMaterial({
      color: colorHex,
      normalMap: micro.normal,
      normalScale: new THREE.Vector2(0.16, 0.16),
      roughnessMap: micro.roughness,
      roughness,
      metalness,
    })
  );
}

export const SCULPT_COLORS = {
  blossomCore: 0xe67c8c,
  blossomMid: HANDCRAFTED_PAL.pink,
  blossomHighlight: HANDCRAFTED_PAL.blossomLight,
  blossomApricot: 0xfadcc4,
  willowLeafDeep: 0x6ea858,
  willowLeafMid: HANDCRAFTED_PAL.willow,
  willowLeafTip: HANDCRAFTED_PAL.willowBright,
  reedGreen: 0x4f8e59,
  reedTip: 0xc9b578,
  porcelainBlue: 0x457ea8,
  brassWarm: 0xd8a846,
} as const;
