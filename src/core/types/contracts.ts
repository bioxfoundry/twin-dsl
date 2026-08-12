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
  blockId?: string;
  artifactId?: string;
  artifactUrn?: string;
  evidenceArtifactIds?: string[];
  evidenceArtifactUrns?: string[];
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

export type SourceCoverageState =
  | "converted"
  | "binary-provenance"
  | "excluded-by-policy"
  | "unsupported"
  | "quarantined"
  | "failed";

export interface SourceCoverageRecord {
  path: string;
  inputKind: string;
  mediaType: string;
  sourceSha256: string;
  resourceUri: string | null;
  markdownPath: string | null;
  intentUris: string[];
  treeRefs: string[];
  converter: string;
  converterVersion: string;
  state: SourceCoverageState;
  reasonCode: string;
  twinRevisionStatus: "not-evaluated" | "included" | "excluded";
}

export interface SourceCoverageDocument {
  schema: "bioxfoundry.source-coverage/v1";
  sourceSnapshotSha256: string;
  coverageSha256: string;
  summary: {
    discovered: number;
    terminal: number;
    byState: Record<SourceCoverageState, number>;
  };
  records: SourceCoverageRecord[];
}

export interface IntentRecord {
  schemaVersion: "t2c.intent/v1";
  id: string;
  statement: {
    kind: string;
    actor: string | null;
    action: "add" | "fix" | "remove" | "refactor" | "test" | "document" | "configure" | "analyze" | "validate" | "call" | "depend_on" | "declare" | "release" | "change" | "preserve" | "block" | "approve" | "unknown";
    subject: string | null;
    object: string;
    target: { paths: string[]; symbols: string[]; tickets: string[]; versions: string[] };
    modality: "required" | "recommended" | "optional" | "observed" | "claimed" | "unknown";
    polarity: "positive" | "negative";
    text: string;
  };
  lifecycle: { status: "proposed" | "planned" | "in_progress" | "implemented" | "verified" | "released" | "completed" | "blocked" | "unknown" };
  source: {
    kind: "nl" | "git" | "ast" | "todo" | "changelog" | "document" | "agent_log" | "test" | "system";
    path: string | null;
    lines: { start: number; end: number } | null;
    revision: string | null;
    symbol: string | null;
    commitIndex: number | null;
    extractor: string;
    contentHash: string;
    rawExcerpt: string | null;
  };
  epistemic: {
    class: "declaration" | "plan" | "claim" | "fact" | "inference" | "llm_inference";
    confidence: number;
    basis: string[];
  };
  observedAt: string | null;
  metadata: {
    generation: {
      generator: string;
      generatorVersion: string;
      runtimeVersion: string;
      requested: "deterministic" | "llm";
      used: "deterministic" | "llm";
      degraded: boolean;
      fallbackReason: string | null;
      provider: string | null;
      model: string | null;
      responseId: string | null;
    };
    bioxfoundry?: {
      legacyType: EpistemicType;
      targetUris: string[];
      sourceAnchor: SourceAnchor;
    };
    [key: string]: unknown;
  };
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
