import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import type { ResourceRecord, SourceRole } from "../core/types.js";
import {
  CompositeDocumentConverter,
  ExternalConverterRequired,
  detectDocumentKind,
  isDocumentConversionKind,
} from "../adapters/document-converter.js";
import { resourceFromBinary, resourceFromBinaryDigest, resourceFromText } from "../dsl/resource.js";
import { readZipEntry, sha256File } from "./archive.js";
import { renderArchiveAnalysisMarkdown, type ArchiveProjectAnalysis } from "../../js/archive-project-analyzer/src/index.js";
import { analyzeZipFile } from "./archive-project.js";

const TEXT_EXT = new Set([
  ".md", ".rst", ".adoc", ".tex", ".txt", ".log", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".csv",
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".php", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".ino", ".xml", ".html", ".htm",
  ".dsl", ".projectdsl", ".mathdsl", ".treedsl", ".twindsl", ".scenedsl", ".resourcedsl",
  ".testqldsl", ".assemblydsl", ".livebindingdsl", ".geometrydsl", ".dql",
]);
const MEDIA: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".step": "model/step",
  ".stp": "model/step",
  ".stl": "model/stl",
  ".f3d": "application/octet-stream",
  ".scad": "application/x-openscad",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".usda": "model/vnd.usda",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export interface ScanSource { path: string; role: SourceRole; logicalRoot: string; labels?: string[]; }
