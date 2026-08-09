# Autonomy model

Session event chronicle (planned vs executed vs still autonomous): [`EVENT_HISTORY_AUTONOMY.md`](EVENT_HISTORY_AUTONOMY.md).

## Closed loop

```text
research sources
  -> resourceDSL / DQL / treeDSL / queryDSL / mathDSL
  -> todo2code Intent Evidence graph for development
  -> observationDSL for runtime and environment
  -> authority-owned mathDSL gates
  -> twinDSL
  -> sceneDSL / OpenUSD candidate
  -> validation receipt + improvementDSL + feedback
  -> next source/code/runtime change
```

The loop is autonomous for **analysis, projection, validation, proposal and safe scene publication**. It is not an unrestricted source-code self-modifier.

## Authority boundary

The LLM may add non-authoritative analysis bindings and expressions. The runtime owns and overwrites these names:

- `ManagerApproved`;
- research, development and runtime evidence gates;
- development acceptance;
- iteration rate limit;
- autonomy mode;
- signed mutation grant presence;
- `IterationAllowed`;
- `ScenePublishAllowed`;
- `RuntimeSelfModificationAllowed`.

An attempted override is not silently accepted. It is recorded as `LLM_AUTHORITY_BINDING_IGNORED:*` or `LLM_AUTHORITY_EXPRESSION_IGNORED:*` and creates a review action in `improvementDSL`.

## Development evidence

Real `todo2code` output has priority over a fixture. The adapter reads:

- `intent.graph.json`;
- `diagnostics.json`;
- `manifest.json`;
- graph fingerprint, record and relation counts;
- blocking diagnostics and manifest status.

A fixture is accepted only with `POLICY_ALLOW_DEVELOPMENT_FIXTURE true`. Production projects should set it to `false` after bootstrapping canonical `todo2code`.

## Mutation modes

- `observe` — analyze and project only;
- `propose` — generate `improvementDSL`, plans and candidates; default; may run `mutation-propose` (grant + isolate + source-patch proposal, no tree write);
- `apply` — allows `mutation-apply` only when all of the following hold:
  - `POLICY_ALLOW_RUNTIME_SELF_MODIFICATION true`;
  - cryptographically verified mutation grant (HMAC secret + plan/artifact/target bindings);
  - single-use `jti` consumption;
  - explicit `--approval-hash` matching the source-patch hash;
  - apply runs **only inside an isolated worktree/copy** — promotion to the live tree is still external.

### Signed mutation grant

Reusable contract aligned with `subactor/runtime` apply-grant (ADR-003):

```bash
export MUTATION_GRANT_HMAC_SECRET="..."
node dist/src/cli/main.js grant-issue <projectId> <planHash> <artifactSha256> <target> <actor> grant.json
node dist/src/cli/main.js grant-verify grant.json <projectId> <planHash>
```

Placeholder signatures without a valid compact HS256 token fail closed.

### Code mutation pipeline

```bash
node dist/src/cli/main.js mutation-propose project.projectdsl plan.json .living-runtime
# apply is optional, isolated, and fails closed without policy + grant + approval hash:
node dist/src/cli/main.js mutation-apply project.projectdsl plan.json source-patch.json <approvalHash> .living-runtime
```

Real `semcod/todo2code` is preferred for `propose-source-patch` / `apply-source-patch`. Without it, propose writes a structured empty proposal so the control plane remains testable offline.

After an isolated apply, the runtime runs `todo2code pipeline` again and evaluates the reviewed plan
with `close-code-change`. Both graphs and diagnostic sets are persisted beside the mutation receipt.
Only `allAccepted=true` produces `applied-isolated`; failed or rejected acceptance remains isolated
and is never promoted.

### twin-probes evidence

```bash
# cycle.json from subactor/twin-probes (subactor.autonom-cycle/v1)
node dist/src/cli/main.js probes-ingest cycle.json .living-runtime/candidate/probe.evidence.json
```

## Reliability

- persistent project lease blocks duplicate concurrent iterations;
- content-bound idempotency key binds project configuration, source state and previous iteration;
- `POLICY_MAX_ITERATIONS_PER_HOUR` is a hard gate;
- unchanged inputs return the prior receipt without invoking LLM or rebuilding a scene;
- watcher failures use bounded exponential retry;
- failure receipts are written to `failures/` and `dead-letter.jsonl`;
- candidate artifacts never replace the last-known-good scene when validation fails;
- event records include trace, correlation, evidence URIs and validation result.
