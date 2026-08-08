/**
 * Physical Evidence Intake — replaces placeholder geometry with surveyed / CAD / IFC facts.
 *
 * The contract the whole physical-twin path rests on:
 *   componentId stays the same, scenePath stays the same,
 *   only the physical representation and its provenance change.
 * A component therefore walks placeholder → measured → cad → ifc → verified without ever
 * becoming a second component, and weaker evidence can never overwrite stronger evidence.
 */
import type {
  GeometryEvidenceKind,
  PhysicalEvidenceDocument,
  PhysicalEvidenceRecord,
  PhysicalEvidenceReport,
  SceneDocument,
  TwinDocument,
} from "../core/types.js";
import { GEOMETRY_EVIDENCE_ORDER } from "../core/types.js";
import { contentUri } from "../core/canonical.js";
import { validateScene } from "../dsl/scene.js";
import { validateTwin } from "../dsl/twin.js";

const EVIDENCE_KINDS = new Set<string>(GEOMETRY_EVIDENCE_ORDER);
const RECORD_KINDS = new Set(["space", "equipment", "utility"]);
// Kept in lockstep with schemas/physical-evidence.schema.json, which declares additionalProperties:false.
const DOCUMENT_KEYS = new Set(["schema", "id", "coordinateSystem", "records"]);
const RECORD_KEYS = new Set(["componentId", "kind", "evidence", "position", "size", "assetUri", "sourceRef", "properties"]);

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, error: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${error}:${unknown.join(",")}`);
}

/**
 * Map the free-form `geometryEvidence` strings authored in blueprints onto the ranked scale.
 * Unknown values rank lowest, so intake is free to improve them.
 */
export function normalizeGeometryEvidence(value: unknown): GeometryEvidenceKind {
  const text = String(value ?? "").toLowerCase();
  if (EVIDENCE_KINDS.has(text)) return text as GeometryEvidenceKind;
  if (text.includes("verified") || text.includes("as-built") || text.includes("as_built")) return "verified";
  if (text.includes("ifc") || text.includes("bim")) return "ifc";
  if (text.includes("cad") || text.includes("stl") || text.includes("step") || text.includes("mesh")) return "cad";
  if (text.includes("measured") || text.includes("survey")) return "measured";
  if (text.includes("document") || text.includes("archive") || text.includes("inventory") || text.includes("drawing")) return "document";
  return "placeholder";
}

export function geometryEvidenceRank(value: unknown): number {
  return GEOMETRY_EVIDENCE_ORDER.indexOf(normalizeGeometryEvidence(value));
}

function isVec3(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === "number" && Number.isFinite(x));
}

export function validatePhysicalEvidence(value: unknown): PhysicalEvidenceDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PHYSICAL_EVIDENCE_REQUIRED");
  const d = value as Record<string, unknown>;
  if (d.schema !== "subactor.physical-evidence/v1" || typeof d.id !== "string" || !d.id || !Array.isArray(d.records)) {
    throw new Error("PHYSICAL_EVIDENCE_INVALID");
  }
  rejectUnknownKeys(d, DOCUMENT_KEYS, "PHYSICAL_EVIDENCE_UNKNOWN_KEY");
  const cs = d.coordinateSystem as Record<string, unknown> | undefined;
  // Refusing anything but metres/Z-up keeps millimetre CAD from silently entering a metre scene.
  if (!cs || cs.unit !== "m" || cs.upAxis !== "Z" || (cs.origin !== undefined && typeof cs.origin !== "string")) {
    throw new Error("PHYSICAL_EVIDENCE_COORDINATE_SYSTEM_INVALID");
  }
  const seen = new Set<string>();
  for (const raw of d.records) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("PHYSICAL_EVIDENCE_RECORD_INVALID");
    const r = raw as Record<string, unknown>;
    if (typeof r.componentId !== "string" || !r.componentId) throw new Error("PHYSICAL_EVIDENCE_COMPONENT_ID_INVALID");
    rejectUnknownKeys(r, RECORD_KEYS, `PHYSICAL_EVIDENCE_UNKNOWN_RECORD_KEY:${r.componentId}`);
    if (!RECORD_KINDS.has(String(r.kind))) throw new Error(`PHYSICAL_EVIDENCE_KIND_INVALID:${r.componentId}`);
    if (!EVIDENCE_KINDS.has(String(r.evidence))) throw new Error(`PHYSICAL_EVIDENCE_GRADE_INVALID:${r.componentId}`);
    if (r.position !== undefined && !isVec3(r.position)) throw new Error(`PHYSICAL_EVIDENCE_POSITION_INVALID:${r.componentId}`);
    if (r.size !== undefined && !isVec3(r.size)) throw new Error(`PHYSICAL_EVIDENCE_SIZE_INVALID:${r.componentId}`);
    if (r.size !== undefined && (r.size as number[]).some((x) => x <= 0)) throw new Error(`PHYSICAL_EVIDENCE_SIZE_NOT_POSITIVE:${r.componentId}`);
    if (r.assetUri !== undefined && (typeof r.assetUri !== "string" || !r.assetUri)) throw new Error(`PHYSICAL_EVIDENCE_ASSET_INVALID:${r.componentId}`);
    if (r.sourceRef !== undefined && typeof r.sourceRef !== "string") throw new Error(`PHYSICAL_EVIDENCE_SOURCE_REF_INVALID:${r.componentId}`);
    if (seen.has(r.componentId)) throw new Error(`PHYSICAL_EVIDENCE_DUPLICATE:${r.componentId}`);
    seen.add(r.componentId);
  }
  return value as PhysicalEvidenceDocument;
}

/**
 * Blueprint labels carry the placeholder they were written for — "Facility envelope
 * (placeholder 60×36 m)". Once evidence supersedes that geometry the parenthetical is a
 * false claim, sitting in the dashboard next to an `ifc` badge and the real 58.2 × 34.6 m.
 *
 * Only the placeholder clause is removed; the component's name is what makes it findable
 * and must survive. The label is not identity — `componentId` and `scenePath` are — so
 * rewriting it does not touch the contract intake exists to protect.
 */
export function labelWithoutPlaceholderClaim(label: string): string {
  return label
    .replace(/\s*\((?:[^()]*\bplaceholder\b[^()]*)\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function fieldsOf(record: PhysicalEvidenceRecord): string[] {
  const fields: string[] = [];
  if (record.position) fields.push("position");
  if (record.size) fields.push("size");
  if (record.assetUri) fields.push("assetUri");
  return fields;
}

/**
 * Fold physical facts into an existing twin + scene pair.
 * Returns new documents; the inputs are left untouched so a rejected intake changes nothing.
 */
export function applyPhysicalEvidence(input: {
  twin: TwinDocument;
  scene: SceneDocument;
  evidence: PhysicalEvidenceDocument;
  /** Ingested resource URIs; when given, a mesh/CAD reference outside the corpus is refused. */
  allowedAssetUris?: Iterable<string>;
}): { twin: TwinDocument; scene: SceneDocument; report: PhysicalEvidenceReport } {
  const { twin, scene, evidence } = input;
  const allowedAssets = input.allowedAssetUris ? new Set(input.allowedAssetUris) : undefined;
  const applied: PhysicalEvidenceReport["applied"] = [];
  const rejected: PhysicalEvidenceReport["rejected"] = [];

  const componentById = new Map(twin.components.map((c) => [c.id, c]));
  const boundIds = new Set(scene.bindings.map((b) => b.componentId).filter((x): x is string => Boolean(x)));
  const accepted = new Map<string, PhysicalEvidenceRecord>();

  for (const record of evidence.records) {
    const component = componentById.get(record.componentId);
    if (!component) {
      // An unknown id would mint a parallel component and break the single-identity contract.
      rejected.push({ componentId: record.componentId, reason: "UNKNOWN_COMPONENT" });
      continue;
    }
    if (!boundIds.has(record.componentId)) {
      rejected.push({ componentId: record.componentId, reason: "COMPONENT_NOT_BOUND_IN_SCENE" });
      continue;
    }
    const current = normalizeGeometryEvidence(component.properties.geometryEvidence);
    if (geometryEvidenceRank(record.evidence) < geometryEvidenceRank(current)) {
      rejected.push({ componentId: record.componentId, reason: `WEAKER_THAN_EXISTING:${current}` });
      continue;
    }
    if (record.assetUri && allowedAssets && !allowedAssets.has(record.assetUri)) {
      // Geometry must be as traceable as every other fact: the mesh has to be an ingested resource.
      rejected.push({ componentId: record.componentId, reason: "ASSET_NOT_GROUNDED" });
      continue;
    }
    const fields = fieldsOf(record);
    if (fields.length === 0 && record.evidence === current) {
      rejected.push({ componentId: record.componentId, reason: "NO_CHANGE" });
      continue;
    }
    accepted.set(record.componentId, record);
    applied.push({ componentId: record.componentId, from: current, to: record.evidence, fields });
  }

  const nextTwin: TwinDocument = {
    ...twin,
    components: twin.components.map((component) => {
      const record = accepted.get(component.id);
      if (!record) return component;
      const properties: Record<string, unknown> = {
        ...component.properties,
        ...(record.properties ?? {}),
        geometryEvidence: record.evidence,
        geometryUnit: evidence.coordinateSystem.unit,
        geometryUpAxis: evidence.coordinateSystem.upAxis,
        physicalEvidenceId: evidence.id,
      };
      if (record.sourceRef) properties.geometrySourceRef = record.sourceRef;
      if (evidence.coordinateSystem.origin) properties.geometryOrigin = evidence.coordinateSystem.origin;
      if (record.position) properties.position = record.position;
      if (record.size) properties.size = record.size;
      // A component that has been hardened must stop advertising the placeholder it replaced.
      if (typeof properties.label === "string" && normalizeGeometryEvidence(record.evidence) !== "placeholder") {
        properties.label = labelWithoutPlaceholderClaim(properties.label);
      }
      return { ...component, properties };
    }),
  };

  // Evidence changes the twin's content hash, so every binding has to re-point at the new revision
  // or scene grounding (`SCENE_TWIN_URI_NOT_GROUNDED`) would reject the pair we just produced.
  const previousTwinUri = contentUri("twin", twin);
  const nextTwinUri = contentUri("twin", nextTwin);
  const nextScene: SceneDocument = {
    ...scene,
    bindings: scene.bindings.map((binding) => {
      const record = binding.componentId ? accepted.get(binding.componentId) : undefined;
      const twinUri = binding.twinUri.startsWith(previousTwinUri)
        ? nextTwinUri + binding.twinUri.slice(previousTwinUri.length)
        : binding.twinUri;
      if (!record) return { ...binding, twinUri };
      return {
        ...binding,
        twinUri,
        position: record.position ?? binding.position,
        size: record.size ?? binding.size,
        assetUri: record.assetUri ?? binding.assetUri,
      };
    }),
  };

  validateTwin(nextTwin);
  validateScene(nextScene);

  const report: PhysicalEvidenceReport = {
    schema: "subactor.physical-evidence-report/v1",
    applied,
    rejected,
    componentIdsStable:
      JSON.stringify(twin.components.map((c) => c.id)) === JSON.stringify(nextTwin.components.map((c) => c.id)),
    scenePathsStable:
      JSON.stringify(scene.bindings.map((b) => b.scenePath)) === JSON.stringify(nextScene.bindings.map((b) => b.scenePath)),
  };
  return { twin: nextTwin, scene: nextScene, report };
}
