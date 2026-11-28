import * as THREE from 'three';
import { computeBoxOverlapVolume, type CompiledArchitecture } from './architectureCompiler';
import type { SpatialPhysicsKernel } from './spatialPhysicsKernel';
import {
  CollisionLayer,
  type ContainedEntityRef,
  type StationSlot,
  type ValidationIssue,
  type ValidationReport,
  type ValidationRuleCode,
} from './spatialTypes';

export interface SceneValidatorInput {
  sceneRoot: THREE.Object3D;
  compiled: CompiledArchitecture;
  physicsKernel: SpatialPhysicsKernel;
  stations: StationSlot[];
  containedEntities: ContainedEntityRef[];
  /** Optional silence flag for unit tests that intentionally inject errors. */
  silent?: boolean;
}

const CLIP_VOLUME_THRESHOLD_M3 = 0.001;
const GROUND_TOLERANCE_M = 0.02;
const HANGING_MAX_GAP_M = 0.05;

/**
 * Automated 3D Scene Static Integrity Linter (启动期自动化空间质检):
 * Executes all 5 mandatory spatial rules + rendering occlusion checks immediately after scene assembly:
 * - Rule 1 [CLIP_ERROR]: Decoration/tree/plaque/furniture AABB overlap with STATIC_ARCH > 0.001 m^3
 * - Rule 2 [GROUND_ERROR]: Grounded object |bbox.min.y - expectedGroundY| > 0.02 m
 * - Rule 3 [FLOAT_ERROR]: Hanging object upward raycast (maxDist = 0.05m) misses overhead beam/eave/sheathing
 * - Rule 4 [STATION_ERROR]: StationRegistry capsule (radius, height) clips static wall/furniture
 * - Rule 5 [CONTAINER_ERROR]: Contained entity (Koi fish, caged Hwamei) escapes its ContainerDomain
 * - Render Audit [RENDER_ERROR]: Roof sheathing must be opaque+depthWrite:true; world VFX must not disable depthTest
 */
export class SceneValidator {
  private readonly debugWireframeGroup = new THREE.Group();
  private lastReport: ValidationReport | null = null;

  constructor() {
    this.debugWireframeGroup.name = 'SceneValidatorDebugWireframes';
    this.debugWireframeGroup.visible = false;
  }

  getDebugWireframeGroup(): THREE.Group {
    return this.debugWireframeGroup;
  }

  getLastReport(): ValidationReport | null {
    return this.lastReport;
  }

  setWireframeVisible(visible: boolean): void {
    this.debugWireframeGroup.visible = visible;
  }

