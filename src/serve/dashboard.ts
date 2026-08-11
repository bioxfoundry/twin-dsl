/**
 * Dashboard service — serves the live twin/scene artifacts of a living project over HTTP
 * so the factory can be inspected in 3D while it iterates.
 *
 * Dependency-free by design (node:http only), matching the rest of the runtime.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AssemblyReport, LlmMode, PhysicalEvidenceDocument, SceneDocument, TwinDocument, TwinStateDocument } from "../core/types.js";
import { contentUri } from "../core/canonical.js";
import { LivingProjectRuntime } from "../runtime/living-project.js";
import { applyPhysicalEvidence, validatePhysicalEvidence } from "../scene/physical-evidence.js";
import { renderOpenUsd } from "../scene/openusd.js";
import { evaluateTwinStateFreshness } from "../runtime/twin-state.js";

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

interface ErrorCatalogEntry {
  code: string;
  title: string;
  subsystem: string;
  defaultSeverity: string;
  errorClass: string;
  retryable: boolean;
  meaning: string;
  causes: string[];
  impact: string;
  resolution: string;
}

interface ErrorCatalogDocument {
  schema: "bioxfoundry.error-catalog/v1";
  entries: ErrorCatalogEntry[];
}

const ERROR_CODE = /^(?:[A-Z][A-Z0-9_-]{2,}|[a-z][a-z0-9_-]{2,})$/;
const DASHBOARD_INTERNAL_ERROR = "DASHBOARD_INTERNAL_ERROR";

/** Locate the generated error reference from source, dist and vendored layouts. */
async function errorRoot(): Promise<string> {
  const here = fileURLToPath(new URL(".", import.meta.url));
  for (const candidate of ["../../../error", "../../error", "../../../../error"]) {
    const path = resolve(here, candidate);
    try {
      await stat(join(path, "catalog.json"));
      return path;
    } catch {
      /* try the next layout */
    }
  }
  throw new Error("ERROR_REFERENCE_ASSETS_NOT_FOUND");
}

function codeFromError(value: unknown): string {
  const detail = value instanceof Error ? value.message : String(value);
  const candidate = detail.split(":", 1)[0];
  return ERROR_CODE.test(candidate) ? candidate : DASHBOARD_INTERNAL_ERROR;
}

