import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { validateSceneBlueprint } from "../scene/blueprint.js";
import { flattenTwin, validateTwin as validateTwinDocument } from "../dsl/twin.js";
import { validateScene as validateSceneDocument } from "../dsl/scene.js";
import type { SceneDocument, TwinDocument } from "../core/types.js";

const REPORT_SCHEMA = "bioxfoundry.specification-dsl-validation/v1" as const;
const INTENT_TYPES = new Set(["claim", "decision", "message", "plan", "report", "request", "result"]);
const CANONICAL_DOCUMENT = "Atvirojo kodo biofoundry studija.pdf";
const REQUIRED_CANONICAL_PAGES = [10, 11, 12, 13, 14, 15, 16, 17];
const REQUIRED_COMPONENTS: Record<string, string[]> = {
  oscar_robot_01: ["oscar"],
  biospec_bioreactor_01: ["bio-spec", "biospec"],
  microscope_module_01: ["microscop"],
  microfluidic_assembly_01: ["microfluid"],
  syringebot_01: ["syringebot", "chemical synthesis robot"],
  cleanroom_base_01: ["cleanroom", "clean room"],
  chemos_planner_01: ["chemos"],
  sila_orchestrator_01: ["sila 2"],
  ros2_robotics_01: ["ros 2"],
  opentwins_state_01: ["opentwins"],
};
const CORRUPTION_PATTERNS: Array<{ pattern: RegExp; example: string }> = [
  { pattern: /\bLaminar flow food\b/i, example: "Laminar flow food" },
  { pattern: /\bSmithKline\s+3\s*850/i, example: "SmithKline 3 850" },
  { pattern: /\bPLN\s+6000\s+EUR\b/i, example: "PLN 6000 EUR" },
  { pattern: /\breach\s+\.0,5\s*m\b/i, example: "reach .0,5 m" },
  { pattern: /\bsila\s+_\s+base\b/i, example: "sila _ base" },
];

export type SpecificationValidationStatus = "PASS" | "FAIL" | "NOT_RUN";
export type SpecificationFindingSeverity = "error" | "warning" | "info";

export interface SpecificationValidationFinding {
  code: string;
  severity: SpecificationFindingSeverity;
  path: string;
  message: string;
  remediation: string;
  document?: string;
  recordId?: string;
}

export interface SpecificationDocumentValidation {
  document: string;
  sourceSha256: string;
  sourceMarkdown?: string;
  translatedMarkdown?: string;
  sourcePages: number;
  translatedPages: number;
  sourceDiagrams: number;
  translatedDiagrams: number;
  intentRecords: number;
  intentPages: number[];
  status: SpecificationValidationStatus;
}

export interface SpecificationDslValidationReport {
  schema: typeof REPORT_SCHEMA;
  status: SpecificationValidationStatus;
  inputs: {
    sourceDir: string;
    markdownDir: string;
    dslDir: string;
    blueprintPath?: string;
    intentIndexPath?: string;
    twinPath?: string;
    scenePath?: string;
  };
  summary: { documents: number; checks: number; errors: number; warnings: number; info: number };
  documents: SpecificationDocumentValidation[];
  twin: {
    status: SpecificationValidationStatus;
    componentCount?: number;
    bindingCount?: number;
    activeComponentCount?: number;
    activeBindingCount?: number;
    requiredComponents?: Record<string, boolean>;
    groundedRequiredComponents?: Record<string, boolean>;
    canonicalIntentPrioritized?: boolean;
  };
  findings: SpecificationValidationFinding[];
}

export interface SpecificationDslValidationInput {
  sourceDir: string;
  markdownDir: string;
  dslDir: string;
  blueprintPath?: string;
  intentIndexPath?: string;
  twinPath?: string;
  scenePath?: string;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function digest(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function frontmatter(markdown: string): Record<string, string> {
  if (!markdown.startsWith("---\n")) return {};
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) return {};
  const result: Record<string, string> = {};
  for (const line of markdown.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match) continue;
    const raw = match[2].trim();
    try { result[match[1]] = JSON.parse(raw) as string; }
    catch { result[match[1]] = raw; }
  }
  return result;
}

function sidecar(markdownPath: string, suffix: string): string {
  return markdownPath.replace(/\.md$/, suffix);
}

