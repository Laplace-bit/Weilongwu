import type { WeatherMode } from '../types/game';
import { normalizeHour } from './dayNightCycle';

export type FarmerTaskState = 'raking' | 'harvest_rush' | 'resting_indoors';
export type FarmerGrainPhase =
  | 'spreading'
  | 'raking'
  | 'gathering'
  | 'rain_gathering'
  | 'walking_home'
  | 'resting_indoors';
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
  // Grain-drying farmers & progressive rice mats
  farmerState: FarmerTaskState;
  farmerPhase: FarmerGrainPhase;
  grainSpreadProgress: number; // 0 = completely gathered/empty mat, 1 = fully spread golden rice bed
  grainBasketFill: number; // 0 = empty basket, 1 = heaped harvest basket
  grainMatDeployed: number; // 0 = rolled neatly against veranda, 1 = unrolled flat on He-Ping
  farmerHomeBlend: number; // 0 = working at drying mats, 1 = resting inside assigned room
  grainMatsCovered: boolean; // Backward-compatible flag: true during rain rush or night stowed
  grainMatsVisible: boolean; // Backward-compatible flag
  // Continuous walk-home / return-to-nest blends (0 = active outdoors, 1 = settled in room/nest)
  villagerHomeBlend: number;
  childHomeBlend: number;
  elderHomeBlend: number;
  washHomeBlend: number;
  teaHomeBlend: number;
  worshipHomeBlend: number;
  huataiHomeBlend: number;
  poultryCoopBlend: number;
  dogKennelBlend: number;
  catNestBlend: number;
  livestockShedBlend: number;
  waterfowlNestBlend: number;
  butterflyPerchBlend: number;
  // Sky birds (white cranes / egrets)
  craneState: CraneFlightState;
  craneRoostBlend: number; // 0 = soaring high in sky, 1 = perched quietly in treetop nests
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
  walkSpeedScale: number;
  // Atmospheric night/dusk life
  skyLanternsActive: boolean;
  firefliesActive: boolean;
  chimneySmokeActive: boolean;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Computes a smooth circadian home-return blend purely from hour:
 * returns 1.0 at night, ramps down 1 -> 0 across [dawnStart, dawnEnd],
 * stays 0.0 during active daytime, ramps up 0 -> 1 across [duskStart, duskEnd].
 */
function circadianReturnBlend(
  h: number,
  dawnStart: number,
  dawnEnd: number,
  duskStart: number,
  duskEnd: number
): number {
  if (h <= dawnStart || h >= duskEnd) return 1.0;
  if (h < dawnEnd) return 1.0 - smoothstep(dawnStart, dawnEnd, h);
  if (h > duskStart) return smoothstep(duskStart, duskEnd, h);
  return 0.0;
}

/**
 * Pure deterministic Time-of-Day + Weather state machine driving all NPCs, wildlife,
 * and progressive grain drying in the Hakka Double-Weilongwu.
 * Every blend is continuous in [0, 1] so both live playback and timeline scrubbing
 * animate smoothly with zero sudden disappearance or teleportation.
 */
