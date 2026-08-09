import { canonicalJson, sha256 } from "../core/canonical.js";

export const PATCH_DSL_VERSION = "subactor.patch-dsl/v1";
export const LLM_CONTEXT_VERSION = "subactor.llm-context/v1";

export const patchEnvelopeSchema:Record<string,unknown> = {
  type:"object",
  properties:{
    schema:{const:"subactor.patch-envelope/v1"},
    patchDsl:{type:"string",minLength:100,maxLength:200000},
  },
  required:["schema","patchDsl"],
  additionalProperties:false,
};

/** GGML-compatible grammar for the string carried by patchEnvelopeSchema.patchDsl. */
export const patchDslGbnf = String.raw`root ::= header target base operation+ end
header ::= "PATCHDSL \"subactor.patch-dsl/v1\"" newline
target ::= "TARGET " json-string newline
base ::= "BASE_SHA256 \"" hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex hex "\"" newline
operation ::= ("SET " json-string " " json-value | "REMOVE " json-string) newline
end ::= "END_PATCH" newline?
json-value ::= object | array | json-string | number | "true" | "false" | "null"
object ::= "{" ws (json-string ws ":" ws json-value (ws "," ws json-string ws ":" ws json-value)*)? ws "}"
array ::= "[" ws (json-value (ws "," ws json-value)*)? ws "]"
json-string ::= "\"" ([^"\\] | "\\" (["\\/bfnrt] | "u" hex hex hex hex))* "\""
number ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)? ([eE] [+-]? [0-9]+)?
hex ::= [0-9a-f]
ws ::= [ \t]*
newline ::= "\n"`;

export type PatchOperation = {op:"set";path:string;value:unknown}|{op:"remove";path:string};
export interface ParsedPatch { target:string;baseSha256:string;operations:PatchOperation[]; }
export interface PatchEnvelope {schema:"subactor.patch-envelope/v1";patchDsl:string;}

function object(value:unknown,name:string):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(`${name}_OBJECT_REQUIRED`);
  return value as Record<string,unknown>;
}

export function validatePatchEnvelope(value:unknown):PatchEnvelope{
  const envelope=object(value,"PATCH_ENVELOPE");
  const keys=Object.keys(envelope);
  if(keys.length!==2||!keys.includes("schema")||!keys.includes("patchDsl"))throw new Error("PATCH_ENVELOPE_KEYS_INVALID");
  if(envelope.schema!=="subactor.patch-envelope/v1"||typeof envelope.patchDsl!=="string")throw new Error("PATCH_ENVELOPE_INVALID");
  return envelope as unknown as PatchEnvelope;
}

function jsonString(token:string,name:string):string{
  let value:unknown;
  try{value=JSON.parse(token);}catch{throw new Error(`${name}_JSON_STRING_INVALID`);}
  if(typeof value!=="string")throw new Error(`${name}_STRING_REQUIRED`);
  return value;
}

export function parsePatchDsl(text:string):ParsedPatch{
  if(text.includes("\r"))throw new Error("PATCH_CR_FORBIDDEN");
  const lines=text.trimEnd().split("\n");
  if(lines[0]!==`PATCHDSL ${JSON.stringify(PATCH_DSL_VERSION)}`)throw new Error("PATCH_HEADER_INVALID");
  if(lines.at(-1)!=="END_PATCH")throw new Error("PATCH_END_REQUIRED");
  const targetMatch=lines[1]?.match(/^TARGET ("(?:[^"\\]|\\.)*")$/);
  const baseMatch=lines[2]?.match(/^BASE_SHA256 "([a-f0-9]{64})"$/);
  if(!targetMatch)throw new Error("PATCH_TARGET_INVALID");
  if(!baseMatch)throw new Error("PATCH_BASE_HASH_INVALID");
  const operations:PatchOperation[]=[];
  for(const [index,line] of lines.slice(3,-1).entries()){
    const set=line.match(/^SET ("(?:[^"\\]|\\.)*") ([\s\S]+)$/);
    const remove=line.match(/^REMOVE ("(?:[^"\\]|\\.)*")$/);
    if(set){
      let value:unknown;
      try{value=JSON.parse(set[2]);}catch{throw new Error(`PATCH_VALUE_INVALID:${index + 4}`);}
      operations.push({op:"set",path:jsonString(set[1],"PATCH_PATH"),value});
    }else if(remove)operations.push({op:"remove",path:jsonString(remove[1],"PATCH_PATH")});
    else throw new Error(`PATCH_OPERATION_INVALID:${index + 4}`);
  }
  if(operations.length===0)throw new Error("PATCH_OPERATION_REQUIRED");
  if(operations.length>128)throw new Error("PATCH_OPERATION_LIMIT");
  return{target:jsonString(targetMatch[1],"PATCH_TARGET"),baseSha256:baseMatch[1],operations};
}

