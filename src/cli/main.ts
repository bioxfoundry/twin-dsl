import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { DslKind, LlmMode, SourceRole } from "../core/types.js";
import { runDemo } from "../runtime/pipeline.js";
import { runResearcherDemo } from "../research/researcher.js";
import { BiofoundryRuntime } from "../runtime/biofoundry.js";
import { RealtimeTwinWatcher } from "../runtime/realtime-watcher.js";
import { LivingProjectRuntime } from "../runtime/living-project.js";
import { LivingProjectWatcher } from "../runtime/living-watcher.js";
import { NlDslCompiler } from "../llm/nl-dsl-compiler.js";
import { parseDql } from "../dsl/dql.js";
import { DqlCrawler } from "../research/crawler.js";
import { Todo2CodeAdapter } from "../adapters/todo2code.js";
import { TwinProbesAdapter } from "../adapters/twin-probes.js";
import { OpenRouterStructuredClient } from "../llm/openrouter.js";
import { addProjectSource, addProjectWebsite, createLivingProject, syncProjectMirror, verifyLivingProject } from "../project/wizard.js";
import { checkExternalServices } from "../runtime/service-check.js";
import { parseProjectDsl } from "../dsl/project.js";
import { issueMutationGrant, verifyMutationGrantDocument, writeMutationGrant } from "../runtime/mutation-grant.js";
import { proposeCodeMutation, applyCodeMutation } from "../runtime/mutation-pipeline.js";
import { applyPhysicalEvidence, validatePhysicalEvidence } from "../scene/physical-evidence.js";
import { startDashboard } from "../serve/dashboard.js";
import { renderOpenUsd } from "../scene/openusd.js";
import { validateScene } from "../dsl/scene.js";
import { validateTwin } from "../dsl/twin.js";
import type { SceneDocument, TwinDocument } from "../core/types.js";
import { diagnoseDigitalTwin, writeDiagnostics } from "../runtime/digital-twin-diagnostics.js";
import { GeometryService } from "../geometry/geometry-service.js";
import { renderGeometryDsl, renderGeometryReceiptDsl } from "../geometry/geometry-dsl.js";
import { analyzeZipFile, findZipFiles, materializeArchiveGeometry, writeArchiveAnalysis } from "../ingestion/archive-project.js";

