# @subactor/archive-project-analyzer

Deterministic ZIP inventory and evidence ranking for Digital Twin projects. The package does not execute archive contents and does not let an LLM select filesystem paths. It identifies assembly CAD, mesh/CAD candidates, BOMs, documentation, control software and manifests; emits stable error/repair URIs; and returns bounded text/geometry selections for a separate safe materializer.

The analysis is evidence, not scene authority. A selected archive entry only becomes physical geometry evidence after extraction, content hashing, conversion and geometry validation produce a build receipt.
