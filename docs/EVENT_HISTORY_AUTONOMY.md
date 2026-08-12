# Event History — Digital Twin Autonomy (twin-dsl)

**Project:** `@subactor/digital-twin-runtime-starter` / `bioxfoundry/twin-dsl`
**Scope:** Planned and executed work in the operational session (2026-08-06) and the state of Twin's autonomous evolution.
**Session actor:** Grok Build agent (xAI) in workspace `/home/tom/github/bioxfoundry/twin-dsl`
**Reuse resources:** `~/github/semcod/*`, `~/github/subactor/*` (incl. runtime apply-grant, todo2code, twin-probes, autonomy-lab)
**Code index:** `project/map.toon.yaml`
**Nanobionic Laboratory living-project status:** **created and iterated** (`/home/tom/github/bioxfoundry/projects/nanobionic-laboratory`)

---

## 0. Event Legend

| Status | Meaning |
|--------|-----------|
| `PLANNED` | planned during the session / in autonomy gaps |
| `EXECUTED` | implemented or verified during this session / in baseline 0.4.0 |
| `VERIFIED` | confirmed by tests or demo |
| `PENDING` | awaiting human decision or external infrastructure |
| `AUTONOMOUS` | operates in a living project loop without manual intervention (within policy limits) |

---

## 1. Session Timeline

```text
[T0]  Baseline: Digital Twin Runtime Starter 0.4.0 already present in twin-dsl
      (authority gates, living loop, improvementDSL, lease, service-check, Docker imports)

[T1]  PLANNED  — reuse semcod/subactor; close the full code-autonomy gap
[T2]  EXECUTED — inventory: apply-grant, todo2code patch API, twin-probes, autonomy-lab
[T3]  EXECUTED — 0.5.0: cryptographic grants, isolation, mutation pipeline, probes adapter
[T4]  VERIFIED — npm test 24/24; demo:autonomy; demo:mutation
[T5]  PLANNED  — bootstrap Nanobionic Laboratory from the study PDF (intent + sources)
[T6]  EXECUTED — project-create + project-add-source + project-iterate (validation.ok)
[T7]  EXECUTED — event-history document (EVENT_HISTORY_AUTONOMY.md)
[T8]  EXECUTED — Nanobionic bootstrap + first iteration + BOOTSTRAP.md w living project
[T9]  EXECUTED — bridge the ChatGPT concept Twin (8 zones, GLB/USDA/DSL) from living-runtime
[T10] EXECUTED — profile biofoundry → semantic twin/scene (0.5.1); re-iterate nanobionic + live project
```

---

## 2. Input State (0.4.0) — what was already "ready"

### 2.1 Autonomous Loop (model)

```text
research sources
  -> resourceDSL / DQL / treeDSL / queryDSL / mathDSL
  -> todo2code Intent Evidence (development)
  -> observationDSL (runtime / environment)
  -> authority-owned mathDSL gates
  -> twinDSL
  -> sceneDSL / OpenUSD candidate
  -> validation receipt + improvementDSL + feedback
  -> next source / code / runtime change
```

**Status:** `AUTONOMOUS` for analysis, projection, validation, proposal, and safe scene publication
**Status:** `PENDING` for unrestricted runtime code self-modification

### 2.2 Authority — LLM is not the source of gates

The runtime generates and protects, among other bindings:

```mathdsl
MATH authority-gates
BIND ManagerApproved = false
BIND ResearchEvidencePresent = true
BIND DevelopmentEvidencePresent = true
BIND DevelopmentAccepted = true
BIND RuntimeEvidencePresent = true
BIND RequireResearch = true
BIND RequireDevelopment = true
BIND RequireDevelopmentAcceptance = true
BIND RequireRuntime = true
BIND AutoPublishScene = false
BIND AllowRuntimeSelfModification = false
BIND AutonomyModeApply = false
BIND RequireSignedMutationGrant = true
BIND SignedMutationGrantPresent = false
BIND RateLimitAvailable = true
BIND SourceRoleCount = 3
EXPR ResearchGate = OR(NOT(RequireResearch), ResearchEvidencePresent)
EXPR DevelopmentGate = OR(NOT(RequireDevelopment), DevelopmentEvidencePresent)
EXPR RuntimeGate = OR(NOT(RequireRuntime), RuntimeEvidencePresent)
EXPR MutationGrantGate = OR(NOT(RequireSignedMutationGrant), SignedMutationGrantPresent)
EXPR IterationAllowed = AND(ManagerApproved, ResearchGate, DevelopmentGate, RuntimeGate, RateLimitAvailable)
EXPR ScenePublishAllowed = AND(IterationAllowed, OR(NOT(RequireDevelopmentAcceptance), DevelopmentAccepted), AutoPublishScene)
EXPR RuntimeSelfModificationAllowed = AND(AllowRuntimeSelfModification, AutonomyModeApply, MutationGrantGate, DevelopmentAccepted)
```

