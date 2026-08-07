#!/usr/bin/env bash
set -euo pipefail
root="${T2C_HOST_ROOT:-vendor/todo2code}"
if [[ -f "$root/dist/src/cli.js" ]]; then exit 0; fi
rm -rf "$root"
git clone --depth 1 https://github.com/semcod/todo2code.git "$root"
npm --prefix "$root" install
npm --prefix "$root" run build
