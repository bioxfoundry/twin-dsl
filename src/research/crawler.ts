import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { DqlCrawlPlan, ResourceRecord } from "../core/types.js";
import { resourceFromText } from "../dsl/resource.js";

export interface CrawledPage { url:string; title:string; markdown:string; links:string[]; contextScore:number; resource:ResourceRecord; }
export interface CrawlResult { pages:CrawledPage[]; sitemapUrls:string[]; warnings:string[]; }
export type FetchLike=(input:string|URL,init?:RequestInit)=>Promise<Response>;

function privateIp(ip:string):boolean{
  if(ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:'))return true;
  if(!isIP(ip))return false;
  const p=ip.split('.').map(Number);return p.length===4&&(p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168));
}
async function assertPublic(url:URL):Promise<void>{if(process.env.DT_CRAWLER_ALLOW_PRIVATE==='true')return;if(['localhost','0.0.0.0'].includes(url.hostname)||privateIp(url.hostname))throw new Error(`DQL_PRIVATE_HOST:${url.hostname}`);if(isIP(url.hostname))return;const addresses=await lookup(url.hostname,{all:true});if(addresses.some(x=>privateIp(x.address)))throw new Error(`DQL_PRIVATE_DNS:${url.hostname}`);}
function decode(s:string):string{return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
function locations(xml:string):string[]{return [...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)].map(m=>decode(m[1].trim()));}
function isSitemapIndex(xml:string):boolean{return /<sitemapindex\b/i.test(xml);}
function glob(pattern:string,value:string):boolean{const r='^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'.*').replace(/\*/g,'[^/]*')+'$';return new RegExp(r).test(value);}
function allowedPath(plan:DqlCrawlPlan,path:string):boolean{const included=plan.includePaths.length===0||plan.includePaths.some(x=>glob(x,path));const excluded=plan.excludePaths.some(x=>glob(x,path));return included&&!excluded;}
function stripTags(html:string):string{return decode(html.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());}
function first(html:string,re:RegExp):string{return stripTags(html.match(re)?.[1]??'');}
function htmlToMarkdown(html:string,url:string):{title:string;markdown:string;links:string[]}{
  const title=first(html,/<title[^>]*>([\s\S]*?)<\/title>/i)||new URL(url).pathname;
  const blocks:string[]=[`# ${title}`,`Source: ${url}`];
  const re=/<(h[1-6]|p|li|th|td)[^>]*>([\s\S]*?)<\/\1>/gi;for(const m of html.matchAll(re)){const text=stripTags(m[2]);if(!text)continue;blocks.push(m[1].startsWith('h')?`${'#'.repeat(Number(m[1][1]))} ${text}`:m[1]==='li'?`- ${text}`:text);}
  const links=[...html.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)].map(m=>{try{return new URL(decode(m[1]),url).toString();}catch{return'';}}).filter(Boolean);
  return{title,markdown:blocks.join('\n\n'),links:[...new Set(links)]};
}

function robotsDisallow(text:string):string[]{const out:string[]=[];let active=false;for(const raw of text.split(/\r?\n/)){const line=raw.replace(/#.*$/,'').trim();if(!line)continue;const i=line.indexOf(':');if(i<0)continue;const key=line.slice(0,i).trim().toLowerCase(),value=line.slice(i+1).trim();if(key==='user-agent')active=value==='*';else if(active&&key==='disallow'&&value)out.push(value);}return out;}
function robotAllowed(path:string,disallow:string[]):boolean{return !disallow.some(rule=>path.startsWith(rule));}

function score(text:string,terms:string[]):number{if(terms.length===0)return 1;const lower=text.toLowerCase();return terms.reduce((n,t)=>n+(lower.includes(t.toLowerCase())?1:0),0)/terms.length;}
async function fetchText(fetcher:FetchLike,url:string):Promise<string>{const res=await fetcher(url,{headers:{'User-Agent':process.env.DT_CRAWLER_USER_AGENT??'SubactorResearchBot/0.2','Accept':'text/html,application/xml,text/xml;q=0.9,*/*;q=0.1'},redirect:'follow'});if(!res.ok)throw new Error(`DQL_HTTP:${res.status}:${url}`);const length=Number(res.headers.get('content-length'));if(Number.isFinite(length)&&length>5*1024*1024)throw new Error(`DQL_RESPONSE_TOO_LARGE:${url}`);const text=await res.text();if(Buffer.byteLength(text)>5*1024*1024)throw new Error(`DQL_RESPONSE_TOO_LARGE:${url}`);return text;}

export class DqlCrawler{
  constructor(readonly fetcher:FetchLike=fetch,readonly networkGuard:(url:URL)=>Promise<void>=assertPublic){}
  async crawl(plan:DqlCrawlPlan):Promise<CrawlResult>{
    const warnings:string[]=[],sitemapUrls:string[]=[],queue=[...plan.sitemapUrls],urls=[...plan.seedUrls],seenMaps=new Set<string>();
    while(queue.length&&seenMaps.size<plan.maxSitemaps){const raw=queue.shift()!;try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||!plan.allowHosts.includes(u.hostname.toLowerCase()))throw new Error(`DQL_HOST_NOT_ALLOWED:${u.hostname}`);await this.networkGuard(u);const xml=await fetchText(this.fetcher,u.toString());seenMaps.add(u.toString());sitemapUrls.push(u.toString());const locs=locations(xml);if(isSitemapIndex(xml))queue.push(...locs);else urls.push(...locs);}catch(error){warnings.push(error instanceof Error?error.message:String(error));}}
    const robots=new Map<string,string[]>();if(plan.respectRobots){for(const raw of [...plan.sitemapUrls,...plan.seedUrls]){try{const u=new URL(raw),key=`${u.protocol}//${u.host}`;if(robots.has(key))continue;await this.networkGuard(u);const res=await this.fetcher(`${key}/robots.txt`,{headers:{'User-Agent':process.env.DT_CRAWLER_USER_AGENT??'SubactorResearchBot/0.2'}});robots.set(key,res.ok?robotsDisallow(await res.text()):[]);}catch{}}}
    const unique=[...new Set(urls)].slice(0,plan.maxUrls*4),pages:CrawledPage[]=[];
    for(const raw of unique){if(pages.length>=plan.maxUrls)break;try{const u=new URL(raw),origin=`${u.protocol}//${u.host}`;if(!['http:','https:'].includes(u.protocol)||!plan.allowHosts.includes(u.hostname.toLowerCase())||!allowedPath(plan,u.pathname)||!robotAllowed(u.pathname,robots.get(origin)??[]))continue;await this.networkGuard(u);const html=await fetchText(this.fetcher,u.toString());const converted=htmlToMarkdown(html,u.toString()),contextScore=score(converted.markdown,plan.contextTerms);if(plan.contextTerms.length>0&&contextScore===0)continue;const resource=resourceFromText(`web-${pages.length+1}`,`subactor://web/${u.hostname}${u.pathname}`,u.toString(),converted.markdown,undefined,'internet',plan.contextTerms);pages.push({url:u.toString(),...converted,contextScore,resource});}catch(error){warnings.push(error instanceof Error?error.message:String(error));}}
    return{pages,sitemapUrls,warnings};
  }
}