When LLM attempts to overwrite binding/expression authority, runtime:

```text
LLM_AUTHORITY_BINDING_IGNORED:<name>
LLM_AUTHORITY_EXPRESSION_IGNORED:<name>
```

and appends the action to `improvementDSL` (`status: proposed`).

**Status:** `VERIFIED` (test: *LLM cannot override authority-owned math gates*)

### 2.3 Development evidence (todo2code > fixture)

```text
source: todo2code | fixture | missing
acceptance: accepted | review_required | rejected | unknown
inputs: intent.graph.json, diagnostics.json, manifest.json
```

The fixture is accepted only under an explicit policy:

```projectdsl
POLICY_ALLOW_DEVELOPMENT_FIXTURE false
```

**Status:** `VERIFIED`

### 2.4 Continuous Loop Reliability (0.4.0)

| Mechanism | Status |
|-----------|--------|
| Persistent project lease | `AUTONOMOUS` |
| Iteration limit / hour | `AUTONOMOUS` |
| Bounded exponential watcher retry | `AUTONOMOUS` |
| Failure receipt + `dead-letter.jsonl` | `AUTONOMOUS` |
| Event envelope, idempotency key, trace ID | `AUTONOMOUS` |
| Last-known-good Scene | `AUTONOMOUS` |
| No rebuild with identical snapshot | `AUTONOMOUS` |
| Docker-safe `imports/` + `imports/manifest.jsonl` | `AUTONOMOUS` |
| `service-check` (ClickHouse `SELECT 1`, Docling `/health`) | `AUTONOMOUS` (when services are up) |

### 2.5 improvementDSL (propose-only)

Example of a planned / generated improvement plan:

```improvementdsl
IMPROVEMENT improvement-fix-dev-evidence
PROJECT customer-biofoundry
GENERATED_AT "2026-08-06T19:00:00.000Z"
SOURCE_ITERATION urn:subactor:iteration:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
EVIDENCE [urn:subactor:development-evidence:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]
ACTION action-1 KIND development APPROVAL false TARGETS [subactor://project/customer-biofoundry/development] TITLE "Run todo2code pipeline" REASON "No Intent Evidence graph was produced for the development workspace"
ACTION action-2 KIND validation APPROVAL true TARGETS [subactor://project/customer-biofoundry/development] TITLE "Resolve development diagnostics" REASON "Development evidence is not accepted by the deterministic acceptance gate"
```

**Status:** `AUTONOMOUS` (generated with each changed iteration)
**Status:** `PENDING` (automatic application of plan-generated code is intentionally disabled)

---

## 3. Plan 0.5.0 (session) — full code autonomy gap

### 3.1 Target flow (planned in FULL_AUTONOMY_GAPS)

```text
todo2code diagnostics
  → code-change-plan
  → source-patch proposal
  → cryptographically signed grant
  → isolated worktree or container
  → apply
  → tests
  → repeated todo2code pipeline
  → independent acceptance
  → canary
  → promotion or rollback
```

### 3.2 What was done in 0.5.0 vs what remains

| Step | Status | Implementation |
|------|--------|------------|
| Diagnostics / plan (contract) | `EXECUTED` (adapter + examples) | `Todo2CodeAdapter`, `code-change-plan.example.json` |
| Source-patch proposal | `EXECUTED` | `proposeSourcePatch` or a local empty proposal |
| Cryptographic HS256 grant | `EXECUTED` + `VERIFIED` | `src/runtime/mutation-grant.ts` (ported from `subactor/runtime`) |
| Isolated worktree / copy | `EXECUTED` + `VERIFIED` | `src/runtime/isolated-worktree.ts` |
| Apply in isolation | `EXECUTED` (fail-closed) | `mutation-apply` + jti consume |
| Tests after apply | `PENDING` | requires real t2c + suite |
| Re-analysis / close-code-change | `PENDING` | semcod/todo2code |
| Independent evaluator | `PENDING` | autonomy contract `require_distinct_identity` |
| Canary / rollback | `PENDING` | patterns in `subactor/autonomy-lab` |
| Isolation → main promotion | `PENDING` | intentionally outside 0.5.0 |

