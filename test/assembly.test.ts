import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SceneDocument, TwinDocument } from "../src/core/types.js";
import { parseAssemblyDsl, renderAssemblyDsl } from "../src/dsl/assembly.js";
import { analyzeAssemblies, renderAssemblyReportDsl } from "../src/runtime/assembly.js";
import { createLivingProject, verifyLivingProject } from "../src/project/wizard.js";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";

const assetUri = `urn:subactor:resource:sha256:${"a".repeat(64)}`;
const source = `ASSEMBLIES laboratory-v1
ASSEMBLY reactor
ROOT reactor_01
KIND device
PART lid COMPONENT reactor_lid REQUIRED true
ASSET ${assetUri}
SCENE_PATH "/Factory/Reactor/Lid"
END_PART
END_ASSEMBLY
`;

const twin: TwinDocument = {
  schema: "subactor.twin/v1", id: "laboratory", kind: "physical", observedAt: "2026-08-08T20:00:00Z", sourceSnapshotHash: "b".repeat(64),
  components: [{ id: "reactor_01", type: "device", sourceUris: [], properties: {}, children: [
    { id: "reactor_lid", type: "cad-part", sourceUris: [assetUri], properties: {}, children: [] },
  ] }],
};
const scene: SceneDocument = {
  schema: "subactor.scene/v1", id: "laboratory-scene", format: "openusd", sourceTwinId: twin.id,
  bindings: [{ twinUri: "urn:twin", componentId: "reactor_lid", scenePath: "/Factory/Reactor/Lid", propertyMap: {}, assetUri }],
};

test("AssemblyDSL round-trips and validates a complete grounded assembly", () => {
  const document = parseAssemblyDsl(source);
  assert.deepEqual(parseAssemblyDsl(renderAssemblyDsl(document)), document);
  const report = analyzeAssemblies({ projectId: "laboratory", document, twin, scene, allowedAssetUris: [assetUri] });
  assert.equal(report.ok, true);
  assert.equal(report.complete, true);
  assert.deepEqual(report.coverage, { assemblies: 1, completeAssemblies: 1, requiredParts: 1, completeRequiredParts: 1, availableAssets: 1, placedParts: 1 });
  assert.match(renderAssemblyReportDsl(report), /COMPLETENESS COMPLETE/);
});

test("Assembly validation distinguishes incomplete evidence from semantic corruption", () => {
  const document = parseAssemblyDsl(source);
  const unplaced = analyzeAssemblies({ projectId: "laboratory", document, twin, scene: { ...scene, bindings: [] }, allowedAssetUris: [assetUri] });
  assert.equal(unplaced.ok, true, "missing placement remains diagnosable and does not corrupt active identity");
  assert.equal(unplaced.complete, false);
  assert.ok(unplaced.findings.some((finding) => finding.code === "ASSEMBLY_PART_UNPLACED" && finding.severity === "warning"));

  const ungrounded = analyzeAssemblies({ projectId: "laboratory", document, twin, scene, allowedAssetUris: [] });
  assert.equal(ungrounded.ok, false, "a mesh outside the ingested evidence set fails closed");
  assert.ok(ungrounded.findings.some((finding) => finding.code === "ASSEMBLY_PART_ASSET_UNGROUNDED" && finding.errorUri.startsWith("urn:subactor:error:assembly:")));

  const parentDriftTwin: TwinDocument = { ...twin, components: [twin.components[0]!.children[0]!, { ...twin.components[0]!, children: [] }] };
  const parentDrift = analyzeAssemblies({ projectId: "laboratory", document, twin: parentDriftTwin, scene, allowedAssetUris: [assetUri] });
  assert.equal(parentDrift.ok, false);
  assert.ok(parentDrift.findings.some((finding) => finding.code === "ASSEMBLY_PART_PARENT_DRIFT"));
});

test("living runtime publishes AssemblyDSL diagnostics without claiming missing geometry is complete", async () => {
  const temp = await mkdtemp(join(tmpdir(), "living-assembly-"));
  try {
    const created = await createLivingProject({ name: "Assembly Twin", outDir: join(temp, "project"), profile: "biofoundry" });
    const project = parseProjectDsl(await readFile(created.configPath, "utf8"));
    project.scene.assemblyFile = "assemblies.dsl";
    await writeFile(created.configPath, renderProjectDsl(project));
    const blueprintPath = join(created.projectDir, project.scene.blueprintFile!);
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    const root = blueprint.components[0];
    blueprint.components.push({ id: "diagnostic_part", type: "cad-part", parentId: root.id, spatialClass: "physical", sourceRoles: ["project"], properties: { geometryEvidence: "placeholder" } });
    blueprint.bindings.push({ componentId: "diagnostic_part", scenePath: "/AssemblyTwin/DiagnosticPart", primitive: "cube", position: [0, 0, 0], size: [1, 1, 1] });
    await writeFile(blueprintPath, JSON.stringify(blueprint, null, 2) + "\n");
    await writeFile(join(created.projectDir, "assemblies.dsl"), `ASSEMBLIES integration
ASSEMBLY shell
ROOT ${root.id}
KIND device
PART diagnostic COMPONENT diagnostic_part REQUIRED true
SCENE_PATH "/AssemblyTwin/DiagnosticPart"
END_PART
END_ASSEMBLY
`);
    const verification = await verifyLivingProject(created.configPath);
    assert.equal(verification.checks.find((check) => check.name.startsWith("assemblies:"))?.message, "valid (1 assemblies)");
    const out = join(temp, "out");
    const receipt = await new LivingProjectRuntime().iterate(created.configPath, out, "deterministic");
    assert.equal(receipt.validation.ok, true);
    assert.match(receipt.assemblyReportUri ?? "", /^urn:subactor:assembly-report:sha256:/);
    const report = JSON.parse(await readFile(join(out, "current/assembly-report.json"), "utf8"));
    assert.equal(report.ok, true);
    assert.equal(report.complete, false);
    assert.equal(report.findings[0].code, "ASSEMBLY_PART_ASSET_MISSING");
    assert.match(await readFile(join(out, "current/assembly-report.dsl"), "utf8"), /ASSEMBLY_PART_ASSET_MISSING/);
    let stable = receipt;
    for (let attempt = 0; attempt < 3 && !stable.noChange; attempt += 1) {
      stable = await new LivingProjectRuntime().iterate(created.configPath, out, "deterministic");
    }
    assert.equal(stable.noChange, true, "derived feedback must converge to an idempotent iteration");
    const start = await readFile(join(created.projectDir, "START.md"), "utf8");
    assert.match(start, /LATEST ITERATION \/ ACCEPTED; NO CHANGE/);
    assert.match(start, /## Live application/);
    assert.match(start, /## Logs and feedback/);
    assert.match(start, /Dashboard server log:/);
    assert.match(start, /Assembly completeness: 0\/1; required parts 0\/1/);
    assert.match(start, /## Presentation assets/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
