/**
 * Adapter for subactor/twin-probes autonom-cycle evidence.
 *
 * Probes emit subactor.autonom-cycle/v1 which todo2code already ingests via
 * `t2c extract runtime`. This adapter validates cycles, optionally runs the
 * twin-probes CLI, and projects results into addressable evidence URIs.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { contentUri, sha256, canonicalJson } from "../core/canonical.js";

export const CYCLE_SCHEMA = "subactor.autonom-cycle/v1";

export interface ProbeViolation {
  id: string;
  detail: string;
}
export interface ProbeResult {
  id: string;
  ok: boolean;
  watches: string[];
  tags?: string[];
  violations?: ProbeViolation[];
  error?: string;
  facts?: Record<string, string>;
}
export interface AutonomCycle {
  schema: typeof CYCLE_SCHEMA;
  host: string;
  startedAt: string;
  finishedAt?: string;
  results: ProbeResult[];
  drift?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ProbeEvidenceSummary {
  schema: "subactor.probe-evidence/v1";
  cycleUri: string;
  cycleHash: string;
  host: string;
  probeCount: number;
  healthyCount: number;
  unhealthyCount: number;
  unevaluableCount: number;
  watchedPaths: string[];
  violationIds: string[];
  evidenceUris: string[];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function validateAutonomCycle(value: unknown): AutonomCycle {
  const data = object(value);
  if (!data || data.schema !== CYCLE_SCHEMA) throw new Error("PROBE_CYCLE_SCHEMA_INVALID");
  if (typeof data.host !== "string" || !data.host.trim()) throw new Error("PROBE_CYCLE_HOST_INVALID");
  if (typeof data.startedAt !== "string") throw new Error("PROBE_CYCLE_STARTED_INVALID");
  if (!Array.isArray(data.results)) throw new Error("PROBE_CYCLE_RESULTS_INVALID");
  for (const item of data.results) {
    const result = object(item);
    if (!result || typeof result.id !== "string" || typeof result.ok !== "boolean") throw new Error("PROBE_RESULT_INVALID");
    if (!Array.isArray(result.watches) || result.watches.length === 0 || !result.watches.every((w) => typeof w === "string" && w.trim())) {
      throw new Error(`PROBE_RESULT_WATCHES_REQUIRED:${String(result.id)}`);
    }
  }
  return data as AutonomCycle;
}

export function summarizeProbeCycle(cycle: AutonomCycle): ProbeEvidenceSummary {
  const watched = new Set<string>();
  const violations: string[] = [];
  let healthy = 0;
  let unhealthy = 0;
  let unevaluable = 0;
  for (const result of cycle.results) {
    for (const path of result.watches) watched.add(path);
    if (result.error) unevaluable++;
    else if (result.ok) healthy++;
    else unhealthy++;
    for (const violation of result.violations ?? []) violations.push(`${result.id}:${violation.id}`);
  }
  const cycleHash = sha256(canonicalJson(cycle));
  const cycleUri = contentUri("probe-cycle", cycle);
  return {
    schema: "subactor.probe-evidence/v1",
    cycleUri,
    cycleHash,
    host: cycle.host,
    probeCount: cycle.results.length,
    healthyCount: healthy,
    unhealthyCount: unhealthy,
    unevaluableCount: unevaluable,
    watchedPaths: [...watched].sort(),
    violationIds: violations,
    evidenceUris: [cycleUri, ...cycle.results.map((result) => contentUri("probe-result", result))],
  };
}

async function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`TWIN_PROBES_EXIT:${code}:${error.slice(0, 2000)}`))));
  });
}

export class TwinProbesAdapter {
  constructor(
    readonly bin = process.env.TWIN_PROBES_BIN ?? "",
    readonly root = process.env.TWIN_PROBES_ROOT ?? "",
  ) {}

  async available(): Promise<boolean> {
    if (!this.bin) return false;
    try {
      await access(this.bin);
      return true;
    } catch {
      return false;
    }
  }

  async loadCycle(path: string): Promise<{ cycle: AutonomCycle; summary: ProbeEvidenceSummary }> {
    const cycle = validateAutonomCycle(JSON.parse(await readFile(path, "utf8")));
    return { cycle, summary: summarizeProbeCycle(cycle) };
  }

  async run(repo: string, outFile: string, options: { host?: string; only?: string[]; scan?: string } = {}): Promise<{ cycle: AutonomCycle; summary: ProbeEvidenceSummary }> {
    if (!(await this.available())) throw new Error("TWIN_PROBES_NOT_AVAILABLE");
    const out = isAbsolute(outFile) ? outFile : resolve(outFile);
    await mkdir(dirname(out), { recursive: true });
    const args = [this.bin, "--repo", resolve(repo), "--out", out];
    if (options.host) args.push("--host", options.host);
    if (options.scan) args.push("--scan", options.scan);
    if (options.only?.length) args.push("--only", options.only.join(","));
    await run(process.execPath, args, this.root || process.cwd(), process.env);
    return this.loadCycle(out);
  }

  async writeSummary(path: string, summary: ProbeEvidenceSummary): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(summary, null, 2) + "\n");
  }
}
