import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type Socket } from "node:net";
import type { MqttProcessEvent, ProcessDefinition, ProcessDocument } from "../src/core/types.js";
import { parseMqttBindingDsl, renderMqttBindingDsl } from "../src/dsl/mqtt-binding.js";
import { MqttClient } from "../src/transport/mqtt.js";
import { projectMqttProcessEvent } from "../src/runtime/uri-process-run.js";

const hash = "a".repeat(64);
const bindingSource = `MQTT_BINDINGS biofoundry-processes
DEFAULT_MODE simulation
AUTHORITY observe-only
BROKER "local"
URL_ENV MQTT_URL
CLIENT_ID "biofoundry-dashboard"
KEEP_ALIVE_SECONDS 30
END_BROKER
PROCESS_ROUTE "cultivation"
BROKER_ID "local"
TOPIC "biofoundry/{mode}/process/cultivation_monitoring/events"
QOS 0
PROCESS_ID "cultivation_monitoring"
PROCESS_URI twin://biofoundry/process/query/cultivation_monitoring
MODES [simulation,shadow,hardware]
END_PROCESS_ROUTE
END_MQTT_BINDINGS
`;

const processDefinition: ProcessDefinition = {
  id: "cultivation_monitoring", label: "Cultivation", kind: "cultivation", completeness: "complete",
  ordering: "source", cyclic: false, entryStepId: "preflight", successStepId: "observe",
  componentIds: ["bioreactor"], evidence: [], gaps: [],
  steps: [
    { id: "preflight", label: "Preflight", phase: "validate", componentIds: ["bioreactor"], interactions: [], parameters: [], transitions: { success: "operate" }, evidence: [], gaps: [] },
    { id: "operate", label: "Operate", phase: "operate", componentIds: ["bioreactor"], interactions: [], parameters: [], transitions: { success: "observe" }, evidence: [], gaps: [] },
    { id: "observe", label: "Observe", phase: "observe", componentIds: ["bioreactor"], interactions: [], parameters: [], transitions: {}, evidence: [], gaps: [] },
  ],
};

function event(sequence: number, state: MqttProcessEvent["state"], stepId?: string): MqttProcessEvent {
  return {
    schema: "subactor.mqtt-process-event/v1", eventId: `event-${sequence}`,
    processId: processDefinition.id, processUri: "twin://biofoundry/process/query/cultivation_monitoring",
    processRevision: hash, runId: "run-1", sequence, state, ...(stepId ? { stepId } : {}),
    occurredAt: `2026-08-12T10:00:0${Math.min(sequence, 9)}.000Z`, correlationId: "correlation-1",
    idempotencyKey: `run-1:${sequence}`, sourceMode: "simulation",
  };
}

test("MqttBindingDSL round-trips exact observe-only URI Process routes", () => {
  const binding = parseMqttBindingDsl(bindingSource);
  assert.equal(binding.authority, "observe-only");
  assert.equal(binding.processRoutes[0].processUri, "twin://biofoundry/process/query/cultivation_monitoring");
  assert.deepEqual(parseMqttBindingDsl(renderMqttBindingDsl(binding)), binding);
  assert.throws(
    () => parseMqttBindingDsl(bindingSource.replace("biofoundry/{mode}/process", "biofoundry/+/process")),
    /MQTT_BINDING_TOPIC_WILDCARD_FORBIDDEN/,
  );
});

