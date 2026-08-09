import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DevelopmentEvidenceSummary,
  DslGenerationResult,
  AssemblyDocument,
  AssemblyReport,
  DomainEvent,
  GenerationAudit,
  GeometryValidationReport,
  GeometryBuildReceipt,
  ImprovementPlan,
  LivingFailureReceipt,
  LivingIterationReceipt,
  LiveBindingDocument,
  LivingProjectDocument,
  LlmMode,
  MathDocument,
  ObservationDocument,
  PhysicalEvidenceReport,
  ProjectIntegrityReport,
  ObservationRecord,
  ResourceDiff,
  ResourceRecord,
  SceneBlueprint,
  SceneDocument,
  SourceRole,
  TreeDocument,
  TreeNode,
  TwinDocument,
  TwinStateDocument,
} from "../core/types.js";
import { canonicalJson, contentUri, sha256 } from "../core/canonical.js";
import { scanSources } from "../ingestion/scanner.js";
import { parseProjectDsl, validateProject } from "../dsl/project.js";
import { renderObservationDsl, validateObservation } from "../dsl/observation.js";
import { evaluateMath, renderMathDsl } from "../dsl/math.js";
import { renderImprovementDsl } from "../dsl/improvement.js";
import { DqlCrawler, type FetchLike } from "../research/crawler.js";
import { parseDql } from "../dsl/dql.js";
import { Todo2CodeAdapter, type Todo2CodeAnalysis } from "../adapters/todo2code.js";
import { NlDslCompiler } from "../llm/nl-dsl-compiler.js";
import { deterministicAudit } from "../llm/openrouter.js";
import { renderOpenUsd, sceneDiff } from "../scene/openusd.js";
import { renderGeometryValidationDsl } from "../scene/geometry-validation.js";
import { validateScene } from "../dsl/scene.js";
import { validateTwin } from "../dsl/twin.js";
import { validateT2cIntent } from "../dsl/intent.js";
import {
  acquireProjectLease,
  appendJsonLine,
  buildImprovementPlan,
  developmentAnalysisFingerprint,
  mergeAuthorityMath,
  semanticMathProjection,
  mutationGrantPresent,
  recentIterationCount,
  summarizeDevelopment,
  validateSceneGrounding,
  validateTwinGrounding,
} from "./autonomy.js";
import {
  biofoundryConceptScene,
  biofoundryConceptTree,
  biofoundryConceptTwin,
  biofoundryReadinessBindings,
} from "./biofoundry-concept.js";
import { RUNTIME_GENERATION } from "../core/generation.js";
import { materializeBlueprintScene, materializeBlueprintTwin, validateSceneBlueprint } from "../scene/blueprint.js";
import { applyPhysicalEvidence, validatePhysicalEvidence } from "../scene/physical-evidence.js";
import { geometryRequirementsFromTwin, validateGeometry } from "../scene/geometry-validation.js";
import { analyzeProjectIntegrity, renderProjectIntegrityDsl } from "./project-integrity.js";
import { GeometryService, type GeometryMaterialization } from "../geometry/geometry-service.js";
import { assemblyAggregateEvidence, mergeGeometryEvidence } from "../geometry/physical-evidence-adapter.js";
import { renderGeometryReceiptDsl } from "../geometry/geometry-dsl.js";
import { parseLiveBindingDsl } from "../dsl/live-binding.js";
import { projectTwinState, renderTwinStateDsl } from "./twin-state.js";
import { parseAssemblyDsl } from "../dsl/assembly.js";
import { analyzeAssemblies, renderAssemblyReportDsl } from "./assembly.js";

function startDocumentPath(projectRoot:string,path:string):string {
  const candidate = relative(projectRoot,resolve(path));
  return candidate === "" ? "." : candidate.startsWith("..") ? resolve(path) : candidate;
}

async function startDocumentCli(projectRoot:string):Promise<string> {
  const vendored = join(projectRoot,"vendor/runtime/dist/src/cli/main.js");
  try {
    await access(vendored);
    return startDocumentPath(projectRoot,vendored);
  } catch {
    return resolve(process.argv[1] ?? "dist/src/cli/main.js");
  }
}
import { renderArchiveAnalysisDsl } from "../../js/archive-project-analyzer/src/index.js";

