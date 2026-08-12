import type { EpistemicType, IntentRecord, SourceAnchor } from "../core/types.js";
import { sha256 } from "../core/canonical.js";
import { RUNTIME_PACKAGE_VERSION } from "../core/generation.js";

const TOP_KEYS = new Set(["schemaVersion", "id", "statement", "lifecycle", "source", "epistemic", "observedAt", "metadata"]);
const STATEMENT_KEYS = new Set(["kind", "actor", "action", "subject", "object", "target", "modality", "polarity", "text"]);
const TARGET_KEYS = new Set(["paths", "symbols", "tickets", "versions"]);
const SOURCE_KEYS = new Set(["kind", "path", "lines", "revision", "symbol", "commitIndex", "extractor", "contentHash", "rawExcerpt"]);
const GENERATION_KEYS = new Set(["generator", "generatorVersion", "runtimeVersion", "requested", "used", "degraded", "fallbackReason", "provider", "model", "responseId"]);
const SOURCE_ANCHOR_KEYS = new Set([
  "artifactUri", "revisionHash", "fragment", "page", "lines", "bbox", "blockId", "artifactId",
  "artifactUrn", "evidenceArtifactIds", "evidenceArtifactUrns", "converter", "converterVersion",
]);
const TYPES = new Set<EpistemicType>(["request", "plan", "decision", "message", "report", "result", "claim"]);
const ACTIONS = new Set(["add", "fix", "remove", "refactor", "test", "document", "configure", "analyze", "validate", "call", "depend_on", "declare", "release", "change", "preserve", "block", "approve", "unknown"]);
const MODALITIES = new Set(["required", "recommended", "optional", "observed", "claimed", "unknown"]);
const LIFECYCLES = new Set(["proposed", "planned", "in_progress", "implemented", "verified", "released", "completed", "blocked", "unknown"]);
const SOURCE_KINDS = new Set(["nl", "git", "ast", "todo", "changelog", "document", "agent_log", "test", "system"]);
const EPISTEMIC = new Set(["declaration", "plan", "claim", "fact", "inference", "llm_inference"]);
const SHA256 = /^[a-f0-9]{64}$/;
const RECORD_ID = /^INT-[A-Z]+-[a-f0-9]{20}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: Set<string>, code: string): void {
  if (Object.keys(value).some((key) => !keys.has(key)) || [...keys].some((key) => !(key in value))) throw new Error(code);
}
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function nullableString(value: unknown): boolean { return value === null || typeof value === "string"; }
function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  return Boolean(value) && typeof value === "object" && Object.values(value as Record<string, unknown>).every(jsonValue);
}
function sourceAnchor(value: unknown, index: number): SourceAnchor {
  const anchor = object(value, `INVALID_T2C_INTENT_SOURCE_ANCHOR:${index}`);
  if (Object.keys(anchor).some((key) => !SOURCE_ANCHOR_KEYS.has(key)) ||
    typeof anchor.artifactUri !== "string" || !anchor.artifactUri ||
    typeof anchor.revisionHash !== "string" || !SHA256.test(anchor.revisionHash) ||
    typeof anchor.converter !== "string" || !anchor.converter ||
    typeof anchor.converterVersion !== "string" || !anchor.converterVersion ||
    (anchor.fragment !== undefined && typeof anchor.fragment !== "string") ||
    (anchor.page !== undefined && (!Number.isInteger(anchor.page) || Number(anchor.page) < 1)) ||
    (anchor.lines !== undefined && (!Array.isArray(anchor.lines) || anchor.lines.length !== 2 ||
      !anchor.lines.every((line) => Number.isInteger(line) && Number(line) >= 1) || Number(anchor.lines[1]) < Number(anchor.lines[0]))) ||
    (anchor.bbox !== undefined && (!Array.isArray(anchor.bbox) || anchor.bbox.length !== 4 ||
      !anchor.bbox.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)))) ||
    [anchor.blockId, anchor.artifactId, anchor.artifactUrn].some((field) => field !== undefined && typeof field !== "string") ||
    (anchor.evidenceArtifactIds !== undefined && !strings(anchor.evidenceArtifactIds)) ||
    (anchor.evidenceArtifactUrns !== undefined && !strings(anchor.evidenceArtifactUrns))) {
    throw new Error(`INVALID_T2C_INTENT_SOURCE_ANCHOR:${index}`);
  }
  return anchor as unknown as SourceAnchor;
}

