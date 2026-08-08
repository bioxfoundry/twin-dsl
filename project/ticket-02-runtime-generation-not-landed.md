---
id: ticket-02
signal: manual
title: A runtime fix still does not reach existing projects — RUNTIME_GENERATION is uncommitted
priority: high
labels: [autonomy, feedback-loop, blocker]
files:
  - src/core/generation.ts
  - src/core/types.ts
  - src/runtime/living-project.ts
dedupe_key: manual:runtime-generation-uncommitted
---

## Evidence

An iteration is skipped (`noChange: true`) when four input hashes match: project config,
research snapshot, development fingerprint, observation snapshot. The **runtime itself was
not part of that key**.

Observed directly while fixing `cadAssetCount` (ticket-03's sibling, now landed in
`5ce6523`): the fix was built into `dist/`, the iteration was re-run, and it reported

```
"noChange": true
bioprinter_mos3s_01 cadAssetCount: undefined
```

The corrected code never ran. Only after adding `RUNTIME_GENERATION` to the short-circuit
key did the same command report `noChange: false` and the expected `cadAssetCount: 14`.

The fix exists in the working tree (`src/core/generation.ts` plus wiring) but is **not
committed**: my change to `stableKey` sits on the same line as an `intentDsl` field added by
parallel work, so extracting it alone yields a tree that does not compile.

## Why this matters

This is a precondition for any feedback loop, not a nicety. Without it the system cannot
observe its own correction: a fix ships, every input hash stays identical, and every existing
twin keeps serving values the old code produced — indefinitely, and silently.

It also means the two fixes already pushed (`5ce6523`, `801b4bd`) do **not** propagate to
`projects/nanobionic-laboratory` or any other existing project until something else changes
its inputs.

## Acceptance criteria

- `RUNTIME_GENERATION` participates in the `noChange` short-circuit and is recorded on the
  iteration receipt.
- `DT_FORCE_ITERATION=1` forces re-derivation without a bump.
- A test asserts that a changed generation constant defeats the short-circuit on otherwise
  identical inputs.
- `docs/` states the bump rule: bump when output from unchanged inputs would differ
  (grounding, blueprint matching, evidence ranking, scene layout); do not bump for docs,
  tests or logging, because a needless bump costs every project a full regeneration.

## Note

Lands together with the parallel `intentDsl` work — they share a line and cannot be
separated. Whoever commits that work should include this.
