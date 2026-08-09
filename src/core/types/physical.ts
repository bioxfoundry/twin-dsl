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
  /** Addressable proof matrix for every physical/hybrid component requirement. */
  requirementResults?: Array<{
    componentId: string;
    required: Array<"position" | "size" | "orientation" | "constraints">;
    satisfied: Array<"position" | "size" | "orientation" | "constraints">;
    missing: Array<"position" | "size" | "orientation" | "constraints">;
  }>;
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
