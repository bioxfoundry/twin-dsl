#!/usr/bin/env bash
set -euo pipefail
bash scripts/bootstrap-todo2code.sh
docker compose up -d --build --wait
