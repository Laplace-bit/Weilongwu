import { resolveEntityCollision } from './worldMath';

/**
 * Abstracted, Reusable Whole-Map Free-Roam & Social Play Engine (`FreeRoamSystem`).
 * Shared across all Hakka villagers, children, elders, dogs, puppies, cats, poultry,
 * goats, and water buffalo — each species/role configured via distinct RoamProfile
 * coefficients and weighted semantic map zones.
 *
 * Guarantees:
 * - Zero fixed monotonous loops: continuously chooses fresh organic destinations across allowed zones
 * - Portal-aware multi-zone navigation: automatically queues open doorway waypoints when crossing buildings
 * - Physical collision integrity: every movement step runs through `resolveEntityCollision()`
 * - Emergent social & play interactions: dogs trot up to play with villagers/children, children chase
 *   each other or the puppy, villagers stop to chat, poultry flock & peck together
 */

export type RoamZoneId =
  | 'heping'
  | 'pond_bank'
  | 'front_hall'
  | 'skywells'
  | 'huatai'
  | 'west_meadow'
  | 'east_meadow'
  | 'south_meadow'
  | 'west_veranda'
  | 'east_veranda';

export type RoamSpeciesKind =
  | 'villager'
  | 'child'
  | 'dog'
  | 'puppy'
  | 'cat'
  | 'poultry'
  | 'goat'
  | 'buffalo';

export type SocialPlayPose =
  | 'none'
  | 'chat'
  | 'dog_play'
  | 'pet_dog'
  | 'chase_play'
  | 'flock_peck'
  | 'curious_sniff';

export interface RoamProfile {
  id: string;
  species: RoamSpeciesKind;
  /** Base comfortable walking/trotting speed (m/s) */
  speed: number;
  /** Multiplier applied during playful chases or eager greetings */
  sprintFactor: number;
  /** Angular steering responsiveness (rad/s) */
  turnRate: number;
  /** Collision radius passed to resolveEntityCollision */
  radius: number;
  /** Min/max curious pause duration upon reaching a destination (seconds) */
  pauseMin: number;
  pauseMax: number;
  /** Typical wander reach per leg (meters) */
  wanderRadius: number;
  /** 0..1 tendency to venture into a different map zone on the next goal pick */
  curiosity: number;
  /** 0..1 likelihood to initiate social greeting/play when near a compatible actor */
  socialAffinity: number;
  /** 0..1 energy level during social play (orbiting, wagging, chasing) */
  playfulness: number;
  /** Weighted semantic map zones this species/role naturally explores */
  zoneWeights: Partial<Record<RoamZoneId, number>>;
}

interface ZoneBounds {
  id: RoamZoneId;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  indoor: boolean;
  entryGate: { x: number; z: number };
}

