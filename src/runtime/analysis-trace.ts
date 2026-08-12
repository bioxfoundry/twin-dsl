import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AnalysisTraceBuildInput,
  AnalysisTraceCitation,
  AnalysisTraceDecision,
  AnalysisTraceDocument,
  IntentRecord,
  ProcessEvidence,
  ResourceRecord,
  TwinComponent,
} from "../core/types.js";
import { canonicalJson, contentUri, sha256 } from "../core/canonical.js";
import { intentSourceAnchor, intentTargetUris, intentText } from "../dsl/intent.js";

const MAX_EXCERPT = 800;
const EXPLANATION_BOUNDARY = "The report records explicit evidence, deterministic rules, outcomes, alternatives and gaps. It does not contain hidden model chain-of-thought.";

function clean(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function excerpt(value: string, limit = MAX_EXCERPT): string {
  const normalized = clean(value);
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}
function flatten(items: TwinComponent[]): TwinComponent[] { return items.flatMap(item => [item, ...flatten(item.children)]); }
function sourceHref(artifactUri: string, revisionHash: string, fragment?: string): string {
  const params = new URLSearchParams({
    artifact: artifactUri,
    revision: revisionHash,
  });
  return `/api/source?${params.toString()}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`;
}
function sourceResourceUri(input: AnalysisTraceBuildInput, intent: IntentRecord): string | undefined {
  const resources = input.resources;
  const source = intentSourceAnchor(intent);
  const sourceHash = source?.revisionHash;
  const target = source?.artifactUri ?? intentTargetUris(intent)[0] ?? "";
  const direct = resources.find(resource => resource.uri === source?.artifactUri || resource.sha256 === sourceHash);
  if (direct) return direct.uri;
  const targetTail = decodeURIComponent(target.split("/").at(-1) ?? "").replace(/\.md$/, "").toLowerCase();
  const intentPack = resources.find(resource => resource.logicalUri.endsWith(".intent.json") &&
    decodeURIComponent(resource.sourcePath).toLowerCase().includes(targetTail));
  if (intentPack) return intentPack.uri;
  const markdown = resources.find(resource => resource.mediaType === "text/markdown" &&
    decodeURIComponent(resource.sourcePath).toLowerCase().includes(targetTail));
  return markdown?.uri;
}
function citationFromIntent(input: AnalysisTraceBuildInput, intent: IntentRecord, sourceUri: string): AnalysisTraceCitation | undefined {
  const source = intentSourceAnchor(intent);
  if (!source) return undefined;
  const fragment = source.fragment?.includes("#") ? source.fragment.split("#").at(-1) : source.fragment;
  return {
    id: `intent-${intent.id}`,
    kind: "internal",
    title: source.artifactUri.split("/").at(-1) ?? source.artifactUri,
    href: sourceHref(source.artifactUri, source.revisionHash, fragment),
    artifactUri: source.artifactUri,
    resourceUri: sourceResourceUri(input, intent) ?? sourceUri,
    revisionHash: source.revisionHash,
    ...(source.page ? { page: source.page } : {}),
    ...(source.lines ? { lines: source.lines } : {}),
    ...(fragment ? { fragment } : {}),
    excerpt: excerpt(intentText(intent)),
    converter: source.converter,
    converterVersion: source.converterVersion,
  };
}
function intentMatching(input: AnalysisTraceBuildInput, includes: string[]): { record: IntentRecord; sourceUri: string } | undefined {
  return input.groundedIntents.find(({ record }) => {
    const text = clean(intentText(record)).toLowerCase();
    return includes.every(part => text.includes(part.toLowerCase()));
  });
}
function processCitation(input: AnalysisTraceBuildInput, evidence: ProcessEvidence): AnalysisTraceCitation {
  const found = input.groundedIntents.find(({ record }) => record.id === evidence.intentId);
  const derived = found ? citationFromIntent(input, found.record, found.sourceUri) : undefined;
  return derived ?? {
    id: `intent-${evidence.intentId}`,
    kind: "internal",
    title: evidence.artifactUri.split("/").at(-1) ?? evidence.artifactUri,
    href: sourceHref(evidence.artifactUri, evidence.revisionHash, evidence.fragment?.split("#").at(-1)),
    artifactUri: evidence.artifactUri,
    resourceUri: evidence.sourceUri,
    revisionHash: evidence.revisionHash,
    ...(evidence.page ? { page: evidence.page } : {}),
    ...(evidence.fragment ? { fragment: evidence.fragment } : {}),
    excerpt: excerpt(evidence.excerpt),
  };
}
function byRole(resources: ResourceRecord[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const resource of resources) result[resource.sourceRole ?? "project"] = (result[resource.sourceRole ?? "project"] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
function decisionChanges(previous: AnalysisTraceDocument | undefined, decisions: AnalysisTraceDecision[], outputs: AnalysisTraceDocument["outputs"]): string[] {
  if (!previous) return ["INITIAL_TRACE"];
  const changes: string[] = [];
  const old = new Map(previous.decisions.map(decision => [decision.id, canonicalJson(decision)]));
  for (const decision of decisions) {
    const prior = old.get(decision.id);
    if (!prior) changes.push(`DECISION_ADDED:${decision.id}`);
    else if (prior !== canonicalJson(decision)) changes.push(`DECISION_CHANGED:${decision.id}`);
    old.delete(decision.id);
  }
  for (const id of old.keys()) changes.push(`DECISION_REMOVED:${id}`);
  for (const key of Object.keys(outputs) as Array<keyof typeof outputs>) {
    if (canonicalJson(previous.outputs[key]) !== canonicalJson(outputs[key])) changes.push(`OUTPUT_CHANGED:${String(key)}:${String(previous.outputs[key] ?? "missing")}→${String(outputs[key] ?? "missing")}`);
  }
  return changes.sort();
}
function escapeDsl(value: unknown): string { return JSON.stringify(value); }
function componentIntentRecords(component: TwinComponent, input: AnalysisTraceBuildInput): Array<{record:IntentRecord;sourceUri:string}> {
  const raw = Array.isArray(component.properties.intentEvidence) ? component.properties.intentEvidence as Array<{intentId?:unknown}> : [];
  const ids = new Set(raw.map(item=>typeof item.intentId==="string"?item.intentId:"").filter(Boolean));
  return input.groundedIntents.filter(item=>ids.has(item.record.id)).slice(0,5);
}
function evidenceConfidence(component:TwinComponent,binding:AnalysisTraceBuildInput["scene"]["bindings"][number]|undefined):AnalysisTraceDecision["confidence"] {
  const geometry=String(component.properties.geometryEvidence??"placeholder").toLowerCase();
  const semantic=String(component.properties.semanticEvidence??"").toLowerCase();
  const representation=String(component.properties.geometryRepresentationClass??"").toLowerCase();
  if(["functional-reference","model-specific-reference"].includes(representation)) return "medium";
  if(binding?.assetUri||["verified","ifc","measured","cad"].includes(geometry)) return "high";
  if(semantic==="direct"||geometry.includes("document")||geometry.includes("archive")) return "medium";
  return "low";
}

export function buildAnalysisTrace(input: AnalysisTraceBuildInput): AnalysisTraceDocument {
  const components = flatten(input.twin.components);
  const meshes = input.scene.bindings.filter(binding => Boolean(binding.assetUri));
  const uniqueMeshes = new Set(meshes.map(binding => binding.assetUri));
  const primitiveFallbacks = input.scene.bindings.filter(binding=>!binding.assetUri&&Boolean(binding.primitive)&&binding.primitive!=="scope").length;
  const citations = new Map<string, AnalysisTraceCitation>();
  const addCitation = (citation: AnalysisTraceCitation | undefined): string | undefined => {
    if (!citation) return undefined;
    citations.set(citation.id, citation);
    return citation.id;
  };

  const canonicalRpi = intentMatching(input, ["raspberry pi 4 / 5"]);
  const hardwareRpi = intentMatching(input, ["raspberry pi 3 b", "1 gb ram"])
    ?? intentMatching(input, ["all electronics are controlled by a rpi 3"]);
  const canonicalRpiCitation = canonicalRpi ? addCitation(citationFromIntent(input, canonicalRpi.record, canonicalRpi.sourceUri)) : undefined;
  const hardwareRpiCitation = hardwareRpi ? addCitation(citationFromIntent(input, hardwareRpi.record, hardwareRpi.sourceUri)) : undefined;
  const controller = components.find(component => component.id === "biospec_controller_01");
  const controllerBinding = input.scene.bindings.find(binding => binding.componentId === controller?.id);
  const relatedCad = Number(controller?.properties.cadAssetCount ?? 0);

  const decisions: AnalysisTraceDecision[] = [];
  if (controller) decisions.push({
    id: "biospec-controller-identity",
    subject: controller.id,
    outcome: "Keep the generic BIO-SPEC Raspberry Pi controller identity; retain Raspberry Pi 3 B only as the implementation-BOM reference until the installed board is surveyed.",
    ruleId: "DT-EVIDENCE-SPECIFICITY-001",
    confidence: canonicalRpi && hardwareRpi ? "medium" : "low",
    basis: "The canonical specification permits Raspberry Pi 4 or 5, while the cited BIO-SPEC implementation reports Raspberry Pi 3. Conflicting revisions cannot be collapsed into one exact physical asset.",
    citationIds: [canonicalRpiCitation, hardwareRpiCitation].filter((id): id is string => Boolean(id)),
    alternatives: [
      { value: "Raspberry Pi 5", status: "unresolved", reason: "Allowed by the specification but not confirmed as the installed board." },
      { value: "Raspberry Pi 4 Model B", status: "unresolved", reason: "Allowed by the specification but not confirmed as the installed board." },
      { value: "Raspberry Pi 3 B", status: "selected-reference", reason: "Reported exactly by the implementation bill of materials; later planning still permits replacement with Raspberry Pi 4 / 5." },
    ],
    gaps: ["Observed equipment register or user confirmation of board model and revision is missing."],
  });
  if (controller && controllerBinding) decisions.push({
    id: "biospec-controller-geometry",
    subject: controller.id,
    outcome: controllerBinding.assetUri ? `Bind grounded asset ${controllerBinding.assetUri}.` : `Render ${controllerBinding.primitive ?? "cube"} fallback; no component-level grounded mesh is available.`,
    ruleId: "DT-GEOMETRY-GROUNDING-001",
    confidence: "high",
    basis: controllerBinding.assetUri
      ? `The immutable asset passed physical-evidence intake. The implementation BOM identifies Raspberry Pi 3 B, while the community OpenSCAD geometry remains a model-specific reference rather than manufacturer/as-built CAD.`
      : `Scene assets require an ingested immutable resource URI. ${relatedCad} CAD files matched the broader BIO-SPEC source pack, but no selected asset is specifically evidenced as Raspberry Pi geometry.`,
    citationIds: [canonicalRpiCitation, hardwareRpiCitation, "external-rpi-hardware-docs", "external-rpi-community-model", "external-rpi5-product-portal", "external-biospec-osf"].filter((id): id is string => Boolean(id)),
    alternatives: [
      { value: "Bind related bioreactor CAD candidates", status: "rejected", reason: "The candidates are lids, fittings and sleeves; source-pack proximity is not component identity." },
      { value: "Use the pinned Raspberry Pi 3 B community model", status: controllerBinding.assetUri?"selected-reference":"deferred", reason: "Permitted only with revision, GPL attribution, metre normalization, content hash and an explicit non-as-built classification." },
      { value: "Import manufacturer/user supplied or surveyed geometry", status: "deferred", reason: "This would supersede the reference after hash, license, units and component mapping pass physical-evidence intake." },
    ],
    gaps: ["Exact Raspberry Pi model", "Grounded CAD/mesh URI", "License and attribution", "Measured installation pose and enclosure"],
  });
  for(const component of components) {
    const binding=input.scene.bindings.find(item=>item.componentId===component.id);
    const componentCitations=componentIntentRecords(component,input).map(item=>addCitation(citationFromIntent(input,item.record,item.sourceUri))).filter((id):id is string=>Boolean(id));
    if(component.id==="biospec_controller_01") for(const id of [canonicalRpiCitation,hardwareRpiCitation]) if(id&&!componentCitations.includes(id)) componentCitations.push(id);
    const geometry=String(component.properties.geometryEvidence??"placeholder");
    const placement=String(component.properties.placementBasis??component.properties.geometryOrigin??"unspecified");
    const matchedResources=Number(component.properties.matchedResourceCount??component.sourceUris.length??0);
    const matchedIntents=Number(component.properties.matchedIntentCount??componentCitations.length??0);
    const asset=binding?.assetUri;
    const gaps:string[]=[];
    if(!asset&&binding?.primitive&&binding.primitive!=="scope") gaps.push("Component-level grounded mesh is missing; renderer uses a primitive fallback.");
    if(/presentation|unspecified/i.test(placement)) gaps.push("Installation pose is presentation-only or unspecified, not measured/as-built evidence.");
    if(!componentCitations.length&&matchedIntents===0) gaps.push("No component-specific intent citation is attached.");
    decisions.push({
      id:`component-projection:${component.id}`,
      subject:component.id,
      outcome:`Project as type=${component.type}, geometry=${geometry}, scene=${binding?.scenePath??"unbound"}, representation=${asset??binding?.primitive??"scope"}.`,
      ruleId:"DT-COMPONENT-PROJECTION-001",
      confidence:evidenceConfidence(component,binding),
      basis:`Stable blueprint/component identity matched ${matchedResources} resource(s) and ${matchedIntents} intent record(s); geometry and placement grades are kept distinct from semantic evidence.`,
      citationIds:componentCitations,
      alternatives:[
        ...(!asset&&Number(component.properties.cadAssetCount??0)>0?[{value:"Bind a related source-pack CAD candidate",status:"rejected" as const,reason:"A related candidate count does not establish component-level geometry identity."}]:[]),
        ...(!asset&&binding?.primitive?[{value:"Omit the component from the scene",status:"rejected" as const,reason:"Semantic presence is evidenced; a visibly graded fallback preserves identity without fabricating detail."}]:[]),
      ],
      gaps,
    });
  }
  for(const process of input.processes?.processes??[]) {
    const evidence=[...new Map([...process.evidence,...process.steps.flatMap(step=>step.evidence)].map(item=>[item.intentId,item])).values()];
    const citationIds=evidence.map(item=>addCitation(processCitation(input,item))).filter((id):id is string=>Boolean(id));
    decisions.push({
      id:`process-projection:${process.id}`,
      subject:process.id,
      outcome:`Project ${process.steps.length} step(s), ordering=${process.ordering}, completeness=${process.completeness}, animation=${process.steps.length?"available":"unavailable"}.`,
      ruleId:"DT-PROCESS-EVIDENCE-001",
      confidence:process.completeness==="complete"?"high":process.completeness==="partial"?"medium":"low",
      basis:`Process ordering, actors, interactions and parameters are derived from ${evidence.length} unique intent citation(s); missing evidence remains an explicit gap.`,
      citationIds,
      alternatives:[
        ...(process.ordering!=="source"?[{value:"Present inferred step order as factual",status:"rejected" as const,reason:"Only source ordering may be represented as factual; presentation ordering is labeled separately."}]:[]),
      ],
      gaps:[...process.gaps,...process.steps.flatMap(step=>step.gaps.map(gap=>`${step.id}: ${gap}`))],
    });
  }
  decisions.push({
    id: "process-animation-timing",
    subject: "process-animation",
    outcome: "Use normalized presentation timing; do not claim laboratory duration or device command authority.",
    ruleId: "DT-PROCESS-PRESENTATION-001",
    confidence: "high",
    basis: "ProcessDSL supplies evidenced ordering and interactions, but the current evidence does not provide authoritative elapsed time for every step.",
    citationIds: [],
    alternatives: [
      { value: "Treat animation duration as factual", status: "rejected", reason: "No complete time-series or procedure duration evidence supports that interpretation." },
      { value: "Control hardware from animation", status: "rejected", reason: "The MQTT v1 boundary is observe-only." },
    ],
    gaps: input.processes?.findings.map(finding => `${finding.code}:${finding.processId ?? "process"}:${finding.stepId ?? "step"}`) ?? ["No ProcessDSL projection"],
  });

  const processEvidence = input.processes?.processes.flatMap(process => [
    ...process.evidence,
    ...process.steps.flatMap(step => step.evidence),
  ]) ?? [];
  for (const evidence of processEvidence) addCitation(processCitation(input, evidence));

  addCitation({
    id: "external-rpi-hardware-docs",
    kind: "external",
    title: "Raspberry Pi computer hardware — schematics and mechanical drawings",
    href: "https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#schematics-and-mechanical-drawings",
    excerpt: "Manufacturer documentation used only as an external acquisition candidate; it does not prove which board is installed in this project.",
  });
  addCitation({
    id: "external-rpi-community-model",
    kind: "external",
    title: "openscad-rpi-library — Raspberry Pi 3 Model B parametric reference",
    href: "https://github.com/RigacciOrg/openscad-rpi-library/tree/1279e706cd88bc3f2df6918d7f005bfc0c60cdef",
    excerpt: "Pinned GPL-3.0 community OpenSCAD reference used after deterministic tessellation, unit normalization and hash verification; not manufacturer or as-built CAD.",
    license: "GPL-3.0",
  });
  addCitation({
    id: "external-rpi5-product-portal",
    kind: "external",
    title: "Raspberry Pi 5 Product Information Portal",
    href: "https://pip.raspberrypi.com/categories/892-raspberry-pi-5",
    excerpt: "Manufacturer source for Raspberry Pi 5 STEP downloads. Import still requires license and component-revision validation.",
  });
  addCitation({
    id: "external-biospec-doi",
    kind: "external",
    title: "BIO-SPEC: An open-source bench-top parallel bioreactor system",
    href: "https://doi.org/10.1016/j.ohx.2025.e00670",
    excerpt: "External publication locator corresponding to the locally converted BIO-SPEC evidence.",
    license: "CC BY 4.0",
  });
  addCitation({
    id: "external-biospec-osf",
    kind: "external",
    title: "BIO-SPEC source file repository",
    href: "https://doi.org/10.17605/OSF.IO/39WSB",
    excerpt: "Repository named by the BIO-SPEC publication for design files and bill of materials.",
    license: "GNU GPLv3 (as declared by the publication)",
  });

  const processSteps = input.processes?.processes.flatMap(process => process.steps) ?? [];
  const outputs: AnalysisTraceDocument["outputs"] = {
    twinUri: contentUri("twin", input.twin),
    sceneUri: contentUri("scene", input.scene),
    ...(input.processUri ? { processUri: input.processUri } : {}),
    ...(input.processAnimationUri ? { processAnimationUri: input.processAnimationUri } : {}),
    components: components.length,
    sceneBindings: input.scene.bindings.length,
    meshBindings: meshes.length,
    uniqueMeshes: uniqueMeshes.size,
    primitiveFallbacks,
    geometryRequiredChecks: input.geometry.coverage.requiredChecks ?? 0,
    geometryPassedRequiredChecks: input.geometry.coverage.passedRequiredChecks ?? 0,
    completeAssemblies: input.assembly?.coverage.completeAssemblies ?? 0,
    assemblies: input.assembly?.coverage.assemblies ?? 0,
    processes: input.processes?.coverage.processes ?? 0,
    processSteps: input.processes?.coverage.steps ?? 0,
    evidencedProcessSteps: input.processes?.coverage.evidencedSteps ?? 0,
  };
  const changes = decisionChanges(input.previousTrace, decisions, outputs);
  if (input.previousTrace && input.previousTrace.generator.runtimeGeneration !== input.generator.runtimeGeneration) {
    changes.push(`GENERATOR_CHANGED:${input.previousTrace.generator.runtimeGeneration}→${input.generator.runtimeGeneration}`);
  }
  if (input.previousTrace && input.previousTrace.generator.sourceRevision !== input.generator.sourceRevision) {
    changes.push(`SOURCE_REVISION_CHANGED:${input.previousTrace.generator.sourceRevision}→${input.generator.sourceRevision}`);
  }
  const document: AnalysisTraceDocument = {
    schema: "subactor.analysis-trace/v1",
    id: `${input.project.id}-analysis-trace`,
    projectId: input.project.id,
    generatedAt: input.generatedAt,
    generator: input.generator,
    inputs: {
      projectConfigHash: input.projectConfigHash,
      researchSnapshotHash: input.researchSnapshotHash,
      developmentFingerprint: input.developmentFingerprint,
      observationSnapshotHash: input.observationSnapshotHash,
      intentDslSemanticHash: input.intentDsl.semanticHash,
      intentDslPacks: input.intentDsl.packs,
      intentDslRecords: input.intentDsl.records,
      invalidIntentPacks: input.intentDsl.invalid,
      resources: input.resources.length,
      resourcesByRole: byRole(input.resources),
    },
    outputs,
    method: {
      policy: "deterministic-first",
      explanationBoundary: EXPLANATION_BOUNDARY,
      stages: [
        { order: 1, id: "ingest", rule: "Hash and classify configured sources; preserve provenance.", inputArtifacts: ["project.projectdsl"], outputArtifacts: ["resources.json", "evidence-sets.dsl"] },
        { order: 2, id: "intent", rule: "Validate t2c.intent-pack/v1 and reject invalid packs before generation.", inputArtifacts: ["*.intent.json"], outputArtifacts: ["intent-dsl.index.json"] },
        { order: 3, id: "reasoning", rule: "Evaluate explicit MathDSL policy gates deterministically.", inputArtifacts: ["resources.json", "development.evidence.json", "observations.dsl"], outputArtifacts: ["math.dsl"] },
        { order: 4, id: "twin", rule: "Materialize stable components without inventing unsupported physical facts.", inputArtifacts: ["scene-blueprint.json", "intent-dsl.index.json", "math.dsl"], outputArtifacts: ["twin.json"] },
        { order: 5, id: "geometry", rule: "Apply stronger physical evidence and accept only grounded asset URIs.", inputArtifacts: ["physical-evidence.json", "geometry-builds.dsl"], outputArtifacts: ["scene.json", "geometry-validation.dsl"] },
        { order: 6, id: "process", rule: "Derive source-ordered processes; keep display timing presentation-only.", inputArtifacts: ["intent-dsl.index.json", "twin.json", "scene.json"], outputArtifacts: ["process.dsl", "process-animation.dsl"] },
        { order: 7, id: "publish", rule: "Publish only when policy, geometry, integrity and assembly gates pass.", inputArtifacts: ["math.dsl", "geometry-validation.dsl", "project-integrity.dsl", "assembly-report.dsl"], outputArtifacts: ["current/*", "analysis-trace.*"] },
      ],
    },
    decisions,
    citations: [...citations.values()].sort((a, b) => a.id.localeCompare(b.id)),
    generationAudit: input.generationAudit,
    comparison: {
      previousTraceUri: input.previousTrace ? contentUri("analysis-trace", input.previousTrace) : null,
      changed: changes.length > 0,
      changes: [...new Set(changes)].sort(),
    },
    artifactHashes: Object.fromEntries(Object.entries(input.artifactHashes).sort(([a], [b]) => a.localeCompare(b))),
  };
  return validateAnalysisTrace(document);
}

export function validateAnalysisTrace(value: unknown): AnalysisTraceDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ANALYSIS_TRACE_INVALID:document");
  const document = value as AnalysisTraceDocument;
  if (document.schema !== "subactor.analysis-trace/v1" || !document.id || !document.projectId || !document.generatedAt ||
    document.generator?.name !== "@subactor/digital-twin-runtime-starter" || !document.generator.runtimeGeneration ||
    !/^[a-f0-9]{64}$/.test(document.inputs?.researchSnapshotHash ?? "") || !Array.isArray(document.decisions) ||
    !Array.isArray(document.citations) || !Array.isArray(document.method?.stages)) throw new Error("ANALYSIS_TRACE_INVALID:contract");
  const citationIds = new Set(document.citations.map(citation => citation.id));
  if (citationIds.size !== document.citations.length) throw new Error("ANALYSIS_TRACE_INVALID:duplicate-citation");
  for (const decision of document.decisions) {
    if (!decision.id || !decision.ruleId || !decision.outcome || !["high", "medium", "low"].includes(decision.confidence) ||
      decision.citationIds.some(id => !citationIds.has(id)) ||
      decision.alternatives.some(item=>!["rejected","unresolved","deferred","selected-reference"].includes(item.status))) throw new Error(`ANALYSIS_TRACE_INVALID:decision:${decision.id || "missing"}`);
  }
  if (new Set(document.decisions.map(decision => decision.id)).size !== document.decisions.length) throw new Error("ANALYSIS_TRACE_INVALID:duplicate-decision");
  return document;
}

export function renderAnalysisTraceDsl(document: AnalysisTraceDocument): string {
  validateAnalysisTrace(document);
  return [
    `ANALYSIS_TRACE ${escapeDsl(document.id)} VERSION 1`,
    `PROJECT ${escapeDsl(document.projectId)}`,
    `GENERATED_AT ${escapeDsl(document.generatedAt)}`,
    `GENERATOR ${escapeDsl(document.generator)}`,
    `INPUTS ${escapeDsl(document.inputs)}`,
    `OUTPUTS ${escapeDsl(document.outputs)}`,
    `EXPLANATION_BOUNDARY ${escapeDsl(document.method.explanationBoundary)}`,
    ...document.method.stages.map(stage => `STAGE ${escapeDsl(stage)}`),
    ...document.decisions.map(decision => `DECISION ${escapeDsl(decision)}`),
    ...document.citations.map(citation => `CITATION ${escapeDsl(citation)}`),
    `GENERATION_AUDIT ${escapeDsl(document.generationAudit)}`,
    `COMPARISON ${escapeDsl(document.comparison)}`,
    `ARTIFACT_HASHES ${escapeDsl(document.artifactHashes)}`,
    "END_ANALYSIS_TRACE",
    "",
  ].join("\n");
}

export function parseAnalysisTraceDsl(text: string): AnalysisTraceDocument {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const header = lines[0]?.match(/^ANALYSIS_TRACE\s+("(?:\\.|[^"])*")\s+VERSION\s+1$/);
  if (!header || lines.at(-1) !== "END_ANALYSIS_TRACE") throw new Error("ANALYSIS_TRACE_INVALID:envelope");
  const one = (name: string): unknown => {
    const line = lines.find(item => item.startsWith(`${name} `));
    if (!line) throw new Error(`ANALYSIS_TRACE_INVALID:${name.toLowerCase()}`);
    return JSON.parse(line.slice(name.length + 1));
  };
  return validateAnalysisTrace({
    schema: "subactor.analysis-trace/v1",
    id: JSON.parse(header[1]),
    projectId: one("PROJECT"),
    generatedAt: one("GENERATED_AT"),
    generator: one("GENERATOR"),
    inputs: one("INPUTS"),
    outputs: one("OUTPUTS"),
    method: { policy: "deterministic-first", explanationBoundary: one("EXPLANATION_BOUNDARY"), stages: lines.filter(line => line.startsWith("STAGE ")).map(line => JSON.parse(line.slice(6))) },
    decisions: lines.filter(line => line.startsWith("DECISION ")).map(line => JSON.parse(line.slice(9))),
    citations: lines.filter(line => line.startsWith("CITATION ")).map(line => JSON.parse(line.slice(9))),
    generationAudit: one("GENERATION_AUDIT"),
    comparison: one("COMPARISON"),
    artifactHashes: one("ARTIFACT_HASHES"),
  });
}

function mdLink(citation: AnalysisTraceCitation): string {
  const suffix = [citation.page ? `p. ${citation.page}` : "", citation.lines ? `lines ${citation.lines[0]}–${citation.lines[1]}` : ""].filter(Boolean).join(", ");
  return `[${citation.title}](${citation.href})${suffix ? ` (${suffix})` : ""}`;
}
function codeBlock(language: string, value: string): string { return `\`\`\`${language}\n${value.trimEnd()}\n\`\`\``; }
export function renderAnalysisTraceMarkdown(document: AnalysisTraceDocument, dslArtifacts: Record<string, string> = {}): string {
  validateAnalysisTrace(document);
  const citationById = new Map(document.citations.map(citation => [citation.id, citation]));
  const lines = [
    "---",
    `schema: ${document.schema}`,
    `traceId: ${document.id}`,
    `generatedAt: ${document.generatedAt}`,
    `runtimeGeneration: ${document.generator.runtimeGeneration}`,
    `sourceRevision: ${document.generator.sourceRevision}`,
    `researchSnapshotHash: ${document.inputs.researchSnapshotHash}`,
    "---",
    "",
    `# Analysis trace — ${document.projectId}`,
    "",
    `Generated at **${document.generatedAt}** by \`${document.generator.name}@${document.generator.packageVersion}\`, generation semantics \`${document.generator.runtimeGeneration}\`, source revision \`${document.generator.sourceRevision}\`.`,
    "",
    `> ${document.method.explanationBoundary}`,
    "",
    "## Reproducibility envelope",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Project configuration | \`${document.inputs.projectConfigHash}\` |`,
    `| Research snapshot | \`${document.inputs.researchSnapshotHash}\` |`,
    `| Development fingerprint | \`${document.inputs.developmentFingerprint}\` |`,
    `| Observation snapshot | \`${document.inputs.observationSnapshotHash}\` |`,
    `| intentDSL semantic hash | \`${document.inputs.intentDslSemanticHash}\` |`,
    `| intentDSL coverage | ${document.inputs.intentDslPacks} packs, ${document.inputs.intentDslRecords} records, ${document.inputs.invalidIntentPacks} invalid |`,
    `| Inputs | ${document.inputs.resources} resources |`,
    `| Twin / Scene | \`${document.outputs.twinUri}\` / \`${document.outputs.sceneUri}\` |`,
    "",
    "## What the system did",
    "",
    ...document.method.stages.flatMap(stage => [
      `${stage.order}. **${stage.id}** — ${stage.rule}`,
      `   Inputs: ${stage.inputArtifacts.map(value => `\`${value}\``).join(", ")}. Outputs: ${stage.outputArtifacts.map(value => `\`${value}\``).join(", ")}.`,
    ]),
    "",
    "## Explicit decisions",
    "",
  ];
  for (const decision of document.decisions) {
    lines.push(`### ${decision.id}`, "", `- Subject: \`${decision.subject}\``, `- Outcome: ${decision.outcome}`, `- Rule: \`${decision.ruleId}\``, `- Confidence: **${decision.confidence}**`, `- Basis: ${decision.basis}`);
    if (decision.citationIds.length) lines.push(`- Evidence: ${decision.citationIds.map(id => citationById.get(id)).filter((value): value is AnalysisTraceCitation => Boolean(value)).map(mdLink).join("; ")}`);
    if (decision.alternatives.length) lines.push("", "Alternatives considered:", "", ...decision.alternatives.map(item => `- **${item.status}** — ${item.value}: ${item.reason}`));
    if (decision.gaps.length) lines.push("", "Open evidence gaps:", "", ...decision.gaps.map(gap => `- ${gap}`));
    lines.push("");
  }
  lines.push("## Source quotations", "");
  for (const citation of document.citations.filter(item => item.excerpt)) {
    lines.push(`### ${citation.id}`, "", `${mdLink(citation)}${citation.revisionHash ? ` · revision \`${citation.revisionHash}\`` : ""}`, "", `> ${citation.excerpt}`, "");
  }
  lines.push(
    "## Output metrics",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    ...Object.entries(document.outputs).filter(([, value]) => typeof value === "number").map(([key, value]) => `| \`${key}\` | ${value} |`),
    "",
    "## Generator audit",
    "",
    codeBlock("json", JSON.stringify(document.generationAudit, null, 2)),
    "",
    "## DSL evidence",
    "",
    "These blocks render the DSL used by this revision. The exact bytes and their SHA-256 hashes are stored beside this report.",
    "",
  );
  for (const [name, value] of Object.entries(dslArtifacts)) lines.push(`### ${name}`, "", codeBlock(name.endsWith(".dsl") ? "text" : "json", value), "");
  lines.push(
    "## Change since previous trace",
    "",
    `Previous: ${document.comparison.previousTraceUri ? `\`${document.comparison.previousTraceUri}\`` : "none"}.`,
    "",
    ...(document.comparison.changes.length ? document.comparison.changes.map(change => `- ${change}`) : ["- No structural decision or output change."]),
    "",
    "## Stored artifacts",
    "",
    ...Object.entries(document.artifactHashes).map(([name, hash]) => `- \`${name}\` — \`sha256:${hash}\``),
    "",
  );
  return lines.join("\n");
}

export async function runtimeSourceRevision(): Promise<string> {
  if (process.env.DT_RUNTIME_SOURCE_REVISION?.trim()) return process.env.DT_RUNTIME_SOURCE_REVISION.trim();
  const here = fileURLToPath(new URL(".", import.meta.url));
  for (const root of [resolve(here, "../../.."), resolve(here, "../..")]) {
    try {
      const head = (await readFile(resolve(root, ".git/HEAD"), "utf8")).trim();
      if (head.startsWith("ref: ")) return (await readFile(resolve(root, `.git/${head.slice(5)}`), "utf8")).trim();
      return head;
    } catch { /* source archives and vendored runtimes may not carry .git */ }
  }
  return "unknown";
}
