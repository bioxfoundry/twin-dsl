import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { LlmMode, MathDocument, ResourceDiff, ResourceRecord, SceneDocument, SourceRole, TreeDocument, TreeNode, TwinBuildReceipt, TwinDocument } from "../core/types.js";
import { canonicalJson, contentUri, sha256 } from "../core/canonical.js";
import { scanSources, type ScanSource } from "../ingestion/scanner.js";
import { NlDslCompiler } from "../llm/nl-dsl-compiler.js";
import { parseDql } from "../dsl/dql.js";
import { DqlCrawler, type FetchLike } from "../research/crawler.js";
import { renderMathDsl, evaluateMath } from "../dsl/math.js";
import { validateTwin } from "../dsl/twin.js";
import { validateScene } from "../dsl/scene.js";
import { renderOpenUsd, sceneDiff } from "../scene/openusd.js";

export interface BiofoundryConfig {
  schema:"subactor.biofoundry-config/v1";
  id:string;
  managerRequest:string;
  sources:Array<{path:string;role:SourceRole;logicalRoot:string;labels?:string[]}>;
  policyFile:string;
  customerSpecFile:string;
  projectStateFile:string;
  webResearch?:{dqlFile:string;fixtureMapFile?:string};
}
interface ManagerPolicy { approved:boolean; maxActiveBioreactors:number; minWalkwayMeters:number; requireCleanDirtySeparation:boolean; }
interface EquipmentSpec { id:string;type:string;position:[number,number,number];size:[number,number,number];capacityLiters?:number;zone:"clean"|"dirty"|"neutral"; }
interface CustomerSpec { equipment:EquipmentSpec[]; }
interface ProjectState { activeBioreactors:number;equipment:Record<string,{status:string;temperatureC?:number;rpm?:number}>; }

async function jsonFile<T>(path:string):Promise<T>{return JSON.parse(await readFile(path,'utf8')) as T;}
function snapshot(resources:ResourceRecord[]):string{return sha256(resources.map(x=>({uri:x.uri,role:x.sourceRole,path:x.sourcePath})).sort((a,b)=>a.path.localeCompare(b.path)));}
function diff(previous:ResourceRecord[],current:ResourceRecord[]):ResourceDiff{const a=new Map(previous.map(x=>[x.sourcePath,x.sha256])),b=new Map(current.map(x=>[x.sourcePath,x.sha256]));return{added:[...b.keys()].filter(k=>!a.has(k)),changed:[...b.keys()].filter(k=>a.has(k)&&a.get(k)!==b.get(k)),removed:[...a.keys()].filter(k=>!b.has(k)),unchanged:[...b.keys()].filter(k=>a.get(k)===b.get(k))};}
function resourceByPath(resources:ResourceRecord[],path:string):ResourceRecord|undefined{const target=resolve(path);return resources.find(x=>!x.sourcePath.includes('!/')&&resolve(x.sourcePath)===target);}
function buildTree(id:string,resources:ResourceRecord[]):TreeDocument{const roles=new Map<SourceRole,TreeNode>();for(const role of ['manager','customer','project','internet','archive','derived'] as SourceRole[])roles.set(role,{id:`role-${role}`,uri:`subactor://biofoundry/${id}/role/${role}`,label:role,kind:'source-role',sourceUris:[],children:[]});for(const r of resources){const role=r.sourceRole??'project';roles.get(role)!.children.push({id:r.id,uri:r.logicalUri,label:r.sourcePath.split('/').at(-1)??r.sourcePath,kind:'resource',parentId:`role-${role}`,relation:'contains',sourceUris:[r.uri],properties:{sha256:r.sha256,labels:r.labels??[]},children:[]});}return{schema:'subactor.tree/v1',id:`${id}-resources`,roots:[{id:id,uri:`subactor://biofoundry/${id}`,label:id,kind:'biofoundry',children:[...roles.values()].filter(x=>x.children.length>0)}]};}
function buildMath(id:string,policy:ManagerPolicy,state:ProjectState,uris:{policy:string;customer:string;state:string;archives:string[];internet:string[]}):MathDocument{return{schema:'subactor.math/v1',id:`${id}-startup-gates`,bindings:[
  {name:'ManagerApproved',value:policy.approved,sourceUris:[uris.policy]},
  {name:'CustomerDocumentationPresent',value:true,sourceUris:[uris.customer]},
  {name:'ProjectStatePresent',value:true,sourceUris:[uris.state]},
  {name:'ArchiveEvidencePresent',value:uris.archives.length>0,sourceUris:uris.archives},
  {name:'InternetContextPresent',value:uris.internet.length>0,sourceUris:uris.internet},
  {name:'ActiveBioreactors',value:state.activeBioreactors,unit:'count',sourceUris:[uris.state]},
  {name:'MaxActiveBioreactors',value:policy.maxActiveBioreactors,unit:'count',sourceUris:[uris.policy]},
  {name:'CleanDirtySeparationRequired',value:policy.requireCleanDirtySeparation,sourceUris:[uris.policy]},
],expressions:{ResearchContextReady:{kind:'and',args:[{kind:'ref',name:'ArchiveEvidencePresent'},{kind:'ref',name:'InternetContextPresent'}]},CapacityWithinLimit:{kind:'lte',left:{kind:'ref',name:'ActiveBioreactors'},right:{kind:'ref',name:'MaxActiveBioreactors'}},SceneRebuildAllowed:{kind:'and',args:[{kind:'ref',name:'ManagerApproved'},{kind:'ref',name:'CustomerDocumentationPresent'},{kind:'ref',name:'ProjectStatePresent'},{kind:'ref',name:'CapacityWithinLimit'}]}}};}
function buildTwin(id:string,spec:CustomerSpec,state:ProjectState,snapshotHash:string,uris:{customer:string;state:string}):TwinDocument{return{schema:'subactor.twin/v1',id,kind:'physical',observedAt:new Date().toISOString(),sourceSnapshotHash:snapshotHash,components:spec.equipment.map(e=>({id:e.id,type:e.type,sourceUris:[uris.customer,uris.state],properties:{position:e.position,size:e.size,capacityLiters:e.capacityLiters??null,zone:e.zone,...(state.equipment[e.id]??{status:'unknown'})},children:[]}))};}
function buildScene(id:string,twin:TwinDocument):SceneDocument{const twinUri=contentUri('twin',twin);return{schema:'subactor.scene/v1',id:`${id}-scene`,format:'openusd',sourceTwinId:twin.id,bindings:twin.components.map(c=>({twinUri:`${twinUri}#component=${encodeURIComponent(c.id)}`,componentId:c.id,scenePath:`/Biofoundry/${c.id}`,primitive:c.type.includes('reactor')?'cylinder':c.type.includes('tank')?'cylinder':'cube',position:(c.properties.position as [number,number,number])??[0,0,0],size:(c.properties.size as [number,number,number])??[1,1,1],propertyMap:{status:'subactor:status',temperatureC:'subactor:temperatureC'}}))};}
async function readPrevious<T>(path:string):Promise<T|undefined>{try{return JSON.parse(await readFile(path,'utf8')) as T;}catch{return undefined;}}
async function writeJson(path:string,value:unknown):Promise<void>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2));}

