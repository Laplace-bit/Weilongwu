import * as THREE from 'three';
import { HANDCRAFTED_PAL, type MaterialLibrary } from './proceduralTextures';
import { createSoftPillowGeometry, createTurnedLatheGeometry } from './sculptHelpers';
import {
  buildArticulatedArm,
  buildArticulatedLeg,
  buildHakkaLapelAndSash,
  createCraftFabricMat,
  createCraftSkinMat,
  createCraftStrawMat,
  createPleatedRobeGeometry,
  damp,
  populateCraftFace,
  Spring1D,
  VIRTUAL_MASS,
} from './characterCraft';

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
 * High-craft playable 3D Hakka traveler avatar guided by `cinematic-slide-craft`:
 * - Pleated woven indigo Hakka coat with diagonal lapel, frog buttons (盘扣), & layered cinnabar sash
 * - Sculpted facial contours (jawline, cheekbones, nose bridge, eyebrows, glossy catchlight eyes, ears, smile)
 * - 2-segment articulated arms (shoulder + elbow + flared cuffs) & legs (hip + knee + cloth shoes)
 * - Virtual-mass spring secondary motion on dangling sash tails & slung bamboo traveler hat (斗笠)
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

  // Calibrated PBR tactile materials (woven fabric sheen, SSS skin, glossy iris, woven straw)
  const skinMat = createCraftSkinMat('player_avatar_skin_v2', trackMat, HANDCRAFTED_PAL.skin);
  const coatMat = createCraftFabricMat(0x275482, 0x88bce8, trackMat, 0.82, 0.62);
  const trimMat = createCraftFabricMat(0xc8432d, 0xf2a182, trackMat, 0.74, 0.56);
  const trouserMat = createCraftFabricMat(0x232b3b, 0x586882, trackMat, 0.86, 0.42);
  const shoeMat = createCraftFabricMat(0x1f1d1b, 0x45403b, trackMat, 0.72, 0.35);
  const soleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe7dec8, roughness: 0.9 }));
  const hairMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1c1e28,
      roughness: 0.42,
      clearcoat: 0.25,
      clearcoatRoughness: 0.45,
    })
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe6b952, roughness: 0.26, metalness: 0.78 })
  );
  const jadeMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x4ea07c,
      roughness: 0.22,
      clearcoat: 0.7,
      clearcoatRoughness: 0.16,
    })
  );
  const strawMat = createCraftStrawMat(0xe7c980, trackMat, 0.78);
  const strawRimMat = createCraftStrawMat(0xbe9046, trackMat, 0.72);
  const eyeIrisMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x161820,
      roughness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    })
  );
  const scleraMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf7f2e8, roughness: 0.32 }));
  const catchlightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const cheekMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xeb9484, roughness: 0.74 }));
  const lipMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xc96c5d, roughness: 0.58 }));

  // Soft radial ground contact shadow
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
      opacity: 0.86,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  // Articulated body container (supports stride bob & turn banking)
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // 2-Segment Articulated Legs (hip -> knee -> ankle + Hakka cloth shoes)
  const leftLeg = buildArticulatedLeg({
    side: -1,
    hipPos: [-0.105, 0.70, 0],
    thighLen: 0.34,
    calfLen: 0.35,
    faceSign: -1,
    trouserMat,
    shoeMat,
    soleMat,
    trackGeo,
    castShadow,
  });
  const rightLeg = buildArticulatedLeg({
    side: 1,
    hipPos: [0.105, 0.70, 0],
    thighLen: 0.34,
    calfLen: 0.35,
    faceSign: -1,
    trouserMat,
    shoeMat,
    soleMat,
    trackGeo,
    castShadow,
  });
  bodyPivot.add(leftLeg.hip, rightLeg.hip);

  // Torso & Pleated Hakka Traveler Coat (pivoted at waist y = 0.70)
  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 0.70;
  bodyPivot.add(torsoPivot);

  const coatGeo = trackGeo(
    createPleatedRobeGeometry(
      [
        [0.01, -0.14],
        [0.275, -0.14],
        [0.255, 0.02],
        [0.205, 0.21],
        [0.232, 0.43],
        [0.205, 0.56],
        [0.118, 0.61],
        [0.0, 0.61],
      ],
      22,
      10,
      0.011
    )
  );
  const coatMesh = new THREE.Mesh(coatGeo, coatMat);
  coatMesh.castShadow = castShadow;
  coatMesh.receiveShadow = true;
  torsoPivot.add(coatMesh);

  // Layered Hakka diagonal lapel, frog buttons, waist sash & physics-swayed sash tails
  const { sashTailL, sashTailR } = buildHakkaLapelAndSash({
    parent: torsoPivot,
    faceSign: -1,
    waistY: 0.21,
    chestY: 0.44,
    radius: 0.218,
    trimMat,
    buttonMat: goldMat,
    trackGeo,
    castShadow,
  });

  // Carved jade waist pendant hanging beside the sash knot
  const jadeDisc = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.026, 0.009, 8, 16)), jadeMat);
  jadeDisc.position.set(-0.11, 0.14, -0.20);
  torsoPivot.add(jadeDisc);

  // Iconic Bamboo Traveler Hat (斗笠) slung across the back with spring-swayed pivot
  const hatPivot = new THREE.Group();
  hatPivot.position.set(0.01, 0.37, 0.215);
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
      22
    )
  );
  const hatGroup = new THREE.Group();
  hatGroup.rotation.set(Math.PI * 0.45, 0, 0.12);
  hatGroup.scale.setScalar(0.62);
  const hatCrown = new THREE.Mesh(douliGeo, strawMat);
  hatCrown.castShadow = castShadow;
  hatGroup.add(hatCrown);
  const hatRimGeo = trackGeo(new THREE.TorusGeometry(0.365, 0.016, 8, 22));
  hatRimGeo.rotateX(Math.PI * 0.5);
  hatGroup.add(new THREE.Mesh(hatRimGeo, strawRimMat));
  const hatCordGeo = trackGeo(new THREE.TorusGeometry(0.12, 0.013, 6, 14));
  hatCordGeo.rotateX(Math.PI * 0.5);
  const hatCord = new THREE.Mesh(hatCordGeo, trimMat);
  hatCord.position.y = 0.13;
  hatGroup.add(hatCord);
  hatPivot.add(hatGroup);
  torsoPivot.add(hatPivot);

  // 2-Segment Articulated Arms (shoulder + elbow + flared sleeve cuffs + hands)
  const leftArm = buildArticulatedArm({
    side: -1,
    shoulderPos: [-0.242, 0.51, 0],
    upperLen: 0.24,
    lowerLen: 0.24,
    sleeveMat: coatMat,
    cuffMat: trimMat,
    skinMat,
    trackGeo,
    castShadow,
  });
  const rightArm = buildArticulatedArm({
    side: 1,
    shoulderPos: [0.242, 0.51, 0],
    upperLen: 0.24,
    lowerLen: 0.24,
    sleeveMat: coatMat,
    cuffMat: trimMat,
    skinMat,
    trackGeo,
    castShadow,
  });
  torsoPivot.add(leftArm.shoulder, rightArm.shoulder);

  // Oil-Paper Umbrella attached cleanly to right forearm/hand
  const umbrellaInHand = new THREE.Group();
  umbrellaInHand.position.set(0.01, -0.02, -0.04);
  umbrellaInHand.rotation.set(-0.24, 0, -0.08);
  const umbPoleGeo = trackGeo(new THREE.CylinderGeometry(0.014, 0.016, 1.18, 8));
  const umbPole = new THREE.Mesh(umbPoleGeo, mats.darkTimber);
  umbPole.position.y = 0.50;
  umbPole.castShadow = castShadow;
  umbrellaInHand.add(umbPole);

  const umbCanopyGeo = trackGeo(new THREE.ConeGeometry(0.70, 0.25, 16, 1, true));
  const umbCanopyMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xc9422c,
      roughness: 0.42,
      clearcoat: 0.32,
      clearcoatRoughness: 0.32,
      side: THREE.DoubleSide,
    })
  );
  const umbCanopy = new THREE.Mesh(umbCanopyGeo, umbCanopyMat);
  umbCanopy.position.y = 1.05;
  umbCanopy.castShadow = castShadow;
  umbrellaInHand.add(umbCanopy);
  umbrellaInHand.visible = false;
  rightArm.hand.add(umbrellaInHand);

  // Sculpted Head & Hair (pivoted at neck y = 0.77 relative to torsoPivot)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.77, 0);
  torsoPivot.add(headPivot);

  populateCraftFace(headPivot, {
    faceSign: -1,
    skinMat,
    hairMat,
    cheekMat,
    lipMat,
    eyeIrisMat,
    scleraMat,
    catchlightMat,
    trackGeo,
    castShadow,
  });

  // Layered hair cap, sideburn locks, topknot bun & gold hairpin
  const hairCapGeo = trackGeo(
    new THREE.SphereGeometry(0.168, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58)
  );
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.position.set(0, 0.028, 0.016);
  hairCap.rotation.x = 0.16;
  headPivot.add(hairCap);

  const backHair = new THREE.Mesh(
    trackGeo(createSoftPillowGeometry(0.135, 0.11, 0.075, 10, 8)),
    hairMat
  );
  backHair.position.set(0, -0.02, 0.105);
  headPivot.add(backHair);

  const bun = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.064, 12, 10)), hairMat);
  bun.position.set(0, 0.205, 0.025);
  bun.castShadow = castShadow;
  headPivot.add(bun);

  const hairBand = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.064, 0.011, 6, 14)), trimMat);
  hairBand.rotation.x = Math.PI * 0.5;
  hairBand.position.set(0, 0.175, 0.025);
  headPivot.add(hairBand);

  const pinGeo = trackGeo(new THREE.CylinderGeometry(0.0075, 0.0075, 0.19, 8));
  pinGeo.rotateZ(Math.PI * 0.5);
  const pin = new THREE.Mesh(pinGeo, goldMat);
  pin.position.set(0, 0.205, 0.025);
  headPivot.add(pin);

  // Secondary spring-physics states (cinematic-slide-craft Virtual Mass Layering)
  let currentLeanZ = 0;
  let currentPitchX = 0;
  let currentHeadYaw = 0;
  const sashSpringX = new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping);
  const sashSpringZ = new Spring1D(0, VIRTUAL_MASS.clothStiffness, VIRTUAL_MASS.clothDamping);
  const hatSpring = new Spring1D(0, 95, 11);

  return {
    root,
    umbrellaInHand,
    update: (dt, horizSpeed, isSprinting, walkPhase, turnRate, holdingUmbrella, timeSec) => {
      umbrellaInHand.visible = holdingUmbrella;

      const strideNorm = Math.min(1.25, horizSpeed / 5.2);
      const isMoving = horizSpeed > 0.15;

      // 2-Segment Leg & Knee Gait Articulation (natural knee flex on rear swing & lift!)
      const legAmp = isMoving ? (isSprinting ? 0.66 : 0.46) * Math.min(1, strideNorm) : 0;
      const armAmp = isMoving ? (isSprinting ? 0.58 : 0.40) * Math.min(1, strideNorm) : 0;

      const sinP = Math.sin(walkPhase);
      const targetLeftHip = sinP * legAmp;
      const targetRightHip = -sinP * legAmp;
      // Knees bend backward (+X rotation since avatar faces -Z!) during leg swing recovery
      const targetLeftKnee = isMoving ? Math.max(0, -Math.cos(walkPhase)) * (isSprinting ? 0.72 : 0.44) * Math.min(1, strideNorm) : 0.04;
      const targetRightKnee = isMoving ? Math.max(0, Math.cos(walkPhase)) * (isSprinting ? 0.72 : 0.44) * Math.min(1, strideNorm) : 0.04;

      const targetLeftShoulder = -sinP * armAmp;
      const targetRightShoulder = holdingUmbrella ? -0.54 : sinP * armAmp;
      // Elbows bend naturally forward (-X since -Z is forward)
      const targetLeftElbow = isMoving ? -(0.22 + Math.max(0, -sinP) * (isSprinting ? 0.58 : 0.34)) : -0.14;
      const targetRightElbow = holdingUmbrella
        ? -0.68
        : isMoving
          ? -(0.22 + Math.max(0, sinP) * (isSprinting ? 0.58 : 0.34))
          : -0.14;

      leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, targetLeftHip, VIRTUAL_MASS.limbLambda, dt);
      rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, targetRightHip, VIRTUAL_MASS.limbLambda, dt);
      leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, targetLeftKnee, VIRTUAL_MASS.limbLambda, dt);
      rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, targetRightKnee, VIRTUAL_MASS.limbLambda, dt);

      leftArm.shoulder.rotation.x = damp(leftArm.shoulder.rotation.x, targetLeftShoulder, VIRTUAL_MASS.limbLambda, dt);
      rightArm.shoulder.rotation.x = damp(rightArm.shoulder.rotation.x, targetRightShoulder, VIRTUAL_MASS.limbLambda, dt);
      leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, targetLeftElbow, VIRTUAL_MASS.limbLambda, dt);
      rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, targetRightElbow, VIRTUAL_MASS.limbLambda, dt);

      leftArm.shoulder.rotation.z = 0.07 + strideNorm * 0.06;
      rightArm.shoulder.rotation.z = holdingUmbrella ? -0.08 : -0.07 - strideNorm * 0.06;

      // Vertical stride bounce + subtle torso breathing scale
      const breath = Math.sin(timeSec * 2.15);
      const strideBob = isMoving
        ? Math.abs(sinP) * (isSprinting ? 0.062 : 0.038) * Math.min(1, strideNorm)
        : breath * 0.008;
      bodyPivot.position.y = strideBob;
      coatMesh.scale.set(1 + breath * 0.008, 1, 1 + breath * 0.012);

      // Forward sprint lean, counter-twist torso yaw, & GTA turn banking
      const targetPitchX = isMoving ? (isSprinting ? -0.13 : -0.055) * Math.min(1, strideNorm) : 0;
      const targetLeanZ = THREE.MathUtils.clamp(-turnRate * 0.08, -0.15, 0.15);
      currentPitchX = damp(currentPitchX, targetPitchX, VIRTUAL_MASS.torsoLambda, dt);
      currentLeanZ = damp(currentLeanZ, targetLeanZ, VIRTUAL_MASS.torsoLambda, dt);
      torsoPivot.rotation.x = currentPitchX;
      torsoPivot.rotation.y = isMoving ? sinP * 0.08 * Math.min(1, strideNorm) : 0;
      bodyPivot.rotation.z = currentLeanZ;

      // Smooth head counterbalance & lead-turn
      currentHeadYaw = damp(
        currentHeadYaw,
        THREE.MathUtils.clamp(turnRate * 0.14, -0.32, 0.32),
        VIRTUAL_MASS.headLambda,
        dt
      );
      headPivot.rotation.x = -currentPitchX * 0.55 + breath * 0.015;
      headPivot.rotation.y = currentHeadYaw;

      // Secondary spring-physics sway on sash tails & back-slung bamboo Douli hat
      const sashTargetX = isMoving ? 0.18 * Math.min(1.2, strideNorm) + Math.abs(sinP) * 0.12 : Math.sin(timeSec * 1.4) * 0.04;
      const sashTargetZ = THREE.MathUtils.clamp(turnRate * 0.16, -0.32, 0.32) + Math.cos(timeSec * 1.8) * 0.03;
      const sx = sashSpringX.step(sashTargetX, dt);
      const sz = sashSpringZ.step(sashTargetZ, dt);
      sashTailL.rotation.set(sx, 0, sz - 0.08);
      sashTailR.rotation.set(sx * 0.85, 0, sz + 0.12);

      const hatBounce = hatSpring.step(
        isMoving ? -0.06 * Math.abs(sinP) * Math.min(1, strideNorm) : Math.sin(timeSec * 1.6) * 0.015,
        dt
      );
      hatPivot.rotation.x = hatBounce;
      hatPivot.rotation.z = sz * 0.38;
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
