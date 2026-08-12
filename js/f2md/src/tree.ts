/**
 * Convert a directory tree to a mirrored tree of Markdown files.
 *
 * `src/a/b/report.pdf` becomes `out/a/b/report.pdf.md` — the original extension is kept before
 * `.md` so the output name still says what produced it, and two files that differ only by
 * extension never collide.
 *
 * Files the chain cannot convert (CAD meshes, archives, binaries with no text layer) still get a
 * Markdown file containing the provenance front matter and a stub body. Dropping them would leave
 * a tree that silently disagrees with its source, which is worse than an explicit "no text here".
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ConverterChain, defaultChain } from "./chain.js";
import { detectDocumentKind, mediaTypeFor } from "./detect.js";
import { VERSION } from "./index.js";
import {
  SOURCE_STATES,
  buildSourceCoverage,
  sourceCoverageRecord,
  writeSourceCoverage,
  type SourceCoverageRecord,
  type SourceCoverageState,
} from "./source-coverage.js";
import { ConversionError, ExternalConverterRequired } from "./types.js";

/** Directories never worth walking into. */
export const SKIP_DIRS = new Set([
  ".git", ".svn", "node_modules", "__pycache__", ".venv", "venv", ".mypy_cache", ".pytest_cache",
]);

function yamlScalar(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function frontMatter(fields: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      if (!value.length) lines.push(`${key}: []`);
      else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
      }
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---");
  return `${lines.join("\n")}\n\n`;
}

export interface TreeResult {
  converted: number;
  stubbed: number;
  skipped: number;
  byConverter: Record<string, number>;
  byQuality: Record<string, number>;
  byState: Record<SourceCoverageState, number>;
  failures: { source: string; error: string }[];
  coverageNoChange: boolean;
  sourceCoverageJson: "source-coverage.json";
  sourceCoverageDsl: "source-coverage.dsl";
}

function reasonCode(reason: string, fallback = "CONVERSION_FAILED"): string {
  return reason.split(":", 1)[0].toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

export async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await walkFiles(path)));
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out;
}

async function conversionFiles(root: string): Promise<string[]> {
  const excludedTargets = new Set<string>();
  let hasArchivePolicy = false;
  try {
    const manifest = JSON.parse(await readFile(join(root, "ARCHIVE_EXTRACTION_MANIFEST.json"), "utf8")) as {
      schema?: unknown;
      archives?: Array<{ target?: unknown; targetPreexisted?: unknown }>;
    };
    if (manifest.schema === "bioxfoundry.archive-extraction-manifest/v1" && Array.isArray(manifest.archives)) {
      hasArchivePolicy = true;
      for (const archive of manifest.archives) {
        if (archive.targetPreexisted === false && typeof archive.target === "string" && archive.target) {
          excludedTargets.add(archive.target.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, ""));
        }
      }
    }
  } catch {
    // Ordinary trees do not need an archive policy.
  }
  return (await walkFiles(root)).filter((path) => {
    const rel = relative(root, path).split(sep).join("/");
    if (["ARCHIVE_EXTRACTION_MANIFEST.json", "ARCHIVE_EXTRACTION_REPORT.md"].includes(rel)) return false;
    if (hasArchivePolicy && rel.split("/").some((part) => part.endsWith(".extracted"))) return false;
    return ![...excludedTargets].some((target) => rel.startsWith(`${target}/`));
  });
}

async function mirrorFiles(root: string, current = root): Promise<string[]> {
  if (current !== root && (await stat(join(current, "VERSION")).catch(() => null))?.isFile()) return [];
  const out: string[] = [];
  const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...await mirrorFiles(root, path));
    } else if (entry.isFile()) out.push(path);
  }
  return out;
}

async function treeSnapshot(root: string, paths: string[]): Promise<string> {
  const digest = createHash("sha256");
  const ordered = [...paths].sort((left, right) => Buffer.compare(
    Buffer.from(relative(root, left).split(sep).join("/")),
    Buffer.from(relative(root, right).split(sep).join("/")),
  ));
  for (const path of ordered) {
    // Paths are part of the snapshot: moving identical bytes is a new corpus revision.
    digest.update(relative(root, path).split(sep).join("/"));
    digest.update("\0");
    digest.update(await readFile(path));
    digest.update("\0");
  }
  return digest.digest("hex");
}

