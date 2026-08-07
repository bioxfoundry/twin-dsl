import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import { addProjectSource, addProjectWebsite, createLivingProject, verifyLivingProject } from "../project/wizard.js";
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

async function json(path:string):Promise<unknown>{return JSON.parse(await readFile(path,'utf8'));}
async function save(path:string,value:unknown):Promise<void>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2));}
async function main():Promise<void>{
  const [cmd,...args]=process.argv.slice(2);
  if(cmd==='doctor'){
    const t2c=new Todo2CodeAdapter(),probes=new TwinProbesAdapter(),llm=new OpenRouterStructuredClient();
    console.log(JSON.stringify({node:process.version,todo2code:{root:t2c.root,bin:t2c.bin,available:await t2c.available()},twinProbes:{bin:probes.bin,available:await probes.available()},openrouter:{configured:llm.configured(),baseUrl:llm.config.baseUrl,model:llm.config.model,dataCollection:llm.config.dataCollection},doclingUrl:process.env.DOCLING_URL??null,clickhouseUrl:process.env.CLICKHOUSE_URL??null,mutationGrantSecretConfigured:Boolean(process.env.MUTATION_GRANT_HMAC_SECRET||process.env.APPLY_GRANT_HMAC_SECRET||process.env.TOKEN_PEPPER),dockerExpected:process.env.DOCKER_HOST??'local-socket'},null,2));return;
  }
  if(cmd==='service-check'){const result=await checkExternalServices();console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;}
  if(cmd==='demo'){const[base='examples',out='.dt-run']=args;console.log(JSON.stringify(await runDemo(base,out),null,2));return;}
  if(cmd==='researcher-demo'){const[base='examples/researcher',out='.research-run']=args;console.log(JSON.stringify(await runResearcherDemo(base,out),null,2));return;}
  if(cmd==='biofoundry-build'){const[config='examples/biofoundry/biofoundry.config.json',out='.biofoundry-run',mode='deterministic']=args;console.log(JSON.stringify(await new BiofoundryRuntime().build(config,out,mode as LlmMode),null,2));return;}
  if(cmd==='biofoundry-watch'){const[config='examples/biofoundry/biofoundry.config.json',out='.biofoundry-run',mode='deterministic']=args;const watcher=new RealtimeTwinWatcher();watcher.start(config,out,mode as LlmMode,Number(process.env.DT_WATCH_INTERVAL_MS??2000),r=>console.log(JSON.stringify(r)));process.once('SIGINT',()=>{watcher.stop();process.exit(0);});return;}
  if(cmd==='project-create'){const[name,out,profile='generic',...intentParts]=args;if(!name||!out)throw new Error('usage: project-create <name> <out-dir> [generic|biofoundry] [manager intent]');console.log(JSON.stringify(await createLivingProject({name,outDir:out,profile:profile as 'generic'|'biofoundry',managerIntent:intentParts.join(' ')||undefined}),null,2));return;}
  if(cmd==='project-add-source'){const[config,role,path]=args;if(!config||!role||!path)throw new Error('usage: project-add-source <project.projectdsl> <role> <path>');console.log(JSON.stringify(await addProjectSource(config,role as SourceRole,path),null,2));return;}
  if(cmd==='project-add-website'){const[config,url,...terms]=args;if(!config||!url)throw new Error('usage: project-add-website <project.projectdsl> <url> [context terms]');console.log(JSON.stringify(await addProjectWebsite(config,url,terms.join(' ').split(',').map(x=>x.trim()).filter(Boolean)),null,2));return;}
  if(cmd==='project-verify'){const[config='project.projectdsl']=args;const result=await verifyLivingProject(config);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;}
  if(cmd==='project-status'){const[out='.living-runtime']=args;const latest=await json(`${out}/latest.json`).catch(()=>null),failures=await readFile(`${out}/dead-letter.jsonl`,'utf8').then(x=>x.trim().split(/\r?\n/).filter(Boolean).slice(-10).map(line=>JSON.parse(line))).catch(()=>[]),improvement=await json(`${out}/candidate/improvement.json`).catch(()=>null),mutation=await json(`${out}/mutations/latest.json`).catch(()=>null);console.log(JSON.stringify({latest,failures,improvement,mutation},null,2));return;}
  if(cmd==='project-iterate'){const[config='project.projectdsl',out='.living-runtime',mode='deterministic']=args;console.log(JSON.stringify(await new LivingProjectRuntime().iterate(config,out,mode as LlmMode),null,2));return;}
  if(cmd==='project-watch'){const[config='project.projectdsl',out='.living-runtime',mode='prefer-llm']=args;const watcher=new LivingProjectWatcher();watcher.start(config,out,mode as LlmMode,Number(process.env.DT_WATCH_INTERVAL_MS??5000),r=>console.log(JSON.stringify(r)));process.once('SIGINT',()=>{watcher.stop();process.exit(0);});process.once('SIGTERM',()=>{watcher.stop();process.exit(0);});return;}
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
  if(cmd==='nl-to-dsl'){const[kind,input,out,mode='require-llm',fixture]=args;if(!kind||!input||!out)throw new Error('usage: nl-to-dsl <kind> <input> <out> [mode] [fixture.json]');const result=await new NlDslCompiler().compile({kind:kind as DslKind,text:await readFile(input,'utf8'),mode:mode as LlmMode,deterministicValue:fixture?await json(fixture):undefined});await save(out,result);console.log(JSON.stringify({kind:result.kind,hash:result.canonicalHash,audit:result.audit},null,2));return;}
  if(cmd==='dashboard'){
    const[config='project.projectdsl',out='.living-runtime',port='7331',mode='deterministic']=args;
    const server=await startDashboard({configPath:resolve(config),outDir:resolve(out),port:Number(port),mode:mode as LlmMode});
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
    await mkdir(outDir,{recursive:true});
    await writeFile(`${outDir}/scene.usda`,renderOpenUsd(result.scene,result.twin));
    console.log(JSON.stringify(result.report,null,2));
    if(result.report.rejected.length)process.exitCode=1;
    return;
  }
  if(cmd==='crawl'){const[dql,out='.research-crawl']=args;if(!dql)throw new Error('usage: crawl <plan.dql> [out]');const plan=parseDql(await readFile(dql,'utf8')),result=await new DqlCrawler().crawl(plan);await save(`${out}/result.json`,result);console.log(JSON.stringify({pages:result.pages.length,warnings:result.warnings},null,2));return;}
  console.error('usage: doctor | service-check | demo | researcher-demo | nl-to-dsl | dashboard | scene-render | physical-intake | crawl | biofoundry-build | biofoundry-watch | project-create | project-add-source | project-add-website | project-verify | project-status | project-iterate | project-watch | grant-issue | grant-verify | mutation-propose | mutation-apply | probes-ingest');process.exitCode=2;
}
await main();
