import { createHash } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import {
  analyzeArchiveProject,
  renderArchiveAnalysisDsl,
  renderArchiveAnalysisMarkdown,
  type ArchiveProjectAnalysis,
} from "../../js/archive-project-analyzer/src/index.js";
import { inventoryZip, readZipEntry, safeArchivePath, sha256File } from "./archive.js";

export interface ArchiveMaterializationEntry {
  archiveUri: string;
  entryPath: string;
  status: "materialized" | "skipped" | "failed";
  outputPath?: string;
  sha256?: string;
  uri?: string;
  size?: number;
  mediaType?: string;
  reason?: string;
  repairProcess?: string;
}

export interface ArchiveMaterializationReceipt {
  schema: "subactor.archive-materialization-receipt/v1";
  archiveUri: string;
  archivePath: string;
  outputRoot: string;
  policy: { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number };
  entries: ArchiveMaterializationEntry[];
  coverage: { selected: number; materialized: number; skipped: number; failed: number; materializedBytes: number };
}

const MEDIA: Record<string, string> = {
  ".obj": "model/obj", ".stl": "model/stl", ".step": "model/step", ".stp": "model/step",
  ".scad": "application/x-openscad", ".3mf": "model/3mf", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
};

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function analyzeZipFile(path: string): Promise<ArchiveProjectAnalysis> {
  const absolute = resolve(path);
  const digest = await sha256File(absolute);
  return analyzeArchiveProject({
    archivePath: absolute,
    archiveSha256: digest.sha256,
    archiveSize: digest.size,
    entries: await inventoryZip(absolute),
    maxTextEntries: envLimit("DT_MAX_ARCHIVE_TEXT_ENTRIES", 64),
    maxGeometryEntries: envLimit("DT_MAX_ARCHIVE_GEOMETRY_ENTRIES", 32),
  });
}

export async function findZipFiles(path: string): Promise<string[]> {
  const absolute = resolve(path);
  const info = await stat(absolute);
  if (info.isFile()) return extname(absolute).toLowerCase() === ".zip" ? [absolute] : [];
  const out: string[] = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || [".git", "node_modules", "dist", ".living-runtime"].includes(entry.name)) continue;
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) out.push(...await findZipFiles(child));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".zip") out.push(child);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export async function materializeArchiveGeometry(
  analysis: ArchiveProjectAnalysis,
  outputRoot: string,
): Promise<ArchiveMaterializationReceipt> {
  const maxEntries = envLimit("DT_MAX_ARCHIVE_MATERIALIZE_FILES", 32);
  const maxEntryBytes = envLimit("DT_MAX_ARCHIVE_MATERIALIZE_ENTRY_BYTES", 256 * 1024 * 1024);
  const maxTotalBytes = envLimit("DT_MAX_ARCHIVE_MATERIALIZE_TOTAL_BYTES", 512 * 1024 * 1024);
  const root = resolve(outputRoot);
  const archiveRoot = join(root, analysis.archive.sha256.slice(0, 16));
  const entries: ArchiveMaterializationEntry[] = [];
  let total = 0;
  for (const entryPath of analysis.selectedGeometryEntries.slice(0, maxEntries)) {
    const candidate = analysis.candidates.find((item) => item.path === entryPath);
    const repairProcess = candidate?.backend
      ? `subactor://process/repair/archive/compile-${candidate.backend}-geometry`
      : "subactor://process/repair/archive/select-supported-geometry";
    if (!candidate || !candidate.materializable || !safeArchivePath(entryPath)) {
      entries.push({ archiveUri:analysis.archive.uri, entryPath, status:"skipped", reason:"not safely materializable", repairProcess });
      continue;
    }
    if (candidate.uncompressedSize > maxEntryBytes) {
      entries.push({ archiveUri:analysis.archive.uri, entryPath, status:"skipped", reason:`ARCHIVE_ENTRY_LIMIT:${candidate.uncompressedSize}`, repairProcess:"subactor://process/repair/archive/raise-reviewed-entry-budget" });
      continue;
    }
    if (total + candidate.uncompressedSize > maxTotalBytes) {
      entries.push({ archiveUri:analysis.archive.uri, entryPath, status:"skipped", reason:"ARCHIVE_TOTAL_LIMIT", repairProcess:"subactor://process/repair/archive/refine-geometry-selection" });
      continue;
    }
    try {
      const content = await readZipEntry(analysis.archive.path, entryPath, maxEntryBytes);
      const digest = createHash("sha256").update(content).digest("hex");
      const destination = resolve(archiveRoot, entryPath);
      if (relative(archiveRoot, destination).startsWith("..")) throw new Error(`ARCHIVE_UNSAFE_PATH:${entryPath}`);
      await mkdir(dirname(destination), { recursive:true });
      await writeFile(destination, content);
      total += content.length;
      entries.push({
        archiveUri:analysis.archive.uri, entryPath, status:"materialized", outputPath:destination,
        sha256:digest, uri:`urn:subactor:resource:sha256:${digest}`, size:content.length,
        mediaType:MEDIA[extname(entryPath).toLowerCase()] ?? "application/octet-stream",
        repairProcess,
      });
    } catch (error) {
      entries.push({
        archiveUri:analysis.archive.uri, entryPath, status:"failed",
        reason:error instanceof Error ? error.message : String(error), repairProcess,
      });
    }
  }
  const receipt:ArchiveMaterializationReceipt = {
    schema:"subactor.archive-materialization-receipt/v1", archiveUri:analysis.archive.uri,
    archivePath:analysis.archive.path, outputRoot:root,
    policy:{maxEntries,maxEntryBytes,maxTotalBytes}, entries,
    coverage:{
      selected:analysis.selectedGeometryEntries.length,
      materialized:entries.filter((entry)=>entry.status==="materialized").length,
      skipped:entries.filter((entry)=>entry.status==="skipped").length,
      failed:entries.filter((entry)=>entry.status==="failed").length,
      materializedBytes:total,
    },
  };
  await mkdir(archiveRoot,{recursive:true});
  await writeFile(join(archiveRoot,"archive-materialization-receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  return receipt;
}

export async function writeArchiveAnalysis(analysis: ArchiveProjectAnalysis, outputRoot: string): Promise<{json:string;dsl:string;markdown:string}> {
  const name = `${basename(analysis.archive.path,".zip").replace(/[^A-Za-z0-9._-]+/g,"-")}-${analysis.archive.sha256.slice(0,12)}`;
  const root = resolve(outputRoot);
  await mkdir(root,{recursive:true});
  const paths = { json:join(root,`${name}.json`), dsl:join(root,`${name}.dsl`), markdown:join(root,`${name}.md`) };
  await writeFile(paths.json,JSON.stringify(analysis,null,2)+"\n");
  await writeFile(paths.dsl,renderArchiveAnalysisDsl(analysis));
  await writeFile(paths.markdown,renderArchiveAnalysisMarkdown(analysis));
  return paths;
}
