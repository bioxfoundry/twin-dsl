# Gotowość produkcyjna

Wersja 2.0.0 jest przeznaczona do developmentu, demonstracji i walidacji procesów.

Przed produkcją należy:

1. zastąpić JSON Store PostgreSQL-em;
2. dodać migracje i ograniczenia kluczy obcych;
3. dodać tenancy i polityki dostępu do pojedynczych rekordów;
4. umieścić sekrety w Docker Secrets, Vault lub menedżerze chmurowym;
5. dodać kolejkę z retry i dead-letter queue dla OQL;
6. dodać kopie zapasowe i odtwarzanie;
7. określić retencję rozmów, umów i danych HR;
8. podłączyć podpis elektroniczny i repozytorium dokumentów;
9. dodać pełny monitoring, tracing i alarmy;
10. przeprowadzić review prawne RODO oraz polityk pracowniczych.

Decyzje o zatrudnieniu, zwolnieniu, awansie, wynagrodzeniu, karze i podpisie umowy
muszą pozostać decyzjami człowieka. AQL może organizować review, lecz nie zastępuje
uprawnionego decydenta.

## Importer produkcyjny

Przed udostępnieniem importera poza środowiskiem developerskim:

- ustaw konkretną `WEBSITE_IMPORT_ALLOWED_HOSTS` zamiast `*`;
- uruchamiaj importer w osobnej sieci i bez dostępu do wewnętrznych usług;
- dodaj proxy wychodzące i politykę DNS pinning;
- przenieś artefakty do object storage;
- dodaj kolejkę i worker zamiast synchronicznego żądania HTTP;
- skanuj pliki antywirusowo;
- zatwierdzaj import prywatnego repozytorium osobnym mechanizmem credentials;
- przechowuj źródło, hash, datę i licencję materiału;
- dodaj retencję oraz prawo do usunięcia danych;
- izoluj renderer przeglądarkowy, jeżeli zostanie dodany dla stron client-side.

## Sieć Docker

Jawna podsieć rozwiązuje wyczerpanie default address pools w development. W produkcji
adresację powinien przydzielać administrator klastra albo platforma orkiestracyjna.