function record(value: unknown, index: number): IntentRecord {
  const item = object(value, `INVALID_T2C_INTENT:${index}`);
  exact(item, TOP_KEYS, `INVALID_T2C_INTENT_KEYS:${index}`);
  if (item.schemaVersion !== "t2c.intent/v1" || typeof item.id !== "string" || !RECORD_ID.test(item.id)) throw new Error(`INVALID_T2C_INTENT:${index}`);

  const statement = object(item.statement, `INVALID_T2C_INTENT_STATEMENT:${index}`);
  exact(statement, STATEMENT_KEYS, `INVALID_T2C_INTENT_STATEMENT:${index}`);
  if (typeof statement.kind !== "string" || !statement.kind || !nullableString(statement.actor) ||
    typeof statement.action !== "string" || !ACTIONS.has(statement.action) || !nullableString(statement.subject) ||
    typeof statement.object !== "string" || !statement.object || typeof statement.text !== "string" ||
    typeof statement.modality !== "string" || !MODALITIES.has(statement.modality) ||
    !["positive", "negative"].includes(String(statement.polarity))) throw new Error(`INVALID_T2C_INTENT_STATEMENT:${index}`);
  const target = object(statement.target, `INVALID_T2C_INTENT_TARGET:${index}`);
  exact(target, TARGET_KEYS, `INVALID_T2C_INTENT_TARGET:${index}`);
  if (![target.paths, target.symbols, target.tickets, target.versions].every(strings)) throw new Error(`INVALID_T2C_INTENT_TARGET:${index}`);

  const lifecycle = object(item.lifecycle, `INVALID_T2C_INTENT_LIFECYCLE:${index}`);
  exact(lifecycle, new Set(["status"]), `INVALID_T2C_INTENT_LIFECYCLE:${index}`);
  if (typeof lifecycle.status !== "string" || !LIFECYCLES.has(lifecycle.status)) throw new Error(`INVALID_T2C_INTENT_LIFECYCLE:${index}`);

  const source = object(item.source, `INVALID_T2C_INTENT_SOURCE:${index}`);
  exact(source, SOURCE_KEYS, `INVALID_T2C_INTENT_SOURCE:${index}`);
  if (typeof source.kind !== "string" || !SOURCE_KINDS.has(source.kind) || !nullableString(source.path) ||
    !nullableString(source.revision) || !nullableString(source.symbol) || !nullableString(source.rawExcerpt) ||
    typeof source.extractor !== "string" || !source.extractor || typeof source.contentHash !== "string" || !SHA256.test(source.contentHash) ||
    (source.commitIndex !== null && (!Number.isInteger(source.commitIndex) || Number(source.commitIndex) < 1))) throw new Error(`INVALID_T2C_INTENT_SOURCE:${index}`);
  if (source.lines !== null) {
    const lines = object(source.lines, `INVALID_T2C_INTENT_SOURCE:${index}`);
    exact(lines, new Set(["start", "end"]), `INVALID_T2C_INTENT_SOURCE:${index}`);
    if (!Number.isInteger(lines.start) || Number(lines.start) < 1 || !Number.isInteger(lines.end) || Number(lines.end) < Number(lines.start)) throw new Error(`INVALID_T2C_INTENT_SOURCE:${index}`);
  }

  const epistemic = object(item.epistemic, `INVALID_T2C_INTENT_EPISTEMIC:${index}`);
  exact(epistemic, new Set(["class", "confidence", "basis"]), `INVALID_T2C_INTENT_EPISTEMIC:${index}`);
  if (typeof epistemic.class !== "string" || !EPISTEMIC.has(epistemic.class) || typeof epistemic.confidence !== "number" ||
    !Number.isFinite(epistemic.confidence) || epistemic.confidence < 0 || epistemic.confidence > 1 || !strings(epistemic.basis)) throw new Error(`INVALID_T2C_INTENT_EPISTEMIC:${index}`);
  if (item.observedAt !== null && (typeof item.observedAt !== "string" || !ISO_DATE.test(item.observedAt))) throw new Error(`INVALID_T2C_INTENT_OBSERVED_AT:${index}`);

  const metadata = object(item.metadata, `INVALID_T2C_INTENT_METADATA:${index}`);
  if (!jsonValue(metadata)) throw new Error(`INVALID_T2C_INTENT_METADATA:${index}`);
  const generation = object(metadata.generation, `INVALID_T2C_INTENT_GENERATION:${index}`);
  exact(generation, GENERATION_KEYS, `INVALID_T2C_INTENT_GENERATION:${index}`);
  const separator = String(source.extractor).lastIndexOf("@");
  const generator = separator > 0 ? String(source.extractor).slice(0, separator) : String(source.extractor);
  const generatorVersion = separator > 0 ? String(source.extractor).slice(separator + 1) : undefined;
  if (typeof generation.generator !== "string" || generation.generator !== generator ||
    typeof generation.generatorVersion !== "string" || (generatorVersion && generation.generatorVersion !== generatorVersion) ||
    typeof generation.runtimeVersion !== "string" || !SEMVER.test(generation.runtimeVersion) ||
    !["deterministic", "llm"].includes(String(generation.requested)) || !["deterministic", "llm"].includes(String(generation.used)) ||
    typeof generation.degraded !== "boolean" || !nullableString(generation.fallbackReason) || !nullableString(generation.provider) ||
    !nullableString(generation.model) || !nullableString(generation.responseId)) throw new Error(`INVALID_T2C_INTENT_GENERATION:${index}`);
  if (generation.used === "deterministic" && [generation.provider, generation.model, generation.responseId].some((field) => field !== null)) throw new Error(`INVALID_T2C_INTENT_GENERATION:${index}`);
  if (generation.used === "llm" && [generation.provider, generation.model].some((field) => typeof field !== "string" || !field)) throw new Error(`INVALID_T2C_INTENT_GENERATION:${index}`);
  if (generation.degraded === true && (generation.requested !== "llm" || generation.used !== "deterministic" || typeof generation.fallbackReason !== "string" || !generation.fallbackReason)) throw new Error(`INVALID_T2C_INTENT_GENERATION:${index}`);
  if (generation.degraded === false && generation.fallbackReason !== null) throw new Error(`INVALID_T2C_INTENT_GENERATION:${index}`);
  if (epistemic.class === "llm_inference" && generation.used !== "llm") throw new Error(`INVALID_T2C_INTENT_EPISTEMIC:${index}`);

  if (metadata.bioxfoundry !== undefined) {
    const bioxfoundry = object(metadata.bioxfoundry, `INVALID_T2C_INTENT_BIOXFOUNDRY:${index}`);
    exact(bioxfoundry, new Set(["legacyType", "targetUris", "sourceAnchor"]), `INVALID_T2C_INTENT_BIOXFOUNDRY:${index}`);
    if (typeof bioxfoundry.legacyType !== "string" || !TYPES.has(bioxfoundry.legacyType as EpistemicType) ||
      !strings(bioxfoundry.targetUris) || !bioxfoundry.targetUris.length || !bioxfoundry.targetUris.every(Boolean)) throw new Error(`INVALID_T2C_INTENT_BIOXFOUNDRY:${index}`);
    sourceAnchor(bioxfoundry.sourceAnchor, index);
  }
  return item as unknown as IntentRecord;
}

