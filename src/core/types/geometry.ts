import type { GeometryScalar, GeometryUnit, GeometryUpAxis } from "./physical.js";

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
