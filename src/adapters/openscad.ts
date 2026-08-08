import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeometryBuildReceipt } from "../core/types.js";
import { validateGeometryBuildReceipt } from "../geometry/build-contract.js";

async function existing(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error(`GEOMETRY_WORKER_SCRIPT_MISSING:${candidates.join("|")}`);
}

async function workerScript(configured?: string): Promise<string> {
  if (configured) return existing([resolve(configured)]);
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return existing([
    resolve(process.cwd(), "scripts/cad-to-gltf.py"),
    resolve(moduleDir, "../../scripts/cad-to-gltf.py"),
    resolve(moduleDir, "../../../scripts/cad-to-gltf.py"),
  ]);
}

/** Thin process boundary around the isolated, deterministic OpenSCAD worker. */
export class OpenScadGeometryBackend {
  constructor(
    readonly python = process.env.PYTHON_BIN ?? "python3",
    readonly configuredScript = process.env.GEOMETRY_WORKER_SCRIPT,
  ) {}

  async materialize(input: {
    contractPath: string;
    outputRoot: string;
    receiptPath: string;
    timeoutSeconds: number;
  }): Promise<GeometryBuildReceipt> {
    const script = await workerScript(this.configuredScript);
    const args = [script, "--geometry-build", resolve(input.contractPath), "--geometry-output", resolve(input.outputRoot), "--receipt", resolve(input.receiptPath)];
    let stdout = "", stderr = "";
    const limit = 2 * 1024 * 1024;
    const child = spawn(this.python, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { if (stdout.length < limit) stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { if (stderr.length < limit) stderr += chunk; });
    const timeout = setTimeout(() => child.kill("SIGKILL"), Math.max(1, input.timeoutSeconds + 30) * 1000);
    let code: number | null;
    try {
      code = await new Promise<number | null>((done, fail) => {
        child.once("error", fail);
        child.once("close", done);
      });
    } finally {
      clearTimeout(timeout);
    }
    try {
      return validateGeometryBuildReceipt(JSON.parse(await readFile(resolve(input.receiptPath), "utf8")));
    } catch (error) {
      throw new Error(`GEOMETRY_WORKER_RECEIPT_MISSING:exit=${code}:stderr=${stderr.slice(-2000)}:stdout=${stdout.slice(-2000)}:cause=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
