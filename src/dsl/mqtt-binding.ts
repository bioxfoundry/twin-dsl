import type {
  MqttBindingDocument,
  MqttBrokerBinding,
  MqttProcessRoute,
  MqttSourceMode,
} from "../core/types.js";
import { kv, lines, list, unquote } from "./parser-util.js";

const MODES: MqttSourceMode[] = ["simulation", "shadow", "hardware"];
const URI_PROCESS = /^twin:\/\/[a-z0-9.-]+\/process\/query\/[a-z0-9._~-]+$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

function mode(raw: string): MqttSourceMode {
  if (!MODES.includes(raw as MqttSourceMode)) throw new Error(`MQTT_BINDING_MODE_INVALID:${raw}`);
  return raw as MqttSourceMode;
}

function positiveInteger(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`MQTT_BINDING_KEEP_ALIVE_INVALID:${raw}`);
  return value;
}

function validateTopic(topic: string): void {
  if (!topic || topic.startsWith("/") || topic.endsWith("/") || topic.includes("//")) {
    throw new Error(`MQTT_BINDING_TOPIC_INVALID:${topic}`);
  }
  if (topic.includes("+") || topic.includes("#")) throw new Error(`MQTT_BINDING_TOPIC_WILDCARD_FORBIDDEN:${topic}`);
  const placeholders = [...topic.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  if (placeholders.some((value) => value !== "mode") || placeholders.length > 1) {
    throw new Error(`MQTT_BINDING_TOPIC_PLACEHOLDER_INVALID:${topic}`);
  }
}

export function expandMqttRouteTopics(route: MqttProcessRoute): Array<{ topic: string; mode: MqttSourceMode }> {
  return route.modes.map((sourceMode) => ({
    topic: route.topic.includes("{mode}") ? route.topic.replace("{mode}", sourceMode) : route.topic,
    mode: sourceMode,
  }));
}

export function validateMqttBinding(value: unknown): MqttBindingDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MQTT_BINDING_DOCUMENT_REQUIRED");
  const document = value as MqttBindingDocument;
  const rootKeys = ["schema", "id", "defaultMode", "brokers", "processRoutes", "authority"];
  for (const key of Object.keys(value)) if (!rootKeys.includes(key)) throw new Error(`MQTT_BINDING_UNKNOWN_KEY:${key}`);
  if (
    document.schema !== "subactor.mqtt-binding/v1" ||
    typeof document.id !== "string" || !document.id ||
    !MODES.includes(document.defaultMode) ||
    document.authority !== "observe-only" ||
    !Array.isArray(document.brokers) || document.brokers.length === 0 ||
    !Array.isArray(document.processRoutes) || document.processRoutes.length === 0
  ) throw new Error("MQTT_BINDING_DOCUMENT_INVALID");

  const brokerIds = new Set<string>();
  for (const raw of document.brokers) {
    const broker = raw as MqttBrokerBinding;
    const allowed = ["id", "urlEnv", "clientId", "keepAliveSeconds"];
    for (const key of Object.keys(broker)) if (!allowed.includes(key)) throw new Error(`MQTT_BINDING_BROKER_UNKNOWN_KEY:${key}`);
    if (
      typeof broker.id !== "string" || !broker.id || brokerIds.has(broker.id) ||
      typeof broker.urlEnv !== "string" || !ENV_NAME.test(broker.urlEnv) ||
      typeof broker.clientId !== "string" || !broker.clientId || broker.clientId.length > 128 ||
      !Number.isInteger(broker.keepAliveSeconds) || broker.keepAliveSeconds < 5 || broker.keepAliveSeconds > 3600
    ) throw new Error(`MQTT_BINDING_BROKER_INVALID:${String(broker.id ?? "missing")}`);
    brokerIds.add(broker.id);
  }

  const routeIds = new Set<string>();
  const expandedTopics = new Set<string>();
  for (const raw of document.processRoutes) {
    const route = raw as MqttProcessRoute;
    const allowed = ["id", "brokerId", "topic", "qos", "processId", "processUri", "modes"];
    for (const key of Object.keys(route)) if (!allowed.includes(key)) throw new Error(`MQTT_BINDING_ROUTE_UNKNOWN_KEY:${key}`);
    if (
      typeof route.id !== "string" || !route.id || routeIds.has(route.id) ||
      typeof route.brokerId !== "string" || !brokerIds.has(route.brokerId) ||
      typeof route.topic !== "string" ||
      (route.qos !== 0 && route.qos !== 1) ||
      typeof route.processId !== "string" || !route.processId ||
      typeof route.processUri !== "string" || !URI_PROCESS.test(route.processUri) ||
      !route.processUri.endsWith(`/process/query/${route.processId}`) ||
      !Array.isArray(route.modes) || route.modes.length === 0 ||
      route.modes.some((item) => !MODES.includes(item)) || new Set(route.modes).size !== route.modes.length
    ) throw new Error(`MQTT_BINDING_ROUTE_INVALID:${String(route.id ?? "missing")}`);
    validateTopic(route.topic);
    if (route.modes.length > 1 && !route.topic.includes("{mode}")) {
      throw new Error(`MQTT_BINDING_MODE_TOPIC_AMBIGUOUS:${route.id}`);
    }
    for (const expanded of expandMqttRouteTopics(route)) {
      const key = `${route.brokerId}\u0000${expanded.topic}`;
      if (expandedTopics.has(key)) throw new Error(`MQTT_BINDING_TOPIC_DUPLICATE:${expanded.topic}`);
      expandedTopics.add(key);
    }
    routeIds.add(route.id);
  }
  if (!document.processRoutes.some((route) => route.modes.includes(document.defaultMode))) {
    throw new Error(`MQTT_BINDING_DEFAULT_MODE_UNROUTED:${document.defaultMode}`);
  }
  return document;
}

