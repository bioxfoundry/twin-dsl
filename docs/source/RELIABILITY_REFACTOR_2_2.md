# Reliability Refactoring 2.2

## Fixed Limitations

### Full read-modify-write in JsonStore

Updates within a single process are serialized as a whole, not just during writing.
This eliminates record loss with parallel calls in the developer JSON Store.

This is still not a lock between multiple processes or hosts. Production requires a transactional
database.

### Atomic idempotency-key claim

Bridge writes `processing` state before adapter execution. Subsequent execution of the same
key receives the saved result, previous error, or in-progress status. The claim has a
lease and can be recovered after a failure.

### OQL EXPECT enforcement

The adapter result is checked after step execution. Unsatisfied `EXPECT` causes a step error,
instead of decoratively remaining only in the OQL text.

### AQL condition semantics

The parser supports:

- `AND` precedence over `OR`;
- parentheses;
- `NOT`;
- `exists(...)`.

This removes the ambiguity of earlier left-to-right evaluation.

### Pluggable adapter registry

Communication channels are separated from the main execution switch. Adding a provider
does not require changing AQL semantics.

## Remaining developer version limits

Before production, the following are still needed:

1. PostgreSQL and transactions;
2. canonical OQL AST as the sole source of execution;
3. durable queue or Temporal/BullMQ;
4. full output schemas of adapters;
5. policy engine and separation of duties;
6. TestQL preflight/postflight for each adapter;
7. telemetry trace/correlation IDs;
8. compensation and rollback mechanism.
