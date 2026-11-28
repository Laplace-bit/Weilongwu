import type { CameraViewMode } from '../types/game';
import { groundHeightAt, raycastCameraWalls } from './worldMath';

export interface GtaCameraPreset {
  mode: CameraViewMode;
  label: string;
  shortLabel: string;
  distance: number;
  minDistance: number;
  maxDistance: number;
  shoulderOffset: number;
  pivotHeight: number;
  lookAhead: number;
  fov: number;
  sprintFovBoost: number;
  isFirstPerson: boolean;
  isAerial: boolean;
}

export const GTA_CAMERA_ORDER: readonly CameraViewMode[] = [
  'third_mid',
  'third_far',
  'first_person',
  'aerial',
  'third_near',
];

export const GTA_CAMERA_PRESETS: Record<CameraViewMode, GtaCameraPreset> = {
  third_near: {
    mode: 'third_near',
    label: '近距越肩',
    shortLabel: '越肩',
    distance: 3.1,
    minDistance: 2.1,
    maxDistance: 4.4,
    shoulderOffset: 0.42,
    pivotHeight: 1.56,
    lookAhead: 1.4,
    fov: 54,
    sprintFovBoost: 5,
    isFirstPerson: false,
    isAerial: false,
  },
  third_mid: {
    mode: 'third_mid',
    label: '标准跟随',
    shortLabel: '标准',
    distance: 5.0,
    minDistance: 2.6,
    maxDistance: 7.4,
    shoulderOffset: 0.28,
    pivotHeight: 1.62,
    lookAhead: 1.1,
    fov: 56,
    sprintFovBoost: 6,
    isFirstPerson: false,
    isAerial: false,
  },
  third_far: {
    mode: 'third_far',
    label: '广角全景',
    shortLabel: '广角',
    distance: 8.0,
    minDistance: 4.8,
    maxDistance: 12.0,
    shoulderOffset: 0.0,
    pivotHeight: 1.72,
    lookAhead: 0.8,
    fov: 58,
    sprintFovBoost: 5,
    isFirstPerson: false,
    isAerial: false,
  },
  first_person: {
    mode: 'first_person',
    label: '第一人称',
    shortLabel: '第一人称',
    distance: 0,
    minDistance: 0,
    maxDistance: 0,
    shoulderOffset: 0,
    pivotHeight: 1.66,
    lookAhead: 0,
    fov: 60,
    sprintFovBoost: 5,
    isFirstPerson: true,
    isAerial: false,
  },
  aerial: {
    mode: 'aerial',
    label: '航拍俯瞰',
    shortLabel: '航拍',
    distance: 72,
    minDistance: 28,
    maxDistance: 105,
    shoulderOffset: 0,
    pivotHeight: 2.5,
    lookAhead: 0,
    fov: 46,
    sprintFovBoost: 0,
    isFirstPerson: false,
    isAerial: true,
  },
};

export function cycleCameraView(current: CameraViewMode): CameraViewMode {
  const idx = GTA_CAMERA_ORDER.indexOf(current);
  if (idx < 0) return 'third_mid';
  return GTA_CAMERA_ORDER[(idx + 1) % GTA_CAMERA_ORDER.length];
}

/**
 * Normalizes an angle in radians to the canonical range (-PI, PI].
 */
export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Returns the signed shortest angular delta from `from` to `to` in (-PI, PI].
 */
export function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

/**
 * Frame-rate independent shortest-arc exponential angular damping.
 */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const delta = shortestAngleDelta(current, target);
  const alpha = 1 - Math.exp(-lambda * Math.max(0, dt));
  return normalizeAngle(current + delta * alpha);
}

export interface CameraRelativeMoveResult {
  moveX: number;
  moveZ: number;
  magnitude: number;
  facingYaw: number | null;
}

/**
 * Converts local movement intents (inputForward in [-1, 1], inputRight in [-1, 1])
 * into world-space XZ movement relative to the GTA camera's yaw (where yaw = 0 looks toward -Z North).
 * Also returns the character's target facing yaw matching the travel vector.
 */
