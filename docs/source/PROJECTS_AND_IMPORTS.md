# Projekty, źródła wiedzy i import

Projekt jest nadrzędnym kontekstem pracy Organization OS. Każdy rekord może być
powiązany przez `project_id` z konkretnym produktem, klientem, inicjatywą albo
projektem wewnętrznym.

## Zasoby projektu

Workspace agreguje:

```text
project_sources
project_imports
knowledge_documents
business_processes
campaigns
offers
leads
opportunities
support_cases
test_suites
test_runs
outcomes
evidence
tasks
commitments
decisions
documents
conversations
contracts
```

Endpoint:

```http
GET /api/org/projects/:project_id/workspace
```

## Typy importu

### Strona WWW

```json
{
  "source_type": "website",
  "source": "https://cybermysz.pl"
}
```

Importer:

- respektuje `robots.txt` w trybie best-effort;
- pobiera tylko HTTP/HTTPS;
- blokuje adresy prywatne i loopback;
- weryfikuje każdy redirect przed wykonaniem;
- pozostaje w obrębie początkowego originu;
- ogranicza liczbę stron, głębokość, rozmiar i timeout;
- tworzy Markdown z nagłówkami, tekstem, linkami, obrazami i metadanymi;
- zapisuje proweniencję każdej strony.

Nie wykonuje JavaScriptu strony. Dla aplikacji całkowicie client-side potrzebny jest
osobny, izolowany adapter przeglądarkowy, np. Playwright, uruchamiany jako proces
zatwierdzony i objęty TestQL.

### Katalog lokalny

```json
{
  "source_type": "directory",
  "source": "cybermysz-demo"
}
```

Katalog musi znajdować się wewnątrz `PROJECT_IMPORT_ROOT`. Importer stosuje:

- kontrolę realpath;
- allowlistę rozszerzeń;
- limit liczby plików;
- limit pojedynczego pliku;
- limit całkowity;
- pomijanie plików binarnych;
- ignorowanie `.git`, `node_modules`, `vendor`, buildów i cache.

### Repozytorium Git

```json
{
  "source_type": "git",
  "source": "https://github.com/organizacja/projekt.git"
}
```

Wymagania:

- wyłącznie HTTPS;
- brak danych logowania w URL;
- allowlista hostów;
- płytki clone;
- wyłączone interaktywne pytania o credentials;
- timeout;
- dalsza analiza według tych samych limitów plików.

## Rezultaty importu

Każdy import tworzy:

1. `source.md` — zunifikowaną wiedzę źródłową;
2. `business-blueprint.md` — czytelny blueprint;
3. ustrukturyzowany blueprint JSON;
4. `import.testql`;
5. `test-results.json`;
6. rekordy źródeł z proweniencją;
7. dokumenty wiedzy;
8. wynik TestQL;
9. rekomendowany model AQL.

## Sekrety

Przed wysłaniem materiału do LLM i zapisem dokumentu źródłowego wykrywane i
redagowane są między innymi:

- klucze OpenRouter;
- klucze AWS;
- klucze prywatne;
- wartości opisane jako token, API key, password lub secret.

Wykrycie sekretu nie uruchamia działań biznesowych. AQL wybiera plan
`security_review_required`.

## Relacja z LLM

Importer zawsze najpierw tworzy deterministyczny blueprint. LLM jest opcjonalne i
może go jedynie uzupełnić w ramach ścisłego schematu.

```text
źródło
→ Markdown
→ redakcja sekretów
→ deterministyczny blueprint
→ opcjonalna analiza OpenRouter
→ walidacja i merge
→ TestQL
→ proposed AQL/OQL
→ zatwierdzenie człowieka
```

Brak klucza albo awaria OpenRouter nie blokuje importu.
