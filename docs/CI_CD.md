# CI/CD

The starter and every generated living project contain GitHub Actions.

CI:

1. validate projectDSL;
2. validate Docker Compose;
3. build runtime and Docling images;
4. execute one deterministic living iteration;
5. upload receipts and scene artifacts.

Release:

1. rerun verification;
2. authenticate to GHCR with `GITHUB_TOKEN`;
3. build and push the runtime image;
4. package deployment configuration.

Production deployment remains environment-specific and is intentionally not inferred from repository contents.
