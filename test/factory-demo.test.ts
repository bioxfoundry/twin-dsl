import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ensureFactoryDemo } from "../src/project/factory-demo.js";
import { createLivingProject } from "../src/project/wizard.js";
import { validateSceneBlueprint } from "../src/scene/blueprint.js";

test("factory demo migrates the stale component and observation contracts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "factory-demo-migration-"));
  const projectDir = join(temp, "project");
  try {
    await createLivingProject({ name: "Biofoundry Factory Floor", outDir: projectDir, profile: "biofoundry" });
    const blueprintPath = join(projectDir, "baseline/scene-blueprint.json");
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    delete blueprint.components[0].spatialClass;
    await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);

    const environmentPath = join(projectDir, "environment/current.json");
    const environment = JSON.parse(await readFile(environmentPath, "utf8"));
    delete environment.units;
    environment.unit = "mixed";
    await writeFile(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);

    const result = await ensureFactoryDemo(projectDir, projectDir);
    assert.equal(result.action, "migrated:SCENE_BLUEPRINT_COMPONENT_INVALID,OBSERVATION_UNIT_MIXED_FORBIDDEN");
    assert.deepEqual(result.migrations, ["SCENE_BLUEPRINT_COMPONENT_INVALID", "OBSERVATION_UNIT_MIXED_FORBIDDEN"]);
    validateSceneBlueprint(JSON.parse(await readFile(blueprintPath, "utf8")));
    const migratedEnvironment = JSON.parse(await readFile(environmentPath, "utf8"));
    assert.equal(migratedEnvironment.unit, undefined);
    assert.deepEqual(migratedEnvironment.units, { temperatureC: "Cel", availability: "none" });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("factory demo migration refuses an unrelated blueprint", async () => {
  const temp = await mkdtemp(join(tmpdir(), "factory-demo-identity-"));
  const projectDir = join(temp, "project");
  try {
    await createLivingProject({ name: "Biofoundry Factory Floor", outDir: projectDir, profile: "biofoundry" });
    const blueprintPath = join(projectDir, "baseline/scene-blueprint.json");
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    blueprint.id = "custom-project";
    delete blueprint.components[0].spatialClass;
    const before = `${JSON.stringify(blueprint, null, 2)}\n`;
    await writeFile(blueprintPath, before);

    await assert.rejects(() => ensureFactoryDemo(projectDir, projectDir), /FACTORY_DEMO_BLUEPRINT_IDENTITY_INVALID:custom-project/);
    assert.equal(await readFile(blueprintPath, "utf8"), before);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
