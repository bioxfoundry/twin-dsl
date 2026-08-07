import { appendFile, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LivingProjectDocument, SourceRole } from "../core/types.js";
import { parseProjectDsl, renderProjectDsl, validateProject } from "../dsl/project.js";
import { sha256 } from "../core/canonical.js";
import { biofoundryLiveBlueprintV02 } from "../scene/blueprint.js";

export type ProjectProfile = "generic" | "biofoundry";
export interface CreateProjectOptions { name:string; outDir:string; profile?:ProjectProfile; managerIntent?:string; }

function slug(value:string):string {
  const normalized = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,63);
  if(normalized.length < 2) throw new Error("PROJECT_NAME_TOO_SHORT");
  return normalized;
}
function basePort(id:string):number { let value=0; for(const character of id) value=(value*31+character.charCodeAt(0))%1000; return 18000+value*4; }
async function exists(path:string):Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
async function text(path:string,content:string):Promise<void> { await mkdir(dirname(path),{recursive:true}); await writeFile(path,content); }

function compose(projectId:string,port:number):string { return `name: \${COMPOSE_PROJECT_NAME:-${projectId}}
services:
  clickhouse:
    image: clickhouse/clickhouse-server:26.3
    restart: unless-stopped
    environment:
      CLICKHOUSE_USER: \${CLICKHOUSE_USER:-digital_twin}
      CLICKHOUSE_PASSWORD: \${CLICKHOUSE_PASSWORD:-digital_twin_local}
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
      CLICKHOUSE_USER: \${CLICKHOUSE_USER:-digital_twin}
      CLICKHOUSE_PASSWORD: \${CLICKHOUSE_PASSWORD:-digital_twin_local}
      DOCLING_URL: http://docling:5001
      DT_SEARCH_BACKEND: clickhouse
      DT_WATCH_INTERVAL_MS: \${DT_WATCH_INTERVAL_MS:-5000}
      DT_WATCH_MAX_RETRY_MS: \${DT_WATCH_MAX_RETRY_MS:-60000}
      DT_LEASE_STALE_MS: \${DT_LEASE_STALE_MS:-300000}
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
`; }

function ciWorkflow():string { return `name: Living Digital Twin CI
on:
  push:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Bootstrap canonical todo2code
        run: bash scripts/bootstrap-todo2code.sh
      - name: Verify project contract
        run: node vendor/runtime/dist/src/cli/main.js project-verify project.projectdsl
      - name: Validate Docker Compose
        run: docker compose config -q
      - name: Build runtime services
        run: docker compose build runtime docling
      - name: Start read-model services
        run: docker compose up -d --wait clickhouse docling
      - name: Verify ClickHouse and Docling connections
        run: docker compose run --rm runtime service-check
      - name: Run one deterministic iteration
        run: docker compose run --rm -e DT_LLM_MODE=deterministic runtime project-iterate /project/project.projectdsl /project/.living-runtime deterministic
      - name: Inspect autonomy status
        run: docker compose run --rm runtime project-status /project/.living-runtime
      - name: Stop services
        if: always()
        run: docker compose down -v
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: living-digital-twin-artifacts
          path: .living-runtime
`; }

function releaseWorkflow():string { return `name: Living Digital Twin Release
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
        run: tar --exclude='vendor/todo2code' --exclude='.living-runtime' -czf living-project-deployment.tgz docker-compose.yml project.projectdsl .env.example config data code logs environment scripts vendor/runtime
      - uses: actions/upload-artifact@v4
        with:
          name: living-project-deployment
          path: living-project-deployment.tgz
`; }