async function readJson<T>(path:string):Promise<T> { return JSON.parse(await readFile(path,"utf8")) as T; }
async function readOptional<T>(path:string):Promise<T|undefined> { try { return await readJson<T>(path); } catch { return undefined; } }
async function writeJson(path:string,value:unknown):Promise<void> { await mkdir(dirname(path),{recursive:true}); await writeFile(path,JSON.stringify(value,null,2)+"\n"); }
function sourceSnapshot(resources:ResourceRecord[]):string {
  return sha256(canonicalJson(resources.map(resource=>({uri:resource.uri,path:resource.sourcePath,role:resource.sourceRole,sha256:resource.sha256})).sort((a,b)=>a.path.localeCompare(b.path))));
}
type EvidenceSetRecord={schema:"subactor.evidence-set/v1";id:string;uri:string;queryUri:string;members:number;membersHash:string;memberUris:string[]};
function evidenceSet(id:string,memberUris:string[]):EvidenceSetRecord {
  const members=[...new Set(memberUris)].sort();
  const membersHash=sha256(canonicalJson(members));
  const queryHash=sha256(canonicalJson({id,membersHash,members:members.length}));
  return {schema:"subactor.evidence-set/v1",id,uri:`urn:subactor:evidence-set:sha256:${membersHash}`,queryUri:`urn:subactor:query-result:sha256:${queryHash}`,members:members.length,membersHash:`sha256:${membersHash}`,memberUris:members};
}
function renderEvidenceSets(sets:EvidenceSetRecord[]):string {
  return sets.map(set=>["```evidencesetdsl",`EVIDENCE_SET ${set.id}`,`URI ${set.uri}`,`QUERY ${set.queryUri}`,`MEMBERS ${set.members}`,`HASH ${set.membersHash}`,"END_EVIDENCE_SET","```"].join("\n")).join("\n\n")+"\n";
}
type IntentDslIndex = { packs:number; records:number; invalid:number; sourceUris:string[] };
async function indexIntentDsl(resources:ResourceRecord[], texts:Map<string,string>):Promise<IntentDslIndex> {
  const result:IntentDslIndex = {packs:0, records:0, invalid:0, sourceUris:[]};
  for(const resource of resources) {
    if(!resource.logicalUri.endsWith(".intent.json")) continue;
    // Compound names such as `report.docx.md.intent.json` are misdetected by generic ingestion;
    // read the original JSON pack directly and validate its records, never the converter stub.
    let raw = texts.get(resource.uri);
    try { raw = await readFile(resource.sourcePath, "utf8"); } catch { /* use scanned text */ }
    if(!raw) { result.invalid++; continue; }
    try {
      const pack = JSON.parse(raw) as {records?:unknown};
      const records = validateT2cIntent(pack.records);
      result.packs++; result.records += records.length; result.sourceUris.push(resource.uri);
    } catch { result.invalid++; }
  }
  return result;
}
function resourceDiff(previous:ResourceRecord[],current:ResourceRecord[]):ResourceDiff {
  const oldMap = new Map(previous.map(resource=>[resource.sourcePath,resource.sha256]));
  const newMap = new Map(current.map(resource=>[resource.sourcePath,resource.sha256]));
  return {
    added:[...newMap].filter(([path])=>!oldMap.has(path)).map(([path])=>path),
    changed:[...newMap].filter(([path,hash])=>oldMap.has(path)&&oldMap.get(path)!==hash).map(([path])=>path),
    removed:[...oldMap].filter(([path])=>!newMap.has(path)).map(([path])=>path),
    unchanged:[...newMap].filter(([path,hash])=>oldMap.get(path)===hash).map(([path])=>path),
  };
}
function groupTree(project:LivingProjectDocument,resources:ResourceRecord[]):TreeDocument {
  if(project.profile === "biofoundry") return biofoundryConceptTree(project,resources);
  const byRole = new Map<SourceRole,TreeNode>();
  for(const resource of resources) {
    const role = resource.sourceRole??"project";
    if(!byRole.has(role)) byRole.set(role,{id:`role-${role}`,uri:`subactor://project/${project.id}/role/${role}`,label:role,kind:"source-role",children:[]});
    byRole.get(role)!.children.push({
      id:resource.id,
      uri:resource.logicalUri,
      label:resource.sourcePath.split("/").at(-1)??resource.sourcePath,
      kind:"resource",
      parentId:`role-${role}`,
      relation:"contains",
      sourceUris:[resource.uri],
      properties:{sha256:resource.sha256,labels:resource.labels??[]},
      children:[],
    });
  }
  return {schema:"subactor.tree/v1",id:`${project.id}-knowledge-tree`,roots:[{id:project.id,uri:`subactor://project/${project.id}`,label:project.name,kind:"living-project",children:[...byRole.values()]}]};
}
function parseObservationValue(value:unknown):string|number|boolean {
  if(typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}
function observationsFromResources(project:LivingProjectDocument,resources:ResourceRecord[],texts:Map<string,string>,snapshot:string):ObservationDocument {
  const observations:ObservationRecord[] = [];
  let index = 0;
  for(const resource of resources.filter(item=>item.sourceRole === "runtime")) {
    const rawText = texts.get(resource.uri)??"";
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced?.[1]??rawText).trim();
    let rows:unknown[] = [];
    try { const parsed = JSON.parse(text); rows = Array.isArray(parsed)?parsed:[parsed]; }
    catch { rows = text.split(/\r?\n/).filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}); }
    for(const raw of rows) {
      if(!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const row = raw as Record<string,unknown>;
      const observedAt = typeof row.observedAt === "string" ? row.observedAt : typeof row.timestamp === "string" ? row.timestamp : new Date(0).toISOString();
      const receivedAt = typeof row.receivedAt === "string" ? row.receivedAt : observedAt;
      const subjectUri = typeof row.subjectUri === "string" ? row.subjectUri : `subactor://project/${project.id}/runtime`;
      const severity = ["debug","info","warning","error","critical"].includes(String(row.severity)) ? String(row.severity) as ObservationRecord["severity"] : "info";
      if (row.unit === "mixed") throw new Error(`OBSERVATION_UNIT_MIXED_FORBIDDEN:${resource.sourcePath}`);
      const units = row.units && typeof row.units === "object" && !Array.isArray(row.units) ? row.units as Record<string, unknown> : {};
      for(const [metric,value] of Object.entries(row)) {
        if(["observedAt","receivedAt","timestamp","subjectUri","severity","labels","unit","units"].includes(metric)) continue;
        const unit = typeof units[metric] === "string" ? String(units[metric]) : typeof row.unit === "string" ? row.unit : undefined;
        observations.push({id:`obs-${++index}`,observedAt,receivedAt,subjectUri,metric,value:parseObservationValue(value),unit,severity,sourceUris:[resource.uri],labels:Array.isArray(row.labels)?row.labels.filter(item=>typeof item === "string") as string[]:[]});
      }
    }
  }
  return validateObservation({schema:"subactor.observation/v1",id:`${project.id}-observations`,sourceSnapshotHash:snapshot,observations});
}
function reasoning(input:{project:LivingProjectDocument;resources:ResourceRecord[];development:DevelopmentEvidenceSummary;observations:ObservationDocument;grantPresent:boolean;rateLimitAvailable:boolean;evidenceSets:{research:EvidenceSetRecord;runtime:EvidenceSetRecord;all:EvidenceSetRecord}}):MathDocument {
  const {project,resources,development,observations,grantPresent,rateLimitAvailable,evidenceSets} = input;
  const roles = new Set(resources.map(resource=>resource.sourceRole));
  const researchUris = resources.filter(resource=>["manager","customer","project","archive","internet"].includes(String(resource.sourceRole))).map(resource=>resource.uri);
  const managerUris = resources.filter(resource=>resource.sourceRole === "manager").map(resource=>resource.uri);
  const runtimeUris = resources.filter(resource=>resource.sourceRole === "runtime").map(resource=>resource.uri);
  const researchPresent = researchUris.length > 0;
  const developmentPresent = development.source !== "missing" && development.recordCount > 0;
  const developmentAccepted = development.acceptance === "accepted";
  const runtimePresent = observations.observations.length > 0;
  const readiness = project.profile === "biofoundry"
    ? biofoundryReadinessBindings(resources, project.sources.map(source=>source.path))
    : {bindings:[],expressions:{}};
  return {
    schema:"subactor.math/v1",
    id:`${project.id}-iteration-gates`,
    bindings:[
      {name:"ManagerApproved",value:project.policy.approved,sourceUris:managerUris},
      {name:"ResearchEvidencePresent",value:researchPresent,sourceUris:[evidenceSets.research.uri]},
      {name:"DevelopmentEvidencePresent",value:developmentPresent,sourceUris:development.evidenceUris},
      {name:"DevelopmentAccepted",value:developmentAccepted,sourceUris:development.evidenceUris},
      {name:"RuntimeEvidencePresent",value:runtimePresent,sourceUris:[evidenceSets.runtime.uri]},
      {name:"RequireResearch",value:project.policy.requireResearch,sourceUris:managerUris},
      {name:"RequireDevelopment",value:project.policy.requireDevelopmentEvidence,sourceUris:managerUris},
      {name:"RequireDevelopmentAcceptance",value:project.policy.requireDevelopmentAcceptance,sourceUris:managerUris},
      {name:"RequireRuntime",value:project.policy.requireRuntimeEvidence,sourceUris:managerUris},
      {name:"AutoPublishScene",value:project.policy.autoPublishScene,sourceUris:managerUris},
      {name:"AllowRuntimeSelfModification",value:project.policy.allowRuntimeSelfModification,sourceUris:managerUris},
      {name:"AutonomyModeApply",value:project.policy.autonomyMode === "apply",sourceUris:managerUris},
      {name:"RequireSignedMutationGrant",value:project.policy.requireSignedMutationGrant,sourceUris:managerUris},
      {name:"SignedMutationGrantPresent",value:grantPresent,sourceUris:managerUris},
      {name:"RateLimitAvailable",value:rateLimitAvailable,sourceUris:managerUris},
      {name:"SourceRoleCount",value:roles.size,unit:"count",sourceUris:[evidenceSets.all.uri]},
      // Readiness bindings may be derived from the full corpus. Bind the immutable set URI,
      // not hundreds of members repeated once per scalar.
      ...readiness.bindings.map(binding=>({...binding,sourceUris:[evidenceSets.all.uri]})),
    ],
    expressions:{
      ResearchGate:{kind:"or",args:[{kind:"not",arg:{kind:"ref",name:"RequireResearch"}},{kind:"ref",name:"ResearchEvidencePresent"}]},
      DevelopmentGate:{kind:"and",args:[
        {kind:"or",args:[{kind:"not",arg:{kind:"ref",name:"RequireDevelopment"}},{kind:"ref",name:"DevelopmentEvidencePresent"}]},
        {kind:"or",args:[{kind:"not",arg:{kind:"ref",name:"RequireDevelopmentAcceptance"}},{kind:"ref",name:"DevelopmentAccepted"}]},
      ]},
      RuntimeGate:{kind:"or",args:[{kind:"not",arg:{kind:"ref",name:"RequireRuntime"}},{kind:"ref",name:"RuntimeEvidencePresent"}]},
      MutationGrantGate:{kind:"or",args:[{kind:"not",arg:{kind:"ref",name:"RequireSignedMutationGrant"}},{kind:"ref",name:"SignedMutationGrantPresent"}]},
      IterationAllowed:{kind:"and",args:[{kind:"ref",name:"ManagerApproved"},{kind:"ref",name:"RateLimitAvailable"},{kind:"ref",name:"ResearchGate"},{kind:"ref",name:"DevelopmentGate"},{kind:"ref",name:"RuntimeGate"}]},
      ScenePublishAllowed:{kind:"and",args:[{kind:"ref",name:"IterationAllowed"},{kind:"ref",name:"AutoPublishScene"}]},
      RuntimeSelfModificationAllowed:{kind:"and",args:[{kind:"ref",name:"IterationAllowed"},{kind:"ref",name:"AllowRuntimeSelfModification"},{kind:"ref",name:"AutonomyModeApply"},{kind:"ref",name:"MutationGrantGate"},{kind:"ref",name:"DevelopmentAccepted"}]},
      ...readiness.expressions,
    },
  };
}
function conceptualTwin(project:LivingProjectDocument,resources:ResourceRecord[],observations:ObservationDocument,snapshot:string,development:DevelopmentEvidenceSummary,blueprint?:SceneBlueprint):TwinDocument {
  if(blueprint) return materializeBlueprintTwin({blueprint,projectId:project.id,resources,observations,development,sourceSnapshotHash:snapshot});
  if(project.profile === "biofoundry") return biofoundryConceptTwin(project,resources,observations,snapshot,development);
  const roles = [...new Set(resources.map(resource=>resource.sourceRole??"project"))];
  return {
    schema:"subactor.twin/v1",
    id:`${project.id}-twin`,
    kind:"conceptual",
    observedAt:new Date().toISOString(),
    sourceSnapshotHash:snapshot,
    components:[
      ...roles.map((role,index)=>({id:`${role}-knowledge`,type:"knowledge-domain",sourceUris:resources.filter(resource=>resource.sourceRole===role).map(resource=>resource.uri),properties:{role,index,resourceCount:resources.filter(resource=>resource.sourceRole===role).length},children:[]})),
      {id:"development-model",type:"intent-evidence-graph",sourceUris:development.evidenceUris,properties:{fingerprint:development.graphFingerprint,acceptance:development.acceptance,recordCount:development.recordCount,blockingDiagnosticCount:development.blockingDiagnosticCount},children:[]},
      {id:"runtime-observations",type:"observation-stream",sourceUris:resources.filter(resource=>resource.sourceRole==="runtime").map(resource=>resource.uri),properties:{count:observations.observations.length,metrics:[...new Set(observations.observations.map(observation=>observation.metric))]},children:[]},
    ],
  };
}
function conceptualScene(project:LivingProjectDocument,twin:TwinDocument,blueprint?:SceneBlueprint):SceneDocument {
  if(blueprint) return materializeBlueprintScene({blueprint,projectId:project.id,format:project.scene.format,twin});
  if(project.profile === "biofoundry") return biofoundryConceptScene(project,twin);
  const twinUri = contentUri("twin",twin);
  return {
    schema:"subactor.scene/v1",
    id:`${project.id}-scene`,
    format:project.scene.format,
    sourceTwinId:twin.id,
    bindings:twin.components.map((component,index)=>({
      twinUri:`${twinUri}#component=${encodeURIComponent(component.id)}`,
      componentId:component.id,
      scenePath:`/LivingProject/${component.id.replace(/[^A-Za-z0-9_]/g,"_")}`,
      primitive:"cube",
      position:[(index%4)*3,Math.floor(index/4)*3,0],
      size:[2,2,1],
      propertyMap:{resourceCount:"subactor:resourceCount",count:"subactor:observationCount",fingerprint:"subactor:developmentFingerprint",acceptance:"subactor:developmentAcceptance"},
    })),
  };
}
async function fixtureFetcher(base:string,mapPath:string):Promise<FetchLike> {
  const map = await readJson<Record<string,string>>(mapPath);
  return async input=>{
    const relative = map[String(input)];
    if(!relative) return new Response("not found",{status:404});
    return new Response(await readFile(resolve(base,relative),"utf8"),{status:200,headers:{"content-type":String(input).endsWith(".xml")?"application/xml":"text/html"}});
  };
}
function fallbackAudit(audit:GenerationAudit,reason:string):GenerationAudit {
  return {...deterministicAudit(audit.requestedMode,reason),durationMs:audit.durationMs};
}

