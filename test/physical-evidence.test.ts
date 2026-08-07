import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPhysicalEvidence,
  geometryEvidenceRank,
  normalizeGeometryEvidence,
  validatePhysicalEvidence,
} from "../src/scene/physical-evidence.js";
import { contentUri } from "../src/core/canonical.js";
import type { PhysicalEvidenceDocument, SceneDocument, TwinDocument } from "../src/core/types.js";

function twinFixture(): TwinDocument {
  return {
    schema: "subactor.twin/v1",
    id: "bf-twin",
    kind: "physical",
    observedAt: "2026-08-07T00:00:00Z",
    sourceSnapshotHash: "a".repeat(64),
    components: [
      { id: "build", type: "system-layer", sourceUris: ["urn:c"], properties: { label: "Build", geometryEvidence: "placeholder" }, children: [] },
      { id: "liquid_handler_01", type: "equipment-placeholder", sourceUris: ["urn:p"], properties: { label: "Liquid Handler", geometryEvidence: "placeholder" }, children: [] },
      { id: "biospec_bioreactor_01", type: "equipment", sourceUris: ["urn:p"], properties: { label: "Bioreactor", geometryEvidence: "cad-file" }, children: [] },
    ],
  };
}

function sceneFixture(twin: TwinDocument): SceneDocument {
  const twinUri = contentUri("twin", twin);
  return {
    schema: "subactor.scene/v1",
    id: "bf-scene",
    format: "openusd",
    sourceTwinId: twin.id,
    bindings: twin.components.map((component, index) => ({
      twinUri: `${twinUri}#component=${encodeURIComponent(component.id)}`,
      componentId: component.id,
      scenePath: `/Biofoundry/Zones/${component.id}`,
      primitive: "cube" as const,
      position: [index * 5, 0, 0] as [number, number, number],
      size: [1, 1, 1] as [number, number, number],
      propertyMap: {},
    })),
  };
}

function evidenceFixture(records: PhysicalEvidenceDocument["records"]): PhysicalEvidenceDocument {
  return {
    schema: "subactor.physical-evidence/v1",
    id: "site-survey-2026-08",
    coordinateSystem: { unit: "m", upAxis: "Z", origin: "site-datum-A" },
    records,
  };
}

test("physical evidence raises fidelity while component ids and scene paths stay stable", () => {
  const twin = twinFixture();
  const scene = sceneFixture(twin);
  const result = applyPhysicalEvidence({
    twin,
    scene,
    evidence: evidenceFixture([
      { componentId: "build", kind: "space", evidence: "cad", position: [7.5, 9, 0], size: [13, 15, 3.2], sourceRef: "plan-A3-sheet2" },
      { componentId: "liquid_handler_01", kind: "equipment", evidence: "measured", size: [2.2, 1.6, 1.8], sourceRef: "register:LH-01" },
    ]),
  });

  assert.equal(result.report.componentIdsStable, true);
  assert.equal(result.report.scenePathsStable, true);
  assert.deepEqual(
    result.report.applied.map((x) => `${x.componentId}:${x.from}->${x.to}`),
    ["build:placeholder->cad", "liquid_handler_01:placeholder->measured"],
  );

  const build = result.scene.bindings.find((b) => b.componentId === "build");
  assert.deepEqual(build?.size, [13, 15, 3.2]);
  assert.deepEqual(build?.position, [7.5, 9, 0]);
  assert.equal(result.twin.components[0].properties.geometryEvidence, "cad");
  assert.equal(result.twin.components[0].properties.geometrySourceRef, "plan-A3-sheet2");
  assert.equal(result.twin.components[0].properties.geometryOrigin, "site-datum-A");
  // Identity is untouched: same ids, same paths, only representation moved.
  assert.deepEqual(twin.components.map((c) => c.id), result.twin.components.map((c) => c.id));
  assert.deepEqual(scene.bindings.map((b) => b.scenePath), result.scene.bindings.map((b) => b.scenePath));
});

test("unknown componentId is rejected instead of minting a parallel component", () => {
  const twin = twinFixture();
  const scene = sceneFixture(twin);
  const result = applyPhysicalEvidence({
    twin,
    scene,
    evidence: evidenceFixture([{ componentId: "liquid_handler_99", kind: "equipment", evidence: "ifc", size: [1, 1, 1] }]),
  });
  assert.deepEqual(result.report.rejected, [{ componentId: "liquid_handler_99", reason: "UNKNOWN_COMPONENT" }]);
  assert.equal(result.report.applied.length, 0);
  assert.equal(result.twin.components.length, 3);
});

test("placeholder evidence cannot overwrite stronger existing geometry", () => {
  const twin = twinFixture();
  const scene = sceneFixture(twin);
  const result = applyPhysicalEvidence({
    twin,
    scene,
    evidence: evidenceFixture([{ componentId: "biospec_bioreactor_01", kind: "equipment", evidence: "placeholder", size: [9, 9, 9] }]),
  });
  assert.equal(result.report.applied.length, 0);
  assert.match(result.report.rejected[0].reason, /^WEAKER_THAN_EXISTING:cad$/);
  const binding = result.scene.bindings.find((b) => b.componentId === "biospec_bioreactor_01");
  assert.deepEqual(binding?.size, [1, 1, 1], "existing geometry must survive a weaker claim");
});

