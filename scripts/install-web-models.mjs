#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { biofoundryLiveBlueprintV02, validateSceneBlueprint } from "../dist/src/scene/blueprint.js";
import { validatePhysicalEvidence } from "../dist/src/scene/physical-evidence.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const positional = args.filter((value) => value !== "--write");
const manifestPath = resolve(positional[0] ?? resolve(root, "../nanobionic-laboratory-md-dsl/assets/geometry/web/web-models.manifest.json"));
const blueprintPath = resolve(positional[1] ?? resolve(root, "../projects/nanobionic-laboratory-md/baseline/scene-blueprint.json"));
const evidencePath = resolve(positional[2] ?? resolve(root, "../projects/nanobionic-laboratory-md/baseline/physical-evidence.json"));
const fail = (code, detail) => { const error = new Error(detail); error.name = code; throw error; };
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const gradeRank = new Map(["placeholder", "document", "measured", "cad", "ifc", "verified"].map((grade, index) => [grade, index]));

const manifest = await json(manifestPath);
const blueprint = validateSceneBlueprint(await json(blueprintPath));
const evidence = validatePhysicalEvidence(await json(evidencePath));
const canonical = biofoundryLiveBlueprintV02();
if (manifest.schema !== "bioxfoundry.web-geometry-manifest/v1" || !Array.isArray(manifest.models)) {
  fail("WEB_MODEL_INTEGRATION_INVALID", "manifest");
}

const canonicalComponents = new Map(canonical.components.map((component) => [component.id, component]));
const canonicalBindings = new Map(canonical.bindings.map((binding) => [binding.componentId, binding]));
const targetComponents = new Map(blueprint.components.map((component) => [component.id, component]));
const targetBindings = new Map(blueprint.bindings.map((binding) => [binding.componentId, binding]));
const evidenceById = new Map(evidence.records.map((record) => [record.componentId, record]));
const addedComponents = [];
const updatedBindings = new Set();
const updatedEvidence = new Set();

function checkedModel(model) {
  const integration = model?.integration;
  if (!model?.id || !Array.isArray(model.componentIds) || !model.componentIds.length || !model.asset?.sha256 || !model.asset?.path ||
      !model.representationClass || !integration || !gradeRank.has(integration.evidenceGrade) || !integration.sourceRef ||
      !integration.placementMethod || !integration.placementConfidence || !integration.evidenceScope || !integration.geometryCompleteness) {
    fail("WEB_MODEL_INTEGRATION_INVALID", model?.id ?? "model");
  }
  return integration;
}

function installCanonicalBinding(componentId) {
  const binding = canonicalBindings.get(componentId);
  if (!binding) fail("WEB_MODEL_INTEGRATION_COMPONENT_MISSING", `${componentId}:binding`);
  targetBindings.set(componentId, structuredClone(binding));
  updatedBindings.add(componentId);
  return binding;
}

for (const model of manifest.models) {
  const integration = checkedModel(model);
  for (const componentId of model.componentIds) {
    const canonicalComponent = canonicalComponents.get(componentId);
    if (!canonicalComponent) fail("WEB_MODEL_INTEGRATION_COMPONENT_MISSING", `${componentId}:component`);
    if (!targetComponents.has(componentId)) {
      const component = structuredClone(canonicalComponent);
      blueprint.components.push(component);
      targetComponents.set(componentId, component);
      addedComponents.push(componentId);
      if (component.parentId && canonicalBindings.get(component.parentId)?.primitive === "scope") {
        installCanonicalBinding(component.parentId);
      }
    }
    const binding = installCanonicalBinding(componentId);
    if (!binding.position || !binding.size) fail("WEB_MODEL_INTEGRATION_INVALID", `${componentId}:spatial-binding`);
    const record = {
      componentId,
      kind: "equipment",
      evidence: integration.evidenceGrade,
      position: binding.position,
      size: binding.size,
      orientation: binding.orientation ?? [0, 0, 0, 1],
      assetUri: `urn:subactor:resource:sha256:${model.asset.sha256}`,
      sourceRef: integration.sourceRef,
      properties: {
        geometryRepresentationClass: model.representationClass,
        geometryCompleteness: integration.geometryCompleteness,
        evidenceScope: integration.evidenceScope,
        modelManifestId: model.id,
        modelSourceHomepage: model.source.homepage,
        sourceLicense: model.source.license,
        sourceRevision: model.source.revision,
        placementMethod: integration.placementMethod,
        placementConfidence: integration.placementConfidence,
        sourceUnit: "m"
      }
    };
    const previous = evidenceById.get(componentId);
    if (previous && gradeRank.get(previous.evidence) > gradeRank.get(record.evidence)) continue;
    evidenceById.set(componentId, record);
    updatedEvidence.add(componentId);
  }
}

blueprint.bindings = blueprint.bindings.map((binding) => targetBindings.get(binding.componentId) ?? binding);
for (const [componentId, binding] of targetBindings) {
  if (!blueprint.bindings.some((candidate) => candidate.componentId === componentId)) blueprint.bindings.push(binding);
}
evidence.records = evidence.records.map((record) => evidenceById.get(record.componentId) ?? record);
for (const [componentId, record] of evidenceById) {
  if (!evidence.records.some((candidate) => candidate.componentId === componentId)) evidence.records.push(record);
}
validateSceneBlueprint(blueprint);
validatePhysicalEvidence(evidence);

const blueprintText = canonicalJson(blueprint);
const evidenceText = canonicalJson(evidence);
const drift = {
  blueprint: blueprintText !== await readFile(blueprintPath, "utf8"),
  physicalEvidence: evidenceText !== await readFile(evidencePath, "utf8")
};
const report = {
  schema: "bioxfoundry.web-model-integration/v1",
  ok: !drift.blueprint && !drift.physicalEvidence,
  mode: write ? "write" : "check",
  manifest: manifestPath,
  blueprint: blueprintPath,
  physicalEvidence: evidencePath,
  addedComponents,
  updatedBindings: [...updatedBindings].sort(),
  updatedEvidence: [...updatedEvidence].sort(),
  drift
};
if (!write && (drift.blueprint || drift.physicalEvidence)) {
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  fail("WEB_MODEL_INTEGRATION_DRIFT", [drift.blueprint && "blueprint", drift.physicalEvidence && "physical-evidence"].filter(Boolean).join(","));
}
if (write) {
  const blueprintTemp = `${blueprintPath}.web-models.tmp`;
  const evidenceTemp = `${evidencePath}.web-models.tmp`;
  await writeFile(blueprintTemp, blueprintText);
  await writeFile(evidenceTemp, evidenceText);
  await rename(blueprintTemp, blueprintPath);
  await rename(evidenceTemp, evidencePath);
  report.ok = true;
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
