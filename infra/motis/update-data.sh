#!/usr/bin/env bash
# Download the newest GTFS (nightly ETL release) and OSM, import them into a
# fresh MOTIS data folder, then switch the running server to it.
# Run on the server: bash /opt/gitgel/infra/motis/update-data.sh
set -euo pipefail
main() {
  local base=/opt/gitgel-data/motis
  local repo=/opt/gitgel
  local image=ghcr.io/motis-project/motis:2.11.3
  local new="$base/build-$(date +%Y%m%d%H%M)"
  mkdir -p "$base/input" "$new"

  curl -fsSL --retry 5 -o "$base/input/istanbul-gtfs.zip" \
    https://github.com/rehagorkemeyler/GitGel/releases/download/data-latest/istanbul-gtfs.zip
  # OSM changes slowly: refresh at most once a week.
  if [ ! -f "$base/input/istanbul.osm.pbf" ] || [ -n "$(find "$base/input/istanbul.osm.pbf" -mtime +6)" ]; then
    curl -fsSL --retry 5 -o "$base/input/marmara.osm.pbf" \
      https://download.openstreetmap.fr/extracts/europe/turkey/marmara-latest.osm.pbf
    osmium extract -b 27.95,40.75,29.95,41.60 --strategy complete_ways --overwrite \
      "$base/input/marmara.osm.pbf" -o "$base/input/istanbul.osm.pbf"
  fi

  cp "$base/input/istanbul-gtfs.zip" "$base/input/istanbul.osm.pbf" "$repo/infra/motis/config.yml" "$new/"
  chmod -R a+rwX "$new"
  # Run as the server user so old builds can be deleted later without root.
  docker run --rm --user "$(id -u):$(id -g)" -v "$new:/work" -w /work "$image" /motis import -c config.yml -d data

  # docker creates an empty dir at "current" if motis starts before the first import.
  [ -L "$base/current" ] || rm -rf "$base/current"
  ln -sfn "$new/data" "$base/current.new" && mv -T "$base/current.new" "$base/current"
  docker compose -f "$repo/infra/docker-compose.yml" up -d --force-recreate motis
  # Keep the two newest builds. Older ones may be owned by the container user: delete them through Docker.
  for old in $(ls -1dt "$base"/build-* | tail -n +3); do
    rm -rf "$old" 2>/dev/null || docker run --rm --user 0 -v "$base:/b" --entrypoint rm "$image" -rf "/b/$(basename "$old")" || true
  done
  echo "motis data updated: $new"
}
main "$@"
exit
