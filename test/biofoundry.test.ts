import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BiofoundryRuntime } from "../src/runtime/biofoundry.js";

test('Biofoundry startup ingests folders/ZIP and updates OpenUSD on observed state change',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'biofoundry-'));try{
    const fixture=join(dir,'fixture'),out=join(dir,'out');await cp('examples/biofoundry',fixture,{recursive:true});const config=join(fixture,'biofoundry.config.json'),runtime=new BiofoundryRuntime();
    const first=await runtime.build(config,out,'deterministic');assert.equal(first.validation.ok,true);const unchanged=await runtime.build(config,out,'deterministic');assert.equal(unchanged.noChange,true);assert.equal(unchanged.sceneUri,first.sceneUri);const usda1=await readFile(join(out,'current/scene.usda'),'utf8');assert.match(usda1,/bioreactor_01/);assert.match(usda1,/subactor:temperatureC = 37/);
    const statePath=join(fixture,'project-data/current-state.json'),state=JSON.parse(await readFile(statePath,'utf8'));state.equipment['bioreactor-01'].temperatureC=39;await writeFile(statePath,JSON.stringify(state,null,2));
    const second=await runtime.build(config,out,'deterministic');assert.equal(second.diff.changed.some(x=>x.endsWith('current-state.json')),true);assert.notEqual(second.sceneUri,first.sceneUri);const usda2=await readFile(join(out,'current/scene.usda'),'utf8');assert.match(usda2,/subactor:temperatureC = 39/);
    state.activeBioreactors=9;await writeFile(statePath,JSON.stringify(state,null,2));const blocked=await runtime.build(config,out,'deterministic');assert.equal(blocked.validation.ok,false);const usdaAfterBlocked=await readFile(join(out,'current/scene.usda'),'utf8');assert.equal(usdaAfterBlocked,usda2);
  }finally{await rm(dir,{recursive:true,force:true});}
});
