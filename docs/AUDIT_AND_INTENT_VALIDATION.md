# Audit of conversion, Digital Twin, and intent compliance

## Which package converts and translates?

`twin-dsl/py/f2md` (published as `f2md`) is responsible for conversion.

- `LocalToolConverter` runs Pandoc for LaTeX (`.tex` → Markdown), PDF, and Office.
- `TextConverter` is a safe fallback when a specialized backend is unavailable.
- `STLMetadataConverter` locally reads binary/ASCII STL (triangles, bounding box, and dimensions),
  so a Docling failure no longer creates an empty placeholder for the mesh.
- `ArgosTranslator` translates Markdown offline; for confidential documents, the `hybrid` policy does not
  send content to the network.
- `tree.py` saves the original as `*.secret.<lang>.md`, and the target language without a suffix, e.g.,
  `report.tex.secret.lt.md` + `report.tex.secret.md`.

The order is intentional: source format → structural Markdown → Markdown translation. This way,
the translator does not need to understand LaTeX, and the converter does not mix extraction with translation.

## Corpus audit

```bash
PYTHONPATH=twin-dsl/py/f2md/src \
  python -m f2md.audit \
  ../nanobionic-laboratory ../nanobionic-laboratory-md \
  --secret-pattern konfidencial \
  --json > audit-report.json
```

The audit checks:

- completeness of source → Markdown mapping and provenance envelope;
- compliance of `source`, `inputKind`, `confidential`, `language`, and backend;
- use of Pandoc for `.tex`;
- closure of code blocks, number of headers, and presence of tables;
- original/translation pair and backend metrics;
- errors as `ERROR`, problems for the next iteration as `WARNING`, and repair suggestions.

Twin artifact audit:

```bash
PYTHONPATH=twin-dsl/py/f2md/src \
  python -m f2md.audit \
  ../nanobionic-laboratory ../nanobionic-laboratory-md \
  --twin ../projects/nanobionic-laboratory-md/.living-runtime/current
```

`twin.json`, `scene.json`, `scene.usda`, the number of components and bindings, and the number of
components without geometry are checked. `GEOMETRY_UNGROUNDED` is not a silent success: it means that Markdown
contains a description, but the runtime does not yet have verified CAD/IFC/survey/floor-plan.

## Intent → evidence → artifact

Each iteration should store `development.intent.json`, `development.evidence.json`,
`generation-audit.json`, `twin.json`, `scene.json`, `scene.usda`, and `improvement.dsl`. These files are
machine-validatable by existing `intentDSL`, `observationDSL`, `twinDSL`, `sceneDSL`, and
`improvementDSL`; the audit report is additional, human-readable quality evidence, not a replacement.
for runtime gates.

The second layer can be generated from the English corpus:

```bash
PYTHONPATH=twin-dsl/py/f2md/src \
  python -m f2md.intent_compile \
  ../nanobionic-laboratory-md ../nanobionic-laboratory-md-dsl
```

`*.intent.json` packages and `compile-report.json` are generated. Each record passes `t2c.intent/v1` validation;
the canonical TypeScript runtime validator can confirm the result before it is used in the next iteration.

After re-running the corpus: 134 source files, 129 text/metadata conversions, 0 mapping gaps,
12 translations, and 16 `stl-metadata` conversions. The audit completed with `errors=0`; remaining
warnings primarily concern inconsistent confidentiality markers and 10 Twin components for which
the runtime still has no assigned physical record. After running `physical-intake`, the number of
placeholders dropped from 12 to 10; two cell-free components were marked as `cad` based on
existing STEP files.

## DSL feedback loop in runtime

Active DSL fetching occurs in `src/runtime/living-project.ts`:

1. `scanSources()` scans project sources, including `imports/derived/...nanobionic-laboratory-md-dsl`.
2. `indexIntentDsl()` searches for `*.intent.json` packages, reads the original JSON (also for names
   like `report.docx.md.intent.json`), and runs `validateT2cIntent()` for each package.
3. The result is part of `stableKey` and the Twin/scene generator context. A change in DSL forces a new iteration.
4. An invalid package sets `IntentDslValidationFailed`, blocks `IterationAllowed`, and scene publication.
5. Each cycle saves the index in `current/intent-dsl.index.json`, and `feedback/latest.md` contains the number
   of packages, records, and errors. In the last run: 112 packages, 1269 records, 0 errors.

The loop should point to the runtime parent directory (not `current`):

```bash
cd /home/tom/github/bioxfoundry/twin-dsl
node dist/src/cli/main.js project-iterate \
  /home/tom/github/bioxfoundry/projects/nanobionic-laboratory-md/project.projectdsl \
  /home/tom/github/bioxfoundry/projects/nanobionic-laboratory-md/.living-runtime deterministic
```

## `onlyDSL` assessment

`/home/tom/github/tom-sapletta-com/onlyDSL` has useful ideas: IFURI, event sourcing, source index
and a strict LLM boundary. We do not copy its parallel DSL implementations to `twin-dsl` because
the runtime already has validators and stable `subactor.*` schemas. A sensible integration is to export
an audit report as an artifact with URI/provenance and further use existing `todo2code` gates;
directly replacing current validators with them would increase schema drift.

## Insufficient 3D model

If the audit shows many `componentsWithoutGeometry`, the model remains conceptual despite rich
documentation. The next step is `physical-intake` with `document`, `measured`, `cad`, `ifc`
or `verified` records, pointing to files in the imported corpus. The dashboard visualizes the class of evidence
by color, so progress is visible and measurable.

The full regression plan, negative tests, and promotion criteria are in
[`NEXT_TEST_PLAN.md`](NEXT_TEST_PLAN.md).

## Presentation recording

The dashboard has a `Record 3D video` button. Recording takes place locally with `canvas.captureStream(30)`
and downloads a WebM file upon stopping. For presentation, the file should be attached along with `audit-report.json`
and the revision number from `generation-audit.json`, so that the image has corresponding textual evidence.
