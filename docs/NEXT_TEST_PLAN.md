# Plan kolejnych testów i iteracji

## Stan bazowy — 2026-08-08

| Obszar | Wynik |
|---|---:|
| Python `f2md` | 40 passed, 2 skipped |
| JavaScript `@subactor/f2md` | 24 passed |
| Runtime Digital Twin | 55 passed |
| `onlyDSL` | 44 passed |
| `project-verify` | OK |
| audyt korpusu + Twin | 0 ERROR, 34 WARNING |
| Markdown → intentDSL | 112 plików, 1269 rekordów, 0 failures |
| kanoniczny `t2c.intent/v1` validator | OK, 53 rekordy biznesplanu |
| OpenRouter smoke test | OK, GLM-5.2 → 10 poprawnych rekordów |
| komponenty Twin | 30 |
| komponenty `placeholder` | 12 |

## Priorytet P0 — wykonywać przy każdej zmianie

1. `pytest` w `py/f2md`.
2. `npm test` w `js/f2md`.
3. `npm test` w runtime.
4. `python -m f2md.audit ... --twin ... --json`.
5. `python -m f2md.intent_compile ...` i walidacja jednego pełnego pakietu przez
   `validateT2cIntent` z runtime.
6. `project-verify` i deterministyczne `project-iterate`.

Akceptacja P0: brak błędów, niezmienione identyfikatory komponentów i ścieżki sceny, raport
audytu zapisany przy rewizji.

## Priorytet P1 — następna iteracja geometrii

1. Dla każdego z 12 komponentów `placeholder` wybrać istniejący dowód z korpusu:
   `*.step.md`, `*.stl.md`, `*.f3d.md`, `*.scad.md`, IFC, survey albo floor-plan.
2. Utworzyć `subactor.physical-evidence/v1` z `assetUri` wskazującym zasób po imporcie,
   jednostką metrów i osią Z.
3. Wykonać `physical-intake` i sprawdzić, że grade rośnie, ale nigdy nie maleje.
4. Ponownie wyrenderować OpenUSD i sprawdzić, że liczba primów oraz rozmiary/pozycje odpowiadają
   bindingom sceny.

Akceptacja P1: `componentsWithoutGeometry` spada z 12 do 0 albo każdy pozostały placeholder ma
   jawny raport `NO_PHYSICAL_EVIDENCE` z uzasadnieniem.

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
3. Testować OpenRouter z mockowanym endpointem, bez realnych kosztów, dla modeli ustawianych przez
   `OPENROUTER_MODEL`.
4. Dopiero po teście mock użyć realnego GLM/Grok z `OPENROUTER_API_KEY`; odpowiedź pozostaje
   propozycją i musi przejść walidację `t2c.intent/v1`.

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
