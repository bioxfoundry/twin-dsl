export interface Rational { numerator: string; denominator: string }
export type MathValue = boolean | string | number | Rational;
export type TwinStateQuality = "fresh" | "stale" | "expired" | "unknown";

export interface LiveBindingRange {
  min?: number;
  max?: number;
  state: string;
}

export interface LiveBinding {
  id: string;
  source: { subjectUri: string; metric: string };
  target: { componentId: string; property: string };
  freshness: { freshForMs: number; expireAfterMs: number; onStale: string };
  valueStates: Record<string, string>;
  ranges: LiveBindingRange[];
}

export interface LiveBindingDocument {
  schema: "subactor.live-binding/v1";
  id: string;
  bindings: LiveBinding[];
}

export interface ObservationRecord {
  id: string;
  observedAt: string;
  receivedAt?: string;
  subjectUri: string;
  metric: string;
  value: MathValue;
  unit?: string;
  severity: "debug" | "info" | "warning" | "error" | "critical";
  sourceUris: string[];
  labels: string[];
}

export interface ObservationDocument {
  schema: "subactor.observation/v1";
  id: string;
  sourceSnapshotHash: string;
  observations: ObservationRecord[];
}

export interface TwinComponent {
  id: string;
  type: string;
  sourceUris: string[];
  properties: Record<string, unknown>;
  children: TwinComponent[];
}

export interface TwinDocument {
  schema: "subactor.twin/v1";
  id: string;
  kind: "actor" | "system" | "process" | "physical" | "conceptual";
  observedAt: string;
  sourceSnapshotHash: string;
  components: TwinComponent[];
}

export interface TwinStateProperty {
  bindingId: string;
  property: string;
  value?: MathValue;
  unit?: string;
  state: string;
  mappedState: string;
  quality: TwinStateQuality;
  freshForMs: number;
  expireAfterMs: number;
  onStale: string;
  observedAt?: string;
  receivedAt?: string;
  ageMs?: number;
  sourceObservationId?: string;
  sourceUris: string[];
}

export interface TwinStateComponent {
  componentId: string;
  properties: TwinStateProperty[];
}

export interface TwinStateDocument {
  schema: "subactor.twin-state/v1";
  id: string;
  projectId: string;
  projectedAt: string;
  evaluatedAt: string;
  sourceObservationUri: string;
  components: TwinStateComponent[];
  coverage: { bindings: number; resolved: number; fresh: number; stale: number; expired: number; unknown: number };
}
