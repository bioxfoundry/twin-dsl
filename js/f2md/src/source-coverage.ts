/** Deterministic terminal-state accounting for every source discovered by tree conversion. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const SOURCE_COVERAGE_SCHEMA = "bioxfoundry.source-coverage/v1" as const;
export const SOURCE_STATES = [
  "converted",
  "binary-provenance",
  "excluded-by-policy",
  "unsupported",
  "quarantined",
  "failed",
] as const;

export type SourceCoverageState = typeof SOURCE_STATES[number];
export type TwinRevisionCoverageStatus = "not-evaluated" | "included" | "excluded";

export interface SourceCoverageRecord {
  path: string;
  inputKind: string;
  mediaType: string;
  sourceSha256: string;
  resourceUri: string | null;
  markdownPath: string | null;
  intentUris: string[];
  treeRefs: string[];
  converter: string;
  converterVersion: string;
  state: SourceCoverageState;
  reasonCode: string;
  twinRevisionStatus: TwinRevisionCoverageStatus;
}

export interface SourceCoverageDocument {
  schema: typeof SOURCE_COVERAGE_SCHEMA;
  sourceSnapshotSha256: string;
  coverageSha256: string;
  summary: {
    discovered: number;
    terminal: number;
    byState: Record<SourceCoverageState, number>;
  };
  records: SourceCoverageRecord[];
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function logicalPath(root: string, path: string): string {
  const value = relative(root, path).split(sep).join("/");
  if (value === ".." || value.startsWith("../") || value.startsWith("/")) {
    throw new Error(`SOURCE_COVERAGE_PATH_ESCAPE:${value}`);
  }
  return value;
}

export async function sourceCoverageRecord(input: {
  root: string;
  path: string;
  inputKind: string;
  mediaType: string;
  state: SourceCoverageState;
  reasonCode: string;
  markdownPath?: string;
  converter?: string;
  converterVersion?: string;
}): Promise<SourceCoverageRecord> {
  const path = logicalPath(input.root, input.path);
  const sourceSha256 = sha256(await readFile(input.path));
  const parent = path.split("/").slice(0, -1).join("/") || ".";
  return {
    path,
    inputKind: input.inputKind,
    mediaType: input.mediaType,
    sourceSha256,
    resourceUri: input.state === "excluded-by-policy" || input.state === "quarantined"
      ? null
      : `urn:subactor:resource:sha256:${sourceSha256}`,
    markdownPath: input.markdownPath?.split(sep).join("/") ?? null,
    intentUris: [],
    treeRefs: [parent],
    converter: input.converter ?? "none",
    converterVersion: input.converterVersion ?? "unknown",
    state: input.state,
    reasonCode: input.reasonCode,
    twinRevisionStatus: "not-evaluated",
  };
}

export function buildSourceCoverage(
  sourceSnapshotSha256: string,
  records: SourceCoverageRecord[],
): SourceCoverageDocument {
  const ordered = [...records].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  const byState = Object.fromEntries(
    SOURCE_STATES.map((state) => [state, ordered.filter((record) => record.state === state).length]),
  ) as Record<SourceCoverageState, number>;
  const terminal = Object.values(byState).reduce((sum, count) => sum + count, 0);
  if (terminal !== ordered.length) {
    throw new Error(`SOURCE_COVERAGE_TERMINAL_MISMATCH:${terminal}:${ordered.length}`);
  }
  const material = {
    schema: SOURCE_COVERAGE_SCHEMA,
    sourceSnapshotSha256,
    summary: { discovered: ordered.length, terminal, byState },
    records: ordered,
  };
  return {
    schema: SOURCE_COVERAGE_SCHEMA,
    sourceSnapshotSha256,
    coverageSha256: sha256(canonical(material)),
    summary: material.summary,
    records: ordered,
  };
}

export function renderSourceCoverageDsl(report: SourceCoverageDocument): string {
  const lines = [
    `SOURCE_COVERAGE ${report.coverageSha256}`,
    `SCHEMA ${report.schema}`,
    `SOURCE_SNAPSHOT ${report.sourceSnapshotSha256}`,
    `DISCOVERED ${report.summary.discovered}`,
    `TERMINAL ${report.summary.terminal}`,
    ...SOURCE_STATES.map((state) => `STATE ${state} ${report.summary.byState[state]}`),
  ];
  for (const record of report.records) {
    lines.push(
      `SOURCE ${JSON.stringify(record.path)}`,
      `  KIND ${JSON.stringify(record.inputKind)}`,
      `  MEDIA_TYPE ${JSON.stringify(record.mediaType)}`,
      `  SOURCE_SHA256 ${record.sourceSha256}`,
      `  RESOURCE_URI ${JSON.stringify(record.resourceUri)}`,
      `  MARKDOWN_PATH ${JSON.stringify(record.markdownPath)}`,
      `  INTENT_URIS ${JSON.stringify(record.intentUris)}`,
      `  TREE_REFS ${JSON.stringify(record.treeRefs)}`,
      `  CONVERTER ${JSON.stringify(record.converter)}`,
      `  CONVERTER_VERSION ${JSON.stringify(record.converterVersion)}`,
      `  TERMINAL_STATE ${record.state}`,
      `  REASON ${record.reasonCode}`,
      `  TWIN_REVISION ${record.twinRevisionStatus}`,
      "END_SOURCE",
    );
  }
  lines.push(
    `RESULT ${report.summary.discovered === report.summary.terminal ? "COMPLETE" : "INCOMPLETE"}`,
    "END_SOURCE_COVERAGE",
  );
  return `${lines.join("\n")}\n`;
}

export async function writeSourceCoverage(root: string, report: SourceCoverageDocument): Promise<boolean> {
  await mkdir(root, { recursive: true });
  const jsonPath = join(root, "source-coverage.json");
  const dslPath = join(root, "source-coverage.dsl");
  const jsonBody = `${JSON.stringify(report, null, 2)}\n`;
  const dslBody = renderSourceCoverageDsl(report);
  const same = async (path: string, body: string): Promise<boolean> =>
    readFile(path, "utf8").then((existing) => existing === body, () => false);
  const sameJson = await same(jsonPath, jsonBody);
  const sameDsl = await same(dslPath, dslBody);
  if (!sameJson) await writeFile(jsonPath, jsonBody);
  if (!sameDsl) await writeFile(dslPath, dslBody);
  return sameJson && sameDsl;
}