export function computeCameraRelativeMove(
  inputForward: number,
  inputRight: number,
  cameraYaw: number
): CameraRelativeMoveResult {
  const rawMag = Math.hypot(inputForward, inputRight);
  if (rawMag < 1e-4) {
    return { moveX: 0, moveZ: 0, magnitude: 0, facingYaw: null };
  }

  const clampedMag = Math.min(1, rawMag);
  const nf = inputForward / rawMag;
  const nr = inputRight / rawMag;

  // Camera forward on XZ when yaw=0 is (0, -1); right is (1, 0)
  const sinY = Math.sin(cameraYaw);
  const cosY = Math.cos(cameraYaw);
  const fwdX = -sinY;
  const fwdZ = -cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  const moveX = (fwdX * nf + rightX * nr) * clampedMag;
  const moveZ = (fwdZ * nf + rightZ * nr) * clampedMag;

  // Facing yaw convention: yaw = atan2(-dirX, -dirZ) so facing -Z => yaw = 0
  const facingYaw = normalizeAngle(Math.atan2(-moveX, -moveZ));
  return { moveX, moveZ, magnitude: clampedMag, facingYaw };
}

/**
 * Authentic GTA soft auto-follow camera re-centering:
 * When the player is moving laterally/forward and hasn't manually orbited the camera recently,
 * gently aligns the camera behind the character's heading. Walking straight toward the camera (S)
 * does NOT aggressively whip the camera around so the player can inspect the character's front.
 */
export function computeSoftFollowYaw(
  cameraYaw: number,
  characterYaw: number,
  horizSpeed: number,
  inputForward: number,
  timeSinceManualOrbit: number,
  dt: number
): number {
  if (horizSpeed < 0.6 || timeSinceManualOrbit < 1.15) {
    return cameraYaw;
  }
  // Classic GTA: when walking straight back toward the camera (holding S), don't force-spin camera 180°
  const angleDiff = Math.abs(shortestAngleDelta(cameraYaw, characterYaw));
  if (inputForward < -0.55 && angleDiff > Math.PI * 0.72) {
    return cameraYaw;
  }

  const ramp = Math.min(1, (timeSinceManualOrbit - 1.15) / 1.2);
  const speedWeight = Math.min(1, horizSpeed / 5.4);
  const followRate = 1.35 * ramp * speedWeight;
  return dampAngle(cameraYaw, characterYaw, followRate, dt);
}

export interface ThirdPersonCameraInput {
  playerX: number;
  playerY: number;
  playerZ: number;
  cameraYaw: number;
  cameraPitch: number;
  desiredDistance: number;
  shoulderOffset: number;
  pivotHeight: number;
  lookAhead: number;
  lookBack: boolean;
  doumenOpen: boolean;
}

export interface ThirdPersonCameraPose {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  resolvedDistance: number;
  hitWall: boolean;
}

/**
 * Computes the GTA third-person orbit camera position & look target with:
 * - Over-the-shoulder right offset
 * - Optional rear-view look-back flip (holding B / middle mouse / mobile look-back)
 * - Wall collision raycast pull-in against architectural masonry & curved Weilong walls
 * - Terrain/floor ground clearance clamp so the camera never dips underground
 */
