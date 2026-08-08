# Live factory dashboard

Serves a living project's twin/scene artifacts over HTTP and renders the factory in 3D, so the
physical twin can be inspected while it iterates. Dependency-free: `node:http` on the server,
a small hand-written WebGL renderer in the page — no CDN, no build step, works offline.

```bash
node dist/src/cli/main.js dashboard <project.projectdsl> <runtime-out-dir> [port] [mode]
# default: port 7331, deterministic mode
```

`Run iteration` reports `[digital-twin] iteration:start`, `iteration:complete` or
`iteration:error` in the browser console. The server prints matching `[dashboard]` entries to its
stdout, and HTTP errors are shown in the dashboard status line instead of being silently ignored.

`mode` is any `LlmMode` — `deterministic`, `prefer-llm`, `require-llm` — and is what the iterations
triggered from the page run under.

## What it shows

- **3D scene** built from `scene.json` bindings and `twin.json` properties. Boxes and cylinders are
  placed at their real metre positions and extents; drag to orbit, wheel to zoom, click a part to
  inspect it. Picking uses an offscreen colour-id pass, so selection is exact rather than a raycast
  approximation.
- **Colour = geometry evidence**, not component type: grey `placeholder`, amber `document`,
  blue `measured`, green `cad`, violet `ifc`, mint `verified`. The factory visibly hardens as real
  data arrives.
- **Identity invariants** — `componentIdsStable` / `scenePathsStable` straight from
  `physical-evidence.report.json`, alongside applied/rejected counts.
- **Geometry validation** — a separate `PASS`/`FAIL` result and `COMPLETE`/`INCOMPLETE`
  evidence decision, with position/size/orientation coverage and constraint count. Missing
  orientation is shown as an identity fallback, never silently presented as measured.
- **Runtime observations** and the current revision URI.
- **DSL & iteration log** — the latest append-only runtime events plus current
  `observations.dsl`, `math.dsl`, `improvement.dsl`, GeometryValidationDSL and TestQLDSL,
  refreshed without exposing
  filesystem paths. Event payloads are highlighted as JSON and artifacts as DSL; all values are
  escaped before token markup is added. Logs render before the optional WebGL scene update, so a
  graphics-driver or canvas failure cannot hide diagnostic evidence.
- **Video capture** — `Record 3D video` records the WebGL canvas locally at 30 FPS and downloads a
  `.webm` file when stopped. No frames are sent to the dashboard server.

The recording is intentionally canvas-only: it captures exactly the rendered Digital Twin view,
including orbit/zoom and live updates. Add the downloaded file to the iteration presentation or
store it next to the corresponding `generation-audit.json` as visual evidence.

Weryfikacja bieżącej instancji `nanobionic-laboratory-md` wygenerowała kontrolny zrzut
`projects/nanobionic-laboratory-md/.living-runtime/current/presentation/digital-twin-dashboard.png`
oraz 3-sekundowe nagranie orbity
`projects/nanobionic-laboratory-md/.living-runtime/current/presentation/digital-twin-orbit.webm`.
W środowisku Chromium headless `MediaRecorder` może emitować pusty strumień przy statycznym
canvasie; dlatego test prezentacyjny używa interakcji orbity i sprawdza wynik przez `ffprobe`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | dashboard page |
| `GET` | `/api/state` | current twin, scene, evidence and geometry reports, observations, iteration receipt |
| `GET` | `/api/events` | bounded view of the latest 100 append-only iteration events |
| `GET` | `/api/dsl` | current observation, math, improvement and geometry-validation DSL artifacts |
| `GET` | `/api/scene.usda` | the scene rendered to OpenUSD |
| `POST` | `/api/iterate` | run one runtime iteration |
| `POST` | `/api/intake` | apply a `subactor.physical-evidence/v1` document |

`POST /api/intake` is **durable**, not a preview: it validates the document, writes
`baseline/physical-evidence.json` into the project, adds `SCENE_PHYSICAL_EVIDENCE_FILE` to the
projectDSL if missing, and runs an iteration. The result is therefore a real new twin revision that
survives a reload.

### Accumulating, validated intake

Records are **merged** onto the document the project already holds, keyed by `componentId`, so
a later intake updates what it mentions and leaves every other component untouched. Only
records that passed validation are written.

The pre-check receives `allowedAssetUris` from `current/resources.json`, so `ASSET_NOT_GROUNDED`
is raised **before** anything is written — it is no longer a rule only the runtime can enforce.
An intake from which nothing was accepted answers **422** and writes nothing.

This closes a data-loss defect: the handler used to replace the evidence file wholesale before
the runtime validated it, so a rejected — or merely smaller — document discarded every
previously applied record and reverted those components to `placeholder`, while still
answering 200.

A document rejected by the pre-check — malformed schema, unknown `componentId`, a grade weaker than
the one already on the component — is refused before anything is written.

## Binding to a host

The server listens on `127.0.0.1` by default. It has **no authentication and no CSRF protection**,
and `/api/iterate` and `/api/intake` mutate the project on disk — treat it as a local inspection
tool. Do not bind it to a public interface.
