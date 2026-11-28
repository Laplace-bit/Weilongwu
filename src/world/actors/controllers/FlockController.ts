import type {
  EnvState,
  Stimulus,
  Vec2,
  WaterfowlLocomotionMode,
  WeatherType,
} from '../../types';
import type { SpatialDomainRegistry } from '../../domains/ContainerDomain';
import { samplePondSwimPath } from '../../../engine/livingPaths';

export interface ChickMemberState {
  id: string;
  leaderId: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  phaseOffset: number;
  scatterRemaining: number;
  scatterVx: number;
  scatterVz: number;
  coopX: number;
  coopZ: number;
}

export interface WaterfowlFlockMember {
  id: string;
  kind: 'goose' | 'duck';
  flockId: string;
  isLeader: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  mode: WaterfowlLocomotionMode;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  swimSpeed: number;
  phaseOffset: number;
  dir: 1 | -1;
  shoreBaseX: number;
  shoreBaseZ: number;
  nestX: number;
  nestZ: number;
  nestYaw: number;
  portalId: string;
  modeBlend: number;
}

export interface CraneFlockMember {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
  roostBlend: number;
  alarmClimb: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  alt: number;
  speed: number;
  phaseOffset: number;
  roostX: number;
  roostY: number;
  roostZ: number;
  roostYaw: number;
}

