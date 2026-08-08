# Package architecture

The runtime remains a private application orchestrator, while deterministic capabilities with a
stable file contract can be extracted into independently built and tested packages.

## Current boundaries

| Package | Owns | Does not own | Runtime dependencies |
|---|---|---|---:|
| `@subactor/f2md` | source-to-Markdown conversion envelope and provenance | translation, intent inference, Twin generation | optional converter peers |
| `@subactor/assembly-dsl` | AssemblyDSL parsing, validation, completeness analysis, error/repair URIs | CAD compilation, scene generation, mutation execution | 0 |
| `@subactor/live-twin-state` | LiveBindingDSL parsing, deterministic state projection and TTL re-evaluation | telemetry transport, commands, UI projection | 0 |
| private runtime starter | ingestion orchestration, leases, policy gates, candidate/current promotion, dashboard and receipts | package publication | application only |

The existing imports below remain supported:

```text
src/dsl/assembly.ts       -> @subactor/assembly-dsl
src/runtime/assembly.ts   -> @subactor/assembly-dsl
src/dsl/live-binding.ts   -> @subactor/live-twin-state
src/runtime/twin-state.ts -> @subactor/live-twin-state
```

They are exact re-exports rather than copied adapters. `test/package-boundaries.test.ts` checks
export identity, structural type compatibility, and identical content-addressed observation URIs.

## Contract rule

Package extraction does not change the cross-process contract. The authoritative boundary remains
a versioned JSON, Protobuf, or reviewable DSL artifact such as:

```text
subactor.assembly/v1
subactor.assembly-report/v1
subactor.live-binding/v1
subactor.twin-state/v1
```

This keeps independently deployed agents interoperable without requiring them to share an
in-memory library. Packages supply reference implementations of those contracts.

## Commands

```bash
npm run packages:check
npm run packages:test
npm run packages:build
```

`npm run verify` includes the independent package tests as an additional gate. Root integration
tests continue to exercise the same implementations through the compatibility imports and through
the full living runtime.

## Next candidates

Extraction should remain incremental. The next useful boundaries are:

1. geometry contracts and build hashing, without the OpenSCAD subprocess adapter;
2. project-integrity diagnostics and repair routing;
3. observation event contracts, before introducing SSE/WebSocket transport;
4. VisualDSL/BehaviorDSL only after TwinState identity and freshness remain stable in production.

The large `LivingProjectRuntime` stays an orchestrator. New compiler, validator, and projector
logic should be added behind package/service boundaries instead of increasing that class's domain
knowledge.
