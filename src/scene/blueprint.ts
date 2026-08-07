/**
 * Semantic Scene Blueprint — stable component identity vs changing state.
 * Ported from digital-twin-runtime-starter 0.5.0 / Biofoundry Live v0.2,
 * extended for evidence path filters and detailed equipment from corpus.
 */
import type {
  DevelopmentEvidenceSummary,
  ObservationDocument,
  ResourceRecord,
  SceneBlueprint,
  SceneDocument,
  TwinDocument,
} from "../core/types.js";
import { contentUri } from "../core/canonical.js";
import { validateScene } from "../dsl/scene.js";
import { validateTwin } from "../dsl/twin.js";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Mirrors schemas/scene-blueprint.schema.json; test/schema-drift.test.ts keeps the two in step. */
const SOURCE_ROLES = ["manager", "customer", "project", "internet", "archive", "derived", "runtime", "development"];
const PRIMITIVES = ["cube", "cylinder", "sphere", "scope"];
const COMPONENT_KEYS = new Set([
  "id", "type", "label", "sourceRoles", "pathIncludes", "pathExcludes",
  "maxSourceUris", "properties", "includeDevelopmentEvidence", "includeRuntimeObservations",
]);
const BINDING_KEYS = new Set(["componentId", "scenePath", "primitive", "position", "size", "propertyMap"]);
const DOCUMENT_KEYS = new Set(["schema", "id", "twinKind", "components", "bindings"]);

