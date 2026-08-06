# Historia zdarzeń — autonomia Digital Twin (twin-dsl)

**Projekt:** `@subactor/digital-twin-runtime-starter` / `bioxfoundry/twin-dsl`  
**Zakres:** zaplanowane i wykonane prace w sesji operacyjnej (2026-08-06) oraz stan autonomicznej ewolucji Twin.  
**Aktor sesji:** agent Grok Build (xAI) w workspace `/home/tom/github/bioxfoundry/twin-dsl`  
**Zasoby reużycia:** `~/github/semcod/*`, `~/github/subactor/*` (m.in. runtime apply-grant, todo2code, twin-probes, autonomy-lab)  
**Indeks kodu:** `project/map.toon.yaml`  
**Status Nanobionic Laboratory living project:** **utworzony i ziterowany** (`/home/tom/github/bioxfoundry/projects/nanobionic-laboratory`)

---

## 0. Legenda zdarzeń

| Status | Znaczenie |
|--------|-----------|
| `PLANNED` | zaplanowane w sesji / w lukach autonomii |
| `EXECUTED` | zaimplementowane lub zweryfikowane w tej sesji / w baseline 0.4.0 |
| `VERIFIED` | potwierdzone testami lub demo |
| `PENDING` | czeka na ludzką decyzję lub zewnętrzną infrastrukturę |
| `AUTONOMOUS` | działa w pętli living project bez ręcznej interwencji (w granicach policy) |

---

## 1. Oś czasu sesji

```text
[T0]  Baseline: Digital Twin Runtime Starter 0.4.0 już w repo twin-dsl
      (authority gates, living loop, improvementDSL, lease, service-check, Docker imports)

[T1]  PLANNED  — reużyć semcod/subactor; domknąć lukę pełnej autonomii kodu
[T2]  EXECUTED — inwentaryzacja: apply-grant, todo2code patch API, twin-probes, autonomy-lab
[T3]  EXECUTED — 0.5.0: kryptograficzne granty, izolacja, mutation pipeline, probes adapter
[T4]  VERIFIED — npm test 24/24; demo:autonomy; demo:mutation
[T5]  PLANNED  — bootstrap Nanobionic Laboratory z PDF studii (intencja + źródła)
[T6]  EXECUTED — project-create + project-add-source + project-iterate (validation.ok)
[T7]  EXECUTED — dokument historii zdarzeń (EVENT_HISTORY_AUTONOMY.md)
[T8]  EXECUTED — Nanobionic bootstrap + first iteration + BOOTSTRAP.md w living project
[T9]  EXECUTED — most ChatGPT concept twin (8 stref, GLB/USDA/DSL) z living-runtime
[T10] EXECUTED — profile biofoundry → semantic twin/scene (0.5.1); re-iterate nanobionic + live project
```

---

## 2. Stan wejściowy (0.4.0) — co już było „gotowe”

### 2.1 Pętla autonomiczna (model)

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

**Status:** `AUTONOMOUS` dla analizy, projekcji, walidacji, propozycji i bezpiecznej publikacji sceny  
**Status:** `PENDING` dla nieograniczonej samomodyfikacji kodu runtime

### 2.2 Authority — LLM nie jest źródłem bramek

Runtime generuje i broni m.in.:

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

Gdy LLM próbuje nadpisać binding/expression authority, runtime:

```text
LLM_AUTHORITY_BINDING_IGNORED:<name>
LLM_AUTHORITY_EXPRESSION_IGNORED:<name>
```

i dopisuje akcję w `improvementDSL` (`status: proposed`).

**Status:** `VERIFIED` (test: *LLM cannot override authority-owned math gates*)

### 2.3 Development evidence (todo2code > fixture)

```text
source: todo2code | fixture | missing
acceptance: accepted | review_required | rejected | unknown
inputs: intent.graph.json, diagnostics.json, manifest.json
```

Fixture tylko przy jawnej polityce:

```projectdsl
POLICY_ALLOW_DEVELOPMENT_FIXTURE false
```

**Status:** `VERIFIED`

### 2.4 Niezawodność ciągłej pętli (0.4.0)

| Mechanizm | Status |
|-----------|--------|
| Trwała dzierżawa projektu (lease) | `AUTONOMOUS` |
| Limit iteracji / godzinę | `AUTONOMOUS` |
| Bounded exponential retry watchera | `AUTONOMOUS` |
| Failure receipt + `dead-letter.jsonl` | `AUTONOMOUS` |
| Event envelope, idempotency key, trace ID | `AUTONOMOUS` |
| Last-known-good Scene | `AUTONOMOUS` |
| Brak rebuild przy identycznym snapshotcie | `AUTONOMOUS` |
| Docker-safe `imports/` + `imports/manifest.jsonl` | `AUTONOMOUS` |
| `service-check` (ClickHouse `SELECT 1`, Docling `/health`) | `AUTONOMOUS` (gdy usługi w górze) |

