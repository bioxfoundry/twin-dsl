import { ClickHouseHttpProjection } from "../adapters/clickhouse.js";
import { MqttClient } from "../transport/mqtt.js";

export interface ExternalServiceCheck {
  service: "clickhouse" | "docling" | "mqtt";
  ok: boolean;
  endpoint: string;
  detail: string;
  durationMs: number;
}

async function timed<T>(fn:()=>Promise<T>):Promise<{value:T;durationMs:number}>{
  const started=Date.now();
  return {value:await fn(),durationMs:Date.now()-started};
}

export async function checkExternalServices(options:{clickhouseUrl?:string;doclingUrl?:string;mqttUrl?:string;timeoutMs?:number}={}):Promise<{ok:boolean;checks:ExternalServiceCheck[]}>{
  const clickhouseUrl=(options.clickhouseUrl??process.env.CLICKHOUSE_URL??"http://127.0.0.1:8123").replace(/\/$/,"");
  const doclingUrl=(options.doclingUrl??process.env.DOCLING_URL??"http://127.0.0.1:5001").replace(/\/$/,"");
  const mqttUrl=options.mqttUrl??process.env.MQTT_URL??"mqtt://127.0.0.1:1883";
  const timeoutMs=options.timeoutMs??10_000;
  const checks:ExternalServiceCheck[]=[];

  try {
    const result=await timed(()=>new ClickHouseHttpProjection(clickhouseUrl,"service-check").query("SELECT 1 AS ok FORMAT JSONEachRow"));
    const parsed=JSON.parse(result.value.trim()) as {ok?:unknown};
    checks.push({service:"clickhouse",ok:parsed.ok===1,endpoint:clickhouseUrl,detail:result.value.trim(),durationMs:result.durationMs});
  } catch(error) {
    checks.push({service:"clickhouse",ok:false,endpoint:clickhouseUrl,detail:error instanceof Error?error.message:String(error),durationMs:0});
  }

  try {
    const result=await timed(async()=>{
      const response=await fetch(`${doclingUrl}/health`,{signal:AbortSignal.timeout(timeoutMs)});
      const text=await response.text();
      if(!response.ok)throw new Error(`DOCLING_HEALTH_HTTP:${response.status}:${text.slice(0,200)}`);
      return text;
    });
    checks.push({service:"docling",ok:true,endpoint:doclingUrl,detail:result.value.slice(0,200),durationMs:result.durationMs});
  } catch(error) {
    checks.push({service:"docling",ok:false,endpoint:doclingUrl,detail:error instanceof Error?error.message:String(error),durationMs:0});
  }

  try {
    const client=new MqttClient({url:mqttUrl,clientId:`biofoundry-service-check-${process.pid}`,connectTimeoutMs:timeoutMs});
    const result=await timed(async()=>{await client.connect();client.close();return"MQTT_CONNACK_ACCEPTED";});
    checks.push({service:"mqtt",ok:true,endpoint:redact(mqttUrl),detail:result.value,durationMs:result.durationMs});
  } catch(error) {
    checks.push({service:"mqtt",ok:false,endpoint:redact(mqttUrl),detail:error instanceof Error?error.message:String(error),durationMs:0});
  }

  return {ok:checks.every(check=>check.ok),checks};
}

function redact(raw:string):string{try{const url=new URL(raw);url.username="";url.password="";return url.toString();}catch{return"invalid";}}
