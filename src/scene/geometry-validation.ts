import type {
  GeometryValidationCheck,
  GeometryValidationReport,
  PhysicalEvidenceDocument,
  SceneBinding,
  SceneDocument,
  TwinComponent,
  TwinDocument,
} from "../core/types.js";

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Bounds = { min: Vec3; max: Vec3 };
export type GeometryRequirementKind = "position" | "size" | "orientation" | "constraints";
export type GeometryRequirementMap = ReadonlyMap<string, ReadonlySet<GeometryRequirementKind>>;

const DEFAULT_POSITION_TOLERANCE_M = 0.001;
const DEFAULT_SIZE_TOLERANCE_M = 0.001;
const DEFAULT_ANGLE_TOLERANCE_DEG = 0.1;

function orientation(binding: SceneBinding): Quat {
  return binding.orientation ?? [0, 0, 0, 1];
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function angleDeg(a: Quat, b: Quat): number {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return 2 * Math.acos(dot) * 180 / Math.PI;
}

/** Conservative world AABB of an oriented local box. */
function bounds(binding: SceneBinding): Bounds {
  const p = binding.position ?? [0, 0, 0];
  const s = binding.size ?? [1, 1, 1];
  const [x, y, z, w] = orientation(binding);
  const rotation = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const half = s.map((value) => value / 2) as Vec3;
  const worldHalf = rotation.map((row) => row.reduce((sum, value, index) => sum + Math.abs(value) * half[index], 0)) as Vec3;
  return {
    min: p.map((value, index) => value - worldHalf[index]) as Vec3,
    max: p.map((value, index) => value + worldHalf[index]) as Vec3,
  };
}

function boundsDistance(a: Bounds, b: Bounds): number {
  return Math.hypot(...[0, 1, 2].map((axis) => Math.max(0, b.min[axis] - a.max[axis], a.min[axis] - b.max[axis])));
}

function missing(id: string, kind: GeometryValidationCheck["kind"], subjectId: string, objectId?: string): GeometryValidationCheck {
  return { id, kind, subjectId, objectId, ok: false, actual: -1, limit: 0, unit: "boolean", message: "binding_not_found" };
}

function flatten(components: TwinComponent[]): TwinComponent[] {
  return components.flatMap((component) => [component, ...flatten(component.children)]);
}

/** Project semantic type contracts into the physical validation boundary. */
export function geometryRequirementsFromTwin(twin: TwinDocument): Map<string, Set<GeometryRequirementKind>> {
  const result = new Map<string, Set<GeometryRequirementKind>>();
  for (const component of flatten(twin.components)) {
    const spatialClass = String(component.properties.spatialClass ?? "physical");
    if (spatialClass !== "physical" && spatialClass !== "hybrid") continue;
    const declared = String(component.properties.spatialRequire ?? "position|size|orientation").split("|");
    result.set(component.id, new Set(declared.filter((item): item is GeometryRequirementKind => ["position", "size", "orientation", "constraints"].includes(item))));
  }
  return result;
}

export function validateGeometry(
  scene: SceneDocument,
  evidence: PhysicalEvidenceDocument,
  acceptedComponents?: ReadonlySet<string>,
  requirements?: GeometryRequirementMap,
): GeometryValidationReport {
  const bindings = new Map(scene.bindings.map((binding) => [binding.componentId, binding]));
  const checks: GeometryValidationCheck[] = [];
  for (const record of evidence.records) {
    if (acceptedComponents && !acceptedComponents.has(record.componentId)) continue;
    const binding = bindings.get(record.componentId);
    if (!binding) {
      checks.push(missing(`pose:${record.componentId}`, "position", record.componentId));
      continue;
    }
    if (record.position) {
      const limit = record.positionToleranceM ?? DEFAULT_POSITION_TOLERANCE_M;
      const actual = distance(binding.position ?? [0, 0, 0], record.position);
      checks.push({ id: `position:${record.componentId}`, kind: "position", subjectId: record.componentId, ok: actual <= limit, actual, limit, unit: "m", message: "scene_position_vs_evidence" });
    }
    if (record.size) {
      const limit = record.sizeToleranceM ?? DEFAULT_SIZE_TOLERANCE_M;
      const actual = Math.max(...record.size.map((value, index) => Math.abs(value - (binding.size ?? [1, 1, 1])[index])));
      checks.push({ id: `size:${record.componentId}`, kind: "size", subjectId: record.componentId, ok: actual <= limit, actual, limit, unit: "m", message: "scene_extent_vs_evidence" });
    }
    if (record.orientation) {
      const limit = record.angleToleranceDeg ?? DEFAULT_ANGLE_TOLERANCE_DEG;
      const actual = angleDeg(orientation(binding), record.orientation);
      checks.push({ id: `orientation:${record.componentId}`, kind: "orientation", subjectId: record.componentId, ok: actual <= limit, actual, limit, unit: "deg", message: "scene_orientation_vs_evidence" });
    }
  }
  for (const constraint of evidence.constraints ?? []) {
    const subject = bindings.get(constraint.subjectId);
    const object = bindings.get(constraint.objectId);
    if (!subject || !object) {
      checks.push(missing(constraint.id, constraint.relation, constraint.subjectId, constraint.objectId));
      continue;
    }
    const a = bounds(subject), b = bounds(object);
    if (constraint.relation === "inside") {
      const margin = constraint.marginM ?? 0;
      const deficits = [0, 1, 2].flatMap((axis) => [b.min[axis] + margin - a.min[axis], a.max[axis] - (b.max[axis] - margin)]);
      const actual = Math.max(0, ...deficits);
      checks.push({ id: constraint.id, kind: "inside", subjectId: constraint.subjectId, objectId: constraint.objectId, ok: actual === 0, actual, limit: 0, unit: "m", message: "world_aabb_inside" });
    } else if (constraint.relation === "clearance") {
      const limit = constraint.minDistanceM ?? 0;
      const actual = boundsDistance(a, b);
      checks.push({ id: constraint.id, kind: "clearance", subjectId: constraint.subjectId, objectId: constraint.objectId, ok: actual >= limit, actual, limit, unit: "m", message: "world_aabb_clearance" });
    } else {
      const overlap = [0, 1, 2].map((axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]));
      const actual = overlap.every((value) => value > 0) ? Math.min(...overlap) : 0;
      checks.push({ id: constraint.id, kind: "no-overlap", subjectId: constraint.subjectId, objectId: constraint.objectId, ok: actual === 0, actual, limit: 0, unit: "m", message: "world_aabb_overlap_depth" });
    }
  }
  const failures = checks.filter((check) => !check.ok).map((check) => check.id);
  const eligible = requirements ? new Set(requirements.keys()) : undefined;
  const acceptedRecords = evidence.records.filter((record) =>
    (!acceptedComponents || acceptedComponents.has(record.componentId)) && (!eligible || eligible.has(record.componentId))
  );
  const required = (kind: GeometryRequirementKind): number => requirements
    ? [...requirements.values()].filter((items) => items.has(kind)).length
    : kind === "constraints" ? 1 : scene.bindings.filter((binding) => binding.primitive !== "scope").length;
  const requirementResults = requirements ? [...requirements].map(([componentId, items]) => {
    const required = [...items];
    const satisfied = required.filter((kind) => {
      if (kind === "constraints") {
        const spatial = checks.filter((check) => ["inside", "clearance", "no-overlap"].includes(check.kind) && (check.subjectId === componentId || check.objectId === componentId));
        return spatial.length > 0 && spatial.every((check) => check.ok);
      }
      return Boolean(checks.find((candidate) => candidate.id === `${kind}:${componentId}`)?.ok);
    });
    return { componentId, required, satisfied, missing: required.filter((kind) => !satisfied.includes(kind)) };
  }) : undefined;
  const requiredCheckPasses = requirementResults?.reduce((count, result) => count + result.satisfied.length, 0) ?? 0;
  const requiredChecks = required("position") + required("size") + required("orientation") + required("constraints");
  const coverage = {
    bindings: requirements ? requirements.size : scene.bindings.filter((binding) => binding.primitive !== "scope").length,
    positionEvidence: acceptedRecords.filter((record) => Boolean(record.position)).length,
    sizeEvidence: acceptedRecords.filter((record) => Boolean(record.size)).length,
    orientationEvidence: acceptedRecords.filter((record) => Boolean(record.orientation)).length,
    constraints: evidence.constraints?.length ?? 0,
    positionRequired: required("position"),
    sizeRequired: required("size"),
    orientationRequired: required("orientation"),
    constraintsRequired: required("constraints"),
    requiredChecks,
    passedRequiredChecks: requirements ? requiredCheckPasses : 0,
  };
  const complete = requirements
    ? requiredChecks > 0 && requiredCheckPasses === requiredChecks
    : coverage.bindings > 0 && coverage.positionEvidence >= coverage.bindings && coverage.sizeEvidence >= coverage.bindings && coverage.orientationEvidence >= coverage.bindings && coverage.constraints > 0;
  return { schema: "subactor.geometry-validation/v1", evidenceId: evidence.id, method: "world-aabb", ok: failures.length === 0, complete, coverage, requirementResults, checks, failures };
}