export const MAP_ROAM_ZONES: Record<RoamZoneId, ZoneBounds> = {
  heping: {
    id: 'heping',
    minX: -18.5,
    maxX: 18.5,
    minZ: 23.2,
    maxZ: 35.4,
    indoor: false,
    entryGate: { x: 0, z: 24.5 },
  },
  pond_bank: {
    id: 'pond_bank',
    minX: -16.2,
    maxX: 16.2,
    minZ: 36.6,
    maxZ: 38.0,
    indoor: false,
    entryGate: { x: 0, z: 36.8 },
  },
  front_hall: {
    id: 'front_hall',
    minX: -9.5,
    maxX: 9.5,
    minZ: 17.6,
    maxZ: 20.6,
    indoor: true,
    entryGate: { x: 0, z: 20.0 },
  },
  skywells: {
    id: 'skywells',
    minX: -6.5,
    maxX: 6.5,
    minZ: 1.5,
    maxZ: 15.2,
    indoor: true,
    entryGate: { x: 0, z: 13.5 },
  },
  huatai: {
    id: 'huatai',
    minX: -12.5,
    maxX: 12.5,
    minZ: -17.2,
    maxZ: -7.6,
    indoor: true,
    entryGate: { x: 0, z: -9.5 },
  },
  west_veranda: {
    id: 'west_veranda',
    minX: -24.5,
    maxX: -12.5,
    minZ: 22.8,
    maxZ: 34.8,
    indoor: false,
    entryGate: { x: -16.0, z: 25.0 },
  },
  east_veranda: {
    id: 'east_veranda',
    minX: 12.5,
    maxX: 24.5,
    minZ: 22.8,
    maxZ: 34.8,
    indoor: false,
    entryGate: { x: 16.0, z: 25.0 },
  },
  west_meadow: {
    id: 'west_meadow',
    minX: -34.5,
    maxX: -20.5,
    minZ: 36.2,
    maxZ: 49.5,
    indoor: false,
    entryGate: { x: -24.0, z: 38.0 },
  },
  east_meadow: {
    id: 'east_meadow',
    minX: 20.5,
    maxX: 34.5,
    minZ: 36.2,
    maxZ: 49.5,
    indoor: false,
    entryGate: { x: 24.0, z: 38.0 },
  },
  south_meadow: {
    id: 'south_meadow',
    minX: -22.0,
    maxX: 22.0,
    minZ: 51.2,
    maxZ: 56.5,
    indoor: false,
    entryGate: { x: 17.5, z: 51.5 },
  },
};

