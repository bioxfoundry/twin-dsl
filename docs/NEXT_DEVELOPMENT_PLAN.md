# Plan rozwoju po `twin-dsl` 0.5.34

- Stan odniesienia: 2026-08-10
- Projekt referencyjny: `nanobionic-laboratory-md`
- Charakter dokumentu: plan wykonawczy; nie jest potwierdzeniem wykonania opisanych niżej prac.

## Cel

Następne iteracje powinny poprawić przede wszystkim wiarygodność wejścia i dowodów, a dopiero
potem efekt wizualny. Docelowy przebieg ma:

1. wykazać los każdego skonfigurowanego dokumentu i zasobu;
2. generować deterministyczny bazowy DSL z pełną proweniencją;
3. używać LLM wyłącznie do wytworzenia walidowanego `patchDSL`;
4. wiązać geometrię, stan i prezentację z jedną zaakceptowaną rewizją;
5. wykrywać `ERROR`, wykonywać ograniczone naprawy i ponownie uruchamiać bramki;
6. nie przedstawiać braku danych, pominiętego testu ani starego artefaktu jako wyniku zaliczonego.

## Zweryfikowany punkt wyjścia

| Obszar | Stan po iteracji 0.5.34 |
| --- | --- |
| Publikacja | `twin-dsl` 0.5.34 i `diagnose-agent` 0.1.9 opublikowane |
| Rewizja projektu | `f63f23b2-2bde-4588-b7fe-cacf29ffdcb3`, `validation.ok=true` |
| Powtórzenie | `noChange=true`, bez drugiej publikacji tej samej treści |
| Lokalna bramka | 0 błędów i 0 pominiętych etapów |
| Granica LLM | 5 transportów, 3 konsumentów, 12 kontraktów, 0 błędów |
| Assembly | 3/3 kompletnych assembly, 18/18 wymaganych części |
| Scena | 45 bindingów, 18 bindingów assetów i 18 unikalnych GLB |
| GLB przez dashboard | 18/18: HTTP 200, GLB v2 i SHA-256 zgodne z URN |
| Dowody przestrzenne | 64/102 wymaganych kontroli |
| Integralność projektu | 3 ostrzeżenia i 7 jawnych założeń |
| Prezentacja | 8 historycznych plików, `UNVERIFIED`, brak manifestu i danych kamery |

Aktualne trzy ostrzeżenia są poprawnym wynikiem walidacji, a nie awarią runtime:

- `CONCEPTUAL_GEOMETRY_ASSUMPTION`: siedem obiektów używa geometrii konceptualnej;
- `GEOMETRY_VALIDATION_INCOMPLETE`: brakuje 12 kontroli pozycji, 8 rozmiaru i 18 orientacji;
- `PRESENTATION_EVIDENCE_UNVERIFIED`: istniejące zrzuty nie dowodzą aktywnej rewizji.

## Zasady architektoniczne

### Jedna odpowiedzialność dla każdego projektu

| Projekt | Właściciel odpowiedzialności | Czego nie powinien implementować |
| --- | --- | --- |
| `f2md` / `research-agent` | konwersja źródeł, Markdown, hashe i proweniencja | SSOT, authority, rendering i wykonywanie patchy |
| `doDSL` | intake Git/web/upload, orkiestracja kompilatorów i utworzenie kandydata SSOT | własny kompilator `t2c.intent`, promocja SSOT i wykonanie poleceń LLM |
| `todo2code` | Intent Evidence, Intent vs Reality, diagnostyka kodu i propozycje zmian | CAD, rendering, promocja SSOT i automatyczne zastosowanie patcha |
| `onlyDSL` | IFURI, authority, accepted SSOT, kandydat i promocja | konwersja CAD, budowa Twin/Scene i duplikowanie parserów źródeł |
| `twin-dsl` | Resource/Tree/Math/Observation/Twin/Scene, geometria i rewizja renderowana | alternatywny SSOT, alternatywny `todo2code` i swobodny executor LLM |
| `diagnose-agent` | deterministyczne wykrywanie i stabilne kody błędów | modyfikowanie projektu |
| `repair-agent` | strategie mechaniczne i kontrolowane propozycje `patchDSL` | zgadywanie dowodów, transformacji i automatyczne zatwierdzanie LLM |

Integracja ma przebiegać przez wersjonowane pliki i URI. Import biblioteki jest dopuszczalny tylko
dla małego, niezależnie wydawanego pakietu kontraktów. Nie należy kopiować schematów do kolejnego
repozytorium ani utrzymywać drugiego parsera tego samego DSL.

### Jedyna dozwolona rola LLM

Każdy kontekst przekazywany do modelu musi zawierać JSON Schema oraz GBNF. Odpowiedzią wykonywalną
jest wyłącznie `patchDSL` związany z hashem bazowego dokumentu:

