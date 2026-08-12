import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateSpecificationDsl } from "../src/runtime/specification-dsl-validation.js";
import { matchesJsonSchema } from "../src/core/json-schema.js";
import { canonicalIntentRecord } from "../src/dsl/intent.js";

const canonical = "Atvirojo kodo biofoundry studija.pdf";
const required = [
  "oscar_robot_01", "biospec_bioreactor_01", "microscope_module_01", "microfluidic_assembly_01",
  "syringebot_01", "cleanroom_base_01", "chemos_planner_01", "sila_orchestrator_01",
  "ros2_robotics_01", "opentwins_state_01",
];
const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

async function fixture(): Promise<{root: string; source: string; markdown: string; dsl: string; blueprint: string; index: string; twin: string; scene: string}> {
  const root = await mkdtemp(join(tmpdir(), "spec-dsl-validation-"));
  const source = join(root, "source");
  const markdown = join(root, "markdown");
  const dsl = join(root, "dsl");
  await Promise.all([mkdir(source), mkdir(markdown), mkdir(dsl)]);
  const pdf = Buffer.from("deterministic pdf fixture");
  await writeFile(join(source, canonical), pdf);
  const pages = Array.from({length: 8}, (_, index) => index + 10);
  const body = pages.map((page) => `<!-- source-page:${page} -->\n\n# Page ${page}\n\nEvidence ${page}.`).join("\n\n") + "\n";
  await writeFile(join(markdown, `${canonical}.lt.md`), body);
  await writeFile(join(markdown, `${canonical}.md`), body);
  const structure = {schema: "bioxfoundry.document-structure/v1", sourceSha256: sha(pdf), canonicalMarkdownSha256: sha(body), pages: pages.map((number) => ({number})), blocks: []};
  await writeFile(join(markdown, `${canonical}.lt.structure.json`), JSON.stringify(structure));
  await writeFile(join(markdown, `${canonical}.structure.json`), JSON.stringify(structure));
  await writeFile(join(markdown, `${canonical}.lt.quality.mdqldsl`), "MARKDOWN_QUALITY biofoundry.markdown-quality/v1\nSTATUS PASS\n");
  await writeFile(join(markdown, `${canonical}.quality.mdqldsl`), "MARKDOWN_QUALITY biofoundry.markdown-quality/v1\nSTATUS PASS\n");
  const records = pages.map((page) => canonicalIntentRecord({
    seed:`page-${page}`,type:"plan",text:`Evidence from page ${page}`,
    targetUris:[`subactor://markdown/${canonical}.md`],
    sourceAnchor:{page,fragment:`#page-${page}`,revisionHash:sha(body),artifactUri:`subactor://markdown/${canonical}.md`,converter:"fixture",converterVersion:"1"},
  }));
  await writeFile(join(dsl, `${canonical}.md.intent.json`), JSON.stringify({
    schema: "t2c.intent-pack/v1", source: canonical, sourceHash: sha(body), records,
  }));
  const ids = [...required, ...Array.from({length: 35}, (_, index) => `detail_${index + 1}`)];
  const blueprint = join(root, "scene-blueprint.json");
  await writeFile(blueprint, JSON.stringify({
    schema: "subactor.scene-blueprint/v1", id: "fixture", twinKind: "physical",
    components: ids.map((id) => ({id, type: "equipment", spatialClass: "physical", sourceRoles: ["project"]})),
    bindings: ids.map((id) => ({componentId: id, scenePath: `/Fixture/${id}`})),
  }));
  const index = join(root, "intent-index.json");
  await writeFile(index, JSON.stringify({highPriority: [{targetUris: [`subactor://markdown/${canonical}.md`]}]}));
  const twin = join(root, "twin.json");
  await writeFile(twin, JSON.stringify({
    schema: "subactor.twin/v1", id: "fixture", kind: "physical", observedAt: "2026-08-11T00:00:00.000Z",
    sourceSnapshotHash: "a".repeat(64),
    components: ids.map((id) => ({id, type: "equipment", sourceUris: [`urn:subactor:resource:sha256:${"b".repeat(64)}`], properties: {matchedIntentCount: 1}, children: []})),
  }));
  const scene = join(root, "scene.json");
  await writeFile(scene, JSON.stringify({
    schema: "subactor.scene/v1", id: "fixture", format: "openusd", sourceTwinId: "fixture",
    bindings: ids.map((id) => ({componentId: id, twinUri: `urn:subactor:twin:sha256:${"c".repeat(64)}#component=${id}`, scenePath: `/Fixture/${id}`})),
  }));
  return {root, source, markdown, dsl, blueprint, index, twin, scene};
}

