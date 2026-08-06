import type { DslGenerationResult, DslKind, LlmMode } from "../core/types.js";
import { canonicalJson, sha256 } from "../core/canonical.js";
import { Todo2CodeAdapter } from "../adapters/todo2code.js";
import { deterministicAudit, OpenRouterStructuredClient } from "./openrouter.js";
import { generationContract, type GeneratedDslValue } from "./dsl-schemas.js";

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
    if(options.kind==='intent'){
      if(options.mode==='deterministic'&&options.deterministicValue!==undefined)return this.deterministic(options,null);
      try{const value=await this.todo2code.extractNl(options.text,options.mode);return{schema:'subactor.dsl-generation-result/v1',kind:'intent',value,canonicalHash:sha256(canonicalJson(value)),audit:{requestedMode:options.mode,effectiveMode:options.mode==='deterministic'?'deterministic':'llm',degraded:false,reason:null,provider:options.mode==='deterministic'?null:'openrouter',model:options.mode==='deterministic'?null:(process.env.OPENROUTER_MODEL??null),responseId:null,durationMs:Date.now()-started}};}
      catch(error){if(options.mode==='prefer-llm'&&options.deterministicValue!==undefined)return this.deterministic(options,error instanceof Error?error.message:String(error));throw error;}
    }
    if(options.mode==='deterministic')return this.deterministic(options,null);
    const contract=generationContract(options.kind);
    try{
      const response=await this.llm.generate<GeneratedDslValue>({schemaName:contract.schemaName,schema:contract.schema,validate:contract.validate,system:[
        'You compile natural language into a proposed, machine-validated DSL artifact.',
        'Never invent immutable hashes, source citations, permissions, measurements, CAD geometry, or observed facts.',
        'Use only identifiers, URIs and values present in the supplied context.',
        'The result is a proposal; runtime validation and AQL/OQL approval remain authoritative.',
        contract.instructions,
      ].join('\n'),user:`REQUEST:\n${options.text}\n\nRUNTIME CONTEXT:\n${JSON.stringify(options.context??{},null,2)}`});
      response.audit.requestedMode=options.mode;
      return{schema:'subactor.dsl-generation-result/v1',kind:options.kind,value:response.value,canonicalHash:sha256(canonicalJson(response.value)),audit:response.audit};
    }catch(error){if(options.mode==='prefer-llm'&&options.deterministicValue!==undefined)return this.deterministic(options,error instanceof Error?error.message:String(error));throw error;}
  }
  private deterministic(options:CompileNlOptions,reason:string|null):DslGenerationResult{
    if(options.deterministicValue===undefined)throw new Error(`DETERMINISTIC_VALUE_REQUIRED:${options.kind}`);
    let value=options.deterministicValue;if(options.kind!=='intent'){const contract=generationContract(options.kind);value=contract.validate(value);}
    return{schema:'subactor.dsl-generation-result/v1',kind:options.kind,value,canonicalHash:sha256(canonicalJson(value)),audit:deterministicAudit(options.mode,reason)};
  }
}