### 2.5 improvementDSL (propose-only)

Przykład planowanego / generowanego planu doskonalenia:

```improvementdsl
IMPROVEMENT improvement-fix-dev-evidence
PROJECT customer-biofoundry
GENERATED_AT "2026-08-06T19:00:00.000Z"
SOURCE_ITERATION urn:subactor:iteration:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
EVIDENCE [urn:subactor:development-evidence:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]
ACTION action-1 KIND development APPROVAL false TARGETS [subactor://project/customer-biofoundry/development] TITLE "Run todo2code pipeline" REASON "No Intent Evidence graph was produced for the development workspace"
ACTION action-2 KIND validation APPROVAL true TARGETS [subactor://project/customer-biofoundry/development] TITLE "Resolve development diagnostics" REASON "Development evidence is not accepted by the deterministic acceptance gate"
```

**Status:** `AUTONOMOUS` (generowanie przy każdej zmienionej iteracji)  
**Status:** `PENDING` (automatyczne apply kodu z planu — celowo nie)

---

## 3. Plan 0.5.0 (sesja) — luka pełnej autonomii kodu

### 3.1 Docelowy przepływ (planowany w FULL_AUTONOMY_GAPS)

```text
todo2code diagnostics
  → code-change-plan
  → source-patch proposal
  → kryptograficznie podpisany grant
  → izolowany worktree lub kontener
  → apply
  → testy
  → ponowny pipeline todo2code
  → niezależny acceptance
  → canary
  → promocja albo rollback
```

### 3.2 Co wykonano w 0.5.0 vs co pozostało

| Krok | Status | Realizacja |
|------|--------|------------|
| Diagnostyki / plan (kontrakt) | `EXECUTED` (adapter + przykłady) | `Todo2CodeAdapter`, `code-change-plan.example.json` |
| Source-patch proposal | `EXECUTED` | `proposeSourcePatch` lub lokalny empty proposal |
| Krypto grant HS256 | `EXECUTED` + `VERIFIED` | `src/runtime/mutation-grant.ts` (port z `subactor/runtime`) |
| Izolowany worktree / copy | `EXECUTED` + `VERIFIED` | `src/runtime/isolated-worktree.ts` |
| Apply w izolacji | `EXECUTED` (fail-closed) | `mutation-apply` + jti consume |
| Testy po apply | `PENDING` | wymaga realnego t2c + suite |
| Re-analysis / close-code-change | `PENDING` | semcod/todo2code |
| Niezależny evaluator | `PENDING` | autonomy contract `require_distinct_identity` |
| Canary / rollback | `PENDING` | wzorce w `subactor/autonomy-lab` |
| Promocja izolacja → main | `PENDING` | celowo poza 0.5.0 |

---

## 4. Zdarzenia wykonania 0.5.0 (szczegół)

### EVT-0501 — Port signed mutation grant

**Status:** `EXECUTED`  
**Źródło reużycia:** `/home/tom/github/subactor/runtime/src/apply-grant.mjs`  
**Artefakty:**

- `src/runtime/mutation-grant.ts`
- `schemas/signed-mutation-grant.schema.json`
- `examples/autonomy/signed-mutation-grant.example.json`

**Sekrety (kolejność):**

```text
MUTATION_GRANT_HMAC_SECRET
APPLY_GRANT_HMAC_SECRET
TOKEN_PEPPER
```

**DSL / dokument grantu (po `grant-issue`):**

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

**Reguła fail-closed:** placeholdery (`replace-with-detached-signature`) **nie** ustawiają `SignedMutationGrantPresent`.

### EVT-0502 — Izolowany workspace

**Status:** `EXECUTED`  
**Artefakt:** `src/runtime/isolated-worktree.ts`

```text
IF developmentRoot is git toplevel
  THEN git worktree add -b dt-mutation/<label>-<token> <path> HEAD
ELSE
  directory-copy (skip node_modules, .git, dist, .dt-run)
  write .dt-isolated-workspace.json
```

**Uwaga (poprawka w sesji):** zagnieżdżony katalog w monorepo **nie** tworzy worktree całego repo — tylko directory-copy.

### EVT-0503 — Mutation pipeline (propose / apply)

**Status:** `EXECUTED`  
**Artefakty:**

- `src/runtime/mutation-pipeline.ts`
- `schemas/mutation-proposal-receipt.schema.json`
- `examples/autonomy/code-change-plan.example.json`

**Przepływ propose:**

```text
load plan → planHash
verify mutation grant (crypto)
create isolated workspace
todo2code propose-source-patch OR empty structured proposal
write subactor.mutation-proposal-receipt/v1
append events.jsonl
dispose workspace unless keepWorkspace
```

