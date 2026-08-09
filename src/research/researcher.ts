import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseDql } from "../dsl/dql.js";
import { DqlCrawler, type FetchLike } from "./crawler.js";
import { scanSources } from "../ingestion/scanner.js";
import { ClickHouseHttpProjection, InMemorySearchProjection, type SearchProjection } from "../adapters/clickhouse.js";
import { sha256 } from "../core/canonical.js";
import { parseQueryDsl } from "../dsl/query.js";
import { QueryRuntime } from "../runtime/query-runtime.js";
import { InMemoryEventStore } from "../runtime/event-store.js";
import { parseTreeDsl } from "../dsl/tree.js";
import { parseMathDsl, evaluateMath } from "../dsl/math.js";

async function fixtureFetch(base:string,map:Record<string,string>):Promise<FetchLike>{return async(input)=>{const url=String(input),rel=map[url];if(!rel)return new Response('not found',{status:404});const body=await readFile(resolve(base,rel),'utf8');return new Response(body,{status:200,headers:{'content-type':url.endsWith('.xml')?'application/xml':'text/html'}});};}
export async function runResearcherDemo(base:string,out:string):Promise<Record<string,unknown>>{
  await mkdir(out,{recursive:true});const map=JSON.parse(await readFile(join(base,'fixtures-map.json'),'utf8')) as Record<string,string>;const fetcher=await fixtureFetch(base,map),plan=parseDql(await readFile(join(base,'research.dql'),'utf8')),web=await new DqlCrawler(fetcher,async()=>{}).crawl(plan);
  const local=await scanSources([{path:join(base,'local'),role:'project',logicalRoot:'subactor://research/local'},{path:join(base,'archives'),role:'customer',logicalRoot:'subactor://research/archives'}]);const resources=[...local.resources,...web.pages.map(x=>x.resource)],texts=new Map(local.texts);for(const page of web.pages)texts.set(page.resource.uri,page.markdown);
  const snapshot=sha256(resources.map(x=>x.sha256).sort());const useClickHouse=process.env.DT_SEARCH_BACKEND==='clickhouse'&&!!process.env.CLICKHOUSE_URL;const search:SearchProjection=useClickHouse?new ClickHouseHttpProjection(process.env.CLICKHOUSE_URL,'researcher-demo'):new InMemorySearchProjection();for(const r of resources)await search.upsert(r,texts.get(r.uri)??'');
  const source=resources[0]?.uri??`urn:subactor:resource:sha256:${'0'.repeat(64)}`;const query=parseQueryDsl((await readFile(join(base,'research.querydsl'),'utf8')).replace('__SNAPSHOT__',snapshot).replace('__SOURCE__',source));const tree=parseTreeDsl(await readFile(join(base,'research.treedsl'),'utf8'));const result=await new QueryRuntime(search,new InMemoryEventStore()).execute(query,{ticketId:'PLF-RESEARCH-001',principal:'human:researcher',tree});
  const math=parseMathDsl(await readFile(join(base,'evidence.mathdsl'),'utf8')),decision=evaluateMath(math,'EvidenceReady');
  await writeFile(join(out,'dql-plan.json'),JSON.stringify(plan,null,2));await writeFile(join(out,'resources.json'),JSON.stringify(resources,null,2));await writeFile(join(out,'web-pages.json'),JSON.stringify(web,null,2));await writeFile(join(out,'query-result.json'),JSON.stringify(result,null,2));await writeFile(join(out,'evidence-math.json'),JSON.stringify({document:math,EvidenceReady:decision},null,2));
  const summary={searchBackend:useClickHouse?'clickhouse':'memory',localResources:local.resources.length,webPages:web.pages.length,archiveWarnings:local.warnings,archiveNotices:local.notices,webWarnings:web.warnings,sourceSnapshotHash:snapshot,resultUri:result.resultUri,validated:result.validation.ok,evidenceReady:decision};await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2));return summary;
}
