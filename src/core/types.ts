export type ResultKind = "tree" | "math" | "table" | "text" | "scene" | "twin" | "observation" | "project" | "improvement";
export type EpistemicType = "request" | "plan" | "decision" | "message" | "report" | "result" | "claim";
export type LlmMode = "deterministic" | "prefer-llm" | "require-llm";
export type DslKind = "intent" | "resource" | "query" | "dql" | "tree" | "math" | "twin" | "scene" | "project" | "observation" | "improvement";
export type SourceRole = "manager" | "customer" | "project" | "internet" | "archive" | "derived" | "runtime" | "development";
export type AutonomyMode = "observe" | "propose" | "apply";

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
  /** Canonical local-to-parent rotation quaternion [x,y,z,w]. */
  orientation?: [number, number, number, number];
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

/**
 * Geometry provenance, ordered weakest → strongest. Physical intake may raise a component's
 * fidelity but never lower it, so a placeholder can never overwrite surveyed or as-built data.
 */
export type GeometryEvidenceKind = "placeholder" | "document" | "measured" | "cad" | "ifc" | "verified";
export const GEOMETRY_EVIDENCE_ORDER: GeometryEvidenceKind[] = ["placeholder", "document", "measured", "cad", "ifc", "verified"];

/** One physical fact about an existing twin component; `componentId` must already exist. */
export interface PhysicalEvidenceRecord {
  componentId: string;
  kind: "space" | "equipment" | "utility";
  evidence: GeometryEvidenceKind;
  position?: [number, number, number];
  size?: [number, number, number];
  orientation?: [number, number, number, number];
  positionToleranceM?: number;
  sizeToleranceM?: number;
  angleToleranceDeg?: number;
  /** External mesh/CAD asset (USDZ, GLB, STEP) resolved by the scene renderer. */
  assetUri?: string;
  /** Where the fact came from: IFC GUID, drawing sheet, survey report, equipment register row. */
  sourceRef?: string;
  properties?: Record<string, unknown>;
}
export interface SpatialConstraint {
  id: string;
  relation: "inside" | "clearance" | "no-overlap";
  subjectId: string;
  objectId: string;
  marginM?: number;
  minDistanceM?: number;
}
export interface PhysicalEvidenceDocument {
  schema: "subactor.physical-evidence/v1";
  id: string;
  /** Declared so intake can refuse to mix millimetre CAD with metre site coordinates. */
  coordinateSystem: { unit: "m"; upAxis: "Z"; origin?: string };
  records: PhysicalEvidenceRecord[];
  constraints?: SpatialConstraint[];
}
export interface PhysicalEvidenceReport {
  schema: "subactor.physical-evidence-report/v1";
  applied: { componentId: string; from: GeometryEvidenceKind; to: GeometryEvidenceKind; fields: string[] }[];
  rejected: { componentId: string; reason: string }[];
  /** Core invariant: physical intake changes representation, never identity. */
  componentIdsStable: boolean;
  scenePathsStable: boolean;
}
export interface GeometryValidationCheck {
  id: string;
  kind: "position" | "size" | "orientation" | "inside" | "clearance" | "no-overlap";
  subjectId: string;
  objectId?: string;
  ok: boolean;
  actual: number;
  limit: number;
  unit: "m" | "deg" | "boolean";
  message: string;
}
export interface GeometryValidationReport {
  schema: "subactor.geometry-validation/v1";
  evidenceId: string;
  method: "world-aabb";
  ok: boolean;
  complete: boolean;
  coverage: {
    /** Components whose class is physical or hybrid (all scene bindings for legacy callers). */
    bindings: number;
    positionEvidence: number;
    sizeEvidence: number;
    orientationEvidence: number;
    constraints: number;
    positionRequired?: number;
    sizeRequired?: number;
    orientationRequired?: number;
    constraintsRequired?: number;
    requiredChecks?: number;
    passedRequiredChecks?: number;
  };
  checks: GeometryValidationCheck[];
  failures: string[];
}

export type SpatialClass = "physical" | "cyber" | "logical" | "hybrid";
export type SpatialRequirement = "position" | "size" | "orientation" | "constraints" | "logical-endpoint" | "runtime-status";
export interface SpatialRequirements {
  require: SpatialRequirement[];
  optional?: SpatialRequirement[];
  forbid?: SpatialRequirement[];
}