**Przykład planu zmian:**

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

**Receipt (skrót):**

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
# apply — tylko przy policy apply + self-mod + grant + approval-hash; zapis tylko w izolacji
node dist/src/cli/main.js mutation-apply project.projectdsl plan.json source-patch.json <approvalHash> .living-runtime
```

### EVT-0504 — twin-probes evidence

**Status:** `EXECUTED`  
**Źródło:** `/home/tom/github/subactor/twin-probes`  
**Artefakt:** `src/adapters/twin-probes.ts`

**Kontrakt cyklu (musi mieć `watches`):**

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

### EVT-0505 — Rozszerzenie adaptera todo2code

**Status:** `EXECUTED`  
**Artefakt:** `src/adapters/todo2code.ts`

```text
extract / readLatestAnalysis / extractNl   (0.4.0)
+ proposeSourcePatch(planPath, outPath)
+ applySourcePatch(patchPath, { actor, approvalHash, receiptPath, cwd })
```

### EVT-0506 — Weryfikacja

**Status:** `VERIFIED`

```text
npm test                 → 24/24 PASS
npm run demo:autonomy    → PASS (authority, fixture gate, failure)
npm run demo:mutation    → PASS (grant ok, proposal proposed, directory-copy)
```

Nowe testy:

- `test/mutation-grant.test.ts` (HMAC, tamper, jti, isolation, propose, probes)

---

## 5. Living project — co działa autonomicznie (operacyjnie)

### 5.1 projectDSL (szkielet living project)

Po `project-create` generowany jest m.in. dokument projektu (logicznie):

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

### 5.2 Komendy autonomicznej pętli

```bash
# jednorazowa iteracja
node dist/src/cli/main.js project-iterate project.projectdsl .living-runtime deterministic

# ciągła ewolucja (watcher)
node dist/src/cli/main.js project-watch project.projectdsl .living-runtime prefer-llm

# status
node dist/src/cli/main.js project-status .living-runtime

# brama usług
node dist/src/cli/main.js service-check
```

Docker (w wygenerowanym projekcie):

```bash
docker compose up -d --build
docker compose run --rm runtime service-check
docker compose run --rm runtime \
  project-iterate /project/project.projectdsl /project/.living-runtime deterministic
docker compose run --rm runtime \
  project-watch /project/project.projectdsl /project/.living-runtime prefer-llm
