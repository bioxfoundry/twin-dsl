import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { IntentRecord, LlmMode } from "../core/types.js";
import { validateT2cIntent } from "../dsl/intent.js";

export interface Todo2CodePipelineOptions {
  task?: string;
  todo?: string;
  changelog?: string;
  docs?: string[];
}
export interface Todo2CodeAnalysis {
  graph: unknown;
  diagnostics: unknown;
  manifest: unknown;
  runDirectory: string;
}

async function run(command:string,args:string[],cwd:string,env:NodeJS.ProcessEnv):Promise<void> {
  await new Promise<void>((resolvePromise,reject)=>{
    const processHandle = spawn(command,args,{cwd,env,stdio:["ignore","ignore","pipe"]});
    let error = "";
    processHandle.stderr.on("data",chunk=>error += String(chunk));
    processHandle.on("error",reject);
    processHandle.on("exit",code=>code === 0 ? resolvePromise() : reject(new Error(`TODO2CODE_EXIT:${code}:${error.slice(0,2000)}`)));
  });
}
async function optionalJson(path:string):Promise<unknown|undefined> {
  try { return JSON.parse(await readFile(path,"utf8")); }
  catch { return undefined; }
}
function pointerCandidates(pointer:string,bases:string[]):string[] {
  const paths = isAbsolute(pointer) ? [resolve(pointer)] : bases.map(base=>resolve(base,pointer));
  return [...new Set(paths)];
}
async function firstJson(pointer:string,bases:string[]):Promise<unknown|undefined> {
  for(const path of pointerCandidates(pointer,bases)) {
    const value = await optionalJson(path);
    if(value !== undefined) return value;
  }
  return undefined;
}

export class Todo2CodeAdapter {
  constructor(readonly root=process.env.T2C_ROOT??"",readonly bin=process.env.T2C_BIN??"") {}

  async available():Promise<boolean> {
    if(!this.bin) return false;
    try { await access(this.bin); return true; }
    catch { return false; }
  }

  async loadFixture(path:string):Promise<IntentRecord[]> {
    return validateT2cIntent(JSON.parse(await readFile(path,"utf8")));
  }

  async extract(root:string,out:string,options:Todo2CodePipelineOptions={}):Promise<void> {
    if(!await this.available()) throw new Error("TODO2CODE_NOT_AVAILABLE");
    const args = [this.bin,"pipeline",resolve(root)];
    if(options.task) args.push("--task",options.task);
    if(options.todo) args.push("--todo",options.todo);
    if(options.changelog) args.push("--changelog",options.changelog);
    if(options.docs?.length) args.push("--docs",options.docs.join(","));
    args.push("--nl-mode","deterministic","--markdown-mode","deterministic","--no-docs-llm","--no-summary-llm","--out",out);
    await run(process.execPath,args,this.root||process.cwd(),process.env);
  }

  async readLatestAnalysis(analyzedRoot:string,out:string):Promise<Todo2CodeAnalysis|undefined> {
    const bases = [isAbsolute(out)?out:resolve(analyzedRoot,out),resolve(out)];
    for(const base of bases) {
      const latest = await optionalJson(join(base,"latest.json")) as {runDirectory?:string}|undefined;
      if(!latest?.runDirectory) continue;
      // todo2code v0.5 emits paths relative to the analyzed project root, while
      // older releases and fixtures use paths relative to the output directory.
      // Resolve both contracts and only accept a candidate that contains a graph.
      for(const runBase of pointerCandidates(latest.runDirectory,[base,analyzedRoot])) {
        const manifest = await optionalJson(join(runBase,"manifest.json"));
        const manifestObject = manifest && typeof manifest === "object" ? manifest as {files?:{graph?:string;diagnostics?:string}} : undefined;
        const artifactBases = [runBase,analyzedRoot,base];
        const graph = await firstJson(manifestObject?.files?.graph??"intent.graph.json",artifactBases);
        if(!graph) continue;
        const diagnostics = await firstJson(manifestObject?.files?.diagnostics??"diagnostics.json",artifactBases) ?? [];
        return {graph,diagnostics,manifest:manifest??{},runDirectory:runBase};
      }
    }
    return undefined;
  }

