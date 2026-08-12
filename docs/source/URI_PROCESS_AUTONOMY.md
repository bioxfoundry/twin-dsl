---
schema: subactor.doc/v1
id: platform.docs.uri.process.autonomy
version: 1
status: current
updated: 2026-07-21
---

# URI Process in autonomous Subactor

A task is an execution contract between the result owner and the actor. Contract AQL, OQL, and specific Process URIs are separated in the format `scheme://target/package/resource/operation`.

## Ticket before effect

Before execution, a Planfile ticket must exist with a manifest, explicit AQL/EQL/OQL/URI definition, compliance of the executed step, an idempotency key associated with the ticket, and a plan to save the result and log reference. Control creates the ticket before dispatch, and the bridge re-validates it at the final effect boundary.
