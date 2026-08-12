/**
 * Dashboard service smoke test: the endpoints the 3D view depends on must serve a coherent
 * twin/scene pair, and intake through the service must keep component identity stable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { sha256 } from "../src/core/canonical.js";
import { startDashboard } from "../src/serve/dashboard.js";
import { createLivingProject } from "../src/project/wizard.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";
import type { MathDocument, SceneDocument, TwinDocument } from "../src/core/types.js";

test("dashboard reports an occupied port as a deterministic diagnostic", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-dashboard-port-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await startDashboard({
    configPath: join(root, "first", "project.projectdsl"),
    outDir: join(root, "first-runtime"),
    port: 0,
  });
  t.after(() => first.close());
  const port = Number(new URL(first.url).port);
  await assert.rejects(
    startDashboard({
      configPath: join(root, "second", "project.projectdsl"),
      outDir: join(root, "second-runtime"),
      port,
    }),
    (error: unknown) => error instanceof Error && error.message === `DASHBOARD_PORT_IN_USE:127.0.0.1:${port}`,
  );
});

test("dashboard serves the live twin, scene and USD, and applies intake durably", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-dashboard-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await createLivingProject({
    name: "Dashboard Factory",
    outDir: join(root, "project"),
    profile: "biofoundry",
    managerIntent: "Serve the factory over HTTP.",
  });
  const outDir = join(root, "runtime");
  await new LivingProjectRuntime().iterate(created.configPath, outDir, "deterministic");
  const math = JSON.parse(await readFile(join(outDir, "current/math.json"), "utf8")) as MathDocument;
  for (const binding of math.bindings.filter((item) => item.name.startsWith("Has") || item.name.endsWith("Ready"))) {
    assert.equal(binding.sourceUris.length, 1, `${binding.name} must cite one immutable EvidenceSet instead of the full corpus`);
    assert.match(binding.sourceUris[0], /^urn:subactor:evidence-set:sha256:/);
  }

  // Port 0 lets the OS pick a free port so the suite never collides with a running dashboard.
  const server = await startDashboard({ configPath: created.configPath, outDir, port: 0 });
  t.after(() => server.close());

  const state = (await (await fetch(`${server.url}api/state`)).json()) as {
    artifactScope: string;
    renderedScope: string;
    diagnosticScope: string;
    active: { status: string; revisionUri: string; sourceSnapshotHash: string; twin: TwinDocument; scene: SceneDocument };
    latestCandidate: unknown;
    twin: TwinDocument;
    scene: SceneDocument;
    processModel: { schema: string; coverage: { processes: number } };
    processAnimation: { schema: string; timing: { factualProcessDuration: boolean; mode: string } };
    mqtt: { schema: string; configured: boolean; authority: string; connection: string };
    projectIntegrity: { schema: string; ok: boolean };
  };
  assert.ok(state.twin.components.length > 0, "no twin components served");
  const flatten=(items:TwinDocument["components"]):TwinDocument["components"]=>items.flatMap(component=>[component,...flatten(component.children)]);
  assert.equal(state.scene.bindings.length, flatten(state.twin.components).length);
  assert.equal(state.scene.sourceTwinId, state.twin.id);
  assert.equal(state.projectIntegrity.schema, "subactor.project-integrity/v1");
  assert.equal(state.processModel.schema, "subactor.process/v1");
  assert.equal(state.processAnimation.schema, "subactor.process-animation/v1");
  assert.equal(state.processAnimation.timing.factualProcessDuration, false);
  assert.equal(state.processAnimation.timing.mode, "normalized-presentation");
  assert.equal(state.mqtt.schema, "subactor.mqtt-dashboard-state/v1");
  assert.equal(state.mqtt.configured, false);
  assert.equal(state.mqtt.authority, "observe-only");
  assert.equal(state.active.status, "accepted");
  assert.match(state.active.revisionUri, /^urn:subactor:twin:sha256:/);
  assert.equal(state.active.sourceSnapshotHash, state.twin.sourceSnapshotHash);
  assert.equal(state.active.scene.id, state.scene.id);
  assert.equal(state.latestCandidate, null);
  assert.equal(state.artifactScope, "current");
  assert.equal(state.renderedScope, "current");
  assert.equal(state.diagnosticScope, "current");

  const dashboardHtml = await (await fetch(server.url)).text();
  const embeddedScripts = [...dashboardHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(embeddedScripts.length > 0, "dashboard has no embedded JavaScript");
  for (const script of embeddedScripts) assert.doesNotThrow(() => new Script(script), "dashboard JavaScript must parse in a browser");
  assert.match(dashboardHtml, /function highlightJson/);
  assert.match(dashboardHtml, /function highlightDsl/);
  assert.match(dashboardHtml, /escapeCode\(d\.content\)|highlightDsl\(d\.content\)/);
  assert.match(dashboardHtml, /id="last-iteration"/);
  assert.match(dashboardHtml, /iteration v\$\{version/);
  assert.match(dashboardHtml, /latest\.occurredAt\|\|latest\.recordedAt/);
  assert.match(dashboardHtml, /orientation:b\.orientation/);
  assert.match(dashboardHtml, /normalizeAssetMesh/);
  assert.match(dashboardHtml, /M4\.trs\(o\.pos,o\.size\.map\(value=>value\*visual\.scale\),o\.orientation\)/);
  assert.match(dashboardHtml, /const spatialVolume=/);
  assert.match(dashboardHtml, /candidate rejected · active preserved/);
  assert.match(dashboardHtml, /position:\[7\.5,9,1\.6\]/);
  assert.match(dashboardHtml, /id="p-validation"/);
  assert.match(dashboardHtml, /state\.projectIntegrity/);
  assert.match(dashboardHtml, /id="r-active"/);
  assert.match(dashboardHtml, /id="r-candidate"/);
  assert.match(dashboardHtml, /id="s-mesh"/);
  assert.match(dashboardHtml, /id="s-unique-mesh"/);
  assert.match(dashboardHtml, /id="a-validation"/);
  assert.match(dashboardHtml, /state\.assemblyReport/);
  assert.match(dashboardHtml, /id="process-select"/);
  assert.match(dashboardHtml, /id="btn-process-play"/);
  assert.match(dashboardHtml, /Success path/);
  assert.match(dashboardHtml, /Failure path/);
  assert.match(dashboardHtml, /function processVisual/);
  assert.match(dashboardHtml, /id="stage-labels"/);
  assert.match(dashboardHtml, /function activeProcessLabelContext/);
  assert.match(dashboardHtml, /function stationForObject/);
  assert.match(dashboardHtml, /function projectStagePoint/);
  assert.match(dashboardHtml, /paintStageLabels\(vp,w,h,now\)/);
  assert.match(dashboardHtml, /context\.step\.label/);
  assert.match(dashboardHtml, /selected element/);
  assert.match(dashboardHtml, /presentation only/);
  assert.match(dashboardHtml, /process-parameters/);
  assert.match(dashboardHtml, /fragment\.split\('#'\)\.pop\(\)/);
  assert.match(dashboardHtml, /PROCESS_MODEL=state\.processModel/);
  assert.match(dashboardHtml, /state\.processAnimation/);
  assert.match(dashboardHtml, /id="mqtt-mode"/);
  assert.match(dashboardHtml, /function paintMqttPanel/);
  assert.match(dashboardHtml, /adoptMqttState\(state\.mqtt\|\|null\)/);
  assert.match(dashboardHtml, /fetch\('\/api\/mqtt'\)/);
  assert.match(dashboardHtml, /\/api\/mqtt\/mode/);
  assert.match(dashboardHtml, /canvas\.captureStream\(30\)/);
  assert.match(dashboardHtml, /OES_element_index_uint/);
  assert.match(dashboardHtml, /drawElements\(gl\.TRIANGLES/);
  assert.match(dashboardHtml, /Focus selected/);
  assert.match(dashboardHtml, /o\.prim==='scope'&&!o\.assetUri/);
  assert.match(dashboardHtml, /function isDescendantOf/);
  assert.match(dashboardHtml, /INSPECTION_IDS=new Set/);
  assert.match(dashboardHtml, /renderableObjects=OBJECTS\.filter/);
  assert.match(dashboardHtml, /assembly objects/);
  assert.match(dashboardHtml, /MediaRecorder\.isTypeSupported/);
  assert.match(dashboardHtml, /EMPTY_VIDEO_BLOB/);
  assert.match(dashboardHtml, /recorder\.start\(1000\)/);
  assert.match(dashboardHtml, /id="error-card"/);
  assert.match(dashboardHtml, /showErrorReference/);
  assert.match(dashboardHtml, /Open error\/\$\{code\}\.md/);
  assert.match(dashboardHtml, /Analysis report/);
  assert.match(dashboardHtml, /\/api\/analysis\?format=md/);
  assert.match(dashboardHtml, /id="btn-copy-json"/);
  assert.match(dashboardHtml, /subactor\.dashboard-stage-debug\/v1/);
  assert.match(dashboardHtml, /function stageDebugSnapshot/);
  assert.match(dashboardHtml, /outerHTML:stage\.outerHTML/);
  assert.match(dashboardHtml, /dataUrl:canvas\.toDataURL\('image\/png'\)/);
  assert.match(dashboardHtml, /objects:OBJECTS\.map\(debugRendererObject\)/);
  assert.match(dashboardHtml, /runtime:\{state:DASHBOARD_STATE,events:DASHBOARD_EVENTS,dsl:DASHBOARD_DSL\}/);
  assert.match(dashboardHtml, /window\.__TWIN_STAGE_DEBUG__=snapshot/);
  assert.match(dashboardHtml, /navigator\.clipboard&&navigator\.clipboard\.writeText/);
  assert.match(dashboardHtml, /document\.execCommand\('copy'\)/);
  assert.match(dashboardHtml, /STAGE_JSON_CLIPBOARD_FAILED/);
  assert.ok(dashboardHtml.includes("active ${activeRevision.slice(-12)}"));

  const errorReferenceResponse = await fetch(`${server.url}api/errors/SCENE_BLUEPRINT_COMPONENT_INVALID`);
  const errorReference = await errorReferenceResponse.json() as {
    schema: string; code: string; meaning: string; causes: string[]; resolution: string; documentation: string;
  };
  assert.equal(errorReferenceResponse.status, 200);
  assert.equal(errorReference.schema, "bioxfoundry.error-reference/v1");
  assert.equal(errorReference.code, "SCENE_BLUEPRINT_COMPONENT_INVALID");
  assert.match(errorReference.meaning, /scene blueprint component/i);
  assert.ok(errorReference.causes.some((cause) => cause.includes("spatialClass")));
  assert.match(errorReference.resolution, /spatialClass/);
  assert.equal(errorReference.documentation, "/error/SCENE_BLUEPRINT_COMPONENT_INVALID.md");
  const errorMarkdown = await (await fetch(`${server.url}error/SCENE_BLUEPRINT_COMPONENT_INVALID.md`)).text();
  assert.match(errorMarkdown, /^---[\s\S]+# SCENE_BLUEPRINT_COMPONENT_INVALID/);
  assert.match(errorMarkdown, /## Resolution/);
  const missingReferenceResponse = await fetch(`${server.url}api/errors/DOES_NOT_EXIST`);
  const missingReference = await missingReferenceResponse.json() as { error: string; documentation: string };
  assert.equal(missingReferenceResponse.status, 404);
  assert.equal(missingReference.error, "ERROR_REFERENCE_NOT_FOUND");
  assert.equal(missingReference.documentation, "/error/ERROR_REFERENCE_NOT_FOUND.md");

  const eventLog = (await (await fetch(`${server.url}api/events`)).json()) as {
    schema: string; ok: boolean; count: number; events: unknown[];
  };
  assert.equal(eventLog.schema, "subactor.event-log-view/v1");
  assert.equal(eventLog.ok, true);
  assert.ok(eventLog.count > 0);
  assert.ok(eventLog.events.length > 0);

  const dslLog = (await (await fetch(`${server.url}api/dsl`)).json()) as {
    schema: string; documents: Array<{ name: string; content: string }>;
  };
  assert.equal(dslLog.schema, "subactor.dsl-log-view/v1");
  assert.ok(dslLog.documents.some((document) => document.name === "observations.dsl"));
  assert.ok(dslLog.documents.some((document) => document.name === "project-integrity.dsl"));
  assert.ok(dslLog.documents.some((document) => document.name === "presentation-evidence.dsl"));
  assert.ok(dslLog.documents.some((document) => document.name === "evidence-sets.dsl"));
  assert.ok(dslLog.documents.some((document) => document.name === "process.dsl"));
  assert.ok(dslLog.documents.some((document) => document.name === "process-animation.dsl"));
  assert.ok(dslLog.documents.some((document) => document.name === "analysis-trace.dsl"));
  assert.equal(dslLog.documents.some((document) => document.name.startsWith("latest-candidate/")),false,"an accepted staging directory is not a rejected candidate");
  assert.ok(dslLog.documents.every((document) => document.content.length > 0));
  const analysisResponse=await fetch(`${server.url}api/analysis?format=md`);
  assert.equal(analysisResponse.status,200);
  assert.match(await analysisResponse.text(),/^---[\s\S]*# Analysis trace/m);
  const analysisJson=await (await fetch(`${server.url}api/analysis?format=json`)).json() as {schema:string;generator:{runtimeGeneration:string};decisions:unknown[]};
  assert.equal(analysisJson.schema,"subactor.analysis-trace/v1");
  assert.ok(analysisJson.generator.runtimeGeneration);
  assert.ok(analysisJson.decisions.length>0);
  const analysisManifest=JSON.parse(await readFile(join(outDir,"current/analysis-manifest.json"),"utf8")) as {schema:string;traceUri:string;artifacts:Record<string,string>};
  assert.equal(analysisManifest.schema,"subactor.analysis-trace-manifest/v1");
  for(const [name,digest] of Object.entries(analysisManifest.artifacts)) {
    const artifactRoot=name.startsWith("analysis-trace.")?join(outDir,"current"):join(outDir,"analysis-history",(JSON.parse(await readFile(join(outDir,"analysis-history/latest.json"),"utf8")) as {directory:string}).directory);
    assert.equal(sha256(await readFile(join(artifactRoot,name))),digest,`${name} manifest hash drifted`);
  }
  const historyPointer=JSON.parse(await readFile(join(outDir,"analysis-history/latest.json"),"utf8")) as {schema:string;traceUri:string;directory:string};
  assert.equal(historyPointer.schema,"subactor.analysis-trace-pointer/v1");
  assert.equal(historyPointer.traceUri,analysisManifest.traceUri);
  assert.equal(await readFile(join(outDir,"analysis-history",historyPointer.directory,"analysis-trace.json"),"utf8"),await readFile(join(outDir,"current/analysis-trace.json"),"utf8"));
  const sourceRoot=join(created.projectDir,"data/project");
  const sourcePath=join(sourceRoot,"spec.md");
  const sourceText="# Grounded source\n\nExact bytes are revision checked.\n";
  await mkdir(sourceRoot,{recursive:true});
  await writeFile(sourcePath,sourceText);
  const sourceArtifact="subactor://markdown/spec.md";
  const sourceRevision=sha256(sourceText);
  const citedSourceResponse=await fetch(`${server.url}api/source?artifact=${encodeURIComponent(sourceArtifact)}&revision=${sourceRevision}`);
  assert.equal(citedSourceResponse.status,200);
  assert.equal(await citedSourceResponse.text(),sourceText);
  assert.equal(citedSourceResponse.headers.get("x-subactor-artifact-uri"),sourceArtifact);
  assert.equal(citedSourceResponse.headers.get("x-subactor-revision-sha256"),sourceRevision);
  const driftedSourceResponse=await fetch(`${server.url}api/source?artifact=${encodeURIComponent(sourceArtifact)}&revision=${"0".repeat(64)}`);
  assert.equal(driftedSourceResponse.status,404);
  assert.equal((await driftedSourceResponse.json() as {code:string}).code,"SOURCE_REVISION_NOT_FOUND");
  const unsafeSourceResponse=await fetch(`${server.url}api/source?artifact=${encodeURIComponent("subactor://markdown/../secret.md")}&revision=${sourceRevision}`);
  assert.equal(unsafeSourceResponse.status,400);
  assert.equal((await unsafeSourceResponse.json() as {code:string}).code,"SOURCE_CITATION_INVALID");
  const dashboardLog = await readFile(join(created.projectDir, "logs/dashboard-0.log"), "utf8");
  assert.match(dashboardLog, /"event":"server:listening"/);

  const usda = await (await fetch(`${server.url}api/scene.usda`)).text();
  assert.match(usda, /^#usda 1\.0/);
  for (const binding of state.scene.bindings.slice(0, 5)) {
    assert.ok(usda.includes(binding.scenePath), `USD is missing ${binding.scenePath}`);
  }

  const before = flatten(state.twin.components).map((c) => c.id);
  const target = before.includes("build") ? "build" : before[0];
  const intake = await fetch(`${server.url}api/intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schema: "subactor.physical-evidence/v1",
      id: "dashboard-test",
      coordinateSystem: { unit: "m", upAxis: "Z" },
      records: [
        { componentId: target, kind: "space", evidence: "cad", size: [12.4, 14.2, 3.2], sourceRef: "plan:test" },
        { componentId: "definitely_not_a_component", kind: "equipment", evidence: "ifc", size: [1, 1, 1] },
      ],
    }),
  });
  const result = (await intake.json()) as { report: { applied: unknown[]; rejected: { reason: string }[]; componentIdsStable: boolean; scenePathsStable: boolean } };
  assert.equal(intake.status, 200);
  assert.equal(result.report.applied.length, 1);
  assert.equal(result.report.rejected[0].reason, "UNKNOWN_COMPONENT");
  assert.equal(result.report.componentIdsStable, true);
  assert.equal(result.report.scenePathsStable, true);

  // Durable: the evidence file and the projectDSL key survive, so a reload shows the same geometry.
  assert.match(await readFile(created.configPath, "utf8"), /SCENE_PHYSICAL_EVIDENCE_FILE/);
  const after = (await (await fetch(`${server.url}api/state`)).json()) as { twin: TwinDocument; scene: SceneDocument };
  assert.deepEqual(flatten(after.twin.components).map((c) => c.id), before, "intake must not change component identity");
  const bound = after.scene.bindings.find((b) => b.componentId === target);
  assert.deepEqual(bound?.size, [12.4, 14.2, 3.2]);
});

test("dashboard exposes an observe-only MQTT source selector without granting device control", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-dashboard-mqtt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const created = await createLivingProject({ name: "MQTT Dashboard", outDir: join(root, "project"), profile: "biofoundry" });
  const bindingPath = join(root, "mqtt-bindings.dsl");
  await writeFile(bindingPath, `MQTT_BINDINGS dashboard-test
DEFAULT_MODE simulation
AUTHORITY observe-only
BROKER local
URL_ENV TEST_MQTT_URL_INTENTIONALLY_UNSET
CLIENT_ID "dashboard-test"
KEEP_ALIVE_SECONDS 30
END_BROKER
PROCESS_ROUTE test-process
BROKER_ID local
TOPIC "biofoundry/{mode}/process/test_process/events"
QOS 0
PROCESS_ID test_process
PROCESS_URI twin://biofoundry/process/query/test_process
MODES [simulation,shadow,hardware]
END_PROCESS_ROUTE
END_MQTT_BINDINGS
`);
  const server = await startDashboard({ configPath: created.configPath, outDir: join(root, "runtime"), port: 0, mqttBindingPath: bindingPath });
  t.after(() => server.close());
  const before = await (await fetch(`${server.url}api/state`)).json() as { mqtt: { configured: boolean; mode: string; connection: string; authority: string } };
  assert.equal(before.mqtt.configured, true);
  assert.equal(before.mqtt.mode, "simulation");
  assert.equal(before.mqtt.connection, "disconnected");
  assert.equal(before.mqtt.authority, "observe-only");
  const response = await fetch(`${server.url}api/mqtt/mode`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "hardware" }) });
  const selected = await response.json() as { mode: string; authority: string };
  assert.equal(response.status, 200);
  assert.equal(selected.mode, "hardware");
  assert.equal(selected.authority, "observe-only");
});

test("dashboard iteration failure returns a stable code and error reference links", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-dashboard-error-reference-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const created = await createLivingProject({
    name: "Invalid Blueprint Factory",
    outDir: join(root, "project"),
    profile: "biofoundry",
  });
  const blueprintPath = join(created.projectDir, "baseline/scene-blueprint.json");
  const blueprint = JSON.parse(await readFile(blueprintPath, "utf8")) as { components: Array<Record<string, unknown>> };
  delete blueprint.components[0].spatialClass;
  await writeFile(blueprintPath, JSON.stringify(blueprint, null, 2) + "\n");

  const server = await startDashboard({ configPath: created.configPath, outDir: join(root, "runtime"), port: 0 });
  t.after(() => server.close());
  const response = await fetch(`${server.url}api/iterate`, { method: "POST" });
  const body = await response.json() as { error: string; detail: string; documentation: string; errorReference: string };
  assert.equal(response.status, 500);
  assert.equal(body.error, "SCENE_BLUEPRINT_COMPONENT_INVALID");
  assert.equal(body.detail, "SCENE_BLUEPRINT_COMPONENT_INVALID");
  assert.equal(body.documentation, "/error/SCENE_BLUEPRINT_COMPONENT_INVALID.md");
  assert.equal(body.errorReference, "/api/errors/SCENE_BLUEPRINT_COMPONENT_INVALID");
});

test("dashboard keeps rejected candidate diagnostics separate from the active scene", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-dashboard-revision-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const created = await createLivingProject({
    name: "Revision Factory",
    outDir: join(root, "project"),
    profile: "biofoundry",
    managerIntent: "Never render a rejected candidate.",
  });
  const outDir = join(root, "runtime");
  await new LivingProjectRuntime().iterate(created.configPath, outDir, "deterministic");
  const currentDir=join(outDir,"current"),candidateDir=join(outDir,"candidate");
  await mkdir(candidateDir,{recursive:true});
  const activeTwin=JSON.parse(await readFile(join(currentDir,"twin.json"),"utf8")) as TwinDocument;
  const candidateTwin={...activeTwin,sourceSnapshotHash:"ca".repeat(32)};
  const copyJson=async(name:string):Promise<void>=>writeFile(join(candidateDir,name),await readFile(join(currentDir,name)));
  await Promise.all(["scene.json","geometry-validation.json","geometry-builds.json","project-integrity.json"].map(copyJson));
  await writeFile(join(candidateDir,"twin.json"),JSON.stringify(candidateTwin));
  await writeFile(join(outDir,"latest.json"),JSON.stringify({
    iterationUri:"urn:subactor:iteration:sha256:"+"de".repeat(32),
    validation:{ok:false,failures:["GeometryBuildFailed:test"]},
  }));

  const server=await startDashboard({configPath:created.configPath,outDir,port:0});
  t.after(()=>server.close());
  const state=await (await fetch(`${server.url}api/state`)).json() as any;
  assert.equal(state.active.status,"accepted");
  assert.equal(state.active.sourceSnapshotHash,activeTwin.sourceSnapshotHash);
  assert.equal(state.twin.sourceSnapshotHash,activeTwin.sourceSnapshotHash,"compatibility twin remains ACTIVE");
  assert.equal(state.scene.id,state.active.scene.id,"rendered scene remains ACTIVE");
  assert.deepEqual(state.geometryValidation,state.active.geometryValidation,"top-level diagnostics describe ACTIVE");
  assert.deepEqual(state.projectIntegrity,state.active.projectIntegrity,"top-level integrity describes ACTIVE");
  assert.equal(state.latestCandidate.status,"rejected");
  assert.match(state.latestCandidate.revisionUri,/^urn:subactor:twin:sha256:/);
  assert.notEqual(state.latestCandidate.revisionUri,state.active.revisionUri,"candidate and ACTIVE have distinct content revisions");
  assert.equal(state.latestCandidate.sourceSnapshotHash,candidateTwin.sourceSnapshotHash);
  assert.deepEqual(state.latestCandidate.validation.failures,["GeometryBuildFailed:test"]);
  assert.equal(state.artifactScope,"current");
  assert.equal(state.renderedScope,"current");
  assert.equal(state.diagnosticScope,"candidate");
  const dslLog=await (await fetch(`${server.url}api/dsl`)).json() as {documents:Array<{name:string}>};
  assert.equal(dslLog.documents.some(document=>document.name==="latest-candidate/project-integrity.dsl"),true,"rejected candidate diagnostics remain inspectable");
});

test("read-only dashboard exposes state but rejects every runtime mutation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-dashboard-read-only-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const created = await createLivingProject({
    name: "Read Only Factory",
    outDir: join(root, "project"),
    profile: "biofoundry",
    managerIntent: "Expose one inspection replica without a second writer.",
  });
  const outDir = join(root, "runtime");
  await new LivingProjectRuntime().iterate(created.configPath, outDir, "deterministic");
  const server = await startDashboard({ configPath: created.configPath, outDir, port: 0, readOnly: true });
  t.after(() => server.close());

  const state = (await (await fetch(`${server.url}api/state`)).json()) as {
    control: { mode: string; mutationsEnabled: boolean };
  };
  assert.deepEqual(state.control, { mode: "read-only", mutationsEnabled: false });

  for (const path of ["api/iterate", "api/intake"]) {
    const response = await fetch(`${server.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: path.endsWith("intake") ? "{}" : undefined,
    });
    const body = await response.json() as { error: string; diagnostic: string };
    assert.equal(response.status, 403);
    assert.equal(body.error, "DASHBOARD_READ_ONLY");
    assert.equal(body.diagnostic, "DUPLICATE_TWIN_ITERATION_WRITER");
  }
});

/**
 * Regression: an intake must never discard evidence an earlier intake established.
 *
 * The original handler replaced `baseline/physical-evidence.json` wholesale before the
 * runtime validated it. A second, smaller — or wholly rejected — document therefore wiped
 * every previously applied record and sent those components back to `placeholder`, while
 * still answering 200. Reproduced against the real service, six hardened components at a time.
 */
