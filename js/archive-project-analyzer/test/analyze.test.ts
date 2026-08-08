import test from "node:test";
import assert from "node:assert/strict";
import { analyzeArchiveProject, renderArchiveAnalysisDsl } from "../src/index.js";

test("ranks complete assembly, BOM and exported mesh above incidental source", () => {
  const analysis = analyzeArchiveProject({
    archivePath: "/evidence/pipette.zip", archiveSha256: "a".repeat(64), archiveSize: 1000,
    entries: [
      { path: "pipette/export/pipette_assembly.obj", uncompressedSize: 93_000_000, safe: true },
      { path: "pipette/solidworks/pipette_assembly.SLDASM", uncompressedSize: 1_000_000, safe: true },
      { path: "pipette/bom.xlsx", uncompressedSize: 10_000, safe: true },
      { path: "pipette/src/debug.py", uncompressedSize: 300, safe: true },
      { path: "pipette/README.rst", uncompressedSize: 900, safe: true },
    ],
  });
  assert.equal(analysis.candidates[0]?.kind, "assembly-cad");
  assert.ok(analysis.selectedGeometryEntries.includes("pipette/export/pipette_assembly.obj"));
  assert.equal(analysis.coverage.unsupportedCadEntries, 1);
  assert.equal(analysis.projectRoots[0], "pipette");
  assert.match(renderArchiveAnalysisDsl(analysis), /ARCHIVE_CAD_BACKEND_MISSING/);
});

test("unsafe paths are rejected and never selected", () => {
  const analysis = analyzeArchiveProject({
    archivePath: "/evidence/unsafe.zip", archiveSha256: "b".repeat(64), archiveSize: 12,
    entries: [
      { path: "../escape.stl", uncompressedSize: 10, safe: false },
      { path: "safe/model.stl", uncompressedSize: 10, safe: true },
    ],
  });
  assert.deepEqual(analysis.selectedGeometryEntries, ["safe/model.stl"]);
  assert.ok(analysis.findings.some((finding) => finding.code === "ARCHIVE_UNSAFE_PATH"));
});