export const ROAM_PROFILES: Record<string, RoamProfile> = {
  villager_stroll: {
    id: 'villager_stroll',
    species: 'villager',
    speed: 1.28,
    sprintFactor: 1.22,
    turnRate: 4.5,
    radius: 0.42,
    pauseMin: 1.8,
    pauseMax: 4.6,
    wanderRadius: 15.0,
    curiosity: 0.68,
    socialAffinity: 0.62,
    playfulness: 0.35,
    zoneWeights: {
      heping: 3.0,
      pond_bank: 1.4,
      front_hall: 1.4,
      skywells: 1.8,
      huatai: 2.2,
      west_veranda: 1.5,
      east_veranda: 1.5,
    },
  },
  villager_elder: {
    id: 'villager_elder',
    species: 'villager',
    speed: 0.78,
    sprintFactor: 1.05,
    turnRate: 3.2,
    radius: 0.42,
    pauseMin: 3.5,
    pauseMax: 7.5,
    wanderRadius: 8.5,
    curiosity: 0.35,
    socialAffinity: 0.72,
    playfulness: 0.25,
    zoneWeights: {
      heping: 2.6,
      front_hall: 2.0,
      skywells: 1.4,
      west_veranda: 1.4,
      east_veranda: 1.4,
    },
  },
  child_playful: {
    id: 'child_playful',
    species: 'child',
    speed: 2.15,
    sprintFactor: 1.42,
    turnRate: 7.2,
    radius: 0.32,
    pauseMin: 0.6,
    pauseMax: 1.9,
    wanderRadius: 14.0,
    curiosity: 0.78,
    socialAffinity: 0.88,
    playfulness: 0.94,
    zoneWeights: {
      heping: 3.6,
      west_veranda: 1.6,
      east_veranda: 1.6,
      pond_bank: 1.2,
      front_hall: 1.0,
      skywells: 1.1,
      huatai: 1.4,
    },
  },
  dog_patrol: {
    id: 'dog_patrol',
    species: 'dog',
    speed: 2.25,
    sprintFactor: 1.48,
    turnRate: 6.8,
    radius: 0.36,
    pauseMin: 1.0,
    pauseMax: 2.8,
    wanderRadius: 18.0,
    curiosity: 0.84,
    socialAffinity: 0.82,
    playfulness: 0.82,
    zoneWeights: {
      heping: 3.2,
      west_veranda: 2.0,
      east_veranda: 2.0,
      pond_bank: 1.8,
      west_meadow: 1.4,
      east_meadow: 1.4,
      front_hall: 1.0,
      skywells: 1.2,
      huatai: 1.4,
    },
  },
  puppy_playful: {
    id: 'puppy_playful',
    species: 'puppy',
    speed: 2.05,
    sprintFactor: 1.55,
    turnRate: 8.5,
    radius: 0.26,
    pauseMin: 0.5,
    pauseMax: 1.7,
    wanderRadius: 12.0,
    curiosity: 0.82,
    socialAffinity: 0.92,
    playfulness: 0.96,
    zoneWeights: {
      heping: 4.0,
      west_veranda: 1.8,
      east_veranda: 1.8,
      pond_bank: 1.4,
      front_hall: 1.0,
      huatai: 1.0,
    },
  },
  cat_curious: {
    id: 'cat_curious',
    species: 'cat',
    speed: 0.98,
    sprintFactor: 1.45,
    turnRate: 5.5,
    radius: 0.24,
    pauseMin: 3.2,
    pauseMax: 8.0,
    wanderRadius: 9.5,
    curiosity: 0.55,
    socialAffinity: 0.34,
    playfulness: 0.45,
    zoneWeights: {
      heping: 2.2,
      front_hall: 2.6,
      skywells: 2.0,
      west_veranda: 1.8,
      east_veranda: 1.8,
      huatai: 1.4,
    },
  },
  rooster: {
    id: 'rooster',
    species: 'poultry',
    speed: 0.88,
    sprintFactor: 1.4,
    turnRate: 6.2,
    radius: 0.24,
    pauseMin: 1.2,
    pauseMax: 3.6,
    wanderRadius: 10.0,
    curiosity: 0.58,
    socialAffinity: 0.65,
    playfulness: 0.48,
    zoneWeights: {
      heping: 3.0,
      east_veranda: 2.6,
      west_veranda: 2.0,
      huatai: 1.8,
      east_meadow: 1.0,
    },
  },
  hen: {
    id: 'hen',
    species: 'poultry',
    speed: 0.72,
    sprintFactor: 1.35,
    turnRate: 5.8,
    radius: 0.22,
    pauseMin: 1.4,
    pauseMax: 4.2,
    wanderRadius: 8.5,
    curiosity: 0.48,
    socialAffinity: 0.72,
    playfulness: 0.38,
    zoneWeights: {
      heping: 2.8,
      east_veranda: 2.8,
      west_veranda: 1.8,
      huatai: 2.0,
    },
  },
  chick: {
    id: 'chick',
    species: 'poultry',
    speed: 0.96,
    sprintFactor: 1.48,
    turnRate: 8.2,
    radius: 0.16,
    pauseMin: 0.6,
    pauseMax: 2.0,
    wanderRadius: 6.0,
    curiosity: 0.42,
    socialAffinity: 0.88,
    playfulness: 0.78,
    zoneWeights: {
      heping: 2.8,
      east_veranda: 3.0,
      huatai: 1.8,
    },
  },
  goat: {
    id: 'goat',
    species: 'goat',
    speed: 0.92,
    sprintFactor: 1.35,
    turnRate: 4.2,
    radius: 0.48,
    pauseMin: 2.5,
    pauseMax: 6.5,
    wanderRadius: 11.0,
    curiosity: 0.55,
    socialAffinity: 0.52,
    playfulness: 0.44,
    zoneWeights: {
      west_meadow: 4.0,
      west_veranda: 1.2,
      south_meadow: 1.4,
    },
  },
  buffalo: {
    id: 'buffalo',
    species: 'buffalo',
    speed: 0.56,
    sprintFactor: 1.15,
    turnRate: 2.2,
    radius: 0.82,
    pauseMin: 4.5,
    pauseMax: 10.0,
    wanderRadius: 9.0,
    curiosity: 0.36,
    socialAffinity: 0.25,
    playfulness: 0.12,
    zoneWeights: {
      east_meadow: 4.5,
      south_meadow: 1.2,
    },
  },
};

