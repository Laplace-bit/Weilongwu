import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeilongArchitectureBlueprint } from './architectureData';
import { ArchitectureCompiler, computeBoxOverlapVolume } from './architectureCompiler';
import { SpatialPhysicsKernel } from './spatialPhysicsKernel';
import { SceneValidator } from './sceneValidator';
import {
  COLLISION_MASKS,
  CollisionLayer,
  DEFAULT_CAPSULE_DIMS,
  type StationSlot,
} from './spatialTypes';

describe('1. SSOT ArchitectureCompiler (Visual + BVH + NavMesh Sync)', () => {
  it('compiles a single blueprint into synchronized staticBvh, ceilingBvh, staticArchBoxes, and navObstacles', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiler = new ArchitectureCompiler(bp);
    const compiled = compiler.compile();

    assert.ok(compiled.staticBvh, 'staticBvh must be compiled');
    assert.ok(compiled.ceilingBvh, 'ceilingBvh must be compiled');
    assert.ok(compiled.staticArchBoxes.length >= bp.walls.length + bp.beams.length + bp.columns.length);
    assert.ok(compiled.navObstacles.length > 50, 'NavMesh obstacle footprints must be populated');

    // Mutate a wall coordinate in the SSOT blueprint and recompile:
    // BVH hit distance, staticArchBox, and navObstacle MUST shift identically!
    const bpShifted = createWeilongArchitectureBlueprint();
    const frontWall = bpShifted.walls.find((w) => w.id === 'wall_front_e_mid');
    assert.ok(frontWall);
    frontWall.z += 2.0; // Shift wall 2m south (from 21.65 to 23.65)

    const compilerShifted = new ArchitectureCompiler(bpShifted);
    const compiledShifted = compilerShifted.compile();

    const kOrig = new SpatialPhysicsKernel(compiled);
    const kShift = new SpatialPhysicsKernel(compiledShifted);

    const rayOrigin = new THREE.Vector3(8.4, 1.5, 30.0);
    const rayDir = new THREE.Vector3(0, 0, -1);
    const hitOrig = kOrig.raycastStaticBvh(rayOrigin, rayDir, 15.0);
    const hitShift = kShift.raycastStaticBvh(rayOrigin, rayDir, 15.0);

    assert.equal(hitOrig.hit, true);
    assert.equal(hitShift.hit, true);
    // Shifted wall is 2.0m closer to z=30.0
    assert.ok(
      Math.abs((hitOrig.distance - hitShift.distance) - 2.0) < 0.05,
      `Expected BVH hit shift of ~2.0m, got ${(hitOrig.distance - hitShift.distance).toFixed(3)}m`
    );

    const boxOrig = compiled.staticArchBoxes.find((b) => b.id === 'wall_front_e_mid')!;
    const boxShift = compiledShifted.staticArchBoxes.find((b) => b.id === 'wall_front_e_mid')!;
    assert.ok(Math.abs((boxShift.box.min.z - boxOrig.box.min.z) - 2.0) < 0.01);

    const navOrig = compiled.navObstacles.find((n) => n.id === 'wall_front_e_mid')!;
    const navShift = compiledShifted.navObstacles.find((n) => n.id === 'wall_front_e_mid')!;
    assert.ok(Math.abs((navShift.minZ! - navOrig.minZ!) - 2.0) < 0.01);

    compiled.dispose();
    compiledShifted.dispose();
  });
});