function structurePages(value: unknown): number[] {
  if (!object(value) || !Array.isArray(value.pages)) return [];
  return value.pages.flatMap((page) => object(page) && Number.isInteger(page.number) ? [Number(page.number)] : []);
}

function structureSourceHash(value: unknown): string | undefined {
  return object(value) && typeof value.sourceSha256 === "string" ? value.sourceSha256 : undefined;
}

function structureMarkdownHash(value: unknown): string | undefined {
  return object(value) && typeof value.canonicalMarkdownSha256 === "string" ? value.canonicalMarkdownSha256 : undefined;
}

function markdownBody(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) return markdown;
  const body = markdown.slice(end + 5);
  // f2md front matter deliberately leaves one visual blank line before the canonical body; that
  // separator is not part of canonicalMarkdownSha256.
  return body.startsWith("\n") ? body.slice(1) : body;
}

function textDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function imageTargets(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]\n]*\]\(([^\n)]+)\)/g)].map((match) => match[1].trim());
}

function malformedImageLines(markdown: string): string[] {
  return markdown.split(/\r?\n/).filter((line) => /^\s*!\s+/.test(line) || /^\s*!\[[^\]]*\]\s+\(/.test(line));
}

function qualityStatus(markdown: string, qualityDsl?: string): string {
  const fm = frontmatter(markdown).qualityStatus?.toUpperCase();
  const dsl = qualityDsl?.match(/^STATUS\s+(\S+)/m)?.[1]?.toUpperCase();
  return dsl ?? fm ?? "NOT_RUN";
}

function flattenBlueprintComponents(components: unknown[]): JsonObject[] {
  return components.filter(object);
}

function finding(
  findings: SpecificationValidationFinding[],
  value: SpecificationValidationFinding,
): void {
  findings.push(value);
}

