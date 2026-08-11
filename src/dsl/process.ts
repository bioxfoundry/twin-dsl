import type { ProcessDocument, ProcessEvidence, ProcessFinding } from "../core/types.js";

const PROCESS_KINDS = new Set(["manipulation", "optimization", "cultivation", "imaging", "sample-preparation", "synthesis", "cloning"]);
const COMPLETENESS = new Set(["complete", "partial", "declared-only"]);
const ORDERING = new Set(["source", "presentation-only", "declared-only"]);
const PHASES = new Set(["validate", "plan", "command", "operate", "observe", "update", "optimize", "recover"]);
const INTERACTIONS = new Set(["validation", "command", "operation", "observation", "state-update", "safety"]);

function fail(code: string, detail?: string): never {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function evidenceValid(value: ProcessEvidence): boolean {
  return Boolean(value && typeof value === "object" && value.intentId && value.intentUri && value.sourceUri &&
    value.artifactUri && /^[a-f0-9]{64}$/.test(value.revisionHash) && value.excerpt &&
    (value.page === undefined || Number.isInteger(value.page) && value.page > 0));
}

function findingValid(value: ProcessFinding): boolean {
  return Boolean(value && typeof value === "object" && value.code && ["info", "warning", "error"].includes(value.severity) &&
    value.message && value.resolution);
}

function parameterValueValid(value: unknown): boolean {
  return (typeof value === "string" && value.length > 0) || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean";
}

export function processCoverage(document: Pick<ProcessDocument, "processes" | "findings">): ProcessDocument["coverage"] {
  const steps = document.processes.flatMap((process) => process.steps);
  return {
    processes: document.processes.length,
    complete: document.processes.filter((process) => process.completeness === "complete").length,
    partial: document.processes.filter((process) => process.completeness === "partial").length,
    declaredOnly: document.processes.filter((process) => process.completeness === "declared-only").length,
    steps: steps.length,
    evidencedSteps: steps.filter((step) => step.evidence.length > 0).length,
    missingEvidence: steps.reduce((sum, step) => sum + (step.evidence.length ? 0 : 1), 0),
    missingComponents: new Set(document.findings.filter((finding) => finding.code === "PROCESS_COMPONENT_MISSING").map((finding) => finding.componentId).filter(Boolean)).size,
  };
}

export function validateProcessDocument(value: unknown, componentIds?: Iterable<string>): ProcessDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("PROCESS_DSL_INVALID", "document");
  const document = value as ProcessDocument;
  if (document.schema !== "subactor.process/v1" || !document.id || !document.projectId ||
    !/^[a-f0-9]{64}$/.test(document.sourceSnapshotHash) || !Array.isArray(document.processes) ||
    !Array.isArray(document.findings) || !document.coverage) fail("PROCESS_DSL_INVALID", "header");
  if (new Set(document.processes.map((process) => process.id)).size !== document.processes.length) fail("PROCESS_ID_DUPLICATE");
  const knownComponents = componentIds ? new Set(componentIds) : undefined;
  for (const process of document.processes) {
    if (!process.id || !process.label || !PROCESS_KINDS.has(process.kind) || !COMPLETENESS.has(process.completeness) ||
      !ORDERING.has(process.ordering) || typeof process.cyclic !== "boolean" || !strings(process.componentIds) ||
      !Array.isArray(process.steps) || !Array.isArray(process.evidence) || !stringsOrEmpty(process.gaps) ||
      !process.evidence.every(evidenceValid)) fail("PROCESS_DSL_INVALID", process.id || "process");
    if (new Set(process.componentIds).size !== process.componentIds.length) fail("PROCESS_DSL_INVALID", `${process.id}:duplicate-component`);
    if (process.completeness === "declared-only" && (process.steps.length || process.entryStepId || process.successStepId || process.failureStepId)) {
      fail("PROCESS_DSL_INVALID", `${process.id}:declared-only-has-steps`);
    }
    if (process.completeness === "complete" && (process.ordering !== "source" || process.gaps.length ||
      process.steps.some((step) => !step.evidence.length || step.gaps.length))) fail("PROCESS_COMPLETE_WITH_GAPS", process.id);
    const stepIds = new Set(process.steps.map((step) => step.id));
    if (stepIds.size !== process.steps.length) fail("PROCESS_STEP_ID_DUPLICATE", process.id);
    for (const reference of [process.entryStepId, process.successStepId, process.failureStepId].filter(Boolean) as string[]) {
      if (!stepIds.has(reference)) fail("PROCESS_TRANSITION_INVALID", `${process.id}:${reference}`);
    }
    if (process.steps.length && !process.entryStepId) fail("PROCESS_TRANSITION_INVALID", `${process.id}:entry-missing`);
    for (const componentId of process.componentIds) {
      if (knownComponents && !knownComponents.has(componentId)) fail("PROCESS_COMPONENT_MISSING", `${process.id}:${componentId}`);
    }
    for (const step of process.steps) {
      if (!step.id || !step.label || !PHASES.has(step.phase) || !strings(step.componentIds) ||
        !Array.isArray(step.interactions) || !Array.isArray(step.parameters) || !step.transitions || !Array.isArray(step.evidence) ||
        !step.evidence.every(evidenceValid) || !stringsOrEmpty(step.gaps)) fail("PROCESS_DSL_INVALID", `${process.id}:${step.id || "step"}`);
      if (new Set(step.parameters.map((parameter) => parameter.name)).size !== step.parameters.length) fail("PROCESS_PARAMETER_DUPLICATE", `${process.id}:${step.id}`);
      const evidenceIds = new Set(step.evidence.map((item) => item.intentId));
      for (const parameter of step.parameters) {
        if (!parameter || typeof parameter !== "object" || !parameter.name || parameter.basis !== "source" ||
          !parameter.evidenceIntentId || !parameterValueValid(parameter.value) ||
          parameter.unit !== undefined && (typeof parameter.unit !== "string" || !parameter.unit)) {
          fail("PROCESS_PARAMETER_INVALID", `${process.id}:${step.id}`);
        }
        if (!evidenceIds.has(parameter.evidenceIntentId)) fail("PROCESS_PARAMETER_EVIDENCE_INVALID", `${process.id}:${step.id}:${parameter.name}`);
      }
      for (const target of [step.transitions.success, step.transitions.failure].filter(Boolean) as string[]) {
        if (!stepIds.has(target)) fail("PROCESS_TRANSITION_INVALID", `${process.id}:${step.id}:${target}`);
      }
      for (const interaction of step.interactions) {
        if (!interaction || !INTERACTIONS.has(interaction.kind) || !strings(interaction.componentIds)) fail("PROCESS_DSL_INVALID", `${process.id}:${step.id}:interaction`);
        for (const componentId of interaction.componentIds) {
          if (!step.componentIds.includes(componentId)) fail("PROCESS_DSL_INVALID", `${process.id}:${step.id}:interaction-component:${componentId}`);
        }
        for (const componentId of [interaction.fromComponentId, interaction.toComponentId].filter(Boolean) as string[]) {
          if (!interaction.componentIds.includes(componentId)) fail("PROCESS_DSL_INVALID", `${process.id}:${step.id}:flow-component:${componentId}`);
        }
      }
      for (const componentId of step.componentIds) {
        if (!process.componentIds.includes(componentId)) fail("PROCESS_DSL_INVALID", `${process.id}:${step.id}:undeclared-component:${componentId}`);
        if (knownComponents && !knownComponents.has(componentId)) fail("PROCESS_COMPONENT_MISSING", `${process.id}:${step.id}:${componentId}`);
      }
    }
    if (process.completeness !== "declared-only") {
      const indexedEvidence = [...new Set(process.evidence.map((item) => item.intentId))].sort();
      const stepEvidence = [...new Set(process.steps.flatMap((step) => step.evidence.map((item) => item.intentId)))].sort();
      if (JSON.stringify(indexedEvidence) !== JSON.stringify(stepEvidence)) fail("PROCESS_EVIDENCE_INDEX_INVALID", process.id);
    }
  }
  if (!document.findings.every(findingValid)) fail("PROCESS_DSL_INVALID", "findings");
  if (JSON.stringify(document.coverage) !== JSON.stringify(processCoverage(document))) fail("PROCESS_DSL_INVALID", "coverage");
  return document;
}