  validateAll(input: SceneValidatorInput): ValidationReport {
    const { sceneRoot, compiled, physicsKernel, stations, containedEntities, silent = false } = input;
    sceneRoot.updateMatrixWorld(true);

    const issues: ValidationIssue[] = [];
    const countsByCode: Record<ValidationRuleCode, number> = {
      CLIP_ERROR: 0,
      GROUND_ERROR: 0,
      FLOAT_ERROR: 0,
      STATION_ERROR: 0,
      CONTAINER_ERROR: 0,
      RENDER_ERROR: 0,
    };

    const pushIssue = (issue: ValidationIssue) => {
      issues.push(issue);
      countsByCode[issue.code] += 1;
    };

    let clipAuditObjects = 0;
    let groundedObjects = 0;
    let hangingObjects = 0;
    let renderMaterials = 0;

    const tmpBox = new THREE.Box3();
    const tmpCenter = new THREE.Vector3();
    const tmpRayOrigin = new THREE.Vector3();
    const tmpWorldPos = new THREE.Vector3();

    // Traverse scene graph once for Rules 1, 2, 3, and Render Audit
    sceneRoot.traverse((obj) => {
      const ud = obj.userData;
      if (!ud) return;

      // ---------------------------------------------------------------------
      // RULE 1: [CLIP_ERROR] Static Clipping Audit (Decorations/Trees/Plaques/Furniture vs STATIC_ARCH)
      // ---------------------------------------------------------------------
      const auditKind = ud.spatialAuditKind as string | undefined;
      if (
        !ud.skipClipAudit &&
        (auditKind === 'plaque' ||
          auditKind === 'tree' ||
          auditKind === 'furniture' ||
          auditKind === 'decoration')
      ) {
        clipAuditObjects += 1;
        tmpBox.setFromObject(obj);
        if (!tmpBox.isEmpty()) {
          const exclude = new Set<string>(Array.isArray(ud.excludeArchIds) ? ud.excludeArchIds : []);
          const objId = (ud.groundId as string) || (ud.socketId as string) || obj.name || 'unnamed_prop';
          for (let i = 0; i < compiled.staticArchBoxes.length; i++) {
            const arch = compiled.staticArchBoxes[i];
            if (exclude.has(arch.id)) continue;
            const vol = computeBoxOverlapVolume(tmpBox, arch.box);
            if (vol > CLIP_VOLUME_THRESHOLD_M3) {
              tmpBox.getCenter(tmpCenter);
              pushIssue({
                code: 'CLIP_ERROR',
                objectId: `${objId} <-> ${arch.id}`,
                message: `Static clipping overlap ${vol.toFixed(4)}m³ > ${CLIP_VOLUME_THRESHOLD_M3}m³ between "${objId}" and STATIC_ARCH "${arch.id}"`,
                position: [tmpCenter.x, tmpCenter.y, tmpCenter.z],
                metric: vol,
                box: {
                  min: [tmpBox.min.x, tmpBox.min.y, tmpBox.min.z],
                  max: [tmpBox.max.x, tmpBox.max.y, tmpBox.max.z],
                },
              });
              break;
            }
          }
        }
      }

      // ---------------------------------------------------------------------
      // RULE 2: [GROUND_ERROR] Grounding Audit (|bbox.min.y - expectedGroundY| <= 0.02m)
      // ---------------------------------------------------------------------
      if (ud.grounded === true && typeof ud.expectedGroundY === 'number') {
        groundedObjects += 1;
        tmpBox.setFromObject(obj);
        if (!tmpBox.isEmpty()) {
          const err = Math.abs(tmpBox.min.y - ud.expectedGroundY);
          if (err > GROUND_TOLERANCE_M) {
            tmpBox.getCenter(tmpCenter);
            const objId = (ud.groundId as string) || obj.name || 'unnamed_grounded';
            pushIssue({
              code: 'GROUND_ERROR',
              objectId: objId,
              message: `Grounding deviation ${err.toFixed(3)}m > ${GROUND_TOLERANCE_M}m (bbox.min.y=${tmpBox.min.y.toFixed(3)}, expected=${ud.expectedGroundY.toFixed(3)})`,
              position: [tmpCenter.x, tmpBox.min.y, tmpCenter.z],
              metric: err,
              box: {
                min: [tmpBox.min.x, tmpBox.min.y, tmpBox.min.z],
                max: [tmpBox.max.x, tmpBox.max.y, tmpBox.max.z],
              },
            });
          }
        }
      }

      // ---------------------------------------------------------------------
      // RULE 3: [FLOAT_ERROR] Overhead Socket Attachment Audit (upward raycast <= 0.05m)
      // ---------------------------------------------------------------------
      if (ud.hanging === true) {
        hangingObjects += 1;
        tmpBox.setFromObject(obj);
        if (!tmpBox.isEmpty()) {
          tmpBox.getCenter(tmpCenter);
          // Cast upward from 5cm below top of hanging fixture so hooks/brackets flush or slightly
          // embedded (1-3cm) into an overhead beam/eave cleanly intersect the beam bottom face,
          // while any actual air gap > HANGING_MAX_GAP_M (0.05m) fails the raycast.
          const startOffset = 0.05;
          tmpRayOrigin.set(tmpCenter.x, tmpBox.max.y - startOffset, tmpCenter.z);
          const hit = physicsKernel.raycastOverheadAnchor(
            tmpRayOrigin,
            HANGING_MAX_GAP_M + startOffset
          );
          if (!hit.hit) {
            const objId = (ud.socketId as string) || obj.name || 'unnamed_hanging';
            pushIssue({
              code: 'FLOAT_ERROR',
              objectId: objId,
              message: `Hanging fixture "${objId}" has no overhead beam/eave/sheathing within ${HANGING_MAX_GAP_M}m above max.y=${tmpBox.max.y.toFixed(3)}`,
              position: [tmpCenter.x, tmpBox.max.y, tmpCenter.z],
              metric: HANGING_MAX_GAP_M,
              box: {
                min: [tmpBox.min.x, tmpBox.min.y, tmpBox.min.z],
                max: [tmpBox.max.x, tmpBox.max.y, tmpBox.max.z],
              },
            });
          }
        }
      }

      // ---------------------------------------------------------------------
      // RENDERING OCCLUSION AUDIT: Opaque Roof Sheathing + Zero depthTest:false World VFX
      // ---------------------------------------------------------------------
      const renderObj = obj as THREE.Mesh | THREE.LineSegments | THREE.Points;
      if (
        (renderObj as THREE.Mesh).isMesh ||
        (renderObj as THREE.LineSegments).isLineSegments ||
        (renderObj as THREE.Points).isPoints
      ) {
        const mats = Array.isArray(renderObj.material) ? renderObj.material : [renderObj.material];
        for (let m = 0; m < mats.length; m++) {
          const mat = mats[m];
          if (!mat) continue;

          if (ud.isRoofSheathing === true) {
            renderMaterials += 1;
            if (mat.transparent || mat.depthWrite !== true) {
              renderObj.getWorldPosition(tmpWorldPos);
              pushIssue({
                code: 'RENDER_ERROR',
                objectId: renderObj.name || 'roof_sheathing',
                message: `Roof sheathing must be opaque with depthWrite:true (transparent=${String(mat.transparent)}, depthWrite=${String(mat.depthWrite)})`,
                position: [tmpWorldPos.x, tmpWorldPos.y, tmpWorldPos.z],
              });
            }
          }

          if (ud.isWorldVfx === true) {
            renderMaterials += 1;
            if (mat.depthTest === false || renderObj.renderOrder > 20) {
              renderObj.getWorldPosition(tmpWorldPos);
              pushIssue({
                code: 'RENDER_ERROR',
                objectId: renderObj.name || 'world_vfx',
                message: `World-space VFX must never disable depthTest or use abusive renderOrder (depthTest=${String(mat.depthTest)}, renderOrder=${renderObj.renderOrder})`,
                position: [tmpWorldPos.x, tmpWorldPos.y, tmpWorldPos.z],
              });
            }
          }
        }
      }
    });

    // -----------------------------------------------------------------------
    // RULE 4: [STATION_ERROR] StationRegistry Capsule Clearance Audit
    // -----------------------------------------------------------------------
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      const probeMask = st.allowPropOverlap
        ? CollisionLayer.STATIC_ARCH
        : CollisionLayer.STATIC_ARCH | CollisionLayer.PROPS;
      const probe = physicsKernel.probeCapsuleClearance(
        st.x,
        st.y,
        st.z,
        st.radius,
        st.height,
        probeMask,
        true
      );
      if (!probe.clear) {
        pushIssue({
          code: 'STATION_ERROR',
          objectId: st.id,
          message: `Station "${st.id}" (${st.label}) capsule (r=${st.radius}m, h=${st.height}m) clips static collider by ${probe.penetration.toFixed(3)}m`,
          position: [st.x, st.y, st.z],
          metric: probe.penetration,
          box: {
            min: [st.x - st.radius, st.y, st.z - st.radius],
            max: [st.x + st.radius, st.y + st.height, st.z + st.radius],
          },
        });
      }
    }