describe('2. Zero Magic Coordinates (Semantic Sockets & Grounding Contract)', () => {
  it('mountToSocket(hang) snaps lantern top max.y to overhead beam so upward raycast hits within 0.05m', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiler = new ArchitectureCompiler(bp);
    const compiled = compiler.compile();
    const kernel = new SpatialPhysicsKernel(compiled);

    // Beam beam_middle_hall_s bottom sits at yBase = 4.18 - 0.12 = 4.06
    compiler.registerSocket({
      id: 'eave_hang_test_lantern',
      kind: 'eave_hang',
      position: [0, 4.06, 10.2],
      normal: [0, -1, 0],
      hostId: 'beam_middle_hall_s',
    });

    // Build lantern mesh with arbitrary uncentered local origin
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.56, 8),
      new THREE.MeshBasicMaterial()
    );
    lantern.position.set(12, 99, -40); // Garbage initial coordinates must be overridden

    compiler.mountToSocket(lantern, 'eave_hang_test_lantern', {
      mode: 'hang',
      embedOffset: 0.015,
    });

    lantern.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(lantern);
    assert.ok(Math.abs(box.max.y - (4.06 + 0.015)) < 0.005);

    const hit = kernel.raycastOverheadAnchor(
      new THREE.Vector3(0, box.max.y - 0.05, 10.2),
      0.10
    );
    assert.equal(hit.hit, true, 'Mounted lantern must hit overhead beam via upward raycast');

    compiled.dispose();
  });

  it('mountToSocket(plaque) detects beam intersection and auto-shifts plaque along normal until zero clip', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiler = new ArchitectureCompiler(bp);
    const compiled = compiler.compile();

    // Place a plaque socket directly inside beam_middle_hall_s (z = 10.2, d = 0.24 -> z in [10.08, 10.32], y in [4.06, 4.30])
    compiler.registerSocket({
      id: 'lintel_plaque_test',
      kind: 'lintel_plaque',
      position: [0, 4.18, 10.2],
      normal: [0, 0, 1],
      hostId: 'beam_middle_hall_s',
    });

    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.72, 0.14),
      new THREE.MeshBasicMaterial()
    );

    const res = compiler.mountToSocket(plaque, 'lintel_plaque_test', {
      mode: 'plaque',
      clearanceMargin: 0.02,
    });

    assert.ok(res.shiftedDistance > 0.1, `Expected plaque auto-shift > 0.1m, got ${res.shiftedDistance}`);
    assert.ok(res.intersectedIds.includes('beam_middle_hall_s'));

    plaque.updateMatrixWorld(true);
    const plaqueBox = new THREE.Box3().setFromObject(plaque);
    const beamBox = compiled.staticArchBoxes.find((b) => b.id === 'beam_middle_hall_s')!.box;
    const finalOverlap = computeBoxOverlapVolume(plaqueBox, beamBox);
    assert.equal(finalOverlap, 0, 'Plaque must have zero overlap with beam after normal auto-shift');

    compiled.dispose();
  });

  it('placeOnGround aligns real bbox.min.y to groundY and enforces allowedSurface (throw or auto planter pot)', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiler = new ArchitectureCompiler(bp);
    const compiled = compiler.compile();

    // 1. Exact grounding test on an off-center mesh (min.y locally = -0.35)
    const benchGeo = new THREE.BoxGeometry(1.4, 0.7, 0.45);
    benchGeo.translate(0, 0.0, 0); // local min.y = -0.35
    const bench = new THREE.Mesh(benchGeo, new THREE.MeshBasicMaterial());
    const groundRes = compiler.placeOnGround(bench, 0, 19.6, {
      id: 'test_bench',
      auditKind: 'furniture',
    });
    bench.updateMatrixWorld(true);
    const benchBox = new THREE.Box3().setFromObject(bench);
    assert.ok(
      Math.abs(benchBox.min.y - groundRes.groundY) < 0.002,
      `Expected bench min.y (${benchBox.min.y}) === groundY (${groundRes.groundY})`
    );

    // 2. Tree on concrete He-Ping courtyard (x=6.0, z=26.0) with autoWrapPlanter:false MUST throw
    const illegalTree = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.22, 3.0, 8),
      new THREE.MeshBasicMaterial()
    );
    assert.throws(
      () =>
        compiler.placeOnGround(illegalTree, 6.0, 26.0, {
          id: 'illegal_concrete_tree',
          allowedSurface: ['soil', 'planter_pot'],
          autoWrapPlanter: false,
          auditKind: 'tree',
        }),
      /GROUND_CONTRACT_VIOLATION/
    );

    // 3. Same tree with autoWrapPlanter:true MUST auto-wrap into a stone planter pot
    const wrappedTree = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.22, 3.0, 8),
      new THREE.MeshBasicMaterial()
    );
    const wrapRes = compiler.placeOnGround(wrappedTree, 6.0, 26.0, {
      id: 'wrapped_concrete_tree',
      allowedSurface: ['soil', 'planter_pot'],
      autoWrapPlanter: true,
      auditKind: 'tree',
    });
    assert.equal(wrapRes.wrappedInPlanter, true);
    assert.ok(wrapRes.planterGroup, 'Auto-generated stone planter pot must be returned');
    assert.equal(wrapRes.planterGroup.userData.grounded, true);

    compiled.dispose();
  });
});

