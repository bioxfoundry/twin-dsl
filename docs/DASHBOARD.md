# Live factory dashboard

Serves a living project's twin/scene artifacts over HTTP and renders the factory in 3D, so the
physical twin can be inspected while it iterates. Dependency-free: `node:http` on the server,
a small hand-written WebGL renderer in the page — no CDN, no build step, works offline.

```bash
node dist/src/cli/main.js dashboard <project.projectdsl> <runtime-out-dir> [port] [mode]
# default: port 7331, deterministic mode
```

Workspace Makefile wykonuje przed startem kontrolę portu. Zgodny, zdrowy dashboard tego samego
projektu jest używany ponownie; inny Twin lub usługa zwraca jawny
`DASHBOARD_PORT_CONFLICT:<host>:<port>:expected=<twin>:actual=<twin-or-service>`. Sam serwer
zamienia systemowy `EADDRINUSE` na stabilne `DASHBOARD_PORT_IN_USE`, bez nieobsłużonego zdarzenia
Node.js. Dla demonstracji uruchamianej z repozytorium `twin-dsl` można podać np.
`make dashboard PORT=7332`.

`Run iteration` reports `[digital-twin] iteration:start`, `iteration:complete` or
`iteration:error` in the browser console. The server prints matching `[dashboard]` entries to its
stdout and persists JSONL records in `logs/dashboard-<port>.log`; HTTP errors are shown in the
dashboard status line instead of being silently ignored.

`mode` is any `LlmMode` — `deterministic`, `prefer-llm`, `require-llm` — and is what the iterations
triggered from the page run under.

## What it shows

- **Revision state** is split into `ACTIVE · ACCEPTED` and `LATEST · REJECTED`. The WebGL scene,
  compatibility fields (`twin`, `scene`, `geometryValidation`, `projectIntegrity`) and USD export
  always describe `current/`. A rejected `candidate/` is exposed only through
  `latestCandidate` and the diagnostics panel; it can never silently colour or replace ACTIVE.
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
  evidence decision, with position/size/orientation requirements and constraint count. Coverage
  is calculated only for `physical` and `hybrid` components; cyber/logical marker placement is
  display layout, not a physical claim. Missing
  orientation is shown as an identity fallback, never silently presented as measured.
- **Cross-layer integrity** — coverage of requirements through validation, dependency links,
  parameters and assumptions, plus stable finding codes that lead to repair-process URIs.
- **Separate fidelity counters**: evidence coverage among physical/hybrid components, actual mesh
  bindings, unique mesh assets and primitive fallbacks. Evidence grade is no longer labelled
  "physical geometry". Twin component count is kept separate from rendered scene bindings.
- **Assembly completeness** comes from `assembly-report.json`: complete devices, required parts,
  grounded assets, placed parts and typed findings. A device may be `PASS · INCOMPLETE`; one part
  mesh can never certify the parent device. Assets without validated transforms stay unplaced and
  are deliberately not rendered as guessed geometry.
- Live coverage comes from explicit LiveBindingDSL targets — names and URI suffixes are never guessed.
- **TwinState freshness** displays resolved bindings and independent `fresh`, `stale`, `expired`
  and `unknown` counts. The associated component property shows its semantic state and quality, so
  a historical value remains auditable without being presented as current telemetry. Quality is
  re-evaluated at every `/api/state` read; it does not freeze at the last iteration timestamp.
- **Runtime observations** and the active content-addressed Twin revision. `sourceSnapshotHash`
  remains separate input provenance and is not presented as an artifact revision. ObservationDSL
  is projected deterministically through LiveBindingDSL; BehaviorDSL/VisualDSL are not yet applied
  to geometry, so current colours still communicate geometry evidence only.
- **DSL & iteration log** — the latest append-only runtime events plus current
  `observations.dsl`, `twin-state.dsl`, `math.dsl`, `improvement.dsl`, GeometryValidationDSL,
  ProjectIntegrityDSL and TestQLDSL,
  refreshed without exposing
  filesystem paths. Event payloads are highlighted as JSON and artifacts as DSL; all values are
  escaped before token markup is added. Logs render before the optional WebGL scene update, so a
  graphics-driver or canvas failure cannot hide diagnostic evidence.
