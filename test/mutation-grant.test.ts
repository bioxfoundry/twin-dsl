import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  consumeMutationGrantJti,
  issueMutationGrant,
  verifyMutationGrantDocument,
  writeMutationGrant,
} from "../src/runtime/mutation-grant.js";
import { createIsolatedWorkspace } from "../src/runtime/isolated-worktree.js";
import { proposeCodeMutation } from "../src/runtime/mutation-pipeline.js";
import { mutationGrantPresent } from "../src/runtime/autonomy.js";
import { validateAutonomCycle, summarizeProbeCycle } from "../src/adapters/twin-probes.js";
import type { LivingProjectDocument } from "../src/core/types.js";

const SECRET = "test-mutation-grant-secret-for-hmac";
const env = { MUTATION_GRANT_HMAC_SECRET: SECRET };

function sampleProject(id = "customer-twin"): LivingProjectDocument {
  return {
    schema: "subactor.living-project/v1",
    id,
    name: "Customer Twin",
    profile: "generic",
    managerIntent: "Improve safely",
    sources: [],
    development: { root: "code" },
    observations: { paths: ["logs"], logicalRoot: `subactor://project/${id}/runtime` },
    policy: {
      approved: true,
      requireResearch: true,
      requireDevelopmentEvidence: true,
      requireDevelopmentAcceptance: true,
      allowDevelopmentFixture: true,
      requireRuntimeEvidence: true,
      autoPublishScene: false,
      allowRuntimeSelfModification: false,
      autonomyMode: "propose",
      requireSignedMutationGrant: true,
      mutationGrantFile: "policy/mutation-grant.json",
      maxIterationsPerHour: 12,
      maxConsecutiveFailures: 5,
    },
    scene: { format: "openusd" },
  };
}

test("mutation grant issues and verifies HMAC signature", () => {
  const issued = issueMutationGrant(
    {
      runId: "run-1",
      actor: "manager@example.com",
      planHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      artifactSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      target: "code/src/runtime.ts",
      projectId: "customer-twin",
    },
    { env },
  );
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  const verified = verifyMutationGrantDocument(issued.document, {
    projectId: "customer-twin",
    planHash: issued.document.planHash,
    env,
  });
  assert.equal(verified.ok, true);
  if (!verified.ok) return;
  assert.equal(verified.claims.jti, issued.document.jti);
});

