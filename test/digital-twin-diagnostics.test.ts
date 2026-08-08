import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnoseDigitalTwin } from "../src/runtime/digital-twin-diagnostics.js";

test("digital-twin diagnostics distinguish assembly scopes from placeholder geometry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-diagnostics-scope-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source");
  const markdownRoot = join(root, "markdown");
  const dslRoot = join(root, "dsl");
  const runtimeRoot = join(root, "runtime");
  await Promise.all([
    mkdir(sourceRoot, { recursive: true }),
    mkdir(markdownRoot, { recursive: true }),
    mkdir(dslRoot, { recursive: true }),
    mkdir(join(runtimeRoot, "current"), { recursive: true }),
  ]);
  await writeFile(join(dslRoot, "intent.dsl"), "INTENT scope-test\nEND_INTENT\n");
  await writeFile(join(runtimeRoot, "current/twin.json"), JSON.stringify({ schema: "subactor.twin/v1", components: [] }));
  await writeFile(join(runtimeRoot, "current/physical-evidence.report.json"), JSON.stringify({ rejected: [] }));

  const scan = async (bindings: unknown[]) => {
    await writeFile(join(runtimeRoot, "current/scene.json"), JSON.stringify({ schema: "subactor.scene/v1", bindings }));
    return diagnoseDigitalTwin({ sourceRoot, markdownRoot, dslRoot, runtimeRoot });
  };

  const mixed = await scan([
    { componentId: "assembly", primitive: "scope" },
    { componentId: "proxy", primitive: "cube" },
  ]);
  const finding = mixed.diagnostics.find((item) => item.code === "SCENE_PLACEHOLDER_GEOMETRY");
  assert.match(finding?.message ?? "", /^1 scene binding/);

  const scopeOnly = await scan([{ componentId: "assembly", primitive: "scope" }]);
  assert.equal(scopeOnly.diagnostics.some((item) => item.code === "SCENE_PLACEHOLDER_GEOMETRY"), false);
});
