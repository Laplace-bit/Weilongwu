import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRONT_WALL_OUTER_Z,
  INNER_BAY_COUNT,
  groundHeightAt,
  surfaceTypeAt,
  detectNodeIdAt,
  resolvePlayerMovement,
  evaluateJiaobei,
  calculateMasteryProgress,
  sampleInnerWeilongCurve,
  sampleOuterWeilongCurve,
  isValidTreePosition,
  isPavedTreeSite,
  buildCurvedRingWallSegments,
  buildCircleColliders,
} from './worldMath';
import {
  sampleClosedLoopPath,
  sampleOpenPolyline,
  samplePondSwimPath,
  sampleFlockOrbit,
} from './livingPaths';
import {
  computeDayNightState,
  formatHourClock,
  getLocalTimeOfDay,
} from './dayNightCycle';
import { evaluateLivingBehavior } from './livingBehavior';
import { FreeRoamSystem, ROAM_PROFILES } from './freeRoamSystem';
import { ROOM_NODES, INTERACTABLES } from '../data/weilongData';

test('architectural floor elevation rises monotonically along South-to-North ritual axis', () => {
  const yHeping = groundHeightAt(0, 28);
  const yXiatang = groundHeightAt(0, 19);
  const yZhongtang = groundHeightAt(0, 8);
  const yShangtang = groundHeightAt(0, -3);
  const yHuataiMid = groundHeightAt(0, -14);
  const yDragonHall = groundHeightAt(0, -22.8);
  const yOuterRing = groundHeightAt(0, -31.2);

  assert.ok(yXiatang > yHeping, 'Lower Hall should rise above He-Ping courtyard');
  assert.ok(yZhongtang > yXiatang, 'Middle Hall should rise above Lower Hall');
  assert.ok(yShangtang > yZhongtang, 'Upper Hall should rise above Middle Hall');
  assert.ok(yHuataiMid > yShangtang, 'Huatai yard should rise above Upper Hall');
  assert.ok(yDragonHall > yHuataiMid, 'Inner Weilong Dragon Hall should rise above Huatai');
  assert.ok(yOuterRing > yDragonHall, 'Outer Weilong Ring should step above Inner Ring');
});

test('Inner and Outer Weilong curves are smooth and properly concentric', () => {
  const se = sampleInnerWeilongCurve(0);
  const apex = sampleInnerWeilongCurve(0.5);
  const sw = sampleInnerWeilongCurve(1);
  assert.ok(Math.abs(se.x - 19.5) < 0.01 && Math.abs(se.z - 19.15) < 0.01);
  assert.ok(Math.abs(sw.x + 19.5) < 0.01 && Math.abs(sw.z - 19.15) < 0.01);
  assert.ok(Math.abs(apex.x) < 0.01 && apex.z < -22.0);

  const outerApex = sampleOuterWeilongCurve(0.5);
  assert.ok(outerApex.z < apex.z - 7.5, 'Outer ring apex must sit well behind Inner ring apex');
});

test('all 6 distinct surface types are detected for procedural footstep audio matrix', () => {
  assert.equal(surfaceTypeAt(0, 38.0), 'water_stone');
  assert.equal(surfaceTypeAt(0, 28.0), 'courtyard');
  assert.equal(surfaceTypeAt(0, 8.0), 'slate');
  assert.equal(surfaceTypeAt(0, -13.0), 'cobble');
  assert.equal(surfaceTypeAt(0, -31.2), 'wood_2f');
  assert.equal(surfaceTypeAt(0, -45.0), 'forest');
});

test('every room node position maps back to its own node id and sits clear of solid colliders', () => {
  for (const node of ROOM_NODES) {
    const [x, y, z] = node.spawnPos;
    const detected = detectNodeIdAt(x, z, y);
    assert.equal(
      detected,
      node.id,
      `Location of ${node.id} at (${x}, ${y}, ${z}) detected as ${detected}`
    );

    const check = resolvePlayerMovement(x, z, x, z, y, true);
    const shift = Math.hypot(check.x - x, check.z - z);
    assert.ok(
      shift < 0.35,
      `Spawn point for ${node.id} at (${x}, ${z}) overlaps a collider (pushed by ${shift.toFixed(2)}m)`
    );
  }
});

