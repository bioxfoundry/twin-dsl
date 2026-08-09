import { join, relative, resolve } from "node:path";
import type {
  AssemblyReport,
  LivingIterationReceipt,
  LivingProjectDocument,
  LlmMode,
  TwinStateDocument,
} from "../core/types.js";
import type { PresentationEvidenceSummary } from "./presentation-evidence.js";

export function startDocumentPath(projectRoot:string,path:string):string {
  const candidate = relative(projectRoot,resolve(path));
  return candidate === "" ? "." : candidate.startsWith("..") ? resolve(path) : candidate;
}

export interface StartValidationSummary {
  intentDsl?: { packs:number;records:number;invalid:number };
  geometryBuild?: { failures:string[];contracts:number };
  geometry?: { bindings:number;passedRequiredChecks?:number;requiredChecks?:number };
  projectIntegrity?: { ok:boolean;complete:boolean };
  archive?: { materializableGeometry:number;unsupportedCad:number };
}

export interface StartDocumentInput {
  project:LivingProjectDocument;
  projectRoot:string;
  configPath:string;
  runtimeRoot:string;
  dashboardCli:string;
  dashboardPort:number;
  mode:LlmMode;
  receipt:LivingIterationReceipt;
  streamVersion:number;
  evaluation:"changed"|"no-change";
  activeAvailable:boolean;
  activeTwinStateAvailable:boolean;
  latestArtifactRoot:string;
  iterationPublished:boolean;
  latestTwinState?:TwinStateDocument;
  latestAssemblyReport?:AssemblyReport;
  validation?:StartValidationSummary;
  presentationEvidence?:PresentationEvidenceSummary;
  feedbackPath:string;
  generatedAt?:string;
}