export function validateT2cIntent(value: unknown): IntentRecord[] {
  if (!Array.isArray(value) || !value.length) throw new Error("T2C_INTENT_ARRAY_REQUIRED");
  const records = value.map(record);
  if (new Set(records.map((item) => item.id)).size !== records.length) throw new Error("T2C_INTENT_ID_DUPLICATE");
  return records;
}

export function intentType(record: IntentRecord): EpistemicType {
  const declared = record.metadata.bioxfoundry?.legacyType ?? record.statement.kind;
  return TYPES.has(declared as EpistemicType) ? declared as EpistemicType : "claim";
}
export function intentText(record: IntentRecord): string { return record.statement.text; }
export function intentActor(record: IntentRecord): string { return record.statement.actor ?? "source:unknown"; }
export function intentTargetUris(record: IntentRecord): string[] { return record.metadata.bioxfoundry?.targetUris ?? record.statement.target.paths; }
export function intentSourceAnchor(record: IntentRecord): SourceAnchor | undefined { return record.metadata.bioxfoundry?.sourceAnchor; }
export function intentUri(record: IntentRecord): string { return `urn:subactor:intent:sha256:${sha256(record)}`; }

export function canonicalIntentId(seed: string, prefix = "DOC"): string {
  return `INT-${prefix.replace(/[^A-Z]/g, "") || "DOC"}-${sha256(seed).slice(0, 20)}`;
}

