# @subactor/assembly-dsl

Zero-runtime-dependency implementation of `subactor.assembly/v1` and
`subactor.assembly-report/v1`.

It parses and renders AssemblyDSL, validates stable device/part identity, and measures whether
required parts are grounded by ingested assets and placed in the scene. Missing evidence remains
diagnosable as incomplete; identity, hierarchy, or asset drift fails closed with stable error URNs
and repair-process URIs.

```ts
import { parseAssemblyDsl, analyzeAssemblies } from "@subactor/assembly-dsl";

const assembly = parseAssemblyDsl(source);
const report = analyzeAssemblies({ projectId, document: assembly, twin, scene, allowedAssetUris });
```

The canonical integration boundary is still the versioned JSON/DSL file contract. The package is
an independently testable implementation and does not make in-memory imports mandatory across
processes or repositories.

```bash
npm run check
npm test
npm run build
```
