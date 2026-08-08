import test from "node:test";
import assert from "node:assert/strict";
import type { PhysicalEvidenceDocument, SceneDocument, TwinDocument } from "../src/core/types.js";
import { geometryRequirementsFromTwin, renderGeometryValidationDsl, validateGeometry } from "../src/scene/geometry-validation.js";
import { validatePhysicalEvidence } from "../src/scene/physical-evidence.js";

const scene: SceneDocument = {
  schema: "subactor.scene/v1",
  id: "geometry-test",
  format: "openusd",
  bindings: [
    { twinUri: "urn:twin#room", componentId: "room", scenePath: "/Lab/Room", position: [0, 0, 1.5], size: [10, 8, 3], propertyMap: {} },
    { twinUri: "urn:twin#robot", componentId: "robot", scenePath: "/Lab/Robot", position: [0, 0, 1.1], size: [1, 2, 2], orientation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], propertyMap: {} },
    { twinUri: "urn:twin#wall", componentId: "wall", scenePath: "/Lab/Wall", position: [7, 0, 1], size: [1, 8, 2], propertyMap: {} },
  ],
};

function evidence(constraints: PhysicalEvidenceDocument["constraints"]): PhysicalEvidenceDocument {
  return {
    schema: "subactor.physical-evidence/v1",
    id: "survey-v1",
    coordinateSystem: { unit: "m", upAxis: "Z", origin: "datum-A" },
    records: [{
      componentId: "robot", kind: "equipment", evidence: "measured",
      position: [0, 0, 1.1], size: [1, 2, 2], orientation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
      positionToleranceM: 0.001, sizeToleranceM: 0.001, angleToleranceDeg: 0.1,
    }],
    constraints,
  };
}

test("geometry validation proves pose and spatial constraints and renders typed DSL", () => {
  const document = validatePhysicalEvidence(evidence([
    { id: "robot-in-room", relation: "inside", subjectId: "robot", objectId: "room", marginM: 0.1 },
    { id: "robot-wall-clearance", relation: "clearance", subjectId: "robot", objectId: "wall", minDistanceM: 4 },
  ]));
  const report = validateGeometry(scene, document);
  assert.equal(report.ok, true);
  assert.equal(report.complete, false, "two evidenced bindings cannot certify all three scene bindings");
  assert.equal(report.checks.length, 5);
  const dsl = renderGeometryValidationDsl(report);
  assert.match(dsl, /^```geometryvalidationdsl/m);
  assert.match(dsl, /CHECK orientation:robot KIND orientation/);
  assert.match(dsl, /CHECK robot-in-room KIND inside/);
  assert.match(dsl, /RESULT PASS/);
  assert.match(dsl, /COMPLETENESS INCOMPLETE/);
});

test("geometry validation fails a collision and an orientation outside tolerance", () => {
  const document = evidence([
    { id: "robot-room-no-overlap", relation: "no-overlap", subjectId: "robot", objectId: "room" },
  ]);
  document.records[0].orientation = [0, 0, 0, 1];
  const report = validateGeometry(scene, document);
  assert.equal(report.ok, false);
  assert.ok(report.failures.includes("orientation:robot"));
  assert.ok(report.failures.includes("robot-room-no-overlap"));
});

test("physical evidence rejects a non-normalized quaternion", () => {
  const document = evidence([]);
  document.records[0].orientation = [0, 0, 1, 1];
  assert.throws(() => validatePhysicalEvidence(document), /ORIENTATION_INVALID/);
});

test("physical completeness excludes cyber and logical display markers", () => {
  const classified: TwinDocument = {
    schema: "subactor.twin/v1", id: "classified", kind: "conceptual", observedAt: "2026-08-08T00:00:00Z", sourceSnapshotHash: "a".repeat(64),
    components: [
      { id: "robot", type: "equipment", sourceUris: ["urn:robot"], properties: { spatialClass: "physical", spatialRequire: "position|size|orientation" }, children: [] },
      { id: "planner", type: "service", sourceUris: ["urn:planner"], properties: { spatialClass: "cyber", spatialRequire: "logical-endpoint|runtime-status", spatialForbid: "position|size|orientation|constraints" }, children: [] },
    ],
  };
  const report = validateGeometry(scene, evidence([]), undefined, geometryRequirementsFromTwin(classified));
  assert.equal(report.coverage.bindings, 1, "only the physical robot belongs to physical geometry coverage");
  assert.equal(report.coverage.requiredChecks, 3);
  assert.equal(report.coverage.passedRequiredChecks, 3);
  assert.equal(report.complete, true);
});