- **Video capture** — `Record 3D video` records the WebGL canvas locally at 30 FPS and downloads a
  `.webm` file when stopped. It negotiates VP9/VP8/WebM, requests one-second encoder chunks and
  reports `EMPTY_VIDEO_BLOB` when the browser cannot encode. No frames are sent to the server.

The recording is intentionally canvas-only: it captures exactly the rendered Digital Twin view,
including orbit/zoom and live updates. Add the downloaded file to the iteration presentation or
store it next to the corresponding `generation-audit.json` as visual evidence.

Weryfikacja instancji `nanobionic-laboratory-md` wygenerowała kontrolny zrzut
`projects/nanobionic-laboratory-md/.living-runtime/current/presentation/digital-twin-dashboard.png`
oraz 3-sekundowe nagranie orbity
`projects/nanobionic-laboratory-md/.living-runtime/current/presentation/digital-twin-orbit.webm`.
W bieżącym Chromium headless sam Blob `MediaRecorder` został sprawdzony: 113 071 B, VP9,
63 dekodowalne klatki. Warstwa pobierania `blob:` w Playwright/Snap zwróciła natomiast pusty plik,
dlatego test rozdziela walidację encodera od walidacji pobierania i zawsze uruchamia `ffprobe`.
`digital-twin-dashboard.webm` jest zremuksowanym, dekodowalnym zapisem przechwyconej rewizji, a
`digital-twin-orbit.webm` pozostaje 3-sekundowym testem ruchu kamery. Runtime waliduje teraz ścisły
`subactor.presentation-evidence/v1`: ponownie liczy hash i rozmiar każdego PNG/WebM, porównuje
`twinUri` i `sceneUri`, wymaga parametrów kamery (eye/target/up/FOV oraz hash trajektorii orbity),
zapisuje `presentation-evidence.json` + PresentationEvidenceDSL i klasyfikuje
wynik jako `CURRENT`, `STALE`, `UNVERIFIED`, `MISSING` albo `INVALID`. Istniejące pliki nie mają
jeszcze manifestu ani opisu kamery, więc pozostają ostatnim udanym capture, nie dowodem bieżącej
rewizji; `START.md` i ProjectIntegrityDSL pokazują ten brak jawnie.
Szczegóły i wymagane bramki opisuje
[`DIGITAL_TWIN_DETAIL_AUDIT.md`](DIGITAL_TWIN_DETAIL_AUDIT.md).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | dashboard page |
| `GET` | `/api/state` | explicit `active` revision, optional rejected `latestCandidate`, observations, TwinState, Assembly report and latest iteration receipt |
| `GET` | `/api/events` | bounded view of the latest 100 append-only iteration events |
| `GET` | `/api/dsl` | current DSL artifacts plus failed candidate geometry/integrity receipts |
| `GET` | `/api/scene.usda` | the scene rendered to OpenUSD |
| `POST` | `/api/iterate` | run one iteration; returns 422 with exact failures when authority blocks publication |
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

## State response invariant

The following equality must hold even when the latest iteration failed:

```text
state.renderedScope = current
state.artifactScope = current
state.twin = state.active.twin
state.scene = state.active.scene
state.geometryValidation = state.active.geometryValidation
state.projectIntegrity = state.active.projectIntegrity
```

When a failed candidate exists:

```text
state.diagnosticScope = candidate
state.latestCandidate.status = rejected
state.latestCandidate.validation.ok = false
```

This makes the API safe for clients that do not understand candidate revisions while still
providing the exact failure and repair evidence to newer clients.

## Binding to a host

The server listens on `127.0.0.1` by default. It has **no authentication and no CSRF protection**,
and `/api/iterate` and `/api/intake` mutate the project on disk — treat it as a local inspection
tool. Do not bind it to a public interface.
