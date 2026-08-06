import type { ImprovementAction, ImprovementPlan } from "../core/types.js";
import { lines, list, unquote } from "./parser-util.js";

const KINDS: ImprovementAction["kind"][] = ["research", "development", "runtime", "policy", "validation", "deployment"];

function bool(value:string):boolean {
  if(value === "true") return true;
  if(value === "false") return false;
  throw new Error(`IMPROVEMENT_BOOL_INVALID:${value}`);
}

export function parseImprovementDsl(source:string):ImprovementPlan {
  const input = lines(source);
  const header = input.shift()?.match(/^IMPROVEMENT\s+(\S+)$/i);
  if(!header) throw new Error("IMPROVEMENT_HEADER_REQUIRED");
  const document:Partial<ImprovementPlan> = {
    schema:"subactor.improvement-plan/v1",
    id:header[1],
    mode:"propose_only",
    sourceIterationUri:null,
    evidenceUris:[],
    actions:[],
  };
  for(const line of input) {
    const [key, ...rest] = line.split(/\s+/);
    const raw = rest.join(" ");
    if(key === "PROJECT") document.projectId = unquote(raw);
    else if(key === "GENERATED_AT") document.generatedAt = unquote(raw);
    else if(key === "SOURCE_ITERATION") document.sourceIterationUri = raw === "null" ? null : unquote(raw);
    else if(key === "EVIDENCE") document.evidenceUris = list(raw);
    else if(key === "ACTION") {
      const match = raw.match(/^(\S+)\s+KIND\s+(\S+)\s+APPROVAL\s+(true|false)\s+TARGETS\s+(\[[\s\S]*?\])\s+TITLE\s+("(?:\\.|[^"])*")\s+REASON\s+("(?:\\.|[^"])*")$/);
      if(!match) throw new Error(`IMPROVEMENT_ACTION_INVALID:${line}`);
      const [, id, kind, approval, targets, title, reason] = match;
      if(!KINDS.includes(kind as ImprovementAction["kind"])) throw new Error(`IMPROVEMENT_ACTION_KIND_INVALID:${kind}`);
      document.actions!.push({id,kind:kind as ImprovementAction["kind"],approvalRequired:bool(approval),targetUris:list(targets),title:unquote(title),reason:unquote(reason),status:"proposed"});
    } else throw new Error(`IMPROVEMENT_UNKNOWN_KEY:${key}`);
  }
  return validateImprovement(document);
}

export function renderImprovementDsl(document:ImprovementPlan):string {
  validateImprovement(document);
  const output = [
    `IMPROVEMENT ${document.id}`,
    `PROJECT ${JSON.stringify(document.projectId)}`,
    `GENERATED_AT ${JSON.stringify(document.generatedAt)}`,
    `SOURCE_ITERATION ${document.sourceIterationUri ? JSON.stringify(document.sourceIterationUri) : "null"}`,
    `EVIDENCE [${document.evidenceUris.map(value=>JSON.stringify(value)).join(", ")}]`,
  ];
  for(const action of document.actions) {
    output.push(`ACTION ${action.id} KIND ${action.kind} APPROVAL ${action.approvalRequired} TARGETS [${action.targetUris.map(value=>JSON.stringify(value)).join(", ")}] TITLE ${JSON.stringify(action.title)} REASON ${JSON.stringify(action.reason)}`);
  }
  return output.join("\n") + "\n";
}

export function validateImprovement(value:unknown):ImprovementPlan {
  if(!value || typeof value !== "object" || Array.isArray(value)) throw new Error("IMPROVEMENT_DOCUMENT_REQUIRED");
  const document = value as Record<string,unknown>;
  const allowed = ["schema","id","projectId","mode","generatedAt","sourceIterationUri","evidenceUris","actions"];
  for(const key of Object.keys(document)) if(!allowed.includes(key)) throw new Error(`IMPROVEMENT_UNKNOWN_KEY:${key}`);
  if(document.schema !== "subactor.improvement-plan/v1" || typeof document.id !== "string" || typeof document.projectId !== "string" || document.mode !== "propose_only" || typeof document.generatedAt !== "string" || !Array.isArray(document.evidenceUris) || !document.evidenceUris.every(item=>typeof item === "string") || !Array.isArray(document.actions)) throw new Error("IMPROVEMENT_DOCUMENT_INVALID");
  const ids = new Set<string>();
  for(const raw of document.actions) {
    if(!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("IMPROVEMENT_ACTION_INVALID");
    const action = raw as Record<string,unknown>;
    const actionAllowed = ["id","kind","title","reason","targetUris","approvalRequired","status"];
    for(const key of Object.keys(action)) if(!actionAllowed.includes(key)) throw new Error(`IMPROVEMENT_ACTION_UNKNOWN_KEY:${key}`);
    if(typeof action.id !== "string" || ids.has(action.id) || !KINDS.includes(action.kind as ImprovementAction["kind"]) || typeof action.title !== "string" || typeof action.reason !== "string" || !Array.isArray(action.targetUris) || !action.targetUris.every(item=>typeof item === "string") || typeof action.approvalRequired !== "boolean" || action.status !== "proposed") throw new Error("IMPROVEMENT_ACTION_INVALID");
    ids.add(action.id);
  }
  return value as ImprovementPlan;
}
