import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LivingProjectDocument, SourceRole } from "../core/types.js";
import { parseProjectDsl, renderProjectDsl, validateProject } from "../dsl/project.js";

export type ProjectProfile='generic'|'biofoundry';
export interface CreateProjectOptions { name:string; outDir:string; profile?:ProjectProfile; managerIntent?:string; }
function slug(value:string):string{const x=value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,63);if(x.length<2)throw new Error('PROJECT_NAME_TOO_SHORT');return x;}
function basePort(id:string):number{let n=0;for(const ch of id)n=(n*31+ch.charCodeAt(0))%1000;return 18000+n*4;}
async function exists(path:string):Promise<boolean>{try{await stat(path);return true;}catch{return false;}}
async function text(path:string,content:string):Promise<void>{await mkdir(dirname(path),{recursive:true});await writeFile(path,content);}
function compose(projectId:string,port:number):string{return `name: \${COMPOSE_PROJECT_NAME:-${projectId}}
services:
  clickhouse:
    image: clickhouse/clickhouse-server:26.3
    restart: unless-stopped
    ports:
      - "\${CLICKHOUSE_HTTP_PORT:-${port}}:8123"
      - "\${CLICKHOUSE_NATIVE_PORT:-${port+1}}:9000"
    volumes:
      - clickhouse-data:/var/lib/clickhouse
      - ./vendor/runtime/deploy/clickhouse/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8123/ping | grep -q Ok"]
      interval: 10s
      timeout: 5s
      retries: 12

  docling:
    build: ./vendor/runtime/deploy/docling
    restart: unless-stopped
    ports:
      - "\${DOCLING_PORT:-${port+2}}:5001"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5001/health')"]
      interval: 15s
      timeout: 10s
      retries: 20

  runtime:
    build: ./vendor/runtime
    restart: unless-stopped
    working_dir: /project
    command: ["project-watch", "/project/project.projectdsl", "/project/.living-runtime", "\${DT_LLM_MODE:-prefer-llm}"]
    environment:
      CLICKHOUSE_URL: http://clickhouse:8123
      DOCLING_URL: http://docling:5001
      DT_SEARCH_BACKEND: clickhouse
      DT_WATCH_INTERVAL_MS: \${DT_WATCH_INTERVAL_MS:-5000}
      OPENROUTER_API_KEY: \${OPENROUTER_API_KEY:-}
      OPENROUTER_MODEL: \${OPENROUTER_MODEL:-mistralai/codestral-2508}
      OPENROUTER_DATA_COLLECTION: \${OPENROUTER_DATA_COLLECTION:-deny}
      T2C_ROOT: /todo2code
      T2C_BIN: /todo2code/dist/src/cli.js
    volumes:
      - ./:/project
      - \${T2C_HOST_ROOT:-./vendor/todo2code}:/todo2code:ro
    depends_on:
      clickhouse:
        condition: service_healthy
      docling:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "/opt/runtime/dist/src/cli/main.js", "project-verify", "/project/project.projectdsl"]
      interval: 30s
      timeout: 20s
      retries: 5

volumes:
  clickhouse-data:
`;
}
function ciWorkflow():string{return `name: Living Digital Twin CI
on:
  push:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Verify project contract
        run: node vendor/runtime/dist/src/cli/main.js project-verify project.projectdsl
      - name: Validate Docker Compose
        run: docker compose config -q
      - name: Build runtime services
        run: docker compose build runtime docling
      - name: Run one deterministic iteration
        run: docker compose run --rm -e DT_LLM_MODE=deterministic runtime project-iterate /project/project.projectdsl /project/.living-runtime deterministic
      - uses: actions/upload-artifact@v4
        with:
          name: living-digital-twin-artifacts
          path: .living-runtime
`;
}
function releaseWorkflow():string{return `name: Living Digital Twin Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:
permissions:
  contents: read
  packages: write
jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ./vendor/runtime
          push: true
          tags: ghcr.io/\${{ github.repository }}/digital-twin-runtime:\${{ github.ref_name }}
      - name: Package deployment configuration
        run: tar -czf living-project-deployment.tgz docker-compose.yml project.projectdsl .env.example config data code logs environment
      - uses: actions/upload-artifact@v4
        with:
          name: living-project-deployment
          path: living-project-deployment.tgz
`;
}
function readme(name:string):string{return `# ${name} — Living Digital Twin

This project was generated by Subactor Digital Twin Runtime Starter.

## First run

\`\`\`bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f runtime
\`\`\`

One deterministic iteration without starting the long-running watcher:

\`\`\`bash
docker compose run --rm runtime project-iterate /project/project.projectdsl /project/.living-runtime deterministic
\`\`\`

Add any source immediately:

\`\`\`bash
node vendor/runtime/dist/src/cli/main.js project-add-source project.projectdsl customer /absolute/path/to/specification.pdf
node vendor/runtime/dist/src/cli/main.js project-add-source project.projectdsl archive /absolute/path/to/archive.zip
node vendor/runtime/dist/src/cli/main.js project-add-source project.projectdsl development /absolute/path/to/code
\`\`\`

The runtime writes candidates, approved current artifacts, DSL observations, iteration receipts and an append-only event log under \`.living-runtime/\`.
`;
}
async function vendorRuntime(target:string):Promise<void>{const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),vendor=join(target,'vendor/runtime');await mkdir(vendor,{recursive:true});for(const entry of ['dist','schemas','proto','deploy']){const source=join(root,entry);if(await exists(source))await cp(source,join(vendor,entry),{recursive:true});}await text(join(vendor,'package.json'),JSON.stringify({name:'living-digital-twin-runtime-image',version:'0.3.0',private:true,type:'module'},null,2)+'\n');await text(join(vendor,'Dockerfile'),`FROM node:22-bookworm-slim\nWORKDIR /opt/runtime\nCOPY dist ./dist\nCOPY schemas ./schemas\nCOPY proto ./proto\nCOPY package.json ./package.json\nENTRYPOINT ["node", "/opt/runtime/dist/src/cli/main.js"]\n`);await mkdir(join(target,'vendor/todo2code'),{recursive:true});await text(join(target,'vendor/todo2code/README.md'),'Mount a built local semcod/todo2code checkout through T2C_HOST_ROOT or vendor it here.\n');}
export async function createLivingProject(options:CreateProjectOptions):Promise<{projectDir:string;configPath:string;composePath:string}>{
  const id=slug(options.name),projectDir=resolve(options.outDir),profile=options.profile??'generic',port=basePort(id);if(await exists(projectDir)){const entries=await readdir(projectDir);if(entries.length)throw new Error(`PROJECT_DIRECTORY_NOT_EMPTY:${projectDir}`);}await mkdir(projectDir,{recursive:true});
  for(const dir of ['data/manager','data/customer','data/project','data/archives','feedback','code/src','logs','environment','config','artifacts','project/ticket-001','.github/workflows','scripts'])await mkdir(join(projectDir,dir),{recursive:true});
  const managerIntent=options.managerIntent??'Continuously improve a validated Digital Twin from manager policy, customer documentation, code evidence and runtime observations.';
  const project:LivingProjectDocument={schema:'subactor.living-project/v1',id,name:options.name,profile,managerIntent,sources:[
    {path:'data/manager',role:'manager',logicalRoot:`subactor://project/${id}/manager`,labels:['authority','policy']},
    {path:'data/customer',role:'customer',logicalRoot:`subactor://project/${id}/customer`,labels:['requirements']},
    {path:'data/project',role:'project',logicalRoot:`subactor://project/${id}/data`,labels:['research']},
    {path:'data/archives',role:'archive',logicalRoot:`subactor://project/${id}/archives`,labels:['historical']},
    {path:'feedback',role:'derived',logicalRoot:`subactor://project/${id}/feedback`,labels:['feedback']},
    {path:'code',role:'development',logicalRoot:`subactor://project/${id}/development`,labels:['code']},
    {path:'logs',role:'runtime',logicalRoot:`subactor://project/${id}/logs`,labels:['runtime-log']},
    {path:'environment',role:'runtime',logicalRoot:`subactor://project/${id}/environment`,labels:['environment']},
  ],development:{root:'code',task:'TASK.md',todo:'TODO.md',changelog:'CHANGELOG.md',docs:['README.md','docs/**/*.md'],fixture:'config/development.intent.fixture.json'},observations:{paths:['logs','environment'],logicalRoot:`subactor://project/${id}/runtime`},policy:{approved:true,requireResearch:true,requireDevelopmentEvidence:true,requireRuntimeEvidence:true,autoPublishScene:true,allowRuntimeSelfModification:false,maxIterationsPerHour:12},scene:{format:'openusd'}};
  validateProject(project);await text(join(projectDir,'project.projectdsl'),renderProjectDsl(project));await text(join(projectDir,'project.json'),JSON.stringify(project,null,2)+'\n');await text(join(projectDir,'data/manager/policy.md'),`# Manager policy\n\n${managerIntent}\n\nRuntime self-modification remains disabled until a signed AQL/OQL approval and verified rollback exist.\n`);await text(join(projectDir,'data/customer/README.md'),'# Customer documentation\n\nPlace specifications, PDFs, images, spreadsheets, CAD/BIM references and ZIP archives here.\n');await text(join(projectDir,'data/project/context.md'),'# Project research context\n\nAdd project facts and research evidence here.\n');await text(join(projectDir,'code/TASK.md'),`# Task\n\nBuild and continuously validate the ${options.name} Digital Twin runtime.\n`);await text(join(projectDir,'code/TODO.md'),'- [ ] Connect the real todo2code checkout and replace the development fixture.\n');await text(join(projectDir,'code/CHANGELOG.md'),'# Changelog\n\n## Unreleased\n\n- Generated living project.\n');await text(join(projectDir,'code/README.md'),`# ${options.name} code workspace\n`);await text(join(projectDir,'code/src/index.ts'),'export const runtimeModel = "living-digital-twin";\n');await text(join(projectDir,'logs/runtime.jsonl'),JSON.stringify({observedAt:'2026-01-01T00:00:00.000Z',subjectUri:`subactor://project/${id}/runtime`,status:'ready',severity:'info',labels:['bootstrap']})+'\n');await text(join(projectDir,'environment/current.json'),JSON.stringify({observedAt:'2026-01-01T00:00:00.000Z',subjectUri:`subactor://project/${id}/environment`,temperatureC:22,availability:true,severity:'info',unit:'mixed'},null,2)+'\n');await text(join(projectDir,'config/development.intent.fixture.json'),JSON.stringify([{schema:'t2c.intent/v1',id:`${id}-request-1`,type:'request',text:managerIntent,actor:'human:manager',targetUris:[`subactor://project/${id}`]},{schema:'t2c.intent/v1',id:`${id}-plan-1`,type:'plan',text:'Research, develop, validate and publish the next Digital Twin projection.',actor:'agent:project-operator',targetUris:[`twin://project/runtime/state/rebuild`]}],null,2)+'\n');await text(join(projectDir,'project/ticket-001/user-manager.md'),`---\ntype: request\n---\n${managerIntent}\n`);await text(join(projectDir,'project/ticket-001/ai-agent.md'),'## Execution Plan\n\nRun research → development evidence → observations → reasoning → twin → scene → feedback.\n');
  await text(join(projectDir,'.env.example'),`COMPOSE_PROJECT_NAME=${id}\nCLICKHOUSE_HTTP_PORT=${port}\nCLICKHOUSE_NATIVE_PORT=${port+1}\nDOCLING_PORT=${port+2}\nDT_LLM_MODE=prefer-llm\nDT_WATCH_INTERVAL_MS=5000\nOPENROUTER_API_KEY=\nOPENROUTER_MODEL=mistralai/codestral-2508\nOPENROUTER_DATA_COLLECTION=deny\nT2C_HOST_ROOT=./vendor/todo2code\n`);await text(join(projectDir,'.gitignore'),'.env\n.living-runtime/\nartifacts/\nvendor/todo2code/*\n!vendor/todo2code/README.md\n');await text(join(projectDir,'docker-compose.yml'),compose(id,port));await text(join(projectDir,'.github/workflows/ci.yml'),ciWorkflow());await text(join(projectDir,'.github/workflows/release.yml'),releaseWorkflow());await text(join(projectDir,'README.md'),readme(options.name));await text(join(projectDir,'scripts/up.sh'),'#!/usr/bin/env bash\nset -euo pipefail\ndocker compose up -d --build\n');await text(join(projectDir,'scripts/down.sh'),'#!/usr/bin/env bash\nset -euo pipefail\ndocker compose down\n');await text(join(projectDir,'scripts/iterate.sh'),'#!/usr/bin/env bash\nset -euo pipefail\ndocker compose run --rm runtime project-iterate /project/project.projectdsl /project/.living-runtime "${DT_LLM_MODE:-deterministic}"\n');await vendorRuntime(projectDir);return{projectDir,configPath:join(projectDir,'project.projectdsl'),composePath:join(projectDir,'docker-compose.yml')};
}
export async function addProjectSource(configPath:string,role:SourceRole,path:string):Promise<LivingProjectDocument>{const absolute=resolve(configPath),base=dirname(absolute),doc=parseProjectDsl(await readFile(absolute,'utf8'));const sourcePath=resolve(path),relativePath=relative(base,sourcePath)||'.';if(!await exists(sourcePath))throw new Error(`SOURCE_NOT_FOUND:${sourcePath}`);doc.sources.push({path:relativePath,role,logicalRoot:`subactor://project/${doc.id}/${role}/external-${doc.sources.length+1}`,labels:['external']});validateProject(doc);await writeFile(absolute,renderProjectDsl(doc));await writeFile(join(base,'project.json'),JSON.stringify(doc,null,2)+'\n');return doc;}
export async function verifyLivingProject(configPath:string):Promise<{ok:boolean;projectId:string;checks:Array<{name:string;ok:boolean;message:string}>}>{const absolute=resolve(configPath),base=dirname(absolute),doc=parseProjectDsl(await readFile(absolute,'utf8')),checks:Array<{name:string;ok:boolean;message:string}>=[];for(const source of doc.sources){const p=resolve(base,source.path),ok=await exists(p);checks.push({name:`source:${source.role}:${source.path}`,ok,message:ok?'available':`missing ${p}`});}for(const path of ['docker-compose.yml','vendor/runtime/dist/src/cli/main.js','.github/workflows/ci.yml','.github/workflows/release.yml']){const ok=await exists(join(base,path));checks.push({name:path,ok,message:ok?'available':'missing'});}return{ok:checks.every(x=>x.ok),projectId:doc.id,checks};}
