import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { biofoundryLiveBlueprintV02 } from "../src/scene/blueprint.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const installer = join(root, "scripts/install-web-models.mjs");
const assetSha = "a".repeat(64);

function manifest(componentId = "biospec_controller_01") {
  return {
    schema: "bioxfoundry.web-geometry-manifest/v1",
    models: [{
      id: "fixture-model",
      componentIds: [componentId],
      representationClass: "model-specific-reference",
      integration: {
        evidenceGrade: "document",
        sourceRef: "subactor://project/fixture/derived/geometry/fixture.glb",
        placementMethod: "document-derived-presentation",
        placementConfidence: "presentation-only",
        evidenceScope: "Fixture reference only.",
        geometryCompleteness: "reference"
      },
      asset: { path: "fixture.glb", sha256: assetSha },
      source: { homepage: "https://example.invalid/model", license: "GPL-3.0", revision: "fixture-revision" }
    }]
  };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "web-model-installer-"));
  const manifestPath = join(directory, "manifest.json");
  const blueprintPath = join(directory, "blueprint.json");
  const evidencePath = join(directory, "physical-evidence.json");
  const blueprint = biofoundryLiveBlueprintV02();
  const unrelated = blueprint.components.find((component) => component.id === "facility_shell")!;
  unrelated.properties = { ...unrelated.properties, fixtureProjectDetail: "preserve-me" };
  await writeFile(manifestPath, `${JSON.stringify(manifest(), null, 2)}\n`);
  await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);
  await writeFile(evidencePath, `${JSON.stringify({
    schema: "subactor.physical-evidence/v1",
    id: "fixture-evidence",
    coordinateSystem: { unit: "m", upAxis: "Z" },
    records: []
  }, null, 2)}\n`);
  return { directory, manifestPath, blueprintPath, evidencePath };
}

test("web model installer writes a grounded record, preserves project details and is idempotent", async () => {
  const paths = await fixture();
  const args = [installer, paths.manifestPath, paths.blueprintPath, paths.evidencePath];
  execFileSync(process.execPath, [...args, "--write"], { cwd: root });
  const blueprint = JSON.parse(await readFile(paths.blueprintPath, "utf8"));
  const evidence = JSON.parse(await readFile(paths.evidencePath, "utf8"));
  assert.equal(blueprint.components.find((component: { id: string }) => component.id === "facility_shell").properties.fixtureProjectDetail, "preserve-me");
  const record = evidence.records.find((candidate: { componentId: string }) => candidate.componentId === "biospec_controller_01");
  assert.equal(record.assetUri, `urn:subactor:resource:sha256:${assetSha}`);
  assert.equal(record.properties.geometryRepresentationClass, "model-specific-reference");
  assert.deepEqual(record.size, [0.0972, 0.0895, 0.0192]);
  const check = JSON.parse(execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" }));
  assert.deepEqual(check.drift, { blueprint: false, physicalEvidence: false });
});

test("web model installer refuses component identities outside the canonical blueprint", async () => {
  const paths = await fixture();
  await writeFile(paths.manifestPath, `${JSON.stringify(manifest("invented_device_01"), null, 2)}\n`);
  const result = spawnSync(process.execPath, [installer, paths.manifestPath, paths.blueprintPath, paths.evidencePath, "--write"], { cwd: root, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WEB_MODEL_INTEGRATION_COMPONENT_MISSING/);
});
