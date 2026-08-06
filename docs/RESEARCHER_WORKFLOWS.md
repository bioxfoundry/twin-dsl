# Kompleksowe workflow researchera

## 1. Analiza lokalnego folderu i ZIP klienta

Cel: zbudować drzewo wymagań oraz wykryć sprzeczności.

```text
manager/ + customer/ + customer.zip
→ resource plan
→ converter
→ treeDSL
→ queryDSL
→ evidence result
→ todo2code result record
```

Komendy:

```bash
npm run demo:research
```

Zastosowania:

- audyt dokumentacji wdrożeniowej;
- porównanie bieżącej specyfikacji z archiwum;
- wykrywanie wycofanych komponentów;
- budowa source-addressed knowledge tree.

## 2. Research internetowy przez DQL i sitemap

DQL:

```text
DQL biofoundry-web
SITEMAPS [https://example.org/sitemap.xml]
ALLOW_HOSTS [example.org]
INCLUDE [/docs/**, /products/**]
EXCLUDE [/privacy, /login]
CONTEXT [biofoundry, bioreactor, digital twin]
MAX_URLS 100
MAX_SITEMAPS 10
SAME_ORIGIN true
RESPECT_ROBOTS true
OUTPUT markdown
VALIDATE [same-origin, citations, budget]
```

Crawler:

1. czyta `urlset` albo `sitemapindex`;
2. sprawdza protokół, host i ochronę przed prywatnymi adresami;
3. stosuje include/exclude;
4. egzekwuje budżet;
5. konwertuje HTML do Markdown;
6. nadaje resource URI;
7. zachowuje URL i revision hash.

Internet jest źródłem kontekstowym. Nie może nadpisać manager policy ani zweryfikowanych wymiarów klienta.

## 3. Research z pytaniem logicznym

Pytanie:

> Czy system ma wystarczające dowody, aby przebudować scenę?

`queryDSL` znajduje wymagane dokumenty. `mathDSL` materializuje bramkę:

```text
EXPR SceneRebuildAllowed = AND(
  ManagerApproved,
  CustomerDocumentationPresent,
  ProjectStatePresent,
  CapacityWithinLimit
)
```

Wynik zawiera binding każdego predykatu do URI źródła. Nie jest to swobodna odpowiedź LLM.

## 4. Research aktualizujący Digital Twin

Przykład:

- manager zmienia limit bioreaktorów;
- klient dodaje nowy wymiar urządzenia;
- projekt zapisuje nową temperaturę;
- sitemap publikuje nową instrukcję techniczną.

Watcher tworzy diff zasobów. Starter bezpiecznie przebudowuje cały kandydat projekcji; poniższa mapa pokazuje, które projekcje produkcyjny incremental planner może później przeliczać selektywnie:

```text
manager change → math + twin + scene
customer geometry → twin + scene
project telemetry → twin + scene
internet context → tree/query; scene tylko po jawnej relacji i walidacji
archive history → tree/query; bez automatycznego observed state
```

## 5. Research → development

Wynik researchu można przekazać do `todo2code` jako `result` lub dokument runu. Następny przebieg:

```text
validated query result
→ t2c Intent Evidence DSL
→ graph + diagnostics
→ code-change plan
→ hash-bound review
→ implementation
→ re-analysis
```

Pozytywna analiza nie oznacza automatycznie `DONE`.
