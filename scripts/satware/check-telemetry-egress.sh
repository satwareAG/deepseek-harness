#!/usr/bin/env bash
# Egress proof for the telemetry opt-out.
#
# The dsh CLI ships an OTLP/HTTP exporter whose production endpoint is compiled
# into the artifact. This test boots the real binary against a LOCAL OTLP
# listener with DSH_TELEMETRY_DISABLED=1 and requires zero requests to arrive.
#
# It first asserts the endpoint string is present in the binary - otherwise a
# zero-hit result would be vacuous (the exporter might simply be absent).
#
# Usage: scripts/satware/check-telemetry-egress.sh [path-to-binary]
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2

BIN="${1:-dist-exe/deepseek-harness-sdk-runtime-linux-x64}"
if [ ! -x "$BIN" ]; then
    printf 'telemetry egress: binary not found: %s (build first)\n' "$BIN" >&2
    exit 2
fi

ENDPOINT_MARKER='dsh-otel-collector.deepseeksvc.com'
if ! grep -qa "$ENDPOINT_MARKER" "$BIN"; then
    printf 'telemetry egress: FAIL - endpoint %s not found in the binary; the test would be vacuous\n' "$ENDPOINT_MARKER" >&2
    exit 1
fi

WORK="$(mktemp -d)"
HITS="$WORK/hits"
PORTFILE="$WORK/port"
: > "$HITS"
cleanup() { [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null; rm -rf "$WORK"; }
trap cleanup EXIT

node -e '
const http = require("node:http")
const fs = require("node:fs")
const hits = process.argv[1]
const portFile = process.argv[2]
const server = http.createServer((req, res) => {
  fs.appendFileSync(hits, `${req.method} ${req.url}\n`)
  res.writeHead(200); res.end("{}")
})
server.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(server.address().port)))
setTimeout(() => { server.close(); process.exit(0) }, 60000)
' "$HITS" "$PORTFILE" &
SERVER_PID=$!

for _ in $(seq 1 100); do [ -s "$PORTFILE" ] && break; sleep 0.1; done
if [ ! -s "$PORTFILE" ]; then
    printf 'telemetry egress: FAIL - local listener did not start\n' >&2
    exit 1
fi
PORT="$(cat "$PORTFILE")"

# Listener sanity: prove the endpoint is reachable and counted, so a zero-hit
# result below means "nothing was sent", not "nothing could be received".
if ! curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/sanity"; then
    printf 'telemetry egress: FAIL - local listener unreachable\n' >&2
    exit 1
fi
if [ "$(wc -l < "$HITS" | tr -d ' ')" -lt 1 ]; then
    printf 'telemetry egress: FAIL - listener did not record the sanity request\n' >&2
    exit 1
fi
: > "$HITS"

DSH_HOME="$(mktemp -d)" \
DSH_TELEMETRY_DISABLED=1 \
DSH_TELEMETRY_OTLP_URL="http://127.0.0.1:${PORT}/v1/logs" \
    timeout 180 "$BIN" --profile headless --help >/dev/null 2>&1
boot_rc=$?

# The exporter batches on a timer; give it a moment before counting.
sleep 3

hits="$(wc -l < "$HITS" | tr -d ' ')"
if [ "$boot_rc" -ne 0 ]; then
    printf 'telemetry egress: boot exited %s - rerun with output to diagnose\n' "$boot_rc" >&2
fi
if [ "$hits" -ne 0 ]; then
    printf 'telemetry egress: FAIL - %s request(s) reached the OTLP endpoint with DSH_TELEMETRY_DISABLED=1\n' "$hits" >&2
    cat "$HITS" >&2
    exit 1
fi
printf 'telemetry egress: ok - 0 requests to a reachable OTLP endpoint (endpoint present in binary, boot rc=%s)\n' "$boot_rc"
