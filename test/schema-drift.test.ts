/**
 * Schema drift guard: a document accepted by the published JSON Schema must also be accepted by the
 * hand-written runtime validator, and vice versa. Without this the two descriptions of the same
 * contract diverge silently — which is how `position: [1, 2]` once reached the USD renderer and
 * produced an unloadable layer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkJsonSchema, matchesJsonSchema } from "../src/core/json-schema.js";
import { biofoundryLiveBlueprintV02, validateSceneBlueprint } from "../src/scene/blueprint.js";
import { validatePhysicalEvidence } from "../src/scene/physical-evidence.js";
import { validateGeometryBuild } from "../src/geometry/build-contract.js";
import { validateLiveBinding } from "../src/dsl/live-binding.js";
import { validateAssembly } from "../src/dsl/assembly.js";
import { validateProcessDocument } from "../src/dsl/process.js";
import { validateSourceCoverage } from "../src/runtime/source-coverage.js";
import { deriveBiofoundryProcesses } from "../src/runtime/process-model.js";
import { compileProcessAnimation, validateProcessAnimation } from "../src/runtime/process-animation.js";
import { buildSourceCoverage } from "../js/f2md/src/source-coverage.js";
import { canonicalIntents, COMPONENT_IDS, deviceIntents, twin } from "./fixtures/process-fixture.js";
import type { SceneDocument } from "../src/core/types.js";

const schemasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas");
async function schema(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(schemasDir, name), "utf8"));
}

function accepts(validator: (value: unknown) => unknown, value: unknown): boolean {
  try {
    validator(value);
    return true;
  } catch {
    return false;
  }
}

/** Assert both descriptions of the contract agree on every document in the corpus. */
async function assertNoDrift(
  schemaFile: string,
  validator: (value: unknown) => unknown,
  corpus: { name: string; document: unknown }[],
): Promise<void> {
  const definition = await schema(schemaFile);
  const disagreements: string[] = [];
  for (const { name, document } of corpus) {
    const bySchema = matchesJsonSchema(definition, document);
    const byValidator = accepts(validator, document);
    if (bySchema !== byValidator) {
      disagreements.push(`${name}: schema=${bySchema ? "accept" : "reject"} validator=${byValidator ? "accept" : "reject"}`);
    }
  }
  assert.deepEqual(disagreements, [], `${schemaFile} drifted from its runtime validator`);
}

const blueprintBase = {
  schema: "subactor.scene-blueprint/v1",
  id: "bp",
  twinKind: "physical",
  components: [{ id: "a", type: "zone", spatialClass: "physical", sourceRoles: ["project"] }],
  bindings: [{ componentId: "a", scenePath: "/Root/A" }],
};

