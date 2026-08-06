import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Todo2CodeAdapter } from "../src/adapters/todo2code.js";

test('todo2code adapter executes pipeline and reads the canonical graph artifact',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'t2c-adapter-'));try{
    const bin=join(dir,'fake-t2c.mjs');await writeFile(bin,`import{mkdir,writeFile}from'node:fs/promises';import{join}from'node:path';const a=process.argv.slice(2);if(a[0]!=='pipeline')process.exit(2);const out=a[a.indexOf('--out')+1];const run='runs/run-1';await mkdir(join(out,run),{recursive:true});await writeFile(join(out,'latest.json'),JSON.stringify({runDirectory:run}));await writeFile(join(out,run,'manifest.json'),JSON.stringify({files:{graph:'intent.graph.json'}}));await writeFile(join(out,run,'intent.graph.json'),JSON.stringify({schemaVersion:'t2c.graph/v1',records:[{id:'INT-1'}],relations:[],fingerprint:'abc'}));`);
    const workspace=join(dir,'workspace'),out=join(dir,'intent');await mkdir(workspace);const adapter=new Todo2CodeAdapter(dir,bin);assert.equal(await adapter.available(),true);await adapter.extract(workspace,out);const graph=await adapter.readLatestGraph(workspace,out) as {schemaVersion?:string;records?:unknown[]};assert.equal(graph.schemaVersion,'t2c.graph/v1');assert.equal(graph.records?.length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
