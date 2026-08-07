/**
 * Dashboard service smoke test: the endpoints the 3D view depends on must serve a coherent
 * twin/scene pair, and intake through the service must keep component identity stable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDashboard } from "../src/serve/dashboard.js";
import { createLivingProject } from "../src/project/wizard.js";
import { LivingProjectRuntime } from "../src/runtime/living-project.js";
import type { SceneDocument, TwinDocument } from "../src/core/types.js";

test("dashboard serves the live twin, scene and USD, and applies intake durably", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dt-dashboard-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await createLivingProject({
    name: "Dashboard Factory",
    outDir: join(root, "project"),
    profile: "biofoundry",
    managerIntent: "Serve the factory over HTTP.",
  });
  const outDir = join(root, "runtime");
  await new LivingProjectRuntime().iterate(created.configPath, outDir, "deterministic");

  // Port 0 lets the OS pick a free port so the suite never collides with a running dashboard.
  const server = await startDashboard({ configPath: created.configPath, outDir, port: 0 });
  t.after(() => server.close());

  const state = (await (await fetch(`${server.url}api/state`)).json()) as { twin: TwinDocument; scene: SceneDocument };
  assert.ok(state.twin.components.length > 0, "no twin components served");
  assert.equal(state.scene.bindings.length, state.twin.components.length);
  assert.equal(state.scene.sourceTwinId, state.twin.id);

  const usda = await (await fetch(`${server.url}api/scene.usda`)).text();
  assert.match(usda, /^#usda 1\.0/);
  for (const binding of state.scene.bindings.slice(0, 5)) {
    assert.ok(usda.includes(binding.scenePath), `USD is missing ${binding.scenePath}`);
  }

  const before = state.twin.components.map((c) => c.id);
  const target = before.includes("build") ? "build" : before[0];
  const intake = await fetch(`${server.url}api/intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schema: "subactor.physical-evidence/v1",
      id: "dashboard-test",
      coordinateSystem: { unit: "m", upAxis: "Z" },
      records: [
        { componentId: target, kind: "space", evidence: "cad", size: [12.4, 14.2, 3.2], sourceRef: "plan:test" },
        { componentId: "definitely_not_a_component", kind: "equipment", evidence: "ifc", size: [1, 1, 1] },
      ],
    }),
  });
  const result = (await intake.json()) as { report: { applied: unknown[]; rejected: { reason: string }[]; componentIdsStable: boolean; scenePathsStable: boolean } };
  assert.equal(intake.status, 200);
  assert.equal(result.report.applied.length, 1);
  assert.equal(result.report.rejected[0].reason, "UNKNOWN_COMPONENT");
  assert.equal(result.report.componentIdsStable, true);
  assert.equal(result.report.scenePathsStable, true);

  // Durable: the evidence file and the projectDSL key survive, so a reload shows the same geometry.
  assert.match(await readFile(created.configPath, "utf8"), /SCENE_PHYSICAL_EVIDENCE_FILE/);
  const after = (await (await fetch(`${server.url}api/state`)).json()) as { twin: TwinDocument; scene: SceneDocument };
  assert.deepEqual(after.twin.components.map((c) => c.id), before, "intake must not change component identity");
  const bound = after.scene.bindings.find((b) => b.componentId === target);
  assert.deepEqual(bound?.size, [12.4, 14.2, 3.2]);
});
