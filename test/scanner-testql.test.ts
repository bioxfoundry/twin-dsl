import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { scanSources } from "../src/ingestion/scanner.js";
import { resourceFromBinary } from "../src/dsl/resource.js";

test("small binary resources use the real byte hash for both digest and URI", () => {
  const bytes = Buffer.from([0, 255, 1, 2, 3, 128]);
  const expected = createHash("sha256").update(bytes).digest("hex");
  const resource = resourceFromBinary("binary-1", "subactor://fixture/model.glb", "/tmp/model.glb", bytes, "model/gltf-binary");
  assert.equal(resource.sha256, expected);
  assert.equal(resource.uri, `urn:subactor:resource:sha256:${expected}`);
  assert.equal(resource.size, bytes.length);
});

test("scanner ingests TestQLDSL as text instead of a binary stub", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "testqldsl-scan-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = "```testqldsl\nTESTQL_RESULT run-1\nOK false\nEND_TESTQL_RESULT\n```\n";
  await writeFile(join(root, "startup.testqldsl"), content);
  const result = await scanSources([{
    path: root,
    role: "runtime",
    logicalRoot: "subactor://project/test/logs",
    labels: ["testql"],
  }]);
  assert.equal(result.resources.length, 1);
  const resource = result.resources[0];
  assert.ok(resource);
  assert.equal(resource.mediaType, "text/markdown");
  assert.equal((resource.labels ?? []).includes("binary-stub"), false);
  assert.equal(result.texts.get(resource.uri), content);
});

test("feedback directory scans exclude the runtime-managed latest file", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "feedback-scan-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "latest.md"), "runtime feedback\n");
  await writeFile(join(root, "manual.md"), "operator feedback\n");

  const result = await scanSources([{
    path: root,
    role: "derived",
    logicalRoot: "subactor://project/test/feedback",
    labels: ["feedback"],
  }]);

  assert.deepEqual(result.resources.map(resource => resource.sourcePath), [join(root, "manual.md")]);
  assert.equal([...result.texts.values()].includes("operator feedback\n"), true);
});
