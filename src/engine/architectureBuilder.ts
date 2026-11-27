import * as THREE from 'three';
import type { MaterialLibrary } from './proceduralTextures';
import {
  FRONT_CENTER_Z,
  FRONT_STRAIGHT_HALF_W,
  FRONT_WALL_INNER_Z,
  FRONT_WALL_OUTER_Z,
  groundHeightAt,
  INNER_RING_HALF_DEPTH,
  INNER_RING_RX,
  INNER_RING_RZ,
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

        // Segmented organic lime-mortar main ridge spine (正脊) following timber settling!
        const ra = r0.clone();
        ra.y += organicRoofSettling(ra.x, ra.z) + 0.1;
        const rb = r1.clone();
        rb.y += organicRoofSettling(rb.x, rb.z) + 0.1;
        const rSegLen = ra.distanceTo(rb) + 0.14;
        const rBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.28, rSegLen)), mats.limeRidge);
        rBar.position.lerpVectors(ra, rb, 0.5);
        rBar.lookAt(rb);
        root.add(rBar);
        const rCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.44, 0.1, rSegLen + 0.04)), mats.limeRidge);
        rCap.position.lerpVectors(ra, rb, 0.5);
        rCap.position.y += 0.14;
        rCap.lookAt(rb.x, rb.y + 0.14, rb.z);
        root.add(rCap);
      }

      if (gableEnds) {
        const gW1 = new THREE.Vector3(cx - halfL + 0.25, gableBaseY, cz + halfS - overhang * 0.6);
        const gW2 = new THREE.Vector3(cx - halfL + 0.25, gableBaseY, cz - halfS + overhang * 0.6);
        const gWT = new THREE.Vector3(cx - halfL + 0.25, ridgeY, cz);
        root.add(new THREE.Mesh(trackGeo(createWorldUvTri(gW1, gW2, gWT, 3.6)), mats.limeWall));

        const gE1 = new THREE.Vector3(cx + halfL - 0.25, gableBaseY, cz - halfS + overhang * 0.6);
        const gE2 = new THREE.Vector3(cx + halfL - 0.25, gableBaseY, cz + halfS - overhang * 0.6);
        const gET = new THREE.Vector3(cx + halfL - 0.25, ridgeY, cz);
        root.add(new THREE.Mesh(trackGeo(createWorldUvTri(gE1, gE2, gET, 3.6)), mats.limeWall));

        const slopeLen = Math.hypot(halfS, ridgeY - eaveY);
        for (const endX of [cx - halfL + 0.06, cx + halfL - 0.06]) {
          for (const dirZ of [-1, 1]) {
            const verge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.18, slopeLen)), mats.limeRidge);
            verge.position.set(endX, (ridgeY + eaveY) * 0.5 + 0.02, cz + dirZ * halfS * 0.5);
            verge.rotation.x = dirZ * pitch;
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
        const rSegLen = ra.distanceTo(rb) + 0.14;
        const rBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.26, rSegLen)), mats.limeRidge);
        rBar.position.lerpVectors(ra, rb, 0.5);
        rBar.lookAt(rb);
        root.add(rBar);
        const rCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.09, rSegLen + 0.04)), mats.limeRidge);
        rCap.position.lerpVectors(ra, rb, 0.5);
        rCap.position.y += 0.13;
        rCap.lookAt(rb.x, rb.y + 0.13, rb.z);
        root.add(rCap);
      }

      if (gableEnds) {
        const slopeLen = Math.hypot(halfS, ridgeY - eaveY);
        for (const endZ of [cz - halfL + 0.06, cz + halfL - 0.06]) {
          for (const dirX of [-1, 1]) {
            const verge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(slopeLen, 0.18, 0.22)), mats.limeRidge);
            verge.position.set(cx + dirX * halfS * 0.5, (ridgeY + eaveY) * 0.5 + 0.02, endZ);
            verge.rotation.z = -dirX * pitch;
            root.add(verge);
          }
        }
        const gS1 = new THREE.Vector3(cx - halfS + overhang * 0.5, gableBaseY, cz + halfL - 0.22);
        const gS2 = new THREE.Vector3(cx + halfS - overhang * 0.5, gableBaseY, cz + halfL - 0.22);
        const gST = new THREE.Vector3(cx, ridgeY, cz + halfL - 0.22);
        root.add(new THREE.Mesh(trackGeo(createWorldUvTri(gS1, gS2, gST, 3.6)), mats.limeWall));

        const gN1 = new THREE.Vector3(cx + halfS - overhang * 0.5, gableBaseY, cz - halfL + 0.22);
        const gN2 = new THREE.Vector3(cx - halfS + overhang * 0.5, gableBaseY, cz - halfL + 0.22);
        const gNT = new THREE.Vector3(cx, ridgeY, cz - halfL + 0.22);
        root.add(new THREE.Mesh(trackGeo(createWorldUvTri(gN1, gN2, gNT, 3.6)), mats.limeWall));
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

  // Distant layered Meizhou mountains with humid Lingnan aerial-perspective haze gradient!
  const attachMountainMistShader = (
    mat: THREE.Material,
    key: string,
    lowHex: string,
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
          varying float vMtnX;`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vMtnY = position.y;
          vMtnX = position.x;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vMtnY;
          varying float vMtnX;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float hT = clamp((vMtnY + 3.0) / ${maxY.toFixed(1)}, 0.0, 1.0);
          float ridgeVar = 0.5 + 0.5 * sin(vMtnX * 0.045);
          vec3 mLow = vec3(${lowHex});
          vec3 mHigh = vec3(${highHex});
          diffuseColor.rgb = mix(mLow, mHigh, smoothstep(0.08, 0.92, hT)) * (0.92 + 0.14 * ridgeVar);`
        );
    };
  };

  const mtnMatFar = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide })
  );
  attachMountainMistShader(mtnMatFar, 'mtn_far_v1', '0.16, 0.30, 0.44', '0.07, 0.21, 0.38', 22);

  const mtnMatMid = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 })
  );
  attachMountainMistShader(mtnMatMid, 'mtn_mid_v1', '0.06, 0.13, 0.09', '0.035, 0.095, 0.075', 14);

  for (let layer = 0; layer < 2; layer++) {
    const segs = 96;
    const rad = layer === 0 ? 155 : 112;
    const baseH = layer === 0 ? -4 : -2;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad - 8;
      const northBoost = Math.max(0.25, (-Math.sin(a) + 1.1) * 0.62);
      const peak =
        (Math.sin(a * 7 + layer * 2) * 5.2 +
          Math.cos(a * 13 + layer) * 3.1 +
          Math.sin(a * 23) * 1.4 +
          Math.cos(a * 37 + layer) * 0.7 +
          (layer === 0 ? 13.5 : 6.2)) *
        northBoost;
      verts.push(x, baseH, z);
      verts.push(x, baseH + Math.max(2.5, peak), z);
      if (i < segs) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const mg = trackGeo(new THREE.BufferGeometry());
    mg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    mg.setIndex(idx);
    mg.computeVertexNormals();
    const mMesh = new THREE.Mesh(mg, layer === 0 ? mtnMatFar : mtnMatMid);
    root.add(mMesh);
  }

  // =========================================================================
  // 1. CONTINUOUS TERRAIN, EXPANSIVE HE-PING FORECOURT & HALF-MOON POND
  // =========================================================================
  // Lush Lingnan outer ground plane
  const outerGround = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(340, 340)),
    mats.forestGround
  );
  outerGround.rotation.x = -Math.PI * 0.5;
  outerGround.position.set(0, -0.08, -10);
  outerGround.receiveShadow = true;
  root.add(outerGround);

  // Expansive weathered concrete / three-lime-earth He-Ping forecourt (禾坪) matching photo!
  addBox(74, 0.14, 15.6, 0, -0.06, 29.2, mats.courtyardEarth, 0, root, false);
  // Low concrete/granite curb dividing He-Ping from front verge & pond (visible in photo!)
  addBox(74, 0.34, 0.42, 0, 0.12, 36.6, mats.granitePlinth);
  // Subtle dark drainage verge strip & southern apron beyond the curb
  addBox(74, 0.1, 4.2, 0, -0.05, 39.0, mats.graniteSlab, 0, root, false);
  // Tall slender dark-iron courtyard utility lamp pole on the right of He-Ping (seen in photo!)
  const poleMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.06, 0.085, 8.8, 8)),
    mats.roofTileDark
  );
  poleMesh.position.set(14.5, 4.4, 34.4);
  root.add(poleMesh);
  const lampArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.06, 0.06)), mats.roofTileDark);
  lampArm.position.set(14.0, 8.75, 34.4);
  root.add(lampArm);

  // Half-Moon Pond (半月塘) south of the forecourt
  const pondShape = new THREE.Shape();
  pondShape.absellipse(0, 0, 16.2, 10.8, 0, Math.PI, false, 0);
  pondShape.closePath();
  const pondWaterGeo = trackGeo(new THREE.ShapeGeometry(pondShape, 36));
  pondWaterGeo.rotateX(Math.PI * 0.5);
  const pondWaterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a6662,
      roughness: 0.16,
      metalness: 0.32,
      side: THREE.DoubleSide,
    })
  );
  const pondWater = new THREE.Mesh(pondWaterGeo, pondWaterMat);
  pondWater.position.set(0, -0.22, 38.6);
  pondWater.receiveShadow = true;
  root.add(pondWater);

  // Pond granite rim & curved stone embankment
  addBox(34, 0.42, 0.65, 0, 0.02, 38.4, mats.graniteSlab);
  for (let i = 0; i <= 22; i++) {
    const a = (i / 22) * Math.PI;
    const rx = Math.cos(a) * 16.5;
    const rz = 38.6 + Math.sin(a) * 11.1;
    addBox(2.5, 0.46, 0.65, rx, 0.02, rz, mats.graniteSlab, -a + Math.PI * 0.5);
  }
  // Stone jetty steps dipping into Half-Moon Pond
  for (let s = 0; s < 4; s++) {
    addBox(6.8, 0.16, 0.72, 0, -0.04 - s * 0.1, 36.9 + s * 0.68, mats.graniteSlab);
  }
  // Swimming Koi & Grass Carp
  const koiGroup = new THREE.Group();
  const koiColors = [0xe85a2a, 0xf2f0eb, 0xeb9b2d, 0xd43b24, 0x3f4c4a];
  for (let k = 0; k < 12; k++) {
    const fish = new THREE.Group();
    const fMat = trackMat(new THREE.MeshStandardMaterial({ color: koiColors[k % koiColors.length], roughness: 0.3 }));
    const body = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.08, 0.28, 4, 6)), fMat);
    body.rotation.x = Math.PI * 0.5;
    fish.add(body);
    const tail = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.09, 0.18, 4)), fMat);
    tail.rotation.x = -Math.PI * 0.5;
    tail.position.z = -0.22;
    fish.add(tail);
    fish.userData = {
      orbitRadiusX: 3.5 + (k % 5) * 2.1,
      orbitRadiusZ: 1.8 + (k % 4) * 1.4,
      orbitAngle: (k / 12) * Math.PI * 2,
      speed: 0.22 + (k % 3) * 0.08,
      centerX: (k % 3 - 1) * 3.8,
      centerZ: 42.8 + (k % 3) * 1.2,
    };
    fish.position.set(fish.userData.centerX, -0.18, fish.userData.centerZ);
    koiGroup.add(fish);
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

  // Recessed central main portal alcove (凹肚大门) + granite doorjambs + 25cm high wooden threshold + golden plaque
  addCraftedWall(1.4, frontWallH, 0.36, -2.0, 0.0, 20.95, Math.PI * 0.5);
  addCraftedWall(1.4, frontWallH, 0.36, 2.0, 0.0, 20.95, Math.PI * 0.5);
  // Granite lintel & jambs
  addBox(4.3, 0.36, 0.52, 0, 3.02, 21.65, mats.granitePlinth);
  addBox(0.38, 3.1, 0.5, -1.9, 1.55, 21.65, mats.granitePlinth);
  addBox(0.38, 3.1, 0.5, 1.9, 1.55, 21.65, mats.granitePlinth);
  // High wooden threshold ("忌踩门槛")
  addBox(3.7, 0.24, 0.32, 0, 0.18, 21.58, mats.darkTimber);
  // Open dark-timber door leaves swung neatly inward inside the alcove
  addBox(0.14, 2.65, 1.25, -1.72, 1.58, 20.85, mats.weatheredWoodDoor);
  addBox(0.14, 2.65, 1.25, 1.72, 1.58, 20.85, mats.weatheredWoodDoor);
  // Red spring couplets flanking the main portal & secondary portals (just like the photo!)
  for (const cx of [-2.35, 2.35, -14.45, 14.45]) {
    addBox(0.32, 1.85, 0.04, cx, 1.75, 21.91, mats.redCouplet, 0, root, false);
  }
  // Golden calligraphy clan plaque "陇西世泽" mounted cleanly below the front eave & inside Lower Hall
  addBox(2.45, 0.62, 0.1, 0, 2.68, 21.92, mats.plaqueLongxi, 0, root, false);
  addBox(2.6, 0.78, 0.12, 0, 3.38, 17.6, mats.plaqueLongxi, 0, root, false);

  // Horizontal dark-framed windows along the front white facade (exact rhythm from photo!)
  for (const wx of [-12.6, -10.2, -7.2, -4.6, 4.6, 7.2, 10.2, 12.6]) {
    addWindow(1.45, 0.92, wx, 2.05, 21.88, 0);
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
    // Wing outer walls facing the sunlit crescent Tianjie (x = ±18.4) with 3 wide open doorways!
    addCraftedWall(2.6, 3.35, 0.38, side * 18.4, 0.32, 15.1, Math.PI * 0.5);
    // On East wing middle segment, build our interactive X-Ray Rammed Earth Wall with visible bamboo/timber "墙骨"!
    if (side === 1) {
      // Exposed internal bamboo & cedar wall-bones inside the transparent X-Ray rammed-earth layer
      const boneGroup = new THREE.Group();
      for (let by = 0.75; by <= 3.1; by += 0.55) {
        addBox(0.06, 0.06, 4.4, 18.4, by, 7.7, mats.bambooGreen, 0, boneGroup, false);
      }
      for (let bz = 5.7; bz <= 9.7; bz += 0.8) {
        addBox(0.08, 3.1, 0.08, 18.4, 1.9, bz, mats.darkTimber, 0, boneGroup, false);
      }
      root.add(boneGroup);
      addBox(0.42, 3.35, 4.6, 18.4, 1.99, 7.7, mats.rammedEarthXray);
    } else {
      addCraftedWall(4.6, 3.35, 0.38, side * 18.4, 0.32, 7.7, Math.PI * 0.5);
    }
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

      // Organic smoothly-curving pale lime ridge spine connecting ridge0 -> ridge1
      const ra = ridge0.clone();
      ra.y += organicRoofSettling(ra.x, ra.z) + 0.08;
      const rb = ridge1.clone();
      rb.y += organicRoofSettling(rb.x, rb.z) + 0.08;
      const rLen = ra.distanceTo(rb) + 0.16;
      const rBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.24, rLen)), mats.limeRidge);
      rBar.position.lerpVectors(ra, rb, 0.5);
      rBar.lookAt(rb);
      root.add(rBar);

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

      const midIdx = Math.floor(bayCount / 2);
      const isDragonApex = !isOuterRing && i >= midIdx - 2 && i < midIdx + 2;
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

      // 5. Partial radial room partition fins every 6 slices (= every 3 rooms)
      if (i > 0 && i % 6 === 0 && !isDragonApex) {
        const px = s0.x + s0.nx * 0.75;
        const pz = s0.z + s0.nz * 0.75;
        addBox(0.24, wallHeight - 0.1, halfDepth * 1.15, px, s0.yBase + wallHeight * 0.5, pz, mats.limeWallInterior, bayYaw, root, false);
      }
    }
  };

  // Build Silky 64-Segment Inner Weilong Ring (内围龙 — 32 architectural rooms along 64 silky-curved segments!)
  buildCurvedWeilongRing({
    sampleFn: sampleInnerWeilongCurve,
    bayCount: 64,
    halfDepth: INNER_RING_HALF_DEPTH,
    wallHeight: 3.15,
    ridgeHeight: 5.25,
    overhang: 0.62,
    openOuterBays: new Set([12, 13, 24, 25, 38, 39, 50, 51]),
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

  // Build Silky 52-Segment Outer Weilong Ring (外围龙 — 26 rooms along 52 silky-curved segments!)
  buildCurvedWeilongRing({
    sampleFn: sampleOuterWeilongCurve,
    bayCount: 52,
    halfDepth: OUTER_RING_HALF_DEPTH,
    wallHeight: 3.45,
    ridgeHeight: 5.65,
    overhang: 0.65,
    openOuterBays: new Set([20, 21, 30, 31]),
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
  const lanternGeo = trackGeo(new THREE.SphereGeometry(0.24, 10, 8));
  const lanternCapGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.14, 0.09, 8));
  lanternSpots.forEach(([lx, ly, lz], idx) => {
    const body = new THREE.Mesh(lanternGeo, mats.lanternPaper);
    body.scale.set(1, 1.28, 1);
    body.position.set(lx, ly, lz);
    root.add(body);
    const cap = new THREE.Mesh(lanternCapGeo, mats.gildedGold);
    cap.position.set(lx, ly + 0.32, lz);
    root.add(cap);
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

  // 8B. Central-North 2-story weathered rural Lingnan house with sky-blue parapet trim (directly behind outer ring in photo!)
  const blueTrimMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3575a6, roughness: 0.72 }));
  const ruralWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9ddd9,
      map: mats.limeWall.map,
      normalMap: mats.limeWall.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.9,
    })
  );
  const houseN = new THREE.Group();
  houseN.position.set(5.5, 2.4, -40.5);
  houseN.rotation.y = 0.08;
  addBox(12.5, 8.2, 8.5, 0, 4.1, 0, ruralWhiteMat, 0, houseN);
  addBox(12.9, 0.45, 8.9, 0, 8.3, 0, blueTrimMat, 0, houseN);
  addBox(4.8, 2.4, 4.2, 3.6, 9.4, -1.6, ruralWhiteMat, 0, houseN); // rooftop stair penthouse
  addWindow(2.4, 1.5, -2.5, 5.6, 4.28, 0, houseN);
  addWindow(3.2, 1.6, 2.0, 5.6, 4.28, 0, houseN);
  addWindow(2.4, 1.5, -2.5, 2.4, 4.28, 0, houseN);
  root.add(houseN);

  // 8C. NE Red-Brick & Plaster rural house to the right (directly matching right-rear house in photo!)
  const redBrickMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x874534,
      normalMap: mats.granitePlinth.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.9,
    })
  );
  const houseNE = new THREE.Group();
  houseNE.position.set(27.5, 2.2, -37.5);
  houseNE.rotation.y = -0.15;
  addBox(10.8, 6.2, 7.6, 0, 3.1, 0, redBrickMat, 0, houseNE);
  addBox(11.1, 1.1, 7.9, 0, 6.4, 0, mats.granitePlinth, 0, houseNE);
  addWindow(2.0, 1.4, -2.2, 4.0, 3.84, 0, houseNE);
  addWindow(2.0, 1.4, 2.2, 4.0, 3.84, 0, houseNE);
  root.add(houseNE);

  // 8D. Distant Meizhou Village Houses dotted across the lush northern valley (matching photo horizon!)
  for (const [hx, hz, w, h, d, ry, isBrick] of [
    [-38, -62, 10.0, 6.2, 7.5, 0.12, false],
    [32, -68, 9.5, 6.8, 7.2, -0.18, true],
    [-12, -78, 11.2, 5.8, 7.8, 0.05, false],
    [54, -48, 9.0, 5.6, 6.8, -0.24, false],
  ] as [number, number, number, number, number, number, boolean][]) {
    const hg = new THREE.Group();
    hg.position.set(hx, 0.2, hz);
    hg.rotation.y = ry;
    addBox(w, h, d, 0, h * 0.5, 0, isBrick ? redBrickMat : ruralWhiteMat, 0, hg, false);
    addBox(w + 0.4, 0.38, d + 0.4, 0, h + 0.18, 0, isBrick ? mats.granitePlinth : blueTrimMat, 0, hg, false);
    root.add(hg);
  }

  // 8E. Lush Dense Tropical Green Camphor / Lychee Trees & Bamboo Groves tightly framing the Outer Oval & Valley!
  const treePositions: [number, number, number, number][] = [];
  // Dense hugging ring around West, North, and East outer perimeter + wider valley woodland backdrop
  for (let i = 0; i < 145; i++) {
    const phi = -0.22 * Math.PI + (i / 144) * 1.44 * Math.PI;
    const band = i % 4;
    const rAdd = 7.2 + band * 12.5 + ((i * 17) % 8);
    const tx = Math.cos(phi) * (OUTER_RING_RX + rAdd);
    const tz = OVAL_CENTER_Z - Math.sin(phi) * (OUTER_RING_RZ + rAdd);
    // Keep the northern village house footprints & Bogong shrine path clear
    if (Math.hypot(tx - 5.5, tz + 40.5) < 8.5) continue;
    if (Math.hypot(tx - 27.5, tz + 37.5) < 7.5) continue;
    if (Math.hypot(tx, tz + 46.5) < 4.5) continue;
    if (Math.hypot(tx + 38, tz + 62) < 8.5) continue;
    if (Math.hypot(tx - 32, tz + 68) < 8.5) continue;
    const scale = 0.9 + ((i * 29) % 10) * 0.12 + (band >= 2 ? 0.35 : 0);
    treePositions.push([tx, groundHeightAt(tx, tz, 0), tz, scale]);
  }
  // Extra lush foreground right-side trees (matching the bright green foliage entering from right edge of photo!)
  for (const [tx, tz, sc] of [
    [39.5, 16.5, 1.45],
    [43.0, 9.5, 1.6],
    [44.5, 2.5, 1.55],
    [42.0, 22.0, 1.25],
    [-42.5, 15.0, 1.35],
    [-45.0, 6.0, 1.5],
  ]) {
    treePositions.push([tx, groundHeightAt(tx, tz, 0), tz, sc]);
  }

  // Helper: organically perturb icosahedron vertices so canopies read as natural bumpy Lingnan crowns, never smooth balls!
  const makeOrganicCrownGeo = (radius: number, seed: number): THREE.BufferGeometry => {
    const g = new THREE.IcosahedronGeometry(radius, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const dir = v.clone().normalize();
      const bump =
        1.0 +
        0.22 * Math.sin(dir.x * 5.2 + seed) * Math.cos(dir.z * 4.7 + seed * 0.7) +
        0.16 * Math.sin(dir.y * 6.5 - dir.x * 3.8 + seed * 1.3) +
        0.09 * Math.cos((dir.x + dir.y + dir.z) * 9.0 + seed);
      // Flatten underside slightly like real camphor/lychee crowns
      const ySquash = dir.y < 0 ? 0.72 : 0.94;
      pos.setXYZ(i, v.x * bump, v.y * bump * ySquash, v.z * bump);
    }
    g.computeVertexNormals();
    return trackGeo(g);
  };

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.36, 3.8, 7));
  const crownGeoA = makeOrganicCrownGeo(2.35, 1.1);
  const crownGeoB = makeOrganicCrownGeo(1.9, 3.7);
  const crownGeoC = makeOrganicCrownGeo(1.55, 6.4);

  const trunkInst = new THREE.InstancedMesh(trunkGeo, mats.darkTimber, treePositions.length);
  const crownInstDeep = new THREE.InstancedMesh(crownGeoA, mats.foliageDeep, treePositions.length);
  const crownInstMid = new THREE.InstancedMesh(crownGeoB, mats.foliageMid, treePositions.length * 2);
  const crownInstBright = new THREE.InstancedMesh(crownGeoC, mats.foliageBright, treePositions.length);

  treePositions.forEach(([tx, ty, tz, sc], idx) => {
    const yaw = idx * 1.31;
    dummy.position.set(tx, ty + 1.8 * sc, tz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    // Base deep canopy body
    dummy.position.set(tx, ty + 4.0 * sc, tz);
    dummy.rotation.set((idx % 3 - 1) * 0.14, yaw, (idx % 2) * 0.12);
    dummy.scale.set(sc * 1.25, sc * 0.88, sc * 1.18);
    dummy.updateMatrix();
    crownInstDeep.setMatrixAt(idx, dummy.matrix);

    // Two offset mid-tone irregular crown lobes for rich branching silhouette
    dummy.position.set(tx + Math.cos(yaw) * 1.15 * sc, ty + 4.7 * sc, tz + Math.sin(yaw) * 1.15 * sc);
    dummy.rotation.set(0.18, yaw + 1.1, -0.14);
    dummy.scale.set(sc * 0.96, sc * 0.82, sc * 0.92);
    dummy.updateMatrix();
    crownInstMid.setMatrixAt(idx * 2, dummy.matrix);

    dummy.position.set(tx - Math.sin(yaw) * 1.05 * sc, ty + 4.35 * sc, tz + Math.cos(yaw) * 1.05 * sc);
    dummy.rotation.set(-0.15, yaw + 2.4, 0.16);
    dummy.scale.set(sc * 0.88, sc * 0.76, sc * 0.94);
    dummy.updateMatrix();
    crownInstMid.setMatrixAt(idx * 2 + 1, dummy.matrix);

    // Sunlit upper-crown foliage crest
    dummy.position.set(tx - Math.cos(yaw) * 0.65 * sc, ty + 5.25 * sc, tz - Math.sin(yaw) * 0.65 * sc);
    dummy.rotation.set(0.12, yaw + 3.8, 0.1);
    dummy.scale.set(sc * 0.85, sc * 0.72, sc * 0.85);
    dummy.updateMatrix();
    crownInstBright.setMatrixAt(idx, dummy.matrix);
  });
  trunkInst.instanceMatrix.needsUpdate = true;
  crownInstDeep.instanceMatrix.needsUpdate = true;
  crownInstMid.instanceMatrix.needsUpdate = true;
  crownInstBright.instanceMatrix.needsUpdate = true;
  root.add(trunkInst, crownInstDeep, crownInstMid, crownInstBright);

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
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
    },
  };
}