function readme(name:string):string { return `# ${name} — Living Digital Twin

Generated by Subactor Digital Twin Runtime Starter 0.4.0.

## First run

\`\`\`bash
bash scripts/bootstrap-todo2code.sh
cp .env.example .env
docker compose up -d --build --wait
docker compose logs -f runtime
\`\`\`

One deterministic iteration:

\`\`\`bash
docker compose run --rm runtime project-iterate /project/project.projectdsl /project/.living-runtime deterministic
docker compose run --rm runtime project-status /project/.living-runtime
\`\`\`

## Add sources

External files and directories are copied into \`imports/\`, so they remain visible inside the project Docker boundary:

\`\`\`bash
node vendor/runtime/dist/src/cli/main.js project-add-source project.projectdsl customer /absolute/path/to/specification.pdf
node vendor/runtime/dist/src/cli/main.js project-add-source project.projectdsl archive /absolute/path/to/archive.zip
node vendor/runtime/dist/src/cli/main.js project-add-source project.projectdsl development /absolute/path/to/code
node vendor/runtime/dist/src/cli/main.js project-add-website project.projectdsl https://example.com "digital twin, process, requirements"
\`\`\`

The runtime writes candidates, approved current artifacts, observations, development evidence, improvementDSL, receipts, failures and append-only event logs under \`.living-runtime/\`.
`; }

async function vendorRuntime(target:string):Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here,"../../..");
  const vendor = join(target,"vendor/runtime");
  await mkdir(vendor,{recursive:true});
  for(const entry of ["dist","schemas","proto","deploy"]) {
    const source = join(root,entry);
    if(await exists(source)) await cp(source,join(vendor,entry),{recursive:true});
  }
  await text(join(vendor,"package.json"),JSON.stringify({name:"living-digital-twin-runtime-image",version:"0.4.0",private:true,type:"module"},null,2)+"\n");
  await text(join(vendor,"Dockerfile"),`FROM node:22-bookworm-slim
WORKDIR /opt/runtime
COPY dist ./dist
COPY schemas ./schemas
COPY proto ./proto
COPY package.json ./package.json
ENTRYPOINT ["node", "/opt/runtime/dist/src/cli/main.js"]
`);
  await mkdir(join(target,"vendor/todo2code"),{recursive:true});
  await text(join(target,"vendor/todo2code/README.md"),"Run scripts/bootstrap-todo2code.sh or mount a built semcod/todo2code checkout through T2C_HOST_ROOT.\n");
}

