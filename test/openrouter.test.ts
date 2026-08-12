import test from "node:test";
import assert from "node:assert/strict";
import { OpenRouterStructuredClient, type OpenRouterConfig } from "../src/llm/openrouter.js";
import { NlDslCompiler } from "../src/llm/nl-dsl-compiler.js";
import { shouldShortCircuitSceneGeneration } from "../src/runtime/living-project.js";
import { canonicalJson, sha256 } from "../src/core/canonical.js";
import type { Todo2CodeAdapter } from "../src/adapters/todo2code.js";
import { canonicalIntentRecord } from "../src/dsl/intent.js";

function patchEnvelope(target:string,value:unknown,base:unknown={}):string{return JSON.stringify({schema:'subactor.patch-envelope/v1',patchDsl:[
  'PATCHDSL "subactor.patch-dsl/v1"',
  `TARGET ${JSON.stringify(target)}`,
  `BASE_SHA256 ${JSON.stringify(sha256(canonicalJson(base)))}`,
  `SET "/dsl" ${JSON.stringify(value)}`,
  'END_PATCH',
].join('\n')});}

const config:OpenRouterConfig={apiKey:'secret-test-key',baseUrl:'https://mock.openrouter.test/api/v1',model:'mock/model',appTitle:'test',dataCollection:'deny',timeoutMs:5000,maxRetries:0,jsonObjectFallback:false,responseHealing:true};
test('OpenRouter NL -> mathDSL uses strict structured output',async()=>{
  let requestBody:any;const fetcher:typeof fetch=async(_input,init)=>{requestBody=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:'gen-test',model:'mock/model',provider:'mock-provider',usage:{prompt_tokens:10,completion_tokens:20,cost:0.001},choices:[{message:{content:patchEnvelope('math','MATH generated\nBIND A = true\nEXPR Ready = AND(A)')}}]}),{status:200,headers:{'content-type':'application/json'}});};
  const client=new OpenRouterStructuredClient(config,fetcher),compiler=new NlDslCompiler(client);
  const result=await compiler.compile({kind:'math',text:'Create a readiness gate',context:{sourceSnapshotHash:'a'.repeat(64)},mode:'require-llm'});
  assert.equal((result.value as any).schema,'subactor.math/v1');assert.equal(result.audit.effectiveMode,'llm');assert.equal(result.audit.responseId,'gen-test');
  assert.equal(requestBody.response_format.type,'json_schema');assert.equal(requestBody.response_format.json_schema.strict,true);assert.equal(requestBody.provider.require_parameters,true);assert.equal(requestBody.provider.data_collection,'deny');assert.deepEqual(requestBody.plugins,[{id:'response-healing'}]);
  assert.equal(requestBody.response_format.json_schema.schema.properties.patchDsl.type,'string');
  assert.match(requestBody.messages[0].content,/PATCH_GBNF/);assert.match(requestBody.messages[0].content,/TARGET_SCHEMA_JSON/);assert.match(requestBody.messages[1].content,/BASE_SHA256/);
  assert.equal(JSON.stringify(result).includes('secret-test-key'),false);
});

test('OpenRouter feeds local DSL parser errors back to a weaker model and accepts the repaired response',async()=>{
  const prompts:string[]=[];let calls=0;
  const fetcher:typeof fetch=async(_input,init)=>{
    const body=JSON.parse(String(init?.body));prompts.push(body.messages[0].content);calls++;
    const dsl=calls===1?'This is a semantic readiness model.':'```mathdsl\nMATH repaired\nBIND EvidencePresent = true FROM [urn:test:evidence]\nEXPR Ready = AND(EvidencePresent)\n```';
    return new Response(JSON.stringify({id:`repair-${calls}`,model:'mock/model',provider:'mock',choices:[{message:{content:patchEnvelope('math',dsl)}}]}),{status:200});
  };
  const client=new OpenRouterStructuredClient({...config,maxRetries:1},fetcher),compiler=new NlDslCompiler(client);
  const result=await compiler.compile({kind:'math',text:'Create readiness semantics',mode:'require-llm'});
  assert.equal(calls,2);
  assert.match(prompts[1]!,/MATH_HEADER_REQUIRED/);assert.match(prompts[1]!,/LLM_REPAIR/);
  assert.equal((result.value as any).id,'repaired');
  assert.equal(result.audit.responseId,'repair-2');
});

test('prefer-llm short-circuits Scene only after a Twin transport fallback',()=>{
  const base={requestedMode:'prefer-llm',effectiveMode:'deterministic',degraded:true,provider:null,model:null,responseId:null,durationMs:60000} as const;
  assert.equal(shouldShortCircuitSceneGeneration('prefer-llm',{...base,reason:'This operation was aborted'}),true);
  assert.equal(shouldShortCircuitSceneGeneration('prefer-llm',{...base,reason:'domain_grounding_failed'}),false);
  assert.equal(shouldShortCircuitSceneGeneration('require-llm',{...base,reason:'This operation was aborted'}),false);
});

test('intent LLM enrichment patches a deterministic todo2code baseline instead of invoking its LLM',async()=>{
  const records=[canonicalIntentRecord({seed:'intent-1',type:'request',text:'baseline',actor:'operator',targetUris:['urn:test:source']})];
  let todoMode='';
  const todo={extractNl:async(_text:string,mode:string)=>{todoMode=mode;return records;}} as unknown as Todo2CodeAdapter;
  const base={document:records};
  const patchDsl=['PATCHDSL "subactor.patch-dsl/v1"','TARGET "intent"',`BASE_SHA256 "${sha256(canonicalJson(base))}"`,'SET "/document/0/statement/text" "refined"','END_PATCH'].join('\n');
  const fetcher:typeof fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({schema:'subactor.patch-envelope/v1',patchDsl})}}]}),{status:200});
  const compiler=new NlDslCompiler(new OpenRouterStructuredClient(config,fetcher),todo);
  const result=await compiler.compile({kind:'intent',text:'Refine request',mode:'require-llm'});
  assert.equal(todoMode,'deterministic');
  assert.equal((result.value as any[])[0].statement.text,'refined');
});