test("scene-blueprint schema and runtime validator agree", async () => {
  await assertNoDrift("scene-blueprint.schema.json", validateSceneBlueprint, [
    { name: "minimal valid", document: blueprintBase },
    { name: "full valid", document: { ...blueprintBase,
      components: [{ id: "a", type: "zone", spatialClass: "physical", spatialRequirements: { require: ["position", "size", "orientation"], optional: ["constraints"] }, label: "A", sourceRoles: ["project", "customer"], pathIncludes: ["x"], pathExcludes: ["y"], maxSourceUris: 5, properties: { k: 1 }, includeDevelopmentEvidence: true, includeRuntimeObservations: true }],
      bindings: [{ componentId: "a", scenePath: "/Root/A", primitive: "cylinder", position: [1, 2, 3], size: [1, 2, 3], propertyMap: { a: "subactor:a" } }] } },
    { name: "empty components", document: { ...blueprintBase, components: [] } },
    { name: "empty bindings", document: { ...blueprintBase, bindings: [] } },
    { name: "unknown sourceRole", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["not-a-role"] }] } },
    { name: "empty component id", document: { ...blueprintBase, components: [{ id: "", type: "zone", sourceRoles: ["project"] }] } },
    { name: "empty component type", document: { ...blueprintBase, components: [{ id: "a", type: "", sourceRoles: ["project"] }] } },
    { name: "position too short", document: { ...blueprintBase, bindings: [{ componentId: "a", scenePath: "/Root/A", position: [1, 2] }] } },
    { name: "size too long", document: { ...blueprintBase, bindings: [{ componentId: "a", scenePath: "/Root/A", size: [1, 2, 3, 4] }] } },
    { name: "relative scenePath", document: { ...blueprintBase, bindings: [{ componentId: "a", scenePath: "Root/A" }] } },
    { name: "unknown primitive", document: { ...blueprintBase, bindings: [{ componentId: "a", scenePath: "/Root/A", primitive: "torus" }] } },
    { name: "wrong schema id", document: { ...blueprintBase, schema: "subactor.scene-blueprint/v2" } },
    { name: "unknown twinKind", document: { ...blueprintBase, twinKind: "imaginary" } },
    { name: "empty id", document: { ...blueprintBase, id: "" } },
    { name: "unknown document key", document: { ...blueprintBase, note: "hi" } },
    { name: "unknown component key", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["project"], colour: "red" }] } },
    { name: "unknown binding key", document: { ...blueprintBase, bindings: [{ componentId: "a", scenePath: "/Root/A", rotation: [0, 0, 0] }] } },
    { name: "duplicate sourceRoles", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["project", "project"] }] } },
    { name: "non-string label", document: { ...blueprintBase, components: [{ id: "a", type: "zone", label: 7, sourceRoles: ["project"] }] } },
    { name: "maxSourceUris zero", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["project"], maxSourceUris: 0 }] } },
    { name: "maxSourceUris too large", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["project"], maxSourceUris: 501 }] } },
    { name: "maxSourceUris fractional", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["project"], maxSourceUris: 2.5 }] } },
    { name: "properties as array", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["project"], properties: [] }] } },
    { name: "non-boolean flag", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["project"], includeRuntimeObservations: "yes" }] } },
    { name: "propertyMap with non-string value", document: { ...blueprintBase, bindings: [{ componentId: "a", scenePath: "/Root/A", propertyMap: { k: 3 } }] } },
    { name: "non-string pathIncludes", document: { ...blueprintBase, components: [{ id: "a", type: "zone", sourceRoles: ["project"], pathIncludes: [3] }] } },
  ]);
});

const evidenceBase = {
  schema: "subactor.physical-evidence/v1",
  id: "e",
  coordinateSystem: { unit: "m", upAxis: "Z" },
  records: [{ componentId: "a", kind: "equipment", evidence: "measured" }],
};

const geometryBuildBase = {
  schema: "subactor.geometry-build/v1",
  id: "lid-unf-v1",
  source: { path: "lid_UNF.scad", uri: `urn:subactor:resource:sha256:${"a".repeat(64)}`, sha256: "a".repeat(64), format: "scad" },
  engine: { type: "openscad" },
  target: { componentId: "lid", scenePath: "/Biofoundry/Lid", kind: "equipment" },
  coordinateSystem: { unit: "millimeter", upAxis: "Z", handedness: "right" },
  dependencies: [{ path: "threadlib/threadlib.scad", mountPath: "threadlib", sourcePath: "libs/threadlib", uri: `urn:subactor:resource:sha256:${"b".repeat(64)}`, sha256: "b".repeat(64) }],
  parameters: { presetId: "production-v1", values: { diameter: 72 } },
  compilerOptions: { hardWarnings: true, timeoutSeconds: 120, maxTriangles: 1000000 },
  outputs: { canonical: "3mf", web: "glb", scene: "usda" },
  validations: { nonEmpty: true, finiteBbox: true, dependencyClosure: true, glbLoad: true, usdStageOpen: false, bboxToleranceM: 0.000001 },
};

test("geometry-build schema and runtime validator agree", async () => {
  await assertNoDrift("geometry-build.schema.json", validateGeometryBuild, [
    { name: "valid", document: geometryBuildBase },
    { name: "unknown unit", document: { ...geometryBuildBase, coordinateSystem: { ...geometryBuildBase.coordinateSystem, unit: "parsec" } } },
    { name: "mount traversal", document: { ...geometryBuildBase, dependencies: [{ ...geometryBuildBase.dependencies[0], mountPath: "../threadlib" }] } },
    { name: "unbounded timeout", document: { ...geometryBuildBase, compilerOptions: { ...geometryBuildBase.compilerOptions, timeoutSeconds: 3601 } } },
    { name: "unknown key", document: { ...geometryBuildBase, note: "not allowed" } },
  ]);
});

