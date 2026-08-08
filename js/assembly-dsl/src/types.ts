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
  coverage: {
    assemblies: number;
    completeAssemblies: number;
    requiredParts: number;
    completeRequiredParts: number;
    availableAssets: number;
    placedParts: number;
  };
  assemblies: Array<AssemblySpec & { rootExists: boolean; complete: boolean; parts: AssemblyPartStatus[] }>;
  findings: AssemblyFinding[];
}
