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
