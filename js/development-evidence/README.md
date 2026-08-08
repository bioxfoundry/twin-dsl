# @subactor/development-evidence

Zero-runtime-dependency TypeScript verifier for the kernel-owned
`onlydsl.development-evidence/v1` file contract.

The package consumes `development-evidence.dsl` produced by doDSL. It verifies
the exact Git commit/tree, immutable graph/diagnostic/manifest URNs and the same
canonical semantic hash as `onlydsl-contracts`. It rejects prose, unknown or
duplicate fields, tampering, authority grants and mutation effects.

```ts
import { verifyDevelopmentEvidenceDsl } from "@subactor/development-evidence";

const result = verifyDevelopmentEvidenceDsl(markdown);
if (!result.ok) throw new Error(result.code);
```

This is evidence intake only. The package does not invoke todo2code, execute a
plan, choose a process URI, write Twin state or grant AQL authority.
