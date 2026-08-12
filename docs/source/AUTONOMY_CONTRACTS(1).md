# AQL/OQL autonomy contracts

A contract is a durable delegation granted by a human with
`plans:approve`. It specifies allowed AQL models, OQL operations, recipient domains,
maximum number of steps, execution limit, and expiration. An agent with
`plans:propose` can use an active contract but cannot extend it.

`POST /api/autonomy/contracts` creates a contract, and `POST /api/plans/autonomous`
evaluates the hash and all plan steps before execution. A compliant plan is
approved by the contract's identity and executed with idempotent keys. An out-of-scope plan
remains `proposed`, and the Planfile receives an `actor:human` ticket.

An operation with `requires_human_approval: true` always goes to a human — even
if its name is on the list of allowed operations.

## Responsibility and Delegation

The Founder is the root of responsibility. A contract without a `principal` field belongs
to `human:founder`, and uncovered work goes to the founder's queue and is
reported to `founder@localhost`.

`principal` indicates a person or bot, e.g.,
`{"kind":"bot","id":"it-provisioner-bot"}`. A ticket created under such a contract receives
the same executor and queue. Routing itself does not simulate
execution: the bot must have a real adapter or URIrun process that will receive
the ticket and record proof of the result.

The Founder can delegate without a parent contract. Another person can create further
delegations only if they provide `parent_contract_id`, are the principal of an active
parent contract, and that contract allows the operation
`autonomy.contract.delegate`. A bot cannot extend its own permissions.

## AQL contract and TestQL validation

A readable contract can be saved as `components/contracts/**/*.contract.aql`. The compiler
`@subactor/runtime/contract-aql` converts it into a runtime contract and checks syntax,
scope limitations, and the delegation chain. An example is
`components/contracts/actors/bots/it-provisioner/it-provisioner.contract.aql`.

The `tests/testql/contract-aql-validation.testql.toon.yaml` scenario proves two
properties: a valid contract compiles with a complete set of validation tags, and a
bot attempting to delegate permissions is rejected with the stable code
`contract_aql_bot_cannot_delegate`. Locally, it can be run via
`npm run test:contract-aql` or as part of the TestQL environment.

A ready-made portfolio of contracts is located in `components/contracts/actors/`. The manifest includes
the founder, Operations Lead, Marketing Lead, and IT, communications, browser, and
project bots. `signing-manifest.json` classifies each contract as a signable
human delegation or a technical contract. The portfolio test enforces actor uniqueness, the correctness of each file,
and the rule that only a human can receive the right to further delegate.

The generation of the entire document portfolio is described in the canonical documentation
[`subactor/platform`](https://github.com/subactor/platform/blob/main/docs/CONTRACT_GENERATION.md).
