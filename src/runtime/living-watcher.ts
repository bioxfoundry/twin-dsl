import type { LivingIterationReceipt, LlmMode } from "../core/types.js";
import { LivingProjectRuntime } from "./living-project.js";

export class LivingProjectWatcher {
  #running = false;
  #timer:NodeJS.Timeout|undefined;
  #lastIteration:string|undefined;
  #consecutiveFailures = 0;

  constructor(readonly runtime=new LivingProjectRuntime()) {}

  async runOnce(config:string,out:string,mode:LlmMode):Promise<LivingIterationReceipt> {
    if(this.#running) throw new Error("LIVING_WATCH_BUILD_ALREADY_RUNNING");
    this.#running = true;
    try { return await this.runtime.iterate(config,out,mode); }
    finally { this.#running = false; }
  }

  start(
    config:string,
    out:string,
    mode:LlmMode="deterministic",
    intervalMs=Number(process.env.DT_WATCH_INTERVAL_MS??5000),
    onUpdate:(receipt:LivingIterationReceipt)=>void=()=>{},
  ):void {
    if(this.#timer) throw new Error("LIVING_WATCH_ALREADY_STARTED");
    const maxRetryMs = Number(process.env.DT_WATCH_MAX_RETRY_MS??60_000);
    const schedule = (delay:number):void=>{
      if(this.#timer) clearTimeout(this.#timer);
      this.#timer = setTimeout(()=>void tick(),delay);
    };
    const tick = async():Promise<void>=>{
      if(this.#running) { schedule(intervalMs); return; }
      try {
        const result = await this.runOnce(config,out,mode);
        this.#consecutiveFailures = 0;
        if(!result.noChange && result.iterationUri !== this.#lastIteration) onUpdate(result);
        this.#lastIteration = result.iterationUri;
        schedule(intervalMs);
      } catch(error) {
        this.#consecutiveFailures += 1;
        const project = await this.runtime.load(config).catch(()=>undefined);
        const failureExponent = Math.min(this.#consecutiveFailures,project?.policy.maxConsecutiveFailures??10);
        const retryAfterMs = Math.min(intervalMs * 2 ** failureExponent,maxRetryMs);
        const failure = await this.runtime.recordFailure(config,out,error,this.#consecutiveFailures,retryAfterMs);
        console.error(JSON.stringify(failure));
        schedule(retryAfterMs);
      }
    };
    void tick();
  }

  stop():void {
    if(this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
