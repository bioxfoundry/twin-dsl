import test from "node:test";
import assert from "node:assert/strict";
import { OpenRouterStructuredClient, type OpenRouterConfig } from "../src/llm/openrouter.js";
import { NlDslCompiler } from "../src/llm/nl-dsl-compiler.js";

const config:OpenRouterConfig={apiKey:'secret-test-key',baseUrl:'https://mock.openrouter.test/api/v1',model:'mock/model',appTitle:'test',dataCollection:'deny',timeoutMs:5000,maxRetries:0,jsonObjectFallback:false,responseHealing:true};
test('OpenRouter NL -> mathDSL uses strict structured output',async()=>{
  let requestBody:any;const fetcher:typeof fetch=async(_input,init)=>{requestBody=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:'gen-test',model:'mock/model',provider:'mock-provider',usage:{prompt_tokens:10,completion_tokens:20,cost:0.001},choices:[{message:{content:JSON.stringify({dsl:'MATH generated\nBIND A = true\nEXPR Ready = AND(A)'})}}]}),{status:200,headers:{'content-type':'application/json'}});};
  const client=new OpenRouterStructuredClient(config,fetcher),compiler=new NlDslCompiler(client);
  const result=await compiler.compile({kind:'math',text:'Create a readiness gate',context:{sourceSnapshotHash:'a'.repeat(64)},mode:'require-llm'});
  assert.equal((result.value as any).schema,'subactor.math/v1');assert.equal(result.audit.effectiveMode,'llm');assert.equal(result.audit.responseId,'gen-test');
  assert.equal(requestBody.response_format.type,'json_schema');assert.equal(requestBody.response_format.json_schema.strict,true);assert.equal(requestBody.provider.require_parameters,true);assert.equal(requestBody.provider.data_collection,'deny');assert.deepEqual(requestBody.plugins,[{id:'response-healing'}]);
  assert.equal(JSON.stringify(result).includes('secret-test-key'),false);
});
