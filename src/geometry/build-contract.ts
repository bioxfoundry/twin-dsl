import type { GeometryBuildContract, GeometryBuildReceipt, GeometryScalar } from "../core/types.js";

const HASH = /^[a-f0-9]{64}$/;
const RESOURCE_URI = /^urn:subactor:resource:sha256:([a-f0-9]{64})$/;
const ID = /^[a-z0-9][a-z0-9-]{1,126}$/;
const PARAMETER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const UNITS = new Set(["micron", "millimeter", "centimeter", "meter", "inch", "foot"]);

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], error: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${error}:${unknown.join(",")}`);
}

function hash(value: unknown, error: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(error);
  return value;
}

function resourceUri(value: unknown, digest: string, error: string): string {
  const match = typeof value === "string" ? value.match(RESOURCE_URI) : null;
  if (!match || match[1] !== digest) throw new Error(error);
  return value as string;
}

function positive(value: unknown, error: string, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) throw new Error(error);
  return value;
}

function relativeMount(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.split(/[\\/]/).includes("..");
}

function scalar(value: unknown): value is GeometryScalar {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

export function validateGeometryBuild(value: unknown): GeometryBuildContract {
  const d = object(value, "GEOMETRY_BUILD_REQUIRED");
  exact(d, ["schema", "id", "source", "engine", "target", "coordinateSystem", "dependencies", "parameters", "compilerOptions", "outputs", "validations"], "GEOMETRY_BUILD_UNKNOWN_KEY");
  if (d.schema !== "subactor.geometry-build/v1" || typeof d.id !== "string" || !ID.test(d.id)) throw new Error("GEOMETRY_BUILD_HEADER_INVALID");

  const source = object(d.source, "GEOMETRY_BUILD_SOURCE_REQUIRED");
  exact(source, ["path", "uri", "sha256", "format"], "GEOMETRY_BUILD_SOURCE_UNKNOWN_KEY");
  const sourceHash = hash(source.sha256, "GEOMETRY_BUILD_SOURCE_HASH_INVALID");
  if (typeof source.path !== "string" || !source.path || source.format !== "scad") throw new Error("GEOMETRY_BUILD_SOURCE_INVALID");
  resourceUri(source.uri, sourceHash, "GEOMETRY_BUILD_SOURCE_URI_INVALID");

  const engine = object(d.engine, "GEOMETRY_BUILD_ENGINE_REQUIRED");
  exact(engine, ["type", "version", "imageDigest"], "GEOMETRY_BUILD_ENGINE_UNKNOWN_KEY");
  if (engine.type !== "openscad" || (engine.version !== undefined && (typeof engine.version !== "string" || !engine.version)) || (engine.imageDigest !== undefined && (typeof engine.imageDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(engine.imageDigest)))) throw new Error("GEOMETRY_BUILD_ENGINE_INVALID");

  const target = object(d.target, "GEOMETRY_BUILD_TARGET_REQUIRED");
  exact(target, ["componentId", "scenePath", "kind"], "GEOMETRY_BUILD_TARGET_UNKNOWN_KEY");
  if (typeof target.componentId !== "string" || !target.componentId || typeof target.scenePath !== "string" || !target.scenePath.startsWith("/") || !["space", "equipment", "utility"].includes(String(target.kind))) throw new Error("GEOMETRY_BUILD_TARGET_INVALID");

  const coordinateSystem = object(d.coordinateSystem, "GEOMETRY_BUILD_COORDINATE_SYSTEM_REQUIRED");
  exact(coordinateSystem, ["unit", "upAxis", "handedness"], "GEOMETRY_BUILD_COORDINATE_SYSTEM_UNKNOWN_KEY");
  if (!UNITS.has(String(coordinateSystem.unit)) || !["X", "Y", "Z"].includes(String(coordinateSystem.upAxis)) || coordinateSystem.handedness !== "right") throw new Error("GEOMETRY_BUILD_COORDINATE_SYSTEM_INVALID");

  if (!Array.isArray(d.dependencies)) throw new Error("GEOMETRY_BUILD_DEPENDENCIES_INVALID");
  const dependencyPaths = new Set<string>();
  for (const raw of d.dependencies) {
    const dependency = object(raw, "GEOMETRY_BUILD_DEPENDENCY_INVALID");
    exact(dependency, ["path", "mountPath", "uri", "sha256", "sourcePath", "fetch"], "GEOMETRY_BUILD_DEPENDENCY_UNKNOWN_KEY");
    const dependencyHash = hash(dependency.sha256, "GEOMETRY_BUILD_DEPENDENCY_HASH_INVALID");
    if (!relativeMount(dependency.path) || !relativeMount(dependency.mountPath) || typeof dependency.sourcePath !== "string" || !dependency.sourcePath) throw new Error("GEOMETRY_BUILD_DEPENDENCY_PATH_INVALID");
    resourceUri(dependency.uri, dependencyHash, "GEOMETRY_BUILD_DEPENDENCY_URI_INVALID");
    if (dependency.fetch !== undefined) {
      const fetch = object(dependency.fetch, "GEOMETRY_BUILD_DEPENDENCY_FETCH_INVALID");
      exact(fetch, ["type", "repository", "revision", "subpath"], "GEOMETRY_BUILD_DEPENDENCY_FETCH_UNKNOWN_KEY");
      if (fetch.type !== "git" || typeof fetch.repository !== "string" || !/^https:\/\//.test(fetch.repository) || typeof fetch.revision !== "string" || !/^[a-f0-9]{40}$/.test(fetch.revision) || typeof fetch.subpath !== "string" || (!relativeMount(fetch.subpath) && fetch.subpath !== ".") || !relativeMount(dependency.sourcePath)) throw new Error("GEOMETRY_BUILD_DEPENDENCY_FETCH_INVALID");
    }
    if (dependencyPaths.has(dependency.path)) throw new Error(`GEOMETRY_BUILD_DEPENDENCY_DUPLICATE:${dependency.path}`);
    dependencyPaths.add(dependency.path);
  }

  const parameters = object(d.parameters, "GEOMETRY_BUILD_PARAMETERS_REQUIRED");
  exact(parameters, ["presetId", "values"], "GEOMETRY_BUILD_PARAMETERS_UNKNOWN_KEY");
  if (typeof parameters.presetId !== "string" || !parameters.presetId) throw new Error("GEOMETRY_BUILD_PARAMETER_SET_INVALID");
  const values = object(parameters.values, "GEOMETRY_BUILD_PARAMETER_VALUES_INVALID");
  for (const [name, parameterValue] of Object.entries(values)) {
    if (!PARAMETER.test(name) || !scalar(parameterValue)) throw new Error(`GEOMETRY_BUILD_PARAMETER_INVALID:${name}`);
  }

  const options = object(d.compilerOptions, "GEOMETRY_BUILD_OPTIONS_REQUIRED");
  exact(options, ["hardWarnings", "timeoutSeconds", "maxTriangles", "fa", "fs", "fn"], "GEOMETRY_BUILD_OPTIONS_UNKNOWN_KEY");
  if (typeof options.hardWarnings !== "boolean") throw new Error("GEOMETRY_BUILD_HARD_WARNINGS_INVALID");
  const timeout = positive(options.timeoutSeconds, "GEOMETRY_BUILD_TIMEOUT_INVALID", true);
  if (timeout > 3600) throw new Error("GEOMETRY_BUILD_TIMEOUT_INVALID");
  const maxTriangles = positive(options.maxTriangles, "GEOMETRY_BUILD_TRIANGLE_LIMIT_INVALID", true);
  if (maxTriangles > 100_000_000) throw new Error("GEOMETRY_BUILD_TRIANGLE_LIMIT_INVALID");
  if (options.fa !== undefined) positive(options.fa, "GEOMETRY_BUILD_FA_INVALID");
  if (options.fs !== undefined) positive(options.fs, "GEOMETRY_BUILD_FS_INVALID");
  if (options.fn !== undefined && positive(options.fn, "GEOMETRY_BUILD_FN_INVALID", true) < 3) throw new Error("GEOMETRY_BUILD_FN_INVALID");

  const outputs = object(d.outputs, "GEOMETRY_BUILD_OUTPUTS_REQUIRED");
  exact(outputs, ["canonical", "web", "scene"], "GEOMETRY_BUILD_OUTPUTS_UNKNOWN_KEY");
  if (outputs.canonical !== "3mf" || outputs.web !== "glb" || !["usda", "usdc"].includes(String(outputs.scene))) throw new Error("GEOMETRY_BUILD_OUTPUTS_INVALID");

  const validations = object(d.validations, "GEOMETRY_BUILD_VALIDATIONS_REQUIRED");
  exact(validations, ["nonEmpty", "finiteBbox", "dependencyClosure", "glbLoad", "usdStageOpen", "bboxToleranceM", "reference"], "GEOMETRY_BUILD_VALIDATIONS_UNKNOWN_KEY");
  if (validations.nonEmpty !== true || validations.finiteBbox !== true || validations.dependencyClosure !== true || validations.glbLoad !== true || typeof validations.usdStageOpen !== "boolean" || typeof validations.bboxToleranceM !== "number" || !Number.isFinite(validations.bboxToleranceM) || validations.bboxToleranceM < 0 || validations.bboxToleranceM > 1) throw new Error("GEOMETRY_BUILD_VALIDATIONS_INVALID");
  if (validations.reference !== undefined) {
    const reference = object(validations.reference, "GEOMETRY_BUILD_REFERENCE_INVALID");
    exact(reference, ["path", "sourceUri", "artifactUri", "sha256", "unit", "comparison"], "GEOMETRY_BUILD_REFERENCE_UNKNOWN_KEY");
    const referenceHash = hash(reference.sha256, "GEOMETRY_BUILD_REFERENCE_HASH_INVALID");
    if (typeof reference.path !== "string" || !reference.path || typeof reference.sourceUri !== "string" || !RESOURCE_URI.test(reference.sourceUri) || reference.artifactUri !== `urn:subactor:resource:sha256:${referenceHash}` || !UNITS.has(String(reference.unit)) || reference.comparison !== "extent") throw new Error("GEOMETRY_BUILD_REFERENCE_INVALID");
  }
  return value as GeometryBuildContract;
}

export function validateGeometryBuildReceipt(value: unknown): GeometryBuildReceipt {
  const d = object(value, "GEOMETRY_BUILD_RECEIPT_REQUIRED");
  if (d.schema !== "subactor.geometry-build-receipt/v1" || typeof d.id !== "string" || !d.id || !["succeeded", "failed"].includes(String(d.status)) || d.processUri !== "subactor://process/geometry/openscad/compile" || typeof d.cacheHit !== "boolean") throw new Error("GEOMETRY_BUILD_RECEIPT_INVALID");
  hash(d.parameterSetHash, "GEOMETRY_BUILD_RECEIPT_PARAMETER_HASH_INVALID");
  hash(d.validationPolicyHash, "GEOMETRY_BUILD_RECEIPT_VALIDATION_POLICY_HASH_INVALID");
  hash(d.geometryBuildHash, "GEOMETRY_BUILD_RECEIPT_BUILD_HASH_INVALID");
  if (d.geometryArtifactHash !== undefined) hash(d.geometryArtifactHash, "GEOMETRY_BUILD_RECEIPT_ARTIFACT_HASH_INVALID");
  const validation = object(d.validation, "GEOMETRY_BUILD_RECEIPT_VALIDATION_REQUIRED");
  if (typeof validation.ok !== "boolean" || !Array.isArray(validation.failures) || !validation.failures.every((failure) => typeof failure === "string")) throw new Error("GEOMETRY_BUILD_RECEIPT_VALIDATION_INVALID");
  if (d.status === "succeeded" && (!validation.ok || typeof d.geometryArtifactHash !== "string")) throw new Error("GEOMETRY_BUILD_RECEIPT_SUCCESS_INVALID");
  if (d.status === "failed" && validation.ok) throw new Error("GEOMETRY_BUILD_RECEIPT_FAILURE_INVALID");
  return value as GeometryBuildReceipt;
}
