import test from "node:test";
import assert from "node:assert/strict";
import {
  BIOFOUNDRY_ZONES,
  biofoundryConceptScene,
  biofoundryConceptTree,
  biofoundryConceptTwin,
  biofoundryReadinessBindings,
  projectBiofoundryIntentEvidence,
  type GroundedIntentEvidence,
} from "../src/runtime/biofoundry-concept.js";
import type { DevelopmentEvidenceSummary, LivingProjectDocument, ObservationDocument, ResourceRecord } from "../src/core/types.js";
import { evaluateMath } from "../src/dsl/math.js";
import { validateTwin } from "../src/dsl/twin.js";
import { validateScene } from "../src/dsl/scene.js";
import { validateTwinGrounding, validateSceneGrounding } from "../src/runtime/autonomy.js";
import { canonicalIntentRecord } from "../src/dsl/intent.js";

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

test("LLM grounding rejects removal of authoritative Twin identities", () => {
  const authoritative = biofoundryConceptTwin(project(), resources(), observations, "22".repeat(32), development);
  const proposal = structuredClone(authoritative);
  proposal.components = proposal.components.filter((component) => component.id !== "test");
  assert.throws(() => validateTwinGrounding(proposal, authoritative, resources()), /TWIN_REQUIRED_COMPONENT_MISSING:test/);
});

test("LLM grounding rejects removal of authoritative scene bindings", () => {
  const twin = biofoundryConceptTwin(project(), resources(), observations, "22".repeat(32), development);
  const authoritative = biofoundryConceptScene(project(), twin);
  const proposal = structuredClone(authoritative);
  proposal.bindings = proposal.bindings.slice(1);
  assert.throws(() => validateSceneGrounding(proposal, twin, resources(), authoritative), /SCENE_REQUIRED_BINDING_MISSING/);
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

test("validated intentDSL evidence is projected into matching Twin zones and tree nodes", () => {
  const corpus = resources();
  const intents: GroundedIntentEvidence[] = [{
    sourceUri: corpus[1].uri,
    record: canonicalIntentRecord({seed:"biosafety-decision",type:"decision",text:"Every biosafety requirement must be audited before deployment.",targetUris:["subactor://markdown/study.md"]}),
  }];
  const twin = biofoundryConceptTwin(
    project(), corpus, observations, "22".repeat(32), development, intents,
  );
  validateTwin(twin);
  validateTwinGrounding(twin, twin, corpus);

  const mission = twin.components.find((component) => component.id === "mission_requirements")!;
  const governance = twin.components.find((component) => component.id === "governance_translation")!;
  const learn = twin.components.find((component) => component.id === "learn")!;
  assert.equal(mission.properties.matchedIntentCount, 1);
  assert.equal(governance.properties.matchedIntentCount, 1);
  assert.equal(learn.properties.matchedIntentCount, 0, "short AI keyword must use token boundaries");
  assert.equal(mission.children.some((child) => child.type === "intent-evidence"), false);
  assert.equal((mission.properties.intentEvidence as unknown[]).length, 1);

  const tree = biofoundryConceptTree(project(), corpus, intents);
  const layers = tree.roots[0].children.find((child) => child.id === "semantic-layers")!;
  const missionNode = layers.children.find((child) => child.id === "mission_requirements")!;
  assert.ok(missionNode.children.some((child) => child.kind === "intent-evidence"));
});

test("intent evidence enriches a blueprint-derived Twin without changing zone geometry", () => {
  const corpus = resources();
  const baseline = biofoundryConceptTwin(
    project(), corpus, observations, "22".repeat(32), development,
  );
  const originalPosition = baseline.components.find(
    (component) => component.id === "mission_requirements",
  )!.properties.position;
  const genericIntents: GroundedIntentEvidence[] = Array.from({length:13},(_,index)=>({
    sourceUri: corpus[0].uri,
    record: canonicalIntentRecord({seed:`generic-mission-${index}`,type:"decision",text:`Requirement ${index} defines a policy boundary.`,targetUris:["subactor://markdown/other.md"]}),
  }));
  const canonicalRecord = canonicalIntentRecord({seed:"mission-plan",type:"plan",text:"The implementation requirement defines a staged deployment plan.",targetUris:["subactor://markdown/A. SPECIFIKACIJA/Atvirojo kodo biofoundry studija.pdf.md"]});
  const canonicalIntent: GroundedIntentEvidence = {
    sourceUri: corpus[1].uri,
    record: canonicalRecord,
  };
  const projected = projectBiofoundryIntentEvidence(baseline, [...genericIntents,canonicalIntent]);
  const mission = projected.components.find((component) => component.id === "mission_requirements")!;
  assert.deepEqual(mission.properties.position, originalPosition);
  assert.equal(mission.properties.matchedIntentCount, 14);
  assert.equal(String(mission.properties.intentEvidenceHash).length, 64);
  assert.ok((mission.properties.intentEvidence as Array<{intentId?:string}>).some(
    (evidence) => evidence.intentId === canonicalRecord.id),
    "the declared canonical study must survive bounded evidence projection");
  validateTwinGrounding(projected, projected, corpus);
});

test("canonical equipment intent is attached to its distinct physical component", () => {
  const corpus = resources();
  const baseline = biofoundryConceptTwin(project(), corpus, observations, "22".repeat(32), development);
  baseline.components.push({
    id: "syringebot_01",
    type: "equipment",
    sourceUris: [corpus[1].uri],
    properties: {label: "Syringebot", geometryEvidence: "document-only"},
    children: [],
  });
  const syringebotRecord = canonicalIntentRecord({seed:"syringebot-plan",type:"plan",text:"Syringebot is the open-source 3D chemical synthesis robot in the laboratory workflow.",targetUris:["subactor://markdown/A. SPECIFIKACIJA/Atvirojo kodo biofoundry studija.pdf.md"]});
  const intent: GroundedIntentEvidence = {
    sourceUri: corpus[1].uri,
    record: syringebotRecord,
  };
  const projected = projectBiofoundryIntentEvidence(baseline, [intent]);
  const component = projected.components.find((item) => item.id === "syringebot_01")!;
  assert.equal(component.properties.matchedIntentCount, 1);
  assert.equal((component.properties.intentEvidence as Array<{intentId: string}>)[0].intentId, syringebotRecord.id);
  assert.equal(component.properties.geometryEvidence, "document-only");
});