async function writeVersion(source: string, target: string, sourcePaths: string[]): Promise<void> {
  // A mirror can coexist with operational output. Only conversion-contract files are payloads.
  const generated = await mirrorFiles(target);
  const inArtifactStore = (path: string): boolean =>
    relative(target, path).split(sep).slice(0, -1)
      .some((part) => part.endsWith(".artifacts") || part.endsWith(".assets"));
  // Store-local table previews are sidecars. Count and hash them once as artifact files rather
  // than presenting them as independent converted documents.
  const markdownPaths = generated.filter((path) => path.endsWith(".md") && !inArtifactStore(path));
  const structurePaths = generated.filter((path) => path.endsWith(".structure.json"));
  const qualityPaths = generated.filter((path) => path.endsWith(".quality.mdqldsl"));
  const astPaths = generated.filter((path) => path.endsWith(".ast.json"));
  const artifactPaths = generated.filter(inArtifactStore);
  const outputPaths = [...markdownPaths, ...structurePaths, ...qualityPaths, ...astPaths, ...artifactPaths];
  const lines = [
    "FORMAT=bioxfoundry.conversion-version/v1",
    "ARTIFACT=markdown-mirror",
    "CONVERTER=node-f2md",
    `CONVERTER_VERSION=${VERSION}`,
    `SOURCE_FILES=${sourcePaths.length}`,
    `SOURCE_SNAPSHOT_SHA256=${await treeSnapshot(source, sourcePaths)}`,
    `OUTPUT_FILES=${markdownPaths.length}`,
    `STRUCTURE_FILES=${structurePaths.length}`,
    `QUALITY_FILES=${qualityPaths.length}`,
    `AST_FILES=${astPaths.length}`,
    `ASSET_FILES=${artifactPaths.length}`,
    `OUTPUT_ARTIFACTS=${outputPaths.length}`,
    `OUTPUT_SNAPSHOT_SHA256=${await treeSnapshot(target, outputPaths)}`,
    "",
  ];
  await writeFile(join(target, "VERSION"), lines.join("\n"));
}

function renderQualityDsl(report: Record<string, unknown>): string {
  const lines = [
    `MARKDOWN_QUALITY ${String(report.sourceSha256 ?? "unknown")}`,
    `SCHEMA ${String(report.schema ?? "bioxfoundry.markdown-quality/v1")}`,
    `STATUS ${String(report.status ?? "failed").toUpperCase()}`,
    `SCORE ${Number(report.score ?? 0)}`,
  ];
  const metrics = report.metrics;
  if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
    for (const key of Object.keys(metrics).sort()) {
      lines.push(`METRIC ${key} ${JSON.stringify((metrics as Record<string, unknown>)[key])}`);
    }
  }
  const checks = report.checks;
  if (Array.isArray(checks)) {
    for (const raw of checks) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const check = raw as Record<string, unknown>;
      lines.push(`CHECK ${String(check.id ?? "UNKNOWN")} ${String(check.status ?? "fail").toUpperCase()} ${JSON.stringify(check.actual)}`);
    }
  }
  lines.push("END_MARKDOWN_QUALITY");
  return lines.join("\n") + "\n";
}

