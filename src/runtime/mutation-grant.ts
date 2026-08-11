/**
 * Cryptographic signed mutation grants for twin-dsl.
 *
 * Ported from subactor/runtime apply-grant (ADR-003): compact HS256 token
 * base64url(header).base64url(payload).base64url(sig) with canonical claims.
 *
 * Document envelope remains subactor.signed-mutation-grant/v1 so existing
 * projectDSL POLICY_MUTATION_GRANT_FILE paths keep working; the signature
 * field is now a real HMAC rather than a free-form placeholder.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { LivingProjectDocument, SignedMutationGrant } from "../core/types.js";
import { canonicalJson, sha256 } from "../core/canonical.js";

export const MUTATION_GRANT_ALG = "HS256";
export const MUTATION_GRANT_TYP = "mutation-grant";
export const DEFAULT_TTL_SECONDS = 15 * 60;
export const MAX_TTL_SECONDS = 60 * 60;
export const CLOCK_SKEW_SECONDS = 60;
export const RISK_CLASSES = ["read_only", "reversible", "boundary", "governance"] as const;
export type MutationRiskClass = (typeof RISK_CLASSES)[number];

const CLAIM_KEYS = [
  "run_id",
  "actor",
  "intent_pack",
  "plan_hash",
  "artifact_sha256",
  "target",
  "project_id",
  "expires_at",
  "risk_class",
  "jti",
  "iat",
] as const;

export type MutationGrantClaims = Record<(typeof CLAIM_KEYS)[number], string>;

export interface IssueMutationGrantInput {
  runId: string;
  actor: string;
  intentPack?: string;
  planHash: string;
  artifactSha256: string;
  target: string;
  projectId: string;
  riskClass?: MutationRiskClass;
  ttlSeconds?: number;
  jti?: string;
}

export type GrantVerifyResult =
  | { ok: true; claims: MutationGrantClaims; document: SignedMutationGrant }
  | { ok: false; error: string; claims?: MutationGrantClaims };

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}
function b64urlJson(value: unknown): string {
  return b64url(Buffer.from(JSON.stringify(value), "utf8"));
}
function parseB64urlJson(part: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function resolveMutationGrantSecrets(env: NodeJS.ProcessEnv = process.env): {
  primary: string | null;
  next: string | null;
  source: string | null;
} {
  const primary = String(env.MUTATION_GRANT_HMAC_SECRET || env.APPLY_GRANT_HMAC_SECRET || env.TOKEN_PEPPER || "").trim();
  const next = String(env.MUTATION_GRANT_HMAC_SECRET_NEXT || env.APPLY_GRANT_HMAC_SECRET_NEXT || "").trim();
  return {
    primary: primary || null,
    next: next || null,
    source: env.MUTATION_GRANT_HMAC_SECRET
      ? "MUTATION_GRANT_HMAC_SECRET"
      : env.APPLY_GRANT_HMAC_SECRET
        ? "APPLY_GRANT_HMAC_SECRET"
        : env.TOKEN_PEPPER
          ? "TOKEN_PEPPER"
          : null,
  };
}

export function canonicalGrantClaims(input: Partial<Record<string, unknown>> = {}): MutationGrantClaims {
  const claims = {} as MutationGrantClaims;
  for (const key of CLAIM_KEYS) claims[key] = String(input[key] ?? "");
  return claims;
}

export function signingPayload(claims: MutationGrantClaims): string {
  return JSON.stringify(canonicalGrantClaims(claims));
}

function signHs256(secret: string, signingInput: string): Buffer {
  return createHmac("sha256", secret).update(signingInput, "utf8").digest();
}

function safeEqualBuf(a: Buffer, b: Buffer): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function issueMutationGrant(
  input: IssueMutationGrantInput,
  options: { now?: number; env?: NodeJS.ProcessEnv } = {},
): { ok: true; document: SignedMutationGrant; claims: MutationGrantClaims } | { ok: false; error: string } {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const secrets = resolveMutationGrantSecrets(env);
  if (!secrets.primary) return { ok: false, error: "mutation_grant_secret_missing" };

  const ttl = Number(input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(ttl) || ttl <= 0) return { ok: false, error: "mutation_grant_ttl_invalid" };
  if (ttl > MAX_TTL_SECONDS) return { ok: false, error: "mutation_grant_ttl_exceeds_max" };

  const risk = (input.riskClass ?? "reversible") as string;
  if (!RISK_CLASSES.includes(risk as MutationRiskClass)) return { ok: false, error: "mutation_grant_risk_class_invalid" };

  const required: Record<string, string> = {
    run_id: input.runId,
    actor: input.actor,
    plan_hash: input.planHash,
    artifact_sha256: input.artifactSha256,
    target: input.target,
    project_id: input.projectId,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!String(value || "").trim()) return { ok: false, error: `mutation_grant_field_required:${key}` };
  }

  const iatMs = now;
  const expMs = iatMs + Math.floor(ttl * 1000);
  const claims = canonicalGrantClaims({
    ...required,
    intent_pack: input.intentPack ?? "subactor.digital-twin-runtime/v1",
    expires_at: new Date(expMs).toISOString(),
    risk_class: risk,
    jti: input.jti ?? randomBytes(16).toString("base64url"),
    iat: new Date(iatMs).toISOString(),
  });

  const header = { alg: MUTATION_GRANT_ALG, typ: MUTATION_GRANT_TYP };
  const signingInput = `${b64urlJson(header)}.${b64url(Buffer.from(signingPayload(claims), "utf8"))}`;
  const sig = signHs256(secrets.primary, signingInput);
  const token = `${signingInput}.${b64url(sig)}`;

  const document: SignedMutationGrant = {
    schema: "subactor.signed-mutation-grant/v1",
    projectId: claims.project_id,
    planHash: claims.plan_hash,
    artifactSha256: claims.artifact_sha256,
    target: claims.target,
    actor: claims.actor,
    riskClass: claims.risk_class as MutationRiskClass,
    jti: claims.jti,
    iat: claims.iat,
    expiresAt: claims.expires_at,
    runId: claims.run_id,
    intentPack: claims.intent_pack,
    signature: token,
    grantHash: sha256(canonicalJson({ schema: "subactor.signed-mutation-grant/v1", claims })),
  };
  return { ok: true, document, claims };
}

export function verifyMutationGrantToken(
  token: string,
  expected: {
    planHash?: string;
    target?: string;
    actor?: string;
    projectId?: string;
    artifactSha256?: string;
    now?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
): { ok: true; claims: MutationGrantClaims } | { ok: false; error: string; claims?: MutationGrantClaims } {
  const env = expected.env ?? process.env;
  const now = expected.now ?? Date.now();
  const secrets = resolveMutationGrantSecrets(env);
  if (!secrets.primary && !secrets.next) return { ok: false, error: "mutation_grant_secret_missing" };

  const raw = String(token || "").trim();
  if (!raw) return { ok: false, error: "mutation_grant_required" };
  const parts = raw.split(".");
  if (parts.length !== 3) return { ok: false, error: "mutation_grant_signature_invalid" };
  const [headerPart, payloadPart, sigPart] = parts;
  const header = parseB64urlJson(headerPart);
  if (!header || header.alg !== MUTATION_GRANT_ALG) return { ok: false, error: "mutation_grant_signature_invalid" };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "mutation_grant_signature_invalid" };
  }
  const claims = canonicalGrantClaims(parsed);
  for (const key of CLAIM_KEYS) {
    if (String(parsed[key] ?? "") !== claims[key]) return { ok: false, error: "mutation_grant_signature_invalid" };
  }

  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigPart, "base64url");
  } catch {
    return { ok: false, error: "mutation_grant_signature_invalid" };
  }
  const signingInput = `${headerPart}.${payloadPart}`;
  const matched = [secrets.primary, secrets.next].filter(Boolean).some((secret) => safeEqualBuf(signHs256(secret!, signingInput), sigBuf));
  if (!matched) return { ok: false, error: "mutation_grant_signature_invalid" };

  const expMs = Date.parse(claims.expires_at);
  if (!Number.isFinite(expMs)) return { ok: false, error: "mutation_grant_signature_invalid" };
  if (now > expMs + CLOCK_SKEW_SECONDS * 1000) return { ok: false, error: "mutation_grant_expired", claims };

  if (expected.planHash && expected.planHash.toLowerCase() !== claims.plan_hash.toLowerCase()) {
    return { ok: false, error: "mutation_grant_plan_hash_mismatch", claims };
  }
  if (expected.target && expected.target !== claims.target) return { ok: false, error: "mutation_grant_target_mismatch", claims };
  if (expected.artifactSha256 && expected.artifactSha256.toLowerCase() !== claims.artifact_sha256.toLowerCase()) {
    return { ok: false, error: "mutation_grant_artifact_mismatch", claims };
  }
  if (expected.actor && expected.actor !== claims.actor) return { ok: false, error: "mutation_grant_actor_mismatch", claims };
  if (expected.projectId && expected.projectId !== claims.project_id) return { ok: false, error: "mutation_grant_project_mismatch", claims };
  if (!RISK_CLASSES.includes(claims.risk_class as MutationRiskClass) || !claims.jti) {
    return { ok: false, error: "mutation_grant_signature_invalid", claims };
  }
  return { ok: true, claims };
}

export function verifyMutationGrantDocument(
  document: unknown,
  expected: {
    planHash?: string;
    target?: string;
    actor?: string;
    projectId?: string;
    artifactSha256?: string;
    now?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
): GrantVerifyResult {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { ok: false, error: "mutation_grant_document_invalid" };
  }
  const data = document as Record<string, unknown>;
  if (data.schema !== "subactor.signed-mutation-grant/v1") return { ok: false, error: "mutation_grant_schema_invalid" };
  if (typeof data.signature !== "string") return { ok: false, error: "mutation_grant_signature_missing" };

  const verified = verifyMutationGrantToken(data.signature, {
    ...expected,
    projectId: expected.projectId ?? (typeof data.projectId === "string" ? data.projectId : undefined),
    planHash: expected.planHash ?? (typeof data.planHash === "string" ? data.planHash : undefined),
  });
  if (!verified.ok) return verified;

  // Envelope fields must match signed claims (fail-closed against tampered JSON shell).
  const checks: Array<[string, string | undefined, string]> = [
    ["projectId", typeof data.projectId === "string" ? data.projectId : undefined, verified.claims.project_id],
    ["planHash", typeof data.planHash === "string" ? data.planHash : undefined, verified.claims.plan_hash],
    ["expiresAt", typeof data.expiresAt === "string" ? data.expiresAt : undefined, verified.claims.expires_at],
  ];
  for (const [name, actual, claim] of checks) {
    if (actual !== undefined && actual !== claim) return { ok: false, error: `mutation_grant_envelope_mismatch:${name}`, claims: verified.claims };
  }

  const signed: SignedMutationGrant = {
    schema: "subactor.signed-mutation-grant/v1",
    projectId: verified.claims.project_id,
    planHash: verified.claims.plan_hash,
    artifactSha256: verified.claims.artifact_sha256,
    target: verified.claims.target,
    actor: verified.claims.actor,
    riskClass: verified.claims.risk_class as MutationRiskClass,
    jti: verified.claims.jti,
    iat: verified.claims.iat,
    expiresAt: verified.claims.expires_at,
    runId: verified.claims.run_id,
    intentPack: verified.claims.intent_pack,
    signature: data.signature,
    grantHash: typeof data.grantHash === "string" ? data.grantHash : sha256(canonicalJson({ claims: verified.claims })),
  };
  return { ok: true, claims: verified.claims, document: signed };
}

/** Single-use jti store (file-backed). Second consume fails closed. */
export async function consumeMutationGrantJti(
  jti: string,
  expiresAt: string,
  storeDir: string,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!jti || jti.length < 8) return { ok: false, error: "mutation_grant_jti_invalid" };
  await mkdir(storeDir, { recursive: true });
  const path = join(storeDir, `${sha256(jti)}.json`);
  try {
    await readFile(path, "utf8");
    return { ok: false, error: "mutation_grant_replay" };
  } catch {
    /* first use */
  }
  const expMs = Date.parse(expiresAt);
  if (!Number.isFinite(expMs) || now > expMs + CLOCK_SKEW_SECONDS * 1000) {
    return { ok: false, error: "mutation_grant_expired" };
  }
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify({ jti, expiresAt, consumedAt: new Date(now).toISOString() }) + "\n");
  } finally {
    await handle.close();
  }
  return { ok: true };
}

export async function loadAndVerifyMutationGrant(
  project: LivingProjectDocument,
  base: string,
  options: { planHash?: string; target?: string; actor?: string; artifactSha256?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<GrantVerifyResult> {
  if (!project.policy.mutationGrantFile) return { ok: false, error: "mutation_grant_file_not_configured" };
  try {
    const path = resolve(base, project.policy.mutationGrantFile);
    const data = JSON.parse(await readFile(path, "utf8")) as unknown;
    return verifyMutationGrantDocument(data, {
      projectId: project.id,
      planHash: options.planHash,
      target: options.target,
      actor: options.actor,
      artifactSha256: options.artifactSha256,
      env: options.env,
    });
  } catch {
    return { ok: false, error: "mutation_grant_unreadable" };
  }
}

export async function writeMutationGrant(path: string, document: SignedMutationGrant): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(document, null, 2) + "\n", { mode: 0o600 });
}
