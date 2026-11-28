# Three.js Spatial & Physics Engineering Hard Constraints

All scene construction, prop placement, character/animal movement, and visual effects in this Meizhou Hakka Double-Weilongwu Three.js codebase MUST strictly obey the following five engineering contracts. Violations are treated as build/regression defects.

---

## 1. Single Source of Truth (SSOT) Architecture Compilation
- **Never duplicate architectural coordinates** between visual meshes, collision bounds, and NPC navigation obstacles.
- Every static wall, column, beam, doorway, planter, dynamic gate, and curved Weilong ring MUST be defined once in `src/engine/architectureData.ts` (`ArchitectureBlueprint`) and compiled synchronously via `src/engine/architectureCompiler.ts` (`ArchitectureCompiler.compile()`) into:
  1. **Visual structural metadata & `STATIC_ARCH` bounding boxes**,
  2. **`three-mesh-bvh` Static Collider (`staticBvh`) & Overhead Anchor BVH (`ceilingBvh`)**,
  3. **NavMesh / 2D Obstacle Mask (`navObstacles`)**.

## 2. Zero Magic Coordinates for Props, Hanging Fixtures, Plaques & Trees
- **Hanging fixtures & plaques** (lanterns, birdcages, Ding lanterns, clan plaques, handheld tools) MUST NEVER hardcode world `(x, y, z)` coordinates. Register semantic sockets (`eave_hang_*`, `lintel_plaque_*`, `veranda_hang_*`, `ridge_hang_*`, `lantern_post_*`, `hand_right_grip`) on the host structure and attach via `ArchitectureCompiler.mountToSocket(object, socketId, opts)`.
  - Hanging mode snaps `bbox.max.y` cleanly to `socket.position.y`.
  - Plaque mode automatically verifies `Box3` clearance against all `STATIC_ARCH` beams/walls and shifts outward along `socket.normal` if any overlap occurs.
- **Ground-placed static assets** (trees, shrubs, planters, benches, vats, furniture, baskets) MUST be placed via `ArchitectureCompiler.placeOnGround(object, x, z, rules)`:
  - Sets `object.position.y = groundY - bbox.min.y` using the real bounding box bottom (`|min.y - groundY| <= 0.02m`).
  - Enforces `allowedSurface` material checks (`soil` | `planter_pot` | `concrete` | `stone` | `water`). Trees/shrubs requiring `['soil', 'planter_pot']` placed on paved concrete/stone MUST be rejected or automatically wrapped in a sized traditional planter pot with a registered collider.

## 3. Unified Movement Physics Kernel & Anti-Tunneling
- **Direct external writes to dynamic entity `.position`** are strictly prohibited for frame-to-frame locomotion.
- The player controller, all T1 villagers, T2 poultry, waterfowl, and quadrupeds MUST submit their desired displacement `desiredDelta` to `SpatialPhysicsKernel.moveCapsule(entityId, desiredDelta, dt)` (`src/engine/spatialPhysicsKernel.ts`):
  - **Stage 1**: Capsule-vs-BVH static architectural slide + dynamic Doumen gates + `PROPS` + `POND_WATER` bitmask matrix (`WATERFOWL` passes through `POND_WATER`; `PLAYER`/`VILLAGER`/`POULTRY` are blocked).
  - **Stage 2**: Dynamic entity-vs-entity 2D Position-Based Separation + Poultry scatter (`POULTRY` flees approaching `PLAYER`/`VILLAGER` without blocking them), followed by a static BVH re-clip so separation never pushes entities into walls.
  - **Stage 3**: Frame `dt` clamped `<= 0.05s` and automatic sub-stepping whenever step distance exceeds `radius * 0.5`.

## 4. Eliminating Rendering-Layer "Pseudo-Clipping"
- Every roof (central halls, flanking wings, curved Inner/Outer Weilong rings, and village cottages) MUST have a solid opaque underside ceiling/sheathing (`userData.isRoofSheathing = true`, `transparent: false`, `depthWrite: true`) so rain/runoff above the roof is physically occluded in the depth buffer when looking up from indoors.
- World-space VFX (rain streaks, eave rain curtains, gutter drain streams, puddles, drip splashes) MUST NEVER set `depthTest: false` or use abusive high `renderOrder` (`> 20`) to bypass depth occlusion.
- Surface-attached VFX layers MUST enforce an outward normal micro-offset (`+0.015m ~ +0.025m`) and `polygonOffset` to prevent Z-fighting.

## 5. Automated 3D Scene Static Integrity Linter (`SceneValidator`) Gate
- After scene assembly, `SceneValidator.validateAll()` (`src/engine/sceneValidator.ts`) runs automatically and MUST report **0 errors** across all rules:
  1. `[CLIP_ERROR]`: Decoration/tree/plaque/furniture AABB overlap with `STATIC_ARCH` `<= 0.001 m³`.
  2. `[GROUND_ERROR]`: Every `grounded: true` object satisfies `|bbox.min.y - expectedGroundY| <= 0.02m`.
  3. `[FLOAT_ERROR]`: Every `hanging: true` object hits an overhead structural support within `0.05m` via upward BVH raycast.
  4. `[STATION_ERROR]`: Every `StationRegistry` NPC stand/sit/home slot, doorway, and animal shelter fits its capsule without clipping walls.
  5. `[CONTAINER_ERROR]`: Every contained entity (Half-Moon Pond Koi, Courtyard Vat Koi, Caged Hwamei songbird) stays strictly inside its `ContainerDomain` at startup and per-frame runtime.
  6. `[RENDER_ERROR]`: Opaque roof sheathing (`depthWrite: true`) and strict `depthTest: true` on all world VFX.
