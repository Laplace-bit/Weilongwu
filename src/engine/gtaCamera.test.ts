import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GTA_CAMERA_PRESETS,
  computeCameraRelativeMove,
  computeJoystickVector,
  computeSoftFollowYaw,
  computeThirdPersonCameraPose,
  cycleCameraView,
  dampAngle,
  normalizeAngle,
  shortestAngleDelta,
} from './gtaCamera';
import { raycastCameraWalls } from './worldMath';

test('GTA camera view cycle covers all 5 presets in order and wraps cleanly', () => {
  let view = cycleCameraView('third_mid');
  assert.equal(view, 'third_far');
  view = cycleCameraView(view);
  assert.equal(view, 'first_person');
  view = cycleCameraView(view);
  assert.equal(view, 'aerial');
  view = cycleCameraView(view);
  assert.equal(view, 'third_near');
  view = cycleCameraView(view);
  assert.equal(view, 'third_mid');
});

test('shortest-arc angular normalization and damping never spin the long way across +/-PI', () => {
  assert.ok(Math.abs(normalizeAngle(Math.PI * 3) - Math.PI) < 1e-6);
  const delta = shortestAngleDelta(Math.PI * 0.95, -Math.PI * 0.95);
  assert.ok(delta > 0 && delta < 0.35, `Expected small positive wrap delta, got ${delta}`);

  const damped = dampAngle(Math.PI * 0.95, -Math.PI * 0.95, 10, 0.05);
  assert.ok(Math.abs(shortestAngleDelta(damped, Math.PI)) < 0.25);
});

test('GTA camera-relative movement maps WASD relative to camera yaw and computes character facing', () => {
  // Camera looking North (yaw = 0 -> forward = (0, -1), right = (1, 0))
  const fwdNorth = computeCameraRelativeMove(1, 0, 0);
  assert.ok(Math.abs(fwdNorth.moveX) < 1e-6 && Math.abs(fwdNorth.moveZ + 1) < 1e-6);
  assert.ok(fwdNorth.facingYaw !== null && Math.abs(fwdNorth.facingYaw) < 1e-6);

  // Pressing S walks toward camera (+Z), character faces South (PI)
  const backSouth = computeCameraRelativeMove(-1, 0, 0);
  assert.ok(Math.abs(backSouth.moveZ - 1) < 1e-6);
  assert.ok(backSouth.facingYaw !== null && Math.abs(Math.abs(backSouth.facingYaw) - Math.PI) < 1e-5);

  // Camera rotated 90 deg left (yaw = +PI/2 -> looking West (-1, 0)): W moves West!
  const fwdWest = computeCameraRelativeMove(1, 0, Math.PI * 0.5);
  assert.ok(Math.abs(fwdWest.moveX + 1) < 1e-5 && Math.abs(fwdWest.moveZ) < 1e-5);
  assert.ok(
    fwdWest.facingYaw !== null && Math.abs(fwdWest.facingYaw - Math.PI * 0.5) < 1e-5
  );

  // Zero input yields zero velocity and null facingYaw
  const idle = computeCameraRelativeMove(0, 0, 0.8);
  assert.equal(idle.magnitude, 0);
  assert.equal(idle.facingYaw, null);
});

test('GTA soft auto-follow waits after manual orbit and does not fight walking toward camera', () => {
  // Recent manual orbit (< 1.15s) keeps camera untouched
  const locked = computeSoftFollowYaw(0, 1.2, 5.4, 0, 0.5, 0.05);
  assert.equal(locked, 0);

  // After manual orbit cooldown while moving laterally, camera gently turns toward character heading
  const followed = computeSoftFollowYaw(0, 1.2, 5.4, 0, 3.0, 0.2);
  assert.ok(followed > 0.05 && followed < 1.2, `Expected gentle follow toward 1.2, got ${followed}`);

  // Walking straight toward camera (inputForward = -1, diff ~ PI) does NOT whip camera around
  const walkTowardCam = computeSoftFollowYaw(0, Math.PI, 5.4, -1, 4.0, 0.2);
  assert.equal(walkTowardCam, 0);
});

