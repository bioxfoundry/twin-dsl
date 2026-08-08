import type { LiveBinding, LiveBindingDocument, LiveBindingRange, MathValue } from "./types.js";
import { lines, unquote } from "./syntax.js";

function durationMs(raw: string): number {
  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) throw new Error(`LIVE_BINDING_DURATION_INVALID:${raw}`);
  const scale = match[2] === "ms" ? 1 : match[2] === "s" ? 1_000 : match[2] === "m" ? 60_000 : 3_600_000;
  return Number(match[1]) * scale;
}

function renderDuration(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1_000 === 0) return `${ms / 1_000}s`;
  return `${ms}ms`;
}

function scalarKey(raw: string): string {
  let value: MathValue;
  try { value = JSON.parse(raw) as MathValue; }
  catch { value = unquote(raw); }
  if (!["string", "number", "boolean"].includes(typeof value)) throw new Error(`LIVE_BINDING_VALUE_INVALID:${raw}`);
  return JSON.stringify(value);
}

export function parseLiveBindingDsl(source: string): LiveBindingDocument {
  const input = lines(source);
  const header = input.shift()?.match(/^LIVE_BINDINGS\s+(\S+)$/);
  if (!header) throw new Error("LIVE_BINDINGS_HEADER_REQUIRED");
  const bindings: LiveBinding[] = [];
  let current: Partial<LiveBinding> | undefined;
  for (const line of input) {
    if (line.startsWith("BIND ")) {
      if (current) throw new Error("LIVE_BINDING_END_REQUIRED");
      current = { id: line.slice(5).trim(), valueStates: {}, ranges: [] };
      continue;
    }
    if (line === "END") {
      if (!current) throw new Error("LIVE_BINDING_NOT_STARTED");
      bindings.push(current as LiveBinding);
      current = undefined;
      continue;
    }
    if (!current) throw new Error(`LIVE_BINDING_LINE_OUTSIDE:${line}`);
    const space = line.indexOf(" ");
    if (space < 0) throw new Error(`LIVE_BINDING_KEY_VALUE_REQUIRED:${line}`);
    const key = line.slice(0, space).toUpperCase();
    const raw = line.slice(space + 1).trim();
    if (key === "SUBJECT") current.source = { subjectUri: unquote(raw), metric: current.source?.metric ?? "" };
    else if (key === "METRIC") current.source = { subjectUri: current.source?.subjectUri ?? "", metric: unquote(raw) };
    else if (key === "TARGET") {
      const target = raw.match(/^(\S+)\s+(\S+)$/);
      if (!target) throw new Error(`LIVE_BINDING_TARGET_INVALID:${raw}`);
      current.target = { componentId: target[1], property: target[2] };
    } else if (key === "FRESH_FOR") {
      const freshForMs = durationMs(raw);
      current.freshness = { freshForMs, expireAfterMs: current.freshness?.expireAfterMs ?? freshForMs, onStale: current.freshness?.onStale ?? "unknown" };
    } else if (key === "EXPIRE_AFTER") {
      const expireAfterMs = durationMs(raw);
      current.freshness = { freshForMs: current.freshness?.freshForMs ?? expireAfterMs, expireAfterMs, onStale: current.freshness?.onStale ?? "unknown" };
    } else if (key === "ON_STALE") {
      current.freshness = { freshForMs: current.freshness?.freshForMs ?? 0, expireAfterMs: current.freshness?.expireAfterMs ?? 0, onStale: unquote(raw) };
    } else if (key === "VALUE_STATE") {
      const mapped = raw.match(/^(.+)\s+(\S+)$/);
      if (!mapped) throw new Error(`LIVE_BINDING_VALUE_STATE_INVALID:${raw}`);
      current.valueStates![scalarKey(mapped[1])] = mapped[2];
    } else if (key === "RANGE_STATE") {
      const range = raw.match(/^(\*|[-+]?\d+(?:\.\d+)?)\s+(\*|[-+]?\d+(?:\.\d+)?)\s+(\S+)$/);
      if (!range) throw new Error(`LIVE_BINDING_RANGE_INVALID:${raw}`);
      current.ranges!.push({ min: range[1] === "*" ? undefined : Number(range[1]), max: range[2] === "*" ? undefined : Number(range[2]), state: range[3] });
    } else throw new Error(`LIVE_BINDING_UNKNOWN_KEY:${key}`);
  }
  if (current) throw new Error("LIVE_BINDING_END_REQUIRED");
  return validateLiveBinding({ schema: "subactor.live-binding/v1", id: header[1], bindings });
}

