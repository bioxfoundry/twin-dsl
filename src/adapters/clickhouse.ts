import type { ResourceRecord } from "../core/types.js";
export interface IndexedChunk { resourceUri:string; logicalUri:string; text:string; revisionHash:string; sourcePath:string; sourceRole?:string; }
export interface SearchProjection { upsert(resource:ResourceRecord,text:string):void|Promise<void>; search(term:string):IndexedChunk[]|Promise<IndexedChunk[]>; all():IndexedChunk[]|Promise<IndexedChunk[]>; }
export class InMemorySearchProjection implements SearchProjection {
 #chunks:IndexedChunk[]=[];
 upsert(resource:ResourceRecord,text:string):void{this.#chunks=this.#chunks.filter(x=>x.resourceUri!==resource.uri);this.#chunks.push({resourceUri:resource.uri,logicalUri:resource.logicalUri,text,revisionHash:resource.sha256,sourcePath:resource.sourcePath,sourceRole:resource.sourceRole});}
 search(term:string):IndexedChunk[]{const q=term.toLowerCase();return this.#chunks.filter(x=>x.text.toLowerCase().includes(q));}
 all():IndexedChunk[]{return [...this.#chunks];}
}
function sqlString(x:string):string{return `'${x.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`;}
/**
 * ClickHouse DateTime64 in JSONEachRow wants `YYYY-MM-DD HH:MM:SS.mmm` in UTC; an ISO-8601 string
 * with `T` and a `Z`/offset is rejected with CANNOT_PARSE_INPUT_ASSERTION_FAILED.
 */
export function clickHouseDateTime64(value:string):string{
 const at=new Date(value);
 if(Number.isNaN(at.getTime()))throw new Error(`CLICKHOUSE_INVALID_DATETIME:${value}`);
 return at.toISOString().replace('T',' ').replace('Z','');
}
export class ClickHouseHttpProjection implements SearchProjection {
 constructor(readonly url=process.env.CLICKHOUSE_URL??'http://127.0.0.1:8123',readonly projectId='default',readonly user=process.env.CLICKHOUSE_USER??'',readonly password=process.env.CLICKHOUSE_PASSWORD??''){}
 /**
  * Credentials travel as X-ClickHouse-* headers rather than in the URL, so they never reach
  * query logs. The official image disables network access for `default` unless CLICKHOUSE_USER
  * or CLICKHOUSE_PASSWORD is set, so cross-container access needs them.
  */
 #headers():Record<string,string>{const h:Record<string,string>={'Content-Type':'text/plain'};if(this.user)h['X-ClickHouse-User']=this.user;if(this.user||this.password)h['X-ClickHouse-Key']=this.password;return h;}
 async query(sql:string):Promise<string>{const r=await fetch(this.url,{method:'POST',headers:this.#headers(),body:sql});const text=await r.text();if(!r.ok)throw new Error(`CLICKHOUSE_HTTP:${r.status}:${text.slice(0,300)}`);return text;}
 async upsert(resource:ResourceRecord,text:string):Promise<void>{await this.query(`INSERT INTO digital_twin.document_chunks FORMAT JSONEachRow\n${JSON.stringify({project_id:this.projectId,artifact_uri:resource.uri,logical_uri:resource.logicalUri,revision_hash:resource.sha256,source_path:resource.sourcePath,section_uri:resource.logicalUri,page:0,text,source_kind:resource.sourceRole??'project',derived:resource.derived,derived_from:resource.derivedFrom,created_at:clickHouseDateTime64(resource.createdAt)})}`);}
 async search(term:string):Promise<IndexedChunk[]>{const raw=await this.query(`SELECT artifact_uri AS resourceUri, logical_uri AS logicalUri, text, revision_hash AS revisionHash, source_path AS sourcePath, source_kind AS sourceRole FROM digital_twin.document_chunks FINAL WHERE project_id=${sqlString(this.projectId)} AND positionCaseInsensitiveUTF8(text, ${sqlString(term)}) > 0 FORMAT JSONEachRow`);return raw.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));}
 async all():Promise<IndexedChunk[]>{const raw=await this.query(`SELECT artifact_uri AS resourceUri, logical_uri AS logicalUri, text, revision_hash AS revisionHash, source_path AS sourcePath, source_kind AS sourceRole FROM digital_twin.document_chunks FINAL WHERE project_id=${sqlString(this.projectId)} FORMAT JSONEachRow`);return raw.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));}
}