test('GTA third-person camera spring-arm pulls in before walls and stays above ground', () => {
  // Standing just south of the front wall at (6, 23.0), looking North (yaw=0): camera behind player at z=28 is clear
  const openPose = computeThirdPersonCameraPose({
    playerX: 6,
    playerY: 0,
    playerZ: 23.5,
    cameraYaw: 0,
    cameraPitch: -0.2,
    desiredDistance: GTA_CAMERA_PRESETS.third_mid.distance,
    shoulderOffset: 0.28,
    pivotHeight: 1.62,
    lookAhead: 1.1,
    lookBack: false,
    doumenOpen: false,
  });
  assert.equal(openPose.hitWall, false);
  assert.ok(openPose.camZ > 27.5);

  // Standing just north of front wall inside hall at (6, 20.5) facing South (yaw=PI) -> camera behind player would cross front wall at z=21.7
  // Wait: facing North (yaw=0) at (6, 20.5), camera behind player is at +Z (z ~ 25.5), which crosses the solid front wall at z=21.7!
  const wallHit = raycastCameraWalls(6, 20.5, 6, 25.5, false);
  assert.ok(wallHit < 0.3, `Expected wall hit near z=21.7, got t=${wallHit}`);

  const blockedPose = computeThirdPersonCameraPose({
    playerX: 6,
    playerY: 0,
    playerZ: 20.5,
    cameraYaw: 0,
    cameraPitch: -0.15,
    desiredDistance: 5.0,
    shoulderOffset: 0.28,
    pivotHeight: 1.62,
    lookAhead: 1.1,
    lookBack: false,
    doumenOpen: false,
  });
  assert.equal(blockedPose.hitWall, true);
  assert.ok(
    blockedPose.camZ < 21.65,
    `Camera must pull in before wall at z=21.65, got camZ=${blockedPose.camZ.toFixed(2)}`
  );

  // Extreme upward pitch looking at eaves must clamp camera above ground surface
  const lowAngle = computeThirdPersonCameraPose({
    playerX: 0,
    playerY: 0,
    playerZ: 31.0,
    cameraYaw: 0,
    cameraPitch: 0.68,
    desiredDistance: 6.0,
    shoulderOffset: 0,
    pivotHeight: 1.62,
    lookAhead: 1.0,
    lookBack: false,
    doumenOpen: false,
  });
  assert.ok(lowAngle.camY >= 0.41, `Camera must stay above ground, got y=${lowAngle.camY}`);

  // Look-back flips camera to the front of the character
  const lookBackPose = computeThirdPersonCameraPose({
    playerX: 0,
    playerY: 0,
    playerZ: 31.0,
    cameraYaw: 0,
    cameraPitch: -0.1,
    desiredDistance: 5.0,
    shoulderOffset: 0.28,
    pivotHeight: 1.62,
    lookAhead: 1.0,
    lookBack: true,
    doumenOpen: false,
  });
  assert.ok(lookBackPose.camZ < 28.0, 'Look-back camera should move in front of player (-Z)');
});

test('mobile virtual joystick math enforces deadzone, clamping, direction, and rim auto-sprint', () => {
  const insideDeadzone = computeJoystickVector(3, -4, 52, 0.14);
  assert.equal(insideDeadzone.magnitude, 0);
  assert.equal(insideDeadzone.forward, 0);
  assert.equal(insideDeadzone.right, 0);
  assert.equal(insideDeadzone.autoSprint, false);

  // Full push up (-dy) -> forward = +1, autoSprint = true
  const fullUp = computeJoystickVector(0, -80, 52, 0.14);
  assert.ok(Math.abs(fullUp.forward - 1) < 1e-6);
  assert.ok(Math.abs(fullUp.right) < 1e-6);
  assert.equal(fullUp.clampedDy, -52);
  assert.equal(fullUp.autoSprint, true);

  // Half push right -> right > 0, no autoSprint
  const halfRight = computeJoystickVector(26, 0, 52, 0.14);
  assert.ok(halfRight.right > 0.3 && halfRight.right < 0.6);
  assert.equal(halfRight.autoSprint, false);
});
