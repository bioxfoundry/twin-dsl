import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canonicalJson, sha256 } from "../src/core/canonical.js";
import { loadSourceCoverage, validateSourceCoverage } from "../src/runtime/source-coverage.js";
import type { SourceCoverageDocument, SourceCoverageRecord } from "../src/core/types.js";

function coverage(records: SourceCoverageRecord[]): SourceCoverageDocument {
  const states = [
    "converted", "binary-provenance", "excluded-by-policy", "unsupported", "quarantined", "failed",
  ] as const;
  const ordered = [...records].sort((left, right) => left.path.localeCompare(right.path));
  const byState = Object.fromEntries(states.map((state) => [
    state, ordered.filter((record) => record.state === state).length,
  ])) as SourceCoverageDocument["summary"]["byState"];
  const material = {
    schema: "bioxfoundry.source-coverage/v1" as const,
    sourceSnapshotSha256: "b".repeat(64),
    summary: { discovered: ordered.length, terminal: ordered.length, byState },
    records: ordered,
  };
  return { ...material, coverageSha256: sha256(canonicalJson(material)) };
}

function record(path = "report.pdf"): SourceCoverageRecord {
  const sourceSha256 = "a".repeat(64);
  return {
    path,
    inputKind: ".pdf",
    mediaType: "application/pdf",
    sourceSha256,
    resourceUri: `urn:subactor:resource:sha256:${sourceSha256}`,
    markdownPath: `${path}.md`,
    intentUris: [],
    treeRefs: ["."],
    converter: "pymupdf-layout",
    converterVersion: "1.28.2",
    state: "converted",
    reasonCode: "CONVERTED",
    twinRevisionStatus: "not-evaluated",
  };
}

test("source coverage validator checks terminal sums, hashes, paths and resource identity", () => {
  const valid = coverage([record()]);
  assert.deepEqual(validateSourceCoverage(valid), valid);

  const duplicate = coverage([record(), record()]);
  assert.throws(() => validateSourceCoverage(duplicate), /SOURCE_COVERAGE_PATH_DUPLICATE/);

  const wrongResource = coverage([{ ...record(), resourceUri: `urn:subactor:resource:sha256:${"c".repeat(64)}` }]);
  assert.throws(() => validateSourceCoverage(wrongResource), /SOURCE_COVERAGE_RESOURCE_URI_HASH_MISMATCH/);

  const unlinked = coverage([{ ...record(), treeRefs: [] }]);
  assert.doesNotThrow(() => validateSourceCoverage(unlinked), "valid-but-incomplete evidence belongs in ProjectIntegrity");

  const traversal = coverage([{ ...record(), path: "../report.pdf" }]);
  assert.throws(() => validateSourceCoverage(traversal), /SOURCE_COVERAGE_PATH_INVALID/);

  const tampered = structuredClone(valid);
  tampered.records[0].reasonCode = "CHANGED_AFTER_HASH";
  assert.throws(() => validateSourceCoverage(tampered), /SOURCE_COVERAGE_HASH_MISMATCH/);
});

test("coverage loader distinguishes missing, valid and invalid reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-coverage-"));
  const absent = join(root, "absent");
  const sourceFile = join(root, "single-source.md");
  const validRoot = join(root, "valid");
  const invalidRoot = join(root, "invalid");
  await mkdir(validRoot);
  await mkdir(invalidRoot);
  await writeFile(sourceFile, "# A directly configured source file\n");
  await writeFile(join(validRoot, "source-coverage.json"), JSON.stringify(coverage([record()])));
  await writeFile(join(invalidRoot, "source-coverage.json"), "{not-json");

  const loaded = await loadSourceCoverage([absent, sourceFile, validRoot, invalidRoot]);
  assert.equal(loaded.reports.length, 1);
  assert.equal(loaded.invalid.length, 1);
  assert.match(loaded.invalid[0].error, /SyntaxError|JSON/);
});
