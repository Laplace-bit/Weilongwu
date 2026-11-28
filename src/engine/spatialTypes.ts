import type * as THREE from 'three';

/**
 * Collision layer bitflags for the unified SpatialPhysicsKernel.
 * Every static collider and dynamic entity belongs to exactly one layer
 * and specifies a bitmask of layers it collides against.
 */
export enum CollisionLayer {
  NONE = 0,
  STATIC_ARCH = 1 << 0,
  PROPS = 1 << 1,
  POND_WATER = 1 << 2,
  PLAYER = 1 << 3,
  VILLAGER = 1 << 4,
  POULTRY = 1 << 5,
  WATERFOWL = 1 << 6,
  QUADRUPED = 1 << 7,
}

/**
 * Default collision matrix matching the architectural spatial specification:
 * - Player: hard blocked by STATIC_ARCH, PROPS, POND_WATER; soft push with VILLAGER/QUADRUPED; scatters POULTRY without blocking.
 * - Villager: hard blocked by STATIC_ARCH, PROPS, POND_WATER; soft push with PLAYER/VILLAGER/QUADRUPED; scatters POULTRY.
 * - Poultry: hard blocked by STATIC_ARCH, PROPS, POND_WATER; flees PLAYER/VILLAGER; flock separation with POULTRY.
 * - Waterfowl: hard blocked by STATIC_ARCH, PROPS; ALLOWED to enter POND_WATER; flock separation with WATERFOWL.
 * - Quadruped: hard blocked by STATIC_ARCH, PROPS, POND_WATER; soft push with PLAYER/VILLAGER/QUADRUPED.
 */
export const COLLISION_MASKS = {
  PLAYER:
    CollisionLayer.STATIC_ARCH |
    CollisionLayer.PROPS |
    CollisionLayer.POND_WATER |
    CollisionLayer.VILLAGER |
    CollisionLayer.QUADRUPED,
  VILLAGER:
    CollisionLayer.STATIC_ARCH |
    CollisionLayer.PROPS |
    CollisionLayer.POND_WATER |
    CollisionLayer.PLAYER |
    CollisionLayer.VILLAGER |
    CollisionLayer.QUADRUPED,
  POULTRY:
    CollisionLayer.STATIC_ARCH |
    CollisionLayer.PROPS |
    CollisionLayer.POND_WATER |
    CollisionLayer.POULTRY |
    CollisionLayer.QUADRUPED,
  WATERFOWL:
    CollisionLayer.STATIC_ARCH |
    CollisionLayer.PROPS |
    CollisionLayer.WATERFOWL,
  QUADRUPED:
    CollisionLayer.STATIC_ARCH |
    CollisionLayer.PROPS |
    CollisionLayer.POND_WATER |
    CollisionLayer.PLAYER |
    CollisionLayer.VILLAGER |
    CollisionLayer.QUADRUPED,
} as const;

export const SCATTER_FROM_MASKS = {
  POULTRY: CollisionLayer.PLAYER | CollisionLayer.VILLAGER,
  WATERFOWL: CollisionLayer.PLAYER | CollisionLayer.VILLAGER,
} as const;

export const DEFAULT_CAPSULE_DIMS = {
  PLAYER: { radius: 0.32, height: 1.72, weight: 1.4 },
  VILLAGER: { radius: 0.32, height: 1.68, weight: 1.0 },
  CHILD: { radius: 0.24, height: 1.18, weight: 0.7 },
  POULTRY: { radius: 0.16, height: 0.42, weight: 0.2 },
  CHICK: { radius: 0.11, height: 0.24, weight: 0.12 },
  WATERFOWL: { radius: 0.24, height: 0.56, weight: 0.35 },
  QUADRUPED_SMALL: { radius: 0.28, height: 0.62, weight: 0.6 },
  QUADRUPED_LARGE: { radius: 0.58, height: 1.35, weight: 2.2 },
} as const;

export interface CollisionBody {
  id: string;
  radius: number;
  height: number;
  layer: CollisionLayer;
  mask: number;
  x: number;
  y: number;
  z: number;
  /** Relative push weight for 2D position-based dynamic separation (higher = harder to push). */
  weight?: number;
  /** Layers that trigger a flee/scatter impulse vector instead of hard blocking. */
  scatterFromMask?: number;
  /** Distance threshold for scatter detection in meters. */
  scatterRadius?: number;
  /** When true, excluded from dynamic separation (e.g., seated at fixed station or disabled). */
  kinematicOnly?: boolean;
  /** Optional active flag. */
  active?: boolean;
}

export type SurfaceMaterialKind =
  | 'soil'
  | 'concrete'
  | 'stone'
  | 'water'
  | 'planter_pot'
  | 'wood';

export type SocketKind =
  | 'eave_hang'
  | 'lintel_plaque'
  | 'veranda_hang'
  | 'ridge_hang'
  | 'lantern_post'
  | 'wall_plaque'
  | 'hand_grip';

