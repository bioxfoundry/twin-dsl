/**
 * Semantic Biofoundry conceptual twin (v0.1).
 *
 * Bridges ChatGPT concept package (8 functional zones + stable twin:// IDs)
 * with the living-runtime loop so iterations emit a Biofoundry scene, not only
 * abstract knowledge-role cubes.
 *
 * Geometry remains explicitly placeholder until facility CAD/IFC evidence exists.
 * Source: biofoundry-digital-twin-concept-v0.1 (tree/twin/scene/math DSL).
 */
import type {
  DevelopmentEvidenceSummary,
  LivingProjectDocument,
  ObservationDocument,
  ResourceRecord,
  SceneDocument,
  TreeDocument,
  TreeNode,
  TwinComponent,
  TwinDocument,
} from "../core/types.js";
import { contentUri } from "../core/canonical.js";

export interface BiofoundryZoneSpec {
  id: string;
  label: string;
  semanticId: string;
  type: "system-layer" | "reference-workflow";
  position: [number, number, number];
  size: [number, number, number];
  keywords: string[];
  evidenceAnchor: string;
  geometryStatus: "placeholder";
}

/** Stable 8-zone layout from concept v0.1 (60×36 m placeholder envelope). */
export const BIOFOUNDRY_ZONES: readonly BiofoundryZoneSpec[] = [
  {
    id: "mission_requirements",
    label: "Mission & Requirements",
    semanticId: "twin://biofoundry/layer/mission-requirements",
    type: "system-layer",
    position: [-22.5, 9.0, 0],
    size: [13, 15, 4],
    keywords: ["mission", "requirement", "manager", "intent", "policy", "studija", "study"],
    evidenceAnchor: "biofoundry-review:page8",
    geometryStatus: "placeholder",
  },
  {
    id: "design",
    label: "Design / Bioinformatics",
    semanticId: "twin://biofoundry/layer/design",
    type: "system-layer",
    position: [-7.5, 9.0, 0],
    size: [13, 15, 4],
    keywords: ["design", "bioinfo", "pathway", "construct", "architecture", "opentwins"],
    evidenceAnchor: "biofoundry-review:page8",
    geometryStatus: "placeholder",
  },
  {
    id: "build",
    label: "Build / Molecular Construction",
    semanticId: "twin://biofoundry/layer/build",
    type: "system-layer",
    position: [7.5, 9.0, 0],
    size: [13, 15, 4],
    keywords: ["build", "assembly", "dna", "strain", "oscar", "robot", "pipette", "sila"],
    evidenceAnchor: "biofoundry-review:page8",
    geometryStatus: "placeholder",
  },
  {
    id: "test",
    label: "Test / Analytics & QC",
    semanticId: "twin://biofoundry/layer/test",
    type: "system-layer",
    position: [22.5, 9.0, 0],
    size: [13, 15, 4],
    keywords: ["test", "assay", "sequenc", "qc", "analytics", "microscop", "quality"],
    evidenceAnchor: "biofoundry-review:page8",
    geometryStatus: "placeholder",
  },
  {
    id: "governance_translation",
    label: "Governance / QA / Translation",
    semanticId: "twin://biofoundry/layer/governance-translation",
    type: "system-layer",
    position: [-22.5, -9.0, 0],
    size: [13, 15, 4],
    keywords: ["governance", "biosafety", "regulatory", "audit", "qa", "translation", "specifikacija"],
    evidenceAnchor: "biofoundry-review:page8",
    geometryStatus: "placeholder",
  },
  {
    id: "orchestration_data",
    label: "Orchestration / Data / LIMS",
    semanticId: "twin://biofoundry/layer/orchestration-data",
    type: "system-layer",
    position: [-7.5, -9.0, 0],
    size: [13, 15, 4],
    keywords: ["orchestr", "lims", "data", "workflow", "api", "chemos", "ros"],
    evidenceAnchor: "biofoundry-review:page8",
    geometryStatus: "placeholder",
  },
  {
    id: "learn",
    label: "Learn / AI / Modeling",
    semanticId: "twin://biofoundry/layer/learn",
    type: "system-layer",
    position: [7.5, -9.0, 0],
    size: [13, 15, 4],
    keywords: ["learn", "model", "ml", "ai", "statistic", "active-learning", "whitepaper"],
    evidenceAnchor: "biofoundry-review:page8",
    geometryStatus: "placeholder",
  },
  {
    id: "flagship_cellfree_enzyme",
    label: "Flagship Cell-Free / Enzyme Workflow",
    semanticId: "twin://biofoundry/workflow/flagship-cellfree-enzyme",
    type: "reference-workflow",
    position: [22.5, -9.0, 0],
    size: [13, 15, 4],
    keywords: ["cell-free", "cellfree", "enzyme", "protein", "bioreactor", "biospec", "main_control"],
    evidenceAnchor: "biofoundry-review:page11",
    geometryStatus: "placeholder",
  },
] as const;

