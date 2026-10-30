#!/usr/bin/env bash
# Canary for .betterleaks.toml: prove the path allowlist does not blind the gate.
#
# Plants a synthetic credential at a NON-allowlisted path inside the repo, runs
# the same scan the security workflow runs, and requires it to be reported.
# The credential is assembled at runtime so this script is not itself a finding
# (that self-detection is also asserted below).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2

CANARY="satware-canary-$$.txt"
REPORT="$(mktemp)"
cleanup() { rm -f "$CANARY" "$REPORT"; }
trap cleanup EXIT

# Generated at runtime: no literal credential shape in this file, so the
# scanner must not flag the canary script itself.
aws_suffix="$(openssl rand -hex 8 | tr '[:lower:]' '[:upper:]')"
secret="$(openssl rand -hex 32)"
{
    printf 'aws_access_key_id = AKIA%s\n' "$aws_suffix"
    printf 'aws_secret_access_key = %s\n' "$secret"
} > "$CANARY"

betterleaks detect --no-git --source . --report-format json --report-path "$REPORT" >/dev/null 2>&1 || true

if ! jq -e . "$REPORT" >/dev/null 2>&1; then
    printf 'canary FAILED: betterleaks produced no parseable report\n' >&2
    exit 1
fi

hits="$(jq --arg f "$CANARY" '[.[] | select(.File | endswith($f))] | length' "$REPORT")"
self="$(jq '[.[] | select(.File | endswith("betterleaks-canary.sh"))] | length' "$REPORT")"

if [ "$hits" -lt 1 ]; then
    printf 'canary FAILED: planted credential was not reported - the allowlist is too wide\n' >&2
    exit 1
fi
if [ "$self" -ne 0 ]; then
    printf 'canary FAILED: this script is itself detected; assemble the credential from parts\n' >&2
    exit 1
fi
printf 'canary ok: planted credential reported (%s hit(s)), script clean\n' "$hits"
