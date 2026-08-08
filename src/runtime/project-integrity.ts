import type {
  DevelopmentEvidenceSummary,
  GenerationAudit,
  GeometryBuildReceipt,
  GeometryValidationReport,
  LivingProjectDocument,
  ObservationDocument,
  PhysicalEvidenceDocument,
  ProjectDependencyCheck,
  ProjectIntegrityCategory,
  ProjectIntegrityFinding,
  ProjectIntegrityLayer,
  ProjectIntegrityReport,
  ResourceRecord,
  SceneDocument,
  TwinComponent,
  TwinDocument,
} from "../core/types.js";

export interface ProjectIntegrityInput {
  project: LivingProjectDocument;
  resources: ResourceRecord[];
  development: DevelopmentEvidenceSummary;
  observations: ObservationDocument;
  twin: TwinDocument;
  scene: SceneDocument;
  geometry: GeometryValidationReport;
  physicalEvidence?: PhysicalEvidenceDocument;
  generationAudits?: GenerationAudit[];
  geometryBuildReceipts?: GeometryBuildReceipt[];
}

const LAYERS: ProjectIntegrityLayer[] = ["requirements","research","design","development","runtime","twin","scene","validation"];
const repair = (name:string):string => `subactor://process/repair/project-integrity/${name}`;
const finite = (value:unknown):value is number => typeof value === "number" && Number.isFinite(value);
const flatten = (components:TwinComponent[]):TwinComponent[] => components.flatMap(component=>[component,...flatten(component.children)]);

