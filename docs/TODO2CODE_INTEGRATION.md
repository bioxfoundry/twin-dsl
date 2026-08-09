# todo2code integration

Canonical repository:

```text
https://github.com/semcod/todo2code
```

The similarly named `semcod/todo2coded` repository was not found and is not used.

## Runtime relationship

```text
human/agent NL
→ todo2code extract nl
→ t2c.intent/v1
→ Subactor query/resource/twin pipeline
```

The adapter never changes `todo2code` sources. It invokes the local compiled CLI.

```dotenv
T2C_ROOT=/home/tom/github/semcod/todo2code
T2C_BIN=/home/tom/github/semcod/todo2code/dist/src/cli.js
```

Verification:

```bash
cd "$T2C_ROOT"
npm install
npm run verify

cd /path/to/digital-twin-runtime-starter
npm run doctor
```

## Pipeline artifacts and convergence

For a living project the adapter invokes `todo2code pipeline` and reads:

```text
.living-runtime/development/latest.json
.living-runtime/development/runs/<run-id>/manifest.json
.living-runtime/development/runs/<run-id>/intent.graph.json
.living-runtime/development/runs/<run-id>/diagnostics.json
```

`todo2code` 0.5 may express artifact pointers relative to the analyzed development root;
older output uses paths relative to the output directory. The adapter supports both forms and
accepts a run only after its graph is loadable.

Autonomous change detection excludes execution-only fields (`runId`, timestamps, durations and
the content URI of that particular run). It still hashes graph content, diagnostics, runtime and
configuration identity, stage results and the development-evidence summary. Therefore an
unchanged analysis returns `noChange: true`, while any semantic diagnostic or intent change
causes a new iteration.

The Nanobionic Laboratory live verification on 2026-08-08 used `todo2code` 0.5.0 and produced
an accepted graph with 11 records and 15 non-blocking diagnostics. The resulting development
evidence reports `source: "todo2code"`; it is not a fixture.

Live intent conversion:

```bash
OPENROUTER_API_KEY=... \
T2C_NL_MODE=require-llm \
node dist/src/cli/main.js nl-to-dsl \
  intent examples/nl-to-dsl/request.md out/intent.json require-llm
```

If `todo2code` is unavailable, `require-llm` fails. Offline package tests use an explicit fixture and do not pretend that the external CLI ran.

## Isolated apply and convergence

`mutation-apply` now requires an existing before-analysis before it consumes the single-use grant.
After applying an approved source patch in the isolated workspace it runs the deterministic pipeline
again and calls `close-code-change` with persisted before/after graphs and diagnostics. The mutation
receipt exposes `closeResultUri`, `closeResultPath` and `allAccepted`.

An apply is reported as `applied-isolated` only when `allAccepted=true`. A rejected close result or a
failed re-analysis writes a failure receipt and cannot enter a promotion path. Acceptance is evidence,
not permission to merge into the main tree.
