# Diagnostic task status — verified 2026-08-09

Collected from a real `nanobionic-laboratory-md` run: `diagnose-agent scan`,
`doctor`, `docker ps`, and iteration artifact inspection. Every ticket starts with
observed evidence, not a hypothesis.

Context: three defects found earlier **are fixed and pushed** (`5ce6523`,
`801b4bd`). The list below is the status after them.

| # | priority | status | finding |
| --- | --- | --- | --- |
| [01](ticket-01-autonomy-policy-without-grant.md) | **critical** | **mitigated** | grant is required and CFG-603 closed; secret/grant still required before `apply` |
| [02](ticket-02-runtime-generation-not-landed.md) | high | **fixed** | `RUNTIME_GENERATION` participates in the stable key and receipt; `DT_FORCE_ITERATION` exists |
| [03](ticket-03-development-loop-is-a-fixture.md) | high | **partial** | `todo2code` works and the last iteration used it; fixture is still allowed |
| [04](ticket-04-feedback-has-no-actuation.md) | high | **open** | feedback conveys information, but does not manage the lifecycle of actions |
| [05](ticket-05-no-probe-for-fixed-defect-classes.md) | medium | **open** | ART-407/408 and COR-207 are still missing |
| [06](ticket-06-services-unavailable.md) | medium | **fixed** | ClickHouse and Docling are healthy and pass `service-check` |
| [09](ticket-09-twin-probes-missing.md) | medium | **fixed** | adapter runs local checkout directly from `src/run.mjs`; `doctor` confirms availability |
| [10](ticket-10-degraded-run-not-recorded.md) | medium | **open** | the receipt does not yet contain a complete capabilities block |
| [07](ticket-07-docs-paths-drift.md) | low | **fixed** | 0 DOC-501/DOC-503 warnings |
| [08](ticket-08-empty-source-role.md) | low | **fixed** | empty directory is no longer declared as source |
| [11](ticket-11-gate-scanned-one-project.md) | high | **fixed** | gate scans all projects |

## What blocks autonomy from this

Four tickets describe the same problem from different angles: **the loop does not see itself**.

- **02** — runtime fix does not propagate to existing twin, so the loop cannot
  observe its own correction.
- **04** — an improvement plan is created, but no one executes it; an unchecked checkbox
  is not a control signal.
- **10** — four active degradations do not make it into the receipt, so comparing two
  a revision does not distinguish between a data change and a change in what was currently installed.
- **03** and **09** — two of the three loops (development, execution) are structurally sound
  but empirically empty: a fixture instead of `todo2code`, and files instead of probes.

The order that makes sense: **01** (security, before anything runs unsupervised) →
**02** (necessary condition for feedback) → **03**/**09** (fill the loops with real
evidence) → **04** (add execution) → **10**/**05** (so that regressions are visible).

## The gate also had a hole

Ticket **11** is already fixed, but worth reading: `ci/local-ci.sh` only scanned the
**first** project in `projects/`, so the critical `CFG-603` from ticket 01 never reached the gate
— and it reported `PASS` and allowed the push. I found this by running
`diagnose-agent` manually on the second project.

This is exactly the failure the gate was supposed to protect against: "not run" looking like
"passed". Every green gate result before this fix covered one project.

## Evidence note

I found two of the three fixed defects by **running the system**, not reading the code, and
no probe would detect them again — hence ticket **05**. A gate that catches a cosmetic defect
(`ART-406`) and allows data loss confuses the presence of tests with coverage.
