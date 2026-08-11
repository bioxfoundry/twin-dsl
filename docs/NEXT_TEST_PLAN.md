# Plan kolejnych testów i iteracji

> Ten dokument zachowuje szczegółowy stan bazowy z 2026-08-08. Aktualny plan wykonawczy po
> wydaniu 0.5.34 znajduje się w [`NEXT_DEVELOPMENT_PLAN.md`](NEXT_DEVELOPMENT_PLAN.md).

## Stan bazowy — 2026-08-08

| Obszar | Wynik |
|---|---:|
| Python `f2md` | 40 passed, 2 skipped |
| JavaScript `@subactor/f2md` | 25 passed |
| Runtime Digital Twin | 95 passed |
| `onlyDSL` | 44 passed |
| `project-verify` | OK |
| audyt korpusu + Twin | 0 ERROR, 34 WARNING |
| Markdown → intentDSL | 112 plików, 1311 rekordów, 0 failures |
| kanoniczny `t2c.intent/v1` validator | OK, 53 rekordy biznesplanu |
| OpenRouter smoke test | OK, GLM-5.2 → 10 poprawnych rekordów |
| komponenty Twin | 44 (30 bindingów sceny + 14 jawnych części MOS3S bez zgadywanych transformacji) |
| aktywne bindingi mesh | 2 / 30 (2 unikalne assety; błędne 3 bindingi usunięte) |
| komponenty live-bound | 2 / 44 (3 właściwości: 1 stale, 2 expired w ostatniej rewizji) |
| kompletne assembly | 0 / 2; 2 / 17 wymaganych części kompletne; 16 assetów ugruntowanych, 3 części umieszczone |
| SCAD `lid_UNF` compilation | PASS: 130,216 triangles, 3MF + GLB + USDA |
| SCAD ↔ STEP reference validation | PASS: derived source, 23.37 µm / 25 µm reference tolerance |
| ostrzeżenia skanera runtime | 26: wyłącznie binarne CAD (23 GLB, 2 STL, 1 STEP); 0 błędnych prób `.pdf.md` |
| idempotencja pętli feedback | PASS: `noChange=true`, diff 0/0/0 po propagacji |

## Priorytet P0 — wykonywać przy każdej zmianie

1. `pytest` w `py/f2md`.
2. `npm test` w `js/f2md`.
3. `npm test` w runtime.
4. `python -m f2md.audit ... --twin ... --json`.
5. `python -m f2md.intent_compile ...` i walidacja jednego pełnego pakietu przez
   `validateT2cIntent` z runtime.
6. `project-verify` i deterministyczne `project-iterate`.
7. `geometry-build` dla każdego aktywnego kontraktu: dependency closure, 3MF/GLB/USD load,
   semantic mesh hash i niezależny reference check.

Akceptacja P0: brak błędów, niezmienione identyfikatory komponentów i ścieżki sceny, raport
audytu zapisany przy rewizji.

## Priorytet P1 — następna iteracja geometrii

1. Utrzymywać jawne `ACTIVE/current` oraz osobne `LATEST CANDIDATE`; odrzucona scena nie może być
   renderowana ani eksportowana, a jej diagnostyka nie może zastępować walidacji ACTIVE.
2. Usunąć asset-binding pojedynczej części do workflow/urządzenia. GL45 może wiązać tylko port,
   a `DisplayBox_2` tylko część przyszłego assembly bioprintera.
3. ~~Uzgodnić `lid_UNF.scad` z referencyjnym STEP i nie luzować walidacji.~~ Zrealizowane przez
   osobne źródło derived `lid_UNF.step-aligned.scad`: 18 mm, 130,216 trójkątów, reference extent
   23.37 µm przy limicie 25 µm; oryginalne źródło pozostaje niezmienione jako provenance.
4. Dla każdego komponentu `placeholder` wybrać istniejący dowód z korpusu:
   `*.step.md`, `*.stl.md`, `*.f3d.md`, `*.scad.md`, IFC, survey albo floor-plan.
5. Utworzyć `subactor.geometry-build/v1` dla wykonywalnych CAD albo
   `subactor.physical-evidence/v1` dla już zweryfikowanych siatek.
6. Utworzyć `subactor.physical-evidence/v1` z `assetUri` wskazującym zasób po imporcie,
   jednostką metrów i osią Z.
7. Wykonać `physical-intake` i sprawdzić, że grade rośnie, ale nigdy nie maleje.
8. Ponownie wyrenderować OpenUSD i sprawdzić, że liczba primów oraz rozmiary/pozycje odpowiadają
   bindingom sceny.

