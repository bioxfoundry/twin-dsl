---
schema: subactor.doc/v1
id: platform.docs.uri.process.autonomy
version: 1
status: current
updated: 2026-07-21
---

# URI Process w autonomicznym Subactor

Zadanie jest kontraktem wykonawczym pomiędzy właścicielem wyniku a aktorem. Rozdzielone są Contract AQL, OQL oraz konkretne URI Process w formacie `scheme://target/package/resource/operation`.

## Ticket przed efektem

Przed wykonaniem musi istnieć ticket Planfile z manifestem, jawną definicją AQL/EQL/OQL/URI, zgodnością wykonywanego kroku, idempotency key związanym z ticketem oraz planem zapisania wyniku i referencji do logu. Control tworzy ticket przed dispatch, a bridge ponownie waliduje go na ostatniej granicy efektu.
