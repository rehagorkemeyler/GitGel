#!/usr/bin/env bash
# Called over SSH by .github/workflows/deploy-server.yml (forced command of the deploy key).
# Wrapped in main() so bash parses the whole file before git replaces it.
set -euo pipefail
main() {
  cd /opt/gitgel
  git fetch --quiet origin main
  git reset --quiet --hard origin/main
  if [ -f infra/docker-compose.yml ]; then
    docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
    docker compose -f infra/docker-compose.yml ps
  else
    echo "no infra/docker-compose.yml yet"
  fi
  echo "deployed $(git rev-parse --short HEAD)"
}
main "$@"
exit
