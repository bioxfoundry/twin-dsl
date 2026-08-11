import type { IntentRecord } from "../core/types.js";
import { sha256 } from "../core/canonical.js";
const TYPES=new Set(["request","plan","decision","message","report","result","claim"]);
const KEYS=new Set(["schema","id","type","text","actor","ticket","targetUris","source"]);
const SOURCE_KEYS=new Set([
  "artifactUri","revisionHash","fragment","page","lines","bbox","blockId","artifactId",
  "artifactUrn","evidenceArtifactIds","evidenceArtifactUrns","converter","converterVersion",
]);
function stringArray(value:unknown):value is string[]{
  return Array.isArray(value)&&value.every(item=>typeof item==="string");
}
function record(value:unknown,index:number):IntentRecord {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(`INVALID_T2C_INTENT:${index}`);
  const item=value as Record<string,unknown>;
  if(Object.keys(item).some(key=>!KEYS.has(key)))throw new Error(`INVALID_T2C_INTENT_KEYS:${index}`);
  if(item.schema!=="t2c.intent/v1"||typeof item.id!=="string"||!item.id||
    typeof item.type!=="string"||!TYPES.has(item.type)||typeof item.text!=="string"||!item.text.trim()||
    typeof item.actor!=="string"||!item.actor.trim()||!Array.isArray(item.targetUris)||!item.targetUris.length||
    !item.targetUris.every(target=>typeof target==="string"&&target.trim().length>0))throw new Error(`INVALID_T2C_INTENT:${index}`);
  if(item.ticket!==undefined&&typeof item.ticket!=="string")throw new Error(`INVALID_T2C_INTENT_TICKET:${index}`);
  if(item.source!==undefined) {
    if(!item.source||typeof item.source!=="object"||Array.isArray(item.source))throw new Error(`INVALID_T2C_INTENT_SOURCE:${index}`);
    const source=item.source as Record<string,unknown>;
    const invalid = Object.keys(source).some(key=>!SOURCE_KEYS.has(key))||
      typeof source.artifactUri!=="string"||!source.artifactUri||
      typeof source.revisionHash!=="string"||!source.revisionHash||
      typeof source.converter!=="string"||!source.converter||
      typeof source.converterVersion!=="string"||!source.converterVersion||
      (source.fragment!==undefined&&typeof source.fragment!=="string")||
      (source.page!==undefined&&(!Number.isInteger(source.page)||Number(source.page)<1))||
      (source.lines!==undefined&&(!Array.isArray(source.lines)||source.lines.length!==2||
        !source.lines.every(line=>Number.isInteger(line)&&Number(line)>=1)))||
      (source.bbox!==undefined&&(!Array.isArray(source.bbox)||source.bbox.length!==4||
        !source.bbox.every(coordinate=>typeof coordinate==="number"&&Number.isFinite(coordinate))))||
      [source.blockId,source.artifactId,source.artifactUrn].some(field=>field!==undefined&&typeof field!=="string")||
      (source.evidenceArtifactIds!==undefined&&!stringArray(source.evidenceArtifactIds))||
      (source.evidenceArtifactUrns!==undefined&&!stringArray(source.evidenceArtifactUrns));
    if(invalid)throw new Error(`INVALID_T2C_INTENT_SOURCE:${index}`);
  }
  return item as unknown as IntentRecord;
}
export function validateT2cIntent(value:unknown):IntentRecord[]{
  if(!Array.isArray(value)||!value.length)throw new Error("T2C_INTENT_ARRAY_REQUIRED");
  const records=value.map(record);
  if(new Set(records.map(item=>item.id)).size!==records.length)throw new Error("T2C_INTENT_ID_DUPLICATE");
  return records;
}
export function intentUri(i:IntentRecord):string{return `urn:subactor:intent:sha256:${sha256(i)}`;}
