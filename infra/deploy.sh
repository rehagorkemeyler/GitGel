#!/usr/bin/env bash
# Called over SSH by .github/workflows/deploy-server.yml (forced command of the deploy key).
# Wrapped in main() so bash parses the whole file before git replaces it.
set -euo pipefail
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
  echo "deployed $(git rev-parse --short HEAD)"
}
main "$@"
exit
