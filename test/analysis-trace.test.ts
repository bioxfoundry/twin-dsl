import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AnalysisTraceBuildInput, IntentRecord, LivingProjectDocument, ProcessDocument } from "../src/core/types.js";
import { checkJsonSchema } from "../src/core/json-schema.js";
import { buildAnalysisTrace, parseAnalysisTraceDsl, renderAnalysisTraceDsl, renderAnalysisTraceMarkdown } from "../src/runtime/analysis-trace.js";
import { canonicalIntentRecord } from "../src/dsl/intent.js";

const hash = (character: string): string => character.repeat(64);
const project:LivingProjectDocument = {
  schema: "subactor.living-project/v1", id: "trace-project", name: "Trace Project", profile: "biofoundry", managerIntent: "Explain every generated decision.",
  sources: [], development: { root: "." }, observations: { paths: [], logicalRoot: "runtime" },
  policy: { approved: true, requireResearch: true, requireDevelopmentEvidence: true, requireDevelopmentAcceptance: true, allowDevelopmentFixture: true, requireRuntimeEvidence: true, autoPublishScene: true, allowRuntimeSelfModification: false, autonomyMode: "observe", requireSignedMutationGrant: false, maxIterationsPerHour: 10, maxConsecutiveFailures: 3 },
  scene: { format: "openusd" },
};
const intent = (id:string,text:string,artifact:string,revision:string,page?:number,lines?:[number,number]):IntentRecord =>
  canonicalIntentRecord({seed:id,type:"report",text,targetUris:[artifact],sourceAnchor:{
    artifactUri:artifact,revisionHash:revision,...(page?{page}:{}),...(lines?{lines}:{}),
    fragment:`${artifact}#section`,converter:"test",converterVersion:"1",
  }});

function fixture(previousTrace?:AnalysisTraceBuildInput["previousTrace"]):AnalysisTraceBuildInput {
  const canonical=intent("canonical-rpi","BOM: Raspberry Pi 4 / 5 plus HAT and relays.","subactor://markdown/A. SPECIFIKACIJA/Atvirojo kodo biofoundry studija.pdf.md",hash("a"),14);
  const implementation=intent("implementation-rpi","All electronics are controlled by a RPi 3 with Python GUI.","subactor://markdown/I. Bioreactor/1-s2.0-main.pdf.md",hash("b"),undefined,[180,210]);
  const processes:ProcessDocument={schema:"subactor.process/v1",id:"p",projectId:project.id,sourceSnapshotHash:hash("c"),processes:[],coverage:{processes:0,complete:0,partial:0,declaredOnly:0,steps:0,evidencedSteps:0,missingEvidence:0,missingComponents:0},findings:[]};
  return {
    project,projectConfigHash:hash("d"),generatedAt:"2026-08-12T10:00:00.000Z",
    generator:{name:"@subactor/digital-twin-runtime-starter",packageVersion:"0.5.34",runtimeGeneration:"trace-v1",sourceRevision:hash("e"),mode:"deterministic"},
    researchSnapshotHash:hash("f"),developmentFingerprint:hash("1"),observationSnapshotHash:hash("2"),
    intentDsl:{semanticHash:hash("3"),packs:2,records:2,invalid:0},resources:[],
    twin:{schema:"subactor.twin/v1",id:"t",kind:"conceptual",observedAt:"2026-08-12T10:00:00.000Z",sourceSnapshotHash:hash("f"),components:[{id:"biospec_controller_01",type:"controller",sourceUris:[],properties:{label:"BIO-SPEC Raspberry Pi controller",geometryEvidence:"document-only",cadAssetCount:19},children:[]}]},
    scene:{schema:"subactor.scene/v1",id:"s",format:"openusd",sourceTwinId:"t",bindings:[{twinUri:"urn:twin#controller",componentId:"biospec_controller_01",scenePath:"/Controller",primitive:"cube",propertyMap:{}}]},
    geometry:{schema:"subactor.geometry-validation/v1",evidenceId:"none",method:"world-aabb",ok:true,complete:false,coverage:{bindings:1,positionEvidence:0,sizeEvidence:0,orientationEvidence:0,constraints:0,requiredChecks:3,passedRequiredChecks:0},checks:[],failures:[]},
    processes,generationAudit:{math:{requestedMode:"deterministic",effectiveMode:"deterministic",degraded:false,reason:null,provider:null,model:null,responseId:null,durationMs:0},twin:{requestedMode:"deterministic",effectiveMode:"deterministic",degraded:false,reason:null,provider:null,model:null,responseId:null,durationMs:0},scene:{requestedMode:"deterministic",effectiveMode:"deterministic",degraded:false,reason:null,provider:null,model:null,responseId:null,durationMs:0},authorityWarnings:[]},
    groundedIntents:[{record:canonical,sourceUri:"urn:resource:canonical"},{record:implementation,sourceUri:"urn:resource:implementation"}],previousTrace,artifactHashes:{"math.dsl":hash("4")},
  };
}