test("mutation grant rejects tampered envelope and bad signature", () => {
  const issued = issueMutationGrant(
    {
      runId: "run-2",
      actor: "manager@example.com",
      planHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      artifactSha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      target: "code/",
      projectId: "customer-twin",
    },
    { env },
  );
  assert.equal(issued.ok, true);
  if (!issued.ok) return;

  const tampered = { ...issued.document, planHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" };
  const envelope = verifyMutationGrantDocument(tampered, { projectId: "customer-twin", env });
  assert.equal(envelope.ok, false);

  const badSig = { ...issued.document, signature: issued.document.signature.slice(0, -4) + "dead" };
  const sig = verifyMutationGrantDocument(badSig, { projectId: "customer-twin", env });
  assert.equal(sig.ok, false);

  const placeholder = {
    schema: "subactor.signed-mutation-grant/v1",
    projectId: "customer-twin",
    planHash: "ff".repeat(32),
    expiresAt: "2099-01-01T00:00:00.000Z",
    signature: "replace-with-detached-signature",
  };
  const legacy = verifyMutationGrantDocument(placeholder, { projectId: "customer-twin", env });
  assert.equal(legacy.ok, false);
});

test("mutation grant jti is single-use", async () => {
  const dir = await mkdtemp(join(tmpdir(), "grant-jti-"));
  try {
    const first = await consumeMutationGrantJti("jti-unique-value-01", "2099-01-01T00:00:00.000Z", dir);
    assert.equal(first.ok, true);
    const second = await consumeMutationGrantJti("jti-unique-value-01", "2099-01-01T00:00:00.000Z", dir);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.error, "mutation_grant_replay");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mutationGrantPresent requires cryptographic verification", async () => {
  const dir = await mkdtemp(join(tmpdir(), "grant-present-"));
  const prev = process.env.MUTATION_GRANT_HMAC_SECRET;
  process.env.MUTATION_GRANT_HMAC_SECRET = SECRET;
  try {
    const project = sampleProject();
    await mkdir(join(dir, "policy"), { recursive: true });
    const issued = issueMutationGrant(
      {
        runId: "run-3",
        actor: "manager@example.com",
        planHash: "11".repeat(32),
        artifactSha256: "22".repeat(32),
        target: "code/",
        projectId: project.id,
      },
      { env: process.env },
    );
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    await writeMutationGrant(join(dir, "policy/mutation-grant.json"), issued.document);
    assert.equal(await mutationGrantPresent(project, dir), true);

    await writeFile(
      join(dir, "policy/mutation-grant.json"),
      JSON.stringify({
        schema: "subactor.signed-mutation-grant/v1",
        projectId: project.id,
        planHash: "11".repeat(32),
        expiresAt: "2099-01-01T00:00:00.000Z",
        signature: "not-a-real-signature",
      }),
    );
    assert.equal(await mutationGrantPresent(project, dir), false);
  } finally {
    if (prev === undefined) delete process.env.MUTATION_GRANT_HMAC_SECRET;
    else process.env.MUTATION_GRANT_HMAC_SECRET = prev;
    await rm(dir, { recursive: true, force: true });
  }
});

test("isolated workspace copies non-git development roots", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iso-ws-"));
  try {
    const source = join(dir, "code");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "main.ts"), "export const x=1;\n");
    const workspace = await createIsolatedWorkspace(source, { parentDir: join(dir, "workspaces") });
    assert.equal(workspace.kind, "directory-copy");
    assert.equal(await readFile(join(workspace.path, "main.ts"), "utf8"), "export const x=1;\n");
    await workspace.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mutation propose refuses invalid grant and proposes with valid grant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mutation-prop-"));
  const prev = process.env.MUTATION_GRANT_HMAC_SECRET;
  process.env.MUTATION_GRANT_HMAC_SECRET = SECRET;
  try {
    const project = sampleProject();
    project.policy.autonomyMode = "propose";
    const code = join(dir, "code");
    await mkdir(code, { recursive: true });
    await writeFile(join(code, "index.ts"), "export {};\n");
    const plan = {
      schema: "t2c.code-change-plan/v1",
      id: "plan-1",
      planHash: "33".repeat(32),
      target: { paths: ["index.ts"] },
      status: "proposed",
    };
    const planPath = join(dir, "plan.json");
    await writeFile(planPath, JSON.stringify(plan));

    const refused = await proposeCodeMutation({
      project,
      projectBase: dir,
      developmentRoot: code,
      planPath,
      outDir: join(dir, "out"),
    });
    assert.equal(refused.status, "refused");
    assert.equal(refused.grantVerified, false);

    const issued = issueMutationGrant(
      {
        runId: "run-4",
        actor: "manager@example.com",
        planHash: plan.planHash,
        artifactSha256: "44".repeat(32),
        target: "code/",
        projectId: project.id,
      },
      { env: process.env },
    );
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const proposed = await proposeCodeMutation({
      project,
      projectBase: dir,
      developmentRoot: code,
      planPath,
      grant: issued.document,
      outDir: join(dir, "out2"),
      keepWorkspace: false,
    });
    assert.equal(proposed.status, "proposed");
    assert.equal(proposed.grantVerified, true);
    assert.ok(proposed.sourcePatchPath);
    const patch = JSON.parse(await readFile(proposed.sourcePatchPath!, "utf8"));
    assert.equal(patch.status, "proposed");
  } finally {
    if (prev === undefined) delete process.env.MUTATION_GRANT_HMAC_SECRET;
    else process.env.MUTATION_GRANT_HMAC_SECRET = prev;
    await rm(dir, { recursive: true, force: true });
  }
});

test("twin-probes autonom-cycle validates watches and summarizes evidence", () => {
  const cycle = validateAutonomCycle({
    schema: "subactor.autonom-cycle/v1",
    host: "twin-dsl",
    startedAt: "2026-08-06T12:00:00.000Z",
    finishedAt: "2026-08-06T12:00:01.000Z",
    results: [
      {
        id: "redup.duplication",
        ok: true,
        watches: ["src/runtime/autonomy.ts"],
        tags: ["duplication"],
        facts: { groups: "0" },
      },
      {
        id: "prefact.quality",
        ok: false,
        watches: ["src/cli/main.ts"],
        violations: [{ id: "complexity", detail: "function too complex" }],
        tags: ["quality"],
      },
    ],
  });
  const summary = summarizeProbeCycle(cycle);
  assert.equal(summary.probeCount, 2);
  assert.equal(summary.healthyCount, 1);
  assert.equal(summary.unhealthyCount, 1);
  assert.ok(summary.watchedPaths.includes("src/runtime/autonomy.ts"));
  assert.equal(summary.violationIds.length, 1);

  assert.throws(
    () =>
      validateAutonomCycle({
        schema: "subactor.autonom-cycle/v1",
        host: "x",
        startedAt: "2026-08-06T12:00:00.000Z",
        results: [{ id: "bad", ok: true, watches: [] }],
      }),
    /PROBE_RESULT_WATCHES_REQUIRED/,
  );
});
