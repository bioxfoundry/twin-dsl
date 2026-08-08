# Audit konwersji, Digital Twin i zgodności z intencją

## Która paczka konwertuje i tłumaczy?

Za konwersję odpowiada `twin-dsl/py/f2md` (publikowana jako `f2md`).

- `LocalToolConverter` uruchamia Pandoc dla LaTeX (`.tex` → Markdown), PDF i Office.
- `TextConverter` jest bezpiecznym fallbackiem, gdy wyspecjalizowany backend jest niedostępny.
- `STLMetadataConverter` lokalnie odczytuje binarne/ASCII STL (trójkąty, bounding box i wymiary),
  więc awaria Docling nie tworzy już pustego placeholdera dla siatki.
- `ArgosTranslator` tłumaczy Markdown offline; przy dokumentach poufnych polityka `hybrid` nie
  wysyła treści do sieci.
- `tree.py` zapisuje oryginał jako `*.secret.<lang>.md`, a język docelowy bez sufiksu, np.
  `report.tex.secret.lt.md` + `report.tex.secret.md`.

Kolejność jest celowa: format źródłowy → strukturalny Markdown → tłumaczenie Markdown. Dzięki
temu tłumacz nie musi rozumieć LaTeX-a, a konwerter nie miesza ekstrakcji z tłumaczeniem.

## Audyt korpusu

```bash
PYTHONPATH=twin-dsl/py/f2md/src \
  python -m f2md.audit \
  ../nanobionic-laboratory ../nanobionic-laboratory-md \
  --secret-pattern konfidencial \
  --json > audit-report.json
```

Audyt sprawdza:

- kompletność mapowania źródło → Markdown i kopertę proweniencji;
- zgodność `source`, `inputKind`, `confidential`, `language` i backendu;
- użycie Pandoca dla `.tex`;
- zamknięcie bloków kodu, liczbę nagłówków i obecność tabel;
- parę oryginał/tłumaczenie oraz metryki backendów;
- błędy jako `ERROR`, problemy do następnej iteracji jako `WARNING` i wskazówkę naprawy.

Audyt artefaktów twina:

```bash
PYTHONPATH=twin-dsl/py/f2md/src \
  python -m f2md.audit \
  ../nanobionic-laboratory ../nanobionic-laboratory-md \
  --twin ../projects/nanobionic-laboratory-md/.living-runtime/current
```

Sprawdzane są `twin.json`, `scene.json`, `scene.usda`, liczba komponentów i bindingów oraz liczba
komponentów bez geometrii. `GEOMETRY_UNGROUNDED` nie jest cichym sukcesem: oznacza, że Markdown
zawiera opis, ale runtime nie ma jeszcze zweryfikowanego CAD/IFC/survey/floor-plan.

## Intencja → dowód → artefakt

Każda iteracja powinna przechowywać `development.intent.json`, `development.evidence.json`,
`generation-audit.json`, `twin.json`, `scene.json`, `scene.usda` i `improvement.dsl`. Te pliki są
maszynowo walidowalne przez istniejące `intentDSL`, `observationDSL`, `twinDSL`, `sceneDSL` i
`improvementDSL`; raport audytu jest dodatkowym, czytelnym dowodem jakości, a nie zamiennikiem
bramek runtime.

Drugą warstwę można wygenerować z angielskiego korpusu:

```bash
PYTHONPATH=twin-dsl/py/f2md/src \
  python -m f2md.intent_compile \
  ../nanobionic-laboratory-md ../nanobionic-laboratory-md-dsl
```

Powstają pakiety `*.intent.json` oraz `compile-report.json`. Każdy rekord przechodzi walidację
`t2c.intent/v1`; kanoniczny walidator TypeScript runtime może potwierdzić wynik przed użyciem go
w kolejnej iteracji.

Po ponownym przebiegu korpusu: 134 pliki źródłowe, 129 konwersji tekstowych/metadanych, 0 braków
mapowania, 12 tłumaczeń oraz 16 konwersji `stl-metadata`. Audyt zakończył się `errors=0`; pozostałe
ostrzeżenia dotyczą głównie niespójnych markerów poufności oraz 10 komponentów Twina, dla których
runtime nadal nie ma przypisanego rekordu fizycznego. Po uruchomieniu `physical-intake` liczba
placeholderów spadła z 12 do 10; dwa komponenty cell-free zostały oznaczone jako `cad` na podstawie
istniejących plików STEP.

## Pętla zwrotna DSL w runtime

Aktywne pobieranie DSL odbywa się w `src/runtime/living-project.ts`:

1. `scanSources()` skanuje źródła projektu, w tym `imports/derived/...nanobionic-laboratory-md-dsl`.
2. `indexIntentDsl()` wyszukuje pakiety `*.intent.json`, czyta oryginalny JSON (także dla nazw
   typu `report.docx.md.intent.json`) i uruchamia `validateT2cIntent()` dla każdego pakietu.
3. Wynik jest częścią `stableKey` i kontekstu generatora Twin/scene. Zmiana DSL wymusza nową iterację.
4. Niepoprawny pakiet ustawia `IntentDslValidationFailed`, blokuje `IterationAllowed` i publikację sceny.
5. Każdy cykl zapisuje indeks w `current/intent-dsl.index.json`, a `feedback/latest.md` zawiera liczbę
   pakietów, rekordów i błędów. W ostatnim przebiegu: 112 pakietów, 1269 rekordów, 0 błędów.

Uruchomienie pętli powinno wskazywać katalog nadrzędny runtime (nie `current`):

```bash
cd /home/tom/github/bioxfoundry/twin-dsl
node dist/src/cli/main.js project-iterate \
  /home/tom/github/bioxfoundry/projects/nanobionic-laboratory-md/project.projectdsl \
  /home/tom/github/bioxfoundry/projects/nanobionic-laboratory-md/.living-runtime deterministic
```

## Ocena `onlyDSL`

`/home/tom/github/tom-sapletta-com/onlyDSL` ma użyteczne idee: IFURI, event sourcing, source index
i ścisłą granicę LLM. Nie kopiujemy jego równoległych implementacji DSL do `twin-dsl`, ponieważ
runtime posiada już walidatory i stabilne schematy `subactor.*`. Sensowna integracja to eksport
raportu audytu jako artefaktu z URI/proweniencją i dalsze użycie istniejących bramek `todo2code`;
bezpośrednie zastąpienie nimi obecnych walidatorów zwiększyłoby dryf schematów.

## Niedostateczny model 3D

Jeżeli audyt pokazuje wiele `componentsWithoutGeometry`, model pozostaje konceptualny mimo bogatej
dokumentacji. Następny krok to `physical-intake` z rekordami `document`, `measured`, `cad`, `ifc`
lub `verified`, wskazującymi pliki w zaimportowanym korpusie. Dashboard wizualizuje klasę dowodu
kolorem, więc postęp jest widoczny i mierzalny.

Pełny plan regresji, testów negatywnych i kryteriów promocji znajduje się w
[`NEXT_TEST_PLAN.md`](NEXT_TEST_PLAN.md).

## Nagranie do prezentacji

Dashboard ma przycisk `Record 3D video`. Nagranie odbywa się lokalnie z `canvas.captureStream(30)`
i pobiera plik WebM po zatrzymaniu. Do prezentacji należy dołączyć plik razem z `audit-report.json`
oraz numerem rewizji z `generation-audit.json`, aby obraz miał odpowiadający mu dowód tekstowy.
