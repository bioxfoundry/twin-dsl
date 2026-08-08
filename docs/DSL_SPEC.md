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

## query-result

Every result binds:

- query hash;
- source snapshot;
- immutable result URI;
- evidence URIs;
- validation checks;
- ticket/process/idempotency receipt.
