export type ResultKind = "tree" | "math" | "table" | "text" | "scene" | "twin" | "observation" | "project";
export type EpistemicType = "request" | "plan" | "decision" | "message" | "report" | "result" | "claim";
export type LlmMode = "deterministic" | "prefer-llm" | "require-llm";
export type DslKind = "intent" | "resource" | "query" | "dql" | "tree" | "math" | "twin" | "scene" | "project" | "observation";
export type SourceRole = "manager" | "customer" | "project" | "internet" | "archive" | "derived" | "runtime" | "development";

export interface SourceAnchor {
  artifactUri: string;
  revisionHash: string;
  fragment?: string;
  page?: number;
  lines?: [number, number];
  bbox?: [number, number, number, number];
  converter: string;
  converterVersion: string;
}

export interface ResourceRecord {
  schema: "subactor.resource/v1";
  id: string;
  uri: string;
  logicalUri: string;
  mediaType: string;
  sha256: string;
  size: number;
  sourcePath: string;
  sourceRole?: SourceRole;
  labels?: string[];
  parentUri?: string;
  derived: boolean;
  derivedFrom: string[];
  createdAt: string;
}

export interface ResourcePlan {
  schema: "subactor.resource-plan/v1";
  id: string;
  sources: Array<{
    kind: "directory" | "archive" | "website" | "git" | "file";
    location: string;
    role: SourceRole;
    include: string[];
    exclude: string[];
  }>;
  conversions: string[];
  outputLogicalRoot: string;
  status: "proposed";
}

export interface IntentRecord {
  schema: "t2c.intent/v1";
  id: string;
  type: EpistemicType;
  text: string;
  actor: string;
  ticket?: string;
  targetUris: string[];
  source?: SourceAnchor;
}

export type QueryOperator = "contains" | "equals" | "prefix" | "regex";
export interface QueryFilter { field: string; operator: QueryOperator; value: string; }
export interface QueryContract {
  schema: "subactor.query/v1";
  id: string;
  intentUri: string;
  processUri: string;
  sourceUris: string[];
  sourceSnapshotHash: string;
  filters: QueryFilter[];
  expectedResultKind: ResultKind;
  resultUriTemplate: string;
  validations: string[];
  canonicalHash: string;
}

export interface DqlCrawlPlan {
  schema: "subactor.dql-crawl/v1";
  id: string;
  sitemapUrls: string[];
  seedUrls: string[];
  allowHosts: string[];
  includePaths: string[];
  excludePaths: string[];
  contextTerms: string[];
  maxUrls: number;
  maxSitemaps: number;
  sameOriginOnly: boolean;
  respectRobots: boolean;
  output: "markdown";
  validations: string[];
}

export interface TreeNode {
  id: string;
  uri: string;
  label: string;
  kind: string;
  parentId?: string;
  relation?: string;
  sourceUris?: string[];
  properties?: Record<string, unknown>;
  anchor?: SourceAnchor;
  children: TreeNode[];
}
export interface TreeDocument { schema: "subactor.tree/v1"; id: string; roots: TreeNode[]; }

export interface Rational { numerator: string; denominator: string; }
export type MathValue = boolean | string | number | Rational;
export type MathExpr =
  | { kind: "literal"; value: MathValue }
  | { kind: "ref"; name: string }
  | { kind: "and" | "or"; args: MathExpr[] }
  | { kind: "not"; arg: MathExpr }
  | { kind: "eq" | "gte" | "lte" | "gt" | "lt"; left: MathExpr; right: MathExpr }
  | { kind: "weightedSum"; terms: { weight: Rational; ref: string }[] };
export interface MathBinding { name: string; value?: MathValue; sourceUris: string[]; unit?: string; }
export interface MathDocument { schema: "subactor.math/v1"; id: string; bindings: MathBinding[]; expressions: Record<string, MathExpr>; }

export interface TwinComponent {
  id: string;
  type: string;
  sourceUris: string[];
  properties: Record<string, unknown>;
  children: TwinComponent[];
}
export interface TwinDocument {
  schema: "subactor.twin/v1";
  id: string;
  kind: "actor" | "system" | "process" | "physical" | "conceptual";
  observedAt: string;
  sourceSnapshotHash: string;
  components: TwinComponent[];
}

export interface SceneBinding {
  twinUri: string;
  componentId?: string;
  scenePath: string;
  primitive?: "cube" | "cylinder" | "sphere" | "scope";
  position?: [number, number, number];
  size?: [number, number, number];
  propertyMap: Record<string, string>;
  assetUri?: string;
}
export interface SceneDocument {
  schema: "subactor.scene/v1";
  id: string;
  format: "openusd" | "gltf" | "3dtiles";
  sourceTwinId?: string;
  bindings: SceneBinding[];
}

export interface ObservationRecord {
  id: string;
  observedAt: string;
  subjectUri: string;
  metric: string;
  value: MathValue;
  unit?: string;
  severity: "debug" | "info" | "warning" | "error" | "critical";
  sourceUris: string[];
  labels: string[];
}
export interface ObservationDocument {
  schema: "subactor.observation/v1";
  id: string;
  sourceSnapshotHash: string;
  observations: ObservationRecord[];
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
  };
  webResearch?: {
    dqlFile: string;
    fixtureMapFile?: string;
  };
  policy: {
    approved: boolean;
    requireResearch: boolean;
    requireDevelopmentEvidence: boolean;
    requireRuntimeEvidence: boolean;
    autoPublishScene: boolean;
    allowRuntimeSelfModification: boolean;
    maxIterationsPerHour: number;
  };
  scene: {
    format: "openusd" | "gltf" | "3dtiles";
  };
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
  payload: TreeDocument | MathDocument | TwinDocument | SceneDocument | ObservationDocument | LivingProjectDocument | unknown;
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

export interface DslGenerationResult<T = unknown> {
  schema: "subactor.dsl-generation-result/v1";
  kind: DslKind;
  value: T;
  canonicalHash: string;
  audit: GenerationAudit;
}

export interface DomainEvent<T=unknown> {
  eventId: string; streamId: string; streamVersion: number; eventType: string;
  schemaVersion: string; occurredAt: string; recordedAt: string;
  principal: string; contractId?: string; intentId?: string;
  correlationId: string; causationId?: string; traceId: string;
  evidenceUris: string[]; payload: T;
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

export interface LivingIterationReceipt {
  schema: "subactor.living-iteration/v1";
  projectId: string;
  iterationId: string;
  noChange: boolean;
  startedAt: string;
  completedAt: string;
  projectConfigHash: string;
  researchSnapshotHash: string;
  developmentFingerprint: string;
  observationSnapshotHash: string;
  previousIterationUri: string | null;
  intentUri: string;
  treeUri: string;
  mathUri: string;
  observationUri: string;
  twinUri: string;
  sceneUri: string;
  iterationUri: string;
  diff: ResourceDiff;
  stages: Array<{
    name: "research" | "development" | "runtime" | "reasoning" | "twin" | "scene" | "feedback";
    status: "succeeded" | "skipped" | "blocked" | "failed";
    artifactUris: string[];
    reason?: string;
  }>;
  validation: { ok: boolean; failures: string[] };
}