function isInHourWindows(hour: number, windows: readonly [number, number][]): boolean {
  for (let i = 0; i < windows.length; i++) {
    const [start, end] = windows[i];
    if (start <= end) {
      if (hour >= start && hour < end) return true;
    } else if (hour >= start || hour < end) {
      return true;
    }
  }
  return false;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Tier-2 Flock & Amphibian Controller.
 * Drives:
 * 1. Mother Hen + Trailing Chicks with Boids FollowLeader + Pairwise Separation
 *    + `FOOTSTEP_FAST` scatter impulse (never stacking or straying).
 * 2. Half-Moon Pond Geese & Ducks with `ground <-> water` amphibian transitions
 *    through shoreline portals (`waddle` in early morning/dusk, `swim` midday &
 *    in rain, `nest` at night) + `PLAYER_NEAR` gentle steer-away.
 * 3. Sky Cranes orbiting `AirDomain` with treetop nest roosting & `LOUD_ALARM` climb.
 */
export class FlockController {
  public readonly chicks: ChickMemberState[] = [];
  public readonly waterfowl: WaterfowlFlockMember[] = [];
  public readonly cranes: CraneFlockMember[] = [];
  private readonly domains: SpatialDomainRegistry;
  private swimClock = 0;

  constructor(domains: SpatialDomainRegistry) {
    this.domains = domains;
  }

  public registerChick(chick: ChickMemberState): void {
    this.chicks.push(chick);
  }

  public registerWaterfowl(member: WaterfowlFlockMember): void {
    this.waterfowl.push(member);
  }

  public registerCrane(member: CraneFlockMember): void {
    this.cranes.push(member);
  }

  /**
   * Computes desired locomotion mode for a goose/duck from `(timeOfDay, weather)`.
   * - Night (`18:30..06:20`): `nest` inside shoreline reed nests.
   * - Rain during waking hours: `swim` (waterfowl stay lively in the rain!).
   * - Sunny early morning (`06:20..08:30`) or late dusk (`16:30..18:30`): `waddle` on pond bank!
   * - Sunny daytime (`08:30..16:30`): `swim` gracefully on Half-Moon Pond.
   */
  public resolveWaterfowlTargetMode(
    kind: 'goose' | 'duck',
    timeOfDay: number,
    weather: WeatherType
  ): WaterfowlLocomotionMode {
    const nestWindows: [number, number][] =
      kind === 'goose'
        ? [
            [18.4, 24.0],
            [0.0, 6.2],
          ]
        : [
            [18.6, 24.0],
            [0.0, 6.4],
          ];
    if (isInHourWindows(timeOfDay, nestWindows)) {
      return 'nest';
    }
    if (weather === 'rain') {
      return 'swim';
    }
    const waddleWindows: [number, number][] =
      kind === 'goose'
        ? [
            [6.2, 8.6],
            [16.5, 18.4],
          ]
        : [
            [6.4, 8.2],
            [17.0, 18.6],
          ];
    if (isInHourWindows(timeOfDay, waddleWindows)) {
      return 'waddle';
    }
    return 'swim';
  }

  /**
   * Deterministic instant positioning for all T2 flock members during timeline scrub.
   */
  public seekTo(
    env: EnvState,
    leaderPositions: ReadonlyMap<string, { x: number; z: number; yaw: number; coopBlend: number }>
  ): void {
    // 1. Chicks snap cleanly into trailing formation behind their mother hen (or inside coop)
    for (let i = 0; i < this.chicks.length; i++) {
      const c = this.chicks[i];
      const mom = leaderPositions.get(c.leaderId);
      c.scatterRemaining = 0;
      c.scatterVx = 0;
      c.scatterVz = 0;
      if (!mom) continue;

      if (mom.coopBlend > 0.85) {
        c.x = c.coopX;
        c.z = c.coopZ;
        c.yaw = Math.PI * 0.25;
      } else {
        const slotIndex = i % 3;
        const trailDist = 0.55 + slotIndex * 0.26;
        const spreadAngle = (slotIndex - 1) * 0.58;
        const backYaw = mom.yaw + Math.PI + spreadAngle;
        c.x = mom.x + Math.sin(backYaw) * trailDist;
        c.z = mom.z + Math.cos(backYaw) * trailDist;
        c.yaw = mom.yaw;
      }
      c.vx = 0;
      c.vz = 0;
    }

    // 2. Waterfowl snap cleanly to waddle shore, pond swim ellipse, or reed nest
    const t = env.elapsedTime;
    for (let i = 0; i < this.waterfowl.length; i++) {
      const wf = this.waterfowl[i];
      const mode = this.resolveWaterfowlTargetMode(wf.kind, env.timeOfDay, env.weather);
      wf.mode = mode;
      if (mode === 'nest') {
        wf.x = wf.nestX;
        wf.z = wf.nestZ;
        wf.y = -0.14;
        wf.yaw = wf.nestYaw;
        wf.speed = 0;
      } else if (mode === 'waddle') {
        const clamped = this.domains.water.clampToShorePromenade({
          x: wf.shoreBaseX + Math.sin(t * 0.25 + wf.phaseOffset) * 1.4,
          z: wf.shoreBaseZ,
        });
        wf.x = clamped.x;
        wf.z = clamped.z;
        wf.y = 0.0;
        wf.yaw = Math.cos(t * 0.25 + wf.phaseOffset) >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        wf.speed = 0.55;
      } else {
        const sample = samplePondSwimPath(
          wf.cx,
          wf.cz,
          wf.rx,
          wf.rz,
          this.swimClock * wf.swimSpeed + wf.phaseOffset,
          wf.dir
        );
        wf.x = sample.x;
        wf.z = sample.z;
        wf.y = this.domains.water.waterSurfaceY;
        wf.yaw = sample.yaw;
        wf.speed = 0.72;
      }
    }

    // 3. Cranes snap cleanly to sky orbit or treetop nests
    const craneRoost =
      env.weather === 'rain' || env.timeOfDay < 6.0 || env.timeOfDay >= 18.8 ? 1 : 0;
    for (let i = 0; i < this.cranes.length; i++) {
      const cr = this.cranes[i];
      cr.roostBlend = craneRoost;
      cr.alarmClimb = 0;
      if (craneRoost >= 0.99) {
        cr.x = cr.roostX;
        cr.y = cr.roostY;
        cr.z = cr.roostZ;
        cr.yaw = cr.roostYaw;
        cr.bank = 0;
      } else {
        const ang = (t * cr.speed + cr.phaseOffset) * Math.PI * 2;
        cr.x = cr.cx + Math.cos(ang) * cr.rx;
        cr.z = cr.cz + Math.sin(ang) * cr.rz;
        cr.y = cr.alt;
        cr.yaw = Math.atan2(-Math.sin(ang) * cr.rx, Math.cos(ang) * cr.rz);
        cr.bank = -0.18;
      }
    }
  }

  /**
   * Live frame step for T2 chicks (FollowLeader + Boids separation + FOOTSTEP_FAST scatter),
   * amphibian geese/ducks (waddle <-> swim portal transitions + PLAYER_NEAR steer),
   * and sky cranes (orbit + roost + LOUD_ALARM climb).
   */
  public tick(
    dt: number,
    env: EnvState,
    stimuli: readonly Stimulus[],
    leaderPositions: ReadonlyMap<string, { x: number; z: number; yaw: number; coopBlend: number }>
  ): void {
    if (env.isScrubbing) {
      this.seekTo(env, leaderPositions);
      return;
    }

    const safeDt = Math.max(0.001, Math.min(0.05, dt));
    const t = env.elapsedTime;
    this.swimClock += safeDt;

    // -----------------------------------------------------------------------
    // 1. CHICKS: FollowLeader + Boids Separation + FOOTSTEP_FAST Scatter
    // -----------------------------------------------------------------------
    for (let i = 0; i < this.chicks.length; i++) {
      const c = this.chicks[i];
      const mom = leaderPositions.get(c.leaderId);
      if (!mom) continue;

      // React to nearby fast footsteps (player sprint or shoulder-pole carrier)
      for (let sIdx = 0; sIdx < stimuli.length; sIdx++) {
        const s = stimuli[sIdx];
        if (s.type !== 'FOOTSTEP_FAST') continue;
        const dx = c.x - s.position.x;
        const dz = c.z - s.position.z;
        const d = Math.hypot(dx, dz);
        if (d < Math.min(s.radius, 2.9) && d > 0.01) {
          const push = (1 - d / Math.min(s.radius, 2.9)) * 2.4;
          c.scatterVx = (dx / d) * push;
          c.scatterVz = (dz / d) * push;
          c.scatterRemaining = Math.max(c.scatterRemaining, 0.85);
        }
      }

      if (c.scatterRemaining > 0) {
        c.scatterRemaining = Math.max(0, c.scatterRemaining - safeDt);
      }

      // Compute FollowLeader target behind mother hen (tightens cleanly inside coop!)
      const slotIdx = i % 3;
      const inCoop = mom.coopBlend > 0.72;
      const desiredTrailDist = inCoop ? 0.24 : 0.56 + slotIdx * 0.22;
      const spreadAngle = (slotIdx - 1) * (inCoop ? 0.85 : 0.62);
      const backYaw = mom.yaw + Math.PI + spreadAngle;
      const targetX = inCoop
        ? lerp(mom.x + Math.sin(backYaw) * desiredTrailDist, c.coopX, (mom.coopBlend - 0.72) / 0.28)
        : mom.x + Math.sin(backYaw) * desiredTrailDist;
      const targetZ = inCoop
        ? lerp(mom.z + Math.cos(backYaw) * desiredTrailDist, c.coopZ, (mom.coopBlend - 0.72) / 0.28)
        : mom.z + Math.cos(backYaw) * desiredTrailDist;

      let steerX = (targetX - c.x) * 3.1;
      let steerZ = (targetZ - c.z) * 3.1;

      // Pairwise Boids separation so chicks never overlap each other
      const sepRadius = inCoop ? 0.22 : 0.38;
      for (let j = 0; j < this.chicks.length; j++) {
        if (i === j) continue;
        const other = this.chicks[j];
        const dx = c.x - other.x;
        const dz = c.z - other.z;
        const dist = Math.hypot(dx, dz);
        if (dist < sepRadius && dist > 1e-4) {
          const repulse = ((sepRadius - dist) / sepRadius) * 2.8;
          steerX += (dx / dist) * repulse;
          steerZ += (dz / dist) * repulse;
        }
      }

      // Keep slight separation from mother hen's body center so chicks don't clip her legs
      const dmX = c.x - mom.x;
      const dmZ = c.z - mom.z;
      const dm = Math.hypot(dmX, dmZ);
      if (dm < 0.34 && dm > 1e-4) {
        const pushM = ((0.34 - dm) / 0.34) * 2.5;
        steerX += (dmX / dm) * pushM;
        steerZ += (dmZ / dm) * pushM;
      }

      if (c.scatterRemaining > 0 && !inCoop) {
        steerX += c.scatterVx;
        steerZ += c.scatterVz;
      }

      // Clamp speed smoothly
      const maxSpeed = c.scatterRemaining > 0 ? 2.4 : inCoop ? 1.8 : 1.55;
      const steerMag = Math.hypot(steerX, steerZ);
      if (steerMag > maxSpeed) {
        steerX = (steerX / steerMag) * maxSpeed;
        steerZ = (steerZ / steerMag) * maxSpeed;
      }

      c.vx = damp(c.vx, steerX, 7.5, safeDt);
      c.vz = damp(c.vz, steerZ, 7.5, safeDt);
      c.x += c.vx * safeDt;
      c.z += c.vz * safeDt;

      // Hard leash so a chick never loses its mother hen across doors/obstacles
      const leashDist = inCoop ? 0.65 : 1.45;
      const postDx = c.x - mom.x;
      const postDz = c.z - mom.z;
      const postD = Math.hypot(postDx, postDz);
      if (postD > leashDist) {
        c.x = mom.x + (postDx / postD) * leashDist;
        c.z = mom.z + (postDz / postD) * leashDist;
      }

      if (Math.hypot(c.vx, c.vz) > 0.08) {
        c.yaw = Math.atan2(c.vx, c.vz);
      }
    }

    // -----------------------------------------------------------------------
    // 2. WATERFOWL: Amphibian Ground <-> Water Portal Transitions + Separation
    // -----------------------------------------------------------------------
    for (let i = 0; i < this.waterfowl.length; i++) {
      const wf = this.waterfowl[i];
      const desiredMode = this.resolveWaterfowlTargetMode(wf.kind, env.timeOfDay, env.weather);
      const portal = this.domains.water.getPortal(wf.portalId);

      let targetX = wf.x;
      let targetZ = wf.z;
      let targetY = this.domains.water.waterSurfaceY;
      let desiredYaw = wf.yaw;

      if (desiredMode === 'nest') {
        targetX = wf.nestX;
        targetZ = wf.nestZ;
        targetY = -0.14;
        desiredYaw = wf.nestYaw;
      } else if (desiredMode === 'waddle') {
        // Walk onto shore promenade through shoreline portal if currently in pond
        const shoreTarget: Vec2 = this.domains.water.clampToShorePromenade({
          x: wf.shoreBaseX + Math.sin(t * 0.28 + wf.phaseOffset * 2.1) * 2.2,
          z: wf.shoreBaseZ + Math.cos(t * 0.22 + wf.phaseOffset) * 0.45,
        });
        if (wf.z > this.domains.water.frontBankZ + 0.15) {
          targetX = portal.shorePoint.x;
          targetZ = portal.shorePoint.z;
        } else {
          targetX = shoreTarget.x;
          targetZ = shoreTarget.z;
        }
        targetY = 0.0;
      } else {
        // Swim on pond surface; enter via shoreline portal if currently waddling on shore
        const sample = samplePondSwimPath(
          wf.cx,
          wf.cz,
          wf.rx,
          wf.rz,
          this.swimClock * wf.swimSpeed + wf.phaseOffset,
          wf.dir
        );
        if (wf.z < this.domains.water.frontBankZ - 0.15) {
          targetX = portal.waterPoint.x;
          targetZ = portal.waterPoint.z;
        } else {
          targetX = sample.x;
          targetZ = sample.z;
        }
        targetY = this.domains.water.waterSurfaceY;
        desiredYaw = sample.yaw;
      }

      // Pairwise flock separation
      let sepX = 0;
      let sepZ = 0;
      const minSep = wf.kind === 'goose' ? 0.92 : 0.68;
      for (let j = 0; j < this.waterfowl.length; j++) {
        if (i === j) continue;
        const other = this.waterfowl[j];
        const dx = wf.x - other.x;
        const dz = wf.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d < minSep && d > 1e-4) {
          const push = ((minSep - d) / minSep) * 0.9;
          sepX += (dx / d) * push;
          sepZ += (dz / d) * push;
        }
      }

      // Gentle steer-away if player approaches closely while waddling or near shore
      for (let sIdx = 0; sIdx < stimuli.length; sIdx++) {
        const s = stimuli[sIdx];
        if (s.type !== 'PLAYER_NEAR' && s.type !== 'FOOTSTEP_FAST') continue;
        const dx = wf.x - s.position.x;
        const dz = wf.z - s.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.4 && d > 0.01) {
          const push = ((3.4 - d) / 3.4) * 1.35;
          sepX += (dx / d) * push;
          sepZ += (dz / d) * push;
        }
      }

      const moveRate = desiredMode === 'waddle' ? 1.05 : desiredMode === 'nest' ? 1.15 : 1.55;
      const dx = targetX + sepX - wf.x;
      const dz = targetZ + sepZ - wf.z;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, moveRate * safeDt);
      if (dist > 0.01) {
        wf.x += (dx / dist) * step;
        wf.z += (dz / dist) * step;
        wf.speed = step / safeDt;
        if (dist > 0.14) {
          desiredYaw = Math.atan2(dx, dz);
        }
      } else {
        wf.speed = 0;
      }

      // Determine active locomotion mode from actual physical domain (water vs shore vs nest)
      const distToNest = Math.hypot(wf.x - wf.nestX, wf.z - wf.nestZ);
      if (desiredMode === 'nest' && distToNest < 0.75) {
        wf.mode = 'nest';
        wf.y = damp(wf.y, -0.14, 4.0, safeDt);
      } else if (this.domains.water.isInWater(wf.x, wf.z)) {
        wf.mode = 'swim';
        wf.y = damp(wf.y, this.domains.water.waterSurfaceY, 5.0, safeDt);
      } else {
        wf.mode = 'waddle';
        wf.y = damp(wf.y, 0.0, 5.0, safeDt);
      }
      wf.yaw = desiredYaw;
    }

    // -----------------------------------------------------------------------
    // 3. SKY CRANES: AirDomain Orbit + Treetop Nest Roost + LOUD_ALARM Climb
    // -----------------------------------------------------------------------
    let alarmActive = false;
    for (let sIdx = 0; sIdx < stimuli.length; sIdx++) {
      if (stimuli[sIdx].type === 'LOUD_ALARM') {
        alarmActive = true;
        break;
      }
    }
    const targetRoost =
      !alarmActive && (env.weather === 'rain' || env.timeOfDay < 6.0 || env.timeOfDay >= 18.8)
        ? 1
        : 0;

    for (let i = 0; i < this.cranes.length; i++) {
      const cr = this.cranes[i];
      cr.roostBlend = damp(cr.roostBlend, targetRoost, 1.8, safeDt);
      cr.alarmClimb = damp(cr.alarmClimb, alarmActive ? 5.5 : 0, 2.2, safeDt);

      const speedBoost = 1 + (cr.alarmClimb / 5.5) * 0.75;
      const ang = (t * cr.speed * speedBoost + cr.phaseOffset) * Math.PI * 2;
      const orbitX = cr.cx + Math.cos(ang) * cr.rx;
      const orbitZ = cr.cz + Math.sin(ang) * cr.rz;
      const orbitY = Math.min(this.domains.air.maxSafeAltitude, cr.alt + cr.alarmClimb);
      const orbitYaw = Math.atan2(-Math.sin(ang) * cr.rx, Math.cos(ang) * cr.rz);

      const rb = cr.roostBlend;
      cr.x = lerp(orbitX, cr.roostX, rb);
      cr.y = lerp(orbitY, cr.roostY, rb);
      cr.z = lerp(orbitZ, cr.roostZ, rb);
      const yawDiff = Math.atan2(Math.sin(cr.roostYaw - orbitYaw), Math.cos(cr.roostYaw - orbitYaw));
      cr.yaw = orbitYaw + yawDiff * rb;
      cr.bank = -0.18 * (1 - rb);
    }
  }
}