export function canonicalIntentRecord(input: {
  seed: string;
  type: EpistemicType;
  text: string;
  actor?: string;
  targetUris: string[];
  sourceAnchor?: SourceAnchor;
  sourcePath?: string;
  extractor?: string;
  idPrefix?: string;
}): IntentRecord {
  const action = { request: "analyze", plan: "change", decision: "declare", message: "declare", report: "document", result: "validate", claim: "declare" } as const;
  const modality = { request: "recommended", plan: "recommended", decision: "required", message: "claimed", report: "observed", result: "observed", claim: "claimed" } as const;
  const lifecycle = { request: "proposed", plan: "planned", decision: "proposed", message: "unknown", report: "unknown", result: "verified", claim: "unknown" } as const;
  const extractor = input.extractor ?? `twin-dsl.intent-fixture@${RUNTIME_PACKAGE_VERSION}`;
  const split = extractor.lastIndexOf("@");
  const generator = split > 0 ? extractor.slice(0, split) : extractor;
  const generatorVersion = split > 0 ? extractor.slice(split + 1) : RUNTIME_PACKAGE_VERSION;
  const sourcePath = input.sourcePath ?? input.targetUris[0] ?? null;
  const record: IntentRecord = {
    schemaVersion: "t2c.intent/v1",
    id: canonicalIntentId(input.seed, input.idPrefix),
    statement: {
      kind: input.type,
      actor: input.actor ?? "source:markdown",
      action: action[input.type],
      subject: null,
      object: input.text,
      target: { paths: [...input.targetUris], symbols: [], tickets: [], versions: [] },
      modality: modality[input.type],
      polarity: "positive",
      text: input.text,
    },
    lifecycle: { status: lifecycle[input.type] },
    source: {
      kind: "document",
      path: sourcePath,
      lines: input.sourceAnchor?.lines ? { start: input.sourceAnchor.lines[0], end: input.sourceAnchor.lines[1] } : null,
      revision: input.sourceAnchor?.revisionHash ?? null,
      symbol: null,
      commitIndex: null,
      extractor,
      contentHash: sha256(input.text),
      rawExcerpt: input.text,
    },
    epistemic: { class: "declaration", confidence: 0.9, basis: ["deterministic_fixture"] },
    observedAt: null,
    metadata: {
      generation: {
        generator, generatorVersion, runtimeVersion: RUNTIME_PACKAGE_VERSION,
        requested: "deterministic", used: "deterministic", degraded: false, fallbackReason: null,
        provider: null, model: null, responseId: null,
      },
      ...(input.sourceAnchor ? { bioxfoundry: { legacyType: input.type, targetUris: [...input.targetUris], sourceAnchor: input.sourceAnchor } } : {}),
    },
  };
  validateT2cIntent([record]);
  return record;
}
