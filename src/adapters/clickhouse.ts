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
export class ClickHouseHttpProjection implements SearchProjection {
 constructor(readonly url=process.env.CLICKHOUSE_URL??'http://127.0.0.1:8123',readonly projectId='default'){}
 async query(sql:string):Promise<string>{const r=await fetch(this.url,{method:'POST',headers:{'Content-Type':'text/plain'},body:sql});const text=await r.text();if(!r.ok)throw new Error(`CLICKHOUSE_HTTP:${r.status}:${text.slice(0,300)}`);return text;}
 async upsert(resource:ResourceRecord,text:string):Promise<void>{await this.query(`INSERT INTO digital_twin.document_chunks FORMAT JSONEachRow\n${JSON.stringify({project_id:this.projectId,artifact_uri:resource.uri,logical_uri:resource.logicalUri,revision_hash:resource.sha256,source_path:resource.sourcePath,section_uri:resource.logicalUri,page:0,text,source_kind:resource.sourceRole??'project',derived:resource.derived,derived_from:resource.derivedFrom,created_at:resource.createdAt})}`);}
 async search(term:string):Promise<IndexedChunk[]>{const raw=await this.query(`SELECT artifact_uri AS resourceUri, logical_uri AS logicalUri, text, revision_hash AS revisionHash, source_path AS sourcePath, source_kind AS sourceRole FROM digital_twin.document_chunks FINAL WHERE project_id=${sqlString(this.projectId)} AND positionCaseInsensitiveUTF8(text, ${sqlString(term)}) > 0 FORMAT JSONEachRow`);return raw.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));}
 async all():Promise<IndexedChunk[]>{const raw=await this.query(`SELECT artifact_uri AS resourceUri, logical_uri AS logicalUri, text, revision_hash AS revisionHash, source_path AS sourcePath, source_kind AS sourceRole FROM digital_twin.document_chunks FINAL WHERE project_id=${sqlString(this.projectId)} FORMAT JSONEachRow`);return raw.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));}
}