export function renderGeometryValidationDsl(report: GeometryValidationReport): string {
  const rows = [
    "GEOMETRY_VALIDATION " + report.evidenceId,
    "METHOD " + report.method,
    `COVERAGE BINDINGS ${report.coverage.bindings} POSITION ${report.coverage.positionEvidence}/${report.coverage.positionRequired ?? report.coverage.bindings} SIZE ${report.coverage.sizeEvidence}/${report.coverage.sizeRequired ?? report.coverage.bindings} ORIENTATION ${report.coverage.orientationEvidence}/${report.coverage.orientationRequired ?? report.coverage.bindings} CONSTRAINTS ${report.coverage.constraints}/${report.coverage.constraintsRequired ?? 1}`,
    `REQUIRED_CHECKS ${report.coverage.passedRequiredChecks ?? "legacy"}/${report.coverage.requiredChecks ?? "legacy"}`,
    `COMPLETENESS ${report.complete ? "COMPLETE" : "INCOMPLETE"}`,
  ];
  for (const check of report.checks) {
    rows.push(
      `CHECK ${check.id} KIND ${check.kind} SUBJECT ${check.subjectId}${check.objectId ? ` OBJECT ${check.objectId}` : ""}`,
      `  ACTUAL ${check.actual} LIMIT ${check.limit} UNIT ${check.unit}`,
      `  RESULT ${check.ok ? "PASS" : "FAIL"} MESSAGE ${JSON.stringify(check.message)}`,
      "END_CHECK",
    );
  }
  for (const result of report.requirementResults ?? []) {
    rows.push(
      `REQUIREMENT ${result.componentId}`,
      `  REQUIRED [${result.required.map((item) => JSON.stringify(item)).join(", ")}]`,
      `  SATISFIED [${result.satisfied.map((item) => JSON.stringify(item)).join(", ")}]`,
      `  MISSING [${result.missing.map((item) => JSON.stringify(item)).join(", ")}]`,
      "END_REQUIREMENT",
    );
  }
  rows.push(`RESULT ${report.ok ? "PASS" : "FAIL"}`, "END_GEOMETRY_VALIDATION");
  return "```geometryvalidationdsl\n" + rows.join("\n") + "\n```\n";
}
