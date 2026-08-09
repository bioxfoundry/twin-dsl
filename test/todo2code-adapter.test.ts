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

test("todo2code adapter resolves v0.5 artifact pointers relative to the analyzed root",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"t2c-adapter-root-relative-"));
  try{
    const workspace=join(directory,"project","code");
    const out=join(directory,"project",".living-runtime","development");
    const run=join(out,"runs","run-2");
    await mkdir(workspace,{recursive:true});
    await mkdir(run,{recursive:true});
    const rootRelative="../.living-runtime/development/runs/run-2";
    await writeFile(join(out,"latest.json"),JSON.stringify({runDirectory:rootRelative}));
    await writeFile(join(run,"manifest.json"),JSON.stringify({
      schemaVersion:"t2c.run/v1",
      status:"succeeded",
      files:{graph:`${rootRelative}/intent.graph.json`,diagnostics:`${rootRelative}/diagnostics.json`},
    }));
    await writeFile(join(run,"intent.graph.json"),JSON.stringify({schemaVersion:"t2c.graph/v1",records:[{id:"INT-2"}],relations:[],fingerprint:"def"}));
    await writeFile(join(run,"diagnostics.json"),JSON.stringify([{id:"DIAG-2",severity:"error"}]));
    const analysis=await new Todo2CodeAdapter().readLatestAnalysis(workspace,out);
    assert.equal((analysis?.graph as {schemaVersion?:string}).schemaVersion,"t2c.graph/v1");
    assert.equal((analysis?.diagnostics as unknown[]).length,1);
    assert.equal((analysis?.manifest as {schemaVersion?:string}).schemaVersion,"t2c.run/v1");
    assert.equal(analysis?.runDirectory,run);
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});

test("todo2code NL extraction is forced deterministic before local patchDSL enrichment",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"t2c-adapter-nl-"));
  try{
    const bin=join(directory,"fake-t2c.mjs");
    await writeFile(bin,`import{writeFile}from'node:fs/promises';const a=process.argv.slice(2);if(a[0]!=='extract'||a[1]!=='nl'||process.env.T2C_NL_MODE!=='deterministic')process.exit(2);const out=a[a.indexOf('--out')+1];await writeFile(out,JSON.stringify({schema:'t2c.intent/v1',id:'i-1',type:'request',text:'baseline',actor:'test',targetUris:['urn:test']})+'\\n');`);
    const adapter=new Todo2CodeAdapter(directory,bin);
    const records=await adapter.extractNl("request","require-llm");
    assert.equal((records[0] as {text:string}).text,"baseline");
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});

test("todo2code adapter closes a code change with before and after evidence",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"t2c-adapter-close-"));
  try{
    const bin=join(directory,"fake-t2c.mjs");
    await writeFile(bin,`import{writeFile}from'node:fs/promises';const a=process.argv.slice(2);if(a[0]!=='close-code-change')process.exit(2);for(const flag of ['--before-graph','--after-graph','--before-diagnostics','--after-diagnostics','--out'])if(!a.includes(flag))throw new Error('missing '+flag);const out=a[a.indexOf('--out')+1];await writeFile(out,JSON.stringify({schemaVersion:'t2c.code-change-close-result/v1',allAccepted:true,acceptedCount:1,rejectedCount:0}));`);
    const files=["plan.json","before.json","after.json","before-diagnostics.json","after-diagnostics.json"];
    await Promise.all(files.map(file=>writeFile(join(directory,file),"{}\n")));
    const adapter=new Todo2CodeAdapter(directory,bin);
    const out=join(directory,"close.json");
    const result=await adapter.closeCodeChange(
      join(directory,"plan.json"),join(directory,"before.json"),join(directory,"after.json"),out,
      {beforeDiagnosticsPath:join(directory,"before-diagnostics.json"),afterDiagnosticsPath:join(directory,"after-diagnostics.json")},
    ) as {allAccepted:boolean};
    assert.equal(result.allAccepted,true);
    assert.equal(JSON.parse(await readFile(out,"utf8")).allAccepted,true);
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});
