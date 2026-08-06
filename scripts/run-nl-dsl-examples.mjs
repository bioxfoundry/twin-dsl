import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {NlDslCompiler} from '../dist/src/llm/nl-dsl-compiler.js';
await rm('.nl-dsl-run',{recursive:true,force:true});await mkdir('.nl-dsl-run',{recursive:true});const compiler=new NlDslCompiler(),text=await readFile('examples/nl-to-dsl/request.md','utf8'),summary=[];
for(const kind of ['intent','resource','query','dql','tree','math','twin','scene','project','observation']){const fixture=JSON.parse(await readFile(`examples/nl-to-dsl/${kind}.fixture.json`,'utf8'));const result=await compiler.compile({kind,text,mode:'deterministic',deterministicValue:fixture});await writeFile(`.nl-dsl-run/${kind}.json`,JSON.stringify(result,null,2));summary.push({kind,hash:result.canonicalHash,audit:result.audit});}
await writeFile('.nl-dsl-run/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