export interface ScanResult { resources: ResourceRecord[]; texts: Map<string, string>; warnings: string[]; notices: string[]; archiveAnalyses: ArchiveProjectAnalysis[]; }

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", ".intent", ".dt-run", ".biofoundry-run", ".living-runtime"].includes(e.name)) continue;
    // The dashboard writes these logs while an iteration is running. Feeding them
    // back into the source snapshot creates a self-induced change on every click.
    // Explicit file sources are still accepted; only recursive directory scans
    // ignore the runtime-owned transport log.
    if (e.isFile() && /^dashboard-\d+\.log$/i.test(e.name)) continue;
    const p = join(root, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function textFromBuffer(buffer: Buffer, path: string): string | undefined {
  const ext = extname(path).toLowerCase();
  if (!TEXT_EXT.has(ext)) return undefined;
  if (buffer.includes(0)) return undefined;
  return buffer.toString("utf8");
}

function mediaTypeFor(path: string): string {
  return MEDIA[detectDocumentKind(path)] ?? MEDIA[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function archiveFindingSummaries(analysis: ArchiveProjectAnalysis, severities:ReadonlySet<"info"|"warning"|"error">): string[] {
  const grouped = new Map<string, { code:string; repairProcess:string; count:number }>();
  for (const finding of analysis.findings) {
    if(!severities.has(finding.severity)) continue;
    const key = `${finding.code}\0${finding.repairProcess}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key,{code:finding.code,repairProcess:finding.repairProcess,count:1});
  }
  return [...grouped.values()]
    .sort((a,b)=>a.code.localeCompare(b.code)||a.repairProcess.localeCompare(b.repairProcess))
    .map((item)=>`ARCHIVE_FINDING_SUMMARY:${item.code}:${item.count}:${analysis.archive.path}:${item.repairProcess}`);
}

function pushBinary(
  resources: ResourceRecord[],
  texts: Map<string, string>,
  id: string,
  logical: string,
  sourcePath: string,
  bytes: Buffer | string,
  role: SourceRole | "archive",
  labels: string[],
  warning: string | null,
  warnings: string[],
): void {
  const r = resourceFromBinary(id, logical, sourcePath, bytes, mediaTypeFor(sourcePath), role as SourceRole, labels);
  resources.push(r);
  texts.set(r.uri, `BINARY_STUB ${sourcePath}\nlabels:${labels.join(",")}\n`);
  if (warning !== null) warnings.push(warning);
}

export async function scanSources(sources: ScanSource[]): Promise<ScanResult> {
  const resources: ResourceRecord[] = [];
  const texts = new Map<string, string>();
  const warnings: string[] = [];
  const notices: string[] = [];
  const archiveAnalyses: ArchiveProjectAnalysis[] = [];
  // Prefer composite (text → pdftotext/pandoc → optional Docling) so PDF body enters the graph offline.
  const converter = new CompositeDocumentConverter();

  for (const source of sources) {
    const absolute = resolve(source.path);
    const s = await stat(absolute);
    const files = s.isDirectory()
      ? (await walk(absolute)).filter(file => !(
          source.labels?.includes("feedback")
          && relative(absolute, file) === "latest.md"
        ))
      : [absolute];
    for (const file of files) {
      const rel = s.isDirectory() ? relative(absolute, file) : file.split("/").at(-1)!;
      const ext = extname(file).toLowerCase();
      const logical = `${source.logicalRoot}/${rel.split("/").map(encodeURIComponent).join("/")}`;
      const labels = source.labels ?? [];

      if (ext === ".zip") {
        try {
          // Hash the real archive bytes by streaming; entry metadata must never masquerade as an asset hash.
          const analysis = await analyzeZipFile(file);
          const digest = {sha256:analysis.archive.sha256,size:analysis.archive.size};
          const container = resourceFromBinaryDigest(
            `res-${resources.length + 1}`, logical, file, digest.sha256, digest.size,
            "application/zip", source.role, [...labels, "zip-container", "archive-project"],
          );
          resources.push(container);
          texts.set(container.uri, `ZIP_CONTAINER ${file}\nsha256:${digest.sha256}\nsize:${digest.size}\n`);
          archiveAnalyses.push(analysis);
          const analysisMarkdown = renderArchiveAnalysisMarkdown(analysis);
          const analysisResource = resourceFromText(
            `res-${resources.length + 1}`, `${logical}.analysis.md`, `${file}!/.subactor/archive-project-analysis.md`,
            analysisMarkdown, container.uri, "archive", [source.role, ...labels, "archive-analysis", "derived-metadata"],
          );
          resources.push(analysisResource);
          texts.set(analysisResource.uri, analysisMarkdown);
          // The full report retains entry-level findings. Runtime generation needs a
          // bounded summary so 100 similar native-CAD files do not flood the LLM audit.
          warnings.push(...archiveFindingSummaries(analysis,new Set(["warning","error"])));
          notices.push(...archiveFindingSummaries(analysis,new Set(["info"])));
          for (const name of analysis.selectedTextEntries) {
            const entryLogical = `${source.logicalRoot}/archive/${encodeURIComponent(name)}`;
            const entryPath = `${file}!/${name}`;
            try {
              const content = await readZipEntry(file, name);
              const text = textFromBuffer(content, name);
              if (text === undefined) {
                pushBinary(resources,texts,`res-${resources.length + 1}`,entryLogical,entryPath,content,"archive",[source.role,...labels,"archive-entry","binary-content"],null,warnings);
                notices.push(`ARCHIVE_SELECTED_TEXT_BINARY_CONTENT:${entryPath}`);
                continue;
              }
              const r = resourceFromText(
                `res-${resources.length + 1}`,
                entryLogical,
                entryPath,
                text,
                undefined,
                "archive",
                [source.role, ...labels, "archive-entry", "archive-text-evidence"],
              );
              resources.push(r);
              texts.set(r.uri, text);
            } catch (entryError) {
              const detail=entryError instanceof Error?entryError.message:String(entryError);
              const reason=/invalid compressed data|bad CRC/i.test(detail)?"CORRUPT_COMPRESSED_DATA":/maxBuffer|ARCHIVE_ENTRY_LIMIT/i.test(detail)?"ENTRY_LIMIT":"READ_ERROR";
              warnings.push(`ARCHIVE_ENTRY_READ_FAILED:${reason}:${entryPath}`);
            }
          }
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : String(error));
          try {
            const st = await stat(file);
            pushBinary(
              resources,
              texts,
              `res-${resources.length + 1}`,
              logical,
              file,
              `zip-unreadable:${file}:size:${st.size}`,
              source.role,
              labels,
              `ARCHIVE_READ_PARTIAL:${file}`,
              warnings,
            );
          } catch (inner) {
            warnings.push(inner instanceof Error ? inner.message : String(inner));
          }
        }
        continue;
      }

      try {
        const converted = await converter.convert(file);
        const r = resourceFromText(
          `res-${resources.length + 1}`,
          logical,
          file,
          converted.markdown,
          undefined,
          source.role,
          labels,
        );
        resources.push(r);
        texts.set(r.uri, converted.markdown);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const conversionNotApplicable = error instanceof ExternalConverterRequired
          && !isDocumentConversionKind(detectDocumentKind(file));
        const binaryLabels = conversionNotApplicable ? [...labels, "conversion-not-applicable"] : labels;
        try {
          const fileInfo = await stat(file);
          // Large assets are content-addressed by streaming their real bytes. The previous
          // path+size pseudo payload changed identity when a file moved and could not prove
          // that the geometry served by the dashboard was the geometry that was inspected.
          if (fileInfo.size > 8 * 1024 * 1024) {
            const digest = await sha256File(file);
            const r = resourceFromBinaryDigest(
              `res-${resources.length + 1}`, logical, file, digest.sha256, digest.size,
              mediaTypeFor(file), source.role, [...binaryLabels, "large-binary", "stream-hashed"],
            );
            resources.push(r);
            texts.set(r.uri, `BINARY_STUB ${file}\nsha256:${digest.sha256}\nsize:${digest.size}\nlabels:${r.labels?.join(",")}\n`);
            if (!conversionNotApplicable) warnings.push(`BINARY_STREAM_HASHED:${message}`);
            continue;
          }
          const raw = await readFile(file);
          const text = textFromBuffer(raw, file);
          if (text !== undefined) {
            const r = resourceFromText(
              `res-${resources.length + 1}`,
              logical,
              file,
              text,
              undefined,
              source.role,
              labels,
            );
            resources.push(r);
            texts.set(r.uri, text);
            warnings.push(`TEXT_FALLBACK:${message}`);
            continue;
          }
          pushBinary(
            resources,
            texts,
            `res-${resources.length + 1}`,
            logical,
            file,
            raw,
            source.role,
            binaryLabels,
            conversionNotApplicable ? null : `BINARY_STUB:${message}`,
            warnings,
          );
        } catch (inner) {
          warnings.push(`${message}; ${inner instanceof Error ? inner.message : String(inner)}`);
        }
      }
    }
  }
  return { resources, texts, warnings, notices, archiveAnalyses };
}
