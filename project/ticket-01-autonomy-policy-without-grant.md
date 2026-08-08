---
id: ticket-01
signal: diagnose-agent
code: CFG-603
title: Apply-mode self-modification is enabled with no cryptographic gate behind it
priority: critical
labels: [security, autonomy, policy, blocker]
files:
  - ../projects/nanobionic-laboratory-md/project.projectdsl
dedupe_key: diagnose:CFG-603:projects/nanobionic-laboratory-md/project.projectdsl
---

## Evidence

`projects/nanobionic-laboratory-md/project.projectdsl` (modified 2026-08-08 17:21):

```
POLICY_ALLOW_RUNTIME_SELF_MODIFICATION true
POLICY_AUTONOMY_MODE apply
POLICY_REQUIRE_SIGNED_MUTATION_GRANT false
POLICY_MAX_ITERATIONS_PER_HOUR 60
```

`node dist/src/cli/main.js doctor` in the same workspace:

```
"mutationGrantSecretConfigured": false
```

The sibling project `projects/nanobionic-laboratory` still carries the shipped default
(`false` / `propose` / `true`).

## Why this matters

These three lines are the whole authority boundary for code mutation. Set this way the
runtime may rewrite its own sources, in `apply` mode, and **no signed grant is required**.

The sharp part is the combination: `MUTATION_GRANT_HMAC_SECRET` is **not set**, so even
turning `POLICY_REQUIRE_SIGNED_MUTATION_GRANT` back on would not produce a working gate —
grants could be neither issued nor verified. There is currently no configuration of this
project in which a mutation is cryptographically authorised.

`docs/FULL_AUTONOMY_GAPS.md` names `allowRuntimeSelfModification=false` as the deliberate
fail-closed default, and lists thirteen preconditions for lifting it. At least these are
not met today: no container isolation, no post-apply gates, no canary/rollback, no
independent evaluator identity, no promotion path out of the isolated workspace.

This ticket does **not** assume the change was a mistake — enabling autonomy is a plausible
intent. It asserts that the change is currently unsupported by the machinery it depends on.

## Acceptance criteria

Either:

- **(a) Restore fail-closed** — `false` / `propose` / `true`, and record why apply mode was
  wanted so the requirement is not lost; or
- **(b) Make apply mode real** — set `MUTATION_GRANT_HMAC_SECRET`, re-enable
  `POLICY_REQUIRE_SIGNED_MUTATION_GRANT true`, and land the preconditions in
  `docs/FULL_AUTONOMY_GAPS.md` items 3, 4, 6, 12, 13 before any unattended run.

In both cases: `diagnose-agent scan` reports no `CFG-603`, and a test asserts the shipped
wizard default cannot silently drift.

Also review `POLICY_MAX_ITERATIONS_PER_HOUR 60` (was 12): with apply mode this is the rate
limit on self-modification, not just on iteration.
