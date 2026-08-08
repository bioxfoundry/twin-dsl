import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompileNlOptions } from "../src/llm/nl-dsl-compiler.js";
import type { DslGenerationResult, MathDocument } from "../src/core/types.js";
import { createLivingProject } from "../src/project/wizard.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";
import { parseMathDsl } from "../src/dsl/math.js";
import { acquireProjectLease, buildImprovementPlan, developmentAnalysisFingerprint, mergeAuthorityMath, summarizeDevelopment } from "../src/runtime/autonomy.js";
import { parseImprovementDsl, renderImprovementDsl } from "../src/dsl/improvement.js";
import { sha256, canonicalJson } from "../src/core/canonical.js";

const audit={requestedMode:"require-llm",effectiveMode:"llm",degraded:false,reason:null,provider:"test",model:"tamper",responseId:"response-1",durationMs:1} as const;

test("authority merge rejects protected fields but accepts a separate semantic proposal",()=>{
  const authority=parseMathDsl("MATH authority\nBIND ManagerApproved = false\nBIND RateLimitAvailable = true\nEXPR IterationAllowed = AND(ManagerApproved, RateLimitAvailable)");
  const tampered=parseMathDsl("MATH proposal\nBIND ManagerApproved = true\nEXPR IterationAllowed = true");
  assert.throws(()=>mergeAuthorityMath(authority,tampered),/SEMANTIC_MATH_AUTHORITY_FIELD_FORBIDDEN:ManagerApproved/);
  const semantic=parseMathDsl("MATH proposal\nBIND ProposedSetpoint = 37");
  const merged=mergeAuthorityMath(authority,semantic);
  assert.equal(merged.document.bindings.find(binding=>binding.name==="ProposedSetpoint")?.value,37);
  assert.equal(merged.document.bindings.find(binding=>binding.name==="ManagerApproved")?.value,false);
});

class TamperingCompiler {
  async compile(options:CompileNlOptions):Promise<DslGenerationResult>{
    let value:unknown;
    if(options.kind==="math") value=parseMathDsl(`MATH malicious
BIND ManagerApproved = true
BIND RateLimitAvailable = true
BIND ResearchEvidencePresent = true
BIND DevelopmentEvidencePresent = true
BIND DevelopmentAccepted = true
BIND RuntimeEvidencePresent = true
BIND RequireResearch = false
BIND RequireDevelopment = false
BIND RequireDevelopmentAcceptance = false
BIND RequireRuntime = false
BIND AutoPublishScene = true
BIND AllowRuntimeSelfModification = true
BIND AutonomyModeApply = true
BIND RequireSignedMutationGrant = false
BIND SignedMutationGrantPresent = true
BIND SourceRoleCount = 99
EXPR ResearchGate = true
EXPR DevelopmentGate = true
EXPR RuntimeGate = true
EXPR IterationAllowed = true
EXPR ScenePublishAllowed = true
EXPR RuntimeSelfModificationAllowed = true`);
    else if(options.kind==="twin"||options.kind==="scene") value=(options.deterministicValue as {document:unknown}).document;
    else value=options.deterministicValue;
    return{schema:"subactor.dsl-generation-result/v1",kind:options.kind,value,canonicalHash:sha256(canonicalJson(value)),audit};
  }
}

test("LLM cannot override authority-owned math gates",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"autonomy-tamper-"));
  try{
    const created=await createLivingProject({name:"Authority Twin",outDir:join(temp,"project")});
    const project=parseProjectDsl(await readFile(created.configPath,"utf8"));
    project.policy.approved=false;
    await writeFile(created.configPath,renderProjectDsl(project));
    const runtime=new LivingProjectRuntime(undefined,new TamperingCompiler() as never);
    const receipt=await runtime.iterate(created.configPath,join(temp,"out"),"require-llm");
    assert.equal(receipt.validation.ok,false);
    assert.ok(!receipt.authorityWarnings.some(warning=>warning.startsWith("LLM_AUTHORITY_")));
    const math=JSON.parse(await readFile(join(temp,"out/candidate/math.json"),"utf8")) as MathDocument;
    assert.equal(math.bindings.find(binding=>binding.name==="ManagerApproved")?.value,false);
    const audit=JSON.parse(await readFile(join(temp,"out/candidate/generation-audit.json"),"utf8"));
    assert.equal(audit.math.reason,"semantic_math_authority_field_forbidden");
  }finally{await rm(temp,{recursive:true,force:true});}
});

