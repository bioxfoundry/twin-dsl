import type {
  MqttProcessEvent,
  MqttProcessRoute,
  ProcessDefinition,
  UriProcessRunDocument,
  UriProcessRunState,
} from "../core/types.js";

const STATES: UriProcessRunState[] = [
  "PLANNED", "WAITING", "READY", "RUNNING", "SUCCEEDED", "FAILED",
  "CANCELLED", "COMPENSATING", "COMPENSATED",
];
const MODES = ["simulation", "shadow", "hardware"];
const URI_PROCESS = /^twin:\/\/[a-z0-9.-]+\/process\/query\/[a-z0-9._~-]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TERMINAL = new Set<UriProcessRunState>(["SUCCEEDED", "CANCELLED", "COMPENSATED"]);
const NEXT: Record<UriProcessRunState, UriProcessRunState[]> = {
  PLANNED: ["WAITING", "READY", "CANCELLED", "FAILED"],
  WAITING: ["READY", "CANCELLED", "FAILED"],
  READY: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "COMPENSATING"],
  SUCCEEDED: [],
  FAILED: ["COMPENSATING"],
  CANCELLED: [],
  COMPENSATING: ["COMPENSATING", "COMPENSATED", "FAILED"],
  COMPENSATED: [],
};

export interface ProcessEventProjectionResult {
  status: "accepted" | "duplicate";
  run: UriProcessRunDocument;
}

export function validateMqttProcessEvent(value: unknown): MqttProcessEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MQTT_PROCESS_EVENT_DOCUMENT_REQUIRED");
  const event = value as MqttProcessEvent;
  const allowed = [
    "schema", "eventId", "processId", "processUri", "processRevision", "runId", "sequence",
    "state", "stepId", "occurredAt", "correlationId", "idempotencyKey", "sourceMode",
  ];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`MQTT_PROCESS_EVENT_UNKNOWN_KEY:${key}`);
  if (
    event.schema !== "subactor.mqtt-process-event/v1" ||
    typeof event.eventId !== "string" || !event.eventId ||
    typeof event.processId !== "string" || !event.processId ||
    typeof event.processUri !== "string" || !URI_PROCESS.test(event.processUri) ||
    !event.processUri.endsWith(`/process/query/${event.processId}`) ||
    typeof event.processRevision !== "string" || !SHA256.test(event.processRevision) ||
    typeof event.runId !== "string" || !event.runId ||
    !Number.isInteger(event.sequence) || event.sequence < 1 ||
    !STATES.includes(event.state) ||
    (event.stepId !== undefined && (typeof event.stepId !== "string" || !event.stepId)) ||
    typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt)) ||
    typeof event.correlationId !== "string" || !event.correlationId ||
    typeof event.idempotencyKey !== "string" || !event.idempotencyKey ||
    !MODES.includes(event.sourceMode)
  ) throw new Error("MQTT_PROCESS_EVENT_INVALID");
  if ((event.state === "RUNNING" || event.state === "COMPENSATING") && !event.stepId) {
    throw new Error(`MQTT_PROCESS_EVENT_STEP_REQUIRED:${event.state}`);
  }
  return event;
}

function assertIdentity(event: MqttProcessEvent, route: MqttProcessRoute, process: ProcessDefinition, processRevision: string): void {
  if (event.processId !== route.processId || event.processId !== process.id || event.processUri !== route.processUri) {
    throw new Error(`MQTT_PROCESS_EVENT_ROUTE_MISMATCH:${event.processId}`);
  }
  if (!route.modes.includes(event.sourceMode)) throw new Error(`MQTT_PROCESS_EVENT_MODE_FORBIDDEN:${event.sourceMode}`);
  if (event.processRevision !== processRevision) {
    throw new Error(`MQTT_PROCESS_REVISION_MISMATCH:${event.processRevision}:${processRevision}`);
  }
  if (event.stepId && !process.steps.some((step) => step.id === event.stepId)) {
    throw new Error(`MQTT_PROCESS_EVENT_STEP_INVALID:${event.stepId}`);
  }
}

