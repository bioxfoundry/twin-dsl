---
id: ticket-03
signal: manual
title: The development loop is a fixture — todo2code is not installed, and policy hides it
priority: high
labels: [autonomy, evidence, development-loop]
files:
  - src/adapters/todo2code.ts
  - ../projects/nanobionic-laboratory-md/project.projectdsl
dedupe_key: manual:development-evidence-fixture
---

## Evidence

`node dist/src/cli/main.js doctor`:

```json
"todo2code": { "root": "", "bin": "", "available": false }
```

`projects/nanobionic-laboratory-md/feedback/latest.md`:

```
Development source: fixture
Development acceptance: accepted
```

`project.projectdsl` carries `POLICY_ALLOW_DEVELOPMENT_FIXTURE true`, and
`DEVELOPMENT_FIXTURE "config/development.intent.fixture.json"`.

## Why this matters

The README describes three loops, of which the development loop compares intent against
code, tests and Git. That comparison is not happening. A fixture is being accepted as
evidence and reported as `accepted`, so every gate downstream sees a green development
signal that was never derived from the repository.

The fixture path is deliberate and correctly requires explicit policy — that design is
right. The problem is that in this project the escape hatch is load-bearing rather than a
fallback, and nothing surfaces the difference except one line in a feedback file.

`docs/FULL_AUTONOMY_GAPS.md` item 1 names exactly this: "Real `todo2code` checkout in CI and
live semantic benchmark (not only adapter + empty local proposal)."

## Acceptance criteria

- `scripts/bootstrap-todo2code.sh` (already generated per project) is run, or `T2C_ROOT` /
  `T2C_BIN` point at a real checkout, and `doctor` reports `available: true`.
- An iteration produces `Development source: todo2code` with real diagnostics.
- `diagnose-agent` gains a finding for "development evidence is a fixture while the policy
  permits it" so the substitution is visible without reading `feedback/latest.md`
  (see ticket-06).
- Decide whether `POLICY_ALLOW_DEVELOPMENT_FIXTURE` should stay `true` for this project once
  the real adapter works.
