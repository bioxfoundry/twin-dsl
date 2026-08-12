# Production Readiness

Version 2.0.0 is intended for development, demonstration, and process validation.

Before production, you must:

1. replace JSON Store with PostgreSQL;
2. add migrations and foreign key constraints;
3. add tenancy and access policies for individual records;
4. place secrets in Docker Secrets, Vault, or a cloud manager;
5. add a queue with retry and dead-letter queue for OQL;
6. add backup and recovery;
7. define retention for conversations, agreements, and HR data;
8. connect electronic signature and document repository;
9. add full monitoring, tracing, and alerts;
10. conduct legal review of GDPR and employee policies.

Decisions about hiring, dismissal, promotion, compensation, disciplinary action, and signing a
contract must remain human decisions. AQL can organize reviews but does not replace an authorized
decision-maker.

## Production importer

Before making the importer available outside the development environment:

- set a specific `WEBSITE_IMPORT_ALLOWED_HOSTS` instead of `*`;
- run the importer in a separate network and without access to internal services;
- add an outbound proxy and DNS pinning policy;
- move artifacts to object storage;
- add a queue and worker instead of a synchronous HTTP request;
- scan files for malware;
- approve private-repository imports through a separate credential mechanism;
- store the source, hash, date, and license of the material;
- add retention and the right to delete data;
- isolate the browser renderer if it is added for client-side pages.

## Docker Network

Explicit subnet resolves default address pool exhaustion in development. In production,
addressing should be assigned by the cluster administrator or orchestration platform.
