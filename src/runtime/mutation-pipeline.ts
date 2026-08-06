/**
 * Propose-only (and gated apply) code mutation pipeline.
 *
 * Flow (from FULL_AUTONOMY_GAPS / 0.4.0 findings):
 *   todo2code diagnostics → code-change-plan → source-patch proposal
 *   → cryptographically signed grant → isolated worktree/container
 *   → (optional) apply with approval-hash → re-analysis → acceptance
 *
 * Default is propose-only. Apply never runs without verified grant + explicit
 * approval hash + project policy allowRuntimeSelfModification + autonomyMode apply.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  LivingProjectDocument,
  MutationProposalReceipt,
  SignedMutationGrant,
} from "../core/types.js";
import { canonicalJson, contentUri, sha256 } from "../core/canonical.js";
import { Todo2CodeAdapter } from "../adapters/todo2code.js";
import { createIsolatedWorkspace, type IsolatedWorkspace } from "./isolated-worktree.js";
import {
  consumeMutationGrantJti,
  loadAndVerifyMutationGrant,
  verifyMutationGrantDocument,
  type GrantVerifyResult,
} from "./mutation-grant.js";
import { appendJsonLine } from "./autonomy.js";

export interface MutationProposeInput {
  project: LivingProjectDocument;
  projectBase: string;
  developmentRoot: string;
  planPath?: string;
  plan?: unknown;
  outDir: string;
  grant?: SignedMutationGrant | unknown;
  actor?: string;
  keepWorkspace?: boolean;
  todo2code?: Todo2CodeAdapter;
}

export interface MutationApplyInput extends MutationProposeInput {
  sourcePatchPath: string;
  approvalHash: string;
  grant: SignedMutationGrant | unknown;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function planHashOf(plan: unknown): string {
  const data = object(plan);
  if (data && typeof data.planHash === "string" && data.planHash.trim()) return data.planHash;
  if (data && typeof data.id === "string" && typeof data.hash === "string") return data.hash;
  return sha256(canonicalJson(plan));
}

async function loadPlan(input: MutationProposeInput): Promise<unknown> {
  if (input.plan !== undefined) return input.plan;
  if (input.planPath) return JSON.parse(await readFile(resolve(input.planPath), "utf8"));
  throw new Error("MUTATION_PLAN_REQUIRED");
}

async function resolveGrant(
  input: MutationProposeInput,
  planHash: string,
): Promise<GrantVerifyResult> {
  if (input.grant) {
    return verifyMutationGrantDocument(input.grant, {
      projectId: input.project.id,
      planHash,
      actor: input.actor,
    });
  }
  return loadAndVerifyMutationGrant(input.project, input.projectBase, { planHash, actor: input.actor });
}

export async function proposeCodeMutation(input: MutationProposeInput): Promise<MutationProposalReceipt> {
  const startedAt = new Date().toISOString();
  const proposalId = randomUUID();
  const outDir = resolve(input.outDir);
  await mkdir(join(outDir, "mutations"), { recursive: true });

  if (input.project.policy.autonomyMode === "observe") {
    throw new Error("MUTATION_REFUSED_OBSERVE_MODE");
  }

  const plan = await loadPlan(input);
  const planHash = planHashOf(plan);
  const grantResult = await resolveGrant(input, planHash);

  const receiptBase: Omit<MutationProposalReceipt, "status" | "completedAt" | "workspace" | "sourcePatchUri" | "sourcePatchPath" | "failures" | "proposalUri" | "grantVerified"> = {
    schema: "subactor.mutation-proposal-receipt/v1",
    proposalId,
    projectId: input.project.id,
    mode: "propose",
    startedAt,
    planHash,
    grantJti: grantResult.ok ? grantResult.claims.jti : null,
    actor: input.actor ?? (grantResult.ok ? grantResult.claims.actor : "unknown"),
    developmentRoot: resolve(input.developmentRoot),
    stages: [],
  };

  if (!grantResult.ok) {
    const failed: MutationProposalReceipt = {
      ...receiptBase,
      status: "refused",
      grantVerified: false,
      completedAt: new Date().toISOString(),
      workspace: null,
      sourcePatchUri: null,
      sourcePatchPath: null,
      failures: [grantResult.error],
      stages: [{ name: "grant", status: "blocked", reason: grantResult.error }],
      proposalUri: "",
    };
    failed.proposalUri = contentUri("mutation-proposal", failed);
    await writeFile(join(outDir, "mutations", `${proposalId}.json`), JSON.stringify(failed, null, 2) + "\n");
    await appendJsonLine(join(outDir, "events.jsonl"), {
      eventType: "mutation.proposal.refused",
      occurredAt: failed.completedAt,
      proposalId,
      error: grantResult.error,
    });
    return failed;
  }

  let workspace: IsolatedWorkspace | null = null;
  const stages: MutationProposalReceipt["stages"] = [
    { name: "grant", status: "succeeded", reason: `jti=${grantResult.claims.jti}` },
  ];
  try {
    workspace = await createIsolatedWorkspace(input.developmentRoot, {
      label: input.project.id,
      parentDir: join(outDir, "mutations", "workspaces"),
    });
    stages.push({ name: "isolate", status: "succeeded", reason: workspace.kind });

    const adapter = input.todo2code ?? new Todo2CodeAdapter();
    const patchOut = join(outDir, "mutations", `${proposalId}.source-patch.json`);
    let sourcePatch: unknown = null;
    let sourcePatchPath: string | null = null;

    if (await adapter.available()) {
      const planFile = join(outDir, "mutations", `${proposalId}.plan.json`);
      await writeFile(planFile, JSON.stringify(plan, null, 2) + "\n");
      sourcePatch = await adapter.proposeSourcePatch(planFile, patchOut, { cwd: workspace.path });
      sourcePatchPath = patchOut;
      stages.push({ name: "propose-source-patch", status: "succeeded" });
    } else {
      // Deterministic local proposal when todo2code is not installed.
      sourcePatch = {
        schema: "t2c.code-change-source-patch/v1",
        status: "proposed",
        planHash,
        projectId: input.project.id,
        target: { root: workspace.path, paths: [] },
        edits: [],
        note: "TODO2CODE_NOT_AVAILABLE: structured empty proposal; install semcod/todo2code for real patches",
        patchHash: sha256(canonicalJson({ planHash, projectId: input.project.id })),
      };
      await writeFile(patchOut, JSON.stringify(sourcePatch, null, 2) + "\n");
      sourcePatchPath = patchOut;
      stages.push({ name: "propose-source-patch", status: "succeeded", reason: "local-empty-proposal" });
    }

    const completedAt = new Date().toISOString();
    const receipt: MutationProposalReceipt = {
      ...receiptBase,
      status: "proposed",
      grantVerified: true,
      completedAt,
      workspace: {
        kind: workspace.kind,
        path: workspace.path,
        branch: workspace.branch,
      },
      sourcePatchUri: contentUri("source-patch", sourcePatch),
      sourcePatchPath,
      failures: [],
      stages,
      proposalUri: "",
    };
    receipt.proposalUri = contentUri("mutation-proposal", receipt);
    await writeFile(join(outDir, "mutations", `${proposalId}.json`), JSON.stringify(receipt, null, 2) + "\n");
    await writeFile(join(outDir, "mutations", "latest.json"), JSON.stringify({ proposalId, proposalUri: receipt.proposalUri, status: receipt.status }, null, 2) + "\n");
    await appendJsonLine(join(outDir, "events.jsonl"), {
      eventType: "mutation.proposal.created",
      occurredAt: completedAt,
      proposalId,
      planHash,
      grantJti: grantResult.claims.jti,
      sourcePatchUri: receipt.sourcePatchUri,
    });
    return receipt;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stages.push({ name: "propose-source-patch", status: "failed", reason: message });
    const failed: MutationProposalReceipt = {
      ...receiptBase,
      status: "failed",
      grantVerified: true,
      completedAt: new Date().toISOString(),
      workspace: workspace ? { kind: workspace.kind, path: workspace.path, branch: workspace.branch } : null,
      sourcePatchUri: null,
      sourcePatchPath: null,
      failures: [message],
      stages,
      proposalUri: "",
    };
    failed.proposalUri = contentUri("mutation-proposal", failed);
    await writeFile(join(outDir, "mutations", `${proposalId}.json`), JSON.stringify(failed, null, 2) + "\n");
    throw error;
  } finally {
    if (workspace && !input.keepWorkspace) {
      try {
        await workspace.dispose();
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/**
 * Apply is intentionally separate and fail-closed.
 * Requires: autonomyMode=apply, allowRuntimeSelfModification, verified grant, approval hash.
 */
