# Archive project extraction for the living Digital Twin

## Outcome

ZIP files are now treated as bounded project evidence containers rather than opaque binary stubs.
The deterministic pipeline inventories every entry, classifies useful evidence, selects a bounded
subset, materializes supported geometry with content hashes, and emits DSL plus stable error and
repair URIs. Archive contents are never executed by the analyzer.

The implementation is split at an authority boundary:

```text
ZIP bytes
  -> safe inventory
  -> @subactor/archive-project-analyzer
  -> archive-project-analysis/v1
  -> bounded materializer
  -> archive-materialization-receipt/v1
  -> CAD compiler / geometry receipt
  -> Physical Evidence
  -> AssemblyDSL / Twin / Scene
```

Selection is evidence discovery, not scene authority. A ZIP entry cannot become a rendered mesh
until its real bytes have been extracted, hashed, converted and accepted by the existing geometry
and physical-evidence gates.

## What is extracted from an engineering project

The analyzer distinguishes evidence that supports different Digital Twin layers:

| Archive evidence | Digital Twin use |
|---|---|
| native assembly CAD (`SLDASM`, `IAM`) | assembly hierarchy, parent/part identity, expected completeness |
| native part CAD (`SLDPRT`, `IPT`) | detailed part candidates; requires a deterministic vendor/backend export |
| `STEP`, `STL`, `3MF`, `SCAD`, `OBJ`, `GLB` | geometry candidates and validation references |
| `MTL`, CAD colors and face groups | material evidence and visual detail |
| BOM files | required-part list and assembly completeness |
| README, manuals, drawings and datasheets | dimensions, units, materials, visible features and constraints |
| firmware and control source | BehaviorDSL candidates, commands, states, telemetry and interfaces |
| manifests and configuration | project roots, dependencies, versions and reproducibility |
| PCB/EDA exports | controller/electrical evidence; not automatically physical device geometry |
| images | visual references; never promoted to measured geometry without a separate process |

This prevents a common failure mode: treating a large archive as “CAD exists” without identifying
whether it contains a complete assembly, one display enclosure, control code, or only screenshots.

## Safety and determinism

- ZIP-slip paths (`..`, absolute paths, Windows drive paths and backslashes) are reported as
  `urn:subactor:error:archive:archive-unsafe-path` and never selected or extracted.
- Large archives are inventoried independently of the legacy full-read limit. ChemOS with 3,552
  files is no longer rejected because it exceeds 1,000 entries.
- Text and geometry selection have separate limits. Defaults are 64 text entries and 32 geometry
  entries per archive; production projects can lower them through environment variables.
- Archive containers and materialized entries use SHA-256 of the real bytes. Path/size pseudo
  hashes are not accepted as physical geometry identity.
- The analyzer is zero-dependency and deterministic. OpenRouter may consume its report, but cannot
  change selection safety, content hashes, materialization limits or promotion gates.
- Entry-level findings remain in each archive JSON/DSL report. The runtime generation audit groups
  them by error code and repair URI, preventing large native-CAD assemblies from flooding a weaker
  model with hundreds of equivalent warnings.
- Native CAD without a backend is metadata-only and receives an explicit repair process, for
  example `subactor://process/repair/archive/convert-solidworks-to-step`.
- Runtime process caching is keyed by path, byte size, mtime and selection budgets so an unchanged
  1.1-GB archive is not rehashed on every watcher cycle.
- Runtime-owned `dashboard-<port>.log` files remain available through the dashboard log API and
  `START.md`, but recursive evidence scans exclude them. This prevents the runtime from changing
  its own source snapshot merely by logging an iteration. An explicitly declared log file is still
  accepted as evidence.

Relevant limits:

```text
DT_MAX_ARCHIVE_INVENTORY_FILES
DT_MAX_ARCHIVE_TEXT_ENTRIES
DT_MAX_ARCHIVE_GEOMETRY_ENTRIES
DT_MAX_ARCHIVE_MATERIALIZE_FILES
DT_MAX_ARCHIVE_MATERIALIZE_ENTRY_BYTES
DT_MAX_ARCHIVE_MATERIALIZE_TOTAL_BYTES
```

## CLI

Analyze one ZIP or every ZIP below a directory:

```bash
npm run build
node dist/src/cli/main.js archive-analyze \
  /home/tom/github/bioxfoundry/nanobionic-laboratory \
  /home/tom/github/bioxfoundry/nanobionic-laboratory-md-dsl/archive-analysis \
  analyze
```

Materialize the bounded set of supported geometry and material dependencies:

```bash
node dist/src/cli/main.js archive-analyze \
  /home/tom/github/bioxfoundry/nanobionic-laboratory \
  /home/tom/github/bioxfoundry/nanobionic-laboratory-md-dsl/archive-analysis \
  materialize
```

