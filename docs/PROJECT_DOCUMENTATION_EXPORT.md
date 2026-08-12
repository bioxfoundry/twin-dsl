# Digital Twin project documentation export

The runtime can turn one accepted Digital Twin revision into a portable project description in
Markdown, standalone HTML and PDF. All three human-readable formats are rendered from the same
`subactor.project-documentation/v1` data contract.

The export covers:

- project identity, manager intent and accepted content-addressed revision;
- configured source roles and logical roots without host filesystem paths or credentials;
- resource, media-type, source-coverage and intentDSL summaries;
- every Twin component, assembly part, Scene path, geometry evidence grade and 3D representation;
- ProcessDSL steps, actors, interactions, transitions, evidence and known gaps;
- normalized AnimationDSL effects and the explicit non-factual timing boundary;
- observe-only MQTT brokers, routes, source modes and URI Process identities;
- live TwinState values with freshness quality;
- geometry and cross-layer integrity results, repair URIs, deterministic decisions and citations.

## Generate files from the CLI

Build the runtime, then point the command at a project and its living-runtime directory:

```bash
npm run build
node dist/src/cli/main.js project-documentation \
  /home/tom/github/bioxfoundry/projects/nanobionic-laboratory-md/project/project.projectdsl \
  /home/tom/github/bioxfoundry/projects/nanobionic-laboratory-md/.living-runtime \
  /home/tom/github/bioxfoundry/projects/nanobionic-laboratory-md/.living-runtime/current/documentation
```

The output directory contains:

```text
project-documentation.json
project-documentation.md
project-documentation.html
project-documentation.pdf
project-documentation.manifest.json
```

The manifest binds every byte stream to a SHA-256 digest, the active Twin/Scene/analysis URIs and
the accepted iteration. Repeating the command against unchanged accepted artifacts in the same
runtime image produces the same bytes. The timestamp is taken from the accepted receipt or analysis
trace, not from the export request.

The human-readable formats deliberately begin with the project status, validation gaps, Twin
architecture and process model. Full source roots, deterministic decisions and citations follow as
audit appendices. Markdown and HTML include a table of contents. Empty MQTT or live-state contracts
are written as explicit “not configured/not available” statements instead of empty tables.

## Download from the dashboard

The dashboard top bar provides `Project MD`, `Project HTML` and `Project PDF` downloads. The
Analysis & provenance panel also exposes the machine-readable manifest.

| Format | Endpoint |
| --- | --- |
| Markdown | `/api/documentation?format=md` |
| standalone HTML | `/api/documentation?format=html` |
| PDF | `/api/documentation?format=pdf` |
| JSON contract | `/api/documentation?format=json` |
| SHA-256 manifest | `/api/documentation?format=manifest` |

Each response is a download and carries `x-subactor-project-documentation-uri` and
`x-subactor-twin-revision-uri`. Downloads are rendered in memory, so an inspection-only dashboard
does not mutate project state. Every accepted iteration stores the identical deterministic files
under `.living-runtime/current/documentation/`; the CLI can recreate them explicitly.

## Safety and revision rules

Documentation is generated only from `current/`, never by mixing current artifacts with a rejected
`candidate/`. The generator recalculates the Twin, Scene and analysis-trace content URIs and refuses
a mixed revision with `PROJECT_DOCUMENTATION_REVISION_MISMATCH`.

The export is descriptive. MQTT remains observe-only and PDF/HTML generation cannot invoke device
commands or run an iteration. The HTML contains no script. Internal `/api/source` locators are
displayed as dashboard locators rather than emitted as broken offline links; external HTTP(S)
citations remain clickable.

The PDF renderer has no npm/runtime-library dependency. It embeds DejaVu Sans as a Unicode Type 0
font, preserves Polish characters and scientific symbols such as `µ` and `×`, wraps long URIs, and
adds report hierarchy, revision footers and page numbers. The runtime Docker image installs the
exact font package; a Base-14 fallback keeps export available on an unsupported bare host. The
report exposes bounded excerpts and evidence links, not hidden model chain-of-thought or entire
source documents.

Contracts:

- [`project-documentation.schema.json`](../schemas/project-documentation.schema.json)
- [`project-documentation-manifest.schema.json`](../schemas/project-documentation-manifest.schema.json)

Stable failures are documented under `error/PROJECT_DOCUMENTATION_*.md`.