test("URI Process projection enforces sequence, idempotency, state and ProcessDSL step transitions", () => {
  const route = parseMqttBindingDsl(bindingSource).processRoutes[0];
  let projected = projectMqttProcessEvent({ event: event(1, "PLANNED"), route, process: processDefinition, processRevision: hash });
  projected = projectMqttProcessEvent({ current: projected.run, event: event(2, "READY"), route, process: processDefinition, processRevision: hash });
  projected = projectMqttProcessEvent({ current: projected.run, event: event(3, "RUNNING", "preflight"), route, process: processDefinition, processRevision: hash });
  projected = projectMqttProcessEvent({ current: projected.run, event: event(4, "RUNNING", "operate"), route, process: processDefinition, processRevision: hash });
  assert.equal(projected.run.state, "RUNNING");
  assert.deepEqual(projected.run.currentStepIds, ["operate"]);
  const duplicate = projectMqttProcessEvent({ current: projected.run, event: event(4, "RUNNING", "operate"), route, process: processDefinition, processRevision: hash });
  assert.equal(duplicate.status, "duplicate");
  assert.throws(() => projectMqttProcessEvent({ current: projected.run, event: event(6, "RUNNING", "observe"), route, process: processDefinition, processRevision: hash }), /MQTT_PROCESS_EVENT_SEQUENCE_GAP/);
  assert.throws(() => projectMqttProcessEvent({ current: projected.run, event: event(5, "RUNNING", "preflight"), route, process: processDefinition, processRevision: hash }), /MQTT_PROCESS_EVENT_STEP_TRANSITION_INVALID/);
  const completedStep = projectMqttProcessEvent({ current: projected.run, event: event(5, "RUNNING", "observe"), route, process: processDefinition, processRevision: hash });
  const completed = projectMqttProcessEvent({ current: completedStep.run, event: event(6, "SUCCEEDED"), route, process: processDefinition, processRevision: hash });
  assert.equal(completed.run.state, "SUCCEEDED");
  assert.equal(completed.run.finishedAt, event(6, "SUCCEEDED").occurredAt);
  assert.deepEqual(completed.run.gaps, []);
});

function decodePackets(socket: Socket, onPacket: (header: number, body: Buffer) => void): void {
  let input = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    input = Buffer.concat([input, chunk]);
    while (input.length >= 2) {
      let index = 1, multiplier = 1, remaining = 0, digit = 0;
      do { if (index >= input.length) return; digit = input[index++]; remaining += (digit & 0x7f) * multiplier; multiplier *= 128; } while (digit & 0x80);
      if (input.length < index + remaining) return;
      const header = input[0], body = input.subarray(index, index + remaining);
      input = input.subarray(index + remaining); onPacket(header, body);
    }
  });
}

function mqttString(value: string): Buffer { const body = Buffer.from(value); const prefix = Buffer.alloc(2); prefix.writeUInt16BE(body.length); return Buffer.concat([prefix, body]); }

test("dependency-free MQTT transport connects, subscribes and receives a broker publication", async (t) => {
  let delivered = false;
  const server: Server = createServer((socket) => decodePackets(socket, (header, body) => {
    const type = header >> 4;
    if (type === 1) socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00]));
    if (type === 8) {
      const id = body.readUInt16BE(0); socket.write(Buffer.from([0x90, 0x03, id >> 8, id & 0xff, 0x00]));
      const topic = mqttString("biofoundry/simulation/process/cultivation_monitoring/events");
      const payload = Buffer.from("{\"ok\":true}");
      socket.write(Buffer.concat([Buffer.from([0x30, topic.length + payload.length]), topic, payload]));
    }
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST_MQTT_ADDRESS_INVALID");
  const received = new Promise<void>((resolve) => {
    const client = new MqttClient({
      url: `mqtt://127.0.0.1:${address.port}`, clientId: "mqtt-transport-test",
      onMessage: (message) => { delivered = message.payload.toString() === '{"ok":true}'; client.close(); resolve(); },
    });
    void client.connect().then(() => client.subscribe([{ topic: "biofoundry/simulation/process/cultivation_monitoring/events", qos: 0 }]));
  });
  await Promise.race([received, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TEST_MQTT_DELIVERY_TIMEOUT")), 1500))]);
  assert.equal(delivered, true);
});

// Compile-time fixture: the demo accepts the same canonical ProcessDocument emitted by the runtime.
const _document: ProcessDocument = { schema: "subactor.process/v1", id: "processes", projectId: "test", sourceSnapshotHash: hash, processes: [processDefinition], coverage: { processes: 1, complete: 1, partial: 0, declaredOnly: 0, steps: 3, evidencedSteps: 0, missingEvidence: 3, missingComponents: 0 }, findings: [] };
void _document;
