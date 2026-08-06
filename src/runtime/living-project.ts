import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DevelopmentEvidenceSummary,
  DomainEvent,
  GenerationAudit,
  ImprovementPlan,
  LivingFailureReceipt,
  LivingIterationReceipt,
  LivingProjectDocument,
  LlmMode,
  MathDocument,
  ObservationDocument,
  ObservationRecord,
  ResourceDiff,
  ResourceRecord,
  SceneDocument,
  SourceRole,
  TreeDocument,
  TreeNode,
  TwinDocument,
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
import { validateScene } from "../dsl/scene.js";
import { validateTwin } from "../dsl/twin.js";
import {
  acquireProjectLease,
  appendJsonLine,
  buildImprovementPlan,
  mergeAuthorityMath,
  mutationGrantPresent,
  recentIterationCount,
  summarizeDevelopment,
  validateSceneGrounding,
  validateTwinGrounding,
} from "./autonomy.js";

async function readJson<T>(path:string):Promise<T> { return JSON.parse(await readFile(path,"utf8")) as T; }
async function readOptional<T>(path:string):Promise<T|undefined> { try { return await readJson<T>(path); } catch { return undefined; } }
async function writeJson(path:string,value:unknown):Promise<void> { await mkdir(dirname(path),{recursive:true}); await writeFile(path,JSON.stringify(value,null,2)+"\n"); }
function sourceSnapshot(resources:ResourceRecord[]):string {
  return sha256(canonicalJson(resources.map(resource=>({uri:resource.uri,path:resource.sourcePath,role:resource.sourceRole,sha256:resource.sha256})).sort((a,b)=>a.path.localeCompare(b.path))));
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
      const subjectUri = typeof row.subjectUri === "string" ? row.subjectUri : `subactor://project/${project.id}/runtime`;
      const severity = ["debug","info","warning","error","critical"].includes(String(row.severity)) ? String(row.severity) as ObservationRecord["severity"] : "info";
      for(const [metric,value] of Object.entries(row)) {
        if(["observedAt","timestamp","subjectUri","severity","labels","unit"].includes(metric)) continue;
        observations.push({id:`obs-${++index}`,observedAt,subjectUri,metric,value:parseObservationValue(value),unit:typeof row.unit === "string"?row.unit:undefined,severity,sourceUris:[resource.uri],labels:Array.isArray(row.labels)?row.labels.filter(item=>typeof item === "string") as string[]:[]});
      }
    }
  }
  return validateObservation({schema:"subactor.observation/v1",id:`${project.id}-observations`,sourceSnapshotHash:snapshot,observations});
}
function reasoning(input:{project:LivingProjectDocument;resources:ResourceRecord[];development:DevelopmentEvidenceSummary;observations:ObservationDocument;grantPresent:boolean;rateLimitAvailable:boolean}):MathDocument {
  const {project,resources,development,observations,grantPresent,rateLimitAvailable} = input;
  const roles = new Set(resources.map(resource=>resource.sourceRole));
  const researchUris = resources.filter(resource=>["manager","customer","project","archive","internet"].includes(String(resource.sourceRole))).map(resource=>resource.uri);
  const managerUris = resources.filter(resource=>resource.sourceRole === "manager").map(resource=>resource.uri);
  const runtimeUris = resources.filter(resource=>resource.sourceRole === "runtime").map(resource=>resource.uri);
  const researchPresent = researchUris.length > 0;
  const developmentPresent = development.source !== "missing" && development.recordCount > 0;
  const developmentAccepted = development.acceptance === "accepted";
  const runtimePresent = observations.observations.length > 0;
  return {
    schema:"subactor.math/v1",
    id:`${project.id}-iteration-gates`,
    bindings:[
      {name:"ManagerApproved",value:project.policy.approved,sourceUris:managerUris},
      {name:"ResearchEvidencePresent",value:researchPresent,sourceUris:researchUris},
      {name:"DevelopmentEvidencePresent",value:developmentPresent,sourceUris:development.evidenceUris},
      {name:"DevelopmentAccepted",value:developmentAccepted,sourceUris:development.evidenceUris},
      {name:"RuntimeEvidencePresent",value:runtimePresent,sourceUris:runtimeUris},
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
      {name:"SourceRoleCount",value:roles.size,unit:"count",sourceUris:resources.map(resource=>resource.uri)},
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
    },
  };
}
function conceptualTwin(project:LivingProjectDocument,resources:ResourceRecord[],observations:ObservationDocument,snapshot:string,development:DevelopmentEvidenceSummary):TwinDocument {
  const roles = [...new Set(resources.map(resource=>resource.sourceRole??"project"))];
  return {
    schema:"subactor.twin/v1",
    id:`${project.id}-twin`,
    kind:project.profile === "biofoundry" ? "physical" : "conceptual",
    observedAt:new Date().toISOString(),
    sourceSnapshotHash:snapshot,
    components:[
      ...roles.map((role,index)=>({id:`${role}-knowledge`,type:"knowledge-domain",sourceUris:resources.filter(resource=>resource.sourceRole===role).map(resource=>resource.uri),properties:{role,index,resourceCount:resources.filter(resource=>resource.sourceRole===role).length},children:[]})),
      {id:"development-model",type:"intent-evidence-graph",sourceUris:development.evidenceUris,properties:{fingerprint:development.graphFingerprint,acceptance:development.acceptance,recordCount:development.recordCount,blockingDiagnosticCount:development.blockingDiagnosticCount},children:[]},
      {id:"runtime-observations",type:"observation-stream",sourceUris:resources.filter(resource=>resource.sourceRole==="runtime").map(resource=>resource.uri),properties:{count:observations.observations.length,metrics:[...new Set(observations.observations.map(observation=>observation.metric))]},children:[]},
    ],
  };
}
function conceptualScene(project:LivingProjectDocument,twin:TwinDocument):SceneDocument {
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

export class LivingProjectRuntime {
  constructor(readonly todo2code=new Todo2CodeAdapter(),readonly compiler=new NlDslCompiler()) {}

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
    const projectConfigHash = sha256(canonicalJson(project));
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
    const developmentFingerprint = sha256(canonicalJson({development,diagnostics:analysis?.diagnostics??[],manifest:analysis?.manifest??{},summary:developmentEvidence}));
    const observation = observationsFromResources(project,resources,scanned.texts,researchHash);
    const observationHash = sha256(canonicalJson(observation));
    const stableKey = sha256(canonicalJson({researchHash,developmentFingerprint,observationHash,projectConfigHash}));
    if(previous && previous.projectConfigHash===projectConfigHash && previous.researchSnapshotHash===researchHash && previous.developmentFingerprint===developmentFingerprint && previous.observationSnapshotHash===observationHash) return {...previous,noChange:true,diff};

    const iterationsLastHour = await recentIterationCount(outDir);
    const rateLimitAvailable = iterationsLastHour < project.policy.maxIterationsPerHour;
    const grantPresent = await mutationGrantPresent(project,base);
    const tree = groupTree(project,resources);
    const authoritativeMath = reasoning({project,resources,development:developmentEvidence,observations:observation,grantPresent,rateLimitAvailable});
    const deterministicTwin = conceptualTwin(project,resources,observation,researchHash,developmentEvidence);
    const deterministicScene = conceptualScene(project,deterministicTwin);
    const context = {project,resources:resources.slice(0,200),development,developmentEvidence,observation,stableKey,iterationsLastHour,grantPresent};
    const effectiveMode:LlmMode = rateLimitAvailable ? mode : "deterministic";

    const mathGeneration = await this.compiler.compile({kind:"math",text:`Evaluate the iteration gates for ${project.managerIntent}`,context,mode:effectiveMode,deterministicValue:{dsl:renderMathDsl(authoritativeMath)}});
    const mergedMath = mergeAuthorityMath(authoritativeMath,mathGeneration.value as MathDocument);
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

    const deterministicSceneForTwin = conceptualScene(project,twin);
    let sceneGeneration = await this.compiler.compile({kind:"scene",text:`Build the current conceptual scene for ${project.name} without inventing geometry.`,context:{...context,math,twin},mode:effectiveMode,deterministicValue:{document:deterministicSceneForTwin}});
    let scene = sceneGeneration.value as SceneDocument;
    try { validateScene(scene); validateSceneGrounding(scene,twin,resources); }
    catch(error) {
      if(mode === "require-llm") throw error;
      authorityWarnings.push(`LLM_SCENE_PROPOSAL_REJECTED:${error instanceof Error?error.message:String(error)}`);
      scene = deterministicSceneForTwin;
      sceneGeneration = {...sceneGeneration,value:scene,audit:fallbackAudit(sceneGeneration.audit,"domain_grounding_failed")};
    }

    const allowed = evaluateMath(math,"IterationAllowed") === true;
    const publish = evaluateMath(math,"ScenePublishAllowed") === true;
    const failures:string[] = [];
    if(!rateLimitAvailable) failures.push("AutonomyRateLimitExceeded");
    if(!allowed) failures.push("IterationAllowed=false");
    if(!publish) failures.push("ScenePublishAllowed=false");
    const researchPresent = resources.some(resource=>["manager","customer","project","archive","internet"].includes(String(resource.sourceRole)));
    const runtimePresent = observation.observations.length > 0;
    const improvement = buildImprovementPlan({project,previousIterationUri:previous?.iterationUri??null,development:developmentEvidence,researchPresent,runtimePresent,mutationGrantPresent:grantPresent,authorityWarnings,failures,evidenceUris:[...resources.map(resource=>resource.uri),intentUri]});

    const candidate = join(outDir,"candidate");
    await writeJson(join(candidate,"project.json"),project);
    await writeJson(join(candidate,"resources.json"),resources);
    await writeJson(join(candidate,"development.intent.json"),development);
    await writeJson(join(candidate,"development.evidence.json"),developmentEvidence);
    await writeJson(join(candidate,"tree.json"),tree);
    await writeJson(join(candidate,"math.json"),math);
    await writeFile(join(candidate,"math.dsl"),renderMathDsl(math));
    await writeJson(join(candidate,"observations.json"),observation);
    await writeFile(join(candidate,"observations.dsl"),renderObservationDsl(observation));
    await writeJson(join(candidate,"twin.json"),twin);
    await writeJson(join(candidate,"scene.json"),scene);
    await writeFile(join(candidate,"scene.usda"),renderOpenUsd(scene,twin));
    await writeJson(join(candidate,"scene.diff.json"),sceneDiff(await readOptional<SceneDocument>(join(outDir,"current/scene.json")),scene));
    await writeJson(join(candidate,"improvement.json"),improvement);
    await writeFile(join(candidate,"improvement.dsl"),renderImprovementDsl(improvement));
    await writeJson(join(candidate,"generation-audit.json"),{math:mathGeneration.audit,twin:twinGeneration.audit,scene:sceneGeneration.audit,authorityWarnings,warnings:scanned.warnings});

    const artifactNames = ["project.json","resources.json","development.intent.json","development.evidence.json","tree.json","math.json","math.dsl","observations.json","observations.dsl","twin.json","scene.json","scene.usda","scene.diff.json","improvement.json","improvement.dsl","generation-audit.json"];
    if(publish) {
      const current = join(outDir,"current");
      await mkdir(current,{recursive:true});
      for(const name of artifactNames) await writeFile(join(current,name),await readFile(join(candidate,name)));
    }

    const developmentEvidenceUri = contentUri("development-evidence",developmentEvidence);
    const treeUri = contentUri("tree",tree);
    const mathUri = contentUri("math",math);
    const observationUri = contentUri("observation",observation);
    const twinUri = contentUri("twin",twin);
    const sceneUri = contentUri("scene",scene);
    const improvementUri = contentUri("improvement",improvement);
    const iterationId = randomUUID();
    const idempotencyKey = sha256(canonicalJson({projectId:project.id,stableKey,previousIterationUri:previous?.iterationUri??null}));
    const iterationCore = {projectId:project.id,iterationId,traceId,idempotencyKey,researchHash,developmentFingerprint,observationHash,intentUri,developmentEvidenceUri,treeUri,mathUri,observationUri,twinUri,sceneUri,improvementUri};
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
      researchSnapshotHash:researchHash,
      developmentFingerprint,
      observationSnapshotHash:observationHash,
      previousIterationUri:previous?.iterationUri??null,
      intentUri,
      developmentEvidenceUri,
      treeUri,
      mathUri,
      observationUri,
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
        {name:"runtime",status:runtimePresent?"succeeded":"blocked",artifactUris:[observationUri],reason:runtimePresent?undefined:"runtime observations missing"},
        {name:"reasoning",status:allowed?"succeeded":"blocked",artifactUris:[mathUri],reason:allowed?undefined:"IterationAllowed=false"},
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

    await writeJson(join(outDir,"state/resources.json"),resources);
    await writeJson(join(outDir,"state/key.json"),{stableKey});
    await writeJson(join(outDir,"receipts",`${iterationId}.json`),receipt);
    await writeJson(join(outDir,"latest.json"),receipt);
    const event:DomainEvent = {
      eventId:randomUUID(),
      streamId:`living-project-${project.id}`,
      streamVersion:(await recentIterationCount(outDir,Number.MAX_SAFE_INTEGER)),
      eventType:"LivingIterationCompleted",
      schemaVersion:"subactor.event/v1",
      occurredAt:receipt.completedAt,
      recordedAt:new Date().toISOString(),
      principal:"service:digital-twin-runtime",
      intentId:intentUri,
      correlationId:iterationId,
      traceId,
      evidenceUris:[intentUri,developmentEvidenceUri,treeUri,mathUri,observationUri,twinUri,sceneUri,improvementUri],
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
