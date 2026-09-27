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
  # Mapping quirks that abort the MOTIS street import (ways leaving the regional
  # download, a plaza of 38 area slices around one node) are removed first.
  for c in istanbul ankara; do
    python3 "$repo/infra/motis/clean-osm.py" "$base/input/$c.osm.pbf" "$base/input/$c.clean.osm.pbf"
  done
  # MOTIS reads one OSM file: both cities in one.
  osmium merge --overwrite "$base/input/istanbul.clean.osm.pbf" "$base/input/ankara.clean.osm.pbf" -o "$base/input/cities.osm.pbf"

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
  update_photon
}

# Place search index (Photon): the weekly Turkey dump, imported into a fresh folder, then switched.
update_photon() {
  local base=/opt/gitgel-data/photon
  local image=ghcr.io/rtuszik/photon-docker@sha256:21549c60f9e6488fff3217e40429a652c4b445f374800333fe32859e47cec293
  mkdir -p "$base"
  if [ -L "$base/current" ] && [ -z "$(find -L "$base/current" -maxdepth 0 -mtime +6)" ]; then return; fi
  local new="$base/build-$(date +%Y%m%d%H%M)"
  mkdir -p "$new" && chmod a+rwx "$new"
  curl -fsSL --retry 5 -o "$base/turkey.jsonl.zst" \
    https://download1.graphhopper.com/public/europe/turkey/photon-dump-turkey-1.0-latest.jsonl.zst || return 0
  # Decompress inside the image (its Python has zstandard): nothing extra on the server.
  docker run --rm -v "$new:/data" -v "$base/turkey.jsonl.zst:/in.zst:ro" --entrypoint sh "$image" -c \
    'python -c "import sys, zstandard; zstandard.ZstdDecompressor().copy_stream(open(\"/in.zst\", \"rb\"), sys.stdout.buffer)" \
     | java -Xmx3g -jar /photon/photon.jar import -import-file - -data-dir /data -languages tr,en' \
    || { rm -rf "$new"; return 0; }
  [ -L "$base/current" ] || rm -rf "$base/current"
  ln -sfn "$new" "$base/current.new" && mv -T "$base/current.new" "$base/current"
  docker compose -f /opt/gitgel/infra/docker-compose.yml up -d --force-recreate photon
  for old in $(ls -1dt "$base"/build-* | tail -n +3); do
    rm -rf "$old" 2>/dev/null || docker run --rm --user 0 -v "$base:/b" --entrypoint rm "$image" -rf "/b/$(basename "$old")" || true
  done
  echo "photon data updated: $new"
}
main "$@"
exit
