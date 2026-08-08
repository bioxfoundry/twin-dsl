---
id: ticket-06
signal: diagnose-agent
code: SVC-301
title: Docling and ClickHouse are configured but not running, so the ingest path is degraded
priority: medium
labels: [services, ingestion, docker]
files:
  - docker-compose.yml
  - ../projects/nanobionic-laboratory-md/.env
dedupe_key: manual:services-not-running
---

## Evidence

`doctor`:

```json
"doclingUrl": null,
"clickhouseUrl": "http://127.0.0.1:18123"
```

`docker ps` shows five containers, none of them this project's — no ClickHouse, no Docling.
`diagnose-agent scan --services` reports nothing because nothing is configured to probe
against.

`projects/nanobionic-laboratory-md/.env` does not exist at all (`CFG-601`), so every service
URL falls back to its default.

## Why this matters

Both degradations are silent by design, which is right for resilience and wrong for
visibility:

- **No Docling** means scans and image-only PDFs fall back to local extraction. The corpus
  already carries 53 OCR'd files; re-running conversion without Docling would produce a
  different, quieter corpus rather than an error.
- **No ClickHouse** means `DT_SEARCH_BACKEND` falls back to the in-memory backend. Query
  results stay correct for small corpora and diverge from production behaviour silently.

The system is running in a degraded mode that no artifact records.

## Acceptance criteria

- `cp .env.example .env` in the project (repair-agent strategy `seed-env` already covers
  this) and fill the service URLs.
- `make up && make service-check` green, or a recorded decision that this workspace runs
  offline by choice.
- The iteration receipt records which backends were actually used, so a degraded run is
  distinguishable from a full one after the fact.