export async function createLivingProject(options:CreateProjectOptions):Promise<{projectDir:string;configPath:string;composePath:string}> {
  const id = slug(options.name);
  const projectDir = resolve(options.outDir);
  const profile = options.profile??"generic";
  const port = basePort(id);
  if(await exists(projectDir)) { const entries=await readdir(projectDir); if(entries.length) throw new Error(`PROJECT_DIRECTORY_NOT_EMPTY:${projectDir}`); }
  await mkdir(projectDir,{recursive:true});
  for(const directory of ["data/manager","data/customer","data/project","data/archives","imports","feedback","code/src","logs","environment","config","artifacts","project/ticket-001",".github/workflows","scripts","baseline","models"]) await mkdir(join(projectDir,directory),{recursive:true});
  const managerIntent = options.managerIntent??"Continuously improve a validated Digital Twin from manager policy, customer documentation, code evidence and runtime observations.";
  const project:LivingProjectDocument = {
    schema:"subactor.living-project/v1",id,name:options.name,profile,managerIntent,
    sources:[
      {path:"data/manager",role:"manager",logicalRoot:`subactor://project/${id}/manager`,labels:["authority","policy"]},
      {path:"data/customer",role:"customer",logicalRoot:`subactor://project/${id}/customer`,labels:["requirements"]},
      {path:"data/project",role:"project",logicalRoot:`subactor://project/${id}/data`,labels:["research"]},
      {path:"data/archives",role:"archive",logicalRoot:`subactor://project/${id}/archives`,labels:["historical"]},
      {path:"feedback",role:"derived",logicalRoot:`subactor://project/${id}/feedback`,labels:["feedback"]},
      {path:"code",role:"development",logicalRoot:`subactor://project/${id}/development`,labels:["code"]},
      {path:"logs",role:"runtime",logicalRoot:`subactor://project/${id}/logs`,labels:["runtime-log"]},
      {path:"environment",role:"runtime",logicalRoot:`subactor://project/${id}/environment`,labels:["environment"]},
    ],
    development:{root:"code",task:"TASK.md",todo:"TODO.md",changelog:"CHANGELOG.md",docs:["README.md","docs/**/*.md"],fixture:"config/development.intent.fixture.json"},
    observations:{paths:["logs","environment"],logicalRoot:`subactor://project/${id}/runtime`},
    policy:{approved:true,requireResearch:true,requireDevelopmentEvidence:true,requireDevelopmentAcceptance:true,allowDevelopmentFixture:true,requireRuntimeEvidence:true,autoPublishScene:true,allowRuntimeSelfModification:false,autonomyMode:"propose",requireSignedMutationGrant:true,maxIterationsPerHour:12,maxConsecutiveFailures:5},
    scene:{format:"openusd",...(profile==="biofoundry"?{blueprintFile:"baseline/scene-blueprint.json"}:{})},
  };
  validateProject(project);
  await text(join(projectDir,"project.projectdsl"),renderProjectDsl(project));
  await text(join(projectDir,"project.json"),JSON.stringify(project,null,2)+"\n");
  if(profile==="biofoundry") await text(join(projectDir,"baseline/scene-blueprint.json"),JSON.stringify(biofoundryLiveBlueprintV02(),null,2)+"\n");
  await text(join(projectDir,"data/manager/policy.md"),`# Manager policy\n\n${managerIntent}\n\nRuntime self-modification remains disabled until an apply-mode policy, signed mutation grant, isolated change plan and independent acceptance exist.\n`);
  await text(join(projectDir,"data/customer/README.md"),"# Customer documentation\n\nPlace specifications, PDFs, images, spreadsheets, CAD/BIM references and ZIP archives here.\n");
  await text(join(projectDir,"data/project/context.md"),"# Project research context\n\nAdd project facts and research evidence here.\n");
  await text(join(projectDir,"code/TASK.md"),`# Task\n\nBuild and continuously validate the ${options.name} Digital Twin runtime.\n`);
  await text(join(projectDir,"code/TODO.md"),"- [ ] Connect and validate the canonical todo2code pipeline.\n- [ ] Review generated improvementDSL before any code mutation.\n");
  await text(join(projectDir,"code/CHANGELOG.md"),"# Changelog\n\n## Unreleased\n\n- Generated living project.\n");
  await text(join(projectDir,"code/README.md"),`# ${options.name} code workspace\n`);
  await text(join(projectDir,"code/src/index.ts"),"export const runtimeModel = \"living-digital-twin\";\n");
  await text(join(projectDir,"logs/runtime.jsonl"),JSON.stringify({observedAt:"2026-01-01T00:00:00.000Z",subjectUri:`subactor://project/${id}/runtime`,status:"ready",severity:"info",labels:["bootstrap"]})+"\n");
  await text(join(projectDir,"environment/current.json"),JSON.stringify({observedAt:"2026-01-01T00:00:00.000Z",subjectUri:`subactor://project/${id}/environment`,temperatureC:22,availability:true,severity:"info",unit:"mixed"},null,2)+"\n");
  await text(join(projectDir,"config/development.intent.fixture.json"),JSON.stringify([
    {schema:"t2c.intent/v1",id:`${id}-request-1`,type:"request",text:managerIntent,actor:"human:manager",targetUris:[`subactor://project/${id}`]},
    {schema:"t2c.intent/v1",id:`${id}-plan-1`,type:"plan",text:"Research, develop, validate and publish the next Digital Twin projection.",actor:"agent:project-operator",targetUris:["twin://project/runtime/state/rebuild"]},
  ],null,2)+"\n");
  await text(join(projectDir,"project/ticket-001/user-manager.md"),`---\ntype: request\n---\n${managerIntent}\n`);
  await text(join(projectDir,"project/ticket-001/ai-agent.md"),"## Execution Plan\n\nRun research → todo2code development evidence → observations → deterministic gates → twin → scene → improvementDSL → feedback.\n");
  await text(join(projectDir,".env.example"),`COMPOSE_PROJECT_NAME=${id}\nCLICKHOUSE_USER=digital_twin\nCLICKHOUSE_PASSWORD=digital_twin_local\nCLICKHOUSE_HTTP_PORT=${port}\nCLICKHOUSE_NATIVE_PORT=${port+1}\nDOCLING_PORT=${port+2}\nDT_LLM_MODE=prefer-llm\nDT_WATCH_INTERVAL_MS=5000\nDT_WATCH_MAX_RETRY_MS=60000\nDT_LEASE_STALE_MS=300000\nOPENROUTER_API_KEY=\nOPENROUTER_MODEL=mistralai/codestral-2508\nOPENROUTER_DATA_COLLECTION=deny\nT2C_HOST_ROOT=./vendor/todo2code\n`);
  await text(join(projectDir,".gitignore"),".env\n.living-runtime/\nartifacts/\nvendor/todo2code/*\n!vendor/todo2code/README.md\n");
  await text(join(projectDir,"docker-compose.yml"),compose(id,port));
  await text(join(projectDir,".github/workflows/ci.yml"),ciWorkflow());
  await text(join(projectDir,".github/workflows/release.yml"),releaseWorkflow());
  await text(join(projectDir,"README.md"),readme(options.name));
  await text(join(projectDir,"scripts/up.sh"),"#!/usr/bin/env bash\nset -euo pipefail\nbash scripts/bootstrap-todo2code.sh\ndocker compose up -d --build --wait\n");
  await text(join(projectDir,"scripts/down.sh"),"#!/usr/bin/env bash\nset -euo pipefail\ndocker compose down\n");
  await text(join(projectDir,"scripts/iterate.sh"),"#!/usr/bin/env bash\nset -euo pipefail\ndocker compose run --rm runtime project-iterate /project/project.projectdsl /project/.living-runtime \"${DT_LLM_MODE:-deterministic}\"\n");
  await text(join(projectDir,"scripts/bootstrap-todo2code.sh"),`#!/usr/bin/env bash
set -euo pipefail
root="\${T2C_HOST_ROOT:-vendor/todo2code}"
if [[ -f "$root/dist/src/cli.js" ]]; then exit 0; fi
rm -rf "$root"
git clone --depth 1 https://github.com/semcod/todo2code.git "$root"
npm --prefix "$root" install
npm --prefix "$root" run build
`);
  await vendorRuntime(projectDir);
  return {projectDir,configPath:join(projectDir,"project.projectdsl"),composePath:join(projectDir,"docker-compose.yml")};
}