async function writeQualityArtifacts(
  markdownPath: string,
  metadata: Record<string, unknown>,
): Promise<{
  status: string;
  score: number;
  structureArtifact?: string;
  qualityArtifact?: string;
  sourceModel?: string;
  documentAstArtifact?: string;
}> {
  const structure = metadata.structure;
  const quality = metadata.conversionQuality;
  if (!structure || typeof structure !== "object" || Array.isArray(structure)
      || !quality || typeof quality !== "object" || Array.isArray(quality)) {
    return { status: "not-run", score: 0 };
  }
  const stem = markdownPath.endsWith(".md") ? markdownPath.slice(0, -3) : markdownPath;
  const structurePath = `${stem}.structure.json`;
  const qualityPath = `${stem}.quality.mdqldsl`;
  await writeFile(structurePath, JSON.stringify(structure, null, 2) + "\n");
  await writeFile(qualityPath, renderQualityDsl(quality as Record<string, unknown>));
  const documentAst = metadata.documentAst;
  let documentAstArtifact: string | undefined;
  if (documentAst && typeof documentAst === "object" && !Array.isArray(documentAst)
      && (documentAst as Record<string, unknown>).schema === "f2md.document-ast/v1") {
    const astPath = `${stem}.ast.json`;
    // Python may already have materialized the authoritative bytes. Re-serializing floating-point
    // geometry through JavaScript would change `842.0` to `842` and break the canonical AST hash.
    if (!(await stat(astPath).catch(() => null))?.isFile()) {
      await writeFile(astPath, JSON.stringify(documentAst, null, 2) + "\n");
    }
    documentAstArtifact = basename(astPath);
  }
  return {
    status: String((quality as Record<string, unknown>).status ?? "failed"),
    score: Number((quality as Record<string, unknown>).score ?? 0),
    structureArtifact: basename(structurePath),
    qualityArtifact: basename(qualityPath),
    ...(documentAstArtifact
      ? { sourceModel: "f2md.document-ast/v1", documentAstArtifact }
      : {}),
  };
}

export interface TreeOptions {
  chain?: ConverterChain;
  doclingUrl?: string;
  /** Restrict the run to these detected kinds, e.g. `[".pdf"]`. */
  only?: string[];
  /** Exact hash-bound selection manifest (`bioxfoundry.source-selection/v1`). */
  manifestPath?: string;
  onProgress?: (index: number, total: number, relativePath: string, note: string) => void;
}

