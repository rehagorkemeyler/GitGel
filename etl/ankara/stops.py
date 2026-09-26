"""Coordinates for EGO stops from OpenStreetMap.

Bus stops carry the EGO stop number as `ref` in OSM (network=EGO), so they
match by number. Metro and Ankaray stations use EGO codes such as M33 or A7
that OSM does not have, so they match by folded name against railway=station.
Stops that match neither are reported, never guessed.

    python -m ankara.stops   # reads out/ankara/lines.json -> out/ankara/stops.json, unmatched_stops.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from pathlib import Path

from rail.build import norm

ETL = Path(__file__).resolve().parents[1]
OUT = ETL / "out" / "ankara"
BBOX = (39.3, 31.8, 40.6, 33.8)  # lat/lon box, same as the live provider

# Rank of OSM features for the same ref: the waiting place beats the pole on the road.
RANK = {"platform": 0, "bus_stop": 1, "stop_position": 2}


def load_osm(pbf: Path) -> tuple[dict[str, dict], list[dict]]:
    """-> ({ref: stop}, [rail stations]) inside the Ankara box."""
    import osmium

    by_ref: dict[str, dict] = {}
    stations: list[dict] = []

    class H(osmium.SimpleHandler):
        def node(self, n):
            t = n.tags
            loc = n.location
            if not loc.valid() or not (BBOX[0] < loc.lat < BBOX[2] and BBOX[1] < loc.lon < BBOX[3]):
                return
            if t.get("railway") == "station" or (t.get("railway") == "stop" and t.get("public_transport") == "station"):
                stations.append({"name": t.get("name", ""), "lat": loc.lat, "lon": loc.lon, "network": t.get("network", "")})
                return
            kind = t.get("public_transport") if t.get("public_transport") in RANK else t.get("highway")
            ref = (t.get("ref") or "").strip()
            if kind not in RANK or not ref:
                return
            for r in re.split(r"[;,]", ref):
                r = r.strip()
                old = by_ref.get(r)
                if old is None or RANK[kind] < old["rank"]:
                    by_ref[r] = {"lat": loc.lat, "lon": loc.lon, "name": t.get("name", ""), "rank": RANK[kind]}

    H().apply_file(str(pbf))
    return by_ref, stations


STATION_WORDS = re.compile(r"\b(METRO|ANKARAY|ISTASYONU|ISTASYON|GARI)\b")


def station_key(name: str) -> str:
    """'ÇAYYOLU İSTASYONU' and 'Çayyolu' -> 'CAYYOLU'."""
    s = name.replace("ı", "i").replace("İ", "I")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()
    return norm(STATION_WORDS.sub(" ", s))


def match_station(name: str, stations: list[dict]) -> dict | None:
    k = station_key(name)
    if not k:
        return None
    keys = [(station_key(s["name"]), s) for s in stations if s["name"]]
    for sk, s in keys:
        if sk == k:
            return s
    # "15 TEMMUZ KIZILAY MİLLİ İRADE" vs OSM "Kızılay": one name inside the other
    hits = [s for sk, s in keys if sk and (sk in k or k in sk)]
    return max(hits, key=lambda s: len(station_key(s["name"]))) if hits else None


def is_rail_code(stop: str) -> bool:
    return not stop.isdigit()


def build(lines: list[dict], by_ref: dict[str, dict], stations: list[dict]) -> tuple[dict, list[dict]]:
    stops: dict[str, dict] = {}
    unmatched: dict[str, dict] = {}
    for ln in lines:
        for s in ln["stops"]:
            no = s["stop"]
            if no in stops:
                continue
            hit = match_station(s["name"], stations) if is_rail_code(no) else by_ref.get(no)
            if hit:
                stops[no] = {"name": s["name"], "lat": round(hit["lat"], 6), "lon": round(hit["lon"], 6)}
            else:
                u = unmatched.setdefault(no, {"stop": no, "name": s["name"], "address": s.get("address", ""), "lines": []})
                if ln["code"] not in u["lines"]:
                    u["lines"].append(ln["code"])
    for no in stops:
        unmatched.pop(no, None)
    return stops, sorted(unmatched.values(), key=lambda u: -len(u["lines"]))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--osm", type=Path, default=ETL / "cache" / "osm" / "central_anatolia.osm.pbf")
    a = ap.parse_args(argv)
    lines = json.loads((OUT / "lines.json").read_text(encoding="utf-8"))
    by_ref, stations = load_osm(a.osm)
    stops, unmatched = build(lines, by_ref, stations)
    (OUT / "stops.json").write_text(json.dumps(stops, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with (OUT / "unmatched_stops.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["stop", "name", "address", "lines"])
        for u in unmatched:
            w.writerow([u["stop"], u["name"], u["address"], " ".join(u["lines"])])
    total = len(stops) + len(unmatched)
    print(f"ankara stops: {len(stops)}/{total} matched ({100 * len(stops) / max(total, 1):.0f}%), "
          f"{len(unmatched)} unmatched -> out/ankara/unmatched_stops.csv")


if __name__ == "__main__":
    main()