async function validateMarkdownPair(input: {
  document: string;
  sourcePath: string;
  sourceMarkdownPath: string;
  translatedMarkdownPath: string;
  findings: SpecificationValidationFinding[];
}): Promise<{
  sourceSha256: string;
  sourcePages: number;
  translatedPages: number;
  sourceDiagrams: number;
  translatedDiagrams: number;
}> {
  const { document, sourcePath, sourceMarkdownPath, translatedMarkdownPath, findings } = input;
  const sourceSha256 = await digest(sourcePath);
  const before = findings.length;
  const missing: string[] = [];
  for (const path of new Set([sourceMarkdownPath, translatedMarkdownPath])) {
    if (!await exists(path)) missing.push(path);
  }
  if (missing.length) {
    finding(findings, {
      code: "SPEC_MARKDOWN_MISSING", severity: "error", path: missing[0] ?? sourceMarkdownPath,
      document, message: "Source-language or translated Markdown is missing.",
      remediation: "Regenerate the PDF mirror before compiling intentDSL.",
    });
  }
  const sourceMarkdown = await readFile(sourceMarkdownPath, "utf8").catch(() => "");
  const translatedMarkdown = await readFile(translatedMarkdownPath, "utf8").catch(() => "");
  const sourceStructurePath = sidecar(sourceMarkdownPath, ".structure.json");
  const translatedStructurePath = sidecar(translatedMarkdownPath, ".structure.json");
  const sourceStructure = await json(sourceStructurePath).catch(() => undefined);
  const translatedStructure = await json(translatedStructurePath).catch(() => undefined);
  for (const [path, value, markdown] of [
    [sourceStructurePath, sourceStructure, sourceMarkdown],
    [translatedStructurePath, translatedStructure, translatedMarkdown],
  ] as const) {
    if (!value) finding(findings, {
      code: "SPEC_MARKDOWN_STRUCTURE_MISSING", severity: "error", path, document,
      message: "Markdown structure sidecar is missing or unreadable.",
      remediation: "Regenerate Markdown and its structure/quality sidecars atomically.",
    });
    else if (structureSourceHash(value) !== sourceSha256) finding(findings, {
      code: "SPEC_MARKDOWN_SOURCE_HASH_MISMATCH", severity: "error", path, document,
      message: "Structure sidecar is not bound to the current source PDF bytes.",
      remediation: "Regenerate the document from the current PDF and do not reuse stale sidecars.",
    });
    if (value && structureMarkdownHash(value) !== textDigest(markdownBody(markdown))) finding(findings, {
      code: "SPEC_MARKDOWN_CONTENT_HASH_MISMATCH", severity: "error", path, document,
      message: "Structure sidecar is not bound to the current Markdown body bytes.",
      remediation: "Regenerate Markdown and structure atomically before compiling intentDSL.",
    });
  }
  const sourcePages = structurePages(sourceStructure);
  const translatedPages = structurePages(translatedStructure);
  if (!sourcePages.length || !translatedPages.length || translatedPages.length !== sourcePages.length || translatedPages.some((page, index) => page !== sourcePages[index])) {
    finding(findings, {
      code: "SPEC_MARKDOWN_PAGE_COVERAGE_MISMATCH", severity: "error", path: translatedStructurePath, document,
      message: `Translated page coverage ${translatedPages.join(",") || "none"} does not equal source coverage ${sourcePages.join(",")}.`,
      remediation: "Preserve source-page anchors during translation and rebuild the translated structure.",
    });
  }
  const sourceTargets = imageTargets(sourceMarkdown);
  const translatedTargets = imageTargets(translatedMarkdown);
  const malformed = malformedImageLines(translatedMarkdown);
  if (malformed.length) finding(findings, {
    code: "SPEC_MARKDOWN_DIAGRAM_SYNTAX_INVALID", severity: "error", path: translatedMarkdownPath, document,
    message: `Translated Markdown contains ${malformed.length} malformed image line(s).`,
    remediation: "Protect Markdown image/link tokens from the translation engine and regenerate the artifact.",
  });
  if (sourceTargets.length !== translatedTargets.length || sourceTargets.some((target, index) => target !== translatedTargets[index])) {
    finding(findings, {
      code: "SPEC_MARKDOWN_DIAGRAM_COUNT_MISMATCH", severity: "error", path: translatedMarkdownPath, document,
      message: `Translated diagrams ${translatedTargets.length} do not preserve ${sourceTargets.length} source diagram targets in order.`,
      remediation: "Regenerate the translation with byte-preserved Markdown destinations.",
    });
  }
  for (const markdownPath of [...new Set([sourceMarkdownPath, translatedMarkdownPath])]) {
    const markdown = markdownPath === sourceMarkdownPath ? sourceMarkdown : translatedMarkdown;
    for (const target of imageTargets(markdown)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
      let decoded = target;
      try { decoded = decodeURIComponent(target); } catch { /* an invalid escape stays literal */ }
      const local = resolve(dirname(markdownPath), decoded);
      if (!await exists(local)) finding(findings, {
        code: "SPEC_MARKDOWN_DIAGRAM_TARGET_MISSING", severity: "error", path: markdownPath, document,
        message: `Local diagram target does not exist: ${target}`,
        remediation: "Materialize the referenced diagram beside the Markdown or restore the original relative target.",
      });
    }
  }
  const qualityInputs = [...new Map([
    [sourceMarkdownPath, sourceMarkdown],
    [translatedMarkdownPath, translatedMarkdown],
  ]).entries()];
  const qualityResults: Array<{ path: string; status: string }> = [];
  for (const [markdownPath, markdown] of qualityInputs) {
    const qualityPath = sidecar(markdownPath, ".quality.mdqldsl");
    const qualityDsl = await readFile(qualityPath, "utf8").catch(() => undefined);
    if (qualityDsl === undefined) finding(findings, {
      code: "SPEC_MARKDOWN_QUALITY_MISSING", severity: "error", path: qualityPath, document,
      message: "MarkdownQualityDSL sidecar is missing or unreadable.",
      remediation: "Regenerate Markdown and all structure/quality sidecars atomically.",
    });
    qualityResults.push({path: qualityPath, status: qualityStatus(markdown, qualityDsl)});
  }
  if (findings.length > before && qualityResults.some((item) => item.status === "PASS")) finding(findings, {
    code: "SPEC_MARKDOWN_QUALITY_FALSE_PASS", severity: "error", path: qualityResults.find((item) => item.status === "PASS")?.path ?? translatedMarkdownPath, document,
    message: "MarkdownQualityDSL reports PASS although deterministic structural checks failed.",
    remediation: "Add structural failures to quality scoring and regenerate the quality sidecar.",
  });
  for (const quality of qualityResults) {
    if (quality.status === "FAILED") finding(findings, {
      code: "SPEC_MARKDOWN_QUALITY_FAILED", severity: "error", path: quality.path, document,
      message: "Markdown failed its declared MarkdownQualityDSL contract.",
      remediation: "Inspect failed quality checks, repair the deterministic projection and regenerate all dependent DSL.",
    });
    if (quality.status === "DEGRADED") finding(findings, {
      code: "SPEC_MARKDOWN_QUALITY_DEGRADED", severity: "warning", path: quality.path, document,
      message: "Markdown is usable but has unresolved MarkdownQualityDSL warnings.",
      remediation: "Review warning checks before treating this document as complete evidence.",
    });
  }
  return {
    sourceSha256,
    sourcePages: sourcePages.length,
    translatedPages: translatedPages.length,
    sourceDiagrams: sourceTargets.length,
    translatedDiagrams: translatedTargets.length,
  };
}

