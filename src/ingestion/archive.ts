import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import type { ArchiveInventoryEntry } from "../../js/archive-project-analyzer/src/index.js";

const execFileAsync = promisify(execFile);

export interface ArchiveEntry { path: string; content: Buffer; }

function limit(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function safeArchivePath(path: string): boolean {
  const segments = path.split("/");
  return path.length > 0 && !path.startsWith("/") && !segments.includes("..") && !path.includes("\\") && !/^[A-Za-z]:/.test(path);
}

export async function sha256File(path: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return { sha256: hash.digest("hex"), size: (await stat(path)).size };
}

/** Inventory a ZIP without extracting it. Unsafe entries are retained as findings, never materialized. */
export async function inventoryZip(path: string): Promise<ArchiveInventoryEntry[]> {
  const maxInventory = limit("DT_MAX_ARCHIVE_INVENTORY_FILES", 20_000);
  const { stdout } = await execFileAsync("unzip", ["-l", path], { maxBuffer: 64 * 1024 * 1024 });
  const entries: ArchiveInventoryEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/.exec(line);
    if (!match) continue;
    const name = match[2];
    if (name.endsWith("/")) continue;
    entries.push({ path: name, uncompressedSize: Number(match[1]), safe: safeArchivePath(name) });
    if (entries.length > maxInventory) throw new Error(`ARCHIVE_INVENTORY_LIMIT:${entries.length}`);
  }
  return entries;
}

/** List zip entry paths without extracting content. */
export async function listZip(path: string): Promise<string[]> {
  const maxFiles = limit("DT_MAX_ARCHIVE_FILES", 1000);
  const { stdout } = await execFileAsync("unzip", ["-Z1", path], { maxBuffer: 16 * 1024 * 1024 });
  const names = stdout.split(/\r?\n/).filter(Boolean).filter((name) => !name.endsWith("/"));
  if (names.length > maxFiles) throw new Error(`ARCHIVE_FILE_LIMIT:${names.length}`);
  for (const name of names) {
    if (!safeArchivePath(name)) throw new Error(`ARCHIVE_UNSAFE_PATH:${name}`);
  }
  return names;
}

export async function readZipEntry(path: string, name: string, maxEntry = limit("DT_MAX_ARCHIVE_ENTRY_BYTES", 10 * 1024 * 1024)): Promise<Buffer> {
  if (!safeArchivePath(name)) throw new Error(`ARCHIVE_UNSAFE_PATH:${name}`);
  const { stdout: content } = await execFileAsync("unzip", ["-p", path, name], {
    encoding: "buffer",
    maxBuffer: maxEntry + 1,
  }) as { stdout: Buffer };
  if (content.length > maxEntry) throw new Error(`ARCHIVE_ENTRY_LIMIT:${name}`);
  return content;
}

export async function readZip(path: string): Promise<ArchiveEntry[]> {
  const maxEntry = limit("DT_MAX_ARCHIVE_ENTRY_BYTES", 10 * 1024 * 1024);
  const maxTotal = limit("DT_MAX_TOTAL_ARCHIVE_BYTES", 100 * 1024 * 1024);
  const names = await listZip(path);
  const out: ArchiveEntry[] = [];
  let total = 0;
  for (const name of names) {
    const content = await readZipEntry(path, name, maxEntry);
    total += content.length;
    if (total > maxTotal) throw new Error("ARCHIVE_TOTAL_LIMIT");
    out.push({ path: name, content });
  }
  return out;
}
