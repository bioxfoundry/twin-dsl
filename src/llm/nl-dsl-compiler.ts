import type { DslGenerationResult, DslKind, LlmMode } from "../core/types.js";
import { canonicalJson, sha256 } from "../core/canonical.js";
import { Todo2CodeAdapter } from "../adapters/todo2code.js";
import { deterministicAudit, OpenRouterStructuredClient } from "./openrouter.js";
import { generationContract, type GeneratedDslValue } from "./dsl-schemas.js";
import { applyPatchDsl, patchEnvelopeSchema, renderPatchContext, renderPatchPolicy, validatePatchEnvelope } from "./patch-dsl.js";
import { validateT2cIntent } from "../dsl/intent.js";

export interface CompileNlOptions {
  kind:DslKind;
  text:string;
  context?:unknown;
  mode:LlmMode;
  deterministicValue?:unknown;
}
export class NlDslCompiler {
  constructor(readonly llm=new OpenRouterStructuredClient(),readonly todo2code=new Todo2CodeAdapter()){}
  async compile(options:CompileNlOptions):Promise<DslGenerationResult>{
    const started=Date.now();
    let working=options;
    if(options.kind==='intent'&&options.deterministicValue===undefined){
      try{working={...options,deterministicValue:await this.todo2code.extractNl(options.text,'deterministic')};}
      catch(error){if(options.mode==='deterministic')throw error;}
    }
    if(working.mode==='deterministic')return this.deterministic(working,null);
    const contract=generationContract(working.kind);
    const base=working.kind==='intent'?{document:working.deterministicValue??[]}:(working.deterministicValue??{});
    const allowedRoots=contract.schemaName.endsWith('_dsl')||contract.schemaName.includes('query')||contract.schemaName.includes('dql')?['/dsl']:['/document'];
    try{
      const response=await this.llm.generate<GeneratedDslValue>({schemaName:'subactor_patch_envelope',schema:patchEnvelopeSchema,validate:value=>{
        const envelope=validatePatchEnvelope(value);
        const patched=applyPatchDsl(base,envelope.patchDsl,{target:working.kind,allowedRoots});
        return contract.validate(patched);
      },system:renderPatchPolicy(working.kind,contract.schema,contract.instructions),user:renderPatchContext({target:working.kind,request:working.text,base,context:working.context??{},allowedRoots})});
      response.audit.requestedMode=working.mode;
      return{schema:'subactor.dsl-generation-result/v1',kind:working.kind,value:response.value,canonicalHash:sha256(canonicalJson(response.value)),audit:response.audit};
    }catch(error){
      if(working.mode==='prefer-llm'&&working.deterministicValue!==undefined){
        const fallback=this.deterministic(working,error instanceof Error?error.message:String(error));
        fallback.audit.durationMs=Date.now()-started;
        return fallback;
      }
      throw error;
    }
  }
  private deterministic(options:CompileNlOptions,reason:string|null):DslGenerationResult{
    if(options.deterministicValue===undefined)throw new Error(`DETERMINISTIC_VALUE_REQUIRED:${options.kind}`);
    let value=options.deterministicValue;if(options.kind==='intent')value=validateT2cIntent(value);else{const contract=generationContract(options.kind);value=contract.validate(value);}
    return{schema:'subactor.dsl-generation-result/v1',kind:options.kind,value,canonicalHash:sha256(canonicalJson(value)),audit:deterministicAudit(options.mode,reason)};
  }
}
