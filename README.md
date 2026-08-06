# Subactor Digital Twin Runtime Starter 0.5.0

![img.png](img.png)

Uruchamialny starter ciągłej, audytowalnej pętli Digital Twin:

```text
research: pliki / katalogi / ZIP / WWW → resourceDSL → treeDSL/queryDSL/mathDSL
    ↓
development: wymagania + kod + Git + testy → todo2code t2c.intent/v1 + diagnostics
    ↓
runtime: observationDSL + event log + dane środowiskowe
    ↓
authority: deterministyczne bramki mathDSL + projectDSL + signed-grant policy
    ↓
Digital Twin: twinDSL → sceneDSL → OpenUSD
    ↓
feedback + improvementDSL → następna iteracja researchu i developmentu
```

System rozdziela trzy pętle:

1. **knowledge loop** — pozyskuje, adresuje i waliduje wiedzę;
2. **development loop** — porównuje intent z kodem, testami i Git;
3. **execution loop** — aktualizuje Twin i artefakty dopiero po twardych bramkach runtime.

`todo2code` pozostaje kanonicznym Intent Evidence DSL dla poleceń, planów, kodu, Git, dokumentacji i diagnostyki Intent vs Reality. Subactor AQL/OQL/URI Process pozostaje granicą authority i efektów. LLM może proponować DSL, ale nie definiuje bramek bezpieczeństwa i nie wywołuje executorów bezpośrednio.

## Co zmieniło się w 0.4.0

- twarde bramki `mathDSL` są generowane przez runtime i nie mogą zostać nadpisane przez odpowiedź LLM;
- prawdziwy `todo2code` ma pierwszeństwo przed fixture, a fixture wymaga jawnej polityki;
- development evidence zawiera status manifestu, diagnostyki, liczbę blokad i acceptance;
- każda zmieniona iteracja generuje propose-only `improvementDSL`;
- Twin i Scene przechodzą walidację uziemienia w znanych URI i komponentach;
- limit iteracji jest egzekwowany, a nie tylko deklarowany;
- trwała dzierżawa blokuje dwie równoległe iteracje tego samego projektu;
- watcher zapisuje failure receipt, event i dead-letter oraz stosuje bounded retry;
- zewnętrzne źródła są kopiowane do `imports/`, dzięki czemu pozostają dostępne wewnątrz Dockera;
- dodano rzeczywisty `service-check`: zapytanie `SELECT 1` do ClickHouse i health request do Docling;
- naprawiono konflikt numeru pola w Protobuf iteration v1 i dodano kontrakty v2/autonomy.

## Szybki start

```bash
npm install
npm run verify
```

Test dystrybucji z gotowego `dist/`, bez kompilacji TypeScript:

```bash
npm run verify:dist
```

## Kreator żywego projektu

```bash
npm run build
node dist/src/cli/main.js project-create \
  "Customer Biofoundry" \
  ./projects/customer-biofoundry \
  biofoundry \
  "Aktualizuj zwalidowany Digital Twin na podstawie dokumentacji klienta, kodu i obserwacji runtime."

cd projects/customer-biofoundry
cp .env.example .env
```

Każdy projekt otrzymuje własne:

- `project.projectdsl` i projekcję JSON;
- katalogi manager/customer/project/archive/code/logs/environment/feedback;
- vendored, skompilowany runtime;
- osobny Docker Compose, sieć i wolumen ClickHouse;
- Docling, ClickHouse i watcher runtime;
- CI oraz release do GHCR;
- append-only event log, receipts, dead-letter, candidate i current artifacts;
- skrypt bootstrapujący kanoniczny `semcod/todo2code`.

Start usług:

```bash
docker compose up -d --build

docker compose run --rm runtime service-check
docker compose logs -f runtime
```

Jedna deterministyczna iteracja:

```bash
docker compose run --rm runtime \
  project-iterate /project/project.projectdsl /project/.living-runtime deterministic
```

Tryb ciągły:

```bash
docker compose run --rm runtime \
  project-watch /project/project.projectdsl /project/.living-runtime prefer-llm
```

## Dodawanie dowolnego źródła

Źródło spoza projektu jest kopiowane do kontrolowanego `imports/<role>/` i otrzymuje wpis proweniencji w `imports/manifest.jsonl`.

```bash
node vendor/runtime/dist/src/cli/main.js project-add-source \
  project.projectdsl customer /data/customer/specification.pdf

node vendor/runtime/dist/src/cli/main.js project-add-source \
  project.projectdsl archive /data/customer/materials.zip

node vendor/runtime/dist/src/cli/main.js project-add-source \
  project.projectdsl development /home/user/repositories/device-runtime

node vendor/runtime/dist/src/cli/main.js project-add-source \
  project.projectdsl runtime /var/log/device-observations
```

Strona WWW przez DQL/sitemap:

```bash
node vendor/runtime/dist/src/cli/main.js project-add-website \
  project.projectdsl https://docs.example.com \
  "bioreactor, calibration, safety"
```

