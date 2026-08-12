import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";

export type MqttQos = 0 | 1;
export interface MqttMessage { topic: string; payload: Buffer; qos: MqttQos; retain: boolean }
export interface MqttClientOptions {
  url: string;
  clientId: string;
  keepAliveSeconds?: number;
  connectTimeoutMs?: number;
  onMessage?: (message: MqttMessage) => void | Promise<void>;
  onDisconnect?: (error?: Error) => void;
}

function variableLength(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 268_435_455) throw new Error(`MQTT_PACKET_LENGTH_INVALID:${value}`);
  const bytes: number[] = [];
  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) digit |= 0x80;
    bytes.push(digit);
  } while (value > 0);
  return Buffer.from(bytes);
}

function mqttString(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  if (body.length > 65_535) throw new Error("MQTT_STRING_TOO_LARGE");
  const prefix = Buffer.allocUnsafe(2); prefix.writeUInt16BE(body.length);
  return Buffer.concat([prefix, body]);
}

function packet(typeFlags: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([typeFlags]), variableLength(body.length), body]);
}

function connectPacket(url: URL, clientId: string, keepAliveSeconds: number): Buffer {
  let flags = 0x02; // clean session
  const payload = [mqttString(clientId)];
  if (url.username) { flags |= 0x80; payload.push(mqttString(decodeURIComponent(url.username))); }
  if (url.password) { flags |= 0x40; payload.push(mqttString(decodeURIComponent(url.password))); }
  const variable = Buffer.concat([
    mqttString("MQTT"),
    Buffer.from([0x04, flags]),
    Buffer.from([(keepAliveSeconds >> 8) & 0xff, keepAliveSeconds & 0xff]),
  ]);
  return packet(0x10, Buffer.concat([variable, ...payload]));
}

function parseUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`MQTT_URL_INVALID:${raw}`); }
  if (url.protocol !== "mqtt:" && url.protocol !== "mqtts:") throw new Error(`MQTT_URL_PROTOCOL_INVALID:${url.protocol}`);
  if (!url.hostname || (url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) throw new Error(`MQTT_URL_INVALID:${raw}`);
  return url;
}

