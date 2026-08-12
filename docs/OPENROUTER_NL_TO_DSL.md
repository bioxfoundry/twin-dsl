# OpenRouter: NL → patchDSL → *DSL

## Scope

`NlDslCompiler` provides a single boundary for:

```text
NL → intentDSL   (deterministic todo2code baseline + patchDSL)
NL → resourceDSL plan
NL → queryDSL
NL → DQL crawl
NL → treeDSL
NL → mathDSL
NL → twinDSL
NL → sceneDSL
```

## The role of todo2code in Intent

`todo2code` already has:

- `t2c.intent/v1`;
- epistemic classes;
- provenance runtime-owned;
- `deterministic|prefer-llm|require-llm` modes;
- structured outputs validation;
- Intent vs Reality graph and diagnostics.

The starter invokes its CLI in deterministic mode to get the baseline state:

```bash
t2c extract nl request.md --root <tmp> --out intent.jsonl
```

Configuration:

```dotenv
T2C_ROOT=/home/tom/github/semcod/todo2code
T2C_BIN=/home/tom/github/semcod/todo2code/dist/src/cli.js
T2C_NL_MODE=deterministic
```

Any model enrichment is not delegated to the `todo2code` LLM client. It goes
through the same local patchDSL boundary as other artifacts.

## The only LLM boundary

OpenRouter receives:

- `LLM_POLICY subactor.llm-policy/v1` saved as DSL;
- `LLM_CONTEXT subactor.llm-context/v1` with the request, baseline state, and allowed paths;
- JSON Schema for the target artifact and patch envelope;
- GGML GBNF grammar for `subactor.patch-dsl/v1`;
- SHA-256 of the canonical base state.

The model does not return Twin, Scene, mathDSL, or text directly. The only output is:

```text
PATCHDSL "subactor.patch-dsl/v1"
TARGET "math"
BASE_SHA256 "<64 lowercase hex>"
SET "/dsl" "MATH proposed-v1\n..."
END_PATCH
```

The patchDSL text is in a strict `subactor.patch-envelope/v1` envelope. The local algorithm
checks the envelope, grammar, target, base hash, operation limit, JSON Pointer safety, and
the list of allowed roots. Only then does it apply the patch to a copy of the base and pass the result to
the existing parser and domain validator. The model does not execute the patch or save files.

The resource index is compacted to identity/provenance fields and limited by
`DT_LLM_RESOURCE_CONTEXT_LIMIT` (default 80). The full corpus still remains input
to deterministic validators; the limit only applies to LLM proposals.

Settings sent:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "strict": true,
      "schema": {
        "properties": {
          "schema": {"const":"subactor.patch-envelope/v1"},
          "patchDsl": {"type":"string"}
        }
      }
    }
  },
  "provider": {
    "require_parameters": true,
    "data_collection": "deny"
  },
  "temperature": 0,
  "stream": false
}
```

Optional:

```json
{"plugins":[{"id":"response-healing"}]}
```

## Modes

### deterministic

No network. Runtime validates a versioned fixture or the result of a deterministic generator.

### prefer-llm

OpenRouter first. An error causes an explicit fallback:

```json
{
  "effectiveMode":"deterministic",
  "degraded":true,
  "reason":"OPENROUTER_..."
}
```

The `llm` CLI shortcut is an alias for `prefer-llm`, not `require-llm`.

The developer-safe defaults are a 30-second timeout and one retry/repair attempt per artifact
(`OPENROUTER_TIMEOUT_MS=30000`, `OPENROUTER_MAX_RETRIES=1`). This prevents an unavailable weak
model from occupying a dashboard iteration for many multiples of two minutes. Production may
raise the values explicitly; `prefer-llm` still records the timeout and falls back to the locally
validated deterministic artifact.

### require-llm

Missing key, timeout, incompatible response, or schema error terminates the operation with an error. No hidden fallback occurs.

## Resource DSL

The LLM does not create the final `subactor.resource/v1` because it does not know the content or SHA-256. From NL, only the following is generated:

```text
subactor.resource-plan/v1 status=proposed
```

Only the importer reads the source and materializes the immutable resource URI.

## Mock test

`test/openrouter.test.ts` runs a real Fetch client against a controlled mock and checks:

- `json_schema`;
- `strict=true`;
- `require_parameters=true`;
- `data_collection=deny`;
- `response-healing`;
- no API key in the result;
- the patchDSL parser and the `mathDSL` parser after controlled patch application;
- rejection of bad base hash, target, foreign path, and unsafe JSON Pointer;
- correction of a weaker model: local parser code (e.g., `MATH_HEADER_REQUIRED`) returns in the next
  attempt as `LLM_REPAIR`; Markdown fence and free prose are rejected.

## Verified GLM-5.2

The `nanobionic-laboratory-md` project run with `z-ai/glm-5.2`, a 30s limit, and one repair:

- MathDSL: LLM PASS, 3.3 s;
- TwinDSL: timeout, explicit deterministic fallback;
- SceneDSL: response after 22.2s rejected by grounding, explicit fallback;
- complete iteration: 124 s, `validation.ok=true`.

Repeating through the exact same path as the dashboard button (`POST /api/iterate`) also
passed: MathDSL 9.3s via Baidu/OpenRouter, Twin and Scene ended with controlled timeout and
fallback, total 141.6s, `validation.ok=true`. `logs/dashboard-7445.log` contains the corresponding
`iteration:start` and `iteration:complete` events.

After enabling the real development `todo2code` provider instead of the fixture, two more full
runs were completed. MathDSL passed through Together (34.7s), then Baidu (36.4s); SceneDSL
was once rejected by domain grounding, and the remaining costly projections ended with an explicit
fallback. Both revisions had `validation.ok=true`, after which the loop reached `noChange=true` with
diff `0/0/0` and a stable todo2code fingerprint.

`generation-audit.json` stores the model/provider, time, tokens, cost, and `degraded/reason`.
In developer mode, the dashboard should use `prefer-llm`; 30s per artifact is a reasonable
operational budget, while deterministic CAD/Assembly/TwinState do not depend on the model.
