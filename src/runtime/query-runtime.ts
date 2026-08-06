import { randomUUID } from "node:crypto";
import type { QueryContract,QueryResultEnvelope,TreeDocument,MathDocument } from "../core/types.js";
import { canonicalJson,contentUri,sha256 } from "../core/canonical.js";
import type { SearchProjection } from "../adapters/clickhouse.js";
import { InMemoryEventStore } from "./event-store.js";
export class QueryRuntime{
 constructor(readonly search:SearchProjection,readonly events:InMemoryEventStore){}
 async execute(q:QueryContract,opts:{ticketId:string;principal:string;tree?:TreeDocument;math?:MathDocument}):Promise<QueryResultEnvelope>{
  const executionId=randomUUID(), processId=q.id, idempotencyKey=sha256(`${opts.ticketId}:${processId}:${q.canonicalHash}`);
  const term=q.filters.find(f=>f.field==='text'&&f.operator==='contains')?.value??'';const hits=await this.search.search(term);
  let payload:unknown;if(q.expectedResultKind==='tree')payload=opts.tree??{schema:'subactor.tree/v1',id:`tree-${q.id}`,roots:hits.map((h,i)=>({id:`hit-${i+1}`,uri:h.resourceUri,label:h.sourcePath,kind:'resource',sourceUris:[h.resourceUri],children:[]}))};else if(q.expectedResultKind==='math')payload=opts.math??{schema:'subactor.math/v1',id:`math-${q.id}`,bindings:[],expressions:{}};else payload=hits;
  const evidence=hits.map(h=>({uri:h.resourceUri}));const material={queryHash:q.canonicalHash,sourceSnapshotHash:q.sourceSnapshotHash,payload,evidenceUris:evidence.map(e=>e.uri)};const resultHash=sha256(canonicalJson(material)),resultUri=contentUri('query-result',material);
  const checks=[{name:'query-hash-present',ok:!!q.canonicalHash,message:'query is canonical'},{name:'snapshot-bound',ok:!!q.sourceSnapshotHash,message:'source snapshot is bound'},{name:'immutable-result-uri',ok:resultUri.startsWith('urn:subactor:'),message:'result uses immutable URI'},{name:'evidence-present',ok:evidence.length>0,message:`${evidence.length} evidence item(s)`}];
  const out:QueryResultEnvelope={schema:'subactor.query-result/v1',queryId:q.id,queryHash:q.canonicalHash,executionId,sourceSnapshotHash:q.sourceSnapshotHash,resultUri,resultHash,resultKind:q.expectedResultKind,payload,evidence,validation:{ok:checks.every(c=>c.ok),checks},executionReceipt:{ticketId:opts.ticketId,processId,idempotencyKey,completedAt:new Date().toISOString()}};
  const streamId=`query-${q.id}`;this.events.append(streamId,this.events.read(streamId).length,{eventType:'QueryExecuted',schemaVersion:'subactor.event/v1',occurredAt:new Date().toISOString(),principal:opts.principal,intentId:q.intentUri,correlationId:executionId,traceId:executionId,evidenceUris:evidence.map(e=>e.uri),payload:out});return out;
 }
}
