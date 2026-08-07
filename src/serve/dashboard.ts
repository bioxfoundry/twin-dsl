/**
 * Dashboard service — serves the live twin/scene artifacts of a living project over HTTP
 * so the factory can be inspected in 3D while it iterates.
 *
 * Dependency-free by design (node:http only), matching the rest of the runtime.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LlmMode, PhysicalEvidenceDocument, SceneDocument, TwinDocument } from "../core/types.js";
import { LivingProjectRuntime } from "../runtime/living-project.js";
import { applyPhysicalEvidence, validatePhysicalEvidence } from "../scene/physical-evidence.js";
import { renderOpenUsd } from "../scene/openusd.js";

/** Locate `public/` from either the compiled (dist/src/serve) or source layout. */
async function assetRoot(): Promise<string> {
  const here = fileURLToPath(new URL(".", import.meta.url));
  for (const candidate of ["../../../public", "../../public", "../../../../public"]) {
    const path = resolve(here, candidate);
    try {
      await stat(join(path, "dashboard.html"));
      return path;
    } catch {
      /* try the next layout */
    }
  }
  throw new Error("DASHBOARD_ASSETS_NOT_FOUND");
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function send(response: ServerResponse, status: number, body: string | Buffer, type: string): void {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    // Local inspection tool: no third-party origins are involved.
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  send(response, status, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

async function readBody(request: IncomingMessage, limitBytes = 1_000_000): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface DashboardOptions {
  /** Path to the project.projectdsl driving the factory. */
  configPath: string;
  /** Runtime output directory holding `current/` artifacts. */
  outDir: string;
  port: number;
  host?: string;
  mode?: LlmMode;
}

interface DashboardState {
  twin: TwinDocument | null;
  scene: SceneDocument | null;
  report: unknown;
  observations: unknown;
  iteration: unknown;
  updatedAt: string;
}

export async function startDashboard(options: DashboardOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const publicDir = await assetRoot();
  const current = join(resolve(options.outDir), "current");
  const runtime = new LivingProjectRuntime();
  const mode: LlmMode = options.mode ?? "deterministic";
  let busy = false;

  async function state(): Promise<DashboardState> {
    const [twin, scene, report, observations, iteration] = await Promise.all([
      readJson<TwinDocument>(join(current, "twin.json")),
      readJson<SceneDocument>(join(current, "scene.json")),
      readJson(join(current, "physical-evidence.report.json")),
      readJson(join(current, "observations.json")),
      readJson(join(resolve(options.outDir), "latest.json")),
    ]);
    return { twin, scene, report, observations, iteration, updatedAt: new Date().toISOString() };
  }

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      try {
        if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
          return send(response, 200, await readFile(join(publicDir, "dashboard.html")), "text/html; charset=utf-8");
        }
        if (request.method === "GET" && url.pathname === "/api/state") {
          return sendJson(response, 200, await state());
        }
        if (request.method === "GET" && url.pathname === "/api/scene.usda") {
          const { twin, scene } = await state();
          if (!twin || !scene) return sendJson(response, 404, { error: "NO_SCENE_YET" });
          return send(response, 200, renderOpenUsd(scene, twin), "text/plain; charset=utf-8");
        }
        if (request.method === "POST" && url.pathname === "/api/iterate") {
          if (busy) return sendJson(response, 409, { error: "ITERATION_IN_PROGRESS" });
          busy = true;
          try {
            const receipt = await runtime.iterate(options.configPath, options.outDir, mode);
            return sendJson(response, 200, { iterationUri: receipt.iterationUri, noChange: receipt.noChange, ok: receipt.validation.ok });
          } finally {
            busy = false;
          }
        }
        if (request.method === "POST" && url.pathname === "/api/intake") {
          if (busy) return sendJson(response, 409, { error: "ITERATION_IN_PROGRESS" });
          const evidence = validatePhysicalEvidence(JSON.parse(await readBody(request)) as PhysicalEvidenceDocument);
          const preview = await state();
          if (!preview.twin || !preview.scene) return sendJson(response, 404, { error: "NO_SCENE_YET" });
          // Reject before touching the project, so a bad intake never lands on disk.
          applyPhysicalEvidence({ twin: preview.twin, scene: preview.scene, evidence });
          busy = true;
          try {
            // Persist through the same path a real intake takes: evidence file + projectDSL key + iteration.
            const projectDir = dirname(resolve(options.configPath));
            const evidencePath = join(projectDir, "baseline/physical-evidence.json");
            await mkdir(dirname(evidencePath), { recursive: true });
            await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
            const dsl = await readFile(options.configPath, "utf8");
            if (!/^SCENE_PHYSICAL_EVIDENCE_FILE\b/m.test(dsl)) {
              await writeFile(options.configPath, `${dsl.replace(/\n+$/, "")}\nSCENE_PHYSICAL_EVIDENCE_FILE "baseline/physical-evidence.json"\n`);
            }
            const receipt = await runtime.iterate(options.configPath, options.outDir, mode);
            const next = await state();
            return sendJson(response, 200, { iterationUri: receipt.iterationUri, report: next.report, twin: next.twin, scene: next.scene });
          } finally {
            busy = false;
          }
        }
        if (request.method === "GET" && url.pathname === "/favicon.ico") {
          return send(response, 200, Buffer.alloc(0), "image/x-icon");
        }
        return sendJson(response, 404, { error: "NOT_FOUND", path: url.pathname });
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((done) => server.listen(options.port, host, done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    url: `http://${host}:${port}/`,
    close: () => new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  };
}
