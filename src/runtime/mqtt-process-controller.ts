import type {
  MqttBindingDocument,
  MqttProcessEvent,
  MqttProcessRoute,
  MqttSourceMode,
  ProcessDocument,
  UriProcessRunDocument,
} from "../core/types.js";
import { expandMqttRouteTopics, validateMqttBinding } from "../dsl/mqtt-binding.js";
import { MqttClient } from "../transport/mqtt.js";
import { projectMqttProcessEvent, validateMqttProcessEvent } from "./uri-process-run.js";

export interface MqttProcessAuditRecord {
  schema: "subactor.mqtt-process-ingest-receipt/v1";
  recordedAt: string;
  status: "accepted" | "duplicate" | "rejected";
  topic: string;
  brokerId: string;
  event?: MqttProcessEvent;
  run?: UriProcessRunDocument;
  error?: string;
}

export interface MqttDashboardState {
  schema: "subactor.mqtt-dashboard-state/v1";
  configured: boolean;
  authority: "observe-only";
  mode: MqttSourceMode | null;
  availableModes: MqttSourceMode[];
  connection: "not-configured" | "connecting" | "connected" | "degraded" | "disconnected";
  brokers: Array<{ id: string; connected: boolean; endpoint: string | null; error: string | null }>;
  subscriptions: Array<{ brokerId: string; topic: string; mode: MqttSourceMode; processId: string; processUri: string }>;
  acceptedEvents: number;
  duplicateEvents: number;
  rejectedEvents: number;
  lastEventAt: string | null;
  lastError: string | null;
  activeRuns: UriProcessRunDocument[];
}

