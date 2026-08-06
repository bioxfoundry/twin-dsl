# Autonomy findings and next improvements

## Findings from executable examples

1. **The previous clean-package claim was too broad.** Source verification requires installed TypeScript and Node type definitions. Distribution smoke and source verification are now treated as separate gates.
2. **External source paths were not Docker-safe.** They are now copied under `imports/<role>/` and recorded in `imports/manifest.jsonl`.
3. **A development fixture could mask a real todo2code installation.** Canonical todo2code now has priority, and fixtures need an explicit policy.
4. **Development evidence was previously “non-empty equals good”.** The runtime now records graph counts, diagnostics, manifest state and acceptance.
5. **LLM math could theoretically redefine a hard gate.** Authority-owned bindings and expressions are now deterministic and immutable.
6. **LLM Twin/Scene output was schema-valid but not fully grounded.** Source URIs, component IDs, Twin URI, asset URI and scene paths are now checked against runtime context.
7. **Iteration limits existed only in configuration.** They are now enforced as a hard gate before publication.
8. **Concurrency protection was process-local.** A persistent filesystem lease now prevents duplicate project iterations across processes sharing a volume.
9. **Watcher errors were console-only.** Failures now produce receipts, dead-letter entries, events and bounded retry.
10. **The Protobuf contract contained duplicate field number 9 in iteration v1.** It is fixed, a v2 receipt is added, and the contract checker now detects duplicate field numbers.
11. **The loop lacked a typed next-action artifact.** Every changed iteration now emits propose-only `improvementDSL`.
12. **Docker smoke only printed configured URLs.** `service-check` now performs a ClickHouse SQL request and Docling health request, and both root and generated CI invoke it.

## Still required for full code self-improvement

- signed grant verification using real public-key cryptography rather than shape/expiry checking;
- isolated Git worktree or ephemeral container per patch;
- real `todo2code propose-code-change` / source-patch / apply / re-analysis / acceptance integration;
- independent evaluator identity and separation of duties;
- durable PostgreSQL/event store and transactional outbox;
- Temporal or equivalent workflow history, retry and compensation;
- canary deployment and automatic rollback based on observed SLOs;
- verified Docker integration run on a host with Docker;
- real OpenRouter live contract run with a bounded cost budget;
- geometry validation for IFC/STEP/glTF/OpenUSD physical assets;
- signed artifact/SBOM/container provenance.

## Recommended next order

1. Run Docker integration CI.
2. Replace bootstrap fixture with canonical todo2code in one generated project.
3. Map todo2code diagnostics to `improvementDSL` actions and exact target paths.
4. Add propose-source-patch, isolated apply and acceptance, still without automatic merge.
5. Add cryptographic mutation grants and independent approval.
6. Add canary deployment and rollback receipts.
