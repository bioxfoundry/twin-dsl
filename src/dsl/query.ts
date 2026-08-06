import type { QueryContract, ResultKind } from "../core/types.js";
import { canonicalJson, sha256 } from "../core/canonical.js";
import { assertProcessUri } from "../core/uri.js";
import { kv, lines, list, unquote } from "./parser-util.js";

export function parseQueryDsl(source: string): QueryContract {
  const xs = lines(source);
  if (!xs[0]?.startsWith("QUERY ")) throw new Error("QUERY_HEADER_REQUIRED");
  const id = xs[0].slice(6).trim();
  let intentUri = "";
  let processUri = "";
  let snapshot = "";
  let kind: ResultKind = "text";
  let resultUriTemplate = "";
  const sourceUris: string[] = [];
  const validations: string[] = [];
  const filters: QueryContract["filters"] = [];
  for (const line of xs.slice(1)) {
    const [key, value] = kv(line);
    if (key === "INTENT") intentUri = unquote(value);
    else if (key === "PROCESS") processUri = unquote(value);
    else if (key === "SOURCES") sourceUris.push(...list(value));
    else if (key === "SNAPSHOT") snapshot = unquote(value);
    else if (key === "RETURN") kind = unquote(value) as ResultKind;
    else if (key === "RESULT_URI") resultUriTemplate = unquote(value);
    else if (key === "VALIDATE") validations.push(...list(value));
    else if (key === "FILTER") {
      const match = value.match(/^(\S+)\s+(contains|equals|prefix|regex)\s+(.+)$/i);
      if (!match) throw new Error(`BAD_FILTER:${value}`);
      filters.push({ field: match[1], operator: match[2].toLowerCase() as QueryContract["filters"][number]["operator"], value: unquote(match[3]) });
    }
  }
  assertProcessUri(processUri);
  const raw = {
    schema: "subactor.query/v1" as const,
    id,
    intentUri,
    processUri,
    sourceUris,
    sourceSnapshotHash: snapshot,
    filters,
    expectedResultKind: kind,
    resultUriTemplate,
    validations,
  };
  return { ...raw, canonicalHash: sha256(canonicalJson(raw)) };
}

export function renderQueryDsl(query: QueryContract): string {
  return [
    `QUERY ${query.id}`,
    `INTENT ${query.intentUri}`,
    `PROCESS ${query.processUri}`,
    `SOURCES [${query.sourceUris.join(", ")}]`,
    `SNAPSHOT ${query.sourceSnapshotHash}`,
    ...query.filters.map((f) => `FILTER ${f.field} ${f.operator} "${f.value}"`),
    `RETURN ${query.expectedResultKind}`,
    `RESULT_URI ${query.resultUriTemplate}`,
    `VALIDATE [${query.validations.join(", ")}]`,
  ].join("\n");
}