export interface RoamAgentState {
  id: string;
  profile: RoamProfile;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  zone: RoamZoneId;
  waypoints: Array<{ x: number; z: number }>;
  pauseTimer: number;
  stuckTimer: number;
  socialPartnerId: string | null;
  socialPose: SocialPlayPose;
  socialTimer: number;
  socialCooldown: number;
  orbitAngle: number;
  /** True when the actor is currently driven externally (e.g., walking indoors for night/rain) */
  externalControl: boolean;
}

export interface MinimapBlip {
  id: string;
  x: number;
  z: number;
  yaw: number;
  kind: 'villager' | 'dog' | 'poultry' | 'livestock' | 'cat';
  playing: boolean;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Classifies an arbitrary world coordinate (x, z) into its nearest semantic RoamZoneId.
 */
export function classifyZone(x: number, z: number): RoamZoneId {
  if (z < -5.8) return 'huatai';
  if (z < 16.5 && Math.abs(x) < 11.2) return 'skywells';
  if (z < 21.8 && Math.abs(x) < 12.5) return 'front_hall';
  if (z > 50.2) return 'south_meadow';
  if (z > 36.2 && x < -18.5) return 'west_meadow';
  if (z > 36.2 && x > 18.5) return 'east_meadow';
  if (z >= 36.2 && Math.abs(x) <= 18.5) return 'pond_bank';
  if (x < -14.0) return 'west_veranda';
  if (x > 14.0) return 'east_veranda';
  return 'heping';
}

/**
 * Builds clean doorway-respecting bridge waypoints when crossing between indoor and outdoor
 * regions of the Weilongwu so free-roaming actors pass through real portals without hitting walls!
 */
export function computeZoneBridgeWaypoints(
  fromZone: RoamZoneId,
  toZone: RoamZoneId
): Array<{ x: number; z: number }> {
  if (fromZone === toZone) return [];
  const fromIn = MAP_ROAM_ZONES[fromZone].indoor;
  const toIn = MAP_ROAM_ZONES[toZone].indoor;
  const pts: Array<{ x: number; z: number }> = [];

  // Outdoor -> Indoor through main central portal (0, 21.65)
  if (!fromIn && toIn) {
    if (fromZone === 'west_meadow') pts.push({ x: -18.5, z: 33.5 });
    if (fromZone === 'east_meadow') pts.push({ x: 18.5, z: 33.5 });
    pts.push({ x: 0, z: 23.6 }, { x: 0, z: 20.0 });
    if (toZone === 'skywells' || toZone === 'huatai') {
      pts.push({ x: 0, z: 15.8 }, { x: 0, z: 10.6 });
    }
    if (toZone === 'huatai') {
      pts.push({ x: 0, z: 5.5 }, { x: 0, z: -0.2 }, { x: 0, z: -6.4 });
    }
    return pts;
  }

  // Indoor -> Outdoor through central axis & main portal
  if (fromIn && !toIn) {
    if (fromZone === 'huatai') {
      pts.push({ x: 0, z: -6.4 }, { x: 0, z: -0.2 }, { x: 0, z: 5.5 });
    }
    if (fromZone === 'huatai' || fromZone === 'skywells') {
      pts.push({ x: 0, z: 10.6 }, { x: 0, z: 15.8 });
    }
    pts.push({ x: 0, z: 20.0 }, { x: 0, z: 23.8 });
    if (toZone === 'west_meadow') pts.push({ x: -19.0, z: 34.0 });
    if (toZone === 'east_meadow') pts.push({ x: 19.0, z: 34.0 });
    return pts;
  }

  // Indoor -> Indoor along central hall axis
  if (fromIn && toIn) {
    if (fromZone === 'front_hall' && toZone === 'skywells') {
      pts.push({ x: 0, z: 16.2 });
    } else if (fromZone === 'skywells' && toZone === 'front_hall') {
      pts.push({ x: 0, z: 16.2 });
    } else if (fromZone === 'skywells' && toZone === 'huatai') {
      pts.push({ x: 0, z: 5.5 }, { x: 0, z: -0.2 }, { x: 0, z: -6.4 });
    } else if (fromZone === 'huatai' && toZone === 'skywells') {
      pts.push({ x: 0, z: -6.4 }, { x: 0, z: -0.2 }, { x: 0, z: 5.5 });
    } else if (fromZone === 'front_hall' && toZone === 'huatai') {
      pts.push({ x: 0, z: 16.2 }, { x: 0, z: 8.2 }, { x: 0, z: -0.2 }, { x: 0, z: -6.4 });
    } else if (fromZone === 'huatai' && toZone === 'front_hall') {
      pts.push({ x: 0, z: -6.4 }, { x: 0, z: -0.2 }, { x: 0, z: 8.2 }, { x: 0, z: 16.2 });
    }
    return pts;
  }

  // Outdoor -> Outdoor: skirt cleanly around Half-Moon Pond when crossing between East/West/South meadows
  if (
    (fromZone === 'west_meadow' && (toZone === 'east_meadow' || toZone === 'east_veranda')) ||
    (fromZone === 'east_meadow' && (toZone === 'west_meadow' || toZone === 'west_veranda'))
  ) {
    pts.push({ x: 0, z: 34.8 });
  } else if (fromZone === 'south_meadow' || toZone === 'south_meadow') {
    const sideX = fromZone === 'west_meadow' || toZone === 'west_meadow' ? -20.0 : 20.0;
    pts.push({ x: sideX, z: 46.0 });
  }
  return pts;
}

function getSocialPairType(
  a: RoamSpeciesKind,
  b: RoamSpeciesKind
): { poseA: SocialPlayPose; poseB: SocialPlayPose; duration: [number, number] } | null {
  if ((a === 'dog' || a === 'puppy') && (b === 'villager' || b === 'child')) {
    return {
      poseA: 'dog_play',
      poseB: b === 'child' ? 'chase_play' : 'pet_dog',
      duration: [4.2, 7.8],
    };
  }
  if ((b === 'dog' || b === 'puppy') && (a === 'villager' || a === 'child')) {
    return {
      poseA: a === 'child' ? 'chase_play' : 'pet_dog',
      poseB: 'dog_play',
      duration: [4.2, 7.8],
    };
  }
  if (a === 'child' && b === 'child') {
    return { poseA: 'chase_play', poseB: 'chase_play', duration: [4.0, 7.5] };
  }
  if (a === 'villager' && b === 'villager') {
    return { poseA: 'chat', poseB: 'chat', duration: [4.5, 8.5] };
  }
  if ((a === 'dog' || a === 'puppy') && (b === 'dog' || b === 'puppy')) {
    return { poseA: 'chase_play', poseB: 'dog_play', duration: [4.0, 7.0] };
  }
  if ((a === 'dog' || a === 'puppy') && b === 'cat') {
    return { poseA: 'curious_sniff', poseB: 'curious_sniff', duration: [3.2, 5.5] };
  }
  if (a === 'cat' && (b === 'dog' || b === 'puppy')) {
    return { poseA: 'curious_sniff', poseB: 'curious_sniff', duration: [3.2, 5.5] };
  }
  if (a === 'poultry' && b === 'poultry') {
    return { poseA: 'flock_peck', poseB: 'flock_peck', duration: [2.8, 5.5] };
  }
  return null;
}

/**
 * Reusable Free-Roam & Social Play coordinator managing all autonomous agents in the world.
 */
export class FreeRoamSystem {
  private readonly rand: () => number;
  private readonly agents = new Map<string, RoamAgentState>();
  private readonly agentList: RoamAgentState[] = [];
  private socialCheckAccum = 0;

