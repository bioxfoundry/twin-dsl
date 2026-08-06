# Refaktoryzacja niezawodności 2.2

## Naprawione ograniczenia

### Pełne read-modify-write w JsonStore

Aktualizacje w jednym procesie są serializowane jako całość, a nie tylko podczas zapisu.
Usuwa to utratę rekordów przy równoległych wywołaniach w developerskim JSON Store.

Nadal nie jest to blokada między wieloma procesami lub hostami. Produkcja wymaga bazy
transakcyjnej.

### Atomowe roszczenie idempotency key

Bridge zapisuje stan `processing` przed wykonaniem adaptera. Kolejne wykonanie tego samego
klucza otrzymuje rezultat zapisany, poprzedni błąd albo status in-progress. Roszczenie ma
lease i może zostać odzyskane po awarii.

### Egzekwowanie OQL EXPECT

Rezultat adaptera jest sprawdzany po wykonaniu kroku. Niespełnione `EXPECT` powoduje błąd
kroku, zamiast dekoracyjnie pozostać wyłącznie w tekście OQL.

### Semantyka warunków AQL

Parser obsługuje:

- pierwszeństwo `AND` przed `OR`;
- nawiasy;
- `NOT`;
- `exists(...)`.

Usuwa to niejednoznaczność wcześniejszej ewaluacji od lewej do prawej.

### Pluginowy adapter registry

Kanały komunikacyjne są odseparowane od głównego switcha wykonawczego. Dodanie providera
nie wymaga zmiany semantyki AQL.

## Pozostałe granice wersji developerskiej

Przed produkcją nadal potrzebne są:

1. PostgreSQL i transakcje;
2. canonical OQL AST jako jedyne źródło wykonania;
3. trwała kolejka lub Temporal/BullMQ;
4. pełne output schemas adapterów;
5. policy engine i separation of duties;
6. TestQL preflight/postflight dla każdego adaptera;
7. telemetry trace/correlation IDs;
8. mechanizm kompensacji i rollbacku.
