import { readFile, stat } from "node:fs/promises";
import { extname, basename } from "node:path";
export interface ConvertedDocument { markdown:string; metadata:Record<string,unknown>; assets:string[]; converter:string; version:string; }
export interface DocumentConverter { convert(path:string):Promise<ConvertedDocument>; }
export class DeterministicMarkdownConverter implements DocumentConverter {
  async convert(path:string):Promise<ConvertedDocument>{const ext=extname(path).toLowerCase();if(!['.md','.txt','.json','.yaml','.yml','.toml','.csv','.ts','.js','.mjs','.py','.php','.go','.rs','.java','.xml','.html','.htm'].includes(ext))throw new Error(`EXTERNAL_CONVERTER_REQUIRED:${ext}`);const text=await readFile(path,'utf8');const s=await stat(path);return{markdown:ext==='.md'?text:`# ${basename(path)}\n\n\`\`\`${ext.slice(1)||'text'}\n${text}\n\`\`\``,metadata:{source:path,size:s.size,mtime:s.mtime.toISOString()},assets:[],converter:'deterministic-text',version:'1.1.0'};}
}
export class DoclingHttpAdapter implements DocumentConverter {
  constructor(readonly baseUrl=process.env.DOCLING_URL??'http://127.0.0.1:5001'){}
  async convert(path:string):Promise<ConvertedDocument>{const bytes=await readFile(path),form=new FormData();form.set('file',new Blob([bytes]),basename(path));const response=await fetch(`${this.baseUrl.replace(/\/$/,'')}/convert`,{method:'POST',body:form,signal:AbortSignal.timeout(180000)});if(!response.ok)throw new Error(`DOCLING_HTTP:${response.status}`);const data=await response.json() as {markdown?:unknown;converter?:unknown;metadata?:unknown;assets?:unknown};if(typeof data.markdown!=='string')throw new Error('DOCLING_MARKDOWN_MISSING');return{markdown:data.markdown,metadata:data.metadata&&typeof data.metadata==='object'?data.metadata as Record<string,unknown>:{source:path},assets:Array.isArray(data.assets)?data.assets.map(String):[],converter:typeof data.converter==='string'?data.converter:'docling',version:'1'};}
}
export class CompositeDocumentConverter implements DocumentConverter {
  constructor(readonly deterministic=new DeterministicMarkdownConverter(),readonly docling=new DoclingHttpAdapter()){}
  async convert(path:string):Promise<ConvertedDocument>{try{return await this.deterministic.convert(path);}catch(error){if(error instanceof Error&&error.message.startsWith('EXTERNAL_CONVERTER_REQUIRED:'))return this.docling.convert(path);throw error;}}
}
