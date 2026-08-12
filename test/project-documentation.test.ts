import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkJsonSchema } from "../src/core/json-schema.js";
import { sha256 } from "../src/core/canonical.js";
import { createLivingProject } from "../src/project/wizard.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";
import { generateProjectDocumentation } from "../src/runtime/project-documentation.js";

test("project documentation binds one accepted Twin revision across Markdown, HTML and PDF", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-project-docs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const created = await createLivingProject({
    name: "Documented Factory",
    outDir: join(root, "project"),
    profile: "biofoundry",
    managerIntent: "Explain the accepted factory, processes, evidence and open gaps.",
  });
  const runtimeDir = join(root, "runtime");
  const receipt = await new LivingProjectRuntime().iterate(created.configPath, runtimeDir, "deterministic");
  assert.equal(receipt.validation.ok, true);
  assert.equal((await readFile(join(runtimeDir, "current", "documentation", "project-documentation.pdf"))).subarray(0, 8).toString("ascii"), "%PDF-1.4");

  const outputDir = join(root, "exports");
  const first = await generateProjectDocumentation({ configPath: created.configPath, runtimeDir, outputDir });
  const second = await generateProjectDocumentation({ configPath: created.configPath, runtimeDir });
  assert.deepEqual(second.document, first.document);
  assert.deepEqual(second.manifest, first.manifest);
  assert.equal(second.files.markdown, first.files.markdown);
  assert.equal(second.files.html, first.files.html);
  assert.deepEqual(second.files.pdf, first.files.pdf);

  assert.equal(first.document.activeRevision.iterationUri, receipt.iterationUri);
  assert.equal(first.document.activeRevision.twinUri, receipt.twinUri);
  assert.equal(first.document.activeRevision.sceneUri, receipt.sceneUri);
  assert.equal(first.document.activeRevision.analysisTraceUri, receipt.analysisTraceUri);
  assert.ok(first.document.summary.components > 0);
  assert.equal(first.document.summary.processes, first.document.processes.length);
  assert.equal(first.document.animations.every(animation => animation.factualProcessDuration === false), true);
  assert.equal(first.document.mqtt.configured, false);
  assert.equal(first.document.mqtt.revisionBound, false);
  assert.ok(first.document.decisions.length > 0);
  assert.ok(first.document.citations.length > 0);
  assert.equal(first.files.pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.match(first.files.markdown, /^---[\s\S]*# Digital Twin project/m);
  assert.match(first.files.markdown, /## Processes and animations/);
  assert.match(first.files.html, /^<!doctype html>/);
  assert.doesNotMatch(first.files.html, /<script/i);
  assert.doesNotMatch(first.files.json, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  for (const [name, artifact] of Object.entries(first.manifest.artifacts)) {
    const bytes = await readFile(join(outputDir, name));
    assert.equal(sha256(bytes), artifact.sha256, `${name} hash drifted`);
    assert.equal(bytes.byteLength, artifact.bytes, `${name} byte count drifted`);
  }
  const documentSchema = JSON.parse(await readFile("schemas/project-documentation.schema.json", "utf8")) as unknown;
  const manifestSchema = JSON.parse(await readFile("schemas/project-documentation-manifest.schema.json", "utf8")) as unknown;
  assert.deepEqual(checkJsonSchema(documentSchema, first.document), []);
  assert.deepEqual(checkJsonSchema(manifestSchema, first.manifest), []);
});

test("project documentation fails closed when accepted artifact revisions are mixed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-project-docs-mismatch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const created = await createLivingProject({ name: "Mismatch Factory", outDir: join(root, "project"), profile: "biofoundry" });
  const runtimeDir = join(root, "runtime");
  await new LivingProjectRuntime().iterate(created.configPath, runtimeDir, "deterministic");
  const tracePath = join(runtimeDir, "current", "analysis-trace.json");
  const trace = JSON.parse(await readFile(tracePath, "utf8")) as { outputs: { sceneUri: string } };
  trace.outputs.sceneUri = `urn:subactor:scene:sha256:${"0".repeat(64)}`;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`);
  await assert.rejects(
    generateProjectDocumentation({ configPath: created.configPath, runtimeDir }),
    (error: unknown) => error instanceof Error && error.message === "PROJECT_DOCUMENTATION_REVISION_MISMATCH",
  );
});
