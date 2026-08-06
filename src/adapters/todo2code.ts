import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { IntentRecord, LlmMode } from "../core/types.js";
import { validateT2cIntent } from "../dsl/intent.js";

async function run(command:string,args:string[],cwd:string,env:NodeJS.ProcessEnv):Promise<void>{await new Promise<void>((resolvePromise,reject)=>{const p=spawn(command,args,{cwd,env,stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',x=>error+=String(x));p.on('error',reject);p.on('exit',c=>c===0?resolvePromise():reject(new Error(`TODO2CODE_EXIT:${c}:${error.slice(0,1000)}`)));});}
async function optionalJson(path:string):Promise<unknown|undefined>{try{return JSON.parse(await readFile(path,'utf8'));}catch{return undefined;}}
export class Todo2CodeAdapter {
  constructor(readonly root=process.env.T2C_ROOT??'',readonly bin=process.env.T2C_BIN??''){}
  async available():Promise<boolean>{try{await access(this.bin);return true;}catch{return false;}}
  async loadFixture(path:string):Promise<IntentRecord[]>{return validateT2cIntent(JSON.parse(await readFile(path,'utf8')));}
  async extract(root:string,out:string):Promise<void>{if(!await this.available())throw new Error('TODO2CODE_NOT_AVAILABLE');const cwd=this.root||process.cwd();await run(process.execPath,[this.bin,'pipeline',resolve(root),'--no-docs-llm','--no-summary-llm','--out',out],cwd,process.env);}
  async readLatestGraph(analyzedRoot:string,out:string):Promise<unknown|undefined>{
    const bases=[isAbsolute(out)?out:resolve(analyzedRoot,out),resolve(out)];
    for(const base of bases){const latest=await optionalJson(join(base,'latest.json')) as {runDirectory?:string}|undefined;if(!latest?.runDirectory)continue;const manifest=await optionalJson(join(base,latest.runDirectory,'manifest.json')) as {files?:{graph?:string}}|undefined;const graphPath=manifest?.files?.graph;if(graphPath){const graph=await optionalJson(join(base,latest.runDirectory,graphPath));if(graph)return graph;}const direct=await optionalJson(join(base,latest.runDirectory,'intent.graph.json'));if(direct)return direct;}
    return undefined;
  }
  async extractNl(text:string,mode:LlmMode):Promise<unknown[]>{
    if(!await this.available())throw new Error('TODO2CODE_NOT_AVAILABLE');
    const dir=await mkdtemp(join(tmpdir(),'t2c-nl-'));try{
      const input=join(dir,'request.md'),out=join(dir,'intent.jsonl');await writeFile(input,text,'utf8');
      await run(process.execPath,[this.bin,'extract','nl',input,'--root',dir,'--out',out],this.root||process.cwd(),{...process.env,T2C_NL_MODE:mode});
      const raw=await readFile(out,'utf8');return raw.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    }finally{await rm(dir,{recursive:true,force:true});}
  }
}
