import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DevelopmentEvidenceSummary,
  ImprovementAction,
  ImprovementPlan,
  LivingIterationReceipt,
  LivingProjectDocument,
  MathDocument,
  ResourceRecord,
  SceneDocument,
  TwinComponent,
  TwinDocument,
} from "../core/types.js";
import { canonicalJson, contentUri, sha256 } from "../core/canonical.js";
import { validateImprovement } from "../dsl/improvement.js";

export interface DevelopmentAnalysisInput {
  source:"todo2code"|"fixture"|"missing";
  graph:unknown;
  diagnostics?:unknown;
  manifest?:unknown;
  evidenceUris:string[];
  fixtureAllowed:boolean;
}

function object(value:unknown):Record<string,unknown>|undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}
function array(value:unknown):unknown[] { return Array.isArray(value) ? value : []; }
function diagnosticSeverity(value:unknown):string {
  const item = object(value);
  return String(item?.severity ?? item?.level ?? item?.classification ?? "").toLowerCase();
}
function manifestStatus(value:unknown):string|null {
  const item = object(value);
  const status = item?.status;
  return typeof status === "string" ? status : null;
}

export function summarizeDevelopment(input:DevelopmentAnalysisInput):DevelopmentEvidenceSummary {
  const graphObject = object(input.graph);
  const records = graphObject ? array(graphObject.records) : Array.isArray(input.graph) ? input.graph : [];
  const relations = graphObject ? array(graphObject.relations) : [];
  const diagnostics = Array.isArray(input.diagnostics)
    ? input.diagnostics
    : array(object(input.diagnostics)?.diagnostics ?? object(input.diagnostics)?.items);
  const blocking = diagnostics.filter(item=>["blocking","critical","error"].includes(diagnosticSeverity(item))).length;
  const status = manifestStatus(input.manifest);
  let acceptance:DevelopmentEvidenceSummary["acceptance"] = "unknown";
  if(input.source === "missing") acceptance = "rejected";
  else if(input.source === "fixture") acceptance = input.fixtureAllowed ? "accepted" : "review_required";
  else if(status === "failed" || blocking > 0) acceptance = "rejected";
  else if(records.length > 0 && [null,"succeeded","completed","degraded"].includes(status)) acceptance = "accepted";
  else acceptance = "review_required";
  const declaredFingerprint = graphObject?.fingerprint ?? graphObject?.graphFingerprint;
  const graphFingerprint = typeof declaredFingerprint === "string" && declaredFingerprint.length > 0
    ? declaredFingerprint
    : sha256(canonicalJson(input.graph));
  return {
    schema:"subactor.development-evidence/v1",
    source:input.source,
    graphFingerprint,
    recordCount:records.length,
    relationCount:relations.length,
    diagnosticCount:diagnostics.length,
    blockingDiagnosticCount:blocking,
    acceptance,
    manifestStatus:status,
    evidenceUris:[...new Set(input.evidenceUris)],
  };
}

const AUTHORITY_BINDINGS = new Set([
  "ManagerApproved","ResearchEvidencePresent","DevelopmentEvidencePresent","DevelopmentAccepted","RuntimeEvidencePresent",
  "RequireResearch","RequireDevelopment","RequireDevelopmentAcceptance","RequireRuntime","AutoPublishScene",
  "AllowRuntimeSelfModification","AutonomyModeApply","RequireSignedMutationGrant","SignedMutationGrantPresent","RateLimitAvailable","SourceRoleCount",
]);
const AUTHORITY_EXPRESSIONS = new Set([
  "ResearchGate","DevelopmentGate","RuntimeGate","MutationGrantGate","IterationAllowed","ScenePublishAllowed","RuntimeSelfModificationAllowed",
]);

export function mergeAuthorityMath(authoritative:MathDocument,proposal:MathDocument):{document:MathDocument;warnings:string[]} {
  const proposalBindings = new Map(proposal.bindings.map(binding=>[binding.name,binding]));
  for(const name of AUTHORITY_BINDINGS) {
    if(proposalBindings.has(name)) throw new Error(`SEMANTIC_MATH_AUTHORITY_FIELD_FORBIDDEN:${name}`);
  }
  for(const name of AUTHORITY_EXPRESSIONS) {
    if(proposal.expressions[name]) throw new Error(`SEMANTIC_MATH_AUTHORITY_FIELD_FORBIDDEN:${name}`);
  }
  return {
    document:{
      schema:"subactor.math/v1",
      id:authoritative.id,
      bindings:[...authoritative.bindings,...proposal.bindings],
      expressions:{...authoritative.expressions,...proposal.expressions},
    },
    warnings:[],
  };
}