    // -----------------------------------------------------------------------
    // RULE 5: [CONTAINER_ERROR] ContainerDomain Containment Audit (Koi & Caged Hwamei)
    // -----------------------------------------------------------------------
    for (let i = 0; i < containedEntities.length; i++) {
      const ref = containedEntities[i];
      ref.object.getWorldPosition(tmpWorldPos);
      const res = physicsKernel.clampToContainer(
        ref.domainId,
        tmpWorldPos.x,
        tmpWorldPos.y,
        tmpWorldPos.z
      );
      if (res.wasOutside && res.distanceOutside > 0.02) {
        pushIssue({
          code: 'CONTAINER_ERROR',
          objectId: ref.id,
          message: `Contained entity "${ref.id}" escaped domain "${ref.domainId}" by ${res.distanceOutside.toFixed(3)}m`,
          position: [tmpWorldPos.x, tmpWorldPos.y, tmpWorldPos.z],
          metric: res.distanceOutside,
        });
      }
    }

    const report: ValidationReport = {
      timestamp: Date.now(),
      passed: issues.length === 0,
      totalErrors: issues.length,
      countsByCode,
      checkedCounts: {
        staticArchBoxes: compiled.staticArchBoxes.length,
        clipAuditObjects,
        groundedObjects,
        hangingObjects,
        stations: stations.length,
        containedEntities: containedEntities.length,
        renderMaterials,
      },
      issues,
    };

