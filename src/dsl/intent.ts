import type { IntentRecord } from "../core/types.js";
import { sha256 } from "../core/canonical.js";
export function validateT2cIntent(x:unknown):IntentRecord[]{ if(!Array.isArray(x))throw new Error('T2C_INTENT_ARRAY_REQUIRED');return x.map((v:any)=>{if(v.schema!=='t2c.intent/v1'||!v.type||!v.text)throw new Error('INVALID_T2C_INTENT');return v as IntentRecord;}); }
export function intentUri(i:IntentRecord):string{return `urn:subactor:intent:sha256:${sha256(i)}`;}
