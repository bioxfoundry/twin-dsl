---
id: ticket-11
signal: manual
title: The local CI gate scanned only one project, so a critical finding passed unnoticed
priority: high
labels: [ci, gate, coverage, fixed]
status: fixed
files:
  - ../ci/local-ci.sh
dedupe_key: manual:local-ci-single-project-scan
---

## Evidence

`ci/local-ci.sh` selected a project to inspect like this:

```bash
for candidate in "$ROOT/projects"/*/; do
  if [ -f "$candidate/project.projectdsl" ]; then args+=(--project "${candidate%/}"); break; fi
done
```

The `break` stops at the first match. With two projects present, glob order picks
`nanobionic-laboratory` — which carries the safe policy — and `nanobionic-laboratory-md`,
which carries the `CFG-603` **error** described in ticket-01, was never scanned.

The gate therefore reported `PASS diagnose (no findings at or above: error)` and allowed
a push, while a critical finding sat in the workspace. It was found by running
`diagnose-agent` by hand against the second project, not by the gate.

A second defect surfaced while fixing the first. The refactor used:

```bash
if node "$DIAG" "${args[@]}"; then pass; return; fi
local status=$?          # always 0
```

After a completed `if`, `$?` is the status of the `if` statement, not of its condition, so
every failure was reported as `agent error, exit 0`. Observed in the first corrected run
before the exit code was captured directly.

## Why this matters

This is the exact failure the gate was written to prevent — "not run" looking like "passed".
The design note in `ci/README.md` says a skipped stage must be reported separately and never
silently pass; the same reasoning applies to a *target* that was never examined. A gate whose
verdict depends on directory order is not a gate.

It also means every green gate result reported before this fix covered one project only.

## Fix

`ci/local-ci.sh` now scans **every** directory under `projects/` that holds a
`project.projectdsl`, writing `diagnostic-report-<name>.json` per project and failing if any
of them fails. With no project present it still probes the workspace itself, so docs, config,
corpus and build checks are never skipped by accident. The exit code is captured directly
from the command rather than read after an `if`.

Verified: the gate now reports
`PASS diagnose:nanobionic-laboratory` / `FAIL diagnose:nanobionic-laboratory-md`, surfaces
the `CFG-603` error with its codex explanation, and offers `restore-policy` as a dry-run
repair.

## Follow-up

Consider whether `diagnose-agent` should accept `--project` more than once and aggregate
into a single report, rather than the gate looping. One report per project is currently
simpler to attribute and keeps the repair-agent hand-off per project.
