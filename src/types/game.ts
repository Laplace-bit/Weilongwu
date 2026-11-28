export type GameMode = 'title' | 'playing' | 'paused';

export type WeatherMode = 'sunny' | 'rain';

export type InteractionTier = 1 | 2 | 3 | 4 | 5;

export type SurfaceType =
  | 'water_stone'
  | 'courtyard'
  | 'slate'
  | 'cobble'
  | 'wood_2f'
  | 'forest';

export type ZoneId =
  | 'outer'
  | 'central'
  | 'west_wing'
  | 'east_wing'
  | 'defense'
  | 'rear_core';

export interface RoomNode {
  id: string;
  number: string;
  name: string;
  subtitle: string;
  zoneId: ZoneId;
  zoneName: string;
  spawnPos: [number, number, number];
  spawnYaw: number;
  floorLevel: 1 | 2;
  description: string;
}

export interface InteractableDef {
  id: string;
  nodeId: string;
  name: string;
  actionLabel: string;
  tier: InteractionTier;
  tierLabel: string;
  position: [number, number, number];
  radius: number;
  hakkaQuote: string;
  mandarinSub: string;
  culturalNote: string;
  artifactId?: string;
}

export interface ArtifactDef {
  id: string;
  name: string;
  era: string;
  originNode: string;
  hakkaPhrase: string;
  summary: string;
  craftDetails: string;
  modelType: 'qiaopi' | 'hat' | 'abacus' | 'genealogy' | 'umbrella' | 'mirror';
}

export interface SubtitleState {
  id: string;
  title: string;
  hakkaQuote: string;
  mandarinSub: string;
  culturalNote: string;
  tier: InteractionTier;
  timestamp: number;
}

export type CameraViewMode = 'walk' | 'aerial';

export interface HudSnapshot {
  currentNodeId: string;
  currentNodeName: string;
  currentZoneName: string;
  currentSurface: SurfaceType;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  nearbyInteractable: InteractableDef | null;
  visitedNodes: string[];
  triggeredInteractions: string[];
  inspectedArtifacts: string[];
  fiveElementsLit: number;
  holdingUmbrella: boolean;
  doumenOpen: boolean;
  gunSlitActive: boolean;
  weather: WeatherMode;
  cameraView: CameraViewMode;
  timeOfDay: number;
  timePlaying: boolean;
  timeSpeed: number;
  timePeriodLabel: string;
  formattedTime: string;
  volume: number;
}
