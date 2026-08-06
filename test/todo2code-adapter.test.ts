import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Todo2CodeAdapter } from "../src/adapters/todo2code.js";

test("todo2code adapter executes configured pipeline and reads graph, diagnostics and manifest",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"t2c-adapter-"));
  try{
    const bin=join(directory,"fake-t2c.mjs");
    await writeFile(bin,`import{mkdir,writeFile}from'node:fs/promises';import{join}from'node:path';const a=process.argv.slice(2);if(a[0]!=='pipeline')process.exit(2);for(const flag of ['--task','--todo','--changelog','--docs','--nl-mode','--markdown-mode'])if(!a.includes(flag))throw new Error('missing '+flag);const out=a[a.indexOf('--out')+1];const run='runs/run-1';await mkdir(join(out,run),{recursive:true});await writeFile(join(out,'latest.json'),JSON.stringify({runDirectory:run}));await writeFile(join(out,run,'manifest.json'),JSON.stringify({status:'succeeded',files:{graph:'intent.graph.json',diagnostics:'diagnostics.json'}}));await writeFile(join(out,run,'intent.graph.json'),JSON.stringify({schemaVersion:'t2c.graph/v1',records:[{id:'INT-1'}],relations:[],fingerprint:'abc'}));await writeFile(join(out,run,'diagnostics.json'),JSON.stringify([{id:'DIAG-1',severity:'warning'}]));`);
    const workspace=join(directory,"workspace"),out=join(directory,"intent");
    await mkdir(workspace);
    const adapter=new Todo2CodeAdapter(directory,bin);
    assert.equal(await adapter.available(),true);
    await adapter.extract(workspace,out,{task:"TASK.md",todo:"TODO.md",changelog:"CHANGELOG.md",docs:["README.md"]});
    const analysis=await adapter.readLatestAnalysis(workspace,out);
    assert.equal((analysis?.graph as {schemaVersion?:string}).schemaVersion,"t2c.graph/v1");
    assert.equal((analysis?.diagnostics as unknown[]).length,1);
    assert.equal((analysis?.manifest as {status?:string}).status,"succeeded");
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});
