import type { GenerationAudit, LlmMode } from "../core/types.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderPatchRepair } from "./patch-dsl.js";

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  httpReferer?: string;
  appTitle?: string;
  dataCollection: "allow" | "deny";
  timeoutMs: number;
  maxRetries: number;
  jsonObjectFallback: boolean;
  responseHealing: boolean;
}

export interface StructuredOutput<T> { value:T; audit:GenerationAudit; }

type FetchLike = typeof fetch;

function envInt(name:string,fallback:number):number { const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?Math.trunc(n):fallback; }
function envBool(name:string,fallback=false):boolean { const v=process.env[name];return v===undefined?fallback:/^(1|true|yes)$/i.test(v); }
/** Load local development secrets without overwriting an explicitly exported variable. */
export function loadDotEnv():void {
  for(const file of [join(process.cwd(),".env"),join(process.cwd(),"twin-dsl",".env")]) {
    try {
      for(const line of readFileSync(file,"utf8").split(/\r?\n/)) {
        const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if(!match || match[1] in process.env) continue;
        const value=match[2].replace(/^(['"])(.*)\1$/,"$2");
        process.env[match[1]]=value;
      }
    } catch { /* .env is optional; production should use the process environment */ }
  }
}
export function openRouterConfigFromEnv():OpenRouterConfig{return{
  ...(() => { loadDotEnv(); return {}; })(),
  apiKey:process.env.OPENROUTER_API_KEY??'',
  baseUrl:(process.env.OPENROUTER_BASE_URL??'https://openrouter.ai/api/v1').replace(/\/$/,''),
  model:process.env.OPENROUTER_MODEL??'mistralai/codestral-2508',
  httpReferer:process.env.OPENROUTER_HTTP_REFERER,
  appTitle:process.env.OPENROUTER_APP_TITLE??'Subactor Digital Twin Runtime',
  dataCollection:(process.env.OPENROUTER_DATA_COLLECTION==='allow'?'allow':'deny'),
  // Developer-safe defaults keep prefer-llm responsive: one initial request plus one repair
  // attempt. Production deployments can raise both values explicitly.
  timeoutMs:envInt('OPENROUTER_TIMEOUT_MS',30000),
  maxRetries:envInt('OPENROUTER_MAX_RETRIES',1),
  jsonObjectFallback:envBool('OPENROUTER_JSON_OBJECT_FALLBACK',false),
  responseHealing:envBool('OPENROUTER_RESPONSE_HEALING',false),
};}

function sleep(ms:number):Promise<void>{return new Promise(resolve=>setTimeout(resolve,ms));}
function contentText(content:unknown):string{
  if(typeof content==='string')return content;
  if(Array.isArray(content))return content.map(x=>typeof x==='string'?x:(x&&typeof x==='object'&&'text'in x?String((x as {text:unknown}).text):'')).join('');
  throw new Error('OPENROUTER_CONTENT_MISSING');
}

export class OpenRouterStructuredClient {
  constructor(readonly config:OpenRouterConfig=openRouterConfigFromEnv(),readonly fetchImpl:FetchLike=fetch){}
  configured():boolean{return this.config.apiKey.length>0;}

  async generate<T>(input:{schemaName:string;schema:Record<string,unknown>;system:string;user:string;validate:(x:unknown)=>T}):Promise<StructuredOutput<T>>{
    if(!this.configured())throw new Error('OPENROUTER_NOT_CONFIGURED');
    const started=Date.now();let lastError:unknown;let validationFeedback:string|undefined;
    for(let attempt=0;attempt<=this.config.maxRetries;attempt++){
      const repairInstruction=validationFeedback?`\n${renderPatchRepair(attempt + 1,validationFeedback)}`:'';
      try{return await this.request({...input,system:input.system+repairInstruction},started,'json_schema');}
      catch(error){
        lastError=error;
        const message=error instanceof Error?error.message:String(error);
        const retryableTransport=/OPENROUTER_HTTP:(429|500|502|503|504)/.test(message)||/fetch|timeout|aborted/i.test(message);
        // HTTP 4xx means the request/credential/provider contract is invalid. Every other
        // response-side failure (JSON envelope, strict schema or local DSL parser) can be
        // repaired by showing the deterministic validator code to the model.
        const retryableValidation=!message.startsWith('OPENROUTER_HTTP:')&&!retryableTransport;
        if(retryableValidation)validationFeedback=message.replace(/[\r\n]+/g,' ').slice(0,300);
        if((!retryableTransport&&!retryableValidation)||attempt===this.config.maxRetries)break;
        if(retryableTransport)await sleep(Math.min(1000*2**attempt,8000));
      }
    }
    if(this.config.jsonObjectFallback){try{return await this.request(input,started,'json_object');}catch(error){lastError=error;}}
    throw lastError instanceof Error?lastError:new Error(String(lastError));
  }

  private async request<T>(input:{schemaName:string;schema:Record<string,unknown>;system:string;user:string;validate:(x:unknown)=>T},started:number,format:'json_schema'|'json_object'):Promise<StructuredOutput<T>>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.config.timeoutMs);
    try{
      const headers:Record<string,string>={'Authorization':`Bearer ${this.config.apiKey}`,'Content-Type':'application/json'};
      if(this.config.httpReferer)headers['HTTP-Referer']=this.config.httpReferer;
      if(this.config.appTitle)headers['X-OpenRouter-Title']=this.config.appTitle;
      const responseFormat=format==='json_schema'?{type:'json_schema',json_schema:{name:input.schemaName,strict:true,schema:input.schema}}:{type:'json_object'};
      const body:Record<string,unknown>={model:this.config.model,messages:[{role:'system',content:input.system},{role:'user',content:input.user}],temperature:0,stream:false,response_format:responseFormat,provider:{require_parameters:true,data_collection:this.config.dataCollection}};
      if(this.config.responseHealing)body.plugins=[{id:'response-healing'}];
      const response=await this.fetchImpl(`${this.config.baseUrl}/chat/completions`,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
      const text=await response.text();if(!response.ok)throw new Error(`OPENROUTER_HTTP:${response.status}:${text.slice(0,300)}`);
      const envelope=JSON.parse(text) as Record<string,unknown>;const choices=envelope.choices;if(!Array.isArray(choices)||choices.length===0)throw new Error('OPENROUTER_CHOICES_MISSING');
      const message=(choices[0] as {message?:{content?:unknown}}).message;const raw=contentText(message?.content);let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new Error('OPENROUTER_INVALID_JSON');}
      const value=input.validate(parsed);const usage=(envelope.usage&&typeof envelope.usage==='object'?envelope.usage:undefined) as Record<string,unknown>|undefined;
      const provider=typeof envelope.provider==='string'?envelope.provider:'openrouter';const model=typeof envelope.model==='string'?envelope.model:this.config.model;const responseId=typeof envelope.id==='string'?envelope.id:null;
      return{value,audit:{requestedMode:'require-llm',effectiveMode:'llm',degraded:false,reason:null,provider,model,responseId,durationMs:Date.now()-started,usage,cost:typeof usage?.cost==='number'?usage.cost:null}};
    }finally{clearTimeout(timer);}
  }
}

export function deterministicAudit(mode:LlmMode,reason:string|null=null):GenerationAudit{return{requestedMode:mode,effectiveMode:'deterministic',degraded:mode!=='deterministic',reason,provider:null,model:null,responseId:null,durationMs:0};}