    this.lastReport = report;
    this.rebuildDebugWireframes(issues);

    if (!silent) {
      this.logReport(report);
    }

    return report;
  }

  private rebuildDebugWireframes(issues: ValidationIssue[]): void {
    // Dispose any prior wireframe meshes
    while (this.debugWireframeGroup.children.length > 0) {
      const child = this.debugWireframeGroup.children[0];
      this.debugWireframeGroup.remove(child);
      if ((child as THREE.LineSegments).geometry) {
        (child as THREE.LineSegments).geometry.dispose();
      }
      const mat = (child as THREE.LineSegments).material;
      if (mat && !Array.isArray(mat)) {
        mat.dispose();
      }
    }

    if (issues.length === 0) {
      this.debugWireframeGroup.visible = false;
      return;
    }

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const box = issue.box
        ? new THREE.Box3(
            new THREE.Vector3(...issue.box.min),
            new THREE.Vector3(...issue.box.max)
          )
        : new THREE.Box3(
            new THREE.Vector3(issue.position[0] - 0.3, issue.position[1] - 0.3, issue.position[2] - 0.3),
            new THREE.Vector3(issue.position[0] + 0.3, issue.position[1] + 0.3, issue.position[2] + 0.3)
          );
      const helper = new THREE.Box3Helper(box, new THREE.Color(0xff2a2a));
      this.debugWireframeGroup.add(helper);
    }
    // Only visible if violations exist (in dev); zero errors -> zero red boxes!
    this.debugWireframeGroup.visible = issues.length > 0;
  }

  private logReport(report: ValidationReport): void {
    const c = report.checkedCounts;
    if (report.passed) {
      console.info(
        `[SceneValidator] PASS (0 errors) | checked: ${c.staticArchBoxes} STATIC_ARCH, ${c.clipAuditObjects} clip-audited props, ${c.groundedObjects} grounded, ${c.hangingObjects} hanging, ${c.stations} stations, ${c.containedEntities} contained, ${c.renderMaterials} render mats`
      );
      return;
    }

    console.warn(
      `[SceneValidator] FAILED with ${report.totalErrors} spatial integrity error(s):`,
      report.countsByCode
    );
    for (const issue of report.issues) {
      console.error(
        `[${issue.code}] ${issue.objectId} @ (${issue.position[0].toFixed(2)}, ${issue.position[1].toFixed(2)}, ${issue.position[2].toFixed(2)}) — ${issue.message}`
      );
    }
  }

  dispose(): void {
    this.rebuildDebugWireframes([]);
  }
}
