# Otwarte zadania — 2026-08-08

Zebrane z realnego przebiegu na `nanobionic-laboratory-md`: `diagnose-agent scan`,
`doctor`, `docker ps` i inspekcja artefaktów iteracji. Każdy ticket zaczyna się od
zaobserwowanego dowodu, nie od hipotezy.

Kontekst: trzy defekty znalezione wcześniej **są naprawione i wypchnięte** (`5ce6523`,
`801b4bd`). Poniższa lista to stan po nich.

| # | priorytet | co |
| --- | --- | --- |
| [01](ticket-01-autonomy-policy-without-grant.md) | **critical** | apply-mode samomodyfikacji bez działającej bramki kryptograficznej |
| [02](ticket-02-runtime-generation-not-landed.md) | high | naprawa runtime nadal nie dociera do istniejących projektów |
| [03](ticket-03-development-loop-is-a-fixture.md) | high | pętla developmentu to fixture — brak `todo2code` |
| [04](ticket-04-feedback-has-no-actuation.md) | high | sprzężenie zwrotne przenosi informację, ale nic jej nie wykonuje |
| [05](ticket-05-no-probe-for-fixed-defect-classes.md) | medium | brak sond na dwie właśnie naprawione klasy defektów |
| [06](ticket-06-services-unavailable.md) | medium | Docling i ClickHouse skonfigurowane, ale nie działają |
| [09](ticket-09-twin-probes-missing.md) | medium | brak `twin-probes` — obserwacje runtime bez źródła fizycznego |
| [10](ticket-10-degraded-run-not-recorded.md) | medium | przebieg zdegradowany nieodróżnialny od pełnego |
| [07](ticket-07-docs-paths-drift.md) | low | sześć nierozwiązywalnych ścieżek w docs + zepsuty link |
| [08](ticket-08-empty-source-role.md) | low | rola `archive` zadeklarowana, ale pusta |

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

## Uwaga o dowodach

Dwa z trzech naprawionych defektów znalazłem **uruchamiając system**, nie czytając kod, i
żadna sonda nie wykryłaby ich ponownie — stąd ticket **05**. Bramka, która wyłapuje defekt
kosmetyczny (`ART-406`) i przepuszcza utratę danych, myli obecność testów z pokryciem.