export function analyzeProjectIntegrity(input:ProjectIntegrityInput):ProjectIntegrityReport {
  const findings:ProjectIntegrityFinding[]=[];
  const add=(code:string,severity:ProjectIntegrityFinding["severity"],category:ProjectIntegrityCategory,layer:ProjectIntegrityLayer,message:string,subjects:string[],evidenceUris:string[],repairName:string):void=>{
    const repairProcess=repairName.startsWith("subactor://")?repairName:repair(repairName);
    findings.push({code,severity,category,layer,message,subjects:[...new Set(subjects)],evidenceUris:[...new Set(evidenceUris)],repairProcess});
  };
  const components=flatten(input.twin.components);
  const componentIds=new Set(components.map(component=>component.id));
  const research=input.resources.filter(resource=>["manager","customer","project","internet","archive"].includes(String(resource.sourceRole)));
  const manager=input.resources.filter(resource=>resource.sourceRole==="manager");
  const parameterChecks:{ok:boolean}[]=[];
  const parameter=(ok:boolean,code:string,layer:ProjectIntegrityLayer,message:string,subject:string):void=>{
    parameterChecks.push({ok});
    if(!ok) add(code,"error","invalid-parameter",layer,message,[subject],[],"correct-parameters");
  };

  parameter(input.project.managerIntent.trim().length>0,"MANAGER_INTENT_EMPTY","requirements","Manager intent must not be empty.",input.project.id);
  parameter(Number.isInteger(input.project.policy.maxIterationsPerHour)&&input.project.policy.maxIterationsPerHour>0,"ITERATION_LIMIT_INVALID","requirements","maxIterationsPerHour must be a positive integer.","policy.maxIterationsPerHour");
  parameter(Number.isInteger(input.project.policy.maxConsecutiveFailures)&&input.project.policy.maxConsecutiveFailures>0,"FAILURE_LIMIT_INVALID","requirements","maxConsecutiveFailures must be a positive integer.","policy.maxConsecutiveFailures");

  const duplicatePaths=input.scene.bindings.map(binding=>binding.scenePath).filter((path,index,all)=>all.indexOf(path)!==index);
  if(duplicatePaths.length) add("SCENE_PATH_DUPLICATE","error","inconsistency","scene","Scene paths must be unique.",duplicatePaths,[],"repair-scene-bindings");
  const unknown=input.scene.bindings.filter(binding=>binding.componentId&&!componentIds.has(binding.componentId)).map(binding=>binding.componentId!);
  if(unknown.length) add("SCENE_COMPONENT_UNKNOWN","error","broken-dependency","scene","Scene bindings reference components absent from the Twin.",unknown,[],"repair-scene-bindings");
  const expectedTwin=input.twin.id;
  if(input.scene.sourceTwinId!==expectedTwin) add("SCENE_TWIN_REVISION_MISMATCH","error","broken-dependency","scene","Scene sourceTwinId does not match the current Twin revision.",[String(input.scene.sourceTwinId??"missing"),expectedTwin],[],"regenerate-scene");

  for(const binding of input.scene.bindings) {
    if(binding.position) for(let i=0;i<3;i++) parameter(finite(binding.position[i]),"SCENE_POSITION_INVALID","scene","Position values must be finite numbers.",`${binding.scenePath}.position[${i}]`);
    if(binding.size) for(let i=0;i<3;i++) parameter(finite(binding.size[i])&&binding.size[i]>0,"SCENE_SIZE_INVALID","scene","Size values must be finite and greater than zero.",`${binding.scenePath}.size[${i}]`);
    if(binding.orientation) {
      const norm=Math.hypot(...binding.orientation);
      parameter(binding.orientation.every(finite)&&Math.abs(norm-1)<=1e-6,"SCENE_ORIENTATION_INVALID","scene","Orientation must be a normalized [x,y,z,w] quaternion.",`${binding.scenePath}.orientation`);
    }
  }

  const unsupported=components.filter(component=>component.sourceUris.length===0).map(component=>component.id);
  if(unsupported.length) add("TWIN_COMPONENT_UNGROUNDED","warning","missing-evidence","twin",`${unsupported.length} Twin component(s) have no source URI.`,unsupported,[],"ground-twin-components");
  const physicalIds=new Set(components.filter(component=>["physical","hybrid"].includes(String(component.properties.spatialClass??"physical"))).map(component=>component.id));
  const placeholders=input.scene.bindings.filter(binding=>Boolean(binding.componentId&&physicalIds.has(binding.componentId))&&!binding.assetUri&&binding.primitive&&binding.primitive!=="scope").map(binding=>binding.componentId??binding.scenePath);
  if(placeholders.length) add("CONCEPTUAL_GEOMETRY_ASSUMPTION","warning","ungrounded-assumption","design",`${placeholders.length} rendered object(s) still use conceptual primitive geometry.`,placeholders,[],"replace-conceptual-geometry");
  const unreferencedEvidence=(input.physicalEvidence?.records??[]).filter(record=>!record.sourceRef).map(record=>record.componentId);
  if(unreferencedEvidence.length) add("PHYSICAL_SOURCE_REFERENCE_MISSING","warning","missing-evidence","validation","Physical evidence must identify its survey, drawing, register row or model object.",unreferencedEvidence,[],"ground-physical-evidence");
  if(!input.geometry.complete) add("GEOMETRY_VALIDATION_INCOMPLETE","warning","missing-evidence","validation","Geometry checks pass only for the supplied subset; pose and spatial evidence is incomplete.",[input.geometry.evidenceId],[],"complete-geometry-evidence");
  if(!input.geometry.ok) add("GEOMETRY_VALIDATION_FAILED","error","inconsistency","validation","At least one deterministic geometry constraint failed.",input.geometry.failures,[],"repair-geometry");
  for(const receipt of input.geometryBuildReceipts??[]) {
    if(receipt.status==="succeeded"&&receipt.validation.ok) continue;
    const code=receipt.validation.failures[0]
      ?? receipt.error?.code.split(":").at(-1)?.replaceAll("-","_").toUpperCase()
      ?? "GEOMETRY_BUILD_FAILED";
    const artifactUris=Object.values(receipt.artifacts).map(artifact=>artifact.uri);
    add(
      code,"error","inconsistency","validation",
      receipt.error?.message??`Geometry build ${receipt.id} failed deterministic validation.`,
      [receipt.target.componentId,receipt.id],
      [receipt.source.uri,...artifactUris],
      receipt.repairProcess??"reconcile-geometry-build",
    );
  }
  if(input.development.acceptance!=="accepted") add("DEVELOPMENT_EVIDENCE_NOT_ACCEPTED",input.project.policy.requireDevelopmentAcceptance?"error":"warning","missing-evidence","development",`Development evidence acceptance is ${input.development.acceptance}.`,input.development.evidenceUris,input.development.evidenceUris,"repair-development-evidence");
  if(input.project.policy.requireRuntimeEvidence&&input.observations.observations.length===0) add("RUNTIME_EVIDENCE_MISSING","error","missing-evidence","runtime","Runtime evidence is required but no observations were found.",[],[],"connect-runtime-evidence");
  const degraded=(input.generationAudits??[]).filter(audit=>audit.degraded);
  if(degraded.length) add("GENERATION_FALLBACK_USED","warning","ungrounded-assumption","design",`${degraded.length} generation stage(s) used a fallback.`,degraded.map(audit=>audit.reason??"unspecified"),[],"review-generation-fallback");

  const layerEvidence:Record<ProjectIntegrityLayer,number>={
    requirements:(input.project.managerIntent.trim()?1:0)+manager.length,
    research:research.length,
    design:input.scene.bindings.length,
    development:input.development.recordCount,
    runtime:input.observations.observations.length,
    twin:components.length,
    scene:input.scene.bindings.length,
    validation:input.geometry.checks.length,
  };
  const layers=LAYERS.map(layer=>({layer,evidenced:layerEvidence[layer]>0,evidenceCount:layerEvidence[layer]}));
  for(const item of layers.filter(item=>!item.evidenced)) add(`LAYER_${item.layer.toUpperCase()}_UNEVIDENCED`,"warning","missing-evidence",item.layer,`Layer ${item.layer} has no addressable evidence.`,[item.layer],[],`evidence-${item.layer}`);

  const sourcedComponents=components.filter(component=>component.sourceUris.length>0).length;
  const boundComponents=new Set(input.scene.bindings.map(binding=>binding.componentId).filter(Boolean)).size;
  const dependencies:ProjectDependencyCheck[]=[
    {id:"requirements-to-design",from:"requirements",to:"design",ok:Boolean(input.project.managerIntent.trim()&&components.length),complete:manager.length>0,message:"Manager intent is projected into an addressable design."},
    {id:"research-to-twin",from:"research",to:"twin",ok:research.length>0&&components.length>0,complete:components.length>0&&sourcedComponents===components.length,message:`${sourcedComponents}/${components.length} Twin components carry source evidence.`},
    {id:"development-to-twin",from:"development",to:"twin",ok:input.development.source!=="missing",complete:input.development.acceptance==="accepted",message:`Development evidence is ${input.development.acceptance}.`},
    {id:"runtime-to-twin",from:"runtime",to:"twin",ok:!input.project.policy.requireRuntimeEvidence||input.observations.observations.length>0,complete:input.observations.observations.length>0,message:`${input.observations.observations.length} runtime observation(s) available.`},
    {id:"twin-to-scene",from:"twin",to:"scene",ok:unknown.length===0&&input.scene.sourceTwinId===input.twin.id,complete:components.length>0&&boundComponents===components.length,message:`${boundComponents}/${components.length} Twin components are bound into the scene.`},
    {id:"scene-to-validation",from:"scene",to:"validation",ok:input.geometry.ok,complete:input.geometry.complete,message:`Geometry validation is ${input.geometry.ok?"passing":"failing"} and ${input.geometry.complete?"complete":"incomplete"}.`},
  ];
  for(const dependency of dependencies.filter(item=>!item.ok)) add(`DEPENDENCY_${dependency.id.toUpperCase().replaceAll("-","_")}_BROKEN`,"error","broken-dependency",dependency.to,dependency.message,[dependency.id],[],`repair-${dependency.id}`);

  const assumptions=placeholders.length+degraded.length;
  const errors=findings.filter(finding=>finding.severity==="error").length;
  const evidencedLayers=layers.filter(layer=>layer.evidenced).length;
  const validatedDependencies=dependencies.filter(dependency=>dependency.ok&&dependency.complete).length;
  const complete=errors===0&&evidencedLayers===layers.length&&validatedDependencies===dependencies.length&&assumptions===0&&findings.every(finding=>finding.category!=="missing-evidence");
  const processMap=new Map<string,string[]>();
  for(const finding of findings) processMap.set(finding.repairProcess,[...(processMap.get(finding.repairProcess)??[]),finding.code]);
  return {
    schema:"subactor.project-integrity/v1",projectId:input.project.id,method:"deterministic-cross-layer",ok:errors===0,complete,
    coverage:{layers:layers.length,evidencedLayers,dependencies:dependencies.length,validatedDependencies,parameters:parameterChecks.length,validParameters:parameterChecks.filter(check=>check.ok).length,assumptions,groundedAssumptions:0},
    layers,dependencies,findings,repairProcesses:[...processMap].map(([uri,codes])=>({uri,findingCodes:[...new Set(codes)]})),
  };
}

