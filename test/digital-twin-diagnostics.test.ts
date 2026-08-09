import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnoseDigitalTwin } from "../src/runtime/digital-twin-diagnostics.js";

test("digital-twin diagnostics distinguish assembly scopes from placeholder geometry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-diagnostics-scope-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source");
  const markdownRoot = join(root, "markdown");
  const dslRoot = join(root, "dsl");
  const runtimeRoot = join(root, "runtime");
  await Promise.all([
    mkdir(sourceRoot, { recursive: true }),
    mkdir(markdownRoot, { recursive: true }),
    mkdir(dslRoot, { recursive: true }),
    mkdir(join(runtimeRoot, "current"), { recursive: true }),
  ]);
  await writeFile(join(dslRoot, "intent.dsl"), "INTENT scope-test\nEND_INTENT\n");
  await writeFile(join(runtimeRoot, "current/twin.json"), JSON.stringify({ schema: "subactor.twin/v1", components: [
    {id:"assembly",properties:{spatialClass:"physical",geometryEvidence:"placeholder"}},
    {id:"proxy",properties:{spatialClass:"physical",geometryEvidence:"placeholder"}},
  ] }));
  await writeFile(join(runtimeRoot, "current/physical-evidence.report.json"), JSON.stringify({ rejected: [] }));

  const scan = async (bindings: unknown[]) => {
    await writeFile(join(runtimeRoot, "current/scene.json"), JSON.stringify({ schema: "subactor.scene/v1", bindings }));
    return diagnoseDigitalTwin({ sourceRoot, markdownRoot, dslRoot, runtimeRoot });
  };

  const mixed = await scan([
    { componentId: "assembly", primitive: "scope" },
    { componentId: "proxy", primitive: "cube" },
  ]);
  const finding = mixed.diagnostics.find((item) => item.code === "SCENE_PLACEHOLDER_GEOMETRY");
  assert.match(finding?.message ?? "", /^1 physical scene binding/);

  const scopeOnly = await scan([{ componentId: "assembly", primitive: "scope" }]);
  assert.equal(scopeOnly.diagnostics.some((item) => item.code === "SCENE_PLACEHOLDER_GEOMETRY"), false);
});

test("generation notices remain visible without becoming repair warnings", async (t) => {
  const root=await mkdtemp(join(tmpdir(),"dt-diagnostics-notices-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const sourceRoot=join(root,"source"),markdownRoot=join(root,"markdown"),dslRoot=join(root,"dsl"),runtimeRoot=join(root,"runtime");
  await Promise.all([mkdir(sourceRoot,{recursive:true}),mkdir(markdownRoot,{recursive:true}),mkdir(dslRoot,{recursive:true}),mkdir(join(runtimeRoot,"current"),{recursive:true})]);
  await writeFile(join(dslRoot,"intent.dsl"),"INTENT notices\nEND_INTENT\n");
  await writeFile(join(runtimeRoot,"current/twin.json"),JSON.stringify({components:[
    {id:"measured",properties:{spatialClass:"physical",geometryEvidence:"measured"}},
    {id:"concept",properties:{spatialClass:"physical",geometryEvidence:"document-only"}},
    {id:"cyber",properties:{spatialClass:"cyber",geometryEvidence:"placeholder"}},
  ]}));
  await writeFile(join(runtimeRoot,"current/scene.json"),JSON.stringify({bindings:[
    {componentId:"measured",primitive:"cube"},{componentId:"concept",primitive:"cube"},{componentId:"cyber",primitive:"cube"},
  ]}));
  await writeFile(join(runtimeRoot,"current/generation-audit.json"),JSON.stringify({warnings:["ARCHIVE_FINDING_SUMMARY:ARCHIVE_CAD_BACKEND_MISSING:1:archive.zip:subactor://process/repair/archive/convert-solidworks-to-step"],notices:["ARCHIVE_TEXT_SELECTION_LIMIT"]}));
  const report=await diagnoseDigitalTwin({sourceRoot,markdownRoot,dslRoot,runtimeRoot});
  assert.equal(report.diagnostics.find(item=>item.code==="GENERATION_NOTICES")?.severity,"info");
  const generation=report.diagnostics.find(item=>item.code==="GENERATION_WARNINGS");
  assert.deepEqual(generation?.repairProcesses,["subactor://process/repair/archive/convert-solidworks-to-step"]);
  assert.match(report.diagnostics.find(item=>item.code==="SCENE_PLACEHOLDER_GEOMETRY")?.message??"",/^1 physical scene binding/);
  assert.match(report.diagnostics.find(item=>item.code==="SCENE_EVIDENCED_PROXY_GEOMETRY")?.message??"",/^1 physical scene binding/);
});