test("specification DSL validator proves page provenance, intent hashes and Twin coverage", async () => {
  const value = await fixture();
  try {
    const report = await validateSpecificationDsl({
      sourceDir: value.source, markdownDir: value.markdown, dslDir: value.dsl,
      blueprintPath: value.blueprint, intentIndexPath: value.index, twinPath: value.twin, scenePath: value.scene,
    });
    assert.equal(report.schema, "bioxfoundry.specification-dsl-validation/v1");
    assert.equal(report.status, "PASS", JSON.stringify(report.findings, null, 2));
    assert.equal(report.documents[0].status, "PASS");
    assert.equal(report.twin.status, "PASS");
    assert.deepEqual(report.findings, []);
    const definition = JSON.parse(await readFile(join(process.cwd(), "schemas/specification-dsl-validation.schema.json"), "utf8"));
    assert.equal(matchesJsonSchema(definition, report), true, "published schema accepts the emitted report");
    assert.deepEqual(await validateSpecificationDsl({
      sourceDir: value.source, markdownDir: value.markdown, dslDir: value.dsl,
      blueprintPath: value.blueprint, intentIndexPath: value.index, twinPath: value.twin, scenePath: value.scene,
    }), report, "the validator is deterministic for identical inputs");
  } finally { await rm(value.root, {recursive: true, force: true}); }
});

test("document failure does not falsely change an independently passing Twin result", async () => {
  const value = await fixture();
  try {
    await writeFile(join(value.markdown, `${canonical}.md`), "<!-- source-page:10 -->\n\n! Broken] (missing.svg)\n");
    const report = await validateSpecificationDsl({
      sourceDir: value.source, markdownDir: value.markdown, dslDir: value.dsl,
      blueprintPath: value.blueprint, intentIndexPath: value.index, twinPath: value.twin, scenePath: value.scene,
    });
    assert.equal(report.status, "FAIL");
    assert.equal(report.documents[0].status, "FAIL");
    assert.equal(report.twin.status, "PASS");
    assert.ok(report.findings.some((item) => item.code === "SPEC_MARKDOWN_CONTENT_HASH_MISMATCH"));
    assert.ok(report.findings.some((item) => item.code === "SPEC_MARKDOWN_DIAGRAM_SYNTAX_INVALID"));
    assert.ok(report.findings.some((item) => item.code === "SPEC_INTENT_SOURCE_HASH_MISMATCH"));
  } finally { await rm(value.root, {recursive: true, force: true}); }
});

test("missing source data fails closed and an omitted Twin is explicitly NOT_RUN", async () => {
  const value = await fixture();
  try {
    await rm(join(value.source, canonical));
    const missing = await validateSpecificationDsl({sourceDir: value.source, markdownDir: value.markdown, dslDir: value.dsl});
    assert.equal(missing.status, "FAIL");
    assert.ok(missing.findings.some((item) => item.code === "SPEC_SOURCE_DOCUMENT_MISSING"));

    await writeFile(join(value.source, canonical), Buffer.from("deterministic pdf fixture"));
    const notRun = await validateSpecificationDsl({sourceDir: value.source, markdownDir: value.markdown, dslDir: value.dsl});
    assert.equal(notRun.status, "NOT_RUN", JSON.stringify(notRun.findings, null, 2));
    assert.equal(notRun.twin.status, "NOT_RUN");
  } finally { await rm(value.root, {recursive: true, force: true}); }
});

test("stale record provenance and unbound components are rejected", async () => {
  const value = await fixture();
  try {
    const packPath = join(value.dsl, `${canonical}.md.intent.json`);
    const pack = JSON.parse(await readFile(packPath, "utf8"));
    pack.records[0].source.revisionHash = "0".repeat(64);
    await writeFile(packPath, JSON.stringify(pack));
    const blueprint = JSON.parse(await readFile(value.blueprint, "utf8"));
    blueprint.bindings.pop();
    await writeFile(value.blueprint, JSON.stringify(blueprint));
    const report = await validateSpecificationDsl({
      sourceDir: value.source, markdownDir: value.markdown, dslDir: value.dsl,
      blueprintPath: value.blueprint, intentIndexPath: value.index, twinPath: value.twin, scenePath: value.scene,
    });
    assert.equal(report.status, "FAIL");
    assert.ok(report.findings.some((item) => item.code === "SPEC_INTENT_PROVENANCE_INVALID"));
    assert.ok(report.findings.some((item) => item.code === "SPEC_TWIN_BINDING_MISSING"));
  } finally { await rm(value.root, {recursive: true, force: true}); }
});