async function json(path:string):Promise<unknown>{return JSON.parse(await readFile(path,'utf8'));}
async function save(path:string,value:unknown):Promise<void>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2));}
function llmMode(raw:string):LlmMode{
  if(raw==='llm')return'prefer-llm';
  if(raw==='deterministic'||raw==='prefer-llm'||raw==='require-llm')return raw;
  throw new Error(`LLM_MODE_INVALID:${raw}:expected deterministic|prefer-llm|require-llm`);
}
const runFile=promisify(execFile);
async function openScadStatus():Promise<{available:boolean;binary:string;version:string|null}>{
  const moduleDir=dirname(fileURLToPath(import.meta.url));
  const localCandidates=[resolve(process.cwd(),".geometry-toolchain/openscad-2021.01/root/usr/bin/openscad"),resolve(moduleDir,"../../../.geometry-toolchain/openscad-2021.01/root/usr/bin/openscad")];
  const candidates=process.env.OPENSCAD_BIN?[process.env.OPENSCAD_BIN]:["openscad",...localCandidates];
  for(const binary of candidates){
    const localRoot=binary.includes(".geometry-toolchain")?resolve(dirname(binary),"../.."):null;
    const multiarch=process.arch==="arm64"?"aarch64-linux-gnu":"x86_64-linux-gnu";
    const localLibrary=localRoot?join(localRoot,"usr/lib",multiarch):null;
    const env={...process.env,...(localLibrary?{LD_LIBRARY_PATH:[localLibrary,process.env.LD_LIBRARY_PATH].filter(Boolean).join(":")}:{})};
    try{const result=await runFile(binary,["--version"],{timeout:15_000,env});return{available:true,binary,version:(result.stdout||result.stderr).trim()||null};}
    catch{/* try the next deterministic backend location */}
  }
  return{available:false,binary:candidates[0],version:null};
}
async function main():Promise<void>{
  const [cmd,...args]=process.argv.slice(2);
  if(cmd==='doctor'){
    const t2c=new Todo2CodeAdapter(),probes=new TwinProbesAdapter(),llm=new OpenRouterStructuredClient();
    console.log(JSON.stringify({node:process.version,todo2code:{root:t2c.root,bin:t2c.bin,available:await t2c.available()},twinProbes:{bin:probes.bin,available:await probes.available()},openscad:await openScadStatus(),openrouter:{configured:llm.configured(),baseUrl:llm.config.baseUrl,model:llm.config.model,dataCollection:llm.config.dataCollection},doclingUrl:process.env.DOCLING_URL??null,clickhouseUrl:process.env.CLICKHOUSE_URL??null,mutationGrantSecretConfigured:Boolean(process.env.MUTATION_GRANT_HMAC_SECRET||process.env.APPLY_GRANT_HMAC_SECRET||process.env.TOKEN_PEPPER),dockerExpected:process.env.DOCKER_HOST??'local-socket'},null,2));return;
  }
  if(cmd==='service-check'){const result=await checkExternalServices();console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;}
  if(cmd==='demo'){const[base='examples',out='.dt-run']=args;console.log(JSON.stringify(await runDemo(base,out),null,2));return;}
  if(cmd==='researcher-demo'){const[base='examples/researcher',out='.research-run']=args;console.log(JSON.stringify(await runResearcherDemo(base,out),null,2));return;}
  if(cmd==='biofoundry-build'){const[config='examples/biofoundry/biofoundry.config.json',out='.biofoundry-run',mode='deterministic']=args;console.log(JSON.stringify(await new BiofoundryRuntime().build(config,out,llmMode(mode)),null,2));return;}
  if(cmd==='biofoundry-watch'){const[config='examples/biofoundry/biofoundry.config.json',out='.biofoundry-run',mode='deterministic']=args;const watcher=new RealtimeTwinWatcher();watcher.start(config,out,llmMode(mode),Number(process.env.DT_WATCH_INTERVAL_MS??2000),r=>console.log(JSON.stringify(r)));process.once('SIGINT',()=>{watcher.stop();process.exit(0);});return;}
  if(cmd==='project-create'){const[name,out,profile='generic',...intentParts]=args;if(!name||!out)throw new Error('usage: project-create <name> <out-dir> [generic|biofoundry] [manager intent]');console.log(JSON.stringify(await createLivingProject({name,outDir:out,profile:profile as 'generic'|'biofoundry',managerIntent:intentParts.join(' ')||undefined}),null,2));return;}
  if(cmd==='project-add-source'){const[config,role,path]=args;if(!config||!role||!path)throw new Error('usage: project-add-source <project.projectdsl> <role> <path>');console.log(JSON.stringify(await addProjectSource(config,role as SourceRole,path),null,2));return;}
  if(cmd==='project-add-website'){const[config,url,...terms]=args;if(!config||!url)throw new Error('usage: project-add-website <project.projectdsl> <url> [context terms]');console.log(JSON.stringify(await addProjectWebsite(config,url,terms.join(' ').split(',').map(x=>x.trim()).filter(Boolean)),null,2));return;}
  if(cmd==='project-sync'){const[config='project.projectdsl']=args;console.log(JSON.stringify(await syncProjectMirror(config),null,2));return;}
  if(cmd==='project-verify'){const[config='project.projectdsl']=args;const result=await verifyLivingProject(config);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;}
  if(cmd==='project-status'){const[out='.living-runtime']=args;const latest=await json(`${out}/latest.json`).catch(()=>null),failures=await readFile(`${out}/dead-letter.jsonl`,'utf8').then(x=>x.trim().split(/\r?\n/).filter(Boolean).slice(-10).map(line=>JSON.parse(line))).catch(()=>[]),improvement=await json(`${out}/candidate/improvement.json`).catch(()=>null),mutation=await json(`${out}/mutations/latest.json`).catch(()=>null);console.log(JSON.stringify({latest,failures,improvement,mutation},null,2));return;}
  if(cmd==='project-diagnose'){
    const[sourceRoot,markdownRoot,dslRoot,runtimeRoot=`.living-runtime`,out=`${runtimeRoot}/current/digital-twin-diagnostics.json`]=args;
    if(!sourceRoot||!markdownRoot||!dslRoot)throw new Error('usage: project-diagnose <source-root> <markdown-root> <dsl-root> [runtime-root] [report.json]');
    const report=await diagnoseDigitalTwin({sourceRoot:resolve(sourceRoot),markdownRoot:resolve(markdownRoot),dslRoot:resolve(dslRoot),runtimeRoot:resolve(runtimeRoot),dashboardSource:resolve('public/dashboard.html')});
    await writeDiagnostics(resolve(out),report);console.log(JSON.stringify(report,null,2));if(report.status==='error')process.exitCode=1;return;
  }
  if(cmd==='project-autonomous'){
    const[config='project.projectdsl',out='.living-runtime',mode='prefer-llm',interval='60000',sourceRoot,markdownRoot,dslRoot]=args;
    const runtime=new LivingProjectRuntime(); let busy=false;
    const cycle=async():Promise<void>=>{if(busy)return;busy=true;try{
      const iteration=await runtime.iterate(resolve(config),resolve(out),llmMode(mode));
      const report=(sourceRoot&&markdownRoot&&dslRoot)?await diagnoseDigitalTwin({sourceRoot:resolve(sourceRoot),markdownRoot:resolve(markdownRoot),dslRoot:resolve(dslRoot),runtimeRoot:resolve(out),dashboardSource:resolve('public/dashboard.html')}):null;
      if(report)await writeDiagnostics(join(resolve(out),'current/digital-twin-diagnostics.json'),report);
      console.log(JSON.stringify({autonomous:true,iteration,diagnostics:report?.summary??null}));
    }catch(error){console.error(JSON.stringify({autonomous:true,error:error instanceof Error?error.message:String(error)}));}finally{busy=false;}};
    await cycle();const timer=setInterval(()=>void cycle(),Math.max(5000,Number(interval)||60000));const stop=():void=>{clearInterval(timer);process.exit(0);};process.once('SIGINT',stop);process.once('SIGTERM',stop);return;
  }
  if(cmd==='project-iterate'){const[config='project.projectdsl',out='.living-runtime',mode='deterministic']=args;console.log(JSON.stringify(await new LivingProjectRuntime().iterate(config,out,llmMode(mode)),null,2));return;}
  if(cmd==='project-watch'){const[config='project.projectdsl',out='.living-runtime',mode='prefer-llm']=args;const watcher=new LivingProjectWatcher();watcher.start(config,out,llmMode(mode),Number(process.env.DT_WATCH_INTERVAL_MS??5000),r=>console.log(JSON.stringify(r)));process.once('SIGINT',()=>{watcher.stop();process.exit(0);});process.once('SIGTERM',()=>{watcher.stop();process.exit(0);});return;}
  if(cmd==='grant-issue'){
    const[projectId,planHash,artifactSha256,target,actor,out,ttlSeconds]=args;
    if(!projectId||!planHash||!artifactSha256||!target||!actor||!out)throw new Error('usage: grant-issue <projectId> <planHash> <artifactSha256> <target> <actor> <out.json> [ttlSeconds]');
    const issued=issueMutationGrant({projectId,planHash,artifactSha256,target,actor,runId:`run-${Date.now()}`,ttlSeconds:ttlSeconds?Number(ttlSeconds):undefined});
    if(!issued.ok){console.error(JSON.stringify(issued));process.exitCode=1;return;}
    await writeMutationGrant(out,issued.document);console.log(JSON.stringify({ok:true,out,grantHash:issued.document.grantHash,jti:issued.document.jti,expiresAt:issued.document.expiresAt},null,2));return;
  }
  if(cmd==='grant-verify'){
    const[grantPath,projectId,planHash]=args;if(!grantPath)throw new Error('usage: grant-verify <grant.json> [projectId] [planHash]');
    const result=verifyMutationGrantDocument(await json(grantPath),{projectId,planHash});
    console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;
  }
  if(cmd==='mutation-propose'){
    const[config,planPath,out='.living-runtime',devRoot]=args;
    if(!config||!planPath)throw new Error('usage: mutation-propose <project.projectdsl> <plan.json> [out-dir] [development-root]');
    const project=parseProjectDsl(await readFile(config,'utf8'));
    const base=dirname(resolve(config));
    const receipt=await proposeCodeMutation({project,projectBase:base,developmentRoot:devRoot?resolve(devRoot):resolve(base,project.development.root),planPath:resolve(planPath),outDir:resolve(out),keepWorkspace:true});
    console.log(JSON.stringify(receipt,null,2));if(receipt.status==='refused'||receipt.status==='failed')process.exitCode=1;return;
  }
  if(cmd==='mutation-apply'){
    const[config,planPath,sourcePatch,approvalHash,out='.living-runtime',devRoot]=args;
    if(!config||!planPath||!sourcePatch||!approvalHash)throw new Error('usage: mutation-apply <project.projectdsl> <plan.json> <source-patch.json> <approvalHash> [out-dir] [development-root]');
    const project=parseProjectDsl(await readFile(config,'utf8'));
    const base=dirname(resolve(config));
    const grantPath=project.policy.mutationGrantFile?resolve(base,project.policy.mutationGrantFile):undefined;
    if(!grantPath)throw new Error('MUTATION_GRANT_FILE_REQUIRED');
    const receipt=await applyCodeMutation({project,projectBase:base,developmentRoot:devRoot?resolve(devRoot):resolve(base,project.development.root),planPath:resolve(planPath),sourcePatchPath:resolve(sourcePatch),approvalHash,grant:await json(grantPath),outDir:resolve(out),keepWorkspace:true});
    console.log(JSON.stringify(receipt,null,2));return;
  }
  if(cmd==='probes-ingest'){
    const[cyclePath,out='.probe-evidence.json']=args;if(!cyclePath)throw new Error('usage: probes-ingest <cycle.json> [out-summary.json]');
    const adapter=new TwinProbesAdapter();const {cycle,summary}=await adapter.loadCycle(cyclePath);await adapter.writeSummary(out,summary);
    console.log(JSON.stringify({host:cycle.host,summary},null,2));return;
  }
  if(cmd==='probes-run'){
    const[repo,out='.probe-cycle.json',host,scan,only]=args;
    if(!repo)throw new Error('usage: probes-run <repo> [cycle.json] [host] [scan] [probe-a,probe-b]');
    const adapter=new TwinProbesAdapter();
    const result=await adapter.run(repo,out,{host,scan,only:only?.split(',').map(item=>item.trim()).filter(Boolean)});
    const summaryOut=`${resolve(out)}.evidence.json`;
    await adapter.writeSummary(summaryOut,result.summary);
    console.log(JSON.stringify({cycle:resolve(out),evidence:summaryOut,host:result.cycle.host,summary:result.summary},null,2));return;
  }
  if(cmd==='nl-to-dsl'){const[kind,input,out,mode='require-llm',fixture]=args;if(!kind||!input||!out)throw new Error('usage: nl-to-dsl <kind> <input> <out> [mode] [fixture.json]');const result=await new NlDslCompiler().compile({kind:kind as DslKind,text:await readFile(input,'utf8'),mode:llmMode(mode),deterministicValue:fixture?await json(fixture):undefined});await save(out,result);console.log(JSON.stringify({kind:result.kind,hash:result.canonicalHash,audit:result.audit},null,2));return;}
  if(cmd==='dashboard'){
    const[config='project.projectdsl',out='.living-runtime',port='7331',mode='deterministic']=args;
    const server=await startDashboard({
      configPath:resolve(config),outDir:resolve(out),port:Number(port),
      host:process.env.DT_DASHBOARD_HOST??"127.0.0.1",mode:llmMode(mode),
      readOnly:process.env.DT_DASHBOARD_READ_ONLY==="1",
    });
    console.log(JSON.stringify({dashboard:server.url,config:resolve(config),out:resolve(out)},null,2));
    const stop=():void=>{void server.close().then(()=>process.exit(0));};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    return;
  }
  if(cmd==='scene-render'){
    const[scenePath,twinPath,out]=args;if(!scenePath||!twinPath)throw new Error('usage: scene-render <scene.json> <twin.json> [out.usda]');
    const scene=await json(scenePath) as SceneDocument,twin=await json(twinPath) as TwinDocument;
    validateScene(scene);validateTwin(twin);
    const usda=renderOpenUsd(scene,twin);
    if(out){await mkdir(dirname(out),{recursive:true});await writeFile(out,usda);console.log(JSON.stringify({out,bindings:scene.bindings.length,bytes:usda.length},null,2));}
    else console.log(usda);
    return;
  }
  if(cmd==='physical-intake'){
    const[twinPath,scenePath,evidencePath,outDir='.physical-intake']=args;
    if(!twinPath||!scenePath||!evidencePath)throw new Error('usage: physical-intake <twin.json> <scene.json> <evidence.json> [out-dir]');
    const twin=await json(twinPath) as TwinDocument,scene=await json(scenePath) as SceneDocument;
    const evidence=validatePhysicalEvidence(await json(evidencePath));
    const result=applyPhysicalEvidence({twin,scene,evidence});
    await save(`${outDir}/twin.json`,result.twin);
    await save(`${outDir}/scene.json`,result.scene);
    await save(`${outDir}/physical-evidence.report.json`,result.report);
    await save(`${outDir}/geometry-validation.json`,result.geometryValidation);
    await mkdir(outDir,{recursive:true});
    await writeFile(`${outDir}/scene.usda`,renderOpenUsd(result.scene,result.twin));
    console.log(JSON.stringify({physicalEvidence:result.report,geometryValidation:result.geometryValidation},null,2));
    if(result.report.rejected.length||!result.geometryValidation.ok)process.exitCode=1;
    return;
  }
  if(cmd==='geometry-build'){
    const[contractPath,outDir='.geometry-build',projectId='geometry-build']=args;
    if(!contractPath)throw new Error('usage: geometry-build <geometry-build.json> [out-dir] [project-id]');
    const result=await new GeometryService().materializeFile(resolve(contractPath),resolve(outDir),projectId);
    await save(`${outDir}/latest/${result.contract.id}.geometry-build.json`,result.contract);
    await mkdir(resolve(outDir,'latest'),{recursive:true});
    await writeFile(resolve(outDir,'latest',`${result.contract.id}.geometry.dsl`),renderGeometryDsl(result.contract));
    await writeFile(resolve(outDir,'latest',`${result.contract.id}.geometry-build-receipt.dsl`),renderGeometryReceiptDsl(result.receipt));
    console.log(JSON.stringify({contract:result.contract.id,receipt:result.receipt,evidence:result.evidence,resource:result.resource},null,2));
    if(result.receipt.status!=='succeeded')process.exitCode=1;
    return;
  }
  if(cmd==='archive-analyze'){
    const[source,out='.archive-analysis',mode='analyze']=args;
    if(!source)throw new Error('usage: archive-analyze <zip-or-directory> [out-dir] [analyze|materialize]');
    if(!['analyze','materialize'].includes(mode))throw new Error(`ARCHIVE_MODE_INVALID:${mode}`);
    const archives=await findZipFiles(resolve(source));
    const analyses=[] as Awaited<ReturnType<typeof analyzeZipFile>>[];
    const receipts=[] as Awaited<ReturnType<typeof materializeArchiveGeometry>>[];
    for(const archive of archives){
      const analysis=await analyzeZipFile(archive);analyses.push(analysis);
      await writeArchiveAnalysis(analysis,join(resolve(out),'reports'));
      if(mode==='materialize')receipts.push(await materializeArchiveGeometry(analysis,join(resolve(out),'materialized')));
    }
    await save(join(resolve(out),'archive-project-index.json'),{schema:'subactor.archive-project-index/v1',source:resolve(source),archives:analyses,receipts});
    console.log(JSON.stringify({source:resolve(source),out:resolve(out),archives:analyses.length,coverage:analyses.reduce((sum,item)=>({entries:sum.entries+item.coverage.entries,geometryEntries:sum.geometryEntries+item.coverage.geometryEntries,materializableGeometryEntries:sum.materializableGeometryEntries+item.coverage.materializableGeometryEntries,unsupportedCadEntries:sum.unsupportedCadEntries+item.coverage.unsupportedCadEntries}),{entries:0,geometryEntries:0,materializableGeometryEntries:0,unsupportedCadEntries:0}),materialized:receipts.reduce((sum,item)=>sum+item.coverage.materialized,0),failed:receipts.reduce((sum,item)=>sum+item.coverage.failed,0)},null,2));return;
  }
  if(cmd==='crawl'){const[dql,out='.research-crawl']=args;if(!dql)throw new Error('usage: crawl <plan.dql> [out]');const plan=parseDql(await readFile(dql,'utf8')),result=await new DqlCrawler().crawl(plan);await save(`${out}/result.json`,result);console.log(JSON.stringify({pages:result.pages.length,warnings:result.warnings},null,2));return;}
  console.error('usage: doctor | service-check | demo | researcher-demo | nl-to-dsl | dashboard | scene-render | physical-intake | geometry-build | archive-analyze | crawl | biofoundry-build | biofoundry-watch | project-create | project-add-source | project-add-website | project-sync | project-verify | project-status | project-diagnose | project-autonomous | project-iterate | project-watch | grant-issue | grant-verify | mutation-propose | mutation-apply | probes-run | probes-ingest');process.exitCode=2;
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
