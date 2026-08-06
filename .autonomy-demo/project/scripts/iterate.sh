#!/usr/bin/env bash
set -euo pipefail
docker compose run --rm runtime project-iterate /project/project.projectdsl /project/.living-runtime "${DT_LLM_MODE:-deterministic}"