export async function addProjectSource(configPath:string,role:SourceRole,path:string):Promise<LivingProjectDocument> {
  const absoluteConfig = resolve(configPath);
  const base = dirname(absoluteConfig);
  const document = parseProjectDsl(await readFile(absoluteConfig,"utf8"));
  const sourcePath = resolve(path);
  if(!await exists(sourcePath)) throw new Error(`SOURCE_NOT_FOUND:${sourcePath}`);
  let projectPath = sourcePath;
  const relativeCandidate = relative(base,sourcePath);
  if(relativeCandidate.startsWith("..") || relativeCandidate === "") {
    const importedName = `${basename(sourcePath).replace(/[^A-Za-z0-9._-]/g,"-")}-${sha256(sourcePath).slice(0,8)}`;
    projectPath = join(base,"imports",role,importedName);
    await mkdir(dirname(projectPath),{recursive:true});
    await cp(sourcePath,projectPath,{recursive:true,force:true});
    await appendFile(join(base,"imports","manifest.jsonl"),JSON.stringify({schema:"subactor.source-import/v1",role,originalPath:sourcePath,importedPath:relative(base,projectPath),importedAt:new Date().toISOString()})+"\n");
  }
  const relativePath = relative(base,projectPath)||".";
  if(!document.sources.some(source=>source.path===relativePath&&source.role===role)) document.sources.push({path:relativePath,role,logicalRoot:`subactor://project/${document.id}/${role}/external-${document.sources.length+1}`,labels:["external","imported"]});
  validateProject(document);
  await writeFile(absoluteConfig,renderProjectDsl(document));
  await writeFile(join(base,"project.json"),JSON.stringify(document,null,2)+"\n");
  return document;
}