async function validateIntentPack(input: {
  document: string;
  markdownPath: string;
  dslPath: string;
  findings: SpecificationValidationFinding[];
}): Promise<{ records: number; pages: number[] }> {
  const { document, markdownPath, dslPath, findings } = input;
  if (!await exists(dslPath)) {
    finding(findings, {
      code: "SPEC_INTENT_PACK_MISSING", severity: "error", path: dslPath, document,
      message: "Expected intentDSL pack is missing.", remediation: "Compile the eligible Markdown corpus before project generation.",
    });
    return { records: 0, pages: [] };
  }
  let pack: unknown;
  try { pack = await json(dslPath); }
  catch {
    finding(findings, {
      code: "SPEC_INTENT_PACK_INVALID", severity: "error", path: dslPath, document,
      message: "intentDSL pack is not valid JSON.", remediation: "Regenerate the pack with the canonical intent compiler.",
    });
    return { records: 0, pages: [] };
  }
  if (!object(pack) || pack.schema !== "t2c.intent-pack/v1" || !Array.isArray(pack.records)) {
    finding(findings, {
      code: "SPEC_INTENT_PACK_INVALID", severity: "error", path: dslPath, document,
      message: "intentDSL pack does not satisfy t2c.intent-pack/v1.", remediation: "Regenerate it and reject unknown pack shapes.",
    });
    return { records: 0, pages: [] };
  }
  if (!pack.records.length) finding(findings, {
    code: "SPEC_INTENT_PACK_INVALID", severity: "error", path: dslPath, document,
    message: "intentDSL pack contains no records.", remediation: "Restore semantic block projection and regenerate the pack.",
  });
  const expectedHash = await digest(markdownPath).catch(() => "");
  const structure = await json(sidecar(markdownPath, ".structure.json")).catch(() => undefined);
  const validPages = new Set(structurePages(structure));
  if (pack.sourceHash !== expectedHash) finding(findings, {
    code: "SPEC_INTENT_SOURCE_HASH_MISMATCH", severity: "error", path: dslPath, document,
    message: "intentDSL sourceHash does not match the translated Markdown bytes.",
    remediation: "Recompile intentDSL after the final Markdown artifact is written.",
  });
  const ids = new Set<string>();
  const pages = new Set<number>();
  const texts: string[] = [];
  const invalidRecordIds: string[] = [];
  for (const raw of pack.records) {
    if (!object(raw) || raw.schema !== "t2c.intent/v1" || typeof raw.id !== "string" || ids.has(raw.id) ||
      typeof raw.text !== "string" || !raw.text.trim() || typeof raw.type !== "string" || !INTENT_TYPES.has(raw.type) ||
      typeof raw.actor !== "string" || !raw.actor || !Array.isArray(raw.targetUris) || !raw.targetUris.length ||
      !raw.targetUris.every((target) => typeof target === "string" && target.length > 0) ||
      !object(raw.source) || !Number.isInteger(raw.source.page) || !validPages.has(Number(raw.source.page)) ||
      typeof raw.source.fragment !== "string" || !raw.source.fragment.includes("#") ||
      raw.source.revisionHash !== expectedHash || typeof raw.source.artifactUri !== "string" ||
      !raw.targetUris.includes(raw.source.artifactUri)) {
      invalidRecordIds.push(object(raw) && typeof raw.id === "string" ? raw.id : "<unknown>");
      continue;
    }
    ids.add(raw.id);
    pages.add(Number(raw.source.page));
    texts.push(raw.text);
  }
  if (invalidRecordIds.length) finding(findings, {
    code: "SPEC_INTENT_PROVENANCE_INVALID", severity: "error", path: dslPath, document,
    recordId: invalidRecordIds[0],
    message: `${invalidRecordIds.length} intent record(s) are malformed, duplicated or lack page-level provenance; first: ${invalidRecordIds[0]}.`,
    remediation: "Compile from a structure sidecar and validate every record before writing the pack.",
  });
  if (document === CANONICAL_DOCUMENT) {
    for (const page of REQUIRED_CANONICAL_PAGES) if (!pages.has(page)) finding(findings, {
      code: "SPEC_INTENT_PAGE_COVERAGE_MISSING", severity: "error", path: dslPath, document,
      message: `Canonical equipment evidence from source page ${page} is absent from intentDSL.`,
      remediation: "Restore semantic page provenance and recompile the canonical study.",
    });
    const combined = texts.join("\n");
    for (const { pattern, example } of CORRUPTION_PATTERNS) if (pattern.test(combined)) finding(findings, {
      code: "SPEC_INTENT_CORRUPTION_DETECTED", severity: "error", path: dslPath, document,
      message: `Known translation corruption remains in intent evidence: ${example}.`,
      remediation: "Repair the translation deterministically, regenerate its structure, then recompile intentDSL.",
    });
  }
  return { records: pack.records.length, pages: [...pages].sort((a, b) => a - b) };
}

