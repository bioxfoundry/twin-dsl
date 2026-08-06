# Subactor Digital Twin Runtime Starter 0.2.0

Uruchamialny starter łączący istniejący `todo2code` jako walidowalny `intentDSL` z zasobami, OpenRouter, DQL/sitemap crawling, ClickHouse, konwersją dokumentów, `queryDSL`, `treeDSL`, `mathDSL`, `twinDSL`, `sceneDSL`, CQRS/ES i aktualizowaną sceną OpenUSD.

## Co zostało ponownie użyte

- `https://github.com/semcod/todo2code` — kanoniczny `t2c.intent/v1`, NL → Intent Evidence DSL, graf, diagnostyka i audyt OpenRouter;
- Subactor AQL/OQL/URI Process — authority, ticket-before-effect, idempotency i receipts;
- ClickHouse — szybka projekcja treści i wyników zapytań;
- Docling — konwersja PDF/Office/obrazów do Markdown;
- protokół Sitemap — kontrolowane odkrywanie stron przez DQL;
- OpenUSD — materializacja konceptualnej sceny 3D z Digital Twin.

Repozytorium `semcod/todo2coded` nie istnieje; integracja wskazuje istniejące `semcod/todo2code`.

## Główna zasada

```text
LLM proponuje DSL
→ parser i walidator odrzucają obce pola
→ runtime wiąże zasoby, snapshoty i URI
→ mathDSL sprawdza twarde bramki
→ dopiero wtedy materializowane są Twin i scena
```

Model nie generuje hashy zasobów, nie nadaje authority, nie uznaje własnego claimu za fakt i nie zapisuje bezpośrednio sceny 3D.

## Pełna weryfikacja

```bash
npm install
npm run verify
```

W środowisku bez dostępu do npm wystarczą globalny TypeScript i lokalne `@types/node`. Archiwum zawiera zweryfikowany `dist/`, więc demonstracje można uruchomić również bez przebudowy.

`verify` wykonuje:

1. TypeScript strict;
2. kontrolę kontraktów Proto;
3. testy parserów, OpenRouter mock, DQL, ZIP i Biofoundry;
4. starszy pipeline query/tree/math;
5. `NL → każdy DSL` na fixture;
6. research lokalny + ZIP + sitemap;
7. start Biofoundry;
8. symulację dwóch zmian w czasie rzeczywistym.

## OpenRouter: NL → wszystkie DSL

```bash
cp .env.example .env
# ustaw OPENROUTER_API_KEY i OPENROUTER_MODEL

npm run build
node dist/src/cli/main.js nl-to-dsl math request.md out/math.json require-llm
node dist/src/cli/main.js nl-to-dsl scene request.md out/scene.json require-llm
```

Obsługiwane wartości `kind`:

```text
intent resource query dql tree math twin scene
```

- `intent` deleguje do lokalnego `todo2code`;
- pozostałe DSL korzystają ze wspólnego klienta OpenRouter;
- wywołania używają `response_format=json_schema`, `strict=true`, `provider.require_parameters=true` i opcjonalnego `response-healing`;
- odpowiedź jest ponownie walidowana przez parser domenowy;
- dostępne tryby: `deterministic`, `prefer-llm`, `require-llm`.

Offline:

```bash
npm run demo:nl-dsl
ls .nl-dsl-run/
```

## Researcher: folder + ZIP + internet

```bash
npm run demo:research
cat .research-run/summary.json
```

Przebieg:

```text
lokalne notatki + customer ZIP
→ bezpieczne rozpakowanie
→ resourceDSL + immutable URI

DQL + sitemap.xml
→ allowlist hostów i ścieżek
→ budżet URL
→ konwersja HTML → Markdown
→ internet resources

wszystkie zasoby
→ snapshot
→ queryDSL
→ treeDSL result + citations
→ mathDSL evidence gate
```

Żywy crawl:

```bash
node dist/src/cli/main.js crawl path/to/research.dql out/crawl
```

## Real-time Biofoundry Digital Twin

```bash
npm run demo:biofoundry
cat .biofoundry-run/latest.json
cat .biofoundry-run/current/scene.usda
```

Tryb ciągły:

```bash
DT_WATCH_INTERVAL_MS=2000 \
node dist/src/cli/main.js biofoundry-watch \
  examples/biofoundry/biofoundry.config.json \
  .biofoundry-live \
  prefer-llm
```

Watcher analizuje:

- `manager-guidelines/` — twarda polityka i zgoda;
- `customer-docs/` — wymiary i wymagania;
- `project-data/` — bieżący stan obserwowany;
- `archives/*.zip` — materiały historyczne z osobnym lineage;
- DQL/sitemap — wiedza kontekstowa z internetu.

Przy zmianie:

```text
resource diff
→ nowy snapshot
→ treeDSL
→ mathDSL startup gates
→ twinDSL
→ sceneDSL
→ scene diff
→ OpenUSD
→ receipt
```

Jeżeli `SceneRebuildAllowed=false`, kandydat trafia do `candidate/`, a `current/scene.usda` pozostaje ostatnią poprawną sceną.

Symulacja real-time:

```bash
npm run demo:realtime
cat .biofoundry-realtime-demo/demo-summary.json
```

Pokazuje:

1. poprawny start;
2. zmianę temperatury 37 → 39°C i przebudowę sceny;
3. przekroczenie limitu aktywnych bioreaktorów;
4. zablokowanie nowej sceny i zachowanie ostatniej poprawnej wersji.

## Docker

```bash
docker compose up --build
```

Uruchamia:

- ClickHouse;
- Docling;
- runtime Node.

Aby researcher demo użył rzeczywistej projekcji zamiast pamięciowej:

```bash
DT_SEARCH_BACKEND=clickhouse CLICKHOUSE_URL=http://127.0.0.1:8123 npm run demo:research
```

## Artefakty Biofoundry

```text
.biofoundry-run/
├── candidate/
│   ├── resources.json
│   ├── tree.json
│   ├── math.json
│   ├── math.dsl
│   ├── twin.json
│   ├── scene.json
│   ├── scene.usda
│   ├── scene.diff.json
│   └── generation-audit.json
├── current/                 # tylko po zielonych bramkach
├── receipts/
├── state/
└── latest.json
```

## Dokumentacja

- `docs/ARCHITECTURE.md`
- `docs/DSL_SPEC.md`
- `docs/OPENROUTER_NL_TO_DSL.md`
- `docs/TODO2CODE_INTEGRATION.md`
- `docs/DQL_PROFILES.md`
- `docs/RESEARCHER_WORKFLOWS.md`
- `docs/REALTIME_BIOFOUNDRY.md`
- `docs/TEST_PLAN.md`
- `VERIFICATION.md`

## Granice

To jest testowalny starter, nie pełny produkt produkcyjny. Przed produkcją nadal potrzebne są m.in. trwały event store, Temporal/BullMQ, AV i pełna izolacja konwerterów, AQL bridge, podpisy receipts, OpenTelemetry, backup/restore oraz prawdziwy adapter OpenUSD/CAD/BIM.
