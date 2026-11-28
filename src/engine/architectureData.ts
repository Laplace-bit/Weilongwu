import {
  CollisionLayer,
  type ArchBoxWallSpec,
  type ArchColumnSpec,
  type ArchDynamicGateSpec,
  type ArchPlanterSpec,
  type ArchPropColliderSpec,
  type ContainerDomainDef,
} from './spatialTypes';

export interface ArchitectureBlueprint {
  walls: ArchBoxWallSpec[];
  beams: ArchBoxWallSpec[];
  columns: ArchColumnSpec[];
  dynamicGates: ArchDynamicGateSpec[];
  planters: ArchPlanterSpec[];
  defaultPropColliders: ArchPropColliderSpec[];
  pondDomain: ContainerDomainDef;
  vatDomain: ContainerDomainDef;
  curvedRings: {
    inner: {
      bayCount: number;
      halfDepth: number;
      wallHeight: number;
      ridgeHeight: number;
      overhang: number;
      isOuterRing: false;
    };
    outer: {
      bayCount: number;
      halfDepth: number;
      wallHeight: number;
      ridgeHeight: number;
      overhang: number;
      isOuterRing: true;
    };
  };
}

/**
 * Single Source of Truth (SSOT) architectural data for the Meizhou Hakka Double-Weilongwu.
 * ArchitectureCompiler compiles this single data blueprint synchronously into:
 * 1. Visual Meshes (Three.js scene graph)
 * 2. Static Colliders (three-mesh-bvh MeshBVH + dynamic Doumen gate gates)
 * 3. NavMesh / Obstacle Mask footprints for NPC free-roam & StationRegistry audits
 */
