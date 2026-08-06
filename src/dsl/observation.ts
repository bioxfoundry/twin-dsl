import type { MathValue, ObservationDocument, ObservationRecord } from "../core/types.js";
import { lines, unquote } from "./parser-util.js";

function parseValue(raw:string):MathValue{
  const v=raw.trim();
  if(v==='true')return true;if(v==='false')return false;
  if(/^[-+]?\d+(?:\.\d+)?$/.test(v))return Number(v);
  if(/^\{.*\}$/.test(v)){const parsed=JSON.parse(v) as unknown;if(parsed&&typeof parsed==='object'&&'numerator'in parsed&&'denominator'in parsed)return parsed as MathValue;}
  return unquote(v);
}
function csv(raw:string):string[]{return raw.split(',').map(x=>unquote(x.trim())).filter(Boolean);}
export function parseObservationDsl(source:string):ObservationDocument{
  const xs=lines(source);const header=xs.shift();if(!header?.startsWith('OBSERVATIONS '))throw new Error('OBSERVATIONS_HEADER_REQUIRED');
  const [,id,snapshot]=header.match(/^OBSERVATIONS\s+(\S+)\s+SNAPSHOT\s+([a-f0-9]{64})$/i)??[];
  if(!id||!snapshot)throw new Error('OBSERVATIONS_HEADER_INVALID');
  const observations:ObservationRecord[]=[];let current:Partial<ObservationRecord>|undefined;
  for(const line of xs){
    if(line.startsWith('OBSERVATION ')){if(current)throw new Error('OBSERVATION_END_REQUIRED');current={id:line.slice('OBSERVATION '.length).trim(),labels:[],sourceUris:[]};continue;}
    if(line==='END'){if(!current)throw new Error('OBSERVATION_NOT_STARTED');const required=['id','observedAt','subjectUri','metric','value','severity'] as const;for(const key of required)if(current[key]===undefined)throw new Error(`OBSERVATION_MISSING:${key}`);observations.push(current as ObservationRecord);current=undefined;continue;}
    if(!current)throw new Error(`OBSERVATION_LINE_OUTSIDE:${line}`);
    const i=line.indexOf(' ');if(i<0)throw new Error(`OBSERVATION_KEY_VALUE_REQUIRED:${line}`);const key=line.slice(0,i).toUpperCase(),raw=line.slice(i+1).trim();
    if(key==='AT')current.observedAt=unquote(raw);
    else if(key==='SUBJECT')current.subjectUri=unquote(raw);
    else if(key==='METRIC')current.metric=unquote(raw);
    else if(key==='VALUE')current.value=parseValue(raw);
    else if(key==='UNIT')current.unit=unquote(raw);
    else if(key==='SEVERITY'){if(!['debug','info','warning','error','critical'].includes(raw))throw new Error('OBSERVATION_SEVERITY_INVALID');current.severity=raw as ObservationRecord['severity'];}
    else if(key==='SOURCES')current.sourceUris=csv(raw);
    else if(key==='LABELS')current.labels=csv(raw);
    else throw new Error(`OBSERVATION_UNKNOWN_KEY:${key}`);
  }
  if(current)throw new Error('OBSERVATION_END_REQUIRED');
  return validateObservation({schema:'subactor.observation/v1',id,sourceSnapshotHash:snapshot,observations});
}
export function renderObservationDsl(doc:ObservationDocument):string{
  validateObservation(doc);const out=[`OBSERVATIONS ${doc.id} SNAPSHOT ${doc.sourceSnapshotHash}`];
  for(const o of doc.observations){out.push(`OBSERVATION ${o.id}`,`AT ${JSON.stringify(o.observedAt)}`,`SUBJECT ${o.subjectUri}`,`METRIC ${JSON.stringify(o.metric)}`,`VALUE ${typeof o.value==='string'?JSON.stringify(o.value):JSON.stringify(o.value)}`);if(o.unit)out.push(`UNIT ${JSON.stringify(o.unit)}`);out.push(`SEVERITY ${o.severity}`,`SOURCES ${o.sourceUris.join(',')}`,`LABELS ${o.labels.join(',')}`,'END');}
  return out.join('\n')+'\n';
}
export function validateObservation(value:unknown):ObservationDocument{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('OBSERVATION_DOCUMENT_REQUIRED');const d=value as Record<string,unknown>;
  const allowed=['schema','id','sourceSnapshotHash','observations'];for(const k of Object.keys(d))if(!allowed.includes(k))throw new Error(`OBSERVATION_UNKNOWN_KEY:${k}`);
  if(d.schema!=='subactor.observation/v1'||typeof d.id!=='string'||typeof d.sourceSnapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(d.sourceSnapshotHash)||!Array.isArray(d.observations))throw new Error('OBSERVATION_DOCUMENT_INVALID');
  const seen=new Set<string>();for(const raw of d.observations){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('OBSERVATION_RECORD_INVALID');const o=raw as Record<string,unknown>;const keys=['id','observedAt','subjectUri','metric','value','unit','severity','sourceUris','labels'];for(const k of Object.keys(o))if(!keys.includes(k))throw new Error(`OBSERVATION_RECORD_UNKNOWN_KEY:${k}`);if(typeof o.id!=='string'||seen.has(o.id)||typeof o.observedAt!=='string'||Number.isNaN(Date.parse(o.observedAt))||typeof o.subjectUri!=='string'||typeof o.metric!=='string'||!['debug','info','warning','error','critical'].includes(String(o.severity))||!Array.isArray(o.sourceUris)||!o.sourceUris.every(x=>typeof x==='string')||!Array.isArray(o.labels)||!o.labels.every(x=>typeof x==='string'))throw new Error('OBSERVATION_RECORD_INVALID');seen.add(o.id);}
  return value as ObservationDocument;
}
