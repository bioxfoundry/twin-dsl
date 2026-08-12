import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";
import { observationHorizon, parseObservationDsl, renderObservationDsl } from "../src/dsl/observation.js";

test('projectDSL and observationDSL round-trip deterministically',async()=>{
  const projectEnvelope=JSON.parse(await readFile('examples/nl-to-dsl/project.fixture.json','utf8')) as {dsl:string};const project=parseProjectDsl(projectEnvelope.dsl);const roundTrip=parseProjectDsl(renderProjectDsl(project));assert.equal(roundTrip.id,project.id);assert.equal(roundTrip.policy.environment,'production');
  const observationEnvelope=JSON.parse(await readFile('examples/nl-to-dsl/observation.fixture.json','utf8')) as {dsl:string};const observation=parseObservationDsl(observationEnvelope.dsl);assert.equal(parseObservationDsl(renderObservationDsl(observation)).observations[0]?.metric,'temperatureC');
});

test('projectDSL preserves an explicit development policy boundary',()=>{
  const project=parseProjectDsl(`PROJECT demo\nNAME "Demo"\nPROFILE generic\nMANAGER_INTENT "Develop"\nSOURCE development "code" subactor://project/demo/development\nPOLICY_ENVIRONMENT development\nPOLICY_APPROVED true\nPOLICY_REQUIRE_RESEARCH true\nPOLICY_REQUIRE_DEVELOPMENT true\nPOLICY_REQUIRE_DEVELOPMENT_ACCEPTANCE true\nPOLICY_ALLOW_DEVELOPMENT_FIXTURE false\nPOLICY_REQUIRE_RUNTIME true\nPOLICY_AUTO_PUBLISH_SCENE true\nPOLICY_ALLOW_RUNTIME_SELF_MODIFICATION true\nPOLICY_AUTONOMY_MODE apply\nPOLICY_REQUIRE_SIGNED_MUTATION_GRANT false\nPOLICY_MAX_ITERATIONS_PER_HOUR 12\nPOLICY_MAX_CONSECUTIVE_FAILURES 3\nSCENE_FORMAT openusd\n`);
  assert.equal(project.policy.environment,'development');
  assert.match(renderProjectDsl(project),/^POLICY_ENVIRONMENT development$/m);
});

test('projectDSL preserves the optional MQTT observation binding',()=>{
  const project=parseProjectDsl(`PROJECT demo
NAME "Demo"
PROFILE generic
MANAGER_INTENT "Observe URI Process runs"
SOURCE runtime "logs" subactor://project/demo/runtime
MQTT_BINDING_FILE "config/mqtt-bindings.dsl"
POLICY_APPROVED true
POLICY_REQUIRE_RESEARCH false
POLICY_REQUIRE_DEVELOPMENT false
POLICY_REQUIRE_DEVELOPMENT_ACCEPTANCE false
POLICY_ALLOW_DEVELOPMENT_FIXTURE false
POLICY_REQUIRE_RUNTIME true
POLICY_AUTO_PUBLISH_SCENE false
POLICY_ALLOW_RUNTIME_SELF_MODIFICATION false
POLICY_AUTONOMY_MODE observe
POLICY_REQUIRE_SIGNED_MUTATION_GRANT true
POLICY_MAX_ITERATIONS_PER_HOUR 12
POLICY_MAX_CONSECUTIVE_FAILURES 3
SCENE_FORMAT openusd
`);
  assert.equal(project.observations.mqttBindingFile,'config/mqtt-bindings.dsl');
  assert.match(renderProjectDsl(project),/^MQTT_BINDING_FILE "config\/mqtt-bindings\.dsl"$/m);
});

test('observationDSL preserves receivedAt independently from observedAt',()=>{
  const source=`OBSERVATIONS live SNAPSHOT ${'a'.repeat(64)}\nOBSERVATION obs-1\nAT "2026-08-08T20:00:00Z"\nRECEIVED_AT "2026-08-08T20:00:01Z"\nSUBJECT urn:component:test\nMETRIC "temperature"\nVALUE 22\nUNIT "Cel"\nSEVERITY info\nSOURCES urn:sensor:test\nLABELS live\nEND\n`;
  const record=parseObservationDsl(renderObservationDsl(parseObservationDsl(source))).observations[0];
  assert.equal(record?.observedAt,'2026-08-08T20:00:00Z');
  assert.equal(record?.receivedAt,'2026-08-08T20:00:01Z');
});

test('observationDSL round-trips empty optional source and label collections',()=>{
  const source=`OBSERVATIONS live SNAPSHOT ${'b'.repeat(64)}\nOBSERVATION obs-empty\nAT "2026-08-08T20:00:00Z"\nSUBJECT urn:component:test\nMETRIC "state"\nVALUE true\nSEVERITY info\nSOURCES\nLABELS\nEND\n`;
  const parsed=parseObservationDsl(source);
  assert.deepEqual(parsed.observations[0]?.sourceUris,[]);
  assert.deepEqual(parsed.observations[0]?.labels,[]);
  const rendered=renderObservationDsl(parsed);
  assert.doesNotMatch(rendered,/^SOURCES$/m);
  assert.doesNotMatch(rendered,/^LABELS$/m);
  assert.deepEqual(parseObservationDsl(rendered),parsed);
});

test('observation horizon is evidence-derived and deterministic',()=>{
  const source=`OBSERVATIONS horizon SNAPSHOT ${'a'.repeat(64)}
OBSERVATION early
AT "2026-01-01T08:00:00+01:00"
SUBJECT "subactor://sensor/early"
METRIC "temperatureC"
VALUE 20
SEVERITY info
END
OBSERVATION late
AT "2026-01-02T10:30:00Z"
SUBJECT "subactor://sensor/late"
METRIC "temperatureC"
VALUE 21
SEVERITY info
END`;
  assert.equal(observationHorizon(parseObservationDsl(source)),'2026-01-02T10:30:00.000Z');
  assert.equal(observationHorizon({schema:'subactor.observation/v1',id:'empty',sourceSnapshotHash:'b'.repeat(64),observations:[]}),'1970-01-01T00:00:00.000Z');
});
