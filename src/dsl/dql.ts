import type { DqlCrawlPlan } from "../core/types.js";
import { kv, lines, list, unquote } from "./parser-util.js";

function positiveInt(value:string,name:string,min=1,max=10000):number{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`BAD_${name}:${value}`);return n;}
export function parseDql(source:string):DqlCrawlPlan{
  const xs=lines(source);const h=xs[0]?.match(/^DQL\s+(\S+)/);if(!h)throw new Error('DQL_HEADER_REQUIRED');
  const out:DqlCrawlPlan={schema:'subactor.dql-crawl/v1',id:h[1],sitemapUrls:[],seedUrls:[],allowHosts:[],includePaths:[],excludePaths:[],contextTerms:[],maxUrls:50,maxSitemaps:10,sameOriginOnly:true,respectRobots:true,output:'markdown',validations:[]};
  for(const line of xs.slice(1)){const[key,value]=kv(line);switch(key){
    case'SITEMAPS':out.sitemapUrls.push(...list(value));break;
    case'SEEDS':out.seedUrls.push(...list(value));break;
    case'ALLOW_HOSTS':out.allowHosts.push(...list(value));break;
    case'INCLUDE':out.includePaths.push(...list(value));break;
    case'EXCLUDE':out.excludePaths.push(...list(value));break;
    case'CONTEXT':out.contextTerms.push(...list(value));break;
    case'MAX_URLS':out.maxUrls=positiveInt(value,'MAX_URLS',1,5000);break;
    case'MAX_SITEMAPS':out.maxSitemaps=positiveInt(value,'MAX_SITEMAPS',1,100);break;
    case'SAME_ORIGIN':out.sameOriginOnly=unquote(value)==='true';break;
    case'RESPECT_ROBOTS':out.respectRobots=unquote(value)==='true';break;
    case'OUTPUT':if(unquote(value)!=='markdown')throw new Error('DQL_OUTPUT_MARKDOWN_REQUIRED');break;
    case'VALIDATE':out.validations.push(...list(value));break;
    default:throw new Error(`UNKNOWN_DQL_KEY:${key}`);
  }}
  if(out.sitemapUrls.length===0&&out.seedUrls.length===0)throw new Error('DQL_SOURCE_REQUIRED');
  if(out.allowHosts.length===0){for(const x of [...out.sitemapUrls,...out.seedUrls])out.allowHosts.push(new URL(x).hostname);}
  out.allowHosts=[...new Set(out.allowHosts.map(x=>x.toLowerCase()))];return out;
}
export function renderDql(x:DqlCrawlPlan):string{return[
  `DQL ${x.id}`,
  `SITEMAPS [${x.sitemapUrls.join(', ')}]`,
  `SEEDS [${x.seedUrls.join(', ')}]`,
  `ALLOW_HOSTS [${x.allowHosts.join(', ')}]`,
  `INCLUDE [${x.includePaths.join(', ')}]`,
  `EXCLUDE [${x.excludePaths.join(', ')}]`,
  `CONTEXT [${x.contextTerms.join(', ')}]`,
  `MAX_URLS ${x.maxUrls}`,
  `MAX_SITEMAPS ${x.maxSitemaps}`,
  `SAME_ORIGIN ${x.sameOriginOnly}`,
  `RESPECT_ROBOTS ${x.respectRobots}`,
  `OUTPUT markdown`,
  `VALIDATE [${x.validations.join(', ')}]`,
].join('\n');}
