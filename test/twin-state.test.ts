import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveBindingDsl, renderLiveBindingDsl } from "../src/dsl/live-binding.js";
import { evaluateTwinStateFreshness, projectTwinState, renderTwinStateDsl } from "../src/runtime/twin-state.js";
import type { ObservationDocument, TwinDocument } from "../src/core/types.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLivingProject, verifyLivingProject } from "../src/project/wizard.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";
import { parseProjectDsl, renderProjectDsl } from "../src/dsl/project.js";

const bindingDsl = `LIVE_BINDINGS laboratory-live-v1
BIND reactor-temperature
SUBJECT "urn:subactor:component:bioreactor_01"
METRIC "temperature"
TARGET bioreactor_01 thermal_state
FRESH_FOR 10s
EXPIRE_AFTER 30s
ON_STALE unknown
RANGE_STATE * 20 cold
RANGE_STATE 20 40 nominal
RANGE_STATE 40 * overheating
END
BIND pump-rpm
SUBJECT "urn:subactor:component:pump_01"
METRIC "rpm"
TARGET pump_01 motion_state
FRESH_FOR 5s
EXPIRE_AFTER 20s
ON_STALE stopped_unknown
END
`;

const twin: TwinDocument = {
  schema: "subactor.twin/v1", id: "lab", kind: "physical", observedAt: "2026-08-08T20:00:00Z", sourceSnapshotHash: "a".repeat(64),
  components: [
    { id: "bioreactor_01", type: "device", sourceUris: ["urn:test:reactor"], properties: {}, children: [] },
    { id: "pump_01", type: "device", sourceUris: ["urn:test:pump"], properties: {}, children: [] },
  ],
};

function observations(observedAt: string): ObservationDocument {
  return { schema: "subactor.observation/v1", id: "observations", sourceSnapshotHash: "b".repeat(64), observations: [{
    id: "obs-1", observedAt, receivedAt: "2026-08-08T20:00:01Z", subjectUri: "urn:subactor:component:bioreactor_01", metric: "temperature", value: 38, unit: "Cel", severity: "info", sourceUris: ["urn:test:sensor"], labels: [],
  }] };
}

test("LiveBindingDSL round-trips and projects exact component state", () => {
  const bindings = parseLiveBindingDsl(bindingDsl);
  assert.deepEqual(parseLiveBindingDsl(renderLiveBindingDsl(bindings)), bindings);
  const state = projectTwinState({ projectId: "lab", bindings, observations: observations("2026-08-08T19:59:55Z"), twin, projectedAt: "2026-08-08T20:00:00Z" });
  assert.deepEqual(state.coverage, { bindings: 2, resolved: 1, fresh: 1, stale: 0, expired: 0, unknown: 1 });
  assert.equal(state.components[0]?.properties[0]?.state, "nominal");
  assert.equal(state.components[0]?.properties[0]?.quality, "fresh");
  assert.equal(state.components[0]?.properties[0]?.receivedAt, "2026-08-08T20:00:01Z");
  assert.equal(state.components[1]?.properties[0]?.quality, "unknown");
  assert.match(renderTwinStateDsl(state), /QUALITY fresh/);
  const atLowerBoundary=observations("2026-08-08T19:59:55Z");
  atLowerBoundary.observations[0]!.value=20;
  assert.equal(projectTwinState({projectId:"lab",bindings,observations:atLowerBoundary,twin,projectedAt:"2026-08-08T20:00:00Z"}).components[0]?.properties[0]?.state,"nominal");
  const atUpperBoundary=observations("2026-08-08T19:59:55Z");
  atUpperBoundary.observations[0]!.value=40;
  assert.equal(projectTwinState({projectId:"lab",bindings,observations:atUpperBoundary,twin,projectedAt:"2026-08-08T20:00:00Z"}).components[0]?.properties[0]?.state,"nominal");
});