test("analysis trace records source-grounded decisions, alternatives and DSL round-trip",async()=>{
  const trace=buildAnalysisTrace(fixture());
  assert.equal(trace.schema,"subactor.analysis-trace/v1");
  const identity=trace.decisions.find(decision=>decision.id==="biospec-controller-identity");
  assert.equal(identity?.confidence,"medium");
  assert.deepEqual(identity?.citationIds.sort(),fixture().groundedIntents.map(({record})=>`intent-${record.id}`).sort());
  assert.ok(trace.decisions.some(decision=>decision.id==="component-projection:biospec_controller_01"));
  const geometry=trace.decisions.find(decision=>decision.id==="biospec-controller-geometry");
  assert.match(geometry?.outcome??"",/cube fallback/);
  assert.ok(geometry?.alternatives.some(item=>item.status==="rejected"&&item.value.includes("bioreactor CAD")));
  assert.ok(geometry?.citationIds.includes("external-rpi-hardware-docs"));
  assert.equal(trace.outputs.primitiveFallbacks,1);
  const dsl=renderAnalysisTraceDsl(trace);
  assert.deepEqual(parseAnalysisTraceDsl(dsl),trace);
  const markdown=renderAnalysisTraceMarkdown(trace,{"math.dsl":"MATH trace\nEXPR Allowed = true\n"});
  assert.match(markdown,/does not contain hidden model chain-of-thought/i);
  assert.match(markdown,/Raspberry Pi 4 \/ 5/);
  assert.match(markdown,/```text\nMATH trace/);
  assert.match(markdown,/revision `[a-f0-9]{64}`/);
  const schema=JSON.parse(await readFile("schemas/analysis-trace.schema.json","utf8")) as unknown;
  assert.deepEqual(checkJsonSchema(schema,trace),[]);
});

test("analysis trace reports structural changes against the previous trace",()=>{
  const first=buildAnalysisTrace(fixture());
  const changedInput=fixture(first);
  changedInput.scene.bindings[0].assetUri="urn:subactor:resource:sha256:"+hash("9");
  changedInput.twin.components[0].properties.geometryRepresentationClass="model-specific-reference";
  changedInput.generator={...changedInput.generator,runtimeGeneration:"trace-v2"};
  const second=buildAnalysisTrace(changedInput);
  assert.equal(second.comparison.changed,true);
  assert.ok(second.comparison.changes.includes("DECISION_CHANGED:biospec-controller-geometry"));
  assert.ok(second.comparison.changes.includes("OUTPUT_CHANGED:meshBindings:0→1"));
  assert.ok(second.comparison.changes.includes("OUTPUT_CHANGED:primitiveFallbacks:1→0"));
  assert.equal(second.decisions.find(decision=>decision.id==="component-projection:biospec_controller_01")?.confidence,"medium");
  assert.ok(second.decisions.find(decision=>decision.id==="biospec-controller-geometry")?.alternatives.some(item=>item.status==="selected-reference"));
  assert.ok(second.comparison.changes.includes("GENERATOR_CHANGED:trace-v1→trace-v2"));
});