describe('3. Unified SpatialPhysicsKernel (BVH Slide, Anti-Tunneling, Bitmask & Containers)', () => {
  it('slides smoothly along BVH wall on diagonal approach without penetrating', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiled = new ArchitectureCompiler(bp).compile();
    const kernel = new SpatialPhysicsKernel(compiled);

    // Front wall wall_front_e_mid: x in [2.0, 14.8], z = 21.65 (half-depth 0.23 -> south face at z = 21.88)
    kernel.registerBody({
      id: 'player',
      x: 8.0,
      y: 0,
      z: 22.35,
      radius: DEFAULT_CAPSULE_DIMS.PLAYER.radius, // 0.32
      height: DEFAULT_CAPSULE_DIMS.PLAYER.height,
      layer: CollisionLayer.PLAYER,
      mask: COLLISION_MASKS.PLAYER,
    });

    const res = kernel.moveCapsule('player', { x: 0.5, z: -0.5 }, 0.03);
    assert.equal(res.collidedStatic, true);
    // Must stay strictly south of wall face (21.88 + 0.32 = 22.20)
    assert.ok(res.z >= 22.17, `Expected capsule z >= 22.17, got ${res.z.toFixed(3)}`);
    // Must still slide cleanly along +X
    assert.ok(res.x > 8.35, `Expected diagonal wall slide along +X (>8.35), got ${res.x.toFixed(3)}`);

    compiled.dispose();
  });

  it('prevents high-speed & lag-spike tunneling through thin walls via dt clamping and sub-stepping', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiled = new ArchitectureCompiler(bp).compile();
    const kernel = new SpatialPhysicsKernel(compiled);

    kernel.registerBody({
      id: 'sprinter',
      x: 8.4,
      y: 0,
      z: 22.6,
      radius: 0.32,
      height: 1.72,
      layer: CollisionLayer.PLAYER,
      mask: COLLISION_MASKS.PLAYER,
    });

    // Attempt a 4.0m single-frame teleport lunge straight through the 0.46m front wall at z=21.65
    const res = kernel.moveCapsule('sprinter', { x: 0, z: -4.0 }, 0.04);
    assert.ok(res.subSteps >= 10, `Expected anti-tunneling sub-steps >= 10, got ${res.subSteps}`);
    assert.equal(res.collidedStatic, true);
    assert.ok(res.z >= 22.15, `Anti-tunneling failed! Capsule penetrated wall to z=${res.z.toFixed(3)}`);

    // Test lag spike dt = 0.8s (must clamp effective dt to 0.05s)
    kernel.syncBodyPosition('sprinter', 0, 0, 31.0);
    const spikeRes = kernel.moveCapsule('sprinter', { x: 0, z: -8.0 }, 0.8);
    // Displacement scaled by 0.05 / 0.8 = 0.0625 => ~0.5m, not 8.0m
    assert.ok(
      Math.abs(spikeRes.z - 30.5) < 0.12,
      `Expected dt=0.8s lag-spike clamp to move ~0.5m to z~30.5, got z=${spikeRes.z.toFixed(3)}`
    );

    compiled.dispose();
  });

  it('enforces CollisionLayer bitmask: Doumen toggle, Pond blocks Player but allows Waterfowl, Poultry scatters', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiled = new ArchitectureCompiler(bp).compile();
    const kernel = new SpatialPhysicsKernel(compiled);

    // 1. Dynamic Doumen Gate test at x = 16.1, z = 21.65
    kernel.registerBody({
      id: 'player',
      x: 16.1,
      y: 0,
      z: 22.4,
      radius: 0.32,
      height: 1.72,
      layer: CollisionLayer.PLAYER,
      mask: COLLISION_MASKS.PLAYER,
    });
    const closedRes = kernel.moveCapsule('player', { x: 0, z: -1.4 }, 0.04, { doumenOpen: false });
    assert.ok(closedRes.z > 22.0, `Closed Doumen must block player, got z=${closedRes.z.toFixed(3)}`);

    const openRes = kernel.moveCapsule('player', { x: 0, z: -2.0 }, 0.04, { doumenOpen: true });
    assert.ok(openRes.z < 21.0, `Open Doumen must allow player through, got z=${openRes.z.toFixed(3)}`);

    // 2. POND_WATER bitmask: blocks Player, allows Waterfowl
    kernel.syncBodyPosition('player', 0, 0, 38.0);
    const pondBlock = kernel.moveCapsule('player', { x: 0, z: 3.5 }, 0.04);
    assert.equal(pondBlock.collidedStatic, true);
    assert.ok(pondBlock.z < 38.7, `Player must be blocked from Half-Moon Pond, got z=${pondBlock.z.toFixed(3)}`);

    kernel.registerBody({
      id: 'goose_0',
      x: 0,
      y: -0.22,
      z: 40.5,
      radius: DEFAULT_CAPSULE_DIMS.WATERFOWL.radius,
      height: DEFAULT_CAPSULE_DIMS.WATERFOWL.height,
      layer: CollisionLayer.WATERFOWL,
      mask: COLLISION_MASKS.WATERFOWL,
    });
    const swimRes = kernel.moveCapsule('goose_0', { x: 0.5, z: 1.2 }, 0.04, { preserveY: true });
    assert.equal(swimRes.collidedStatic, false);
    assert.ok(swimRes.z > 41.5, `Waterfowl must swim freely inside pond, got z=${swimRes.z.toFixed(3)}`);

    // 3. Poultry Scatter + non-blocking Player
    kernel.syncBodyPosition('player', 0, 0, 30.0);
    kernel.registerBody({
      id: 'hen_0',
      x: 0.4,
      y: 0,
      z: 30.0,
      radius: DEFAULT_CAPSULE_DIMS.POULTRY.radius,
      height: DEFAULT_CAPSULE_DIMS.POULTRY.height,
      layer: CollisionLayer.POULTRY,
      mask: COLLISION_MASKS.POULTRY,
      scatterFromMask: CollisionLayer.PLAYER | CollisionLayer.VILLAGER,
      scatterRadius: 2.0,
    });
    const henRes = kernel.moveCapsule('hen_0', { x: 0, z: 0 }, 0.04);
    assert.ok(henRes.scatterX > 0, 'Poultry near player must receive positive flee scatter vector away from player');
    assert.ok(henRes.x > 0.4, 'Poultry must actively scatter away from player');

    // Player walking right past hen is NOT blocked by POULTRY layer
    const playerPass = kernel.moveCapsule('player', { x: 0.8, z: 0 }, 0.04);
    assert.equal(playerPass.collidedDynamic, false, 'Poultry must not block Player capsule');

    // 4. Dynamic Villager-vs-Villager separation re-clips against static BVH so nobody gets shoved into wall
    kernel.registerBody({
      id: 'villager_wall',
      x: 8.4,
      y: 0,
      z: 22.25, // Right against wall_front_e_mid south face (~21.88 + 0.32 = 22.20)
      radius: DEFAULT_CAPSULE_DIMS.VILLAGER.radius,
      height: DEFAULT_CAPSULE_DIMS.VILLAGER.height,
      layer: CollisionLayer.VILLAGER,
      mask: COLLISION_MASKS.VILLAGER,
    });
    kernel.registerBody({
      id: 'villager_pusher',
      x: 8.4,
      y: 0,
      z: 22.55, // Overlaps villager_wall from the south (pushing villager_wall north toward wall)
      radius: DEFAULT_CAPSULE_DIMS.VILLAGER.radius,
      height: DEFAULT_CAPSULE_DIMS.VILLAGER.height,
      layer: CollisionLayer.VILLAGER,
      mask: COLLISION_MASKS.VILLAGER,
    });
    const pushedRes = kernel.moveCapsule('villager_wall', { x: 0, z: 0 }, 0.04);
    assert.equal(pushedRes.collidedDynamic, true);
    assert.ok(
      pushedRes.z >= 22.17,
      `Static BVH re-clip must prevent villager from being pushed into wall, got z=${pushedRes.z.toFixed(3)}`
    );

    compiled.dispose();
  });

  it('clamps Koi & caged Hwamei strictly inside registered ContainerDomains', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiled = new ArchitectureCompiler(bp).compile();
    const kernel = new SpatialPhysicsKernel(compiled);

    // Pond Koi trying to escape onto stone plaza (z = 30.0)
    const pondClamp = kernel.clampToContainer('half_moon_pond', 25.0, 0.5, 30.0);
    assert.equal(pondClamp.wasOutside, true);
    assert.ok(pondClamp.z >= 38.9, `Pond Koi must stay inside pond (z>=38.9), got z=${pondClamp.z}`);
    assert.ok(pondClamp.y <= -0.24, `Pond Koi must stay submerged (y<=-0.24), got y=${pondClamp.y}`);

    // Courtyard Vat Koi trying to escape rim
    const vatClamp = kernel.clampToContainer('courtyard_water_vat', -2.0, 1.5, 15.0);
    assert.equal(vatClamp.wasOutside, true);
    assert.ok(Math.hypot(vatClamp.x - -3.4, vatClamp.z - 13.6) <= 0.37);
    assert.ok(vatClamp.y <= 1.02);

    compiled.dispose();
  });
});

