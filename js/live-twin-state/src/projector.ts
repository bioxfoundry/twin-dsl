import type { LiveBinding, LiveBindingDocument, MathValue, ObservationDocument, TwinComponent, TwinDocument, TwinStateDocument, TwinStateProperty, TwinStateQuality } from "./types.js";
import { contentUri } from "./canonical.js";
import { validateLiveBinding } from "./live-binding.js";

function componentIds(components: TwinComponent[]): Set<string> {
  const ids = new Set<string>();
  const visit = (component: TwinComponent): void => {
    ids.add(component.id);
    component.children.forEach(visit);
  };
  components.forEach(visit);
  return ids;
}

function mappedState(binding: LiveBinding, value: MathValue): string {
  const direct = binding.valueStates[JSON.stringify(value)];
  if (direct) return direct;
  if (typeof value === "number") {
    const range = binding.ranges.find((candidate) => {
      if (candidate.min === undefined && candidate.max === undefined) return true;
      if (candidate.min === undefined) return value < candidate.max!;
      if (candidate.max === undefined) return value > candidate.min;
      return value >= candidate.min && value <= candidate.max;
    });
    if (range) return range.state;
  }
  return "observed";
}

export function projectTwinState(input: { projectId: string; bindings: LiveBindingDocument; observations: ObservationDocument; twin: TwinDocument; projectedAt?: string }): TwinStateDocument {
  const bindings = validateLiveBinding(input.bindings);
  const projectedAt = input.projectedAt ?? new Date().toISOString();
  const projectionTime = Date.parse(projectedAt);
  if (Number.isNaN(projectionTime)) throw new Error("TWIN_STATE_PROJECTED_AT_INVALID");
  const ids = componentIds(input.twin.components);
  const properties = new Map<string, TwinStateProperty[]>();
  const counts: Record<TwinStateQuality, number> = { fresh: 0, stale: 0, expired: 0, unknown: 0 };
  let resolved = 0;
  for (const binding of bindings.bindings) {
    if (!ids.has(binding.target.componentId)) throw new Error(`LIVE_BINDING_TARGET_COMPONENT_UNKNOWN:${binding.target.componentId}`);
    const observation = input.observations.observations
      .filter((candidate) => candidate.subjectUri === binding.source.subjectUri && candidate.metric === binding.source.metric)
      .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
    let property: TwinStateProperty;
    if (!observation) {
      counts.unknown++;
      property = { bindingId: binding.id, property: binding.target.property, state: "unknown", mappedState: "unknown", quality: "unknown", freshForMs: binding.freshness.freshForMs, expireAfterMs: binding.freshness.expireAfterMs, onStale: binding.freshness.onStale, sourceUris: [] };
    } else {
      resolved++;
      const ageMs = Math.max(0, projectionTime - Date.parse(observation.observedAt));
      const quality: TwinStateQuality = ageMs <= binding.freshness.freshForMs ? "fresh" : ageMs <= binding.freshness.expireAfterMs ? "stale" : "expired";
      counts[quality]++;
      const semanticState = mappedState(binding, observation.value);
      property = {
        bindingId: binding.id,
        property: binding.target.property,
        value: observation.value,
        unit: observation.unit,
        state: quality === "fresh" ? semanticState : binding.freshness.onStale,
        mappedState: semanticState,
        quality,
        freshForMs: binding.freshness.freshForMs,
        expireAfterMs: binding.freshness.expireAfterMs,
        onStale: binding.freshness.onStale,
        observedAt: observation.observedAt,
        receivedAt: observation.receivedAt ?? observation.observedAt,
        ageMs,
        sourceObservationId: observation.id,
        sourceUris: observation.sourceUris,
      };
    }
    const target = properties.get(binding.target.componentId) ?? [];
    target.push(property);
    properties.set(binding.target.componentId, target);
  }
  return {
    schema: "subactor.twin-state/v1",
    id: `${input.projectId}-state`,
    projectId: input.projectId,
    projectedAt,
    evaluatedAt: projectedAt,
    sourceObservationUri: contentUri("observation", input.observations),
    components: [...properties].map(([componentId, stateProperties]) => ({ componentId, properties: stateProperties })),
    coverage: { bindings: bindings.bindings.length, resolved, ...counts },
  };
}

export function evaluateTwinStateFreshness(state: TwinStateDocument, evaluatedAt = new Date().toISOString()): TwinStateDocument {
  const evaluationTime = Date.parse(evaluatedAt);
  if (Number.isNaN(evaluationTime)) throw new Error("TWIN_STATE_EVALUATED_AT_INVALID");
  const counts: Record<TwinStateQuality, number> = { fresh: 0, stale: 0, expired: 0, unknown: 0 };
  let resolved = 0;
  const components = state.components.map((component) => ({ ...component, properties: component.properties.map((property) => {
    if (!property.observedAt) {
      counts.unknown++;
      return { ...property, state: "unknown", quality: "unknown" as const, ageMs: undefined };
    }
    resolved++;
    const ageMs = Math.max(0, evaluationTime - Date.parse(property.observedAt));
    const quality: TwinStateQuality = ageMs <= property.freshForMs ? "fresh" : ageMs <= property.expireAfterMs ? "stale" : "expired";
    counts[quality]++;
    return { ...property, ageMs, quality, state: quality === "fresh" ? property.mappedState : property.onStale };
  }) }));
  return { ...state, evaluatedAt, components, coverage: { bindings: state.coverage.bindings, resolved, ...counts } };
}

export function renderTwinStateDsl(state: TwinStateDocument): string {
  const output = [`TWIN_STATE ${state.id}`, `PROJECT ${state.projectId}`, `PROJECTED_AT ${JSON.stringify(state.projectedAt)}`, `EVALUATED_AT ${JSON.stringify(state.evaluatedAt)}`, `SOURCE ${state.sourceObservationUri}`];
  for (const component of state.components) for (const property of component.properties) {
    output.push(`STATE ${component.componentId} ${property.property}`, `BINDING ${property.bindingId}`, `QUALITY ${property.quality}`, `SEMANTIC_STATE ${property.state}`, `MAPPED_STATE ${property.mappedState}`, `FRESH_FOR_MS ${property.freshForMs}`, `EXPIRE_AFTER_MS ${property.expireAfterMs}`, `ON_STALE ${property.onStale}`);
    if (property.value !== undefined) output.push(`VALUE ${JSON.stringify(property.value)}`);
    if (property.unit) output.push(`UNIT ${JSON.stringify(property.unit)}`);
    if (property.observedAt) output.push(`OBSERVED_AT ${JSON.stringify(property.observedAt)}`);
    if (property.receivedAt) output.push(`RECEIVED_AT ${JSON.stringify(property.receivedAt)}`);
    if (property.ageMs !== undefined) output.push(`AGE_MS ${property.ageMs}`);
    if (property.sourceObservationId) output.push(`OBSERVATION ${property.sourceObservationId}`);
    output.push("END");
  }
  output.push(`COVERAGE bindings=${state.coverage.bindings} resolved=${state.coverage.resolved} fresh=${state.coverage.fresh} stale=${state.coverage.stale} expired=${state.coverage.expired} unknown=${state.coverage.unknown}`);
  return `${output.join("\n")}\n`;
}
