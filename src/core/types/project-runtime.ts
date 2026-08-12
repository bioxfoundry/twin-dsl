import type { AutonomyMode, DslKind, IntentRecord, LlmMode, ResourceRecord, ResultKind, SourceAnchor, SourceRole } from "./contracts.js";
import type { MathDocument, SceneDocument, TreeDocument, TwinDocument } from "./documents.js";
import type { ProcessDocument } from "./process.js";
import type { GeometryBuildContract } from "./geometry.js";
import type { GeometryValidationReport, SpatialClass, SpatialRequirements } from "./physical.js";
import type { ObservationDocument } from "./runtime-state.js";

export type ProjectIntegrityLayer = "requirements" | "research" | "design" | "development" | "runtime" | "twin" | "scene" | "validation";
export type ProjectIntegrityCategory = "missing-evidence" | "ungrounded-assumption" | "invalid-parameter" | "broken-dependency" | "inconsistency";
export interface ProjectIntegrityFinding {
  code: string;
  severity: "info" | "warning" | "error";
  category: ProjectIntegrityCategory;
  layer: ProjectIntegrityLayer;
  message: string;
  subjects: string[];
  evidenceUris: string[];
  repairProcess: string;
}
export interface ProjectDependencyCheck {
  id: string;
  from: ProjectIntegrityLayer;
  to: ProjectIntegrityLayer;
  ok: boolean;
  complete: boolean;
  message: string;
}
export interface ProjectIntegrityReport {
  schema: "subactor.project-integrity/v1";
  projectId: string;
  method: "deterministic-cross-layer";
  ok: boolean;
  complete: boolean;
  coverage: {
    layers: number;
    evidencedLayers: number;
    dependencies: number;
    validatedDependencies: number;
    parameters: number;
    validParameters: number;
    assumptions: number;
    groundedAssumptions: number;
  };
  layers: Array<{ layer: ProjectIntegrityLayer; evidenced: boolean; evidenceCount: number }>;
  dependencies: ProjectDependencyCheck[];
  findings: ProjectIntegrityFinding[];
  repairProcesses: Array<{ uri: string; findingCodes: string[] }>;
}
export interface ImprovementAction {
  id: string;
  kind: "research" | "development" | "runtime" | "policy" | "validation" | "deployment";
  title: string;
  reason: string;
  targetUris: string[];
  approvalRequired: boolean;
  status: "proposed";
}
export interface ImprovementPlan {
  schema: "subactor.improvement-plan/v1";
  id: string;
  projectId: string;
  mode: "propose_only";
  generatedAt: string;
  sourceIterationUri: string | null;
  evidenceUris: string[];
  actions: ImprovementAction[];
}

export interface LivingSourceSpec {
  path: string;
  role: SourceRole;
  logicalRoot: string;
  labels?: string[];
}
export interface LivingProjectDocument {
  schema: "subactor.living-project/v1";
  id: string;
  name: string;
  profile: "generic" | "biofoundry";
  managerIntent: string;
  sources: LivingSourceSpec[];
  development: {
    root: string;
    task?: string;
    todo?: string;
    changelog?: string;
    docs?: string[];
    fixture?: string;
  };
  observations: {
    paths: string[];
    logicalRoot: string;
    /** Optional deterministic ObservationDSL → TwinState projection contract. */
    liveBindingFile?: string;
    /** Optional MQTT observation routes for URI Process run projection. */
    mqttBindingFile?: string;
  };
  webResearch?: {
    dqlFile: string;
    fixtureMapFile?: string;
  };
  policy: {
    /** Deployment boundary for controls that are intentionally relaxed only in local development. */
    environment?: "development" | "production";
    approved: boolean;
    requireResearch: boolean;
    requireDevelopmentEvidence: boolean;
    requireDevelopmentAcceptance: boolean;
    allowDevelopmentFixture: boolean;
    requireRuntimeEvidence: boolean;
    autoPublishScene: boolean;
    allowRuntimeSelfModification: boolean;
    autonomyMode: AutonomyMode;
    requireSignedMutationGrant: boolean;
    mutationGrantFile?: string;
    maxIterationsPerHour: number;
    maxConsecutiveFailures: number;
  };
  scene: {
    format: "openusd" | "gltf" | "3dtiles";
    /** Optional path to subactor.scene-blueprint/v1 (stable semantic IDs for Twin/Scene). */
    blueprintFile?: string;
    /** Optional path to subactor.physical-evidence/v1 (replaces placeholder geometry with facts). */
    physicalEvidenceFile?: string;
    /** Paths to deterministic subactor.geometry-build/v1 contracts. */
    geometryBuildFiles?: string[];
    /** Optional semantic device/assembly/part completeness contract. */
    assemblyFile?: string;
  };
}

