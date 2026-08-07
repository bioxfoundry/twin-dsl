# Live factory dashboard

Serves a living project's twin/scene artifacts over HTTP and renders the factory in 3D, so the
physical twin can be inspected while it iterates. Dependency-free: `node:http` on the server,
a small hand-written WebGL renderer in the page — no CDN, no build step, works offline.

```bash
node dist/src/cli/main.js dashboard <project.projectdsl> <runtime-out-dir> [port] [mode]
# default: port 7331, deterministic mode
```

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
- **Runtime observations** and the current revision URI.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | dashboard page |
| `GET` | `/api/state` | current twin, scene, evidence report, observations, iteration receipt |
| `GET` | `/api/scene.usda` | the scene rendered to OpenUSD |
| `POST` | `/api/iterate` | run one runtime iteration |
| `POST` | `/api/intake` | apply a `subactor.physical-evidence/v1` document |

`POST /api/intake` is **durable**, not a preview: it validates the document, writes
`baseline/physical-evidence.json` into the project, adds `SCENE_PHYSICAL_EVIDENCE_FILE` to the
projectDSL if missing, and runs an iteration. The result is therefore a real new twin revision that
survives a reload. A document that would be rejected is refused before anything is written.

## Binding to a host

The server listens on `127.0.0.1` by default. It has **no authentication and no CSRF protection**,
and `/api/iterate` and `/api/intake` mutate the project on disk — treat it as a local inspection
tool. Do not bind it to a public interface.