test("stronger evidence may supersede an earlier grade", () => {
  const twin = twinFixture();
  const scene = sceneFixture(twin);
  const result = applyPhysicalEvidence({
    twin,
    scene,
    evidence: evidenceFixture([{ componentId: "biospec_bioreactor_01", kind: "equipment", evidence: "ifc", size: [3, 2.2, 2.2], sourceRef: "ifc:2N4mP" }]),
  });
  assert.equal(result.report.applied.length, 1);
  assert.equal(result.twin.components[2].properties.geometryEvidence, "ifc");
});

test("scene bindings re-point at the twin revision the evidence produced", () => {
  const twin = twinFixture();
  const scene = sceneFixture(twin);
  const result = applyPhysicalEvidence({
    twin,
    scene,
    evidence: evidenceFixture([{ componentId: "build", kind: "space", evidence: "measured", size: [13, 15, 3.2] }]),
  });
  const expected = contentUri("twin", result.twin);
  assert.notEqual(expected, contentUri("twin", twin), "evidence must produce a new twin revision");
  for (const binding of result.scene.bindings) {
    assert.ok(binding.twinUri.startsWith(expected), `stale twinUri on ${binding.componentId}`);
  }
});

test("mesh reference outside the ingested corpus is refused", () => {
  const twin = twinFixture();
  const scene = sceneFixture(twin);
  const result = applyPhysicalEvidence({
    twin,
    scene,
    evidence: evidenceFixture([{ componentId: "build", kind: "space", evidence: "cad", assetUri: "file:///tmp/rogue.usdz" }]),
    allowedAssetUris: ["urn:c", "urn:p"],
  });
  assert.deepEqual(result.report.rejected, [{ componentId: "build", reason: "ASSET_NOT_GROUNDED" }]);
});

test("evidence grades are ranked and blueprint strings normalize onto the scale", () => {
  assert.ok(geometryEvidenceRank("ifc") > geometryEvidenceRank("cad"));
  assert.ok(geometryEvidenceRank("cad") > geometryEvidenceRank("measured"));
  assert.ok(geometryEvidenceRank("measured") > geometryEvidenceRank("placeholder"));
  assert.equal(normalizeGeometryEvidence("cad-parts-only"), "cad");
  assert.equal(normalizeGeometryEvidence("stl-parts"), "cad");
  assert.equal(normalizeGeometryEvidence("archive-inventory"), "document");
  assert.equal(normalizeGeometryEvidence("document-only"), "document");
  assert.equal(normalizeGeometryEvidence("n/a"), "placeholder");
  assert.equal(normalizeGeometryEvidence(undefined), "placeholder");
});

test("validator refuses malformed intake documents", () => {
  const base = { schema: "subactor.physical-evidence/v1", id: "e", coordinateSystem: { unit: "m", upAxis: "Z" } };
  assert.throws(() => validatePhysicalEvidence({ ...base, coordinateSystem: { unit: "mm", upAxis: "Z" }, records: [] }), /COORDINATE_SYSTEM_INVALID/);
  assert.throws(() => validatePhysicalEvidence({ ...base, records: [{ componentId: "a", kind: "equipment", evidence: "guessed" }] }), /GRADE_INVALID/);
  assert.throws(() => validatePhysicalEvidence({ ...base, records: [{ componentId: "a", kind: "equipment", evidence: "cad", size: [1, 2] }] }), /SIZE_INVALID/);
  assert.throws(() => validatePhysicalEvidence({ ...base, records: [{ componentId: "a", kind: "equipment", evidence: "cad", size: [1, 2, 0] }] }), /SIZE_NOT_POSITIVE/);
  assert.throws(
    () => validatePhysicalEvidence({ ...base, records: [{ componentId: "a", kind: "equipment", evidence: "cad" }, { componentId: "a", kind: "equipment", evidence: "ifc" }] }),
    /DUPLICATE:a/,
  );
  // Kept aligned with the JSON schema's additionalProperties:false, so a file that validates
  // against the published schema and one the runtime accepts stay the same set.
  assert.throws(() => validatePhysicalEvidence({ ...base, records: [], _help: "notes" }), /UNKNOWN_KEY:_help/);
  assert.throws(
    () => validatePhysicalEvidence({ ...base, records: [{ componentId: "a", kind: "space", evidence: "cad", heightM: 3 }] }),
    /UNKNOWN_RECORD_KEY:a:heightM/,
  );
  assert.ok(validatePhysicalEvidence({ ...base, records: [{ componentId: "a", kind: "space", evidence: "measured", size: [1, 2, 3] }] }));
});
