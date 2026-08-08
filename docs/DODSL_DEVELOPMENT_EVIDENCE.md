# doDSL development evidence intake

The Digital Twin runtime consumes development evidence after doDSL has cloned
the repository and todo2code has produced a deterministic graph. It must not
invoke todo2code through its domain runtime or reinterpret native todo2code
artifacts independently.

```text
todo2code
  -> graph + diagnostics + code-change proposals
doDSL
  -> development-evidence.dsl bound to exact Git commit/tree
onlyDSL
  -> candidate validation and AQL-governed accepted state
twin-dsl
  -> read-only evidence observation
```

`@subactor/development-evidence` is the zero-dependency reference consumer. It
recomputes the onlyDSL semantic hash and emits stable diagnostic codes. A valid
bundle still has no mutation authority: code-change plans remain data and are
never passed to a shell or runtime command dispatcher.

## Living runtime integration point

After the current living-runtime refactor is merged, the iteration controller
can read:

```text
SSOT/current/development/todo2code/<repository>/development-evidence.dsl
```

or a validated candidate projection and call:

```ts
const result = verifyDevelopmentEvidenceDsl(markdown);
```

Only `result.ok === true` may create a typed development observation. An
`accepted` assessment means todo2code found zero blocking diagnostics; it does
not mean that the SSOT candidate was promoted. Promotion state must come from
an onlyDSL receipt. `incomplete` evidence becomes a ProjectIntegrity finding,
not a request to weaken validation.

The prepared `intakeDevelopmentEvidence()` adapter already implements this
three-state boundary. It returns `observationEligible=true` only for a valid
bundle assessed as `accepted`, while `ssotPromotionVerified` and
`mutationAuthorized` are literal `false` in every result. The living iteration
controller therefore needs a separate onlyDSL promotion receipt before it can
project accepted state.

The integration must preserve these distinct identities:

```text
repositoryRevision  Git commit analyzed by todo2code
graphFingerprint    semantic todo2code graph
semanticHash        complete DevelopmentEvidenceBundle identity
SSOT revision       accepted project state owned by onlyDSL
Twin revision       domain projection owned by twin-dsl
```
