export interface PathPoint2D {
  x: number;
  z: number;
}

export interface PathSample2D {
  x: number;
  z: number;
  yaw: number;
}

export interface FlockSample3D {
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
}

/**
 * Samples a closed polygonal path at normalized phase t in [0, 1) with uniform arc-length speed.
 * Returns world (x, z) and heading yaw where yaw = 0 faces +Z (matching Three.js local +Z forward).
 */
export function sampleClosedLoopPath(
  waypoints: readonly PathPoint2D[],
  phase: number
): PathSample2D {
  const n = waypoints.length;
  if (n === 0) {
    return { x: 0, z: 0, yaw: 0 };
  }
  if (n === 1) {
    return { x: waypoints[0].x, z: waypoints[0].z, yaw: 0 };
  }

  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segLens.push(len);
    totalLen += len;
  }
  if (totalLen <= 1e-6) {
    return { x: waypoints[0].x, z: waypoints[0].z, yaw: 0 };
  }

  const wrapped = ((phase % 1) + 1) % 1;
  let dist = wrapped * totalLen;

  for (let i = 0; i < n; i++) {
    const segLen = segLens[i];
    if (dist <= segLen || i === n - 1) {
      const a = waypoints[i];
      const b = waypoints[(i + 1) % n];
      const f = segLen > 1e-6 ? Math.min(1, Math.max(0, dist / segLen)) : 0;
      const x = a.x + (b.x - a.x) * f;
      const z = a.z + (b.z - a.z) * f;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      return { x, z, yaw };
    }
    dist -= segLen;
  }

  return { x: waypoints[0].x, z: waypoints[0].z, yaw: 0 };
}

export interface OpenPathSample2D {
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
}

/**
 * Samples an open multi-waypoint polyline at normalized progress t in [0, 1] with uniform arc-length speed.
 * Used for continuous walk-home / walk-to-nest routines so actors travel smoothly through doorways
 * without ever teleporting or popping invisible (supports both live play and timeline scrubbing).
 */
export function sampleOpenPolyline(
  waypoints: readonly PathPoint2D[],
  progress: number
): OpenPathSample2D {
  const n = waypoints.length;
  if (n === 0) {
    return { x: 0, z: 0, yaw: 0, moving: false };
  }
  if (n === 1) {
    return { x: waypoints[0].x, z: waypoints[0].z, yaw: 0, moving: false };
  }

  const p = Math.max(0, Math.min(1, progress));
  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segLens.push(len);
    totalLen += len;
  }

  if (totalLen <= 1e-6) {
    return { x: waypoints[0].x, z: waypoints[0].z, yaw: 0, moving: false };
  }

  const moving = p > 0.008 && p < 0.992;
  let dist = p * totalLen;

  for (let i = 0; i < n - 1; i++) {
    const segLen = segLens[i];
    if (dist <= segLen || i === n - 2) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      const f = segLen > 1e-6 ? Math.min(1, Math.max(0, dist / segLen)) : 0;
      const x = a.x + (b.x - a.x) * f;
      const z = a.z + (b.z - a.z) * f;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      return { x, z, yaw, moving };
    }
    dist -= segLen;
  }

  const last = waypoints[n - 1];
  const prev = waypoints[n - 2];
  return {
    x: last.x,
    z: last.z,
    yaw: Math.atan2(last.x - prev.x, last.z - prev.z),
    moving: false,
  };
}

/**
 * Clamps and samples an elliptical swimming loop strictly inside the semicircular Half-Moon Pond
 * (center (0, 38.6), water surface extending south z > 38.6 up to radius (16.2, 10.8)).
 */
export function samplePondSwimPath(
  centerX: number,
  centerZ: number,
  rx: number,
  rz: number,
  angle: number,
  direction: 1 | -1 = 1
): PathSample2D {
  const a = angle * direction;
  let x = centerX + Math.cos(a) * rx;
  let z = centerZ + Math.sin(a) * rz;

  // Keep strictly south of north embankment & stone wash jetty (z >= 39.8)
  if (z < 39.8) z = 39.8;

  // Keep safely inside the curved southern embankment (14.4, 9.2 margin inside 16.2, 10.8)
  const dz = Math.max(0, z - 38.6);
  const normR = Math.hypot(x / 14.4, dz / 9.2);
  if (normR > 1) {
    x /= normR;
    z = 38.6 + dz / normR;
  }

  const dx = -Math.sin(a) * rx * direction;
  const dzVel = Math.cos(a) * rz * direction;
  const yaw = Math.atan2(dx, dzVel);
  return { x, z, yaw };
}

/**
 * Samples a graceful elliptical soaring circle for sky cranes / egrets above the Weilongwu.
 */
export function sampleFlockOrbit(
  centerX: number,
  centerZ: number,
  rx: number,
  rz: number,
  baseAltitude: number,
  phase: number
): FlockSample3D {
  const a = phase * Math.PI * 2;
  const x = centerX + Math.cos(a) * rx;
  const z = centerZ + Math.sin(a) * rz;
  const y = baseAltitude + Math.sin(a * 2) * 1.15;
  const dx = -Math.sin(a) * rx;
  const dz = Math.cos(a) * rz;
  const yaw = Math.atan2(dx, dz);
  const bank = 0.22 + Math.sin(a * 2) * 0.08;
  return { x, y, z, yaw, bank };
}
