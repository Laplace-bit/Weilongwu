import type {
  BoundedActorState,
  EnvState,
  Stimulus,
  Vec3,
} from '../../types';
import type { SpatialDomainRegistry } from '../../domains/ContainerDomain';
import type { StimulusBus } from '../../core/StimulusBus';

export interface VatFishRuntime {
  id: string;
  containerId: string;
  pos: Vec3;
  yaw: number;
  angle: number;
  state: BoundedActorState;
  panicRemaining: number;
  rippleIntensity: number;
  ripplePhase: number;
}

export interface PondKoiRuntime {
  id: string;
  containerId: string;
  pos: Vec3;
  yaw: number;
  orbitAngle: number;
  orbitRadiusX: number;
  orbitRadiusZ: number;
  orbitSpeed: number;
  state: BoundedActorState;
  feedRemaining: number;
  feedTarget: Vec3 | null;
}

export interface ButterflyRuntime {
  id: string;
  pos: Vec3;
  yaw: number;
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phaseOffset: number;
  perchX: number;
  perchY: number;
  perchZ: number;
  perchBlend: number;
  state: BoundedActorState;
}

export interface FireflyRuntime {
  id: string;
  volumeId: string;
  pos: Vec3;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  speed: number;
  intensity: number;
  visible: boolean;
}

export interface HwameiRuntime {
  id: string;
  containerId: string;
  pos: Vec3;
  state: BoundedActorState;
  songTimer: number;
  songActiveRemaining: number;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Tier-3 Container & Micro-Ecology Controller.
 * Zero pathfinding overhead. Every position update ends with an unconditional
 * `domains.containers.clampInPlace()` call so fish, birds, butterflies, and
 * fireflies can NEVER escape their vessel or spatial volume.
 */
export class BoundedMover {
  private readonly domains: SpatialDomainRegistry;
  public readonly vatFish: VatFishRuntime;
  public readonly pondKoi: PondKoiRuntime[] = [];
  public readonly butterflies: ButterflyRuntime[] = [];
  public readonly fireflies: FireflyRuntime[] = [];
  public readonly hwamei: HwameiRuntime;

  constructor(domains: SpatialDomainRegistry) {
    this.domains = domains;

    this.vatFish = {
      id: 'vat_goldfish_0',
      containerId: 'container_skywell_vat',
      pos: { x: -3.48, y: 0.96, z: 13.66 },
      yaw: 0,
      angle: 0,
      state: 'CRUISE',
      panicRemaining: 0,
      rippleIntensity: 0,
      ripplePhase: 0,
    };

    this.hwamei = {
      id: 'hwamei_cage_0',
      containerId: 'container_hwamei_cage',
      pos: { x: 4.92, y: 1.95, z: 14.65 },
      state: 'CRUISE',
      songTimer: 4.5,
      songActiveRemaining: 0,
    };

    // Pre-seed 36 lightweight fireflies across pond-bank and Huatai clear-night volumes
    for (let i = 0; i < 36; i++) {
      const inPond = i < 24;
      const volumeId = inPond ? 'volume_fireflies_pond' : 'volume_fireflies_huatai';
      const angle = (i / (inPond ? 24 : 12)) * Math.PI * 2;
      const baseX = inPond
        ? Math.cos(angle) * (11.5 + (i % 4) * 1.9)
        : Math.cos(angle) * (4.5 + (i % 3) * 2.1);
      const baseZ = inPond
        ? 41.2 + Math.sin(angle) * (3.6 + (i % 3) * 1.2)
        : -16.5 + Math.sin(angle) * 4.2;
      const baseY = inPond ? 0.75 + (i % 4) * 0.42 : 1.75 + (i % 3) * 0.45;
      const pos: Vec3 = { x: baseX, y: baseY, z: baseZ };
      this.domains.containers.clampInPlace(volumeId, pos);
      this.fireflies.push({
        id: `firefly_${i}`,
        volumeId,
        pos,
        baseX: pos.x,
        baseY: pos.y,
        baseZ: pos.z,
        phase: i * 0.73,
        speed: 0.65 + (i % 5) * 0.16,
        intensity: 0,
        visible: false,
      });
    }
  }