function assertStepTransition(current: UriProcessRunDocument, event: MqttProcessEvent, process: ProcessDefinition): void {
  if (!event.stepId || (event.state !== "RUNNING" && event.state !== "COMPENSATING")) return;
  const previousId = current.currentStepIds[0];
  if (!previousId) {
    if (event.state === "RUNNING" && process.entryStepId && event.stepId !== process.entryStepId) {
      throw new Error(`MQTT_PROCESS_EVENT_ENTRY_STEP_MISMATCH:${event.stepId}:${process.entryStepId}`);
    }
    return;
  }
  if (event.stepId === previousId) return;
  const previous = process.steps.find((step) => step.id === previousId);
  const allowed = [previous?.transitions.success, previous?.transitions.failure].filter(Boolean);
  if (!allowed.includes(event.stepId)) {
    throw new Error(`MQTT_PROCESS_EVENT_STEP_TRANSITION_INVALID:${previousId}:${event.stepId}`);
  }
}

export function projectMqttProcessEvent(input: {
  current?: UriProcessRunDocument;
  event: unknown;
  route: MqttProcessRoute;
  process: ProcessDefinition;
  processRevision: string;
}): ProcessEventProjectionResult {
  const event = validateMqttProcessEvent(input.event);
  assertIdentity(event, input.route, input.process, input.processRevision);
  const current = input.current;
  if (!current) {
    if (event.sequence !== 1) throw new Error(`MQTT_PROCESS_EVENT_SEQUENCE_GAP:expected=1:actual=${event.sequence}`);
    if (event.state !== "PLANNED") throw new Error(`MQTT_PROCESS_EVENT_INITIAL_STATE_INVALID:${event.state}`);
    return {
      status: "accepted",
      run: {
        schema: "subactor.uri-process-run/v1",
        runId: event.runId,
        processId: event.processId,
        processUri: event.processUri,
        processRevision: event.processRevision,
        state: event.state,
        currentStepIds: event.stepId ? [event.stepId] : [],
        sourceMode: event.sourceMode,
        correlationId: event.correlationId,
        sequence: event.sequence,
        updatedAt: event.occurredAt,
        eventIds: [event.eventId],
        idempotencyKeys: [event.idempotencyKey],
        gaps: [],
      },
    };
  }
  if (
    current.runId !== event.runId || current.processId !== event.processId ||
    current.processUri !== event.processUri || current.processRevision !== event.processRevision ||
    current.sourceMode !== event.sourceMode || current.correlationId !== event.correlationId
  ) throw new Error(`MQTT_PROCESS_RUN_IDENTITY_MISMATCH:${event.runId}`);
  if (current.eventIds.includes(event.eventId) || current.idempotencyKeys.includes(event.idempotencyKey)) {
    return { status: "duplicate", run: current };
  }
  if (event.sequence !== current.sequence + 1) {
    if (event.sequence <= current.sequence) {
      throw new Error(`MQTT_PROCESS_EVENT_OUT_OF_ORDER:expected=${current.sequence + 1}:actual=${event.sequence}`);
    }
    throw new Error(`MQTT_PROCESS_EVENT_SEQUENCE_GAP:expected=${current.sequence + 1}:actual=${event.sequence}`);
  }
  if (!NEXT[current.state].includes(event.state)) {
    throw new Error(`MQTT_PROCESS_EVENT_STATE_TRANSITION_INVALID:${current.state}:${event.state}`);
  }
  assertStepTransition(current, event, input.process);
  const terminal = TERMINAL.has(event.state);
  const run: UriProcessRunDocument = {
    ...current,
    state: event.state,
    currentStepIds: terminal ? [] : event.stepId ? [event.stepId] : current.currentStepIds,
    sequence: event.sequence,
    startedAt: current.startedAt ?? (event.state === "RUNNING" ? event.occurredAt : undefined),
    updatedAt: event.occurredAt,
    ...(terminal ? { finishedAt: event.occurredAt } : {}),
    eventIds: [...current.eventIds, event.eventId],
    idempotencyKeys: [...current.idempotencyKeys, event.idempotencyKey],
  };
  return { status: "accepted", run };
}
