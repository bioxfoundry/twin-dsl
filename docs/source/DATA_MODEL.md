# Model danych

Każdy rekord ma co najmniej:

```json
{
  "id": "prefix_...",
  "created_at": "ISO-8601",
  "created_by": "actor",
  "updated_at": "ISO-8601",
  "updated_by": "actor",
  "archived_at": null
}
```

## Relacje

```text
organization
  ├── people
  ├── teams
  ├── clients
  │    ├── contacts
  │    ├── conversations ── messages
  │    ├── contracts ────── contract_versions
  │    ├── projects ─────── tasks
  │    └── commitments
  ├── decisions
  ├── documents
  └── activities
```

Identyfikatory mogą być przekazywane bezpośrednio. Operacje OQL mogą również rozwiązywać
relacje przez `client_name`, `contact_email`, `project_external_ref` i `contract_number`.

Usunięcie API jest miękką archiwizacją przez `archived_at`. Dane nie są fizycznie kasowane
poza developerskim endpointem resetu.

## Zasoby projektocentryczne

```text
projects               projekt nadrzędny
project_sources        proweniencja URL/pliku/repozytorium
project_imports        przebiegi importu
knowledge_documents    Markdown i Business Blueprint
business_processes     procesy operacyjne projektu
campaigns              kampanie marketingowe
offers                 oferty wymagające review
leads                   kontakty przed kwalifikacją
opportunities           szanse sprzedażowe
support_cases           sprawy wsparcia
test_suites             definicje TestQL
test_runs               dowody wykonania testów
outcomes                mierzalne rezultaty
evidence                pakiety dowodowe
```

Wszystkie te encje przyjmują `project_id`. Workspace nie kopiuje danych; agreguje
rekordy domenowe według tego identyfikatora.
