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
  TwinComponent,
  TwinDocument,
} from "../core/types.js";
import { contentUri } from "../core/canonical.js";
import { validateScene } from "../dsl/scene.js";
import { validateTwin } from "../dsl/twin.js";
import { observationHorizon } from "../dsl/observation.js";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Mirrors schemas/scene-blueprint.schema.json; test/schema-drift.test.ts keeps the two in step. */
const SOURCE_ROLES = ["manager", "customer", "project", "internet", "archive", "derived", "runtime", "development"];
const PRIMITIVES = ["cube", "cylinder", "sphere", "scope"];
const SPATIAL_CLASSES = ["physical", "cyber", "logical", "hybrid"];
const SPATIAL_REQUIREMENTS = ["position", "size", "orientation", "constraints", "logical-endpoint", "runtime-status"];
const COMPONENT_KEYS = new Set([
  "id", "type", "parentId", "label", "spatialClass", "spatialRequirements", "sourceRoles", "pathIncludes", "pathExcludes",
  "maxSourceUris", "properties", "includeDevelopmentEvidence", "includeRuntimeObservations",
]);
const BINDING_KEYS = new Set(["componentId", "scenePath", "primitive", "position", "size", "orientation", "propertyMap"]);
const DOCUMENT_KEYS = new Set(["schema", "id", "twinKind", "components", "bindings"]);

function isVec3(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === "number" && Number.isFinite(x));
}