export function renderLiveBindingDsl(document: LiveBindingDocument): string {
  validateLiveBinding(document);
  const output = [`LIVE_BINDINGS ${document.id}`];
  for (const binding of document.bindings) {
    output.push(`BIND ${binding.id}`, `SUBJECT ${JSON.stringify(binding.source.subjectUri)}`, `METRIC ${JSON.stringify(binding.source.metric)}`, `TARGET ${binding.target.componentId} ${binding.target.property}`, `FRESH_FOR ${renderDuration(binding.freshness.freshForMs)}`, `EXPIRE_AFTER ${renderDuration(binding.freshness.expireAfterMs)}`, `ON_STALE ${binding.freshness.onStale}`);
    for (const [value, state] of Object.entries(binding.valueStates)) output.push(`VALUE_STATE ${value} ${state}`);
    for (const range of binding.ranges) output.push(`RANGE_STATE ${range.min ?? "*"} ${range.max ?? "*"} ${range.state}`);
    output.push("END");
  }
  return `${output.join("\n")}\n`;
}

export function validateLiveBinding(value: unknown): LiveBindingDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LIVE_BINDING_DOCUMENT_REQUIRED");
  const document = value as Record<string, unknown>;
  if (Object.keys(document).some((key) => !["schema", "id", "bindings"].includes(key))) throw new Error("LIVE_BINDING_DOCUMENT_UNKNOWN_KEY");
  if (document.schema !== "subactor.live-binding/v1" || typeof document.id !== "string" || !document.id || !Array.isArray(document.bindings) || document.bindings.length === 0) throw new Error("LIVE_BINDING_DOCUMENT_INVALID");
  const ids = new Set<string>();
  for (const raw of document.bindings) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("LIVE_BINDING_INVALID");
    const binding = raw as LiveBinding;
    const record = raw as unknown as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["id", "source", "target", "freshness", "valueStates", "ranges"].includes(key))) throw new Error(`LIVE_BINDING_UNKNOWN_KEY:${binding.id ?? "unknown"}`);
    if (Object.keys(binding.source ?? {}).some((key) => !["subjectUri", "metric"].includes(key)) || Object.keys(binding.target ?? {}).some((key) => !["componentId", "property"].includes(key)) || Object.keys(binding.freshness ?? {}).some((key) => !["freshForMs", "expireAfterMs", "onStale"].includes(key))) throw new Error(`LIVE_BINDING_NESTED_UNKNOWN_KEY:${binding.id ?? "unknown"}`);
    if (!binding.id || ids.has(binding.id) || !binding.source?.subjectUri || !binding.source.metric || !binding.target?.componentId || !binding.target.property || !binding.freshness || !Number.isFinite(binding.freshness.freshForMs) || !Number.isFinite(binding.freshness.expireAfterMs) || binding.freshness.freshForMs < 0 || binding.freshness.expireAfterMs < binding.freshness.freshForMs || !binding.freshness.onStale || !binding.valueStates || !Array.isArray(binding.ranges)) throw new Error(`LIVE_BINDING_INVALID:${binding.id ?? "unknown"}`);
    if (Object.values(binding.valueStates).some((state) => typeof state !== "string")) throw new Error(`LIVE_BINDING_VALUE_STATE_INVALID:${binding.id}`);
    for (const range of binding.ranges as LiveBindingRange[]) if (!range || typeof range !== "object" || Array.isArray(range) || Object.keys(range).some((key) => !["min", "max", "state"].includes(key)) || (range.min !== undefined && !Number.isFinite(range.min)) || (range.max !== undefined && !Number.isFinite(range.max)) || (range.min !== undefined && range.max !== undefined && range.min > range.max) || !range.state) throw new Error(`LIVE_BINDING_RANGE_INVALID:${binding.id}`);
    ids.add(binding.id);
  }
  return value as LiveBindingDocument;
}
