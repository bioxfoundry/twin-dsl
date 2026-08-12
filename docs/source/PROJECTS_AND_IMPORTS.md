# Projects, knowledge sources, and import

A project is the overarching context for Organization OS work. Every record can be
linked via `project_id` to a specific product, client, initiative, or
internal project.

## Project resources

The workspace aggregates:

```text
project_sources
project_imports
knowledge_documents
business_processes
campaigns
offers
leads
opportunities
support_cases
test_suites
test_runs
outcomes
evidence
tasks
commitments
decisions
documents
conversations
contracts
```

Endpoint:

```http
GET /api/org/projects/:project_id/workspace
```

## Import types

### Website

```json
{
  "source_type": "website",
  "source": "https://cybermysz.pl"
}
```

Importer:

- honors `robots.txt` on a best-effort basis;
- fetches HTTP/HTTPS only;
- blocks private and loopback addresses;
- verifies each redirect before execution;
- stays within the initial origin;
- limits the number of pages, depth, size, and timeout;
- creates Markdown with headings, text, links, images, and metadata;
- saves the provenance of each page.

It does not execute page JavaScript. For entirely client-side applications, a separate,
isolated browser adapter, e.g., Playwright, run as an approved process and covered by
TestQL, is needed.

### Local directory

```json
{
  "source_type": "directory",
  "source": "cybermysz-demo"
}
```

The directory must be located within `PROJECT_IMPORT_ROOT`. The importer applies:

- realpath control;
- extension allowlist;
- file count limit;
- per-file size limit;
- total limit;
- skipping binary files;
- ignoring `.git`, `node_modules`, `vendor`, builds, and cache.

### Git repository

```json
{
  "source_type": "git",
  "source": "https://github.com/organization/project.git"
}
```

Requirements:

- HTTPS only;
- no login credentials in URL;
- host allowlist;
- shallow clone;
- disabled interactive credential prompts;
- timeout;
- further analysis according to the same file limits.

## Import results

Each import creates:

1. `source.md` — unified source knowledge;
2. `business-blueprint.md` — a human-readable blueprint;
3. structured blueprint JSON;
4. `import.testql`;
5. `test-results.json`;
6. source records with provenance;
7. knowledge documents;
8. TestQL result;
9. recommended AQL model.

## Secrets

Before sending material to LLM and saving the source document, the following are detected and
redacted, among others:

- OpenRouter keys;
- AWS keys;
- private keys;
- values described as token, API key, password or secret.

Secret detection does not trigger business actions. AQL selects the plan
`security_review_required`.

## Relationship with the LLM

The importer always first creates a deterministic blueprint. LLM is optional and
can only supplement it within a strict schema.

```text
source
→ Markdown
→ secret redaction
→ deterministic blueprint
→ optional OpenRouter analysis
→ validation and merge
→ TestQL
→ proposed AQL/OQL
→ human approval
```

Lack of a key or OpenRouter failure does not block import.