test("physical-evidence schema and runtime validator agree", async () => {
  await assertNoDrift("physical-evidence.schema.json", validatePhysicalEvidence, [
    { name: "minimal valid", document: evidenceBase },
    { name: "no records", document: { ...evidenceBase, records: [] } },
    { name: "full valid", document: { ...evidenceBase,
      coordinateSystem: { unit: "m", upAxis: "Z", origin: "datum" },
      records: [{ componentId: "a", kind: "space", evidence: "ifc", position: [0, 0, 0], size: [1, 2, 3], assetUri: "urn:x", sourceRef: "ifc:1", properties: { k: 1 } }] } },
    { name: "millimetres", document: { ...evidenceBase, coordinateSystem: { unit: "mm", upAxis: "Z" } } },
    { name: "Y up", document: { ...evidenceBase, coordinateSystem: { unit: "m", upAxis: "Y" } } },
    { name: "unknown grade", document: { ...evidenceBase, records: [{ componentId: "a", kind: "equipment", evidence: "guessed" }] } },
    { name: "unknown kind", document: { ...evidenceBase, records: [{ componentId: "a", kind: "vehicle", evidence: "cad" }] } },
    { name: "zero extent", document: { ...evidenceBase, records: [{ componentId: "a", kind: "equipment", evidence: "cad", size: [1, 1, 0] }] } },
    { name: "negative extent", document: { ...evidenceBase, records: [{ componentId: "a", kind: "equipment", evidence: "cad", size: [1, 1, -2] }] } },
    { name: "size too short", document: { ...evidenceBase, records: [{ componentId: "a", kind: "equipment", evidence: "cad", size: [1, 2] }] } },
    { name: "empty componentId", document: { ...evidenceBase, records: [{ componentId: "", kind: "equipment", evidence: "cad" }] } },
    { name: "empty assetUri", document: { ...evidenceBase, records: [{ componentId: "a", kind: "equipment", evidence: "cad", assetUri: "" }] } },
    { name: "unknown record key", document: { ...evidenceBase, records: [{ componentId: "a", kind: "equipment", evidence: "cad", heightM: 3 }] } },
    { name: "unknown document key", document: { ...evidenceBase, note: "hi" } },
    { name: "missing coordinateSystem", document: { schema: evidenceBase.schema, id: "e", records: [] } },
    { name: "wrong schema id", document: { ...evidenceBase, schema: "subactor.physical-evidence/v2" } },
  ]);
});

const liveBindingBase = {
  schema: "subactor.live-binding/v1", id: "live-v1", bindings: [{
    id: "temperature", source: { subjectUri: "urn:component:reactor", metric: "temperature" },
    target: { componentId: "reactor", property: "thermal_state" },
    freshness: { freshForMs: 10_000, expireAfterMs: 30_000, onStale: "unknown" },
    valueStates: {}, ranges: [{ min: 20, max: 40, state: "nominal" }],
  }],
};

test("live-binding schema and runtime validator agree", async () => {
  await assertNoDrift("live-binding.schema.json", validateLiveBinding, [
    { name: "valid", document: liveBindingBase },
    { name: "empty bindings", document: { ...liveBindingBase, bindings: [] } },
    { name: "empty id", document: { ...liveBindingBase, id: "" } },
    { name: "unknown target key", document: { ...liveBindingBase, bindings: [{ ...liveBindingBase.bindings[0], target: { ...liveBindingBase.bindings[0].target, guessed: true } }] } },
    { name: "invalid range", document: { ...liveBindingBase, bindings: [{ ...liveBindingBase.bindings[0], ranges: [{ min: "cold", state: "nominal" }] }] } },
    { name: "unknown document key", document: { ...liveBindingBase, note: "not allowed" } },
  ]);
});

const assemblyBase = {
  schema: "subactor.assembly/v1", id: "lab-assemblies", assemblies: [{
    id: "reactor", rootComponentId: "reactor_01", kind: "device", parts: [
      { id: "lid", componentId: "reactor_lid", required: true, assetUri: "urn:asset:lid", scenePath: "/Lab/Reactor/Lid" },
    ],
  }],
};

