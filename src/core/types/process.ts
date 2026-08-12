export type ProcessCompleteness = "complete" | "partial" | "declared-only";
export type ProcessOrdering = "source" | "presentation-only" | "declared-only";
export type ProcessPhase = "validate" | "plan" | "command" | "operate" | "observe" | "update" | "optimize" | "recover";
export type ProcessInteractionKind = "validation" | "command" | "operation" | "observation" | "state-update" | "safety";

export interface ProcessEvidence {
  intentId: string;
  intentUri: string;
  sourceUri: string;
  artifactUri: string;
  revisionHash: string;
  fragment?: string;
  page?: number;
  artifactUrn?: string;
  excerpt: string;
}

export interface ProcessInteraction {
  kind: ProcessInteractionKind;
  componentIds: string[];
  fromComponentId?: string;
  toComponentId?: string;
  property?: string;
  state?: string;
}

export interface ProcessParameter {
  name: string;
  value: string | number | boolean;
  unit?: string;
  basis: "source";
  evidenceIntentId: string;
}

export interface ProcessStep {
  id: string;
  label: string;
  phase: ProcessPhase;
  componentIds: string[];
  interactions: ProcessInteraction[];
  parameters: ProcessParameter[];
  transitions: { success?: string; failure?: string };
  evidence: ProcessEvidence[];
  gaps: string[];
}

export interface ProcessDefinition {
  id: string;
  label: string;
  kind: "manipulation" | "optimization" | "cultivation" | "imaging" | "sample-preparation" | "synthesis" | "cloning";
  completeness: ProcessCompleteness;
  ordering: ProcessOrdering;
  cyclic: boolean;
  entryStepId?: string;
  successStepId?: string;
  failureStepId?: string;
  componentIds: string[];
  steps: ProcessStep[];
  evidence: ProcessEvidence[];
  gaps: string[];
}

export interface ProcessFinding {
  code: string;
  severity: "info" | "warning" | "error";
  processId?: string;
  stepId?: string;
  componentId?: string;
  message: string;
  resolution: string;
}

export interface ProcessDocument {
  schema: "subactor.process/v1";
  id: string;
  projectId: string;
  sourceSnapshotHash: string;
  processes: ProcessDefinition[];
  coverage: {
    processes: number;
    complete: number;
    partial: number;
    declaredOnly: number;
    steps: number;
    evidencedSteps: number;
    missingEvidence: number;
    missingComponents: number;
  };
  findings: ProcessFinding[];
}

export type ProcessAnimationEffectKind = "highlight" | "pulse" | "flow" | "state";

export interface ProcessAnimationEffect {
  kind: ProcessAnimationEffectKind;
  componentId?: string;
  fromComponentId?: string;
  toComponentId?: string;
  state?: "active" | "completed" | "observing" | "error" | "recovering";
  basis: "presentation-only";
}

export interface ProcessAnimationClip {
  stepId: string;
  startMs: number;
  endMs: number;
  effects: ProcessAnimationEffect[];
}

export interface ProcessAnimation {
  processId: string;
  available: boolean;
  unavailableReason?: string;
  successStepIds: string[];
  failureStepIds: string[];
  clips: ProcessAnimationClip[];
}

export interface ProcessAnimationDocument {
  schema: "subactor.process-animation/v1";
  id: string;
  projectId: string;
  sourceProcessUri: string;
  sourceSceneId: string;
  timing: {
    mode: "normalized-presentation";
    factualProcessDuration: false;
    stepDurationMs: number;
    disclaimer: string;
  };
  animations: ProcessAnimation[];
}

/** Source selected for an observed process run. It never grants command authority. */
export type MqttSourceMode = "simulation" | "shadow" | "hardware";
export type UriProcessRunState =
  | "PLANNED"
  | "WAITING"
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "COMPENSATING"
  | "COMPENSATED";

export interface MqttBrokerBinding {
  id: string;
  /** Environment variable holding mqtt:// or mqtts:// URL; credentials do not enter the DSL. */
  urlEnv: string;
  clientId: string;
  keepAliveSeconds: number;
}

export interface MqttProcessRoute {
  id: string;
  brokerId: string;
  /** Exact topic or a topic containing one `{mode}` placeholder. MQTT wildcards are forbidden. */
  topic: string;
  qos: 0 | 1;
  processId: string;
  processUri: string;
  modes: MqttSourceMode[];
}

export interface MqttBindingDocument {
  schema: "subactor.mqtt-binding/v1";
  id: string;
  defaultMode: MqttSourceMode;
  brokers: MqttBrokerBinding[];
  processRoutes: MqttProcessRoute[];
  /** V1 is deliberately observation-only; MQTT messages cannot dispatch hardware effects. */
  authority: "observe-only";
}

export interface MqttProcessEvent {
  schema: "subactor.mqtt-process-event/v1";
  eventId: string;
  processId: string;
  processUri: string;
  processRevision: string;
  runId: string;
  sequence: number;
  state: UriProcessRunState;
  stepId?: string;
  occurredAt: string;
  correlationId: string;
  idempotencyKey: string;
  sourceMode: MqttSourceMode;
}

export interface UriProcessRunDocument {
  schema: "subactor.uri-process-run/v1";
  runId: string;
  processId: string;
  processUri: string;
  processRevision: string;
  state: UriProcessRunState;
  currentStepIds: string[];
  sourceMode: MqttSourceMode;
  correlationId: string;
  sequence: number;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  eventIds: string[];
  idempotencyKeys: string[];
  /** Explicit continuity defects. A run with gaps must not be presented as complete. */
  gaps: string[];
}