/** Render the human entrypoint exclusively from runtime-owned, validated facts. */
export function renderStartDocument(input:StartDocumentInput):string {
  const {
    project,projectRoot,configPath,runtimeRoot,dashboardCli,dashboardPort,mode,receipt,
    streamVersion,evaluation,activeAvailable,activeTwinStateAvailable,latestArtifactRoot,
    iterationPublished,latestTwinState,latestAssemblyReport,validation,presentationEvidence,feedbackPath,
  } = input;
  const pathFor = (path:string):string => startDocumentPath(projectRoot,path);
  const completedStatus = receipt.validation.ok ? "ACCEPTED" : "REJECTED";
  const activeStatus = activeAvailable ? "ACCEPTED" : "UNAVAILABLE";
  const evaluationStatus = evaluation === "no-change"
    ? "NO CHANGE (no receipt or event appended)"
    : "CHANGED (receipt and event persisted)";
  const validationText = receipt.validation.ok ? "passed" : receipt.validation.failures.join(", ");
  const geometryChecks = validation?.geometry
    ? `${validation.geometry.passedRequiredChecks??"legacy"}/${validation.geometry.requiredChecks??"legacy"} over ${validation.geometry.bindings} physical/hybrid component(s)`
    : undefined;
  const geometryBuildStatus = validation?.geometryBuild
    ? validation.geometryBuild.failures.length
      ? `FAIL (${validation.geometryBuild.failures.join(", ")})`
      : `PASS (${validation.geometryBuild.contracts} contract(s))`
    : undefined;

  return [
    `# ${project.name} — START`,
    "",
    `Generated: ${input.generatedAt??new Date().toISOString()}`,
    `Active artifact: ${activeStatus}`,
    `Last completed iteration: ${completedStatus}`,
    `Latest evaluation: ${evaluationStatus}`,
    `Project: ${project.id}`,
    `Runtime generation: ${receipt.runtimeGeneration}`,
    `Iteration started: ${receipt.startedAt}`,
    `Iteration completed: ${receipt.completedAt}`,
    `Event stream version: ${streamVersion}`,
    "",
    "## Live application",
    "",
    `- Dashboard URL after start: http://127.0.0.1:${dashboardPort}`,
    "- Dashboard control mode: read-only; runtime mutations are disabled",
    `- Project DSL: ${pathFor(configPath)}`,
    `- Runtime root: ${pathFor(runtimeRoot)}`,
    `- Current Twin: ${pathFor(join(runtimeRoot,"current/twin.json"))}${activeAvailable?"":" (not available)"}`,
    ...(activeTwinStateAvailable?[`- Current TwinState: ${pathFor(join(runtimeRoot,"current/twin-state.json"))}`]:[]),
    `- Current scene JSON: ${pathFor(join(runtimeRoot,"current/scene.json"))}${activeAvailable?"":" (not available)"}`,
    `- Current OpenUSD: ${pathFor(join(runtimeRoot,"current/scene.usda"))}${activeAvailable?"":" (not available)"}`,
    `- Rendered ACTIVE artifact scope: ${pathFor(join(runtimeRoot,"current"))}`,
    `- Latest diagnostic scope: ${pathFor(latestArtifactRoot)}`,
    `- Last iteration artifact scope: ${pathFor(latestArtifactRoot)}${iterationPublished?" (published)":" (rejected candidate; current remains last-known-good)"}`,
    `- API state: http://127.0.0.1:${dashboardPort}/api/state`,
    `- API event log: http://127.0.0.1:${dashboardPort}/api/events`,
    `- API DSL log: http://127.0.0.1:${dashboardPort}/api/dsl`,
    `- Component inspection URL pattern: http://127.0.0.1:${dashboardPort}/?focus=<componentId>`,
    "",
    "```bash",
    `DT_DASHBOARD_HOST=0.0.0.0 DT_DASHBOARD_PORT=${dashboardPort} DT_DASHBOARD_READ_ONLY=1 node ${dashboardCli} dashboard ${pathFor(configPath)} ${pathFor(runtimeRoot)} ${dashboardPort} ${mode}`,
    "```",
    "",
    "A writer must run through the project container, which carries the declared CAD backends and the single-writer lease:",
    "",
    "```bash",
    "bash scripts/iterate.sh",
    "```",
    "",
    "## DSL and validation",
    "",
    `- intentDSL index: ${pathFor(join(latestArtifactRoot,"intent-dsl.index.json"))}`,
    ...(validation?.intentDsl?[`- intentDSL packs: ${validation.intentDsl.packs}; records: ${validation.intentDsl.records}; invalid: ${validation.intentDsl.invalid}`]:[]),
    `- Physical evidence report: ${pathFor(join(latestArtifactRoot,"physical-evidence.report.json"))}`,
    `- Geometry build diagnostics: ${pathFor(join(latestArtifactRoot,"geometry-builds.dsl"))}`,
    ...(geometryBuildStatus?[`- Geometry build status: ${geometryBuildStatus}`]:[]),
    `- Geometry validation: ${pathFor(join(latestArtifactRoot,"geometry-validation.dsl"))}`,
    ...(geometryChecks?[`- Geometry required checks: ${geometryChecks}`]:[]),
    `- Project integrity: ${pathFor(join(latestArtifactRoot,"project-integrity.dsl"))}`,
    ...(validation?.projectIntegrity?[`- Project integrity status: ${validation.projectIntegrity.ok?"PASS":"FAIL"} / ${validation.projectIntegrity.complete?"COMPLETE":"INCOMPLETE"}`]:[]),
    `- Evidence sets: ${pathFor(join(latestArtifactRoot,"evidence-sets.dsl"))}`,
    `- Archive project analysis: ${pathFor(join(latestArtifactRoot,"archive-project-analysis.dsl"))}`,
    ...(validation?.archive?[`- Archive materializable geometry: ${validation.archive.materializableGeometry} candidate(s); unsupported native CAD: ${validation.archive.unsupportedCad}`]:[]),
    `- Validation: ${validationText}`,
    "",
    "## Logs and feedback",
    "",
    `- Last persisted iteration receipt: ${pathFor(join(runtimeRoot,"latest.json"))}`,
    `- Event log: ${pathFor(join(runtimeRoot,"events.jsonl"))}`,
    `- Failure log: ${pathFor(join(runtimeRoot,"dead-letter.jsonl"))}`,
    `- Dashboard server log: ${pathFor(resolve(projectRoot,"logs",`dashboard-${dashboardPort}.log`))}`,
    `- Runtime observations: ${pathFor(join(latestArtifactRoot,"observations.json"))}`,
    ...(latestTwinState?[`- Live bindings: ${pathFor(resolve(projectRoot,project.observations.liveBindingFile!))}`,`- Latest diagnostic TwinState: ${pathFor(join(latestArtifactRoot,"twin-state.json"))}`,`- TwinState freshness: ${latestTwinState.coverage.fresh} fresh; ${latestTwinState.coverage.stale} stale; ${latestTwinState.coverage.expired} expired; ${latestTwinState.coverage.unknown} unknown`]:[]),
    ...(latestAssemblyReport?[`- Assembly contract: ${pathFor(resolve(projectRoot,project.scene.assemblyFile!))}`,`- Latest diagnostic assembly report: ${pathFor(join(latestArtifactRoot,"assembly-report.dsl"))}`,`- Assembly completeness: ${latestAssemblyReport.coverage.completeAssemblies}/${latestAssemblyReport.coverage.assemblies}; required parts ${latestAssemblyReport.coverage.completeRequiredParts}/${latestAssemblyReport.coverage.requiredParts}`]:[]),
    `- Feedback: ${pathFor(feedbackPath)}`,
    `- Generation audit: ${pathFor(join(latestArtifactRoot,"generation-audit.json"))}`,
    "",
    "## Presentation assets",
    "",
    `- Presentation evidence status: ${presentationEvidence?.status.toUpperCase()??"NOT EVALUATED"}`,
    ...(presentationEvidence?[`- Presentation evidence report: ${pathFor(join(runtimeRoot,"current/presentation-evidence.dsl"))}`,`- Revision manifest: ${pathFor(join(runtimeRoot,"current",presentationEvidence.manifestPath))}${presentationEvidence.status==="current"?" (verified)":" (missing, stale or invalid; captures below are not current-revision evidence)"}`]:[]),
    ...(presentationEvidence?.captures.map(capture=>`- ${presentationEvidence.status==="current"?"Verified":"Historical/unverified"} ${capture.mediaType}: ${pathFor(join(runtimeRoot,"current/presentation",capture.path))} (sha256:${capture.sha256})`)??[]),
    ...(presentationEvidence?.problems.map(problem=>`- Presentation problem: ${problem}`)??[]),
    "",
    `Previous iteration: ${receipt.previousIterationUri??"none"}`,
    `Last completed iteration URI: ${receipt.iterationUri}`,
    "",
  ].join("\n");
}
