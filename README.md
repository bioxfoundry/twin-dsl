# Subactor Digital Twin Runtime Starter 0.5.0

## Iterations

### 1
![img.png](img.png)

### 2
![img_1.png](img_1.png)

### 3
![img_2.png](img_2.png)


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
npm run verify          # typecheck, testy, wszystkie dema — pełna weryfikacja
```

Test dystrybucji z gotowego `dist/`, bez kompilacji TypeScript:

```bash
npm run verify:dist
```

Usługi pomocnicze (ClickHouse + Docling) przez `make`:

```bash
make up            # tworzy .env z .env.example przy pierwszym uruchomieniu, buduje i startuje
make service-check # sprawdza, czy oba serwisy odpowiadają
make logs
make down          # zatrzymuje, ale ZACHOWUJE wolumeny (modele Docling, dane ClickHouse)
make down-clean    # kasuje też wolumeny — kolejny start pobierze modele od nowa
```

Powtórny `make up` korzysta z cache BuildKit: pierwszy build obrazu Docling trwa kilkanaście minut,
kolejne kilka sekund.

## Konwersja dokumentów do Markdown

Do zasilania twina dokumentacją służy **[f2md](py/f2md)** — wyodrębniona paczka, publikowana jako
`f2md` na PyPI i `@subactor/f2md` na npm. Nie jest kolejnym uniwersalnym konwerterem: to warstwa
orkiestracji i śledzenia pochodzenia nad wymiennymi backendami (PyMuPDF, MarkItDown, Docling,
pdftotext/pandoc, Turndown/Mammoth).

### Cały folder naraz

To jest sposób, w jaki powstał [`nanobionic-laboratory-md`](https://github.com/bioxfoundry/nanobionic-laboratory-md):

```bash
pip install 'f2md[pymupdf]'                 # rdzeń jest stdlib-only; PDF to opcjonalny extra
apt install poppler-utils pandoc            # dla PDF/Office bez Doclinga

make up                                     # opcjonalnie: Docling dla skanów i OCR

DOCLING_URL=http://127.0.0.1:15001 \
  f2md --tree ../nanobionic-laboratory ../nanobionic-laboratory-md \
       --secret-pattern 'konfidencial'
```

Struktura wyjścia odwzorowuje wejście **1:1**, jeden plik na jeden plik:

```
nanobionic-laboratory/A/report.pdf
        ↓