test('central South-to-North axis is fully walkable on foot and triggers threshold lift at main gate', () => {
  const step = resolvePlayerMovement(0, FRONT_WALL_OUTER_Z + 0.4, 0, FRONT_WALL_OUTER_Z - 0.4, 0, false);
  assert.equal(step.collided, false, 'Central main portal must be wide open');
  assert.equal(step.crossedThreshold, true, 'Crossing front main portal should trigger threshold step');
  assert.equal(step.y, 0.25);

  const toSkywell = resolvePlayerMovement(0, 17.0, 0, 15.8, 0.25, false);
  assert.equal(toSkywell.collided, false, 'Passage into Front Skywell must be open');

  const toHuatai = resolvePlayerMovement(6.2, -4.8, 6.2, -6.4, 0.85, false);
  assert.equal(toHuatai.collided, false, 'Upper Hall side passage onto Huatai must be open');
});

test('dynamic front Doumen side gate blocks when closed and opens cleanly when unbolted', () => {
  const blocked = resolvePlayerMovement(16.1, 22.8, 16.1, 21.4, 0, false);
  assert.equal(blocked.collided, true, 'Closed Doumen gate should block passage');

  const opened = resolvePlayerMovement(16.1, 22.8, 16.1, 21.4, 0, true);
  assert.equal(opened.collided, false, 'Opened Doumen gate should allow free walking');
});

test('discrete Weilong ring rooms, columns, and furniture colliders prevent wall clipping and tunneling', () => {
  const segments = buildCurvedRingWallSegments();
  assert.ok(segments.length > 100, 'Curved inner & outer Weilong rings must generate full wall & partition segments');

  const circles = buildCircleColliders();
  assert.ok(circles.length > 20, 'Architectural timber columns & round stone props must generate circle colliders');

  // Trying to clip laterally across a discrete Inner Weilong radial room partition wall (bay boundary i=14 -> u=14/64)
  const pBefore = sampleInnerWeilongCurve(13.3 / INNER_BAY_COUNT);
  const pAfter = sampleInnerWeilongCurve(14.7 / INNER_BAY_COUNT);
  const lateralMove = resolvePlayerMovement(pBefore.x, pBefore.z, pAfter.x, pAfter.z, 1.4, true);
  assert.equal(lateralMove.collided, true, 'Radial partition wall between discrete Weilong rooms must block lateral clipping');

  // Trying to walk straight into Middle Hall central banquet table at (0, 8.2)
  const intoTable = resolvePlayerMovement(0, 10.6, 0, 8.2, 0.55, true);
  assert.equal(intoTable.collided, true, 'Middle Hall banquet table collider must block player');
  assert.ok(intoTable.z > 8.8, 'Player must stop outside banquet table perimeter');

  // Anti-tunneling: large sprint step trying to jump straight through solid east transverse wall axis_e_mid at x=11.4, z=9.0
  const tunnelTry = resolvePlayerMovement(9.4, 9.0, 14.0, 9.0, 0.55, true);
  assert.equal(tunnelTry.collided, true, 'Sub-stepped collision must block high-speed tunneling through walls');
  assert.ok(tunnelTry.x < 11.2, `Player must stay west of wall (got x=${tunnelTry.x.toFixed(2)})`);
});

test('tree placement validator strictly prevents wall clipping and pond overlap while allowing forest & meadows', () => {
  // Inside main hall / walls / pond / He-Ping must be rejected
  assert.equal(isValidTreePosition(0, 8.0), false, 'Reject inside Middle Hall');
  assert.equal(isValidTreePosition(0, -23.0), false, 'Reject inside Inner Weilong Dragon Hall');
  assert.equal(isValidTreePosition(19.5, 5.0), false, 'Reject on Inner Weilong Ring wall');
  assert.equal(isValidTreePosition(0, 42.0), false, 'Reject inside Half-Moon Pond');
  assert.equal(isValidTreePosition(0, 29.0), false, 'Reject inside He-Ping grain-drying apron');

  // Valid rear hillside fengshui forest & outer meadow clearings must pass
  assert.equal(isValidTreePosition(0, -52.0), true, 'Allow rear fengshui camphor forest');
  assert.equal(isValidTreePosition(-34.0, 32.0), true, 'Allow West garden meadow');
  assert.equal(isValidTreePosition(42.0, 18.0), true, 'Allow East meadow');
});

