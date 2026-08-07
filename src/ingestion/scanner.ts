import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import type { ResourceRecord, SourceRole } from "../core/types.js";
import { CompositeDocumentConverter, detectDocumentKind } from "../adapters/document-converter.js";
import { resourceFromBinary, resourceFromText } from "../dsl/resource.js";
import { listZip, readZipEntry } from "./archive.js";

const TEXT_EXT = new Set([
  ".md", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".csv",
  ".ts", ".js", ".mjs", ".py", ".php", ".go", ".rs", ".java", ".xml", ".html", ".htm",
  ".dsl", ".projectdsl", ".mathdsl", ".treedsl", ".twindsl", ".scenedsl", ".resourcedsl", ".dql",
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
export interface ScanResult { resources: ResourceRecord[]; texts: Map<string, string>; warnings: string[]; }

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", ".intent", ".dt-run", ".biofoundry-run", ".living-runtime"].includes(e.name)) continue;
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

function pushBinary(
  resources: ResourceRecord[],
  texts: Map<string, string>,
  id: string,
  logical: string,
  sourcePath: string,
  bytes: Buffer | string,
  role: SourceRole | "archive",
  labels: string[],
  warning: string,
  warnings: string[],
): void {
  const r = resourceFromBinary(id, logical, sourcePath, bytes, mediaTypeFor(sourcePath), role as SourceRole, labels);
  resources.push(r);
  texts.set(r.uri, `BINARY_STUB ${sourcePath}\nlabels:${labels.join(",")}\n`);
  warnings.push(warning);
}

export async function scanSources(sources: ScanSource[]): Promise<ScanResult> {
  const resources: ResourceRecord[] = [];
  const texts = new Map<string, string>();
  const warnings: string[] = [];
  // Prefer composite (text → pdftotext/pandoc → optional Docling) so PDF body enters the graph offline.
  const converter = new CompositeDocumentConverter();

  for (const source of sources) {
    const absolute = resolve(source.path);
    const s = await stat(absolute);
    const files = s.isDirectory() ? await walk(absolute) : [absolute];
    for (const file of files) {
      const rel = s.isDirectory() ? relative(absolute, file) : file.split("/").at(-1)!;
      const ext = extname(file).toLowerCase();
      const logical = `${source.logicalRoot}/${rel.split("/").map(encodeURIComponent).join("/")}`;
      const labels = source.labels ?? [];

      if (ext === ".zip") {
        try {
          // Always register the container, then list entries. Binary entries are path-stubs (no extract).
          const zipStat = await stat(file);
          pushBinary(
            resources,
            texts,
            `res-${resources.length + 1}`,
            logical,
            file,
            `zip-container:${file}:size:${zipStat.size}`,
            source.role,
            [...labels, "zip-container"],
            `ZIP_CONTAINER_STUB:${file}`,
            warnings,
          );
          const names = await listZip(file);
          for (const name of names) {
            const entryLogical = `${source.logicalRoot}/archive/${encodeURIComponent(name)}`;
            const entryPath = `${file}!/${name}`;
            const entryExt = extname(name).toLowerCase();
            if (!TEXT_EXT.has(entryExt)) {
              pushBinary(
                resources,
                texts,
                `res-${resources.length + 1}`,
                entryLogical,
                entryPath,
                `zip-entry:${name}`,
                "archive",
                [source.role, ...labels, "zip-entry"],
                `ARCHIVE_ENTRY_BINARY_STUB:${name}`,
                warnings,
              );
              continue;
            }
            try {
              const content = await readZipEntry(file, name);
              const text = textFromBuffer(content, name);
              if (text === undefined) {
                pushBinary(
                  resources,
                  texts,
                  `res-${resources.length + 1}`,
                  entryLogical,
                  entryPath,
                  `zip-entry:${name}:size:${content.length}`,
                  "archive",
                  [source.role, ...labels, "zip-entry"],
                  `ARCHIVE_ENTRY_BINARY_STUB:${name}`,
                  warnings,
                );
                continue;
              }
              const r = resourceFromText(
                `res-${resources.length + 1}`,
                entryLogical,
                entryPath,
                text,
                undefined,
                "archive",
                [source.role, ...labels],
              );
              resources.push(r);
              texts.set(r.uri, text);
            } catch (entryError) {
              warnings.push(entryError instanceof Error ? entryError.message : String(entryError));
              pushBinary(
                resources,
                texts,
                `res-${resources.length + 1}`,
                entryLogical,
                entryPath,
                `zip-entry-error:${name}`,
                "archive",
                [source.role, ...labels, "zip-entry"],
                `ARCHIVE_ENTRY_ERROR:${name}`,
                warnings,
              );
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
        try {
          const raw = await readFile(file);
          // Cap huge binaries at metadata stub if > 8 MiB to keep iteration snappy.
          if (raw.length > 8 * 1024 * 1024) {
            pushBinary(
              resources,
              texts,
              `res-${resources.length + 1}`,
              logical,
              file,
              `large-binary:${file}:size:${raw.length}`,
              source.role,
              labels,
              `BINARY_STUB_LARGE:${message}`,
              warnings,
            );
          } else {
            pushBinary(
              resources,
              texts,
              `res-${resources.length + 1}`,
              logical,
              file,
              raw,
              source.role,
              labels,
              `BINARY_STUB:${message}`,
              warnings,
            );
          }
        } catch (inner) {
          warnings.push(`${message}; ${inner instanceof Error ? inner.message : String(inner)}`);
        }
      }
    }
  }
  return { resources, texts, warnings };
}