The output contains per-archive JSON, DSL and Markdown reports, an aggregate index, extracted
content-addressed entries and one materialization receipt per archive.

Archive analysis severity is preserved across the runtime boundary. `info` findings such as a
bounded text-selection limit are written to `generation-audit.json.notices`; only `warning` and
`error` findings enter `warnings`. A selected entry whose extension looks textual but whose bytes
are binary is retained as a content-addressed binary resource and recorded as a notice. Empty ZIP
members remain visible in inventory but are never presented as selected semantic evidence.

Diagnostics extract the repair URI carried by an archive finding. Missing SolidWorks and Fusion
360 backends therefore route to `convert-solidworks-to-step` and `convert-fusion360-to-step`
instead of the non-actionable generic `rerun-generation` process.

## Current nanobionic-laboratory result

The verified 2026-08-08 scan found:

| Metric | Result |
|---|---:|
| ZIP archives | 9 |
| entries | 4,432 |
| geometry candidates | 124 |
| materializable geometry/material entries | 41 |
| materialized successfully | 41 |
| materialization failures | 0 |
| unsupported native CAD entries | 105 |

The most important discovery was `pipette_assembly.obj` plus `pipette_assembly.mtl` in
`pipette-tool-cad-main.zip`. It is a complete OSCAR pipette-tool assembly, not geometry for the
whole OSCAR platform:

```text
source ZIP SHA-256  e395b2a2ad194e6481ed4558424c6105ee2661e89ce7aec90bb356c6b7af4b8c
source OBJ SHA-256  0f5a45635e4da21ccc59313a0a2a0d850180acda4200b9df677d6f68def22ada
GLB SHA-256         9c355eb641f67429e45ee5968bde59cea154df79d4e23263622005de4b3bad6e
vertices            414,007
triangles           412,076
groups/materials    38 / 38
bounds              0.064 × 0.255442 × 0.065328 m
```

The OBJ converter now emits indexed GLB primitives and converts MTL diffuse/specular/shininess
properties into PBR base color, metallic and roughness factors. The dashboard renders all 38
indexed primitives and materials. `oscar_pipette_tool_01` is a child of `oscar_robot_01`; its
assembly is complete without claiming that the complete OSCAR robot has been reconstructed.

Current visible progress after the accepted iteration:

```text
mesh bindings            2/30 -> 3/31
unique meshes            2    -> 3
complete assemblies      0/2  -> 1/3
complete required parts  2/17 -> 3/18
```

Inspect the detailed asset directly:

```text
http://127.0.0.1:7445/?focus=oscar_pipette_tool_01
```

After an operator captures presentation evidence, the inspection screenshot is written below.
The placeholder uses a logical runtime root because the file does not exist before capture:

```text
<runtime>/current/presentation/oscar-pipette-tool-inspection.png
```

## Remaining gaps and repair order

1. **SolidWorks backend:** 98 native pipette assembly/part files remain metadata-only. The existing
   complete OBJ is usable now, but named SolidWorks hierarchy should later be exported to STEP or
   a hierarchy-preserving exchange format in an isolated licensed worker.
2. **Fusion 360 backend:** seven F3D files remain metadata-only. Export them deterministically to
   STEP/3MF instead of parsing opaque F3D containers heuristically.
3. **MOS3S assembly transforms:** 14 STL parts are materialized and converted, but their
   parent-relative transforms are not present. Do not place them by filename guessing. Recover an
   assembly source, drawings or measured transforms before marking the bioprinter complete.
4. **Nested archives:** nested ZIPs are inventory evidence only in this version. Recursive analysis
   should use a depth, byte and entry budget and produce a separate child receipt.
5. **Renderer quality:** indexed multi-material rendering works, but textures, tangents, normal
   matrices, transparency ordering, environment lighting, shadows and AO remain incomplete.
6. **OpenUSD:** the composed scene still needs independent PXR validation and hierarchy/material
   parity with GLB.
7. **Live state:** the new geometry is static CAD evidence. Fresh telemetry, BehaviorDSL and a
   robot-local kinematic transform are still required before it is a live robotic twin.

The next autonomous geometry step should use the already materialized MOS3S and bioreactor assets
to propose evidence tickets, not bind all of them automatically. A scene mutation is allowed only
when component identity, assembly parent, unit and transform authority are available.

For weaker OpenRouter models, `prefer-llm` now records the real fallback duration and applies a
stage circuit breaker: a Twin transport timeout skips the following large Scene request and uses
the already validated deterministic Scene. Parser or grounding failures do not trip this breaker,
so repairable semantic responses still follow the normal validation path.

The verified GLM-5.2 run measured 43.467 seconds for successful MathDSL, 61.007 seconds for the
timed-out Twin proposal and 0 milliseconds for the short-circuited Scene stage. Total dashboard
iteration time fell from 206.490 to 145.697 seconds while the final revision remained accepted.
