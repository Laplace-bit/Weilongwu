import type {
  ActorConfig,
  ActorRuntimeState,
  EnvState,
  IWorldActor,
  ScheduleRule,
  Stimulus,
} from '../../types';
import type { SpatialDomainRegistry } from '../../domains/ContainerDomain';
import type { StationRegistry } from '../../stations/StationRegistry';
import { LocomotionRig } from '../LocomotionRig';

function isHourInRange(hour: number, start: number, end: number): boolean {
  if (start <= end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

/**
 * Tier-1 Autonomous Agent Controller (Villagers & Domestic Companions).
 * Combines 24h schedule rules, rain fallback rules, StationRegistry slot
 * locking, and real-time StimulusBus perception interrupts (BIRD_SONG LookAt,
 * PLAYER_NEAR greeting, LOUD_ALARM glance, WEATHER_CHANGE umbrella/shelter).
 */
export class AutonomousBrain implements IWorldActor {
  public readonly id: string;
  public readonly config: ActorConfig;
  public readonly state: ActorRuntimeState;

  private readonly domains: SpatialDomainRegistry;
  private readonly stations: StationRegistry;

  constructor(
    config: ActorConfig,
    domains: SpatialDomainRegistry,
    stations: StationRegistry
  ) {
    this.id = config.id;
    this.config = config;
    this.domains = domains;
    this.stations = stations;
    this.state = {
      id: config.id,
      tier: 'T1',
      species: config.species,
      x: config.basePosition.x,
      y: config.basePosition.y,
      z: config.basePosition.z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: config.baseYaw,
      speed: 0,
      activeDomain: 'ground',
      activity: 'idle',
      sheltered: domains.ground.isSheltered(config.basePosition.x, config.basePosition.z),
      umbrellaOpen: false,
      lookAtTarget: null,
      lookAtRemaining: 0,
      panicRemaining: 0,
      scatterRemaining: 0,
      scatterDirX: 0,
      scatterDirZ: 0,
      greetCooldown: 0,
      rippleIntensity: 0,
      visible: true,
      assignedStationId: null,
      assignedSlotId: null,
    };
  }

  private pickScheduleRule(timeOfDay: number): ScheduleRule | null {
    for (let i = 0; i < this.config.schedule.length; i++) {
      const rule = this.config.schedule[i];
      if (isHourInRange(timeOfDay, rule.startHour, rule.endHour)) {
        return rule;
      }
    }
    return this.config.schedule[0] ?? null;
  }

  public syncExternalPosition(x: number, y: number, z: number, yaw: number, speed: number): void {
    this.state.x = x;
    this.state.y = y;
    this.state.z = z;
    this.state.yaw = yaw;
    this.state.speed = speed;
    this.state.sheltered = this.domains.ground.isSheltered(x, z);
  }

  public seekTo(env: EnvState): void {
    const rule = this.pickScheduleRule(env.timeOfDay);
    const isRain = env.weather === 'rain';
    const activity =
      isRain && rule?.rainFallbackActivity
        ? rule.rainFallbackActivity
        : (rule?.activity ?? 'idle');
    const targetStationId =
      isRain && rule?.rainFallbackStationId
        ? rule.rainFallbackStationId
        : rule?.stationId;

    this.state.activity = activity;
    this.state.lookAtTarget = null;
    this.state.lookAtRemaining = 0;
    this.state.panicRemaining = 0;
    this.state.scatterRemaining = 0;

    if (targetStationId) {
      const slot = this.stations.acquireSlot(targetStationId, this.id);
      if (slot) {
        this.state.x = slot.x;
        this.state.y = slot.y;
        this.state.z = slot.z;
        this.state.yaw = slot.yaw;
        this.state.assignedStationId = targetStationId;
        this.state.assignedSlotId = slot.slotId;
      } else {
        const station = this.stations.getStation(targetStationId);
        if (station) {
          this.state.x = station.position.x;
          this.state.y = station.position.y;
          this.state.z = station.position.z;
          this.state.assignedStationId = targetStationId;
          this.state.assignedSlotId = null;
        }
      }
    } else {
      this.stations.releaseSlot(this.id);
      this.state.assignedStationId = null;
      this.state.assignedSlotId = null;
      this.state.x = this.config.basePosition.x;
      this.state.y = this.config.basePosition.y;
      this.state.z = this.config.basePosition.z;
      this.state.yaw = this.config.baseYaw;
    }

    this.state.sheltered = this.domains.ground.isSheltered(this.state.x, this.state.z);
    const atHomeBlend = this.state.activity === 'rest_indoors' ? 1 : 0;
    this.state.umbrellaOpen = LocomotionRig.shouldOpenUmbrella(
      env.weather,
      this.state.sheltered,
      atHomeBlend,
      Boolean(this.config.hasRainUmbrella)
    );
  }

  public tick(dt: number, env: EnvState, stimuli: readonly Stimulus[]): void {
    if (env.isScrubbing) {
      this.seekTo(env);
      return;
    }

    const rule = this.pickScheduleRule(env.timeOfDay);
    const isRain = env.weather === 'rain';
    this.state.activity =
      isRain && rule?.rainFallbackActivity
        ? rule.rainFallbackActivity
        : (rule?.activity ?? 'idle');

    // Reserve target station slot when active at a station
    const desiredStationId =
      isRain && rule?.rainFallbackStationId
        ? rule.rainFallbackStationId
        : rule?.stationId;
    if (desiredStationId && this.state.assignedStationId !== desiredStationId) {
      const slot = this.stations.acquireSlot(desiredStationId, this.id);
      if (slot) {
        this.state.assignedStationId = desiredStationId;
        this.state.assignedSlotId = slot.slotId;
      }
    } else if (!desiredStationId && this.state.assignedStationId) {
      this.stations.releaseSlot(this.id);
      this.state.assignedStationId = null;
      this.state.assignedSlotId = null;
    }

    // Decay stimulus timers
    if (this.state.lookAtRemaining > 0) {
      this.state.lookAtRemaining = Math.max(0, this.state.lookAtRemaining - dt);
      if (this.state.lookAtRemaining === 0) {
        this.state.lookAtTarget = null;
      }
    }
    if (this.state.greetCooldown > 0) {
      this.state.greetCooldown = Math.max(0, this.state.greetCooldown - dt);
    }

    // Evaluate real-time spatial stimulus interrupts
    for (let i = 0; i < stimuli.length; i++) {
      const s = stimuli[i];
      const dx = s.position.x - this.state.x;
      const dy = s.position.y - (this.state.y + 1.4);
      const dz = s.position.z - this.state.z;
      const dist = Math.hypot(dx, dy, dz);

      if (s.type === 'BIRD_SONG' && dist <= s.radius) {
        // Passing villager hears Hwamei song -> looks up toward birdcage!
        this.state.lookAtTarget = {
          x: s.position.x,
          y: s.position.y,
          z: s.position.z,
        };
        this.state.lookAtRemaining = Math.max(this.state.lookAtRemaining, 2.2);
      } else if (s.type === 'LOUD_ALARM' && dist <= s.radius) {
        this.state.lookAtTarget = {
          x: s.position.x,
          y: s.position.y,
          z: s.position.z,
        };
        this.state.lookAtRemaining = Math.max(this.state.lookAtRemaining, 2.6);
      } else if (s.type === 'IMPACT' && dist <= 5.5) {
        this.state.lookAtTarget = {
          x: s.position.x,
          y: s.position.y,
          z: s.position.z,
        };
        this.state.lookAtRemaining = Math.max(this.state.lookAtRemaining, 1.8);
      } else if (
        s.type === 'PLAYER_NEAR' &&
        dist <= 4.2 &&
        this.state.greetCooldown <= 0 &&
        this.state.lookAtRemaining <= 0.1
      ) {
        this.state.lookAtTarget = {
          x: s.position.x,
          y: s.position.y + 1.5,
          z: s.position.z,
        };
        this.state.lookAtRemaining = 2.0;
        this.state.greetCooldown = 10.0;
      }
    }

    this.state.sheltered = this.domains.ground.isSheltered(this.state.x, this.state.z);
    const atHomeBlend = this.state.activity === 'rest_indoors' ? 1 : 0;
    this.state.umbrellaOpen = LocomotionRig.shouldOpenUmbrella(
      env.weather,
      this.state.sheltered,
      atHomeBlend,
      Boolean(this.config.hasRainUmbrella)
    );
  }
}
