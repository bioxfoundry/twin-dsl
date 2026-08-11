import type {
  ProcessAnimation,
  ProcessAnimationClip,
  ProcessAnimationDocument,
  ProcessAnimationEffect,
  ProcessDefinition,
  ProcessDocument,
  ProcessInteraction,
  SceneDocument,
} from "../core/types.js";
import { contentUri } from "../core/canonical.js";
import { validateProcessDocument } from "../dsl/process.js";

export const PRESENTATION_STEP_DURATION_MS = 1600;
export const PROCESS_TIMING_DISCLAIMER = "Normalized display timing only; it is not laboratory execution time and does not authorize device control.";

function fail(code: string, detail?: string): never {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function uniqueEffects(effects: ProcessAnimationEffect[]): ProcessAnimationEffect[] {
  return [...new Map(effects.map((effect) => [JSON.stringify(effect), effect])).values()];
}

function interactionEffects(interaction: ProcessInteraction): ProcessAnimationEffect[] {
  switch (interaction.kind) {
    case "validation":
      return interaction.componentIds.map((componentId) => ({ kind: "highlight", componentId, state: "active", basis: "presentation-only" }));
    case "command":
      return [
        ...(interaction.fromComponentId && interaction.toComponentId ? [{ kind: "flow" as const, fromComponentId: interaction.fromComponentId, toComponentId: interaction.toComponentId, state: "active" as const, basis: "presentation-only" as const }] : []),
        ...interaction.componentIds.map((componentId) => ({ kind: "highlight" as const, componentId, state: "active" as const, basis: "presentation-only" as const })),
      ];
    case "operation":
      return interaction.componentIds.map((componentId) => ({ kind: "pulse", componentId, state: "active", basis: "presentation-only" }));
    case "observation":
      return [
        ...(interaction.fromComponentId && interaction.toComponentId ? [{ kind: "flow" as const, fromComponentId: interaction.fromComponentId, toComponentId: interaction.toComponentId, state: "observing" as const, basis: "presentation-only" as const }] : []),
        ...interaction.componentIds.map((componentId) => ({ kind: "highlight" as const, componentId, state: "observing" as const, basis: "presentation-only" as const })),
      ];
    case "state-update":
      return interaction.componentIds.map((componentId) => ({ kind: "state", componentId, state: "completed", basis: "presentation-only" }));
    case "safety":
      return interaction.componentIds.map((componentId) => ({ kind: "state", componentId, state: "recovering", basis: "presentation-only" }));
  }
}

function follow(process: ProcessDefinition, failure: boolean): string[] {
  if (!process.entryStepId) return [];
  const byId = new Map(process.steps.map((step) => [step.id, step]));
  const result: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = process.entryStepId;
  let failed = false;
  while (current && !seen.has(current)) {
    seen.add(current);
    result.push(current);
    const step = byId.get(current);
    if (!step) break;
    if (failure && !failed && step.transitions.failure) {
      failed = true;
      current = step.transitions.failure;
    } else current = step.transitions.success;
  }
  return result;
}

function animationFor(process: ProcessDefinition): ProcessAnimation {
  if (!process.steps.length) {
    return { processId: process.id, available: false, unavailableReason: process.completeness === "declared-only" ? "PROCESS_DETAIL_DECLARED_ONLY" : "PROCESS_EVIDENCE_MISSING", successStepIds: [], failureStepIds: [], clips: [] };
  }
  const clips: ProcessAnimationClip[] = process.steps.map((step, index) => ({
    stepId: step.id,
    startMs: index * PRESENTATION_STEP_DURATION_MS,
    endMs: (index + 1) * PRESENTATION_STEP_DURATION_MS,
    effects: uniqueEffects(step.interactions.flatMap(interactionEffects)),
  }));
  const failureStepIds = process.failureStepId ? follow(process, true) : [];
  return { processId: process.id, available: true, successStepIds: follow(process, false), failureStepIds, clips };
}

export function compileProcessAnimation(processes: ProcessDocument, scene: SceneDocument): ProcessAnimationDocument {
  validateProcessDocument(processes);
  const document: ProcessAnimationDocument = {
    schema: "subactor.process-animation/v1",
    id: `${processes.projectId}-process-animation`,
    projectId: processes.projectId,
    sourceProcessUri: contentUri("process", processes),
    sourceSceneId: scene.id,
    timing: {
      mode: "normalized-presentation",
      factualProcessDuration: false,
      stepDurationMs: PRESENTATION_STEP_DURATION_MS,
      disclaimer: PROCESS_TIMING_DISCLAIMER,
    },
    animations: processes.processes.map(animationFor),
  };
  return validateProcessAnimation(document, processes, scene);
}

export function validateProcessAnimation(value: unknown, processes?: ProcessDocument, scene?: SceneDocument): ProcessAnimationDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("PROCESS_ANIMATION_INVALID", "document");
  const document = value as ProcessAnimationDocument;
  if (document.schema !== "subactor.process-animation/v1" || !document.id || !document.projectId || !document.sourceProcessUri ||
    !document.sourceSceneId || !document.timing || document.timing.mode !== "normalized-presentation" ||
    document.timing.factualProcessDuration !== false || !Number.isInteger(document.timing.stepDurationMs) ||
    document.timing.stepDurationMs < 100 || !document.timing.disclaimer || !Array.isArray(document.animations)) fail("PROCESS_ANIMATION_TIMING_INVALID");
  if (new Set(document.animations.map((animation) => animation.processId)).size !== document.animations.length) fail("PROCESS_ANIMATION_INVALID", "duplicate-process");
  const processById = new Map(processes?.processes.map((process) => [process.id, process]) ?? []);
  const sceneComponents = new Set(scene?.bindings.map((binding) => binding.componentId).filter((value): value is string => Boolean(value)) ?? []);
  if (processes && document.sourceProcessUri !== contentUri("process", processes)) fail("PROCESS_ANIMATION_INVALID", "process-uri");
  if (scene && document.sourceSceneId !== scene.id) fail("PROCESS_ANIMATION_INVALID", "scene-id");
  for (const animation of document.animations) {
    if (!animation.processId || typeof animation.available !== "boolean" || !Array.isArray(animation.successStepIds) ||
      !Array.isArray(animation.failureStepIds) || !Array.isArray(animation.clips) ||
      (!animation.available && !animation.unavailableReason)) fail("PROCESS_ANIMATION_INVALID", animation.processId || "animation");
    const process = processById.get(animation.processId);
    if (processes && !process) fail("PROCESS_ANIMATION_INVALID", `unknown-process:${animation.processId}`);
    const stepIds = new Set(process?.steps.map((step) => step.id) ?? animation.clips.map((clip) => clip.stepId));
    for (const stepId of [...animation.successStepIds, ...animation.failureStepIds]) if (!stepIds.has(stepId)) fail("PROCESS_ANIMATION_INVALID", `${animation.processId}:${stepId}`);
    for (const clip of animation.clips) {
      if (!stepIds.has(clip.stepId) || !Number.isInteger(clip.startMs) || !Number.isInteger(clip.endMs) || clip.startMs < 0 || clip.endMs <= clip.startMs || !Array.isArray(clip.effects)) {
        fail("PROCESS_ANIMATION_INVALID", `${animation.processId}:${clip.stepId}`);
      }
      for (const effect of clip.effects) {
        if (!effect || !["highlight", "pulse", "flow", "state"].includes(effect.kind) || effect.basis !== "presentation-only") fail("PROCESS_ANIMATION_INVALID", `${animation.processId}:${clip.stepId}:effect`);
        const ids = [effect.componentId, effect.fromComponentId, effect.toComponentId].filter(Boolean) as string[];
        if (!ids.length || scene && ids.some((componentId) => !sceneComponents.has(componentId))) fail("PROCESS_ANIMATION_COMPONENT_MISSING", `${animation.processId}:${clip.stepId}:${ids.join(",") || "none"}`);
      }
    }
  }
  return document;
}

