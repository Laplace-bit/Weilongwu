import type {
  EnvState,
  GrainMatState,
  Stimulus,
  StimulusType,
  Vec3,
  WeatherType,
  WorldTelemetry,
} from '../types';
import { WorldClock } from './WorldClock';
import { StimulusBus } from './StimulusBus';
import { SpatialDomainRegistry } from '../domains/ContainerDomain';
import { StationRegistry } from '../stations/StationRegistry';
import { GrainMatStation } from '../stations/GrainMatStation';
import { ActorEngine } from '../actors/ActorEngine';

export interface PlayerStimulusContext {
  x: number;
  y: number;
  z: number;
  speed: number;
  isSprinting?: boolean;
}

/**
 * Master Orchestrator for the Unified Living-World Engine.
 * Owns the 5 isolated core layers:
 *   1. WorldClock & EnvState (Single Source of Truth)
 *   2. StimulusBus (Decoupled Spatial Event Queue)
 *   3. SpatialDomainRegistry (Ground / Water / Air / Container hard bounds)
 *   4. StationRegistry + GrainMatStation (Smart activity stations & slot locks)
 *   5. ActorEngine (T1 AutonomousBrain, T2 FlockController, T3 BoundedMover)
 */
export class WorldSimulation {
  public readonly clock: WorldClock;
  public readonly stimuli: StimulusBus;
  public readonly domains: SpatialDomainRegistry;
  public readonly stations: StationRegistry;
  public readonly grainStation: GrainMatStation;
  public readonly actors: ActorEngine;

  private readonly emptyLeaderMap = new Map<
    string,
    { x: number; z: number; yaw: number; coopBlend: number }
  >();
  private initialized = false;

  constructor(initialTime = 10.5, initialWeather: WeatherType = 'sunny') {
    this.clock = new WorldClock({
      timeOfDay: initialTime,
      weather: initialWeather,
    });
    this.stimuli = new StimulusBus();
    this.domains = new SpatialDomainRegistry();
    this.stations = new StationRegistry();
    this.grainStation = new GrainMatStation();
    this.actors = new ActorEngine(this.domains, this.stations);
    this.grainStation.seekTo(initialTime, initialWeather);
  }

  public setScrubbing(active: boolean): void {
    this.clock.setScrubbing(active);
    if (active) {
      this.stimuli.clear();
    }
  }

  public seekTo(
    timeOfDay: number,
    weather?: WeatherType,
    poultryLeaders?: ReadonlyMap<
      string,
      { x: number; z: number; yaw: number; coopBlend: number }
    >
  ): EnvState {
    const env = this.clock.seekTo(timeOfDay, weather);
    this.stimuli.clear();
    const grain = this.grainStation.seekTo(env.timeOfDay, env.weather);
    this.stations.setProgress('station_grain_mat_west', grain.spreadProgress);
    this.stations.setProgress('station_grain_mat_east', grain.spreadProgress);
    this.actors.seekTo(env, poultryLeaders ?? this.emptyLeaderMap);
    this.initialized = true;
    return env;
  }

  /**
   * Emits player proximity (`PLAYER_NEAR`) and fast-footstep (`FOOTSTEP_FAST`)
   * stimuli cleanly onto the bus so poultry scatter and villagers look/greet.
   */
  public emitPlayerStimuli(player?: PlayerStimulusContext | null): void {
    if (!player || this.clock.isScrubbing) return;
    this.stimuli.emit({
      type: 'PLAYER_NEAR',
      position: { x: player.x, y: player.y, z: player.z },
      radius: 4.5,
      intensity: 0.75,
      sourceId: 'player',
      ttl: 0.45,
    });
    if (player.isSprinting || player.speed > 2.35) {
      this.stimuli.emit({
        type: 'FOOTSTEP_FAST',
        position: { x: player.x, y: player.y, z: player.z },
        radius: 3.1,
        intensity: player.isSprinting ? 1.0 : 0.8,
        sourceId: 'player',
        ttl: 0.55,
      });
    }
  }

  /**
   * Decoupled `[E]` interaction entry point.
   */
  public triggerInteraction(interactableId: string, overridePos?: Vec3): Stimulus | null {
    return this.stations.triggerInteraction(interactableId, this.stimuli, overridePos);
  }