export function shouldShortCircuitSceneGeneration(mode:LlmMode,audit:GenerationAudit):boolean {
  if(mode!=="prefer-llm"||!audit.degraded||audit.effectiveMode!=="deterministic") return false;
  return /aborted|timeout|fetch|OPENROUTER_NOT_CONFIGURED|OPENROUTER_HTTP:(429|500|502|503|504)/i.test(audit.reason??"");
}

export class LivingProjectRuntime {
  constructor(readonly todo2code=new Todo2CodeAdapter(),readonly compiler=new NlDslCompiler(),readonly geometryService=new GeometryService()) {}

  async load(configPath:string):Promise<LivingProjectDocument> {
    const text = await readFile(configPath,"utf8");
    return configPath.endsWith(".projectdsl") ? parseProjectDsl(text) : validateProject(JSON.parse(text));
  }

  async iterate(configPath:string,outDir:string,mode:LlmMode="deterministic"):Promise<LivingIterationReceipt> {
    const absolute = resolve(configPath);
    const project = await this.load(absolute);
    await mkdir(outDir,{recursive:true});
    const lease = await acquireProjectLease(outDir,project.id,Number(process.env.DT_LEASE_STALE_MS??300_000));
    try { return await this.iterateWithLease(absolute,resolve(outDir),project,mode); }
    finally { await lease.release(); }
  }