describe('4. Automated 3D Scene Static Integrity Linter (SceneValidator)', () => {
  it('detects all 6 error classes ([CLIP/GROUND/FLOAT/STATION/CONTAINER/RENDER]) and toggles red wireframes', () => {
    const bp = createWeilongArchitectureBlueprint();
    const compiled = new ArchitectureCompiler(bp).compile();
    const kernel = new SpatialPhysicsKernel(compiled);
    const validator = new SceneValidator();
    const scene = new THREE.Scene();

    // Inject Rule 1: [CLIP_ERROR] — plaque penetrating wall_front_e_mid (x=8.4, z=21.65)
    const badPlaque = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.6, 0.4),
      new THREE.MeshBasicMaterial()
    );
    badPlaque.name = 'bad_clipping_plaque';
    badPlaque.position.set(8.4, 2.0, 21.65);
    badPlaque.userData = { spatialAuditKind: 'plaque', groundId: 'bad_clipping_plaque' };
    scene.add(badPlaque);

    // Inject Rule 2: [GROUND_ERROR] — floating bench 0.25m above ground
    const badBench = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.5, 0.4),
      new THREE.MeshBasicMaterial()
    );
    badBench.name = 'floating_bench';
    badBench.position.set(0, 0.5, 25.0); // min.y = 0.25 vs expected 0.0
    badBench.userData = { grounded: true, expectedGroundY: 0.0, groundId: 'floating_bench' };
    scene.add(badBench);

    // Inject Rule 3: [FLOAT_ERROR] — lantern hanging in open sky with no overhead anchor
    const badLantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.5, 8),
      new THREE.MeshBasicMaterial()
    );
    badLantern.name = 'floating_sky_lantern';
    badLantern.position.set(0, 3.5, 29.0);
    badLantern.userData = { hanging: true, socketId: 'floating_sky_lantern' };
    scene.add(badLantern);

    // Inject Render Audit: [RENDER_ERROR] (1) transparent roof sheathing + (2) depthTest:false VFX
    const badRoof = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
    );
    badRoof.name = 'bad_transparent_sheathing';
    badRoof.userData = { isRoofSheathing: true };
    scene.add(badRoof);

    const badVfx = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ depthTest: false })
    );
    badVfx.name = 'bad_xray_vfx';
    badVfx.userData = { isWorldVfx: true };
    scene.add(badVfx);

    // Inject Rule 4: [STATION_ERROR] — villager station inside solid wall_front_e_mid
    const badStations: StationSlot[] = [
      { id: 'bad_wall_station', label: 'Inside Wall', x: 8.4, y: 0, z: 21.65, radius: 0.32, height: 1.72 },
    ];

    // Inject Rule 5: [CONTAINER_ERROR] — Koi fish escaped onto courtyard plaza
    const escapedKoi = new THREE.Object3D();
    escapedKoi.position.set(0, 0.2, 28.0);
    scene.add(escapedKoi);

    const report = validator.validateAll({
      sceneRoot: scene,
      compiled,
      physicsKernel: kernel,
      stations: badStations,
      containedEntities: [{ id: 'escaped_koi', domainId: 'half_moon_pond', object: escapedKoi }],
      silent: true,
    });

    assert.equal(report.passed, false);
    assert.equal(report.countsByCode.CLIP_ERROR, 1);
    assert.equal(report.countsByCode.GROUND_ERROR, 1);
    assert.equal(report.countsByCode.FLOAT_ERROR, 1);
    assert.equal(report.countsByCode.STATION_ERROR, 1);
    assert.equal(report.countsByCode.CONTAINER_ERROR, 1);
    assert.equal(report.countsByCode.RENDER_ERROR, 2);
    assert.equal(validator.getDebugWireframeGroup().visible, true);
    assert.ok(validator.getDebugWireframeGroup().children.length >= 6);

    // Clean pass verifies 0 errors and debug wireframe group stays hidden
    const cleanScene = new THREE.Scene();
    const goodKoi = new THREE.Object3D();
    goodKoi.position.set(0, -0.4, 43.0);
    cleanScene.add(goodKoi);

    const cleanReport = validator.validateAll({
      sceneRoot: cleanScene,
      compiled,
      physicsKernel: kernel,
      stations: [
        { id: 'station_main_entrance', label: 'Main Entrance', x: 0, y: 0, z: 31.0, radius: 0.32, height: 1.72 },
      ],
      containedEntities: [{ id: 'good_koi', domainId: 'half_moon_pond', object: goodKoi }],
      silent: true,
    });

    assert.equal(cleanReport.passed, true);
    assert.equal(cleanReport.totalErrors, 0);
    assert.equal(validator.getDebugWireframeGroup().visible, false);

    validator.dispose();
    compiled.dispose();
  });
});