/** LLM-visible semantic projection. Authority bindings and gates never enter its output space. */
export function semanticMathProjection(authoritative:MathDocument):MathDocument {
  return {
    schema:"subactor.math/v1",
    id:`${authoritative.id}-semantic`,
    bindings:authoritative.bindings.filter(binding=>!AUTHORITY_BINDINGS.has(binding.name)),
    expressions:Object.fromEntries(Object.entries(authoritative.expressions).filter(([name])=>!AUTHORITY_EXPRESSIONS.has(name))),
  };
}

function flattenComponents(components:TwinComponent[]):TwinComponent[] {
  return components.flatMap(component=>[component,...flattenComponents(component.children)]);
}
export function validateTwinGrounding(document:TwinDocument,authoritative:TwinDocument,resources:ResourceRecord[]):void {
  if(document.sourceSnapshotHash !== authoritative.sourceSnapshotHash) throw new Error("TWIN_SOURCE_SNAPSHOT_OVERRIDE");
  const allowedUris = new Set([...resources.map(resource=>resource.uri),...flattenComponents(authoritative.components).flatMap(component=>component.sourceUris)]);
  const ids = new Set<string>();
  for(const component of flattenComponents(document.components)) {
    if(ids.has(component.id)) throw new Error(`TWIN_COMPONENT_DUPLICATE:${component.id}`);
    ids.add(component.id);
    for(const uri of component.sourceUris) if(!allowedUris.has(uri)) throw new Error(`TWIN_SOURCE_URI_NOT_GROUNDED:${uri}`);
  }
}
export function validateSceneGrounding(document:SceneDocument,twin:TwinDocument,resources:ResourceRecord[]):void {
  if(document.sourceTwinId !== twin.id) throw new Error("SCENE_SOURCE_TWIN_MISMATCH");
  const components = new Set(flattenComponents(twin.components).map(component=>component.id));
  const allowedAssets = new Set(resources.map(resource=>resource.uri));
  const expectedTwinUri = contentUri("twin",twin);
  const paths = new Set<string>();
  for(const binding of document.bindings) {
    if(binding.componentId && !components.has(binding.componentId)) throw new Error(`SCENE_COMPONENT_NOT_FOUND:${binding.componentId}`);
    if(!binding.twinUri.startsWith(expectedTwinUri)) throw new Error(`SCENE_TWIN_URI_NOT_GROUNDED:${binding.twinUri}`);
    if(binding.assetUri && !allowedAssets.has(binding.assetUri)) throw new Error(`SCENE_ASSET_NOT_GROUNDED:${binding.assetUri}`);
    if(paths.has(binding.scenePath)) throw new Error(`SCENE_PATH_DUPLICATE:${binding.scenePath}`);
    paths.add(binding.scenePath);
  }
}

