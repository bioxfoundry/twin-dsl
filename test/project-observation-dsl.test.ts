import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";
import { parseObservationDsl, renderObservationDsl } from "../src/dsl/observation.js";

test('projectDSL and observationDSL round-trip deterministically',async()=>{
  const projectEnvelope=JSON.parse(await readFile('examples/nl-to-dsl/project.fixture.json','utf8')) as {dsl:string};const project=parseProjectDsl(projectEnvelope.dsl);assert.equal(parseProjectDsl(renderProjectDsl(project)).id,project.id);
  const observationEnvelope=JSON.parse(await readFile('examples/nl-to-dsl/observation.fixture.json','utf8')) as {dsl:string};const observation=parseObservationDsl(observationEnvelope.dsl);assert.equal(parseObservationDsl(renderObservationDsl(observation)).observations[0]?.metric,'temperatureC');
});
