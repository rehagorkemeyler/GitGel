#!/usr/bin/env bash
# Retry wrapper for the flaky api.ibb.gov.tr gateway.
# Usage: scripts/fetch.sh OUTFILE curl-args...
out="$1"; shift
for i in 1 2 3 4 5 6 7 8; do
  code=$(curl -sS -m 30 -A 'Mozilla/5.0' -o "$out.tmp" -w '%{http_code}' "$@" 2>/dev/null)
  if [ "$code" = "200" ]; then mv "$out.tmp" "$out"; echo "$code $out"; exit 0; fi
  sleep $((i))
done
rm -f "$out.tmp"; echo "FAIL($code) $out"; exit 1
