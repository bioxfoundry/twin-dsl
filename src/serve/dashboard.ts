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

async function readEventLog(outDir: string): Promise<{ schema: string; ok: boolean; count: number; events: unknown[] }> {
  try {
    const lines = (await readFile(join(resolve(outDir), "events.jsonl"), "utf8"))
      .split(/\r?\n/).filter(Boolean);
    const events = lines.slice(-100).map((line) => {
      try { return JSON.parse(line) as unknown; }
      catch { return { schema: "subactor.invalid-event/v1", raw: line.slice(0, 2000) }; }
    });
    return { schema: "subactor.event-log-view/v1", ok: events.length > 0, count: lines.length, events };
  } catch {
    return { schema: "subactor.event-log-view/v1", ok: false, count: 0, events: [] };
  }
}

async function readDslArtifacts(current: string, configPath: string): Promise<{ schema: string; documents: Array<{ name: string; content: string }> }> {
  const documents: Array<{ name: string; content: string }> = [];
  for (const name of ["observations.dsl", "math.dsl", "geometry-validation.dsl", "improvement.dsl"]) {
    try { documents.push({ name, content: (await readFile(join(current, name), "utf8")).slice(0, 120_000) }); }
    catch { /* artifact is optional before the first accepted iteration */ }
  }
  try {
    documents.push({
      name: "testql-latest.testqldsl",
      content: (await readFile(join(dirname(resolve(configPath)), "logs", "testql-latest.testqldsl"), "utf8")).slice(0, 120_000),
    });
  } catch { /* TestQL has not run for this project yet */ }
  return { schema: "subactor.dsl-log-view/v1", documents };
}

/**
 * Fold an incoming intake onto the document the project already holds.
 *
 * Physical facts accumulate: a floor plan and an equipment register describe different
 * components and both belong in the baseline. Keyed by `componentId` so a later document
 * updates a component it mentions and leaves every other one intact — the ranking rule
 * (`weaker never overwrites stronger`) is then applied by applyPhysicalEvidence against
 * the live twin, which is the only place that knows the current grade.
 */
export function mergeEvidence(
  stored: PhysicalEvidenceDocument | null,
  incoming: PhysicalEvidenceDocument,
): PhysicalEvidenceDocument {
  if (!stored?.records?.length) return incoming;
  // Coordinate systems must agree, or positions from the two documents are not comparable.
  const sameFrame =
    stored.coordinateSystem?.unit === incoming.coordinateSystem?.unit &&
    stored.coordinateSystem?.upAxis === incoming.coordinateSystem?.upAxis;
  if (!sameFrame) return incoming;

  const byComponent = new Map(stored.records.map((record) => [record.componentId, record]));
  for (const record of incoming.records) byComponent.set(record.componentId, record);
  const byConstraint = new Map((stored.constraints ?? []).map((constraint) => [constraint.id, constraint]));
  for (const constraint of incoming.constraints ?? []) byConstraint.set(constraint.id, constraint);
  return { ...incoming, records: [...byComponent.values()], constraints: [...byConstraint.values()] };
}

/**
 * URIs of the resources this project actually ingested. A mesh reference outside that set
 * is not grounded, and geometry has to be as traceable as every other fact.
 */