export function evaluateLivingBehavior(
  rawHour: number,
  weather: WeatherMode
): LivingBehaviorSnapshot {
  const h = normalizeHour(rawHour);
  const isRain = weather === 'rain';
  const isNight = h < 5.75 || h >= 19.25;
  const isDaylight = !isNight;

  // 1. Progressive Grain-Drying Farmers & Rice Mats (稻谷渐进铺晒与收纳)
  // Sunny timeline:
  //   05:45..06:15 -> farmers walk out from room to He-Ping (farmerHomeBlend 1 -> 0)
  //   06:00..06:25 -> bamboo drying mats unroll (grainMatDeployed 0 -> 1)
  //   06:20..07:30 -> farmers progressively spread grain from baskets onto mats (grainSpreadProgress 0 -> 1)
  //   07:30..17:15 -> full golden rice bed drying & rhythmic turning (grainSpreadProgress = 1)
  //   17:15..18:25 -> farmers progressively rake grain inward into baskets (grainSpreadProgress 1 -> 0)
  //   18:20..18:50 -> emptied mats roll neatly up (grainMatDeployed 1 -> 0)
  //   18:45..19:25 -> farmers carry baskets indoors to rest (farmerHomeBlend 0 -> 1)
  let sunnySpread = 0;
  if (h >= 6.33 && h < 7.5) {
    sunnySpread = smoothstep(6.33, 7.5, h);
  } else if (h >= 7.5 && h <= 17.25) {
    sunnySpread = 1.0;
  } else if (h > 17.25 && h < 18.42) {
    sunnySpread = 1.0 - smoothstep(17.25, 18.42, h);
  }

  let sunnyMatDeployed = 0;
  if (h >= 6.0 && h < 6.4) {
    sunnyMatDeployed = smoothstep(6.0, 6.4, h);
  } else if (h >= 6.4 && h <= 18.35) {
    sunnyMatDeployed = 1.0;
  } else if (h > 18.35 && h < 18.85) {
    sunnyMatDeployed = 1.0 - smoothstep(18.35, 18.85, h);
  }

  const sunnyFarmerHome = circadianReturnBlend(h, 5.75, 6.25, 18.75, 19.35);

  let farmerState: FarmerTaskState = 'resting_indoors';
  let farmerPhase: FarmerGrainPhase = 'resting_indoors';
  let grainSpreadProgress = sunnySpread;
  let grainMatDeployed = sunnyMatDeployed;
  let farmerHomeBlend = sunnyFarmerHome;
  let grainMatsCovered = false;
  let grainMatsVisible = true;

  if (isNight) {
    farmerState = 'resting_indoors';
    farmerPhase = 'resting_indoors';
    grainSpreadProgress = 0.0;
    grainMatDeployed = 0.0;
    farmerHomeBlend = 1.0;
    grainMatsCovered = true;
    grainMatsVisible = false;
  } else if (isRain) {
    // During daytime rain, target grain spread is 0 (raked back into baskets);
    // WeilongScene/livingWorldBuilder smoothly ramps live rain gathering from current spread -> 0!
    grainSpreadProgress = 0.0;
    grainMatDeployed = h >= 6.0 && h < 18.75 ? 0.35 : 0.0;
    farmerState = h >= 6.0 && h < 18.75 ? 'harvest_rush' : 'resting_indoors';
    farmerPhase = h >= 6.0 && h < 18.75 ? 'rain_gathering' : 'resting_indoors';
    farmerHomeBlend = h >= 6.0 && h < 18.75 ? 0.2 : 1.0;
    grainMatsCovered = true;
    grainMatsVisible = true;
  } else if (h >= 6.33 && h < 7.5) {
    farmerState = 'raking';
    farmerPhase = 'spreading';
    grainMatsCovered = false;
    grainMatsVisible = true;
  } else if (h >= 7.5 && h <= 17.25) {
    farmerState = 'raking';
    farmerPhase = 'raking';
    grainMatsCovered = false;
    grainMatsVisible = true;
  } else if (h > 17.25 && h < 18.42) {
    farmerState = 'raking';
    farmerPhase = 'gathering';
    grainMatsCovered = false;
    grainMatsVisible = true;
  } else if (sunnyFarmerHome < 0.95) {
    farmerState = 'resting_indoors';
    farmerPhase = 'walking_home';
    grainMatsCovered = true;
    grainMatsVisible = true;
  } else {
    farmerState = 'resting_indoors';
    farmerPhase = 'resting_indoors';
    grainMatsCovered = true;
    grainMatsVisible = true;
  }

  // Harvest baskets fill inversely to grainSpreadProgress while active outdoors,
  // and remain full as farmers gather & carry them indoors.
  const grainBasketFill = clamp01(1.0 - grainSpreadProgress * 0.88);

  // 2. Continuous NPC Room-Return Blends (0 = outdoors active, 1 = inside assigned room)
  const baseVillagerCircadian = circadianReturnBlend(h, 5.75, 6.75, 18.25, 19.45);
  const villagerHomeBlend = isRain ? Math.max(baseVillagerCircadian, 0.72) : baseVillagerCircadian;
  const childHomeBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 6.15, 7.05, 17.95, 19.05);
  const elderHomeBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 6.0, 6.85, 18.1, 19.15);

  // Pondside laundry women work morning (06:30..11:45) and afternoon (15:15..17:50),
  // walking smoothly back indoors at midday heat, dusk/night, or rain!
  const morningWash = 1.0 - circadianReturnBlend(h, 6.15, 6.8, 11.35, 12.15);
  const afternoonWash = 1.0 - circadianReturnBlend(h, 14.85, 15.5, 17.45, 18.35);
  const washActive = Math.max(morningWash, afternoonWash);
  const washHomeBlend = isRain ? 1.0 : clamp01(1.0 - washActive);

  const teaHomeBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 6.2, 7.1, 18.2, 19.2);
  // Ancestral hall worshipper is already inside Middle Hall — only retires to side room at deep night
  const worshipHomeBlend = circadianReturnBlend(h, 5.9, 6.7, 18.6, 19.5);
  const huataiHomeBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 6.1, 6.95, 18.0, 19.1);

  // 3. Continuous Animal Shelter / Nest Return Blends (0 = active, 1 = inside coop/kennel/shed/nest)
  const poultryCoopBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 5.8, 6.55, 18.0, 18.95);
  const dogKennelBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 5.85, 6.55, 18.4, 19.35);
  const catNestBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 6.0, 6.75, 18.55, 19.5);
  const livestockShedBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 5.9, 6.8, 17.95, 19.05);
  const waterfowlNestBlend = isRain
    ? 0.92
    : circadianReturnBlend(h, 5.85, 6.65, 18.2, 19.2);
  const butterflyPerchBlend = isRain
    ? 1.0
    : circadianReturnBlend(h, 7.0, 7.75, 16.95, 17.85);

  // 4. White cranes / egrets (白鹭/白鹤)
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

  // 5. Butterflies & drifting blossom petals
  const butterfliesActive = !isRain && h >= 7.5 && h <= 17.5;
  const petalsActive = !isRain && h >= 6.0 && h <= 19.5;

  // 6. Poultry (roosters, hens, chicks)
  let poultryState: PoultryActivityState = 'foraging';
  if (isNight || h < 6.0 || h >= 18.75) {
    poultryState = 'roosting';
  } else if (isRain) {
    poultryState = 'sheltering';
  }

  // 7. Pond waterfowl (geese & ducks)
  const waterfowlState: WaterfowlActivityState =
    isNight || h < 6.0 || h >= 19.0 ? 'shore_rest' : 'swimming';

  // 8. Quadrupeds (patrol dog, puppy, cat, buffalo, goats)
  let quadrupedState: QuadrupedActivityState = 'active';
  if (isNight || h < 6.0 || h >= 19.25) {
    quadrupedState = 'sleeping';
  } else if (isRain) {
    quadrupedState = 'sheltering';
  }

  // 9. Walking & storytelling villagers
  let villagerState: VillagerActivityState = 'outdoor_active';
  let walkSpeedScale = 1.0;
  if (isNight || h < 6.0 || h >= 20.0) {
    villagerState = 'night_rest';
    walkSpeedScale = 0.0;
  } else if (isRain) {
    villagerState = 'rain_shelter';
    walkSpeedScale = 0.45;
  } else if (h >= 18.5) {
    villagerState = 'outdoor_active';
    walkSpeedScale = 0.65;
  }

  const villagersCarryUmbrellas = isRain && villagerState !== 'night_rest';

  // 10. Evening/night poetic ambience & Hakka cooking mealtime smoke
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
    farmerPhase,
    grainSpreadProgress,
    grainBasketFill,
    grainMatDeployed,
    farmerHomeBlend,
    grainMatsCovered,
    grainMatsVisible,
    villagerHomeBlend,
    childHomeBlend,
    elderHomeBlend,
    washHomeBlend,
    teaHomeBlend,
    worshipHomeBlend,
    huataiHomeBlend,
    poultryCoopBlend,
    dogKennelBlend,
    catNestBlend,
    livestockShedBlend,
    waterfowlNestBlend,
    butterflyPerchBlend,
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