---

## 4. Execution events 0.5.0 (detail)

### EVT-0501 — Port signed mutation grant

**Status:** `EXECUTED`  
**Reuse source:** `/home/tom/github/subactor/runtime/src/apply-grant.mjs`
**Artifacts:**

- `src/runtime/mutation-grant.ts`
- `schemas/signed-mutation-grant.schema.json`
- `examples/autonomy/signed-mutation-grant.example.json`

**Secrets (order):**

```text
MUTATION_GRANT_HMAC_SECRET
APPLY_GRANT_HMAC_SECRET
TOKEN_PEPPER
```

**DSL / grant document (after `grant-issue`):**

```json
{
  "schema": "subactor.signed-mutation-grant/v1",
  "projectId": "mutation-demo",
  "planHash": "aa…",
  "artifactSha256": "bb…",
  "target": "code/",
  "actor": "manager@example.com",
  "riskClass": "reversible",
  "jti": "<unique>",
  "iat": "2026-08-06T…",
  "expiresAt": "2026-08-06T…",
  "runId": "demo-run",
  "intentPack": "subactor.digital-twin-runtime/v1",
  "signature": "<compact-HS256-token>",
  "grantHash": "<sha256>"
}
```

**CLI:**

```bash
export MUTATION_GRANT_HMAC_SECRET="..."
node dist/src/cli/main.js grant-issue <projectId> <planHash> <artifactSha256> <target> <actor> grant.json
node dist/src/cli/main.js grant-verify grant.json <projectId> <planHash>
```

**Fail-closed rule:** placeholders (`replace-with-detached-signature`) **do not** set `SignedMutationGrantPresent`.

### EVT-0502 — Isolated workspace

**Status:** `EXECUTED`  
**Artifact:** `src/runtime/isolated-worktree.ts`

```text
IF developmentRoot is git toplevel
  THEN git worktree add -b dt-mutation/<label>-<token> <path> HEAD
ELSE
  directory-copy (skip node_modules, .git, dist, .dt-run)
  write .dt-isolated-workspace.json
```

**Note (session correction):** a nested directory in a monorepo **does not** create a worktree of the entire repo — only a directory-copy.

### EVT-0503 — Mutation pipeline (propose / apply)

**Status:** `EXECUTED`  
**Artifacts:**

- `src/runtime/mutation-pipeline.ts`
- `schemas/mutation-proposal-receipt.schema.json`
- `examples/autonomy/code-change-plan.example.json`

**Propose flow:**

```text
load plan → planHash
verify mutation grant (crypto)
create isolated workspace
todo2code propose-source-patch OR empty structured proposal
write subactor.mutation-proposal-receipt/v1
append events.jsonl
dispose workspace unless keepWorkspace
```

**Example change plan:**

```json
{
  "schema": "t2c.code-change-plan/v1",
  "id": "plan-fix-development-evidence",
  "planHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "status": "proposed",
  "title": "Fix development evidence acceptance path",
  "target": {
    "paths": ["src/runtime/autonomy.ts", "src/adapters/todo2code.ts"]
  },
  "rationale": "Blocking diagnostics and fixture policy must be reflected before scene publication.",
  "acceptance": "blocking diagnostics disappear and fixture is not accepted without POLICY_ALLOW_DEVELOPMENT_FIXTURE"
}
```

**Receipt (summary):**

```json
{
  "schema": "subactor.mutation-proposal-receipt/v1",
  "mode": "propose",
  "status": "proposed",
  "grantVerified": true,
  "workspace": { "kind": "directory-copy", "path": "..." },
  "sourcePatchPath": "...source-patch.json",
  "stages": [
    { "name": "grant", "status": "succeeded" },
    { "name": "isolate", "status": "succeeded" },
    { "name": "propose-source-patch", "status": "succeeded" }
  ]
}
```

**CLI:**