test("intake accumulates: a later document never discards earlier evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-intake-merge-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await createLivingProject({
    name: "Merge Factory",
    outDir: join(root, "project"),
    profile: "biofoundry",
    managerIntent: "Accumulate physical evidence across intakes.",
  });
  const outDir = join(root, "runtime");
  await new LivingProjectRuntime().iterate(created.configPath, outDir, "deterministic");
  const server = await startDashboard({ configPath: created.configPath, outDir, port: 0 });
  t.after(() => server.close());

  const post = async (body: unknown): Promise<{ status: number; json: any }> => {
    const response = await fetch(`${server.url}api/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  };
  const gradeOf = async (id: string): Promise<string> => {
    const state = (await (await fetch(`${server.url}api/state`)).json()) as { twin: TwinDocument };
    return String(state.twin.components.find((c) => c.id === id)?.properties?.geometryEvidence ?? "");
  };

  const frame = { unit: "m", upAxis: "Z" } as const;

  // First intake hardens two components.
  const first = await post({
    schema: "subactor.physical-evidence/v1",
    id: "floor-plan",
    coordinateSystem: frame,
    records: [
      { componentId: "facility_shell", kind: "space", evidence: "ifc", size: [58.2, 34.6, 0.2], sourceRef: "ifc:A" },
      { componentId: "build", kind: "space", evidence: "cad", size: [12.4, 14.2, 3.2], sourceRef: "plan:A" },
    ],
  });
  assert.equal(first.status, 200);
  assert.equal(await gradeOf("facility_shell"), "ifc");
  assert.equal(await gradeOf("build"), "cad");

  // Second intake mentions only one *other* component.
  const second = await post({
    schema: "subactor.physical-evidence/v1",
    id: "equipment-register",
    coordinateSystem: frame,
    records: [
      { componentId: "test", kind: "space", evidence: "cad", size: [12.8, 14.2, 3.2], sourceRef: "plan:B" },
    ],
  });
  assert.equal(second.status, 200);
  assert.equal(await gradeOf("test"), "cad", "the new record applied");
  assert.equal(await gradeOf("facility_shell"), "ifc", "an unmentioned component keeps its evidence");
  assert.equal(await gradeOf("build"), "cad", "an unmentioned component keeps its evidence");
  assert.equal(second.json.baseline.records, 3, "the baseline accumulated all three records");

  // A wholly rejected intake must write nothing and change nothing.
  const rejected = await post({
    schema: "subactor.physical-evidence/v1",
    id: "ungrounded-mesh",
    coordinateSystem: frame,
    records: [
      {
        componentId: "facility_shell",
        kind: "space",
        evidence: "verified",
        assetUri: "urn:subactor:resource:sha256:" + "de".repeat(32),
        size: [1, 1, 1],
      },
    ],
  });
  assert.equal(rejected.status, 422, "a rejected intake is refused, not silently accepted");
  assert.equal(rejected.json.report.rejected[0].reason, "ASSET_NOT_GROUNDED");
  assert.equal(await gradeOf("facility_shell"), "ifc", "the rejected intake did not revert earlier evidence");
  assert.equal(await gradeOf("build"), "cad");
  assert.equal(await gradeOf("test"), "cad");

  const baseline = JSON.parse(
    await readFile(join(created.projectDir, "baseline/physical-evidence.json"), "utf8"),
  ) as { records: Array<{ componentId: string }> };
  assert.deepEqual(
    baseline.records.map((r) => r.componentId).sort(),
    ["build", "facility_shell", "test"],
    "the stored baseline still holds every accepted record",
  );
});
