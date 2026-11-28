import * as THREE from 'three';
import {
  attachSubsurfaceShader,
  HANDCRAFTED_PAL,
  physicalEnvUniforms,
  type MaterialLibrary,
} from './proceduralTextures';
import {
  createCarvedBracket,
  createCraftedLantern,
  createCuppedPetalGeometry,
  createDrumStone,
  createFoliageCardClusterGeometry,
  createLanternSharedGeos,
  createPaintedWoodMat,
  createSculptedLotusPadGeometry,
  createSoftPillowGeometry,
  createTaperedCurveGeometry,
  createTurnedLatheGeometry,
  createWillowFrondGeometry,
  SCULPT_COLORS,
} from './sculptHelpers';
import {
  FRONT_CENTER_Z,
  FRONT_STRAIGHT_HALF_W,
  groundHeightAt,
  INNER_BAY_COUNT,
  INNER_OPEN_OUTER_BAYS,
  INNER_RING_HALF_DEPTH,
  INNER_RING_RX,
  INNER_RING_RZ,
  isDragonApexBay,
  isRingRoomPartitionBoundary,
  isValidTreePosition,
  OUTER_BAY_COUNT,
  OUTER_OPEN_OUTER_BAYS,
  OUTER_RING_HALF_DEPTH,
  OUTER_RING_RX,
  OUTER_RING_RZ,
  OVAL_CENTER_Z,
  sampleInnerWeilongCurve,
  sampleOuterWeilongCurve,
} from './worldMath';

export interface ArchitectureRefs {
  root: THREE.Group;
  skyDome: THREE.Mesh;
  doumenEastLeft: THREE.Group;
  doumenEastRight: THREE.Group;
  doumenWestLeft: THREE.Group;
  doumenWestRight: THREE.Group;
  koiGroup: THREE.Group;
  lanternLights: THREE.PointLight[];
  rainCurtainMeshes: THREE.Mesh[];
  updateWater: (
    t: number,
    nightFactor: number,
    rainFactor: number,
    skyZenithHex?: number,
    skyHorizonHex?: number,
    sunColorHex?: number,
    lanternGlow?: number
  ) => void;
  dispose: () => void;
}

