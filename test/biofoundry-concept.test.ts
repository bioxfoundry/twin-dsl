import test from "node:test";
import assert from "node:assert/strict";
import {
  BIOFOUNDRY_ZONES,
  biofoundryConceptScene,
  biofoundryConceptTree,
  biofoundryConceptTwin,
  biofoundryReadinessBindings,
} from "../src/runtime/biofoundry-concept.js";
import type { DevelopmentEvidenceSummary, LivingProjectDocument, ObservationDocument, ResourceRecord } from "../src/core/types.js";
import { evaluateMath } from "../src/dsl/math.js";
import { validateTwin } from "../src/dsl/twin.js";
import { validateScene } from "../src/dsl/scene.js";
import { validateTwinGrounding, validateSceneGrounding } from "../src/runtime/autonomy.js";

function project(): LivingProjectDocument {
  return {
    schema: "subactor.living-project/v1",
    id: "nanobionic-laboratory",
    name: "Nanobionic Laboratory",
    profile: "biofoundry",
    managerIntent: "Concept twin",
    sources: [],
    development: { root: "code" },
    observations: { paths: ["logs"], logicalRoot: "subactor://project/nanobionic-laboratory/runtime" },
    policy: {
      approved: true,
      requireResearch: true,
      requireDevelopmentEvidence: true,
      requireDevelopmentAcceptance: true,
      allowDevelopmentFixture: true,
      requireRuntimeEvidence: true,
      autoPublishScene: true,
      allowRuntimeSelfModification: false,
      autonomyMode: "propose",
      requireSignedMutationGrant: true,
      maxIterationsPerHour: 12,
      maxConsecutiveFailures: 5,
    },
    scene: { format: "openusd" },
  };
}

function resources(): ResourceRecord[] {
  return [
    {
      schema: "subactor.resource/v1",
      id: "r1",
      uri: "urn:subactor:resource:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      logicalUri: "subactor://project/nanobionic-laboratory/manager/policy",
      mediaType: "text/markdown",
      sha256: "aa".repeat(32),
      size: 10,
      sourcePath: "data/manager/policy.md",
      sourceRole: "manager",
      labels: ["policy"],
      derived: false,
      derivedFrom: [],
      createdAt: "2026-08-06T00:00:00.000Z",
    },
    {
      schema: "subactor.resource/v1",
      id: "r2",
      uri: "urn:subactor:resource:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      logicalUri: "subactor://project/nanobionic-laboratory/customer/study",
      mediaType: "application/pdf",
      sha256: "bb".repeat(32),
      size: 20,
      sourcePath: "imports/customer/Atvirojo-kodo-biofoundry-studija-1.pdf",
      sourceRole: "customer",
      labels: ["study"],
      derived: false,
      derivedFrom: [],
      createdAt: "2026-08-06T00:00:00.000Z",
    },
    {
      schema: "subactor.resource/v1",
      id: "r3",
      uri: "urn:subactor:resource:sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      logicalUri: "subactor://project/nanobionic-laboratory/development/bioreactor",
      mediaType: "text/x-python",
      sha256: "cc".repeat(32),
      size: 30,
      sourcePath: "code/src/bioreactor/main_control.py",
      sourceRole: "development",
      labels: ["biospec"],
      derived: false,
      derivedFrom: [],
      createdAt: "2026-08-06T00:00:00.000Z",
    },
    {
      schema: "subactor.resource/v1",
      id: "r4",
      uri: "urn:subactor:resource:sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      logicalUri: "subactor://project/nanobionic-laboratory/runtime/env",
      mediaType: "application/json",
      sha256: "dd".repeat(32),
      size: 5,
      sourcePath: "environment/current.json",
      sourceRole: "runtime",
      labels: [],
      derived: false,
      derivedFrom: [],
      createdAt: "2026-08-06T00:00:00.000Z",
    },
  ];
}

const development: DevelopmentEvidenceSummary = {
  schema: "subactor.development-evidence/v1",
  source: "fixture",
  graphFingerprint: "ff".repeat(32),
  recordCount: 2,
  relationCount: 0,
  diagnosticCount: 0,
  blockingDiagnosticCount: 0,
  acceptance: "accepted",
  manifestStatus: null,
  evidenceUris: ["urn:subactor:intent:sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
};

const observations: ObservationDocument = {
  schema: "subactor.observation/v1",
  id: "obs",
  sourceSnapshotHash: "11".repeat(32),
  observations: [
    {
      id: "o1",
      observedAt: "2026-08-06T00:00:00.000Z",
      subjectUri: "subactor://project/nanobionic-laboratory/runtime",
      metric: "temperatureC",
      value: 22,
      severity: "info",
      sourceUris: ["urn:subactor:resource:sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
      labels: [],
    },
  ],
};

test("biofoundry concept twin exposes 8 stable zones with placeholder geometry", () => {
  assert.equal(BIOFOUNDRY_ZONES.length, 8);
  const twin = biofoundryConceptTwin(project(), resources(), observations, "22".repeat(32), development);
  validateTwin(twin);
  const zoneIds = BIOFOUNDRY_ZONES.map((zone) => zone.id);
  for (const id of zoneIds) {
    const component = twin.components.find((item) => item.id === id);
    assert.ok(component, `missing zone ${id}`);
    assert.equal(component!.properties.geometryStatus, "placeholder");
    assert.ok(String(component!.properties.semanticId).startsWith("twin://biofoundry/"));
  }
  validateTwinGrounding(twin, twin, resources());
});

test("biofoundry concept scene uses 8-zone layout not knowledge-role grid", () => {
  const twin = biofoundryConceptTwin(project(), resources(), observations, "22".repeat(32), development);
  const scene = biofoundryConceptScene(project(), twin);
  validateScene(scene);
  validateSceneGrounding(scene, twin, resources());
  const mission = scene.bindings.find((binding) => binding.componentId === "mission_requirements");
  assert.ok(mission);
  assert.deepEqual(mission!.position, [-22.5, 9.0, 0]);
  assert.deepEqual(mission!.size, [13, 15, 4]);
  assert.ok(scene.bindings.every((binding) => !String(binding.componentId).endsWith("-knowledge")));
});

test("biofoundry readiness: concept publishable, physical not ready", () => {
  const readiness = biofoundryReadinessBindings(resources());
  const math = {
    schema: "subactor.math/v1" as const,
    id: "readiness",
    bindings: readiness.bindings.map((binding) => ({ ...binding, sourceUris: binding.sourceUris })),
    expressions: readiness.expressions as never,
  };
  assert.equal(evaluateMath(math, "ConceptScenePublishAllowed"), true);
  assert.equal(evaluateMath(math, "PhysicalTwinReady"), false);
  assert.equal(evaluateMath(math, "OperationalTwinReady"), false);
});

test("biofoundry concept tree includes semantic layers and knowledge index", () => {
  const tree = biofoundryConceptTree(project(), resources());
  assert.equal(tree.schema, "subactor.tree/v1");
  const root = tree.roots[0];
  assert.ok(root.children.some((child) => child.id === "semantic-layers"));
  assert.ok(root.children.some((child) => child.id === "knowledge-sources"));
  const layers = root.children.find((child) => child.id === "semantic-layers")!;
  assert.equal(layers.children.length, 8);
});
