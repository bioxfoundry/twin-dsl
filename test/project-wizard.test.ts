import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addProjectSource, createLivingProject, verifyLivingProject } from "../src/project/wizard.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";

test('project wizard creates isolated Docker/CI project and full living iteration loop',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'living-project-'));try{
    const projectDir=join(temp,'alpha-twin');const created=await createLivingProject({name:'Alpha Twin',outDir:projectDir,managerIntent:'Maintain a validated conceptual twin from customer, code and runtime evidence.'});
    const external=join(temp,'customer file.md');await writeFile(external,'# External customer source\n');const withExternal=await addProjectSource(created.configPath,'customer',external);assert.equal(withExternal.sources.some(x=>x.path.includes('customer file.md')),true);
    const verified=await verifyLivingProject(created.configPath);assert.equal(verified.ok,true);const compose=await readFile(created.composePath,'utf8');assert.match(compose,/clickhouse:/);assert.match(compose,/docling:/);assert.match(compose,/project-watch/);assert.match(await readFile(join(projectDir,'.github/workflows/ci.yml'),'utf8'),/docker compose config/);
    const runtime=new LivingProjectRuntime(),out=join(projectDir,'.living-runtime');const first=await runtime.iterate(created.configPath,out,'deterministic');assert.equal(first.validation.ok,true);assert.equal(first.stages.find(x=>x.name==='development')?.status,'succeeded');assert.equal(first.stages.find(x=>x.name==='runtime')?.status,'succeeded');assert.match(await readFile(join(out,'current/scene.usda'),'utf8'),/LivingProject/);
    const second=await runtime.iterate(created.configPath,out,'deterministic');assert.equal(second.noChange,false);assert.equal(second.diff.added.some(x=>x.endsWith('feedback/latest.md')),true);const third=await runtime.iterate(created.configPath,out,'deterministic');assert.equal(third.noChange,true);
    const environmentPath=join(projectDir,'environment/current.json'),environment=JSON.parse(await readFile(environmentPath,'utf8'));environment.temperatureC=24;await writeFile(environmentPath,JSON.stringify(environment,null,2));const updated=await runtime.iterate(created.configPath,out,'deterministic');assert.equal(updated.noChange,false);assert.equal(updated.diff.changed.some(x=>x.endsWith('environment/current.json')),true);
    const currentBefore=await readFile(join(out,'current/scene.usda'),'utf8'),config=parseProjectDsl(await readFile(created.configPath,'utf8'));config.policy.approved=false;await writeFile(created.configPath,renderProjectDsl(config));const blocked=await runtime.iterate(created.configPath,out,'deterministic');assert.equal(blocked.validation.ok,false);assert.equal(await readFile(join(out,'current/scene.usda'),'utf8'),currentBefore);
  }finally{await rm(temp,{recursive:true,force:true});}
});