test('24-hour day-night cycle computes smooth lighting, twilight, moon/stars, and clock formatting', () => {
  assert.equal(formatHourClock(6.5), '06:30');
  assert.equal(formatHourClock(22.25), '22:15');
  assert.equal(formatHourClock(-1), '23:00');
  assert.equal(getLocalTimeOfDay(new Date(2026, 5, 1, 0, 0, 0)), 0);
  assert.equal(getLocalTimeOfDay(new Date(2026, 5, 1, 14, 30, 0)), 14.5);
  assert.equal(formatHourClock(getLocalTimeOfDay(new Date(2026, 5, 1, 17, 45, 30))), '17:45');
  assert.ok(
    Math.abs(getLocalTimeOfDay(new Date(2026, 5, 1, 23, 59, 30)) - (23 + 59.5 / 60)) < 1e-6
  );

  const noon = computeDayNightState(12.0, 'sunny');
  const dusk = computeDayNightState(18.0, 'sunny');
  const midnight = computeDayNightState(23.0, 'sunny');
  const rainyNoon = computeDayNightState(12.0, 'rain');

  assert.ok(noon.dayFactor > 0.95 && noon.starStrength === 0 && noon.sunStrength > 0.9);
  assert.ok(dusk.twilightFactor > 0.7 && dusk.lanternGlow > 0.5);
  assert.ok(midnight.nightFactor > 0.9 && midnight.starStrength > 0.8 && midnight.moonStrength > 0.5 && midnight.lanternGlow > 0.9);
  assert.ok(rainyNoon.rainFactor === 1 && rainyNoon.sunLightIntensity < noon.sunLightIntensity);
});

test('time + weather dynamic behavior FSM drives farmers, cranes, butterflies, and village life realistically', () => {
  const sunnyDay = evaluateLivingBehavior(10.5, 'sunny');
  assert.equal(sunnyDay.farmerState, 'raking');
  assert.equal(sunnyDay.grainMatsVisible, true);
  assert.equal(sunnyDay.grainMatsCovered, false);
  assert.equal(sunnyDay.craneState, 'soaring');
  assert.equal(sunnyDay.butterfliesActive, true);
  assert.equal(sunnyDay.poultryState, 'foraging');

  const rainyDay = evaluateLivingBehavior(10.5, 'rain');
  assert.equal(rainyDay.farmerState, 'harvest_rush');
  assert.equal(rainyDay.grainMatsCovered, true);
  assert.equal(rainyDay.craneState, 'roosting');
  assert.equal(rainyDay.butterfliesActive, false);
  assert.equal(rainyDay.villagersCarryUmbrellas, true);
  assert.equal(rainyDay.poultryState, 'sheltering');

  const dusk = evaluateLivingBehavior(18.5, 'sunny');
  assert.equal(dusk.craneState, 'descending');
  assert.ok(dusk.craneRoostBlend > 0.1 && dusk.craneRoostBlend < 0.9);

  const night = evaluateLivingBehavior(22.5, 'sunny');
  assert.equal(night.farmerState, 'resting_indoors');
  assert.equal(night.grainMatsVisible, false);
  assert.equal(night.craneState, 'roosting');
  assert.equal(night.craneRoostBlend, 1.0);
  assert.equal(night.butterfliesActive, false);
  assert.equal(night.poultryState, 'roosting');
  assert.equal(night.waterfowlState, 'shore_rest');
  assert.equal(night.quadrupedState, 'sleeping');
  assert.equal(night.villagerState, 'night_rest');
  assert.equal(night.skyLanternsActive, true);
  assert.equal(night.firefliesActive, true);
});