export interface SocketDef {
  id: string;
  kind: SocketKind;
  position: [number, number, number];
  /** Outward unit normal vector (used for plaque auto-offset clearance). */
  normal: [number, number, number];
  /** Semantic ID of the architectural member owning this socket. */
  hostId: string;
  /** Optional metadata for host beam/purlin clearance rules. */
  meta?: Record<string, number | string | boolean>;
}

export interface GroundingRules {
  id: string;
  allowedSurface?: SurfaceMaterialKind[];
  /** If true and placed on stone/concrete while requiring soil/planter_pot, automatically wrap in a stone planter. */
  autoWrapPlanter?: boolean;
  /** Planter visual radius when auto-wrapped. */
  planterRadius?: number;
  /** Planter height when auto-wrapped. */
  planterHeight?: number;
  /** Optional explicit ground height override (e.g., upper dais or bench top). */
  overrideGroundY?: number;
  /** Reference Y passed to groundHeightAt() for multi-level disambiguation. */
  referenceY?: number;
  /** Optional slight intentional burial depth (clamped <= 0.015m so grounding audit <= 0.02m passes). */
  embedDepth?: number;
  /** Category for SceneValidator static clipping audit. */
  auditKind?: 'tree' | 'furniture' | 'decoration' | 'planter' | 'prop';
  /** If true, omit from [CLIP_ERROR] audit (e.g., intentional flush architectural trim). */
  skipClipAudit?: boolean;
}

export interface ArchBoxWallSpec {
  id: string;
  w: number;
  h: number;
  d: number;
  x: number;
  yBase: number;
  z: number;
  rotY?: number;
  materialKey: 'limeWall' | 'limeWallInterior' | 'granitePlinth' | 'darkTimber' | 'weatheredWoodDoor';
  /** Whether this element is part of static wall collision + NavMesh obstacle mask. */
  collides: boolean;
  /** Whether this is a crafted wall (with granite plinth + shadow line) or a plain architectural box/beam. */
  craftedWall?: boolean;
  /** Structural category for SceneValidator & Socket clipping checks. */
  archKind: 'wall' | 'beam' | 'lintel' | 'jamb' | 'door_leaf' | 'curb' | 'chamber';
  /** If true, registered into the overhead ceiling/beam raycast BVH for [FLOAT_ERROR] checks. */
  isOverheadAnchor?: boolean;
}

export interface ArchColumnSpec {
  id: string;
  x: number;
  yBase: number;
  z: number;
  height: number;
  radius?: number;
}

export interface ArchPlanterSpec {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
}

export interface ArchDynamicGateSpec {
  id: string;
  centerX: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  yBase: number;
}

export interface ArchPropColliderSpec {
  id: string;
  kind: 'aabb' | 'circle';
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  minY?: number;
  maxY?: number;
  cx?: number;
  cz?: number;
  radius?: number;
  height?: number;
  layer: CollisionLayer;
}

export interface NavObstacleFootprint {
  id: string;
  kind: 'aabb' | 'circle' | 'obb';
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  cx?: number;
  cz?: number;
  radius?: number;
  halfW?: number;
  halfD?: number;
  yaw?: number;
  dynamicGate?: boolean;
  layer: CollisionLayer;
}

export interface StationSlot {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  layer?: CollisionLayer;
  /** True for indoor furniture-adjacent seats/beds where small prop contact is expected. */
  allowPropOverlap?: boolean;
}

export interface ContainerDomainDef {
  id: string;
  label: string;
  kind: 'pond_ellipse' | 'cylinder' | 'box';
  cx: number;
  cz: number;
  rx?: number;
  rz?: number;
  radius?: number;
  minY: number;
  maxY: number;
  minZ?: number;
  maxZ?: number;
  /** Safety inward margin in meters so entities never touch walls/rims. */
  margin: number;
}

export interface ContainedEntityRef {
  id: string;
  domainId: string;
  object: THREE.Object3D;
}

export type ValidationRuleCode =
  | 'CLIP_ERROR'
  | 'GROUND_ERROR'
  | 'FLOAT_ERROR'
  | 'STATION_ERROR'
  | 'CONTAINER_ERROR'
  | 'RENDER_ERROR';

export interface ValidationIssue {
  code: ValidationRuleCode;
  objectId: string;
  message: string;
  position: [number, number, number];
  metric?: number;
  box?: { min: [number, number, number]; max: [number, number, number] };
}

export interface ValidationReport {
  timestamp: number;
  passed: boolean;
  totalErrors: number;
  countsByCode: Record<ValidationRuleCode, number>;
  checkedCounts: {
    staticArchBoxes: number;
    clipAuditObjects: number;
    groundedObjects: number;
    hangingObjects: number;
    stations: number;
    containedEntities: number;
    renderMaterials: number;
  };
  issues: ValidationIssue[];
}