async function validateTwin(
  blueprintPath: string | undefined,
  intentIndexPath: string | undefined,
  twinPath: string | undefined,
  scenePath: string | undefined,
  findings: SpecificationValidationFinding[],
): Promise<SpecificationDslValidationReport["twin"]> {
  if (!blueprintPath) return { status: "NOT_RUN" };
  let blueprint: unknown;
  try { blueprint = await json(blueprintPath); }
  catch {
    finding(findings, {
      code: "SPEC_TWIN_BLUEPRINT_INVALID", severity: "error", path: blueprintPath,
      message: "Scene blueprint is missing or unreadable.", remediation: "Provide and validate subactor.scene-blueprint/v1.",
    });
    return { status: "FAIL" };
  }
  try { validateSceneBlueprint(blueprint); }
  catch (error) {
    finding(findings, {
      code: "SPEC_TWIN_BLUEPRINT_INVALID", severity: "error", path: blueprintPath,
      message: `Scene blueprint failed its domain validator: ${error instanceof Error ? error.message : String(error)}.`,
      remediation: "Repair the exact scene-blueprint error and validate the document before generation.",
    });
    return { status: "FAIL" };
  }
  if (!object(blueprint) || !Array.isArray(blueprint.components) || !Array.isArray(blueprint.bindings)) return {status: "FAIL"};
  const components = flattenBlueprintComponents(blueprint.components);
  const before = findings.length;
  const ids = new Set(components.flatMap((component) => typeof component.id === "string" ? [component.id] : []));
  const requiredComponents = Object.fromEntries(Object.keys(REQUIRED_COMPONENTS).map((id) => [id, ids.has(id)]));
  for (const [id, present] of Object.entries(requiredComponents)) if (!present) finding(findings, {
    code: "SPEC_TWIN_REQUIREMENT_UNMAPPED", severity: "error", path: blueprintPath,
    message: `Canonical laboratory requirement has no addressable Twin component: ${id}.`,
    remediation: "Add a distinct grounded component and scene binding, or explicitly document why the requirement is out of scope.",
  });
  if (components.length < 45) finding(findings, {
    code: "SPEC_TWIN_COMPONENT_BASELINE_REDUCED", severity: "error", path: blueprintPath,
    message: `Blueprint contains ${components.length} components; the accepted baseline is at least 45.`,
    remediation: "Restore missing identities; never trade detailed parts for a smaller demo blueprint.",
  });
  const boundIds = new Set(blueprint.bindings.flatMap((binding) =>
    object(binding) && typeof binding.componentId === "string" ? [binding.componentId] : []));
  const unboundIds = [...ids].filter((id) => !boundIds.has(id)).sort();
  if (unboundIds.length) finding(findings, {
    code: "SPEC_TWIN_BINDING_MISSING", severity: "error", path: blueprintPath,
    message: `${unboundIds.length} Twin component(s) have no scene binding; first: ${unboundIds[0]}.`,
    remediation: "Add one stable scene binding for every addressable component; use scope when geometry is not evidenced.",
  });
  let canonicalIntentPrioritized: boolean | undefined;
  if (intentIndexPath) {
    const index = await json(intentIndexPath).catch(() => undefined);
    canonicalIntentPrioritized = object(index) && Array.isArray(index.highPriority) && index.highPriority.some((item) =>
      object(item) && Array.isArray(item.targetUris) && item.targetUris.some((target) =>
        typeof target === "string" && target.toLowerCase().includes("atvirojo kodo biofoundry studija")));
    if (!canonicalIntentPrioritized) finding(findings, {
      code: "SPEC_INTENT_PRIORITY_MISSING", severity: "error", path: intentIndexPath,
      message: "Canonical study contributes no record to the bounded high-priority intent set.",
      remediation: "Rank canonical-study decisions and plans before generic source-URI ordering.",
    });
  }
  if (!twinPath || !scenePath) return {
    status: findings.slice(before).some((item) => item.severity === "error") ? "FAIL" : "NOT_RUN",
    componentCount: components.length,
    bindingCount: blueprint.bindings.length,
    requiredComponents,
    canonicalIntentPrioritized,
  };
  const activeTwin = await json(twinPath).catch(() => undefined);
  const activeScene = await json(scenePath).catch(() => undefined);
  try {
    validateTwinDocument(activeTwin as TwinDocument);
    validateSceneDocument(activeScene as SceneDocument);
  } catch (error) {
    finding(findings, {
      code: "SPEC_TWIN_ARTIFACT_INVALID", severity: "error", path: !activeTwin ? twinPath : scenePath,
      message: `Generated Twin or Scene failed its domain validator: ${error instanceof Error ? error.message : String(error)}.`,
      remediation: "Run a deterministic iteration and repair the first reported Twin/Scene contract error.",
    });
    return {
      status: "FAIL", componentCount: components.length, bindingCount: blueprint.bindings.length,
      requiredComponents, canonicalIntentPrioritized,
    };
  }
  const activeComponents = flattenTwin(activeTwin as TwinDocument);
  const activeIds = new Set(activeComponents.map((component) => component.id));
  const sceneIds = new Set((activeScene as SceneDocument).bindings.map((binding) => binding.componentId));
  const blueprintIds = [...ids].sort();
  const activeIdList = [...activeIds].sort();
  const sceneIdList = [...sceneIds].sort();
  if (JSON.stringify(activeIdList) !== JSON.stringify(blueprintIds) || JSON.stringify(sceneIdList) !== JSON.stringify(activeIdList)) finding(findings, {
    code: "SPEC_TWIN_ARTIFACT_INVALID", severity: "error", path: twinPath,
    message: `Generated identity coverage drifted: blueprint=${blueprintIds.length}, Twin=${activeIdList.length}, Scene=${sceneIdList.length}.`,
    remediation: "Regenerate Twin and Scene from the accepted blueprint; do not publish a partial component projection.",
  });
  const groundedRequiredComponents = Object.fromEntries(Object.keys(REQUIRED_COMPONENTS).map((id) => {
    const component = activeComponents.find((item) => item.id === id);
    const matched = component?.properties?.matchedIntentCount;
    return [id, Boolean(component && typeof matched === "number" && matched > 0)];
  }));
  for (const [id, grounded] of Object.entries(groundedRequiredComponents)) if (!grounded) finding(findings, {
    code: "SPEC_TWIN_REQUIREMENT_UNMAPPED", severity: "error", path: twinPath,
    message: `Generated Twin component has no matched intent evidence: ${id}.`,
    remediation: "Repair deterministic intent-to-component mapping and rerun the Twin iteration.",
  });
  return {
    status: findings.slice(before).some((item) => item.severity === "error") ? "FAIL" : "PASS",
    componentCount: components.length,
    bindingCount: blueprint.bindings.length,
    activeComponentCount: activeComponents.length,
    activeBindingCount: (activeScene as SceneDocument).bindings.length,
    requiredComponents,
    groundedRequiredComponents,
    canonicalIntentPrioritized,
  };
}

