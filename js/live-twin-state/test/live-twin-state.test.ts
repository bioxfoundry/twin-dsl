import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTwinStateFreshness, parseLiveBindingDsl, projectTwinState, renderLiveBindingDsl, renderTwinStateDsl } from "../src/index.js";
import type { ObservationDocument, TwinDocument } from "../src/index.js";

const source = `LIVE_BINDINGS laboratory-live-v1
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
`;
const twin: TwinDocument = {
  schema: "subactor.twin/v1", id: "lab", kind: "physical", observedAt: "2026-08-08T20:00:00Z", sourceSnapshotHash: "a".repeat(64),
  components: [{ id: "bioreactor_01", type: "device", sourceUris: [], properties: {}, children: [] }],
};
const observations: ObservationDocument = {
  schema: "subactor.observation/v1", id: "observations", sourceSnapshotHash: "b".repeat(64), observations: [{
    id: "obs-1", observedAt: "2026-08-08T20:00:00Z", receivedAt: "2026-08-08T20:00:01Z", subjectUri: "urn:subactor:component:bioreactor_01", metric: "temperature", value: 38, unit: "Cel", severity: "info", sourceUris: ["urn:test:sensor"], labels: [],
  }],
};

test("standalone LiveBinding package round-trips and preserves inclusive bounded ranges", () => {
  const bindings = parseLiveBindingDsl(source);
  assert.deepEqual(parseLiveBindingDsl(renderLiveBindingDsl(bindings)), bindings);
  for (const value of [20, 38, 40]) {
    const input = structuredClone(observations);
    input.observations[0]!.value = value;
    const state = projectTwinState({ projectId: "lab", bindings, observations: input, twin, projectedAt: "2026-08-08T20:00:05Z" });
    assert.equal(state.components[0]!.properties[0]!.state, "nominal");
    assert.match(renderTwinStateDsl(state), /QUALITY fresh/);
  }
});

test("standalone projector advances freshness without minting another observation identity", () => {
  const bindings = parseLiveBindingDsl(source);
  const projected = projectTwinState({ projectId: "lab", bindings, observations, twin, projectedAt: "2026-08-08T20:00:05Z" });
  const sourceObservationUri = projected.sourceObservationUri;
  const stale = evaluateTwinStateFreshness(projected, "2026-08-08T20:00:15Z");
  const expired = evaluateTwinStateFreshness(projected, "2026-08-08T20:00:31Z");
  assert.equal(stale.components[0]!.properties[0]!.quality, "stale");
  assert.equal(expired.components[0]!.properties[0]!.quality, "expired");
  assert.equal(stale.sourceObservationUri, sourceObservationUri);
  assert.equal(expired.sourceObservationUri, sourceObservationUri);
});

test("standalone projector fails closed on unknown component identity", () => {
  const bindings = parseLiveBindingDsl(source);
  bindings.bindings[0]!.target.componentId = "bioreactor_typo";
  assert.throws(() => projectTwinState({ projectId: "lab", bindings, observations, twin, projectedAt: "2026-08-08T20:00:05Z" }), /LIVE_BINDING_TARGET_COMPONENT_UNKNOWN/);
});
