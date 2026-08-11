import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseProjectDsl } from "../dsl/project.js";
import { biofoundryLiveBlueprintV02, validateSceneBlueprint } from "../scene/blueprint.js";
import { createLivingProject } from "./wizard.js";

export interface FactoryDemoBootstrapResult {
  schema: "bioxfoundry.factory-demo-bootstrap/v1";
  action: "current" | "created" | `migrated:${string}`;
  migrations: string[];
  configPath: string;
  blueprintPath: string;
  environmentPath: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw error;
  }
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unreadable(kind: "blueprint" | "environment", message: string): Error {
  return kind === "blueprint"
    ? new Error(`FACTORY_DEMO_BLUEPRINT_UNREADABLE:${message}`)
    : new Error(`FACTORY_DEMO_ENVIRONMENT_UNREADABLE:${message}`);
}

async function json(path: string, kind: "blueprint" | "environment"): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw unreadable(kind, "root must be an object");
    return value as Record<string, unknown>;
  } catch (error) {
    const message = detail(error);
    if (message.startsWith("FACTORY_DEMO_")) throw error;
    throw unreadable(kind, message);
  }
}

/**
 * Repair only known historical shapes of the generated factory demo.
 * `expectedRoot` is an explicit write boundary: callers cannot repurpose this as a
 * general project migration and accidentally replace a user's blueprint.
 */
export async function ensureFactoryDemo(
  demoRootInput: string,
  expectedRootInput: string,
): Promise<FactoryDemoBootstrapResult> {
  const demoRoot = resolve(demoRootInput);
  const expectedRoot = resolve(expectedRootInput);
  if (demoRoot !== expectedRoot) throw new Error(`FACTORY_DEMO_TARGET_INVALID:${demoRoot}`);

  const configPath = join(demoRoot, "project.projectdsl");
  let created = false;
  if (!await exists(configPath)) {
    await createLivingProject({
      name: "Biofoundry Factory Floor",
      outDir: demoRoot,
      profile: "biofoundry",
      managerIntent: "Demonstrate the current deterministic biofoundry factory contract.",
    });
    created = true;
  }

  const project = parseProjectDsl(await readFile(configPath, "utf8"));
  if (!project.scene.blueprintFile) throw new Error("FACTORY_DEMO_BLUEPRINT_REQUIRED");
  const blueprintPath = resolve(demoRoot, project.scene.blueprintFile);
  const environmentPath = join(demoRoot, "environment/current.json");
  const migrations: string[] = [];

  const blueprint = await json(blueprintPath, "blueprint");
  try {
    validateSceneBlueprint(blueprint);
  } catch (error) {
    if (typeof blueprint.id !== "string" || !blueprint.id.startsWith("biofoundry-live-")) {
      throw new Error(`FACTORY_DEMO_BLUEPRINT_IDENTITY_INVALID:${String(blueprint.id ?? "missing")}`);
    }
    const replacement = biofoundryLiveBlueprintV02();
    validateSceneBlueprint(replacement);
    await writeFile(blueprintPath, `${JSON.stringify(replacement, null, 2)}\n`);
    migrations.push(detail(error).split(":", 1)[0]);
  }
  const historicalBlueprint = blueprint.id === "biofoundry-live-v0.2.1" || blueprint.id === "biofoundry-live-v0.3.0";
  if (historicalBlueprint && migrations.length === 0) {
    const replacement = biofoundryLiveBlueprintV02();
    validateSceneBlueprint(replacement);
    await writeFile(blueprintPath, `${JSON.stringify(replacement, null, 2)}\n`);
    migrations.push("FACTORY_DEMO_BLUEPRINT_V03");
  }

  const environment = await json(environmentPath, "environment");
  if (environment.unit === "mixed") {
    const expectedSubject = `subactor://project/${project.id}/environment`;
    if (
      environment.subjectUri !== expectedSubject ||
      typeof environment.temperatureC !== "number" ||
      typeof environment.availability !== "boolean"
    ) {
      throw new Error(`FACTORY_DEMO_ENVIRONMENT_IDENTITY_INVALID:${String(environment.subjectUri ?? "missing")}`);
    }
    const { unit: _staleUnit, ...current } = environment;
    await writeFile(environmentPath, `${JSON.stringify({
      ...current,
      units: { temperatureC: "Cel", availability: "none" },
    }, null, 2)}\n`);
    migrations.push("OBSERVATION_UNIT_MIXED_FORBIDDEN");
  }

  const action = created
    ? "created" as const
    : migrations.length > 0
      ? `migrated:${migrations.join(",")}` as const
      : "current" as const;
  return {
    schema: "bioxfoundry.factory-demo-bootstrap/v1",
    action,
    migrations,
    configPath,
    blueprintPath,
    environmentPath,
  };
}