export async function validateSpecificationDsl(input: SpecificationDslValidationInput): Promise<SpecificationDslValidationReport> {
  const sourceDir = resolve(input.sourceDir);
  const markdownDir = resolve(input.markdownDir);
  const dslDir = resolve(input.dslDir);
  const findings: SpecificationValidationFinding[] = [];
  const sourceNames = (await readdir(sourceDir).catch(() => []))
    .filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  if (!sourceNames.length || !sourceNames.includes(CANONICAL_DOCUMENT)) finding(findings, {
    code: "SPEC_SOURCE_DOCUMENT_MISSING", severity: "error", path: join(sourceDir, CANONICAL_DOCUMENT),
    document: CANONICAL_DOCUMENT,
    message: !sourceNames.length ? "Specification source directory contains no PDF documents." : "Canonical biofoundry study PDF is missing from the specification source directory.",
    remediation: "Restore the immutable source PDF family before validating or regenerating derived artifacts.",
  });
  const documents: SpecificationDocumentValidation[] = [];
  for (const document of sourceNames) {
    const before = findings.length;
    const sourcePath = join(sourceDir, document);
    const translatedMarkdownPath = join(markdownDir, `${document}.md`);
    const nativeCandidate = join(markdownDir, `${document}.lt.md`);
    const sourceMarkdownPath = await exists(nativeCandidate) ? nativeCandidate : translatedMarkdownPath;
    const markdown = await validateMarkdownPair({document, sourcePath, sourceMarkdownPath, translatedMarkdownPath, findings});
    const intent = await validateIntentPack({
      document,
      markdownPath: translatedMarkdownPath,
      dslPath: join(dslDir, `${document}.md.intent.json`),
      findings,
    });
    documents.push({
      document,
      sourceSha256: markdown.sourceSha256,
      sourceMarkdown: sourceMarkdownPath,
      translatedMarkdown: translatedMarkdownPath,
      sourcePages: markdown.sourcePages,
      translatedPages: markdown.translatedPages,
      sourceDiagrams: markdown.sourceDiagrams,
      translatedDiagrams: markdown.translatedDiagrams,
      intentRecords: intent.records,
      intentPages: intent.pages,
      status: findings.slice(before).some((item) => item.severity === "error") ? "FAIL" : "PASS",
    });
  }
  const twin = await validateTwin(
    input.blueprintPath ? resolve(input.blueprintPath) : undefined,
    input.intentIndexPath ? resolve(input.intentIndexPath) : undefined,
    input.twinPath ? resolve(input.twinPath) : undefined,
    input.scenePath ? resolve(input.scenePath) : undefined,
    findings,
  );
  findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path) || left.message.localeCompare(right.message));
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const info = findings.filter((item) => item.severity === "info").length;
  const status: SpecificationValidationStatus = errors ? "FAIL" : twin.status === "NOT_RUN" ? "NOT_RUN" : "PASS";
  return {
    schema: REPORT_SCHEMA,
    status,
    inputs: {
      sourceDir,
      markdownDir,
      dslDir,
      blueprintPath: input.blueprintPath ? resolve(input.blueprintPath) : undefined,
      intentIndexPath: input.intentIndexPath ? resolve(input.intentIndexPath) : undefined,
      twinPath: input.twinPath ? resolve(input.twinPath) : undefined,
      scenePath: input.scenePath ? resolve(input.scenePath) : undefined,
    },
    summary: { documents: documents.length, checks: 1 + documents.length * 8 + (input.blueprintPath ? 4 : 0) + (input.intentIndexPath ? 1 : 0) + (input.twinPath && input.scenePath ? 3 : 0), errors, warnings, info },
    documents,
    twin,
    findings,
  };
}

export async function writeSpecificationDslValidation(path: string, report: SpecificationDslValidationReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + "\n", "utf8");
}
