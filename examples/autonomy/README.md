# Autonomy examples

These examples exercise the autonomy boundary rather than only the happy-path Digital Twin build.

## Scenarios

1. **Authority-owned math gates** — an LLM proposal attempts to set `ManagerApproved=true` and `IterationAllowed=true`; the runtime retains deterministic policy values and records `LLM_AUTHORITY_*_IGNORED` warnings.
2. **Development fixture gate** — a fixture is accepted only when `POLICY_ALLOW_DEVELOPMENT_FIXTURE true` is explicit. Otherwise the scene remains a candidate and `improvementDSL` proposes connecting canonical `todo2code`.
3. **Rate limit** — a changed source after `POLICY_MAX_ITERATIONS_PER_HOUR` is exhausted produces a blocked receipt without replacing the last-known-good scene.
4. **Persistent lease** — a second process cannot execute the same project iteration while the first lease is active.
5. **Failure recovery** — watcher failures are written to `failures/`, `dead-letter.jsonl`, and the domain event log; the watcher retries with bounded exponential backoff.
6. **Self-modification** — propose-only by default. Cryptographic signed grants (HMAC) + isolated worktree are implemented; apply stays inside isolation and still needs policy + approval hash.
7. **Mutation grant crypto** — `grant-issue` / `grant-verify`; placeholder signatures fail closed.
8. **twin-probes cycle** — `probes-ingest` validates `subactor.autonom-cycle/v1` (must declare `watches` paths).

Run:

```bash
npm run demo:autonomy
cat .autonomy-demo/summary.json

npm run demo:mutation
cat .mutation-demo/summary.json
```

Fixtures:

- `signed-mutation-grant.example.json` — shape only; issue a real grant with the CLI;
- `code-change-plan.example.json` — sample plan for `mutation-propose`.

Executable assertions: `test/autonomy.test.ts`, `test/mutation-grant.test.ts`.