  constructor(seed = 202605) {
    this.rand = mulberry32(seed);
  }

  registerAgent(
    id: string,
    profileKey: keyof typeof ROAM_PROFILES | RoamProfile,
    startX: number,
    startZ: number,
    startYaw = 0
  ): RoamAgentState {
    const profile =
      typeof profileKey === 'string'
        ? ROAM_PROFILES[profileKey] ?? ROAM_PROFILES.villager_stroll
        : profileKey;
    const state: RoamAgentState = {
      id,
      profile,
      x: startX,
      z: startZ,
      yaw: startYaw,
      speed: 0,
      zone: classifyZone(startX, startZ),
      waypoints: [],
      pauseTimer: 0.4 + this.rand() * 2.2,
      stuckTimer: 0,
      socialPartnerId: null,
      socialPose: 'none',
      socialTimer: 0,
      socialCooldown: 3.0 + this.rand() * 6.0,
      orbitAngle: this.rand() * Math.PI * 2,
      externalControl: false,
    };
    this.agents.set(id, state);
    this.agentList.push(state);
    return state;
  }

  getAgent(id: string): RoamAgentState | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): readonly RoamAgentState[] {
    return this.agentList;
  }

  private pickWeightedZone(profile: RoamProfile, currentZone: RoamZoneId): RoamZoneId {
    const entries = Object.entries(profile.zoneWeights) as Array<[RoamZoneId, number]>;
    if (entries.length === 0) return currentZone;
    // Stay in current zone or venture to another zone based on species curiosity
    if (this.rand() > profile.curiosity && profile.zoneWeights[currentZone]) {
      return currentZone;
    }
    let sum = 0;
    for (let i = 0; i < entries.length; i++) sum += entries[i][1];
    let r = this.rand() * sum;
    for (let i = 0; i < entries.length; i++) {
      r -= entries[i][1];
      if (r <= 0) return entries[i][0];
    }
    return entries[0][0];
  }

