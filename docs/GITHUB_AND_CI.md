# GitHub and CI status

The package includes two root workflows:

- `.github/workflows/ci.yml` — TypeScript, Protobuf, unit/integration tests and all deterministic examples;
- `.github/workflows/docker-integration.yml` — Compose validation, runtime/Docling builds, ClickHouse/Docling health and runtime doctor.

Each generated living project also receives:

- `.github/workflows/ci.yml`;
- `.github/workflows/release.yml`;
- `scripts/bootstrap-todo2code.sh`.

The project CI clones and builds `semcod/todo2code`, so the development stage uses the canonical Intent Evidence graph rather than the bootstrap fixture.

## Local limitation of this build

The current artifact-building container did not expose a Docker daemon and could not resolve `github.com` through Git. Therefore Docker images and the real todo2code checkout were not executed locally. Their contracts and workflows are included and must run on GitHub-hosted CI or a Docker-enabled host before production use.