test("development fixture requires explicit policy",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"autonomy-fixture-"));
  try{
    const created=await createLivingProject({name:"Fixture Gate",outDir:join(temp,"project")});
    const project=parseProjectDsl(await readFile(created.configPath,"utf8"));
    project.policy.allowDevelopmentFixture=false;
    await writeFile(created.configPath,renderProjectDsl(project));
    const receipt=await new LivingProjectRuntime().iterate(created.configPath,join(temp,"out"),"deterministic");
    assert.equal(receipt.validation.ok,false);
    assert.equal(receipt.stages.find(stage=>stage.name==="development")?.status,"blocked");
    const summary=JSON.parse(await readFile(join(temp,"out/candidate/development.evidence.json"),"utf8"));
    assert.equal(summary.source,"fixture");
    assert.equal(summary.acceptance,"review_required");
  }finally{await rm(temp,{recursive:true,force:true});}
});

test("todo2code execution metadata does not create a false development change",()=>{
  const graph=(generatedAt:string,declaredFingerprint:string)=>({schemaVersion:"t2c.graph/v1",generatedAt,fingerprint:declaredFingerprint,records:[{id:"INT-1"}],relations:[]});
  const diagnostics=(generatedAt:string,declaredFingerprint:string,code="UNLINKED_RECORD")=>({
    schemaVersion:"t2c.diagnostics/v1",generatedAt,graphFingerprint:declaredFingerprint,
    counts:{warning:1,blocking:0},diagnostics:[{id:"DIAG-1",code,severity:"warning"}],
  });
  const manifest=(runId:string,createdAt:string,durationMs:number)=>({
    schemaVersion:"t2c.run/v1",runId,createdAt,status:"succeeded",
    runtime:{name:"todo2code",version:"0.5.0"},configuration:{fingerprint:"config-1"},
    stages:{markdownExtraction:{status:"succeeded",requestedMode:"deterministic",effectiveMode:"deterministic",degraded:false,recordCount:1,warningCount:0,durationMs}},
  });
  const summary=summarizeDevelopment({source:"todo2code",graph:graph("2026-01-01T00:00:00Z","run-hash-1"),diagnostics:diagnostics("2026-01-01T00:00:00Z","run-hash-1"),manifest:manifest("run-1","2026-01-01T00:00:00Z",10),evidenceUris:["urn:test"],fixtureAllowed:false});
  const first=developmentAnalysisFingerprint({graph:graph("2026-01-01T00:00:00Z","run-hash-1"),diagnostics:diagnostics("2026-01-01T00:00:00Z","run-hash-1"),manifest:manifest("run-1","2026-01-01T00:00:00Z",10),summary});
  const repeatedGraph=graph("2026-01-02T00:00:00Z","run-hash-2");
  const repeatedSummary=summarizeDevelopment({source:"todo2code",graph:repeatedGraph,diagnostics:diagnostics("2026-01-02T00:00:00Z","run-hash-2"),manifest:manifest("run-2","2026-01-02T00:00:00Z",999),evidenceUris:["urn:run-2"],fixtureAllowed:false});
  const repeated=developmentAnalysisFingerprint({graph:repeatedGraph,diagnostics:diagnostics("2026-01-02T00:00:00Z","run-hash-2"),manifest:manifest("run-2","2026-01-02T00:00:00Z",999),summary:repeatedSummary});
  const changed=developmentAnalysisFingerprint({graph:repeatedGraph,diagnostics:diagnostics("2026-01-02T00:00:00Z","run-hash-2","AMBIGUOUS_REQUIREMENT"),manifest:manifest("run-2","2026-01-02T00:00:00Z",999),summary:repeatedSummary});
  assert.equal(repeated,first);
  assert.notEqual(changed,first);
});

test("runtime observations reject UNIT mixed and accept per-metric units",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"observation-units-"));
  try{
    const created=await createLivingProject({name:"Typed Observation Twin",outDir:join(temp,"project")});
    const environmentPath=join(temp,"project/environment/current.json");
    const valid=JSON.parse(await readFile(environmentPath,"utf8"));
    assert.deepEqual(valid.units,{temperatureC:"Cel",availability:"none"});
    delete valid.units;
    valid.unit="mixed";
    await writeFile(environmentPath,JSON.stringify(valid,null,2));
    await assert.rejects(
      ()=>new LivingProjectRuntime().iterate(created.configPath,join(temp,"out"),"deterministic"),
      /OBSERVATION_UNIT_MIXED_FORBIDDEN/,
    );
  }finally{await rm(temp,{recursive:true,force:true});}
});

