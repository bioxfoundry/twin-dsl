# DSL contracts

## intentDSL

Owned by `todo2code` as `t2c.intent/v1`. Includes request, decision, plan, report, result and claim with provenance and epistemic class.

## resourceDSL

Final resources are runtime-owned:

```text
subactor.resource/v1
uri = urn:subactor:resource:sha256:<content-hash>
```

NL produces only `subactor.resource-plan/v1 status=proposed`.

## queryDSL

```text
QUERY <id>
INTENT <intent-uri>
PROCESS <exact-uri-process>
SOURCES [<immutable-resource-uri>, ...]
SNAPSHOT <sha256>
FILTER <field> contains|equals|prefix|regex "<value>"
RETURN tree|math|table|text|scene|twin
RESULT_URI <template>
VALIDATE [<rule>, ...]
```

## DQL crawl

```text
DQL <id>
SITEMAPS [https://host/sitemap.xml]
SEEDS [https://host/start]
ALLOW_HOSTS [host]
INCLUDE [/docs/**]
EXCLUDE [/privacy]
CONTEXT [term, term]
MAX_URLS 100
MAX_SITEMAPS 10
SAME_ORIGIN true
RESPECT_ROBOTS true
OUTPUT markdown
VALIDATE [same-origin, citations, budget]
```

## treeDSL

```text
TREE <id>
  NODE <id> <kind> "<label>"
    NODE <child-id> <kind> "<label>"
```

Factual file/document trees should be generated deterministically. LLM tree output is appropriate for proposed semantic organization, not physical filesystem truth.

## mathDSL

```text
MATH <id>
BIND <name> = true|false|number|<n>/<d>|"text" [UNIT <unit>] FROM [<uri>]
EXPR <name> = AND(...) | OR(...) | NOT(...)
EXPR <name> = EQ(...) | GTE(...) | LTE(...) | GT(...) | LT(...)
```

No arbitrary code or `eval`. Twarde gates use booleans. Weighted scoring is permitted only after mandatory constraints pass.

## twinDSL

JSON AST `subactor.twin/v1`:

- `sourceSnapshotHash`;
- timestamp obserwacji;
- components;
- source URIs per component;
- properties and child components.

## sceneDSL

JSON AST `subactor.scene/v1` maps immutable Twin/component references to scene paths and
conceptual primitives. A binding can carry position, size and a normalized `[x,y,z,w]`
orientation quaternion. SceneDSL describes what is rendered; it does not by itself certify
geometry.

## GeometryValidationDSL

```text
GEOMETRY_VALIDATION <evidence-id>
METHOD world-aabb
COVERAGE BINDINGS <n> POSITION <n> SIZE <n> ORIENTATION <n> CONSTRAINTS <n>
COMPLETENESS COMPLETE|INCOMPLETE
CHECK <id> KIND position|size|orientation|inside|clearance|no-overlap SUBJECT <id>
  [OBJECT <id>]
  ACTUAL <number> LIMIT <number> UNIT m|deg
  RESULT PASS|FAIL MESSAGE "<typed-reason>"
END_CHECK
RESULT PASS|FAIL
END_GEOMETRY_VALIDATION
```

It deterministically compares scene pose with physical evidence under explicit tolerances and
evaluates spatial constraints. `RESULT PASS` means all executable checks passed;
`COMPLETENESS INCOMPLETE` means evidence coverage is insufficient for certification. No LLM
decides either value.

## GeometryDSL and GeometryBuildReceiptDSL

`subactor.geometry-build/v1` is the executable, deterministic geometry intent. The readable
projection binds source/dependency hashes, parameters, engine, unit, stable Twin/scene targets,
outputs and validation policy:

```text
GEOMETRY <id>
SOURCE urn:subactor:resource:sha256:<hash>
SOURCE_FORMAT scad
ENGINE openscad VERSION "2021.01"
TARGET_COMPONENT <stable-component-id>
TARGET_SCENE_PATH /Stable/Scene/Path
UNIT millimeter
DEPENDENCY "threadlib/threadlib.scad" MOUNT "threadlib" URI <uri> SHA256 <hash>
PARAMETER_SET <id>
PARAMETER <name> = <typed-value>
OUTPUT canonical=3mf web=glb scene=usda
VALIDATE nonEmpty=true finiteBbox=true dependencyClosure=true glbLoad=true ...
REFERENCE "reference.glb" SOURCE <source-uri> ARTIFACT <artifact-uri> SHA256 <hash> UNIT millimeter COMPARE extent
END_GEOMETRY
```

The execution projection contains `BUILD_HASH`, `PARAMETER_SET_HASH`,
`VALIDATION_POLICY_HASH`, `GEOMETRY_HASH_PROFILE`, artifact/bbox checks and, on failure, both
`ERROR_URN` and `REPAIR_PROCESS`. `RESULT PASS` is the only state that can create CAD-grade
physical evidence. See `docs/GEOMETRY_COMPILATION.md` for the full lifecycle.