```bash
node dist/src/cli/main.js mutation-propose project.projectdsl plan.json .living-runtime
# apply — only with apply policy + self-modification + grant + approval hash; writes stay isolated
node dist/src/cli/main.js mutation-apply project.projectdsl plan.json source-patch.json <approvalHash> .living-runtime
```

### EVT-0504 — twin-probes evidence

**Status:** `EXECUTED`  
**Source:** `/home/tom/github/subactor/twin-probes`
**Artifact:** `src/adapters/twin-probes.ts`

**Cycle contract (must have `watches`):**

```json
{
  "schema": "subactor.autonom-cycle/v1",
  "host": "twin-dsl",
  "startedAt": "2026-08-06T12:00:00.000Z",
  "results": [
    {
      "id": "redup.duplication",
      "ok": true,
      "watches": ["src/runtime/autonomy.ts"],
      "tags": ["duplication"],
      "facts": { "groups": "0" }
    }
  ]
}
```

```bash
node dist/src/cli/main.js probes-ingest cycle.json .living-runtime/candidate/probe.evidence.json
```

### EVT-0505 — todo2code adapter extension

**Status:** `EXECUTED`  
**Artifact:** `src/adapters/todo2code.ts`

```text
extract / readLatestAnalysis / extractNl   (0.4.0)
+ proposeSourcePatch(planPath, outPath)
+ applySourcePatch(patchPath, { actor, approvalHash, receiptPath, cwd })
```

### EVT-0506 — Verification

**Status:** `VERIFIED`

```text
npm test                 → 24/24 PASS
npm run demo:autonomy    → PASS (authority, fixture gate, failure)
npm run demo:mutation    → PASS (grant ok, proposal proposed, directory-copy)
```

New tests:

- `test/mutation-grant.test.ts` (HMAC, tamper, jti, isolation, propose, probes)

---

## 5. Living project — what operates autonomously (operationally)

### 5.1 projectDSL (living-project skeleton)

After `project-create`, the project document (logically) is generated, among other things:

```projectdsl
PROJECT nanobionic-laboratory
NAME "Nanobionic Laboratory"
PROFILE biofoundry
MANAGER_INTENT "Buduj i ewolujuj walidowany Digital Twin open-source biofoundry..."

SOURCE data/manager ROLE manager LOGICAL_ROOT "subactor://project/nanobionic-laboratory/manager"
SOURCE data/customer ROLE customer LOGICAL_ROOT "subactor://project/nanobionic-laboratory/customer"
SOURCE data/project ROLE project LOGICAL_ROOT "subactor://project/nanobionic-laboratory/data"
SOURCE data/archives ROLE archive LOGICAL_ROOT "subactor://project/nanobionic-laboratory/archives"
SOURCE code ROLE development LOGICAL_ROOT "subactor://project/nanobionic-laboratory/development"
SOURCE logs ROLE runtime LOGICAL_ROOT "subactor://project/nanobionic-laboratory/logs"
SOURCE environment ROLE runtime LOGICAL_ROOT "subactor://project/nanobionic-laboratory/environment"

DEVELOPMENT_ROOT code
OBSERVATION_PATHS logs,environment

POLICY_APPROVED true
POLICY_REQUIRE_RESEARCH true
POLICY_REQUIRE_DEVELOPMENT true
POLICY_REQUIRE_DEVELOPMENT_ACCEPTANCE true
POLICY_ALLOW_DEVELOPMENT_FIXTURE true
POLICY_REQUIRE_RUNTIME true
POLICY_AUTO_PUBLISH_SCENE true
POLICY_ALLOW_RUNTIME_SELF_MODIFICATION false
POLICY_AUTONOMY_MODE propose
POLICY_REQUIRE_SIGNED_MUTATION_GRANT true
POLICY_MAX_ITERATIONS_PER_HOUR 12
POLICY_MAX_CONSECUTIVE_FAILURES 5
SCENE_FORMAT openusd
```

### 5.2 Autonomous loop commands

```bash
# one-off iteration
node dist/src/cli/main.js project-iterate project.projectdsl .living-runtime deterministic

# continuous evolution (watcher)
node dist/src/cli/main.js project-watch project.projectdsl .living-runtime prefer-llm

# status
node dist/src/cli/main.js project-status .living-runtime

# service gate
node dist/src/cli/main.js service-check
```

Docker (in the generated project):

