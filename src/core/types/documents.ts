import type { SourceAnchor, SourceRole } from "./contracts.js";

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
