---
id: ticket-04
signal: manual
title: The feedback loop carries information but nothing acts on it
priority: high
labels: [autonomy, feedback-loop, improvement-dsl]
files:
  - src/runtime/living-project.ts
  - src/dsl/improvement.ts
  - ../projects/nanobionic-laboratory-md/feedback/latest.md
dedupe_key: manual:improvement-propose-only-no-actuation
---

## Evidence

The loop *is* wired, and that part works: `feedback/latest.md` is written by the runtime and
declared as a source, so the next iteration re-ingests it —

```
SOURCE derived "feedback" subactor://project/nanobionic-laboratory-md/feedback feedback
```

Its content today:

```
## Proposed improvements
- [ ] Review rejected LLM authority override — LLM_AUTHORITY_EXPRESSION_IGNORED:DevelopmentGate
```

`current/improvement.json` holds one action, of kind `validation`. Grepping
`src/runtime/living-project.ts` finds no path that reads a previous improvement plan and
acts on it.

## Why this matters

The information half of the feedback loop is closed; the actuation half is not. An
unchecked Markdown checkbox is not a control signal — it is re-ingested as prose, contributes
to the source snapshot hash, and is never executed. The item above has been sitting
unactioned across iterations, and nothing escalates it or times it out.

This is the difference between a system that *records* what it should improve and one that
*improves*. For the autonomous loop the user is asking for, this is the missing half.

Note the specific unactioned item is itself worth reading: the runtime rejected an LLM
attempt to redefine `DevelopmentGate` authority. The gate held — which is correct — but
nobody has looked at why the model tried.

## Acceptance criteria

- Improvement actions carry a machine-readable status (`proposed` / `accepted` / `rejected` /
  `done`) rather than only a Markdown checkbox, and the status survives iterations.
- The runtime reads the previous plan and reports which actions are still open and for how
  many iterations.
- An action open beyond a threshold raises a finding rather than scrolling past.
- Decide explicitly which action kinds may ever self-execute; `validation` is a safe first
  candidate, code mutation is governed by ticket-01 and must not be included by default.
