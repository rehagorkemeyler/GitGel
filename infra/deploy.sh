#!/usr/bin/env bash
# Called over SSH by .github/workflows/deploy-server.yml (forced command of the deploy key).
# Wrapped in main() so bash parses the whole file before git replaces it.
set -euo pipefail
# Prints how the server reaches the upstream live sources (İETT SOAP), from the host and from the
# live container, so a blocked or broken source shows up in the deploy log. Never fails the deploy.
check_sources() {
  local op=GetHatOtoKonum_json url=https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx
  local body="<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><$op xmlns=\"http://tempuri.org/\"><HatKodu>500T</HatKodu></$op></soap:Body></soap:Envelope>"
  echo "--- İETT from host"
  curl -sS -m 15 -o /tmp/iett-check.txt -w 'HTTP %{http_code} in %{time_total}s from %{local_ip}\n' -X POST "$url" \
    -H 'Content-Type: text/xml; charset=utf-8' -H "SOAPAction: \"http://tempuri.org/$op\"" --data "$body" || true
  head -c 400 /tmp/iett-check.txt 2>/dev/null; echo
  echo "--- İETT from live container"
  sleep 5
  docker compose -f infra/docker-compose.yml exec -T live node -e '
    const op = "GetHatOtoKonum_json"
    fetch("'"$url"'", { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"http://tempuri.org/${op}"` },
      body: process.argv[1], signal: AbortSignal.timeout(15000) })
      .then(async (r) => console.log("HTTP", r.status, (await r.text()).slice(0, 400)))
      .catch((e) => console.log("ERR", e?.message, e?.cause?.code ?? "", e?.cause?.message ?? ""))
  ' "$body" || true
  echo "--- live service"
  curl -sS -m 20 'http://127.0.0.1:8081/live/vehicles?line=500T' | head -c 300; echo
  docker compose -f infra/docker-compose.yml logs --tail 20 live 2>&1 | tail -20
}

main() {
  cd /opt/gitgel
  # The deploy key may only run this script; SSH_ORIGINAL_COMMAND picks the action.
  case "${SSH_ORIGINAL_COMMAND:-deploy}" in
    deploy) ;;
    update-data) git pull --quiet --ff-only origin main; exec bash infra/motis/update-data.sh ;;
    *) echo "unknown command: $SSH_ORIGINAL_COMMAND" >&2; exit 2 ;;
  esac
  git fetch --quiet origin main
  git reset --quiet --hard origin/main
  # cloudflared joins once infra/.env (not in git) holds TUNNEL_TOKEN.
  if grep -qs '^TUNNEL_TOKEN=.' infra/.env; then export COMPOSE_PROFILES=tunnel; fi
  if [ -f infra/docker-compose.yml ]; then
    docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
    docker compose -f infra/docker-compose.yml ps
  else
    echo "no infra/docker-compose.yml yet"
  fi
  # First deploy: no routing data yet, build it in the background.
  if [ ! -e /opt/gitgel-data/motis/current ] || [ -z "$(ls -A /opt/gitgel-data/motis/current 2>/dev/null)" ]; then
    nohup bash infra/motis/update-data.sh > /opt/gitgel-data/motis/update.log 2>&1 &
    echo "started first MOTIS import (log: /opt/gitgel-data/motis/update.log)"
  fi
  check_sources || true
  echo "deployed $(git rev-parse --short HEAD)"
}
main "$@"
exit