interface EaveInstanceData {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface ColumnInstanceData {
  x: number;
  yBase: number;
  z: number;
  height: number;
}

/**
 * Deterministic century-old timber settling undulation so long eaves & ridges breathe organically
 * like 150-year-old hand-built Hakka cedar joinery instead of ruler-straight CAD geometry.
 */
function organicRoofSettling(x: number, z: number): number {
  return (
    Math.sin(x * 0.21 + z * 0.13) * 0.038 +
    Math.cos(x * 0.43 - z * 0.29) * 0.022 +
    Math.sin((x - z) * 0.11) * 0.025
  );
}

/**
 * Builds a multi-strip concave Chinese catenary roof slope (反宇举折) with world-scale tile UVs
 * and subtle century-old settling undulation.
 * p0 -> p1 is the eave edge; p3 -> p2 is the ridge edge (CCW winding from exterior).
 */
function createCurvedRoofStrip(
  eave0: THREE.Vector3,
  eave1: THREE.Vector3,
  ridge1: THREE.Vector3,
  ridge0: THREE.Vector3,
  tileScaleU = 2.0,
  tileScaleV = 2.0,
  slopeSteps = 4,
  sagAmount = 0.22
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const wBot = eave0.distanceTo(eave1);
  const wTop = ridge0.distanceTo(ridge1);
  const hSide = eave0.distanceTo(ridge0);
  const uBot = wBot / tileScaleU;
  const uTop = wTop / tileScaleU;
  const vTotal = hSide / tileScaleV;

  const pL = new THREE.Vector3();
  const pR = new THREE.Vector3();

  for (let s = 0; s <= slopeSteps; s++) {
    const f = s / slopeSteps; // 0 = eave, 1 = ridge
    // Authentic Chinese concave curve (反宇举折): gentle upward eave sweep + graceful scooped waist
    const concaveSag = -sagAmount * Math.sin(f * Math.PI) * (1.0 - 0.16 * f);
    // Slight eave lip lift at f == 0 for graceful Lingnan eave tilt
    const eaveLift = f === 0 ? 0.035 : 0.0;

    pL.lerpVectors(eave0, ridge0, f);
    pR.lerpVectors(eave1, ridge1, f);

    pL.y += concaveSag + eaveLift + organicRoofSettling(pL.x, pL.z);
    pR.y += concaveSag + eaveLift + organicRoofSettling(pR.x, pR.z);

    const uRowWidth = THREE.MathUtils.lerp(uBot, uTop, f);
    const uOffset = (uBot - uRowWidth) * 0.5;
    const vCoord = f * vTotal;

    positions.push(pL.x, pL.y, pL.z, pR.x, pR.y, pR.z);
    uvs.push(uOffset, vCoord, uOffset + uRowWidth, vCoord);

    if (s < slopeSteps) {
      const row = s * 2;
      indices.push(row, row + 1, row + 3, row, row + 3, row + 2);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a single crisp world-UV triangle (for gable infill walls).
 */
function createWorldUvTri(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  tileScale = 2.6
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    p0.x, p0.y, p0.z,
    p1.x, p1.y, p1.z,
    p2.x, p2.y, p2.z,
  ]);
  const w = p0.distanceTo(p1);
  const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
  const h = mid.distanceTo(p2);
  const uvs = new Float32Array([
    0, 0,
    w / tileScale, 0,
    (w * 0.5) / tileScale, h / tileScale,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a subdivided 3-tier concave triangular hip roof face (for iconic Skywell pyramidal roofs).
 */
function createCurvedRoofTri(
  eave0: THREE.Vector3,
  eave1: THREE.Vector3,
  apex: THREE.Vector3,
  tileScale = 2.0,
  tiers = 3,
  sagAmount = 0.19
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const wBase = eave0.distanceTo(eave1);
  const midBase = new THREE.Vector3().addVectors(eave0, eave1).multiplyScalar(0.5);
  const hTotal = midBase.distanceTo(apex);

  const pL = new THREE.Vector3();
  const pR = new THREE.Vector3();

  for (let t = 0; t <= tiers; t++) {
    const f = t / tiers;
    const concaveSag = -sagAmount * Math.sin(f * Math.PI);
    pL.lerpVectors(eave0, apex, f);
    pR.lerpVectors(eave1, apex, f);
    pL.y += concaveSag + organicRoofSettling(pL.x, pL.z) * 0.7;
    pR.y += concaveSag + organicRoofSettling(pR.x, pR.z) * 0.7;

    const uSpan = (wBase * (1 - f)) / tileScale;
    const uStart = ((wBase / tileScale) - uSpan) * 0.5;
    const vCoord = (f * hTotal) / tileScale;

    positions.push(pL.x, pL.y, pL.z, pR.x, pR.y, pR.z);
    uvs.push(uStart, vCoord, uStart + uSpan, vCoord);

    if (t < tiers) {
      const row = t * 2;
      indices.push(row, row + 1, row + 3, row, row + 3, row + 2);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the 1:1 photorealistic Meizhou Oval Double-Weilongwu matching
 * /public/assets/aistudio/image_2a7cd311.png with painstaking detail on every tile,
 * eave rafter, ridge spine, granite plinth, weathered lime wall, carved column, and landscape element.
 */
export function buildWeilongArchitecture(
  mats: MaterialLibrary,
  isSoftwareGl: boolean
): ArchitectureRefs {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const localMaterials: THREE.Material[] = [];
  const lanternLights: THREE.PointLight[] = [];
  const rainCurtainMeshes: THREE.Mesh[] = [];

  const eaveTiles: EaveInstanceData[] = [];
  const rafterTails: EaveInstanceData[] = [];
  const columns: ColumnInstanceData[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    localMaterials.push(m);
    return m;
  };

  const castShadow = !isSoftwareGl;
  const lanternGeos = createLanternSharedGeos(trackGeo);
  const animatedWillowFronds: Array<{ mesh: THREE.Object3D; phase: number; baseRx: number; baseRz: number }> = [];
  const animatedReeds: Array<{ mesh: THREE.Object3D; phase: number }> = [];
  const animatedKoiTails: Array<{ tail: THREE.Object3D; fin: THREE.Object3D; phase: number }> = [];

  // Helper: add a box mesh with optional shadow casting
  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    rotY = 0,
    parent: THREE.Object3D = root,
    cast = castShadow
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  /**
   * Helper: build a weathered wall segment complete with 3D cut-granite foundation plinth (条石勒脚),
   * world-UV-scaled Lingnan peeling white lime plaster upper wall (zero horizontal texture stretch!),
   * and dark wooden cornice frieze under the eave.
   */
  const addCraftedWall = (
    len: number,
    height: number,
    thickness: number,
    cx: number,
    yBase: number,
    cz: number,
    rotY = 0,
    mat: THREE.Material = mats.limeWall,
    parent: THREE.Object3D = root
  ) => {
    const plinthH = Math.min(0.52, height * 0.2);
    // Cut-granite foundation plinth (proud by 4cm for real architectural relief!)
    addBox(len + 0.04, plinthH, thickness + 0.06, cx, yBase + plinthH * 0.5, cz, mats.granitePlinth, rotY, parent);
    // Main weathered lime plaster wall body with world-scale horizontal UVs so peeling plaster never stretches!
    const wallH = Math.max(0.2, height - plinthH);
    const wallGeo = trackGeo(new THREE.BoxGeometry(len, wallH, thickness));
    const uScale = Math.max(1, len / 3.2);
    const uvAttr = wallGeo.attributes.uv as THREE.BufferAttribute;
    // Scale U on the front/back (+Z/-Z) faces (vertices 16..23 in BoxGeometry)
    for (let i = 16; i < 24; i++) {
      uvAttr.setX(i, uvAttr.getX(i) * uScale);
    }
    uvAttr.needsUpdate = true;
    const wallMesh = new THREE.Mesh(wallGeo, mat);
    wallMesh.position.set(cx, yBase + plinthH + wallH * 0.5, cz);
    wallMesh.rotation.y = rotY;
    wallMesh.castShadow = castShadow;
    wallMesh.receiveShadow = true;
    parent.add(wallMesh);
    // Subtle dark timber top plate / eave shadow frieze strip
    addBox(len + 0.06, 0.14, thickness + 0.1, cx, yBase + height - 0.07, cz, mats.darkTimber, rotY, parent, false);
  };

  /**
   * Helper: place a recessed dark-framed mullioned window with granite sill & timber lintel.
   */
  const addWindow = (
    w: number,
    h: number,
    cx: number,
    cy: number,
    cz: number,
    rotY: number,
    parent: THREE.Object3D = root
  ) => {
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    g.rotation.y = rotY;
    // Recessed lattice pane
    const pane = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, 0.08)), mats.windowLattice);
    g.add(pane);
    // Outer wooden surround frame
    const topBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.16, 0.1, 0.16)), mats.darkTimber);
    topBar.position.y = h * 0.5 + 0.04;
    g.add(topBar);
    const botSill = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.18, 0.1, 0.2)), mats.granitePlinth);
    botSill.position.y = -h * 0.5 - 0.04;
    g.add(botSill);
    parent.add(g);
  };

  /**
   * Helper: push instanced 3D barrel-tile drip caps (瓦当) & dark cedar rafter tails (椽头)
   * along any straight eave line from a -> b facing outward in normal (nx, nz).
   */
  const registerEaveMicroGeometry = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    outNx: number,
    outNz: number,
    pitchAngle: number,
    step = 0.42
  ) => {
    const dist = Math.hypot(bx - ax, bz - az);
    const count = Math.max(2, Math.floor(dist / step));
    const yaw = Math.atan2(outNx, outNz);
    for (let i = 0; i <= count; i++) {
      const f = i / count;
      const ex = ax + (bx - ax) * f;
      const ey = ay + (by - ay) * f;
      const ez = az + (bz - az) * f;
      eaveTiles.push({
        x: ex - outNx * 0.04,
        y: ey - 0.01,
        z: ez - outNz * 0.04,
        yaw,
        pitch: pitchAngle,
      });
      if (i % 2 === 0) {
        rafterTails.push({
          x: ex - outNx * 0.22,
          y: ey - 0.13,
          z: ez - outNz * 0.22,
          yaw,
          pitch: pitchAngle,
        });
      }
    }
  };

  /**
   * Helper: build a photorealistic concave double-pitched Qing-tile roof (反宇举折)
   * subdivided longitudinally & along slope so every roof breathes with organic hand-built curvature!
   */
  const addGableRoof = (opts: {
    cx: number;
    cz: number;
    length: number; // along ridge
    span: number; // across slope (eave to eave)
    eaveY: number;
    ridgeY: number;
    ridgeAlong: 'x' | 'z';
    overhang?: number;
    gableEnds?: boolean;
    gableBaseY?: number;
  }) => {
    const {
      cx,
      cz,
      length,
      span,
      eaveY,
      ridgeY,
      ridgeAlong,
      overhang = 0.65,
      gableEnds = true,
      gableBaseY = eaveY,
    } = opts;
    const halfL = length * 0.5 + overhang * 0.5;
    const halfS = span * 0.5 + overhang;
    const pitch = Math.atan2(ridgeY - eaveY, halfS);
    const longSteps = Math.max(4, Math.round((halfL * 2) / 3.4));

    if (ridgeAlong === 'x') {
      for (let i = 0; i < longSteps; i++) {
        const x0 = cx - halfL + (i / longSteps) * (halfL * 2);
        const x1 = cx - halfL + ((i + 1) / longSteps) * (halfL * 2);
        const r0 = new THREE.Vector3(x0, ridgeY, cz);
        const r1 = new THREE.Vector3(x1, ridgeY, cz);
        const s0 = new THREE.Vector3(x0, eaveY, cz + halfS);
        const s1 = new THREE.Vector3(x1, eaveY, cz + halfS);
        const n0 = new THREE.Vector3(x0, eaveY, cz - halfS);
        const n1 = new THREE.Vector3(x1, eaveY, cz - halfS);

        const southMesh = new THREE.Mesh(
          trackGeo(createCurvedRoofStrip(s0, s1, r1, r0, 2.0, 2.0, 4, 0.22)),
          mats.roofTile
        );
        southMesh.castShadow = castShadow;
        southMesh.receiveShadow = true;
        root.add(southMesh);

        const northMesh = new THREE.Mesh(
          trackGeo(createCurvedRoofStrip(n1, n0, r0, r1, 2.0, 2.0, 4, 0.22)),
          mats.roofTile
        );
        northMesh.castShadow = castShadow;
        northMesh.receiveShadow = true;
        root.add(northMesh);

        // Segmented organic lime-mortar main ridge spine (正脊) + shadow-sealing purlin beam
        const ra = r0.clone();
        ra.y += organicRoofSettling(ra.x, ra.z) + 0.1;
        const rb = r1.clone();
        rb.y += organicRoofSettling(rb.x, rb.z) + 0.1;
        const rSegLen = ra.distanceTo(rb) + 0.18;
        const rBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.3, rSegLen)), mats.limeRidge);
        rBar.position.lerpVectors(ra, rb, 0.5);
        rBar.lookAt(rb);
        rBar.castShadow = castShadow;
        rBar.receiveShadow = true;
        root.add(rBar);
        // Solid cedar ridge purlin tucked under the ridge seam to block any razor-thin sunlight leaks onto interior floors
        const rPurlin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.58, 0.28, rSegLen + 0.08)), mats.darkTimber);
        rPurlin.position.lerpVectors(ra, rb, 0.5);
        rPurlin.position.y -= 0.19;
        rPurlin.lookAt(rb.x, rb.y - 0.19, rb.z);
        rPurlin.castShadow = castShadow;
        root.add(rPurlin);
        const rCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.1, rSegLen + 0.04)), mats.limeRidge);
        rCap.position.lerpVectors(ra, rb, 0.5);
        rCap.position.y += 0.14;
        rCap.lookAt(rb.x, rb.y + 0.14, rb.z);
        rCap.castShadow = castShadow;
        root.add(rCap);
      }

      if (gableEnds) {
        const gW1 = new THREE.Vector3(cx - halfL + 0.25, gableBaseY, cz + halfS - overhang * 0.6);
        const gW2 = new THREE.Vector3(cx - halfL + 0.25, gableBaseY, cz - halfS + overhang * 0.6);
        const gWT = new THREE.Vector3(cx - halfL + 0.25, ridgeY, cz);
        const gWMesh = new THREE.Mesh(trackGeo(createWorldUvTri(gW1, gW2, gWT, 3.6)), mats.limeWall);
        gWMesh.castShadow = castShadow;
        gWMesh.receiveShadow = true;
        root.add(gWMesh);

        const gE1 = new THREE.Vector3(cx + halfL - 0.25, gableBaseY, cz - halfS + overhang * 0.6);
        const gE2 = new THREE.Vector3(cx + halfL - 0.25, gableBaseY, cz + halfS - overhang * 0.6);
        const gET = new THREE.Vector3(cx + halfL - 0.25, ridgeY, cz);
        const gEMesh = new THREE.Mesh(trackGeo(createWorldUvTri(gE1, gE2, gET, 3.6)), mats.limeWall);
        gEMesh.castShadow = castShadow;
        gEMesh.receiveShadow = true;
        root.add(gEMesh);

        const slopeLen = Math.hypot(halfS, ridgeY - eaveY);
        for (const endX of [cx - halfL + 0.06, cx + halfL - 0.06]) {
          for (const dirZ of [-1, 1]) {
            const verge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.18, slopeLen)), mats.limeRidge);
            verge.position.set(endX, (ridgeY + eaveY) * 0.5 + 0.02, cz + dirZ * halfS * 0.5);
            verge.rotation.x = dirZ * pitch;
            verge.castShadow = castShadow;
            root.add(verge);
          }
        }
      }

      registerEaveMicroGeometry(cx - halfL, eaveY, cz + halfS, cx + halfL, eaveY, cz + halfS, 0, 1, pitch, 0.72);
      registerEaveMicroGeometry(cx - halfL, eaveY, cz - halfS, cx + halfL, eaveY, cz - halfS, 0, -1, pitch, 0.72);
    } else {
      for (let i = 0; i < longSteps; i++) {
        const z0 = cz - halfL + (i / longSteps) * (halfL * 2);
        const z1 = cz - halfL + ((i + 1) / longSteps) * (halfL * 2);
        const r0 = new THREE.Vector3(cx, ridgeY, z0);
        const r1 = new THREE.Vector3(cx, ridgeY, z1);
        const e0 = new THREE.Vector3(cx + halfS, eaveY, z0);
        const e1 = new THREE.Vector3(cx + halfS, eaveY, z1);
        const w0 = new THREE.Vector3(cx - halfS, eaveY, z0);
        const w1 = new THREE.Vector3(cx - halfS, eaveY, z1);

        const eastMesh = new THREE.Mesh(
          trackGeo(createCurvedRoofStrip(e1, e0, r0, r1, 2.0, 2.0, 4, 0.21)),
          mats.roofTile
        );
        eastMesh.castShadow = castShadow;
        eastMesh.receiveShadow = true;
        root.add(eastMesh);

        const westMesh = new THREE.Mesh(
          trackGeo(createCurvedRoofStrip(w0, w1, r1, r0, 2.0, 2.0, 4, 0.21)),
          mats.roofTile
        );
        westMesh.castShadow = castShadow;
        westMesh.receiveShadow = true;
        root.add(westMesh);

        const ra = r0.clone();
        ra.y += organicRoofSettling(ra.x, ra.z) + 0.09;
        const rb = r1.clone();
        rb.y += organicRoofSettling(rb.x, rb.z) + 0.09;
        const rSegLen = ra.distanceTo(rb) + 0.18;
        const rBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.28, rSegLen)), mats.limeRidge);
        rBar.position.lerpVectors(ra, rb, 0.5);
        rBar.lookAt(rb);
        rBar.castShadow = castShadow;
        rBar.receiveShadow = true;
        root.add(rBar);
        const rPurlin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.56, 0.26, rSegLen + 0.08)), mats.darkTimber);
        rPurlin.position.lerpVectors(ra, rb, 0.5);
        rPurlin.position.y -= 0.18;
        rPurlin.lookAt(rb.x, rb.y - 0.18, rb.z);
        rPurlin.castShadow = castShadow;
        root.add(rPurlin);
        const rCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.44, 0.09, rSegLen + 0.04)), mats.limeRidge);
        rCap.position.lerpVectors(ra, rb, 0.5);
        rCap.position.y += 0.13;
        rCap.lookAt(rb.x, rb.y + 0.13, rb.z);
        rCap.castShadow = castShadow;
        root.add(rCap);
      }

      if (gableEnds) {
        const slopeLen = Math.hypot(halfS, ridgeY - eaveY);
        for (const endZ of [cz - halfL + 0.06, cz + halfL - 0.06]) {
          for (const dirX of [-1, 1]) {
            const verge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(slopeLen, 0.18, 0.22)), mats.limeRidge);
            verge.position.set(cx + dirX * halfS * 0.5, (ridgeY + eaveY) * 0.5 + 0.02, endZ);
            verge.rotation.z = -dirX * pitch;
            verge.castShadow = castShadow;
            root.add(verge);
          }
        }
        const gS1 = new THREE.Vector3(cx - halfS + overhang * 0.5, gableBaseY, cz + halfL - 0.22);
        const gS2 = new THREE.Vector3(cx + halfS - overhang * 0.5, gableBaseY, cz + halfL - 0.22);
        const gST = new THREE.Vector3(cx, ridgeY, cz + halfL - 0.22);
        const gSMesh = new THREE.Mesh(trackGeo(createWorldUvTri(gS1, gS2, gST, 3.6)), mats.limeWall);
        gSMesh.castShadow = castShadow;
        gSMesh.receiveShadow = true;
        root.add(gSMesh);

        const gN1 = new THREE.Vector3(cx + halfS - overhang * 0.5, gableBaseY, cz - halfL + 0.22);
        const gN2 = new THREE.Vector3(cx - halfS + overhang * 0.5, gableBaseY, cz - halfL + 0.22);
        const gNT = new THREE.Vector3(cx, ridgeY, cz - halfL + 0.22);
        const gNMesh = new THREE.Mesh(trackGeo(createWorldUvTri(gN1, gN2, gNT, 3.6)), mats.limeWall);
        gNMesh.castShadow = castShadow;
        gNMesh.receiveShadow = true;
        root.add(gNMesh);
      }

      registerEaveMicroGeometry(cx + halfS, eaveY, cz - halfL, cx + halfS, eaveY, cz + halfL, 1, 0, pitch, 0.78);
      registerEaveMicroGeometry(cx - halfS, eaveY, cz - halfL, cx - halfS, eaveY, cz + halfL, -1, 0, pitch, 0.78);
    }
  };

  /**
   * Helper: build the signature steep concave triangular pyramid/hip-gable roof peaks visible
   * flanking the Front & Rear Skywells in /public/assets/aistudio/image_2a7cd311.png!
   */
  const addTriangularTransverseRoof = (
    cx: number,
    cz: number,
    wX: number,
    dZ: number,
    eaveY: number,
    peakY: number
  ) => {
    const hw = wX * 0.5;
    const hd = dZ * 0.5;
    const apex = new THREE.Vector3(cx, peakY, cz);
    const sw = new THREE.Vector3(cx - hw, eaveY, cz + hd);
    const se = new THREE.Vector3(cx + hw, eaveY, cz + hd);
    const ne = new THREE.Vector3(cx + hw, eaveY, cz - hd);
    const nw = new THREE.Vector3(cx - hw, eaveY, cz - hd);

    // 4 concave tiled triangular hip faces sweeping smoothly up to the ridge peak
    for (const [a, b] of [
      [sw, se],
      [se, ne],
      [ne, nw],
      [nw, sw],
    ]) {
      const m = new THREE.Mesh(trackGeo(createCurvedRoofTri(a, b, apex, 2.0, 3, 0.18)), mats.roofTile);
      m.castShadow = castShadow;
      m.receiveShadow = true;
      root.add(m);
    }
    // Segmented curved pale-grey lime hip ribs along all 4 diagonal ridges!
    for (const corner of [sw, se, ne, nw]) {
      for (let s = 0; s < 3; s++) {
        const f0 = s / 3;
        const f1 = (s + 1) / 3;
        const p0 = new THREE.Vector3().lerpVectors(corner, apex, f0);
        const p1 = new THREE.Vector3().lerpVectors(corner, apex, f1);
        p0.y += -0.18 * Math.sin(f0 * Math.PI) + 0.05;
        p1.y += -0.18 * Math.sin(f1 * Math.PI) + 0.05;
        const rib = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.18, 0.15, p0.distanceTo(p1) + 0.08)),
          mats.limeRidge
        );
        rib.position.lerpVectors(p0, p1, 0.5);
        rib.lookAt(p1);
        root.add(rib);
      }
    }
    addBox(0.32, 0.22, 0.32, cx, peakY + 0.08, cz, mats.limeRidge, 0, root, false);
  };

  // =========================================================================
  // 0. PROCEDURAL SKY DOME & ATMOSPHERIC LINGNAN MOUNTAIN HORIZON (远山与晴空)
  // =========================================================================
  const skyDome = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(195, 32, 20)),
    mats.skySunny
  );
  root.add(skyDome);

  // Layered Shan-Shui Blue-Green Mineral Mountains (refindex.html 60_land.js woodblock brushwork!)
  const attachMountainMistShader = (
    mat: THREE.Material,
    key: string,
    lowHex: string,
    midHex: string,
    highHex: string,
    maxY: number
  ) => {
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vMtnY;
          varying float vMtnX;
          varying float vMtnZ;`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vMtnY = position.y;
          vMtnX = position.x;
          vMtnZ = position.z;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vMtnY;
          varying float vMtnX;
          varying float vMtnZ;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float hT = clamp((vMtnY + 3.5) / ${maxY.toFixed(1)}, 0.0, 1.0);
          float angle = atan(vMtnZ, vMtnX);
          // Vertical gouache brush pleats & sunlit ridge catch
          float stroke = 0.5 + 0.5 * sin(angle * 48.0 + sin(vMtnY * 0.25) * 1.4);
          float sunSide = 0.5 + 0.5 * cos(angle - 0.72);
          vec3 mLow = vec3(${lowHex});
          vec3 mMid = vec3(${midHex});
          vec3 mHigh = vec3(${highHex});
          vec3 col = mix(mLow, mMid, smoothstep(0.05, 0.55, hT));
          col = mix(col, mHigh, smoothstep(0.52, 0.96, hT));
          col *= (0.90 + 0.14 * stroke) * mix(vec3(0.88, 0.94, 1.04), vec3(1.08, 1.04, 0.94), sunSide);
          diffuseColor.rgb = col;`
        );
    };
  };

  // Far hazy azure-cerulean peaks with misty warm cream bases
  const mtnMatFar = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, side: THREE.DoubleSide })
  );
  attachMountainMistShader(
    mtnMatFar,
    'mtn_shanshui_far_v2',
    '0.56, 0.76, 0.84',
    '0.24, 0.52, 0.75',
    '0.12, 0.34, 0.60',
    28
  );

  // Mid mineral turquoise-jade & cerulean hills
  const mtnMatMid = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 })
  );
  attachMountainMistShader(
    mtnMatMid,
    'mtn_shanshui_mid_v2',
    '0.30, 0.58, 0.52',
    '0.16, 0.44, 0.54',
    '0.11, 0.31, 0.46',
    18
  );

  // Near verdant sage-pine foothills embracing the valley
  const mtnMatNear = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 })
  );
  attachMountainMistShader(
    mtnMatNear,
    'mtn_shanshui_near_v2',
    '0.22, 0.44, 0.24',
    '0.15, 0.38, 0.27',
    '0.26, 0.49, 0.32',
    11
  );

  const mtnMats = [mtnMatFar, mtnMatMid, mtnMatNear];
  const mtnRadii = [166, 128, 96];
  const mtnBaseY = [-4.2, -2.5, -1.6];
  const mtnHeights = [19.5, 11.2, 6.2];

  for (let layer = 0; layer < 3; layer++) {
    const segs = 104;
    const rad = mtnRadii[layer];
    const baseH = mtnBaseY[layer];
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad - 8;
      const northBoost = Math.max(0.32, (-Math.sin(a) + 1.15) * 0.65);
      const peak =
        (Math.sin(a * (6 + layer) + layer * 2.1) * (6.2 - layer * 1.4) +
          Math.cos(a * (11 + layer * 2) + layer) * (3.6 - layer * 0.8) +
          Math.sin(a * 21 + layer * 1.7) * (1.5 - layer * 0.3) +
          Math.cos(a * 33 + layer) * 0.65 +
          mtnHeights[layer]) *
        northBoost;
      verts.push(x, baseH, z);
      verts.push(x, baseH + Math.max(2.6, peak), z);
      if (i < segs) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const mg = trackGeo(new THREE.BufferGeometry());
    mg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    mg.setIndex(idx);
    mg.computeVertexNormals();
    const mMesh = new THREE.Mesh(mg, mtnMats[layer]);
    root.add(mMesh);
  }

  // =========================================================================
  // 1. CONTINUOUS CONTOURED TERRAIN, EXPANSIVE HE-PING FORECOURT & HALF-MOON POND
  // =========================================================================
  // Subdivided valley terrain matching groundHeightAt(x, z) so rear hillside trees & cottages
  // sit solidly rooted on real sloped ground with ZERO floating trunks or floor z-fighting!
  const outerGroundGeo = trackGeo(new THREE.PlaneGeometry(340, 340, 104, 104));
  outerGroundGeo.rotateX(-Math.PI * 0.5);
  const ogPos = outerGroundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < ogPos.count; i++) {
    const wx = ogPos.getX(i);
    const wz = ogPos.getZ(i) - 10;
    let wy = groundHeightAt(wx, wz, 0) - 0.07;

    // Smoothly depress under the Half-Moon Pond basin so water & sculpted pond bed show cleanly
    if (wz >= 37.2 && wz <= 51.0) {
      const pd = Math.hypot(wx / 17.0, Math.max(0, wz - 38.4) / 11.6);
      if (pd < 1.08) {
        const basin = Math.max(0, 1 - pd * pd);
        wy = Math.min(wy, -0.35 - basin * 1.15);
      }
    }

    // Keep depressed cleanly below stone slabs inside central architectural core & He-Ping
    if (Math.abs(wx) < 38.5 && wz > 19.5 && wz < 41.2) {
      wy = Math.min(wy, -0.18);
    }
    if (Math.abs(wx) < 20.5 && wz >= -6.2 && wz <= 22.0) {
      wy = Math.min(wy, -0.18);
    }
    // Keep depressed slightly beneath inner courtyard Huatai cobble mesh so zero poking
    const huataiNorm = Math.hypot(wx / (INNER_RING_RX - 2.0), (wz - OVAL_CENTER_Z) / (INNER_RING_RZ - 2.0));
    if (wz < 10.5 && huataiNorm < 0.96) {
      wy = Math.min(wy, groundHeightAt(wx, wz, 0) - 0.28);
    }

    ogPos.setY(i, wy);
  }
  outerGroundGeo.computeVertexNormals();
  const outerGround = new THREE.Mesh(outerGroundGeo, mats.forestGround);
  outerGround.position.set(0, 0, -10);
  outerGround.receiveShadow = true;
  root.add(outerGround);

  // Expansive sun-warmed He-Ping forecourt (禾坪)
  addBox(74, 0.14, 15.6, 0, -0.06, 29.2, mats.courtyardEarth, 0, root, false);
  // Low granite curb dividing He-Ping from front verge & pond
  addBox(74, 0.34, 0.42, 0, 0.12, 36.6, mats.granitePlinth);
  // Southern granite apron beyond the curb
  addBox(74, 0.1, 4.2, 0, -0.05, 39.0, mats.graniteSlab, 0, root, false);

  // Sculpted Hakka Pavilion Lantern Posts (木柱小瓦顶灯柱) flanking He-Ping & Pond promenade
  for (const [px, pz] of [
    [-16.5, 35.4],
    [16.5, 35.4],
    [-19.5, 24.5],
    [19.5, 24.5],
  ] as [number, number][]) {
    const dir = px < 0 ? 1 : -1;
    const postGroup = new THREE.Group();
    postGroup.position.set(px, 0, pz);
    // Octagonal carved granite plinth base
    const stoneBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.19, 0.24, 0.42, 8)),
      mats.granitePlinth
    );
    stoneBase.position.y = 0.21;
    postGroup.add(stoneBase);
    // Tapered timber post shaft
    const post = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.075, 0.105, 3.45, 10)),
      mats.darkTimber
    );
    post.position.y = 2.02;
    post.castShadow = castShadow;
    postGroup.add(post);
    // Miniature tiled pavilion cap atop post
    const capRoof = new THREE.Mesh(lanternGeos.miniRoof, mats.roofTile);
    capRoof.rotation.y = Math.PI * 0.25;
    capRoof.position.y = 3.84;
    postGroup.add(capRoof);
    const capFinial = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 8, 6)), mats.gildedGold);
    capFinial.position.y = 3.98;
    postGroup.add(capFinial);
    // Projecting cross-arm with carved bracket (雀替)
    const cross = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.085, 0.085)), mats.darkTimber);
    cross.position.set(dir * 0.36, 3.46, 0);
    postGroup.add(cross);
    const armBracket = createCarvedBracket(mats, trackGeo, 0.34, 0.28, 0.065);
    armBracket.position.set(dir * 0.08, 3.42, 0);
    if (dir < 0) armBracket.scale.x = -1;
    postGroup.add(armBracket);
    // Hanging sculpted melon-ribbed lantern
    const lantern = createCraftedLantern(mats, lanternGeos, 0.96, 0.24);
    lantern.position.set(dir * 0.72, 2.98, 0);
    postGroup.add(lantern);
    root.add(postGroup);
  }

  // Half-Moon Pond (半月塘): Sculpted submerged pebble/sandstone basin + crystal-clear optical water!
  const pondBedRings = 12;
  const pondBedSegs = 48;
  const pbPos: number[] = [];
  const pbUvs: number[] = [];
  const pbIdx: number[] = [];
  for (let r = 0; r <= pondBedRings; r++) {
    const rf = r / pondBedRings;
    for (let s = 0; s <= pondBedSegs; s++) {
      const ang = (s / pondBedSegs) * Math.PI;
      const lx = Math.cos(ang) * 16.3 * rf;
      const lz = Math.sin(ang) * 10.9 * rf;
      const northFade = THREE.MathUtils.smoothstep(lz, 0.0, 2.2);
      const rimFade = 1.0 - THREE.MathUtils.smoothstep(rf, 0.72, 1.0);
      const depth = 0.24 + 0.92 * rimFade * northFade;
      const microRipple = Math.sin(lx * 0.8 + lz * 0.9) * 0.04;
      pbPos.push(lx, -depth + microRipple, 38.6 + lz);
      pbUvs.push(lx * 0.16, lz * 0.16);
    }
  }
  for (let r = 0; r < pondBedRings; r++) {
    for (let s = 0; s < pondBedSegs; s++) {
      const a = r * (pondBedSegs + 1) + s;
      const b = a + 1;
      const c = a + (pondBedSegs + 1);
      const d = c + 1;
      pbIdx.push(a, b, c, b, d, c);
    }
  }
  const pondBedGeo = trackGeo(new THREE.BufferGeometry());
  pondBedGeo.setAttribute('position', new THREE.Float32BufferAttribute(pbPos, 3));
  pondBedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(pbUvs, 2));
  pondBedGeo.setIndex(pbIdx);
  pondBedGeo.computeVertexNormals();
  const pondBedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb7a688,
      map: mats.huataiCobble.map,
      normalMap: mats.huataiCobble.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.9,
      metalness: 0.0,
    })
  );
  const pondBedMesh = new THREE.Mesh(pondBedGeo, pondBedMat);
  pondBedMesh.receiveShadow = true;
  root.add(pondBedMesh);

  // Decorative submerged river boulders visible through the clear pond water
  const riverStoneGeo = trackGeo(createSoftPillowGeometry(0.45, 4.4, 0.56, 10, 8));
  for (let st = 0; st < 16; st++) {
    const sa = 0.14 * Math.PI + (st / 15) * 0.72 * Math.PI;
    const sr = 0.42 + (st % 4) * 0.14;
    const sx = Math.cos(sa) * 14.5 * sr;
    const sz = 38.6 + Math.sin(sa) * 9.5 * sr;
    const stone = new THREE.Mesh(riverStoneGeo, mats.granitePlinth);
    stone.position.set(sx, -0.78 + (st % 3) * 0.11, sz);
    stone.scale.set(0.8 + (st % 3) * 0.35, 0.55 + (st % 2) * 0.25, 0.75 + (st % 4) * 0.22);
    stone.rotation.y = st * 1.1;
    root.add(stone);
  }

  const pondShape = new THREE.Shape();
  pondShape.absellipse(0, 0, 16.2, 10.8, 0, Math.PI, false, 0);
  pondShape.closePath();
  const pondWaterGeo = trackGeo(new THREE.ShapeGeometry(pondShape, 64));
  pondWaterGeo.rotateX(Math.PI * 0.5);

  const pondUniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uRain: { value: 0 },
    uLanternGlow: { value: 0.08 },
    uSunDir: physicalEnvUniforms.uSunDir,
    uSkyZenith: { value: new THREE.Color(0x3a82c4) },
    uSkyHorizon: { value: new THREE.Color(0xbce0ee) },
    uSunColor: { value: new THREE.Color(0xfff2d2) },
  };
  const pondWaterMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: pondUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uRain;
        varying vec3 vWPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float swell = sin(wp.x * 0.55 + uTime * 1.1) * cos(wp.z * 0.65 - uTime * 0.9) * mix(0.012, 0.022, uRain);
          wp.y += swell;
          vWPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uNight;
        uniform float uRain;
        uniform float uLanternGlow;
        uniform vec3 uSunDir;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSunColor;
        varying vec3 vWPos;

        float wHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float wNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x),
            mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float ggxDistribution(float ndh, float alpha) {
          float a2 = alpha * alpha;
          float d = ndh * ndh * (a2 - 1.0) + 1.0;
          return a2 / max(3.14159 * d * d, 0.0005);
        }

        float causticPattern(vec2 p, float t) {
          vec2 uv1 = p * 1.55 + vec2(t * 0.28, -t * 0.2);
          vec2 uv2 = p * 2.25 + vec2(-t * 0.34, t * 0.24);
          float c1 = abs(sin(uv1.x * 2.4 + cos(uv1.y * 2.2 + t * 0.85)) + cos(uv1.y * 2.6 - sin(uv1.x * 1.9 - t * 0.65)));
          float c2 = abs(sin(uv2.x * 2.1 - cos(uv2.y * 2.5 - t * 0.95)) + cos(uv2.y * 2.0 + sin(uv2.x * 2.3 + t * 0.72)));
          return pow(clamp(1.0 - min(c1, c2) * 0.42, 0.0, 1.0), 3.0);
        }

        void main() {
          vec2 p = vWPos.xz;
          float t = uTime;

          // Distance to semicircular pond shore & north granite steps -> physical water depth
          float dz = max(0.0, p.y - 38.6);
          float rimR = length(vec2(p.x / 16.2, dz / 10.8));
          float shoreCurved = smoothstep(0.66, 1.0, rimR);
          float shoreNorth = 1.0 - smoothstep(0.0, 2.3, dz);
          float shore = max(shoreCurved, shoreNorth);
          float waterDepth = mix(1.45, 0.14, clamp(shore, 0.0, 1.0));

          // Multi-directional Gerstner-like swell + fine breeze capillary ripples + dynamic moving ripples
          float ph1 = p.x * 1.35 + t * 1.35 + sin(p.y * 0.85 - t * 0.65);
          float ph2 = p.y * 1.85 - t * 1.18 + cos(p.x * 0.96 + t * 0.72);
          float ph3 = (p.x * 3.1 - p.y * 2.6) + t * 2.35;
          float ph4 = (p.x * 4.4 + p.y * 3.8) - t * 2.9;
          float n1 = wNoise(p * 1.2 + vec2(t * 0.25, -t * 0.18));
          float n2 = wNoise(p * 3.2 + vec2(-t * 0.42, t * 0.34));

          // Gentle organic rings emanating around active koi & waterfowl swimming zones
          vec2 rCenterA = vec2(sin(t * 0.32) * 4.8, 43.2 + cos(t * 0.26) * 2.2);
          vec2 rCenterB = vec2(cos(t * 0.28) * 5.6, 44.1 + sin(t * 0.22) * 1.8);
          float dA = length(p - rCenterA);
          float dB = length(p - rCenterB);
          float ringRippleA = sin(dA * 7.5 - t * 4.2) * exp(-dA * 0.55) * 0.04;
          float ringRippleB = sin(dB * 8.0 - t * 4.6) * exp(-dB * 0.62) * 0.036;
          vec2 dirA = (p - rCenterA) / max(dA, 0.05);
          vec2 dirB = (p - rCenterB) / max(dB, 0.05);

          float capAmp = mix(1.0, 1.55, uRain);
          vec3 N = normalize(vec3(
            (cos(ph1) * 0.058 + sin(ph3) * 0.024 + cos(ph4) * 0.014 + (n1 - 0.5) * 0.105) * capAmp + dirA.x * ringRippleA + dirB.x * ringRippleB,
            1.0,
            (-sin(ph2) * 0.058 - cos(ph3) * 0.024 + sin(ph4) * 0.014 + (n2 - 0.5) * 0.105) * capAmp + dirA.y * ringRippleA + dirB.y * ringRippleB
          ));

          vec3 V = normalize(cameraPosition - vWPos);
          vec3 L = normalize(uSunDir);
          float ndv = clamp(dot(N, V), 0.001, 1.0);

          // Exact Schlick Fresnel for Air -> Water interface (IOR = 1.333)
          float F0 = 0.0204;
          float fresnel = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);

          // Crystal-clear spring-fed Lingnan jade water: translucent in shallows, rich emerald-cerulean in center
          vec3 shallowTint = mix(mix(vec3(0.28, 0.66, 0.62), vec3(0.22, 0.44, 0.48), uRain), vec3(0.05, 0.16, 0.24), uNight);
          vec3 deepTint = mix(mix(vec3(0.06, 0.32, 0.46), vec3(0.09, 0.23, 0.34), uRain), vec3(0.02, 0.07, 0.16), uNight);
          float depthRatio = 1.0 - exp(-waterDepth * 0.85);
          vec3 waterBody = mix(shallowTint, deepTint, depthRatio);

          // Refracted dancing sun caustics shimmering across the clear water volume
          float caust = causticPattern(p + N.xz * 0.85, t);
          waterBody += uSunColor * vec3(0.32, 0.44, 0.36) * caust * (1.0 - uNight * 0.88) * (1.0 - uRain * 0.72) * 0.58;

          // Subtle bank shadow under the granite coping
          float bankShadow = max(smoothstep(0.92, 1.0, rimR), 1.0 - smoothstep(0.0, 0.52, dz));
          waterBody *= mix(1.0, 0.72, bankShadow * 0.55);

          // Dynamic sky & architecture reflection synced to the live 24h sky palette!
          vec3 R = reflect(-V, N);
          float skyGrad = clamp(R.y * 1.35, 0.0, 1.0);
          vec3 reflSky = mix(uSkyHorizon, uSkyZenith, skyGrad);

          // Reflected white lime facade & cerulean tile roof mirrored gently near the north shore
          float hallMirrorMask = (1.0 - smoothstep(0.35, 7.8, dz)) * (1.0 - smoothstep(6.2, 14.8, abs(p.x)));
          vec3 hallMirrorCol = mix(vec3(0.86, 0.80, 0.70), vec3(0.30, 0.42, 0.52), smoothstep(2.8, 6.2, dz));
          hallMirrorCol = mix(hallMirrorCol, uSkyHorizon * 0.72, uRain * 0.5 + uNight * 0.75);
          reflSky = mix(reflSky, hallMirrorCol, hallMirrorMask * 0.42);

          float envBlend = clamp(fresnel * 1.48 + 0.08, 0.06, 0.82);
          vec3 col = mix(waterBody, reflSky, envBlend);

          // Crisp GGX solar / lunar specular sparkle on wave facets
          vec3 H = normalize(L + V);
          float ndh = max(dot(N, H), 0.0);
          float ggxSharp = ggxDistribution(ndh, mix(0.072, 0.16, uRain)) * (0.14 + fresnel * 0.9);
          float ggxBroad = ggxDistribution(ndh, 0.24) * (0.04 + fresnel * 0.25);
          vec3 glintCol = mix(uSunColor, vec3(0.76, 0.88, 1.0), uNight);
          col += glintCol * (ggxSharp * 0.24 + ggxBroad * 0.09) * (1.0 - uRain * 0.76) * (0.68 + 0.45 * n2);

          // Warm crimson-gold lantern reflections dancing across ripples at dusk & night
          float northGlow = (1.0 - smoothstep(0.0, 9.2, dz)) * (1.0 - smoothstep(4.5, 15.6, abs(p.x)));
          float lanternRipple = 0.52 + 0.48 * sin(p.x * 2.5 + N.x * 18.0 + t * 2.9);
          col += vec3(1.0, 0.50, 0.18) * northGlow * uLanternGlow * lanternRipple * (0.46 + 0.62 * fresnel);

          // Delicate shoreline lapping shimmer along granite coping
          float foamWave = sin(rimR * 38.0 - t * 2.3 + n1 * 4.2) * 0.5 + 0.5;
          float foamMask = smoothstep(0.93, 0.996, rimR) * (0.5 + 0.5 * foamWave);
          foamMask = max(foamMask, (1.0 - smoothstep(0.0, 0.34, dz)) * (0.42 + 0.45 * foamWave));
          vec3 foamCol = mix(vec3(0.96, 0.98, 0.94), vec3(0.36, 0.48, 0.64), uNight);
          col = mix(col, foamCol, clamp(foamMask * 0.55, 0.0, 0.55));

          // Expanding concentric raindrop rings in rain mode
          if (uRain > 0.05) {
            vec2 cell = floor(p * 1.55);
            vec2 f = fract(p * 1.55) - 0.5;
            float phase = fract(t * 1.35 + wHash(cell) * 6.28);
            float ring = abs(length(f) - phase * 0.44);
            float drop = (1.0 - smoothstep(0.0, 0.044, ring)) * (1.0 - phase);
            col += vec3(0.52, 0.66, 0.74) * drop * uRain * 0.78;
          }

          // Transparent clarity: clear enough in shallows to clearly see submerged pebbles & swimming koi,
          // becoming more reflective at grazing Fresnel angles and deeper in the center.
          float alpha = clamp(mix(0.38, 0.74, depthRatio) + fresnel * 0.46 + foamMask * 0.25, 0.34, 0.92);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
  );
  const pondWater = new THREE.Mesh(pondWaterGeo, pondWaterMat);
  pondWater.position.set(0, -0.22, 38.6);
  pondWater.renderOrder = 2;
  root.add(pondWater);

  // Sculpted Floating Jade Lotus Pads (荷叶) & 12-Petal Cupped Lotus Flowers (荷花) with Backlit SSS!
  const lotusPadMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x459664,
        roughness: 0.64,
        metalness: 0.01,
        side: THREE.DoubleSide,
      })
    ),
    { key: 'lotus_pad', tintHex: 0x8de070, backStrength: 0.55, wrapStrength: 0.24, power: 2.3 }
  );
  const lotusPadLightMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x6cb86e,
        roughness: 0.62,
        metalness: 0.01,
        side: THREE.DoubleSide,
      })
    ),
    { key: 'lotus_pad_light', tintHex: 0xb2ea78, backStrength: 0.6, wrapStrength: 0.26, power: 2.2 }
  );
  const lotusStemMat = createPaintedWoodMat(0x3f7f50, trackMat, 0.72);
  const lotusPetalOuterMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: SCULPT_COLORS.blossomCore,
        roughness: 0.48,
        side: THREE.DoubleSide,
      })
    ),
    { key: 'lotus_petal_outer', tintHex: 0xffa6b8, backStrength: 0.72, wrapStrength: 0.3, power: 2.1 }
  );
  const lotusPetalPinkMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: HANDCRAFTED_PAL.pink,
        roughness: 0.46,
        side: THREE.DoubleSide,
      })
    ),
    { key: 'lotus_petal_pink', tintHex: 0xffc8d2, backStrength: 0.76, wrapStrength: 0.32, power: 2.0 }
  );
  const lotusPetalCreamMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: HANDCRAFTED_PAL.blossomLight,
        roughness: 0.46,
        side: THREE.DoubleSide,
      })
    ),
    { key: 'lotus_petal_cream', tintHex: 0xffe8de, backStrength: 0.72, wrapStrength: 0.3, power: 2.0 }
  );
  const lotusPodMat = createPaintedWoodMat(HANDCRAFTED_PAL.lemon, trackMat, 0.56);

  const padGeo = trackGeo(createSculptedLotusPadGeometry(0.58, 22));
  const petalOuterGeo = trackGeo(createCuppedPetalGeometry(0.14, 0.28, 0.042));
  const petalInnerGeo = trackGeo(createCuppedPetalGeometry(0.11, 0.23, 0.036));
  const lotusPodGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.02, 0.0],
        [0.085, 0.07],
        [0.095, 0.11],
        [0.0, 0.115],
      ],
      12
    )
  );
  const lotusStemGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, -0.18, 0),
        new THREE.Vector3(0.02, 0.02, 0.015),
        new THREE.Vector3(0.0, 0.24, 0),
      ],
      0.018,
      0.014,
      6,
      6,
      false
    )
  );

  const lotusSpots: Array<[number, number, number, boolean]> = [
    // West lotus cluster
    [-11.8, 41.0, 1.15, true],
    [-10.4, 42.1, 0.92, false],
    [-12.6, 42.4, 1.05, true],
    [-9.5, 40.6, 0.82, false],
    [-11.1, 43.4, 1.1, true],
    [-8.9, 44.2, 0.88, false],
    [-10.2, 44.8, 0.98, true],
    [-13.0, 40.5, 0.84, false],
    [-7.8, 46.2, 1.05, true],
    [-6.6, 46.8, 0.86, false],
    // East lotus cluster
    [11.4, 41.2, 1.12, true],
    [10.1, 42.3, 0.9, false],
    [12.4, 42.6, 1.04, true],
    [9.4, 40.4, 0.84, false],
    [10.8, 43.6, 1.08, true],
    [8.8, 44.6, 0.9, false],
    [12.8, 40.8, 0.86, false],
    [7.6, 46.3, 1.02, true],
    [6.4, 47.0, 0.85, false],
    // Gentle southern edge accents
    [-3.6, 47.6, 0.92, true],
    [3.8, 47.5, 0.94, true],
    [-2.4, 47.9, 0.76, false],
    [2.5, 47.8, 0.78, false],
  ];

  lotusSpots.forEach(([lx, lz, sc, hasBloom], idx) => {
    const pad = new THREE.Mesh(padGeo, idx % 2 === 0 ? lotusPadMat : lotusPadLightMat);
    pad.position.set(lx, -0.2, lz);
    pad.rotation.y = idx * 1.7;
    pad.scale.setScalar(sc);
    root.add(pad);

    if (hasBloom) {
      const bloom = new THREE.Group();
      const stemLift = idx % 3 === 1 ? 0.16 : 0.04;
      bloom.position.set(lx + 0.08, -0.18, lz - 0.06);
      const stem = new THREE.Mesh(lotusStemGeo, lotusStemMat);
      stem.scale.y = 0.7 + stemLift * 2.4;
      bloom.add(stem);

      const flowerHead = new THREE.Group();
      flowerHead.position.y = 0.06 + stemLift;
      const isBud = idx % 4 === 3;
      const outerMat = idx % 3 === 0 ? lotusPetalPinkMat : lotusPetalOuterMat;
      const innerMat = idx % 3 === 0 ? lotusPetalCreamMat : lotusPetalPinkMat;

      // 6 outer cupped petals + 6 staggered inner cupped petals (12 petals total!)
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2 + idx * 0.4;
        const outerP = new THREE.Mesh(petalOuterGeo, outerMat);
        outerP.rotation.y = a;
        outerP.rotation.x = isBud ? 0.34 : 0.86;
        flowerHead.add(outerP);

        const innerP = new THREE.Mesh(petalInnerGeo, innerMat);
        innerP.rotation.y = a + Math.PI / 6;
        innerP.rotation.x = isBud ? 0.18 : 0.46;
        innerP.position.y = 0.015;
        flowerHead.add(innerP);
      }

      if (!isBud) {
        const pod = new THREE.Mesh(lotusPodGeo, lotusPodMat);
        pod.position.y = 0.02;
        flowerHead.add(pod);
      }
      bloom.add(flowerHead);
      bloom.scale.setScalar(0.9 + (idx % 3) * 0.14);
      root.add(bloom);
    }
  });

  // 12 Graceful Shoreline Reed & Cattail Clusters (半月塘芦苇/菖蒲丛) softening the stone pond bank!
  const reedBladeGeo = trackGeo(createWillowFrondGeometry(1.15, 0.18, 0.055, 5));
  // Flip upward so reed blades arch skyward from water edge
  reedBladeGeo.scale(1, -1, 1);
  const reedMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: SCULPT_COLORS.reedGreen,
        roughness: 0.72,
        side: THREE.DoubleSide,
      })
    ),
    { key: 'pond_reed', tintHex: 0xaee076, backStrength: 0.62, wrapStrength: 0.25, power: 2.2 }
  );
  const cattailStalkGeo = trackGeo(new THREE.CylinderGeometry(0.012, 0.016, 1.05, 5));
  const cattailHeadGeo = trackGeo(new THREE.CapsuleGeometry(0.032, 0.18, 4, 7));
  const cattailMat = createPaintedWoodMat(HANDCRAFTED_PAL.umber, trackMat, 0.82);

  const reedAngles = [
    0.05, 0.12, 0.21, 0.31, 0.42, 0.58, 0.69, 0.79, 0.88, 0.95, 0.16, 0.84,
  ];
  reedAngles.forEach((f, idx) => {
    const a = f * Math.PI;
    const rFactor = idx >= 10 ? 0.93 : 0.975;
    const rx = Math.cos(a) * 16.0 * rFactor;
    const rz = 38.6 + Math.sin(a) * 10.6 * rFactor;
    const cluster = new THREE.Group();
    cluster.position.set(rx, -0.22, rz);
    const sc = 0.82 + (idx % 3) * 0.16;

    for (let b = 0; b < 7; b++) {
      const blade = new THREE.Mesh(reedBladeGeo, reedMat);
      const ba = (b / 7) * Math.PI * 2 + idx * 0.7;
      blade.rotation.y = ba;
      blade.rotation.x = 0.1 + (b % 3) * 0.08;
      blade.scale.setScalar((0.75 + (b % 4) * 0.14) * sc);
      cluster.add(blade);
    }
    // 2 sculpted cattail plumes per clump
    for (let c = 0; c < 2; c++) {
      const stalk = new THREE.Mesh(cattailStalkGeo, lotusStemMat);
      const ca = c * 2.2 + idx;
      stalk.position.set(Math.cos(ca) * 0.12 * sc, 0.52 * sc, Math.sin(ca) * 0.12 * sc);
      stalk.rotation.z = (c === 0 ? 1 : -1) * 0.08;
      cluster.add(stalk);
      const head = new THREE.Mesh(cattailHeadGeo, cattailMat);
      head.position.set(Math.cos(ca) * 0.12 * sc - (c === 0 ? 0.04 : -0.04), 0.92 * sc, Math.sin(ca) * 0.12 * sc);
      cluster.add(head);
    }
    root.add(cluster);
    animatedReeds.push({ mesh: cluster, phase: idx * 0.85 });
  });

  // Pond granite rim & curved stone embankment with stepped coping stones
  addBox(34, 0.42, 0.68, 0, 0.02, 38.4, mats.graniteSlab);
  addBox(34.2, 0.1, 0.76, 0, 0.25, 38.4, mats.granitePlinth);
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    const rx = Math.cos(a) * 16.5;
    const rz = 38.6 + Math.sin(a) * 11.1;
    addBox(2.35, 0.46, 0.68, rx, 0.02, rz, mats.graniteSlab, -a + Math.PI * 0.5);
    addBox(2.42, 0.1, 0.76, rx, 0.27, rz, mats.granitePlinth, -a + Math.PI * 0.5);
  }
  // Stone jetty steps dipping into Half-Moon Pond
  for (let s = 0; s < 4; s++) {
    addBox(6.8, 0.16, 0.72, 0, -0.04 - s * 0.1, 36.9 + s * 0.68, mats.graniteSlab);
  }

  // 12 Sculpted Articulated Swimming Koi & Grass Carp (流线鱼身 + 三段柔性摆尾 + 飘逸扇尾鳍!)
  const koiGroup = new THREE.Group();
  const koiBodyGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, 0.24],
        [0.055, 0.19],
        [0.088, 0.10],
        [0.084, 0.0],
        [0.058, -0.10],
        [0.028, -0.18],
      ],
      10
    )
  );
  koiBodyGeo.rotateX(Math.PI * 0.5);
  koiBodyGeo.scale(0.86, 1.0, 1.0);

  const koiPeduncleGeo = trackGeo(new THREE.ConeGeometry(0.036, 0.16, 7));
  koiPeduncleGeo.rotateX(-Math.PI * 0.5);
  koiPeduncleGeo.translate(0, 0, -0.07);

  const koiFanFinGeo = trackGeo(createCuppedPetalGeometry(0.16, 0.2, 0.015));
  koiFanFinGeo.rotateX(-Math.PI * 0.5);

  const koiPecFinGeo = trackGeo(createCuppedPetalGeometry(0.07, 0.11, 0.008));
  koiPecFinGeo.rotateX(Math.PI * 0.5);

  const koiSpecs: Array<[number, number]> = [
    [0xea5628, 0xf8f3ea], // Kohaku red-white
    [0xf7f2e8, 0xd83b24], // Tancho white-red
    [0xf2a72e, 0xfff0b2], // Yamabuki gold
    [0xdc3e24, 0x262e36], // Showa vermilion-ink
    [0xf5efe6, 0xe86c2c], // Sanke cream-orange
    [0x4b6a64, 0x7ea194], // Jade grass carp
  ];

  for (let k = 0; k < 12; k++) {
    const fish = new THREE.Group();
    const [mainHex, accentHex] = koiSpecs[k % koiSpecs.length];
    const mainMat = createPaintedWoodMat(mainHex, trackMat, 0.28, 0.05);
    const finMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: accentHex,
        roughness: 0.32,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      })
    );

    const body = new THREE.Mesh(koiBodyGeo, mainMat);
    fish.add(body);
    // Decorative dorsal koi saddle patch
    const patch = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.068, 8, 6)), finMat);
    patch.scale.set(0.95, 0.65, 1.5);
    patch.position.set(0, 0.042, 0.03);
    fish.add(patch);

    // Pectoral fins
    for (const side of [-1, 1]) {
      const pFin = new THREE.Mesh(koiPecFinGeo, finMat);
      pFin.position.set(side * 0.065, -0.01, 0.08);
      pFin.rotation.y = side * 0.72;
      fish.add(pFin);
    }

    // Articulated tail peduncle + flowing caudal fan fin
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -0.16);
    const peduncle = new THREE.Mesh(koiPeduncleGeo, mainMat);
    tailPivot.add(peduncle);

    const finPivot = new THREE.Group();
    finPivot.position.set(0, 0, -0.13);
    const fanFin = new THREE.Mesh(koiFanFinGeo, finMat);
    fanFin.rotation.z = Math.PI * 0.5;
    finPivot.add(fanFin);
    tailPivot.add(finPivot);
    fish.add(tailPivot);

    const fScale = 0.92 + (k % 4) * 0.14;
    fish.scale.setScalar(fScale);

    fish.userData = {
      orbitRadiusX: 3.5 + (k % 5) * 2.1,
      orbitRadiusZ: 1.8 + (k % 4) * 1.4,
      orbitAngle: (k / 12) * Math.PI * 2,
      speed: 0.22 + (k % 3) * 0.08,
      centerX: (k % 3 - 1) * 3.8,
      centerZ: 42.8 + (k % 3) * 1.2,
    };
    const swimDepth = -0.36 - (k % 3) * 0.055;
    fish.position.set(fish.userData.centerX, swimDepth, fish.userData.centerZ);
    koiGroup.add(fish);
    animatedKoiTails.push({ tail: tailPivot, fin: finPivot, phase: k * 0.95 });
  }
  root.add(koiGroup);

  // =========================================================================
  // 2. SUN-BAKED SEMICIRCULAR HUATAI COURTYARD (化胎) & INNER CRESCENT TIANJIE
  // =========================================================================
  // Build a high-detail contoured elliptical terrain mesh spanning the entire inner oval courtyard
  // so the sun-baked Huatai rises seamlessly from Upper Hall up to the Inner Weilong doors!
  const hRings = 16;
  const hSegs = 40;
  const hPositions: number[] = [];
  const hUvs: number[] = [];
  const hIndices: number[] = [];
  for (let r = 0; r <= hRings; r++) {
    const rf = r / hRings;
    for (let s = 0; s <= hSegs; s++) {
      const phi = (s / hSegs) * Math.PI; // 0 (East) -> PI (West)
      const x = Math.cos(phi) * (INNER_RING_RX - INNER_RING_HALF_DEPTH + 1.2) * rf;
      const z = OVAL_CENTER_Z - Math.sin(phi) * (INNER_RING_RZ - INNER_RING_HALF_DEPTH + 1.2) * rf;
      // Only elevate gently behind Upper Hall; keep low beneath central stone slabs
      let y = 0.12;
      if (z < -5.2) {
        y = groundHeightAt(x, z, 0);
      } else if (Math.abs(x) > 18.0) {
        y = 0.22;
      }
      hPositions.push(x, y, z);
      hUvs.push(x * 0.14, z * 0.14);
    }
  }
  for (let r = 0; r < hRings; r++) {
    for (let s = 0; s < hSegs; s++) {
      const a = r * (hSegs + 1) + s;
      const b = a + 1;
      const c = a + (hSegs + 1);
      const d = c + 1;
      hIndices.push(a, c, b, b, c, d);
    }
  }
  const huataiGeo = trackGeo(new THREE.BufferGeometry());
  huataiGeo.setAttribute('position', new THREE.Float32BufferAttribute(hPositions, 3));
  huataiGeo.setAttribute('uv', new THREE.Float32BufferAttribute(hUvs, 2));
  huataiGeo.setIndex(hIndices);
  huataiGeo.computeVertexNormals();
  const huataiMesh = new THREE.Mesh(huataiGeo, mats.huataiCobble);
  huataiMesh.receiveShadow = true;
  root.add(huataiMesh);

  // Subtle sun-dappled dry grass/weed decals hugging the outer crescent rim of Tianjie & Huatai (exact photo detail!)
  const grassDecalGeo = trackGeo(new THREE.PlaneGeometry(4.2, 4.2));
  grassDecalGeo.rotateX(-Math.PI * 0.5);
  for (let g = 0; g < 18; g++) {
    const phi = 0.08 * Math.PI + (g / 17) * 0.84 * Math.PI;
    const gx = Math.cos(phi) * (INNER_RING_RX - 4.2);
    const gz = OVAL_CENTER_Z - Math.sin(phi) * (INNER_RING_RZ - 4.2);
    const gy = groundHeightAt(gx, gz, 0);
    const tuft = new THREE.Mesh(grassDecalGeo, mats.grassDecal);
    const sc = 0.85 + (g % 3) * 0.28;
    tuft.scale.set(sc, 1, sc * 0.85);
    tuft.rotation.y = g * 1.37;
    tuft.position.set(gx, gy + 0.05, gz);
    tuft.receiveShadow = true;
    root.add(tuft);
  }

  // =========================================================================
  // 3. FRONT STRAIGHT WING (下堂横长廊) & AUTHENTIC WEATHERED FACADE
  // =========================================================================
  // Granite floor terrace spanning the entire front straight wing
  addBox(40.0, 0.25, 5.4, 0, 0.125, FRONT_CENTER_Z, mats.graniteSlab, 0, root, false);

  // Front straight facade wall segments at z = 21.65 (matching photo's low white weathered front facade!)
  const frontWallH = 3.25;
  addCraftedWall(2.2, frontWallH, 0.46, -18.5, 0.0, 21.65);
  // Left Doumen opening at x in [-17.4, -14.8]
  addCraftedWall(12.8, frontWallH, 0.46, -8.4, 0.0, 21.65);
  // Central recessed main portal (凹肚大门) at x in [-2.0, +2.0]
  addCraftedWall(12.8, frontWallH, 0.46, 8.4, 0.0, 21.65);
  // Right Doumen opening at x in [+14.8, +17.4]
  addCraftedWall(2.2, frontWallH, 0.46, 18.5, 0.0, 21.65);

  // Recessed central main portal alcove (凹肚大门) + carved granite drum stones (抱鼓石), gilded knockers & carved brackets (雀替)!
  addCraftedWall(1.4, frontWallH, 0.36, -2.0, 0.0, 20.95, Math.PI * 0.5);
  addCraftedWall(1.4, frontWallH, 0.36, 2.0, 0.0, 20.95, Math.PI * 0.5);
  // Carved granite lintel, jambs & sculpted drum stones flanking main entrance
  addBox(4.45, 0.38, 0.56, 0, 3.04, 21.65, mats.granitePlinth);
  addBox(0.38, 3.1, 0.52, -1.9, 1.55, 21.65, mats.granitePlinth);
  addBox(0.38, 3.1, 0.52, 1.9, 1.55, 21.65, mats.granitePlinth);
  for (const side of [-1, 1]) {
    const drumStone = createDrumStone(mats, trackGeo, 0.92);
    drumStone.position.set(side * 1.92, 0.0, 22.02);
    root.add(drumStone);
    // Carved wooden Que-Ti corner brackets under the main portal lintel
    const portalBracket = createCarvedBracket(mats, trackGeo, 0.55, 0.38, 0.12);
    portalBracket.position.set(side * 1.72, 2.86, 21.74);
    if (side > 0) portalBracket.scale.x = -1;
    root.add(portalBracket);
  }
  // High wooden threshold ("忌踩门槛")
  addBox(3.7, 0.24, 0.32, 0, 0.18, 21.58, mats.darkTimber);
  // Open dark-timber door leaves with gilded brass knockers swung neatly inward inside the alcove
  for (const side of [-1, 1]) {
    addBox(0.14, 2.65, 1.25, side * 1.72, 1.58, 20.85, mats.weatheredWoodDoor);
    const knockerPlate = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.085, 0.09, 0.04, 10)),
      mats.gildedGold
    );
    knockerPlate.rotation.z = Math.PI * 0.5;
    knockerPlate.position.set(side * 1.64, 1.48, 21.12);
    root.add(knockerPlate);
    const knockerRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.068, 0.014, 6, 12)),
      mats.gildedGold
    );
    knockerRing.rotation.y = Math.PI * 0.5;
    knockerRing.position.set(side * 1.62, 1.4, 21.12);
    root.add(knockerRing);
  }
  // Red spring couplets flanking the main portal & secondary portals
  for (const cx of [-2.35, 2.35, -14.45, 14.45]) {
    addBox(0.32, 1.85, 0.04, cx, 1.75, 21.91, mats.redCouplet, 0, root, false);
  }
  // Golden calligraphy clan plaque "陇西世泽" with carved gilded frame
  addBox(2.58, 0.72, 0.08, 0, 2.68, 21.88, mats.gildedGold, 0, root, false);
  addBox(2.45, 0.62, 0.1, 0, 2.68, 21.92, mats.plaqueLongxi, 0, root, false);
  addBox(2.74, 0.88, 0.1, 0, 3.38, 17.56, mats.gildedGold, 0, root, false);
  addBox(2.6, 0.78, 0.12, 0, 3.38, 17.6, mats.plaqueLongxi, 0, root, false);

  // Horizontal dark-framed windows along the front white facade
  for (const wx of [-12.6, -10.2, -7.2, -4.6, 4.6, 7.2, 10.2, 12.6]) {
    addWindow(1.45, 0.92, wx, 2.05, 21.88, 0);
  }

  // 8 Sculpted Melon-Ribbed Hakka Vermilion-and-Gold Lanterns strung across the front eave!
  for (const lx of [-17.5, -13.8, -8.8, -3.2, 3.2, 8.8, 13.8, 17.5]) {
    const lg = createCraftedLantern(mats, lanternGeos, 0.96, 0.34);
    lg.position.set(lx, 2.86, 22.28);
    root.add(lg);
  }

  // Front Straight Wing inner corridor wall at z = 16.55 (wide open central & wing passages)
  addCraftedWall(10.2, 3.2, 0.36, -7.7, 0.25, 16.55);
  addCraftedWall(10.2, 3.2, 0.36, 7.7, 0.25, 16.55);
  // Carved timber colonnade inside Lower Hall
  for (const cx of [-2.4, 2.4, -13.0, 13.0, -18.2, 18.2]) {
    columns.push({ x: cx, yBase: 0.25, z: 16.65, height: 3.1 });
  }

  // Animated Heavy Wooden Doumen Gates (东西斗门) integrated directly into the front facade openings!
  const buildDoumenLeaves = (centerX: number, zPos: number): [THREE.Group, THREE.Group] => {
    // Granite lintel & side frame
    addBox(2.85, 0.34, 0.56, centerX, 2.98, zPos, mats.granitePlinth);
    const leftPivot = new THREE.Group();
    leftPivot.position.set(centerX - 1.25, 0.0, zPos);
    const leftLeaf = addBox(1.22, 2.75, 0.16, 0.61, 1.38, 0, mats.weatheredWoodDoor, 0, leftPivot);
    addBox(1.1, 0.12, 0.22, 0.61, 1.2, 0, mats.darkTimber, 0, leftPivot, false); // bolt bar
    leftLeaf.castShadow = castShadow;
    root.add(leftPivot);

    const rightPivot = new THREE.Group();
    rightPivot.position.set(centerX + 1.25, 0.0, zPos);
    const rightLeaf = addBox(1.22, 2.75, 0.16, -0.61, 1.38, 0, mats.weatheredWoodDoor, 0, rightPivot);
    addBox(1.1, 0.12, 0.22, -0.61, 1.2, 0, mats.darkTimber, 0, rightPivot, false);
    rightLeaf.castShadow = castShadow;
    root.add(rightPivot);
    return [leftPivot, rightPivot];
  };
  const [doumenWestLeft, doumenWestRight] = buildDoumenLeaves(-16.1, 21.65);
  const [doumenEastLeft, doumenEastRight] = buildDoumenLeaves(16.1, 21.65);

  // Continuous straight pitched tiled roof over the entire Front Wing (z = 16.55..21.8, x = -19.5..+19.5)
  addGableRoof({
    cx: 0,
    cz: FRONT_CENTER_Z,
    length: FRONT_STRAIGHT_HALF_W * 2,
    span: 5.25,
    eaveY: 3.15,
    ridgeY: 5.35,
    ridgeAlong: 'x',
    overhang: 0.68,
    gableEnds: false, // seamlessly merges into the curved SW & SE oval roofs!
  });

  // =========================================================================
  // 4. SCULPTED CENTRAL CORE (三堂两天井两横 — 1:1 ROOF GEOMETRY FROM PHOTO!)
  // =========================================================================
  // Stepped stone floor terraces along central ritual axis
  addBox(22.8, 0.15, 6.0, 0, 0.075, 13.6, mats.graniteSlab, 0, root, false); // Front Skywell
  addBox(23.0, 0.45, 5.2, 0, 0.225, 8.0, mats.graniteSlab, 0, root, false); // Middle Hall
  addBox(22.8, 0.35, 5.2, 0, 0.175, 2.8, mats.graniteSlab, 0, root, false); // Rear Skywell
  addBox(25.2, 0.85, 5.8, 0, 0.425, -2.7, mats.graniteSlab, 0, root, false); // Upper Hall raised dais
  // Granite steps ascending into Upper Hall
  for (let st = 0; st < 3; st++) {
    addBox(6.8, 0.16, 0.45, 0, 0.4 + st * 0.16, 0.35 - st * 0.36, mats.granitePlinth);
  }

  // --- ICONIC FRONT SKYWELL FLANKING WHITE CHAMBERS (matching the 2 white boxes with square windows in photo!) ---
  for (const side of [-1, 1]) {
    const cx = side * 6.9;
    const cz = 13.6;
    // Crisp whitewashed chamber box (3.0m x 3.2m x 4.0m) with plinth
    addCraftedWall(3.0, 3.25, 4.0, cx, 0.15, cz, 0, mats.limeWall);
    // Centered dark-framed square wooden window facing South (into courtyard) & inward (facing Front Skywell)
    addWindow(0.92, 0.92, cx, 1.9, cz + 2.02, 0);
    addWindow(0.92, 0.92, cx - side * 1.52, 1.9, cz, Math.PI * 0.5);
    // Sharp triangular pitched transverse roof crowning each flanking chamber (exact photo silhouette!)
    addTriangularTransverseRoof(side * 8.1, 13.6, 5.4, 6.2, 3.2, 5.75);
  }

  // --- MIDDLE HALL (中堂: x = -11.4..11.4, z = 5.4..10.6) ---
  // Carved timber colonnade on South & North faces of Middle Hall
  for (const cx of [-9.2, -5.2, -2.4, 2.4, 5.2, 9.2]) {
    columns.push({ x: cx, yBase: 0.45, z: 10.2, height: 3.75 });
    columns.push({ x: cx, yBase: 0.45, z: 5.7, height: 3.75 });
  }
  // Exposed horizontal cedar tie beams (抬梁)
  addBox(22.0, 0.24, 0.24, 0, 4.18, 10.2, mats.darkTimber);
  addBox(22.0, 0.24, 0.24, 0, 4.18, 5.7, mats.darkTimber);
  addBox(2.6, 0.88, 0.14, 0, 3.75, 5.9, mats.plaqueJiaxun, 0, root, false);
  // Side partition walls of Middle Hall
  addCraftedWall(3.0, 3.75, 0.34, -11.4, 0.45, 9.1, Math.PI * 0.5);
  addCraftedWall(3.0, 3.75, 0.34, 11.4, 0.45, 9.1, Math.PI * 0.5);
  // Grand East-West pitched tiled roof over Middle Hall (tall horizontal ridge!)
  addGableRoof({
    cx: 0,
    cz: 8.0,
    length: 22.8,
    span: 5.4,
    eaveY: 3.95,
    ridgeY: 6.75,
    ridgeAlong: 'x',
    overhang: 0.72,
    gableEnds: true,
    gableBaseY: 3.95,
  });

  // --- REAR SKYWELL (后天井) & TWIN TRIANGULAR FLANKING ROOFS (exact photo geometry!) ---
  for (const side of [-1, 1]) {
    // Open colonnade flanking the Rear Skywell
    columns.push({ x: side * 4.7, yBase: 0.35, z: 3.8, height: 3.55 });
    columns.push({ x: side * 4.7, yBase: 0.35, z: 1.4, height: 3.55 });
    addBox(0.22, 0.22, 5.0, side * 4.7, 3.88, 2.8, mats.darkTimber);
    // Steep triangular pitched transverse roof flanking the Rear Skywell (exact match to photo's middle triangles!)
    addTriangularTransverseRoof(side * 7.6, 2.8, 6.2, 5.6, 3.65, 6.55);
  }

  // --- UPPER HALL / ANCESTRAL SANCTUARY (上堂: x = -12.6..12.6, z = -5.6..0.2) ---
  // Rear Ancestral Shrine Wall (with wide open side passages to Huatai at x = ±5.0..±11.4!)
  addCraftedWall(8.8, 4.4, 0.44, 0, 0.85, -5.6);
  // Carved timber columns on Upper Hall dais
  for (const cx of [-10.4, -5.4, -2.5, 2.5, 5.4, 10.4]) {
    columns.push({ x: cx, yBase: 0.85, z: -0.1, height: 4.1 });
    columns.push({ x: cx, yBase: 0.85, z: -5.1, height: 4.1 });
  }
  addBox(24.6, 0.26, 0.26, 0, 4.92, -0.1, mats.darkTimber);
  addBox(24.6, 0.26, 0.26, 0, 4.92, -5.1, mats.darkTimber);
  // Side partitions of Upper Hall
  addCraftedWall(3.3, 4.1, 0.34, -11.4, 0.85, -0.85, Math.PI * 0.5);
  addCraftedWall(3.3, 4.1, 0.34, 11.4, 0.85, -0.85, Math.PI * 0.5);
  // Tallest, grandest East-West pitched tiled roof of the entire central core!
  addGableRoof({
    cx: 0,
    cz: -2.7,
    length: 25.2,
    span: 6.0,
    eaveY: 4.65,
    ridgeY: 7.85,
    ridgeAlong: 'x',
    overhang: 0.78,
    gableEnds: true,
    gableBaseY: 4.65,
  });

  // --- STEPPED FLANKING HORIZONTAL WINGS (东西两横屋: x = ±11.4..±18.4, z = -3.8..16.55) ---
  for (const side of [-1, 1]) {
    const wx = side * 14.9;
    // Wing stone floor
    addBox(7.2, 0.32, 20.6, wx, 0.16, 6.4, mats.graniteSlab, 0, root, false);
    // Wing outer walls facing the sunlit crescent Tianjie (x = ±18.4) with 3 wide open doorways
    addCraftedWall(2.6, 3.35, 0.38, side * 18.4, 0.32, 15.1, Math.PI * 0.5);
    addCraftedWall(4.6, 3.35, 0.38, side * 18.4, 0.32, 7.7, Math.PI * 0.5);
    addCraftedWall(2.4, 3.35, 0.38, side * 18.4, 0.32, 0.2, Math.PI * 0.5);

    // Wing windows facing the crescent Tianjie courtyard
    addWindow(1.15, 0.95, side * 18.6, 2.05, 15.1, Math.PI * 0.5);
    addWindow(1.15, 0.95, side * 18.6, 2.05, 0.2, Math.PI * 0.5);

    // Internal room dividers (Bedroom / Well / Study on West; Kitchen / Poultry / Granary on East)
    addCraftedWall(4.0, 3.25, 0.28, side * 16.2, 0.32, 8.2, 0, mats.limeWallInterior);
    addCraftedWall(4.0, 3.25, 0.28, side * 16.2, 0.32, 1.4, 0, mats.limeWallInterior);

    // Clan Study plaque "耕读传家" inside West Wing
    if (side === -1) {
      addBox(2.2, 0.72, 0.1, -18.12, 2.55, -1.8, mats.plaqueGengdu, Math.PI * 0.5, root, false);
    }

    // Stepped North-South pitched tiled wing roof hugging the oval courtyard (exact photo silhouette!)
    addGableRoof({
      cx: side * 15.0,
      cz: 6.4,
      length: 19.6,
      span: 6.8,
      eaveY: 3.25,
      ridgeY: 5.45,
      ridgeAlong: 'z',
      overhang: 0.62,
      gableEnds: true,
      gableBaseY: 3.25,
    });
  }

  // =========================================================================
  // 5. SILKY-SMOOTH CONTINUOUS CURVED WEILONG RINGS (64段内围龙 + 52段外围龙 — 弯弯曲曲自然弧线!)
  // =========================================================================
  const buildCurvedWeilongRing = (opts: {
    sampleFn: (t: number) => ReturnType<typeof sampleInnerWeilongCurve>;
    bayCount: number;
    halfDepth: number;
    wallHeight: number;
    ridgeHeight: number;
    overhang: number;
    openOuterBays: Set<number>;
    isOuterRing: boolean;
  }) => {
    const {
      sampleFn,
      bayCount,
      halfDepth,
      wallHeight,
      ridgeHeight,
      overhang,
      openOuterBays,
      isOuterRing,
    } = opts;

    const samples = [];
    for (let i = 0; i <= bayCount; i++) {
      samples.push(sampleFn(i / bayCount));
    }

    for (let i = 0; i < bayCount; i++) {
      const s0 = samples[i];
      const s1 = samples[i + 1];
      const sm = sampleFn((i + 0.5) / bayCount);
      const bayLen = Math.hypot(s1.x - s0.x, s1.z - s0.z);
      const bayYaw = Math.atan2(sm.nx, sm.nz);

      // 1. Stone floor slab for this smooth wedge slice
      addBox(
        bayLen + 0.36,
        0.38,
        halfDepth * 2 + 0.3,
        sm.x,
        sm.yBase - 0.19,
        sm.z,
        isOuterRing ? mats.darkTimber : mats.graniteSlab,
        bayYaw,
        root,
        false
      );

      // 2. Silky concave double-pitched Qing-tile roof spanning s0 -> s1 (反宇举折弧面瓦顶!)
      const eaveIn0 = new THREE.Vector3(
        s0.x - s0.nx * (halfDepth + overhang),
        s0.yBase + wallHeight - 0.12,
        s0.z - s0.nz * (halfDepth + overhang)
      );
      const eaveIn1 = new THREE.Vector3(
        s1.x - s1.nx * (halfDepth + overhang),
        s1.yBase + wallHeight - 0.12,
        s1.z - s1.nz * (halfDepth + overhang)
      );
      const ridge0 = new THREE.Vector3(s0.x, s0.yBase + ridgeHeight, s0.z);
      const ridge1 = new THREE.Vector3(s1.x, s1.yBase + ridgeHeight, s1.z);
      const eaveOut0 = new THREE.Vector3(
        s0.x + s0.nx * (halfDepth + overhang),
        s0.yBase + wallHeight - 0.12,
        s0.z + s0.nz * (halfDepth + overhang)
      );
      const eaveOut1 = new THREE.Vector3(
        s1.x + s1.nx * (halfDepth + overhang),
        s1.yBase + wallHeight - 0.12,
        s1.z + s1.nz * (halfDepth + overhang)
      );

      const innerSlope = new THREE.Mesh(
        trackGeo(createCurvedRoofStrip(eaveIn0, eaveIn1, ridge1, ridge0, 2.0, 2.0, 4, 0.20)),
        mats.roofTile
      );
      innerSlope.castShadow = castShadow;
      innerSlope.receiveShadow = true;
      root.add(innerSlope);

      const outerSlope = new THREE.Mesh(
        trackGeo(createCurvedRoofStrip(eaveOut1, eaveOut0, ridge0, ridge1, 2.0, 2.0, 4, 0.20)),
        mats.roofTile
      );
      outerSlope.castShadow = castShadow;
      outerSlope.receiveShadow = true;
      root.add(outerSlope);

      // Organic smoothly-curving pale lime ridge spine + shadow-sealing ridge purlin
      const ra = ridge0.clone();
      ra.y += organicRoofSettling(ra.x, ra.z) + 0.08;
      const rb = ridge1.clone();
      rb.y += organicRoofSettling(rb.x, rb.z) + 0.08;
      const rLen = ra.distanceTo(rb) + 0.18;
      const rBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.26, rLen)), mats.limeRidge);
      rBar.position.lerpVectors(ra, rb, 0.5);
      rBar.lookAt(rb);
      rBar.castShadow = castShadow;
      rBar.receiveShadow = true;
      root.add(rBar);
      const rPurlin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.54, 0.24, rLen + 0.08)), mats.darkTimber);
      rPurlin.position.lerpVectors(ra, rb, 0.5);
      rPurlin.position.y -= 0.17;
      rPurlin.lookAt(rb.x, rb.y - 0.17, rb.z);
      rPurlin.castShadow = castShadow;
      root.add(rPurlin);

      // 3D barrel-tile drip caps & exposed cedar rafter tails along curved eaves
      const slopePitch = Math.atan2(ridgeHeight - wallHeight, halfDepth + overhang);
      registerEaveMicroGeometry(
        eaveIn0.x,
        eaveIn0.y,
        eaveIn0.z,
        eaveIn1.x,
        eaveIn1.y,
        eaveIn1.z,
        -sm.nx,
        -sm.nz,
        slopePitch,
        0.92
      );
      registerEaveMicroGeometry(
        eaveOut0.x,
        eaveOut0.y,
        eaveOut0.z,
        eaveOut1.x,
        eaveOut1.y,
        eaveOut1.z,
        sm.nx,
        sm.nz,
        slopePitch,
        0.92
      );

      // 3. Inner Concave Courtyard Wall — alternating open walk-in doorways & windowed white lime bays!
      const inX = sm.x - sm.nx * (halfDepth - 0.16);
      const inZ = sm.z - sm.nz * (halfDepth - 0.16);
      const inLen = Math.hypot(
        s1.x - s1.nx * halfDepth - (s0.x - s0.nx * halfDepth),
        s1.z - s1.nz * halfDepth - (s0.z - s0.nz * halfDepth)
      );

      const isDragonApex = isDragonApexBay(i, bayCount, isOuterRing);
      if (isDragonApex) {
        if (i % 2 === 0) {
          columns.push({
            x: s0.x - s0.nx * (halfDepth - 0.25),
            yBase: s0.yBase,
            z: s0.z - s0.nz * (halfDepth - 0.25),
            height: wallHeight,
          });
        }
      } else if (i % 2 === 0) {
        // Even segment: recessed open walk-in doorway framed by crisp lime piers + timber lintel
        const doorW = Math.min(1.18, Math.max(0.88, inLen * 0.62));
        const pierW = Math.max(0.24, (inLen - doorW) * 0.5);
        const lx = inX - sm.tx * (doorW * 0.5 + pierW * 0.5);
        const lz = inZ - sm.tz * (doorW * 0.5 + pierW * 0.5);
        const rx = inX + sm.tx * (doorW * 0.5 + pierW * 0.5);
        const rz = inZ + sm.tz * (doorW * 0.5 + pierW * 0.5);
        addCraftedWall(pierW + 0.14, wallHeight, 0.3, lx, sm.yBase, lz, bayYaw);
        addCraftedWall(pierW + 0.14, wallHeight, 0.3, rx, sm.yBase, rz, bayYaw);
        addBox(doorW + 0.18, wallHeight - 2.22, 0.3, inX, sm.yBase + 2.22 + (wallHeight - 2.22) * 0.5, inZ, mats.limeWall, bayYaw);
        addBox(doorW + 0.24, 0.14, 0.36, inX, sm.yBase + 2.21, inZ, mats.darkTimber, bayYaw, root, false);
      } else {
        // Odd segment: solid white lime wall bay with signature dark square Hakka lattice window
        addCraftedWall(inLen + 0.18, wallHeight, 0.3, inX, sm.yBase, inZ, bayYaw);
        if (inLen > 0.85) {
          addWindow(
            Math.min(0.88, inLen * 0.52),
            0.88,
            inX - sm.nx * 0.17,
            sm.yBase + 1.65,
            inZ - sm.nz * 0.17,
            bayYaw + Math.PI
          );
        }
      }

      // 4. Outer Convex Silky-Curved Weathered Lime Wall (or open stone-framed walk-through archway)
      const outX = sm.x + sm.nx * (halfDepth - 0.18);
      const outZ = sm.z + sm.nz * (halfDepth - 0.18);
      const outLen = Math.hypot(
        s1.x + s1.nx * halfDepth - (s0.x + s0.nx * halfDepth),
        s1.z + s1.nz * halfDepth - (s0.z + s0.nz * halfDepth)
      );
      if (openOuterBays.has(i)) {
        addBox(outLen + 0.18, 0.75, 0.44, outX, sm.yBase + wallHeight - 0.38, outZ, mats.limeWall, bayYaw);
        addBox(outLen + 0.22, 0.18, 0.5, outX, sm.yBase + wallHeight - 0.78, outZ, mats.granitePlinth, bayYaw, root, false);
      } else {
        addCraftedWall(outLen + 0.22, wallHeight, 0.42, outX, sm.yBase, outZ, bayYaw);
        if (i % 4 === 1) {
          addWindow(0.75, 0.55, outX + sm.nx * 0.23, sm.yBase + 2.15, outZ + sm.nz * 0.23, bayYaw);
        }
      }

      // 5. Full-depth solid radial room partition walls separating discrete rooms (一格一格的实体房间)
      // Synchronized 1:1 with worldMath.buildCurvedRingWallSegments() colliders!
      if (isRingRoomPartitionBoundary(i, bayCount, isOuterRing)) {
        const partYaw = Math.atan2(s0.nx, s0.nz);
        const fullDepth = halfDepth * 1.92;
        addBox(
          0.26,
          wallHeight,
          fullDepth,
          s0.x,
          s0.yBase + wallHeight * 0.5,
          s0.z,
          mats.limeWallInterior,
          partYaw,
          root,
          castShadow
        );
        // Subtle timber lintel cap atop partition wall
        addBox(
          0.3,
          0.14,
          fullDepth,
          s0.x,
          s0.yBase + wallHeight - 0.07,
          s0.z,
          mats.darkTimber,
          partYaw,
          root,
          false
        );
      }
    }
  };

  // Build Silky 64-Segment Inner Weilong Ring (内围龙 — 独立隔间实体围屋)
  buildCurvedWeilongRing({
    sampleFn: sampleInnerWeilongCurve,
    bayCount: INNER_BAY_COUNT,
    halfDepth: INNER_RING_HALF_DEPTH,
    wallHeight: 3.15,
    ridgeHeight: 5.25,
    overhang: 0.62,
    openOuterBays: INNER_OPEN_OUTER_BAYS,
    isOuterRing: false,
  });

  // Build Smooth 44-Segment Curved Stone Paving of the Concentric Weilong Alley (围龙巷)
  for (let i = 0; i < 44; i++) {
    const t = i / 43;
    const phi = -0.02 * Math.PI + t * 1.04 * Math.PI;
    const ax = Math.cos(phi) * ((INNER_RING_RX + OUTER_RING_RX) * 0.5);
    const az = OVAL_CENTER_Z - Math.sin(phi) * ((INNER_RING_RZ + OUTER_RING_RZ) * 0.5);
    const ay = groundHeightAt(ax, az, 0);
    const yaw = Math.atan2(Math.cos(phi) / 33.2, -Math.sin(phi) / 36.7);
    addBox(3.1, 0.25, 3.6, ax, ay - 0.12, az, mats.graniteSlab, yaw, root, false);
  }

  // Build Silky 52-Segment Outer Weilong Ring (外围龙 — 独立隔间实体围屋)
  buildCurvedWeilongRing({
    sampleFn: sampleOuterWeilongCurve,
    bayCount: OUTER_BAY_COUNT,
    halfDepth: OUTER_RING_HALF_DEPTH,
    wallHeight: 3.45,
    ridgeHeight: 5.65,
    overhang: 0.65,
    openOuterBays: OUTER_OPEN_OUTER_BAYS,
    isOuterRing: true,
  });

  // =========================================================================
  // 6. BATCHED 3D MICRO-GEOMETRY: EAVE DRIP TILES (瓦当), RAFTERS (椽头) & CARVED COLUMNS (柱子)
  // =========================================================================
  const dummy = new THREE.Object3D();

  // 6A. Instanced 3D Protruding Barrel-Tile Eave Drip Caps (瓦当)
  if (eaveTiles.length > 0) {
    const tileCapGeo = trackGeo(new THREE.CylinderGeometry(0.052, 0.062, 0.28, 6));
    tileCapGeo.rotateX(Math.PI * 0.5);
    const tileInst = new THREE.InstancedMesh(tileCapGeo, mats.roofTileDark, eaveTiles.length);
    tileInst.receiveShadow = true;
    eaveTiles.forEach((d, idx) => {
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(d.pitch, d.yaw, 0, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tileInst.setMatrixAt(idx, dummy.matrix);
    });
    tileInst.instanceMatrix.needsUpdate = true;
    root.add(tileInst);
  }

  // 6B. Instanced 3D Exposed Cedar Rafter Tails (椽头) tucked flush beneath every eave!
  if (rafterTails.length > 0) {
    const rafterGeo = trackGeo(new THREE.BoxGeometry(0.065, 0.085, 0.54));
    const rafterInst = new THREE.InstancedMesh(rafterGeo, mats.darkTimber, rafterTails.length);
    rafterTails.forEach((d, idx) => {
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(d.pitch, d.yaw, 0, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rafterInst.setMatrixAt(idx, dummy.matrix);
    });
    rafterInst.instanceMatrix.needsUpdate = true;
    root.add(rafterInst);
  }

  // 6C. Instanced Hand-Crafted Composite Columns (柱础 + 杉木柱身 + 柱头斗拱)
  if (columns.length > 0) {
    const baseGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.29, 0.28, 8));
    const shaftGeo = trackGeo(new THREE.CylinderGeometry(0.145, 0.175, 1.0, 10));
    const capGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.16, 0.46));

    const baseInst = new THREE.InstancedMesh(baseGeo, mats.granitePlinth, columns.length);
    const shaftInst = new THREE.InstancedMesh(shaftGeo, mats.darkTimber, columns.length);
    const capInst = new THREE.InstancedMesh(capGeo, mats.darkTimber, columns.length);
    shaftInst.castShadow = castShadow;

    columns.forEach((col, idx) => {
      // Octagonal granite column base (石柱础)
      dummy.position.set(col.x, col.yBase + 0.14, col.z);
      dummy.rotation.set(0, Math.PI / 8, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      baseInst.setMatrixAt(idx, dummy.matrix);

      // Tapered cedar shaft
      const shaftH = col.height - 0.34;
      dummy.position.set(col.x, col.yBase + 0.28 + shaftH * 0.5, col.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, shaftH, 1);
      dummy.updateMatrix();
      shaftInst.setMatrixAt(idx, dummy.matrix);

      // Capital bracket collar (柱头斗)
      dummy.position.set(col.x, col.yBase + col.height - 0.08, col.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      capInst.setMatrixAt(idx, dummy.matrix);
    });
    baseInst.instanceMatrix.needsUpdate = true;
    shaftInst.instanceMatrix.needsUpdate = true;
    capInst.instanceMatrix.needsUpdate = true;
    root.add(baseInst, shaftInst, capInst);
  }

  // =========================================================================
  // 7. HANGING RED HAKKA LANTERNS & RAIN CURTAINS (上元灯夜与四水归堂雨帘)
  // =========================================================================
  const lanternSpots: [number, number, number][] = [
    [-2.1, 2.75, 21.85],
    [2.1, 2.75, 21.85],
    [-4.8, 3.0, 12.6],
    [4.8, 3.0, 12.6],
    [-4.2, 3.5, 5.9],
    [4.2, 3.5, 5.9],
    [-4.8, 4.2, -0.3],
    [4.8, 4.2, -0.3],
    [-12.0, 4.1, -18.5],
    [0.0, 4.6, -20.5],
    [12.0, 4.1, -18.5],
  ];
  // 11 Courtyard & Hall Sculpted Melon-Ribbed Lanterns
  lanternSpots.forEach(([lx, ly, lz], idx) => {
    const lg = createCraftedLantern(mats, lanternGeos, 1.02, 0.36);
    lg.position.set(lx, ly, lz);
    root.add(lg);
    // Keep active point lights budget disciplined (max 4 non-shadow warm pools)
    if (idx === 0 || idx === 3 || idx === 6 || idx === 9) {
      const pt = new THREE.PointLight(0xff8c42, 0.25, 20, 1.7);
      pt.position.set(lx, ly - 0.15, lz);
      root.add(pt);
      lanternLights.push(pt);
    }
  });

  // Four-Waters-Return-to-Hall rain curtains in Front & Rear Skywells
  const rainCurtainMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xd0e3ef,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  for (const [rx, ry, rz, rw, rh, ryRot] of [
    [0, 1.8, 16.0, 9.6, 3.2, 0],
    [0, 1.8, 11.0, 9.6, 3.2, 0],
    [0, 2.0, 5.0, 8.2, 3.4, 0],
    [0, 2.0, 0.5, 8.2, 3.4, 0],
  ]) {
    const curtain = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(rw, rh)), rainCurtainMat);
    curtain.position.set(rx, ry, rz);
    curtain.rotation.y = ryRot;
    curtain.visible = false;
    root.add(curtain);
    rainCurtainMeshes.push(curtain);
  }

  // =========================================================================
  // 7B. SUBTLE GROUNDED DRAINAGE & WET-STEP MOSS COLONIES (天井檐滴/石埠/围龙巷苔痕)
  // Wall moss & capillary dampness now come directly from our 8K photo PBR texture + world patina shader!
  // =========================================================================
  const groundMossSpots: [number, number, number, number, number, number][] = [];

  // 1. Damp sunken Front Skywell & Rear Skywell drainage perimeter ("四水归堂" 檐滴青苔)
  for (const [sx, sy, sz, sc] of [
    [-4.6, 0.17, 15.8, 1.35],
    [-4.6, 0.17, 11.4, 1.5],
    [4.6, 0.17, 15.8, 1.4],
    [4.6, 0.17, 11.4, 1.25],
    [-4.0, 0.37, 4.9, 1.35],
    [4.0, 0.37, 4.9, 1.4],
    [-4.0, 0.37, 0.8, 1.25],
    [4.0, 0.37, 0.8, 1.35],
  ]) {
    groundMossSpots.push([sx, sy, sz, sc, sc * 0.88, sx * 1.3 + sz]);
  }
  // 2. Wet Half-Moon Pond stone embankment & dipping wash-steps (石埠湿苔)
  for (let i = 0; i < 10; i++) {
    const a = 0.08 * Math.PI + (i / 9) * 0.84 * Math.PI;
    const px = Math.cos(a) * 16.3;
    const pz = 38.6 + Math.sin(a) * 10.9;
    groundMossSpots.push([px, 0.27, pz, 1.25 + (i % 3) * 0.28, 0.95, -a]);
  }
  groundMossSpots.push([-2.2, 0.06, 37.3, 1.2, 0.9, 0.4], [2.4, 0.06, 37.5, 1.25, 0.95, 1.2]);
  // 3. Shaded curved Weilong Alley crevice dampness (围龙巷阴湿苔痕)
  for (let i = 0; i < 18; i++) {
    const t = 0.06 + (i / 17) * 0.88;
    const sm = sampleInnerWeilongCurve(t);
    const outX = sm.x + sm.nx * (INNER_RING_HALF_DEPTH + 0.95);
    const outZ = sm.z + sm.nz * (INNER_RING_HALF_DEPTH + 0.95);
    const yaw = Math.atan2(sm.nx, sm.nz);
    const sc = 1.2 + ((i * 13) % 5) * 0.26;
    groundMossSpots.push([outX, groundHeightAt(outX, outZ, 0) + 0.05, outZ, sc * 1.25, sc * 0.85, yaw]);
  }

  const gMossGeo = trackGeo(new THREE.PlaneGeometry(1.0, 1.0));
  gMossGeo.rotateX(-Math.PI * 0.5);
  const gMossInst = new THREE.InstancedMesh(gMossGeo, mats.mossDecal, groundMossSpots.length);
  gMossInst.receiveShadow = true;
  groundMossSpots.forEach(([x, y, z, sx, sz, rotY], idx) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(sx, 1, sz);
    dummy.updateMatrix();
    gMossInst.setMatrixAt(idx, dummy.matrix);
  });
  gMossInst.instanceMatrix.needsUpdate = true;
  root.add(gMossInst);

  // =========================================================================
  // 8. AUTHENTIC LINGNAN VILLAGE HOUSES & LUSH GREEN SURROUNDINGS (1:1 PHOTO BACKDROP!)
  // =========================================================================
  // 8A. NW Side Pitched-Roof Annex behind outer ring (upper-left of reference photo!)
  addCraftedWall(18.0, 3.6, 5.2, -31.5, 1.8, -28.0, 0.24, mats.limeWall);
  addGableRoof({
    cx: -31.5,
    cz: -28.0,
    length: 18.0,
    span: 5.5,
    eaveY: 5.2,
    ridgeY: 7.2,
    ridgeAlong: 'x',
    overhang: 0.45,
    gableEnds: true,
    gableBaseY: 5.2,
  });

  // 8B-8D. Harmonized Sculpted Hakka Pitched-Tile Neighbor Cottages (告别平顶方块，全部精雕悬山青瓦顶 + 木阳台 + 院墙!)
  const blueTrimMat = trackMat(new THREE.MeshStandardMaterial({ color: HANDCRAFTED_PAL.cer, roughness: 0.65 }));
  const ruralWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: HANDCRAFTED_PAL.cream,
      map: mats.limeWall.map,
      normalMap: mats.limeWall.normalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.86,
    })
  );
  const redBrickMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: HANDCRAFTED_PAL.brown,
      normalMap: mats.granitePlinth.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.84,
    })
  );

  // Reusable sculpted Hakka pitched-tile courtyard cottage builder
  const buildHakkaCottage = (opts: {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
    rotY: number;
    isBrick: boolean;
    hasBalcony?: boolean;
    hasYardWall?: boolean;
  }) => {
    const hg = new THREE.Group();
    hg.position.set(opts.x, opts.y, opts.z);
    hg.rotation.y = opts.rotY;
    const wallMat = opts.isBrick ? redBrickMat : ruralWhiteMat;

    // Granite foundation plinth + plaster/brick main body
    addBox(opts.w + 0.2, 0.55, opts.d + 0.2, 0, 0.275, 0, mats.granitePlinth, 0, hg, false);
    addBox(opts.w, opts.h - 0.55, opts.d, 0, 0.55 + (opts.h - 0.55) * 0.5, 0, wallMat, 0, hg, false);
    // Decorative ceramic-cerulean or timber frieze band
    addBox(opts.w + 0.24, 0.28, opts.d + 0.24, 0, opts.h - 0.08, 0, opts.isBrick ? mats.darkTimber : blueTrimMat, 0, hg, false);

    // Pitched Qing-tile double-slope roof with projecting eaves & pale lime ridge
    const roofOver = 0.85;
    const halfSpan = opts.d * 0.5 + roofOver;
    const ridgeRise = 2.35;
    const slopeLen = Math.hypot(halfSpan, ridgeRise);
    const pitch = Math.atan2(ridgeRise, halfSpan);
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(opts.w + roofOver * 1.8, 0.16, slopeLen)),
        mats.roofTile
      );
      slope.position.set(0, opts.h + ridgeRise * 0.5, side * halfSpan * 0.5);
      slope.rotation.x = side * pitch;
      hg.add(slope);
    }
    // White gable end triangles
    const gL1 = new THREE.Vector3(-opts.w * 0.5, opts.h, opts.d * 0.5);
    const gL2 = new THREE.Vector3(-opts.w * 0.5, opts.h, -opts.d * 0.5);
    const gLT = new THREE.Vector3(-opts.w * 0.5, opts.h + ridgeRise, 0);
    hg.add(new THREE.Mesh(trackGeo(createWorldUvTri(gL1, gL2, gLT, 3.0)), wallMat));
    const gR1 = new THREE.Vector3(opts.w * 0.5, opts.h, -opts.d * 0.5);
    const gR2 = new THREE.Vector3(opts.w * 0.5, opts.h, opts.d * 0.5);
    const gRT = new THREE.Vector3(opts.w * 0.5, opts.h + ridgeRise, 0);
    hg.add(new THREE.Mesh(trackGeo(createWorldUvTri(gR1, gR2, gRT, 3.0)), wallMat));

    // Pale lime roof ridge + upturned end finials
    addBox(opts.w + roofOver * 1.85, 0.26, 0.34, 0, opts.h + ridgeRise + 0.08, 0, mats.limeRidge, 0, hg, false);
    for (const ex of [-(opts.w * 0.5 + roofOver * 0.85), opts.w * 0.5 + roofOver * 0.85]) {
      addBox(0.32, 0.42, 0.36, ex, opts.h + ridgeRise + 0.24, 0, mats.limeRidge, 0, hg, false);
    }

    // Timber-framed windows & front doorway
    const winZ = opts.d * 0.5 + 0.04;
    addWindow(1.55, 1.15, -opts.w * 0.26, opts.h * 0.68, winZ, 0, hg);
    addWindow(1.55, 1.15, opts.w * 0.26, opts.h * 0.68, winZ, 0, hg);
    if (opts.h > 5.0) {
      addWindow(1.45, 1.15, -opts.w * 0.26, 2.2, winZ, 0, hg);
      addBox(1.5, 2.35, 0.16, opts.w * 0.24, 1.45, winZ, mats.weatheredWoodDoor, 0, hg, false);
    }
    // Optional projecting timber balcony railing on 2-story Hakka houses
    if (opts.hasBalcony) {
      addBox(opts.w * 0.72, 0.16, 1.1, 0, opts.h * 0.52, opts.d * 0.5 + 0.55, mats.darkTimber, 0, hg, false);
      addBox(opts.w * 0.72, 0.08, 0.08, 0, opts.h * 0.52 + 0.85, opts.d * 0.5 + 1.04, mats.darkTimber, 0, hg, false);
      for (let bp = -3; bp <= 3; bp++) {
        addBox(0.08, 0.85, 0.08, bp * (opts.w * 0.1), opts.h * 0.52 + 0.42, opts.d * 0.5 + 1.04, mats.darkTimber, 0, hg, false);
      }
    }
    // Optional low whitewashed courtyard wall with tiled coping
    if (opts.hasYardWall) {
      addBox(opts.w + 2.4, 1.55, 0.32, 0, 0.78, opts.d * 0.5 + 3.2, ruralWhiteMat, 0, hg, false);
      addBox(opts.w + 2.55, 0.18, 0.48, 0, 1.62, opts.d * 0.5 + 3.2, mats.roofTile, 0, hg, false);
    }
    root.add(hg);
  };

  // Ground every rural cottage flush with the contoured hillside terrain (zero floating houses!)
  const cottageSpecs = [
    { x: 5.5, z: -42.5, w: 12.4, h: 6.4, d: 8.2, rotY: 0.08, isBrick: false, hasBalcony: true, hasYardWall: true },
    { x: 27.5, z: -39.5, w: 10.6, h: 5.6, d: 7.4, rotY: -0.15, isBrick: true, hasBalcony: true },
    { x: -38, z: -62, w: 10.2, h: 5.4, d: 7.4, rotY: 0.12, isBrick: false },
    { x: 32, z: -68, w: 9.6, h: 5.8, d: 7.0, rotY: -0.18, isBrick: true },
    { x: -12, z: -78, w: 11.0, h: 5.2, d: 7.6, rotY: 0.05, isBrick: false },
    { x: 54, z: -48, w: 9.2, h: 5.0, d: 6.8, rotY: -0.24, isBrick: false },
  ];
  for (const cs of cottageSpecs) {
    buildHakkaCottage({ ...cs, y: groundHeightAt(cs.x, cs.z, 0) - 0.14 });
  }

  // 8E. Ecologically Thinned & Grounded Camphor/Lychee Groves with Layered Alpha-Cutout Leaf Sprig Canopies!
  // Thinned from 145 overcrowded rear trees to ~68 naturally spaced groves, strictly validated via isValidTreePosition()
  // so zero trees ever float or clip into any wall or house.
  const forestTreePositions: [number, number, number, number][] = [];
  const totalForestCandidates = 78;
  for (let i = 0; i < totalForestCandidates; i++) {
    const phi = -0.18 * Math.PI + (i / (totalForestCandidates - 1)) * 1.36 * Math.PI;
    const band = i % 3;
    const jitter = (((i * 37) % 11) - 5) * 0.85;
    const rAdd = 10.5 + band * 16.5 + jitter;
    const tx = Math.cos(phi) * (OUTER_RING_RX + rAdd);
    const tz = OVAL_CENTER_Z - Math.sin(phi) * (OUTER_RING_RZ + rAdd);

    // Keep clear of all cottages, Bogong shrine, and every building wall
    if (!isValidTreePosition(tx, tz, 4.2)) continue;
    if (Math.hypot(tx - 5.5, tz + 42.5) < 11.2) continue;
    if (Math.hypot(tx - 27.5, tz + 39.5) < 10.0) continue;
    if (Math.hypot(tx, tz + 46.5) < 6.0) continue;
    if (Math.hypot(tx + 38, tz + 62) < 10.5) continue;
    if (Math.hypot(tx - 32, tz + 68) < 10.5) continue;
    if (Math.hypot(tx + 12, tz + 78) < 10.5) continue;
    if (Math.hypot(tx - 54, tz + 48) < 9.5) continue;

    // Enforce natural inter-tree spacing so groves breathe ecologically
    let tooClose = false;
    for (let j = 0; j < forestTreePositions.length; j++) {
      const [ox, , oz] = forestTreePositions[j];
      if (Math.hypot(tx - ox, tz - oz) < 7.8) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const scale = 0.94 + ((i * 29) % 10) * 0.1 + (band >= 2 ? 0.28 : 0);
    // Embed root base 0.16m into terrain so sloped hillsides never reveal floating gaps
    forestTreePositions.push([tx, groundHeightAt(tx, tz, 0) - 0.16, tz, scale]);
  }

  // Airy multi-layered botanical leaf-sprig card clusters (replaces lumpy solid pillow blobs!)
  const sprigClusterGeoA = trackGeo(createFoliageCardClusterGeometry(2.45, 14, 1.3, 0.78));
  const sprigClusterGeoB = trackGeo(createFoliageCardClusterGeometry(1.95, 12, 3.9, 0.76));
  const sprigClusterGeoC = trackGeo(createFoliageCardClusterGeometry(1.6, 10, 6.2, 0.74));

  // Gently curving tapered trunk + lower fork template for instanced forest trees
  const instTrunkGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, -0.15, 0),
        new THREE.Vector3(0.12, 1.4, 0.06),
        new THREE.Vector3(-0.08, 3.0, -0.05),
        new THREE.Vector3(0.05, 4.2, 0.04),
      ],
      0.34,
      0.14,
      8,
      7
    )
  );

  const trunkInst = new THREE.InstancedMesh(instTrunkGeo, mats.darkTimber, forestTreePositions.length);
  const crownInstDeep = new THREE.InstancedMesh(sprigClusterGeoA, mats.foliageSprigDeep, forestTreePositions.length);
  const crownInstMid = new THREE.InstancedMesh(sprigClusterGeoB, mats.foliageSprigMid, forestTreePositions.length * 2);
  const crownInstBright = new THREE.InstancedMesh(sprigClusterGeoC, mats.foliageSprigBright, forestTreePositions.length);

  const tintPalette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xf0f6e2),
    new THREE.Color(0xe6f2ec),
    new THREE.Color(0xf7efda),
  ];

  forestTreePositions.forEach(([tx, ty, tz, sc], idx) => {
    const yaw = idx * 1.37;
    const tint = tintPalette[idx % tintPalette.length];

    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tx, ty + 4.25 * sc, tz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sc * 1.18, sc * 0.94, sc * 1.14);
    dummy.updateMatrix();
    crownInstDeep.setMatrixAt(idx, dummy.matrix);
    crownInstDeep.setColorAt(idx, tint);

    dummy.position.set(tx + Math.cos(yaw) * 1.25 * sc, ty + 4.9 * sc, tz + Math.sin(yaw) * 1.25 * sc);
    dummy.rotation.set(0.08, yaw + 1.1, -0.08);
    dummy.scale.set(sc * 0.96, sc * 0.86, sc * 0.94);
    dummy.updateMatrix();
    crownInstMid.setMatrixAt(idx * 2, dummy.matrix);
    crownInstMid.setColorAt(idx * 2, tint);

    dummy.position.set(tx - Math.sin(yaw) * 1.15 * sc, ty + 4.55 * sc, tz + Math.cos(yaw) * 1.15 * sc);
    dummy.rotation.set(-0.08, yaw + 2.4, 0.1);
    dummy.scale.set(sc * 0.9, sc * 0.84, sc * 0.94);
    dummy.updateMatrix();
    crownInstMid.setMatrixAt(idx * 2 + 1, dummy.matrix);
    crownInstMid.setColorAt(idx * 2 + 1, tint);

    dummy.position.set(tx - Math.cos(yaw) * 0.6 * sc, ty + 5.45 * sc, tz - Math.sin(yaw) * 0.6 * sc);
    dummy.rotation.set(0.06, yaw + 3.8, 0.06);
    dummy.scale.set(sc * 0.88, sc * 0.78, sc * 0.88);
    dummy.updateMatrix();
    crownInstBright.setMatrixAt(idx, dummy.matrix);
    crownInstBright.setColorAt(idx, tint);
  });
  trunkInst.instanceMatrix.needsUpdate = true;
  crownInstDeep.instanceMatrix.needsUpdate = true;
  crownInstMid.instanceMatrix.needsUpdate = true;
  crownInstBright.instanceMatrix.needsUpdate = true;
  if (crownInstDeep.instanceColor) crownInstDeep.instanceColor.needsUpdate = true;
  if (crownInstMid.instanceColor) crownInstMid.instanceColor.needsUpdate = true;
  if (crownInstBright.instanceColor) crownInstBright.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  crownInstDeep.computeBoundingSphere();
  crownInstMid.computeBoundingSphere();
  crownInstBright.computeBoundingSphere();
  root.add(trunkInst, crownInstDeep, crownInstMid, crownInstBright);

  // 6 Near Foreground Hero Camphor Trees (苍劲多叉古樟树: 盘根 + 多分叉枝干 + 通透羽状叶冠)
  const barkMat = createPaintedWoodMat(0x6d4732, trackMat, 0.84);
  const heroTrunkGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, -0.18, 0),
        new THREE.Vector3(0.18, 1.3, 0.08),
        new THREE.Vector3(-0.1, 2.7, -0.08),
        new THREE.Vector3(0.12, 3.8, 0.1),
      ],
      0.42,
      0.16,
      10,
      8
    )
  );
  const heroBranchLGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0.02, 2.15, 0.0),
        new THREE.Vector3(-0.85, 3.05, 0.35),
        new THREE.Vector3(-1.65, 3.75, 0.55),
      ],
      0.2,
      0.075,
      8,
      7
    )
  );
  const heroBranchRGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(-0.02, 2.45, -0.02),
        new THREE.Vector3(0.95, 3.3, -0.45),
        new THREE.Vector3(1.72, 4.05, -0.62),
      ],
      0.18,
      0.07,
      8,
      7
    )
  );
  const heroBranchFGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0.0, 2.65, 0.04),
        new THREE.Vector3(0.28, 3.45, 0.85),
        new THREE.Vector3(0.45, 4.15, 1.38),
      ],
      0.14,
      0.055,
      7,
      6
    )
  );
  const heroCrownClusters: Array<[number, number, number, number, THREE.Material, THREE.BufferGeometry]> = [
    [0.0, 4.35, 0.0, 1.1, mats.foliageSprigDeep, sprigClusterGeoA],
    [-1.65, 4.15, 0.55, 0.94, mats.foliageSprigMid, sprigClusterGeoB],
    [1.72, 4.35, -0.6, 0.92, mats.foliageSprigMid, sprigClusterGeoB],
    [0.45, 4.75, 1.18, 0.88, mats.foliageSprigMid, sprigClusterGeoB],
    [-0.55, 5.15, -0.82, 0.86, mats.foliageSprigBright, sprigClusterGeoC],
    [0.85, 5.35, 0.25, 0.84, mats.foliageSprigBright, sprigClusterGeoC],
    [-0.9, 4.88, -0.1, 0.8, mats.foliageSprigBright, sprigClusterGeoC],
  ];
  for (const [tx, tz, sc, idx] of [
    [40.5, 16.5, 1.3, 0],
    [44.0, 9.5, 1.44, 1],
    [45.5, 2.5, 1.4, 2],
    [42.5, 22.0, 1.18, 3],
    [-42.5, 15.0, 1.28, 4],
    [-45.0, 6.0, 1.38, 5],
  ] as Array<[number, number, number, number]>) {
    if (!isValidTreePosition(tx, tz, 2.8)) continue;
    const ty = groundHeightAt(tx, tz, 0) - 0.14;
    const cg = new THREE.Group();
    cg.position.set(tx, ty, tz);
    cg.rotation.y = idx * 1.15;
    cg.scale.setScalar(sc);
    const trunkMesh = new THREE.Mesh(heroTrunkGeo, barkMat);
    trunkMesh.castShadow = castShadow;
    cg.add(trunkMesh);
    cg.add(new THREE.Mesh(heroBranchLGeo, barkMat));
    cg.add(new THREE.Mesh(heroBranchRGeo, barkMat));
    cg.add(new THREE.Mesh(heroBranchFGeo, barkMat));
    for (const [px, py, pz, psc, pmat, pgeo] of heroCrownClusters) {
      const m = new THREE.Mesh(pgeo, pmat);
      m.position.set(px, py, pz);
      m.scale.setScalar(psc);
      m.castShadow = castShadow;
      cg.add(m);
    }
    root.add(cg);
  }

  // 8F. 14 Exquisitely Sculpted Spring Peach Blossom Trees — strictly validated to NEVER clip walls
  // and upgraded to airy layered blossom-sprig clusters!
  const peachTrunkGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, -0.16, 0),
        new THREE.Vector3(0.16, 0.95, 0.08),
        new THREE.Vector3(-0.14, 2.05, -0.06),
        new THREE.Vector3(0.08, 3.05, 0.12),
      ],
      0.28,
      0.11,
      10,
      8
    )
  );
  const peachBranch1Geo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0.02, 1.55, 0.02),
        new THREE.Vector3(0.75, 2.35, 0.32),
        new THREE.Vector3(1.48, 2.95, 0.56),
      ],
      0.14,
      0.045,
      8,
      7
    )
  );
  const peachBranch2Geo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(-0.08, 1.88, -0.04),
        new THREE.Vector3(-0.78, 2.65, -0.28),
        new THREE.Vector3(-1.42, 3.22, -0.52),
      ],
      0.13,
      0.045,
      8,
      7
    )
  );
  const peachBranch3Geo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0.0, 2.25, 0.0),
        new THREE.Vector3(-0.22, 2.95, 0.65),
        new THREE.Vector3(-0.36, 3.45, 1.18),
      ],
      0.11,
      0.04,
      7,
      6
    )
  );
  const blossomClusterBigGeo = trackGeo(createFoliageCardClusterGeometry(1.18, 12, 2.1, 0.74));
  const blossomClusterSmallGeo = trackGeo(createFoliageCardClusterGeometry(0.86, 9, 5.3, 0.78));

  // All 14 coordinates cleanly cleared of Inner/Outer Weilong walls and Half-Moon Pond
  const blossomTrees: Array<[number, number, number]> = [
    [-27.0, 25.2, 1.08],
    [27.0, 25.6, 1.1],
    [-30.5, 32.0, 0.98],
    [30.5, 31.8, 1.02],
    [-21.8, 36.2, 0.94],
    [21.8, 36.0, 0.96],
    [-17.4, 47.4, 0.94],
    [17.4, 47.0, 0.98],
    [-24.5, -45.5, 1.12],
    [24.5, -45.5, 1.14],
    [-13.5, -47.2, 1.18],
    [16.8, -46.8, 1.16],
    [-44.5, -12.5, 1.14],
    [45.0, -12.0, 1.16],
  ];

  const blossomClusterLayout: Array<[number, number, number, number, boolean]> = [
    [0.0, 3.4, 0.0, 1.12, true],
    [1.42, 3.08, 0.54, 1.02, true],
    [-1.36, 3.35, -0.5, 1.0, true],
    [-0.38, 3.58, 1.14, 0.94, true],
    [0.54, 3.9, -0.68, 0.92, false],
    [-0.68, 3.96, 0.26, 0.94, false],
    [0.86, 3.7, 0.9, 0.82, false],
    [0.12, 4.28, -0.05, 0.88, false],
  ];

  blossomTrees.forEach(([bx, bz, sc], idx) => {
    if (!isValidTreePosition(bx, bz, 2.2)) return;
    const by = groundHeightAt(bx, bz, 0) - 0.14;
    const tg = new THREE.Group();
    tg.position.set(bx, by, bz);
    tg.rotation.y = idx * 1.47;
    tg.scale.setScalar(sc);

    const trunk = new THREE.Mesh(peachTrunkGeo, barkMat);
    trunk.castShadow = castShadow;
    tg.add(trunk);
    tg.add(new THREE.Mesh(peachBranch1Geo, barkMat));
    tg.add(new THREE.Mesh(peachBranch2Geo, barkMat));
    tg.add(new THREE.Mesh(peachBranch3Geo, barkMat));

    blossomClusterLayout.forEach(([px, py, pz, psc, isBig], pIdx) => {
      const geo = isBig ? blossomClusterBigGeo : blossomClusterSmallGeo;
      const cluster = new THREE.Mesh(geo, mats.blossomSprig);
      cluster.position.set(px, py, pz);
      cluster.scale.setScalar(psc);
      cluster.rotation.y = pIdx * 1.15 + idx;
      cluster.castShadow = castShadow && pIdx < 4;
      tg.add(cluster);
    });
    root.add(tg);
  });

  // 8G. 5 Gracefully Leaning Sculpted Weeping Willows with airy sprig crowns + translucent SSS fronds!
  const willowCurtainMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: SCULPT_COLORS.willowLeafTip,
        roughness: 0.72,
        side: THREE.DoubleSide,
      })
    ),
    { key: 'willow_curtain', tintHex: 0xdff584, backStrength: 0.78, wrapStrength: 0.32, power: 1.9 }
  );
  const willowCurtainInnerMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: SCULPT_COLORS.willowLeafMid,
        roughness: 0.74,
        side: THREE.DoubleSide,
      })
    ),
    { key: 'willow_curtain_in', tintHex: 0xc2ea74, backStrength: 0.68, wrapStrength: 0.28, power: 2.0 }
  );

  const willowTrunkGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, -0.16, 0),
        new THREE.Vector3(0.28, 1.35, 0.08),
        new THREE.Vector3(0.62, 2.75, 0.14),
        new THREE.Vector3(0.92, 3.85, 0.18),
      ],
      0.34,
      0.13,
      10,
      8
    )
  );
  const willowBoughGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0.45, 2.4, 0.08),
        new THREE.Vector3(0.15, 3.2, -0.58),
        new THREE.Vector3(-0.35, 3.65, -1.05),
      ],
      0.15,
      0.055,
      8,
      7
    )
  );
  const willowFrondLongGeo = trackGeo(createWillowFrondGeometry(2.55, 0.52, 0.085, 7));
  const willowFrondMedGeo = trackGeo(createWillowFrondGeometry(1.92, 0.42, 0.075, 6));
  const willowSprigGeo = trackGeo(createFoliageCardClusterGeometry(1.15, 11, 8.7, 0.7));

  const willowPositions: Array<[number, number, number]> = [
    [-17.8, 39.2, 1.06],
    [17.8, 39.6, 1.08],
    [-13.8, 49.6, 0.96],
    [13.4, 49.8, 0.98],
    [0.8, 51.0, 1.04],
  ];
  willowPositions.forEach(([wx, wz, sc], idx) => {
    const wy = groundHeightAt(wx, wz, 0) - 0.12;
    const wg = new THREE.Group();
    wg.position.set(wx, wy, wz);
    const toPondYaw = Math.atan2(0 - wx, 43.2 - wz);
    wg.rotation.y = toPondYaw - Math.PI * 0.5;
    wg.scale.setScalar(sc);

    const wTrunk = new THREE.Mesh(willowTrunkGeo, barkMat);
    wTrunk.castShadow = castShadow;
    wg.add(wTrunk);
    wg.add(new THREE.Mesh(willowBoughGeo, barkMat));

    // Airy layered weeping willow sprig clusters crowning the hanging fronds
    const crownCenters: Array<[number, number, number, number, THREE.Material]> = [
      [0.95, 4.02, 0.14, 1.04, mats.foliageSprigMid],
      [1.62, 3.82, 0.68, 0.84, mats.foliageSprigBright],
      [1.48, 3.88, -0.52, 0.82, mats.foliageSprigBright],
      [0.25, 4.16, -0.46, 0.88, mats.foliageSprigMid],
      [-0.36, 3.74, -0.96, 0.78, mats.foliageSprigDeep],
      [0.86, 4.56, 0.06, 0.82, mats.foliageSprigBright],
      [0.45, 3.86, 0.92, 0.78, mats.foliageSprigMid],
    ];
    for (const [cx, cy, cz, csc, cmat] of crownCenters) {
      const dome = new THREE.Mesh(willowSprigGeo, cmat);
      dome.position.set(cx, cy, cz);
      dome.scale.set(csc * 1.12, csc * 0.82, csc * 1.12);
      wg.add(dome);
    }

    // 24 Graceful fine arched weeping willow frond curtains swaying softly in the breeze!
    for (let s = 0; s < 24; s++) {
      const a = (s / 24) * Math.PI * 2;
      const isOuter = s % 2 === 0;
      const rad = isOuter ? 1.44 + (s % 3) * 0.08 : 0.98 + (s % 3) * 0.06;
      const frondPivot = new THREE.Group();
      frondPivot.position.set(0.88 + Math.cos(a) * rad, isOuter ? 3.82 : 3.98, 0.05 + Math.sin(a) * rad);
      frondPivot.rotation.y = -a + Math.PI * 0.5;
      const frondMesh = new THREE.Mesh(
        isOuter ? willowFrondLongGeo : willowFrondMedGeo,
        isOuter ? willowCurtainMat : willowCurtainInnerMat
      );
      frondMesh.scale.y = 0.82 + (s % 4) * 0.12;
      frondPivot.add(frondMesh);
      wg.add(frondPivot);
      animatedWillowFronds.push({
        mesh: frondPivot,
        phase: idx * 1.4 + s * 0.38,
        baseRx: 0.04,
        baseRz: 0,
      });
    }
    root.add(wg);
  });

  // 8H. 14 Multi-Cluster Sculpted Courtyard Flowering Shrubs with airy leaf sprigs
  const flowerAccentMats = [
    createPaintedWoodMat(HANDCRAFTED_PAL.verm, trackMat, 0.58),
    createPaintedWoodMat(HANDCRAFTED_PAL.lilac, trackMat, 0.58),
    createPaintedWoodMat(HANDCRAFTED_PAL.lemon, trackMat, 0.58),
    createPaintedWoodMat(HANDCRAFTED_PAL.pink, trackMat, 0.58),
  ];
  const shrubSprigGeo = trackGeo(createFoliageCardClusterGeometry(0.56, 8, 7.1, 0.78));
  const flowerClusterGeo = trackGeo(createSoftPillowGeometry(0.085, 2.5, 0.85, 8, 6));
  const shrubSpots: Array<[number, number, number]> = [
    [-20.6, 23.0, 1.0],
    [20.6, 23.0, 1.05],
    [-23.6, 23.6, 1.12],
    [23.6, 23.6, 1.1],
    [-14.2, 36.1, 0.9],
    [14.2, 36.1, 0.92],
    [-17.8, 37.2, 1.02],
    [17.8, 37.2, 1.0],
    [-8.5, -16.8, 0.95],
    [8.5, -16.8, 0.95],
    [-13.5, -14.2, 1.0],
    [13.5, -14.2, 1.0],
    [-21.2, 18.2, 0.92],
    [21.2, 18.2, 0.92],
  ];
  shrubSpots.forEach(([sx, sz, sc], idx) => {
    const sy = groundHeightAt(sx, sz, 0) - 0.04;
    const sg = new THREE.Group();
    sg.position.set(sx, sy, sz);
    sg.rotation.y = idx * 1.25;
    sg.scale.setScalar(sc);

    for (const [bx, by, bz, bsc, isLight] of [
      [0, 0.36, 0, 1.12, false],
      [0.32, 0.3, 0.2, 0.8, true],
      [-0.32, 0.32, -0.18, 0.84, true],
    ] as Array<[number, number, number, number, boolean]>) {
      const m = new THREE.Mesh(shrubSprigGeo, isLight ? mats.foliageSprigBright : mats.foliageSprigDeep);
      m.position.set(bx, by, bz);
      m.scale.setScalar(bsc);
      sg.add(m);
    }

    const fMat = flowerAccentMats[idx % flowerAccentMats.length];
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2 + idx * 0.7;
      const rad = 0.26 + (f % 3) * 0.14;
      const dot = new THREE.Mesh(flowerClusterGeo, fMat);
      dot.position.set(Math.cos(a) * rad, 0.48 + (f % 3) * 0.11, Math.sin(a) * rad);
      dot.scale.setScalar(0.85 + (f % 2) * 0.35);
      sg.add(dot);
    }
    root.add(sg);
  });

  return {
    root,
    skyDome,
    doumenEastLeft,
    doumenEastRight,
    doumenWestLeft,
    doumenWestRight,
    koiGroup,
    lanternLights,
    rainCurtainMeshes,
    updateWater: (
      t: number,
      nightFactor: number,
      rainFactor: number,
      skyZenithHex?: number,
      skyHorizonHex?: number,
      sunColorHex?: number,
      lanternGlow?: number
    ) => {
      pondUniforms.uTime.value = t;
      pondUniforms.uNight.value = nightFactor;
      pondUniforms.uRain.value = rainFactor;
      if (skyZenithHex !== undefined) pondUniforms.uSkyZenith.value.setHex(skyZenithHex);
      if (skyHorizonHex !== undefined) pondUniforms.uSkyHorizon.value.setHex(skyHorizonHex);
      if (sunColorHex !== undefined) pondUniforms.uSunColor.value.setHex(sunColorHex);
      if (lanternGlow !== undefined) pondUniforms.uLanternGlow.value = lanternGlow;

      // Graceful gentle breeze sway on weeping willow frond curtains
      for (let i = 0; i < animatedWillowFronds.length; i++) {
        const wf = animatedWillowFronds[i];
        wf.mesh.rotation.x = wf.baseRx + Math.sin(t * 1.35 + wf.phase) * 0.065;
        wf.mesh.rotation.z = wf.baseRz + Math.cos(t * 1.1 + wf.phase * 0.7) * 0.045;
      }

      // Soft lakeside reed sway
      for (let i = 0; i < animatedReeds.length; i++) {
        const rd = animatedReeds[i];
        rd.mesh.rotation.z = Math.sin(t * 1.6 + rd.phase) * 0.055;
      }

      // Articulated S-wave swimming wag for all 12 underwater Koi fish
      for (let i = 0; i < animatedKoiTails.length; i++) {
        const kt = animatedKoiTails[i];
        kt.tail.rotation.y = Math.sin(t * 5.2 + kt.phase) * 0.34;
        kt.fin.rotation.y = Math.sin(t * 5.2 + kt.phase - 0.8) * 0.42;
      }
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
    },
  };
}
