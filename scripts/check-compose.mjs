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
console.log(JSON.stringify({ok:true,services:['clickhouse','docling','runtime'],checks:['healthchecks','service-healthy-dependencies','secret-indirection','internal-service-urls']}));
