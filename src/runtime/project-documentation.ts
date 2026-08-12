import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  AnalysisTraceDocument,
  AssemblyPartStatus,
  AssemblyReport,
  LivingIterationReceipt,
  LivingProjectDocument,
  MqttBindingDocument,
  ProcessAnimationDocument,
  ProcessDocument,
  ProjectDocumentationDocument,
  ProjectDocumentationManifest,
  ProjectIntegrityReport,
  ResourceRecord,
  SceneDocument,
  SourceCoverageDocument,
  TwinDocument,
  TwinStateDocument,
} from "../core/types.js";
import { canonicalJson, contentUri, sha256 } from "../core/canonical.js";
import { parseMqttBindingDsl } from "../dsl/mqtt-binding.js";
import { validateProcessDocument } from "../dsl/process.js";
import { validateScene } from "../dsl/scene.js";
import { validateTwin } from "../dsl/twin.js";
import { validateAnalysisTrace } from "./analysis-trace.js";
import { validateProcessAnimation } from "./process-animation.js";

const EXPLANATION_BOUNDARY = "This document reports explicit accepted artifacts, deterministic projections, evidence locators and known gaps. It does not contain hidden model chain-of-thought.";
const FILES = {
  json: "project-documentation.json",
  markdown: "project-documentation.md",
  html: "project-documentation.html",
  pdf: "project-documentation.pdf",
  manifest: "project-documentation.manifest.json",
} as const;

interface SourceCoverageIndex {
  schema: "bioxfoundry.source-coverage-index/v1";
  reports: SourceCoverageDocument[];
  invalid: unknown[];
}

export interface ProjectDocumentationArtifacts {
  document: ProjectDocumentationDocument;
  manifest: ProjectDocumentationManifest;
  files: {
    json: string;
    markdown: string;
    html: string;
    pdf: Buffer;
    manifest: string;
  };
}

export interface GenerateProjectDocumentationOptions {
  runtimeDir: string;
  configPath?: string;
  outputDir?: string;
}

async function json<T>(path: string): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`PROJECT_DOCUMENTATION_NOT_AVAILABLE:${path}`);
    throw error;
  }
}

async function optionalJson<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function text(value: unknown, fallback = "unspecified"): string { return typeof value === "string" && value ? value : fallback; }

function flattenComponents(items: TwinDocument["components"], parentId: string | null = null): Array<{ component: TwinDocument["components"][number]; parentId: string | null }> {
  return items.flatMap(component => [{ component, parentId }, ...flattenComponents(component.children, component.id)]);
}

