import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { GeometryBuildContract } from "../core/types.js";

const execute = promisify(execFile);

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function files(root: string, current = root): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) output.push(...await files(root, path));
    else if (entry.isFile()) output.push(path);
  }
  return output.sort((a, b) => relative(root, a) < relative(root, b) ? -1 : relative(root, a) > relative(root, b) ? 1 : 0);
}

export async function geometryDependencyHash(path: string): Promise<string> {
  const info = await stat(path);
  if (info.isFile()) return createHash("sha256").update(await readFile(path)).digest("hex");
  if (!info.isDirectory()) throw new Error(`GEOMETRY_DEPENDENCY_TYPE_INVALID:${path}`);
  const entries = await files(path);
  if (!entries.length) throw new Error(`GEOMETRY_DEPENDENCY_EMPTY:${path}`);
  const hash = createHash("sha256");
  for (const entry of entries) {
    const name = Buffer.from(relative(path, entry).split("\\").join("/"));
    const length = Buffer.alloc(4); length.writeUInt32LE(name.length);
    hash.update(length).update(name).update(createHash("sha256").update(await readFile(entry)).digest());
  }
  return hash.digest("hex");
}

function inside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
}

/** Acquire pinned dependencies before entering the network-isolated compiler worker. */
export async function resolveGeometryDependencies(contract: GeometryBuildContract, contractPath: string): Promise<void> {
  const base = dirname(resolve(contractPath));
  for (const dependency of contract.dependencies) {
    const target = resolve(base, dependency.sourcePath);
    if (await exists(target)) {
      const actual = await geometryDependencyHash(target);
      if (actual !== dependency.sha256) throw new Error(`GEOMETRY_DEPENDENCY_CACHE_HASH_MISMATCH:${dependency.path}:${actual}`);
      continue;
    }
    if (!dependency.fetch) throw new Error(`GEOMETRY_DEPENDENCY_MISSING:${dependency.path}`);
    if (!inside(base, target)) throw new Error(`GEOMETRY_DEPENDENCY_FETCH_TARGET_OUTSIDE_PROJECT:${dependency.sourcePath}`);
    await mkdir(dirname(target), { recursive: true });
    const temporary = await mkdtemp(join(dirname(target), ".acquire-"));
    const checkout = join(temporary, "checkout"), staged = join(temporary, "content");
    try {
      await mkdir(checkout);
      const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
      await execute("git", ["-C", checkout, "init", "--quiet"], { env, timeout: 30_000, maxBuffer: 1024 * 1024 });
      await execute("git", ["-C", checkout, "fetch", "--quiet", "--depth", "1", dependency.fetch.repository, dependency.fetch.revision], { env, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
      await execute("git", ["-C", checkout, "checkout", "--quiet", "--detach", "FETCH_HEAD"], { env, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
      const revision = (await execute("git", ["-C", checkout, "rev-parse", "HEAD"], { env, timeout: 10_000 })).stdout.trim();
      if (revision !== dependency.fetch.revision) throw new Error(`GEOMETRY_DEPENDENCY_REVISION_MISMATCH:${dependency.path}:${revision}`);
      const source = dependency.fetch.subpath === "." ? checkout : resolve(checkout, dependency.fetch.subpath);
      if ((source !== checkout && !inside(checkout, source)) || !await exists(source)) throw new Error(`GEOMETRY_DEPENDENCY_SUBPATH_MISSING:${dependency.path}`);
      await cp(source, staged, { recursive: true, force: false, errorOnExist: true });
      // Git administration is never part of the dependency content hash.
      if (dependency.fetch.subpath === "." && await exists(join(staged, ".git"))) await rm(join(staged, ".git"), { recursive: true, force: true });
      const actual = await geometryDependencyHash(staged);
      if (actual !== dependency.sha256) throw new Error(`GEOMETRY_DEPENDENCY_FETCH_HASH_MISMATCH:${dependency.path}:${actual}`);
      await rename(staged, target);
      // A sidecar makes acquisition provenance inspectable without changing the hashed payload.
      const provenance = await open(`${target}.source.json`, "wx");
      await provenance.writeFile(JSON.stringify({ schema: "subactor.geometry-dependency-source/v1", ...dependency.fetch, sha256: dependency.sha256 }, null, 2) + "\n");
      await provenance.close();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
