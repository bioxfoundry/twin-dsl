# Real-time 3D Biofoundry Digital Twin

## Sources and precedence

1. **Manager** — hard gates and authority.
2. **Customer** — requirements and verified dimensions.
3. **Project** — observed state.
4. **Internet** — research context.
5. **Archive ZIP** — historical evidence.
6. **Derived** — query, math, and simulation results.

A lower-level source does not override a higher one without an explicit rule.

## Start runtime

```bash
node dist/src/cli/main.js biofoundry-build \
  examples/biofoundry/biofoundry.config.json \
  .biofoundry-run \
  deterministic
```

Runtime:

1. scans directories;
2. safely reads ZIP files without extracting them to disk;
3. runs an optional DQL/sitemap crawl;
4. converts materials to Markdown;
5. materializes `resource/v1`;
6. creates a snapshot;
7. compares it with the previous one;
8. builds `treeDSL`;
9. builds or proposes `mathDSL`, `twinDSL`, and `sceneDSL`;
10. executes hard gates;
11. generates `.usda`;
12. saves the receipt.

## Real-time watcher

```bash
node dist/src/cli/main.js biofoundry-watch \
  examples/biofoundry/biofoundry.config.json \
  .biofoundry-live \
  prefer-llm
```

At any given time, only one build is active. Changes arriving during a build will be detected in the next scan.

## Examples of changes

### Temperature 37 → 39°C

Changes:

- hash `current-state.json`;
- source snapshot;
- `twinUri`;
- `sceneUri`, because the binding points to an immutable Twin URI;
- the `subactor:temperatureC` attribute in OpenUSD.

### New client device

After adding an item to `equipment-spec.json`:

- `treeDSL` receives a new resource/revision;
- `twinDSL` receives a component;
- `scene.diff.json` contains `added`;
- OpenUSD receives a new prim.

### Limit exceeded

When `activeBioreactors > maxActiveBioreactors`:

```text
CapacityWithinLimit=false
SceneRebuildAllowed=false
```

Candidate is registered for audit, but `current/` is not overwritten.

### Manager revokes consent

`approved=false` blocks publication regardless of LLM outcome.

## Geometry fidelity

The starter scene is conceptual. It uses primitive `Cube`, `Cylinder`, `Sphere`, and `Scope`. It does not pretend to be CAD/BIM. Production integration can replace asset URIs with IFC, STEP, USD, or glTF after geometry verification.

## No change

If the content snapshot is identical to the previous one, the runtime returns `noChange=true`. It does not call OpenRouter, does not change `observedAt`, does not create a new Twin/Scene URI, and does not save a new scene.