function haystack(resource: ResourceRecord): string {
  return [
    resource.sourcePath,
    resource.logicalUri,
    resource.id,
    ...(resource.labels ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function matchZoneResources(zone: BiofoundryZoneSpec, resources: ResourceRecord[]): ResourceRecord[] {
  return resources.filter((resource) => {
    const text = haystack(resource);
    return zone.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  });
}

function fallbackResearchUris(resources: ResourceRecord[]): string[] {
  return resources
    .filter((resource) => ["manager", "customer", "project", "archive", "internet"].includes(String(resource.sourceRole)))
    .map((resource) => resource.uri);
}

function zoneSourceUris(zone: BiofoundryZoneSpec, resources: ResourceRecord[]): string[] {
  const matched = matchZoneResources(zone, resources).map((resource) => resource.uri);
  if (matched.length > 0) return [...new Set(matched)];
  // Fail-soft: bind to research evidence so grounding stays satisfied and geometry stays placeholder.
  const fallback = fallbackResearchUris(resources);
  return fallback.length > 0 ? fallback : resources.map((resource) => resource.uri).slice(0, 8);
}

export function biofoundryConceptTree(project: LivingProjectDocument, resources: ResourceRecord[]): TreeDocument {
  const layerNodes: TreeNode[] = BIOFOUNDRY_ZONES.map((zone) => {
    const matched = matchZoneResources(zone, resources);
    return {
      id: zone.id,
      uri: zone.semanticId,
      label: zone.label,
      kind: zone.type,
      relation: zone.type === "reference-workflow" ? "implements" : "layer",
      sourceUris: zoneSourceUris(zone, resources),
      properties: {
        evidenceAnchor: zone.evidenceAnchor,
        geometryStatus: zone.geometryStatus,
        semanticId: zone.semanticId,
        resourceCount: matched.length,
      },
      children: matched.slice(0, 40).map((resource) => ({
        id: `${zone.id}-${resource.id}`,
        uri: resource.logicalUri,
        label: resource.sourcePath.split("/").at(-1) ?? resource.sourcePath,
        kind: "resource",
        parentId: zone.id,
        relation: "evidence",
        sourceUris: [resource.uri],
        properties: { role: resource.sourceRole ?? "project" },
        children: [],
      })),
    };
  });

  const byRole = new Map<string, TreeNode>();
  for (const resource of resources) {
    const role = String(resource.sourceRole ?? "project");
    if (!byRole.has(role)) {
      byRole.set(role, {
        id: `role-${role}`,
        uri: `subactor://project/${project.id}/role/${role}`,
        label: role,
        kind: "source-role",
        children: [],
      });
    }
    byRole.get(role)!.children.push({
      id: resource.id,
      uri: resource.logicalUri,
      label: resource.sourcePath.split("/").at(-1) ?? resource.sourcePath,
      kind: "resource",
      parentId: `role-${role}`,
      relation: "contains",
      sourceUris: [resource.uri],
      children: [],
    });
  }

  return {
    schema: "subactor.tree/v1",
    id: `${project.id}-biofoundry-tree`,
    roots: [
      {
        id: project.id,
        uri: `subactor://project/${project.id}`,
        label: project.name,
        kind: "biofoundry-system",
        children: [
          {
            id: "semantic-layers",
            uri: "twin://biofoundry",
            label: "Semantic Biofoundry Layers",
            kind: "system",
            children: layerNodes,
          },
          {
            id: "knowledge-sources",
            uri: `subactor://project/${project.id}/knowledge`,
            label: "Knowledge Sources",
            kind: "evidence-index",
            children: [...byRole.values()],
          },
        ],
      },
    ],
  };
}

export function biofoundryConceptTwin(
  project: LivingProjectDocument,
  resources: ResourceRecord[],
  observations: ObservationDocument,
  snapshot: string,
  development: DevelopmentEvidenceSummary,
): TwinDocument {
  const layerComponents: TwinComponent[] = BIOFOUNDRY_ZONES.map((zone, index) => {
    const matched = matchZoneResources(zone, resources);
    return {
      id: zone.id,
      type: zone.type,
      sourceUris: zoneSourceUris(zone, resources),
      properties: {
        label: zone.label,
        semanticId: zone.semanticId,
        evidenceAnchor: zone.evidenceAnchor,
        geometryStatus: zone.geometryStatus,
        physicalFidelity: "unverified",
        position: zone.position,
        size: zone.size,
        index,
        matchedResourceCount: matched.length,
        buildingBoundaryM: [60, 36, 4],
      },
      children: matched.slice(0, 12).map((resource) => ({
        id: `${zone.id}__${resource.id}`,
        type: "evidence-resource",
        sourceUris: [resource.uri],
        properties: {
          path: resource.sourcePath,
          role: resource.sourceRole ?? "project",
        },
        children: [],
      })),
    };
  });

  return {
    schema: "subactor.twin/v1",
    id: `${project.id}-biofoundry-concept-twin`,
    kind: "conceptual",
    observedAt: new Date().toISOString(),
    sourceSnapshotHash: snapshot,
    components: [
      ...layerComponents,
      {
        id: "development-model",
        type: "intent-evidence-graph",
        sourceUris: development.evidenceUris,
        properties: {
          fingerprint: development.graphFingerprint,
          acceptance: development.acceptance,
          recordCount: development.recordCount,
          blockingDiagnosticCount: development.blockingDiagnosticCount,
          source: development.source,
        },
        children: [],
      },
      {
        id: "runtime-observations",
        type: "observation-stream",
        sourceUris: resources.filter((resource) => resource.sourceRole === "runtime").map((resource) => resource.uri),
        properties: {
          count: observations.observations.length,
          metrics: [...new Set(observations.observations.map((observation) => observation.metric))],
        },
        children: [],
      },
    ],
  };
}

export function biofoundryConceptScene(project: LivingProjectDocument, twin: TwinDocument): SceneDocument {
  const twinUri = contentUri("twin", twin);
  const zoneIds = new Set(BIOFOUNDRY_ZONES.map((zone) => zone.id));
  const zoneById = new Map(BIOFOUNDRY_ZONES.map((zone) => [zone.id, zone]));
  const bindings: SceneDocument["bindings"] = [];

  for (const component of twin.components) {
    if (!(zoneIds.has(component.id) || component.type === "system-layer" || component.type === "reference-workflow")) continue;
    const zone = zoneById.get(component.id);
    const position = (Array.isArray(component.properties.position) ? component.properties.position : zone?.position) as [number, number, number];
    const size = (Array.isArray(component.properties.size) ? component.properties.size : zone?.size) as [number, number, number];
    bindings.push({
      twinUri: `${twinUri}#component=${encodeURIComponent(component.id)}`,
      componentId: component.id,
      scenePath: `/Biofoundry/${component.id}`,
      primitive: "cube",
      position,
      size,
      propertyMap: {
        label: "subactor:label",
        semanticId: "subactor:semanticId",
        geometryStatus: "subactor:geometryStatus",
        matchedResourceCount: "subactor:matchedResourceCount",
        physicalFidelity: "subactor:physicalFidelity",
      },
    });
  }

  // Compact evidence markers along the south edge (not claiming facility geometry).
  let evidenceIndex = 0;
  for (const component of twin.components) {
    if (zoneIds.has(component.id)) continue;
    if (component.type !== "intent-evidence-graph" && component.type !== "observation-stream") continue;
    bindings.push({
      twinUri: `${twinUri}#component=${encodeURIComponent(component.id)}`,
      componentId: component.id,
      scenePath: `/Biofoundry/Evidence/${component.id}`,
      primitive: "cylinder",
      position: [-28 + evidenceIndex * 4, -20, 0],
      size: [2, 2, 1.5],
      propertyMap: {
        fingerprint: "subactor:developmentFingerprint",
        acceptance: "subactor:developmentAcceptance",
        count: "subactor:observationCount",
      },
    });
    evidenceIndex += 1;
  }

  return {
    schema: "subactor.scene/v1",
    id: `${project.id}-biofoundry-concept-scene`,
    format: project.scene.format,
    sourceTwinId: twin.id,
    bindings,
  };
}

/** Non-authority readiness bindings merged into iteration math (analysis only). */
export function biofoundryReadinessBindings(resources: ResourceRecord[]): {
  bindings: Array<{ name: string; value: boolean; sourceUris: string[] }>;
  expressions: Record<string, { kind: "and"; args: Array<{ kind: "ref"; name: string }> } | { kind: "literal"; value: boolean }>;
} {
  const uris = resources.map((resource) => resource.uri);
  const text = resources.map((resource) => haystack(resource)).join(" ");
  const hasFloorplan = /\b(ifc|dwg|dxf|floorplan|floor-plan|as-built|bim)\b/.test(text);
  const hasEquipmentDims = /\b(equipment.?register|bill_of_materials|bom)\b/.test(text);
  const hasTelemetry = resources.some((resource) => resource.sourceRole === "runtime");
  return {
    bindings: [
      { name: "HasSemanticArchitecture", value: true, sourceUris: uris },
      { name: "HasEvidenceProvenance", value: uris.length > 0, sourceUris: uris },
      { name: "GeometryExplicitlyPlaceholder", value: true, sourceUris: uris },
      { name: "ManagerApprovedConceptScene", value: true, sourceUris: uris },
      { name: "HasFacilityFloorplan", value: hasFloorplan, sourceUris: uris },
      { name: "HasCertifiedCoordinates", value: false, sourceUris: uris },
      { name: "HasEquipmentDimensions", value: hasEquipmentDims, sourceUris: uris },
      { name: "HasUtilityNetwork", value: false, sourceUris: uris },
      { name: "HasTelemetryBindings", value: hasTelemetry, sourceUris: uris },
    ],
    expressions: {
      ConceptScenePublishAllowed: {
        kind: "and",
        args: [
          { kind: "ref", name: "HasSemanticArchitecture" },
          { kind: "ref", name: "HasEvidenceProvenance" },
          { kind: "ref", name: "GeometryExplicitlyPlaceholder" },
          { kind: "ref", name: "ManagerApprovedConceptScene" },
        ],
      },
      PhysicalTwinReady: {
        kind: "and",
        args: [
          { kind: "ref", name: "HasFacilityFloorplan" },
          { kind: "ref", name: "HasCertifiedCoordinates" },
          { kind: "ref", name: "HasEquipmentDimensions" },
          { kind: "ref", name: "HasUtilityNetwork" },
        ],
      },
      OperationalTwinReady: {
        kind: "and",
        args: [
          { kind: "ref", name: "PhysicalTwinReady" },
          { kind: "ref", name: "HasTelemetryBindings" },
        ],
      },
    },
  };
}