function counts<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) result[key(item)] = (result[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

async function acceptedReceipt(runtimeDir: string, analysisTraceUri: string): Promise<LivingIterationReceipt | undefined> {
  const latest = await optionalJson<LivingIterationReceipt>(join(runtimeDir, "latest.json"));
  if (latest?.validation.ok && latest.analysisTraceUri === analysisTraceUri) return latest;
  let names: string[] = [];
  try { names = await readdir(join(runtimeDir, "receipts")); } catch { return undefined; }
  for (const name of names.sort().reverse()) {
    if (!name.endsWith(".json")) continue;
    const receipt = await optionalJson<LivingIterationReceipt>(join(runtimeDir, "receipts", name));
    if (receipt?.validation.ok && receipt.analysisTraceUri === analysisTraceUri) return receipt;
  }
  return undefined;
}

async function mqttContract(project: LivingProjectDocument, configPath: string | undefined, processes: ProcessDocument | undefined): Promise<{ document?: MqttBindingDocument; sha256?: string; revisionBound: boolean }> {
  if (!project.observations.mqttBindingFile || !configPath) return { revisionBound: false };
  const path = resolve(dirname(resolve(configPath)), project.observations.mqttBindingFile);
  let source: string;
  try { source = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { revisionBound: false };
    throw error;
  }
  const document = parseMqttBindingDsl(source);
  const processIds = new Set(processes?.processes.map(process => process.id) ?? []);
  return {
    document,
    sha256: sha256(source),
    revisionBound: document.processRoutes.every(route => processIds.has(route.processId)),
  };
}

function validateActiveArtifacts(input: {
  project: LivingProjectDocument;
  twin: TwinDocument;
  scene: SceneDocument;
  trace: AnalysisTraceDocument;
  processes?: ProcessDocument;
}): void {
  if (input.project.schema !== "subactor.living-project/v1" || input.twin.schema !== "subactor.twin/v1" ||
      input.scene.schema !== "subactor.scene/v1" || input.trace.schema !== "subactor.analysis-trace/v1") {
    throw new Error("PROJECT_DOCUMENTATION_INVALID:artifact-schema");
  }
  try {
    validateTwin(input.twin);
    validateScene(input.scene);
    validateAnalysisTrace(input.trace);
    if (input.processes) validateProcessDocument(input.processes, flattenComponents(input.twin.components).map(item => item.component.id));
  } catch (error) {
    throw new Error(`PROJECT_DOCUMENTATION_INVALID:${error instanceof Error ? error.message : String(error)}`);
  }
  const twinUri = contentUri("twin", input.twin);
  const sceneUri = contentUri("scene", input.scene);
  if (input.trace.projectId !== input.project.id || input.trace.outputs.twinUri !== twinUri ||
      input.trace.outputs.sceneUri !== sceneUri || input.scene.sourceTwinId !== input.twin.id ||
      input.twin.sourceSnapshotHash !== input.trace.inputs.researchSnapshotHash ||
      (input.processes && input.processes.sourceSnapshotHash !== input.twin.sourceSnapshotHash)) {
    throw new Error("PROJECT_DOCUMENTATION_REVISION_MISMATCH");
  }
}

async function buildDocument(options: GenerateProjectDocumentationOptions): Promise<ProjectDocumentationDocument> {
  const runtimeDir = resolve(options.runtimeDir);
  const current = join(runtimeDir, "current");
  const [project, resources, twin, scene, trace, assemblies, processes, animations, twinState, integrity, geometry, coverage] = await Promise.all([
    json<LivingProjectDocument>(join(current, "project.json")),
    json<ResourceRecord[]>(join(current, "resources.json")),
    json<TwinDocument>(join(current, "twin.json")),
    json<SceneDocument>(join(current, "scene.json")),
    json<AnalysisTraceDocument>(join(current, "analysis-trace.json")),
    optionalJson<AssemblyReport>(join(current, "assembly-report.json")),
    optionalJson<ProcessDocument>(join(current, "process.json")),
    optionalJson<ProcessAnimationDocument>(join(current, "process-animation.json")),
    optionalJson<TwinStateDocument>(join(current, "twin-state.json")),
    json<ProjectIntegrityReport>(join(current, "project-integrity.json")),
    json<Record<string, unknown>>(join(current, "geometry-validation.json")),
    optionalJson<SourceCoverageIndex>(join(current, "source-coverage-index.json")),
  ]);
  validateActiveArtifacts({ project, twin, scene, trace, processes });
  if (animations) {
    try { validateProcessAnimation(animations, processes, scene); }
    catch (error) { throw new Error(`PROJECT_DOCUMENTATION_INVALID:${error instanceof Error ? error.message : String(error)}`); }
  }
  if (!Array.isArray(resources) || integrity.schema !== "subactor.project-integrity/v1") throw new Error("PROJECT_DOCUMENTATION_INVALID:artifact-shape");

  const analysisTraceUri = contentUri("analysis-trace", trace);
  const receipt = await acceptedReceipt(runtimeDir, analysisTraceUri);
  const mqtt = await mqttContract(project, options.configPath, processes);
  const bindings = new Map(scene.bindings.filter(binding => binding.componentId).map(binding => [binding.componentId!, binding]));
  const flattened = flattenComponents(twin.components);
  const geometryCoverage = object(geometry.coverage);
  const coverageReports = coverage?.reports ?? [];
  const coverageByState: Record<string, number> = {};
  for (const report of coverageReports) for (const [state, count] of Object.entries(report.summary.byState)) coverageByState[state] = (coverageByState[state] ?? 0) + count;
  const processCitationIds = new Set(trace.citations.map(citation => citation.id));

  return {
    schema: "subactor.project-documentation/v1",
    project: { id: project.id, name: project.name, profile: project.profile, managerIntent: project.managerIntent },
    generatedAt: receipt?.completedAt ?? trace.generatedAt,
    generationMethod: "deterministic-from-accepted-artifacts",
    explanationBoundary: EXPLANATION_BOUNDARY,
    activeRevision: {
      iterationUri: receipt?.iterationUri ?? null,
      twinUri: trace.outputs.twinUri,
      sceneUri: trace.outputs.sceneUri,
      analysisTraceUri,
      sourceSnapshotHash: twin.sourceSnapshotHash,
      runtimeGeneration: trace.generator.runtimeGeneration,
      acceptedAt: receipt?.completedAt ?? trace.generatedAt,
    },
    summary: {
      resources: resources.length,
      resourceBytes: resources.reduce((sum, resource) => sum + resource.size, 0),
      components: flattened.length,
      sceneBindings: scene.bindings.length,
      meshBindings: scene.bindings.filter(binding => Boolean(binding.assetUri)).length,
      primitiveFallbacks: scene.bindings.filter(binding => !binding.assetUri && binding.primitive && binding.primitive !== "scope").length,
      assemblies: assemblies?.coverage.assemblies ?? 0,
      completeAssemblies: assemblies?.coverage.completeAssemblies ?? 0,
      processes: processes?.coverage.processes ?? 0,
      completeProcesses: processes?.coverage.complete ?? 0,
      processSteps: processes?.coverage.steps ?? 0,
      evidencedProcessSteps: processes?.coverage.evidencedSteps ?? 0,
      geometryRequiredChecks: number(geometryCoverage.requiredChecks),
      geometryPassedRequiredChecks: number(geometryCoverage.passedRequiredChecks),
      integrityOk: integrity.ok,
      integrityComplete: integrity.complete,
    },
    inputs: {
      sources: project.sources.map(source => ({ role: source.role, logicalRoot: source.logicalRoot, labels: [...(source.labels ?? [])] })),
      resourcesByRole: counts(resources, resource => resource.sourceRole ?? "project"),
      resourcesByMediaType: counts(resources, resource => resource.mediaType),
      intentDsl: {
        semanticHash: trace.inputs.intentDslSemanticHash,
        packs: trace.inputs.intentDslPacks,
        records: trace.inputs.intentDslRecords,
        invalid: trace.inputs.invalidIntentPacks,
      },
      sourceCoverage: {
        reports: coverageReports.length,
        invalidReports: coverage?.invalid.length ?? 0,
        discovered: coverageReports.reduce((sum, report) => sum + report.summary.discovered, 0),
        terminal: coverageReports.reduce((sum, report) => sum + report.summary.terminal, 0),
        byState: Object.fromEntries(Object.entries(coverageByState).sort(([a], [b]) => a.localeCompare(b))),
      },
    },
    components: flattened.map(({ component, parentId }) => {
      const binding = bindings.get(component.id);
      return {
        id: component.id,
        label: text(component.properties.label, component.id),
        type: component.type,
        parentId,
        scenePath: binding?.scenePath ?? null,
        representation: binding?.assetUri ?? binding?.primitive ?? "unbound",
        geometryEvidence: text(component.properties.geometryEvidence, binding?.assetUri ? "grounded-asset" : "unspecified"),
        semanticEvidence: text(component.properties.semanticEvidence),
        sourceCount: component.sourceUris.length,
        ...(binding?.position ? { position: binding.position } : {}),
        ...(binding?.size ? { size: binding.size } : {}),
      };
    }),
    assemblies: (assemblies?.assemblies ?? []).map(assembly => ({
      id: assembly.id,
      kind: assembly.kind,
      rootComponentId: assembly.rootComponentId,
      complete: assembly.complete,
      parts: (assembly.parts as AssemblyPartStatus[]).map(part => ({
        id: part.id,
        componentId: part.componentId,
        required: part.required,
        complete: part.complete,
        assetUri: part.actualAssetUri ?? part.assetUri ?? null,
        scenePath: part.actualScenePath ?? part.scenePath ?? null,
        findingCodes: [...part.findingCodes],
      })),
    })),
    processes: (processes?.processes ?? []).map(process => ({
      id: process.id,
      label: process.label,
      kind: process.kind,
      completeness: process.completeness,
      ordering: process.ordering,
      cyclic: process.cyclic,
      componentIds: [...process.componentIds],
      gaps: [...process.gaps],
      steps: process.steps.map(step => ({
        id: step.id,
        label: step.label,
        phase: step.phase,
        componentIds: [...step.componentIds],
        interactions: step.interactions.map(interaction => [interaction.kind, interaction.fromComponentId, interaction.toComponentId, interaction.property, interaction.state].filter(Boolean).join(":")),
        parameters: step.parameters.map(parameter => `${parameter.name}=${String(parameter.value)}${parameter.unit ? ` ${parameter.unit}` : ""}`),
        success: step.transitions.success ?? null,
        failure: step.transitions.failure ?? null,
        citationIds: [...new Set(step.evidence.map(evidence => `intent-${evidence.intentId}`).filter(id => processCitationIds.has(id)))],
        gaps: [...step.gaps],
      })),
    })),
    animations: (animations?.animations ?? []).map(animation => ({
      processId: animation.processId,
      available: animation.available,
      unavailableReason: animation.unavailableReason ?? null,
      timingMode: "normalized-presentation",
      factualProcessDuration: false,
      clips: animation.clips.map(clip => ({
        stepId: clip.stepId,
        startMs: clip.startMs,
        endMs: clip.endMs,
        effects: clip.effects.map(effect => [effect.kind, effect.componentId ?? `${effect.fromComponentId ?? "?"}->${effect.toComponentId ?? "?"}`, effect.state].filter(Boolean).join(":")),
      })),
    })),
    mqtt: {
      configured: Boolean(mqtt.document),
      revisionBound: mqtt.revisionBound,
      bindingSha256: mqtt.sha256 ?? null,
      authority: mqtt.document?.authority ?? null,
      defaultMode: mqtt.document?.defaultMode ?? null,
      brokers: mqtt.document?.brokers.map(broker => ({ ...broker })) ?? [],
      routes: mqtt.document?.processRoutes.map(route => ({ ...route, modes: [...route.modes] })) ?? [],
    },
    liveState: {
      available: Boolean(twinState),
      evaluatedAt: twinState?.evaluatedAt ?? null,
      coverage: twinState ? { ...twinState.coverage } : {},
      components: (twinState?.components ?? []).map(component => ({
        componentId: component.componentId,
        properties: component.properties.map(property => ({
          property: property.property,
          value: property.value === undefined ? "unavailable" : typeof property.value === "object" ? canonicalJson(property.value) : String(property.value),
          unit: property.unit ?? null,
          state: property.state,
          quality: property.quality,
          observedAt: property.observedAt ?? null,
        })),
      })),
    },
    validation: {
      geometry: {
        ok: geometry.ok === true,
        complete: geometry.complete === true,
        requiredChecks: number(geometryCoverage.requiredChecks),
        passedRequiredChecks: number(geometryCoverage.passedRequiredChecks),
        failures: Array.isArray(geometry.failures) ? geometry.failures.map(failure => typeof failure === "string" ? failure : canonicalJson(failure)) : [],
      },
      integrity: { ok: integrity.ok, complete: integrity.complete, coverage: { ...integrity.coverage }, findings: structuredClone(integrity.findings) },
    },
    decisions: structuredClone(trace.decisions),
    citations: structuredClone(trace.citations),
  };
}

function md(value: unknown): string { return String(value ?? "").replaceAll("|", "\\|").replace(/\r?\n/g, " ").trim(); }
function code(value: unknown): string { return `\`${String(value ?? "").replaceAll("`", "'")}\``; }
function list(value: string[]): string { return value.length ? value.map(item => `- ${md(item)}`).join("\n") : "- None."; }
function table(headers: string[], rows: string[][], empty = "No records are available for this accepted revision."): string {
  if (!rows.length) return empty;
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${row.map(md).join(" | ")} |`)].join("\n");
}
const HUMAN_SECTIONS = [
  ["executive-summary", "Executive summary"],
  ["validation-and-open-gaps", "Validation and open gaps"],
  ["twin-architecture-and-3d-representation", "Twin architecture and 3D representation"],
  ["assemblies", "Assemblies"],
  ["processes-and-animations", "Processes and animations"],
  ["mqtt-and-real-virtual-process-binding", "MQTT and real/virtual process binding"],
  ["live-twin-state", "Live Twin state"],
  ["entrusted-and-processed-data", "Entrusted and processed data"],
  ["deterministic-decisions", "Deterministic decisions"],
  ["citations", "Citations"],
  ["accepted-revision-and-reproducibility", "Accepted revision and reproducibility"],
] as const;

function citationMarkdown(citation: ProjectDocumentationDocument["citations"][number]): string {
  const suffix = `${citation.revisionHash ? `; revision ${code(citation.revisionHash)}` : ""}${citation.page ? `; page ${citation.page}` : ""}`;
  if (/^https?:\/\//i.test(citation.href)) return `[Open cited source](${citation.href})${suffix}.`;
  const artifact = citation.artifactUri ? `Source artifact ${code(citation.artifactUri)}` : "Source artifact not recorded";
  return `${artifact}; dashboard locator ${code(citation.href)}${suffix}.`;
}

export function renderProjectDocumentationMarkdown(document: ProjectDocumentationDocument): string {
  const s = document.summary;
  const sections: string[] = [
    "---",
    `schema: ${document.schema}`,
    `projectId: ${JSON.stringify(document.project.id)}`,
    `generatedAt: ${JSON.stringify(document.generatedAt)}`,
    `twinRevision: ${JSON.stringify(document.activeRevision.twinUri)}`,
    "---",
    "",
    `# Digital Twin project — ${md(document.project.name)}`,
    "",
    `> ${md(document.explanationBoundary)}`,
    "",
    "## Contents",
    "",
    ...HUMAN_SECTIONS.map(([, title]) => `- [${title}](#${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")})`),
    "",
    "## Executive summary",
    "",
    md(document.project.managerIntent),
    "",
    table(["Metric", "Accepted value"], [
      ["Profile", document.project.profile], ["Resources", String(s.resources)], ["Components", String(s.components)],
      ["Scene bindings", String(s.sceneBindings)], ["Grounded mesh bindings", String(s.meshBindings)], ["Primitive fallbacks", String(s.primitiveFallbacks)],
      ["Complete assemblies", `${s.completeAssemblies}/${s.assemblies}`], ["Complete processes", `${s.completeProcesses}/${s.processes}`],
      ["Evidenced process steps", `${s.evidencedProcessSteps}/${s.processSteps}`], ["Geometry checks", `${s.geometryPassedRequiredChecks}/${s.geometryRequiredChecks}`],
      ["Cross-layer integrity", `${s.integrityOk ? "PASS" : "FAIL"}; ${s.integrityComplete ? "complete" : "incomplete"}`],
    ]),
    "",
    `> **Report status:** geometry ${document.validation.geometry.complete ? "complete" : "incomplete"}; cross-layer evidence ${document.validation.integrity.complete ? "complete" : "incomplete"}. A successful export does not turn missing evidence into a pass.`,
    "",
    "## Validation and open gaps",
    "",
    `Geometry validation: **${document.validation.geometry.ok ? "PASS" : "FAIL"}**, ${document.validation.geometry.complete ? "complete" : "incomplete"}; ${document.validation.geometry.passedRequiredChecks}/${document.validation.geometry.requiredChecks} required checks passed.`,
    "",
    `Cross-layer integrity: **${document.validation.integrity.ok ? "PASS" : "FAIL"}**, ${document.validation.integrity.complete ? "complete" : "incomplete"}.`,
    "",
    table(["Severity", "Layer", "Code", "Finding", "Repair process"], document.validation.integrity.findings.map(finding => [finding.severity, finding.layer, finding.code, finding.message, finding.repairProcess]), "No validation findings were recorded."),
    "",
    "## Twin architecture and 3D representation",
    "",
    table(["Component", "Label", "Type", "Parent", "Scene path", "Representation", "Geometry evidence", "Sources"], document.components.map(component => [code(component.id), component.label, component.type, component.parentId ?? "—", component.scenePath ?? "—", component.representation, component.geometryEvidence, String(component.sourceCount)])),
    "",
    "A primitive fallback preserves a sourced semantic identity but is not an as-built model. A mesh URI proves only the ingested asset and evidence grade recorded for that component.",
    "",
    "## Assemblies",
    "",
  ];
  if (!document.assemblies.length) sections.push("No AssemblyDSL report is available for this profile.", "");
  for (const assembly of document.assemblies) sections.push(
    `### ${code(assembly.id)}`,
    "",
    `${assembly.kind}; root ${code(assembly.rootComponentId)}; ${assembly.complete ? "complete" : "incomplete"}.`,
    "",
    table(["Part", "Component", "Required", "Complete", "Asset", "Scene path", "Findings"], assembly.parts.map(part => [part.id, part.componentId, String(part.required), String(part.complete), part.assetUri ?? "—", part.scenePath ?? "—", part.findingCodes.join(", ") || "—"])),
    "",
  );
  sections.push("## Processes and animations", "", "Animation timing is normalized for presentation. It does not claim the factual duration of a laboratory operation.", "");
  if (!document.processes.length) sections.push("No ProcessDSL model is available for this profile.", "");
  const animations = new Map(document.animations.map(animation => [animation.processId, animation]));
  for (const process of document.processes) {
    const animation = animations.get(process.id);
    sections.push(
      `### ${md(process.label)}`,
      "",
      `ID ${code(process.id)}; kind ${code(process.kind)}; completeness **${md(process.completeness)}**; ordering ${code(process.ordering)}; cyclic ${code(process.cyclic)}; animation ${animation?.available ? "available" : "unavailable"}.`,
      "",
      process.gaps.length ? `Known process gaps:\n\n${list(process.gaps)}` : "Known process gaps: none recorded.",
      "",
      table(["Step", "Phase", "Actors", "Interactions", "Parameters", "Success", "Failure", "Evidence"], process.steps.map(step => [step.label, step.phase, step.componentIds.join(", "), step.interactions.join("; ") || "—", step.parameters.join("; ") || "—", step.success ?? "—", step.failure ?? "—", step.citationIds.join(", ") || "—"])),
      "",
    );
  }
  sections.push(
    "## MQTT and real/virtual process binding",
    "",
    document.mqtt.configured
      ? `MQTT is configured with authority **${document.mqtt.authority}**, default source mode ${code(document.mqtt.defaultMode)}, and contract hash ${code(document.mqtt.bindingSha256)}. Route identities match the active ProcessDSL: **${document.mqtt.revisionBound}**. This contract observes process events; it does not grant actuator command authority.`
      : "No MQTT binding contract was available from the supplied project configuration. This is reported as not configured, not as passed.",
    "",
    table(["Route", "Broker", "Topic", "QoS", "Process", "URI Process", "Modes"], document.mqtt.routes.map(route => [route.id, route.brokerId, code(route.topic), String(route.qos), route.processId, code(route.processUri), route.modes.join(", ")]), "No MQTT process routes are configured."),
    "",
    "## Live Twin state",
    "",
    document.liveState.available ? `State evaluated at ${code(document.liveState.evaluatedAt)}.` : "No TwinState artifact is available.",
    "",
    table(["Component", "Property", "Value", "Unit", "State", "Quality", "Observed at"], document.liveState.components.flatMap(component => component.properties.map(property => [component.componentId, property.property, property.value, property.unit ?? "—", property.state, property.quality, property.observedAt ?? "—"])), "No live properties are available for this accepted revision."),
    "",
    "## Entrusted and processed data",
    "",
    "Only logical roots and provenance classifications are included here; host filesystem paths and credentials are not exported.",
    "",
    `IntentDSL: ${document.inputs.intentDsl.packs} packs, ${document.inputs.intentDsl.records} records, ${document.inputs.intentDsl.invalid} invalid; semantic hash ${code(document.inputs.intentDsl.semanticHash)}.`,
    "",
    `Source coverage: ${document.inputs.sourceCoverage.terminal}/${document.inputs.sourceCoverage.discovered} terminal across ${document.inputs.sourceCoverage.reports} report(s); ${document.inputs.sourceCoverage.invalidReports} invalid report(s).`,
    "",
    table(["Resource role", "Count"], Object.entries(document.inputs.resourcesByRole).map(([role, count]) => [role, String(count)])),
    "",
    table(["Media type", "Count"], Object.entries(document.inputs.resourcesByMediaType).map(([mediaType, count]) => [code(mediaType), String(count)])),
    "",
    "### Source roots",
    "",
    table(["Role", "Logical root", "Labels"], document.inputs.sources.map(source => [source.role, code(source.logicalRoot), source.labels.join(", ") || "—"])),
    "",
    "## Deterministic decisions",
    "",
  );
  for (const decision of document.decisions) sections.push(
    `### ${code(decision.subject)} — ${md(decision.ruleId)}`,
    "",
    `**Outcome:** ${md(decision.outcome)}`,
    "",
    `**Basis (${decision.confidence} confidence):** ${md(decision.basis)}`,
    "",
    `Citations: ${decision.citationIds.length ? decision.citationIds.map(id => code(id)).join(", ") : "none"}.`,
    "",
    decision.gaps.length ? `Gaps:\n\n${list(decision.gaps)}` : "Gaps: none recorded.",
    "",
  );
  sections.push("## Citations", "");
  for (const citation of document.citations) sections.push(
    `### ${code(citation.id)} — ${md(citation.title)}`,
    "",
    citationMarkdown(citation),
    "",
    ...(citation.excerpt ? [`> ${md(citation.excerpt)}`, ""] : []),
  );
  sections.push(
    "## Accepted revision and reproducibility",
    "",
    table(["Field", "Value"], Object.entries(document.activeRevision).map(([key, value]) => [key, value ?? "not recorded"])),
    "",
    `Generated by runtime generation ${code(document.activeRevision.runtimeGeneration)} from the accepted Twin, Scene, analysis trace and supporting runtime artifacts. The companion manifest hashes the JSON, Markdown, HTML and PDF byte streams. Regenerating against the same accepted artifacts produces the same documentation bytes.`,
    "",
  );
  return `${sections.join("\n").trimEnd()}\n`;
}

function html(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function htmlTable(headers: string[], rows: Array<Array<unknown>>, empty = "No records are available for this accepted revision."): string {
  if (!rows.length) return `<p class="empty">${html(empty)}</p>`;
  return `<div class="table"><table><thead><tr>${headers.map(header => `<th>${html(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${html(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function htmlList(items: string[]): string { return items.length ? `<ul>${items.map(item => `<li>${html(item)}</li>`).join("")}</ul>` : "<p>None recorded.</p>"; }
function citationHtml(citation: ProjectDocumentationDocument["citations"][number]): string {
  if (/^https?:\/\//i.test(citation.href)) return `<a href="${html(citation.href)}" rel="noreferrer">Open cited source</a>`;
  const artifact = citation.artifactUri ? `<code>${html(citation.artifactUri)}</code>` : "not recorded";
  return `Source artifact ${artifact}<br><span class="muted">Dashboard locator: <code>${html(citation.href)}</code></span>`;
}

export function renderProjectDocumentationHtml(document: ProjectDocumentationDocument): string {
  const s = document.summary;
  const processSections = document.processes.map(process => `<article><h3>${html(process.label)}</h3><p><code>${html(process.id)}</code> · ${html(process.kind)} · <strong>${html(process.completeness)}</strong> · ordering <code>${html(process.ordering)}</code></p>${process.gaps.length ? `<h4>Known gaps</h4>${htmlList(process.gaps)}` : "<p>Known process gaps: none recorded.</p>"}${htmlTable(["Step", "Phase", "Actors", "Interactions", "Parameters", "Success", "Failure", "Evidence"], process.steps.map(step => [step.label, step.phase, step.componentIds.join(", "), step.interactions.join("; ") || "—", step.parameters.join("; ") || "—", step.success ?? "—", step.failure ?? "—", step.citationIds.join(", ") || "—"]))}</article>`).join("\n");
  const assemblySections = document.assemblies.map(assembly => `<article><h3><code>${html(assembly.id)}</code></h3><p>${html(assembly.kind)} · root <code>${html(assembly.rootComponentId)}</code> · <strong>${assembly.complete ? "complete" : "incomplete"}</strong></p>${htmlTable(["Part", "Component", "Required", "Complete", "Asset", "Scene path", "Findings"], assembly.parts.map(part => [part.id, part.componentId, part.required, part.complete, part.assetUri ?? "—", part.scenePath ?? "—", part.findingCodes.join(", ") || "—"]))}</article>`).join("\n");
  const decisionSections = document.decisions.map(decision => `<article><h3><code>${html(decision.subject)}</code> — ${html(decision.ruleId)}</h3><p><strong>Outcome:</strong> ${html(decision.outcome)}</p><p><strong>Basis (${html(decision.confidence)} confidence):</strong> ${html(decision.basis)}</p><p><strong>Citations:</strong> ${html(decision.citationIds.join(", ") || "none")}</p>${decision.gaps.length ? `<h4>Gaps</h4>${htmlList(decision.gaps)}` : ""}</article>`).join("\n");
  const citations = document.citations.map(citation => `<article><h3><code>${html(citation.id)}</code> — ${html(citation.title)}</h3><p>${citationHtml(citation)}${citation.revisionHash ? ` · revision <code>${html(citation.revisionHash)}</code>` : ""}${citation.page ? ` · page ${citation.page}` : ""}</p>${citation.excerpt ? `<blockquote>${html(citation.excerpt)}</blockquote>` : ""}</article>`).join("\n");
  const toc = HUMAN_SECTIONS.map(([id, title]) => `<li><a href="#${id}">${html(title)}</a></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(document.project.name)} — Digital Twin project documentation</title>
<style>
:root{color-scheme:light;--ink:#17202a;--muted:#5d6d7e;--line:#d5d8dc;--accent:#2457a6;--soft:#f4f7fb}*{box-sizing:border-box}html{scroll-behavior:smooth}body{max-width:1180px;margin:0 auto;padding:42px 28px;color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}h1{font-size:2rem;line-height:1.2}h2{margin-top:2.2rem;border-bottom:2px solid var(--accent);padding-bottom:.3rem}h3{margin-top:1.5rem}code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.lead,.report-status{padding:14px 18px;border-left:4px solid var(--accent);background:var(--soft)}.report-status{border-color:#b9770e}.muted,.empty{color:var(--muted)}nav{columns:2;padding:14px 20px;background:var(--soft);border:1px solid var(--line)}nav li{break-inside:avoid;margin:.25rem 0}.table{overflow-x:auto;margin:1rem 0}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef2f7}blockquote{margin:1rem 0;padding:10px 16px;border-left:3px solid #99a3a4;background:#f8f9f9;color:#34495e}article{break-inside:avoid;border-bottom:1px solid var(--line)}.status{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.status div{border:1px solid var(--line);padding:10px}.status strong{display:block;font-size:1.35rem}@media(max-width:700px){body{padding:24px 14px}nav{columns:1}}@media print{body{max-width:none;padding:10mm}nav{columns:2}a{color:inherit}.table{overflow:visible}h2{break-after:avoid}thead{display:table-header-group}}
</style>
</head>
<body>
<header>
<h1>Digital Twin project — ${html(document.project.name)}</h1>
<p class="lead">${html(document.explanationBoundary)}</p>
<p>${html(document.project.managerIntent)}</p>
</header>
<nav aria-label="Document contents"><strong>Contents</strong><ol>${toc}</ol></nav>
<main>
<section id="executive-summary">
<h2>Executive summary</h2>
<div class="status"><div><strong>${s.resources}</strong>resources</div><div><strong>${s.components}</strong>components</div><div><strong>${s.meshBindings}/${s.sceneBindings}</strong>mesh bindings</div><div><strong>${s.completeAssemblies}/${s.assemblies}</strong>complete assemblies</div><div><strong>${s.completeProcesses}/${s.processes}</strong>complete processes</div><div><strong>${s.geometryPassedRequiredChecks}/${s.geometryRequiredChecks}</strong>geometry checks</div></div>
<p class="report-status"><strong>Report status:</strong> geometry ${document.validation.geometry.complete ? "complete" : "incomplete"}; cross-layer evidence ${document.validation.integrity.complete ? "complete" : "incomplete"}. A successful export does not turn missing evidence into a pass.</p>
</section>
<section id="validation-and-open-gaps"><h2>Validation and open gaps</h2><p>Geometry: <strong>${document.validation.geometry.ok ? "PASS" : "FAIL"}</strong>, ${document.validation.geometry.complete ? "complete" : "incomplete"}; ${document.validation.geometry.passedRequiredChecks}/${document.validation.geometry.requiredChecks} checks. Integrity: <strong>${document.validation.integrity.ok ? "PASS" : "FAIL"}</strong>, ${document.validation.integrity.complete ? "complete" : "incomplete"}.</p>${htmlTable(["Severity", "Layer", "Code", "Finding", "Repair process"], document.validation.integrity.findings.map(finding => [finding.severity, finding.layer, finding.code, finding.message, finding.repairProcess]), "No validation findings were recorded.")}</section>
<section id="twin-architecture-and-3d-representation"><h2>Twin architecture and 3D representation</h2>${htmlTable(["Component", "Label", "Type", "Parent", "Scene path", "Representation", "Geometry evidence", "Sources"], document.components.map(component => [component.id, component.label, component.type, component.parentId ?? "—", component.scenePath ?? "—", component.representation, component.geometryEvidence, component.sourceCount]))}<p>A primitive fallback preserves sourced semantic identity but is not an as-built model.</p></section>
<section id="assemblies"><h2>Assemblies</h2>${assemblySections || "<p>No AssemblyDSL report is available for this profile.</p>"}</section>
<section id="processes-and-animations"><h2>Processes and animations</h2><p>Animation timing is normalized for presentation and does not claim factual laboratory duration.</p>${processSections || "<p>No ProcessDSL model is available for this profile.</p>"}</section>
<section id="mqtt-and-real-virtual-process-binding"><h2>MQTT and real/virtual process binding</h2><p>${document.mqtt.configured ? `Authority <strong>${html(document.mqtt.authority)}</strong>; default mode <code>${html(document.mqtt.defaultMode)}</code>; route identities match active ProcessDSL: <strong>${document.mqtt.revisionBound}</strong>. This contract does not grant actuator command authority.` : "No MQTT binding was available; this is not treated as a pass."}</p>${htmlTable(["Route", "Broker", "Topic", "QoS", "Process", "URI Process", "Modes"], document.mqtt.routes.map(route => [route.id, route.brokerId, route.topic, route.qos, route.processId, route.processUri, route.modes.join(", ")]), "No MQTT process routes are configured.")}</section>
<section id="live-twin-state"><h2>Live Twin state</h2><p>${document.liveState.available ? `Evaluated at ${html(document.liveState.evaluatedAt)}.` : "No TwinState artifact is available."}</p>${htmlTable(["Component", "Property", "Value", "Unit", "State", "Quality", "Observed at"], document.liveState.components.flatMap(component => component.properties.map(property => [component.componentId, property.property, property.value, property.unit ?? "—", property.state, property.quality, property.observedAt ?? "—"])), "No live properties are available for this accepted revision.")}</section>
<section id="entrusted-and-processed-data"><h2>Entrusted and processed data</h2><p>Only logical roots and provenance classifications are exported. Host filesystem paths and credentials are excluded.</p><p>IntentDSL: ${document.inputs.intentDsl.packs} packs, ${document.inputs.intentDsl.records} records, ${document.inputs.intentDsl.invalid} invalid. Source coverage: ${document.inputs.sourceCoverage.terminal}/${document.inputs.sourceCoverage.discovered} terminal across ${document.inputs.sourceCoverage.reports} report(s).</p>${htmlTable(["Resource role", "Count"], Object.entries(document.inputs.resourcesByRole))}${htmlTable(["Media type", "Count"], Object.entries(document.inputs.resourcesByMediaType))}<h3>Source roots</h3>${htmlTable(["Role", "Logical root", "Labels"], document.inputs.sources.map(source => [source.role, source.logicalRoot, source.labels.join(", ") || "—"]))}</section>
<section id="deterministic-decisions"><h2>Deterministic decisions</h2>${decisionSections || "<p>No decisions were recorded.</p>"}</section>
<section id="citations"><h2>Citations</h2>${citations || "<p>No citations were recorded.</p>"}</section>
<section id="accepted-revision-and-reproducibility"><h2>Accepted revision and reproducibility</h2>${htmlTable(["Field", "Value"], Object.entries(document.activeRevision))}<p>Generated at ${html(document.generatedAt)} by runtime generation <code>${html(document.activeRevision.runtimeGeneration)}</code>. The companion manifest hashes all export byte streams.</p></section>
</main>
</body>
</html>\n`;
}

type PdfBlockKind = "title" | "subtitle" | "heading" | "subheading" | "body" | "item";
interface PdfBlock { kind: PdfBlockKind; text: string; }
interface PdfFont {
  bytes: Buffer;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: [number, number, number, number];
  glyph(codePoint: number): number;
  width(glyphId: number): number;
}
interface PdfPlacedLine { text: string; x: number; y: number; size: number; color: [number, number, number]; }

const PDF_FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
  "C:\\Windows\\Fonts\\arial.ttf",
];

function fontTable(bytes: Buffer, tag: string): { offset: number; length: number } {
  const count = bytes.readUInt16BE(4);
  for (let index = 0; index < count; index++) {
    const cursor = 12 + index * 16;
    if (bytes.toString("ascii", cursor, cursor + 4) === tag) return { offset: bytes.readUInt32BE(cursor + 8), length: bytes.readUInt32BE(cursor + 12) };
  }
  throw new Error(`PROJECT_DOCUMENTATION_INVALID:pdf-font-table-${tag}`);
}

function parsePdfFont(bytes: Buffer): PdfFont {
  const head = fontTable(bytes, "head").offset;
  const hhea = fontTable(bytes, "hhea").offset;
  const maxp = fontTable(bytes, "maxp").offset;
  const hmtx = fontTable(bytes, "hmtx").offset;
  const cmap = fontTable(bytes, "cmap").offset;
  const unitsPerEm = bytes.readUInt16BE(head + 18);
  const numberOfHMetrics = bytes.readUInt16BE(hhea + 34);
  const numberOfGlyphs = bytes.readUInt16BE(maxp + 4);
  const advances: number[] = [];
  let lastAdvance = unitsPerEm;
  for (let glyphId = 0; glyphId < numberOfGlyphs; glyphId++) {
    if (glyphId < numberOfHMetrics) lastAdvance = bytes.readUInt16BE(hmtx + glyphId * 4);
    advances.push(lastAdvance);
  }
  const records = bytes.readUInt16BE(cmap + 2);
  const candidates: Array<{ offset: number; score: number }> = [];
  for (let index = 0; index < records; index++) {
    const cursor = cmap + 4 + index * 8;
    const platform = bytes.readUInt16BE(cursor);
    const encoding = bytes.readUInt16BE(cursor + 2);
    const offset = cmap + bytes.readUInt32BE(cursor + 4);
    const format = bytes.readUInt16BE(offset);
    if (format === 12) candidates.push({ offset, score: platform === 3 && encoding === 10 ? 40 : 30 });
    if (format === 4) candidates.push({ offset, score: platform === 3 && encoding === 1 ? 20 : 10 });
  }
  const selected = candidates.sort((a, b) => b.score - a.score)[0];
  if (!selected) throw new Error("PROJECT_DOCUMENTATION_INVALID:pdf-font-cmap");
  const cmapFormat = bytes.readUInt16BE(selected.offset);
  const glyph = cmapFormat === 12
    ? (codePoint: number): number => {
        const groups = bytes.readUInt32BE(selected.offset + 12);
        let low = 0;
        let high = groups - 1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          const cursor = selected.offset + 16 + middle * 12;
          const start = bytes.readUInt32BE(cursor);
          const end = bytes.readUInt32BE(cursor + 4);
          if (codePoint < start) high = middle - 1;
          else if (codePoint > end) low = middle + 1;
          else return bytes.readUInt32BE(cursor + 8) + codePoint - start;
        }
        return 0;
      }
    : (codePoint: number): number => {
        if (codePoint > 0xffff) return 0;
        const segCount = bytes.readUInt16BE(selected.offset + 6) / 2;
        const endCodes = selected.offset + 14;
        const startCodes = endCodes + segCount * 2 + 2;
        const deltas = startCodes + segCount * 2;
        const ranges = deltas + segCount * 2;
        for (let index = 0; index < segCount; index++) {
          const end = bytes.readUInt16BE(endCodes + index * 2);
          if (codePoint > end) continue;
          const start = bytes.readUInt16BE(startCodes + index * 2);
          if (codePoint < start) return 0;
          const delta = bytes.readInt16BE(deltas + index * 2);
          const range = bytes.readUInt16BE(ranges + index * 2);
          if (range === 0) return (codePoint + delta) & 0xffff;
          const location = ranges + index * 2 + range + (codePoint - start) * 2;
          if (location + 2 > bytes.length) return 0;
          const mapped = bytes.readUInt16BE(location);
          return mapped === 0 ? 0 : (mapped + delta) & 0xffff;
        }
        return 0;
      };
  return {
    bytes,
    unitsPerEm,
    ascent: bytes.readInt16BE(hhea + 4),
    descent: bytes.readInt16BE(hhea + 6),
    bbox: [bytes.readInt16BE(head + 36), bytes.readInt16BE(head + 38), bytes.readInt16BE(head + 40), bytes.readInt16BE(head + 42)],
    glyph,
    width: glyphId => advances[glyphId] ?? advances[0] ?? unitsPerEm,
  };
}

let cachedPdfFont: PdfFont | null | undefined;
function pdfFont(): PdfFont | undefined {
  if (cachedPdfFont !== undefined) return cachedPdfFont ?? undefined;
  for (const candidate of PDF_FONT_CANDIDATES) {
    try {
      cachedPdfFont = parsePdfFont(readFileSync(candidate));
      return cachedPdfFont;
    } catch { /* try the next deterministic system font */ }
  }
  cachedPdfFont = null;
  return undefined;
}

function projectDocumentationPdfBlocks(document: ProjectDocumentationDocument): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  const add = (kind: PdfBlockKind, text: unknown) => blocks.push({ kind, text: String(text ?? "") });
  const section = (title: string) => add("heading", title);
  add("title", document.project.name);
  add("subtitle", "Digital Twin project documentation");
  add("subtitle", `Accepted ${document.activeRevision.acceptedAt} · runtime ${document.activeRevision.runtimeGeneration}`);
  section("Executive summary");
  add("body", document.project.managerIntent);
  add("item", `Resources ${document.summary.resources} · components ${document.summary.components} · scene bindings ${document.summary.sceneBindings} · mesh bindings ${document.summary.meshBindings} · primitive fallbacks ${document.summary.primitiveFallbacks}`);
  add("item", `Complete assemblies ${document.summary.completeAssemblies}/${document.summary.assemblies} · complete processes ${document.summary.completeProcesses}/${document.summary.processes} · evidenced steps ${document.summary.evidencedProcessSteps}/${document.summary.processSteps}`);
  add("item", `Geometry ${document.summary.geometryPassedRequiredChecks}/${document.summary.geometryRequiredChecks} · integrity ${document.summary.integrityOk ? "PASS" : "FAIL"}, ${document.summary.integrityComplete ? "complete" : "incomplete"}`);
  add("body", `Report status: geometry ${document.validation.geometry.complete ? "complete" : "incomplete"}; cross-layer evidence ${document.validation.integrity.complete ? "complete" : "incomplete"}. A successful export does not turn missing evidence into a pass.`);
  section("Validation and open gaps");
  add("body", `Geometry: ${document.validation.geometry.ok ? "PASS" : "FAIL"}, ${document.validation.geometry.complete ? "complete" : "incomplete"}; ${document.validation.geometry.passedRequiredChecks}/${document.validation.geometry.requiredChecks} required checks passed.`);
  add("body", `Cross-layer integrity: ${document.validation.integrity.ok ? "PASS" : "FAIL"}, ${document.validation.integrity.complete ? "complete" : "incomplete"}.`);
  if (!document.validation.integrity.findings.length) add("body", "No validation findings were recorded.");
  for (const finding of document.validation.integrity.findings) add("item", `${finding.severity.toUpperCase()} · ${finding.layer} · ${finding.code}: ${finding.message} Repair: ${finding.repairProcess}.`);
  section("Twin architecture and 3D representation");
  add("body", "A primitive fallback preserves sourced semantic identity but is not an as-built model. A mesh URI proves only the recorded asset and evidence grade.");
  for (const component of document.components) add("item", `${component.label} [${component.id}] · ${component.type} · parent ${component.parentId ?? "—"} · scene ${component.scenePath ?? "unbound"} · representation ${component.representation} · geometry ${component.geometryEvidence} · sources ${component.sourceCount}`);
  section("Assemblies");
  if (!document.assemblies.length) add("body", "No AssemblyDSL report is available for this profile.");
  for (const assembly of document.assemblies) {
    add("subheading", `${assembly.id} · ${assembly.kind} · ${assembly.complete ? "complete" : "incomplete"}`);
    add("body", `Root component: ${assembly.rootComponentId}`);
    for (const part of assembly.parts) add("item", `${part.id} → ${part.componentId} · required ${part.required} · complete ${part.complete} · asset ${part.assetUri ?? "—"} · findings ${part.findingCodes.join(", ") || "none"}`);
  }
  section("Processes and animations");
  add("body", "Animation timing is normalized for presentation and does not claim factual laboratory duration.");
  if (!document.processes.length) add("body", "No ProcessDSL model is available for this profile.");
  const animations = new Map(document.animations.map(animation => [animation.processId, animation]));
  for (const process of document.processes) {
    add("subheading", `${process.label} [${process.id}]`);
    add("body", `${process.kind} · ${process.completeness} · ordering ${process.ordering} · cyclic ${process.cyclic} · animation ${animations.get(process.id)?.available ? "available" : "unavailable"}`);
    for (const gap of process.gaps) add("item", `Gap: ${gap}`);
    for (const step of process.steps) add("item", `${step.label} [${step.id}] · phase ${step.phase} · actors ${step.componentIds.join(", ") || "—"} · interactions ${step.interactions.join("; ") || "—"} · parameters ${step.parameters.join("; ") || "—"} · success ${step.success ?? "—"} · failure ${step.failure ?? "—"} · evidence ${step.citationIds.join(", ") || "—"}`);
  }
  section("MQTT and real/virtual process binding");
  add("body", document.mqtt.configured ? `Configured · authority ${document.mqtt.authority} · default mode ${document.mqtt.defaultMode} · ProcessDSL identities match ${document.mqtt.revisionBound}. This observe-only contract does not grant actuator command authority.` : "No MQTT binding was available; this is not treated as a pass.");
  if (!document.mqtt.routes.length) add("body", "No MQTT process routes are configured.");
  for (const route of document.mqtt.routes) add("item", `${route.id} · broker ${route.brokerId} · topic ${route.topic} · QoS ${route.qos} · process ${route.processId} · ${route.processUri} · modes ${route.modes.join(", ")}`);
  section("Live Twin state");
  add("body", document.liveState.available ? `State evaluated at ${document.liveState.evaluatedAt}.` : "No TwinState artifact is available.");
  if (!document.liveState.components.length) add("body", "No live properties are available for this accepted revision.");
  for (const component of document.liveState.components) for (const property of component.properties) add("item", `${component.componentId}.${property.property} = ${property.value} ${property.unit ?? ""} · state ${property.state} · quality ${property.quality} · observed ${property.observedAt ?? "—"}`);
  section("Entrusted and processed data");
  add("body", "Only logical roots and provenance classifications are exported. Host filesystem paths and credentials are excluded.");
  add("body", `IntentDSL: ${document.inputs.intentDsl.packs} packs, ${document.inputs.intentDsl.records} records, ${document.inputs.intentDsl.invalid} invalid · semantic hash ${document.inputs.intentDsl.semanticHash}`);
  add("body", `Source coverage: ${document.inputs.sourceCoverage.terminal}/${document.inputs.sourceCoverage.discovered} terminal across ${document.inputs.sourceCoverage.reports} report(s); ${document.inputs.sourceCoverage.invalidReports} invalid report(s).`);
  for (const [role, count] of Object.entries(document.inputs.resourcesByRole)) add("item", `Resource role ${role}: ${count}`);
  for (const [mediaType, count] of Object.entries(document.inputs.resourcesByMediaType)) add("item", `Media type ${mediaType}: ${count}`);
  add("subheading", "Source roots");
  for (const source of document.inputs.sources) add("item", `${source.role}: ${source.logicalRoot} · labels ${source.labels.join(", ") || "—"}`);
  section("Deterministic decisions");
  if (!document.decisions.length) add("body", "No deterministic decisions were recorded.");
  for (const decision of document.decisions) {
    add("subheading", `${decision.subject} · ${decision.ruleId}`);
    add("body", `Outcome: ${decision.outcome}`);
    add("body", `Basis (${decision.confidence} confidence): ${decision.basis}`);
    for (const gap of decision.gaps) add("item", `Gap: ${gap}`);
    add("body", `Citations: ${decision.citationIds.join(", ") || "none"}`);
  }
  section("Citations");
  if (!document.citations.length) add("body", "No citations were recorded.");
  for (const citation of document.citations) {
    add("subheading", `${citation.id} · ${citation.title}`);
    add("body", `${citation.kind === "external" ? citation.href : `Source artifact ${citation.artifactUri ?? "not recorded"} · dashboard locator ${citation.href}`}${citation.revisionHash ? ` · revision ${citation.revisionHash}` : ""}${citation.page ? ` · page ${citation.page}` : ""}`);
    if (citation.excerpt) add("item", `Excerpt: ${citation.excerpt}`);
  }
  section("Accepted revision and reproducibility");
  for (const [key, value] of Object.entries(document.activeRevision)) add("item", `${key}: ${value ?? "not recorded"}`);
  add("body", document.explanationBoundary);
  add("body", "The companion manifest contains SHA-256 hashes for JSON, Markdown, HTML and PDF. Regenerating with the same accepted artifacts, runtime generation and PDF font produces the same bytes.");
  return blocks;
}

function pdfTextWidth(value: string, size: number, font: PdfFont): number {
  let width = 0;
  for (const character of value) width += font.width(font.glyph(character.codePointAt(0)!));
  return width * size / font.unitsPerEm;
}

function pdfWrap(value: string, maxWidth: number, size: number, font: PdfFont): string[] {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const lines: string[] = [];
  let line = "";
  const pushWord = (word: string) => {
    if (!line) line = word;
    else if (pdfTextWidth(`${line} ${word}`, size, font) <= maxWidth) line += ` ${word}`;
    else { lines.push(line); line = word; }
  };
  for (const word of clean.split(" ")) {
    if (pdfTextWidth(word, size, font) <= maxWidth) { pushWord(word); continue; }
    if (line) { lines.push(line); line = ""; }
    let fragment = "";
    for (const character of word) {
      if (fragment && pdfTextWidth(fragment + character, size, font) > maxWidth) { lines.push(fragment); fragment = character; }
      else fragment += character;
    }
    line = fragment;
  }
  if (line) lines.push(line);
  return lines;
}

function layoutPdf(blocks: PdfBlock[], font: PdfFont): PdfPlacedLine[][] {
  const pages: PdfPlacedLine[][] = [[]];
  let y = 783;
  const newPage = () => { pages.push([]); y = 783; };
  const styles: Record<PdfBlockKind, { size: number; before: number; after: number; indent: number; color: [number, number, number] }> = {
    title: { size: 23, before: 16, after: 11, indent: 0, color: [0.10, 0.25, 0.48] },
    subtitle: { size: 10, before: 0, after: 4, indent: 0, color: [0.35, 0.42, 0.50] },
    heading: { size: 15, before: 17, after: 7, indent: 0, color: [0.10, 0.25, 0.48] },
    subheading: { size: 11, before: 10, after: 4, indent: 0, color: [0.16, 0.34, 0.58] },
    body: { size: 8.8, before: 2, after: 5, indent: 0, color: [0.10, 0.13, 0.17] },
    item: { size: 8.2, before: 1, after: 3, indent: 12, color: [0.13, 0.17, 0.22] },
  };
  for (const block of blocks) {
    const style = styles[block.kind];
    const lineHeight = style.size * 1.34;
    const prefix = block.kind === "item" ? "• " : "";
    const lines = pdfWrap(prefix + block.text, 503 - style.indent, style.size, font);
    const minimum = style.before + Math.min(lines.length, block.kind === "heading" || block.kind === "subheading" ? 2 : 1) * lineHeight + style.after;
    if (y - minimum < 54) newPage();
    y -= style.before;
    for (const line of lines) {
      if (y - lineHeight < 54) newPage();
      pages.at(-1)!.push({ text: line, x: 46 + style.indent, y, size: style.size, color: style.color });
      y -= lineHeight;
    }
    y -= style.after;
  }
  return pages;
}

function pdfHexText(value: string, font: PdfFont): string {
  return [...value].map(character => font.glyph(character.codePointAt(0)!).toString(16).padStart(4, "0")).join("");
}
function pdfUnicodeHex(codePoint: number): string {
  if (codePoint <= 0xffff) return codePoint.toString(16).padStart(4, "0");
  const adjusted = codePoint - 0x10000;
  return `${(0xd800 + (adjusted >> 10)).toString(16)}${(0xdc00 + (adjusted & 0x3ff)).toString(16)}`;
}
function streamObject(value: Buffer | string): Buffer {
  const bytes = typeof value === "string" ? Buffer.from(value, "ascii") : value;
  return Buffer.concat([Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`, "ascii"), bytes, Buffer.from("\nendstream", "ascii")]);
}
function assemblePdf(objects: Array<Buffer | string | undefined>, infoObject?: number): Buffer {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets = [0];
  let length = chunks[0].length;
  for (let id = 1; id < objects.length; id++) {
    const source = objects[id];
    if (source === undefined) throw new Error(`PROJECT_DOCUMENTATION_INVALID:pdf-missing-object-${id}`);
    const content: Buffer = typeof source === "string" ? Buffer.from(source, "ascii") : source;
    offsets[id] = length;
    const object = Buffer.concat([Buffer.from(`${id} 0 obj\n`, "ascii"), content, Buffer.from("\nendobj\n", "ascii")]);
    chunks.push(object);
    length += object.length;
  }
  const xref = length;
  const trailer = [`xref`, `0 ${objects.length}`, "0000000000 65535 f ", ...offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n `), "trailer", `<< /Size ${objects.length} /Root 1 0 R${infoObject ? ` /Info ${infoObject} 0 R` : ""} >>`, "startxref", String(xref), "%%EOF", ""].join("\n");
  chunks.push(Buffer.from(trailer, "ascii"));
  return Buffer.concat(chunks);
}

function renderUnicodePdf(document: ProjectDocumentationDocument, font: PdfFont): Buffer {
  const blocks = projectDocumentationPdfBlocks(document);
  const pages = layoutPdf(blocks, font);
  const allText = blocks.map(block => block.text).concat(document.project.name, "Digital Twin project documentation");
  const glyphToUnicode = new Map<number, number>();
  for (const value of allText) for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const glyphId = font.glyph(codePoint);
    if (glyphId && !glyphToUnicode.has(glyphId)) glyphToUnicode.set(glyphId, codePoint);
  }
  const pageRefs = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  const fontObject = 3 + pages.length * 2;
  const cidFontObject = fontObject + 1;
  const descriptorObject = fontObject + 2;
  const fontFileObject = fontObject + 3;
  const toUnicodeObject = fontObject + 4;
  const infoObject = fontObject + 5;
  const objects: Array<Buffer | string | undefined> = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const header = index === 0 ? "Digital Twin project documentation" : document.project.name;
    const commands = [
      "0.10 0.25 0.48 rg 0 808 595 34 re f",
      `BT /F1 9 Tf 1 1 1 rg 1 0 0 1 46 821 Tm <${pdfHexText(header, font)}> Tj ET`,
      ...page.map(line => `BT /F1 ${line.size.toFixed(2)} Tf ${line.color.map(value => value.toFixed(2)).join(" ")} rg 1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm <${pdfHexText(line.text, font)}> Tj ET`),
      "0.72 0.76 0.81 RG 46 37 m 549 37 l S",
      `BT /F1 7.5 Tf 0.35 0.42 0.50 rg 1 0 0 1 46 23 Tm <${pdfHexText(`Accepted Twin · ${document.activeRevision.twinUri.slice(-16)}`, font)}> Tj ET`,
      `BT /F1 7.5 Tf 0.35 0.42 0.50 rg 1 0 0 1 500 23 Tm <${pdfHexText(`${index + 1} / ${pages.length}`, font)}> Tj ET`,
    ].join("\n");
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = streamObject(commands);
  });
  const scale = (value: number) => Math.round(value * 1000 / font.unitsPerEm);
  const widths = [...glyphToUnicode.keys()].sort((a, b) => a - b).map(glyphId => `${glyphId} [${scale(font.width(glyphId))}]`).join(" ");
  objects[fontObject] = `<< /Type /Font /Subtype /Type0 /BaseFont /DejaVuSans /Encoding /Identity-H /DescendantFonts [${cidFontObject} 0 R] /ToUnicode ${toUnicodeObject} 0 R >>`;
  objects[cidFontObject] = `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /DejaVuSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorObject} 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`;
  objects[descriptorObject] = `<< /Type /FontDescriptor /FontName /DejaVuSans /Flags 32 /FontBBox [${font.bbox.map(scale).join(" ")}] /ItalicAngle 0 /Ascent ${scale(font.ascent)} /Descent ${scale(font.descent)} /CapHeight ${scale(font.ascent)} /StemV 80 /FontFile2 ${fontFileObject} 0 R >>`;
  objects[fontFileObject] = streamObject(font.bytes);
  const mappings = [...glyphToUnicode.entries()].sort(([a], [b]) => a - b);
  const cmapParts = ["/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap", "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def", "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def", "1 begincodespacerange", "<0000> <ffff>", "endcodespacerange"];
  for (let index = 0; index < mappings.length; index += 100) {
    const chunk = mappings.slice(index, index + 100);
    cmapParts.push(`${chunk.length} beginbfchar`, ...chunk.map(([glyphId, codePoint]) => `<${glyphId.toString(16).padStart(4, "0")}> <${pdfUnicodeHex(codePoint)}>`), "endbfchar");
  }
  cmapParts.push("endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end");
  objects[toUnicodeObject] = streamObject(cmapParts.join("\n"));
  objects[infoObject] = `<< /Producer (subactor twin-dsl ${document.activeRevision.runtimeGeneration}) /CreationDate (D:${document.generatedAt.replace(/[-:TZ.]/g, "").slice(0, 14)}Z) >>`;
  return assemblePdf(objects, infoObject);
}

function renderFallbackPdf(document: ProjectDocumentationDocument): Buffer {
  const transliterate = (value: string) => value.normalize("NFKD").replace(/[^\x20-\x7e]/g, character => ({ "×": "x", "µ": "u", "–": "-", "—": "-", "→": "->", "·": "-", "…": "..." }[character] ?? ""));
  const lines = projectDocumentationPdfBlocks(document).flatMap(block => {
    const text = `${block.kind === "heading" ? "\n" : ""}${block.kind === "item" ? "- " : ""}${transliterate(block.text)}`.replace(/\s+/g, " ").trim();
    const result: string[] = [];
    for (let offset = 0; offset < text.length; offset += 96) result.push(text.slice(offset, offset + 96));
    return result.length ? result : [""];
  });
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 58)) }, (_, index) => lines.slice(index * 58, (index + 1) * 58));
  const fontObject = 3 + pages.length * 2;
  const objects: Array<Buffer | string | undefined> = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const stream = `BT /F1 8.5 Tf 42 802 Td 11.8 TL\n${page.map(line => `(${line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj T*`).join("\n")}\nET`;
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${pageObject + 1} 0 R >>`;
    objects[pageObject + 1] = streamObject(stream);
  });
  objects[fontObject] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  return assemblePdf(objects);
}

export function renderProjectDocumentationPdf(document: ProjectDocumentationDocument): Buffer {
  const font = pdfFont();
  return font ? renderUnicodePdf(document, font) : renderFallbackPdf(document);
}

export async function generateProjectDocumentation(options: GenerateProjectDocumentationOptions): Promise<ProjectDocumentationArtifacts> {
  const document = await buildDocument(options);
  const jsonText = `${JSON.stringify(document, null, 2)}\n`;
  const markdown = renderProjectDocumentationMarkdown(document);
  const htmlText = renderProjectDocumentationHtml(document);
  const pdf = renderProjectDocumentationPdf(document);
  const artifacts = {
    [FILES.json]: { mediaType: "application/json", sha256: sha256(jsonText), bytes: Buffer.byteLength(jsonText) },
    [FILES.markdown]: { mediaType: "text/markdown", sha256: sha256(markdown), bytes: Buffer.byteLength(markdown) },
    [FILES.html]: { mediaType: "text/html", sha256: sha256(htmlText), bytes: Buffer.byteLength(htmlText) },
    [FILES.pdf]: { mediaType: "application/pdf", sha256: sha256(pdf), bytes: pdf.byteLength },
  };
  const manifest: ProjectDocumentationManifest = {
    schema: "subactor.project-documentation-manifest/v1",
    projectId: document.project.id,
    generatedAt: document.generatedAt,
    documentUri: contentUri("project-documentation", document),
    activeRevision: document.activeRevision,
    artifacts,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const result: ProjectDocumentationArtifacts = { document, manifest, files: { json: jsonText, markdown, html: htmlText, pdf, manifest: manifestText } };
  if (options.outputDir) {
    const outputDir = resolve(options.outputDir);
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(join(outputDir, FILES.json), jsonText),
      writeFile(join(outputDir, FILES.markdown), markdown),
      writeFile(join(outputDir, FILES.html), htmlText),
      writeFile(join(outputDir, FILES.pdf), pdf),
      writeFile(join(outputDir, FILES.manifest), manifestText),
    ]);
  }
  return result;
}

export const projectDocumentationFiles = FILES;