export function renderProjectIntegrityDsl(report:ProjectIntegrityReport):string {
  const quote=(value:string)=>JSON.stringify(value);
  const lines=["```projectintegritydsl",`PROJECT_INTEGRITY ${report.projectId}`,`METHOD ${report.method}`,`COVERAGE LAYERS ${report.coverage.evidencedLayers}/${report.coverage.layers} DEPENDENCIES ${report.coverage.validatedDependencies}/${report.coverage.dependencies} PARAMETERS ${report.coverage.validParameters}/${report.coverage.parameters} ASSUMPTIONS ${report.coverage.groundedAssumptions}/${report.coverage.assumptions}`,`COMPLETENESS ${report.complete?"COMPLETE":"INCOMPLETE"}`];
  for(const layer of report.layers) lines.push(`LAYER ${layer.layer} EVIDENCE ${layer.evidenceCount} RESULT ${layer.evidenced?"PASS":"MISSING"}`);
  for(const dependency of report.dependencies) lines.push(`DEPENDENCY ${dependency.id} FROM ${dependency.from} TO ${dependency.to} RESULT ${dependency.ok?"PASS":"FAIL"} COMPLETENESS ${dependency.complete?"COMPLETE":"INCOMPLETE"} MESSAGE ${quote(dependency.message)}`);
  for(const finding of report.findings) lines.push(`FINDING ${finding.code} SEVERITY ${finding.severity.toUpperCase()} CATEGORY ${finding.category} LAYER ${finding.layer}`,`  SUBJECTS [${finding.subjects.map(quote).join(", ")}]`,`  EVIDENCE [${finding.evidenceUris.map(quote).join(", ")}]`,`  REPAIR ${finding.repairProcess}`,`  MESSAGE ${quote(finding.message)}`,"END_FINDING");
  lines.push(`RESULT ${report.ok?"PASS":"FAIL"}`,"END_PROJECT_INTEGRITY","```");
  return lines.join("\n")+"\n";
}