test("TwinState marks old evidence stale and expired instead of presenting it as current", () => {
  const bindings = parseLiveBindingDsl(bindingDsl);
  const stale = projectTwinState({ projectId: "lab", bindings, observations: observations("2026-08-08T19:59:45Z"), twin, projectedAt: "2026-08-08T20:00:00Z" });
  assert.equal(stale.components[0]?.properties[0]?.quality, "stale");
  assert.equal(stale.components[0]?.properties[0]?.state, "unknown");
  const expired = projectTwinState({ projectId: "lab", bindings, observations: observations("2026-08-08T19:00:00Z"), twin, projectedAt: "2026-08-08T20:00:00Z" });
  assert.equal(expired.components[0]?.properties[0]?.quality, "expired");
  assert.equal(expired.components[0]?.properties[0]?.value, 38, "historical evidence remains inspectable");
});

test("query-time freshness advances without requiring a new Twin iteration", () => {
  const bindings = parseLiveBindingDsl(bindingDsl);
  const projected = projectTwinState({ projectId: "lab", bindings, observations: observations("2026-08-08T20:00:00Z"), twin, projectedAt: "2026-08-08T20:00:05Z" });
  assert.equal(projected.components[0]?.properties[0]?.quality, "fresh");
  const stale = evaluateTwinStateFreshness(projected, "2026-08-08T20:00:15Z");
  assert.equal(stale.components[0]?.properties[0]?.quality, "stale");
  assert.equal(stale.components[0]?.properties[0]?.state, "unknown");
  const expired = evaluateTwinStateFreshness(projected, "2026-08-08T20:00:31Z");
  assert.equal(expired.components[0]?.properties[0]?.quality, "expired");
  assert.equal(expired.evaluatedAt, "2026-08-08T20:00:31Z");
});

test("LiveBinding fails closed when target identity does not exist", () => {
  const bindings = parseLiveBindingDsl(bindingDsl);
  bindings.bindings[0]!.target.componentId = "reactor_typo";
  assert.throws(() => projectTwinState({ projectId: "lab", bindings, observations: observations("2026-08-08T20:00:00Z"), twin, projectedAt: "2026-08-08T20:00:00Z" }), /LIVE_BINDING_TARGET_COMPONENT_UNKNOWN/);
});

test("living runtime publishes TwinState artifacts and receipt URI", async () => {
  const temp = await mkdtemp(join(tmpdir(), "living-twin-state-"));
  try {
    const projectDir = join(temp, "project");
    const created = await createLivingProject({ name: "Live State Twin", outDir: projectDir });
    const project = parseProjectDsl(await readFile(created.configPath, "utf8"));
    project.observations.liveBindingFile = "live-bindings.dsl";
    await writeFile(created.configPath, renderProjectDsl(project));
    await writeFile(join(projectDir, "live-bindings.dsl"), `LIVE_BINDINGS integration\nBIND ambient\nSUBJECT "subactor://project/${project.id}/environment"\nMETRIC "temperatureC"\nTARGET runtime-knowledge ambient_temperature\nFRESH_FOR 1m\nEXPIRE_AFTER 5m\nON_STALE unknown\nRANGE_STATE 20 30 nominal\nEND\n`);
    const environmentPath = join(projectDir, "environment/current.json");
    const environment = JSON.parse(await readFile(environmentPath, "utf8"));
    environment.observedAt = new Date().toISOString();
    environment.receivedAt = environment.observedAt;
    await writeFile(environmentPath, JSON.stringify(environment, null, 2));
    const verification = await verifyLivingProject(created.configPath);
    assert.equal(verification.checks.find((check) => check.name.startsWith("live-bindings:"))?.message, "valid (1 bindings)");
    const out = join(temp, "out");
    const receipt = await new LivingProjectRuntime().iterate(created.configPath, out, "deterministic");
    assert.equal(receipt.validation.ok, true);
    assert.match(receipt.twinStateUri ?? "", /^urn:subactor:twin-state:sha256:/);
    const state = JSON.parse(await readFile(join(out, "current/twin-state.json"), "utf8"));
    assert.equal(state.coverage.fresh, 1);
    assert.equal(state.components[0].properties[0].state, "nominal");
    assert.match(await readFile(join(out, "current/twin-state.dsl"), "utf8"), /QUALITY fresh/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