  /**
   * Main per-frame update. Automatically switches between deterministic `seekTo`
   * during timeline scrubbing and live `tick` simulation during playback.
   */
  public step(
    dt: number,
    externalTimeOfDay: number,
    externalWeather: WeatherType,
    doumenOpen: boolean,
    poultryLeaders?: ReadonlyMap<
      string,
      { x: number; z: number; yaw: number; coopBlend: number }
    >,
    player?: PlayerStimulusContext | null
  ): { env: EnvState; scrubbed: boolean; grain: GrainMatState } {
    this.clock.setDoumenOpen(doumenOpen);
    const weatherChanged = this.clock.setWeather(externalWeather);
    const timeJumped = this.clock.syncExternalTime(externalTimeOfDay);
    const env = this.clock.advance(dt);
    const scrubJump = this.clock.consumeScrubJump();
    const scrubbed = !this.initialized || env.isScrubbing || timeJumped || scrubJump;
    this.initialized = true;

    const weatherTransition = this.clock.consumeWeatherChange();
    if ((weatherChanged || weatherTransition.changed) && !scrubbed) {
      this.stimuli.emit({
        type: 'WEATHER_CHANGE',
        position: { x: 0, y: 0, z: 20 },
        radius: 999,
        intensity: 1.0,
        sourceId: 'world_clock',
        ttl: 4.5,
        payload: { from: weatherTransition.from, to: weatherTransition.to },
      });
    }

    const leaders = poultryLeaders ?? this.emptyLeaderMap;

    if (scrubbed) {
      this.stimuli.clear();
      const grain = this.grainStation.seekTo(env.timeOfDay, env.weather);
      this.stations.setProgress('station_grain_mat_west', grain.spreadProgress);
      this.stations.setProgress('station_grain_mat_east', grain.spreadProgress);
      this.actors.seekTo(env, leaders);
      return { env, scrubbed: true, grain };
    }

    this.stimuli.tick(dt);
    this.emitPlayerStimuli(player);

    const grain = this.grainStation.tick(dt, env);
    this.stations.setProgress('station_grain_mat_west', grain.spreadProgress);
    this.stations.setProgress('station_grain_mat_east', grain.spreadProgress);

    this.actors.tick(dt, env, this.stimuli.getAll(), this.stimuli, leaders);

    return { env, scrubbed: false, grain };
  }

  public getTelemetry(): WorldTelemetry {
    const env = this.clock.getState();
    const activeStimuli = this.stimuli.getAll();
    const stimulusTypes: StimulusType[] = [];
    for (let i = 0; i < activeStimuli.length; i++) {
      const t = activeStimuli[i].type;
      if (!stimulusTypes.includes(t)) stimulusTypes.push(t);
    }

    let umbrellaOpenCount = 0;
    let lookAtActiveCount = 0;
    this.actors.t1Brains.forEach((b) => {
      if (b.state.umbrellaOpen) umbrellaOpenCount++;
      if (b.state.lookAtRemaining > 0 && b.state.lookAtTarget) lookAtActiveCount++;
    });

    let geeseSwimmingCount = 0;
    let geeseWaddlingCount = 0;
    let geeseNestingCount = 0;
    for (let i = 0; i < this.actors.t2Flocks.waterfowl.length; i++) {
      const m = this.actors.t2Flocks.waterfowl[i].mode;
      if (m === 'swim') geeseSwimmingCount++;
      else if (m === 'waddle') geeseWaddlingCount++;
      else geeseNestingCount++;
    }

    let firefliesActiveCount = 0;
    for (let i = 0; i < this.actors.t3Bounded.fireflies.length; i++) {
      if (this.actors.t3Bounded.fireflies[i].visible) firefliesActiveCount++;
    }

    return {
      timeOfDay: env.timeOfDay,
      weather: env.weather,
      isScrubbing: env.isScrubbing,
      activeStimulusCount: activeStimuli.length,
      activeStimulusTypes: stimulusTypes,
      vatFishState: this.actors.t3Bounded.vatFish.state,
      vatRippleIntensity: this.actors.t3Bounded.vatFish.rippleIntensity,
      umbrellaOpenCount,
      geeseSwimmingCount,
      geeseWaddlingCount,
      geeseNestingCount,
      chicksFollowingCount: this.actors.t2Flocks.chicks.length,
      lookAtActiveCount,
      firefliesActiveCount,
      grainSpread: this.grainStation.spreadProgress,
      grainGathering: this.grainStation.isGathering,
    };
  }
}
