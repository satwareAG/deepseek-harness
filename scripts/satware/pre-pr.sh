#!/usr/bin/env bash
# Pre-PR gate for the satwareAG fork. Runs the checks CI runs, locally.
#
#   scripts/satware/pre-pr.sh          fast gate (privacy, advisories, patch test)
#   scripts/satware/pre-pr.sh --full   adds typecheck, lint and the web build
#
# Exit: 0 clean | 1 any gate failed
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2

FULL=0
[ "${1:-}" = "--full" ] && FULL=1

fail=0
step() {
    local name="$1"; shift
    printf '== %s\n' "$name"
    if "$@"; then
        printf '   PASS\n'
    else
        printf '   FAIL\n'
        fail=1
    fi
}

step "privacy gate" node scripts/satware/check-privacy-leaks.mjs
step "dependency advisories" pnpm audit --audit-level high
step "extract-zip patch guard" npx vitest run scripts/extract-zip-symlink-guard.spec.ts

if [ "$FULL" -eq 1 ]; then
    step "typecheck" pnpm run typecheck
    step "lint" pnpm run lint
    step "web build" pnpm run build:web
fi

if [ "$fail" -ne 0 ]; then
    printf '\npre-pr: FAILED\n'
    exit 1
fi
printf '\npre-pr: clean\n'
