import{readdir,readFile}from'node:fs/promises';import{join}from'node:path';
async function walk(d){let out=[];for(const n of await readdir(d,{withFileTypes:true})){const p=join(d,n.name);out.push(...(n.isDirectory()?await walk(p):[p]));}return out;}
const files=(await walk('proto')).filter(x=>x.endsWith('.proto'));for(const f of files){const s=await readFile(f,'utf8');if(!s.includes('syntax = "proto3"'))throw new Error(`bad proto ${f}`);}console.log(JSON.stringify({ok:true,files:files.length}));
