---
id: ticket-10
signal: manual
title: A degraded run is indistinguishable from a full one after the fact
priority: medium
labels: [observability, receipts, autonomy]
files:
  - src/runtime/living-project.ts
  - src/core/types.ts
dedupe_key: manual:receipt-missing-capability-record
---

## Evidence

Four independent degradations are active in this workspace right now, and none of them
appears in the iteration receipt:

| capability | state | how the run degrades |
| --- | --- | --- |
| `todo2code` | unavailable | development evidence becomes a fixture |
| `twin-probes` | unavailable | runtime observations come from static files |
| Docling | not configured | scans fall back to local extraction |
| ClickHouse | not running | search falls back to the in-memory backend |

`current/generation-audit.json` records LLM mode and degradation per generated document,
which is the right idea — but it does not cover adapters, services or search backend.

## Why this matters

Every one of these fallbacks is deliberate and correct: the system should keep running when
a dependency is missing. The cost is that a receipt from a fully-provisioned run and a
receipt from this one look the same, so an operator comparing two twin revisions cannot tell
whether a difference came from the data or from what happened to be installed.

For an autonomous loop this is worse than for a manual one, because nobody is watching the
console output where the fallback was mentioned once.

## Acceptance criteria

- The iteration receipt carries a `capabilities` block recording, per run: adapter
  availability, service reachability, search backend actually used, and converter chain.
- `diagnose-agent` reports when the current twin was produced by a degraded run.
- A test asserts that a run with an adapter forced unavailable is marked as such in the
  receipt rather than silently equal to a full run.