Obsługiwane są pojedyncze pliki, katalogi, ZIP-y i DQL/sitemap. Pliki Office/PDF/obrazy mogą przechodzić przez Docling, a treści tekstowe mają deterministyczny fallback lokalny.

## NL → wszystkie DSL

Obsługiwane `kind`:

```text
intent resource query dql tree math twin scene project observation improvement
```

```bash
export OPENROUTER_API_KEY="..."
export OPENROUTER_MODEL="mistralai/codestral-2508"

node dist/src/cli/main.js nl-to-dsl \
  improvement request.md out/improvement.json require-llm
```

Tryby:

```text
deterministic
prefer-llm
require-llm
```

Granica wykonawcza:

```text
NL
→ OpenRouter structured output
→ parser
→ canonical DSL AST
→ walidacja domenowa
→ hash
→ projectDSL/AQL authority
→ runtime
```

Po materializacji runtime współpracuje wyłącznie przez kontrakty DSL i URI. Natural language nie jest przekazywany do executorów.

## Aktualny poziom autonomii

Zaimplementowano ciągłą autonomię modelu i sceny **w obrębie zatwierdzonego `projectDSL`**:

- obserwowanie i inkrementalne snapshoty;
- development evidence z `todo2code`;
- obserwacje środowiskowe;
- deterministyczne bramki authority;
- publikacja wyłącznie zielonej sceny;
- last-known-good;
- idempotentne `noChange`;
- rate limiting;
- persistent lease;
- failure receipts i dead-letter;
- propose-only plan doskonalenia.

Samomodyfikacja źródeł runtime pozostaje wyłączona domyślnie:

```text
POLICY_ALLOW_RUNTIME_SELF_MODIFICATION false
POLICY_AUTONOMY_MODE propose
POLICY_REQUIRE_SIGNED_MUTATION_GRANT true
```

## Historia zdarzeń (plan / wykonanie / autonomia)

Pełny rejestr tego, co zaplanowano i wykonano w sesji operacyjnej oraz co działa dalej w pętli autonomicznej:

- [`docs/EVENT_HISTORY_AUTONOMY.md`](docs/EVENT_HISTORY_AUTONOMY.md)

## Mutacja kodu (0.5.0)

```bash
export MUTATION_GRANT_HMAC_SECRET="replace-me"
node dist/src/cli/main.js grant-issue <projectId> <planHash> <artifactSha256> code/ manager@example.com grant.json
node dist/src/cli/main.js mutation-propose project.projectdsl plan.json .living-runtime
```

Apply jest opcjonalny, wymaga `POLICY_AUTONOMY_MODE apply`, `POLICY_ALLOW_RUNTIME_SELF_MODIFICATION true`, skonsumowanego grantu i `approval-hash`; zapisuje wyłącznie w izolowanym worktree/katalogu.

Evidence z `subactor/twin-probes`:

```bash
node dist/src/cli/main.js probes-ingest cycle.json .living-runtime/candidate/probe.evidence.json
```

Pełna autonomia kodu wymaga jeszcze promocji z izolacji do drzewa głównego, canary/rollback (`autonomy-lab`), niezależnego evaluatora, trwałego event store i walidacji geometrii.

## Weryfikacja 0.4.0

```bash
npm run verify
```

Sprawdzone lokalnie:

- TypeScript strict;
- 12 kontraktów Proto z kontrolą duplikatów numerów pól;
- 17/17 testów Node;
- NL → 11 DSL;
- OpenRouter strict structured-output mock;
- DQL sitemap/context;
- foldery, ZIP i import ścieżek zewnętrznych;
- Biofoundry real-time;
- adapter procesu `todo2code`;
- generator izolowanego projektu;
- pełny living loop;
- ochrona authority przed LLM;
- fixture policy, rate limit i persistent lease;
- improvementDSL, failure receipts i dead-letter;
- prawdziwe żądania testowe do mocków ClickHouse i Docling;
- kontrakty Docker Compose i CI/CD.

W środowisku przygotowania paczki nie ma binarnego Dockera ani demona. `docker compose up`, budowa obrazów i sieciowa integracja prawdziwych kontenerów nie zostały wykonane lokalnie. Workflow `Docker Integration` uruchamia tę brakującą bramę na `ubuntu-latest`, w tym `runtime service-check`.

## Przykłady

```bash
npm run demo
npm run demo:nl-dsl
npm run demo:research
npm run demo:biofoundry
npm run demo:realtime
npm run demo:living
npm run demo:autonomy
```

Najważniejsze materiały:

- `examples/autonomy/README.md`
- `examples/biofoundry/`
- `examples/researcher/`
- `examples/nl-to-dsl/`
- `docs/AUTONOMY_MODEL.md`
- `docs/AUTONOMY_EXAMPLES.md`
- `docs/AUTONOMY_FINDINGS.md`
- `docs/GITHUB_AND_CI.md`
- `docs/PROJECT_WIZARD.md`
- `docs/FULL_AUTONOMY_GAPS.md`
- `VERIFICATION.md`
