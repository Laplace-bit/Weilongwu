import * as THREE from 'three';
import {
  createCuppedPetalGeometry,
  createTaperedCurveGeometry,
  createTurnedLatheGeometry,
} from './sculptHelpers';
import type { HwameiAnimState } from './hwameiSongEngine';

export interface HwameiBirdRig {
  group: THREE.Group;
  update: (timeSec: number, dt: number, anim: HwameiAnimState) => void;
  dispose: () => void;
}

/**
 * Generates high-detail 512x512 procedural dorsal/crown plumage texture for Chinese Hwamei
 * (中华画眉鸟, Garrulax canorus): warm olive-russet & golden-brown imbricated feathers
 * with fine dark sepia-umber shaft streaks along crown and mantle.
 */
function createDorsalPlumageTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Rich warm olive-brown / chestnut-tawny gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#785224'); // warm russet-olive crown
  grad.addColorStop(0.30, '#89602c'); // warm olive-tawny mantle
  grad.addColorStop(0.65, '#966b34'); // tawny-olive back
  grad.addColorStop(0.88, '#a4773e'); // warm rump
  grad.addColorStop(1.0, '#b5894f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Fine velvety imbricated feather scallops
  for (let row = 0; row < 32; row++) {
    const y = row * 17;
    const xOffset = (row % 2) * 13;
    for (let col = -1; col < 22; col++) {
      const cx = col * 26 + xOffset;
      ctx.beginPath();
      ctx.ellipse(cx, y, 13.5, 9.5, 0, 0, Math.PI);
      ctx.fillStyle = row % 3 === 0 ? 'rgba(184, 140, 78, 0.14)' : 'rgba(92, 60, 24, 0.13)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(218, 178, 114, 0.20)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }
  }

  // Fine dark sepia-umber longitudinal shaft streaks (细密暗色羽轴纵纹)
  for (let i = 0; i < 380; i++) {
    const sx = (i * 97 + (i % 7) * 13) % 512;
    const sy = (i * 53 + (i % 11) * 17) % 465;
    const len = 14 + (i % 20);
    const w = 1.2 + (i % 3) * 0.45;
    const darkness = sy < 260 ? 0.48 : 0.30;
    ctx.fillStyle = `rgba(38, 22, 9, ${darkness})`;
    ctx.fillRect(sx, sy, w, len);
    ctx.fillStyle = 'rgba(228, 190, 128, 0.20)';
    ctx.fillRect(sx + w + 0.4, sy + 1.5, 0.9, len * 0.78);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Generates procedural throat, breast & belly plumage texture:
 * rich warm golden-ochre/tawny throat & chest with delicate chestnut streaks,
 * warming along the flanks and lightening softly toward the creamy-buff center belly.
 */
function createVentralPlumageTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#a27438'); // blends seamlessly with warm olive-tawny upper chest & neck
  grad.addColorStop(0.36, '#b88848'); // warm golden-tawny breast
  grad.addColorStop(0.72, '#caa065'); // soft tawny-buff lower breast
  grad.addColorStop(1.0, '#d8be8f'); // gentle warm pale-buff center belly (no harsh patch edge)
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle warm rufous-tawny flank shading along outer sides
  const flankL = ctx.createLinearGradient(0, 0, 130, 0);
  flankL.addColorStop(0, 'rgba(148, 92, 38, 0.36)');
  flankL.addColorStop(1, 'rgba(148, 92, 38, 0.0)');
  ctx.fillStyle = flankL;
  ctx.fillRect(0, 0, 130, 512);

  const flankR = ctx.createLinearGradient(512, 0, 382, 0);
  flankR.addColorStop(0, 'rgba(148, 92, 38, 0.36)');
  flankR.addColorStop(1, 'rgba(148, 92, 38, 0.0)');
  ctx.fillStyle = flankR;
  ctx.fillRect(382, 0, 130, 512);

  // Delicate fine chestnut throat & upper-breast streaks
  for (let i = 0; i < 210; i++) {
    const sx = (i * 83 + 17) % 512;
    const sy = (i * 47) % 300;
    const len = 12 + (i % 16);
    const alpha = Math.max(0.05, 0.28 * (1 - sy / 320));
    ctx.fillStyle = `rgba(92, 54, 18, ${alpha})`;
    ctx.fillRect(sx, sy, 1.35, len);
  }

  // Soft downy barb sheen
  for (let i = 0; i < 140; i++) {
    const sx = (i * 67) % 512;
    const sy = (i * 71) % 512;
    ctx.fillStyle = 'rgba(252, 242, 222, 0.14)';
    ctx.fillRect(sx, sy, 2.0, 11);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Generates procedural wing & tail flight-feather vane texture:
 * warm russet-olive outer webs, darker sepia inner webs & tips, central dark rachis,
 * fine barbules, and faint dusky transverse tail barring (authentic Hwamei hallmark).
 */
function createFlightFeatherTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#8d622f');
  grad.addColorStop(0.55, '#6e4921');
  grad.addColorStop(0.86, '#4c3215');
  grad.addColorStop(1.0, '#38230e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // Warm rufous outer-web glow vs darker inner web
  const webGrad = ctx.createLinearGradient(0, 0, 256, 0);
  webGrad.addColorStop(0.0, 'rgba(182, 126, 58, 0.32)');
  webGrad.addColorStop(0.46, 'rgba(130, 88, 38, 0.08)');
  webGrad.addColorStop(1.0, 'rgba(32, 18, 7, 0.30)');
  ctx.fillStyle = webGrad;
  ctx.fillRect(0, 0, 256, 512);

  // Faint dusky transverse bars (画眉尾羽与飞羽特有的微弱暗横斑)
  for (let y = 26; y < 490; y += 26) {
    ctx.fillStyle = 'rgba(30, 18, 7, 0.24)';
    ctx.fillRect(0, y, 256, 7.5);
  }

  // Fine oblique feather barbules radiating from central rachis
  ctx.strokeStyle = 'rgba(222, 182, 118, 0.14)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 6) {
    ctx.beginPath();
    ctx.moveTo(128, y);
    ctx.lineTo(12, y + 26);
    ctx.moveTo(128, y);
    ctx.lineTo(244, y + 26);
    ctx.stroke();
  }

  // Central dark horn-brown feather shaft
  ctx.fillStyle = 'rgba(40, 24, 11, 0.72)';
  ctx.fillRect(126, 0, 4, 512);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Builds an anatomically authentic, sleek sculptural 3D Chinese Hwamei songbird
 * (中华画眉鸟, Garrulax canorus) perched cleanly on the bamboo perch at `y = -1.20`
 * inside `birdcageGroup`.
 *
 * Sculpted to match real *Garrulax canorus* ornithology & songbird-syrinx proportions:
 * - Upright ~37° alert passerine stance with slender yellowish-horn tarsi & 4-toe perch grip
 * - Smooth ovoid torso with olive-russet streaked mantle, clean golden-buff breast & pale belly,
 *   seamless feathered neck transition, and inflatable singing throat/OEC sac
 * - Tightly folded, sleek sculpted wings hugging the flanks smoothly with shingled dark-tipped primaries
 * - Graceful long graduated rounded laughingthrush tail (7 shingled barred rectrices)
 * - Unmistakable snow-white periorbital eye-ring seamlessly flowing into a long sweeping
 *   curving snow-white eyebrow (白眼圈 + 长白眉纹) sitting cleanly proud of the sleek olive-brown skull
 * - Deep-set glossy amber-brown jewel eyes with crisp catchlight & animated blink
 * - Slender slightly decurved golden-ochre keratin bill with flush closed rest seal & hinged singing mandible
 */
export function buildHwameiBird(castShadow: boolean): HwameiBirdRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const dorsalTex = createDorsalPlumageTexture();
  const ventralTex = createVentralPlumageTexture();
  const flightTex = createFlightFeatherTexture();
  textures.push(dorsalTex, ventralTex, flightTex);

  const dorsalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: dorsalTex,
      roughness: 0.78,
      metalness: 0.0,
    })
  );
  const ventralMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: ventralTex,
      roughness: 0.82,
      metalness: 0.0,
    })
  );
  const throatMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd09e54,
      map: ventralTex,
      roughness: 0.82,
      metalness: 0.0,
    })
  );
  const wingCovertMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdcc094, // warm sunlit russet-olive tint without double-darkening dorsalTex
      map: dorsalTex,
      roughness: 0.78,
      metalness: 0.0,
    })
  );
  const flightFeatherMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: flightTex,
      roughness: 0.80,
      metalness: 0.0,
      side: THREE.DoubleSide,
    })
  );
  const whiteSpectacleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x2c2a22,
      emissiveIntensity: 0.28,
      roughness: 0.50,
      metalness: 0.0,
    })
  );
  const irisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c3614,
      roughness: 0.20,
      metalness: 0.06,
    })
  );
  const pupilMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x090809,
      roughness: 0.04,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    })
  );
  const catchlightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const beakBaseMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe0aa42, // warm golden horn-yellow keratin bill
      roughness: 0.32,
      metalness: 0.04,
    })
  );
  const beakTipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b5520, // dusky horn culmen & tip
      roughness: 0.36,
      metalness: 0.05,
    })
  );
  const oralCavityMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc96864,
      roughness: 0.58,
      metalness: 0.0,
    })
  );
  const legMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc69b56,
      roughness: 0.60,
      metalness: 0.02,
    })
  );
  const clawMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x352618,
      roughness: 0.42,
      metalness: 0.06,
    })
  );

  // Root anchored cleanly on bamboo perch centerline (birdcage local y = -1.20).
  // Posed in an iconic 3/4 profile facing toward Front Skywell so visitors clearly see
  // the snow-white eye-ring + sweeping eyebrow, decurved bill, sleek wing, and long tail!
  const group = new THREE.Group();
  group.position.set(0.0, -1.20, 0.0);
  group.rotation.y = -0.82;

  // =========================================================================
  // 1. SLENDER PERCHED LEGS, FEATHERED TIBIA & 4-TOE CLAW GRIP ON PERCH
  // =========================================================================
  const tarsusGeo = trackGeo(new THREE.CylinderGeometry(0.0040, 0.0048, 0.064, 8));
  const tibiaGeo = trackGeo(new THREE.ConeGeometry(0.013, 0.026, 9));
  const frontToeGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0.0145, 0.002),
        new THREE.Vector3(0, 0.0138, 0.0145),
        new THREE.Vector3(0, 0.004, 0.0205),
        new THREE.Vector3(0, -0.006, 0.0165),
      ],
      0.0030,
      0.0016,
      7,
      5
    )
  );
  const frontClawGeo = trackGeo(new THREE.ConeGeometry(0.0017, 0.0085, 5));
  const rearToeGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0.0145, -0.002),
        new THREE.Vector3(0, 0.0115, -0.0135),
        new THREE.Vector3(0, 0.001, -0.0175),
      ],
      0.0031,
      0.0017,
      6,
      5
    )
  );

  for (const side of [-1, 1]) {
    const legRoot = new THREE.Group();
    legRoot.position.set(side * 0.020, 0.0, 0.0);

    const tarsus = new THREE.Mesh(tarsusGeo, legMat);
    tarsus.position.set(0, 0.043, -0.006);
    tarsus.rotation.x = -0.22;
    tarsus.rotation.z = side * -0.04;
    legRoot.add(tarsus);

    const tibia = new THREE.Mesh(tibiaGeo, ventralMat);
    tibia.position.set(0, 0.070, -0.011);
    tibia.rotation.x = Math.PI - 0.14;
    legRoot.add(tibia);

    for (const [spreadYaw, scaleLen] of [
      [-0.35, 0.92],
      [0.0, 1.06],
      [0.35, 0.90],
    ]) {
      const toePivot = new THREE.Group();
      toePivot.rotation.y = spreadYaw;
      const toe = new THREE.Mesh(frontToeGeo, legMat);
      toe.scale.set(1, 1, scaleLen);
      toePivot.add(toe);

      const claw = new THREE.Mesh(frontClawGeo, clawMat);
      claw.position.set(0, -0.0085, 0.0155 * scaleLen);
      claw.rotation.x = 2.45;
      toePivot.add(claw);

      legRoot.add(toePivot);
    }

    const hallux = new THREE.Mesh(rearToeGeo, legMat);
    legRoot.add(hallux);
    const halluxClaw = new THREE.Mesh(frontClawGeo, clawMat);
    halluxClaw.position.set(0, -0.0028, -0.0175);
    halluxClaw.rotation.x = -2.35;
    legRoot.add(halluxClaw);

    group.add(legRoot);
  }

  // =========================================================================
  // 2. SLEEK PASSERINE TORSO, GOLDEN-BUFF BREAST & INFLATABLE THROAT SAC
  // =========================================================================
  const bodyGroup = new THREE.Group();
  bodyGroup.position.set(0.0, 0.084, 0.002);
  group.add(bodyGroup);

  // Sleek ovoid avian back/torso tilted ~37° upright (true laughingthrush silhouette)
  const torsoGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.004, -0.086], // tapering rump
        [0.019, -0.072],
        [0.034, -0.050],
        [0.044, -0.020],
        [0.048, 0.012], // smooth rounded torso
        [0.044, 0.042],
        [0.035, 0.066], // shoulders
        [0.025, 0.084], // feathered neck taper
        [0.015, 0.094],
      ],
      22
    )
  );
  const torso = new THREE.Mesh(torsoGeo, dorsalMat);
  torso.rotation.x = 0.92; // ~37° elevated longitudinal body axis
  torso.scale.set(0.90, 1.0, 0.98);
  torso.castShadow = castShadow;
  bodyGroup.add(torso);

  // Clean proud golden-ochre/tawny-buff chest & pale belly contour blended smoothly into torso
  const breastGeo = trackGeo(new THREE.SphereGeometry(0.045, 20, 16));
  const breast = new THREE.Mesh(breastGeo, ventralMat);
  breast.scale.set(0.86, 1.16, 0.90);
  breast.position.set(0.0, 0.008, 0.017);
  breast.rotation.x = 0.44;
  bodyGroup.add(breast);

  // Smooth pale undertail coverts (crissum)
  const vent = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.023, 12, 10)),
    ventralMat
  );
  vent.scale.set(0.84, 0.82, 1.25);
  vent.position.set(0.0, -0.030, -0.038);
  bodyGroup.add(vent);

  // Smooth feathered throat / OEC vocal sac — blends chest seamlessly into chin & swells when singing!
  const throatSac = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.0255, 16, 14)),
    throatMat
  );
  throatSac.scale.set(0.88, 1.08, 0.88);
  throatSac.position.set(0.0, 0.056, 0.040);
  bodyGroup.add(throatSac);

  // =========================================================================
  // 3. SLEEK TUCKED FOLDED WINGS (HUGGING FLANKS WITH ZERO PROTRUDING SPIKES)
  // =========================================================================
  const wingLeftPivot = new THREE.Group();
  wingLeftPivot.position.set(-0.035, 0.020, 0.002);
  bodyGroup.add(wingLeftPivot);

  const wingRightPivot = new THREE.Group();
  wingRightPivot.position.set(0.035, 0.020, 0.002);
  bodyGroup.add(wingRightPivot);

  // Contoured teardrop folded-wing airfoil lathe (tapered sleekly from shoulder to primary wingtip)
  const foldedWingGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.002, -0.088], // neat pointed folded wingtip resting above rump
        [0.011, -0.068],
        [0.022, -0.040],
        [0.031, -0.008],
        [0.034, 0.024], // rounded lesser/median wing coverts
        [0.026, 0.048],
        [0.010, 0.060], // smooth shoulder blend into mantle
      ],
      16
    )
  );
  // Sleek folded primary tip ribbon hugging tightly along the lower rear wing edge
  const primaryTipGeo = trackGeo(
    createTurnedLatheGeometry(
      [
        [0.0015, -0.054],
        [0.0075, -0.034],
        [0.012, -0.008],
        [0.011, 0.022],
        [0.004, 0.042],
      ],
      10
    )
  );

  for (const [side, pivot] of [
    [-1, wingLeftPivot],
    [1, wingRightPivot],
  ] as const) {
    // Main sleek folded wing shell hugging the flank cleanly along the ~37° torso angle
    const wingBody = new THREE.Mesh(foldedWingGeo, wingCovertMat);
    wingBody.rotation.set(0.94, side * -0.14, side * 0.10);
    wingBody.scale.set(0.36, 1.0, 0.88);
    wingBody.position.set(side * 0.002, -0.006, -0.014);
    wingBody.castShadow = castShadow;
    pivot.add(wingBody);

    // 3 closely shingled dark-tipped primary flight feather layers hugging flush along the folded wingtip
    for (let f = 0; f < 3; f++) {
      const prim = new THREE.Mesh(primaryTipGeo, flightFeatherMat);
      prim.rotation.set(0.98 + f * 0.03, side * (-0.18 - f * 0.05), side * (0.08 - f * 0.02));
      prim.scale.set(0.28, 0.92 + f * 0.14, 0.72);
      prim.position.set(
        side * (0.002 - f * 0.0055),
        -0.024 - f * 0.011,
        -0.040 - f * 0.016
      );
      pivot.add(prim);
    }
  }

  // =========================================================================
  // 4. GRADUATED LONG ROUNDED LAUGHINGTHRUSH TAIL (7 SHINGLED BARRED RECTRICES)
  // =========================================================================
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0.0, -0.036, -0.066);
  tailPivot.rotation.x = -0.46; // Graceful long tail sweeping cleanly downward-back inside cage
  bodyGroup.add(tailPivot);

  const tailBaseCushion = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.019, 10, 8)),
    dorsalMat
  );
  tailBaseCushion.scale.set(1.02, 0.58, 1.45);
  tailBaseCushion.position.set(0, 0.004, -0.012);
  tailPivot.add(tailBaseCushion);

  // 7 neatly shingled, gently cupped, rounded-tip rectrices (central pair longest ~18.5cm)
  const rectrixGeo = trackGeo(createCuppedPetalGeometry(0.020, 0.182, 0.005));
  for (let i = -3; i <= 3; i++) {
    const absI = Math.abs(i);
    const lenScale = 1.0 - absI * 0.095;
    const widthScale = 1.0 - absI * 0.06;
    const blade = new THREE.Mesh(rectrixGeo, flightFeatherMat);
    blade.position.set(i * 0.0055, -absI * 0.0015, -0.004);
    blade.rotation.set(-Math.PI * 0.5 + 0.03, i * -0.045, i * 0.035);
    blade.scale.set(widthScale, lenScale, 1.0);
    blade.castShadow = castShadow;
    tailPivot.add(blade);
  }

  // =========================================================================
  // 5. SLEEK HWAMEI HEAD, ICONIC SNOW-WHITE SPECTACLE & SWEEPING EYEBROW, BILL
  // =========================================================================
  const headPivot = new THREE.Group();
  headPivot.position.set(0.0, 0.080, 0.044);
  bodyGroup.add(headPivot);

  // Seamless feathered nape/neck blend (zero stepped cylinder seam)
  const neckBlend = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.027, 14, 12)),
    dorsalMat
  );
  neckBlend.scale.set(0.88, 1.05, 0.96);
  neckBlend.position.set(0.0, -0.012, -0.004);
  headPivot.add(neckBlend);

  // Sleek olive-brown passerine skull (clean smooth oval cranium, NO bulging cheek balls!)
  const skull = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.0315, 22, 18)),
    dorsalMat
  );
  skull.scale.set(0.90, 0.94, 1.16);
  skull.position.set(0.0, 0.014, 0.006);
  skull.castShadow = castShadow;
  headPivot.add(skull);

  // Subtle sleek erectile crown feathers seated flush along top of head
  const crownPivot = new THREE.Group();
  crownPivot.position.set(0.0, 0.036, 0.002);
  headPivot.add(crownPivot);
  const crownTuftGeo = trackGeo(createCuppedPetalGeometry(0.019, 0.026, 0.003));
  for (let c = 0; c < 3; c++) {
    const tuft = new THREE.Mesh(crownTuftGeo, dorsalMat);
    tuft.position.set(0.0, -0.001 - c * 0.001, 0.005 - c * 0.008);
    tuft.rotation.set(-Math.PI * 0.5 + 0.05 + c * 0.04, 0, 0);
    tuft.scale.set(0.86 - c * 0.10, 0.90, 1.0);
    crownPivot.add(tuft);
  }

  // --- ICONIC HWAMEI FACE: PROUD CRISP SNOW-WHITE EYE-RING + LONG SWEEPING WHITE EYEBROW ---
  const eyeRingGeo = trackGeo(new THREE.TorusGeometry(0.0096, 0.0028, 10, 24));
  const eyeIrisGeo = trackGeo(new THREE.SphereGeometry(0.0072, 12, 10));
  const eyePupilGeo = trackGeo(new THREE.SphereGeometry(0.0058, 12, 10));
  const catchlightGeo = trackGeo(new THREE.SphereGeometry(0.0016, 6, 6));
  const eyelidGeo = trackGeo(
    new THREE.SphereGeometry(0.0078, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );

  const eyelids: THREE.Mesh[] = [];

  for (const side of [-1, 1]) {
    // Eye socket positioned cleanly proud of the sleek skull surface (skull half-width = 0.0283)
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(side * 0.0256, 0.0175, 0.0225);
    eyeSocket.rotation.y = side * 0.38;
    headPivot.add(eyeSocket);

    // Crisp snow-white periorbital spectacle ring (白眼圈) hugging cleanly around eye
    const ring = new THREE.Mesh(eyeRingGeo, whiteSpectacleMat);
    ring.position.set(side * 0.0018, 0, 0);
    ring.rotation.y = Math.PI * 0.5;
    ring.scale.set(1.06, 0.96, 0.72);
    eyeSocket.add(ring);

    // Warm dark amber-hazel iris + deep wet-gloss black pupil + crisp white specular catchlight
    const iris = new THREE.Mesh(eyeIrisGeo, irisMat);
    iris.scale.set(0.74, 1.0, 1.0);
    iris.position.set(side * 0.0016, 0, 0);
    eyeSocket.add(iris);

    const pupil = new THREE.Mesh(eyePupilGeo, pupilMat);
    pupil.scale.set(0.78, 1.0, 1.0);
    pupil.position.set(side * 0.0036, 0.0002, 0.0008);
    eyeSocket.add(pupil);

    const catchlight = new THREE.Mesh(catchlightGeo, catchlightMat);
    catchlight.position.set(side * 0.0076, 0.0024, 0.0026);
    eyeSocket.add(catchlight);

    const lid = new THREE.Mesh(eyelidGeo, dorsalMat);
    lid.position.set(side * 0.0020, 0.0004, 0.0002);
    lid.rotation.z = side * -1.35;
    eyelids.push(lid);
    eyeSocket.add(lid);

    // Iconic long sweeping snow-white "painted eyebrow" (中华画眉标志性长白眉纹)
    // Placed cleanly proud along the outer surface of the sleek olive skull so it NEVER clips inside!
    const browGeo = trackGeo(
      createTaperedCurveGeometry(
        [
          new THREE.Vector3(side * 0.0276, 0.0195, 0.0160), // seamlessly joins rear upper arc of white eye-ring
          new THREE.Vector3(side * 0.0300, 0.0228, 0.0030), // arches proudly over temple
          new THREE.Vector3(side * 0.0282, 0.0216, -0.0135), // sweeps sleekly past ear coverts
          new THREE.Vector3(side * 0.0226, 0.0160, -0.0270), // curves gracefully toward nape
          new THREE.Vector3(side * 0.0155, 0.0110, -0.0355), // fine calligraphic brush tip at nape
        ],
        0.0038,
        0.0010,
        16,
        8
      )
    );
    const brow = new THREE.Mesh(browGeo, whiteSpectacleMat);
    headPivot.add(brow);
  }

  // --- GRACEFUL SLIGHTLY DECURVED GOLDEN-HORN BILL (FLUSH SEAL AT REST, WIDE GAPE WHEN SINGING) ---
  const beakRoot = new THREE.Group();
  beakRoot.position.set(0.0, 0.0115, 0.0365);
  headPivot.add(beakRoot);

  const upperBeakPivot = new THREE.Group();
  beakRoot.add(upperBeakPivot);

  const upperBeakGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0.0028, -0.003),
        new THREE.Vector3(0, 0.0034, 0.014),
        new THREE.Vector3(0, 0.0012, 0.029),
        new THREE.Vector3(0, -0.0044, 0.043), // classic slender slightly decurved Hwamei bill tip
      ],
      0.0076,
      0.0009,
      12,
      8
    )
  );
  const upperBeak = new THREE.Mesh(upperBeakGeo, beakBaseMat);
  upperBeak.scale.set(0.80, 1.02, 1.0);
  upperBeakPivot.add(upperBeak);

  // Subtle dusky horn culmen ridge along top edge of maxilla
  const culmenGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, 0.0066, 0.001),
        new THREE.Vector3(0, 0.0058, 0.017),
        new THREE.Vector3(0, 0.0018, 0.032),
        new THREE.Vector3(0, -0.0042, 0.0435),
      ],
      0.0025,
      0.0007,
      10,
      6
    )
  );
  const culmen = new THREE.Mesh(culmenGeo, beakTipMat);
  upperBeakPivot.add(culmen);

  // Hinged lower mandible closing cleanly flush against upper beak at rest
  const lowerBeakPivot = new THREE.Group();
  lowerBeakPivot.position.set(0.0, -0.0005, 0.000);
  beakRoot.add(lowerBeakPivot);

  const lowerBeakGeo = trackGeo(
    createTaperedCurveGeometry(
      [
        new THREE.Vector3(0, -0.0008, -0.002),
        new THREE.Vector3(0, -0.0018, 0.013),
        new THREE.Vector3(0, -0.0024, 0.027),
        new THREE.Vector3(0, -0.0038, 0.039),
      ],
      0.0060,
      0.0008,
      10,
      7
    )
  );
  const lowerBeak = new THREE.Mesh(lowerBeakGeo, beakBaseMat);
  lowerBeak.scale.set(0.72, 0.84, 1.0);
  lowerBeakPivot.add(lowerBeak);

  // Delicate pink tongue tucked completely inside closed bill (only revealed when singing!)
  const tongue = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.0022, 0.015, 6)),
    oralCavityMat
  );
  tongue.rotation.x = Math.PI * 0.52;
  tongue.position.set(0, -0.0004, 0.011);
  tongue.visible = false;
  lowerBeakPivot.add(tongue);

  // =========================================================================
  // 6. AUDIO-SYNCHRONIZED BIOMECHANICAL ANIMATION DRIVER
  // =========================================================================
  let blinkTimer = 3.2;
  let blinkElapsed = -1;
  let glanceTargetYaw = 0;
  let glanceTargetRoll = 0;
  let glanceHoldTimer = 1.4;
  let smoothHeadYaw = 0;
  let smoothHeadRoll = 0;
  let smoothSleepBlend = 0;

  const update = (timeSec: number, dt: number, anim: HwameiAnimState) => {
    const safeDt = Math.min(0.08, Math.max(0.001, dt));
    const sing = anim.singIntensity;
    const excited = anim.excitedLevel;
    const activeSing = Math.max(sing, excited * 0.35);

    const targetSleep = anim.isSleeping ? 1 : 0;
    smoothSleepBlend += (targetSleep - smoothSleepBlend) * (1 - Math.exp(-3.5 * safeDt));

    const breathRate = anim.isSleeping ? 2.1 : 3.6 + activeSing * 1.4;
    const breath = Math.sin(timeSec * breathRate);

    // Torso: proud upright lift when singing, cozy tucked puff when sleeping
    const hopBounce = Math.abs(Math.sin(timeSec * 11.5)) * sing * 0.0030;
    bodyGroup.position.y =
      0.084 + breath * 0.0018 + hopBounce - smoothSleepBlend * 0.007;
    bodyGroup.rotation.x =
      -0.08 * sing - 0.04 * anim.pitchNorm01 * sing + breath * 0.020 + smoothSleepBlend * 0.16;

    const fluff = 1.0 + smoothSleepBlend * 0.08;
    torso.scale.set(0.90 * fluff, 1.0, 0.98 * fluff);
    breast.scale.set(0.84 * fluff, 1.12, 0.88 * fluff);

    // Animated singing throat / OEC vocal pouch inflation + vocal-fold shimmer
    const throatShimmer =
      anim.isSinging ? Math.sin(timeSec * 42.0) * 0.055 * anim.throatPulse01 : 0;
    const throatScaleXZ = 0.88 + anim.throatPulse01 * 0.28 + throatShimmer + breath * 0.02;
    const throatScaleY = 1.08 + anim.throatPulse01 * 0.16 + (anim.isBreathingIn ? 0.08 : 0);
    throatSac.scale.set(throatScaleXZ, throatScaleY, 0.88 + anim.throatPulse01 * 0.32);

    // Crisp alert passerine head glances between phrases, proud skyward lift during song!
    glanceHoldTimer -= safeDt;
    if (glanceHoldTimer <= 0) {
      const phase = Math.sin(timeSec * 3.17 + 0.8) + Math.cos(timeSec * 1.93);
      glanceTargetYaw = Math.max(-0.55, Math.min(0.55, phase * 0.32));
      glanceTargetRoll = Math.sin(timeSec * 2.41) * 0.15;
      glanceHoldTimer = 0.9 + (0.5 + 0.5 * Math.sin(timeSec * 4.7)) * 1.45;
    }

    const headLambda = anim.isSleeping ? 4.0 : 12.0;
    const activeTargetYaw = anim.isSleeping
      ? 1.38 // tucked warmly onto back feathers at night
      : glanceTargetYaw * (1.0 - sing * 0.58) + Math.sin(timeSec * 2.2) * 0.11 * sing;
    const activeTargetRoll = anim.isSleeping
      ? 0.24
      : glanceTargetRoll * (1.0 - sing * 0.65);

    smoothHeadYaw += (activeTargetYaw - smoothHeadYaw) * (1 - Math.exp(-headLambda * safeDt));
    smoothHeadRoll += (activeTargetRoll - smoothHeadRoll) * (1 - Math.exp(-headLambda * safeDt));

    headPivot.rotation.y = smoothHeadYaw;
    headPivot.rotation.z = smoothHeadRoll;
    const singTiltX = -0.14 * sing - 0.25 * anim.pitchNorm01 * sing;
    const idleTiltX = Math.sin(timeSec * 1.7) * 0.04;
    headPivot.rotation.x =
      (singTiltX + idleTiltX) * (1 - smoothSleepBlend) + 0.36 * smoothSleepBlend;

    crownPivot.rotation.x = -(0.04 + 0.18 * Math.max(sing, excited * 0.7));

    // Exact lip-synced beak opening from live physical syrinx beakGapeMm!
    const gape = anim.beakOpen01 * (1 - smoothSleepBlend);
    const fineTrill =
      anim.isSinging ? (0.5 + 0.5 * Math.sin(timeSec * 34.0)) * 0.055 * sing : 0;
    const lowerRot = gape * 0.44 + fineTrill;
    lowerBeakPivot.rotation.x = lowerRot;
    upperBeakPivot.rotation.x = -(gape * 0.08);
    tongue.visible = lowerRot > 0.08;

    // Expressive graduated tail pumping synchronized to song vigor & balance
    const tailSingPump = Math.sin(timeSec * 14.5) * 0.11 * sing + sing * 0.08;
    const tailIdleBob = Math.sin(timeSec * 2.1) * 0.042 * (1 - smoothSleepBlend);
    tailPivot.rotation.x = -0.46 + tailIdleBob + tailSingPump - smoothSleepBlend * 0.08;

    // Occasional crisp passerine wing-flicks + lively singing shoulder tremor
    const wingFlick =
      (1 - smoothSleepBlend) *
      (Math.pow(Math.max(0, Math.sin(timeSec * 1.55 + 0.4)), 22) * 0.085 +
        sing * 0.045 * Math.sin(timeSec * 18.0));
    wingLeftPivot.rotation.z = wingFlick;
    wingRightPivot.rotation.z = -wingFlick;

    // Natural avian eyelid blinking (closed while sleeping)
    let blink01 = smoothSleepBlend;
    if (!anim.isSleeping) {
      blinkTimer -= safeDt;
      if (blinkTimer <= 0) {
        blinkElapsed = 0;
        blinkTimer = 2.6 + (0.5 + 0.5 * Math.sin(timeSec * 5.3)) * 3.1;
      }
      if (blinkElapsed >= 0) {
        blinkElapsed += safeDt;
        const blinkDur = 0.15;
        if (blinkElapsed < blinkDur) {
          blink01 = Math.max(blink01, Math.sin((blinkElapsed / blinkDur) * Math.PI));
        } else {
          blinkElapsed = -1;
        }
      }
    }
    if (eyelids.length === 2) {
      eyelids[0].rotation.z = -(-1.35 + blink01 * 1.28);
      eyelids[1].rotation.z = -1.35 + blink01 * 1.28;
    }
  };

  return {
    group,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
