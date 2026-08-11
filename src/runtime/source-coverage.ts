import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  SourceCoverageDocument,
  SourceCoverageRecord,
  SourceCoverageState,
} from "../core/types.js";
import { canonicalJson, sha256 } from "../core/canonical.js";

export const SOURCE_COVERAGE_STATES: SourceCoverageState[] = [
  "converted",
  "binary-provenance",
  "excluded-by-policy",
  "unsupported",
  "quarantined",
  "failed",
];

const HEX = /^[a-f0-9]{64}$/;
const REASON = /^[A-Z][A-Z0-9_]*$/;
const ownKeys = (value: Record<string, unknown>, expected: string[]): boolean =>
  Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
const safeRelative = (value: string): boolean =>
  value.length > 0
  && !value.startsWith("/")
  && !value.includes("\\")
  && !value.split("/").includes("..");

function invalid(code: string): never {
  throw new Error(`SOURCE_COVERAGE_${code}`);
}

function validateRecord(value: unknown): SourceCoverageRecord {
  if (!object(value) || !ownKeys(value, [
    "path", "inputKind", "mediaType", "sourceSha256", "resourceUri", "markdownPath",
    "intentUris", "treeRefs", "converter", "converterVersion", "state", "reasonCode",
    "twinRevisionStatus",
  ])) invalid("RECORD_SHAPE_INVALID");
  if (typeof value.path !== "string" || !safeRelative(value.path)) invalid("PATH_INVALID");
  if (typeof value.inputKind !== "string") invalid("INPUT_KIND_INVALID");
  if (typeof value.mediaType !== "string" || !value.mediaType) invalid("MEDIA_TYPE_INVALID");
  if (typeof value.sourceSha256 !== "string" || !HEX.test(value.sourceSha256)) invalid("SOURCE_HASH_INVALID");
  if (!SOURCE_COVERAGE_STATES.includes(value.state as SourceCoverageState)) invalid("STATE_INVALID");
  const state = value.state as SourceCoverageState;
  const expectedUri = `urn:subactor:resource:sha256:${value.sourceSha256}`;
  if (["excluded-by-policy", "quarantined"].includes(state)) {
    if (value.resourceUri !== null) invalid("NON_MATERIALIZED_RESOURCE_URI_PRESENT");
  } else if (value.resourceUri !== expectedUri) invalid("RESOURCE_URI_HASH_MISMATCH");
  if (value.markdownPath !== null
      && (typeof value.markdownPath !== "string" || !safeRelative(value.markdownPath))) {
    invalid("MARKDOWN_PATH_INVALID");
  }
  if (!strings(value.intentUris) && !(Array.isArray(value.intentUris) && value.intentUris.length === 0)) {
    invalid("INTENT_URIS_INVALID");
  }
  if (!strings(value.treeRefs) && !(Array.isArray(value.treeRefs) && value.treeRefs.length === 0)) {
    invalid("TREE_REFS_INVALID");
  }
  if (typeof value.converter !== "string" || !value.converter) invalid("CONVERTER_INVALID");
  if (typeof value.converterVersion !== "string" || !value.converterVersion) invalid("CONVERTER_VERSION_INVALID");
  if (typeof value.reasonCode !== "string" || !REASON.test(value.reasonCode)) invalid("REASON_CODE_INVALID");
  if (!["not-evaluated", "included", "excluded"].includes(String(value.twinRevisionStatus))) {
    invalid("TWIN_REVISION_STATUS_INVALID");
  }
  return value as unknown as SourceCoverageRecord;
}

export function validateSourceCoverage(value: unknown): SourceCoverageDocument {
  if (!object(value) || !ownKeys(value, [
    "schema", "sourceSnapshotSha256", "coverageSha256", "summary", "records",
  ])) invalid("DOCUMENT_SHAPE_INVALID");
  if (value.schema !== "bioxfoundry.source-coverage/v1") invalid("SCHEMA_INVALID");
  if (typeof value.sourceSnapshotSha256 !== "string" || !HEX.test(value.sourceSnapshotSha256)) {
    invalid("SNAPSHOT_HASH_INVALID");
  }
  if (typeof value.coverageSha256 !== "string" || !HEX.test(value.coverageSha256)) {
    invalid("COVERAGE_HASH_INVALID");
  }
  if (!object(value.summary) || !ownKeys(value.summary, ["discovered", "terminal", "byState"])) {
    invalid("SUMMARY_SHAPE_INVALID");
  }
  if (!object(value.summary.byState) || !ownKeys(value.summary.byState, SOURCE_COVERAGE_STATES)) {
    invalid("STATE_COUNTS_SHAPE_INVALID");
  }
  if (!Array.isArray(value.records)) invalid("RECORDS_INVALID");
  const records = value.records.map(validateRecord);
  const paths = records.map((record) => record.path);
  if (new Set(paths).size !== paths.length) invalid("PATH_DUPLICATE");
  if ([...paths].sort((left,right)=>Buffer.compare(Buffer.from(left),Buffer.from(right))).join("\0") !== paths.join("\0")) {
    invalid("PATH_ORDER_INVALID");
  }
  const actualCounts = Object.fromEntries(SOURCE_COVERAGE_STATES.map((state) => [
    state, records.filter((record) => record.state === state).length,
  ])) as Record<SourceCoverageState, number>;
  for (const state of SOURCE_COVERAGE_STATES) {
    if (value.summary.byState[state] !== actualCounts[state]) invalid("STATE_COUNT_MISMATCH");
  }
  const terminal = Object.values(actualCounts).reduce((sum, count) => sum + count, 0);
  if (value.summary.discovered !== records.length || value.summary.terminal !== terminal
      || terminal !== records.length) invalid("TERMINAL_COUNT_MISMATCH");
  const document = value as unknown as SourceCoverageDocument;
  const material = {
    schema: document.schema,
    sourceSnapshotSha256: document.sourceSnapshotSha256,
    summary: document.summary,
    records: document.records,
  };
  if (sha256(canonicalJson(material)) !== document.coverageSha256) invalid("HASH_MISMATCH");
  return document;
}

export interface LoadedSourceCoverage {
  reports: SourceCoverageDocument[];
  invalid: Array<{ path: string; error: string }>;
}

export async function loadSourceCoverage(sourceRoots: string[]): Promise<LoadedSourceCoverage> {
  const reports: SourceCoverageDocument[] = [];
  const invalidReports: LoadedSourceCoverage["invalid"] = [];
  for (const root of sourceRoots) {
    try {
      if (!(await stat(root)).isDirectory()) continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      invalidReports.push({ path: root, error: `SOURCE_COVERAGE_ROOT_READ_FAILED:${String(error)}` });
      continue;
    }
    const path = join(root, "source-coverage.json");
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      invalidReports.push({ path, error: `SOURCE_COVERAGE_READ_FAILED:${String(error)}` });
      continue;
    }
    try {
      reports.push(validateSourceCoverage(JSON.parse(raw)));
    } catch (error) {
      invalidReports.push({ path, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { reports, invalid: invalidReports };
}
