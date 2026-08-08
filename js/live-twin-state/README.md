# @subactor/live-twin-state

Zero-runtime-dependency implementation of `subactor.live-binding/v1` and
`subactor.twin-state/v1`.

The package maps an exact `subjectUri + metric` pair to a stable Twin component property. It
projects semantic value states, keeps historical evidence inspectable, and re-evaluates
`fresh | stale | expired | unknown` quality without inventing another observation or model
revision.

```ts
import { parseLiveBindingDsl, projectTwinState, evaluateTwinStateFreshness } from "@subactor/live-twin-state";

const bindings = parseLiveBindingDsl(source);
const immutable = projectTwinState({ projectId, bindings, observations, twin });
const evaluated = evaluateTwinStateFreshness(immutable);
```

The canonical integration boundary is still a versioned JSON/DSL artifact. This package is the
deterministic projector implementation; it does not own telemetry transport, UI rendering, or
device commands.

```bash
npm run check
npm test
npm run build
```
