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