function isVec3(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === "number" && Number.isFinite(x));
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, error: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${error}:${unknown.join(",")}`);
}

export function validateSceneBlueprint(value: unknown): SceneBlueprint {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SCENE_BLUEPRINT_REQUIRED");
  const d = value as Record<string, unknown>;
  if (
    d.schema !== "subactor.scene-blueprint/v1" ||
    typeof d.id !== "string" ||
    !d.id ||
    !["actor", "system", "process", "physical", "conceptual"].includes(String(d.twinKind)) ||
    !Array.isArray(d.components) ||
    d.components.length === 0 ||
    !Array.isArray(d.bindings) ||
    d.bindings.length === 0
  ) {
    throw new Error("SCENE_BLUEPRINT_INVALID");
  }
  rejectUnknownKeys(d, DOCUMENT_KEYS, "SCENE_BLUEPRINT_UNKNOWN_KEY");
  const ids = new Set<string>();
  for (const raw of d.components) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("SCENE_BLUEPRINT_COMPONENT_INVALID");
    const c = raw as Record<string, unknown>;
    if (
      typeof c.id !== "string" ||
      !c.id ||
      typeof c.type !== "string" ||
      !c.type ||
      !Array.isArray(c.sourceRoles) ||
      !c.sourceRoles.every((x) => typeof x === "string" && SOURCE_ROLES.includes(x))
    ) {
      throw new Error("SCENE_BLUEPRINT_COMPONENT_INVALID");
    }
    rejectUnknownKeys(c, COMPONENT_KEYS, `SCENE_BLUEPRINT_COMPONENT_UNKNOWN_KEY:${c.id}`);
    if (c.label !== undefined && typeof c.label !== "string") throw new Error(`SCENE_BLUEPRINT_LABEL_INVALID:${c.id}`);
    if (c.maxSourceUris !== undefined && (!Number.isInteger(c.maxSourceUris) || (c.maxSourceUris as number) < 1 || (c.maxSourceUris as number) > 500)) {
      throw new Error(`SCENE_BLUEPRINT_MAX_SOURCE_URIS_INVALID:${c.id}`);
    }
    if (c.properties !== undefined && (!c.properties || typeof c.properties !== "object" || Array.isArray(c.properties))) {
      throw new Error(`SCENE_BLUEPRINT_PROPERTIES_INVALID:${c.id}`);
    }
    for (const flag of ["includeDevelopmentEvidence", "includeRuntimeObservations"] as const) {
      if (c[flag] !== undefined && typeof c[flag] !== "boolean") throw new Error(`SCENE_BLUEPRINT_FLAG_INVALID:${c.id}:${flag}`);
    }
    if (!new Set(c.sourceRoles as string[]).size || new Set(c.sourceRoles as string[]).size !== (c.sourceRoles as string[]).length) {
      throw new Error(`SCENE_BLUEPRINT_SOURCE_ROLES_INVALID:${c.id}`);
    }
    if (c.pathIncludes !== undefined && (!Array.isArray(c.pathIncludes) || !c.pathIncludes.every((x) => typeof x === "string"))) {
      throw new Error("SCENE_BLUEPRINT_PATH_INCLUDES_INVALID");
    }
    if (c.pathExcludes !== undefined && (!Array.isArray(c.pathExcludes) || !c.pathExcludes.every((x) => typeof x === "string"))) {
      throw new Error("SCENE_BLUEPRINT_PATH_EXCLUDES_INVALID");
    }
    if (ids.has(c.id)) throw new Error(`SCENE_BLUEPRINT_COMPONENT_DUPLICATE:${c.id}`);
    ids.add(c.id);
  }
  const paths = new Set<string>();
  for (const raw of d.bindings) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("SCENE_BLUEPRINT_BINDING_INVALID");
    const b = raw as Record<string, unknown>;
    if (
      typeof b.componentId !== "string" ||
      !ids.has(b.componentId) ||
      typeof b.scenePath !== "string" ||
      !b.scenePath.startsWith("/")
    ) {
      throw new Error("SCENE_BLUEPRINT_BINDING_INVALID");
    }
    rejectUnknownKeys(b, BINDING_KEYS, `SCENE_BLUEPRINT_BINDING_UNKNOWN_KEY:${String(b.componentId)}`);
    // An unknown primitive would fall through the renderer's switch and silently become a cube.
    if (b.primitive !== undefined && !PRIMITIVES.includes(String(b.primitive))) {
      throw new Error(`SCENE_BLUEPRINT_PRIMITIVE_INVALID:${String(b.componentId)}:${String(b.primitive)}`);
    }
    if (
      b.propertyMap !== undefined &&
      (!b.propertyMap || typeof b.propertyMap !== "object" || Array.isArray(b.propertyMap) ||
        !Object.values(b.propertyMap as Record<string, unknown>).every((x) => typeof x === "string"))
    ) {
      throw new Error(`SCENE_BLUEPRINT_PROPERTY_MAP_INVALID:${String(b.componentId)}`);
    }
    // Malformed vectors would render as an invalid double3 and make the whole USD layer unloadable.
    if (b.position !== undefined && !isVec3(b.position)) throw new Error(`SCENE_BLUEPRINT_POSITION_INVALID:${String(b.componentId)}`);
    if (b.size !== undefined && !isVec3(b.size)) throw new Error(`SCENE_BLUEPRINT_SIZE_INVALID:${String(b.componentId)}`);
    if (paths.has(b.scenePath)) throw new Error(`SCENE_BLUEPRINT_PATH_DUPLICATE:${b.scenePath}`);
    paths.add(b.scenePath);
  }
  return value as SceneBlueprint;
}

function resourceHaystack(resource: ResourceRecord): string {
  return [resource.sourcePath, resource.logicalUri, resource.id, ...(resource.labels ?? [])].join(" ").toLowerCase();
}

function matchResources(
  resources: ResourceRecord[],
  roles: string[],
  pathIncludes?: string[],
  pathExcludes?: string[],
): ResourceRecord[] {
  return resources.filter((resource) => {
    if (!roles.includes(resource.sourceRole ?? "project")) return false;
    const hay = resourceHaystack(resource);
    if (pathExcludes?.some((token) => hay.includes(token.toLowerCase()))) return false;
    if (!pathIncludes?.length) return true;
    return pathIncludes.some((token) => hay.includes(token.toLowerCase()));
  });
}

export function materializeBlueprintTwin(input: {
  blueprint: SceneBlueprint;
  projectId: string;
  resources: ResourceRecord[];
  observations: ObservationDocument;
  development: DevelopmentEvidenceSummary;
  sourceSnapshotHash: string;
}): TwinDocument {
  const { blueprint, projectId, resources, observations, development, sourceSnapshotHash } = input;
  const runtimeResourceUris = resources.filter((r) => r.sourceRole === "runtime").map((r) => r.uri);
  const latestByMetric = new Map<string, unknown>();
  for (const observation of observations.observations) latestByMetric.set(observation.metric, observation.value);

  const components = blueprint.components.map((component) => {
    const matched = matchResources(resources, component.sourceRoles, component.pathIncludes, component.pathExcludes);
    let sourceUris = matched.map((resource) => resource.uri);
    if (component.includeDevelopmentEvidence) sourceUris.push(...development.evidenceUris);
    if (component.includeRuntimeObservations) sourceUris.push(...runtimeResourceUris);
    sourceUris = unique(sourceUris);
    if (component.maxSourceUris && sourceUris.length > component.maxSourceUris) {
      sourceUris = sourceUris.slice(0, component.maxSourceUris);
    }

    const cadAssets = matched
      .filter((r) => /\.(step|stp|stl|f3d|scad|glb|usda)$/i.test(r.sourcePath) || /cad|zip-entry/i.test(r.sourcePath))
      .map((r) => r.sourcePath.split("/").at(-1) ?? r.sourcePath)
      .slice(0, 40);

    const properties: Record<string, unknown> = {
      ...(component.properties ?? {}),
      matchedResourceCount: matched.length,
      evidenceFidelity: matched.length > 0 ? (component.properties?.geometryEvidence === "placeholder" ? "semantic+path" : "semantic") : "role-fallback",
    };
    if (component.label) properties.label = component.label;
    if (component.pathIncludes?.length) properties.pathIncludes = component.pathIncludes;
    if (cadAssets.length) {
      properties.cadAssetCount = cadAssets.length;
      properties.cadAssets = cadAssets.join("|");
    }
    if (component.includeDevelopmentEvidence) {
      properties.developmentAcceptance = development.acceptance;
      properties.developmentFingerprint = development.graphFingerprint;
      properties.blockingDiagnosticCount = development.blockingDiagnosticCount;
      properties.developmentSource = development.source;
    }
    if (component.includeRuntimeObservations) {
      properties.observationCount = observations.observations.length;
      properties.observedMetrics = unique(observations.observations.map((o) => o.metric));
      for (const [metric, value] of latestByMetric) properties[`latest_${metric}`] = value;
    }
    // Fallback: if path filter matched nothing, still attach role URIs (capped) so grounding never empties identity.
    if (sourceUris.length === 0) {
      sourceUris = resources
        .filter((r) => component.sourceRoles.includes(r.sourceRole ?? "project"))
        .map((r) => r.uri)
        .slice(0, component.maxSourceUris ?? 12);
      properties.evidenceFidelity = "role-fallback-empty-filter";
    }
    // The fallback is empty when the project holds no resource in any declared role at all.
    // validateTwin would then fail with an opaque TWIN_COMPONENT_SOURCE_REQUIRED, so name the cause here.
    if (sourceUris.length === 0) {
      throw new Error(
        `SCENE_BLUEPRINT_COMPONENT_UNGROUNDED:${component.id}:no resource for sourceRoles=${component.sourceRoles.join("|")}`,
      );
    }

    return {
      id: component.id,
      type: component.type,
      sourceUris: unique(sourceUris),
      properties,
      children: [],
    };
  });

  const twin: TwinDocument = {
    schema: "subactor.twin/v1",
    id: `${projectId}-twin`,
    kind: blueprint.twinKind,
    observedAt: new Date().toISOString(),
    sourceSnapshotHash,
    components,
  };
  validateTwin(twin);
  return twin;
}

export function materializeBlueprintScene(input: {
  blueprint: SceneBlueprint;
  projectId: string;
  format: SceneDocument["format"];
  twin: TwinDocument;
}): SceneDocument {
  const twinUri = contentUri("twin", input.twin);
  const scene: SceneDocument = {
    schema: "subactor.scene/v1",
    id: `${input.projectId}-scene`,
    format: input.format,
    sourceTwinId: input.twin.id,
    bindings: input.blueprint.bindings.map((binding) => ({
      twinUri: `${twinUri}#component=${encodeURIComponent(binding.componentId)}`,
      componentId: binding.componentId,
      scenePath: binding.scenePath,
      primitive: binding.primitive ?? "cube",
      position: binding.position,
      size: binding.size,
      propertyMap: binding.propertyMap ?? {
        label: "subactor:label",
        geometryEvidence: "subactor:geometryEvidence",
        semanticEvidence: "subactor:semanticEvidence",
        matchedResourceCount: "subactor:matchedResourceCount",
        cadAssetCount: "subactor:cadAssetCount",
      },
    })),
  };
  validateScene(scene);
  return scene;
}

