import { BiofoundryRuntime } from "./biofoundry.js";
import type { LlmMode, TwinBuildReceipt } from "../core/types.js";
export class RealtimeTwinWatcher{
  #running=false;#timer:NodeJS.Timeout|undefined;#lastHash:string|undefined;
  constructor(readonly runtime=new BiofoundryRuntime()){}
  async runOnce(config:string,out:string,mode:LlmMode):Promise<TwinBuildReceipt>{if(this.#running)throw new Error('WATCH_BUILD_ALREADY_RUNNING');this.#running=true;try{return await this.runtime.build(config,out,mode);}finally{this.#running=false;}}
  start(config:string,out:string,mode:LlmMode='deterministic',intervalMs=Number(process.env.DT_WATCH_INTERVAL_MS??2000),onUpdate:(r:TwinBuildReceipt)=>void=()=>{}):void{
    if(this.#timer)throw new Error('WATCH_ALREADY_STARTED');
    const tick=async()=>{if(this.#running)return;try{const r=await this.runOnce(config,out,mode);const changed=!r.noChange&&(this.#lastHash===undefined||r.sourceSnapshotHash!==this.#lastHash||r.diff.added.length+r.diff.changed.length+r.diff.removed.length>0);this.#lastHash=r.sourceSnapshotHash;if(changed)onUpdate(r);}catch(error){console.error(error instanceof Error?error.message:String(error));}};
    void tick();this.#timer=setInterval(()=>void tick(),intervalMs);
  }
  stop():void{if(this.#timer)clearInterval(this.#timer);this.#timer=undefined;}
}