export async function applyCodeMutation(input: MutationApplyInput): Promise<MutationProposalReceipt> {
  if (input.project.policy.autonomyMode !== "apply") throw new Error("MUTATION_APPLY_REQUIRES_APPLY_MODE");
  if (!input.project.policy.allowRuntimeSelfModification) throw new Error("MUTATION_APPLY_SELF_MODIFICATION_DISABLED");
  if (!input.approvalHash?.trim()) throw new Error("MUTATION_APPLY_APPROVAL_HASH_REQUIRED");

  const plan = await loadPlan(input);
  const planHash = planHashOf(plan);
  const grantResult = await resolveGrant({ ...input, grant: input.grant }, planHash);
  if (!grantResult.ok) throw new Error(`MUTATION_APPLY_GRANT_INVALID:${grantResult.error}`);

  const jtiDir = join(resolve(input.outDir), "mutations", "jti");
  const consumed = await consumeMutationGrantJti(grantResult.claims.jti, grantResult.claims.expires_at, jtiDir);
  if (!consumed.ok) throw new Error(`MUTATION_APPLY_GRANT_CONSUME:${consumed.error}`);

  const adapter = input.todo2code ?? new Todo2CodeAdapter();
  if (!(await adapter.available())) throw new Error("MUTATION_APPLY_TODO2CODE_REQUIRED");

  const workspace = await createIsolatedWorkspace(input.developmentRoot, {
    label: `${input.project.id}-apply`,
    parentDir: join(resolve(input.outDir), "mutations", "workspaces"),
  });
  const applyId = randomUUID();
  try {
    const receiptPath = join(resolve(input.outDir), "mutations", `${applyId}.apply.receipt.json`);
    await adapter.applySourcePatch(resolve(input.sourcePatchPath), {
      actor: input.actor ?? grantResult.claims.actor,
      approvalHash: input.approvalHash,
      receiptPath,
      cwd: workspace.path,
    });
    const completedAt = new Date().toISOString();
    const receipt: MutationProposalReceipt = {
      schema: "subactor.mutation-proposal-receipt/v1",
      proposalId: applyId,
      projectId: input.project.id,
      mode: "apply",
      status: "applied-isolated",
      startedAt: new Date().toISOString(),
      completedAt,
      planHash,
      grantVerified: true,
      grantJti: grantResult.claims.jti,
      actor: input.actor ?? grantResult.claims.actor,
      developmentRoot: resolve(input.developmentRoot),
      workspace: { kind: workspace.kind, path: workspace.path, branch: workspace.branch },
      sourcePatchUri: contentUri("source-patch-path", { path: input.sourcePatchPath }),
      sourcePatchPath: resolve(input.sourcePatchPath),
      failures: [],
      stages: [
        { name: "grant", status: "succeeded", reason: "consumed" },
        { name: "isolate", status: "succeeded", reason: workspace.kind },
        { name: "apply-source-patch", status: "succeeded", reason: receiptPath },
      ],
      proposalUri: "",
    };
    receipt.proposalUri = contentUri("mutation-proposal", receipt);
    await mkdir(dirname(join(resolve(input.outDir), "mutations", `${applyId}.json`)), { recursive: true });
    await writeFile(join(resolve(input.outDir), "mutations", `${applyId}.json`), JSON.stringify(receipt, null, 2) + "\n");
    await appendJsonLine(join(resolve(input.outDir), "events.jsonl"), {
      eventType: "mutation.apply.isolated",
      occurredAt: completedAt,
      proposalId: applyId,
      workspace: receipt.workspace,
      note: "Applied only inside isolated workspace; promotion/canary not performed",
    });
    return receipt;
  } finally {
    if (!input.keepWorkspace) {
      try {
        await workspace.dispose();
      } catch {
        /* best-effort */
      }
    }
  }
}