export function buildImprovementPlan(input:{
  project:LivingProjectDocument;
  previousIterationUri:string|null;
  development:DevelopmentEvidenceSummary;
  researchPresent:boolean;
  runtimePresent:boolean;
  mutationGrantPresent:boolean;
  authorityWarnings:string[];
  failures:string[];
  evidenceUris:string[];
}):ImprovementPlan {
  const actions:ImprovementAction[] = [];
  const add = (kind:ImprovementAction["kind"],title:string,reason:string,targetUris:string[],approvalRequired:boolean)=>{
    actions.push({id:`action-${actions.length+1}`,kind,title,reason,targetUris:[...new Set(targetUris)],approvalRequired,status:"proposed"});
  };
  if(!input.researchPresent) add("research","Collect research evidence","The research gate has no manager, customer, project, archive or internet evidence.",[`subactor://project/${input.project.id}/research`],false);
  if(input.development.source === "missing") add("development","Run todo2code pipeline","No Intent Evidence graph was produced for the development workspace.",[`subactor://project/${input.project.id}/development`],false);
  else if(input.development.acceptance !== "accepted") add("validation","Resolve development diagnostics","Development evidence is not accepted by the deterministic acceptance gate.",input.development.evidenceUris,true);
  if(!input.runtimePresent) add("runtime","Connect runtime observations","No addressable runtime or environmental observations were found.",[`subactor://project/${input.project.id}/runtime`],false);
  if(!input.project.policy.approved) add("policy","Request manager approval","The project policy is not approved.",[`subactor://project/${input.project.id}/manager`],true);
  if(input.project.policy.allowRuntimeSelfModification && input.project.policy.requireSignedMutationGrant && !input.mutationGrantPresent) add("policy","Obtain signed mutation grant","Runtime self-modification was requested but no signed mutation grant is available.",[`subactor://project/${input.project.id}/policy/mutation-grant`],true);
  for(const warning of input.authorityWarnings) add("validation","Review rejected LLM authority override",warning,[`subactor://project/${input.project.id}/math/authority`],true);
  for(const failure of input.failures) add("validation","Resolve blocked iteration",failure,[`subactor://project/${input.project.id}/iteration`],true);
  if(actions.length === 0) add("validation","Maintain continuous verification","All current gates pass; rerun on the next source, code or runtime change.",input.evidenceUris,false);
  return validateImprovement({
    schema:"subactor.improvement-plan/v1",
    id:`${input.project.id}-improvement-${sha256(canonicalJson(actions)).slice(0,16)}`,
    projectId:input.project.id,
    mode:"propose_only",
    generatedAt:new Date().toISOString(),
    sourceIterationUri:input.previousIterationUri,
    evidenceUris:[...new Set(input.evidenceUris)],
    actions,
  });
}

/**
 * True only when a cryptographically valid, non-expired mutation grant exists
 * for this project. Placeholder signatures without HMAC secret verification
 * fail closed (see mutation-grant.ts; ported from subactor/runtime apply-grant).
 */
export async function mutationGrantPresent(project:LivingProjectDocument,base:string):Promise<boolean> {
  if(!project.policy.mutationGrantFile) return false;
  const { loadAndVerifyMutationGrant } = await import("./mutation-grant.js");
  const verified = await loadAndVerifyMutationGrant(project,base);
  return verified.ok;
}

export async function recentIterationCount(outDir:string,withinMs=3_600_000):Promise<number> {
  const directory = join(outDir,"receipts");
  let entries:string[];
  try { entries = await readdir(directory); }
  catch { return 0; }
  const threshold = Date.now()-withinMs;
  let count = 0;
  for(const entry of entries.filter(name=>name.endsWith(".json"))) {
    try {
      const receipt = JSON.parse(await readFile(join(directory,entry),"utf8")) as Partial<LivingIterationReceipt>;
      if(receipt.noChange) continue;
      if(typeof receipt.completedAt === "string" && Date.parse(receipt.completedAt) >= threshold) count++;
    } catch { /* ignore corrupt historical receipt and surface via verifier */ }
  }
  return count;
}

export interface ProjectLease { leaseId:string; release:()=>Promise<void>; }
export async function acquireProjectLease(outDir:string,projectId:string,staleAfterMs=300_000):Promise<ProjectLease> {
  const leaseDirectory = join(outDir,".iteration-lease");
  const acquire = async():Promise<ProjectLease>=>{
    try {
      await mkdir(leaseDirectory,{recursive:false});
    } catch(error) {
      const code = (error as NodeJS.ErrnoException).code;
      if(code !== "EEXIST") throw error;
      let stale = false;
      try { stale = Date.now()-(await stat(leaseDirectory)).mtimeMs > staleAfterMs; }
      catch { stale = true; }
      if(!stale) throw new Error("LIVING_PROJECT_LEASE_HELD");
      await rm(leaseDirectory,{recursive:true,force:true});
      return acquire();
    }
    const leaseId = randomUUID();
    await writeFile(join(leaseDirectory,"lease.json"),JSON.stringify({schema:"subactor.iteration-lease/v1",leaseId,projectId,pid:process.pid,startedAt:new Date().toISOString()},null,2)+"\n");
    return {leaseId,release:async()=>{await rm(leaseDirectory,{recursive:true,force:true});}};
  };
  await mkdir(dirname(leaseDirectory),{recursive:true});
  return acquire();
}

export async function appendJsonLine(path:string,value:unknown):Promise<void> {
  await mkdir(dirname(path),{recursive:true});
  const handle = await open(path,"a",0o600);
  try { await handle.writeFile(JSON.stringify(value)+"\n"); }
  finally { await handle.close(); }
}