export function computeThirdPersonCameraPose(
  input: ThirdPersonCameraInput
): ThirdPersonCameraPose {
  const effectiveYaw = input.lookBack
    ? normalizeAngle(input.cameraYaw + Math.PI)
    : input.cameraYaw;
  // Positive pitch looks up (camera drops behind/below), negative pitch looks down (camera rises above)
  const clampedPitch = Math.max(-0.92, Math.min(0.68, input.cameraPitch));

  const sinY = Math.sin(effectiveYaw);
  const cosY = Math.cos(effectiveYaw);
  const cosP = Math.cos(clampedPitch);
  const sinP = Math.sin(clampedPitch);

  // Direction camera looks (unit vector): forward = (-sinY * cosP, sinP, -cosY * cosP)
  // Camera sits opposite the look vector behind the pivot
  const backX = sinY * cosP;
  const backY = -sinP;
  const backZ = cosY * cosP;

  // Shoulder offset to the camera's right: right = (cosY, 0, -sinY)
  const rightX = cosY;
  const rightZ = -sinY;
  const shoulder = input.lookBack ? 0 : input.shoulderOffset;

  const pivotX = input.playerX;
  const pivotY = input.playerY + input.pivotHeight;
  const pivotZ = input.playerZ;

  // First check shoulder offset clearance from player center
  const shoulderTargetX = pivotX + rightX * shoulder;
  const shoulderTargetZ = pivotZ + rightZ * shoulder;
  const shoulderFrac =
    Math.abs(shoulder) > 0.01
      ? raycastCameraWalls(pivotX, pivotZ, shoulderTargetX, shoulderTargetZ, input.doumenOpen, 0.25)
      : 1;
  const safePivotX = pivotX + (shoulderTargetX - pivotX) * shoulderFrac;
  const safePivotZ = pivotZ + (shoulderTargetZ - pivotZ) * shoulderFrac;

  // Desired unoccluded camera position
  const rawCamX = safePivotX + backX * input.desiredDistance;
  const rawCamY = pivotY + backY * input.desiredDistance;
  const rawCamZ = safePivotZ + backZ * input.desiredDistance;

  // Raycast along horizontal arm against walls to prevent clipping behind rooms/doorways
  const wallFrac = raycastCameraWalls(
    safePivotX,
    safePivotZ,
    rawCamX,
    rawCamZ,
    input.doumenOpen,
    0.34
  );

  const minArmFrac = Math.min(1, 0.55 / Math.max(0.55, input.desiredDistance));
  const clampedFrac = Math.max(minArmFrac, wallFrac);
  const resolvedDistance = input.desiredDistance * clampedFrac;

  const camX = safePivotX + backX * resolvedDistance;
  const camZ = safePivotZ + backZ * resolvedDistance;
  let camY = pivotY + backY * resolvedDistance;

  // Never dip below local ground/floor surface at camera XZ
  const floorAtCam = groundHeightAt(camX, camZ, input.playerY);
  const minCamY = floorAtCam + 0.42;
  if (camY < minCamY) {
    camY = minCamY;
  }

  // Look slightly ahead of the pivot along the view direction (GTA over-the-shoulder aim framing)
  const lookX = safePivotX - sinY * cosP * input.lookAhead;
  const lookY = pivotY + sinP * input.lookAhead * 0.45;
  const lookZ = safePivotZ - cosY * cosP * input.lookAhead;

  return {
    camX,
    camY,
    camZ,
    lookX,
    lookY,
    lookZ,
    resolvedDistance,
    hitWall: wallFrac < 0.995,
  };
}

export interface JoystickVector {
  right: number;
  forward: number;
  magnitude: number;
  clampedDx: number;
  clampedDy: number;
  autoSprint: boolean;
}

/**
 * Pure virtual analog joystick math for mobile touch controls.
 * Screen coordinates: +dx = right, -dy = up (forward).
 */
export function computeJoystickVector(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone = 0.14
): JoystickVector {
  const safeMax = Math.max(1, maxRadius);
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, safeMax);
  const scale = dist > 1e-4 ? clampedDist / dist : 0;
  const clampedDx = dx * scale;
  const clampedDy = dy * scale;

  const normDist = clampedDist / safeMax;
  if (normDist <= deadzone) {
    return {
      right: 0,
      forward: 0,
      magnitude: 0,
      clampedDx,
      clampedDy,
      autoSprint: false,
    };
  }

  const effectiveMag = (normDist - deadzone) / (1 - deadzone);
  const nx = clampedDx / clampedDist;
  const ny = clampedDy / clampedDist;

  return {
    right: nx * effectiveMag,
    forward: -ny * effectiveMag,
    magnitude: effectiveMag,
    clampedDx,
    clampedDy,
    autoSprint: normDist >= 0.96,
  };
}