```text
evidence + deterministic base DSL
  -> LLM(schema + GBNF)
  -> patchDSL(baseHash, evidenceUris, operations)
  -> walidacja schematu, hasha, URI i dozwolonych ścieżek
  -> deterministyczne zastosowanie do candidate
  -> testy i walidacja
  -> jawna promocja
```

Proza modelu może być poradą, ale nigdy wejściem executora. Niepoprawna odpowiedź, timeout lub brak
modelu mają pozostawić bazowy DSL bez zmian. W profilu developerskim wystarczy lokalna flaga apply,
izolowany katalog, hash patcha, allowlista ścieżek i receipt; kryptograficzny mutation grant nie jest
wymagany. Profil produkcyjny pozostaje osobną, bardziej restrykcyjną polityką.

## Kolejność realizacji

| Kolejność | Proponowane wydanie | Wynik |
| ---: | --- | --- |
| 1 | 0.5.35 | jednoznaczna wersja zależności i `SourceCoverageDSL` dla wszystkich wejść |
| 2 | 0.5.36 | świeże, rewizyjnie związane dowody prezentacji z parametrami kamery |
| 3 | 0.5.37 | klasyfikacja reprezentacji i domykanie brakujących dowodów geometrii |
| 4 | 0.5.38 | ograniczona pętla `diagnose -> repair -> verify -> iterate -> report` |
| 5 | po stabilizacji | pionowa integracja `doDSL -> onlyDSL -> twin-dsl` przez artefakty plikowe |

Numery wydań są propozycją. Każde wydanie powinno mieć jeden główny cel i dać się wdrożyć bez
oczekiwania na następne.

## Etap 1 — pełne rozliczenie źródeł i zależności

### 1.1 `SourceCoverageDSL`

`research-agent` lub `f2md` powinien emitować `source-coverage.json` oraz
`source-coverage.dsl`. Każdy wykryty element wejściowy musi mieć dokładnie jeden stan końcowy:

```text
converted
binary-provenance
excluded-by-policy
unsupported
quarantined
failed
```

Rekord powinien zawierać co najmniej:

- ścieżkę logiczną, typ i SHA-256 źródła;
- ścieżkę pochodnego Markdown, jeżeli powstał;
- `resourceUri`, URI intentu i referencje TreeDSL;
- identyfikator konwertera oraz jego wersję;
- stan końcowy i stabilny kod powodu;
- informację, czy element wszedł do aktywnej rewizji Twin.

`twin-dsl` ma ten raport konsumować, nie odtwarzać. W `ProjectIntegrityDSL` należy rozróżnić:

- źródło niewykryte;
- wykryte, lecz bez konwersji;
- binarne z poprawną proweniencją;
- skonwertowane, lecz niepowiązane z drzewem;
- powiązane, lecz niewykorzystane przez Twin.

Kryteria akceptacji:

- 100% skonfigurowanych wejść ma jawny stan końcowy;
- suma stanów równa się liczbie wykrytych wejść;
- nie istnieje ciche pominięcie ani `skipped` przedstawione jako `passed`;
- zmiana jednego dokumentu zmienia wyłącznie jego hashe i zależne URI;
- drugi przebieg bez zmiany daje identyczny raport i `noChange=true`.

### 1.2 Pinowanie zależności po tożsamości Git

Na hoście są dwa checkouty `semcod/todo2code` w wersji 0.5.1, lecz wskazują różne commity:

```text
/home/tom/github/subactor/todo2code -> 7ecea31a2f0e...
/home/tom/github/semcod/todo2code  -> 738d7be93168...
```

Numer wersji nie wystarcza. Receipt development powinien zapisywać `remote`, pełny commit,
`packageVersion`, hash schematu i hash pliku wykonywalnego. Jeżeli dwa dostępne checkouty deklarują
tę samą wersję, lecz różne commity lub schematy, `doctor` ma zwrócić jawny błąd konfiguracji.

Ta sama reguła powinna objąć `onlyDSL`, `doDSL`, `f2md` i vendora `twin-dsl`. Proponowany
`dependency-lock.json` ma być generowany z faktycznie uruchomionych narzędzi, nie ręcznie z README.

## Etap 2 — dowód prezentacji aktywnej rewizji

Istniejących ośmiu plików nie należy opatrywać nowym manifestem. Nie znamy ich dokładnej kamery i
nie przedstawiają aktywnej rewizji.

Należy dodać kontrolowaną komendę capture, która:

1. odczytuje zaakceptowane `twinUri`, `sceneUri` i `iterationUri`;
2. ustawia statyczną kamerę lub rejestruje deterministyczną trajektorię orbity;
3. zapisuje PNG/WebM oraz parametry `eye`, `target`, `up`, FOV i hash trajektorii;
4. oblicza hashe plików po zakończeniu zapisu;
5. atomowo zapisuje `presentation/manifest.json` zgodny ze schematem;
6. ponownie uruchamia inspekcję i publikuje status `CURRENT` tylko przy pełnej zgodności.

Testy negatywne muszą obejmować zmieniony obraz, inną scenę, nieznaną kamerę, brak pliku, zmianę
trajektorii i próbę wyjścia ścieżką poza katalog prezentacji.

Kryterium akceptacji: `PRESENTATION_EVIDENCE_UNVERIFIED` znika wyłącznie po nowym capture dla
bieżącej rewizji. Następna zmiana sceny automatycznie zmienia status na `STALE`.

## Etap 3 — geometria, która ma znaczenie fizyczne

Aktualne 18 GLB jest technicznie poprawne. Następnym celem nie jest zwiększanie liczby trójkątów,
lecz udowodnienie reprezentacji, transformacji i jednostek.

### 3.1 Klasyfikacja reprezentacji

Każdy binding powinien mieć deterministyczne `representationPolicy`:

```text
logical-marker
conceptual-proxy
measured-proxy
mesh-required
mesh-preferred
```

Dzięki temu wskaźnik mesh coverage nie będzie liczył logicznych markerów jako defektów CAD.
`conceptual-proxy` pozostaje ostrzeżeniem lub jawnym zaakceptowanym założeniem, nigdy pełnym dowodem.

### 3.2 Domknięcie macierzy 102 kontroli

Kolejność pracy dla każdego komponentu fizycznego:

1. istniejący asset i jego proweniencja;
2. jednostka, układ współrzędnych, handedness i oś up;
3. rozmiar z assetu lub silniejszego pomiaru;
4. parent-relative position i orientation z autorytatywnego źródła;
5. niezależna walidacja tolerancji;
6. dopiero potem binding do sceny.

Brak danych ma tworzyć `EvidenceGapDSL` albo równoważny istniejący kontrakt z kodem powodu. Nie
wolno układać części na podstawie środka bounding boxa ani rozciągać każdej osi do proxy size.

Kryteria akceptacji:

- siedem geometrii konceptualnych otrzymuje dowód albo pozostaje jawnym, nazwanym wyjątkiem;
- licznik 64/102 rośnie po każdym pakiecie danych i nigdy przez dane zgadywane;
- docelowe `COMPLETE` wymaga 102/102 rzeczywistych kontroli;
- `componentId` i `scenePath` pozostają stabilne przy zmianie reprezentacji;
- niezależny test HTTP nadal potwierdza GLB v2 i hash każdego aktywnego assetu.

Materiały PBR, hierarchiczne STEP/OpenUSD i animacje są kolejnym etapem dopiero po poprawnych
jednostkach i transformacjach.

## Etap 4 — ograniczona autonomiczna naprawa

Należy rozszerzyć obecną komendę `make repair-apply` do ograniczonego cyklu developerskiego,
na przykład `make cycle PROJECT=<name> MAX_REPAIR_ITERATIONS=3`:

```text
project-verify
-> iterate
-> diagnose
-> jeśli ERROR: repair-agent --min-severity error
-> testy celowane
-> ponowne diagnose + iterate
-> make report
-> stop: zero ERROR, brak postępu albo limit iteracji
```

Wymagane własności:

- deterministyczna strategia ma pierwszeństwo;
- brak strategii daje `refused` z powodem, a nie pozorną naprawę;
- propozycja LLM ma Schema + GBNF, `baseHash`, evidence URI i dozwolone ścieżki;
- patch LLM trafia najpierw do izolowanego candidate;
- każda próba ma receipt przed/po oraz listę rzeczywiście uruchomionych testów;
- identyczny błąd bez postępu nie może wywołać nieskończonej pętli;
- `WARNING` nie jest automatycznie naprawiany, jeżeli wymaga nowych danych lub decyzji projektowej.

Testy integracyjne powinny wstrzykiwać co najmniej: naprawialny błąd konfiguracji, błąd
nienaprawialny, błędny patchDSL, zmianę bazowego hasha w trakcie pracy i regresję wykrytą po apply.

## Etap 5 — pionowa integracja bez duplikatów

Docelowy przepływ między projektami:

```text
doDSL intake
  -> f2md/research-agent SourceCoverage + Markdown + ResourceDSL
  -> todo2code Intent Evidence + diagnostics
  -> doDSL candidate bundle
  -> onlyDSL SSOT candidate validation/promotion
  -> immutable accepted bundle URI
  -> twin-dsl Tree/Math/Twin/Scene
  -> diagnose-agent report
  -> onlyDSL RepairPlanDSL
  -> repair-agent controlled execution
```

