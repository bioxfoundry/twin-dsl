# Data model

Each record has at least:

```json
{
  "id": "prefix_...",
  "created_at": "ISO-8601",
  "created_by": "actor",
  "updated_at": "ISO-8601",
  "updated_by": "actor",
  "archived_at": null
}
```

## Relationships

```text
organization
  ├── people
  ├── teams
  ├── clients
  │    ├── contacts
  │    ├── conversations ── messages
  │    ├── contracts ────── contract_versions
  │    ├── projects ─────── tasks
  │    └── commitments
  ├── decisions
  ├── documents
  └── activities
```

Identifiers can be passed directly. OQL operations can also resolve
relations via `client_name`, `contact_email`, `project_external_ref`, and `contract_number`.

API deletion is a soft archive via `archived_at`. Data is not physically erased except by the
development reset endpoint.

## Project-centric resources

```text
projects               parent project
project_sources        URL/file/repository provenance
project_imports        import runs
knowledge_documents    Markdown and Business Blueprint
business_processes     project operating processes
campaigns              marketing campaigns
offers                 offers requiring review
leads                   contacts before qualification
opportunities           sales opportunities
support_cases           support cases
test_suites             TestQL definitions
test_runs               test execution evidence
outcomes                measurable outcomes
evidence                evidence packages
```

All these entities accept `project_id`. A Workspace does not copy data; it aggregates
domain records by this identifier.
