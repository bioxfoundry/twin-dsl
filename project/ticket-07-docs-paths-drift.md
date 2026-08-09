---
id: ticket-07
signal: diagnose-agent
code: DOC-501, DOC-503
title: Six documented paths do not resolve and one internal link is broken
priority: low
status: fixed
labels: [docs, drift]
files:
  - docs/AUTONOMY_EXAMPLES.md
  - docs/QUICK_SOURCE_RECIPES.md
  - docs/EVENT_HISTORY_AUTONOMY.md
  - docs/source/AUTONOMY_CONTRACTS(1).md
dedupe_key: diagnose:DOC-501:twin-dsl-docs
---

## Evidence

`diagnose-agent scan --only docs`:

```
DOC-501  docs/AUTONOMY_EXAMPLES.md      /srv/customer/history.zip
DOC-501  docs/AUTONOMY_EXAMPLES.md      /srv/customer/specification.pdf
DOC-501  docs/AUTONOMY_EXAMPLES.md      /srv/git/device-runtime
DOC-501  docs/EVENT_HISTORY_AUTONOMY.md /home/tom/github/bioxfoundry/idea/Atvirojo
DOC-501  docs/QUICK_SOURCE_RECIPES.md   /home/user/github/todo2code
DOC-501  docs/QUICK_SOURCE_RECIPES.md   /var/log/twin
DOC-503  docs/source/AUTONOMY_CONTRACTS(1).md -> CONTRACT_GENERATION.md
```

## Why this matters

These are mostly illustrative placeholders (`/srv/...`, `/var/log/twin`), which is a
legitimate style — but a reader cannot tell an illustration from a stale real path, and the
probe cannot either. `/home/user/github/todo2code` in particular reads as runnable and is
not.

`docs/EVENT_HISTORY_AUTONOMY.md:/home/tom/.../idea/Atvirojo` is a truncation artefact: the
real path contains spaces (`Atvirojo kodo biofoundry studija-1.pdf`) and is unquoted, so
both the probe and a copy-pasting reader break on it. Quoting it fixes both.

## Acceptance criteria

- Illustrative paths are marked as such (a placeholder convention such as `/path/to/...`, or
  a sentence saying the block is an example), so `DOC-501` distinguishes them from drift.
- The unquoted path with spaces is quoted.
- The broken relative link is fixed or removed.
- `diagnose-agent scan --only docs --fail-on warning` is clean.

Note: the four `DOC-502` findings on `EVENT_HISTORY_AUTONOMY.md` are **not** in scope. That
file is a historical record of what was actually executed and must keep saying so.