Pierwszy benchmark powinien obejmować jeden mały fixture oraz realny
`nanobionic-laboratory-md`. Na granicach należy testować pliki, nie prywatne funkcje bibliotek.

Kryteria akceptacji:

- jedna kanoniczna implementacja każdego schematu i kompilatora;
- zgodność kontraktów sprawdzana macierzą wersji w CI;
- brak importu `doDSL` z `onlyDSL` w przeciwnym kierunku;
- `twin-dsl` działa także bez uruchomionych usług integracyjnych na zapisanych artefaktach;
- usunięcie OpenRoutera nie zmienia deterministycznych znalezisk;
- żaden projekt nie nazywa kandydata stanem zaakceptowanym.

## Interfejs developerski Makefile

Już dostępne i zalecane:

```bash
make up
make doctor
make project-verify PROJECT=nanobionic-laboratory-md
make iterate PROJECT=nanobionic-laboratory-md MODE=deterministic
make diagnose PROJECT=nanobionic-laboratory-md
make repair-plan PROJECT=nanobionic-laboratory-md
make report PROJECT=nanobionic-laboratory-md
make dashboard PROJECT=nanobionic-laboratory-md PORT=7444
```

`make dashboard` rozpoznaje własny działający dashboard i może go wykorzystać ponownie; obcy proces
na porcie ma kończyć się czytelnym błędem. Nie należy automatycznie zabijać procesu tylko dlatego,
że zajmuje domyślny port.

Do dodania:

```bash
make coverage PROJECT=<name>             # SourceCoverageDSL + skrócone liczniki
make capture PROJECT=<name> PORT=<port>  # capture + camera manifest + walidacja
make cycle PROJECT=<name>                # ograniczona pętla developerska
make report-json PROJECT=<name>          # stabilny raport maszynowy obok status.md
make deps-lock PROJECT=<name>             # faktyczne commity i hashe kontraktów
```

Każdy target ma zwracać niezerowy kod dla błędu, wypisywać `SKIPPED` z powodem i pozostawiać receipt.

## Porządek w `TODO.md`

Obecny `TODO.md` jest generowany przez Prefact i zawiera 202 aktywne wpisy. Wiele z nich powtarza
te same uwagi dla skopiowanych vendorów demo albo traktuje normalne konstrukcje CLI i pakietów
Pythona jako problem. Nie jest to 202-elementowa lista defektów runtime.

Proponowane uporządkowanie:

1. wykluczyć `vendor/`, `dist/` i generowane katalogi demo z analizy źródła nadrzędnego;
2. deduplikować po stabilnym kluczu reguła + kanoniczna ścieżka + symbol;
3. skonfigurować jawne wyjątki dla poprawnych relative imports i `print` w CLI;
4. zapisywać pełny wynik Prefact jako raport, a do `TODO.md` promować tylko zadania zaakceptowane;
5. oddzielić backlog jakości kodu od znalezisk ProjectIntegrity i od braków danych;
6. przeliczyć listę po zmianie konfiguracji, zamiast ręcznie edytować blok generowany.

## Bramka każdej iteracji

Minimalna definicja ukończenia:

1. schema i renderer DSL mają test pozytywny, negatywny i test dryfu schematu;
2. każdy kontekst LLM przechodzi audyt Schema + GBNF + hash-bound patchDSL;
3. testy jednostkowe i integracyjne są zielone bez niejawnych pominięć;
4. `make project-verify` i `make report` przechodzą;
5. iteracja realnego projektu ma `validation.ok=true`;
6. natychmiastowe powtórzenie daje `noChange=true`;
7. dashboard przechodzi smoke test read-only;
8. aktywne assety przechodzą weryfikację HTTP/GLB/hash;
9. vendor projektu jest zsynchronizowany z wydaną wersją;
10. publikacja odbywa się przez `goal -a`, po czym tag i `origin/main` są sprawdzone;
11. istniejące zmiany użytkownika pozostają poza commitem i zachowują swoje hashe.

## Kiedy zatrzymać automatyczną ewolucję

Cykl ma się zatrzymać, gdy:

- nie ma `ERROR`;
- pozostałe ostrzeżenia wymagają nowych pomiarów, CAD, kamery lub decyzji właściciela;
- kolejna strategia nie zmienia diagnostyki;
- zmienił się bazowy hash patcha;
- test po naprawie wprowadził regresję;
- osiągnięto limit iteracji lub czasu.

Zatrzymanie z ostrzeżeniem i precyzyjnym powodem jest poprawnym wynikiem. Generowanie brakujących
danych albo podpisywanie starego zrzutu jako nowego dowodu nie jest naprawą.
