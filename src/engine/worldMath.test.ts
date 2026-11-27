import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRONT_WALL_OUTER_Z,
  groundHeightAt,
  surfaceTypeAt,
  detectNodeIdAt,
  resolvePlayerMovement,
  evaluateJiaobei,
  calculateMasteryProgress,
  sampleInnerWeilongCurve,
  sampleOuterWeilongCurve,
} from './worldMath';
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

test('every room node position maps back to its own node id', () => {
  for (const node of ROOM_NODES) {
    const [x, y, z] = node.spawnPos;
    const detected = detectNodeIdAt(x, z, y);
    assert.equal(
      detected,
      node.id,
      `Location of ${node.id} at (${x}, ${y}, ${z}) detected as ${detected}`
    );
  }
});

test('central South-to-North axis is fully walkable on foot and triggers threshold lift at main gate', () => {
  // Stepping north from He-Ping through Lower Hall main portal
  const step = resolvePlayerMovement(0, FRONT_WALL_OUTER_Z + 0.4, 0, FRONT_WALL_OUTER_Z - 0.4, 0, false);
  assert.equal(step.collided, false, 'Central main portal must be wide open');
  assert.equal(step.crossedThreshold, true, 'Crossing front main portal should trigger threshold step');
  assert.equal(step.y, 0.25);

  // Moving from Lower Hall into Front Skywell
  const toSkywell = resolvePlayerMovement(0, 17.0, 0, 15.8, 0.25, false);
  assert.equal(toSkywell.collided, false, 'Passage into Front Skywell must be open');

  // Moving from Upper Hall side corridor onto Huatai
  const toHuatai = resolvePlayerMovement(6.2, -4.8, 6.2, -6.4, 0.85, false);
  assert.equal(toHuatai.collided, false, 'Upper Hall side passage onto Huatai must be open');
});

test('dynamic front Doumen side gate blocks when closed and opens cleanly when unbolted', () => {
  const blocked = resolvePlayerMovement(16.1, 22.8, 16.1, 21.4, 0, false);
  assert.equal(blocked.collided, true, 'Closed Doumen gate should block passage');

  const opened = resolvePlayerMovement(16.1, 22.8, 16.1, 21.4, 0, true);
  assert.equal(opened.collided, false, 'Opened Doumen gate should allow free walking');
});

test('Jiaobei divination and mastery progress work accurately', () => {
  assert.equal(evaluateJiaobei(0.2, 0.8).type, 'sheng');
  assert.equal(evaluateJiaobei(0.8, 0.9).type, 'xiao');
  assert.equal(evaluateJiaobei(0.1, 0.2).type, 'yin');

  const nodeIds = new Set(ROOM_NODES.map((n) => n.id));
  for (const item of INTERACTABLES) {
    assert.ok(nodeIds.has(item.nodeId), `Interactable ${item.id} references unknown node ${item.nodeId}`);
  }
  assert.equal(calculateMasteryProgress(0, 24, 0, 28, 0, 6), 0);
  assert.equal(calculateMasteryProgress(12, 24, 14, 28, 3, 6), 50);
  assert.equal(calculateMasteryProgress(30, 24, 30, 28, 10, 6), 100);
});
