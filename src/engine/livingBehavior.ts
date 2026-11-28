import type { WeatherMode } from '../types/game';
import { normalizeHour } from './dayNightCycle';

export type FarmerTaskState = 'raking' | 'harvest_rush' | 'resting_indoors';
export type CraneFlightState = 'soaring' | 'descending' | 'roosting';
export type PoultryActivityState = 'foraging' | 'sheltering' | 'roosting';
export type WaterfowlActivityState = 'swimming' | 'shore_rest';
export type QuadrupedActivityState = 'active' | 'sheltering' | 'sleeping';
export type VillagerActivityState = 'outdoor_active' | 'rain_shelter' | 'night_rest';

export interface LivingBehaviorSnapshot {
  timeOfDay: number;
  weather: WeatherMode;
  isNight: boolean;
  isDaylight: boolean;
  // Grain-drying farmers & rice mats
  farmerState: FarmerTaskState;
  grainMatsCovered: boolean; // Rain tarp covering during rain or stowed at night
  grainMatsVisible: boolean; // Mats visible during day/rain rush, stowed/covered at deep night
  // Sky birds (white cranes / egrets)
  craneState: CraneFlightState;
  craneRoostBlend: number; // 0 = soaring high in sky, 1 = perched quietly on rear forest treetops
  // Butterflies & petals
  butterfliesActive: boolean;
  petalsActive: boolean;
  // Ground poultry, pond waterfowl & quadrupeds
  poultryState: PoultryActivityState;
  waterfowlState: WaterfowlActivityState;
  quadrupedState: QuadrupedActivityState;
  // Walking & storytelling villagers
  villagerState: VillagerActivityState;
  villagersCarryUmbrellas: boolean;
  walkSpeedScale: number; // 1.0 active daytime, slowed/sheltered in rain or dusk, paused indoors at night
  // Atmospheric night/dusk life
  skyLanternsActive: boolean;
  firefliesActive: boolean;
  chimneySmokeActive: boolean; // Cooking smoke peaks at morning (6-9), midday (11-13), dinner (17-20)
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Pure deterministic Time-of-Day + Weather finite state machine driving all NPCs and wildlife
 * in the Hakka Double-Weilongwu with realistic circadian schedules and rain reactions.
 */
export function evaluateLivingBehavior(
  rawHour: number,
  weather: WeatherMode
): LivingBehaviorSnapshot {
  const h = normalizeHour(rawHour);
  const isRain = weather === 'rain';
  const isNight = h < 5.75 || h >= 19.25;
  const isDaylight = !isNight;

  // 1. Grain-drying farmers (晒稻谷村民)
  // Sunny daytime (06:30..18:15): turning & raking golden paddy grain on mats
  // Rain during daytime (06:00..18:45): urgent harvest rush — scooping grain & covering mats
  // Night (18:45..06:00) or sunny post-dusk (18:15..06:30): harvest stowed, farmers resting under front eaves
  let farmerState: FarmerTaskState = 'resting_indoors';
  let grainMatsCovered = false;
  let grainMatsVisible = true;

  if (isNight) {
    farmerState = 'resting_indoors';
    grainMatsCovered = true;
    grainMatsVisible = false;
  } else if (isRain) {
    farmerState = h >= 6.0 && h < 18.75 ? 'harvest_rush' : 'resting_indoors';
    grainMatsCovered = true;
    grainMatsVisible = true;
  } else if (h >= 6.5 && h < 18.25) {
    farmerState = 'raking';
    grainMatsCovered = false;
    grainMatsVisible = true;
  } else {
    // Dawn (05:45..06:30) or dusk (18:25..19:15): finishing up / packing away
    farmerState = 'resting_indoors';
    grainMatsCovered = true;
    grainMatsVisible = true;
  }

  // 2. White cranes / egrets (白鹭/白鹤)
  // Smooth roosting transition at dawn (05:30..06:45) and dusk (17:45..19:15) or during rain
  let craneRoostBlend = 0;
  if (isRain) {
    craneRoostBlend = 1.0;
  } else if (h < 5.5 || h >= 19.25) {
    craneRoostBlend = 1.0;
  } else if (h < 6.75) {
    craneRoostBlend = 1.0 - smoothstep(5.5, 6.75, h);
  } else if (h >= 17.75) {
    craneRoostBlend = smoothstep(17.75, 19.25, h);
  }

  let craneState: CraneFlightState = 'soaring';
  if (craneRoostBlend >= 0.92) craneState = 'roosting';
  else if (craneRoostBlend > 0.08) craneState = 'descending';

  // 3. Butterflies & drifting blossom petals
  const butterfliesActive = !isRain && h >= 7.5 && h <= 17.5;
  const petalsActive = !isRain && h >= 6.0 && h <= 19.5;

  // 4. Poultry (roosters, hens, chicks)
  let poultryState: PoultryActivityState = 'foraging';
  if (isNight || h < 6.0 || h >= 18.75) {
    poultryState = 'roosting';
  } else if (isRain) {
    poultryState = 'sheltering';
  }

  // 5. Pond waterfowl (geese & ducks)
  const waterfowlState: WaterfowlActivityState =
    isNight || h < 6.0 || h >= 19.0 ? 'shore_rest' : 'swimming';

  // 6. Quadrupeds (patrol dog, puppy, cat, buffalo, goats)
  let quadrupedState: QuadrupedActivityState = 'active';
  if (isNight || h < 6.0 || h >= 19.25) {
    quadrupedState = 'sleeping';
  } else if (isRain) {
    quadrupedState = 'sheltering';
  }

  // 7. Walking & storytelling villagers
  let villagerState: VillagerActivityState = 'outdoor_active';
  let walkSpeedScale = 1.0;
  if (isNight || h < 6.0 || h >= 20.0) {
    villagerState = 'night_rest';
    walkSpeedScale = 0.0;
  } else if (isRain) {
    villagerState = 'rain_shelter';
    walkSpeedScale = 0.45;
  } else if (h >= 18.5) {
    // Evening stroll slows down as villagers head home
    villagerState = 'outdoor_active';
    walkSpeedScale = 0.65;
  }

  const villagersCarryUmbrellas = isRain && villagerState !== 'night_rest';

  // 8. Evening/night poetic ambience & Hakka cooking mealtime smoke
  const skyLanternsActive = !isRain && (h >= 19.5 || h < 4.5);
  const firefliesActive = !isRain && (h >= 19.0 || h < 5.0);
  const chimneySmokeActive =
    (h >= 6.0 && h <= 8.8) || (h >= 11.0 && h <= 13.5) || (h >= 17.0 && h <= 19.8);

  return {
    timeOfDay: h,
    weather,
    isNight,
    isDaylight,
    farmerState,
    grainMatsCovered,
    grainMatsVisible,
    craneState,
    craneRoostBlend,
    butterfliesActive,
    petalsActive,
    poultryState,
    waterfowlState,
    quadrupedState,
    villagerState,
    villagersCarryUmbrellas,
    walkSpeedScale,
    skyLanternsActive,
    firefliesActive,
    chimneySmokeActive,
  };
}
