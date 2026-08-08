import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanSources } from "../src/ingestion/scanner.js";

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