  private async iterateWithLease(configPath:string,outDir:string,project:LivingProjectDocument,mode:LlmMode):Promise<LivingIterationReceipt> {
    const startedAt = new Date().toISOString();
    const traceId = randomUUID();
    const base = dirname(configPath);
    const dashboardPort = Number(process.env.DT_DASHBOARD_PORT ?? 7444);
    if (!Number.isInteger(dashboardPort) || dashboardPort < 1 || dashboardPort > 65535) throw new Error("DT_DASHBOARD_PORT_INVALID");
    const sceneBlueprint = project.scene.blueprintFile
      ? validateSceneBlueprint(await readJson(resolve(base,project.scene.blueprintFile)))
      : undefined;
    const liveBindings:LiveBindingDocument|undefined = project.observations.liveBindingFile
      ? parseLiveBindingDsl(await readFile(resolve(base,project.observations.liveBindingFile),"utf8"))
      : undefined;
    const assemblyDocument:AssemblyDocument|undefined = project.scene.assemblyFile
      ? parseAssemblyDsl(await readFile(resolve(base,project.scene.assemblyFile),"utf8"))
      : undefined;
    const baselinePhysicalEvidence = project.scene.physicalEvidenceFile
      ? validatePhysicalEvidence(await readJson(resolve(base,project.scene.physicalEvidenceFile)))
      : undefined;
    const geometryContractPaths = (project.scene.geometryBuildFiles ?? []).map(path=>resolve(base,path));
    const geometryContracts = await Promise.all(geometryContractPaths.map(path=>readJson<unknown>(path)));
    // Blueprint and physical facts are part of structural identity: a geometry or semantic model
    // change forces a new iteration even when sources and code are untouched.
    const projectConfigHash = sha256(canonicalJson({project,sceneBlueprint,liveBindings,assemblyDocument,physicalEvidence:baselinePhysicalEvidence,geometryContracts}));
    const scanned = await scanSources(project.sources.map(source=>({path:resolve(base,source.path),role:source.role,logicalRoot:source.logicalRoot,labels:source.labels})));
    if(project.webResearch) {
      const plan = parseDql(await readFile(resolve(base,project.webResearch.dqlFile),"utf8"));
      const crawler = project.webResearch.fixtureMapFile
        ? new DqlCrawler(await fixtureFetcher(base,resolve(base,project.webResearch.fixtureMapFile)),async()=>{})
        : new DqlCrawler();
      const web = await crawler.crawl(plan);
      for(const page of web.pages) { scanned.resources.push(page.resource); scanned.texts.set(page.resource.uri,page.markdown); }
      scanned.warnings.push(...web.warnings);
    }
    const resources = scanned.resources;
    const geometryMaterializations:GeometryMaterialization[] = geometryContractPaths.length
      ? await this.geometryService.materializeFiles(geometryContractPaths,join(outDir,"geometry"),project.id)
      : [];
    for(const materialization of geometryMaterializations) {
      if(materialization.resource) resources.push(materialization.resource);
      if(materialization.receipt.status === "failed") scanned.warnings.push(`GEOMETRY_BUILD_FAILED:${materialization.contract.id}:${materialization.receipt.error?.code??"unknown"}`);
    }
    const geometryFingerprint = sha256(canonicalJson(geometryMaterializations.map(({receipt})=>({
      id:receipt.id,status:receipt.status,buildHash:receipt.geometryBuildHash,artifactHash:receipt.geometryArtifactHash??null,
      validation:receipt.validation.ok,error:receipt.error?.code??null,
    }))));
    const researchResourceUris=resources.filter(resource=>["manager","customer","project","archive","internet"].includes(String(resource.sourceRole))).map(resource=>resource.uri);
    const runtimeResourceUris=resources.filter(resource=>resource.sourceRole==="runtime").map(resource=>resource.uri);
    const evidenceSets={
      research:evidenceSet(`${project.id}-research`,researchResourceUris),
      runtime:evidenceSet(`${project.id}-runtime`,runtimeResourceUris),
      all:evidenceSet(`${project.id}-all`,resources.map(resource=>resource.uri)),
    };
    // Derived Markdown→intentDSL is an active, validated input to every iteration. Invalid packs
    // never reach the LLM/twin stages and are reported as a hard validation failure.
    const intentDsl = await indexIntentDsl(resources, scanned.texts);
    if(intentDsl.invalid) scanned.warnings.push(`INTENT_DSL_INVALID_PACKS:${intentDsl.invalid}`);
    const researchHash = sourceSnapshot(resources);
    const previousResources = await readOptional<ResourceRecord[]>(join(outDir,"state/resources.json"))??[];
    const diff = resourceDiff(previousResources,resources);
    const previous = await readOptional<LivingIterationReceipt>(join(outDir,"latest.json"));

    let development:unknown = [];
    let analysis:Todo2CodeAnalysis|undefined;
    let developmentSource:"todo2code"|"fixture"|"missing" = "missing";
    const developmentRoot = resolve(base,project.development.root);
    if(await this.todo2code.available()) {
      const developmentOut = join(outDir,"development");
      await this.todo2code.extract(developmentRoot,developmentOut,{task:project.development.task,todo:project.development.todo,changelog:project.development.changelog,docs:project.development.docs});
      analysis = await this.todo2code.readLatestAnalysis(developmentRoot,developmentOut);
      if(analysis) { development = analysis.graph; developmentSource = "todo2code"; }
    }
    if(developmentSource === "missing" && project.development.fixture) {
      development = await readJson(resolve(base,project.development.fixture));
      developmentSource = "fixture";
    }
    const intentUri = contentUri("intent",development);
    const developmentEvidence = summarizeDevelopment({
      source:developmentSource,
      graph:development,
      diagnostics:analysis?.diagnostics,
      manifest:analysis?.manifest,
      evidenceUris:developmentSource === "missing" ? [] : [intentUri],
      fixtureAllowed:project.policy.allowDevelopmentFixture,
    });
    const developmentFingerprint = developmentAnalysisFingerprint({
      graph:development,
      diagnostics:analysis?.diagnostics,
      manifest:analysis?.manifest,
      summary:developmentEvidence,
    });
    const observation = observationsFromResources(project,resources,scanned.texts,researchHash);
    const observationHash = sha256(canonicalJson(observation));
    const stableKey = sha256(canonicalJson({researchHash,developmentFingerprint,observationHash,projectConfigHash,geometryFingerprint,intentDsl,runtimeGeneration:RUNTIME_GENERATION}));
    // Unchanged inputs alone are not enough to skip: a runtime whose generation semantics
    // changed derives a different twin from the very same sources, so RUNTIME_GENERATION
    // has to match too, or a shipped fix would never reach an existing project.
    // DT_FORCE_ITERATION exists for the case where neither moved but a rebuild is wanted.
    const forced = process.env.DT_FORCE_ITERATION === "1";
    const previousStableState = await readOptional<{stableKey?:string}>(join(outDir,"state/key.json"));
    if(!forced && previous && previousStableState?.stableKey===stableKey && previous.runtimeGeneration===RUNTIME_GENERATION && previous.projectConfigHash===projectConfigHash && previous.researchSnapshotHash===researchHash && previous.developmentFingerprint===developmentFingerprint && previous.observationSnapshotHash===observationHash) {
      const runtimeRoot = resolve(outDir);
      const startPathFor = (path:string):string => startDocumentPath(base,path);
      const dashboardCli = await startDocumentCli(base);
      const streamVersion = await recentIterationCount(outDir,Number.MAX_SAFE_INTEGER);
      const blocked = !previous.validation.ok;
      const diagnosticScope = blocked ? "candidate" : "current";
      const diagnosticRoot = join(runtimeRoot,diagnosticScope);
      const [currentTwinState,currentAssemblyReport] = await Promise.all([
        readOptional<TwinStateDocument>(join(diagnosticRoot,"twin-state.json")),
        readOptional<AssemblyReport>(join(diagnosticRoot,"assembly-report.json")),
      ]);
      await writeFile(resolve(base,"START.md"),[
        `# ${project.name} — START`, "", `Generated: ${new Date().toISOString()}`,
        `Status: ACTIVE / ACCEPTED; LATEST ITERATION / ${blocked ? "REJECTED" : "ACCEPTED"}; NO CHANGE`,
        `Project: ${project.id}`, `Runtime generation: ${RUNTIME_GENERATION}`,
        `Event stream version: ${streamVersion}`, `Last completed iteration: ${previous.completedAt}`, "",
        "## Live application", "",
        `- Dashboard URL: http://127.0.0.1:${dashboardPort}`,
        `- Project DSL: ${startPathFor(configPath)}`, `- Runtime root: ${startPathFor(runtimeRoot)}`,
        `- Current Twin: ${startPathFor(join(runtimeRoot,"current/twin.json"))}`,
        `- Current scene JSON: ${startPathFor(join(runtimeRoot,"current/scene.json"))}`,
        `- Current OpenUSD: ${startPathFor(join(runtimeRoot,"current/scene.usda"))}`,
        ...(currentTwinState?[`- Current TwinState: ${startPathFor(join(diagnosticRoot,"twin-state.json"))}`]:[]),
        `- Rendered ACTIVE artifact scope: ${startPathFor(join(runtimeRoot,"current"))}`,
        `- Latest diagnostic scope: ${startPathFor(diagnosticRoot)}`,
        `- API state: http://127.0.0.1:${dashboardPort}/api/state`,
        `- API event log: http://127.0.0.1:${dashboardPort}/api/events`,
        `- API DSL log: http://127.0.0.1:${dashboardPort}/api/dsl`,
        `- Component inspection URL pattern: http://127.0.0.1:${dashboardPort}/?focus=<componentId>`, "", "```bash",
        `DT_DASHBOARD_HOST=0.0.0.0 DT_DASHBOARD_PORT=${dashboardPort} node ${dashboardCli} dashboard ${startPathFor(configPath)} ${startPathFor(runtimeRoot)} ${dashboardPort} ${mode}`,
        "```", "", "## DSL and validation", "",
        `- intentDSL index: ${startPathFor(join(diagnosticRoot,"intent-dsl.index.json"))}`,
        `- Physical evidence report: ${startPathFor(join(diagnosticRoot,"physical-evidence.report.json"))}`,
        `- Geometry build diagnostics: ${startPathFor(join(diagnosticRoot,"geometry-builds.dsl"))}`,
        `- Geometry validation: ${startPathFor(join(diagnosticRoot,"geometry-validation.dsl"))}`,
        `- Project integrity: ${startPathFor(join(diagnosticRoot,"project-integrity.dsl"))}`,
        `- Evidence sets: ${startPathFor(join(diagnosticRoot,"evidence-sets.dsl"))}`,
        `- Archive project analysis: ${startPathFor(join(diagnosticRoot,"archive-project-analysis.dsl"))}`,
        `- Validation: ${blocked ? previous.validation.failures.join(", ") : "passed"}`,
        "", "## Logs and feedback", "",
        `- Iteration receipt: ${startPathFor(join(runtimeRoot,"latest.json"))}`,
        `- Event log: ${startPathFor(join(runtimeRoot,"events.jsonl"))}`,
        `- Failure log: ${startPathFor(join(runtimeRoot,"dead-letter.jsonl"))}`,
        `- Dashboard server log: ${startPathFor(resolve(base,"logs",`dashboard-${dashboardPort}.log`))}`,
        `- Runtime observations: ${startPathFor(join(diagnosticRoot,"observations.json"))}`,
        ...(currentTwinState?[`- Live bindings: ${startPathFor(resolve(base,project.observations.liveBindingFile!))}`,`- TwinState: ${startPathFor(join(diagnosticRoot,"twin-state.json"))}`,`- TwinState freshness: ${currentTwinState.coverage.fresh} fresh; ${currentTwinState.coverage.stale} stale; ${currentTwinState.coverage.expired} expired; ${currentTwinState.coverage.unknown} unknown`]:[]),
        ...(currentAssemblyReport?[`- Assembly contract: ${startPathFor(resolve(base,project.scene.assemblyFile!))}`,`- Assembly report: ${startPathFor(join(diagnosticRoot,"assembly-report.dsl"))}`,`- Assembly completeness: ${currentAssemblyReport.coverage.completeAssemblies}/${currentAssemblyReport.coverage.assemblies}; required parts ${currentAssemblyReport.coverage.completeRequiredParts}/${currentAssemblyReport.coverage.requiredParts}`]:[]),
        `- Feedback: ${startPathFor(resolve(base,"feedback/latest.md"))}`,
        `- Generation audit: ${startPathFor(join(diagnosticRoot,"generation-audit.json"))}`,
        "", "## Presentation assets", "",
        `- Dashboard screenshot: ${startPathFor(join(runtimeRoot,"current/presentation/digital-twin-dashboard.png"))}`,
        `- OSCAR pipette inspection: ${startPathFor(join(runtimeRoot,"current/presentation/oscar-pipette-tool-inspection.png"))}`,
        `- MOS3S custom-parts inspection: ${startPathFor(join(runtimeRoot,"current/presentation/bioprinter-mos3s-inspection.png"))}`,
        `- MOS3S custom-parts orbit video: ${startPathFor(join(runtimeRoot,"current/presentation/digital-twin-mos3s-orbit.webm"))}`,
        `- 3D orbit video: ${startPathFor(join(runtimeRoot,"current/presentation/digital-twin-orbit.webm"))}`,
        `- Dashboard recording: ${startPathFor(join(runtimeRoot,"current/presentation/digital-twin-dashboard.webm"))}`,
        "", `Iteration URI: ${previous.iterationUri}`, "",
      ].join("\n"),"utf8");
      return {...previous,noChange:true,diff};
    }

    const iterationsLastHour = await recentIterationCount(outDir);
    const rateLimitAvailable = iterationsLastHour < project.policy.maxIterationsPerHour;
    const grantPresent = await mutationGrantPresent(project,base);
    const tree = groupTree(project,resources);
    const authoritativeMath = reasoning({project,resources,development:developmentEvidence,observations:observation,grantPresent,rateLimitAvailable,evidenceSets});
    const deterministicTwin = conceptualTwin(project,resources,observation,researchHash,developmentEvidence,sceneBlueprint);
    const deterministicScene = conceptualScene(project,deterministicTwin,sceneBlueprint);
    const llmResourceLimit=Math.max(10,Math.min(200,Number(process.env.DT_LLM_RESOURCE_CONTEXT_LIMIT??80)||80));
    // LLMs receive the immutable evidence index, not scanner implementation timestamps or
    // absolute host paths. This keeps prompts small enough for weaker models while preserving
    // every identifier needed for grounding checks performed after generation.
    const llmResources=resources.slice(0,llmResourceLimit).map(resource=>({
      id:resource.id,uri:resource.uri,logicalUri:resource.logicalUri,mediaType:resource.mediaType,
      sourceRole:resource.sourceRole??"project",labels:resource.labels??[],derived:resource.derived,derivedFrom:resource.derivedFrom,
    }));
    const context = {project,resources:llmResources,resourceCoverage:{included:llmResources.length,total:resources.length,truncated:llmResources.length<resources.length},development,developmentEvidence,observation,intentDsl,stableKey,iterationsLastHour,grantPresent,sceneBlueprint};
    const effectiveMode:LlmMode = rateLimitAvailable ? mode : "deterministic";

    const semanticMath = semanticMathProjection(authoritativeMath);
    let mathGeneration = await this.compiler.compile({kind:"math",text:`Derive semantic, non-authoritative project relations for ${project.managerIntent}`,context:{resources:context.resources,development:context.development,developmentEvidence:context.developmentEvidence,observation:context.observation,intentDsl:context.intentDsl,sceneBlueprint:context.sceneBlueprint},mode:effectiveMode,deterministicValue:{dsl:renderMathDsl(semanticMath)}});
    let mergedMath;
    try { mergedMath = mergeAuthorityMath(authoritativeMath,mathGeneration.value as MathDocument); }
    catch(error) {
      if(!(error instanceof Error)||!error.message.startsWith("SEMANTIC_MATH_AUTHORITY_FIELD_FORBIDDEN:")) throw error;
      mathGeneration = {...mathGeneration,value:semanticMath,audit:fallbackAudit(mathGeneration.audit,"semantic_math_authority_field_forbidden")};
      mergedMath = mergeAuthorityMath(authoritativeMath,semanticMath);
    }
    const math = mergedMath.document;
    const authorityWarnings = [...mergedMath.warnings];

    let twinGeneration = await this.compiler.compile({kind:"twin",text:`Build the current Digital Twin projection for ${project.name}.`,context:{...context,math},mode:effectiveMode,deterministicValue:{document:deterministicTwin}});
    let twin = twinGeneration.value as TwinDocument;
    try { validateTwin(twin); validateTwinGrounding(twin,deterministicTwin,resources); }
    catch(error) {
      if(mode === "require-llm") throw error;
      authorityWarnings.push(`LLM_TWIN_PROPOSAL_REJECTED:${error instanceof Error?error.message:String(error)}`);
      twin = deterministicTwin;
      twinGeneration = {...twinGeneration,value:twin,audit:fallbackAudit(twinGeneration.audit,"domain_grounding_failed")};
    }

    const deterministicSceneForTwin = conceptualScene(project,twin,sceneBlueprint);
    let sceneGeneration:DslGenerationResult;
    if(shouldShortCircuitSceneGeneration(effectiveMode,twinGeneration.audit)) {
      const deterministicSceneGeneration=await this.compiler.compile({kind:"scene",text:`Build the current conceptual scene for ${project.name} without inventing geometry.`,context:{...context,math,twin},mode:"deterministic",deterministicValue:{document:deterministicSceneForTwin}});
      sceneGeneration={
        ...deterministicSceneGeneration,
        audit:{...deterministicAudit(effectiveMode,"upstream_twin_transport_fallback"),durationMs:0},
      };
      authorityWarnings.push("LLM_SCENE_SKIPPED_AFTER_TWIN_TRANSPORT_FALLBACK");
    } else {
      sceneGeneration=await this.compiler.compile({kind:"scene",text:`Build the current conceptual scene for ${project.name} without inventing geometry.`,context:{...context,math,twin},mode:effectiveMode,deterministicValue:{document:deterministicSceneForTwin}});
    }
    let scene = sceneGeneration.value as SceneDocument;
    try { validateScene(scene); validateSceneGrounding(scene,twin,resources,deterministicSceneForTwin); }
    catch(error) {
      if(mode === "require-llm") throw error;
      authorityWarnings.push(`LLM_SCENE_PROPOSAL_REJECTED:${error instanceof Error?error.message:String(error)}`);
      scene = deterministicSceneForTwin;
      sceneGeneration = {...sceneGeneration,value:scene,audit:fallbackAudit(sceneGeneration.audit,"domain_grounding_failed")};
    }

    const geometryBuildFailures = geometryMaterializations
      .filter(({receipt})=>receipt.status!=="succeeded"||!receipt.validation.ok)
      .map(({contract,receipt})=>`GeometryBuildFailed:${contract.id}:${receipt.error?.code??receipt.validation.failures.join("|")}`);
    const validGeometryEvidence = [] as NonNullable<GeometryMaterialization["evidence"]>[];
    for(const materialization of geometryMaterializations) {
      if(!materialization.evidence || materialization.receipt.status!=="succeeded") continue;
      const binding = scene.bindings.find(item=>item.componentId===materialization.receipt.target.componentId);
      if(!binding || binding.scenePath!==materialization.receipt.target.scenePath) {
        geometryBuildFailures.push(`GeometryScenePathDrift:${materialization.contract.id}:${binding?.scenePath??"missing"}:${materialization.receipt.target.scenePath}`);
        continue;
      }
      validGeometryEvidence.push(materialization.evidence);
    }
    if(assemblyDocument&&baselinePhysicalEvidence) {
      const aggregateEvidence=assemblyAggregateEvidence(assemblyDocument,baselinePhysicalEvidence);
      if(aggregateEvidence) validGeometryEvidence.push(aggregateEvidence);
    }
    const mergedPhysicalEvidence = mergeGeometryEvidence(baselinePhysicalEvidence,validGeometryEvidence);
    const physicalEvidence = mergedPhysicalEvidence ? validatePhysicalEvidence(mergedPhysicalEvidence) : undefined;

    // Physical facts are authoritative and deterministic: they are folded in after the model is
    // settled, so no LLM proposal can talk the twin out of a surveyed dimension.
    let physicalEvidenceReport:PhysicalEvidenceReport|undefined;
    let geometryValidation:GeometryValidationReport|undefined;
    if(physicalEvidence) {
      const grounded = applyPhysicalEvidence({twin,scene,evidence:physicalEvidence,allowedAssetUris:resources.map(resource=>resource.uri)});
      twin = grounded.twin;
      scene = grounded.scene;
      physicalEvidenceReport = grounded.report;
      geometryValidation = grounded.geometryValidation;
      for(const entry of physicalEvidenceReport.rejected) authorityWarnings.push(`PHYSICAL_EVIDENCE_REJECTED:${entry.componentId}:${entry.reason}`);
    }

    const twinState:TwinStateDocument|undefined = liveBindings
      ? projectTwinState({projectId:project.id,bindings:liveBindings,observations:observation,twin,projectedAt:startedAt})
      : undefined;
    const assemblyReport:AssemblyReport|undefined = assemblyDocument
      ? analyzeAssemblies({projectId:project.id,document:assemblyDocument,twin,scene,allowedAssetUris:resources.map((resource)=>resource.uri)})
      : undefined;

    const allowed = evaluateMath(math,"IterationAllowed") === true && intentDsl.invalid === 0;
    const scenePolicyAllowed = evaluateMath(math,"ScenePublishAllowed") === true && intentDsl.invalid === 0;
    const geometryReport = geometryValidation ?? validateGeometry(
      scene,
      {schema:"subactor.physical-evidence/v1",id:"none",coordinateSystem:{unit:"m",upAxis:"Z"},records:[]},
      undefined,
      geometryRequirementsFromTwin(twin),
    );
    const projectIntegrity:ProjectIntegrityReport = analyzeProjectIntegrity({
      project,resources,development:developmentEvidence,observations:observation,twin,scene,
      geometry:geometryReport,physicalEvidence,
      geometryBuildReceipts:geometryMaterializations.map(item=>item.receipt),
      generationAudits:[mathGeneration.audit,twinGeneration.audit,sceneGeneration.audit],
    });
    const publish = scenePolicyAllowed && geometryReport.ok && projectIntegrity.ok && (assemblyReport?.ok ?? true) && geometryBuildFailures.length===0;
    const failures:string[] = [];
    if(intentDsl.invalid) failures.push(`IntentDslValidationFailed:${intentDsl.invalid}`);
    if(!rateLimitAvailable) failures.push("AutonomyRateLimitExceeded");
    if(!allowed) failures.push("IterationAllowed=false");
    if(!scenePolicyAllowed) failures.push("ScenePublishAllowed=false");
    failures.push(...geometryBuildFailures);
    if(!geometryReport.ok) failures.push(`GeometryValidationFailed:${geometryReport.failures.join("|")}`);
    if(!projectIntegrity.ok) failures.push(`ProjectIntegrityFailed:${projectIntegrity.findings.filter(finding=>finding.severity==="error").map(finding=>finding.code).join("|")}`);
    if(assemblyReport && !assemblyReport.ok) failures.push(`AssemblyValidationFailed:${assemblyReport.findings.filter((finding)=>finding.severity==="error").map((finding)=>finding.code).join("|")}`);
    const researchPresent = resources.some(resource=>["manager","customer","project","archive","internet"].includes(String(resource.sourceRole)));
    const runtimePresent = observation.observations.length > 0;
    const geometryRepairProcesses = geometryMaterializations.flatMap(({contract,receipt})=>receipt.status==="failed"&&receipt.repairProcess?[{
      failure:`GeometryBuildFailed:${contract.id}:${receipt.error?.code??receipt.validation.failures.join("|")}`,
      title:`Reconcile geometry evidence for ${contract.id}`,
      processUri:receipt.repairProcess,
      evidenceUris:[receipt.source.uri,...Object.values(receipt.artifacts).map(artifact=>artifact.uri)],
    }]:[]);
    const assemblyRepairProcesses = (assemblyReport?.findings ?? []).map((finding)=>({failure:`${finding.code}:${finding.componentId}`,title:`Repair assembly ${finding.assemblyId}: ${finding.partId??finding.componentId}`,processUri:finding.repairProcess,evidenceUris:[finding.errorUri]}));
    const specializedRepairUris = new Set([...geometryRepairProcesses,...assemblyRepairProcesses].map(repair=>repair.processUri));
    const integrityRepairProcesses = projectIntegrity.findings
      .filter(finding=>!specializedRepairUris.has(finding.repairProcess))
      .map(finding=>({
        failure:`ProjectIntegrity:${finding.code}:${finding.subjects.join("|")}`,
        title:`Resolve project integrity finding ${finding.code}`,
        processUri:finding.repairProcess,
        evidenceUris:finding.evidenceUris,
      }));
    const improvement = buildImprovementPlan({project,previousIterationUri:previous?.iterationUri??null,development:developmentEvidence,researchPresent,runtimePresent,mutationGrantPresent:grantPresent,authorityWarnings,failures,evidenceUris:[...resources.map(resource=>resource.uri),intentUri],repairProcesses:[...geometryRepairProcesses,...assemblyRepairProcesses,...integrityRepairProcesses]});

    const candidate = join(outDir,"candidate");
    await writeJson(join(candidate,"project.json"),project);
    await writeJson(join(candidate,"resources.json"),resources);
    await writeJson(join(candidate,"archive-project-analysis.json"),{schema:"subactor.archive-project-index/v1",archives:scanned.archiveAnalyses});
    await writeFile(join(candidate,"archive-project-analysis.dsl"),scanned.archiveAnalyses.map(renderArchiveAnalysisDsl).join("\n"));
    await writeJson(join(candidate,"evidence-sets.json"),Object.values(evidenceSets));
    await writeFile(join(candidate,"evidence-sets.dsl"),renderEvidenceSets(Object.values(evidenceSets)));
    await writeJson(join(candidate,"development.intent.json"),development);
    await writeJson(join(candidate,"development.evidence.json"),developmentEvidence);
    await writeJson(join(candidate,"tree.json"),tree);
    await writeJson(join(candidate,"math.json"),math);
    await writeFile(join(candidate,"math.dsl"),renderMathDsl(math));
    await writeJson(join(candidate,"observations.json"),observation);
    await writeFile(join(candidate,"observations.dsl"),renderObservationDsl(observation));
    if(twinState) {
      await writeJson(join(candidate,"twin-state.json"),twinState);
      await writeFile(join(candidate,"twin-state.dsl"),renderTwinStateDsl(twinState));
    }
    if(assemblyReport) {
      await writeJson(join(candidate,"assembly-report.json"),assemblyReport);
      await writeFile(join(candidate,"assembly-report.dsl"),renderAssemblyReportDsl(assemblyReport));
    }
    await writeJson(join(candidate,"twin.json"),twin);
    await writeJson(join(candidate,"scene.json"),scene);
    await writeFile(join(candidate,"scene.usda"),renderOpenUsd(scene,twin));
    await writeJson(join(candidate,"scene.diff.json"),sceneDiff(await readOptional<SceneDocument>(join(outDir,"current/scene.json")),scene));
    await writeJson(join(candidate,"physical-evidence.report.json"),physicalEvidenceReport??{schema:"subactor.physical-evidence-report/v1",applied:[],rejected:[],componentIdsStable:true,scenePathsStable:true});
    await writeJson(join(candidate,"geometry-builds.json"),{schema:"subactor.geometry-build-index/v1",fingerprint:geometryFingerprint,receipts:geometryMaterializations.map(item=>item.receipt)});
    await writeFile(join(candidate,"geometry-builds.dsl"),geometryMaterializations.map(item=>renderGeometryReceiptDsl(item.receipt)).join("\n"));
    await writeJson(join(candidate,"geometry-validation.json"),geometryReport);
    await writeFile(join(candidate,"geometry-validation.dsl"),renderGeometryValidationDsl(geometryReport));
    await writeJson(join(candidate,"project-integrity.json"),projectIntegrity);
    await writeFile(join(candidate,"project-integrity.dsl"),renderProjectIntegrityDsl(projectIntegrity));
    await writeJson(join(candidate,"intent-dsl.index.json"),{schema:"subactor.intent-dsl-index/v1",...intentDsl,validatedAt:new Date().toISOString()});
    await writeJson(join(candidate,"improvement.json"),improvement);
    await writeFile(join(candidate,"improvement.dsl"),renderImprovementDsl(improvement));
    await writeJson(join(candidate,"generation-audit.json"),{math:mathGeneration.audit,twin:twinGeneration.audit,scene:sceneGeneration.audit,authorityWarnings,warnings:scanned.warnings,notices:scanned.notices});

    const artifactNames = ["project.json","resources.json","archive-project-analysis.json","archive-project-analysis.dsl","evidence-sets.json","evidence-sets.dsl","development.intent.json","development.evidence.json","tree.json","math.json","math.dsl","observations.json","observations.dsl",...(twinState?["twin-state.json","twin-state.dsl"]:[]),...(assemblyReport?["assembly-report.json","assembly-report.dsl"]:[]),"twin.json","scene.json","scene.usda","scene.diff.json","physical-evidence.report.json","geometry-builds.json","geometry-builds.dsl","geometry-validation.json","geometry-validation.dsl","project-integrity.json","project-integrity.dsl","intent-dsl.index.json","improvement.json","improvement.dsl","generation-audit.json"];
    if(publish) {
      const current = join(outDir,"current");
      await mkdir(current,{recursive:true});
      for(const name of artifactNames) await writeFile(join(current,name),await readFile(join(candidate,name)));
    }

    const developmentEvidenceUri = contentUri("development-evidence",developmentEvidence);
    const treeUri = contentUri("tree",tree);
    const mathUri = contentUri("math",math);
    const observationUri = contentUri("observation",observation);
    const twinStateUri = twinState ? contentUri("twin-state",twinState) : undefined;
    const assemblyReportUri = assemblyReport ? contentUri("assembly-report",assemblyReport) : undefined;
    const twinUri = contentUri("twin",twin);
    const sceneUri = contentUri("scene",scene);
    const improvementUri = contentUri("improvement",improvement);
    const iterationId = randomUUID();
    const idempotencyKey = sha256(canonicalJson({projectId:project.id,stableKey,previousIterationUri:previous?.iterationUri??null}));
    const iterationCore = {projectId:project.id,iterationId,traceId,idempotencyKey,researchHash,developmentFingerprint,observationHash,intentUri,developmentEvidenceUri,treeUri,mathUri,observationUri,twinStateUri:twinStateUri??null,assemblyReportUri:assemblyReportUri??null,twinUri,sceneUri,improvementUri};
    const iterationUri = contentUri("iteration",iterationCore);

    const receipt:LivingIterationReceipt = {
      schema:"subactor.living-iteration/v2",
      projectId:project.id,
      iterationId,
      traceId,
      idempotencyKey,
      noChange:false,
      startedAt,
      completedAt:new Date().toISOString(),
      projectConfigHash,
      runtimeGeneration:RUNTIME_GENERATION,
      researchSnapshotHash:researchHash,
      developmentFingerprint,
      observationSnapshotHash:observationHash,
      previousIterationUri:previous?.iterationUri??null,
      intentUri,
      developmentEvidenceUri,
      treeUri,
      mathUri,
      observationUri,
      twinStateUri,
      assemblyReportUri,
      twinUri,
      sceneUri,
      improvementUri,
      iterationUri,
      diff,
      authorityWarnings,
      stages:[
        {name:"preflight",status:rateLimitAvailable?"succeeded":"blocked",artifactUris:[],reason:rateLimitAvailable?undefined:"AutonomyRateLimitExceeded"},
        {name:"research",status:researchPresent?"succeeded":"blocked",artifactUris:resources.map(resource=>resource.uri),reason:researchPresent?undefined:"research evidence missing"},
        {name:"development",status:developmentEvidence.acceptance==="accepted"?"succeeded":"blocked",artifactUris:[intentUri,developmentEvidenceUri],reason:developmentEvidence.acceptance==="accepted"?undefined:`development ${developmentEvidence.acceptance}`},
        {name:"runtime",status:runtimePresent?"succeeded":"blocked",artifactUris:[observationUri,...(twinStateUri?[twinStateUri]:[])],reason:runtimePresent?undefined:"runtime observations missing"},
        {name:"reasoning",status:allowed?"succeeded":"blocked",artifactUris:[mathUri],reason:allowed?undefined:"IterationAllowed=false"},
        {name:"geometry",status:geometryBuildFailures.length?"blocked":"succeeded",artifactUris:geometryMaterializations.flatMap(item=>Object.values(item.receipt.artifacts).map(artifact=>artifact.uri)),reason:geometryBuildFailures[0]},
        {name:"assembly",status:assemblyReport?.ok===false?"blocked":"succeeded",artifactUris:assemblyReportUri?[assemblyReportUri]:[],reason:assemblyReport?.ok===false?"AssemblyValidationFailed":undefined},
        {name:"twin",status:allowed?"succeeded":"blocked",artifactUris:[twinUri]},
        {name:"scene",status:publish?"succeeded":"blocked",artifactUris:[sceneUri],reason:publish?undefined:"ScenePublishAllowed=false"},
        {name:"improvement",status:"succeeded",artifactUris:[improvementUri]},
        {name:"feedback",status:"succeeded",artifactUris:[]},
      ],
      validation:{ok:allowed&&publish,failures},
    };

    const feedback = [
      `# Living project feedback — ${project.name}`,
      `Manager intent: ${project.managerIntent}`,
      `Validation: ${receipt.validation.ok?"passed":"blocked"}`,
      `Development source: ${developmentEvidence.source}`,
      `Development acceptance: ${developmentEvidence.acceptance}`,
      `Runtime observations: ${observation.observations.length}`,
      ...(twinState?[`TwinState bindings: ${twinState.coverage.bindings}; fresh: ${twinState.coverage.fresh}; stale: ${twinState.coverage.stale}; expired: ${twinState.coverage.expired}; unknown: ${twinState.coverage.unknown}`]:[]),
      ...(assemblyReport?[`Assembly completeness: ${assemblyReport.coverage.completeAssemblies}/${assemblyReport.coverage.assemblies}; required parts: ${assemblyReport.coverage.completeRequiredParts}/${assemblyReport.coverage.requiredParts}`]:[]),
      `Archive projects: ${scanned.archiveAnalyses.length}; materializable geometry entries: ${scanned.archiveAnalyses.reduce((sum,item)=>sum+item.coverage.materializableGeometryEntries,0)}; unsupported CAD entries: ${scanned.archiveAnalyses.reduce((sum,item)=>sum+item.coverage.unsupportedCadEntries,0)}`,
      `IntentDSL packs: ${intentDsl.packs}; records: ${intentDsl.records}; invalid: ${intentDsl.invalid}`,
      "",
      "## Proposed improvements",
      ...improvement.actions.map(action=>`- [ ] ${action.title} — ${action.reason}`),
      ...failures.map(failure=>`- BLOCKED: ${failure}`),
    ].join("\n")+"\n";
    const feedbackPath = resolve(base,"feedback/latest.md");
    await mkdir(dirname(feedbackPath),{recursive:true});
    await writeFile(feedbackPath,feedback);
    const feedbackUri = contentUri("feedback",feedback);
    receipt.stages.find(stage=>stage.name==="feedback")!.artifactUris = [feedbackUri];

    // Human entrypoint generated by the running application. It deliberately points to immutable
    // runtime artifacts and the exact commands needed to inspect/restart the dashboard.
    const startPath = resolve(base,"START.md");
    const runtimeRoot = resolve(outDir);
    const latestArtifactRoot = join(runtimeRoot,publish?"current":"candidate");
    const startPathFor = (path:string):string => startDocumentPath(base,path);
    const dashboardCli = await startDocumentCli(base);
    const streamVersion = (await recentIterationCount(outDir,Number.MAX_SAFE_INTEGER)) + 1;
    const start = [
      `# ${project.name} — START`,
      "",
      `Generated: ${new Date().toISOString()}`,
      `Status: ACTIVE / ACCEPTED; LATEST ITERATION / ${receipt.validation.ok ? "ACCEPTED" : "REJECTED"}`,
      `Project: ${project.id}`,
      `Runtime generation: ${RUNTIME_GENERATION}`,
      `Iteration started: ${receipt.startedAt}`,
      `Iteration completed: ${receipt.completedAt}`,
      `Event stream version: ${streamVersion}`,
      "",
      "## Live application",
      "",
      `- Dashboard URL: http://127.0.0.1:${dashboardPort} (start command below)`,
      `- Project DSL: ${startPathFor(configPath)}`,
      `- Runtime root: ${startPathFor(runtimeRoot)}`,
      `- Current Twin: ${startPathFor(join(runtimeRoot,"current/twin.json"))}`,
      ...(twinState?[`- Current TwinState: ${startPathFor(join(runtimeRoot,"current/twin-state.json"))}`]:[]),
      `- Current scene JSON: ${startPathFor(join(runtimeRoot,"current/scene.json"))}`,
      `- Current OpenUSD: ${startPathFor(join(runtimeRoot,"current/scene.usda"))}`,
      `- Rendered ACTIVE artifact scope: ${startPathFor(join(runtimeRoot,"current"))}`,
      `- Latest diagnostic scope: ${startPathFor(latestArtifactRoot)}`,
      `- Iteration artifact scope: ${startPathFor(latestArtifactRoot)}${publish?" (published)":" (rejected candidate; current remains last-known-good)"}`,
      `- API state: http://127.0.0.1:${dashboardPort}/api/state`,
      `- API event log: http://127.0.0.1:${dashboardPort}/api/events`,
      `- API DSL log: http://127.0.0.1:${dashboardPort}/api/dsl`,
      `- Component inspection URL pattern: http://127.0.0.1:${dashboardPort}/?focus=<componentId>`,
      "",
      "```bash",
      `DT_DASHBOARD_HOST=0.0.0.0 DT_DASHBOARD_PORT=${dashboardPort} node ${dashboardCli} dashboard ${startPathFor(configPath)} ${startPathFor(runtimeRoot)} ${dashboardPort} ${mode}`,
      "```",
      "",
      "## DSL and validation",
      "",
      `- intentDSL index: ${startPathFor(join(latestArtifactRoot,"intent-dsl.index.json"))}`,
      `- intentDSL packs: ${intentDsl.packs}; records: ${intentDsl.records}; invalid: ${intentDsl.invalid}`,
      `- Physical evidence report: ${startPathFor(join(latestArtifactRoot,"physical-evidence.report.json"))}`,
      `- Latest geometry build diagnostics: ${startPathFor(join(latestArtifactRoot,"geometry-builds.dsl"))}`,
      `- Geometry build status: ${geometryBuildFailures.length?`FAIL (${geometryBuildFailures.join(", ")})`:`PASS (${geometryMaterializations.length} contract(s))`}`,
      `- Latest geometry validation: ${startPathFor(join(latestArtifactRoot,"geometry-validation.dsl"))}`,
      `- Geometry required checks: ${geometryReport.coverage.passedRequiredChecks??"legacy"}/${geometryReport.coverage.requiredChecks??"legacy"} over ${geometryReport.coverage.bindings} physical/hybrid component(s)`,
      `- Latest project integrity: ${startPathFor(join(latestArtifactRoot,"project-integrity.dsl"))}`,
      `- Evidence sets: ${startPathFor(join(latestArtifactRoot,"evidence-sets.dsl"))}`,
      `- Archive project analysis: ${startPathFor(join(latestArtifactRoot,"archive-project-analysis.dsl"))}`,
      `- Archive materializable geometry: ${scanned.archiveAnalyses.reduce((sum,item)=>sum+item.coverage.materializableGeometryEntries,0)} candidate(s); unsupported native CAD: ${scanned.archiveAnalyses.reduce((sum,item)=>sum+item.coverage.unsupportedCadEntries,0)}`,
      `- Project integrity status: ${projectIntegrity.ok?"PASS":"FAIL"} / ${projectIntegrity.complete?"COMPLETE":"INCOMPLETE"}`,
      `- Validation: ${receipt.validation.ok ? "passed" : receipt.validation.failures.join(", ")}`,
      "",
      "## Logs and feedback",
      "",
      `- Iteration receipt: ${startPathFor(join(runtimeRoot,"latest.json"))}`,
      `- Event log: ${startPathFor(join(runtimeRoot,"events.jsonl"))}`,
      `- Failure log: ${startPathFor(join(runtimeRoot,"dead-letter.jsonl"))}`,
      `- Dashboard server log: ${startPathFor(resolve(base,"logs",`dashboard-${dashboardPort}.log`))}`,
      `- Runtime observations: ${startPathFor(join(latestArtifactRoot,"observations.json"))}`,
      ...(twinState?[`- Live bindings: ${startPathFor(resolve(base,project.observations.liveBindingFile!))}`,`- TwinState: ${startPathFor(join(latestArtifactRoot,"twin-state.json"))}`,`- TwinState freshness: ${twinState.coverage.fresh} fresh; ${twinState.coverage.stale} stale; ${twinState.coverage.expired} expired; ${twinState.coverage.unknown} unknown`]:[]),
      ...(assemblyReport?[`- Assembly contract: ${startPathFor(resolve(base,project.scene.assemblyFile!))}`,`- Assembly report: ${startPathFor(join(latestArtifactRoot,"assembly-report.dsl"))}`,`- Assembly completeness: ${assemblyReport.coverage.completeAssemblies}/${assemblyReport.coverage.assemblies}; required parts ${assemblyReport.coverage.completeRequiredParts}/${assemblyReport.coverage.requiredParts}`]:[]),
      `- Feedback: ${startPathFor(feedbackPath)}`,
      `- Generation audit: ${startPathFor(join(latestArtifactRoot,"generation-audit.json"))}`,
      "",
      "## Presentation assets",
      "",
      `- Dashboard screenshot: ${startPathFor(join(runtimeRoot,"current/presentation/digital-twin-dashboard.png"))}`,
      `- OSCAR pipette inspection: ${startPathFor(join(runtimeRoot,"current/presentation/oscar-pipette-tool-inspection.png"))}`,
      `- MOS3S custom-parts inspection: ${startPathFor(join(runtimeRoot,"current/presentation/bioprinter-mos3s-inspection.png"))}`,
      `- MOS3S custom-parts orbit video: ${startPathFor(join(runtimeRoot,"current/presentation/digital-twin-mos3s-orbit.webm"))}`,
      `- 3D orbit video: ${startPathFor(join(runtimeRoot,"current/presentation/digital-twin-orbit.webm"))}`,
      `- Dashboard recording: ${startPathFor(join(runtimeRoot,"current/presentation/digital-twin-dashboard.webm"))}`,
      "",
      `Previous iteration: ${receipt.previousIterationUri ?? "none"}`,
      `Iteration URI: ${receipt.iterationUri}`,
      "",
    ].join("\n");
    await writeFile(startPath,start,"utf8");

    await writeJson(join(outDir,"state/resources.json"),resources);
    await writeJson(join(outDir,"state/key.json"),{stableKey});
    await writeJson(join(outDir,"receipts",`${iterationId}.json`),receipt);
    await writeJson(join(outDir,"latest.json"),receipt);
    const event:DomainEvent = {
      eventId:randomUUID(),
      streamId:`living-project-${project.id}`,
      streamVersion,
      eventType:"LivingIterationCompleted",
      schemaVersion:"subactor.event/v1",
      occurredAt:receipt.completedAt,
      recordedAt:new Date().toISOString(),
      principal:"service:digital-twin-runtime",
      intentId:intentUri,
      correlationId:iterationId,
      traceId,
      evidenceUris:[intentUri,developmentEvidenceUri,treeUri,mathUri,observationUri,...(twinStateUri?[twinStateUri]:[]),...(assemblyReportUri?[assemblyReportUri]:[]),twinUri,sceneUri,improvementUri],
      payload:{iterationUri,validation:receipt.validation,authorityWarnings},
    };
    await appendJsonLine(join(outDir,"events.jsonl"),event);
    return receipt;
  }

