---
id: ticket-08
signal: diagnose-agent
code: SRC-102
title: The archive role is declared but empty, so it grounds nothing
priority: low
labels: [sources, grounding]
files:
  - ../projects/nanobionic-laboratory-md/project.projectdsl
dedupe_key: diagnose:SRC-102:data/archives
---

## Evidence

```
SRC-102  data/archives  (empty directory)
```

`project.projectdsl` declares `SOURCE archive "data/archives" …`, the directory exists, and
it contains no readable file.

## Why this matters

`project-verify` passes this: the path exists. The role therefore looks covered in the
project configuration while contributing nothing to the resource snapshot — a grounding gap
hidden behind a green check. This is precisely the case `diagnose-agent`'s source probe was
written to catch beyond `project-verify`.

Any blueprint component listing `archive` among its `sourceRoles` falls back to whole-role
URIs, or to `role-fallback-empty-filter` grounding, and still renders a box in the dashboard.

## Acceptance criteria

Either import the archival material (one `.zip` in `data/archives`, or
`project-add-source <config> archive <path>`), or remove the `SOURCE archive` line. A role
that grounds nothing should not be declared.
