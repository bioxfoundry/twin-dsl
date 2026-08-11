import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addProjectSource, addProjectWebsite, createLivingProject, syncProjectMirror, verifyLivingProject } from "../src/project/wizard.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";
import { sha256 } from "../src/core/canonical.js";

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
    const mirrorPath=join(projectDir,"project.json");
    const staleMirror=JSON.parse(await readFile(mirrorPath,"utf8"));
    staleMirror.policy.requireSignedMutationGrant=!staleMirror.policy.requireSignedMutationGrant;
    await writeFile(mirrorPath,JSON.stringify(staleMirror,null,2)+"\n");
    const drifted=await verifyLivingProject(created.configPath);
    assert.equal(drifted.ok,false);
    assert.equal(drifted.checks.find(check=>check.name==="project.json-mirror")?.ok,false);
    await syncProjectMirror(created.configPath);
    assert.equal((await verifyLivingProject(created.configPath)).ok,true);
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
    assert.equal(await exists(join(projectDir,"vendor/runtime/error/catalog.json")),true,"standalone error reference is vendored");
    const runtimeDockerfile=await readFile(join(projectDir,"vendor/runtime/Dockerfile"),"utf8");
    assert.match(runtimeDockerfile,/COPY scripts\/cad-to-gltf\.py \.\/scripts\/cad-to-gltf\.py/);
    assert.match(runtimeDockerfile,/COPY public \.\/public/);
    assert.match(runtimeDockerfile,/COPY error \.\/error/);
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
    assert.match(start,/DT_DASHBOARD_READ_ONLY=1/);
    assert.match(start,/bash scripts\/iterate\.sh/);
    assert.match(start,/Active artifact: ACCEPTED/);
    assert.match(start,/Last completed iteration: ACCEPTED/);
    assert.match(start,/Latest evaluation: NO CHANGE \(no receipt or event appended\)/);
    assert.match(start,/Last persisted iteration receipt: \.living-runtime\/latest\.json/);
    assert.match(start,/Presentation evidence status: MISSING/);
    assert.match(start,/Presentation problem: CAPTURES_MISSING/);
    assert.equal(JSON.parse(await readFile(join(out,"latest.json"),"utf8")).noChange,false,"a no-change evaluation must not mislabel the last persisted receipt");
    assert.doesNotMatch(start,new RegExp(temp.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),"START must remain portable outside the generation environment");
    const presentationDir=join(out,"current/presentation");
    await mkdir(presentationDir,{recursive:true});
    const capture=Buffer.from("deterministic dashboard capture");
    await writeFile(join(presentationDir,"overview.png"),capture);
    await writeFile(join(presentationDir,"manifest.json"),JSON.stringify({
      schema:"subactor.presentation-evidence/v1",
      twinUri:first.twinUri,
      sceneUri:first.sceneUri,
      capturedAt:"2026-08-10T00:00:00Z",
      renderer:{name:"dashboard-webgl",version:"test"},
      captures:[{path:"overview.png",sha256:sha256(capture),bytes:capture.length,mediaType:"image/png",camera:{mode:"static",eye:[8,6,5],target:[0,0,0],up:[0,0,1],verticalFovDeg:45,trajectorySha256:null}}],
    },null,2)+"\n");
    const presentationUpdated=await runtime.iterate(created.configPath,out,"deterministic");
    assert.equal(presentationUpdated.noChange,false,"new presentation evidence must refresh deterministic reports");
    assert.equal(presentationUpdated.twinUri,first.twinUri,"presentation evidence must not mutate Twin content identity");
    assert.equal(presentationUpdated.sceneUri,first.sceneUri,"presentation evidence must not mutate Scene content identity");
    const presentationEvidence=JSON.parse(await readFile(join(out,"current/presentation-evidence.json"),"utf8"));
    assert.equal(presentationEvidence.status,"current");
    const presentationIntegrity=JSON.parse(await readFile(join(out,"current/project-integrity.json"),"utf8"));
    assert.equal(presentationIntegrity.findings.some((finding:{code:string})=>finding.code.startsWith("PRESENTATION_EVIDENCE_")),false);

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
    const blockedStart=await readFile(join(projectDir,"START.md"),"utf8");
    assert.match(blockedStart,/Active artifact: ACCEPTED/);
    assert.match(blockedStart,/Last completed iteration: REJECTED/);
    assert.match(blockedStart,/Latest evaluation: CHANGED \(receipt and event persisted\)/);
    assert.match(blockedStart,/Latest diagnostic scope: \.living-runtime\/candidate/);
  }finally{
    await rm(temp,{recursive:true,force:true});
  }
});
