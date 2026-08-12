#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const manifestPath = resolve(process.argv[2] ?? "assets/geometry/web/web-models.manifest.json");
const root = dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const fail = (code, detail) => { const error = new Error(detail); error.name = code; throw error; };
const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const close = (actual, expected) => Math.abs(actual - expected) <= 1e-9;

function inspectGlb(bytes) {
  if (bytes.length < 28 || bytes.toString("ascii", 0, 4) !== "glTF") fail("WEB_MODEL_GLB_HEADER_INVALID", "magic");
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) fail("WEB_MODEL_GLB_HEADER_INVALID", "version-or-length");
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.toString("ascii", 16, 20) !== "JSON" || 20 + jsonLength > bytes.length) fail("WEB_MODEL_GLB_JSON_INVALID", "chunk");
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let primitiveCount = 0;
  let vertexCount = 0;
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    primitiveCount += 1;
    const accessor = document.accessors?.[primitive.attributes?.POSITION];
    if (!accessor || accessor.componentType !== 5126 || accessor.type !== "VEC3" || !Array.isArray(accessor.min) || !Array.isArray(accessor.max)) {
      fail("WEB_MODEL_GLB_POSITION_INVALID", String(primitive.attributes?.POSITION));
    }
    vertexCount += accessor.count;
    for (let axis = 0; axis < 3; axis += 1) {
      bounds.min[axis] = Math.min(bounds.min[axis], accessor.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], accessor.max[axis]);
    }
  }
  return { document, meshCount: document.meshes?.length ?? 0, primitiveCount, vertexCount, bboxM: bounds };
}

if (manifest.schema !== "bioxfoundry.web-geometry-manifest/v1" || !Array.isArray(manifest.models)) {
  fail("WEB_MODEL_MANIFEST_INVALID", "root");
}
const report = [];
for (const model of manifest.models) {
  if (!model.representationClass || !model.source?.license || !model.source?.revision || !model.limitations?.length) {
    fail("WEB_MODEL_PROVENANCE_INCOMPLETE", model.id);
  }
  for (const source of model.source.files ?? []) {
    const actual = await digest(resolve(root, source.path));
    if (actual !== source.sha256) fail("WEB_MODEL_SOURCE_HASH_MISMATCH", `${model.id}:${source.path}`);
  }
  const path = resolve(root, model.asset.path);
  const bytes = await readFile(path);
  const metadata = await stat(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== model.asset.sha256) fail("WEB_MODEL_ASSET_HASH_MISMATCH", model.id);
  if (metadata.size !== model.asset.bytes) fail("WEB_MODEL_ASSET_SIZE_MISMATCH", model.id);
  const glb = inspectGlb(bytes);
  for (const field of ["meshCount", "primitiveCount", "vertexCount"]) {
    if (glb[field] !== model.asset[field]) fail("WEB_MODEL_GLB_COUNT_MISMATCH", `${model.id}:${field}`);
  }
  for (const side of ["min", "max"]) for (let axis = 0; axis < 3; axis += 1) {
    if (!close(glb.bboxM[side][axis], model.asset.bboxM[side][axis])) fail("WEB_MODEL_GLB_BOUNDS_MISMATCH", `${model.id}:${side}[${axis}]`);
  }
  const extent = glb.bboxM.max.map((value, axis) => value - glb.bboxM.min[axis]);
  if (extent.some((value) => !Number.isFinite(value) || value <= 0 || value > 3)) fail("WEB_MODEL_GLB_UNIT_IMPLAUSIBLE", model.id);
  report.push({ id: model.id, sha256, bytes: metadata.size, meshCount: glb.meshCount, primitiveCount: glb.primitiveCount, vertexCount: glb.vertexCount, bboxM: glb.bboxM });
}

console.log(JSON.stringify({ schema: "bioxfoundry.web-geometry-verification/v1", ok: true, models: report }, null, 2));