  async recordFailure(configPath:string,outDir:string,error:unknown,consecutiveFailures:number,retryAfterMs:number):Promise<LivingFailureReceipt> {
    let projectId = "unknown-project";
    try { projectId = (await this.load(resolve(configPath))).id; } catch { /* preserve original failure */ }
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = message.split(":",1)[0] || "LIVING_PROJECT_FAILURE";
    const receipt:LivingFailureReceipt = {
      schema:"subactor.living-failure/v1",
      projectId,
      failureId:randomUUID(),
      traceId:randomUUID(),
      occurredAt:new Date().toISOString(),
      configPath:resolve(configPath),
      outputDirectory:resolve(outDir),
      consecutiveFailures,
      errorCode,
      message:message.slice(0,4000),
      retryAfterMs,
    };
    await writeJson(join(outDir,"failures",`${receipt.failureId}.json`),receipt);
    await appendJsonLine(join(outDir,"dead-letter.jsonl"),receipt);
    await appendJsonLine(join(outDir,"events.jsonl"),{
      eventId:randomUUID(),streamId:`living-project-${projectId}`,streamVersion:0,eventType:"LivingIterationFailed",schemaVersion:"subactor.event/v1",occurredAt:receipt.occurredAt,recordedAt:new Date().toISOString(),principal:"service:digital-twin-runtime",correlationId:receipt.failureId,traceId:receipt.traceId,evidenceUris:[],payload:receipt,
    } satisfies DomainEvent);
    return receipt;
  }
}