  private pickValidPointInZone(
    zoneId: RoamZoneId,
    agent: RoamAgentState,
    doumenOpen: boolean
  ): { x: number; z: number } {
    const bounds = MAP_ROAM_ZONES[zoneId];
    for (let attempt = 0; attempt < 8; attempt++) {
      let tx = bounds.minX + this.rand() * (bounds.maxX - bounds.minX);
      let tz = bounds.minZ + this.rand() * (bounds.maxZ - bounds.minZ);
      // Bias slightly within wanderRadius when staying in the same zone
      if (zoneId === agent.zone && attempt < 5) {
        const ang = this.rand() * Math.PI * 2;
        const dist = 2.2 + this.rand() * agent.profile.wanderRadius;
        tx = Math.max(bounds.minX, Math.min(bounds.maxX, agent.x + Math.cos(ang) * dist));
        tz = Math.max(bounds.minZ, Math.min(bounds.maxZ, agent.z + Math.sin(ang) * dist));
      }
      // Verify the candidate point is not embedded inside a static wall/planter/pond collider
      const check = resolveEntityCollision(tx, tz, tx, tz, agent.profile.radius + 0.15, doumenOpen);
      if (Math.hypot(check.x - tx, check.z - tz) < 0.28) {
        return { x: check.x, z: check.z };
      }
    }
    return { x: bounds.entryGate.x, z: bounds.entryGate.z };
  }

  private assignNewRoamGoal(agent: RoamAgentState, doumenOpen: boolean): void {
    const nextZone = this.pickWeightedZone(agent.profile, agent.zone);
    const bridges = computeZoneBridgeWaypoints(agent.zone, nextZone);
    const dest = this.pickValidPointInZone(nextZone, agent, doumenOpen);
    agent.waypoints = [...bridges, dest];
    agent.stuckTimer = 0;
  }

  private clearSocial(agent: RoamAgentState): void {
    if (agent.socialPartnerId) {
      const partner = this.agents.get(agent.socialPartnerId);
      if (partner && partner.socialPartnerId === agent.id) {
        partner.socialPartnerId = null;
        partner.socialPose = 'none';
        partner.socialTimer = 0;
        partner.socialCooldown = 6.0 + this.rand() * 8.0;
      }
    }
    agent.socialPartnerId = null;
    agent.socialPose = 'none';
    agent.socialTimer = 0;
    agent.socialCooldown = 6.0 + this.rand() * 8.0;
  }