```bash
docker compose up -d --build
docker compose run --rm runtime service-check
docker compose run --rm runtime \
  project-iterate /project/project.projectdsl /project/.living-runtime deterministic
docker compose run --rm runtime \
  project-watch /project/project.projectdsl /project/.living-runtime prefer-llm
```

### 5.3 Artifacts of each iteration (`.living-runtime/`)

```text
receipts/<iteration>.json      # subactor.living-iteration/v2
candidate/math.json
candidate/twin.json
candidate/scene.* / OpenUSD
candidate/improvement.json     # improvementDSL
candidate/development.evidence.json
current/                       # last-known-good after successful validation
failures/                      # living-failure
dead-letter.jsonl
events.jsonl
.iteration-lease/
mutations/                     # 0.5.0: propose/apply receipts (when used)
```

### 5.4 Autonomy modes

| Mode | Behavior | Status |
|------|------------|--------|
| `observe` | analysis / projection only | `AUTONOMOUS` |
| `propose` | + improvementDSL + mutation-propose | `AUTONOMOUS` (default) |
| `apply` | mutation intent + isolated apply after grant | `EXECUTED` control plane; promotion `PENDING` |

---

## 6. Nanobionic Laboratory — bootstrap plan (session T5–T6)

### 6.1 Sources of knowledge

| Path | Role |
|---------|------|
| `"/home/tom/github/bioxfoundry/idea/Atvirojo kodo biofoundry studija-1.pdf"` | strategic intent + customer evidence |
| `/home/tom/github/bioxfoundry/nanobionic-laboratory/**` | corpus: SiLA/ROS/OpenTwins, OSCAR, BIO-SPEC, CAD, software |

### 6.2 Where the intent should live (not in PDF)

| Artifact | Role |
|----------|------|
| `data/manager/policy.md` | **authority** — concise operational intent |
| `project.projectdsl` → `MANAGER_INTENT` | project contract |
| `project/ticket-001/user-manager.md` | ticket request |
| `config/development.intent.fixture.json` | t2c.intent seed (until real todo2code is available) |
| PDF via `project-add-source … customer` | evidence (imports + manifest) |

### 6.3 Manager's intent (planned content from PDF)

The following fenced block preserves the original Polish manager-intent evidence. Its English
translation follows immediately after the block; the original value is retained because changing a
historical record would falsify what the session actually used.

```markdown
# Manager policy — Nanobionic Laboratory / Open-Source Biofoundry

## Cel
Utrzymywać i rozwijać walidowany Digital Twin open-source biofoundry dla
otwartej medycyny i małoskalowych procesów biologicznych.

## Pętla
design–build–test–learn:
ChemOS 2.0 (plan eksperymentów) → SiLA 2 (urządzenia) → ROS 2 (robotyka)
→ OpenTwins (stan fizyczny ↔ twin).

## Etap 0–1
1. Infrastruktura cyfrowa (runtime, event log, dokumentacja, Twin).
2. Jeden demonstracyjny proces: BIO-SPEC / bioreaktor + obserwacje.
3. Mapowanie OSCAR, mikroskopii, mikrofluidyki jako komponentów Twin.

## Authority
- projectDSL i policy są nadrzędne wobec LLM.
- Samomodyfikacja runtime: wyłączona do signed grant + izolacji + acceptance.
- Preferuj open-source, modularność, lokalną odtwarzalność.
```

English translation:

> Maintain and develop a validated Digital Twin of an open-source biofoundry for open medicine and
> small-scale biological processes. The loop connects ChemOS 2.0 experiment planning, SiLA 2
> devices, ROS 2 robotics, and OpenTwins physical/Twin state. Begin with digital infrastructure and
> one BIO-SPEC bioreactor demonstration process. Keep projectDSL and policy authoritative over the
> LLM, disable runtime self-modification until signed grant, isolation, and acceptance are present,
> and prefer open source, modularity, and local reproducibility.

### 6.4 Bootstrap commands (PLANNED / PENDING — not executed during the session)

