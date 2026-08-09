---
id: ticket-05
signal: manual
title: diagnose-agent cannot detect the two defect classes just fixed
priority: medium
status: open
labels: [diagnose-agent, coverage, regression-risk]
files:
  - ../diagnose-agent/src/probes/artifacts.ts
  - ../diagnose-agent/src/probes/corpus.ts
  - ../diagnose-agent/src/codex/codex.json
dedupe_key: manual:diagnose-coverage-intake-and-cad
---

## Evidence

Two of the three defects fixed on 2026-08-08 were found **by running the system**, not by
any probe, and no probe would find them again:

| defect | detectable today? |
| --- | --- |
| intake discarding established evidence (`801b4bd`) | no |
| `cadAssetCount` blind to f2md corpora (`5ce6523`) | no |
| stale placeholder label | yes — `ART-406` |

Only the third had a probe, and it is the least serious of the three.

## Why this matters

The gate is the thing that is supposed to notice regressions. It currently notices the
cosmetic defect and misses the data-loss one. If the intake merge regresses, the first
signal will again be a human posting two documents and watching evidence disappear.

Both classes are mechanically detectable from artifacts already on disk.

## Proposed checks

**`ART-407` — baseline evidence not reflected in the twin.** Compare
`baseline/physical-evidence.json` against `current/twin.json`: a component with a record in
the baseline whose twin `geometryEvidence` is weaker than that record's grade means evidence
was written but not applied, or was applied and later lost. That is exactly the shape the
data-loss bug produced.

**`COR-207` — corpus vocabulary does not reach the blueprint.** Count resources whose
`sourcePath` carries a CAD extension (allowing the f2md `.md` tail) and compare against the
sum of `cadAssetCount` across components. A large corpus-side count with near-zero
component-side count means the blueprint's matching vocabulary has drifted from the corpus —
the general form of the `.stl.md` bug, and it would also catch a future mirror that renames
files differently.

**`ART-408` — twin derived by an older runtime generation.** Once ticket-02 lands, compare
the receipt's `runtimeGeneration` against the installed one and report a stale twin.

## Acceptance criteria

- Three codex entries with meaning, causes, impact and repair route.
- Probes implemented with tests built from the real failure shapes, not synthetic ones.
- Running the new probes against the repository state *before* `5ce6523` / `801b4bd` would
  have produced the findings — verify against those commits rather than asserting it.