  /**
   * Advances all non-externally-controlled agents by `dt` seconds:
   * - Pairs nearby compatible actors for organic social/play episodes
   * - Steers every agent with collision resolution and doorway bridging
   */
  update(dt: number, doumenOpen: boolean, speedScale = 1.0): void {
    const clampedDt = Math.min(0.08, Math.max(0, dt));
    if (clampedDt <= 0) return;

    // 1. Periodic social/play matchmaking (~2.5 times/sec)
    this.socialCheckAccum += clampedDt;
    if (this.socialCheckAccum >= 0.4) {
      this.socialCheckAccum = 0;
      const n = this.agentList.length;
      for (let i = 0; i < n; i++) {
        const a = this.agentList[i];
        if (a.externalControl || a.socialPartnerId || a.socialCooldown > 0) continue;
        for (let j = i + 1; j < n; j++) {
          const b = this.agentList[j];
          if (b.externalControl || b.socialPartnerId || b.socialCooldown > 0) continue;
          const pair = getSocialPairType(a.profile.species, b.profile.species);
          if (!pair) continue;
          const dist = Math.hypot(b.x - a.x, b.z - a.z);
          // Only trigger interaction within natural sight/social distance and same indoor/outdoor half
          if (dist > 6.2 || dist < 0.35) continue;
          if (MAP_ROAM_ZONES[a.zone].indoor !== MAP_ROAM_ZONES[b.zone].indoor) continue;
          const prob = (a.profile.socialAffinity + b.profile.socialAffinity) * 0.18;
          if (this.rand() < prob) {
            const dur = pair.duration[0] + this.rand() * (pair.duration[1] - pair.duration[0]);
            a.socialPartnerId = b.id;
            b.socialPartnerId = a.id;
            a.socialPose = pair.poseA;
            b.socialPose = pair.poseB;
            a.socialTimer = dur;
            b.socialTimer = dur;
            a.orbitAngle = Math.atan2(a.z - b.z, a.x - b.x);
            b.orbitAngle = a.orbitAngle + Math.PI;
            a.waypoints.length = 0;
            b.waypoints.length = 0;
            break;
          }
        }
      }
    }

    // 2. Step every autonomous agent
    for (let i = 0; i < this.agentList.length; i++) {
      const ag = this.agentList[i];
      if (ag.externalControl) {
        if (ag.socialPartnerId) this.clearSocial(ag);
        ag.speed = 0;
        continue;
      }

      if (ag.socialCooldown > 0) ag.socialCooldown = Math.max(0, ag.socialCooldown - clampedDt);

      // Active social/play behavior
      if (ag.socialPartnerId) {
        const partner = this.agents.get(ag.socialPartnerId);
        ag.socialTimer -= clampedDt;
        if (!partner || partner.externalControl || ag.socialTimer <= 0) {
          this.clearSocial(ag);
          ag.pauseTimer = 0.6 + this.rand() * 1.4;
          continue;
        }

        const dx = partner.x - ag.x;
        const dz = partner.z - ag.z;
        const dist = Math.hypot(dx, dz);

        if (ag.socialPose === 'dog_play' || ag.socialPose === 'chase_play') {
          // Playful orbiting & bounding around play partner!
          ag.orbitAngle += clampedDt * (1.55 + ag.profile.playfulness * 1.35);
          const orbitRad = ag.profile.species === 'child' ? 1.55 : 1.15;
          const tx = partner.x + Math.cos(ag.orbitAngle) * orbitRad;
          const tz = partner.z + Math.sin(ag.orbitAngle) * orbitRad;
          const stepSpeed = ag.profile.speed * ag.profile.sprintFactor * speedScale;
          this.moveToward(ag, tx, tz, stepSpeed, clampedDt, doumenOpen);
        } else if (dist > 1.35) {
          // Walk closer to greet/chat/pet
          const stepSpeed = ag.profile.speed * 0.9 * speedScale;
          this.moveToward(ag, partner.x, partner.z, stepSpeed, clampedDt, doumenOpen);
        } else {
          // Face partner warmly during chat / petting / curious sniffing
          const desiredYaw = Math.atan2(dx, dz);
          let diff = desiredYaw - ag.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          ag.yaw += diff * Math.min(1, ag.profile.turnRate * clampedDt);
          ag.speed = 0;
        }
        continue;
      }

      // Idle curious pause between legs
      if (ag.pauseTimer > 0) {
        ag.pauseTimer -= clampedDt;
        ag.speed = 0;
        if (ag.pauseTimer <= 0) {
          this.assignNewRoamGoal(ag, doumenOpen);
        }
        continue;
      }

      if (ag.waypoints.length === 0) {
        this.assignNewRoamGoal(ag, doumenOpen);
      }

      const target = ag.waypoints[0];
      const dist = Math.hypot(target.x - ag.x, target.z - ag.z);
      if (dist < 0.55) {
        ag.waypoints.shift();
        if (ag.waypoints.length === 0) {
          ag.pauseTimer =
            ag.profile.pauseMin + this.rand() * (ag.profile.pauseMax - ag.profile.pauseMin);
          ag.speed = 0;
        }
        continue;
      }

      const prevX = ag.x;
      const prevZ = ag.z;
      const stepSpeed = ag.profile.speed * speedScale;
      this.moveToward(ag, target.x, target.z, stepSpeed, clampedDt, doumenOpen);

      const moved = Math.hypot(ag.x - prevX, ag.z - prevZ);
      if (stepSpeed > 0.05 && moved < stepSpeed * clampedDt * 0.25) {
        ag.stuckTimer += clampedDt;
        if (ag.stuckTimer > 1.35) {
          // Smoothly abandon blocked target and pause briefly before choosing another clear route
          ag.waypoints.length = 0;
          ag.stuckTimer = 0;
          ag.pauseTimer = 0.6 + this.rand() * 1.2;
          ag.speed = 0;
        }
      } else {
        ag.stuckTimer = Math.max(0, ag.stuckTimer - clampedDt * 0.5);
      }
      ag.zone = classifyZone(ag.x, ag.z);
    }
  }