function stringsOrEmpty(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

export function renderProcessDsl(document: ProcessDocument): string {
  validateProcessDocument(document);
  return [
    `PROCESS_DSL ${JSON.stringify(document.id)}`,
    `PROJECT ${JSON.stringify(document.projectId)}`,
    `SNAPSHOT ${JSON.stringify(document.sourceSnapshotHash)}`,
    ...document.processes.map((process) => `PROCESS ${JSON.stringify(process)}`),
    `COVERAGE ${JSON.stringify(document.coverage)}`,
    `FINDINGS ${JSON.stringify(document.findings)}`,
    "END_PROCESS_DSL",
    "",
  ].join("\n");
}

function jsonAfter(line: string, keyword: string): unknown {
  try { return JSON.parse(line.slice(keyword.length).trim()); }
  catch { return fail("PROCESS_DSL_INVALID", keyword.toLowerCase()); }
}

export function parseProcessDsl(text: string, componentIds?: Iterable<string>): ProcessDocument {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines[0]?.startsWith("PROCESS_DSL ") || lines.at(-1) !== "END_PROCESS_DSL") fail("PROCESS_DSL_INVALID", "envelope");
  const id = jsonAfter(lines[0], "PROCESS_DSL");
  const projectLine = lines.find((line) => line.startsWith("PROJECT "));
  const snapshotLine = lines.find((line) => line.startsWith("SNAPSHOT "));
  const coverageLine = lines.find((line) => line.startsWith("COVERAGE "));
  const findingsLine = lines.find((line) => line.startsWith("FINDINGS "));
  if (typeof id !== "string" || !projectLine || !snapshotLine || !coverageLine || !findingsLine) fail("PROCESS_DSL_INVALID", "required-lines");
  return validateProcessDocument({
    schema: "subactor.process/v1",
    id,
    projectId: jsonAfter(projectLine, "PROJECT"),
    sourceSnapshotHash: jsonAfter(snapshotLine, "SNAPSHOT"),
    processes: lines.filter((line) => line.startsWith("PROCESS ")).map((line) => jsonAfter(line, "PROCESS")),
    coverage: jsonAfter(coverageLine, "COVERAGE"),
    findings: jsonAfter(findingsLine, "FINDINGS"),
  }, componentIds);
}
