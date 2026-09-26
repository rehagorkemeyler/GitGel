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

  local rel=https://github.com/rehagorkemeyler/GitGel/releases/download/data-latest
  curl -fsSL --retry 5 -o "$base/input/istanbul-gtfs.zip" "$rel/istanbul-gtfs.zip"
  # Ankara is optional: a failed download keeps the last copy; none at all skips Ankara.
  curl -fsSL --retry 5 -o "$base/input/ankara-gtfs.zip.part" "$rel/ankara-gtfs.zip" \
    && mv "$base/input/ankara-gtfs.zip.part" "$base/input/ankara-gtfs.zip" \
    || rm -f "$base/input/ankara-gtfs.zip.part"
  # OSM changes slowly: refresh at most once a week.
  if [ ! -f "$base/input/istanbul.osm.pbf" ] || [ -n "$(find "$base/input/istanbul.osm.pbf" -mtime +6)" ]; then
    curl -fsSL --retry 5 -o "$base/input/marmara.osm.pbf" \
      https://download.openstreetmap.fr/extracts/europe/turkey/marmara-latest.osm.pbf
    osmium extract -b 27.95,40.75,29.95,41.60 --strategy complete_ways --overwrite \
      "$base/input/marmara.osm.pbf" -o "$base/input/istanbul.osm.pbf"
  fi
  if [ ! -f "$base/input/ankara.osm.pbf" ] || [ -n "$(find "$base/input/ankara.osm.pbf" -mtime +6)" ]; then
    curl -fsSL --retry 5 -o "$base/input/central_anatolia.osm.pbf" \
      https://download.openstreetmap.fr/extracts/europe/turkey/central_anatolia-latest.osm.pbf
    osmium extract -b 32.20,39.50,33.40,40.30 --strategy complete_ways --overwrite \
      "$base/input/central_anatolia.osm.pbf" -o "$base/input/ankara.osm.pbf"
  fi
  # MOTIS reads one OSM file: both cities in one.
  osmium merge --overwrite "$base/input/istanbul.osm.pbf" "$base/input/ankara.osm.pbf" -o "$base/input/cities.osm.pbf"

  cp "$base/input/istanbul-gtfs.zip" "$base/input/cities.osm.pbf" "$repo/infra/motis/config.yml" "$new/"
  if [ -f "$base/input/ankara-gtfs.zip" ]; then
    cp "$base/input/ankara-gtfs.zip" "$new/"
  else
    sed -i '/# ankara-begin/,/# ankara-end/d' "$new/config.yml"
  fi
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
