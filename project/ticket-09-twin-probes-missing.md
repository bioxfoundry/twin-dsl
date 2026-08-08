---
id: ticket-09
signal: manual
title: twin-probes is unavailable, so runtime evidence has no physical source
priority: medium
labels: [autonomy, evidence, runtime-loop]
files:
  - src/adapters/twin-probes.ts
dedupe_key: manual:twin-probes-unavailable
---

## Evidence

`doctor`:

```json
"twinProbes": { "bin": "", "available": false }
```

Runtime observations for `nanobionic-laboratory-md` currently number 9 and are derived from
files under `logs/` and `environment/` — that is, from a fixture-shaped `runtime.jsonl` and
`current.json`, not from a device.

## Why this matters

The execution loop is documented as updating the Twin only after hard runtime gates. Those
gates evaluate observations that presently come from static files in the project directory.
The loop is structurally correct and empirically empty: nothing physical is being observed,
so `ScenePublishAllowed` and friends are gating on values a human wrote.

`probes-ingest` exists as a CLI and `TwinProbesAdapter` is implemented, so the integration
point is there. What is missing is a real `subactor.autonom-cycle/v1` producer.

## Acceptance criteria

- `twin-probes` on `PATH` (or `TWIN_PROBES_BIN` set) and `doctor` reporting `available: true`.
- One real `probes-ingest` cycle folded into an iteration, with the resulting evidence
  visible in `current/observations.json` and attributable to a probe rather than a file.
- If no hardware is available, say so explicitly in the project README rather than leaving
  the fixture indistinguishable from a live feed.