export type GeometryUnit = "micron" | "millimeter" | "centimeter" | "meter" | "inch" | "foot";
export type GeometryUpAxis = "X" | "Y" | "Z";
export type GeometryScalar = string | number | boolean;

/** Deterministic request to turn an executable CAD source into scene geometry. */
export interface GeometryBuildContract {
  schema: "subactor.geometry-build/v1";
  id: string;
  source: {
    path: string;
    uri: string;
    sha256: string;
    format: "scad";
  };
  engine: {
    type: "openscad";
    version?: string;
    imageDigest?: string;
  };
  target: {
    componentId: string;
    scenePath: string;
    kind: "space" | "equipment" | "utility";
  };
  coordinateSystem: {
    unit: GeometryUnit;
    upAxis: GeometryUpAxis;
    handedness: "right";
  };
  dependencies: Array<{
    /** Logical path visible to use/include, e.g. threadlib/threadlib.scad. */
    path: string;
    /** Logical directory or file populated in OPENSCADPATH. */
    mountPath: string;
    uri: string;
    sha256: string;
    /** Content-addressed file or directory mounted into the isolated worker. */
    sourcePath: string;
    /** Optional acquisition recipe; resolution happens before the network-isolated worker. */
    fetch?: {
      type: "git";
      repository: string;
      revision: string;
      subpath: string;
    };
  }>;
  parameters: {
    presetId: string;
    values: Record<string, GeometryScalar>;
  };
  compilerOptions: {
    hardWarnings: boolean;
    timeoutSeconds: number;
    maxTriangles: number;
    fa?: number;
    fs?: number;
    fn?: number;
  };
  outputs: {
    canonical: "3mf";
    web: "glb";
    scene: "usda" | "usdc";
  };
  validations: {
    nonEmpty: boolean;
    finiteBbox: boolean;
    dependencyClosure: boolean;
    glbLoad: boolean;
    usdStageOpen: boolean;
    bboxToleranceM: number;
    reference?: {
      path: string;
      sourceUri: string;
      artifactUri: string;
      sha256: string;
      unit: GeometryUnit;
      comparison: "extent";
      /** Independent-source tessellations may need a declared tolerance distinct from container round-trip checks. */
      extentToleranceM?: number;
    };
  };
}

export interface GeometryArtifactReceipt {
  uri: string;
  sha256: string;
  path: string;
  bytes: number;
  mediaType: string;
}

export interface GeometryBuildReceipt {
  schema: "subactor.geometry-build-receipt/v1";
  id: string;
  status: "succeeded" | "failed";
  processUri: "subactor://process/geometry/openscad/compile";
  repairProcess?: string;
  cacheHit: boolean;
  startedAt: string;
  completedAt: string;
  source: GeometryBuildContract["source"];
  target: GeometryBuildContract["target"];
  coordinateSystem: GeometryBuildContract["coordinateSystem"];
  engine: {
    name: "openscad";
    version: string;
    imageDigest?: string;
  };
  dependencies: {
    expected: GeometryBuildContract["dependencies"];
    actual: string[];
    dependencySetHash: string;
    drift: string[];
  };
  parameterSetHash: string;
  validationPolicyHash: string;
  geometryBuildHash: string;
  geometryHashProfile: "subactor.semantic-triangle-soup/v2";
  geometryArtifactHash?: string;
  artifacts: Partial<Record<"3mf" | "glb" | "usda" | "usdc", GeometryArtifactReceipt>>;
  validation: {
    ok: boolean;
    nonEmpty: boolean;
    finite: boolean;
    dependencyClosure: boolean;
    triangleCount: number;
    bboxM?: { min: [number, number, number]; max: [number, number, number] };
    unit: GeometryUnit;
    glbLoad: boolean;
    usdStageOpen: boolean;
    usdValidationAvailable: boolean;
    bboxDeltaM?: number;
    referenceMatch?: boolean;
    referenceExtentDeltaM?: number;
    failures: string[];
  };
  error?: {
    code: string;
    message: string;
  };
}

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