export function createWeilongArchitectureBlueprint(): ArchitectureBlueprint {
  const frontWallH = 3.25;

  const walls: ArchBoxWallSpec[] = [
    // Front straight facade wall segments at z = 21.65 (opening at Doumen [-17.4,-14.8], Portal [-2.0,+2.0], Doumen [+14.8,+17.4])
    {
      id: 'wall_front_w_outer',
      w: 2.2,
      h: frontWallH,
      d: 0.46,
      x: -18.5,
      yBase: 0.0,
      z: 21.65,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_front_w_mid',
      w: 12.8,
      h: frontWallH,
      d: 0.46,
      x: -8.4,
      yBase: 0.0,
      z: 21.65,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_front_e_mid',
      w: 12.8,
      h: frontWallH,
      d: 0.46,
      x: 8.4,
      yBase: 0.0,
      z: 21.65,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_front_e_outer',
      w: 2.2,
      h: frontWallH,
      d: 0.46,
      x: 18.5,
      yBase: 0.0,
      z: 21.65,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    // Recessed central portal alcove cheeks (凹肚大门)
    {
      id: 'wall_portal_alcove_w',
      w: 1.4,
      h: frontWallH,
      d: 0.36,
      x: -2.0,
      yBase: 0.0,
      z: 20.95,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_portal_alcove_e',
      w: 1.4,
      h: frontWallH,
      d: 0.36,
      x: 2.0,
      yBase: 0.0,
      z: 20.95,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    // Front Straight Wing inner corridor wall at z = 16.55
    {
      id: 'wall_front_inner_w',
      w: 10.2,
      h: 3.02,
      d: 0.36,
      x: -7.7,
      yBase: 0.25,
      z: 16.55,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_front_inner_e',
      w: 10.2,
      h: 3.02,
      d: 0.36,
      x: 7.7,
      yBase: 0.25,
      z: 16.55,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    // Iconic Front Skywell flanking white chambers (x = ±6.9, z = 13.6)
    {
      id: 'chamber_front_skywell_w',
      w: 3.0,
      h: 3.25,
      d: 4.0,
      x: -6.9,
      yBase: 0.15,
      z: 13.6,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'chamber',
    },
    {
      id: 'chamber_front_skywell_e',
      w: 3.0,
      h: 3.25,
      d: 4.0,
      x: 6.9,
      yBase: 0.15,
      z: 13.6,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'chamber',
    },
    // Middle Hall side partitions (x = ±11.15, z = 9.1, len 3.0)
    {
      id: 'wall_axis_w_mid',
      w: 3.0,
      h: 3.46,
      d: 0.34,
      x: -11.15,
      yBase: 0.45,
      z: 9.1,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_axis_e_mid',
      w: 3.0,
      h: 3.46,
      d: 0.34,
      x: 11.15,
      yBase: 0.45,
      z: 9.1,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    // Upper Hall Rear Ancestral Shrine Wall (z = -5.6)
    {
      id: 'wall_upper_back',
      w: 8.8,
      h: 4.08,
      d: 0.44,
      x: 0.0,
      yBase: 0.85,
      z: -5.6,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    // Upper Hall side partitions (x = ±11.15, z = -0.85, len 3.3)
    {
      id: 'wall_axis_w_upper',
      w: 3.3,
      h: 3.85,
      d: 0.34,
      x: -11.15,
      yBase: 0.85,
      z: -0.85,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_axis_e_upper',
      w: 3.3,
      h: 3.85,
      d: 0.34,
      x: 11.15,
      yBase: 0.85,
      z: -0.85,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    // West Hengwu Wing outer walls (x = -18.4) & internal dividers
    {
      id: 'wall_wing_w_s',
      w: 2.6,
      h: 2.96,
      d: 0.38,
      x: -18.4,
      yBase: 0.32,
      z: 15.1,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_wing_w_m',
      w: 4.6,
      h: 2.96,
      d: 0.38,
      x: -18.4,
      yBase: 0.32,
      z: 7.7,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_wing_w_n',
      w: 2.4,
      h: 2.96,
      d: 0.38,
      x: -18.4,
      yBase: 0.32,
      z: 0.2,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_wing_w_div1',
      w: 4.0,
      h: 2.96,
      d: 0.28,
      x: -16.2,
      yBase: 0.32,
      z: 8.2,
      materialKey: 'limeWallInterior',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_wing_w_div2',
      w: 4.0,
      h: 2.96,
      d: 0.28,
      x: -16.2,
      yBase: 0.32,
      z: 1.4,
      materialKey: 'limeWallInterior',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    // East Hengwu Wing outer walls (x = +18.4) & internal dividers
    {
      id: 'wall_wing_e_s',
      w: 2.6,
      h: 2.96,
      d: 0.38,
      x: 18.4,
      yBase: 0.32,
      z: 15.1,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_wing_e_m',
      w: 4.6,
      h: 2.96,
      d: 0.38,
      x: 18.4,
      yBase: 0.32,
      z: 7.7,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_wing_e_n',
      w: 2.4,
      h: 2.96,
      d: 0.38,
      x: 18.4,
      yBase: 0.32,
      z: 0.2,
      rotY: Math.PI * 0.5,
      materialKey: 'limeWall',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_wing_e_div1',
      w: 4.0,
      h: 2.96,
      d: 0.28,
      x: 16.2,
      yBase: 0.32,
      z: 8.2,
      materialKey: 'limeWallInterior',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
    {
      id: 'wall_wing_e_div2',
      w: 4.0,
      h: 2.96,
      d: 0.28,
      x: 16.2,
      yBase: 0.32,
      z: 1.4,
      materialKey: 'limeWallInterior',
      collides: true,
      craftedWall: true,
      archKind: 'wall',
    },
  ];

  // Structural lintels, tie beams, and veranda eave purlins that serve as overhead/plaque anchors
  const beams: ArchBoxWallSpec[] = [
    {
      id: 'lintel_main_portal',
      w: 4.45,
      h: 0.38,
      d: 0.56,
      x: 0,
      yBase: 3.04 - 0.19,
      z: 21.65,
      materialKey: 'granitePlinth',
      collides: false,
      archKind: 'lintel',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_lower_hall_lintel',
      w: 5.1,
      h: 0.16,
      d: 0.20,
      x: 0,
      yBase: 3.03 - 0.08,
      z: 16.65,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_front_skywell_veranda_w',
      w: 0.14,
      h: 0.16,
      d: 5.9,
      x: -4.92,
      yBase: 3.16 - 0.08,
      z: 13.6,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_front_skywell_veranda_e',
      w: 0.14,
      h: 0.16,
      d: 5.9,
      x: 4.92,
      yBase: 3.16 - 0.08,
      z: 13.6,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_middle_hall_s',
      w: 22.0,
      h: 0.24,
      d: 0.24,
      x: 0,
      yBase: 4.18 - 0.12,
      z: 10.2,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_middle_hall_n',
      w: 22.0,
      h: 0.24,
      d: 0.24,
      x: 0,
      yBase: 4.18 - 0.12,
      z: 5.7,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_rear_skywell_w',
      w: 0.22,
      h: 0.22,
      d: 5.0,
      x: -4.7,
      yBase: 3.61 - 0.11,
      z: 2.8,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_rear_skywell_e',
      w: 0.22,
      h: 0.22,
      d: 5.0,
      x: 4.7,
      yBase: 3.61 - 0.11,
      z: 2.8,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_upper_hall_s',
      w: 24.6,
      h: 0.26,
      d: 0.26,
      x: 0,
      yBase: 4.92 - 0.13,
      z: -0.1,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_upper_hall_n',
      w: 24.6,
      h: 0.26,
      d: 0.26,
      x: 0,
      yBase: 4.92 - 0.13,
      z: -5.1,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
    {
      id: 'beam_upper_hall_ridge_purlin',
      w: 25.0,
      h: 0.24,
      d: 0.48,
      x: 0,
      yBase: 7.62,
      z: -2.7,
      materialKey: 'darkTimber',
      collides: false,
      archKind: 'beam',
      isOverheadAnchor: true,
    },
  ];

  // Structural colonnade columns (exact same coordinates drive InstancedMesh visuals + BVH + NavObstacles!)
  const columns: ArchColumnSpec[] = [];
  for (const cx of [-2.4, 2.4, -13.0, 13.0, -18.2, 18.2]) {
    columns.push({ id: `col_lower_${cx}`, x: cx, yBase: 0.25, z: 16.65, height: 2.86, radius: 0.26 });
  }
  for (const cx of [-9.2, -5.2, -2.4, 2.4, 5.2, 9.2]) {
    columns.push({ id: `col_mid_s_${cx}`, x: cx, yBase: 0.45, z: 10.2, height: 3.75, radius: 0.26 });
    columns.push({ id: `col_mid_n_${cx}`, x: cx, yBase: 0.45, z: 5.7, height: 3.75, radius: 0.26 });
  }
  for (const side of [-1, 1]) {
    columns.push({ id: `col_rear_sky_${side}_n`, x: side * 4.7, yBase: 0.35, z: 3.8, height: 3.22, radius: 0.26 });
    columns.push({ id: `col_rear_sky_${side}_s`, x: side * 4.7, yBase: 0.35, z: 1.4, height: 3.22, radius: 0.26 });
  }
  for (const cx of [-10.4, -5.4, -2.5, 2.5, 5.4, 10.4]) {
    columns.push({ id: `col_upper_s_${cx}`, x: cx, yBase: 0.85, z: -0.1, height: 4.1, radius: 0.26 });
    columns.push({ id: `col_upper_n_${cx}`, x: cx, yBase: 0.85, z: -5.1, height: 4.1, radius: 0.26 });
  }

  // Dynamic Doumen Gates (东西斗门)
  const dynamicGates: ArchDynamicGateSpec[] = [
    { id: 'doumen_w', centerX: -16.1, z: 21.65, width: 2.6, height: 2.85, depth: 0.5, yBase: 0.0 },
    { id: 'doumen_e', centerX: 16.1, z: 21.65, width: 2.6, height: 2.85, depth: 0.5, yBase: 0.0 },
  ];

  // Built-in architectural stone tree planters on concrete/granite courtyards
  const planters: ArchPlanterSpec[] = [
    { id: 'planter_peach_-27_25.2', x: -27.0, z: 25.2, radius: 1.12, height: 0.56 },
    { id: 'planter_peach_27_25.6', x: 27.0, z: 25.6, radius: 1.12, height: 0.56 },
    { id: 'planter_peach_-30.5_32', x: -30.5, z: 32.0, radius: 1.08, height: 0.56 },
    { id: 'planter_peach_30.5_31.8', x: 30.5, z: 31.8, radius: 1.08, height: 0.56 },
    { id: 'planter_peach_-21.8_36.2', x: -21.8, z: 36.2, radius: 1.05, height: 0.54 },
    { id: 'planter_peach_21.8_36', x: 21.8, z: 36.0, radius: 1.05, height: 0.54 },
  ];

  // Architectural static furniture/prop/post colliders (SSOT aligned 1:1 with propsBuilder.ts & architectureBuilder.ts)
  const defaultPropColliders: ArchPropColliderSpec[] = [
    // Solid Architectural Furniture & Shrine Colliders
    { id: 'prop_middle_table', kind: 'aabb', minX: -0.95, maxX: 0.95, minZ: 7.38, maxZ: 8.62, minY: 0.45, maxY: 1.5, layer: CollisionLayer.PROPS },
    { id: 'prop_upper_altar', kind: 'aabb', minX: -1.85, maxX: 1.85, minZ: -5.15, maxZ: -3.88, minY: 0.85, maxY: 2.1, layer: CollisionLayer.PROPS },
    { id: 'prop_dragon_shrine', kind: 'aabb', minX: -1.22, maxX: 1.22, minZ: -24.18, maxZ: -23.02, minY: 0.0, maxY: 2.5, layer: CollisionLayer.PROPS },
    { id: 'prop_bogong_shrine', kind: 'aabb', minX: -1.18, maxX: 1.18, minZ: -47.4, maxZ: -45.6, minY: 0.0, maxY: 3.1, layer: CollisionLayer.PROPS },
    { id: 'prop_bedroom_bed', kind: 'aabb', minX: -17.35, maxX: -15.05, minZ: 12.75, maxZ: 14.45, minY: 0.32, maxY: 2.4, layer: CollisionLayer.PROPS },
    { id: 'prop_bedroom_chest', kind: 'aabb', minX: -17.45, maxX: -16.15, minZ: 9.65, maxZ: 10.75, minY: 0.32, maxY: 1.6, layer: CollisionLayer.PROPS },
    { id: 'prop_study_desk', kind: 'aabb', minX: -16.9, maxX: -15.5, minZ: -2.4, maxZ: -0.8, minY: 0.32, maxY: 1.35, layer: CollisionLayer.PROPS },
    { id: 'prop_kitchen_stove', kind: 'aabb', minX: 15.75, maxX: 17.5, minZ: 10.9, maxZ: 15.1, minY: 0.32, maxY: 1.55, layer: CollisionLayer.PROPS },
    { id: 'prop_kitchen_leicha', kind: 'aabb', minX: 13.85, maxX: 14.95, minZ: 9.25, maxZ: 10.35, minY: 0.32, maxY: 1.2, layer: CollisionLayer.PROPS },
    { id: 'prop_granary_winnower', kind: 'aabb', minX: 15.35, maxX: 17.05, minZ: -2.25, maxZ: -0.95, minY: 0.32, maxY: 2.1, layer: CollisionLayer.PROPS },
    { id: 'prop_front_bench', kind: 'aabb', minX: -7.45, maxX: -4.95, minZ: 22.45, maxZ: 23.15, minY: 0.0, maxY: 0.9, layer: CollisionLayer.PROPS },
    { id: 'prop_huatai_woodpile', kind: 'aabb', minX: -10.3, maxX: -8.1, minZ: -15.65, maxZ: -13.95, minY: 0.0, maxY: 1.1, layer: CollisionLayer.PROPS },

    // He-Ping Pavilion Lantern Posts
    { id: 'lantern_post_-16.5_35.4', kind: 'circle', cx: -16.5, cz: 35.4, radius: 0.3, height: 3.9, layer: CollisionLayer.PROPS },
    { id: 'lantern_post_16.5_35.4', kind: 'circle', cx: 16.5, cz: 35.4, radius: 0.3, height: 3.9, layer: CollisionLayer.PROPS },
    { id: 'lantern_post_-19.5_24.5', kind: 'circle', cx: -19.5, cz: 24.5, radius: 0.3, height: 3.9, layer: CollisionLayer.PROPS },
    { id: 'lantern_post_19.5_24.5', kind: 'circle', cx: 19.5, cz: 24.5, radius: 0.3, height: 3.9, layer: CollisionLayer.PROPS },

    // Circular courtyard & room props
    { id: 'prop_skywell_vat', kind: 'circle', cx: -3.4, cz: 13.6, radius: 0.65, height: 1.0, layer: CollisionLayer.PROPS },
    { id: 'prop_rear_mill', kind: 'circle', cx: -2.2, cz: 2.8, radius: 0.68, height: 1.1, layer: CollisionLayer.PROPS },
    { id: 'prop_west_well', kind: 'circle', cx: -15.2, cz: 4.8, radius: 0.82, height: 2.1, layer: CollisionLayer.PROPS },
    { id: 'prop_east_coop', kind: 'circle', cx: 16.1, cz: 4.8, radius: 0.68, height: 0.9, layer: CollisionLayer.PROPS },
    { id: 'prop_weaving_loom', kind: 'circle', cx: -17.0, cz: -16.6, radius: 0.72, height: 1.5, layer: CollisionLayer.PROPS },
    { id: 'prop_music_drum', kind: 'circle', cx: -9.9, cz: -20.9, radius: 0.56, height: 1.2, layer: CollisionLayer.PROPS },
    { id: 'prop_qiaopi_trunk', kind: 'circle', cx: 9.9, cz: -20.9, radius: 0.62, height: 1.2, layer: CollisionLayer.PROPS },
    { id: 'prop_carpentry_bench', kind: 'circle', cx: 17.0, cz: -16.6, radius: 0.78, height: 1.8, layer: CollisionLayer.PROPS },

    // Foreground weeping willows & hero camphor trunks
    { id: 'tree_trunk_-17.8_39.2', kind: 'circle', cx: -17.8, cz: 39.2, radius: 1.18, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_17.8_39.6', kind: 'circle', cx: 17.8, cz: 39.6, radius: 1.18, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_-13.8_49.4', kind: 'circle', cx: -13.8, cz: 49.4, radius: 0.45, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_13.4_49.6', kind: 'circle', cx: 13.4, cz: 49.6, radius: 0.45, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_0.8_50.8', kind: 'circle', cx: 0.8, cz: 50.8, radius: 0.48, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_39.5_16.5', kind: 'circle', cx: 39.5, cz: 16.5, radius: 0.65, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_43_9.5', kind: 'circle', cx: 43.0, cz: 9.5, radius: 0.72, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_44.5_2.5', kind: 'circle', cx: 44.5, cz: 2.5, radius: 0.7, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_42_22', kind: 'circle', cx: 42.0, cz: 22.0, radius: 0.58, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_-42.5_15', kind: 'circle', cx: -42.5, cz: 15.0, radius: 0.65, height: 4.0, layer: CollisionLayer.PROPS },
    { id: 'tree_trunk_-45_6', kind: 'circle', cx: -45.0, cz: 6.0, radius: 0.7, height: 4.0, layer: CollisionLayer.PROPS },

    // Courtyard handcrafted animal shelters (doghouse & courtyard chicken coop)
    { id: 'animal_doghouse', kind: 'circle', cx: -9.6, cz: 22.85, radius: 0.78, height: 1.3, layer: CollisionLayer.PROPS },
    { id: 'animal_heping_coop', kind: 'circle', cx: 13.4, cz: 22.95, radius: 1.02, height: 1.4, layer: CollisionLayer.PROPS },
  ];

  return {
    walls,
    beams,
    columns,
    dynamicGates,
    planters,
    defaultPropColliders,
    pondDomain: {
      id: 'half_moon_pond',
      label: '半月塘水域容器',
      kind: 'pond_ellipse',
      cx: 0,
      cz: 38.6,
      rx: 15.9,
      rz: 10.5,
      minY: -0.95,
      maxY: -0.24,
      minZ: 38.9,
      margin: 0.45,
    },
    vatDomain: {
      id: 'courtyard_water_vat',
      label: '天井陶缸水域容器',
      kind: 'cylinder',
      cx: -3.4,
      cz: 13.6,
      radius: 0.44,
      minY: 0.45,
      maxY: 1.02,
      margin: 0.08,
    },
    curvedRings: {
      inner: {
        bayCount: 64,
        halfDepth: 2.6,
        wallHeight: 3.15,
        ridgeHeight: 5.25,
        overhang: 0.62,
        isOuterRing: false,
      },
      outer: {
        bayCount: 52,
        halfDepth: 2.6,
        wallHeight: 3.45,
        ridgeHeight: 5.65,
        overhang: 0.65,
        isOuterRing: true,
      },
    },
  };
}