  private moveToward(
    ag: RoamAgentState,
    tx: number,
    tz: number,
    speed: number,
    dt: number,
    doumenOpen: boolean
  ): void {
    const dx = tx - ag.x;
    const dz = tz - ag.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4 || speed <= 1e-4) {
      ag.speed = 0;
      return;
    }

    const desiredYaw = Math.atan2(dx, dz);
    let diff = desiredYaw - ag.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ag.yaw += diff * Math.min(1, ag.profile.turnRate * dt);

    const step = Math.min(dist, speed * dt);
    const nx = ag.x + (dx / dist) * step;
    const nz = ag.z + (dz / dist) * step;
    const resolved = resolveEntityCollision(ag.x, ag.z, nx, nz, ag.profile.radius, doumenOpen);
    const actualMoved = Math.hypot(resolved.x - ag.x, resolved.z - ag.z);
    ag.x = resolved.x;
    ag.z = resolved.z;
    ag.speed = dt > 1e-4 ? actualMoved / dt : 0;
  }

  /**
   * Produces lightweight live actor blips for the GTA-style real-time minimap HUD.
   */
  getMinimapBlips(): MinimapBlip[] {
    const out: MinimapBlip[] = [];
    for (let i = 0; i < this.agentList.length; i++) {
      const ag = this.agentList[i];
      let kind: MinimapBlip['kind'] = 'villager';
      if (ag.profile.species === 'dog' || ag.profile.species === 'puppy') kind = 'dog';
      else if (ag.profile.species === 'poultry') kind = 'poultry';
      else if (ag.profile.species === 'cat') kind = 'cat';
      else if (ag.profile.species === 'goat' || ag.profile.species === 'buffalo') kind = 'livestock';
      out.push({
        id: ag.id,
        x: ag.x,
        z: ag.z,
        yaw: ag.yaw,
        kind,
        playing: ag.socialPose !== 'none',
      });
    }
    return out;
  }
}
