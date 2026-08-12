# Project Business Operating System

The module's goal is to transform project knowledge into a controlled business operating system.
The import does not execute campaigns or send offers. It first creates knowledge,
a blueprint, tests, and a proposed plan.

## Full process map

The Blueprint contains seventeen areas:

1. positioning and offer;
2. advertising and traffic acquisition;
3. content and market education;
4. lead generation and qualification;
5. sales and closing;
6. monetization and Revenue Operations;
7. implementation and value delivery;
8. customer support;
9. retention, development, and referrals;
10. product, roadmap, and experiments;
11. finance, invoicing, and receivables;
12. contracts, legal, and compliance;
13. people, skills, and capacity;
14. partnerships and procurement;
15. analytics, experiments, and decisions;
16. security, privacy, and continuity;
17. TestQL, evidence, and accountability.

The plan can additionally create a process for examining information gaps.

## Accountability

Each process has:

- `owner_role`;
- a goal;
- KPI;
- status;
- a project linkage;
- a source of creation;
- a change history.

AI does not own the outcome. LLM proposes structure and draft content.
Outcome owner and approver are humans or formal organizational roles.

## Import-to-execution cycle

```text
1. Create a project
2. Import a website, repository, or directory
3. Review the Markdown and blueprint
4. Check the import with TestQL
5. Create an AQL/OQL plan
6. Read the exact OQL
7. Approve the plan with an approver token
8. Execute the adapters
9. Run postflight TestQL
10. Review processes, tasks, campaigns, and outcomes in the workspace
```

## AQL

`project-business-bootstrap.pl.aql` selects a variant:

- security review for potential secrets;
- further investigation for weak evidence;
- full business system for a market project;
- technical product system for a repository;
- standard bootstrap.

AQL is deterministic: identical input yields identical decision.

## OQL

OQL shows all operations before execution. For a full project, it can create:

- business processes;
- a launch campaign;
- an offer for review;
- sales funnel tasks;
- a support knowledge-base task;
- a revenue measurement task;
- project outcome;
- suite TestQL;
- postflight TestQL.

The plan has an OQL hash. Upon approval, the hash is saved, and before execution, the system
checks if the plan has been modified.

## TestQL

The Importer runs TestQL for:

- the number of sources correctly retrieved;
- Markdown size;
- provenance;
- the number of processes;
- the number of tasks;
- detected secrets.

After OQL execution, Bridge runs postflight TestQL for the project workspace:

- at least 17 processes;
- the current advertising process;
- current sales process;
- current Revenue Operations;
- current support;
- task backlog;
- a defined outcome.

TestQL failure stops the plan as `failed`, not `completed`.

## Marketing and sales automation

The system prepares the structure, but external actions must be separate,
approved plans. Example subsequent AQL models:

```text
campaign-planning.pl.aql
lead-qualification.pl.aql
offer-approval.pl.aql
sales-followup.pl.aql
customer-onboarding.pl.aql
support-triage.pl.aql
renewal-and-upsell.pl.aql
```

Sending an advertisement, offer, message to a client, changing a price, or contractual obligation
should require an appropriate level of approval.
