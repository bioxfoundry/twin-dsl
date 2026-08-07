import test from "node:test";
import assert from "node:assert/strict";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";
import {
  biofoundryLiveBlueprintV02,
  materializeBlueprintScene,
  materializeBlueprintTwin,
  validateSceneBlueprint,
} from "../src/scene/blueprint.js";
import type { DevelopmentEvidenceSummary, ObservationDocument, ResourceRecord } from "../src/core/types.js";

const blueprint = validateSceneBlueprint({
  schema: "subactor.scene-blueprint/v1",
  id: "biofoundry",
  twinKind: "physical",
  components: [
    { id: "design", type: "system-layer", label: "Design", sourceRoles: ["customer"] },
    { id: "build", type: "system-layer", label: "Build", sourceRoles: ["customer", "project"], includeDevelopmentEvidence: true },
    { id: "learn", type: "system-layer", label: "Learn", sourceRoles: ["customer"], includeRuntimeObservations: true },
  ],
  bindings: [
    { componentId: "design", scenePath: "/Biofoundry/Design", position: [0, 0, 0], size: [4, 4, 2] },
    { componentId: "build", scenePath: "/Biofoundry/Build", position: [5, 0, 0], size: [4, 4, 2] },
    { componentId: "learn", scenePath: "/Biofoundry/Learn", position: [10, 0, 0], size: [4, 4, 2] },
  ],
});

const resources: ResourceRecord[] = [
  {
    schema: "subactor.resource/v1",
    id: "c",
    uri: "urn:c",
    logicalUri: "subactor://c",
    mediaType: "text/markdown",
    sha256: "a".repeat(64),
    size: 1,
    sourcePath: "c.md",
    sourceRole: "customer",
    derived: false,
    derivedFrom: [],
    createdAt: "2026-08-06T00:00:00Z",
  },
  {
    schema: "subactor.resource/v1",
    id: "p",
    uri: "urn:p",
    logicalUri: "subactor://p",
    mediaType: "text/markdown",
    sha256: "b".repeat(64),
    size: 1,
    sourcePath: "p.md",
    sourceRole: "project",
    derived: false,
    derivedFrom: [],
    createdAt: "2026-08-06T00:00:00Z",
  },
  {
    schema: "subactor.resource/v1",
    id: "r",
    uri: "urn:r",
    logicalUri: "subactor://r",
    mediaType: "application/json",
    sha256: "c".repeat(64),
    size: 1,
    sourcePath: "runtime.json",
    sourceRole: "runtime",
    derived: false,
    derivedFrom: [],
    createdAt: "2026-08-06T00:00:00Z",
  },
];

const development: DevelopmentEvidenceSummary = {
  schema: "subactor.development-evidence/v1",
  source: "todo2code",
  graphFingerprint: "d".repeat(64),
  recordCount: 1,
  relationCount: 0,
  diagnosticCount: 0,
  blockingDiagnosticCount: 0,
  acceptance: "accepted",
  manifestStatus: "succeeded",
  evidenceUris: ["urn:intent"],
};

function observations(temp: number): ObservationDocument {
  return {
    schema: "subactor.observation/v1",
    id: "obs",
    sourceSnapshotHash: "e".repeat(64),
    observations: [
      {
        id: "o1",
        observedAt: "2026-08-06T00:00:00Z",
        subjectUri: "subactor://runtime",
        metric: "temperatureC",
        value: temp,
        unit: "C",
        severity: "info",
        sourceUris: ["urn:r"],
        labels: [],
      },
    ],
  };
}

test("project DSL round-trips scene blueprint path", () => {
  const project = parseProjectDsl(`PROJECT biofoundry-test
NAME "Biofoundry"
PROFILE biofoundry
MANAGER_INTENT "Maintain semantic 3D twin"
SOURCE customer "data/customer" subactor://customer
SCENE_FORMAT openusd
SCENE_BLUEPRINT_FILE "baseline/scene-blueprint.json"
`);
  assert.equal(project.scene.blueprintFile, "baseline/scene-blueprint.json");
  assert.match(renderProjectDsl(project), /SCENE_BLUEPRINT_FILE/);
});

test("scene blueprint materializes semantic twin and scene", () => {
  const twin = materializeBlueprintTwin({
    blueprint,
    projectId: "biofoundry-test",
    resources,
    observations: observations(37),
    development,
    sourceSnapshotHash: "f".repeat(64),
  });
  assert.deepEqual(
    twin.components.map((c) => c.id),
    ["design", "build", "learn"],
  );
  assert.deepEqual(twin.components[1].sourceUris.sort(), ["urn:c", "urn:intent", "urn:p"].sort());
  assert.equal(twin.components[2].properties.latest_temperatureC, 37);
  const scene = materializeBlueprintScene({
    blueprint,
    projectId: "biofoundry-test",
    format: "openusd",
    twin,
  });
  assert.equal(scene.bindings.length, 3);
  assert.equal(scene.bindings[1].componentId, "build");
  assert.equal(scene.bindings[1].position?.[0], 5);
});

test("identity stable when state changes (temperature)", () => {
  const twin22 = materializeBlueprintTwin({
    blueprint,
    projectId: "biofoundry-test",
    resources,
    observations: observations(22),
    development,
    sourceSnapshotHash: "f".repeat(64),
  });
  const twin24 = materializeBlueprintTwin({
    blueprint,
    projectId: "biofoundry-test",
    resources,
    observations: observations(24),
    development,
    sourceSnapshotHash: "f".repeat(64),
  });
  assert.deepEqual(
    twin22.components.map((c) => c.id),
    twin24.components.map((c) => c.id),
  );
  assert.equal(twin22.components[2].properties.latest_temperatureC, 22);
  assert.equal(twin24.components[2].properties.latest_temperatureC, 24);
  const scene22 = materializeBlueprintScene({ blueprint, projectId: "biofoundry-test", format: "openusd", twin: twin22 });
  const scene24 = materializeBlueprintScene({ blueprint, projectId: "biofoundry-test", format: "openusd", twin: twin24 });
  assert.deepEqual(
    scene22.bindings.map((b) => b.componentId),
    scene24.bindings.map((b) => b.componentId),
  );
  assert.deepEqual(
    scene22.bindings.map((b) => b.scenePath),
    scene24.bindings.map((b) => b.scenePath),
  );
});

test("biofoundry live detailed blueprint keeps v0.2 IDs and adds corpus modules", () => {
  const bp = biofoundryLiveBlueprintV02();
  assert.ok(bp.components.length >= 17);
  assert.equal(bp.components.length, bp.bindings.length);
  for (const id of [
    "facility_shell",
    "liquid_handler_01",
    "flagship_cellfree_enzyme",
    "biospec_bioreactor_01",
    "oscar_robot_01",
    "sila_orchestrator_01",
  ]) {
    assert.ok(bp.components.some((c) => c.id === id), `missing ${id}`);
  }
  assert.ok(bp.components.some((c) => (c.pathIncludes?.length ?? 0) > 0));
});