type C = SceneBlueprint["components"][number];
type B = SceneBlueprint["bindings"][number];

/**
 * Detailed Biofoundry blueprint v0.2.1:
 * - keeps stable v0.2 IDs (17)
 * - adds evidence-backed modules from nanobionic-laboratory corpus
 * - pathIncludes tighten equipment ↔ CAD/docs (no invented floor plan)
 */
export function biofoundryLiveBlueprintV02(): SceneBlueprint {
  const components: C[] = [
    {
      id: "facility_shell",
      type: "facility",
      label: "Facility envelope (placeholder 60×36 m)",
      sourceRoles: ["manager", "customer", "project"],
      pathIncludes: ["architecture", "cleanroom", "specifikacija", "studija", "facility", "whitepaper"],
      maxSourceUris: 40,
      properties: {
        semanticEvidence: "direct",
        geometryEvidence: "placeholder",
        buildingBoundaryM: [60, 36, 4],
        note: "Not as-built; replace when IFC/DWG arrives",
      },
    },
    {
      id: "mission_requirements",
      type: "system-layer",
      label: "Mission & Requirements",
      sourceRoles: ["manager", "customer"],
      pathIncludes: ["policy", "manager", "mission", "lmt", "paraiskas", "studija", "intent", "partneryst"],
      maxSourceUris: 40,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "design",
      type: "system-layer",
      label: "Design / Bioinformatics",
      sourceRoles: ["customer", "project"],
      pathIncludes: ["design", "architecture", "opentwins", "bioinfo", "construct", "pathway", "specifikacija"],
      includeDevelopmentEvidence: true,
      maxSourceUris: 50,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "build",
      type: "system-layer",
      label: "Build / Molecular Construction",
      sourceRoles: ["customer", "project", "development"],
      pathIncludes: ["build", "assembly", "dna", "oscar", "pipette", "sila", "bioreactor", "cad"],
      includeDevelopmentEvidence: true,
      maxSourceUris: 80,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "test",
      type: "system-layer",
      label: "Test / Analytics & QC",
      sourceRoles: ["customer", "project", "runtime"],
      pathIncludes: ["test", "assay", "qc", "microscop", "analytics", "sequenc", "quality"],
      includeRuntimeObservations: true,
      maxSourceUris: 50,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "learn",
      type: "system-layer",
      label: "Learn / AI / Modeling",
      sourceRoles: ["customer", "project", "runtime"],
      pathIncludes: ["learn", "model", "ml", "ai", "chemos", "whitepaper", "article", "active"],
      includeRuntimeObservations: true,
      maxSourceUris: 50,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "orchestration_data",
      type: "system-layer",
      label: "Orchestration / Data / LIMS",
      sourceRoles: ["manager", "customer", "project", "development", "runtime"],
      pathIncludes: ["orchestr", "lims", "sila", "ros", "chemos", "data", "workflow", "api"],
      includeDevelopmentEvidence: true,
      includeRuntimeObservations: true,
      maxSourceUris: 60,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "governance_translation",
      type: "system-layer",
      label: "Governance / QA / Translation",
      sourceRoles: ["manager", "customer"],
      pathIncludes: ["governance", "biosafety", "regulatory", "audit", "qa", "lmt", "sutartis", "dark-factory", "partneryst"],
      maxSourceUris: 40,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "flagship_cellfree_enzyme",
      type: "reference-workflow",
      label: "Flagship Cell-Free / Protein-Enzyme Workflow",
      sourceRoles: ["manager", "customer", "project", "development", "runtime"],
      pathIncludes: ["cell-free", "cellfree", "enzyme", "protein", "bioreactor", "biospec", "flagship", "main_control"],
      includeDevelopmentEvidence: true,
      includeRuntimeObservations: true,
      maxSourceUris: 60,
      properties: { semanticEvidence: "manager_scope", geometryEvidence: "placeholder", workflow: "cell-free/protein-enzyme" },
    },
    // --- v0.2 equipment placeholders (stable IDs) ---
    {
      id: "liquid_handler_01",
      type: "equipment-placeholder",
      label: "Liquid Handler",
      sourceRoles: ["project", "development"],
      pathIncludes: ["pipette", "liquid", "handler", "oscar"],
      maxSourceUris: 30,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "build", interface: "SiLA2/ROS" },
    },
    {
      id: "dna_assembly_01",
      type: "equipment-placeholder",
      label: "DNA Assembly Station",
      sourceRoles: ["project", "development"],
      pathIncludes: ["assembly", "dna", "molecular", "construct"],
      maxSourceUris: 25,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "build" },
    },
    {
      id: "sequencing_01",
      type: "equipment-placeholder",
      label: "Sequencing / Validation",
      sourceRoles: ["project", "runtime"],
      pathIncludes: ["sequenc", "validation", "ngs", "sanger"],
      includeRuntimeObservations: true,
      maxSourceUris: 20,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "test" },
    },
    {
      id: "analytics_01",
      type: "equipment-placeholder",
      label: "Analytical Instrumentation",
      sourceRoles: ["project", "runtime"],
      pathIncludes: ["analytic", "assay", "qc", "microscop"],
      includeRuntimeObservations: true,
      maxSourceUris: 25,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "test" },
    },
    {
      id: "lims_01",
      type: "equipment-placeholder",
      label: "LIMS",
      sourceRoles: ["manager", "project", "runtime"],
      pathIncludes: ["lims", "sample", "eln", "data"],
      includeRuntimeObservations: true,
      maxSourceUris: 20,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "orchestration_data" },
    },
    {
      id: "compute_01",
      type: "equipment-placeholder",
      label: "AI Compute",
      sourceRoles: ["project", "runtime"],
      pathIncludes: ["compute", "ai", "model", "chemos", "learn"],
      includeRuntimeObservations: true,
      maxSourceUris: 20,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "learn" },
    },
    {
      id: "cellfree_01",
      type: "equipment-placeholder",
      label: "Cell-Free Automation",
      sourceRoles: ["project", "development", "runtime"],
      pathIncludes: ["cellfree", "cell-free", "bioreactor", "biospec"],
      includeDevelopmentEvidence: true,
      maxSourceUris: 30,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "flagship_cellfree_enzyme" },
    },
    {
      id: "enzyme_screen_01",
      type: "equipment-placeholder",
      label: "Protein / Enzyme Screening",
      sourceRoles: ["project", "development", "runtime"],
      // Paths rarely contain "enzyme"; bind to flagship labware + assay/QC literature present in corpus.
      pathIncludes: ["cellfree", "cell-free", "bioreactor", "biospec", "assay", "qc", "microscop", "flagship", "biofoundr"],
      includeRuntimeObservations: true,
      maxSourceUris: 25,
      properties: {
        semanticEvidence: "inferred",
        geometryEvidence: "placeholder",
        zone: "flagship_cellfree_enzyme",
        note: "No dedicated enzyme-path files; evidence from flagship/bioreactor/assay corpus",
      },
    },
    // --- v0.2.1 corpus-backed modules (new stable IDs) ---
    {
      id: "biospec_bioreactor_01",
      type: "equipment",
      label: "BIO-SPEC Bioreactor (control SW + CAD)",
      sourceRoles: ["project", "development"],
      pathIncludes: ["bioreactor", "biospec", "main_control", "gl45", "lid_unf", "aluminium_plate", "osfstorage", "bill_of_materials"],
      includeDevelopmentEvidence: true,
      maxSourceUris: 40,
      properties: {
        semanticEvidence: "direct",
        geometryEvidence: "cad-parts-only",
        zone: "flagship_cellfree_enzyme",
        software: "main_control.py",
        note: "Part CAD present; facility placement placeholder",
      },
    },
    {
      id: "oscar_robot_01",
      type: "equipment",
      label: "OSCAR robot platform",
      sourceRoles: ["project", "development"],
      pathIncludes: ["oscar", "pipette-tool", "sb5c00733", "31570286"],
      maxSourceUris: 50,
      properties: {
        semanticEvidence: "direct",
        geometryEvidence: "archive-inventory",
        zone: "build",
        interfaces: "ROS2+SiLA2",
        note: "ZIP inventory only; no facility coordinates",
      },
    },
    {
      id: "microscope_module_01",
      type: "equipment",
      label: "Microscopy module",
      sourceRoles: ["project"],
      pathIncludes: ["microscop", "7561142"],
      maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", zone: "test" },
    },
    {
      id: "microfluidic_assembly_01",
      type: "equipment",
      label: "Microfluidic assembly",
      sourceRoles: ["project"],
      pathIncludes: ["microfluid", "mmc1"],
      maxSourceUris: 25,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", zone: "build" },
    },
    {
      id: "bioprinter_mos3s_01",
      type: "equipment",
      label: "MOS3S / 3D microfluidic bioprinting",
      sourceRoles: ["project"],
      pathIncludes: ["bioprint", "mos3s", "syringe", "carriage", "3d-microfluidic", "3d microfluidic"],
      maxSourceUris: 40,
      properties: {
        semanticEvidence: "direct",
        geometryEvidence: "stl-parts",
        zone: "build",
        note: "STL parts present; not a room layout",
      },
    },
    {
      id: "cleanroom_base_01",
      type: "facility-module",
      label: "Open-source cleanroom base",
      sourceRoles: ["project"],
      pathIncludes: ["cleanroom", "clean room", "open source ecology"],
      maxSourceUris: 15,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", zone: "facility_shell" },
    },
    {
      id: "chemos_planner_01",
      type: "software-service",
      label: "ChemOS 2.0-class experiment planner",
      sourceRoles: ["project"],
      pathIncludes: ["chemos", "chem os", "experiment"],
      maxSourceUris: 15,
      properties: { semanticEvidence: "direct", geometryEvidence: "n/a", zone: "learn", layer: "orchestration/learn" },
    },
    {
      id: "sila_orchestrator_01",
      type: "software-service",
      label: "SiLA 2 device orchestrator",
      sourceRoles: ["customer", "project"],
      pathIncludes: ["sila"],
      maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "n/a", zone: "orchestration_data", standard: "SiLA2" },
    },
    {
      id: "ros2_robotics_01",
      type: "software-service",
      label: "ROS 2 robotics layer",
      sourceRoles: ["customer", "project"],
      pathIncludes: ["ros", "ros2", "robot"],
      pathExcludes: ["microscop"], // avoid false positives if any
      maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "n/a", zone: "build", standard: "ROS2" },
    },
    {
      id: "opentwins_state_01",
      type: "software-service",
      label: "OpenTwins state model",
      sourceRoles: ["customer", "project"],
      pathIncludes: ["opentwins", "open twins", "digital twin"],
      maxSourceUris: 15,
      properties: { semanticEvidence: "direct", geometryEvidence: "n/a", zone: "orchestration_data" },
    },
    // BIO-SPEC CAD part nodes (children-level detail as top-level for scene richness)
    {
      id: "biospec_cad_lid_unf",
      type: "cad-part",
      label: "BIO-SPEC lid UNF",
      sourceRoles: ["project"],
      pathIncludes: ["lid_unf", "lid_unf.step", "lid_unf.f3d", "lid_unf.scad"],
      maxSourceUris: 10,
      properties: { semanticEvidence: "direct", geometryEvidence: "cad-file", parentEquipment: "biospec_bioreactor_01", format: "STEP/F3D/SCAD" },
    },
    {
      id: "biospec_cad_gl45",
      type: "cad-part",
      label: "BIO-SPEC GL45 ports",
      sourceRoles: ["project"],
      pathIncludes: ["gl45"],
      maxSourceUris: 15,
      properties: { semanticEvidence: "direct", geometryEvidence: "cad-file", parentEquipment: "biospec_bioreactor_01" },
    },
    {
      id: "biospec_cad_plate",
      type: "cad-part",
      label: "BIO-SPEC aluminium plate",
      sourceRoles: ["project"],
      pathIncludes: ["aluminium_plate"],
      maxSourceUris: 10,
      properties: { semanticEvidence: "direct", geometryEvidence: "cad-file", parentEquipment: "biospec_bioreactor_01" },
    },
  ];

  const bindings: B[] = [
    { componentId: "facility_shell", scenePath: "/Biofoundry/Facility/Envelope", position: [0, 0, 0], size: [60, 36, 0.15], primitive: "cube" },
    { componentId: "mission_requirements", scenePath: "/Biofoundry/Zones/MissionRequirements", position: [-22.5, 9, 0.125], size: [13, 15, 0.25] },
    { componentId: "design", scenePath: "/Biofoundry/Zones/Design", position: [-7.5, 9, 0.125], size: [13, 15, 0.25] },
    { componentId: "build", scenePath: "/Biofoundry/Zones/Build", position: [7.5, 9, 0.125], size: [13, 15, 0.25] },
    { componentId: "test", scenePath: "/Biofoundry/Zones/Test", position: [22.5, 9, 0.125], size: [13, 15, 0.25] },
    { componentId: "governance_translation", scenePath: "/Biofoundry/Zones/GovernanceTranslation", position: [-22.5, -9, 0.125], size: [13, 15, 0.25] },
    { componentId: "orchestration_data", scenePath: "/Biofoundry/Zones/OrchestrationData", position: [-7.5, -9, 0.125], size: [13, 15, 0.25] },
    { componentId: "learn", scenePath: "/Biofoundry/Zones/Learn", position: [7.5, -9, 0.125], size: [13, 15, 0.25] },
    { componentId: "flagship_cellfree_enzyme", scenePath: "/Biofoundry/Zones/FlagshipCellFreeEnzyme", position: [22.5, -9, 0.125], size: [13, 15, 0.25] },
    // original equipment
    { componentId: "liquid_handler_01", scenePath: "/Biofoundry/Equipment/Build/LiquidHandler01", position: [4.5, 10, 0.9], size: [2.2, 1.6, 1.8] },
    { componentId: "dna_assembly_01", scenePath: "/Biofoundry/Equipment/Build/DNAAssembly01", position: [9.5, 10, 0.8], size: [2.0, 1.4, 1.6] },
    { componentId: "sequencing_01", scenePath: "/Biofoundry/Equipment/Test/Sequencing01", position: [19.5, 10, 0.9], size: [2.2, 1.6, 1.8] },
    { componentId: "analytics_01", scenePath: "/Biofoundry/Equipment/Test/Analytics01", position: [24.5, 10, 1.0], size: [2.4, 1.8, 2.0] },
    { componentId: "lims_01", scenePath: "/Biofoundry/Equipment/Orchestration/LIMS01", position: [-7.5, -9, 1.2], size: [1.4, 2.2, 2.4], primitive: "cylinder" },
    { componentId: "compute_01", scenePath: "/Biofoundry/Equipment/Learn/AICompute01", position: [6.0, -9, 1.2], size: [1.2, 2.0, 2.4], primitive: "cylinder" },
    { componentId: "cellfree_01", scenePath: "/Biofoundry/Equipment/Flagship/CellFree01", position: [19.5, -9, 0.9], size: [2.5, 1.8, 1.8] },
    { componentId: "enzyme_screen_01", scenePath: "/Biofoundry/Equipment/Flagship/EnzymeScreen01", position: [24.5, -9, 0.9], size: [2.5, 1.8, 1.8] },
    // corpus-backed
    { componentId: "biospec_bioreactor_01", scenePath: "/Biofoundry/Equipment/Flagship/BiospecBioreactor01", position: [21.0, -11.5, 1.1], size: [3.0, 2.2, 2.2], primitive: "cylinder" },
    { componentId: "oscar_robot_01", scenePath: "/Biofoundry/Equipment/Build/OscarRobot01", position: [6.0, 12.5, 1.0], size: [3.5, 2.5, 2.0] },
    { componentId: "microscope_module_01", scenePath: "/Biofoundry/Equipment/Test/Microscope01", position: [20.5, 12.5, 0.85], size: [1.8, 1.5, 1.7] },
    { componentId: "microfluidic_assembly_01", scenePath: "/Biofoundry/Equipment/Build/MicrofluidicAssembly01", position: [11.5, 12.0, 0.7], size: [1.6, 1.2, 1.4] },
    { componentId: "bioprinter_mos3s_01", scenePath: "/Biofoundry/Equipment/Build/BioprinterMOS3S01", position: [8.5, 7.0, 0.95], size: [2.8, 2.0, 1.9] },
    { componentId: "cleanroom_base_01", scenePath: "/Biofoundry/Facility/CleanroomBase01", position: [-20.0, 0.0, 0.5], size: [8, 10, 1.0], primitive: "cube" },
    // software as tall thin markers (not physical geometry claims)
    { componentId: "chemos_planner_01", scenePath: "/Biofoundry/Services/ChemOS01", position: [9.0, -11.5, 1.5], size: [0.8, 0.8, 3.0], primitive: "cylinder" },
    { componentId: "sila_orchestrator_01", scenePath: "/Biofoundry/Services/SiLA2_01", position: [-5.5, -11.5, 1.5], size: [0.8, 0.8, 3.0], primitive: "cylinder" },
    { componentId: "ros2_robotics_01", scenePath: "/Biofoundry/Services/ROS2_01", position: [5.0, 7.5, 1.5], size: [0.8, 0.8, 3.0], primitive: "cylinder" },
    { componentId: "opentwins_state_01", scenePath: "/Biofoundry/Services/OpenTwins01", position: [-9.5, -6.5, 1.5], size: [0.8, 0.8, 3.0], primitive: "cylinder" },
    { componentId: "biospec_cad_lid_unf", scenePath: "/Biofoundry/CAD/Biospec/LidUNF", position: [22.2, -13.2, 0.4], size: [0.6, 0.6, 0.35], primitive: "cylinder" },
    { componentId: "biospec_cad_gl45", scenePath: "/Biofoundry/CAD/Biospec/GL45Ports", position: [23.0, -13.2, 0.4], size: [0.5, 0.5, 0.4], primitive: "cylinder" },
    { componentId: "biospec_cad_plate", scenePath: "/Biofoundry/CAD/Biospec/AluminiumPlate", position: [23.8, -13.2, 0.25], size: [0.9, 0.7, 0.15] },
  ];

  return validateSceneBlueprint({
    schema: "subactor.scene-blueprint/v1",
    id: "biofoundry-live-v0.2.1",
    twinKind: "conceptual",
    components,
    bindings,
  });
}

/** @deprecated alias — wizard and projects import this name */
export const biofoundryLiveBlueprintDetailed = biofoundryLiveBlueprintV02;