Akceptacja P1: `componentsWithoutGeometry` spada z 12 do 0 albo każdy pozostały placeholder ma
   jawny raport `NO_PHYSICAL_EVIDENCE` z uzasadnieniem.

## Priorytet P1 — semantyczny live twin

1. ~~Wdrożyć AssemblyDSL z trwałą hierarchią `device → assembly → part`.~~ Zrealizowane:
   `assembly-report.json/.dsl`, fail-closed identity/asset drift i osobne `PASS · INCOMPLETE`.
   Dalszy krok: pozyskać autorytatywne transformacje 14 części MOS3S i mesh płyty bioreaktora.
2. ~~Wdrożyć TwinState jako deterministyczną projekcję ObservationDSL.~~ Zrealizowane:
   `twin-state.json/.dsl`, source observation URN i fail-closed component identity.
3. ~~Wdrożyć LiveBindingDSL z TTL i `ON_STALE`.~~ Zrealizowane; dashboard pokazuje odrębnie
   `fresh|stale|expired|unknown`, a stara temperatura bootstrap nie jest stanem bieżącym.
4. Wdrożyć BehaviorDSL jako automat stanów niezależny od dashboardu.
5. Dodać VisualDSL, który jako jedyny może przełożyć Behavior/TwinState na materiał lub animację.
6. Dopiero po stabilnym modelu eventu dodać SSE; polling pozostaje mechanizmem awaryjnym.

Akceptacja: każda zmiana wizualna wskazuje `componentId`, observation URI, binding ID, stan przed/po
i regułę BehaviorDSL; brak jawnego bindingu nie może zmieniać sceny.

## Priorytet P1 — jakość konwersji i tłumaczeń

1. Usunąć 34 ostrzeżenia `CONFIDENTIALITY_MISMATCH` przez ponowne wygenerowanie całego drzewa
   jednym `--secret-pattern` albo przez oznaczenie wyjątków w manifestu.
2. Dodać testy regresji dla LaTeX z tabelą, matematyką, listą i blokiem `tcolorbox`.
3. Dodać test zachowania Markdown przy tłumaczeniu: nagłówki, listy, tabele, fenced code i URI
   nie mogą być zmienione przez Argos/OpenRouter.
4. Porównać SHA-256 źródła, `sourceRelative`, `translatedFrom` i `translationOf` dla obu plików.

Akceptacja P1: 0 ostrzeżeń poufności, pary `*.<lang>.md`/`*.md` kompletne, poprawny parser Markdown.

## Priorytet P2 — intentDSL i LLM

1. Dodać test snapshotów: ten sam Markdown daje ten sam `sourceHash`, ID rekordów i liczbę
   intentów.
2. Dodać test negatywny: brak `schema`, duplikat ID, obcy `targetUri` lub zmienione źródło musi
   zakończyć się `ERROR`, a nie publikacją.
3. ~~Testować OpenRouter z mockowanym endpointem, w tym lokalną naprawę błędu parsera.~~ Zrealizowane:
   błąd `MATH_HEADER_REQUIRED` wraca do modelu, fenced DSL jest normalizowany, 95/95 testów przechodzi.
4. Kontynuować realne testy GLM/Grok w `prefer-llm` z budżetem czasu. Ostatni GLM-5.2:
   z aktywnym todo2code MathDSL 36.4 s PASS (Baidu/OpenRouter), Twin i Scene przekroczyły
   budżet → jawny deterministic fallback, `validation.ok=true`; wcześniejsze wywołanie dokładnie
   z dashboardu trwało 141.6 s i również zakończyło się poprawną publikacją.

Akceptacja P2: 100% odpowiedzi LLM przechodzi walidację albo jest odrzucone z czytelnym błędem;
żadna odpowiedź nie zmienia plików runtime bez osobnej bramki i zgody.

## Priorytet P2 — dashboard i nagrania

1. Test przeglądarkowy sprawdza obecność `Record 3D video`, `canvas.captureStream` i pobranie WebM.
2. Test stabilności: 30 sekund nagrania nie zmienia `componentId`, `scenePath` ani rewizji Twin.
3. Do prezentacji dołączać WebM razem z `audit-report.json`, `generation-audit.json` i URI rewizji.

Akceptacja P2: nagranie jest lokalne, dashboard nadal działa bez nagrywania, a artefakty dowodowe
mają ten sam `iterationUri`.

## Kryterium zatrzymania

Nie promować iteracji do `apply`, dopóki nie są spełnione: P0 bez błędów, `project-verify=OK`,
`validation.ok=true`, stabilne ID/ścieżki sceny, brak nieuzasadnionych placeholderów i kompletna
proweniencja intentów. Obecny projekt pozostaje poprawnie w trybie `propose`.