export function renderProcessAnimationDsl(document: ProcessAnimationDocument): string {
  validateProcessAnimation(document);
  return [
    `PROCESS_ANIMATION_DSL ${JSON.stringify(document.id)}`,
    `PROJECT ${JSON.stringify(document.projectId)}`,
    `SOURCE_PROCESS ${JSON.stringify(document.sourceProcessUri)}`,
    `SOURCE_SCENE ${JSON.stringify(document.sourceSceneId)}`,
    `TIMING ${JSON.stringify(document.timing)}`,
    ...document.animations.map((animation) => `ANIMATION ${JSON.stringify(animation)}`),
    "END_PROCESS_ANIMATION_DSL",
    "",
  ].join("\n");
}

function jsonAfter(line: string, keyword: string): unknown {
  try { return JSON.parse(line.slice(keyword.length).trim()); }
  catch { return fail("PROCESS_ANIMATION_INVALID", keyword.toLowerCase()); }
}

export function parseProcessAnimationDsl(text: string, processes?: ProcessDocument, scene?: SceneDocument): ProcessAnimationDocument {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines[0]?.startsWith("PROCESS_ANIMATION_DSL ") || lines.at(-1) !== "END_PROCESS_ANIMATION_DSL") fail("PROCESS_ANIMATION_INVALID", "envelope");
  const projectLine = lines.find((line) => line.startsWith("PROJECT "));
  const processLine = lines.find((line) => line.startsWith("SOURCE_PROCESS "));
  const sceneLine = lines.find((line) => line.startsWith("SOURCE_SCENE "));
  const timingLine = lines.find((line) => line.startsWith("TIMING "));
  if (!projectLine || !processLine || !sceneLine || !timingLine) fail("PROCESS_ANIMATION_INVALID", "required-lines");
  return validateProcessAnimation({
    schema: "subactor.process-animation/v1",
    id: jsonAfter(lines[0], "PROCESS_ANIMATION_DSL"),
    projectId: jsonAfter(projectLine, "PROJECT"),
    sourceProcessUri: jsonAfter(processLine, "SOURCE_PROCESS"),
    sourceSceneId: jsonAfter(sceneLine, "SOURCE_SCENE"),
    timing: jsonAfter(timingLine, "TIMING"),
    animations: lines.filter((line) => line.startsWith("ANIMATION ")).map((line) => jsonAfter(line, "ANIMATION")),
  }, processes, scene);
}