export function parseMqttBindingDsl(source: string): MqttBindingDocument {
  const input = lines(source);
  const header = input.shift()?.match(/^MQTT_BINDINGS\s+(\S+)$/i);
  if (!header) throw new Error("MQTT_BINDING_HEADER_REQUIRED");
  const document: Partial<MqttBindingDocument> = {
    schema: "subactor.mqtt-binding/v1",
    id: header[1],
    brokers: [],
    processRoutes: [],
  };
  let broker: Partial<MqttBrokerBinding> | undefined;
  let route: Partial<MqttProcessRoute> | undefined;
  let ended = false;
  for (const line of input) {
    if (ended) throw new Error(`MQTT_BINDING_TRAILING_CONTENT:${line}`);
    if (line === "END_MQTT_BINDINGS") { if (broker || route) throw new Error("MQTT_BINDING_BLOCK_END_REQUIRED"); ended = true; continue; }
    if (line.startsWith("BROKER ")) {
      if (broker || route) throw new Error("MQTT_BINDING_BLOCK_END_REQUIRED");
      broker = { id: unquote(line.slice("BROKER ".length)) };
      continue;
    }
    if (line.startsWith("PROCESS_ROUTE ")) {
      if (broker || route) throw new Error("MQTT_BINDING_BLOCK_END_REQUIRED");
      route = { id: unquote(line.slice("PROCESS_ROUTE ".length)) };
      continue;
    }
    if (line === "END_BROKER") {
      if (!broker || route) throw new Error("MQTT_BINDING_BROKER_NOT_STARTED");
      document.brokers!.push(broker as MqttBrokerBinding); broker = undefined; continue;
    }
    if (line === "END_PROCESS_ROUTE") {
      if (!route || broker) throw new Error("MQTT_BINDING_ROUTE_NOT_STARTED");
      document.processRoutes!.push(route as MqttProcessRoute); route = undefined; continue;
    }
    const [key, raw] = kv(line);
    if (broker) {
      if (key === "URL_ENV") broker.urlEnv = unquote(raw);
      else if (key === "CLIENT_ID") broker.clientId = unquote(raw);
      else if (key === "KEEP_ALIVE_SECONDS") broker.keepAliveSeconds = positiveInteger(raw);
      else throw new Error(`MQTT_BINDING_BROKER_UNKNOWN_KEY:${key}`);
    } else if (route) {
      if (key === "BROKER_ID") route.brokerId = unquote(raw);
      else if (key === "TOPIC") route.topic = unquote(raw);
      else if (key === "QOS") { const qos = Number(raw); if (qos !== 0 && qos !== 1) throw new Error(`MQTT_BINDING_QOS_INVALID:${raw}`); route.qos = qos; }
      else if (key === "PROCESS_ID") route.processId = unquote(raw);
      else if (key === "PROCESS_URI") route.processUri = unquote(raw);
      else if (key === "MODES") route.modes = list(raw).map(mode);
      else throw new Error(`MQTT_BINDING_ROUTE_UNKNOWN_KEY:${key}`);
    } else if (key === "DEFAULT_MODE") document.defaultMode = mode(raw);
    else if (key === "AUTHORITY") document.authority = unquote(raw) as "observe-only";
    else throw new Error(`MQTT_BINDING_UNKNOWN_KEY:${key}`);
  }
  if (!ended) throw new Error("MQTT_BINDING_END_REQUIRED");
  return validateMqttBinding(document);
}

export function renderMqttBindingDsl(value: MqttBindingDocument): string {
  const document = validateMqttBinding(value);
  const output = [
    `MQTT_BINDINGS ${document.id}`,
    `DEFAULT_MODE ${document.defaultMode}`,
    `AUTHORITY ${document.authority}`,
  ];
  for (const broker of document.brokers) output.push(
    `BROKER ${JSON.stringify(broker.id)}`,
    `URL_ENV ${broker.urlEnv}`,
    `CLIENT_ID ${JSON.stringify(broker.clientId)}`,
    `KEEP_ALIVE_SECONDS ${broker.keepAliveSeconds}`,
    "END_BROKER",
  );
  for (const route of document.processRoutes) output.push(
    `PROCESS_ROUTE ${JSON.stringify(route.id)}`,
    `BROKER_ID ${brokerId(route)}`,
    `TOPIC ${JSON.stringify(route.topic)}`,
    `QOS ${route.qos}`,
    `PROCESS_ID ${JSON.stringify(route.processId)}`,
    `PROCESS_URI ${route.processUri}`,
    `MODES [${route.modes.join(",")}]`,
    "END_PROCESS_ROUTE",
  );
  output.push("END_MQTT_BINDINGS");
  return `${output.join("\n")}\n`;
}

function brokerId(route: MqttProcessRoute): string {
  return JSON.stringify(route.brokerId);
}