test("assembly schema and runtime validator agree", async () => {
  await assertNoDrift("assembly.schema.json", validateAssembly, [
    { name: "valid", document: assemblyBase },
    { name: "empty assemblies", document: { ...assemblyBase, assemblies: [] } },
    { name: "duplicate assembly id", document: { ...assemblyBase, assemblies: [assemblyBase.assemblies[0], assemblyBase.assemblies[0]] } },
    { name: "relative scene path", document: { ...assemblyBase, assemblies: [{ ...assemblyBase.assemblies[0], parts: [{ ...assemblyBase.assemblies[0].parts[0], scenePath: "Lab/Lid" }] }] } },
    { name: "unknown kind", document: { ...assemblyBase, assemblies: [{ ...assemblyBase.assemblies[0], kind: "workflow" }] } },
    { name: "unknown part key", document: { ...assemblyBase, assemblies: [{ ...assemblyBase.assemblies[0], parts: [{ ...assemblyBase.assemblies[0].parts[0], guessed: true }] }] } },
  ]);
});

test("the blueprint shipped by the wizard validates against its own schema", async () => {
  // The wizard writes this file into every biofoundry project, so it is the artifact that matters.
  const blueprint = biofoundryLiveBlueprintV02();
  assert.deepEqual(checkJsonSchema(await schema("scene-blueprint.schema.json"), blueprint), []);
  assert.ok(validateSceneBlueprint(blueprint));
});

test("the shipped intake template validates against its own schema", async () => {
  const template = JSON.parse(await readFile(join(schemasDir, "..", "physical-intake/templates/physical-evidence.template.json"), "utf8"));
  assert.deepEqual(checkJsonSchema(await schema("physical-evidence.schema.json"), template), []);
  assert.ok(validatePhysicalEvidence(template));
});

test("f2md typed-artifact schemas accept the canonical file contract and reject drift", async () => {
  const sourceHash = "a".repeat(64);
  const contentHash = "b".repeat(64);
  const artifactHash = "c".repeat(64);
  const artifact = {
    id: `artifact-heading-${artifactHash.slice(0, 12)}`,
    urn: `urn:subactor:artifact:sha256:${artifactHash}`,
    type: "heading",
    subtype: null,
    pages: [1],
    bbox: [10, 20, 100, 40],
    semantic: true,
    confidence: 1,
    quality: "validated",
    content: { level: 1, text: "Report" },
    relations: [],
  };
  const ast = {
    schema: "f2md.document-ast/v1",
    source: "/evidence/report.pdf",
    sourceSha256: sourceHash,
    extractor: { name: "pymupdf-layout", version: "1.26.3", mode: "layout-first" },
    pages: [{ number: 1, width: 595, height: 842 }],
    artifacts: [artifact],
    relations: [],
    ocr: {
      requested: false, actuallyUsed: false, engine: "none", version: "unknown",
      languages: [], pages: [], regions: [], confidence: null,
    },
  };
  const manifest = {
    schema: "f2md.artifact-manifest/v1",
    sourceSha256: sourceHash,
    documentAst: "report.pdf.ast.json",
    artifacts: [{
      id: artifact.id, urn: artifact.urn, type: artifact.type, pages: [1], bbox: artifact.bbox,
      contentSha256: contentHash, contentUri: null, contentFileSha256: null,
      previewUri: null, previewSha256: null, originalUri: null, originalSha256: null,
      additionalFiles: [], quality: "validated",
    }],
  };
  const structure = {
    schema: "bioxfoundry.document-structure/v1",
    source: ast.source,
    sourceSha256: sourceHash,
    rawMarkdownSha256: contentHash,
    canonicalMarkdownSha256: contentHash,
    pages: ast.pages,
    blocks: [{
      id: `block-${artifactHash.slice(0, 16)}`, type: "heading", page: 1,
      bbox: artifact.bbox, semantic: true, confidence: 1, normalizedText: "Report",
    }],
    ocr: {
      ocrRequested: false, ocrActuallyUsed: false, ocrEngine: "none", ocrVersion: "unknown",
      ocrLanguages: [], ocrPages: [], ocrRegions: [], ocrConfidence: null,
    },
  };
  const markdownQuality = {
    schema: "bioxfoundry.markdown-quality/v1", status: "pass", score: 100,
    sourceSha256: sourceHash, canonicalMarkdownSha256: contentHash,
    metrics: { artifacts: 1 }, repairs: {}, suspectTokens: [],
    checks: [{ id: "SOURCE_MODEL", status: "pass", actual: "f2md.document-ast/v1", expected: "f2md.document-ast/v1" }],
  };
  const artifactQuality = {
    schema: "f2md.artifact-quality/v1", sourceSha256: sourceHash, status: "pass",
    counts: { heading: 1, pass: 1 },
    artifacts: [{ id: artifact.id, type: "heading", status: "pass", checks: [] }],
  };
  const corpus: [string, unknown][] = [
    ["document-ast.schema.json", ast],
    ["artifact-manifest.schema.json", manifest],
    ["document-structure.schema.json", structure],
    ["markdown-quality.schema.json", markdownQuality],
    ["artifact-quality.schema.json", artifactQuality],
  ];
  for (const [schemaFile, document] of corpus) {
    assert.deepEqual(checkJsonSchema(await schema(schemaFile), document), [], schemaFile);
  }

  const missingFileHash = structuredClone(manifest);
  delete (missingFileHash.artifacts[0] as Partial<typeof manifest.artifacts[0]>).contentFileSha256;
  assert.notDeepEqual(checkJsonSchema(await schema("artifact-manifest.schema.json"), missingFileHash), []);
  const invalidDerivative = {
    ...manifest,
    artifacts: [{ ...manifest.artifacts[0], additionalFiles: [{
      role: "table-csv", uri: "report.pdf.artifacts/table.csv", sha256: "not-a-hash", mediaType: "text/csv",
    }] }],
  };
  assert.notDeepEqual(checkJsonSchema(await schema("artifact-manifest.schema.json"), invalidDerivative), []);
  assert.notDeepEqual(checkJsonSchema(
    await schema("document-ast.schema.json"), { ...ast, schema: "f2md.document-ast/v2" },
  ), []);
});