/** Stable semantic layout: identity ≠ state. Included in project config hash. */
export interface SceneBlueprintComponent {
  id: string;
  type: string;
  /** Stable semantic assembly hierarchy; independent from the Scene path used for presentation. */
  parentId?: string;
  /** Ontological class: display layout is not physical evidence for cyber/logical components. */
  spatialClass: SpatialClass;
  /** Evidence contract evaluated for this component rather than globally for every scene node. */
  spatialRequirements?: SpatialRequirements;
  label?: string;
  sourceRoles: SourceRole[];
  /** If set, only resources whose path/logicalUri contains one of these tokens (case-insensitive). */
  pathIncludes?: string[];
  pathExcludes?: string[];
  /** Cap attached evidence URIs for readability (default unlimited). */
  maxSourceUris?: number;
  properties?: Record<string, unknown>;
  includeDevelopmentEvidence?: boolean;
  includeRuntimeObservations?: boolean;
}
export interface SceneBlueprintBinding {
  componentId: string;
  scenePath: string;
  primitive?: "cube" | "cylinder" | "sphere" | "scope";
  position?: [number, number, number];
  size?: [number, number, number];
  orientation?: [number, number, number, number];
  propertyMap?: Record<string, string>;
}
export interface SceneBlueprint {
  schema: "subactor.scene-blueprint/v1";
  id: string;
  twinKind: TwinDocument["kind"];
  components: SceneBlueprintComponent[];
  bindings: SceneBlueprintBinding[];
}

export interface EvidenceReference { uri: string; anchor?: SourceAnchor; }
export interface QueryResultEnvelope {
  schema: "subactor.query-result/v1";
  queryId: string;
  queryHash: string;
  executionId: string;
  sourceSnapshotHash: string;
  resultUri: string;
  resultHash: string;
  resultKind: ResultKind;
  payload: TreeDocument | MathDocument | TwinDocument | SceneDocument | ObservationDocument | LivingProjectDocument | ImprovementPlan | unknown;
  evidence: EvidenceReference[];
  validation: { ok: boolean; checks: {name: string; ok: boolean; message: string}[] };
  executionReceipt: { ticketId: string; processId: string; idempotencyKey: string; completedAt: string };
}

export interface GenerationAudit {
  requestedMode: LlmMode;
  effectiveMode: "deterministic" | "llm";
  degraded: boolean;
  reason: string | null;
  provider: string | null;
  model: string | null;
  responseId: string | null;
  durationMs: number;
  usage?: Record<string, unknown>;
  cost?: number | null;
}

/**
 * Reproducible explanation of one generated Twin revision.
 *
 * This is an audit of explicit inputs and deterministic rules, not a model's private chain of
 * thought. Every conclusion is therefore reviewable as data: source locator, bounded excerpt,
 * rule id, confidence, outcome and the exact DSL that crossed the runtime boundary.
 */
export interface AnalysisTraceCitation {
  id: string;
  kind: "internal" | "external";
  title: string;
  href: string;
  artifactUri?: string;
  resourceUri?: string;
  revisionHash?: string;
  page?: number;
  lines?: [number, number];
  fragment?: string;
  excerpt?: string;
  license?: string;
  converter?: string;
  converterVersion?: string;
}
export interface AnalysisTraceDecision {
  id: string;
  subject: string;
  outcome: string;
  ruleId: string;
  confidence: "high" | "medium" | "low";
  basis: string;
  citationIds: string[];
  alternatives: Array<{ value: string; status: "rejected" | "unresolved" | "deferred" | "selected-reference"; reason: string }>;
  gaps: string[];
}
export interface AnalysisTraceDocument {
  schema: "subactor.analysis-trace/v1";
  id: string;
  projectId: string;
  generatedAt: string;
  generator: {
    name: "@subactor/digital-twin-runtime-starter";
    packageVersion: string;
    runtimeGeneration: string;
    sourceRevision: string;
    mode: LlmMode;
  };
  inputs: {
    projectConfigHash: string;
    researchSnapshotHash: string;
    developmentFingerprint: string;
    observationSnapshotHash: string;
    intentDslSemanticHash: string;
    intentDslPacks: number;
    intentDslRecords: number;
    invalidIntentPacks: number;
    resources: number;
    resourcesByRole: Record<string, number>;
  };
  outputs: {
    twinUri: string;
    sceneUri: string;
    processUri?: string;
    processAnimationUri?: string;
    components: number;
    sceneBindings: number;
    meshBindings: number;
    uniqueMeshes: number;
    primitiveFallbacks: number;
    geometryRequiredChecks: number;
    geometryPassedRequiredChecks: number;
    completeAssemblies: number;
    assemblies: number;
    processes: number;
    processSteps: number;
    evidencedProcessSteps: number;
  };
  method: {
    policy: "deterministic-first";
    explanationBoundary: string;
    stages: Array<{ order: number; id: string; rule: string; inputArtifacts: string[]; outputArtifacts: string[] }>;
  };
  decisions: AnalysisTraceDecision[];
  citations: AnalysisTraceCitation[];
  generationAudit: { math: GenerationAudit; twin: GenerationAudit; scene: GenerationAudit; authorityWarnings: string[] };
  comparison: {
    previousTraceUri: string | null;
    changed: boolean;
    changes: string[];
  };
  artifactHashes: Record<string, string>;
}

