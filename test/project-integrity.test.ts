import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProjectIntegrity, renderProjectIntegrityDsl } from "../src/runtime/project-integrity.js";
import type { ProjectIntegrityInput } from "../src/runtime/project-integrity.js";

function validInput():ProjectIntegrityInput {
  const resource=(id:string,role:"manager"|"project")=>({schema:"subactor.resource/v1" as const,id,uri:`urn:resource:${id}`,logicalUri:`repo://${id}`,mediaType:"text/markdown",sha256:id.padEnd(64,"0"),size:1,sourcePath:`/${id}.md`,sourceRole:role,derived:false,derivedFrom:[],createdAt:"2026-01-01T00:00:00Z"});
  return {
    project:{schema:"subactor.living-project/v1",id:"deep-project",name:"Deep project",profile:"generic",managerIntent:"Build from traceable requirements.",sources:[],development:{root:"."},observations:{paths:[],logicalRoot:"runtime"},policy:{approved:true,requireResearch:true,requireDevelopmentEvidence:true,requireDevelopmentAcceptance:true,allowDevelopmentFixture:false,requireRuntimeEvidence:true,autoPublishScene:true,allowRuntimeSelfModification:false,autonomyMode:"observe",requireSignedMutationGrant:false,maxIterationsPerHour:10,maxConsecutiveFailures:3},scene:{format:"openusd"}},
    resources:[resource("manager","manager"),resource("design","project")],
    development:{schema:"subactor.development-evidence/v1",source:"todo2code",graphFingerprint:"abc",recordCount:1,relationCount:1,diagnosticCount:0,blockingDiagnosticCount:0,acceptance:"accepted",manifestStatus:"succeeded",evidenceUris:["urn:intent:1"]},
    observations:{schema:"subactor.observation/v1",id:"obs",sourceSnapshotHash:"abc",observations:[{id:"o1",observedAt:"2026-01-01T00:00:00Z",subjectUri:"subactor://system/a",metric:"health",value:true,severity:"info",sourceUris:["urn:runtime:1"],labels:[]}]},
    twin:{schema:"subactor.twin/v1",id:"twin-1",kind:"system",observedAt:"2026-01-01T00:00:00Z",sourceSnapshotHash:"abc",components:[{id:"a",type:"service",sourceUris:["urn:resource:design"],properties:{label:"A"},children:[]}]},
    scene:{schema:"subactor.scene/v1",id:"scene-1",format:"openusd",sourceTwinId:"twin-1",bindings:[{twinUri:"urn:twin:1#a",componentId:"a",scenePath:"/A",primitive:"cube",assetUri:"urn:asset:a",position:[0,0,0],size:[1,1,1],orientation:[0,0,0,1],propertyMap:{}}]},
    geometry:{schema:"subactor.geometry-validation/v1",evidenceId:"survey",method:"world-aabb",ok:true,complete:true,coverage:{bindings:1,positionEvidence:1,sizeEvidence:1,orientationEvidence:1,constraints:1},checks:[{id:"p",kind:"position",subjectId:"a",ok:true,actual:0,limit:.01,unit:"m",message:"ok"}],failures:[]},
    physicalEvidence:{schema:"subactor.physical-evidence/v1",id:"survey",coordinateSystem:{unit:"m",upAxis:"Z"},records:[{componentId:"a",kind:"equipment",evidence:"verified",sourceRef:"ifc:guid-a"}],constraints:[{id:"inside",relation:"inside",subjectId:"a",objectId:"a",marginM:0}]},
    generationAudits:[],
  };
}

