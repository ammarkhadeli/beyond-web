#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Use installed dependencies only. This script never installs a browser, changes
# system settings, or disables the Chromium sandbox.
review_node=''
review_candidates=()
if command -v node >/dev/null 2>&1; then review_candidates+=("$(command -v node)"); fi
review_candidates+=("$PWD/.local/bin/node")
for review_candidate in "${review_candidates[@]}"; do
  [[ -x "$review_candidate" ]] || continue
  if "$review_candidate" -e 'process.exit(process.platform === "linux" && Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
    review_node="$review_candidate"
    break
  fi
done
if [[ -z "$review_node" ]]; then
  printf '%s\n' 'Browser review requires an installed Linux Node.js 22+ runtime on PATH or at .local/bin/node.' >&2
  exit 1
fi
for review_dependency in node_modules/typescript/bin/tsc node_modules/vite/bin/vite.js node_modules/@playwright/test/cli.js; do
  if [[ ! -f "$review_dependency" ]]; then
    printf 'Required dependency is missing: %s. No installation was attempted.\n' "$review_dependency" >&2
    exit 1
  fi
done
if [[ "${BEYOND_REVIEW_HEADLESS:-0}" != '1' && -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  printf '%s\n' 'Headed review needs a graphical session (DISPLAY or WAYLAND_DISPLAY).' 'Run from your desktop terminal, or explicitly choose headless review:' 'BEYOND_REVIEW_HEADLESS=1 ./scripts/review-browser.sh' >&2
  exit 1
fi

if [[ "${BEYOND_REVIEW_SOFTWARE:-0}" == '1' ]]; then
  printf '%s\n' 'Review rendering request: explicit SwiftShader software rendering (not hardware evidence).'
else
  printf '%s\n' 'Review rendering request: normal Chromium rendering. Capture diagnostics identify the actual renderer.'
fi
if [[ "${BEYOND_REVIEW_HEADLESS:-0}" == '1' ]]; then
  printf '%s\n' 'Browser display mode: headless. This mode alone does not prove hardware rendering.'
else
  printf '%s\n' 'Browser display mode: headed Chromium.'
fi
if [[ "${BEYOND_REVIEW_FULL_CHROMIUM:-0}" == '1' ]]; then
  printf '%s\n' 'Browser distribution: full Chromium (including when headless).'
fi
printf '%s\n' "Building production assets, then reviewing http://127.0.0.1:${BEYOND_REVIEW_PORT:-5183}." "Screenshots, failure traces and JSON results: ${BEYOND_REVIEW_OUTPUT:-review-results}/."
"$review_node" node_modules/typescript/bin/tsc -b
"$review_node" node_modules/vite/bin/vite.js build
exec "$review_node" node_modules/@playwright/test/cli.js test --config=playwright.review.config.ts "$@"
