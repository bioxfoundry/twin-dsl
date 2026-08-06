import test from "node:test";
import assert from "node:assert/strict";
import { parseQueryDsl } from "../src/dsl/query.js";
import { parseTreeDsl } from "../src/dsl/tree.js";
import { parseMathDsl, evaluateMath } from "../src/dsl/math.js";

test("query DSL binds process, snapshot and result", () => {
  const query = parseQueryDsl([
    "QUERY q1",
    `INTENT urn:subactor:intent:sha256:${"a".repeat(64)}`,
    "PROCESS query://knowledge/clickhouse/search/execute",
    `SOURCES [urn:subactor:resource:sha256:${"b".repeat(64)}]`,
    `SNAPSHOT ${"c".repeat(64)}`,
    'FILTER text contains "ticket"',
    "RETURN tree",
    "RESULT_URI urn:subactor:query-result:sha256:{hash}",
    "VALIDATE [evidence]",
  ].join("\n"));
  assert.equal(query.expectedResultKind, "tree");
  assert.equal(query.canonicalHash.length, 64);
});

test("tree DSL preserves hierarchy", () => {
  const tree = parseTreeDsl('TREE x\n  NODE a project "A"\n    NODE b file "B"');
  assert.equal(tree.roots[0].children[0].id, "b");
});

test("math DSL evaluates hard gate", () => {
  const math = parseMathDsl("MATH x\nBIND A = true\nBIND B = false\nEXPR Executable = AND(A, NOT(B))");
  assert.equal(evaluateMath(math, "Executable"), true);
});
