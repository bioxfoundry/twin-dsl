import type { MathValue } from "./documents.js";

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
