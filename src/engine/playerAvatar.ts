import * as THREE from 'three';
import {
  attachSubsurfaceShader,
  getWoodcarveMicroMaps,
  HANDCRAFTED_PAL,
  type MaterialLibrary,
} from './proceduralTextures';
import { createSoftPillowGeometry, createTurnedLatheGeometry } from './sculptHelpers';

export interface PlayerAvatarRefs {
  root: THREE.Group;
  umbrellaInHand: THREE.Group;
  update: (
    dt: number,
    horizSpeed: number,
    isSprinting: boolean,
    walkPhase: number,
    turnRate: number,
    holdingUmbrella: boolean,
    timeSec: number
  ) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

/**
 * Builds the handcrafted playable 3D Hakka traveler avatar for GTA third-person exploration.
 * Matches the carved-wood / gouache picture-book aesthetic of livingWorldBuilder.ts with:
 * - Turned azure/indigo traveler tunic with vermilion trim & waist sash
 * - Articulated arms, legs, head with warm SSS skin & traditional topknot/band
 * - Slung bamboo traveler straw hat (斗笠) on the back (iconic silhouette from behind!)
 * - Soft radial contact shadow disc grounded at bottom-center (y = 0)
 * - Right-hand oil-paper umbrella mount synchronized with holdingUmbrella state
 */
export function buildPlayerAvatar(
  mats: MaterialLibrary,
  isSoftwareGl: boolean
): PlayerAvatarRefs {
  const root = new THREE.Group();
  root.name = 'PlayerTravelerAvatar';

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

  const woodMicro = getWoodcarveMicroMaps();

  const clothMat = (hex: number, sheenHex: number, rough = 0.82) =>
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: hex,
        normalMap: woodMicro.normal,
        normalScale: new THREE.Vector2(0.12, 0.12),
        roughnessMap: woodMicro.roughness,
        roughness: rough,
        metalness: 0.0,
        sheen: 0.5,
        sheenRoughness: 0.68,
        sheenColor: new THREE.Color(sheenHex),
      })
    );

  const woodPaintMat = (hex: number, rough = 0.74, metal = 0.04) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: hex,
        normalMap: woodMicro.normal,
        normalScale: new THREE.Vector2(0.14, 0.14),
        roughnessMap: woodMicro.roughness,
        roughness: rough,
        metalness: metal,
      })
    );

  const skinMat = attachSubsurfaceShader(
    trackMat(
      new THREE.MeshStandardMaterial({
        color: HANDCRAFTED_PAL.skin,
        normalMap: woodMicro.normal,
        normalScale: new THREE.Vector2(0.08, 0.08),
        roughness: 0.64,
        metalness: 0.0,
      })
    ),
    {
      key: 'player_avatar_skin',
      tintHex: 0xf8ad8a,
      backStrength: 0.34,
      wrapStrength: 0.25,
      power: 2.8,
    }
  );

  // Distinct, easy-to-read traveler palette against warm cream walls & slate stone
  const coatMat = clothMat(0x285686, 0x7cb4e4, 0.8); // Indigo-cerulean Hakka traveler coat
  const trimMat = clothMat(0xc9422c, 0xf29f7e, 0.72); // Cinnabar sash & lapel accent
  const trouserMat = clothMat(0x232a38, 0x526178, 0.86); // Deep ink trousers
  const shoeMat = woodPaintMat(0x1f1b18, 0.56);
  const hairMat = woodPaintMat(0x20222c, 0.52);
  const goldMat = woodPaintMat(0xe2b14c, 0.28, 0.72);
  const strawMat = woodPaintMat(0xe8cb82, 0.8);
  const strawRimMat = woodPaintMat(0xc0954b, 0.74);
  const eyeMat = woodPaintMat(0x1c1d24, 0.35);

  // Ground contact shadow disc (prevents floating look)
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sctx = shadowCanvas.getContext('2d');
  if (sctx) {
    const grad = sctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(12, 16, 24, 0.52)');
    grad.addColorStop(0.65, 'rgba(12, 16, 24, 0.22)');
    grad.addColorStop(1, 'rgba(12, 16, 24, 0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 64, 64);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowGeo = trackGeo(new THREE.CircleGeometry(0.46, 18));
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.88,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  // Articulated body container (supports stride bob & turn banking)
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Legs (pivoted at hip y = 0.68)
  const legGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.055, -0.62],
        [0.072, -0.34],
        [0.088, -0.06],
        [0.078, 0.02],
      ],
      12
    )
  );
  const shoeGeo = trackGeo(createSoftPillowGeometry(0.085, 0.055, 0.14, 10, 8));

  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0.68, 0);
    const legMesh = new THREE.Mesh(legGeo, trouserMat);
    legMesh.castShadow = castShadow;
    hip.add(legMesh);

    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.63, -0.035); // -Z is forward
    shoe.castShadow = castShadow;
    hip.add(shoe);

    bodyPivot.add(hip);
    return hip;
  };
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // Torso & Hakka coat (pivoted at waist y = 0.68)
  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 0.68;
  bodyPivot.add(torsoPivot);

  const coatGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.01, -0.06],
        [0.275, -0.06],
        [0.26, 0.06],
        [0.22, 0.24],
        [0.235, 0.44],
        [0.205, 0.57],
        [0.12, 0.62],
        [0.0, 0.62],
      ],
      18
    )
  );
  const coatMesh = new THREE.Mesh(coatGeo, coatMat);
  coatMesh.castShadow = castShadow;
  coatMesh.receiveShadow = true;
  torsoPivot.add(coatMesh);

  // Cinnabar waist sash + jade pendant
  const sashGeo = trackGeo(new THREE.TorusGeometry(0.228, 0.036, 10, 22));
  sashGeo.rotateX(Math.PI * 0.5);
  const sashMesh = new THREE.Mesh(sashGeo, trimMat);
  sashMesh.position.y = 0.21;
  sashMesh.castShadow = castShadow;
  torsoPivot.add(sashMesh);

  const sashTailGeo = trackGeo(createSoftPillowGeometry(0.055, 0.16, 0.022, 8, 6));
  const sashTail = new THREE.Mesh(sashTailGeo, trimMat);
  sashTail.position.set(0.14, 0.08, 0.18);
  sashTail.rotation.z = -0.18;
  torsoPivot.add(sashTail);

  const collarGeo = trackGeo(new THREE.TorusGeometry(0.125, 0.026, 8, 18));
  collarGeo.rotateX(Math.PI * 0.5);
  const collarMesh = new THREE.Mesh(collarGeo, trimMat);
  collarMesh.position.y = 0.59;
  torsoPivot.add(collarMesh);

  // Iconic Bamboo Traveler Hat (斗笠) slung across the back (distinctive silhouette & detail!)
  const douliGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.37, 0.0],
        [0.3, 0.045],
        [0.19, 0.105],
        [0.075, 0.155],
        [0.02, 0.185],
        [0.0, 0.195],
      ],
      20
    )
  );
  const hatGroup = new THREE.Group();
  hatGroup.position.set(0.01, 0.37, 0.215);
  hatGroup.rotation.set(Math.PI * 0.45, 0, 0.14);
  hatGroup.scale.setScalar(0.62);
  const hatCrown = new THREE.Mesh(douliGeo, strawMat);
  hatCrown.castShadow = castShadow;
  hatGroup.add(hatCrown);
  const hatRimGeo = trackGeo(new THREE.TorusGeometry(0.365, 0.016, 8, 22));
  hatRimGeo.rotateX(Math.PI * 0.5);
  const hatRim = new THREE.Mesh(hatRimGeo, strawRimMat);
  hatGroup.add(hatRim);
  const hatCordGeo = trackGeo(new THREE.TorusGeometry(0.12, 0.012, 6, 14));
  hatCordGeo.rotateX(Math.PI * 0.5);
  const hatCord = new THREE.Mesh(hatCordGeo, trimMat);
  hatCord.position.y = 0.13;
  hatGroup.add(hatCord);
  torsoPivot.add(hatGroup);

  // Arms (pivoted at shoulders y = 0.52 relative to torsoPivot)
  const sleeveGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.068, 0.0],
        [0.082, -0.1],
        [0.072, -0.32],
        [0.084, -0.46],
        [0.042, -0.49],
      ],
      12
    )
  );
  const handGeo = trackGeo(new THREE.SphereGeometry(0.056, 10, 8));

  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.245, 0.51, 0);
    const sleeve = new THREE.Mesh(sleeveGeo, coatMat);
    sleeve.castShadow = castShadow;
    shoulder.add(sleeve);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -0.5;
    shoulder.add(hand);

    torsoPivot.add(shoulder);
    return shoulder;
  };
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Oil-Paper Umbrella attached to right hand (visible when holdingUmbrella === true)
  const umbrellaInHand = new THREE.Group();
  umbrellaInHand.position.set(0.02, -0.48, -0.05);
  umbrellaInHand.rotation.set(-0.22, 0, -0.1);
  const umbPoleGeo = trackGeo(new THREE.CylinderGeometry(0.014, 0.016, 1.15, 8));
  const umbPole = new THREE.Mesh(umbPoleGeo, mats.darkTimber);
  umbPole.position.y = 0.48;
  umbPole.castShadow = castShadow;
  umbrellaInHand.add(umbPole);

  const umbCanopyGeo = trackGeo(new THREE.ConeGeometry(0.68, 0.24, 14, 1, true));
  const umbCanopyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9422c,
      roughness: 0.44,
      side: THREE.DoubleSide,
    })
  );
  const umbCanopy = new THREE.Mesh(umbCanopyGeo, umbCanopyMat);
  umbCanopy.position.y = 1.02;
  umbCanopy.castShadow = castShadow;
  umbrellaInHand.add(umbCanopy);
  umbrellaInHand.visible = false;
  rightArm.add(umbrellaInHand);

  // Head & Hair (pivoted at neck y = 0.65 relative to torsoPivot -> world y ~ 1.48)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.77, 0);
  torsoPivot.add(headPivot);

  const headGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0, -0.175],
        [0.085, -0.165],
        [0.145, -0.11],
        [0.172, -0.02],
        [0.17, 0.08],
        [0.138, 0.15],
        [0.072, 0.184],
        [0.0, 0.194],
      ],
      16
    )
  );
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = castShadow;
  headPivot.add(headMesh);

  // Hair cap + topknot bun + antique gold hairpin
  const hairCapGeo = trackGeo(
    new THREE.SphereGeometry(0.178, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56)
  );
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.position.set(0, 0.025, 0.015);
  hairCap.rotation.x = 0.14;
  headPivot.add(hairCap);

  const bunGeo = trackGeo(new THREE.SphereGeometry(0.068, 12, 10));
  const bun = new THREE.Mesh(bunGeo, hairMat);
  bun.position.set(0, 0.21, 0.025);
  bun.castShadow = castShadow;
  headPivot.add(bun);

  const pinGeo = trackGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.19, 8));
  pinGeo.rotateZ(Math.PI * 0.5);
  const pin = new THREE.Mesh(pinGeo, goldMat);
  pin.position.set(0, 0.21, 0.025);
  headPivot.add(pin);

  // Expressive eyes on -Z face (visible when walking toward camera or pressing Look-Back!)
  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.018, 8, 8));
  for (const sx of [-0.058, 0.058]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx, 0.015, -0.156);
    headPivot.add(eye);
  }

  let currentLeanZ = 0;
  let currentPitchX = 0;

  return {
    root,
    umbrellaInHand,
    update: (dt, horizSpeed, isSprinting, walkPhase, turnRate, holdingUmbrella, timeSec) => {
      umbrellaInHand.visible = holdingUmbrella;

      const strideNorm = Math.min(1.25, horizSpeed / 5.4);
      const isMoving = horizSpeed > 0.15;

      // Leg & arm gait swing synchronized to walkPhase (distance-driven, zero skating!)
      const legAmp = isMoving ? (isSprinting ? 0.68 : 0.48) * Math.min(1, strideNorm) : 0;
      const armAmp = isMoving ? (isSprinting ? 0.62 : 0.42) * Math.min(1, strideNorm) : 0;

      const targetLeftLeg = Math.sin(walkPhase) * legAmp;
      const targetRightLeg = -Math.sin(walkPhase) * legAmp;
      const targetLeftArm = -Math.sin(walkPhase) * armAmp;
      const targetRightArm = holdingUmbrella ? -0.58 : Math.sin(walkPhase) * armAmp;

      const limbSmooth = 1 - Math.exp(-16 * dt);
      leftLeg.rotation.x += (targetLeftLeg - leftLeg.rotation.x) * limbSmooth;
      rightLeg.rotation.x += (targetRightLeg - rightLeg.rotation.x) * limbSmooth;
      leftArm.rotation.x += (targetLeftArm - leftArm.rotation.x) * limbSmooth;
      rightArm.rotation.x += (targetRightArm - rightArm.rotation.x) * limbSmooth;

      // Subtle lateral arm clearance while moving
      leftArm.rotation.z = 0.08 + strideNorm * 0.06;
      rightArm.rotation.z = holdingUmbrella ? -0.08 : -0.08 - strideNorm * 0.06;

      // Vertical stride bounce + idle breathing
      const strideBob = isMoving
        ? Math.abs(Math.sin(walkPhase)) * (isSprinting ? 0.065 : 0.04) * Math.min(1, strideNorm)
        : Math.sin(timeSec * 2.1) * 0.01;
      bodyPivot.position.y = strideBob;

      // Forward sprint lean & GTA-style turn banking
      const targetPitchX = isMoving ? (isSprinting ? -0.14 : -0.06) * Math.min(1, strideNorm) : 0;
      const targetLeanZ = THREE.MathUtils.clamp(-turnRate * 0.08, -0.16, 0.16);
      currentPitchX = THREE.MathUtils.damp(currentPitchX, targetPitchX, 10, dt);
      currentLeanZ = THREE.MathUtils.damp(currentLeanZ, targetLeanZ, 10, dt);
      torsoPivot.rotation.x = currentPitchX;
      bodyPivot.rotation.z = currentLeanZ;

      // Subtle head sway / breathing counterbalance
      headPivot.rotation.x = -currentPitchX * 0.55;
      headPivot.rotation.y = THREE.MathUtils.clamp(turnRate * 0.12, -0.3, 0.3);
    },
    setVisible: (visible: boolean) => {
      root.visible = visible;
    },
    dispose: () => {
      shadowTex.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
