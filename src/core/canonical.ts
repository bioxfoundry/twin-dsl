import { createHash } from "node:crypto";
function norm(v: unknown): unknown {
  if (typeof v === "bigint") return `${v.toString()}n`;
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,norm(x)]));
  return v;
}
export function canonicalJson(v: unknown): string { return JSON.stringify(norm(v)); }
export function sha256(v: unknown): string { return createHash("sha256").update(typeof v === "string" ? v : canonicalJson(v)).digest("hex"); }
export function contentUri(kind: string, v: unknown): string { return `urn:subactor:${kind}:sha256:${sha256(v)}`; }