## ProjectIntegrityDSL

Cross-layer validation of requirements, research, design, development, runtime, Twin, scene
and validation artefacts. It reports independent coverage for layers, dependency links,
parameters and assumptions, followed by typed findings and authorized repair-process URIs.
The full contract and epistemic meaning of `PASS · INCOMPLETE` are documented in
`docs/PROJECT_INTEGRITY_DSL.md`.

## Live-twin contracts

`LiveBindingDSL`, `TwinState` and `AssemblyDSL` are executable runtime contracts. BehaviorDSL,
VisualDSL and event transport remain the next architectural steps. The canonical object remains a
versioned JSON/Protobuf AST; text is its reviewable DSL projection.

The reference implementations are independently built as `@subactor/assembly-dsl` and
`@subactor/live-twin-state`. Application imports under `src/` are exact compatibility re-exports;
the versioned files, not an in-memory package dependency, remain the cross-agent contract. See
[`PACKAGE_ARCHITECTURE.md`](PACKAGE_ARCHITECTURE.md).

### AssemblyDSL (implemented)

```text
ASSEMBLIES laboratory-assemblies-v1
ASSEMBLY bioprinter_01
ROOT bioprinter_mos3s_01
KIND device
PART display_box COMPONENT bioprinter_part_display_box REQUIRED true
ASSET urn:subactor:resource:sha256:<hash>
SCENE_PATH "/Biofoundry/Equipment/Bioprinter01/DisplayBox"
END_PART
END_ASSEMBLY
```

A part asset cannot certify its parent assembly. Assembly completeness is calculated from required
parts, exact Twin parent/child identity, grounded asset URIs and validated scene placement; it is
never inferred from filename similarity. Runtime writes `assembly-report.json/.dsl` and its receipt
URI. Missing mesh or transform is `PASS · INCOMPLETE` with an exact warning/repair URI. Unknown
components, parent drift, ungrounded assets and asset drift are errors and block publication.

### TwinState and LiveBindingDSL (implemented)

```text
LIVE_BINDINGS laboratory-live-v1
BIND temperature_bioreactor
SUBJECT "urn:subactor:component:bioreactor_01"
METRIC "temperature"
TARGET bioreactor_01 thermal_state
FRESH_FOR 10s
EXPIRE_AFTER 30s
ON_STALE unknown
RANGE_STATE * 20 cold
RANGE_STATE 20 40 nominal
RANGE_STATE 40 * overheating
END
```

`LIVE_BINDING_FILE` in ProjectDSL activates the contract. The deterministic projector writes
`twin-state.json` and `twin-state.dsl`, records `observedAt`, `receivedAt`, value, unit, source URI,
binding ID, age and quality `fresh|stale|expired|unknown`. Missing data becomes `unknown`; historical
values remain inspectable but use `ON_STALE` rather than their old semantic state. Only an exact
`subjectUri + metric` match may alter TwinState; name or URI-suffix matching is forbidden, and a
nonexistent `componentId` blocks the iteration. Open-ended ranges are strict (`* 20` is `<20`,
`40 *` is `>40`); a bounded `20 40` range includes both endpoints. The immutable artifact stores
TTL, mapped state and `projectedAt`; `/api/state` adds `evaluatedAt` and re-evaluates quality on every
read, so a quiet sensor still transitions from `fresh` to `stale` and `expired` without a new model
revision.

### BehaviorDSL and VisualDSL (planned)

```text
BEHAVIOR pump_01
STATE stopped
STATE running
STATE fault
TRANSITION stopped -> running WHEN command.start accepted
TRANSITION running -> fault WHEN observation.current > max_current
END_BEHAVIOR

VISUAL pump_fault
WHEN pump_01.state == fault
COLOR thermal_warning
ANIMATION warning_pulse
END_VISUAL
```

Behavior is domain state, not renderer code. Dashboard, OpenUSD, alarms, TestQL and LLM ContextDSL
are independent projections of the same revisioned TwinState.

### Identity and routing

Content identity remains immutable:

```text
urn:subactor:resource:sha256:<hash>
urn:subactor:iteration:sha256:<hash>
```

Commands and queries use routable capabilities:

```text
ifuri://twin/bioreactor_01/queries/state
ifuri://twin/bioreactor_01/commands/start
```

An URN answers what exact artifact/revision is referenced. An IFURI answers where work is routed;
it must resolve to an authorized process and cannot replace evidence identity.

## query-result

Every result binds:

- query hash;
- source snapshot;
- immutable result URI;
- evidence URIs;
- validation checks;
- ticket/process/idempotency receipt.