test("diagram graph schema accepts source-bound deterministic graphs and rejects shape drift", async () => {
  const first = "node-chemos-aaaaaaaaaa";
  const second = "node-opentwins-bbbbbbbbbb";
  const graph = {
    schema: "f2md.diagram-graph/v1",
    generation: "deterministic-ascii-v1",
    sourceTextSha256: "a".repeat(64),
    nodes: [
      { id: first, label: "ChemOS", sourceLines: [1] },
      { id: second, label: "OpenTwins", sourceLines: [3] },
    ],
    edges: [{
      id: "edge-cccccccccc", from: first, to: second, directed: true,
      confidence: 0.92, sourceLines: [2],
    }],
    validation: {
      valid: true, nodes: 2, edges: 1, nodeLabelsInSource: 2,
      labelCoverage: 1, danglingEdges: 0, meanEdgeConfidence: 0.92,
      sourceHashMatches: true,
    },
  };
  assert.deepEqual(checkJsonSchema(await schema("diagram-graph.schema.json"), graph), []);
  assert.notDeepEqual(checkJsonSchema(
    await schema("diagram-graph.schema.json"), { ...graph, generation: "llm-unbound" },
  ), []);
  assert.notDeepEqual(checkJsonSchema(
    await schema("diagram-graph.schema.json"), { ...graph, nodes: [{ ...graph.nodes[0], invented: true }] },
  ), []);
});

test("source coverage schema accepts the emitted contract and runtime verifies cross-field integrity", async () => {
  const sourceHash = "a".repeat(64);
  const coverage = buildSourceCoverage("b".repeat(64), [{
    path: "documents/report.pdf",
    inputKind: ".pdf",
    mediaType: "application/pdf",
    sourceSha256: sourceHash,
    resourceUri: `urn:subactor:resource:sha256:${sourceHash}`,
    markdownPath: "documents/report.pdf.md",
    intentUris: [],
    treeRefs: ["documents"],
    converter: "pymupdf-layout",
    converterVersion: "1.28.2",
    state: "converted",
    reasonCode: "CONVERTED",
    twinRevisionStatus: "not-evaluated",
  }]);
  assert.deepEqual(checkJsonSchema(await schema("source-coverage.schema.json"), coverage), []);
  assert.deepEqual(validateSourceCoverage(coverage), coverage);

  const traversal = structuredClone(coverage);
  traversal.records[0].path = "../report.pdf";
  assert.notDeepEqual(checkJsonSchema(await schema("source-coverage.schema.json"), traversal), []);
  assert.equal(accepts(validateSourceCoverage, traversal), false);

  const missingState = structuredClone(coverage) as unknown as { summary: { byState: Record<string, number> } };
  delete missingState.summary.byState.quarantined;
  assert.notDeepEqual(checkJsonSchema(await schema("source-coverage.schema.json"), missingState), []);
  assert.equal(accepts(validateSourceCoverage, missingState), false);

  const tamperedCount = structuredClone(coverage);
  tamperedCount.summary.terminal = 2;
  assert.equal(matchesJsonSchema(await schema("source-coverage.schema.json"), tamperedCount), true);
  assert.equal(accepts(validateSourceCoverage, tamperedCount), false, "runtime must enforce sums schemas cannot express");

  const tamperedHash = structuredClone(coverage);
  tamperedHash.coverageSha256 = "c".repeat(64);
  assert.equal(matchesJsonSchema(await schema("source-coverage.schema.json"), tamperedHash), true);
  assert.equal(accepts(validateSourceCoverage, tamperedHash), false, "runtime must verify the canonical report hash");
});

