import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { GeometryBuildContract, GeometryBuildReceipt, PhysicalEvidenceDocument } from "../src/core/types.js";
import { sha256 } from "../src/core/canonical.js";
import { geometryBuildHash, parameterSetHash } from "../src/geometry/build-hash.js";
import { validateGeometryBuild, validateGeometryBuildReceipt } from "../src/geometry/build-contract.js";
import { renderGeometryDsl, renderGeometryReceiptDsl } from "../src/geometry/geometry-dsl.js";
import { geometryReceiptEvidence, mergeGeometryEvidence } from "../src/geometry/physical-evidence-adapter.js";

const run = promisify(execFile);

function contract(sourceHash = "a".repeat(64)): GeometryBuildContract {
  return {
    schema: "subactor.geometry-build/v1",
    id: "lid-unf-production-v1",
    source: { path: "lid_UNF.scad", uri: `urn:subactor:resource:sha256:${sourceHash}`, sha256: sourceHash, format: "scad" },
    engine: { type: "openscad", version: "2021.01", imageDigest: `sha256:${"b".repeat(64)}` },
    target: { componentId: "biospec_cad_lid_unf", scenePath: "/Biofoundry/Equipment/Bioreactor/Lid_UNF", kind: "equipment" },
    coordinateSystem: { unit: "millimeter", upAxis: "Z", handedness: "right" },
    dependencies: [{ path: "threadlib/threadlib.scad", mountPath: "threadlib", sourcePath: "lib/threadlib", uri: `urn:subactor:resource:sha256:${"c".repeat(64)}`, sha256: "c".repeat(64) }],
    parameters: { presetId: "production-v1", values: { thread_pitch: 2.5, quality: "production", enabled: true } },
    compilerOptions: { hardWarnings: true, timeoutSeconds: 120, maxTriangles: 1_000_000, fa: 1, fs: 0.5 },
    outputs: { canonical: "3mf", web: "glb", scene: "usda" },
    validations: { nonEmpty: true, finiteBbox: true, dependencyClosure: true, glbLoad: true, usdStageOpen: false, bboxToleranceM: 1e-6 },
  };
}

function receipt(): GeometryBuildReceipt {
  const value = contract();
  return {
    schema: "subactor.geometry-build-receipt/v1",
    id: "lid-unf-production-v1-1234",
    status: "succeeded",
    processUri: "subactor://process/geometry/openscad/compile",
    cacheHit: false,
    startedAt: "2026-08-08T00:00:00Z",
    completedAt: "2026-08-08T00:00:01Z",
    source: value.source,
    target: value.target,
    coordinateSystem: value.coordinateSystem,
    engine: { name: "openscad", version: "OpenSCAD 2021.01", imageDigest: value.engine.imageDigest },
    dependencies: { expected: value.dependencies, actual: ["lid_UNF.scad", "threadlib/threadlib.scad"], dependencySetHash: "d".repeat(64), drift: [] },
    parameterSetHash: "e".repeat(64),
    validationPolicyHash: "0".repeat(64),
    geometryBuildHash: "f".repeat(64),
    geometryArtifactHash: "1".repeat(64),
    artifacts: {
      "3mf": { uri: `urn:subactor:geometry:sha256:${"2".repeat(64)}`, sha256: "2".repeat(64), path: "/tmp/model.3mf", bytes: 100, mediaType: "model/3mf" },
      glb: { uri: `urn:subactor:geometry:sha256:${"3".repeat(64)}`, sha256: "3".repeat(64), path: "/tmp/model.glb", bytes: 200, mediaType: "model/gltf-binary" },
      usda: { uri: `urn:subactor:geometry:sha256:${"4".repeat(64)}`, sha256: "4".repeat(64), path: "/tmp/model.usda", bytes: 300, mediaType: "model/vnd.usda" },
    },
    validation: { ok: true, nonEmpty: true, finite: true, dependencyClosure: true, triangleCount: 10, bboxM: { min: [-0.036, -0.036, 0], max: [0.036, 0.036, 0.018] }, unit: "millimeter", glbLoad: true, usdStageOpen: false, usdValidationAvailable: false, bboxDeltaM: 0, failures: [] },
  };
}