function detail(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class MqttClient {
  private readonly options: MqttClientOptions;
  private socket?: Socket | TLSSocket;
  private input = Buffer.alloc(0);
  private connected = false;
  private closed = false;
  private packetId = 0;
  private pingTimer?: NodeJS.Timeout;
  private connack?: { resolve: () => void; reject: (error: Error) => void };
  private readonly acknowledgements = new Map<number, { type: number; resolve: () => void; reject: (error: Error) => void }>();

  constructor(options: MqttClientOptions) { this.options = options; }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.socket) throw new Error("MQTT_CLIENT_CONNECT_IN_PROGRESS");
    const url = parseUrl(this.options.url);
    const port = Number(url.port || (url.protocol === "mqtts:" ? 8883 : 1883));
    const timeoutMs = this.options.connectTimeoutMs ?? 10_000;
    const socket = url.protocol === "mqtts:"
      ? connectTls({ host: url.hostname, port, servername: url.hostname })
      : connectTcp({ host: url.hostname, port });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("data", (chunk) => { this.input = Buffer.concat([this.input, chunk]); this.consume(); });
    socket.on("error", (error) => this.disconnect(error));
    socket.on("close", () => this.disconnect());
    const opened = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`MQTT_CONNECT_TIMEOUT:${timeoutMs}`)), timeoutMs);
      const event = url.protocol === "mqtts:" ? "secureConnect" : "connect";
      socket.once(event, () => { clearTimeout(timeout); resolve(); });
      socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    });
    try {
      await opened;
      const connack = new Promise<void>((resolve, reject) => { this.connack = { resolve, reject }; });
      socket.write(connectPacket(url, this.options.clientId, this.options.keepAliveSeconds ?? 30));
      let connackTimer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          connack,
          new Promise<never>((_, reject) => { connackTimer = setTimeout(() => reject(new Error("MQTT_CONNACK_TIMEOUT")), timeoutMs); }),
        ]);
      } finally { if (connackTimer) clearTimeout(connackTimer); }
      this.connected = true;
      const interval = Math.max(5, this.options.keepAliveSeconds ?? 30) * 500;
      this.pingTimer = setInterval(() => { if (this.connected) this.socket?.write(Buffer.from([0xc0, 0x00])); }, interval);
      this.pingTimer.unref();
    } catch (error) {
      this.close();
      const current = detail(error);
      if (current.message.startsWith("MQTT_")) throw current;
      throw new Error(`MQTT_CONNECT_FAILED:${current.message}`);
    }
  }

  async subscribe(topics: Array<{ topic: string; qos: MqttQos }>): Promise<void> {
    if (!this.connected || !this.socket) throw new Error("MQTT_CLIENT_NOT_CONNECTED");
    if (!topics.length) throw new Error("MQTT_SUBSCRIBE_TOPICS_REQUIRED");
    const id = this.nextPacketId();
    const prefix = Buffer.allocUnsafe(2); prefix.writeUInt16BE(id);
    const body = Buffer.concat([prefix, ...topics.flatMap((item) => [mqttString(item.topic), Buffer.from([item.qos])])]);
    const ack = this.ack(id, 9);
    this.socket.write(packet(0x82, body));
    await ack;
  }

  async publish(topic: string, payload: string | Buffer, qos: MqttQos = 0): Promise<void> {
    if (!this.connected || !this.socket) throw new Error("MQTT_CLIENT_NOT_CONNECTED");
    const value = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
    if (qos === 0) { this.socket.write(packet(0x30, Buffer.concat([mqttString(topic), value]))); return; }
    const id = this.nextPacketId();
    const idBuffer = Buffer.allocUnsafe(2); idBuffer.writeUInt16BE(id);
    const ack = this.ack(id, 4);
    this.socket.write(packet(0x32, Buffer.concat([mqttString(topic), idBuffer, value])));
    await ack;
  }

  close(): void {
    this.closed = true;
    this.connected = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(Buffer.from([0xe0, 0x00]));
      this.socket.end();
    }
    this.socket = undefined;
  }

  private nextPacketId(): number { this.packetId = this.packetId % 65_535 + 1; return this.packetId; }

  private ack(id: number, type: number): Promise<void> {
    return new Promise<void>((resolve, reject) => this.acknowledgements.set(id, { type, resolve, reject }));
  }

  private disconnect(error?: Error): void {
    const wasActive = Boolean(this.socket);
    this.connected = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    this.socket = undefined;
    this.connack?.reject(error ?? new Error("MQTT_CONNECTION_CLOSED"));
    this.connack = undefined;
    for (const pending of this.acknowledgements.values()) pending.reject(error ?? new Error("MQTT_CONNECTION_CLOSED"));
    this.acknowledgements.clear();
    if (wasActive && !this.closed) this.options.onDisconnect?.(error);
  }

  private consume(): void {
    while (this.input.length >= 2) {
      let multiplier = 1, remaining = 0, index = 1, digit = 0;
      do {
        if (index >= this.input.length || index > 4) return;
        digit = this.input[index++]; remaining += (digit & 0x7f) * multiplier; multiplier *= 128;
      } while ((digit & 0x80) !== 0);
      if (this.input.length < index + remaining) return;
      const header = this.input[0], body = this.input.subarray(index, index + remaining);
      this.input = this.input.subarray(index + remaining);
      try { this.handle(header, body); }
      catch (error) { this.socket?.destroy(detail(error)); }
    }
  }

  private handle(header: number, body: Buffer): void {
    const type = header >> 4;
    if (type === 2) {
      if (body.length !== 2 || body[1] !== 0) throw new Error(`MQTT_CONNACK_REJECTED:${body[1] ?? "missing"}`);
      this.connack?.resolve(); this.connack = undefined; return;
    }
    if (type === 9 || type === 4) {
      if (body.length < 2) throw new Error("MQTT_ACK_INVALID");
      const id = body.readUInt16BE(0), pending = this.acknowledgements.get(id);
      if (!pending || pending.type !== type) throw new Error(`MQTT_ACK_UNEXPECTED:${type}:${id}`);
      if (type === 9 && (body.length < 3 || body[2] === 0x80)) throw new Error(`MQTT_SUBACK_REJECTED:${id}`);
      this.acknowledgements.delete(id); pending.resolve(); return;
    }
    if (type === 3) {
      if (body.length < 2) throw new Error("MQTT_PUBLISH_INVALID");
      const topicLength = body.readUInt16BE(0);
      if (body.length < 2 + topicLength) throw new Error("MQTT_PUBLISH_INVALID");
      const topic = body.subarray(2, 2 + topicLength).toString("utf8");
      const qos = ((header >> 1) & 0x03) as number;
      if (qos > 1) throw new Error(`MQTT_QOS_UNSUPPORTED:${qos}`);
      let offset = 2 + topicLength;
      if (qos === 1) {
        if (body.length < offset + 2) throw new Error("MQTT_PUBLISH_PACKET_ID_REQUIRED");
        const id = body.readUInt16BE(offset); offset += 2;
        const ack = Buffer.allocUnsafe(2); ack.writeUInt16BE(id); this.socket?.write(packet(0x40, ack));
      }
      void Promise.resolve(this.options.onMessage?.({ topic, payload: body.subarray(offset), qos: qos as MqttQos, retain: Boolean(header & 0x01) }))
        .catch((error) => this.options.onDisconnect?.(detail(error)));
    }
  }
}

export async function publishMqttMessage(options: {
  url: string; clientId: string; topic: string; payload: string | Buffer; qos?: MqttQos;
}): Promise<void> {
  const client = new MqttClient(options);
  try { await client.connect(); await client.publish(options.topic, options.payload, options.qos ?? 0); }
  finally { client.close(); }
}