  async readLatestGraph(analyzedRoot:string,out:string):Promise<unknown|undefined> {
    return (await this.readLatestAnalysis(analyzedRoot,out))?.graph;
  }

  async extractNl(text:string,_mode:LlmMode):Promise<unknown[]> {
    if(!await this.available()) throw new Error("TODO2CODE_NOT_AVAILABLE");
    const directory = await mkdtemp(join(tmpdir(),"t2c-nl-"));
    try {
      const input = join(directory,"request.md");
      const out = join(directory,"intent.jsonl");
      await writeFile(input,text,"utf8");
      // todo2code owns the deterministic Intent Evidence baseline only. Any optional model
      // enrichment is performed later by NlDslCompiler through the local schema+GBNF patchDSL
      // boundary, so no external client can silently reintroduce a raw LLM response here.
      await run(process.execPath,[this.bin,"extract","nl",input,"--root",directory,"--out",out],this.root||process.cwd(),{...process.env,T2C_NL_MODE:"deterministic"});
      const raw = await readFile(out,"utf8");
      return raw.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    } finally {
      await rm(directory,{recursive:true,force:true});
    }
  }

  /**
   * Propose structured source patch from a code-change plan (no file writes).
   * Requires real semcod/todo2code with `propose-source-patch`.
   */
  async proposeSourcePatch(planPath:string,outPath:string,options:{cwd?:string}={}):Promise<unknown> {
    if(!await this.available()) throw new Error("TODO2CODE_NOT_AVAILABLE");
    const cwd = options.cwd || this.root || process.cwd();
    await run(process.execPath,[this.bin,"propose-source-patch",resolve(planPath),"--out",resolve(outPath)],cwd,process.env);
    return JSON.parse(await readFile(resolve(outPath),"utf8"));
  }

  /**
   * Apply a source patch only with explicit approval hash (hash-bound human/agent grant).
   * Writes only inside the provided cwd (prefer isolated worktree).
   */
  async applySourcePatch(patchPath:string,options:{actor:string;approvalHash:string;receiptPath?:string;cwd?:string}):Promise<unknown> {
    if(!await this.available()) throw new Error("TODO2CODE_NOT_AVAILABLE");
    if(!options.approvalHash?.trim()) throw new Error("TODO2CODE_APPROVAL_HASH_REQUIRED");
    const cwd = options.cwd || this.root || process.cwd();
    const args = [this.bin,"apply-source-patch",resolve(patchPath),"--actor",options.actor,"--approval-hash",options.approvalHash];
    if(options.receiptPath) args.push("--receipt",resolve(options.receiptPath));
    await run(process.execPath,args,cwd,process.env);
    if(options.receiptPath) {
      try { return JSON.parse(await readFile(resolve(options.receiptPath),"utf8")); }
      catch { return { applied:true, receiptPath:options.receiptPath }; }
    }
    return { applied:true };
  }

  /**
   * Compare a reviewed plan with deterministic before/after analysis graphs.
   * This only emits acceptance evidence; it never marks a task done or promotes
   * an isolated workspace.
   */
  async closeCodeChange(
    planPath:string,
    beforeGraphPath:string,
    afterGraphPath:string,
    outPath:string,
    options:{beforeDiagnosticsPath?:string;afterDiagnosticsPath?:string;cwd?:string}={},
  ):Promise<unknown> {
    if(!await this.available()) throw new Error("TODO2CODE_NOT_AVAILABLE");
    const cwd = options.cwd || this.root || process.cwd();
    const args = [
      this.bin,"close-code-change",resolve(planPath),
      "--before-graph",resolve(beforeGraphPath),
      "--after-graph",resolve(afterGraphPath),
      "--out",resolve(outPath),
    ];
    if(options.beforeDiagnosticsPath) args.push("--before-diagnostics",resolve(options.beforeDiagnosticsPath));
    if(options.afterDiagnosticsPath) args.push("--after-diagnostics",resolve(options.afterDiagnosticsPath));
    await run(process.execPath,args,cwd,process.env);
    return JSON.parse(await readFile(resolve(outPath),"utf8"));
  }
}