test("geometry build contract is strict and build identity ignores host paths", () => {
  const first = validateGeometryBuild(contract());
  const second = { ...first, source: { ...first.source, path: "/another/checkout/lid_UNF.scad" }, dependencies: first.dependencies.map(item => ({ ...item, sourcePath: "/cache/threadlib" })) };
  assert.equal(geometryBuildHash(first, { name: "openscad", version: "OpenSCAD 2021.01", imageDigest: first.engine.imageDigest }), geometryBuildHash(second, { name: "openscad", version: "OpenSCAD 2021.01", imageDigest: first.engine.imageDigest }));
  assert.equal(parameterSetHash(first).length, 64);
  assert.throws(() => validateGeometryBuild({ ...first, source: { ...first.source, uri: `urn:subactor:resource:sha256:${"0".repeat(64)}` } }), /SOURCE_URI_INVALID/);
  assert.throws(() => validateGeometryBuild({ ...first, dependencies: [{ ...first.dependencies[0], mountPath: "../escape" }] }), /DEPENDENCY_PATH_INVALID/);
});

test("geometry and receipt DSL expose execution identity and failures", () => {
  assert.match(renderGeometryDsl(contract()), /DEPENDENCY "threadlib\/threadlib\.scad" MOUNT "threadlib"/);
  assert.match(renderGeometryDsl(contract()), /PARAMETER thread_pitch = 2\.5/);
  assert.match(renderGeometryReceiptDsl(validateGeometryBuildReceipt(receipt())), /RESULT PASS/);
});

test("successful receipt becomes grounded CAD evidence without weakening stronger intake", () => {
  const generated = geometryReceiptEvidence(receipt());
  assert.ok(generated);
  assert.equal(generated.records[0].size?.[0], 0.072);
  assert.equal(generated.records[0].assetUri, `urn:subactor:resource:sha256:${"3".repeat(64)}`);
  const manual: PhysicalEvidenceDocument = {
    schema: "subactor.physical-evidence/v1",
    id: "survey",
    coordinateSystem: { unit: "m", upAxis: "Z" },
    records: [{ componentId: "biospec_cad_lid_unf", kind: "equipment", evidence: "ifc", size: [1, 1, 1], sourceRef: "ifc:part" }],
  };
  const merged = mergeGeometryEvidence(manual, [generated]);
  assert.equal(merged?.records[0].evidence, "ifc");
  assert.equal(merged?.records[0].sourceRef, "ifc:part");
});

test("stdlib 3MF converter emits a loadable GLB in metres", async () => {
  const root = await mkdtemp(join(tmpdir(), "geometry-3mf-"));
  const source = join(root, "source"), output = join(root, "output"), model = join(source, "tetra.3mf");
  await mkdir(source);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  await run("python3", ["-c", "import sys,zipfile; p,x=sys.argv[1:]; z=zipfile.ZipFile(p,'w'); z.writestr('3D/3dmodel.model',x); z.close()", model, xml]);
  await run("python3", ["scripts/cad-to-gltf.py", source, output], { cwd: process.cwd() });
  const raw = await readFile(join(output, "tetra.glb"));
  assert.equal(raw.subarray(0, 4).toString(), "glTF");
  const jsonLength = raw.readUInt32LE(12);
  const document = JSON.parse(raw.subarray(20, 20 + jsonLength).toString("utf8"));
  assert.deepEqual(document.accessors[0].max, [0.01, 0.01, 0.01]);
});

test("missing OpenSCAD emits a failure receipt with error URN and repair URI", async () => {
  const root = await mkdtemp(join(tmpdir(), "geometry-failure-"));
  const sourceText = "cube([1,1,1]);\n", digest = sha256(sourceText);
  await writeFile(join(root, "part.scad"), sourceText);
  const value = { ...contract(digest), source: { path: "part.scad", uri: `urn:subactor:resource:sha256:${digest}`, sha256: digest, format: "scad" as const }, dependencies: [], engine: { type: "openscad" as const } };
  await writeFile(join(root, "contract.json"), JSON.stringify(value));
  const receiptPath = join(root, "receipt.json");
  await assert.rejects(run("python3", ["scripts/cad-to-gltf.py", "--geometry-build", join(root, "contract.json"), "--geometry-output", join(root, "out"), "--receipt", receiptPath], { cwd: process.cwd(), env: { ...process.env, OPENSCAD_BIN: join(root, "missing-openscad") } }));
  const failure = validateGeometryBuildReceipt(JSON.parse(await readFile(receiptPath, "utf8")));
  assert.equal(failure.status, "failed");
  assert.match(failure.error?.code ?? "", /^urn:subactor:error:geometry:/);
  assert.equal(failure.repairProcess, "subactor://process/repair/geometry/install-openscad-backend");
});
