import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contentUri, sha256 } from "../src/core/canonical.js";
import { matchesJsonSchema } from "../src/core/json-schema.js";
import type { SceneDocument, TwinDocument } from "../src/core/types.js";
import { inspectPresentationEvidence, presentationDirectoryFingerprint, renderPresentationEvidenceDsl, validatePresentationEvidence } from "../src/runtime/presentation-evidence.js";

const twin:TwinDocument={schema:"subactor.twin/v1",id:"presentation-twin",kind:"physical",observedAt:"2026-08-10T00:00:00Z",sourceSnapshotHash:"a".repeat(64),components:[]};
const scene:SceneDocument={schema:"subactor.scene/v1",id:"presentation-scene",format:"openusd",sourceTwinId:twin.id,bindings:[]};

test("presentation evidence distinguishes missing, unverified, current, stale and tampered captures",async()=>{
  const root=await mkdtemp(join(tmpdir(),"presentation-evidence-"));
  try {
    assert.equal((await inspectPresentationEvidence(root,twin,scene)).status,"missing");
    const capture=Buffer.from("not a real PNG, but hash verification is format-independent");
    await writeFile(join(root,"overview.png"),capture);
    const unverified=await inspectPresentationEvidence(root,twin,scene);
    assert.equal(unverified.status,"unverified");
    assert.deepEqual(unverified.problems,["MANIFEST_MISSING"]);
    const before=await presentationDirectoryFingerprint(root);
    const manifest={
      schema:"subactor.presentation-evidence/v1",
      twinUri:contentUri("twin",twin),sceneUri:contentUri("scene",scene),
      capturedAt:"2026-08-10T00:00:00Z",renderer:{name:"dashboard-webgl",version:"0.5.31"},
      captures:[{path:"overview.png",sha256:sha256(capture),bytes:capture.length,mediaType:"image/png"}],
    };
    assert.deepEqual(validatePresentationEvidence(manifest),manifest);
    const definition=JSON.parse(await readFile(join(process.cwd(),"schemas/presentation-evidence.schema.json"),"utf8"));
    assert.equal(matchesJsonSchema(definition,manifest),true,"published schema and runtime validator accept the same valid manifest");
    await writeFile(join(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    const current=await inspectPresentationEvidence(root,twin,scene);
    assert.equal(current.status,"current");
    assert.match(renderPresentationEvidenceDsl(current),/STATUS CURRENT/);
    assert.notEqual(await presentationDirectoryFingerprint(root),before,"adding a manifest invalidates the iteration key");
    await writeFile(join(root,"manifest.json"),JSON.stringify({...manifest,sceneUri:`urn:subactor:scene:sha256:${"b".repeat(64)}`},null,2)+"\n");
    assert.deepEqual((await inspectPresentationEvidence(root,twin,scene)).problems,["SCENE_REVISION_STALE"]);
    await writeFile(join(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    await writeFile(join(root,"overview.png"),Buffer.from("tampered"));
    const invalid=await inspectPresentationEvidence(root,twin,scene);
    assert.equal(invalid.status,"invalid");
    assert.deepEqual(invalid.problems,["CAPTURE_DIGEST_MISMATCH:overview.png"]);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("presentation manifest rejects traversal, duplicate paths and unknown fields",()=>{
  const base={schema:"subactor.presentation-evidence/v1",twinUri:contentUri("twin",twin),sceneUri:contentUri("scene",scene),capturedAt:"2026-08-10T00:00:00Z",renderer:{name:"dashboard",version:"1"},captures:[{path:"overview.png",sha256:"a".repeat(64),bytes:1,mediaType:"image/png"}]};
  assert.throws(()=>validatePresentationEvidence({...base,captures:[{...base.captures[0],path:"../overview.png"}]}),/PRESENTATION_CAPTURE_INVALID/);
  assert.throws(()=>validatePresentationEvidence({...base,captures:[base.captures[0],base.captures[0]]}),/PRESENTATION_CAPTURE_DUPLICATE/);
  assert.throws(()=>validatePresentationEvidence({...base,twinUri:"urn:subactor:twin:sha256:abc"}),/PRESENTATION_EVIDENCE_HEADER_INVALID/);
  assert.throws(()=>validatePresentationEvidence({...base,note:"trust me"}),/PRESENTATION_EVIDENCE_UNKNOWN_KEY/);
});
