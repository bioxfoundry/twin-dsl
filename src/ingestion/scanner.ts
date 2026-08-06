import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import type { ResourceRecord, SourceRole } from "../core/types.js";
import { CompositeDocumentConverter, DeterministicMarkdownConverter } from "../adapters/document-converter.js";
import { resourceFromText } from "../dsl/resource.js";
import { readZip } from "./archive.js";

const TEXT_EXT=new Set(['.md','.txt','.json','.jsonl','.yaml','.yml','.toml','.csv','.ts','.js','.mjs','.py','.php','.go','.rs','.java','.xml','.html','.htm']);
export interface ScanSource { path:string; role:SourceRole; logicalRoot:string; labels?:string[]; }
export interface ScanResult { resources:ResourceRecord[]; texts:Map<string,string>; warnings:string[]; }
async function walk(root:string):Promise<string[]>{const out:string[]=[];for(const e of await readdir(root,{withFileTypes:true})){if(['.git','node_modules','dist','.intent','.dt-run','.biofoundry-run'].includes(e.name))continue;const p=join(root,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p);}return out;}
function textFromBuffer(buffer:Buffer,path:string):string|undefined{const ext=extname(path).toLowerCase();if(!TEXT_EXT.has(ext))return undefined;if(buffer.includes(0))return undefined;return buffer.toString('utf8');}
export async function scanSources(sources:ScanSource[]):Promise<ScanResult>{
  const resources:ResourceRecord[]=[],texts=new Map<string,string>(),warnings:string[]=[],converter=process.env.DOCLING_URL?new CompositeDocumentConverter():new DeterministicMarkdownConverter();
  for(const source of sources){const absolute=resolve(source.path);const s=await stat(absolute);const files=s.isDirectory()?await walk(absolute):[absolute];
    for(const file of files){const rel=s.isDirectory()?relative(absolute,file):file.split('/').at(-1)!;const ext=extname(file).toLowerCase();
      if(ext==='.zip'){
        try{for(const entry of await readZip(file)){const text=textFromBuffer(entry.content,entry.path);if(text===undefined){warnings.push(`ARCHIVE_ENTRY_SKIPPED:${entry.path}`);continue;}const logical=`${source.logicalRoot}/archive/${encodeURIComponent(entry.path)}`;const r=resourceFromText(`res-${resources.length+1}`,logical,`${file}!/${entry.path}`,text,undefined,'archive',[source.role,...(source.labels??[])]);resources.push(r);texts.set(r.uri,text);}}
        catch(error){warnings.push(error instanceof Error?error.message:String(error));}continue;
      }
      try{const converted=await converter.convert(file);const logical=`${source.logicalRoot}/${rel.split('/').map(encodeURIComponent).join('/')}`;const r=resourceFromText(`res-${resources.length+1}`,logical,file,converted.markdown,undefined,source.role,source.labels??[]);resources.push(r);texts.set(r.uri,converted.markdown);}catch(error){warnings.push(error instanceof Error?error.message:String(error));}
    }
  }
  return{resources,texts,warnings};
}