async function selectedFiles(source: string, manifestPath: string): Promise<string[]> {
  const manifestKeys = new Set(["schema", "id", "entries"]);
  const entryKeys = new Set(["path", "sha256", "family", "expectedUse", "reason"]);
  const expectedUses = new Set(["behavior", "interface", "safety", "telemetry", "geometry", "documentation"]);
  let value: unknown;
  try { value = JSON.parse(await readFile(resolve(manifestPath), "utf8")); }
  catch (error) { throw new ConversionError(`SOURCE_SELECTION_JSON_INVALID:${String(error)}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConversionError("SOURCE_SELECTION_INVALID");
  const manifest = value as Record<string, unknown>;
  if (manifest.schema !== "bioxfoundry.source-selection/v1" || typeof manifest.id !== "string" || !manifest.id ||
      !Array.isArray(manifest.entries) || !manifest.entries.length ||
      Object.keys(manifest).some((key) => !manifestKeys.has(key))) throw new ConversionError("SOURCE_SELECTION_INVALID");
  const root = await realpath(source);
  const paths: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < manifest.entries.length; index++) {
    const raw = manifest.entries[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ConversionError(`SOURCE_SELECTION_ENTRY_INVALID:${index}`);
    const entry = raw as Record<string, unknown>;
    if (typeof entry.path !== "string" || !entry.path || isAbsolute(entry.path) || entry.path.includes("\\") ||
        entry.path.split("/").some((part) => !part || part === "." || part === "..") ||
        typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        typeof entry.family !== "string" || !entry.family ||
        typeof entry.expectedUse !== "string" || !expectedUses.has(entry.expectedUse) ||
        typeof entry.reason !== "string" || !entry.reason ||
        Object.keys(entry).some((key) => !entryKeys.has(key))) {
      throw new ConversionError(`SOURCE_SELECTION_ENTRY_INVALID:${index}`);
    }
    if (seen.has(entry.path)) throw new ConversionError(`SOURCE_SELECTION_PATH_DUPLICATE:${entry.path}`);
    seen.add(entry.path);
    const candidate = resolve(root, entry.path);
    const rel = relative(root, candidate);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new ConversionError(`SOURCE_SELECTION_PATH_UNSAFE:${entry.path}`);
    const info = await stat(candidate).catch(() => null);
    if (!info?.isFile()) throw new ConversionError(`SOURCE_SELECTION_SOURCE_MISSING:${entry.path}`);
    const actual = await realpath(candidate);
    const actualRel = relative(root, actual);
    if (actualRel === ".." || actualRel.startsWith(`..${sep}`) || isAbsolute(actualRel)) {
      throw new ConversionError(`SOURCE_SELECTION_SYMLINK_ESCAPE:${entry.path}`);
    }
    const digest = createHash("sha256").update(await readFile(actual)).digest("hex");
    if (digest !== entry.sha256) throw new ConversionError(`SOURCE_SELECTION_HASH_MISMATCH:${entry.path}`);
    paths.push(actual);
  }
  return paths.sort((left, right) => Buffer.compare(Buffer.from(relative(root, left)), Buffer.from(relative(root, right))));
}

/** Mirror `src` into `out`, converting every file to `<name>.<ext>.md`. */
export async function convertTree(src: string, out: string, options: TreeOptions = {}): Promise<TreeResult> {
  const source = resolve(src);
  const target = resolve(out);
  if (!(await stat(source).catch(() => null))?.isDirectory()) {
    throw new ConversionError(`SOURCE_NOT_A_DIRECTORY:${source}`);
  }
  // Writing inside the source would feed generated Markdown back into the next run.
  if (target.startsWith(source + sep)) throw new ConversionError(`OUTPUT_INSIDE_SOURCE:${target}`);

  const chain = options.chain ?? defaultChain(options.doclingUrl);
  const result: TreeResult = {
    converted: 0,
    stubbed: 0,
    skipped: 0,
    byConverter: {},
    byQuality: {},
    byState: Object.fromEntries(SOURCE_STATES.map((state) => [state, 0])) as Record<SourceCoverageState, number>,
    failures: [],
    coverageNoChange: false,
    sourceCoverageJson: "source-coverage.json",
    sourceCoverageDsl: "source-coverage.dsl",
  };
  const paths = options.manifestPath ? await selectedFiles(source, options.manifestPath) : await conversionFiles(source);
  const coverageRecords: SourceCoverageRecord[] = [];

  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    const rel = relative(source, path);
    const kind = detectDocumentKind(path);
    if (options.only?.length && !options.only.includes(kind)) {
      result.skipped++;
      coverageRecords.push(await sourceCoverageRecord({
        root: source,
        path,
        inputKind: kind,
        mediaType: mediaTypeFor(path),
        state: "excluded-by-policy",
        reasonCode: "KIND_NOT_SELECTED",
      }));
      continue;
    }
    const outPath = join(target, `${rel}.md`);
    await mkdir(dirname(outPath), { recursive: true });
    // Absolute, so a Markdown file still points at its origin after being moved or published
    // elsewhere; the tree-relative form is kept alongside it because that mirrors the layout.
    const base = { source: resolve(path), sourceRelative: rel, inputKind: kind, mediaType: mediaTypeFor(path) };

    try {
      const document = await chain.convert(path, outPath);
      const quality = await writeQualityArtifacts(outPath, document.metadata);
      const ocrAudit = document.metadata.ocrAudit && typeof document.metadata.ocrAudit === "object"
        ? document.metadata.ocrAudit as Record<string, unknown>
        : {};
      const fields = {
        ...base,
        converter: document.converter,
        converterVersion: document.version,
        backendType: document.backendType,
        ocr: document.ocr,
        ocrRequested: Boolean(ocrAudit.ocrRequested),
        ocrActuallyUsed: Boolean(ocrAudit.ocrActuallyUsed ?? document.ocr),
        ocrEngine: String(ocrAudit.ocrEngine ?? (document.ocr ? "unknown" : "none")),
        ocrVersion: String(ocrAudit.ocrVersion ?? "unknown"),
        ocrLanguages: Array.isArray(ocrAudit.ocrLanguages) ? ocrAudit.ocrLanguages : [],
        ocrPages: Array.isArray(ocrAudit.ocrPages) ? ocrAudit.ocrPages : [],
        fallbackDepth: document.fallbackDepth,
        durationMs: document.durationMs,
        size: (document.metadata.size as number) ?? 0,
        mtime: (document.metadata.mtime as string) ?? "",
        extractedChars: (document.metadata.extractedChars as number) ?? document.markdown.length,
        converted: true,
        qualityStatus: quality.status,
        qualityScore: quality.score,
        ...(quality.structureArtifact ? { structureArtifact: quality.structureArtifact } : {}),
        ...(quality.qualityArtifact ? { qualityArtifact: quality.qualityArtifact } : {}),
        ...(quality.sourceModel ? { sourceModel: quality.sourceModel } : {}),
        ...(quality.documentAstArtifact ? { documentAstArtifact: quality.documentAstArtifact } : {}),
        ...(typeof document.metadata.artifactManifestArtifact === "string"
          ? { artifactManifest: document.metadata.artifactManifestArtifact }
          : {}),
        ...(typeof document.metadata.artifactDslArtifact === "string"
          ? { artifactDsl: document.metadata.artifactDslArtifact }
          : {}),
        ...(typeof document.metadata.artifactQualityArtifact === "string"
          ? { artifactQualityArtifact: document.metadata.artifactQualityArtifact }
          : {}),
        ...(typeof document.metadata.artifactTreeDslArtifact === "string"
          ? { artifactTreeDsl: document.metadata.artifactTreeDslArtifact }
          : {}),
        warnings: quality.status === "not-run"
          ? [...document.warnings, "MARKDOWN_QUALITY:NOT_RUN"]
          : document.warnings,
      };
      await writeFile(outPath, frontMatter(fields) + document.markdown.replace(/\s+$/, "") + "\n");
      result.converted++;
      result.byConverter[document.converter] = (result.byConverter[document.converter] ?? 0) + 1;
      result.byQuality[quality.status] = (result.byQuality[quality.status] ?? 0) + 1;
      const state = document.converter === "stl-metadata" ? "binary-provenance" : "converted";
      coverageRecords.push(await sourceCoverageRecord({
        root: source,
        path,
        inputKind: kind,
        mediaType: mediaTypeFor(path),
        state,
        reasonCode: state === "binary-provenance" ? "BINARY_PROVENANCE" : "CONVERTED",
        markdownPath: relative(target, outPath),
        converter: document.converter,
        converterVersion: document.version,
      }));
      options.onProgress?.(index + 1, paths.length, rel, document.converter);
    } catch (error) {
      const reason = error instanceof ConversionError ? error.message : String(error);
      const size = (await stat(path).catch(() => null))?.size ?? 0;
      const body =
        `# ${basename(path)}\n\nNo text could be extracted from this file.\n\n` +
        `- reason: \`${reason}\`\n- size: ${size} bytes\n`;
      await writeFile(outPath, frontMatter({
        ...base, converter: "none", converted: false, qualityStatus: "failed", qualityScore: 0, error: reason,
      }) + body);
      result.stubbed++;
      result.byConverter.none = (result.byConverter.none ?? 0) + 1;
      result.byQuality.failed = (result.byQuality.failed ?? 0) + 1;
      result.failures.push({ source: rel, error: reason.slice(0, 200) });
      const state = error instanceof ExternalConverterRequired ? "unsupported" : "failed";
      coverageRecords.push(await sourceCoverageRecord({
        root: source,
        path,
        inputKind: kind,
        mediaType: mediaTypeFor(path),
        state,
        reasonCode: state === "unsupported" ? "EXTERNAL_CONVERTER_REQUIRED" : reasonCode(reason),
        markdownPath: `${rel}.md`,
      }));
      options.onProgress?.(index + 1, paths.length, rel, `STUB:${reason.slice(0, 60)}`);
    }
  }
  const coverage = buildSourceCoverage(await treeSnapshot(source, paths), coverageRecords);
  result.byState = { ...coverage.summary.byState };
  result.coverageNoChange = await writeSourceCoverage(target, coverage);
  await writeVersion(source, target, paths);
  return result;
}
