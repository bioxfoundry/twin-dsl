import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync=promisify(execFile);
export interface ArchiveEntry { path:string; content:Buffer; }
function limit(name:string,fallback:number):number{const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?n:fallback;}
function safePath(path:string):boolean{return path.length>0&&!path.startsWith('/')&&!path.includes('..')&&!path.includes('\\')&&!/^[A-Za-z]:/.test(path);}
export async function readZip(path:string):Promise<ArchiveEntry[]>{
  const maxFiles=limit('DT_MAX_ARCHIVE_FILES',1000),maxEntry=limit('DT_MAX_ARCHIVE_ENTRY_BYTES',10*1024*1024),maxTotal=limit('DT_MAX_TOTAL_ARCHIVE_BYTES',100*1024*1024);
  const {stdout}=await execFileAsync('unzip',['-Z1',path],{maxBuffer:16*1024*1024});const names=stdout.split(/\r?\n/).filter(Boolean);if(names.length>maxFiles)throw new Error(`ARCHIVE_FILE_LIMIT:${names.length}`);
  const out:ArchiveEntry[]=[];let total=0;for(const name of names){if(name.endsWith('/'))continue;if(!safePath(name))throw new Error(`ARCHIVE_UNSAFE_PATH:${name}`);const {stdout:content}=await execFileAsync('unzip',['-p',path,name],{encoding:'buffer',maxBuffer:maxEntry+1}) as {stdout:Buffer};if(content.length>maxEntry)throw new Error(`ARCHIVE_ENTRY_LIMIT:${name}`);total+=content.length;if(total>maxTotal)throw new Error('ARCHIVE_TOTAL_LIMIT');out.push({path:name,content});}return out;
}