nanobionic-laboratory-md/A/report.pdf.md
```

Oryginalne rozszerzenie zostaje przed `.md`, więc nazwa nadal mówi, co ją wyprodukowało, a dwa
pliki różniące się tylko rozszerzeniem nigdy nie kolidują.

Przydatne opcje:

| opcja | działanie |
| --- | --- |
| `--only .pdf,.docx` | ogranicza przebieg do wybranych typów |
| `--quiet` | bez postępu per plik (postęp idzie na stderr, JSON na stdout) |
| `--secret-pattern REGEX` | pliki pasujące trafiają do `<nazwa>.secret.md` z `confidential: true` |
| `--docling-url URL` | dopina Docling jako ostatnie ogniwo (skany, tabele, OCR) |

Przebieg jest idempotentny — nadpisuje w miejscu — i odmawia zapisu wewnątrz katalogu źródłowego,
co inaczej podałoby wygenerowany Markdown na wejście kolejnego uruchomienia.

### Co dostajesz w każdym pliku

Każdy plik ma front matter z pełną kopertą konwersji, więc pochodzenie przeżywa granicę katalogu:

```yaml
---
source: "/home/tom/github/bioxfoundry/nanobionic-laboratory/Saptera_Technologine_Kortele_Dark_Factory_v1.pdf"
sourceRelative: "Saptera_Technologine_Kortele_Dark_Factory_v1.pdf"
inputKind: ".pdf"
mediaType: "application/pdf"
confidential: true
converter: "pymupdf4llm"
converterVersion: "1.28.2"
backendType: "python"
ocr: true
fallbackDepth: 2
durationMs: 816
extractedChars: 7495
converted: true
warnings: []
---
```

Najważniejsze pola:

- **`source`** — ścieżka **absolutna** do oryginału, więc plik md wskazuje na źródło nawet po
  przeniesieniu czy opublikowaniu gdzie indziej; `sourceRelative` odwzorowuje układ drzewa;
- **`converter` / `converterVersion`** — który backend faktycznie zadziałał. Bez tego nie odróżnisz
  czystej ekstrakcji od zgadywanki OCR trzy kroki później;
- **`ocr`** — czy tekst powstał z rozpoznawania obrazu. W korpusie nanobionic **52 ze 101** plików
  przeszły OCR, co powinno ważyć na zaufaniu do ich treści;
- **`fallbackDepth`** — ile backendów odmówiło, zanim któryś wziął plik. Wysoka wartość na całym
  korpusie oznacza źle ustawioną kolejność łańcucha;
- **`warnings`** — obcięcie tekstu, utracone tabele, diagnostyka backendu. Straty są zapisane,
  a nie po cichu porzucone;
- **`backendType`** — `stdlib` / `binary` / `python` / `http`, czyli ile ta konwersja realnie kosztuje.

### Pliki bez warstwy tekstowej

Siatki CAD (STL, F3D, SCAD) i archiwa ZIP też dostają plik `.md` — z front matter i krótkim stubem
wyjaśniającym, dlaczego nie ma treści. Drzewo, które po cichu pomija pliki, nie zgadza się ze
źródłem, a to gorsze niż jawne „tu nie ma tekstu". W korpusie nanobionic to 33 ze 134 plików.

### Pojedynczy plik

```bash
f2md notes.md                     # Markdown na stdout
f2md report.pdf --json            # pełna koperta jako JSON
f2md imports/report.pdf-9f2c8ad4  # nazwy content-addressed też działają
f2md scan.pdf --backend docling   # wymuszenie konkretnego backendu
f2md --detect *.pdf               # tylko wykryty typ i media type
```

Ten sam kontrakt w Node.js — `npx f2md --tree src/ out/`. Oba pakiety emitują identyczną kopertę;
`npm run f2md:conformance` pilnuje, żeby się nie rozjechały.

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

## Od placeholdera do fizycznego twina

Geometria startuje jako jawny placeholder i twardnieje, gdy pojawią się realne dane — **bez zmiany
tożsamości komponentu**. To kontrakt, na którym opiera się cała ścieżka:

```
componentId  zostaje ten sam
scenePath    zostaje ten sam
zmienia się tylko reprezentacja fizyczna i jej pochodzenie
```

Dzięki temu `liquid_handler_01` przechodzi `placeholder → measured → cad → ifc → verified`, zamiast
stać się pięcioma różnymi urządzeniami. Szczegóły: [`docs/PHYSICAL_EVIDENCE_INTAKE.md`](docs/PHYSICAL_EVIDENCE_INTAKE.md).

```bash
# szablon do wypełnienia
cp physical-intake/templates/physical-evidence.template.json baseline/physical-evidence.json

# nałożenie na istniejącą parę twin/scene
node dist/src/cli/main.js physical-intake twin.json scene.json baseline/physical-evidence.json

# trwale: wpięcie w projekt (wchodzi do hasha konfiguracji, więc wymusza nową rewizję)
echo 'SCENE_PHYSICAL_EVIDENCE_FILE "baseline/physical-evidence.json"' >> project.projectdsl
```

Intake odrzuca dane, które łamałyby kontrakt: nieznany `componentId`, dowód słabszy niż istniejący,
plik siatki spoza zaingestowanego korpusu, jednostki inne niż metry.

```bash
npm run demo:physical   # pełny przebieg end-to-end, wywala build gdy tożsamość się zmieni
```

## Dashboard 3D

Podgląd żywego twina w przeglądarce — bez zależności, własny renderer WebGL:

```bash
node dist/src/cli/main.js dashboard <project.projectdsl> <runtime-out-dir> [port]
# domyślnie http://127.0.0.1:7331/
```

Kolor koduje **stopień dowodu geometrycznego**, nie typ komponentu, więc widać, jak fabryka
twardnieje w miarę napływu danych: szary `placeholder`, bursztynowy `document`, niebieski
`measured`, zielony `cad`, fioletowy `ifc`, miętowy `verified`. Obok sceny raportowane są
niezmienniki tożsamości (`componentIdsStable`, `scenePathsStable`).

Endpointy: `/api/state`, `/api/scene.usda` (eksport OpenUSD), `POST /api/iterate`, `POST /api/intake`.

> Usługa **nie ma uwierzytelniania ani ochrony CSRF**, a `/api/iterate` i `/api/intake` modyfikują
> projekt na dysku. Słucha tylko na `127.0.0.1` — to narzędzie do lokalnej inspekcji, nie wystawiaj
> go na publiczny interfejs. Szczegóły: [`docs/DASHBOARD.md`](docs/DASHBOARD.md).

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