function isQuaternion(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((x) => typeof x === "number" && Number.isFinite(x))) return false;
  return Math.abs(Math.hypot(...value) - 1) <= 1e-6;
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
      !SPATIAL_CLASSES.includes(String(c.spatialClass)) ||
      !Array.isArray(c.sourceRoles) ||
      !c.sourceRoles.every((x) => typeof x === "string" && SOURCE_ROLES.includes(x))
    ) {
      throw new Error("SCENE_BLUEPRINT_COMPONENT_INVALID");
    }
    rejectUnknownKeys(c, COMPONENT_KEYS, `SCENE_BLUEPRINT_COMPONENT_UNKNOWN_KEY:${c.id}`);
    if (c.spatialRequirements !== undefined) {
      if (!c.spatialRequirements || typeof c.spatialRequirements !== "object" || Array.isArray(c.spatialRequirements)) {
        throw new Error(`SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_INVALID:${c.id}`);
      }
      const requirements = c.spatialRequirements as Record<string, unknown>;
      rejectUnknownKeys(requirements, new Set(["require", "optional", "forbid"]), `SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_UNKNOWN_KEY:${c.id}`);
      if (!Array.isArray(requirements.require)) throw new Error(`SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_INVALID:${c.id}`);
      const sets = ["require", "optional", "forbid"] as const;
      for (const key of sets) {
        const values = requirements[key];
        if (values === undefined) continue;
        if (!Array.isArray(values) || !values.every((item) => typeof item === "string" && SPATIAL_REQUIREMENTS.includes(item)) || new Set(values).size !== values.length) {
          throw new Error(`SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_INVALID:${c.id}:${key}`);
        }
      }
      const required = new Set(requirements.require as string[]);
      const forbidden = new Set((requirements.forbid ?? []) as string[]);
      if ([...required].some((item) => forbidden.has(item))) throw new Error(`SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_CONTRADICTORY:${c.id}`);
    }
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
  const componentsById = new Map((d.components as Array<Record<string, unknown>>).map((component) => [String(component.id), component]));
  for (const component of componentsById.values()) {
    if (component.parentId === undefined) continue;
    if (typeof component.parentId !== "string" || !componentsById.has(component.parentId) || component.parentId === component.id) {
      throw new Error(`SCENE_BLUEPRINT_PARENT_INVALID:${component.id}`);
    }
    const visited = new Set([String(component.id)]);
    let parent = component.parentId;
    while (parent) {
      if (visited.has(parent)) throw new Error(`SCENE_BLUEPRINT_PARENT_CYCLE:${component.id}`);
      visited.add(parent);
      parent = String(componentsById.get(parent)?.parentId ?? "");
    }
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
    if (b.orientation !== undefined && !isQuaternion(b.orientation)) throw new Error(`SCENE_BLUEPRINT_ORIENTATION_INVALID:${String(b.componentId)}`);
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

  const flatComponents: TwinComponent[] = blueprint.components.map((component) => {
    const matched = matchResources(resources, component.sourceRoles, component.pathIncludes, component.pathExcludes);
    let sourceUris = matched.map((resource) => resource.uri);
    if (component.includeDevelopmentEvidence) sourceUris.push(...development.evidenceUris);
    if (component.includeRuntimeObservations) sourceUris.push(...runtimeResourceUris);
    sourceUris = unique(sourceUris);
    if (component.maxSourceUris && sourceUris.length > component.maxSourceUris) {
      sourceUris = sourceUris.slice(0, component.maxSourceUris);
    }

    const cadAssets = matched
      // The `.md` tail is optional because an f2md corpus mirrors `part.stl` to `part.stl.md`.
      // Anchoring on the real end of the name matched nothing there, so CAD parts were only
      // counted when the path happened to contain the literal substring "cad".
      .filter((r) => /\.(step|stp|stl|f3d|scad|glb|usda)(\.[a-z]{2})?(\.md)?$/i.test(r.sourcePath) || /cad|zip-entry/i.test(r.sourcePath))
      .map((r) => r.sourcePath.split("/").at(-1) ?? r.sourcePath)
      .slice(0, 40);

    const properties: Record<string, unknown> = {
      ...(component.properties ?? {}),
      spatialClass: component.spatialClass,
      spatialRequire: (component.spatialRequirements?.require ?? defaultSpatialRequirements(component.spatialClass).require).join("|"),
      spatialOptional: (component.spatialRequirements?.optional ?? defaultSpatialRequirements(component.spatialClass).optional ?? []).join("|"),
      spatialForbid: (component.spatialRequirements?.forbid ?? defaultSpatialRequirements(component.spatialClass).forbid ?? []).join("|"),
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
  const byId = new Map(flatComponents.map((component) => [component.id, component]));
  for (const definition of blueprint.components) {
    if (definition.parentId) byId.get(definition.parentId)!.children.push(byId.get(definition.id)!);
  }
  const components = blueprint.components.filter((component) => !component.parentId).map((component) => byId.get(component.id)!);

  const twin: TwinDocument = {
    schema: "subactor.twin/v1",
    id: `${projectId}-twin`,
    kind: blueprint.twinKind,
    observedAt: observationHorizon(observations),
    sourceSnapshotHash,
    components,
  };
  validateTwin(twin);
  return twin;
}

function defaultSpatialRequirements(spatialClass: SceneBlueprint["components"][number]["spatialClass"]): NonNullable<SceneBlueprint["components"][number]["spatialRequirements"]> {
  if (spatialClass === "physical" || spatialClass === "hybrid") {
    return { require: ["position", "size", "orientation"], optional: ["constraints"] };
  }
  return {
    require: spatialClass === "cyber" ? ["logical-endpoint", "runtime-status"] : [],
    optional: spatialClass === "logical" ? ["runtime-status"] : [],
    forbid: ["position", "size", "orientation", "constraints"],
  };
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
      orientation: binding.orientation,
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
 * Detailed Biofoundry blueprint v0.3.1:
 * - keeps stable v0.2 IDs (17)
 * - adds evidence-backed modules from nanobionic-laboratory corpus
 * - pathIncludes tighten equipment ↔ CAD/docs (no invented floor plan)
 */
export function biofoundryLiveBlueprintV02(): SceneBlueprint {
  const bioprinterParts: Array<{ id: string; label: string; asset: string; sceneName: string; position: [number, number, number]; size: [number, number, number] }> = [
    { id: "bioprinter_part_cable_box_1", label: "MOS3S cable box 1", asset: "ClableBox_1.glb", sceneName: "CableBox1", position: [8.442307, 6.827289, 0.956638], size: [0.111991, 0.1612, 0.040491] },
    { id: "bioprinter_part_cable_box_2", label: "MOS3S cable box 2", asset: "CableBox_2.glb", sceneName: "CableBox2", position: [8.442307, 6.827289, 0.992647], size: [0.111991, 0.1612, 0.043491] },
    { id: "bioprinter_part_cable_box_3", label: "MOS3S cable box 3", asset: "CableBox_3.glb", sceneName: "CableBox3", position: [8.415302, 6.741789, 0.966442], size: [0.029999, 0.0202, 0.0149] },
    { id: "bioprinter_part_carriage", label: "MOS3S carriage", asset: "Carriage.glb", sceneName: "Carriage", position: [8.527883, 7.228561, 1.029392], size: [0.07666, 0.0915, 0.033] },
    { id: "bioprinter_part_carriage_escape", label: "MOS3S carriage escape", asset: "CarriageEscape.glb", sceneName: "CarriageEscape", position: [8.405302, 6.786039, 0.936392], size: [0.0688, 0.0397, 0.025] },
    { id: "bioprinter_part_syringe_clamp", label: "MOS3S syringe pump clamp", asset: "ClampSyringePump_A_Performed_.glb", sceneName: "SyringeClamp", position: [8.405302, 6.824143, 0.958892], size: [0.0376, 0.043209, 0.005] },
    { id: "bioprinter_part_display_box_1", label: "MOS3S display box 1", asset: "DisplayBox_1.glb", sceneName: "DisplayBox1", position: [8.480302, 6.800189, 0.89065], size: [0.166, 0.071, 0.073084] },
    { id: "bioprinter_part_display_box_2", label: "MOS3S display box 2", asset: "DisplayBox_2.glb", sceneName: "DisplayBox2", position: [8.480302, 6.800189, 0.930992], size: [0.166, 0.071, 0.0168] },
    { id: "bioprinter_part_end_idler", label: "MOS3S end idler", asset: "EndIdler.glb", sceneName: "EndIdler", position: [8.405302, 6.772689, 0.936392], size: [0.06238, 0.042, 0.02] },
    { id: "bioprinter_part_end_motor", label: "MOS3S end motor", asset: "End_Motor_Performed.glb", sceneName: "EndMotor", position: [8.597898, 6.961457, 0.935392], size: [0.0624, 0.042, 0.032] },
    { id: "bioprinter_part_platform_holder", label: "MOS3S platform holder", asset: "PlatformHolder.glb", sceneName: "PlatformHolder", position: [8.420803, 6.772689, 0.946792], size: [0.046803, 0.0478, 0.0172] },
    { id: "bioprinter_part_syringe_support_1", label: "MOS3S syringe support 1", asset: "SyringSupport_1.glb", sceneName: "SyringeSupport1", position: [8.430302, 6.839689, 0.948392], size: [0.05, 0.228, 0.008] },
    { id: "bioprinter_part_syringe_support_2", label: "MOS3S syringe support 2", asset: "SyringSupport_2.glb", sceneName: "SyringeSupport2", position: [8.430302, 6.886689, 0.920892], size: [0.05, 0.04, 0.047] },
    { id: "bioprinter_part_plunger_retainer_2ml", label: "MOS3S 2 ml plunger retainer", asset: "SyringePlungerRetainer_2ml.glb", sceneName: "PlungerRetainer2ml", position: [8.405302, 6.76493, 0.935082], size: [0.044, 0.027018, 0.004] },
  ];
  const components: C[] = [
    {
      id: "facility_shell",
      type: "facility",
      spatialClass: "physical",
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
      spatialClass: "logical",
      label: "Mission & Requirements",
      sourceRoles: ["manager", "customer"],
      pathIncludes: ["policy", "manager", "mission", "lmt", "paraiskas", "studija", "intent", "partneryst"],
      maxSourceUris: 40,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "design",
      type: "system-layer",
      spatialClass: "logical",
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
      spatialClass: "hybrid",
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
      spatialClass: "hybrid",
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
      spatialClass: "cyber",
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
      spatialClass: "cyber",
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
      spatialClass: "logical",
      label: "Governance / QA / Translation",
      sourceRoles: ["manager", "customer"],
      pathIncludes: ["governance", "biosafety", "regulatory", "audit", "qa", "lmt", "sutartis", "dark-factory", "partneryst"],
      maxSourceUris: 40,
      properties: { semanticEvidence: "direct", geometryEvidence: "placeholder" },
    },
    {
      id: "flagship_cellfree_enzyme",
      type: "reference-workflow",
      spatialClass: "logical",
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
      spatialClass: "physical",
      label: "Liquid Handler",
      sourceRoles: ["project", "development"],
      pathIncludes: ["pipette", "liquid", "handler", "oscar"],
      maxSourceUris: 30,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "build", interface: "SiLA2/ROS" },
    },
    {
      id: "dna_assembly_01",
      type: "equipment-placeholder",
      spatialClass: "physical",
      label: "DNA Assembly Station",
      sourceRoles: ["project", "development"],
      pathIncludes: ["assembly", "dna", "molecular", "construct"],
      maxSourceUris: 25,
      properties: { semanticEvidence: "inferred", geometryEvidence: "placeholder", zone: "build" },
    },
    {
      id: "sequencing_01",
      type: "equipment-placeholder",
      spatialClass: "physical",
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
      spatialClass: "physical",
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
      spatialClass: "cyber",
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
      spatialClass: "hybrid",
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
      spatialClass: "physical",
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
      spatialClass: "physical",
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
      spatialClass: "physical",
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
      spatialClass: "physical",
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
      spatialClass: "physical",
      label: "Microscopy module",
      sourceRoles: ["project"],
      pathIncludes: ["microscop", "7561142"],
      maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", zone: "test" },
    },
    {
      id: "microfluidic_assembly_01",
      type: "equipment",
      spatialClass: "physical",
      label: "Microfluidic assembly",
      sourceRoles: ["project"],
      pathIncludes: ["microfluid", "mmc1"],
      maxSourceUris: 25,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", zone: "build" },
    },
    {
      id: "syringebot_01",
      type: "equipment",
      spatialClass: "physical",
      spatialRequirements: { require: [], optional: ["position", "size", "orientation", "constraints"] },
      label: "Syringebot 3D chemical synthesis robot",
      sourceRoles: ["project"],
      pathIncludes: ["syringebot", "chemical synthesis robot", "atvirojo kodo biofoundry studija"],
      maxSourceUris: 25,
      properties: {
        semanticEvidence: "direct", geometryEvidence: "document-only", zone: "build",
        note: "The study specifies the module, but provides no verified facility coordinates or envelope.",
      },
    },
    {
      id: "bioprinter_mos3s_01",
      type: "equipment",
      spatialClass: "physical",
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
      spatialClass: "physical",
      label: "Open-source cleanroom base",
      sourceRoles: ["project"],
      pathIncludes: ["cleanroom", "clean room", "open source ecology"],
      maxSourceUris: 15,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", zone: "facility_shell" },
    },
    {
      id: "chemos_planner_01",
      type: "software-service",
      spatialClass: "cyber",
      label: "ChemOS 2.0-class experiment planner",
      sourceRoles: ["project"],
      pathIncludes: ["chemos", "chem os", "experiment"],
      maxSourceUris: 15,
      properties: { semanticEvidence: "direct", geometryEvidence: "n/a", zone: "learn", layer: "orchestration/learn" },
    },
    {
      id: "sila_orchestrator_01",
      type: "software-service",
      spatialClass: "cyber",
      label: "SiLA 2 device orchestrator",
      sourceRoles: ["customer", "project"],
      pathIncludes: ["sila"],
      maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "n/a", zone: "orchestration_data", standard: "SiLA2" },
    },
    {
      id: "ros2_robotics_01",
      type: "software-service",
      spatialClass: "cyber",
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
      spatialClass: "cyber",
      label: "OpenTwins state model",
      sourceRoles: ["customer", "project"],
      pathIncludes: ["opentwins", "open twins", "digital twin"],
      maxSourceUris: 15,
      properties: { semanticEvidence: "direct", geometryEvidence: "n/a", zone: "orchestration_data" },
    },
    // Device-level process actors. Their existence and function are document-backed; their
    // compact dashboard placement and envelopes are explicitly presentation-only.
    {
      id: "biospec_controller_01", type: "controller", parentId: "biospec_bioreactor_01", spatialClass: "hybrid", label: "BIO-SPEC Raspberry Pi controller",
      sourceRoles: ["project"], pathIncludes: ["bioreactor", "main_control", "raspberry pi", "electrical cabinet"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "biospec_bioreactor_01" },
    },
    {
      id: "biospec_feed_pump_01", type: "actuator", parentId: "biospec_bioreactor_01", spatialClass: "physical", label: "BIO-SPEC feed pump",
      sourceRoles: ["project"], pathIncludes: ["bioreactor", "feed pump", "peristaltic pump", "fast pump"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "biospec_bioreactor_01" },
    },
    {
      id: "biospec_gas_valve_01", type: "actuator", parentId: "biospec_bioreactor_01", spatialClass: "physical", label: "BIO-SPEC fail-closed gas valve",
      sourceRoles: ["project"], pathIncludes: ["bioreactor", "solenoid", "gas supply", "rotameter"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "biospec_bioreactor_01", safetyState: "normally-closed" },
    },
    {
      id: "biospec_stirrer_01", type: "actuator", parentId: "biospec_bioreactor_01", spatialClass: "physical", label: "BIO-SPEC magnetic stirrer",
      sourceRoles: ["project"], pathIncludes: ["bioreactor", "stirrer", "stirring"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "biospec_bioreactor_01" },
    },
    {
      id: "biospec_condenser_01", type: "actuator", parentId: "biospec_bioreactor_01", spatialClass: "physical", label: "BIO-SPEC thermoelectric condenser",
      sourceRoles: ["project"], pathIncludes: ["bioreactor", "peltier", "thermoelectric condenser"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "biospec_bioreactor_01" },
    },
    {
      id: "microscopy_acquisition_unit_01", type: "compute-unit", parentId: "microscope_module_01", spatialClass: "hybrid", label: "Microscopy acquisition unit",
      sourceRoles: ["project"], pathIncludes: ["microscopy", "acquisition unit", "imswitch"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "microscope_module_01" },
    },
    {
      id: "microscopy_reconstruction_unit_01", type: "compute-unit", parentId: "microscope_module_01", spatialClass: "hybrid", label: "Microscopy reconstruction unit",
      sourceRoles: ["project"], pathIncludes: ["microscopy", "reconstruction unit", "imreconstruct"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "microscope_module_01" },
    },
    {
      id: "microscopy_orchestrator_01", type: "software-service", parentId: "microscope_module_01", spatialClass: "cyber", label: "Microscopy napari orchestrator",
      sourceRoles: ["project"], pathIncludes: ["microscopy", "orchestrator", "napari-file-watcher"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "n/a", placementBasis: "presentation-only", parentEquipment: "microscope_module_01" },
    },
    {
      id: "microfluidic_pressure_controller_01", type: "controller", parentId: "microfluidic_assembly_01", spatialClass: "hybrid", label: "Microfluidic pressure controller",
      sourceRoles: ["project"], pathIncludes: ["microfluidic", "pressure controller", "elveflow"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "microfluidic_assembly_01" },
    },
    {
      id: "microfluidic_mux_valve_01", type: "actuator", parentId: "microfluidic_assembly_01", spatialClass: "physical", label: "Microfluidic MUX and 3/2 valve",
      sourceRoles: ["project"], pathIncludes: ["microfluidic", "mux distribution valve", "3/2 valve"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "microfluidic_assembly_01" },
    },
    {
      id: "microfluidic_flow_sensor_01", type: "sensor", parentId: "microfluidic_assembly_01", spatialClass: "physical", label: "Microfluidic flow sensor",
      sourceRoles: ["project"], pathIncludes: ["microfluidic", "flow sensor", "constant flow rate"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "microfluidic_assembly_01" },
    },
    {
      id: "microfluidic_flow_chamber_01", type: "process-vessel", parentId: "microfluidic_assembly_01", spatialClass: "physical", label: "Microfluidic flow chamber",
      sourceRoles: ["project"], pathIncludes: ["microfluidic", "flow chamber", "hybriwell"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "microfluidic_assembly_01" },
    },
    {
      id: "syringebot_controller_01", type: "controller", parentId: "syringebot_01", spatialClass: "hybrid", label: "Syringebot CORRO controller",
      sourceRoles: ["project"], pathIncludes: ["syringebot", "chemical synthesis robot", "piis2468067222000554", "corro", "configuration.txt"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "syringebot_01" },
    },
    {
      id: "syringebot_syringe_bank_01", type: "actuator", parentId: "syringebot_01", spatialClass: "physical", label: "Syringebot six-syringe bank",
      sourceRoles: ["project"], pathIncludes: ["syringebot", "chemical synthesis robot", "piis2468067222000554", "six syringes"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "syringebot_01" },
    },
    {
      id: "syringebot_valve_bank_01", type: "actuator", parentId: "syringebot_01", spatialClass: "physical", label: "Syringebot servo-valve bank",
      sourceRoles: ["project"], pathIncludes: ["syringebot", "chemical synthesis robot", "piis2468067222000554", "valve block", "servo valve", "purge"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "syringebot_01" },
    },
    {
      id: "oscar_pipette_tool_01", type: "robot-tool", parentId: "oscar_robot_01", spatialClass: "physical", label: "OSCAR pipette tool",
      sourceRoles: ["project", "development"], pathIncludes: ["oscar", "pipette-tool", "pipette tool"], maxSourceUris: 25,
      properties: { semanticEvidence: "direct", geometryEvidence: "archive-inventory", placementBasis: "presentation-only", parentEquipment: "oscar_robot_01" },
    },
    {
      id: "oscar_thermocycler_01", type: "equipment", parentId: "oscar_robot_01", spatialClass: "physical", label: "OSCAR thermocycler",
      sourceRoles: ["project"], pathIncludes: ["oscar", "thermocycler", "pcr"], maxSourceUris: 25,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "oscar_robot_01" },
    },
    {
      id: "oscar_gel_electrophoresis_01", type: "equipment", parentId: "oscar_robot_01", spatialClass: "physical", label: "OSCAR gel electrophoresis station",
      sourceRoles: ["project"], pathIncludes: ["oscar", "agarose gel", "electrophoresis"], maxSourceUris: 25,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "oscar_robot_01" },
    },
    {
      id: "oscar_colony_camera_01", type: "sensor", parentId: "oscar_robot_01", spatialClass: "physical", label: "OSCAR colony camera",
      sourceRoles: ["project"], pathIncludes: ["oscar", "colony picking", "take a picture"], maxSourceUris: 20,
      properties: { semanticEvidence: "direct", geometryEvidence: "document-only", placementBasis: "presentation-only", parentEquipment: "oscar_robot_01" },
    },
    // BIO-SPEC CAD part nodes (children-level detail as top-level for scene richness)
    {
      id: "biospec_cad_lid_unf",
      type: "cad-part",
      parentId: "biospec_bioreactor_01",
      spatialClass: "physical",
      label: "BIO-SPEC lid UNF",
      sourceRoles: ["project"],
      pathIncludes: ["lid_unf", "lid_unf.step", "lid_unf.f3d", "lid_unf.scad"],
      maxSourceUris: 10,
      properties: { semanticEvidence: "direct", geometryEvidence: "cad-file", parentEquipment: "biospec_bioreactor_01", format: "STEP/F3D/SCAD" },
    },
    {
      id: "biospec_cad_gl45",
      type: "cad-part",
      parentId: "biospec_bioreactor_01",
      spatialClass: "physical",
      label: "BIO-SPEC GL45 ports",
      sourceRoles: ["project"],
      pathIncludes: ["gl45"],
      maxSourceUris: 15,
      properties: { semanticEvidence: "direct", geometryEvidence: "cad-file", parentEquipment: "biospec_bioreactor_01" },
    },
    {
      id: "biospec_cad_plate",
      type: "cad-part",
      parentId: "biospec_bioreactor_01",
      spatialClass: "physical",
      label: "BIO-SPEC aluminium plate",
      sourceRoles: ["project"],
      pathIncludes: ["aluminium_plate"],
      maxSourceUris: 10,
      properties: { semanticEvidence: "direct", geometryEvidence: "cad-file", parentEquipment: "biospec_bioreactor_01" },
    },
    ...bioprinterParts.map((part): C => ({
      id: part.id,
      type: "cad-part",
      parentId: "bioprinter_mos3s_01",
      spatialClass: "physical",
      label: part.label,
      sourceRoles: ["project", "derived"],
      pathIncludes: [part.asset],
      properties: { semanticEvidence: "direct", geometryEvidence: "cad-file", parentEquipment: "bioprinter_mos3s_01" },
    })),
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
    { componentId: "syringebot_01", scenePath: "/Biofoundry/Equipment/Build/Syringebot01", primitive: "scope" },
    { componentId: "bioprinter_mos3s_01", scenePath: "/Biofoundry/Equipment/Build/BioprinterMOS3S01", position: [8.5, 7.0, 0.95], size: [2.8, 2.0, 1.9] },
    { componentId: "cleanroom_base_01", scenePath: "/Biofoundry/Facility/CleanroomBase01", position: [-20.0, 0.0, 0.5], size: [8, 10, 1.0], primitive: "cube" },
    // software as tall thin markers (not physical geometry claims)
    { componentId: "chemos_planner_01", scenePath: "/Biofoundry/Services/ChemOS01", position: [9.0, -11.5, 1.5], size: [0.8, 0.8, 3.0], primitive: "cylinder" },
    { componentId: "sila_orchestrator_01", scenePath: "/Biofoundry/Services/SiLA2_01", position: [-5.5, -11.5, 1.5], size: [0.8, 0.8, 3.0], primitive: "cylinder" },
    { componentId: "ros2_robotics_01", scenePath: "/Biofoundry/Services/ROS2_01", position: [5.0, 7.5, 1.5], size: [0.8, 0.8, 3.0], primitive: "cylinder" },
    { componentId: "opentwins_state_01", scenePath: "/Biofoundry/Services/OpenTwins01", position: [-9.5, -6.5, 1.5], size: [0.8, 0.8, 3.0], primitive: "cylinder" },
    // Document-backed process actors. Coordinates/envelopes serve only the dashboard narrative.
    { componentId: "biospec_controller_01", scenePath: "/Biofoundry/Equipment/Flagship/BiospecBioreactor01/Controller", position: [18.9, -12.2, 0.65], size: [0.8, 0.6, 1.3] },
    { componentId: "biospec_feed_pump_01", scenePath: "/Biofoundry/Equipment/Flagship/BiospecBioreactor01/FeedPump", position: [19.8, -13.0, 0.45], size: [0.55, 0.55, 0.9], primitive: "cylinder" },
    { componentId: "biospec_gas_valve_01", scenePath: "/Biofoundry/Equipment/Flagship/BiospecBioreactor01/GasValve", position: [20.6, -13.0, 0.35], size: [0.7, 0.45, 0.7] },
    { componentId: "biospec_stirrer_01", scenePath: "/Biofoundry/Equipment/Flagship/BiospecBioreactor01/Stirrer", position: [21.0, -11.5, 0.2], size: [1.1, 1.1, 0.4], primitive: "cylinder" },
    { componentId: "biospec_condenser_01", scenePath: "/Biofoundry/Equipment/Flagship/BiospecBioreactor01/Condenser", position: [21.0, -11.5, 2.5], size: [0.7, 0.7, 1.0], primitive: "cylinder" },
    { componentId: "microscopy_acquisition_unit_01", scenePath: "/Biofoundry/Equipment/Test/Microscope01/AcquisitionUnit", position: [18.7, 13.5, 0.8], size: [1.3, 1.0, 1.6] },
    { componentId: "microscopy_reconstruction_unit_01", scenePath: "/Biofoundry/Equipment/Test/Microscope01/ReconstructionUnit", position: [20.5, 14.0, 0.7], size: [1.0, 1.0, 1.4] },
    { componentId: "microscopy_orchestrator_01", scenePath: "/Biofoundry/Equipment/Test/Microscope01/Orchestrator", position: [22.1, 14.0, 1.0], size: [0.7, 0.7, 2.0], primitive: "cylinder" },
    { componentId: "microfluidic_pressure_controller_01", scenePath: "/Biofoundry/Equipment/Build/MicrofluidicAssembly01/PressureController", position: [10.0, 13.6, 0.65], size: [0.8, 0.8, 1.3] },
    { componentId: "microfluidic_mux_valve_01", scenePath: "/Biofoundry/Equipment/Build/MicrofluidicAssembly01/MuxValve", position: [11.0, 13.6, 0.45], size: [0.65, 0.65, 0.9], primitive: "cylinder" },
    { componentId: "microfluidic_flow_sensor_01", scenePath: "/Biofoundry/Equipment/Build/MicrofluidicAssembly01/FlowSensor", position: [12.0, 13.6, 0.4], size: [0.55, 0.55, 0.8] },
    { componentId: "microfluidic_flow_chamber_01", scenePath: "/Biofoundry/Equipment/Build/MicrofluidicAssembly01/FlowChamber", position: [13.0, 13.6, 0.25], size: [1.0, 0.65, 0.5] },
    { componentId: "syringebot_controller_01", scenePath: "/Biofoundry/Equipment/Build/Syringebot01/Controller", position: [3.6, 6.5, 0.55], size: [0.8, 0.8, 1.1] },
    { componentId: "syringebot_syringe_bank_01", scenePath: "/Biofoundry/Equipment/Build/Syringebot01/SyringeBank", position: [5.0, 6.5, 1.0], size: [2.0, 0.8, 2.0] },
    { componentId: "syringebot_valve_bank_01", scenePath: "/Biofoundry/Equipment/Build/Syringebot01/ValveBank", position: [6.5, 6.5, 0.45], size: [1.0, 0.7, 0.9] },
    { componentId: "oscar_pipette_tool_01", scenePath: "/Biofoundry/Equipment/Build/OscarRobot01/PipetteTool", position: [6.0, 12.0, 1.8], size: [0.35, 0.35, 1.6], primitive: "cylinder" },
    { componentId: "oscar_thermocycler_01", scenePath: "/Biofoundry/Equipment/Build/OscarRobot01/Thermocycler", position: [3.2, 14.0, 0.55], size: [1.8, 1.2, 1.1] },
    { componentId: "oscar_gel_electrophoresis_01", scenePath: "/Biofoundry/Equipment/Build/OscarRobot01/GelElectrophoresis", position: [6.2, 14.2, 0.25], size: [2.2, 1.1, 0.5] },
    { componentId: "oscar_colony_camera_01", scenePath: "/Biofoundry/Equipment/Build/OscarRobot01/ColonyCamera", position: [8.8, 14.2, 0.8], size: [0.8, 0.8, 1.6], primitive: "cylinder" },
    { componentId: "biospec_cad_lid_unf", scenePath: "/Biofoundry/CAD/Biospec/LidUNF", position: [22.2, -13.2, 0.4], size: [0.6, 0.6, 0.35], primitive: "cylinder" },
    { componentId: "biospec_cad_gl45", scenePath: "/Biofoundry/CAD/Biospec/GL45Ports", position: [23.0, -13.2, 0.4], size: [0.5, 0.5, 0.4], primitive: "cylinder" },
    { componentId: "biospec_cad_plate", scenePath: "/Biofoundry/CAD/Biospec/AluminiumPlate", position: [23.8, -13.2, 0.25], size: [0.9, 0.7, 0.15] },
    ...bioprinterParts.map((part): B => ({
      componentId: part.id,
      scenePath: `/Biofoundry/Equipment/Build/BioprinterMOS3S01/${part.sceneName}`,
      position: part.position,
      size: part.size,
      orientation: [0, 0, 0, 1],
    })),
  ];

  return validateSceneBlueprint({
    schema: "subactor.scene-blueprint/v1",
    id: "biofoundry-live-v0.3.1",
    twinKind: "conceptual",
    components,
    bindings,
  });
}

/** @deprecated alias — wizard and projects import this name */
export const biofoundryLiveBlueprintDetailed = biofoundryLiveBlueprintV02;