interface ExpandedRoute { route: MqttProcessRoute; topic: string; mode: MqttSourceMode }

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export class MqttProcessController {
  readonly binding: MqttBindingDocument;
  private selectedMode: MqttSourceMode;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly loadProcesses: () => Promise<ProcessDocument | null>;
  private readonly audit?: (record: MqttProcessAuditRecord) => void | Promise<void>;
  private readonly clients = new Map<string, MqttClient>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly connected = new Set<string>();
  private readonly brokerErrors = new Map<string, string>();
  private readonly routesByTopic = new Map<string, ExpandedRoute>();
  private readonly runs = new Map<string, UriProcessRunDocument>();
  private acceptedEvents = 0;
  private duplicateEvents = 0;
  private rejectedEvents = 0;
  private lastEventAt: string | null = null;
  private lastError: string | null = null;
  private started = false;
  private stopped = false;

  constructor(options: {
    binding: MqttBindingDocument;
    environment?: NodeJS.ProcessEnv;
    loadProcesses: () => Promise<ProcessDocument | null>;
    audit?: (record: MqttProcessAuditRecord) => void | Promise<void>;
  }) {
    this.binding = validateMqttBinding(options.binding);
    this.selectedMode = this.binding.defaultMode;
    this.environment = options.environment ?? process.env;
    this.loadProcesses = options.loadProcesses;
    this.audit = options.audit;
    for (const route of this.binding.processRoutes) for (const expanded of expandMqttRouteTopics(route)) {
      this.routesByTopic.set(`${route.brokerId}\u0000${expanded.topic}`, { route, ...expanded });
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    for (const broker of this.binding.brokers) this.connectBroker(broker.id);
  }

  close(): void {
    this.stopped = true;
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
    for (const client of this.clients.values()) client.close();
    this.clients.clear(); this.connected.clear();
  }

  setMode(mode: MqttSourceMode): void {
    if (!this.availableModes().includes(mode)) throw new Error(`MQTT_MODE_UNAVAILABLE:${mode}`);
    this.selectedMode = mode;
  }

  async ingest(brokerId: string, topic: string, payload: Buffer | string): Promise<void> {
    const recordedAt = new Date().toISOString();
    const expanded = this.routesByTopic.get(`${brokerId}\u0000${topic}`);
    let event: MqttProcessEvent | undefined;
    try {
      if (!expanded) throw new Error(`MQTT_TOPIC_UNBOUND:${topic}`);
      const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
      if (bytes.length > 262_144) throw new Error(`MQTT_PROCESS_EVENT_TOO_LARGE:${bytes.length}`);
      let parsed: unknown;
      try { parsed = JSON.parse(bytes.toString("utf8")); }
      catch { throw new Error("MQTT_PROCESS_EVENT_JSON_INVALID"); }
      event = validateMqttProcessEvent(parsed);
      if (event.sourceMode !== expanded.mode) throw new Error(`MQTT_PROCESS_EVENT_TOPIC_MODE_MISMATCH:${event.sourceMode}:${expanded.mode}`);
      const processDocument = await this.loadProcesses();
      if (!processDocument || processDocument.schema !== "subactor.process/v1") throw new Error("MQTT_PROCESS_MODEL_NOT_AVAILABLE");
      const process = processDocument.processes.find((item) => item.id === expanded.route.processId);
      if (!process) throw new Error(`MQTT_PROCESS_ROUTE_PROCESS_NOT_FOUND:${expanded.route.processId}`);
      const runKey = `${event.sourceMode}\u0000${event.runId}`;
      const result = projectMqttProcessEvent({
        current: this.runs.get(runKey), event, route: expanded.route, process,
        processRevision: processDocument.sourceSnapshotHash,
      });
      this.runs.set(runKey, result.run);
      this.lastEventAt = recordedAt;
      this.lastError = null;
      if (result.status === "accepted") this.acceptedEvents += 1; else this.duplicateEvents += 1;
      await this.audit?.({
        schema: "subactor.mqtt-process-ingest-receipt/v1", recordedAt, status: result.status,
        topic, brokerId, event, run: result.run,
      });
    } catch (error) {
      const message = errorMessage(error);
      this.rejectedEvents += 1; this.lastEventAt = recordedAt; this.lastError = message;
      await this.audit?.({
        schema: "subactor.mqtt-process-ingest-receipt/v1", recordedAt, status: "rejected",
        topic, brokerId, ...(event ? { event } : {}), error: message,
      });
    }
  }

  snapshot(): MqttDashboardState {
    const brokers = this.binding.brokers.map((broker) => ({
      id: broker.id,
      connected: this.connected.has(broker.id),
      endpoint: this.environment[broker.urlEnv] ? redactMqttUrl(this.environment[broker.urlEnv]!) : null,
      error: this.brokerErrors.get(broker.id) ?? null,
    }));
    const connectedCount = brokers.filter((broker) => broker.connected).length;
    const connection = connectedCount === brokers.length ? "connected"
      : connectedCount > 0 ? "degraded"
      : this.clients.size > 0 && brokers.every((broker) => broker.error === null) ? "connecting"
      : this.started ? "disconnected" : "not-configured";
    return {
      schema: "subactor.mqtt-dashboard-state/v1",
      configured: true,
      authority: "observe-only",
      mode: this.selectedMode,
      availableModes: this.availableModes(),
      connection,
      brokers,
      subscriptions: [...this.routesByTopic.values()].map((entry) => ({
        brokerId: entry.route.brokerId, topic: entry.topic, mode: entry.mode,
        processId: entry.route.processId, processUri: entry.route.processUri,
      })),
      acceptedEvents: this.acceptedEvents,
      duplicateEvents: this.duplicateEvents,
      rejectedEvents: this.rejectedEvents,
      lastEventAt: this.lastEventAt,
      lastError: this.lastError,
      activeRuns: [...this.runs.values()].filter((run) => run.sourceMode === this.selectedMode),
    };
  }

  private availableModes(): MqttSourceMode[] {
    return ["simulation", "shadow", "hardware"].filter((mode) =>
      this.binding.processRoutes.some((route) => route.modes.includes(mode as MqttSourceMode)),
    ) as MqttSourceMode[];
  }

  private connectBroker(brokerId: string): void {
    if (this.stopped) return;
    const broker = this.binding.brokers.find((item) => item.id === brokerId);
    if (!broker) return;
    const endpoint = this.environment[broker.urlEnv];
    if (!endpoint) { this.brokerErrors.set(broker.id, `MQTT_URL_NOT_CONFIGURED:${broker.urlEnv}`); return; }
    this.reconnectTimers.delete(broker.id);
    this.clients.get(broker.id)?.close();
    const routes = [...this.routesByTopic.values()].filter((entry) => entry.route.brokerId === broker.id);
    const client = new MqttClient({
      url: endpoint,
      clientId: `${broker.clientId}-${process.pid}`,
      keepAliveSeconds: broker.keepAliveSeconds,
      onMessage: (message) => this.ingest(broker.id, message.topic, message.payload),
      onDisconnect: (error) => {
        this.connected.delete(broker.id);
        this.brokerErrors.set(broker.id, error?.message ?? "MQTT_CONNECTION_CLOSED");
        this.scheduleReconnect(broker.id);
      },
    });
    this.clients.set(broker.id, client);
    void client.connect()
      .then(() => client.subscribe(routes.map((entry) => ({ topic: entry.topic, qos: entry.route.qos }))))
      .then(() => { this.connected.add(broker.id); this.brokerErrors.delete(broker.id); })
      .catch((error) => {
        this.connected.delete(broker.id); this.brokerErrors.set(broker.id, errorMessage(error));
        this.scheduleReconnect(broker.id);
      });
  }

  private scheduleReconnect(brokerId: string): void {
    if (this.stopped || this.reconnectTimers.has(brokerId)) return;
    const timer = setTimeout(() => this.connectBroker(brokerId), 2_000);
    timer.unref(); this.reconnectTimers.set(brokerId, timer);
  }
}

function redactMqttUrl(raw: string): string {
  try { const url = new URL(raw); url.username = ""; url.password = ""; return url.toString(); }
  catch { return "invalid"; }
}

export function mqttNotConfiguredState(): MqttDashboardState {
  return {
    schema: "subactor.mqtt-dashboard-state/v1", configured: false, authority: "observe-only",
    mode: null, availableModes: [], connection: "not-configured", brokers: [], subscriptions: [],
    acceptedEvents: 0, duplicateEvents: 0, rejectedEvents: 0, lastEventAt: null, lastError: null, activeRuns: [],
  };
}
