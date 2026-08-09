import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addProjectSource, addProjectWebsite, createLivingProject, verifyLivingProject } from "../src/project/wizard.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";

async function exists(path:string):Promise<boolean>{try{await stat(path);return true;}catch{return false;}}

test("project wizard creates isolated Docker/CI project and full living iteration loop",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"living-project-"));
  try{
    const projectDir=join(temp,"alpha-twin");
    const created=await createLivingProject({name:"Alpha Twin",outDir:projectDir,managerIntent:"Maintain a validated conceptual twin from customer, code and runtime evidence."});
    const initialConfig=parseProjectDsl(await readFile(created.configPath,"utf8"));
    assert.equal(initialConfig.sources.some(source=>source.path==="data/archives"),false,"an empty archive inbox must not pretend to be evidence");
    assert.equal(await exists(join(projectDir,"data/archives")),true,"the archive inbox remains available for future imports");
    const external=join(temp,"customer file.md");
    await writeFile(external,"# External customer source\n");
    const withExternal=await addProjectSource(created.configPath,"customer",external);
    const imported=withExternal.sources.find(source=>source.role==="customer"&&source.labels?.includes("imported"));
    assert.ok(imported);
    assert.equal(imported.path.startsWith("imports/customer/"),true);
    assert.equal(await exists(resolve(projectDir,imported.path)),true);
    assert.match(await readFile(join(projectDir,"imports/manifest.jsonl"),"utf8"),/customer file\.md/);
    await addProjectWebsite(created.configPath,"https://example.test/docs",["digital twin","requirements"]);
    assert.match(await readFile(join(projectDir,"config/research.dql"),"utf8"),/ALLOW_HOSTS \["example\.test"\]/);

    const verified=await verifyLivingProject(created.configPath);
    assert.equal(verified.ok,true);
    const compose=await readFile(created.composePath,"utf8");
    assert.match(compose,/clickhouse:/);
    assert.match(compose,/docling:/);
    assert.match(compose,/project-watch/);
    const ci=await readFile(join(projectDir,".github/workflows/ci.yml"),"utf8");
    assert.match(ci,/bootstrap-todo2code/);
    assert.match(ci,/docker compose up -d --wait/);
    assert.match(ci,/runtime service-check/);
    const sourcePackage=JSON.parse(await readFile(resolve("package.json"),"utf8"));
    const vendoredPackage=JSON.parse(await readFile(join(projectDir,"vendor/runtime/package.json"),"utf8"));
    assert.equal(vendoredPackage.version,sourcePackage.version);
    assert.match(await readFile(join(projectDir,"README.md"),"utf8"),new RegExp(`Starter ${sourcePackage.version.replaceAll(".","\\.")}\\.`));
    assert.equal(await exists(join(projectDir,"vendor/runtime/scripts/cad-to-gltf.py")),true,"standalone geometry worker is vendored");
    assert.equal(await exists(join(projectDir,"vendor/runtime/public/dashboard.html")),true,"standalone dashboard assets are vendored");
    const runtimeDockerfile=await readFile(join(projectDir,"vendor/runtime/Dockerfile"),"utf8");
    assert.match(runtimeDockerfile,/COPY scripts\/cad-to-gltf\.py \.\/scripts\/cad-to-gltf\.py/);
    assert.match(runtimeDockerfile,/COPY public \.\/public/);
    assert.match(runtimeDockerfile,/apt-get install[^\n]*git openscad python3 unzip/);

    // Disable live web request for the local fixture test.
    const config=parseProjectDsl(await readFile(created.configPath,"utf8"));
    config.webResearch=undefined;
    await writeFile(created.configPath,renderProjectDsl(config));

    const runtime=new LivingProjectRuntime();
    const out=join(projectDir,".living-runtime");
    const first=await runtime.iterate(created.configPath,out,"deterministic");
    assert.equal(first.schema,"subactor.living-iteration/v2");
    assert.equal(first.validation.ok,true);
    assert.equal(first.stages.find(stage=>stage.name==="development")?.status,"succeeded");
    assert.equal(first.stages.find(stage=>stage.name==="runtime")?.status,"succeeded");
    assert.match(await readFile(join(out,"current/scene.usda"),"utf8"),/LivingProject/);
    assert.equal(await exists(join(out,"candidate/improvement.dsl")),true);
    const integrity=JSON.parse(await readFile(join(out,"current/project-integrity.json"),"utf8"));
    const improvement=JSON.parse(await readFile(join(out,"current/improvement.json"),"utf8"));
    for(const finding of integrity.findings) {
      assert.equal(
        improvement.actions.some((action:{targetUris:string[]})=>action.targetUris.includes(finding.repairProcess)),
        true,
        `improvementDSL must route ${finding.code} to ${finding.repairProcess}`,
      );
    }

    const second=await runtime.iterate(created.configPath,out,"deterministic");
    assert.equal(second.noChange,true);
    const start=await readFile(join(projectDir,"START.md"),"utf8");
    assert.match(start,/Project DSL: project\.projectdsl/);
    assert.match(start,/Runtime root: \.living-runtime/);
    assert.match(start,/node vendor\/runtime\/dist\/src\/cli\/main\.js dashboard project\.projectdsl \.living-runtime/);
    assert.doesNotMatch(start,new RegExp(temp.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),"START must remain portable outside the generation environment");
    const third=await runtime.iterate(created.configPath,out,"deterministic");
    assert.equal(third.noChange,true);

    const environmentPath=join(projectDir,"environment/current.json");
    const environment=JSON.parse(await readFile(environmentPath,"utf8"));
    environment.temperatureC=24;
    await writeFile(environmentPath,JSON.stringify(environment,null,2));
    const updated=await runtime.iterate(created.configPath,out,"deterministic");
    assert.equal(updated.noChange,false);
    assert.equal(updated.diff.changed.some(path=>path.endsWith("environment/current.json")),true);

    const currentBefore=await readFile(join(out,"current/scene.usda"),"utf8");
    const blockedConfig=parseProjectDsl(await readFile(created.configPath,"utf8"));
    blockedConfig.policy.approved=false;
    await writeFile(created.configPath,renderProjectDsl(blockedConfig));
    const blocked=await runtime.iterate(created.configPath,out,"deterministic");
    assert.equal(blocked.validation.ok,false);
    assert.equal(await readFile(join(out,"current/scene.usda"),"utf8"),currentBefore);
  }finally{
    await rm(temp,{recursive:true,force:true});
  }
});