function pointer(path:string):string[]{
  if(!path.startsWith("/")||path==="/")throw new Error(`PATCH_POINTER_INVALID:${path}`);
  const parts=path.slice(1).split("/").map(part=>part.replace(/~1/g,"/").replace(/~0/g,"~"));
  if(parts.some(part=>part==="__proto__"||part==="prototype"||part==="constructor"))throw new Error("PATCH_POINTER_UNSAFE");
  if(parts.length>32)throw new Error("PATCH_POINTER_DEPTH");
  return parts;
}

function allowed(path:string,roots:readonly string[]):boolean{
  return roots.some(root=>path===root||path.startsWith(`${root}/`));
}

function parentAt(root:unknown,parts:string[]):{parent:Record<string,unknown>|unknown[];key:string}{
  let current:unknown=root;
  for(const part of parts.slice(0,-1)){
    if(!current||typeof current!=="object")throw new Error("PATCH_PARENT_MISSING");
    current=Array.isArray(current)?current[Number(part)]:(current as Record<string,unknown>)[part];
  }
  if(!current||typeof current!=="object")throw new Error("PATCH_PARENT_MISSING");
  return{parent:current as Record<string,unknown>|unknown[],key:parts.at(-1)!};
}

export function applyPatchDsl(base:unknown,patchText:string,options:{target:string;allowedRoots:readonly string[]}):unknown{
  const patch=parsePatchDsl(patchText);
  if(patch.target!==options.target)throw new Error(`PATCH_TARGET_MISMATCH:${patch.target}`);
  const expected=sha256(canonicalJson(base));
  if(patch.baseSha256!==expected)throw new Error("PATCH_BASE_HASH_MISMATCH");
  let result=structuredClone(base);
  for(const operation of patch.operations){
    if(!allowed(operation.path,options.allowedRoots))throw new Error(`PATCH_PATH_FORBIDDEN:${operation.path}`);
    const parts=pointer(operation.path);
    const {parent,key}=parentAt(result,parts);
    if(Array.isArray(parent)){
      if(!/^\d+$/.test(key))throw new Error(`PATCH_ARRAY_INDEX_INVALID:${key}`);
      const index=Number(key);
      if(operation.op==="set"){
        if(index>parent.length)throw new Error(`PATCH_ARRAY_INDEX_MISSING:${index}`);
        parent[index]=structuredClone(operation.value);
      }else{
        if(index>=parent.length)throw new Error(`PATCH_REMOVE_MISSING:${operation.path}`);
        parent.splice(index,1);
      }
    }else if(operation.op==="set")parent[key]=structuredClone(operation.value);
    else{
      if(!(key in parent))throw new Error(`PATCH_REMOVE_MISSING:${operation.path}`);
      delete parent[key];
    }
  }
  return result;
}

function line(name:string,value:unknown):string{return `${name} ${JSON.stringify(JSON.stringify(value))}`;}

export function renderPatchPolicy(target:string,targetSchema:Record<string,unknown>,instructions:string):string{
  return [
    `LLM_POLICY ${JSON.stringify("subactor.llm-policy/v1")}`,
    `TARGET ${JSON.stringify(target)}`,
    line("TARGET_SCHEMA_JSON",targetSchema),
    line("PATCH_ENVELOPE_SCHEMA_JSON",patchEnvelopeSchema),
    line("PATCH_GBNF",patchDslGbnf),
    `RULE ${JSON.stringify("Return only a JSON patch envelope validated by PATCH_ENVELOPE_SCHEMA_JSON.")}`,
    `RULE ${JSON.stringify("patchDsl must match PATCH_GBNF and may only transform the supplied BASE_JSON.")}`,
    `RULE ${JSON.stringify("Never emit a completed artifact outside patchDsl and never claim that a patch was applied.")}`,
    `DOMAIN_RULE ${JSON.stringify(instructions)}`,
    "END_POLICY",
  ].join("\n");
}

export function renderPatchContext(input:{target:string;request:string;base:unknown;context:unknown;allowedRoots:readonly string[]}):string{
  return [
    `LLM_CONTEXT ${JSON.stringify(LLM_CONTEXT_VERSION)}`,
    `TARGET ${JSON.stringify(input.target)}`,
    `BASE_SHA256 ${JSON.stringify(sha256(canonicalJson(input.base)))}`,
    line("BASE_JSON",input.base),
    line("REQUEST",input.request),
    line("RUNTIME_CONTEXT_JSON",input.context),
    line("ALLOWED_ROOTS_JSON",input.allowedRoots),
    `RULE ${JSON.stringify("Use the exact TARGET and BASE_SHA256 in patchDsl.")}`,
    "END_CONTEXT",
  ].join("\n");
}

export function renderPatchRepair(attempt:number,error:string):string{
  return [
    `LLM_REPAIR ${JSON.stringify("subactor.llm-repair/v1")}`,
    `ATTEMPT ${attempt}`,
    `VALIDATION_ERROR ${JSON.stringify(error.replace(/[\r\n]+/g," ").slice(0,300))}`,
    `RULE ${JSON.stringify("Return a corrected patch envelope under the unchanged schema and GBNF contract.")}`,
    "END_REPAIR",
  ].join("\n");
}