export class BiofoundryRuntime{
  constructor(readonly compiler=new NlDslCompiler()){}
  async build(configPath:string,outDir:string,mode:LlmMode='deterministic'):Promise<TwinBuildReceipt>{
    const absoluteConfig=resolve(configPath),base=dirname(absoluteConfig),config=await jsonFile<BiofoundryConfig>(absoluteConfig);if(config.schema!=='subactor.biofoundry-config/v1')throw new Error('BAD_BIOFOUNDRY_CONFIG');
    const sources:ScanSource[]=config.sources.map(x=>({...x,path:resolve(base,x.path)}));const scanned=await scanSources(sources);
    if(config.webResearch){const plan=parseDql(await readFile(resolve(base,config.webResearch.dqlFile),'utf8'));let crawler:DqlCrawler;if(config.webResearch.fixtureMapFile){const fixtureBase=base,map=await jsonFile<Record<string,string>>(resolve(base,config.webResearch.fixtureMapFile));const fetcher:FetchLike=async input=>{const rel=map[String(input)];if(!rel)return new Response('not found',{status:404});return new Response(await readFile(resolve(fixtureBase,rel),'utf8'),{status:200});};crawler=new DqlCrawler(fetcher,async()=>{});}else crawler=new DqlCrawler();const web=await crawler.crawl(plan);for(const page of web.pages){scanned.resources.push(page.resource);scanned.texts.set(page.resource.uri,page.markdown);}scanned.warnings.push(...web.warnings);}
    const resources=scanned.resources,currentSnapshot=snapshot(resources);
    const previousResources=await readPrevious<ResourceRecord[]>(join(outDir,'state/resources.json'))??[],previousSnapshot=await readPrevious<{hash:string}>(join(outDir,'state/snapshot.json')),previousReceipt=await readPrevious<TwinBuildReceipt>(join(outDir,'latest.json'));
    const changes=diff(previousResources,resources);if(previousSnapshot?.hash===currentSnapshot&&previousReceipt)return{...previousReceipt,noChange:true,diff:changes};
    const policyPath=resolve(base,config.policyFile),customerPath=resolve(base,config.customerSpecFile),statePath=resolve(base,config.projectStateFile);
    const policy=await jsonFile<ManagerPolicy>(policyPath),customer=await jsonFile<CustomerSpec>(customerPath),state=await jsonFile<ProjectState>(statePath);
    const policyResource=resourceByPath(resources,policyPath),customerResource=resourceByPath(resources,customerPath),stateResource=resourceByPath(resources,statePath);if(!policyResource||!customerResource||!stateResource)throw new Error('BIOFOUNDRY_REQUIRED_RESOURCE_MISSING');
    const uris={policy:policyResource.uri,customer:customerResource.uri,state:stateResource.uri,archives:resources.filter(r=>r.sourceRole==='archive').map(r=>r.uri),internet:resources.filter(r=>r.sourceRole==='internet').map(r=>r.uri)};const tree=buildTree(config.id,resources),detMath=buildMath(config.id,policy,state,uris),detTwin=buildTwin(config.id,customer,state,currentSnapshot,uris),detScene=buildScene(config.id,detTwin);
    const context={sourceSnapshotHash:currentSnapshot,managerRequest:config.managerRequest,resources:resources.slice(0,100).map(r=>({uri:r.uri,logicalUri:r.logicalUri,role:r.sourceRole,path:r.sourcePath,sha256:r.sha256,labels:r.labels,excerpt:(scanned.texts.get(r.uri)??'').slice(0,2000)})),managerPolicy:policy,customerSpecification:customer,projectState:state,deterministicDrafts:{math:detMath,twin:detTwin,scene:detScene}};
    const mathGen=await this.compiler.compile({kind:'math',text:`Create startup and scene rebuild gates for ${config.managerRequest}`,context,mode,deterministicValue:{dsl:renderMathDsl(detMath)}});const math=mathGen.value as MathDocument;
    const twinGen=await this.compiler.compile({kind:'twin',text:`Create the current Biofoundry Digital Twin from manager policy, customer specification and observed project state.`,context,mode,deterministicValue:{document:detTwin}});const twin=twinGen.value as TwinDocument;validateTwin(twin);
    const sceneGen=await this.compiler.compile({kind:'scene',text:`Create a conceptual OpenUSD scene bound to every Biofoundry twin component. Do not invent verified CAD geometry.`,context:{...context,twin},mode,deterministicValue:{document:detScene}});const scene=sceneGen.value as SceneDocument;validateScene(scene);
    const allowed=evaluateMath(math,'SceneRebuildAllowed')===true,previousScene=await readPrevious<SceneDocument>(join(outDir,'current/scene.json')),sdiff=sceneDiff(previousScene,scene),checks=['manager-approved','customer-documentation-present','project-state-present','capacity-within-limit'],failures:string[]=[];if(!allowed)failures.push('SceneRebuildAllowed=false');
    const candidate=join(outDir,'candidate');await writeJson(join(candidate,'resources.json'),resources);await writeJson(join(candidate,'tree.json'),tree);await writeJson(join(candidate,'math.json'),math);await writeFile(join(candidate,'math.dsl'),renderMathDsl(math));await writeJson(join(candidate,'twin.json'),twin);await writeJson(join(candidate,'scene.json'),scene);await writeFile(join(candidate,'scene.usda'),renderOpenUsd(scene,twin));await writeJson(join(candidate,'scene.diff.json'),sdiff);await writeJson(join(candidate,'generation-audit.json'),{math:mathGen.audit,twin:twinGen.audit,scene:sceneGen.audit,warnings:scanned.warnings});
    if(allowed){const current=join(outDir,'current');await mkdir(current,{recursive:true});for(const name of ['tree.json','math.json','math.dsl','twin.json','scene.json','scene.usda','scene.diff.json','generation-audit.json'])await writeFile(join(current,name),await readFile(join(candidate,name)));}
    await writeJson(join(outDir,'state/resources.json'),resources);await writeJson(join(outDir,'state/snapshot.json'),{hash:currentSnapshot});
    const receipt:TwinBuildReceipt={schema:'subactor.twin-build-receipt/v1',runId:randomUUID(),sourceSnapshotHash:currentSnapshot,previousSnapshotHash:previousSnapshot?.hash??null,diff:changes,treeUri:contentUri('tree',tree),mathUri:contentUri('math',math),twinUri:contentUri('twin',twin),sceneUri:contentUri('scene',scene),validation:{ok:allowed,checks,failures},generatedAt:new Date().toISOString()};await writeJson(join(outDir,'receipts',`${receipt.runId}.json`),receipt);await writeJson(join(outDir,'latest.json'),receipt);return receipt;
  }
}
