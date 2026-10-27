#!/usr/bin/env bash
# Called over SSH by .github/workflows/deploy-server.yml (forced command of the deploy key).
# Wrapped in main() so bash parses the whole file before git replaces it.
set -euo pipefail
# Prints the live service's view of İETT and its recent log (which names why a source failed), and
# Photon's state. It never calls İETT directly: the İBB gateway quota is tight. Never fails the deploy.
check_sources() {
  sleep 5
  echo "--- live service"
  curl -sS -m 20 'http://127.0.0.1:8081/live/vehicles?line=500T' | head -c 300; echo
  docker compose -f infra/docker-compose.yml logs --tail 20 live 2>&1 | tail -20
  echo "--- photon"
  ls -la /opt/gitgel-data/photon/ 2>&1 | tail -8
  ls -la /opt/gitgel-data/photon/current/ 2>&1 | head -8
  df -h / /opt 2>&1 | tail -2
  free -m | head -2
  tail -5 /opt/gitgel-data/photon-update.log 2>/dev/null
  docker compose -f infra/docker-compose.yml logs --tail 6 photon 2>&1 | cut -c1-300
}

setup_admin() {
  local logins="$1"
  if [ -n "$logins" ]; then
    if ! [[ "$logins" =~ ^[A-Za-z0-9._%+@,-]+$ ]]; then echo "admin: ignoring malformed ADMIN_LOGINS"; return 0; fi
    touch infra/.env
    if grep -qs '^ADMIN_LOGINS=' infra/.env; then
      sed -i "s|^ADMIN_LOGINS=.*|ADMIN_LOGINS=$logins|" infra/.env
    else
      echo "ADMIN_LOGINS=$logins" >> infra/.env
    fi
  fi
  if command -v tailscale > /dev/null; then
    sudo -n tailscale serve --bg --https=8443 http://127.0.0.1:8082 > /dev/null 2>&1 || echo "admin: tailscale serve failed"
    echo "admin: $(tailscale serve status 2>&1 | grep -m1 ':8443' || echo 'not served')"
  fi
  echo "admin: $(grep -c '^ADMIN_LOGINS=.' infra/.env 2>/dev/null || echo 0) login line(s) set"
}

# İBB answers Turkish addresses only: its requests go through a relay on Görkem's always-on Mac in the tailnet
# (infra/ibb-relay.mjs). The Mac's tailnet address is looked up by its device name, so no address lives in git.
setup_ibb_relay() {
  local name="${IBB_RELAY_DEVICE:-mac-macbook-pro}" ip=""
  command -v tailscale > /dev/null || return 0
  ip=$(tailscale ip -4 "$name" 2>/dev/null || sudo -n tailscale ip -4 "$name" 2>/dev/null || true)
  ip=$(printf '%s' "$ip" | head -n1 | tr -d '[:space:]')
  if ! [[ "$ip" =~ ^100\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo "ibb relay: device '$name' not found in the tailnet"; return 0; fi
  touch infra/.env
  if grep -qs '^IBB_RELAY=' infra/.env; then
    sed -i "s|^IBB_RELAY=.*|IBB_RELAY=http://$ip:8888|" infra/.env
  else
    echo "IBB_RELAY=http://$ip:8888" >> infra/.env
  fi
  echo "ibb relay: $(curl -sS -m 5 "http://$ip:8888/health" 2>&1 | head -c 80)"
}

main() {
  cd /opt/gitgel
  # The deploy key may only run this script; SSH_ORIGINAL_COMMAND picks the action.
  local admin_logins=""
  case "${SSH_ORIGINAL_COMMAND:-deploy}" in
    deploy) ;;
    "deploy "*) admin_logins="${SSH_ORIGINAL_COMMAND#deploy }" ;;
    update-data) git pull --quiet --ff-only origin main; exec bash infra/motis/update-data.sh ;;
    *) echo "unknown command: $SSH_ORIGINAL_COMMAND" >&2; exit 2 ;;
  esac
  git fetch --quiet origin main
  git reset --quiet --hard origin/main
  setup_admin "$admin_logins" || true
  setup_ibb_relay || true
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
  # No place search index yet (or a failed first import): build it in the background.
  if [ ! -d /opt/gitgel-data/photon/current/photon_data ] && ! pgrep -f "update-data.sh photon" > /dev/null; then
    nohup bash infra/motis/update-data.sh photon > /opt/gitgel-data/photon-update.log 2>&1 &
    echo "started Photon import (log: /opt/gitgel-data/photon-update.log)"
  fi
  check_sources || true
  echo "deployed $(git rev-parse --short HEAD)"
}
main "$@"
exit