export async function addProjectWebsite(configPath:string,url:string,contextTerms:string[]=[]):Promise<LivingProjectDocument> {
  const absoluteConfig = resolve(configPath);
  const base = dirname(absoluteConfig);
  const document = parseProjectDsl(await readFile(absoluteConfig,"utf8"));
  const parsed = new URL(url);
  if(parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("PROJECT_WEBSITE_PROTOCOL_INVALID");
  const dqlPath = "config/research.dql";
  const dql = [
    `DQL ${document.id}-web-research`,
    `SITEMAPS [${JSON.stringify(new URL("/sitemap.xml",parsed).toString())}]`,
    `SEEDS [${JSON.stringify(parsed.toString())}]`,
    `ALLOW_HOSTS [${JSON.stringify(parsed.hostname)}]`,
    "INCLUDE_PATHS [\"/\"]",
    "EXCLUDE_PATHS [\"/login\", \"/admin\"]",
    `CONTEXT [${contextTerms.map(term=>JSON.stringify(term)).join(", ")}]`,
    "MAX_URLS 100",
    "MAX_SITEMAPS 10",
    "SAME_ORIGIN true",
    "RESPECT_ROBOTS true",
    "OUTPUT markdown",
    "VALIDATIONS [\"source-uri\", \"content-hash\", \"same-origin\"]",
  ].join("\n")+"\n";
  await text(join(base,dqlPath),dql);
  document.webResearch = {dqlFile:dqlPath};
  validateProject(document);
  await writeFile(absoluteConfig,renderProjectDsl(document));
  await writeFile(join(base,"project.json"),JSON.stringify(document,null,2)+"\n");
  return document;
}

export async function verifyLivingProject(configPath:string):Promise<{ok:boolean;projectId:string;checks:Array<{name:string;ok:boolean;message:string}>}> {
  const absolute = resolve(configPath);
  const base = dirname(absolute);
  const document = parseProjectDsl(await readFile(absolute,"utf8"));
  const checks:Array<{name:string;ok:boolean;message:string}> = [];
  for(const source of document.sources) {
    const path = resolve(base,source.path);
    const ok = await exists(path);
    checks.push({name:`source:${source.role}:${source.path}`,ok,message:ok?"available":`missing ${path}`});
  }
  for(const path of ["docker-compose.yml","vendor/runtime/dist/src/cli/main.js",".github/workflows/ci.yml",".github/workflows/release.yml","scripts/bootstrap-todo2code.sh"]) {
    const ok = await exists(join(base,path));
    checks.push({name:path,ok,message:ok?"available":"missing"});
  }
  const t2cAvailable = await exists(join(base,"vendor/todo2code/dist/src/cli.js"));
  const fixtureAvailable = Boolean(document.development.fixture && await exists(resolve(base,document.development.fixture)));
  const providerOk = t2cAvailable || (document.policy.allowDevelopmentFixture && fixtureAvailable);
  checks.push({name:"development-provider",ok:providerOk,message:t2cAvailable?"todo2code available":fixtureAvailable?"bootstrap fixture allowed":"todo2code and allowed fixture missing"});
  return {ok:checks.every(check=>check.ok),projectId:document.id,checks};
}