function errorLinks(code: string): { documentation: string; errorReference: string } {
  const encoded = encodeURIComponent(code);
  return { documentation: `/error/${encoded}.md`, errorReference: `/api/errors/${encoded}` };
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
  for (const name of ["observations.dsl", "twin-state.dsl", "assembly-report.dsl", "archive-project-analysis.dsl", "evidence-sets.dsl", "math.dsl", "geometry-builds.dsl", "geometry-validation.dsl", "project-integrity.dsl", "presentation-evidence.dsl", "improvement.dsl"]) {
    try { const content=(await readFile(join(current, name), "utf8")).slice(0, 120_000);if(content.trim())documents.push({ name, content }); }
    catch { /* artifact is optional before the first accepted iteration */ }
  }
  // A blocked candidate must remain inspectable even though it is deliberately not
  // promoted to `current/`. A successful iteration also leaves its staging directory in
  // place, so the receipt gate is required to avoid presenting ACTIVE as a rejected candidate.
  const latest=await readJson<{validation?:{ok?:boolean}}>(join(dirname(current),"latest.json"));
  if(latest?.validation?.ok===false) {
    for (const name of ["archive-project-analysis.dsl", "geometry-builds.dsl", "geometry-validation.dsl", "project-integrity.dsl", "presentation-evidence.dsl"]) {
      try {
        const content=(await readFile(join(dirname(current), "candidate", name), "utf8")).slice(0, 120_000);
        if(content.trim())documents.push({name:`latest-candidate/${name}`,content});
      } catch { /* no candidate artifact */ }
    }
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

function sendError(response: ServerResponse, status: number, code: string, details: Record<string, unknown> = {}): void {
  sendJson(response, status, { ...details, error: code, code, ...errorLinks(code) });
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
  /** Inspection replicas must not run iterations or persist physical intake. */
  readOnly?: boolean;
}

interface DashboardState {
  control: { mode: "read-only" | "writer"; mutationsEnabled: boolean };
  /** The only revision rendered by the dashboard and exported through /api/scene.usda. */
  active: {
    scope: "current";
    status: "accepted" | "unavailable";
    revisionUri: string | null;
    sceneRevisionUri: string | null;
    sourceSnapshotHash: string | null;
    twin: TwinDocument | null;
    twinState: TwinStateDocument | null;
    assemblyReport: AssemblyReport | null;
    scene: SceneDocument | null;
    geometryValidation: unknown;
    geometryBuilds: unknown;
    projectIntegrity: unknown;
  };
  /** A failed proposal remains inspectable, but is never projected as the active scene. */
  latestCandidate: {
    scope: "candidate";
    status: "rejected";
    iterationUri: string | null;
    revisionUri: string | null;
    sceneRevisionUri: string | null;
    sourceSnapshotHash: string | null;
    validation: unknown;
    twin: TwinDocument | null;
    twinState: TwinStateDocument | null;
    assemblyReport: AssemblyReport | null;
    scene: SceneDocument | null;
    geometryValidation: unknown;
    geometryBuilds: unknown;
    projectIntegrity: unknown;
  } | null;
  twin: TwinDocument | null;
  twinState: TwinStateDocument | null;
  assemblyReport: AssemblyReport | null;
  candidateTwin: TwinDocument | null;
  scene: SceneDocument | null;
  report: unknown;
  geometryValidation: unknown;
  geometryBuilds: unknown;
  projectIntegrity: unknown;
  currentProjectIntegrity: unknown;
  /** @deprecated Rendered artifacts are always current; use diagnosticScope for reports. */
  artifactScope: "current";
  renderedScope: "current";
  diagnosticScope: "current" | "candidate";
  observations: unknown;
  iteration: unknown;
  updatedAt: string;
}

export async function startDashboard(options: DashboardOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const publicDir = await assetRoot();
  const errorsDir = await errorRoot();
  const errorCatalog = await readJson<ErrorCatalogDocument>(join(errorsDir, "catalog.json"));
  if (errorCatalog?.schema !== "bioxfoundry.error-catalog/v1" || !Array.isArray(errorCatalog.entries)) {
    throw new Error("ERROR_REFERENCE_CATALOG_INVALID");
  }
  const errorsByCode = new Map(errorCatalog.entries.map((entry) => [entry.code, entry]));
  const current = join(resolve(options.outDir), "current");
  const runtime = new LivingProjectRuntime();
  const mode: LlmMode = options.mode ?? "deterministic";
  const readOnly = options.readOnly ?? false;
  const dashboardLogPath = join(dirname(resolve(options.configPath)), "logs", `dashboard-${options.port}.log`);
  let busy = false;

  async function dashboardLog(level:"info"|"warn"|"error",event:string,details:Record<string,unknown>={}):Promise<void>{
    const record={schema:"subactor.dashboard-log/v1",at:new Date().toISOString(),level,event,port:options.port,mode,readOnly,...details};
    await mkdir(dirname(dashboardLogPath),{recursive:true});
    await appendFile(dashboardLogPath,JSON.stringify(record)+"\n").catch(()=>undefined);
    console[level](`[dashboard] ${event}`,details);
  }

  async function state(): Promise<DashboardState> {
    const [twin, candidateTwin, twinState, candidateTwinState, currentAssemblyReport, candidateAssemblyReport, scene, candidateScene, report, currentGeometryValidation, candidateGeometryValidation, currentGeometryBuilds, candidateGeometryBuilds, currentProjectIntegrity, candidateProjectIntegrity, observations, iteration] = await Promise.all([
      readJson<TwinDocument>(join(current, "twin.json")),
      readJson<TwinDocument>(join(dirname(current), "candidate", "twin.json")),
      readJson<TwinStateDocument>(join(current, "twin-state.json")),
      readJson<TwinStateDocument>(join(dirname(current), "candidate", "twin-state.json")),
      readJson<AssemblyReport>(join(current, "assembly-report.json")),
      readJson<AssemblyReport>(join(dirname(current), "candidate", "assembly-report.json")),
      readJson<SceneDocument>(join(current, "scene.json")),
      readJson<SceneDocument>(join(dirname(current), "candidate", "scene.json")),
      readJson(join(current, "physical-evidence.report.json")),
      readJson(join(current, "geometry-validation.json")),
      readJson(join(dirname(current), "candidate", "geometry-validation.json")),
      readJson(join(current, "geometry-builds.json")),
      readJson(join(dirname(current), "candidate", "geometry-builds.json")),
      readJson(join(current, "project-integrity.json")),
      readJson(join(dirname(current), "candidate", "project-integrity.json")),
      readJson(join(current, "observations.json")),
      readJson(join(resolve(options.outDir), "latest.json")),
    ]);
    const evaluatedAt=new Date().toISOString();
    const evaluatedTwinState=twinState?evaluateTwinStateFreshness(twinState,evaluatedAt):null;
    const evaluatedCandidateTwinState=candidateTwinState?evaluateTwinStateFreshness(candidateTwinState,evaluatedAt):null;
    const latest=(iteration as {iterationUri?:string;validation?:{ok?:boolean}}|null);
    const latestRejected=latest?.validation?.ok===false;
    const active={
      scope:"current" as const,
      status:twin&&scene?"accepted" as const:"unavailable" as const,
      revisionUri:twin?contentUri("twin",twin):null,
      sceneRevisionUri:scene?contentUri("scene",scene):null,
      sourceSnapshotHash:twin?.sourceSnapshotHash??null,
      twin,twinState:evaluatedTwinState,assemblyReport:currentAssemblyReport,scene,
      geometryValidation:currentGeometryValidation,
      geometryBuilds:currentGeometryBuilds,
      projectIntegrity:currentProjectIntegrity,
    };
    const latestCandidate=latestRejected?{
      scope:"candidate" as const,
      status:"rejected" as const,
      iterationUri:latest?.iterationUri??null,
      revisionUri:candidateTwin?contentUri("twin",candidateTwin):null,
      sceneRevisionUri:candidateScene?contentUri("scene",candidateScene):null,
      sourceSnapshotHash:candidateTwin?.sourceSnapshotHash??null,
      validation:latest?.validation??null,
      twin:candidateTwin,twinState:evaluatedCandidateTwinState,assemblyReport:candidateAssemblyReport,scene:candidateScene,
      geometryValidation:candidateGeometryValidation,
      geometryBuilds:candidateGeometryBuilds,
      projectIntegrity:candidateProjectIntegrity,
    }:null;
    return {
      control:{mode:readOnly?"read-only":"writer",mutationsEnabled:!readOnly},
      active,latestCandidate,
      twin,twinState:evaluatedTwinState,assemblyReport:currentAssemblyReport,candidateTwin,scene,report,
      // Compatibility fields describe the scene actually rendered. Candidate diagnostics
      // have a dedicated namespace above and therefore cannot silently colour ACTIVE red.
      geometryValidation:currentGeometryValidation,
      geometryBuilds:currentGeometryBuilds,
      projectIntegrity:currentProjectIntegrity,
      currentProjectIntegrity,
      artifactScope:"current",
      renderedScope:"current",
      diagnosticScope:latestRejected?"candidate":"current",
      observations,iteration,updatedAt:new Date().toISOString(),
    };
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
        const errorApi = url.pathname.match(/^\/api\/errors\/([^/]+)$/);
        const errorMarkdown = url.pathname.match(/^\/error\/([^/]+)\.md$/);
        if (request.method === "GET" && (errorApi || errorMarkdown)) {
          let code: string;
          try { code = decodeURIComponent((errorApi ?? errorMarkdown)![1]); }
          catch { return sendError(response, 400, "ERROR_REFERENCE_CODE_INVALID"); }
          if (!ERROR_CODE.test(code)) return sendError(response, 400, "ERROR_REFERENCE_CODE_INVALID", { requestedCode: code });
          const entry = errorsByCode.get(code);
          if (!entry) return sendError(response, 404, "ERROR_REFERENCE_NOT_FOUND", { requestedCode: code });
          if (errorMarkdown) {
            try {
              return send(response, 200, await readFile(join(errorsDir, `${code}.md`)), "text/markdown; charset=utf-8");
            } catch {
              return sendError(response, 500, "ERROR_REFERENCE_ASSETS_NOT_FOUND", { requestedCode: code });
            }
          }
          return sendJson(response, 200, {
            schema: "bioxfoundry.error-reference/v1",
            ...entry,
            ...errorLinks(code),
            source: "error/catalog.json",
          });
        }
        if (request.method === "GET" && url.pathname === "/api/scene.usda") {
          const { twin, scene } = await state();
          if (!twin || !scene) return sendError(response, 404, "NO_SCENE_YET");
          return send(response, 200, renderOpenUsd(scene, twin), "text/plain; charset=utf-8");
        }
        if (request.method === "GET" && url.pathname === "/api/asset") {
          const wanted = url.searchParams.get("uri");
          const resources = await readJson<Array<{ uri?: string; sourcePath?: string }>>(join(current, "resources.json"));
          const resource = resources?.find(item => item.uri === wanted);
          if (!resource?.sourcePath) return sendError(response, 404, "ASSET_NOT_GROUNDED");
          const bytes = await readFile(resource.sourcePath);
          const lower = resource.sourcePath.toLowerCase();
          const type = lower.endsWith(".glb") ? "model/gltf-binary"
            : lower.endsWith(".gltf") ? "model/gltf+json"
            : lower.endsWith(".stl") ? "model/stl"
            : lower.endsWith(".3mf") ? "model/3mf"
            : lower.endsWith(".usda") ? "model/vnd.usda"
            : lower.endsWith(".usdc") ? "model/vnd.usdc"
            : "model/step";
          return send(response, 200, bytes, type);
        }
        if (request.method === "POST" && url.pathname === "/api/iterate") {
          if (readOnly) return sendError(response, 403, "DASHBOARD_READ_ONLY", {
            diagnostic: "DUPLICATE_TWIN_ITERATION_WRITER",
            message: "This inspection replica cannot write the living runtime; use the elected iteration controller.",
          });
          if (busy) return sendError(response, 409, "ITERATION_IN_PROGRESS");
          busy = true;
          const started = Date.now();
          await dashboardLog("info","iteration:start",{project:options.configPath});
          try {
            const receipt = await runtime.iterate(options.configPath, options.outDir, mode);
            await dashboardLog("info","iteration:complete",{durationMs:Date.now()-started,noChange:receipt.noChange,ok:receipt.validation.ok,iterationUri:receipt.iterationUri});
            if (!receipt.validation.ok) {
              await dashboardLog("warn","iteration:blocked",{failures:receipt.validation.failures});
              return sendError(response, 422, "ITERATION_BLOCKED", {
                iterationUri: receipt.iterationUri,
                noChange: receipt.noChange,
                ok: false,
                failures: receipt.validation.failures,
                diagnostics: "/api/dsl",
              });
            }
            return sendJson(response, 200, { iterationUri: receipt.iterationUri, noChange: receipt.noChange, ok: true });
          } catch (error) {
            await dashboardLog("error","iteration:error",{durationMs:Date.now()-started,error:error instanceof Error?error.message:String(error)});
            throw error;
          } finally {
            busy = false;
          }
        }
        if (request.method === "POST" && url.pathname === "/api/intake") {
          if (readOnly) return sendError(response, 403, "DASHBOARD_READ_ONLY", {
            diagnostic: "DUPLICATE_TWIN_ITERATION_WRITER",
            message: "Physical intake is disabled on an inspection replica.",
          });
          // Claim the slot before the first await: checking `busy` and then yielding on
          // readBody lets two concurrent requests both pass the check.
          if (busy) return sendError(response, 409, "ITERATION_IN_PROGRESS");
          busy = true;
          try {
            const incoming = validatePhysicalEvidence(JSON.parse(await readBody(request)) as PhysicalEvidenceDocument);
            const preview = await state();
            if (!preview.twin || !preview.scene) return sendError(response, 404, "NO_SCENE_YET");

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
              return sendError(response, 422, "PHYSICAL_EVIDENCE_REJECTED", {
                report,
                hint: "nothing was written; fix the rejected records and post again",
              });
            }
            if (!previewResult.geometryValidation.ok) {
              return sendError(response, 422, "GEOMETRY_VALIDATION_FAILED", {
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
        return sendError(response, 404, "NOT_FOUND", { path: url.pathname });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const candidate = codeFromError(error);
        const code = errorsByCode.has(candidate) ? candidate : DASHBOARD_INTERNAL_ERROR;
        sendError(response, 500, code, { detail });
      }
    })();
  });

  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((done, fail) => {
    const listening = (): void => {
      server.off("error", failed);
      done();
    };
    const failed = (error: NodeJS.ErrnoException): void => {
      server.off("listening", listening);
      const detail = error.code === "EADDRINUSE"
        ? `DASHBOARD_PORT_IN_USE:${host}:${options.port}`
        : `DASHBOARD_LISTEN_FAILED:${host}:${options.port}:${error.code ?? error.message}`;
      fail(new Error(detail));
    };
    server.once("error", failed);
    server.once("listening", listening);
    server.listen(options.port, host);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  await dashboardLog("info","server:listening",{host,actualPort:port,url:`http://${host}:${port}/`});
  return {
    url: `http://${host}:${port}/`,
    close: () => new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  };
}