export interface ObservationRecord {
  id: string;
  observedAt: string;
  /** Time at which the runtime received the sample. Falls back to observedAt for legacy inputs. */
  receivedAt?: string;
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

export type TwinStateQuality = "fresh" | "stale" | "expired" | "unknown";
export interface LiveBindingRange {
  min?: number;
  max?: number;
  state: string;
}
export interface LiveBinding {
  id: string;
  source: { subjectUri: string; metric: string };
  target: { componentId: string; property: string };
  freshness: { freshForMs: number; expireAfterMs: number; onStale: string };
  valueStates: Record<string, string>;
  ranges: LiveBindingRange[];
}
export interface LiveBindingDocument {
  schema: "subactor.live-binding/v1";
  id: string;
  bindings: LiveBinding[];
}
export interface TwinStateProperty {
  bindingId: string;
  property: string;
  value?: MathValue;
  unit?: string;
  state: string;
  /** Semantic state produced from the value before freshness policy is applied. */
  mappedState: string;
  quality: TwinStateQuality;
  freshForMs: number;
  expireAfterMs: number;
  onStale: string;
  observedAt?: string;
  receivedAt?: string;
  ageMs?: number;
  sourceObservationId?: string;
  sourceUris: string[];
}
export interface TwinStateComponent {
  componentId: string;
  properties: TwinStateProperty[];
}
export interface TwinStateDocument {
  schema: "subactor.twin-state/v1";
  id: string;
  projectId: string;
  projectedAt: string;
  /** Query-time evaluation instant; equals projectedAt in the immutable runtime artifact. */
  evaluatedAt: string;
  sourceObservationUri: string;
  components: TwinStateComponent[];
  coverage: { bindings: number; resolved: number; fresh: number; stale: number; expired: number; unknown: number };
}

export interface AssemblyPartSpec {
  id: string;
  componentId: string;
  required: boolean;
  assetUri?: string;
  scenePath?: string;
}
export interface AssemblySpec {
  id: string;
  rootComponentId: string;
  kind: "device" | "assembly" | "module";
  parts: AssemblyPartSpec[];
}
export interface AssemblyDocument {
  schema: "subactor.assembly/v1";
  id: string;
  assemblies: AssemblySpec[];
}
export interface AssemblyPartStatus extends AssemblyPartSpec {
  componentExists: boolean;
  parentMatches: boolean;
  assetAvailable: boolean;
  assetGrounded: boolean;
  placed: boolean;
  actualAssetUri?: string;
  actualScenePath?: string;
  complete: boolean;
  findingCodes: string[];
}
export interface AssemblyFinding {
  code: string;
  errorUri: string;
  severity: "warning" | "error";
  assemblyId: string;
  partId?: string;
  componentId: string;
  message: string;
  repairProcess: string;
}
export interface AssemblyReport {
  schema: "subactor.assembly-report/v1";
  id: string;
  projectId: string;
  ok: boolean;
  complete: boolean;
  coverage: { assemblies: number; completeAssemblies: number; requiredParts: number; completeRequiredParts: number; availableAssets: number; placedParts: number };
  assemblies: Array<AssemblySpec & { rootExists: boolean; complete: boolean; parts: AssemblyPartStatus[] }>;
  findings: AssemblyFinding[];
}

export interface DevelopmentEvidenceSummary {
  schema: "subactor.development-evidence/v1";
  source: "todo2code" | "fixture" | "missing";
  graphFingerprint: string;
  recordCount: number;
  relationCount: number;
  diagnosticCount: number;
  blockingDiagnosticCount: number;
  acceptance: "accepted" | "review_required" | "rejected" | "unknown";
  manifestStatus: string | null;
  evidenceUris: string[];
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
  };
  webResearch?: {
    dqlFile: string;
    fixtureMapFile?: string;
  };
  policy: {
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

export type LivingStageName = "preflight" | "research" | "development" | "runtime" | "reasoning" | "geometry" | "assembly" | "twin" | "scene" | "improvement" | "feedback";
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
  failures: string[];
  stages: Array<{
    name: "grant" | "isolate" | "propose-source-patch" | "apply-source-patch";
    status: "succeeded" | "blocked" | "failed";
    reason?: string;
  }>;
  proposalUri: string;
}