export interface AnalysisTraceBuildInput {
  project: LivingProjectDocument;
  projectConfigHash: string;
  generatedAt: string;
  generator: AnalysisTraceDocument["generator"];
  researchSnapshotHash: string;
  developmentFingerprint: string;
  observationSnapshotHash: string;
  intentDsl: { semanticHash: string; packs: number; records: number; invalid: number };
  resources: ResourceRecord[];
  twin: TwinDocument;
  scene: SceneDocument;
  geometry: GeometryValidationReport;
  assembly?: import("./runtime-state.js").AssemblyReport;
  processes?: ProcessDocument;
  processUri?: string;
  processAnimationUri?: string;
  generationAudit: AnalysisTraceDocument["generationAudit"];
  groundedIntents: Array<{ record: IntentRecord; sourceUri: string }>;
  previousTrace?: AnalysisTraceDocument;
  artifactHashes: Record<string, string>;
}

export interface DslGenerationResult<T = unknown> {
  schema: "subactor.dsl-generation-result/v1";
  kind: DslKind;
  value: T;
  canonicalHash: string;
  audit: GenerationAudit;
}

export interface DomainEvent<T=unknown> {
  eventId: string;
  streamId: string;
  streamVersion: number;
  eventType: string;
  schemaVersion: string;
  occurredAt: string;
  recordedAt: string;
  principal: string;
  contractId?: string;
  intentId?: string;
  correlationId: string;
  causationId?: string;
  traceId: string;
  evidenceUris: string[];
  payload: T;
}

export interface ResourceDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
}

export interface TwinBuildReceipt {
  schema: "subactor.twin-build-receipt/v1";
  runId: string;
  noChange?: boolean;
  sourceSnapshotHash: string;
  previousSnapshotHash: string | null;
  diff: ResourceDiff;
  treeUri: string;
  mathUri: string;
  twinUri: string;
  sceneUri: string;
  validation: { ok: boolean; checks: string[]; failures: string[] };
  generatedAt: string;
}

export type LivingStageName = "preflight" | "research" | "development" | "runtime" | "reasoning" | "geometry" | "assembly" | "process" | "twin" | "scene" | "improvement" | "feedback";
export interface LivingIterationReceipt {
  schema: "subactor.living-iteration/v2";
  projectId: string;
  iterationId: string;
  traceId: string;
  idempotencyKey: string;
  noChange: boolean;
  startedAt: string;
  completedAt: string;
  projectConfigHash: string;
  /** Generation semantics that produced this iteration; see core/generation.ts. */
  runtimeGeneration?: string;
  researchSnapshotHash: string;
  developmentFingerprint: string;
  observationSnapshotHash: string;
  previousIterationUri: string | null;
  intentUri: string;
  developmentEvidenceUri: string;
  treeUri: string;
  mathUri: string;
  observationUri: string;
  twinStateUri?: string;
  assemblyReportUri?: string;
  processUri?: string;
  processAnimationUri?: string;
  /** Added additively to v2 receipts; absent only on historical pre-trace iterations. */
  analysisTraceUri?: string;
  twinUri: string;
  sceneUri: string;
  improvementUri: string;
  iterationUri: string;
  diff: ResourceDiff;
  authorityWarnings: string[];
  stages: Array<{
    name: LivingStageName;
    status: "succeeded" | "skipped" | "blocked" | "failed";
    artifactUris: string[];
    reason?: string;
  }>;
  validation: { ok: boolean; failures: string[] };
}

export interface LivingFailureReceipt {
  schema: "subactor.living-failure/v1";
  projectId: string;
  failureId: string;
  traceId: string;
  occurredAt: string;
  configPath: string;
  outputDirectory: string;
  consecutiveFailures: number;
  errorCode: string;
  message: string;
  retryAfterMs: number;
}

/** Cryptographically signed mutation grant (HMAC-SHA256 compact token in signature). */
export interface SignedMutationGrant {
  schema: "subactor.signed-mutation-grant/v1";
  projectId: string;
  planHash: string;
  artifactSha256: string;
  target: string;
  actor: string;
  riskClass: "read_only" | "reversible" | "boundary" | "governance";
  jti: string;
  iat: string;
  expiresAt: string;
  runId: string;
  intentPack: string;
  /** Compact HS256 token: base64url(header).base64url(payload).base64url(sig) */
  signature: string;
  grantHash: string;
}

export interface MutationProposalReceipt {
  schema: "subactor.mutation-proposal-receipt/v1";
  proposalId: string;
  projectId: string;
  mode: "propose" | "apply";
  status: "proposed" | "refused" | "failed" | "applied-isolated";
  startedAt: string;
  completedAt: string;
  planHash: string;
  grantVerified: boolean;
  grantJti: string | null;
  actor: string;
  developmentRoot: string;
  workspace: { kind: "git-worktree" | "directory-copy"; path: string; branch?: string } | null;
  sourcePatchUri: string | null;
  sourcePatchPath: string | null;
  closeResultUri?: string | null;
  closeResultPath?: string | null;
  allAccepted?: boolean | null;
  failures: string[];
  stages: Array<{
    name: "grant" | "isolate" | "propose-source-patch" | "apply-source-patch" | "re-analyze" | "close-code-change";
    status: "succeeded" | "blocked" | "failed";
    reason?: string;
  }>;
  proposalUri: string;
}
