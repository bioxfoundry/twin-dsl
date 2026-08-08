import { createHash } from "node:crypto";

export const DEVELOPMENT_EVIDENCE_SCHEMA = "onlydsl.development-evidence/v1" as const;

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/;
const GIT_OBJECT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const CONTENT_URN = /^urn:[A-Za-z0-9][A-Za-z0-9:._-]*:sha256:[0-9a-f]{64}$/;
const ASSESSMENTS = new Set(["accepted", "incomplete", "rejected"] as const);
const REQUIRED_FIELDS = new Set([
  "SCHEMA", "PROJECT", "REPOSITORY", "REPOSITORY_REVISION", "REPOSITORY_TREE",
  "PRODUCER", "PRODUCER_VERSION", "GRAPH_URI", "DIAGNOSTICS_URI", "MANIFEST_URI",
  "GRAPH_FINGERPRINT", "ASSESSMENT", "BLOCKING_DIAGNOSTICS", "WARNING_DIAGNOSTICS",
  "SEMANTIC_HASH", "EVIDENCE_URI", "AUTHORITY_EFFECT", "MUTATION_EFFECT",
]);

export type DevelopmentEvidenceAssessment = "accepted" | "incomplete" | "rejected";

export interface DevelopmentEvidenceBundle {
  schema: typeof DEVELOPMENT_EVIDENCE_SCHEMA;
  id: string;
  projectId: string;
  repositoryId: string;
  repositoryRevision: string;
  repositoryTree: string;
  producer: "todo2code";
  producerVersion: string;
  graphUri: string;
  diagnosticsUri: string;
  manifestUri: string;
  graphFingerprint: string;
  assessment: DevelopmentEvidenceAssessment;
  blockingDiagnostics: number;
  warningDiagnostics: number;
  semanticHash: string;
  evidenceUri: string;
  authorityEffect: "none";
  mutationEffect: "none";
}

export type DevelopmentEvidenceDiagnosticCode =
  | "DEVELOPMENT_EVIDENCE_ENVELOPE_INVALID"
  | "DEVELOPMENT_EVIDENCE_FIELD_INVALID"
  | "DEVELOPMENT_EVIDENCE_SCHEMA_UNSUPPORTED"
  | "DEVELOPMENT_EVIDENCE_AUTHORITY_FORBIDDEN"
  | "DEVELOPMENT_EVIDENCE_MUTATION_FORBIDDEN"
  | "DEVELOPMENT_EVIDENCE_IDENTIFIER_INVALID"
  | "DEVELOPMENT_EVIDENCE_GIT_IDENTITY_INVALID"
  | "DEVELOPMENT_EVIDENCE_PRODUCER_INVALID"
  | "DEVELOPMENT_EVIDENCE_URI_INVALID"
  | "DEVELOPMENT_EVIDENCE_HASH_INVALID"
  | "DEVELOPMENT_EVIDENCE_ASSESSMENT_INVALID"
  | "DEVELOPMENT_EVIDENCE_DIAGNOSTIC_COUNT_INVALID"
  | "DEVELOPMENT_EVIDENCE_SEMANTIC_IDENTITY_MISMATCH";

export class DevelopmentEvidenceError extends Error {
  constructor(public readonly code: DevelopmentEvidenceDiagnosticCode, message: string) {
    super(`${code}:${message}`);
    this.name = "DevelopmentEvidenceError";
  }
}

export interface DevelopmentEvidenceVerification {
  ok: boolean;
  code: "PASS" | DevelopmentEvidenceDiagnosticCode;
  bundle?: DevelopmentEvidenceBundle;
  message?: string;
}

function fail(code: DevelopmentEvidenceDiagnosticCode, message: string): never {
  throw new DevelopmentEvidenceError(code, message);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON forbids non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError(`canonical JSON does not support ${typeof value}`);
}

function semanticPayload(bundle: DevelopmentEvidenceBundle): Record<string, unknown> {
  return {
    schema: DEVELOPMENT_EVIDENCE_SCHEMA,
    id: bundle.id,
    projectId: bundle.projectId,
    repositoryId: bundle.repositoryId,
    repositoryRevision: bundle.repositoryRevision,
    repositoryTree: bundle.repositoryTree,
    producer: bundle.producer,
    producerVersion: bundle.producerVersion,
    graphUri: bundle.graphUri,
    diagnosticsUri: bundle.diagnosticsUri,
    manifestUri: bundle.manifestUri,
    graphFingerprint: bundle.graphFingerprint,
    assessment: bundle.assessment,
    blockingDiagnostics: bundle.blockingDiagnostics,
    warningDiagnostics: bundle.warningDiagnostics,
    authorityEffect: "none",
    mutationEffect: "none",
  };
}

export function developmentEvidenceSemanticHash(bundle: DevelopmentEvidenceBundle): string {
  return `sha256:${createHash("sha256").update(canonicalJson(semanticPayload(bundle)), "utf8").digest("hex")}`;
}

