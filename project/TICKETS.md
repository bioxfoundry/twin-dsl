# Stan zadań diagnostycznych — zweryfikowany 2026-08-09

Zebrane z realnego przebiegu na `nanobionic-laboratory-md`: `diagnose-agent scan`,
`doctor`, `docker ps` i inspekcja artefaktów iteracji. Każdy ticket zaczyna się od
zaobserwowanego dowodu, nie od hipotezy.

Kontekst: trzy defekty znalezione wcześniej **są naprawione i wypchnięte** (`5ce6523`,
`801b4bd`). Poniższa lista to stan po nich.

| # | priorytet | status | co |
| --- | --- | --- | --- |
| [01](ticket-01-autonomy-policy-without-grant.md) | **critical** | **mitigated** | grant jest wymagany i CFG-603 zamknięty; sekret/grant nadal wymagany przed `apply` |
| [02](ticket-02-runtime-generation-not-landed.md) | high | **fixed** | `RUNTIME_GENERATION` uczestniczy w stable key i receipt; istnieje `DT_FORCE_ITERATION` |
| [03](ticket-03-development-loop-is-a-fixture.md) | high | **partial** | `todo2code` działa i ostatnia iteracja go użyła; fixture nadal jest dozwolony |
| [04](ticket-04-feedback-has-no-actuation.md) | high | **open** | sprzężenie zwrotne przenosi informację, ale nie zarządza cyklem życia działań |
| [05](ticket-05-no-probe-for-fixed-defect-classes.md) | medium | **open** | nadal brak ART-407/408 i COR-207 |
| [06](ticket-06-services-unavailable.md) | medium | **fixed** | ClickHouse i Docling są healthy i przechodzą `service-check` |
| [09](ticket-09-twin-probes-missing.md) | medium | **fixed** | adapter uruchamia lokalny checkout bezpośrednio z `src/run.mjs`; `doctor` potwierdza dostępność |
| [10](ticket-10-degraded-run-not-recorded.md) | medium | **open** | receipt nie ma jeszcze kompletnego bloku capabilities |
| [07](ticket-07-docs-paths-drift.md) | low | **fixed** | 0 ostrzeżeń DOC-501/DOC-503 |
| [08](ticket-08-empty-source-role.md) | low | **fixed** | pusty katalog nie jest już deklarowany jako źródło |
| [11](ticket-11-gate-scanned-one-project.md) | high | **fixed** | bramka skanuje wszystkie projekty |

## Co z tego blokuje autonomię

Cztery tickety opisują ten sam problem z różnych stron: **pętla nie widzi samej siebie**.

- **02** — naprawa runtime nie propaguje się do istniejącego twina, więc pętla nie może
  zaobserwować własnej korekty.
- **04** — plan doskonalenia powstaje, ale nikt go nie wykonuje; niezaznaczony checkbox
  nie jest sygnałem sterującym.
- **10** — cztery aktywne degradacje nie trafiają do receiptu, więc porównanie dwóch
  rewizji nie odróżnia zmiany danych od zmiany tego, co akurat było zainstalowane.
- **03** i **09** — dwie z trzech pętli (development, execution) są strukturalnie poprawne
  i empirycznie puste: fixture zamiast `todo2code`, pliki zamiast sond.

Kolejność, która ma sens: **01** (bezpieczeństwo, zanim cokolwiek pojedzie bez nadzoru) →
**02** (warunek konieczny sprzężenia zwrotnego) → **03**/**09** (napełnić pętle realnym
dowodem) → **04** (dodać wykonanie) → **10**/**05** (żeby regresje były widoczne).

## Bramka też miała dziurę

Ticket **11** jest już naprawiony, ale wart przeczytania: `ci/local-ci.sh` skanował tylko
**pierwszy** projekt w `projects/`, więc krytyczny `CFG-603` z ticketu 01 nigdy do bramki nie
docierał — a ona raportowała `PASS` i przepuszczała push. Znalazłem to, uruchamiając
`diagnose-agent` ręcznie na drugim projekcie.

To dokładnie ta awaria, przed którą bramka miała chronić: „nie uruchomiono" wyglądające jak
„zaliczono". Każdy zielony wynik bramki sprzed tej poprawki obejmował jeden projekt.

## Uwaga o dowodach

Dwa z trzech naprawionych defektów znalazłem **uruchamiając system**, nie czytając kod, i
żadna sonda nie wykryłaby ich ponownie — stąd ticket **05**. Bramka, która wyłapuje defekt
kosmetyczny (`ART-406`) i przepuszcza utratę danych, myli obecność testów z pokryciem.
