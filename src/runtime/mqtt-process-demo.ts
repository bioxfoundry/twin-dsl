import type { MqttBindingDocument, MqttProcessEvent, MqttSourceMode, ProcessDefinition, ProcessDocument } from "../core/types.js";
import { expandMqttRouteTopics, validateMqttBinding } from "../dsl/mqtt-binding.js";
import { validateProcessDocument } from "../dsl/process.js";
import { MqttClient } from "../transport/mqtt.js";

function successPath(process: ProcessDefinition): string[] {
  if (!process.entryStepId) throw new Error(`MQTT_DEMO_PROCESS_ENTRY_REQUIRED:${process.id}`);
  const result: string[] = [], seen = new Set<string>();
  let stepId: string | undefined = process.entryStepId;
  while (stepId && !seen.has(stepId) && result.length <= process.steps.length) {
    const step = process.steps.find((item) => item.id === stepId);
    if (!step) throw new Error(`MQTT_DEMO_PROCESS_STEP_NOT_FOUND:${stepId}`);
    result.push(step.id); seen.add(step.id); stepId = step.transitions.success;
  }
  if (!result.length) throw new Error(`MQTT_DEMO_PROCESS_PATH_EMPTY:${process.id}`);
  return result;
}

export async function runMqttProcessDemo(options: {
  binding: MqttBindingDocument;
  processes: ProcessDocument;
  processId: string;
  mode?: MqttSourceMode;
  intervalMs?: number;
  environment?: NodeJS.ProcessEnv;
}): Promise<{ runId: string; processUri: string; topic: string; events: number; state: "SUCCEEDED" }> {
  const binding = validateMqttBinding(options.binding);
  const processes = validateProcessDocument(options.processes);
  const sourceMode = options.mode ?? binding.defaultMode;
  const route = binding.processRoutes.find((item) => item.processId === options.processId && item.modes.includes(sourceMode));
  if (!route) throw new Error(`MQTT_DEMO_ROUTE_NOT_FOUND:${options.processId}:${sourceMode}`);
  const process = processes.processes.find((item) => item.id === route.processId);
  if (!process) throw new Error(`MQTT_DEMO_PROCESS_NOT_FOUND:${route.processId}`);
  const broker = binding.brokers.find((item) => item.id === route.brokerId);
  if (!broker) throw new Error(`MQTT_DEMO_BROKER_NOT_FOUND:${route.brokerId}`);
  const environment = options.environment ?? globalThis.process.env;
  const url = environment[broker.urlEnv];
  if (!url) throw new Error(`MQTT_URL_NOT_CONFIGURED:${broker.urlEnv}`);
  const topic = expandMqttRouteTopics(route).find((item) => item.mode === sourceMode)?.topic;
  if (!topic) throw new Error(`MQTT_DEMO_TOPIC_NOT_FOUND:${route.id}:${sourceMode}`);
  const path = successPath(process);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const runId = `mqtt-demo-${process.id}-${suffix}`;
  const correlationId = `correlation-${suffix}`;
  let sequence = 0;
  const emit = async (state: MqttProcessEvent["state"], stepId?: string): Promise<void> => {
    sequence += 1;
    const event: MqttProcessEvent = {
      schema: "subactor.mqtt-process-event/v1",
      eventId: `${runId}-event-${sequence}`,
      processId: process.id,
      processUri: route.processUri,
      processRevision: processes.sourceSnapshotHash,
      runId, sequence, state, ...(stepId ? { stepId } : {}),
      occurredAt: new Date().toISOString(), correlationId,
      idempotencyKey: `${runId}:${sequence}`, sourceMode,
    };
    await client.publish(topic, JSON.stringify(event), route.qos);
    const interval = Math.max(0, options.intervalMs ?? 900);
    if (interval) await new Promise<void>((resolve) => setTimeout(resolve, interval));
  };
  const client = new MqttClient({ url, clientId: `${broker.clientId}-demo-${globalThis.process.pid}`, keepAliveSeconds: broker.keepAliveSeconds });
  try {
    await client.connect();
    await emit("PLANNED");
    await emit("READY");
    for (const stepId of path) await emit("RUNNING", stepId);
    await emit("SUCCEEDED");
  } finally { client.close(); }
  return { runId, processUri: route.processUri, topic, events: sequence, state: "SUCCEEDED" };
}