function extractBody(markdown: string): string {
  const pattern = /```([A-Za-z][A-Za-z0-9_.-]*)\s*\r?\n([\s\S]*?)```/g;
  const matches = [...markdown.matchAll(pattern)];
  const selected = matches.filter((match) => match[1]?.toLowerCase() === "developmentevidencedsl");
  if (selected.length !== 1 || matches.length !== 1 || markdown.replace(pattern, "").trim()) {
    fail("DEVELOPMENT_EVIDENCE_ENVELOPE_INVALID", "expected exactly one fenced DSL block and no prose");
  }
  return selected[0]?.[2]?.trim() ?? fail("DEVELOPMENT_EVIDENCE_ENVELOPE_INVALID", "missing DSL body");
}

function jsonString(raw: string, field: string): string {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "string") fail("DEVELOPMENT_EVIDENCE_FIELD_INVALID", `${field} must be a JSON string`);
    return value;
  } catch (error) {
    if (error instanceof DevelopmentEvidenceError) throw error;
    return fail("DEVELOPMENT_EVIDENCE_FIELD_INVALID", `${field} must be a JSON string`);
  }
}

function count(raw: string, field: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) {
    fail("DEVELOPMENT_EVIDENCE_DIAGNOSTIC_COUNT_INVALID", `${field} must be a non-negative integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail("DEVELOPMENT_EVIDENCE_DIAGNOSTIC_COUNT_INVALID", `${field} exceeds safe integer range`);
  return value;
}

function validate(bundle: DevelopmentEvidenceBundle): DevelopmentEvidenceBundle {
  for (const [field, value] of [["id", bundle.id], ["projectId", bundle.projectId], ["repositoryId", bundle.repositoryId]] as const) {
    if (!IDENTIFIER.test(value)) fail("DEVELOPMENT_EVIDENCE_IDENTIFIER_INVALID", field);
  }
  if (!GIT_OBJECT.test(bundle.repositoryRevision) || !GIT_OBJECT.test(bundle.repositoryTree)) {
    fail("DEVELOPMENT_EVIDENCE_GIT_IDENTITY_INVALID", "revision and tree must be exact Git object IDs");
  }
  if (bundle.producer !== "todo2code" || !bundle.producerVersion || /[\r\n]/.test(bundle.producerVersion)) {
    fail("DEVELOPMENT_EVIDENCE_PRODUCER_INVALID", "producer identity is invalid");
  }
  for (const [field, value] of [
    ["graphUri", bundle.graphUri], ["diagnosticsUri", bundle.diagnosticsUri],
    ["manifestUri", bundle.manifestUri], ["evidenceUri", bundle.evidenceUri],
  ] as const) {
    if (!CONTENT_URN.test(value)) fail("DEVELOPMENT_EVIDENCE_URI_INVALID", field);
  }
  if (!HASH.test(bundle.graphFingerprint) || !HASH.test(bundle.semanticHash)) {
    fail("DEVELOPMENT_EVIDENCE_HASH_INVALID", "invalid sha256 identity");
  }
  if (!ASSESSMENTS.has(bundle.assessment)) fail("DEVELOPMENT_EVIDENCE_ASSESSMENT_INVALID", bundle.assessment);
  if (bundle.assessment === "accepted" && bundle.blockingDiagnostics !== 0) {
    fail("DEVELOPMENT_EVIDENCE_ASSESSMENT_INVALID", "accepted evidence contains blocking diagnostics");
  }
  if (bundle.assessment === "incomplete" && bundle.blockingDiagnostics === 0) {
    fail("DEVELOPMENT_EVIDENCE_ASSESSMENT_INVALID", "incomplete evidence has no blocking diagnostic");
  }
  const expectedHash = developmentEvidenceSemanticHash(bundle);
  const expectedUri = `urn:onlydsl:development-evidence:${expectedHash}`;
  if (bundle.semanticHash !== expectedHash || bundle.evidenceUri !== expectedUri) {
    fail("DEVELOPMENT_EVIDENCE_SEMANTIC_IDENTITY_MISMATCH", "content hash or evidence URI differs");
  }
  return bundle;
}

export function parseDevelopmentEvidenceDsl(markdown: string): DevelopmentEvidenceBundle {
  const lines = extractBody(markdown).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines.shift();
  const footer = lines.pop();
  if (!header?.startsWith("DEVELOPMENT_EVIDENCE ") || footer !== "END_DEVELOPMENT_EVIDENCE") {
    fail("DEVELOPMENT_EVIDENCE_ENVELOPE_INVALID", "header or footer is invalid");
  }
  const id = header.slice("DEVELOPMENT_EVIDENCE ".length);
  const fields = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf(" ");
    const key = separator < 0 ? line : line.slice(0, separator);
    const raw = separator < 0 ? "" : line.slice(separator + 1);
    if (!REQUIRED_FIELDS.has(key) || fields.has(key) || !raw) {
      fail("DEVELOPMENT_EVIDENCE_FIELD_INVALID", `invalid or duplicate field ${key}`);
    }
    fields.set(key, raw);
  }
  if (fields.size !== REQUIRED_FIELDS.size || [...REQUIRED_FIELDS].some((field) => !fields.has(field))) {
    fail("DEVELOPMENT_EVIDENCE_FIELD_INVALID", "required fields differ");
  }
  const get = (field: string): string => fields.get(field) ?? fail("DEVELOPMENT_EVIDENCE_FIELD_INVALID", `missing ${field}`);
  if (get("SCHEMA") !== DEVELOPMENT_EVIDENCE_SCHEMA) fail("DEVELOPMENT_EVIDENCE_SCHEMA_UNSUPPORTED", get("SCHEMA"));
  if (get("AUTHORITY_EFFECT") !== "none") fail("DEVELOPMENT_EVIDENCE_AUTHORITY_FORBIDDEN", get("AUTHORITY_EFFECT"));
  if (get("MUTATION_EFFECT") !== "none") fail("DEVELOPMENT_EVIDENCE_MUTATION_FORBIDDEN", get("MUTATION_EFFECT"));
  const assessment = get("ASSESSMENT");
  if (!ASSESSMENTS.has(assessment as DevelopmentEvidenceAssessment)) {
    fail("DEVELOPMENT_EVIDENCE_ASSESSMENT_INVALID", assessment);
  }
  return validate({
    schema: DEVELOPMENT_EVIDENCE_SCHEMA,
    id,
    projectId: get("PROJECT"),
    repositoryId: get("REPOSITORY"),
    repositoryRevision: get("REPOSITORY_REVISION"),
    repositoryTree: get("REPOSITORY_TREE"),
    producer: get("PRODUCER") as "todo2code",
    producerVersion: jsonString(get("PRODUCER_VERSION"), "PRODUCER_VERSION"),
    graphUri: get("GRAPH_URI"),
    diagnosticsUri: get("DIAGNOSTICS_URI"),
    manifestUri: get("MANIFEST_URI"),
    graphFingerprint: get("GRAPH_FINGERPRINT"),
    assessment: assessment as DevelopmentEvidenceAssessment,
    blockingDiagnostics: count(get("BLOCKING_DIAGNOSTICS"), "BLOCKING_DIAGNOSTICS"),
    warningDiagnostics: count(get("WARNING_DIAGNOSTICS"), "WARNING_DIAGNOSTICS"),
    semanticHash: get("SEMANTIC_HASH"),
    evidenceUri: get("EVIDENCE_URI"),
    authorityEffect: "none",
    mutationEffect: "none",
  });
}

export function renderDevelopmentEvidenceDsl(bundle: DevelopmentEvidenceBundle): string {
  validate(bundle);
  return [
    "```developmentevidencedsl",
    `DEVELOPMENT_EVIDENCE ${bundle.id}`,
    `SCHEMA ${DEVELOPMENT_EVIDENCE_SCHEMA}`,
    `PROJECT ${bundle.projectId}`,
    `REPOSITORY ${bundle.repositoryId}`,
    `REPOSITORY_REVISION ${bundle.repositoryRevision}`,
    `REPOSITORY_TREE ${bundle.repositoryTree}`,
    "PRODUCER todo2code",
    `PRODUCER_VERSION ${JSON.stringify(bundle.producerVersion)}`,
    `GRAPH_URI ${bundle.graphUri}`,
    `DIAGNOSTICS_URI ${bundle.diagnosticsUri}`,
    `MANIFEST_URI ${bundle.manifestUri}`,
    `GRAPH_FINGERPRINT ${bundle.graphFingerprint}`,
    `ASSESSMENT ${bundle.assessment}`,
    `BLOCKING_DIAGNOSTICS ${bundle.blockingDiagnostics}`,
    `WARNING_DIAGNOSTICS ${bundle.warningDiagnostics}`,
    `SEMANTIC_HASH ${bundle.semanticHash}`,
    `EVIDENCE_URI ${bundle.evidenceUri}`,
    "AUTHORITY_EFFECT none",
    "MUTATION_EFFECT none",
    "END_DEVELOPMENT_EVIDENCE",
    "```",
  ].join("\n");
}

export function verifyDevelopmentEvidenceDsl(markdown: string): DevelopmentEvidenceVerification {
  try {
    return { ok: true, code: "PASS", bundle: parseDevelopmentEvidenceDsl(markdown) };
  } catch (error) {
    if (error instanceof DevelopmentEvidenceError) return { ok: false, code: error.code, message: error.message };
    return { ok: false, code: "DEVELOPMENT_EVIDENCE_FIELD_INVALID", message: String(error) };
  }
}
