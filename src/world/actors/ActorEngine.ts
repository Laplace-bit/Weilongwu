import humanConfigs from '../configs/actors_humans.json';
import type {
  ActorConfig,
  EnvState,
  Stimulus,
} from '../types';
import type { SpatialDomainRegistry } from '../domains/ContainerDomain';
import type { StationRegistry } from '../stations/StationRegistry';
import type { StimulusBus } from '../core/StimulusBus';
import { AutonomousBrain } from './controllers/AutonomousBrain';
import { FlockController } from './controllers/FlockController';
import { BoundedMover } from './controllers/BoundedMover';

/**
 * Unified Multi-Tier Actor Engine.
 * Orchestrates T1 AutonomousBrains (villagers/companions), T2 FlockController
 * (hen+chicks Boids, amphibian geese/ducks, sky cranes), and T3 BoundedMover
 * (vat goldfish, pond koi, caged Hwamei, butterflies, fireflies) under a single
 * dual-mode (`seekTo` + `tick`) interface.
 */
export class ActorEngine {
  public readonly t1Brains = new Map<string, AutonomousBrain>();
  public readonly t2Flocks: FlockController;
  public readonly t3Bounded: BoundedMover;

  private readonly domains: SpatialDomainRegistry;
  private readonly stations: StationRegistry;

  constructor(domains: SpatialDomainRegistry, stations: StationRegistry) {
    this.domains = domains;
    this.stations = stations;
    this.t2Flocks = new FlockController(domains);
    this.t3Bounded = new BoundedMover(domains);

    const configs = humanConfigs.actors as unknown as ActorConfig[];
    for (let i = 0; i < configs.length; i++) {
      this.registerT1Actor(configs[i]);
    }
  }

  public registerT1Actor(config: ActorConfig): AutonomousBrain {
    const existing = this.t1Brains.get(config.id);
    if (existing) return existing;
    const brain = new AutonomousBrain(config, this.domains, this.stations);
    this.t1Brains.set(config.id, brain);
    return brain;
  }

  public ensureT1Villager(
    id: string,
    baseX: number,
    baseY: number,
    baseZ: number,
    baseYaw: number,
    hasRainUmbrella = false
  ): AutonomousBrain {
    const existing = this.t1Brains.get(id);
    if (existing) return existing;
    return this.registerT1Actor({
      id,
      name: id,
      species: 'villager',
      tier: 'T1',
      domains: ['ground'],
      basePosition: { x: baseX, y: baseY, z: baseZ },
      baseYaw,
      speed: 1.15,
      hasRainUmbrella,
      schedule: [
        {
          startHour: 6.5,
          endHour: 20.5,
          activity: 'daily_roam',
          rainFallbackActivity: hasRainUmbrella ? 'stroll_with_umbrella' : 'shelter_indoors',
        },
        {
          startHour: 20.5,
          endHour: 6.5,
          activity: 'rest_indoors',
        },
      ],
      reactions: [
        { stimulus: 'BIRD_SONG', action: 'LOOK_AT_SOURCE', durationSec: 2.2, cooldownSec: 5.0 },
        { stimulus: 'PLAYER_NEAR', action: 'GREET_PLAYER', durationSec: 2.0, cooldownSec: 10.0 },
        { stimulus: 'LOUD_ALARM', action: 'LOOK_AT_SOURCE', durationSec: 2.6, cooldownSec: 8.0 },
      ],
    });
  }

  public getT1Brain(id: string): AutonomousBrain | undefined {
    return this.t1Brains.get(id);
  }

  public seekTo(
    env: EnvState,
    poultryLeaderPositions: ReadonlyMap<
      string,
      { x: number; z: number; yaw: number; coopBlend: number }
    >
  ): void {
    this.t1Brains.forEach((brain) => {
      brain.seekTo(env);
    });
    this.t2Flocks.seekTo(env, poultryLeaderPositions);
    this.t3Bounded.seekTo(env);
  }

  public tick(
    dt: number,
    env: EnvState,
    stimuli: readonly Stimulus[],
    stimulusBus: StimulusBus,
    poultryLeaderPositions: ReadonlyMap<
      string,
      { x: number; z: number; yaw: number; coopBlend: number }
    >
  ): void {
    this.t1Brains.forEach((brain) => {
      brain.tick(dt, env, stimuli);
    });
    this.t2Flocks.tick(dt, env, stimuli, poultryLeaderPositions);
    this.t3Bounded.tick(dt, env, stimuli, stimulusBus);
  }
}