  public initPondKoi(count: number): void {
    this.pondKoi.length = 0;
    for (let i = 0; i < count; i++) {
      const rx = 5.4 + (i % 3) * 2.5;
      const rz = 2.6 + (i % 2) * 1.3;
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const pos: Vec3 = {
        x: Math.cos(angle) * rx,
        y: -0.24 - (i % 2) * 0.04,
        z: 42.8 + Math.sin(angle) * rz,
      };
      this.domains.containers.clampInPlace('container_half_moon_pond', pos);
      this.pondKoi.push({
        id: `pond_koi_${i}`,
        containerId: 'container_half_moon_pond',
        pos,
        yaw: angle,
        orbitAngle: angle,
        orbitRadiusX: rx,
        orbitRadiusZ: rz,
        orbitSpeed: 0.24 + (i % 4) * 0.06,
        state: 'CRUISE',
        feedRemaining: 0,
        feedTarget: null,
      });
    }
  }

  public registerButterfly(bf: ButterflyRuntime): void {
    this.butterflies.push(bf);
  }

  public seekTo(env: EnvState): void {
    // 1. Vat goldfish resets calmly to cruise position inside vat cylinder
    this.vatFish.state = 'CRUISE';
    this.vatFish.panicRemaining = 0;
    this.vatFish.rippleIntensity = 0;
    this.vatFish.pos.x = -3.4 + Math.cos(this.vatFish.angle) * 0.18;
    this.vatFish.pos.z = 13.6 + Math.sin(this.vatFish.angle) * 0.18;
    this.vatFish.pos.y = 0.96;
    this.domains.containers.clampInPlace(this.vatFish.containerId, this.vatFish.pos);

    // 2. Pond koi reset calmly to elliptical cruise
    for (let i = 0; i < this.pondKoi.length; i++) {
      const k = this.pondKoi[i];
      k.state = 'CRUISE';
      k.feedRemaining = 0;
      k.feedTarget = null;
      k.pos.x = Math.cos(k.orbitAngle) * k.orbitRadiusX;
      k.pos.z = 42.8 + Math.sin(k.orbitAngle) * k.orbitRadiusZ;
      k.pos.y = -0.24 - (i % 2) * 0.04;
      this.domains.containers.clampInPlace(k.containerId, k.pos);
    }

    // 3. Caged Hwamei perches calmly (sings during daytime only)
    const isDay = env.timeOfDay >= 6.0 && env.timeOfDay <= 19.2;
    this.hwamei.state = isDay ? 'CRUISE' : 'DORMANT';
    this.hwamei.songActiveRemaining = 0;
    this.domains.containers.clampInPlace(this.hwamei.containerId, this.hwamei.pos);

    // 4. Butterflies perch immediately on rain or night
    const shouldPerch =
      env.weather === 'rain' || env.timeOfDay < 6.8 || env.timeOfDay >= 17.8;
    for (let i = 0; i < this.butterflies.length; i++) {
      const bf = this.butterflies[i];
      bf.perchBlend = shouldPerch ? 1 : 0;
      bf.state = shouldPerch ? 'PERCHED' : 'CRUISE';
      if (shouldPerch) {
        bf.pos.x = bf.perchX;
        bf.pos.y = bf.perchY;
        bf.pos.z = bf.perchZ;
      } else {
        const a = env.elapsedTime * bf.speed + bf.phaseOffset;
        bf.pos.x = bf.cx + Math.cos(a) * bf.rx;
        bf.pos.y = bf.cy + Math.sin(a * 2.3) * 0.35;
        bf.pos.z = bf.cz + Math.sin(a * 1.3) * bf.rz;
      }
    }

    // 5. Fireflies strictly active ONLY on clear nights
    const clearNight =
      env.weather === 'sunny' && (env.timeOfDay < 5.5 || env.timeOfDay >= 19.3);
    for (let i = 0; i < this.fireflies.length; i++) {
      const ff = this.fireflies[i];
      ff.visible = clearNight;
      ff.intensity = clearNight ? 0.65 + 0.35 * Math.sin(ff.phase) : 0;
      this.domains.containers.clampInPlace(ff.volumeId, ff.pos);
    }
  }

