# Architektura 0.2.0

```text
manager folders ─┐
customer docs ───┼→ converter/ZIP/OCR → immutable resource/v1 ─┐
project state ───┤                                             │
DQL+sitemap ─────┘                                             ├→ source snapshot
                                                              │
NL request → todo2code → t2c.intent/v1                         │
NL request → OpenRouter structured outputs → proposed *DSL ───┘

source snapshot + queryDSL
→ ClickHouse/in-memory projection
→ query-result/v1 + evidence
→ treeDSL / mathDSL
→ hard gates
→ twinDSL
→ sceneDSL
→ OpenUSD artifact
→ receipt/event
```

## Existing project boundaries

### todo2code

Canonical owner of `intentDSL`. The starter invokes it; it does not fork its schema or semantic graph implementation.

### Subactor

AQL/OQL/URI Process remains authoritative. This starter does not bypass ticket-before-effect. The demo directly invokes local classes only because it is a development fixture.

### ClickHouse

Read model for content search. Original files and assets belong in CAS/object storage. The in-memory projection implements the same minimal contract for offline tests.

### Docling

External converter/OCR worker. The Node runtime sends files through multipart HTTP. It is isolated from DSL authority.

## URI classes

```text
query://knowledge/clickhouse/search/execute     execution URI
urn:subactor:resource:sha256:<hash>            immutable evidence URI
subactor://project/biofoundry/...               logical navigation URI
urn:subactor:scene:sha256:<hash>               immutable derived artifact URI
```

## Precedence

```text
manager policy > customer requirements > observed project state
               > internet context > archive history > derived output
```

Precedence is not a numeric score. Hard authority and safety constraints remain booleans.

## Real-time update strategy

The watcher computes a content snapshot rather than trusting filesystem events. Only one build runs at once. Every build writes a candidate. `current/` changes only after math gates pass. Derived results retain source URIs and cannot count as independent corroboration of themselves.
