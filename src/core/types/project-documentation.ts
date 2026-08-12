import type { AnalysisTraceCitation, AnalysisTraceDecision } from "./project-runtime.js";
import type { ProjectIntegrityFinding } from "./project-runtime.js";
import type { SourceRole } from "./contracts.js";

export interface ProjectDocumentationSource {
  role: SourceRole;
  logicalRoot: string;
  labels: string[];
}

export interface ProjectDocumentationComponent {
  id: string;
  label: string;
  type: string;
  parentId: string | null;
  scenePath: string | null;
  representation: string;
  geometryEvidence: string;
  semanticEvidence: string;
  sourceCount: number;
  position?: [number, number, number];
  size?: [number, number, number];
}

export interface ProjectDocumentationAssembly {
  id: string;
  kind: "device" | "assembly" | "module";
  rootComponentId: string;
  complete: boolean;
  parts: Array<{
    id: string;
    componentId: string;
    required: boolean;
    complete: boolean;
    assetUri: string | null;
    scenePath: string | null;
    findingCodes: string[];
  }>;
}

export interface ProjectDocumentationProcessStep {
  id: string;
  label: string;
  phase: string;
  componentIds: string[];
  interactions: string[];
  parameters: string[];
  success: string | null;
  failure: string | null;
  citationIds: string[];
  gaps: string[];
}

export interface ProjectDocumentationProcess {
  id: string;
  label: string;
  kind: string;
  completeness: string;
  ordering: string;
  cyclic: boolean;
  componentIds: string[];
  gaps: string[];
  steps: ProjectDocumentationProcessStep[];
}

export interface ProjectDocumentationAnimation {
  processId: string;
  available: boolean;
  unavailableReason: string | null;
  timingMode: "normalized-presentation";
  factualProcessDuration: false;
  clips: Array<{ stepId: string; startMs: number; endMs: number; effects: string[] }>;
}

export interface ProjectDocumentationDocument {
  schema: "subactor.project-documentation/v1";
  project: {
    id: string;
    name: string;
    profile: string;
    managerIntent: string;
  };
  generatedAt: string;
  generationMethod: "deterministic-from-accepted-artifacts";
  explanationBoundary: string;
  activeRevision: {
    iterationUri: string | null;
    twinUri: string;
    sceneUri: string;
    analysisTraceUri: string;
    sourceSnapshotHash: string;
    runtimeGeneration: string;
    acceptedAt: string;
  };
  summary: {
    resources: number;
    resourceBytes: number;
    components: number;
    sceneBindings: number;
    meshBindings: number;
    primitiveFallbacks: number;
    assemblies: number;
    completeAssemblies: number;
    processes: number;
    completeProcesses: number;
    processSteps: number;
    evidencedProcessSteps: number;
    geometryRequiredChecks: number;
    geometryPassedRequiredChecks: number;
    integrityOk: boolean;
    integrityComplete: boolean;
  };
  inputs: {
    sources: ProjectDocumentationSource[];
    resourcesByRole: Record<string, number>;
    resourcesByMediaType: Record<string, number>;
    intentDsl: { semanticHash: string; packs: number; records: number; invalid: number };
    sourceCoverage: {
      reports: number;
      invalidReports: number;
      discovered: number;
      terminal: number;
      byState: Record<string, number>;
    };
  };
  components: ProjectDocumentationComponent[];
  assemblies: ProjectDocumentationAssembly[];
  processes: ProjectDocumentationProcess[];
  animations: ProjectDocumentationAnimation[];
  mqtt: {
    configured: boolean;
    revisionBound: boolean;
    bindingSha256: string | null;
    authority: "observe-only" | null;
    defaultMode: string | null;
    brokers: Array<{ id: string; clientId: string; urlEnv: string; keepAliveSeconds: number }>;
    routes: Array<{ id: string; brokerId: string; topic: string; qos: number; processId: string; processUri: string; modes: string[] }>;
  };
  liveState: {
    available: boolean;
    evaluatedAt: string | null;
    coverage: Record<string, number>;
    components: Array<{
      componentId: string;
      properties: Array<{ property: string; value: string; unit: string | null; state: string; quality: string; observedAt: string | null }>;
    }>;
  };
  validation: {
    geometry: { ok: boolean; complete: boolean; requiredChecks: number; passedRequiredChecks: number; failures: string[] };
    integrity: { ok: boolean; complete: boolean; coverage: Record<string, number>; findings: ProjectIntegrityFinding[] };
  };
  decisions: AnalysisTraceDecision[];
  citations: AnalysisTraceCitation[];
}

export interface ProjectDocumentationManifest {
  schema: "subactor.project-documentation-manifest/v1";
  projectId: string;
  generatedAt: string;
  documentUri: string;
  activeRevision: ProjectDocumentationDocument["activeRevision"];
  artifacts: Record<string, { mediaType: string; sha256: string; bytes: number }>;
}