  public tick(
    dt: number,
    env: EnvState,
    stimuli: readonly Stimulus[],
    stimulusBus: StimulusBus
  ): void {
    if (env.isScrubbing) {
      this.seekTo(env);
      return;
    }

    const safeDt = Math.max(0.001, Math.min(0.05, dt));
    const t = env.elapsedTime;

    // -----------------------------------------------------------------------
    // 1. VAT GOLDFISH: Reacts to `IMPACT` with `PANIC_DART_AND_DIVE` + Ripple!
    // -----------------------------------------------------------------------
    for (let i = 0; i < stimuli.length; i++) {
      const s = stimuli[i];
      if (s.type !== 'IMPACT') continue;
      const dist = Math.hypot(
        s.position.x - this.vatFish.pos.x,
        s.position.z - this.vatFish.pos.z
      );
      if (dist <= s.radius) {
        this.vatFish.state = 'PANIC_DART_AND_DIVE';
        this.vatFish.panicRemaining = Math.max(this.vatFish.panicRemaining, 4.2);
        this.vatFish.rippleIntensity = 1.0;
        this.vatFish.ripplePhase = 0;
      }
    }

    if (this.vatFish.panicRemaining > 0) {
      this.vatFish.panicRemaining = Math.max(0, this.vatFish.panicRemaining - safeDt);
      const panicRatio = this.vatFish.panicRemaining / 4.2;
      // Fast erratic darting + deep dive inside the glazed ceramic water vat!
      const angularSpeed = 4.6 + Math.sin(t * 14.0) * 2.2;
      this.vatFish.angle += safeDt * angularSpeed;
      const r = 0.22 + Math.sin(t * 9.5) * 0.08;
      const targetX = -3.4 + Math.cos(this.vatFish.angle) * r;
      const targetZ = 13.6 + Math.sin(this.vatFish.angle) * r;
      const targetY = 0.96 - 0.17 * Math.sin(Math.min(1, (1 - panicRatio) * 1.4) * Math.PI);
      const dx = targetX - this.vatFish.pos.x;
      const dz = targetZ - this.vatFish.pos.z;
      this.vatFish.pos.x = targetX;
      this.vatFish.pos.z = targetZ;
      this.vatFish.pos.y = damp(this.vatFish.pos.y, targetY, 8.0, safeDt);
      if (Math.hypot(dx, dz) > 1e-4) {
        this.vatFish.yaw = Math.atan2(dx, dz);
      }
      if (this.vatFish.panicRemaining <= 0) {
        this.vatFish.state = 'CRUISE';
      }
    } else {
      this.vatFish.state = 'CRUISE';
      this.vatFish.angle += safeDt * 0.72;
      const r = 0.17 + Math.sin(t * 0.55) * 0.04;
      const targetX = -3.4 + Math.cos(this.vatFish.angle) * r;
      const targetZ = 13.6 + Math.sin(this.vatFish.angle) * r;
      const dx = targetX - this.vatFish.pos.x;
      const dz = targetZ - this.vatFish.pos.z;
      this.vatFish.pos.x = targetX;
      this.vatFish.pos.z = targetZ;
      this.vatFish.pos.y = damp(this.vatFish.pos.y, 0.965, 3.0, safeDt);
      if (Math.hypot(dx, dz) > 1e-4) {
        this.vatFish.yaw = Math.atan2(dx, dz);
      }
    }

    if (this.vatFish.rippleIntensity > 0) {
      this.vatFish.ripplePhase = (this.vatFish.ripplePhase + safeDt * 1.35) % 1;
      this.vatFish.rippleIntensity = Math.max(0, this.vatFish.rippleIntensity - safeDt * 0.34);
    }

    // Hard mathematical clamp: goldfish can NEVER exit the ceramic vat!
    this.domains.containers.clampInPlace(this.vatFish.containerId, this.vatFish.pos);

    // -----------------------------------------------------------------------
    // 2. POND KOI: Cruise in Half-Moon Pond & Converge on `FEED` Stimulus!
    // -----------------------------------------------------------------------
    let feedStimulus: Stimulus | null = null;
    for (let i = 0; i < stimuli.length; i++) {
      if (stimuli[i].type === 'FEED') {
        feedStimulus = stimuli[i];
        break;
      }
    }

    for (let i = 0; i < this.pondKoi.length; i++) {
      const k = this.pondKoi[i];
      if (feedStimulus) {
        k.state = 'ATTRACT_FEED';
        k.feedRemaining = Math.max(k.feedRemaining, 6.5);
        k.feedTarget = {
          x: feedStimulus.position.x + Math.cos(i * 1.3 + t * 1.4) * 1.15,
          y: -0.21,
          z: Math.max(38.4, feedStimulus.position.z + Math.sin(i * 1.3 + t * 1.4) * 0.95),
        };
      }

      if (k.feedRemaining > 0 && k.feedTarget) {
        k.feedRemaining = Math.max(0, k.feedRemaining - safeDt);
        const dx = k.feedTarget.x - k.pos.x;
        const dz = k.feedTarget.z - k.pos.z;
        const d = Math.hypot(dx, dz);
        const speed = 2.1;
        if (d > 0.08) {
          k.pos.x += (dx / d) * Math.min(d, speed * safeDt);
          k.pos.z += (dz / d) * Math.min(d, speed * safeDt);
          k.yaw = Math.atan2(dx, dz);
        }
        k.pos.y = damp(k.pos.y, -0.2, 4.0, safeDt);
        if (k.feedRemaining <= 0) {
          k.state = 'CRUISE';
          k.feedTarget = null;
        }
      } else {
        k.state = 'CRUISE';
        k.orbitAngle += safeDt * k.orbitSpeed;
        const tx = Math.cos(k.orbitAngle) * k.orbitRadiusX;
        const tz = 42.8 + Math.sin(k.orbitAngle) * k.orbitRadiusZ;
        const dx = tx - k.pos.x;
        const dz = tz - k.pos.z;
        k.pos.x = damp(k.pos.x, tx, 2.5, safeDt);
        k.pos.z = damp(k.pos.z, tz, 2.5, safeDt);
        k.pos.y = damp(k.pos.y, -0.24 - (i % 2) * 0.04, 2.5, safeDt);
        if (Math.hypot(dx, dz) > 0.01) {
          k.yaw = Math.atan2(dx, dz);
        }
      }
      this.domains.containers.clampInPlace(k.containerId, k.pos);
    }

    // -----------------------------------------------------------------------
    // 3. CAGED HWAMEI: Emits periodic `BIRD_SONG` stimuli during daytime!
    // -----------------------------------------------------------------------
    const isDay = env.timeOfDay >= 6.0 && env.timeOfDay <= 19.2;
    if (isDay) {
      this.hwamei.songTimer -= safeDt;
      if (this.hwamei.songTimer <= 0) {
        this.hwamei.songTimer = 9.5;
        this.hwamei.songActiveRemaining = 2.8;
        this.hwamei.state = 'SINGING';
        stimulusBus.emit({
          type: 'BIRD_SONG',
          position: this.hwamei.pos,
          radius: 6.2,
          intensity: 0.9,
          sourceId: this.hwamei.id,
          ttl: 2.8,
        });
      }
      if (this.hwamei.songActiveRemaining > 0) {
        this.hwamei.songActiveRemaining = Math.max(0, this.hwamei.songActiveRemaining - safeDt);
        if (this.hwamei.songActiveRemaining <= 0) {
          this.hwamei.state = 'CRUISE';
        }
      }
    } else {
      this.hwamei.state = 'DORMANT';
      this.hwamei.songActiveRemaining = 0;
    }
    this.domains.containers.clampInPlace(this.hwamei.containerId, this.hwamei.pos);

    // -----------------------------------------------------------------------
    // 4. BUTTERFLIES: Flower-volume flutter -> Rain/Night shrub perch
    // -----------------------------------------------------------------------
    const shouldPerch =
      env.weather === 'rain' || env.timeOfDay < 6.8 || env.timeOfDay >= 17.8;
    const targetPerch = shouldPerch ? 1 : 0;
    for (let i = 0; i < this.butterflies.length; i++) {
      const bf = this.butterflies[i];
      bf.perchBlend = damp(bf.perchBlend, targetPerch, 1.9, safeDt);
      bf.state = bf.perchBlend > 0.65 ? 'PERCHED' : 'CRUISE';
      const a = t * bf.speed + bf.phaseOffset;
      const fx = bf.cx + Math.cos(a) * bf.rx;
      const fy = bf.cy + Math.sin(a * 2.3) * 0.35;
      const fz = bf.cz + Math.sin(a * 1.3) * bf.rz;
      bf.pos.x = lerp(fx, bf.perchX, bf.perchBlend);
      bf.pos.y = lerp(fy, bf.perchY, bf.perchBlend);
      bf.pos.z = lerp(fz, bf.perchZ, bf.perchBlend);
      bf.yaw = Math.atan2(-Math.sin(a), Math.cos(a * 1.3));
    }

    // -----------------------------------------------------------------------
    // 5. FIREFLIES: Pond bank & Huatai volumes on clear nights ONLY!
    // -----------------------------------------------------------------------
    const clearNight =
      env.weather === 'sunny' && (env.timeOfDay < 5.5 || env.timeOfDay >= 19.3);
    for (let i = 0; i < this.fireflies.length; i++) {
      const ff = this.fireflies[i];
      ff.visible = clearNight;
      if (!clearNight) {
        ff.intensity = 0;
        continue;
      }
      const p = t * ff.speed + ff.phase;
      ff.pos.x = ff.baseX + Math.sin(p * 1.1) * 1.15;
      ff.pos.y = ff.baseY + Math.sin(p * 1.7 + 0.5) * 0.42;
      ff.pos.z = ff.baseZ + Math.cos(p * 0.9) * 1.05;
      ff.intensity = 0.28 + 0.72 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.4 + ff.phase * 2), 2);
      this.domains.containers.clampInPlace(ff.volumeId, ff.pos);
    }
  }
}