test("process and animation schemas accept emitted documents and reject contract drift", async () => {
  const processes = deriveBiofoundryProcesses({
    projectId: "biofoundry",
    sourceSnapshotHash: "d".repeat(64),
    intents: [...canonicalIntents(), ...deviceIntents()],
    twin: twin(),
  });
  const scene: SceneDocument = {
    schema: "subactor.scene/v1",
    id: "process-schema-scene",
    format: "openusd",
    sourceTwinId: "test-twin",
    bindings: COMPONENT_IDS.map((componentId, index) => ({
      twinUri: `urn:test#${componentId}`,
      componentId,
      scenePath: `/Biofoundry/${componentId}`,
      primitive: "cube",
      position: [index, 0, 0],
      size: [1, 1, 1],
      propertyMap: {},
    })),
  };
  const animation = compileProcessAnimation(processes, scene);
  const badProcessKind = structuredClone(processes) as unknown as { processes: Array<{ kind: string }> };
  badProcessKind.processes[0].kind = "invented";
  const badParameterBasis = structuredClone(processes) as unknown as { processes: Array<{ steps: Array<{ parameters: Array<{ basis: string }> }> }> };
  badParameterBasis.processes.find((process) => process.steps.some((step) => step.parameters.length))!.steps.find((step) => step.parameters.length)!.parameters[0].basis = "inferred";
  const emptyParameterValue = structuredClone(processes) as unknown as { processes: Array<{ steps: Array<{ parameters: Array<{ value: unknown }> }> }> };
  emptyParameterValue.processes.find((process) => process.steps.some((step) => step.parameters.length))!.steps.find((step) => step.parameters.length)!.parameters[0].value = "";
  const factualAnimation = structuredClone(animation) as unknown as { timing: { factualProcessDuration: boolean } };
  factualAnimation.timing.factualProcessDuration = true;

  await assertNoDrift("process.schema.json", validateProcessDocument, [
    { name: "emitted process", document: processes },
    { name: "unknown process kind", document: badProcessKind },
    { name: "parameter basis must be source", document: badParameterBasis },
    { name: "parameter value cannot be empty", document: emptyParameterValue },
  ]);
  await assertNoDrift("process-animation.schema.json", (value) => validateProcessAnimation(value, processes, scene), [
    { name: "emitted animation", document: animation },
    { name: "animation falsely claims factual timing", document: factualAnimation },
  ]);

  const brokenTransition = structuredClone(processes);
  brokenTransition.processes[0].steps[0].transitions.success = "unknown-step";
  assert.equal(matchesJsonSchema(await schema("process.schema.json"), brokenTransition), true, "JSON Schema cannot express graph reachability");
  assert.equal(accepts(validateProcessDocument, brokenTransition), false, "runtime must enforce graph reachability");
});

test("every shipped schema uses only the supported vocabulary", async () => {
  // Guards the checker itself: a schema growing a keyword this evaluator cannot see would
  // otherwise make the drift tests above silently weaker.
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(schemasDir)).filter((name) => name.endsWith(".json"));
  assert.ok(files.length >= 20, "expected the full schema set");
  const unsupported: string[] = [];
  for (const file of files) {
    // Validating a schema against itself is meaningless; instead check the checker accepts its
    // vocabulary by running it against a value that exercises every node it can reach.
    const violations = checkJsonSchema(await schema(file), undefined);
    for (const violation of violations) {
      if (violation.message.startsWith("unsupported schema keyword")) unsupported.push(`${file}${violation.path}: ${violation.message}`);
    }
  }
  assert.deepEqual(unsupported, []);
});
