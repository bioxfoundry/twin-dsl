import type { LivingIterationReceipt, LlmMode } from "../core/types.js";
import { LivingProjectRuntime } from "./living-project.js";
export class LivingProjectWatcher{
  #running=false;#timer:NodeJS.Timeout|undefined;#lastIteration:string|undefined;
  constructor(readonly runtime=new LivingProjectRuntime()){}
  async runOnce(config:string,out:string,mode:LlmMode):Promise<LivingIterationReceipt>{if(this.#running)throw new Error('LIVING_WATCH_BUILD_ALREADY_RUNNING');this.#running=true;try{return await this.runtime.iterate(config,out,mode);}finally{this.#running=false;}}
  start(config:string,out:string,mode:LlmMode='deterministic',intervalMs=Number(process.env.DT_WATCH_INTERVAL_MS??5000),onUpdate:(r:LivingIterationReceipt)=>void=()=>{}):void{
    if(this.#timer)throw new Error('LIVING_WATCH_ALREADY_STARTED');const tick=async()=>{if(this.#running)return;try{const result=await this.runOnce(config,out,mode);if(!result.noChange&&result.iterationUri!==this.#lastIteration)onUpdate(result);this.#lastIteration=result.iterationUri;}catch(error){console.error(error instanceof Error?error.message:String(error));}};void tick();this.#timer=setInterval(()=>void tick(),intervalMs);
  }
  stop():void{if(this.#timer)clearInterval(this.#timer);this.#timer=undefined;}
}
