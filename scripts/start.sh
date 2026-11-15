#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  if [[ -x .local/bin/node ]]; then export PATH="$PWD/.local/bin:$PATH";
  else printf '%s\n' 'Install Node.js 22+ and run npm ci, then npm run dev.'; exit 1; fi
fi
if [[ ! -d node_modules ]]; then npm ci; fi
exec node node_modules/vite/bin/vite.js --host 127.0.0.1