```bash
cd /home/tom/github/bioxfoundry/twin-dsl
npm run build

node dist/src/cli/main.js project-create \
  "Nanobionic Laboratory" \
  /home/tom/github/bioxfoundry/projects/nanobionic-laboratory \
  biofoundry \
  "Buduj i ewolujuj walidowany Digital Twin open-source biofoundry dla otwartej medycyny: cykl design–build–test–learn; ChemOS 2.0, SiLA 2, ROS 2, OpenTwins; start od infrastruktury cyfrowej i jednego procesu demonstracyjnego (BIO-SPEC); bez nieautoryzowanej samomodyfikacji runtime."

PROJ=/home/tom/github/bioxfoundry/projects/nanobionic-laboratory
CLI="node /home/tom/github/bioxfoundry/twin-dsl/dist/src/cli/main.js"

$CLI project-add-source $PROJ/project.projectdsl customer \
  "/home/tom/github/bioxfoundry/idea/Atvirojo kodo biofoundry studija-1.pdf"
$CLI project-add-source $PROJ/project.projectdsl customer \
  "/home/tom/github/bioxfoundry/nanobionic-laboratory/A. SPECIFIKACIJA"
$CLI project-add-source $PROJ/project.projectdsl project \
  "/home/tom/github/bioxfoundry/nanobionic-laboratory/0. Architecture"
$CLI project-add-source $PROJ/project.projectdsl development \
  "/home/tom/github/bioxfoundry/nanobionic-laboratory/I. Bioreactor/osfstorage-archive/Software"

$CLI project-iterate $PROJ/project.projectdsl $PROJ/.living-runtime deterministic
$CLI project-status $PROJ/.living-runtime
```

**Living project directory status:**
`/home/tom/github/bioxfoundry/projects/nanobionic-laboratory` — **EXISTS** (bootstrap + iterate 2026-08-06).

### 6.6 First iteration (EXECUTED)

```text
iterationId: a339fd30-fc90-4c08-9b6d-724db5a4f626
validation.ok: true
development.source: fixture (accepted under POLICY_ALLOW_DEVELOPMENT_FIXTURE true)
stages: preflight, research, development, runtime, reasoning, twin, scene, improvement, feedback → succeeded
authorityWarnings: LLM_AUTHORITY_EXPRESSION_IGNORED:DevelopmentGate
published: .living-runtime/current/ (last-known-good)
scene: .living-runtime/candidate/scene.usda
log: projects/nanobionic-laboratory/BOOTSTRAP.md
```

Sources in `imports/manifest.jsonl`:

```text
customer  idea/Atvirojo kodo biofoundry studija-1.pdf
customer  nanobionic-laboratory/A. SPECIFIKACIJA
project   nanobionic-laboratory/0. Architecture
development  I. Bioreactor/.../Software  (+ code/src/bioreactor/)
project   nanobionic_lab_whitepaper.pdf
```

### 6.5 Expected twinDSL / treeDSL after the first iteration (target example)

```treedsl
TREE nanobionic-laboratory
NODE lab "Nanobionic Laboratory" ROLE facility
  NODE digital "Digital infrastructure" ROLE subsystem
    NODE chemos "ChemOS 2.0 experiment planner" ROLE service
    NODE sila "SiLA 2 device orchestrator" ROLE service
    NODE ros "ROS 2 robotics layer" ROLE service
    NODE opentwins "OpenTwins state model" ROLE service
  NODE hardware "Open hardware modules" ROLE subsystem
    NODE oscar "OSCAR robot platform" ROLE equipment
    NODE biospec "BIO-SPEC bioreactors" ROLE equipment
    NODE microscopy "Microscopy module" ROLE equipment
    NODE microfluidics "Microfluidic assembly" ROLE equipment
    NODE syringebot "Syringebot / bioprinting" ROLE equipment
    NODE cleanroom "Open-source cleanroom base" ROLE facility
```

```twindsl
# logical shape (after materialization, the runtime writes JSON twinDSL)
# components grounded in resource URIs from customer/project/development sources
TWIN nanobionic-laboratory
SOURCE_SNAPSHOT <sha256>
COMPONENT lab.facility
  SOURCE_URI urn:subactor:resource:sha256:...
  CHILD digital.infrastructure
  CHILD hardware.modules
```

---

## 7. Register of files changed / added in session 0.5.0

### Added

```text
src/runtime/mutation-grant.ts
src/runtime/isolated-worktree.ts
src/runtime/mutation-pipeline.ts
src/adapters/twin-probes.ts
test/mutation-grant.test.ts
schemas/signed-mutation-grant.schema.json
schemas/mutation-proposal-receipt.schema.json
scripts/demo-mutation.mjs
examples/autonomy/code-change-plan.example.json
docs/EVENT_HISTORY_AUTONOMY.md          # this file
```

