import type { WeatherMode } from '../types/game';

export type SimTier = 'T1' | 'T2' | 'T3';

export type DomainType = 'ground' | 'water' | 'air' | 'container' | 'volume';

export type WeatherType = WeatherMode;

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface EnvState {
  timeOfDay: number;
  timeScale: number;
  weather: WeatherType;
  isPlaying: boolean;
  isScrubbing: boolean;
  doumenOpen: boolean;
  elapsedTime: number;
}

export type StimulusType =
  | 'IMPACT'
  | 'FOOTSTEP_FAST'
  | 'WEATHER_CHANGE'
  | 'BIRD_SONG'
  | 'PLAYER_NEAR'
  | 'LOUD_ALARM'
  | 'FEED';

export interface Stimulus {
  id: number;
  type: StimulusType;
  position: Vec3;
  radius: number;
  intensity: number;
  sourceId: string;
  ttl: number;
  remaining: number;
  payload?: Record<string, string | number | boolean>;
}

export interface StimulusEmitInput {
  type: StimulusType;
  position: Vec3;
  radius: number;
  intensity?: number;
  sourceId: string;
  ttl?: number;
  payload?: Record<string, string | number | boolean>;
}

export type StationCategory =
  | 'work'
  | 'social'
  | 'shelter'
  | 'coop'
  | 'pen'
  | 'nest'
  | 'container'
  | 'interactable';

export interface StationSlotDef {
  slotId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  posture: 'stand' | 'sit' | 'perch' | 'swim' | 'rest';
}

export interface StationDef {
  id: string;
  name: string;
  category: StationCategory;
  zoneId: string;
  sheltered: boolean;
  position: Vec3;
  radius: number;
  interactableId?: string;
  emitStimulusOnInteract?: {
    type: StimulusType;
    radius: number;
    intensity: number;
    ttl: number;
  };
  slots: StationSlotDef[];
}

export interface ScheduleRule {
  startHour: number;
  endHour: number;
  activity: string;
  stationId?: string;
  zoneId?: string;
  domain?: DomainType;
  rainFallbackActivity?: string;
  rainFallbackStationId?: string;
  rainFallbackZoneId?: string;
  rainFallbackDomain?: DomainType;
}

export interface ReactionRule {
  stimulus: StimulusType;
  action:
    | 'OPEN_UMBRELLA_OR_SHELTER'
    | 'GATHER_GRAIN'
    | 'SCATTER_AWAY'
    | 'PANIC_DART_AND_DIVE'
    | 'ATTRACT_FEED'
    | 'LOOK_AT_SOURCE'
    | 'GREET_PLAYER'
    | 'STEER_AWAY'
    | 'ALARM_CLIMB'
    | 'PERCH_HIDE';
  durationSec: number;
  cooldownSec?: number;
  radiusOverride?: number;
}

export interface ActorConfig {
  id: string;
  name: string;
  species:
    | 'villager'
    | 'child'
    | 'dog'
    | 'cat'
    | 'buffalo'
    | 'goat'
    | 'rooster'
    | 'hen'
    | 'chick'
    | 'goose'
    | 'duck'
    | 'crane'
    | 'vat_goldfish'
    | 'pond_koi'
    | 'hwamei'
    | 'butterfly'
    | 'firefly';
  tier: SimTier;
  domains: DomainType[];
  containerId?: string;
  leaderId?: string;
  flockId?: string;
  homeStationId?: string;
  workStationId?: string;
  basePosition: Vec3;
  baseYaw: number;
  speed: number;
  hasRainUmbrella?: boolean;
  schedule: ScheduleRule[];
  reactions: ReactionRule[];
}

export type WaterfowlLocomotionMode = 'swim' | 'waddle' | 'nest';

export type BoundedActorState =
  | 'CRUISE'
  | 'PANIC_DART_AND_DIVE'
  | 'ATTRACT_FEED'
  | 'SINGING'
  | 'PERCHED'
  | 'DORMANT';

export interface ActorRuntimeState {
  id: string;
  tier: SimTier;
  species: ActorConfig['species'];
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  speed: number;
  activeDomain: DomainType;
  activity: string;
  sheltered: boolean;
  umbrellaOpen: boolean;
  waterfowlMode?: WaterfowlLocomotionMode;
  boundedState?: BoundedActorState;
  lookAtTarget?: Vec3 | null;
  lookAtRemaining: number;
  panicRemaining: number;
  scatterRemaining: number;
  scatterDirX: number;
  scatterDirZ: number;
  greetCooldown: number;
  rippleIntensity: number;
  visible: boolean;
  assignedStationId?: string | null;
  assignedSlotId?: string | null;
}

export interface IWorldActor {
  readonly id: string;
  readonly config: ActorConfig;
  readonly state: ActorRuntimeState;
  seekTo(env: EnvState): void;
  tick(dt: number, env: EnvState, stimuli: readonly Stimulus[]): void;
}

export interface GrainMatState {
  spreadProgress: number;
  basketFill: number;
  matDeployed: number;
  isGathering: boolean;
  farmerHomeBlend: number;
  phase: 'stowed' | 'spreading' | 'drying' | 'gathering';
}

export interface WorldMinimapBlip {
  id: string;
  x: number;
  z: number;
  yaw: number;
  kind: 'villager' | 'dog' | 'cat' | 'chicken' | 'livestock' | 'waterfowl';
  playing: boolean;
}

export interface WorldTelemetry {
  timeOfDay: number;
  weather: WeatherType;
  isScrubbing: boolean;
  activeStimulusCount: number;
  activeStimulusTypes: StimulusType[];
  vatFishState: BoundedActorState;
  vatRippleIntensity: number;
  umbrellaOpenCount: number;
  geeseSwimmingCount: number;
  geeseWaddlingCount: number;
  geeseNestingCount: number;
  chicksFollowingCount: number;
  lookAtActiveCount: number;
  firefliesActiveCount: number;
  grainSpread: number;
  grainGathering: boolean;
}