test('Jiaobei divination and mastery progress work accurately', () => {
  assert.equal(evaluateJiaobei(0.2, 0.8).type, 'sheng');
  assert.equal(evaluateJiaobei(0.8, 0.9).type, 'xiao');
  assert.equal(evaluateJiaobei(0.1, 0.2).type, 'yin');

  const nodeIds = new Set(ROOM_NODES.map((n) => n.id));
  for (const item of INTERACTABLES) {
    assert.ok(nodeIds.has(item.nodeId), `Interactable ${item.id} references unknown node ${item.nodeId}`);
  }
  // Ensure removed X-ray & Taiji interactables are completely gone
  assert.equal(INTERACTABLES.some((i) => i.id === 'int_tianjie_xray' || i.id === 'int_dragon_taiji'), false);

  assert.equal(calculateMasteryProgress(0, 24, 0, 26, 0, 6), 0);
  assert.equal(calculateMasteryProgress(12, 24, 13, 26, 3, 6), 50);
  assert.equal(calculateMasteryProgress(30, 24, 30, 26, 10, 6), 100);
});

test('living-world closed loops, pond waterfowl bounds, and soaring bird orbits remain valid', () => {
  const square = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ];
  const s0 = sampleClosedLoopPath(square, 0);
  const sMid = sampleClosedLoopPath(square, 0.125);
  const sWrap = sampleClosedLoopPath(square, 1.0);
  assert.ok(Math.abs(s0.x) < 1e-6 && Math.abs(s0.z) < 1e-6);
  assert.ok(Math.abs(sMid.x - 5) < 1e-5 && Math.abs(sMid.z) < 1e-5);
  assert.ok(Math.abs(sWrap.x - s0.x) < 1e-5 && Math.abs(sWrap.z - s0.z) < 1e-5);

  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const p = samplePondSwimPath(3.5, 43.2, 7.5, 3.8, angle, 1);
    assert.ok(p.z >= 39.79, `Waterfowl z=${p.z} should stay south of jetty`);
    const normR = Math.hypot(p.x / 14.5, (p.z - 38.6) / 9.3);
    assert.ok(normR <= 1.01, `Waterfowl (${p.x}, ${p.z}) exceeded pond margin: ${normR}`);
  }

  const crane = sampleFlockOrbit(0, 6, 36, 30, 24, 0.25);
  assert.ok(crane.y > 20 && Number.isFinite(crane.yaw) && crane.bank > 0);
});

test('paved tree site detector identifies all concrete/stone planter sites vs natural soil meadows', () => {
  // He-Ping concrete apron peach trees & pond-apron willows must require planters
  assert.equal(isPavedTreeSite(-18.2, 24.4), 'heping', 'He-Ping west peach tree sits on concrete');
  assert.equal(isPavedTreeSite(18.2, 24.4), 'heping', 'He-Ping east peach tree sits on concrete');
  assert.ok(isPavedTreeSite(-14.6, 34.4) !== null, 'Pond-apron west willow sits on paved margin');
  assert.ok(isPavedTreeSite(14.6, 34.4) !== null, 'Pond-apron east willow sits on paved margin');
  assert.equal(isPavedTreeSite(-16.0, 39.2), 'granite', 'Pond granite apron sits on paved stone');

  // Natural hillside forest & meadows sit on open earth
  assert.equal(isPavedTreeSite(0, -52.0), null, 'Rear forest is natural earth');
  assert.equal(isPavedTreeSite(-36.0, 20.0), null, 'West meadow is natural grass');
  assert.equal(isPavedTreeSite(42.0, 18.0), null, 'East meadow is natural grass');
});

