import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { checkExternalServices } from "../src/runtime/service-check.js";

async function start(handler:(req:import("node:http").IncomingMessage,res:import("node:http").ServerResponse)=>void):Promise<{server:Server;url:string}>{
  const server=createServer(handler);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();
  if(!address||typeof address==="string")throw new Error("TEST_SERVER_ADDRESS");
  return {server,url:`http://127.0.0.1:${address.port}`};
}

async function stop(server:Server):Promise<void>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}

test("service-check performs real ClickHouse query and Docling health request",async()=>{
  const clickhouse=await start((_req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.end('{"ok":1}\n');});
  const docling=await start((req,res)=>{assert.equal(req.url,"/health");res.writeHead(200,{"content-type":"application/json"});res.end('{"status":"ok"}');});
  try {
    const result=await checkExternalServices({clickhouseUrl:clickhouse.url,doclingUrl:docling.url,timeoutMs:1000});
    assert.equal(result.ok,true);
    assert.equal(result.checks.length,2);
    assert.deepEqual(result.checks.map(x=>x.service),["clickhouse","docling"]);
  } finally {
    await Promise.all([stop(clickhouse.server),stop(docling.server)]);
  }
});