test("cross-layer integrity can prove a fully evidenced dependency chain",()=>{
  const report=analyzeProjectIntegrity(validInput());
  assert.equal(report.ok,true);
  assert.equal(report.complete,true);
  assert.equal(report.coverage.evidencedLayers,8);
  assert.equal(report.coverage.validatedDependencies,report.coverage.dependencies);
  assert.equal(report.findings.length,0);
  const dsl=renderProjectIntegrityDsl(report);
  assert.match(dsl,/^```projectintegritydsl/m);
  assert.match(dsl,/COMPLETENESS COMPLETE/);
  assert.match(dsl,/DEPENDENCY twin-to-scene/);
  assert.match(dsl,/RESULT PASS/);
});

test("cross-layer integrity separates contradictions from incomplete assumptions",()=>{
  const input=validInput();
  input.scene.sourceTwinId="stale-twin";
  input.scene.bindings[0].size=[-1,1,1];
  delete input.scene.bindings[0].assetUri;
  input.geometry.complete=false;
  input.geometry.coverage.orientationEvidence=0;
  input.geometry.coverage.requiredChecks=3;
  input.geometry.coverage.passedRequiredChecks=2;
  input.geometry.requirementResults=[{componentId:"a",required:["position","size","orientation"],satisfied:["position","size"],missing:["orientation"]}];
  const report=analyzeProjectIntegrity(input);
  assert.equal(report.ok,false,"invalid parameters and broken revision links are contradictions");
  assert.equal(report.complete,false);
  assert.ok(report.findings.some(finding=>finding.code==="SCENE_SIZE_INVALID"&&finding.category==="invalid-parameter"));
  assert.ok(report.findings.some(finding=>finding.code==="SCENE_TWIN_REVISION_MISMATCH"&&finding.category==="broken-dependency"));
  assert.ok(report.findings.some(finding=>finding.code==="CONCEPTUAL_GEOMETRY_ASSUMPTION"&&finding.category==="ungrounded-assumption"));
  assert.ok(report.findings.some(finding=>finding.code==="GEOMETRY_VALIDATION_INCOMPLETE"&&finding.severity==="warning"));
  assert.deepEqual(report.findings.find(finding=>finding.code==="GEOMETRY_VALIDATION_INCOMPLETE")?.subjects,["a:orientation"]);
  assert.match(report.findings.find(finding=>finding.code==="GEOMETRY_VALIDATION_INCOMPLETE")?.message??"",/2\/3 required checks.*orientation=1/);
  assert.ok(report.repairProcesses.every(process=>process.uri.startsWith("subactor://process/repair/project-integrity/")));
});

test("failed geometry receipt becomes an exact repairable integrity finding",()=>{
  const input=validInput();
  input.geometryBuildReceipts=[{
    schema:"subactor.geometry-build-receipt/v1",id:"lid-build",status:"failed",
    processUri:"subactor://process/geometry/openscad/compile",
    repairProcess:"subactor://process/repair/geometry/reconcile-source-evidence",cacheHit:true,
    startedAt:"2026-01-01T00:00:00Z",completedAt:"2026-01-01T00:00:01Z",
    source:{path:"lid.scad",uri:"urn:source:lid",sha256:"a".repeat(64),format:"scad"},
    target:{componentId:"a",scenePath:"/A",kind:"equipment"},
    coordinateSystem:{unit:"millimeter",upAxis:"Z",handedness:"right"},
    engine:{name:"openscad",version:"2021.01"},
    dependencies:{expected:[],actual:[],dependencySetHash:"b".repeat(64),drift:[]},
    parameterSetHash:"c".repeat(64),validationPolicyHash:"d".repeat(64),geometryBuildHash:"e".repeat(64),geometryHashProfile:"subactor.semantic-triangle-soup/v2",artifacts:{},
    validation:{ok:false,nonEmpty:true,finite:true,dependencyClosure:true,triangleCount:1,unit:"millimeter",glbLoad:true,usdStageOpen:false,usdValidationAvailable:false,failures:["GEOMETRY_REFERENCE_EXTENT_DRIFT"]},
    error:{code:"urn:subactor:error:geometry:geometry-reference-extent-drift",message:"actual height 14 mm differs from reference 18 mm"},
  }];
  const report=analyzeProjectIntegrity(input);
  const finding=report.findings.find(item=>item.code==="GEOMETRY_REFERENCE_EXTENT_DRIFT");
  assert.equal(report.ok,false);
  assert.equal(finding?.repairProcess,"subactor://process/repair/geometry/reconcile-source-evidence");
  assert.deepEqual(finding?.subjects,["a","lid-build"]);
});

test("measured primitive proxy is not mislabeled as a conceptual assumption",()=>{
  const input=validInput();
  delete input.scene.bindings[0].assetUri;
  input.twin.components[0].properties={...input.twin.components[0].properties,spatialClass:"physical",geometryEvidence:"measured"};
  const report=analyzeProjectIntegrity(input);
  assert.equal(report.findings.some(finding=>finding.code==="CONCEPTUAL_GEOMETRY_ASSUMPTION"),false);
  assert.equal(report.coverage.assumptions,0);
});

test("unbound presentation files are incomplete evidence, not a passing current capture",()=>{
  const input=validInput();
  input.presentationEvidence={
    schema:"subactor.presentation-evidence-status/v1",status:"unverified",
    expectedTwinUri:"urn:subactor:twin:sha256:"+"a".repeat(64),expectedSceneUri:"urn:subactor:scene:sha256:"+"b".repeat(64),
    manifestPath:"presentation/manifest.json",captures:[{path:"overview.png",sha256:"c".repeat(64),bytes:10,mediaType:"image/png",camera:null}],
    problems:["MANIFEST_MISSING"],fingerprint:"d".repeat(64),
  };
  const report=analyzeProjectIntegrity(input);
  const finding=report.findings.find(item=>item.code==="PRESENTATION_EVIDENCE_UNVERIFIED");
  assert.equal(report.ok,true,"visual proof remains advisory and must not block a valid scene");
  assert.equal(report.complete,false);
  assert.equal(finding?.severity,"warning");
  assert.deepEqual(finding?.subjects,["MANIFEST_MISSING"]);
  assert.equal(finding?.repairProcess,"subactor://process/repair/project-integrity/capture-active-revision");
});