test('open polyline sampler interpolates monotonically with smooth heading and continuous living blends', () => {
  const path = [
    { x: 0, z: 0 },
    { x: 0, z: 10 },
    { x: 10, z: 10 },
  ];
  const p0 = sampleOpenPolyline(path, 0);
  const pMid = sampleOpenPolyline(path, 0.5);
  const pEnd = sampleOpenPolyline(path, 1);
  assert.ok(Math.abs(p0.x) < 1e-6 && Math.abs(p0.z) < 1e-6);
  assert.ok(Math.abs(pMid.x) < 1e-5 && Math.abs(pMid.z - 10) < 1e-5);
  assert.ok(Math.abs(pEnd.x - 10) < 1e-5 && Math.abs(pEnd.z - 10) < 1e-5);
  assert.ok(Number.isFinite(p0.yaw) && Number.isFinite(pMid.yaw) && Number.isFinite(pEnd.yaw));

  // Progressive grain drying: dawn spreading -> midday full spread -> dusk gathering -> night stowed
  const dawn = evaluateLivingBehavior(7.0, 'sunny');
  const noon = evaluateLivingBehavior(12.0, 'sunny');
  const dusk = evaluateLivingBehavior(17.7, 'sunny');
  const night = evaluateLivingBehavior(22.5, 'sunny');
  const rain = evaluateLivingBehavior(11.0, 'rain');

  assert.ok(dawn.grainSpreadProgress > 0.1 && dawn.grainSpreadProgress < 0.9, 'Dawn grain spread should be in progress');
  assert.ok(noon.grainSpreadProgress > 0.95 && noon.grainMatDeployed > 0.95, 'Midday grain should be fully spread');
  assert.ok(dusk.grainSpreadProgress > 0.05 && dusk.grainSpreadProgress < 0.95, 'Dusk grain should be gathering gradually');
  assert.equal(night.grainSpreadProgress, 0, 'Night grain should be completely gathered');
  assert.equal(night.farmerHomeBlend, 1, 'Farmers should be indoors at night');
  assert.equal(rain.grainSpreadProgress, 0, 'Rain target grain spread should drop to 0');
  assert.ok(rain.grainBasketFill > 0.8, 'Rain target basket fill should be high during rush');
});

test('FreeRoamSystem drives multi-species autonomous roaming, collision safety, social play, and minimap blips', () => {
  const roam = new FreeRoamSystem(2026);
  const aDog = roam.registerAgent('dog_test', ROAM_PROFILES.dog_patrol, -8.0, 28.0, 0);
  const aKid = roam.registerAgent('kid_test', ROAM_PROFILES.child_playful, -6.2, 28.2, Math.PI);
  const aHen = roam.registerAgent('hen_test', ROAM_PROFILES.hen, 9.0, 27.0, 0);
  const aBuffalo = roam.registerAgent('buffalo_test', ROAM_PROFILES.buffalo, 34.0, 10.0, 0);

  const initialPos = new Map([
    [aDog.id, { x: aDog.x, z: aDog.z }],
    [aKid.id, { x: aKid.x, z: aKid.z }],
    [aHen.id, { x: aHen.x, z: aHen.z }],
    [aBuffalo.id, { x: aBuffalo.x, z: aBuffalo.z }],
  ]);

  let sawSocialEpisode = false;
  // Simulate 50 seconds of world time at 10Hz steps
  for (let step = 0; step < 500; step++) {
    roam.update(0.1, true);
    if (aDog.socialPose !== 'none' || aKid.socialPose !== 'none') {
      sawSocialEpisode = true;
    }
    for (const agent of [aDog, aKid, aHen, aBuffalo]) {
      assert.ok(Number.isFinite(agent.x) && Number.isFinite(agent.z), `${agent.id} coordinates must remain finite`);
      assert.ok(Math.abs(agent.x) <= 68 && Math.abs(agent.z) <= 68, `${agent.id} must remain inside world bounds`);
    }
  }

  let movedCount = 0;
  for (const agent of [aDog, aKid, aHen, aBuffalo]) {
    const start = initialPos.get(agent.id)!;
    if (Math.hypot(agent.x - start.x, agent.z - start.z) > 0.4) {
      movedCount++;
    }
  }
  assert.ok(movedCount >= 3, `Expected at least 3 autonomous agents to roam across the map, got ${movedCount}`);
  assert.ok(sawSocialEpisode, 'Dog and child placed near each other should trigger an emergent social/play episode');

  const blips = roam.getMinimapBlips();
  assert.equal(blips.length, 4, 'Minimap blips should mirror all registered autonomous agents');
  for (const blip of blips) {
    assert.ok(Number.isFinite(blip.x) && Number.isFinite(blip.z));
  }
});

