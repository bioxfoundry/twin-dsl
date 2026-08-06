# Subactor Digital Twin Runtime Starter 0.3.0

Uruchamialny starter zamkniętej pętli:

```text
research: źródła → resourceDSL/treeDSL/queryDSL/mathDSL
    ↓
development: wymagania + kod + Git → todo2code t2c.intent/v1 / evidence graph
    ↓
runtime: observationDSL + event log + środowisko
    ↓
Digital Twin: twinDSL → sceneDSL → OpenUSD
    ↓
feedback: zwalidowany rezultat wraca jako źródło następnej iteracji
```

To jest poprawny model zagadnienia, pod warunkiem że trzy pętle pozostają rozdzielone:

1. **knowledge loop** — pozyskuje i waliduje wiedzę;
2. **development loop** — porównuje intent z kodem i testami;
3. **execution loop** — aktualizuje Twin i artefakty dopiero po twardych bramkach.

`todo2code` pozostaje kanonicznym `intentDSL` dla poleceń, planów, kodu, Git, dokumentacji i diagnostyki Intent vs Reality. Subactor AQL/OQL/URI Process pozostaje granicą authority i efektów.

## Najszybszy start nowego żywego projektu

```bash
npm run build
node dist/src/cli/main.js project-create \
  "Customer Biofoundry" \
  ./projects/customer-biofoundry \
  biofoundry \
  "Aktualizuj zwalidowany Digital Twin na podstawie dokumentacji klienta, kodu i obserwacji runtime."

cd projects/customer-biofoundry
cp .env.example .env
docker compose up -d --build
docker compose logs -f runtime
```

Każdy projekt otrzymuje własne:

- `project.projectdsl` i `project.json`;
- katalogi manager/customer/project/archive/code/logs/environment/feedback;
- vendored, skompilowany runtime;
- osobny `docker-compose.yml`, sieć i volume ClickHouse;
- Docling, ClickHouse i watcher runtime;
- CI oraz release do GHCR;
- porty wyliczone dla projektu, aby ograniczyć konflikty;
- append-only event log, receipts, candidate i current artifacts.

## Dodawanie dowolnego źródła

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

Obsługiwane są pojedyncze pliki, katalogi, ZIP-y oraz DQL/sitemap dla WWW. Pliki Office/PDF/obrazy przechodzą przez Docling, a pliki tekstowe przez deterministyczny konwerter lokalny.

Jedna iteracja bez watchera:

```bash
docker compose run --rm runtime \
  project-iterate /project/project.projectdsl /project/.living-runtime deterministic
```

## Pętla bez dalszego używania NL

Natural language jest wyłącznie wejściem do utworzenia lub zmiany kontraktu DSL:

```text
NL → structured LLM → parser → canonical DSL AST → hash → review/AQL
```

Po materializacji runtime komunikuje się wyłącznie przez:

```text
projectDSL
resourceDSL
intentDSL / t2c graph
queryDSL + query-result
DQL
treeDSL
mathDSL
observationDSL
twinDSL
sceneDSL
iteration receipts
URI Process
```

LLM nie komunikuje się bezpośrednio z executorami. Zwraca wyłącznie propozycję typowanego DSL, która przechodzi parser, walidację domenową, hashowanie i bramki authority.

## OpenRouter: NL → wszystkie DSL

Obsługiwane wartości `kind`:

```text
intent resource query dql tree math twin scene project observation
```

```bash
export OPENROUTER_API_KEY="..."
export OPENROUTER_MODEL="mistralai/codestral-2508"

node dist/src/cli/main.js nl-to-dsl \
  project request.md out/project.json require-llm
```

- `intent` deleguje do lokalnego `todo2code`;
- pozostałe DSL korzystają z jednego klienta OpenRouter;
- odpowiedź używa strict JSON Schema i jest ponownie parsowana przez runtime;
- tryby: `deterministic`, `prefer-llm`, `require-llm`.

## Weryfikacja

```bash
npm run verify
```

Wersja 0.3.0 sprawdza:

- TypeScript strict;
- 10 kontraktów Proto;
- 11 testów parserów i integracji;
- NL → 10 DSL;
- OpenRouter structured-output mock;
- foldery, ZIP i DQL/sitemap;
- Biofoundry real-time;
- adapter procesu `todo2code`;
- generator izolowanego projektu;
- pełny living loop: research → development → observations → math → twin → scene → feedback;
- no-change i blokadę publikacji po cofnięciu polityki managera;
- kontrakty Docker Compose i CI/CD.

## Docker i CI/CD

Środowisko główne:

```bash
docker compose up -d --build
```

Projekt wygenerowany przez wizard ma własny Compose. GitHub Actions wykonuje `project-verify`, `docker compose config`, build obrazów i jedną deterministyczną iterację. Workflow release buduje obraz runtime i publikuje go do GHCR.

W środowisku, w którym przygotowano paczkę, nie było dostępnego demona Docker. Compose i workflow zostały zweryfikowane kontraktowo oraz składniowo, ale obrazy ClickHouse/Docling nie zostały tu faktycznie uruchomione. CI dostarczony w paczce wykonuje brakującą bramę na runnerze z Dockerem.

## Aktualny poziom autonomii

Zaimplementowano **ciągłą autonomię modelu i sceny w obrębie zatwierdzonego projectDSL**:

- obserwowanie zmian;
- inkrementalne snapshoty;
- twarde bramki mathDSL;
- publikacja tylko zielonej sceny;
- ostatnia poprawna wersja;
- feedback do następnej iteracji;
- brak ponownego runu dla identycznego stanu.

Nie zaimplementowano jeszcze bezwarunkowej autonomicznej samomodyfikacji kodu runtime. Domyślna polityka generowanych projektów ma:

```text
POLICY_ALLOW_RUNTIME_SELF_MODIFICATION false
```

Pełna autonomia kodu wymaga podpisanego AQL/OQL grant, branch/PR sandbox, source patch związany z hashem, pełnych testów, canary, rollback, limitów kosztu i niezależnego acceptance po ponownej analizie `todo2code`.

## Dokumentacja

- `docs/CONTINUOUS_DIGITAL_TWIN_LOOP.md`
- `docs/PROJECT_WIZARD.md`
- `docs/FULL_AUTONOMY_GAPS.md`
- `docs/CI_CD.md`
- `docs/QUICK_SOURCE_RECIPES.md`
- `docs/REALTIME_BIOFOUNDRY.md`
- `docs/TODO2CODE_INTEGRATION.md`
- `VERIFICATION.md`