```

### 5.3 Artefakty każdej iteracji (`.living-runtime/`)

```text
receipts/<iteration>.json      # subactor.living-iteration/v2
candidate/math.json
candidate/twin.json
candidate/scene.* / OpenUSD
candidate/improvement.json     # improvementDSL
candidate/development.evidence.json
current/                       # last-known-good po ok validation
failures/                      # living-failure
dead-letter.jsonl
events.jsonl
.iteration-lease/
mutations/                     # 0.5.0: propose/apply receipts (gdy użyte)
```

### 5.4 Tryby autonomii

| Mode | Zachowanie | Status |
|------|------------|--------|
| `observe` | tylko analiza / projekcja | `AUTONOMOUS` |
| `propose` | + improvementDSL + mutation-propose | `AUTONOMOUS` (domyślny) |
| `apply` | intencja mutacji + izolowany apply po grant | `EXECUTED` control-plane; promocja `PENDING` |

---

## 6. Nanobionic Laboratory — plan bootstrapu (sesja T5–T6)

### 6.1 Źródła wiedzy

| Ścieżka | Rola |
|---------|------|
| `/home/tom/github/bioxfoundry/idea/Atvirojo kodo biofoundry studija-1.pdf` | intencja strategiczna + evidence customer |
| `/home/tom/github/bioxfoundry/nanobionic-laboratory/**` | korpus: SiLA/ROS/OpenTwins, OSCAR, BIO-SPEC, CAD, software |

### 6.2 Gdzie ma żyć intencja (nie w PDF)

| Artefakt | Rola |
|----------|------|
| `data/manager/policy.md` | **authority** — skrócona intencja operacyjna |
| `project.projectdsl` → `MANAGER_INTENT` | kontrakt projektu |
| `project/ticket-001/user-manager.md` | ticket request |
| `config/development.intent.fixture.json` | seed t2c.intent (do czasu real todo2code) |
| PDF przez `project-add-source … customer` | evidence (imports + manifest) |

### 6.3 Intencja menedżera (planowana treść z PDF)

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

### 6.4 Komendy bootstrapu (PLANNED / PENDING — nie wykonane w sesji)

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

**Status katalogu living project:**  
`/home/tom/github/bioxfoundry/projects/nanobionic-laboratory` — **EXISTS** (bootstrap + iterate 2026-08-06).

### 6.6 Pierwsza iteracja (EXECUTED)

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

Źródła w `imports/manifest.jsonl`:

```text
customer  idea/Atvirojo kodo biofoundry studija-1.pdf
customer  nanobionic-laboratory/A. SPECIFIKACIJA
project   nanobionic-laboratory/0. Architecture
development  I. Bioreactor/.../Software  (+ code/src/bioreactor/)
project   nanobionic_lab_whitepaper.pdf
```

### 6.5 Oczekiwane twinDSL / treeDSL po pierwszej iteracji (przykład docelowy)

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
# logiczny kształt (po materializacji runtime zapisuje JSON twinDSL)
# komponenty uziemione w resource URI ze źródeł customer/project/development
TWIN nanobionic-laboratory
SOURCE_SNAPSHOT <sha256>
COMPONENT lab.facility
  SOURCE_URI urn:subactor:resource:sha256:...
  CHILD digital.infrastructure
  CHILD hardware.modules
```

---

## 7. Rejestr plików zmienionych / dodanych w sesji 0.5.0

### Dodane

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
docs/EVENT_HISTORY_AUTONOMY.md          # ten plik
```

### Zmodyfikowane (główne)

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

### Reużyte zewnętrznie (bez kopiowania całego repo)

```text
subactor/runtime        apply-grant (HMAC model)
semcod/todo2code        propose-source-patch / apply-source-patch CLI
subactor/twin-probes    autonom-cycle/v1
subactor/autonomy-lab   canary/promotion patterns (docs only)
```

---

## 8. Co dalej działa autonomicznie (kontrakt operacyjny)

Po utworzeniu living project i uruchomieniu `project-watch` system **sam**:

1. skanuje źródła manager/customer/project/archive/development/runtime  
2. buduje resource / tree / observation  
3. wywołuje development evidence (todo2code lub fixture wg policy)  
4. scala mathDSL z ochroną authority  
5. buduje twin + scene (OpenUSD)  
6. waliduje grounding URI  
7. publikuje candidate lub current (last-known-good)  
8. generuje `improvementDSL` propose-only  
9. zapisuje receipt, eventy, failures, dead-letter  
10. limituje tempo i blokuje równoległe iteracje lease’em  

**Nie robi autonomicznie (domyślnie):**

- nie zmienia kodu live bez grantu + apply mode  
- nie promuje patchy z izolacji do main  
- nie uruchamia canary/rollback  
- nie zastępuje niezależnego evaluatora  

---

## 9. Macierz statusów końcowych

| Obszar | Status |
|--------|--------|
| Knowledge loop (research → resource → tree/query/math) | `AUTONOMOUS` |
| Development loop (todo2code evidence) | `AUTONOMOUS` (fixture/real wg policy) |
| Execution loop (twin/scene/publish) | `AUTONOMOUS` w granicach gates |
| Authority vs LLM | `VERIFIED` + `AUTONOMOUS` |
| Improvement proposals | `AUTONOMOUS` (propose-only) |
| Mutation control plane 0.5.0 | `EXECUTED` + `VERIFIED` |
| Real t2c patch + re-analysis E2E | `PENDING` |
| Canary / promotion / evaluator | `PENDING` |
| Nanobionic living project bootstrap | `EXECUTED` + first iterate `VERIFIED` |
| Dokumentacja historii zdarzeń | `EXECUTED` (ten plik) |

---

## 10. Powiązane dokumenty

| Plik | Treść |
|------|--------|
| `docs/AUTONOMY_MODEL.md` | model bramek i mutacji |
| `docs/FULL_AUTONOMY_GAPS.md` | luki do pełnej autonomii kodu |
| `docs/AUTONOMY_FINDINGS.md` | wnioski z testów 0.4.0 |
| `docs/PROJECT_WIZARD.md` | kreator living project |
| `docs/QUICK_SOURCE_RECIPES.md` | dodawanie PDF/ZIP/kodu |
| `docs/CONTINUOUS_DIGITAL_TWIN_LOOP.md` | pętla ciągła |
| `VERIFICATION.md` | raport weryfikacji 0.5.0 |
| `CHANGELOG.md` | 0.4.0 / 0.5.0 |
| `examples/autonomy/` | scenariusze i grant/plan examples |

---

## 11. Podpis sesji

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
# minimalny „event” zamykający sesję (logiczny)
EVENT session.closed
PROJECT twin-dsl
TRACE session-2026-08-06-autonomy-0.5.0
RESULT delivered:grant,isolation,mutation-pipeline,probes,docs
RESULT pending:nanobionic-bootstrap,canary,promotion,real-t2c-e2e
AUTHORITY fail-closed
AUTONOMY_MODE propose
```
