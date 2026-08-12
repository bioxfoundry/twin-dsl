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
function table(headers: string[], rows: string[][]): string {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${row.map(md).join(" | ")} |`)].join("\n");
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
    "## Accepted revision",
    "",
    table(["Field", "Value"], Object.entries(document.activeRevision).map(([key, value]) => [key, value ?? "not recorded"])),
    "",
    "## Entrusted and processed data",
    "",
    "Only logical roots and provenance classifications are included here; host filesystem paths and credentials are not exported.",
    "",
    table(["Role", "Logical root", "Labels"], document.inputs.sources.map(source => [source.role, code(source.logicalRoot), source.labels.join(", ") || "—"])),
    "",
    `IntentDSL: ${document.inputs.intentDsl.packs} packs, ${document.inputs.intentDsl.records} records, ${document.inputs.intentDsl.invalid} invalid; semantic hash ${code(document.inputs.intentDsl.semanticHash)}.`,
    "",
    `Source coverage: ${document.inputs.sourceCoverage.terminal}/${document.inputs.sourceCoverage.discovered} terminal across ${document.inputs.sourceCoverage.reports} report(s); ${document.inputs.sourceCoverage.invalidReports} invalid report(s).`,
    "",
    table(["Resource role", "Count"], Object.entries(document.inputs.resourcesByRole).map(([role, count]) => [role, String(count)])),
    "",
    table(["Media type", "Count"], Object.entries(document.inputs.resourcesByMediaType).map(([mediaType, count]) => [code(mediaType), String(count)])),
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
    table(["Route", "Broker", "Topic", "QoS", "Process", "URI Process", "Modes"], document.mqtt.routes.map(route => [route.id, route.brokerId, code(route.topic), String(route.qos), route.processId, code(route.processUri), route.modes.join(", ")])),
    "",
    "## Live Twin state",
    "",
    document.liveState.available ? `State evaluated at ${code(document.liveState.evaluatedAt)}.` : "No TwinState artifact is available.",
    "",
    table(["Component", "Property", "Value", "Unit", "State", "Quality", "Observed at"], document.liveState.components.flatMap(component => component.properties.map(property => [component.componentId, property.property, property.value, property.unit ?? "—", property.state, property.quality, property.observedAt ?? "—"]))),
    "",
    "## Validation and open gaps",
    "",
    `Geometry validation: **${document.validation.geometry.ok ? "PASS" : "FAIL"}**, ${document.validation.geometry.complete ? "complete" : "incomplete"}; ${document.validation.geometry.passedRequiredChecks}/${document.validation.geometry.requiredChecks} required checks passed.`,
    "",
    `Cross-layer integrity: **${document.validation.integrity.ok ? "PASS" : "FAIL"}**, ${document.validation.integrity.complete ? "complete" : "incomplete"}.`,
    "",
    table(["Severity", "Layer", "Code", "Finding", "Repair process"], document.validation.integrity.findings.map(finding => [finding.severity, finding.layer, finding.code, finding.message, finding.repairProcess])),
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
    `[Open cited source](${citation.href})${citation.revisionHash ? `; revision ${code(citation.revisionHash)}` : ""}${citation.page ? `; page ${citation.page}` : ""}.`,
    "",
    ...(citation.excerpt ? [`> ${md(citation.excerpt)}`, ""] : []),
  );
  sections.push(
    "## Reproducibility",
    "",
    `Generated by runtime generation ${code(document.activeRevision.runtimeGeneration)} from the accepted Twin, Scene, analysis trace and supporting runtime artifacts. The companion manifest hashes the JSON, Markdown, HTML and PDF byte streams. Regenerating against the same accepted artifacts produces the same documentation bytes.`,
    "",
  );
  return sections.join("\n");
}

function html(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function htmlTable(headers: string[], rows: Array<Array<unknown>>): string {
  return `<div class="table"><table><thead><tr>${headers.map(header => `<th>${html(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${html(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function htmlList(items: string[]): string { return items.length ? `<ul>${items.map(item => `<li>${html(item)}</li>`).join("")}</ul>` : "<p>None recorded.</p>"; }

export function renderProjectDocumentationHtml(document: ProjectDocumentationDocument): string {
  const s = document.summary;
  const processSections = document.processes.map(process => `<section><h3>${html(process.label)}</h3><p><code>${html(process.id)}</code> · ${html(process.kind)} · <strong>${html(process.completeness)}</strong> · ordering <code>${html(process.ordering)}</code></p>${process.gaps.length ? `<h4>Known gaps</h4>${htmlList(process.gaps)}` : "<p>Known process gaps: none recorded.</p>"}${htmlTable(["Step", "Phase", "Actors", "Interactions", "Parameters", "Success", "Failure", "Evidence"], process.steps.map(step => [step.label, step.phase, step.componentIds.join(", "), step.interactions.join("; ") || "—", step.parameters.join("; ") || "—", step.success ?? "—", step.failure ?? "—", step.citationIds.join(", ") || "—"]))}</section>`).join("");
  const assemblySections = document.assemblies.map(assembly => `<section><h3><code>${html(assembly.id)}</code></h3><p>${html(assembly.kind)} · root <code>${html(assembly.rootComponentId)}</code> · <strong>${assembly.complete ? "complete" : "incomplete"}</strong></p>${htmlTable(["Part", "Component", "Required", "Complete", "Asset", "Scene path", "Findings"], assembly.parts.map(part => [part.id, part.componentId, part.required, part.complete, part.assetUri ?? "—", part.scenePath ?? "—", part.findingCodes.join(", ") || "—"]))}</section>`).join("");
  const decisionSections = document.decisions.map(decision => `<article><h3><code>${html(decision.subject)}</code> — ${html(decision.ruleId)}</h3><p><strong>Outcome:</strong> ${html(decision.outcome)}</p><p><strong>Basis (${html(decision.confidence)} confidence):</strong> ${html(decision.basis)}</p><p><strong>Citations:</strong> ${html(decision.citationIds.join(", ") || "none")}</p>${decision.gaps.length ? `<h4>Gaps</h4>${htmlList(decision.gaps)}` : ""}</article>`).join("");
  const citations = document.citations.map(citation => `<article><h3><code>${html(citation.id)}</code> — ${html(citation.title)}</h3><p><a href="${html(citation.href)}">Open cited source</a>${citation.revisionHash ? ` · revision <code>${html(citation.revisionHash)}</code>` : ""}${citation.page ? ` · page ${citation.page}` : ""}</p>${citation.excerpt ? `<blockquote>${html(citation.excerpt)}</blockquote>` : ""}</article>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(document.project.name)} — Digital Twin project documentation</title><style>
:root{color-scheme:light;--ink:#17202a;--muted:#5d6d7e;--line:#d5d8dc;--accent:#2457a6}*{box-sizing:border-box}body{max-width:1180px;margin:0 auto;padding:42px 28px;color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}h1{font-size:2rem}h2{margin-top:2.2rem;border-bottom:2px solid var(--accent);padding-bottom:.3rem}h3{margin-top:1.5rem}code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.lead{padding:14px 18px;border-left:4px solid var(--accent);background:#f4f7fb}.table{overflow-x:auto;margin:1rem 0}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef2f7}blockquote{margin:1rem 0;padding:10px 16px;border-left:3px solid #99a3a4;background:#f8f9f9;color:#34495e}article{break-inside:avoid;border-bottom:1px solid var(--line)}.status{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.status div{border:1px solid var(--line);padding:10px}.status strong{display:block;font-size:1.35rem}@media print{body{max-width:none;padding:10mm}a{color:inherit}.table{overflow:visible}h2{break-after:avoid}thead{display:table-header-group}}
</style></head><body>
<header><h1>Digital Twin project — ${html(document.project.name)}</h1><p class="lead">${html(document.explanationBoundary)}</p><p>${html(document.project.managerIntent)}</p></header>
<section><h2>Executive summary</h2><div class="status"><div><strong>${s.resources}</strong>resources</div><div><strong>${s.components}</strong>components</div><div><strong>${s.meshBindings}/${s.sceneBindings}</strong>mesh bindings</div><div><strong>${s.completeAssemblies}/${s.assemblies}</strong>complete assemblies</div><div><strong>${s.completeProcesses}/${s.processes}</strong>complete processes</div><div><strong>${s.geometryPassedRequiredChecks}/${s.geometryRequiredChecks}</strong>geometry checks</div></div>${htmlTable(["Field", "Value"], Object.entries(document.activeRevision))}</section>
<section><h2>Entrusted and processed data</h2><p>Only logical roots and provenance classifications are exported. Host filesystem paths and credentials are excluded.</p>${htmlTable(["Role", "Logical root", "Labels"], document.inputs.sources.map(source => [source.role, source.logicalRoot, source.labels.join(", ") || "—"]))}<p>IntentDSL: ${document.inputs.intentDsl.packs} packs, ${document.inputs.intentDsl.records} records, ${document.inputs.intentDsl.invalid} invalid.</p>${htmlTable(["Resource role", "Count"], Object.entries(document.inputs.resourcesByRole))}${htmlTable(["Media type", "Count"], Object.entries(document.inputs.resourcesByMediaType))}</section>
<section><h2>Twin architecture and 3D representation</h2>${htmlTable(["Component", "Label", "Type", "Parent", "Scene path", "Representation", "Geometry evidence", "Sources"], document.components.map(component => [component.id, component.label, component.type, component.parentId ?? "—", component.scenePath ?? "—", component.representation, component.geometryEvidence, component.sourceCount]))}<p>A primitive fallback preserves sourced semantic identity but is not an as-built model.</p></section>
<h2>Assemblies</h2>${assemblySections || "<p>No AssemblyDSL report is available for this profile.</p>"}
<h2>Processes and animations</h2><p>Animation timing is normalized for presentation and does not claim factual laboratory duration.</p>${processSections || "<p>No ProcessDSL model is available for this profile.</p>"}
<section><h2>MQTT and real/virtual process binding</h2><p>${document.mqtt.configured ? `Authority <strong>${html(document.mqtt.authority)}</strong>; default mode <code>${html(document.mqtt.defaultMode)}</code>; route identities match active ProcessDSL: <strong>${document.mqtt.revisionBound}</strong>. This contract does not grant actuator command authority.` : "No MQTT binding was available; this is not treated as a pass."}</p>${htmlTable(["Route", "Broker", "Topic", "QoS", "Process", "URI Process", "Modes"], document.mqtt.routes.map(route => [route.id, route.brokerId, route.topic, route.qos, route.processId, route.processUri, route.modes.join(", ")]))}</section>
<section><h2>Live Twin state</h2><p>${document.liveState.available ? `Evaluated at ${html(document.liveState.evaluatedAt)}.` : "No TwinState artifact is available."}</p>${htmlTable(["Component", "Property", "Value", "Unit", "State", "Quality", "Observed at"], document.liveState.components.flatMap(component => component.properties.map(property => [component.componentId, property.property, property.value, property.unit ?? "—", property.state, property.quality, property.observedAt ?? "—"])))}</section>
<section><h2>Validation and open gaps</h2><p>Geometry: <strong>${document.validation.geometry.ok ? "PASS" : "FAIL"}</strong>, ${document.validation.geometry.complete ? "complete" : "incomplete"}; ${document.validation.geometry.passedRequiredChecks}/${document.validation.geometry.requiredChecks} checks. Integrity: <strong>${document.validation.integrity.ok ? "PASS" : "FAIL"}</strong>, ${document.validation.integrity.complete ? "complete" : "incomplete"}.</p>${htmlTable(["Severity", "Layer", "Code", "Finding", "Repair process"], document.validation.integrity.findings.map(finding => [finding.severity, finding.layer, finding.code, finding.message, finding.repairProcess]))}</section>
<h2>Deterministic decisions</h2>${decisionSections}<h2>Citations</h2>${citations}
<section><h2>Reproducibility</h2><p>Generated at ${html(document.generatedAt)} by runtime generation <code>${html(document.activeRevision.runtimeGeneration)}</code>. The companion manifest hashes all export byte streams.</p></section>
</body></html>\n`;
}

function ascii(value: string): string {
  const map: Record<string, string> = { "ą":"a", "ć":"c", "ę":"e", "ł":"l", "ń":"n", "ó":"o", "ś":"s", "ź":"z", "ż":"z", "Ą":"A", "Ć":"C", "Ę":"E", "Ł":"L", "Ń":"N", "Ó":"O", "Ś":"S", "Ź":"Z", "Ż":"Z", "–":"-", "—":"-", "…":"...", "→":"->", "·":"-", "“":"\"", "”":"\"", "’":"'" };
  return [...value.normalize("NFKD")].map(character => map[character] ?? (/^[\x20-\x7e]$/.test(character) ? character : "")).join("");
}
function wrap(value: string, width = 102): string[] {
  const clean = ascii(value).replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const result: string[] = [];
  let line = "";
  for (const word of clean.split(" ")) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else { result.push(line); line = word; }
  }
  if (line) result.push(line);
  return result;
}
function pdfLine(value: string): string { return `(${value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj T*`; }

function projectDocumentationPlainText(document: ProjectDocumentationDocument): string[] {
  const lines: string[] = [];
  const add = (value = "") => lines.push(...wrap(value));
  add(`DIGITAL TWIN PROJECT - ${document.project.name}`); add(); add(document.project.managerIntent); add();
  add(`Accepted revision: ${document.activeRevision.twinUri}`); add(`Generated: ${document.generatedAt}; runtime: ${document.activeRevision.runtimeGeneration}`); add();
  add("EXECUTIVE SUMMARY");
  for (const [key, value] of Object.entries(document.summary)) add(`${key}: ${String(value)}`);
  add(); add("ENTRUSTED AND PROCESSED DATA");
  for (const source of document.inputs.sources) add(`${source.role}: ${source.logicalRoot} [${source.labels.join(", ")}]`);
  add(`IntentDSL: ${document.inputs.intentDsl.packs} packs; ${document.inputs.intentDsl.records} records; invalid ${document.inputs.intentDsl.invalid}; ${document.inputs.intentDsl.semanticHash}`);
  add(); add("TWIN COMPONENTS");
  for (const component of document.components) add(`${component.id} | ${component.label} | ${component.type} | parent ${component.parentId ?? "-"} | ${component.scenePath ?? "unbound"} | ${component.representation} | geometry ${component.geometryEvidence} | sources ${component.sourceCount}`);
  add(); add("ASSEMBLIES");
  for (const assembly of document.assemblies) { add(`${assembly.id}: ${assembly.kind}; root ${assembly.rootComponentId}; complete ${assembly.complete}`); for (const part of assembly.parts) add(`  ${part.id}: ${part.componentId}; required ${part.required}; complete ${part.complete}; asset ${part.assetUri ?? "-"}`); }
  add(); add("PROCESSES AND PRESENTATION ANIMATIONS"); add("Animation timing is normalized for presentation and is not factual process duration.");
  for (const process of document.processes) { add(`${process.label} [${process.id}] - ${process.completeness}; ordering ${process.ordering}`); for (const gap of process.gaps) add(`  GAP: ${gap}`); for (const step of process.steps) add(`  ${step.id}: ${step.label}; phase ${step.phase}; actors ${step.componentIds.join(", ")}; success ${step.success ?? "-"}; failure ${step.failure ?? "-"}; evidence ${step.citationIds.join(", ") || "-"}`); }
  add(); add("MQTT"); add(document.mqtt.configured ? `configured; authority ${document.mqtt.authority}; default mode ${document.mqtt.defaultMode}; binding ${document.mqtt.bindingSha256}; process identities match ${document.mqtt.revisionBound}` : "not configured");
  for (const route of document.mqtt.routes) add(`${route.id}: ${route.topic}; process ${route.processId}; ${route.processUri}; modes ${route.modes.join(",")}`);
  add(); add("LIVE TWIN STATE");
  for (const component of document.liveState.components) for (const property of component.properties) add(`${component.componentId}.${property.property}=${property.value} ${property.unit ?? ""}; state ${property.state}; quality ${property.quality}; observed ${property.observedAt ?? "-"}`);
  add(); add("VALIDATION AND OPEN GAPS"); add(`Geometry: ok ${document.validation.geometry.ok}; complete ${document.validation.geometry.complete}; ${document.validation.geometry.passedRequiredChecks}/${document.validation.geometry.requiredChecks}`); add(`Integrity: ok ${document.validation.integrity.ok}; complete ${document.validation.integrity.complete}`);
  for (const finding of document.validation.integrity.findings) add(`${finding.severity} ${finding.layer} ${finding.code}: ${finding.message}; repair ${finding.repairProcess}`);
  add(); add("DETERMINISTIC DECISIONS");
  for (const decision of document.decisions) { add(`${decision.subject} [${decision.ruleId}] (${decision.confidence}): ${decision.outcome}`); add(`Basis: ${decision.basis}`); if (decision.gaps.length) add(`Gaps: ${decision.gaps.join("; ")}`); add(`Citations: ${decision.citationIds.join(", ") || "none"}`); }
  add(); add("CITATIONS");
  for (const citation of document.citations) { add(`${citation.id}: ${citation.title}; ${citation.href}${citation.revisionHash ? `; revision ${citation.revisionHash}` : ""}${citation.page ? `; page ${citation.page}` : ""}`); if (citation.excerpt) add(`Excerpt: ${citation.excerpt}`); }
  add(); add("REPRODUCIBILITY"); add(document.explanationBoundary); add("The companion manifest contains SHA-256 hashes for JSON, Markdown, HTML and PDF.");
  return lines;
}

export function renderProjectDocumentationPdf(document: ProjectDocumentationDocument): Buffer {
  const lines = projectDocumentationPlainText(document);
  const pageLines = 58;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / pageLines)) }, (_, index) => lines.slice(index * pageLines, (index + 1) * pageLines));
  const fontObject = 3 + pages.length * 2;
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageRefs = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const stream = `BT\n/F1 8.5 Tf\n42 802 Td\n11.8 TL\n${page.map(pdfLine).join("\n")}\nET\n`;
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`;
  });
  objects[fontObject] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output, "latin1");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
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