async function ingestedResourceUris(currentDir: string): Promise<string[]> {
  const resources = await readJson<Array<{ uri?: string }>>(join(currentDir, "resources.json"));
  return Array.isArray(resources) ? resources.map((r) => r?.uri).filter((u): u is string => Boolean(u)) : [];
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
  geometryValidation: unknown;
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
    const [twin, scene, report, geometryValidation, observations, iteration] = await Promise.all([
      readJson<TwinDocument>(join(current, "twin.json")),
      readJson<SceneDocument>(join(current, "scene.json")),
      readJson(join(current, "physical-evidence.report.json")),
      readJson(join(current, "geometry-validation.json")),
      readJson(join(current, "observations.json")),
      readJson(join(resolve(options.outDir), "latest.json")),
    ]);
    return { twin, scene, report, geometryValidation, observations, iteration, updatedAt: new Date().toISOString() };
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
        if (request.method === "GET" && url.pathname === "/api/events") {
          return sendJson(response, 200, await readEventLog(options.outDir));
        }
        if (request.method === "GET" && url.pathname === "/api/dsl") {
          return sendJson(response, 200, await readDslArtifacts(current, options.configPath));
        }
        if (request.method === "GET" && url.pathname === "/api/scene.usda") {
          const { twin, scene } = await state();
          if (!twin || !scene) return sendJson(response, 404, { error: "NO_SCENE_YET" });
          return send(response, 200, renderOpenUsd(scene, twin), "text/plain; charset=utf-8");
        }
        if (request.method === "GET" && url.pathname === "/api/asset") {
          const wanted = url.searchParams.get("uri");
          const resources = await readJson<Array<{ uri?: string; sourcePath?: string }>>(join(current, "resources.json"));
          const resource = resources?.find(item => item.uri === wanted);
          if (!resource?.sourcePath) return sendJson(response, 404, { error: "ASSET_NOT_GROUNDED" });
          const bytes = await readFile(resource.sourcePath);
          return send(response, 200, bytes, resource.sourcePath.toLowerCase().endsWith(".stl") ? "model/stl" : "model/step");
        }
        if (request.method === "POST" && url.pathname === "/api/iterate") {
          if (busy) return sendJson(response, 409, { error: "ITERATION_IN_PROGRESS" });
          busy = true;
          const started = Date.now();
          console.info(`[dashboard] iteration:start project=${options.configPath}`);
          try {
            const receipt = await runtime.iterate(options.configPath, options.outDir, mode);
            console.info(`[dashboard] iteration:complete durationMs=${Date.now() - started} noChange=${receipt.noChange} ok=${receipt.validation.ok}`);
            return sendJson(response, 200, { iterationUri: receipt.iterationUri, noChange: receipt.noChange, ok: receipt.validation.ok });
          } catch (error) {
            console.error(`[dashboard] iteration:error durationMs=${Date.now() - started}`, error);
            throw error;
          } finally {
            busy = false;
          }
        }
        if (request.method === "POST" && url.pathname === "/api/intake") {
          // Claim the slot before the first await: checking `busy` and then yielding on
          // readBody lets two concurrent requests both pass the check.
          if (busy) return sendJson(response, 409, { error: "ITERATION_IN_PROGRESS" });
          busy = true;
          try {
            const incoming = validatePhysicalEvidence(JSON.parse(await readBody(request)) as PhysicalEvidenceDocument);
            const preview = await state();
            if (!preview.twin || !preview.scene) return sendJson(response, 404, { error: "NO_SCENE_YET" });

            const projectDir = dirname(resolve(options.configPath));
            const evidencePath = join(projectDir, "baseline/physical-evidence.json");

            // Judge the posted document on its own against the live twin. Evaluating the
            // merged set instead would report NO_CHANGE for records already applied in an
            // earlier intake, and they would then look like failures.
            const previewResult = applyPhysicalEvidence({
              twin: preview.twin,
              scene: preview.scene,
              evidence: incoming,
              // Ground meshes here, not only in the runtime. Without the corpus URIs the
              // pre-check cannot raise ASSET_NOT_GROUNDED, so a document would be written
              // and only then refused — which is how the baseline got clobbered by an
              // intake that was ultimately rejected.
              allowedAssetUris: await ingestedResourceUris(current),
            });
            const report = previewResult.report;

            const accepted = new Set(report.applied.map((entry) => entry.componentId));
            if (accepted.size === 0) {
              // Nothing survived, so there is nothing to persist. Writing here is what used
              // to discard the whole baseline on a fully rejected intake.
              return sendJson(response, 422, {
                error: "PHYSICAL_EVIDENCE_REJECTED",
                report,
                hint: "nothing was written; fix the rejected records and post again",
              });
            }
            if (!previewResult.geometryValidation.ok) {
              return sendJson(response, 422, {
                error: "GEOMETRY_VALIDATION_FAILED",
                report,
                geometryValidation: previewResult.geometryValidation,
                hint: "nothing was written; correct pose, dimensions or spatial constraints",
              });
            }

            // Persist only what was accepted, folded onto what the project already holds.
            // Replacing the file wholesale made "weaker never overwrites stronger" hold
            // only *within* one document: a smaller intake silently dropped every earlier
            // record and sent those components back to placeholder.
            const stored = await readJson<PhysicalEvidenceDocument>(evidencePath);
            const evidence = mergeEvidence(stored, {
              ...incoming,
              records: incoming.records.filter((record) => accepted.has(record.componentId)),
            });

            // Persist through the same path a real intake takes: evidence file + projectDSL key + iteration.
            await mkdir(dirname(evidencePath), { recursive: true });
            await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
            const dsl = await readFile(options.configPath, "utf8");
            if (!/^SCENE_PHYSICAL_EVIDENCE_FILE\b/m.test(dsl)) {
              await writeFile(options.configPath, `${dsl.replace(/\n+$/, "")}\nSCENE_PHYSICAL_EVIDENCE_FILE "baseline/physical-evidence.json"\n`);
            }
            const receipt = await runtime.iterate(options.configPath, options.outDir, mode);
            const next = await state();
            return sendJson(response, 200, {
              iterationUri: receipt.iterationUri,
              // `report` describes the posted document; `baseline` describes what the
              // project now holds, which includes records from earlier intakes.
              report,
              geometryValidation: previewResult.geometryValidation,
              baseline: { records: evidence.records.length, acceptedFromThisPost: accepted.size },
              twin: next.twin,
              scene: next.scene,
            });
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
