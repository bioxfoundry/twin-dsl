import {readFile} from 'node:fs/promises';

const text=await readFile('docker-compose.yml','utf8');
const required=[
  'services:',
  'clickhouse:',
  'docling:',
  'runtime:',
  'healthcheck:',
  'depends_on:',
  'condition: service_healthy',
  'volumes:',
  'CLICKHOUSE_URL: http://clickhouse:8123',
  'DOCLING_URL: http://docling:5001',
];
for(const token of required)if(!text.includes(token))throw new Error(`COMPOSE_TOKEN_MISSING:${token}`);
const secretLine=text.split(/\r?\n/).find(line=>line.includes('OPENROUTER_API_KEY:'));
if(!secretLine)throw new Error('COMPOSE_SECRET_VARIABLE_MISSING');
const value=secretLine.split('OPENROUTER_API_KEY:')[1].trim();
if(value&&!value.startsWith('${'))throw new Error('COMPOSE_SECRET_LITERAL');
if(/OPENROUTER_API_KEY:\s*['"]?sk-/i.test(text))throw new Error('COMPOSE_SECRET_LOOKS_LIKE_KEY');

// The clickhouse image restricts user `default` to 127.0.0.1 unless CLICKHOUSE_USER or
// CLICKHOUSE_PASSWORD is set, which makes every cross-container query fail with HTTP 401.
// Both the server and the runtime that queries it need the credentials.
const credentialCount=(name)=>text.split(/\r?\n/).filter(line=>line.trim().startsWith(`${name}:`)).length;
for(const name of ['CLICKHOUSE_USER','CLICKHOUSE_PASSWORD']){
  if(credentialCount(name)<2)throw new Error(`COMPOSE_CLICKHOUSE_CREDENTIAL_MISSING:${name}`);
}
// Docker's default address pools run out on hosts with many stacks; the subnet must stay pinned.
if(!/ipam:/.test(text)||!/subnet:/.test(text))throw new Error('COMPOSE_NETWORK_SUBNET_UNPINNED');

console.log(JSON.stringify({ok:true,services:['clickhouse','docling','runtime'],checks:['healthchecks','service-healthy-dependencies','secret-indirection','internal-service-urls','clickhouse-credentials','pinned-network-subnet']}));
