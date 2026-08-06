# URI Process connector server

The control panel at `http://127.0.0.1:8091/` is a client of one authenticated
URI Process server. The implementation behind 8091 is Node.js (the PHP worker
portal is a separate service at 8180), but both user-facing applications can use
the same server contract.

```text
browser / PHP portal
        |
        v
hr-control :8091  -- actor token + API scope
        |
        v
hr-bridge          -- AQL URI scope + audit envelope
        |
        v
urirun-node :8765  -- node token + registry policy
        |
        v
urirun-connector-* -- isolated handler + external service
```

`POST /api/processes/run` accepts a concrete `uri`, JSON `payload`, and the
actor contract's `allowed_uri_processes`. A URI outside that list is rejected
before network access. The node's `/run` endpoint additionally requires
`URIRUN_NODE_TOKEN` (or the deployment admin token fallback) and is bound to
localhost on host port 18765.

The registry is rebuilt at node startup from checked-out connector packages.
The current deployment exposes its health and route catalog through the
Integrations tab and `GET /api/connector-runtime`.

## Coverage gate

`config/uri-process-connectors.json` maps every AQL `ALLOW URI_PROCESS` scheme
to its public repository. Run:

```bash
npm run connectors:coverage
bash scripts/test-uri-process-server.sh
```

The gate fails if a contract scheme has no catalog owner, its repository is not
public in `urirun-connectors`, or the live node exposes no route for it.

Platform-owned processes are implemented by
`urirun-connector-subactor`; external systems keep dedicated connectors such as
`urirun-connector-slack`, `urirun-connector-teams`, `urirun-connector-github`,
and `urirun-connector-plesk`.
