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
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { ConverterChain, defaultChain } from "./chain.js";
import { detectDocumentKind, mediaTypeFor } from "./detect.js";
import { VERSION } from "./index.js";
import { ConversionError } from "./types.js";

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
  failures: { source: string; error: string }[];
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

async function treeSnapshot(root: string, paths: string[]): Promise<string> {
  const digest = createHash("sha256");
  for (const path of [...paths].sort()) {
    // Paths are part of the snapshot: moving identical bytes is a new corpus revision.
    digest.update(relative(root, path).split(sep).join("/"));
    digest.update("\0");
    digest.update(await readFile(path));
    digest.update("\0");
  }
  return digest.digest("hex");
}

async function writeVersion(source: string, target: string, sourcePaths: string[]): Promise<void> {
  // A mirror can coexist with operational output. Only Markdown files are conversion payloads.
  const outputPaths = (await walkFiles(target)).filter((path) => path.endsWith(".md"));
  const lines = [
    "FORMAT=bioxfoundry.conversion-version/v1",
    "ARTIFACT=markdown-mirror",
    "CONVERTER=node-f2md",
    `CONVERTER_VERSION=${VERSION}`,
    `SOURCE_FILES=${sourcePaths.length}`,
    `SOURCE_SNAPSHOT_SHA256=${await treeSnapshot(source, sourcePaths)}`,
    `OUTPUT_FILES=${outputPaths.length}`,
    `OUTPUT_SNAPSHOT_SHA256=${await treeSnapshot(target, outputPaths)}`,
    "",
  ];
  await writeFile(join(target, "VERSION"), lines.join("\n"));
}

export interface TreeOptions {
  chain?: ConverterChain;
  doclingUrl?: string;
  /** Restrict the run to these detected kinds, e.g. `[".pdf"]`. */
  only?: string[];
  onProgress?: (index: number, total: number, relativePath: string, note: string) => void;
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
  const result: TreeResult = { converted: 0, stubbed: 0, skipped: 0, byConverter: {}, failures: [] };
  const paths = await walkFiles(source);

  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    const rel = relative(source, path);
    const kind = detectDocumentKind(path);
    if (options.only?.length && !options.only.includes(kind)) {
      result.skipped++;
      continue;
    }
    const outPath = join(target, `${rel}.md`);
    await mkdir(dirname(outPath), { recursive: true });
    // Absolute, so a Markdown file still points at its origin after being moved or published
    // elsewhere; the tree-relative form is kept alongside it because that mirrors the layout.
    const base = { source: resolve(path), sourceRelative: rel, inputKind: kind, mediaType: mediaTypeFor(path) };

    try {
      const document = await chain.convert(path);
      const fields = {
        ...base,
        converter: document.converter,
        converterVersion: document.version,
        backendType: document.backendType,
        ocr: document.ocr,
        fallbackDepth: document.fallbackDepth,
        durationMs: document.durationMs,
        size: (document.metadata.size as number) ?? 0,
        mtime: (document.metadata.mtime as string) ?? "",
        extractedChars: (document.metadata.extractedChars as number) ?? document.markdown.length,
        converted: true,
        warnings: document.warnings,
      };
      await writeFile(outPath, frontMatter(fields) + document.markdown.replace(/\s+$/, "") + "\n");
      result.converted++;
      result.byConverter[document.converter] = (result.byConverter[document.converter] ?? 0) + 1;
      options.onProgress?.(index + 1, paths.length, rel, document.converter);
    } catch (error) {
      const reason = error instanceof ConversionError ? error.message : String(error);
      const size = (await stat(path).catch(() => null))?.size ?? 0;
      const body =
        `# ${basename(path)}\n\nNo text could be extracted from this file.\n\n` +
        `- reason: \`${reason}\`\n- size: ${size} bytes\n`;
      await writeFile(outPath, frontMatter({ ...base, converter: "none", converted: false, error: reason }) + body);
      result.stubbed++;
      result.byConverter.none = (result.byConverter.none ?? 0) + 1;
      result.failures.push({ source: rel, error: reason.slice(0, 200) });
      options.onProgress?.(index + 1, paths.length, rel, `STUB:${reason.slice(0, 60)}`);
    }
  }
  await writeVersion(source, target, paths);
  return result;
}