### Modified (main)

```text
src/core/types.ts                       # SignedMutationGrant, MutationProposalReceipt
src/runtime/autonomy.ts                 # mutationGrantPresent = crypto verify
src/adapters/todo2code.ts               # propose/apply source patch
src/cli/main.ts                         # grant-*, mutation-*, probes-ingest
package.json                            # 0.5.0, demo:mutation, clean
CHANGELOG.md
README.md
VERIFICATION.md
docs/FULL_AUTONOMY_GAPS.md
docs/AUTONOMY_MODEL.md
examples/autonomy/README.md
examples/autonomy/signed-mutation-grant.example.json
```

### Externally reused (without copying the entire repo)

```text
subactor/runtime        apply-grant (HMAC model)
semcod/todo2code        propose-source-patch / apply-source-patch CLI
subactor/twin-probes    autonom-cycle/v1
subactor/autonomy-lab   canary/promotion patterns (docs only)
```

---

## 8. What continues to operate autonomously (operational contract)

After creating a living project and starting `project-watch`, the system autonomously:

1. scans manager/customer/project/archive/development/runtime sources
2. builds resource / tree / observation artifacts
3. invokes development evidence (todo2code or fixture according to policy)
4. recalculates mathDSL with authority protection
5. builds the Twin and Scene (OpenUSD)
6. validates URI grounding;
7. publishes the candidate or current revision (last-known-good)
8. generates propose-only `improvementDSL`
9. records receipt, events, failures, dead-letter
10. limits tempo and blocks parallel iterations with a lease

**Does not do autonomously (by default):**

- does not change live code without a grant and apply mode;
- does not promote patches from isolation to main;
- does not run canary/rollback
- does not replace an independent evaluator

---

## 9. Final status matrix

| Area | Status |
|--------|--------|
| Knowledge loop (research → resource → tree/query/math) | `AUTONOMOUS` |
| Development loop (todo2code evidence) | `AUTONOMOUS` (fixture/real according to policy) |
| Execution loop (twin/scene/publish) | `AUTONOMOUS` within the gates |
| Authority vs LLM | `VERIFIED` + `AUTONOMOUS` |
| Improvement proposals | `AUTONOMOUS` (propose-only) |
| Mutation control plane 0.5.0 | `EXECUTED` + `VERIFIED` |
| Real t2c patch + re-analysis E2E | `PENDING` |
| Canary / promotion / evaluator | `PENDING` |
| Nanobionic living project bootstrap | `EXECUTED` + first iterate `VERIFIED` |
| Event history documentation | `EXECUTED` (this file) |

---

## 10. Related documents

| File | Content |
|------|--------|
| `docs/AUTONOMY_MODEL.md` | gate and mutation model |
| `docs/FULL_AUTONOMY_GAPS.md` | gaps to full code autonomy |
| `docs/AUTONOMY_FINDINGS.md` | findings from 0.4.0 tests |
| `docs/PROJECT_WIZARD.md` | living project wizard |
| `docs/QUICK_SOURCE_RECIPES.md` | adding PDF/ZIP/code |
| `docs/CONTINUOUS_DIGITAL_TWIN_LOOP.md` | continuous loop |
| `VERIFICATION.md` | 0.5.0 verification report |
| `CHANGELOG.md` | 0.4.0 / 0.5.0 |
| `examples/autonomy/` | scenarios and grant/plan examples |

---

## 11. Session signature

```text
schema: subactor.session-event-log/v1
date: 2026-08-06
workspace: /home/tom/github/bioxfoundry/twin-dsl
package: @subactor/digital-twin-runtime-starter@0.5.0
agent: grok-build
outcome: mutation control plane delivered; nanobionic living project bootstrapped and iterated
next_human_action: optional project-watch / Docker / real todo2code
next_autonomous_action: project-watch prefer-llm within POLICY_* bounds
```

```text
# minimal logical event that closes the session
EVENT session.closed
PROJECT twin-dsl
TRACE session-2026-08-06-autonomy-0.5.0
RESULT delivered:grant,isolation,mutation-pipeline,probes,docs
RESULT pending:nanobionic-bootstrap,canary,promotion,real-t2c-e2e
AUTHORITY fail-closed
AUTONOMY_MODE propose
```
