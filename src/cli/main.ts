import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { DslKind, LlmMode } from "../core/types.js";
import { runDemo } from "../runtime/pipeline.js";
import { runResearcherDemo } from "../research/researcher.js";
import { BiofoundryRuntime } from "../runtime/biofoundry.js";
import { RealtimeTwinWatcher } from "../runtime/realtime-watcher.js";
import { NlDslCompiler } from "../llm/nl-dsl-compiler.js";
import { parseDql } from "../dsl/dql.js";
import { DqlCrawler } from "../research/crawler.js";
import { Todo2CodeAdapter } from "../adapters/todo2code.js";
import { OpenRouterStructuredClient } from "../llm/openrouter.js";

async function json(path:string):Promise<unknown>{return JSON.parse(await readFile(path,'utf8'));}
async function save(path:string,value:unknown):Promise<void>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2));}
async function main():Promise<void>{
  const [cmd,...args]=process.argv.slice(2);
  if(cmd==='doctor'){
    const t2c=new Todo2CodeAdapter(),llm=new OpenRouterStructuredClient();console.log(JSON.stringify({node:process.version,todo2code:{root:t2c.root,bin:t2c.bin,available:await t2c.available()},openrouter:{configured:llm.configured(),baseUrl:llm.config.baseUrl,model:llm.config.model,dataCollection:llm.config.dataCollection},doclingUrl:process.env.DOCLING_URL??null,clickhouseUrl:process.env.CLICKHOUSE_URL??null},null,2));return;
  }
  if(cmd==='demo'){const[base='examples',out='.dt-run']=args;console.log(JSON.stringify(await runDemo(base,out),null,2));return;}
  if(cmd==='researcher-demo'){const[base='examples/researcher',out='.research-run']=args;console.log(JSON.stringify(await runResearcherDemo(base,out),null,2));return;}
  if(cmd==='biofoundry-build'){const[config='examples/biofoundry/biofoundry.config.json',out='.biofoundry-run',mode='deterministic']=args;console.log(JSON.stringify(await new BiofoundryRuntime().build(config,out,mode as LlmMode),null,2));return;}
  if(cmd==='biofoundry-watch'){const[config='examples/biofoundry/biofoundry.config.json',out='.biofoundry-run',mode='deterministic']=args;const watcher=new RealtimeTwinWatcher();watcher.start(config,out,mode as LlmMode,Number(process.env.DT_WATCH_INTERVAL_MS??2000),r=>console.log(JSON.stringify(r)));process.once('SIGINT',()=>{watcher.stop();process.exit(0);});return;}
  if(cmd==='nl-to-dsl'){const[kind,input,out,mode='require-llm',fixture]=args;if(!kind||!input||!out)throw new Error('usage: nl-to-dsl <kind> <input> <out> [mode] [fixture.json]');const result=await new NlDslCompiler().compile({kind:kind as DslKind,text:await readFile(input,'utf8'),mode:mode as LlmMode,deterministicValue:fixture?await json(fixture):undefined});await save(out,result);console.log(JSON.stringify({kind:result.kind,hash:result.canonicalHash,audit:result.audit},null,2));return;}
  if(cmd==='crawl'){const[dql,out='.research-crawl']=args;if(!dql)throw new Error('usage: crawl <plan.dql> [out]');const plan=parseDql(await readFile(dql,'utf8')),result=await new DqlCrawler().crawl(plan);await save(`${out}/result.json`,result);console.log(JSON.stringify({pages:result.pages.length,warnings:result.warnings},null,2));return;}
  console.error('usage: doctor | demo | researcher-demo | nl-to-dsl | crawl | biofoundry-build | biofoundry-watch');process.exitCode=2;
}
await main();