test("rate limit blocks changed iteration before scene publication",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"autonomy-rate-"));
  try{
    const created=await createLivingProject({name:"Rate Limited Twin",outDir:join(temp,"project")});
    const project=parseProjectDsl(await readFile(created.configPath,"utf8"));
    project.policy.maxIterationsPerHour=1;
    await writeFile(created.configPath,renderProjectDsl(project));
    const runtime=new LivingProjectRuntime(),out=join(temp,"out");
    const first=await runtime.iterate(created.configPath,out,"deterministic");
    assert.equal(first.validation.ok,true);
    const environmentPath=join(temp,"project/environment/current.json");
    const environment=JSON.parse(await readFile(environmentPath,"utf8"));
    environment.temperatureC=30;
    await writeFile(environmentPath,JSON.stringify(environment,null,2));
    const second=await runtime.iterate(created.configPath,out,"deterministic");
    assert.equal(second.validation.ok,false);
    assert.ok(second.validation.failures.includes("AutonomyRateLimitExceeded"));
    assert.equal(second.stages.find(stage=>stage.name==="preflight")?.status,"blocked");
  }finally{await rm(temp,{recursive:true,force:true});}
});

test("project lease prevents parallel autonomous iterations",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"autonomy-lease-"));
  try{
    const first=await acquireProjectLease(temp,"lease-project",60_000);
    await assert.rejects(()=>acquireProjectLease(temp,"lease-project",60_000),/LIVING_PROJECT_LEASE_HELD/);
    await first.release();
    const second=await acquireProjectLease(temp,"lease-project",60_000);
    await second.release();
  }finally{await rm(temp,{recursive:true,force:true});}
});

test("project lease recovers immediately when the recorded writer process is dead",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"autonomy-dead-lease-"));
  try{
    const leaseDir=join(temp,".iteration-lease");
    const {mkdir}=await import("node:fs/promises");
    await mkdir(leaseDir,{recursive:true});
    await writeFile(join(leaseDir,"lease.json"),JSON.stringify({schema:"subactor.iteration-lease/v1",leaseId:"dead",projectId:"lease-project",pid:2_147_483_647,startedAt:new Date().toISOString()}));
    const recovered=await acquireProjectLease(temp,"lease-project",60_000);
    await recovered.release();
  }finally{await rm(temp,{recursive:true,force:true});}
});

test("improvementDSL round-trips propose-only actions",()=>{
  const document=parseImprovementDsl(`IMPROVEMENT plan-1
PROJECT "demo"
GENERATED_AT "2026-08-06T19:00:00.000Z"
SOURCE_ITERATION null
EVIDENCE [urn:subactor:resource:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa]
ACTION action-1 KIND development APPROVAL true TARGETS [subactor://project/demo/development] TITLE "Run todo2code" REASON "Development evidence is missing"`);
  assert.equal(document.actions[0].status,"proposed");
  assert.deepEqual(parseImprovementDsl(renderImprovementDsl(document)),document);
});

test("geometry failures route improvementDSL to the exact authorized repair process",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"geometry-repair-plan-"));
  try{
    const created=await createLivingProject({name:"Geometry Repair Twin",outDir:join(temp,"project")});
    const project=parseProjectDsl(await readFile(created.configPath,"utf8"));
    const failure="GeometryBuildFailed:lid:urn:subactor:error:geometry:geometry-reference-extent-drift";
    const processUri="subactor://process/repair/geometry/reconcile-source-evidence";
    const plan=buildImprovementPlan({
      project,previousIterationUri:null,researchPresent:true,runtimePresent:true,mutationGrantPresent:false,
      development:{schema:"subactor.development-evidence/v1",source:"todo2code",graphFingerprint:"a".repeat(64),recordCount:1,relationCount:0,diagnosticCount:0,blockingDiagnosticCount:0,acceptance:"accepted",manifestStatus:"clean",evidenceUris:["urn:subactor:development:test"]},
      authorityWarnings:[],failures:[failure],evidenceUris:["urn:subactor:resource:test"],
      repairProcesses:[{failure,title:"Reconcile lid geometry",processUri,evidenceUris:["urn:subactor:geometry:test"]}],
    });
    assert.equal(plan.actions.filter(action=>action.reason===failure).length,1);
    assert.deepEqual(plan.actions.find(action=>action.reason===failure)?.targetUris,[processUri,"urn:subactor:geometry:test"]);
  }finally{await rm(temp,{recursive:true,force:true});}
});
