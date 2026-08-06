import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
async function walk(directory){let output=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);output.push(...(entry.isDirectory()?await walk(path):[path]));}return output;}
function checkMessageFields(source,file){
  const stripped=source.replace(/\/\/.*$/gm,'');
  const messages=[...stripped.matchAll(/message\s+(\w+)\s*\{([\s\S]*?)\}/g)];
  for(const [,name,body] of messages){
    const numbers=new Map();
    for(const match of body.matchAll(/(?:repeated\s+|optional\s+)?(?:map<[^>]+>|[\w.]+)\s+(\w+)\s*=\s*(\d+)\s*;/g)){
      const field=match[1],number=Number(match[2]);
      if(number<=0)throw new Error(`PROTO_FIELD_NUMBER_INVALID:${file}:${name}:${field}:${number}`);
      if(numbers.has(number))throw new Error(`PROTO_FIELD_NUMBER_DUPLICATE:${file}:${name}:${number}:${numbers.get(number)}:${field}`);
      numbers.set(number,field);
    }
  }
}
const files=(await walk('proto')).filter(path=>path.endsWith('.proto'));
for(const file of files){const source=await readFile(file,'utf8');if(!source.includes('syntax = "proto3"'))throw new Error(`PROTO3_REQUIRED:${file}`);checkMessageFields(source,file);}
console.log(JSON.stringify({ok:true,files:files.length,checks:['proto3','positive-field-numbers','unique-field-numbers']}));
