import type { LivingProjectDocument, SourceRole } from "../core/types.js";
import { lines, list, unquote } from "./parser-util.js";

const ROLES:SourceRole[]=['manager','customer','project','internet','archive','derived','runtime','development'];
function bool(raw:string):boolean{if(raw==='true')return true;if(raw==='false')return false;throw new Error(`PROJECT_BOOL_INVALID:${raw}`);}
export function parseProjectDsl(source:string):LivingProjectDocument{
  const xs=lines(source);const header=xs.shift();const m=header?.match(/^PROJECT\s+(\S+)$/i);if(!m)throw new Error('PROJECT_HEADER_REQUIRED');
  const doc:Partial<LivingProjectDocument>={schema:'subactor.living-project/v1',id:m[1],sources:[],development:{root:'code'},observations:{paths:['logs','environment'],logicalRoot:`subactor://project/${m[1]}/runtime`},policy:{environment:'production',approved:false,requireResearch:true,requireDevelopmentEvidence:true,requireDevelopmentAcceptance:true,allowDevelopmentFixture:false,requireRuntimeEvidence:true,autoPublishScene:false,allowRuntimeSelfModification:false,autonomyMode:'propose',requireSignedMutationGrant:true,maxIterationsPerHour:12,maxConsecutiveFailures:5},scene:{format:'openusd'}};
  for(const line of xs){const i=line.indexOf(' ');if(i<0)throw new Error(`PROJECT_KEY_VALUE_REQUIRED:${line}`);const key=line.slice(0,i).toUpperCase(),raw=line.slice(i+1).trim();
    if(key==='NAME')doc.name=unquote(raw);
    else if(key==='PROFILE'){if(!['generic','biofoundry'].includes(raw))throw new Error('PROJECT_PROFILE_INVALID');doc.profile=raw as LivingProjectDocument['profile'];}
    else if(key==='MANAGER_INTENT')doc.managerIntent=unquote(raw);
    else if(key==='SOURCE'){const match=raw.match(/^(\S+)\s+("(?:\\.|[^"])*"|\S+)\s+(\S+)(?:\s+(.*))?$/);if(!match)throw new Error('PROJECT_SOURCE_INVALID');const [,role,pathToken,logicalRoot,labelText='']=match;if(!ROLES.includes(role as SourceRole))throw new Error('PROJECT_SOURCE_INVALID');const path=pathToken.startsWith('"')?JSON.parse(pathToken) as string:pathToken;doc.sources!.push({role:role as SourceRole,path,logicalRoot:unquote(logicalRoot),labels:labelText.split(/\s+/).filter(Boolean)});}
    else if(key==='DEVELOPMENT_ROOT')doc.development!.root=unquote(raw);
    else if(key==='DEVELOPMENT_TASK')doc.development!.task=unquote(raw);
    else if(key==='DEVELOPMENT_TODO')doc.development!.todo=unquote(raw);
    else if(key==='DEVELOPMENT_CHANGELOG')doc.development!.changelog=unquote(raw);
    else if(key==='DEVELOPMENT_DOCS')doc.development!.docs=list(raw);
    else if(key==='DEVELOPMENT_FIXTURE')doc.development!.fixture=unquote(raw);
    else if(key==='OBSERVATION_PATHS')doc.observations!.paths=list(raw);
    else if(key==='OBSERVATION_ROOT')doc.observations!.logicalRoot=unquote(raw);
    else if(key==='LIVE_BINDING_FILE')doc.observations!.liveBindingFile=unquote(raw);
    else if(key==='WEB_DQL')doc.webResearch={dqlFile:unquote(raw)};
    else if(key==='WEB_FIXTURES'){doc.webResearch??={dqlFile:'config/research.dql'};doc.webResearch.fixtureMapFile=unquote(raw);}
    else if(key==='POLICY_ENVIRONMENT'){if(!['development','production'].includes(raw))throw new Error('PROJECT_POLICY_ENVIRONMENT_INVALID');doc.policy!.environment=raw as LivingProjectDocument['policy']['environment'];}
    else if(key==='POLICY_APPROVED')doc.policy!.approved=bool(raw);
    else if(key==='POLICY_REQUIRE_RESEARCH')doc.policy!.requireResearch=bool(raw);
    else if(key==='POLICY_REQUIRE_DEVELOPMENT')doc.policy!.requireDevelopmentEvidence=bool(raw);
    else if(key==='POLICY_REQUIRE_DEVELOPMENT_ACCEPTANCE')doc.policy!.requireDevelopmentAcceptance=bool(raw);
    else if(key==='POLICY_ALLOW_DEVELOPMENT_FIXTURE')doc.policy!.allowDevelopmentFixture=bool(raw);
    else if(key==='POLICY_REQUIRE_RUNTIME')doc.policy!.requireRuntimeEvidence=bool(raw);
    else if(key==='POLICY_AUTO_PUBLISH_SCENE')doc.policy!.autoPublishScene=bool(raw);
    else if(key==='POLICY_ALLOW_RUNTIME_SELF_MODIFICATION')doc.policy!.allowRuntimeSelfModification=bool(raw);
    else if(key==='POLICY_AUTONOMY_MODE'){if(!['observe','propose','apply'].includes(raw))throw new Error('PROJECT_AUTONOMY_MODE_INVALID');doc.policy!.autonomyMode=raw as LivingProjectDocument['policy']['autonomyMode'];}
    else if(key==='POLICY_REQUIRE_SIGNED_MUTATION_GRANT')doc.policy!.requireSignedMutationGrant=bool(raw);
    else if(key==='POLICY_MUTATION_GRANT_FILE')doc.policy!.mutationGrantFile=unquote(raw);
    else if(key==='POLICY_MAX_ITERATIONS_PER_HOUR'){const n=Number(raw);if(!Number.isInteger(n)||n<1||n>3600)throw new Error('PROJECT_ITERATION_LIMIT_INVALID');doc.policy!.maxIterationsPerHour=n;}
    else if(key==='POLICY_MAX_CONSECUTIVE_FAILURES'){const n=Number(raw);if(!Number.isInteger(n)||n<1||n>100)throw new Error('PROJECT_FAILURE_LIMIT_INVALID');doc.policy!.maxConsecutiveFailures=n;}
    else if(key==='SCENE_FORMAT'){if(!['openusd','gltf','3dtiles'].includes(raw))throw new Error('PROJECT_SCENE_FORMAT_INVALID');doc.scene!.format=raw as LivingProjectDocument['scene']['format'];}
    else if(key==='SCENE_BLUEPRINT_FILE')doc.scene!.blueprintFile=unquote(raw);
    else if(key==='SCENE_PHYSICAL_EVIDENCE_FILE')doc.scene!.physicalEvidenceFile=unquote(raw);
    else if(key==='SCENE_GEOMETRY_BUILD_FILES')doc.scene!.geometryBuildFiles=list(raw);
    else if(key==='SCENE_ASSEMBLY_FILE')doc.scene!.assemblyFile=unquote(raw);
    else throw new Error(`PROJECT_UNKNOWN_KEY:${key}`);
  }
  return validateProject(doc);
}
export function renderProjectDsl(doc:LivingProjectDocument):string{
  validateProject(doc);const out=[`PROJECT ${doc.id}`,`NAME ${JSON.stringify(doc.name)}`,`PROFILE ${doc.profile}`,`MANAGER_INTENT ${JSON.stringify(doc.managerIntent)}`];
  for(const s of doc.sources)out.push(`SOURCE ${s.role} ${JSON.stringify(s.path)} ${s.logicalRoot} ${(s.labels??[]).join(' ')}`.trim());
  out.push(`DEVELOPMENT_ROOT ${JSON.stringify(doc.development.root)}`);if(doc.development.task)out.push(`DEVELOPMENT_TASK ${JSON.stringify(doc.development.task)}`);if(doc.development.todo)out.push(`DEVELOPMENT_TODO ${JSON.stringify(doc.development.todo)}`);if(doc.development.changelog)out.push(`DEVELOPMENT_CHANGELOG ${JSON.stringify(doc.development.changelog)}`);if(doc.development.docs)out.push(`DEVELOPMENT_DOCS [${doc.development.docs.map(x=>JSON.stringify(x)).join(',')}]`);if(doc.development.fixture)out.push(`DEVELOPMENT_FIXTURE ${JSON.stringify(doc.development.fixture)}`);
  out.push(`OBSERVATION_PATHS [${doc.observations.paths.map(x=>JSON.stringify(x)).join(',')}]`,`OBSERVATION_ROOT ${doc.observations.logicalRoot}`,...(doc.observations.liveBindingFile?[`LIVE_BINDING_FILE ${JSON.stringify(doc.observations.liveBindingFile)}`]:[]));if(doc.webResearch){out.push(`WEB_DQL ${JSON.stringify(doc.webResearch.dqlFile)}`);if(doc.webResearch.fixtureMapFile)out.push(`WEB_FIXTURES ${JSON.stringify(doc.webResearch.fixtureMapFile)}`);}
  out.push(`POLICY_ENVIRONMENT ${doc.policy.environment??'production'}`,`POLICY_APPROVED ${doc.policy.approved}`,`POLICY_REQUIRE_RESEARCH ${doc.policy.requireResearch}`,`POLICY_REQUIRE_DEVELOPMENT ${doc.policy.requireDevelopmentEvidence}`,`POLICY_REQUIRE_DEVELOPMENT_ACCEPTANCE ${doc.policy.requireDevelopmentAcceptance}`,`POLICY_ALLOW_DEVELOPMENT_FIXTURE ${doc.policy.allowDevelopmentFixture}`,`POLICY_REQUIRE_RUNTIME ${doc.policy.requireRuntimeEvidence}`,`POLICY_AUTO_PUBLISH_SCENE ${doc.policy.autoPublishScene}`,`POLICY_ALLOW_RUNTIME_SELF_MODIFICATION ${doc.policy.allowRuntimeSelfModification}`,`POLICY_AUTONOMY_MODE ${doc.policy.autonomyMode}`,`POLICY_REQUIRE_SIGNED_MUTATION_GRANT ${doc.policy.requireSignedMutationGrant}`,...(doc.policy.mutationGrantFile?[`POLICY_MUTATION_GRANT_FILE ${JSON.stringify(doc.policy.mutationGrantFile)}`]:[]),`POLICY_MAX_ITERATIONS_PER_HOUR ${doc.policy.maxIterationsPerHour}`,`POLICY_MAX_CONSECUTIVE_FAILURES ${doc.policy.maxConsecutiveFailures}`,`SCENE_FORMAT ${doc.scene.format}`,...(doc.scene.blueprintFile?[`SCENE_BLUEPRINT_FILE ${JSON.stringify(doc.scene.blueprintFile)}`]:[]),...(doc.scene.physicalEvidenceFile?[`SCENE_PHYSICAL_EVIDENCE_FILE ${JSON.stringify(doc.scene.physicalEvidenceFile)}`]:[]),...(doc.scene.geometryBuildFiles?.length?[`SCENE_GEOMETRY_BUILD_FILES [${doc.scene.geometryBuildFiles.map(x=>JSON.stringify(x)).join(',')}]`]:[]),...(doc.scene.assemblyFile?[`SCENE_ASSEMBLY_FILE ${JSON.stringify(doc.scene.assemblyFile)}`]:[]));return out.join('\n')+'\n';
}
export function validateProject(value:unknown):LivingProjectDocument{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('PROJECT_DOCUMENT_REQUIRED');const d=value as Record<string,unknown>;
  const allowed=['schema','id','name','profile','managerIntent','sources','development','observations','webResearch','policy','scene'];for(const k of Object.keys(d))if(!allowed.includes(k))throw new Error(`PROJECT_UNKNOWN_KEY:${k}`);
  if(d.schema!=='subactor.living-project/v1'||typeof d.id!=='string'||!/^[a-z0-9][a-z0-9-]{1,62}$/.test(d.id)||typeof d.name!=='string'||!['generic','biofoundry'].includes(String(d.profile))||typeof d.managerIntent!=='string'||!Array.isArray(d.sources)||d.sources.length===0)throw new Error('PROJECT_DOCUMENT_INVALID');
  for(const raw of d.sources){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('PROJECT_SOURCE_INVALID');const s=raw as Record<string,unknown>;if(typeof s.path!=='string'||!ROLES.includes(s.role as SourceRole)||typeof s.logicalRoot!=='string'||(s.labels!==undefined&&(!Array.isArray(s.labels)||!s.labels.every(x=>typeof x==='string'))))throw new Error('PROJECT_SOURCE_INVALID');}
  const dev=d.development as Record<string,unknown>;if(!dev||typeof dev.root!=='string')throw new Error('PROJECT_DEVELOPMENT_INVALID');const obs=d.observations as Record<string,unknown>;if(!obs||!Array.isArray(obs.paths)||!obs.paths.every(x=>typeof x==='string')||typeof obs.logicalRoot!=='string'||(obs.liveBindingFile!==undefined&&typeof obs.liveBindingFile!=='string'))throw new Error('PROJECT_OBSERVATIONS_INVALID');const policy=d.policy as Record<string,unknown>;if(!policy||(policy.environment!==undefined&&!['development','production'].includes(String(policy.environment)))||typeof policy.approved!=='boolean'||typeof policy.requireResearch!=='boolean'||typeof policy.requireDevelopmentEvidence!=='boolean'||typeof policy.requireDevelopmentAcceptance!=='boolean'||typeof policy.allowDevelopmentFixture!=='boolean'||typeof policy.requireRuntimeEvidence!=='boolean'||typeof policy.autoPublishScene!=='boolean'||typeof policy.allowRuntimeSelfModification!=='boolean'||!['observe','propose','apply'].includes(String(policy.autonomyMode))||typeof policy.requireSignedMutationGrant!=='boolean'||(policy.mutationGrantFile!==undefined&&typeof policy.mutationGrantFile!=='string')||!Number.isInteger(policy.maxIterationsPerHour)||!Number.isInteger(policy.maxConsecutiveFailures))throw new Error('PROJECT_POLICY_INVALID');const scene=d.scene as Record<string,unknown>;if(!scene||!['openusd','gltf','3dtiles'].includes(String(scene.format))||(scene.blueprintFile!==undefined&&typeof scene.blueprintFile!=='string')||(scene.physicalEvidenceFile!==undefined&&typeof scene.physicalEvidenceFile!=='string')||(scene.assemblyFile!==undefined&&typeof scene.assemblyFile!=='string')||(scene.geometryBuildFiles!==undefined&&(!Array.isArray(scene.geometryBuildFiles)||!scene.geometryBuildFiles.every(x=>typeof x==='string'&&x.length>0))))throw new Error('PROJECT_SCENE_INVALID');return value as LivingProjectDocument;
}
