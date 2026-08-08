import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAssemblies, parseAssemblyDsl, renderAssemblyDsl, renderAssemblyReportDsl } from "../src/index.js";
import type { SceneDocument, TwinDocument } from "../src/index.js";

const assetUri = `urn:subactor:resource:sha256:${"a".repeat(64)}`;
const source = `ASSEMBLIES laboratory-v1
ASSEMBLY reactor
ROOT reactor_01
KIND device
PART lid COMPONENT reactor_lid REQUIRED true
ASSET ${assetUri}
SCENE_PATH "/Factory/Reactor/Lid"
END_PART
END_ASSEMBLY
`;
const twin: TwinDocument = {
  schema: "subactor.twin/v1", id: "laboratory", kind: "physical", observedAt: "2026-08-08T20:00:00Z", sourceSnapshotHash: "b".repeat(64),
  components: [{ id: "reactor_01", type: "device", sourceUris: [], properties: {}, children: [{ id: "reactor_lid", type: "cad-part", sourceUris: [assetUri], properties: {}, children: [] }] }],
};
const scene: SceneDocument = {
  schema: "subactor.scene/v1", id: "laboratory-scene", format: "openusd", sourceTwinId: twin.id,
  bindings: [{ twinUri: "urn:twin", componentId: "reactor_lid", scenePath: "/Factory/Reactor/Lid", propertyMap: {}, assetUri }],
};

test("standalone AssemblyDSL package round-trips and validates grounded completeness", () => {
  const document = parseAssemblyDsl(source);
  assert.deepEqual(parseAssemblyDsl(renderAssemblyDsl(document)), document);
  const report = analyzeAssemblies({ projectId: "laboratory", document, twin, scene, allowedAssetUris: [assetUri] });
  assert.equal(report.ok, true);
  assert.equal(report.complete, true);
  assert.match(renderAssemblyReportDsl(report), /COMPLETENESS COMPLETE/);
});

test("standalone analyzer emits stable error and repair URIs", () => {
  const document = parseAssemblyDsl(source);
  const report = analyzeAssemblies({ projectId: "laboratory", document, twin, scene, allowedAssetUris: [] });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.errorUri === "urn:subactor:error:assembly:assembly-part-asset-ungrounded"));
  assert.ok(report.findings.every((finding) => finding.repairProcess.startsWith("subactor://process/repair/")));
});
