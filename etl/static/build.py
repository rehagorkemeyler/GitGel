"""Small JSON files the app loads directly from GitHub Pages.

Output (out/static/):
  lines.json          all lines: id, name, long name, mode, colour, agency
  stops.json          every stop/station: id, name, lat, lon, mode, line ids
  search.json         compact search index: [name, normalized name, lat, lon, mode, line names]
  lines/<id>.json     one line: stops per direction, first/last departures per day type
  meta.json           build date and counts

Usage: python -m static.build [--gtfs ZIP] [--out DIR]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import unicodedata
import zipfile
from pathlib import Path

import pandas as pd

from common.text import title_tr

ETL = Path(__file__).resolve().parent.parent
MODES = {0: "tram", 1: "metro", 2: "rail", 3: "bus", 4: "ferry", 6: "cablecar", 7: "funicular"}
# Metrobüs is a bus route in GTFS, but the app shows it as its own mode.
METROBUS = {"34", "34A", "34AS", "34B", "34BZ", "34C", "34G", "34Z"}
MODE_RANK = {"metro": 0, "rail": 1, "tram": 2, "funicular": 3, "cablecar": 4, "metrobus": 5, "ferry": 6, "bus": 7}


def fold(s: str) -> str:
    """Lowercase ASCII fold for Turkish text: 'Kadıköy İDO' -> 'kadikoy ido'."""
    s = s.replace("ı", "i").replace("İ", "i").replace("I", "i")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-") or "x"


def read(z: zipfile.ZipFile, name: str, **kw) -> pd.DataFrame:
    if name not in z.namelist():
        return pd.DataFrame()
    with z.open(name) as f:
        return pd.read_csv(f, dtype=str, keep_default_na=False, **kw)


def hhmm(t: str) -> str:
    h, m = int(t[:2]), int(t[3:5])
    return f"{h % 24:02d}:{m:02d}"


def build(gtfs: Path, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    (out / "lines").mkdir(exist_ok=True)
    z = zipfile.ZipFile(gtfs)
    routes = read(z, "routes.txt")
    trips = read(z, "trips.txt")
    stops = read(z, "stops.txt")
    cal = read(z, "calendar.txt")
    st = read(z, "stop_times.txt", usecols=["trip_id", "stop_id", "stop_sequence", "departure_time"])
    st["stop_sequence"] = st["stop_sequence"].astype(int)

    routes["mode"] = routes["route_type"].astype(int).map(MODES).fillna("bus")
    routes.loc[routes["route_short_name"].isin(METROBUS) & (routes["mode"] == "bus"), "mode"] = "metrobus"
    # One app line per (agency, short name); İETT has many route variants per line.
    routes["line_id"] = [
        slug(sn or ln) if mode != "ferry" else f"{ag}-{slug(sn or ln)}"
        for sn, ln, ag, mode in zip(routes["route_short_name"], routes["route_long_name"], routes["agency_id"], routes["mode"])]
    # Same short name from two agencies (e.g. a bus called like a rail line): prefix the agency.
    # Rail keeps the plain id, the bus gets "bus-".
    clash = routes.groupby("line_id")["agency_id"].transform("nunique") > 1
    bus = routes["mode"].isin(["bus", "metrobus"])
    routes.loc[clash & bus, "line_id"] = "bus-" + routes.loc[clash & bus, "line_id"]
    trips = trips.merge(routes[["route_id", "line_id"]], on="route_id")

    # Day type per service.
    day_type = {}
    for _, c in cal.iterrows():
        if c["monday"] == "1" or c["tuesday"] == "1":
            day_type.setdefault(c["service_id"], []).append("weekday")
        if c["saturday"] == "1":
            day_type.setdefault(c["service_id"], []).append("saturday")
        if c["sunday"] == "1":
            day_type.setdefault(c["service_id"], []).append("sunday")

    firsts = st[st["stop_sequence"] == st.groupby("trip_id")["stop_sequence"].transform("min")]
    firsts = firsts.merge(trips[["trip_id", "line_id", "service_id", "direction_id"]], on="trip_id")
    counts = st.groupby("trip_id").size().rename("n").reset_index()
    rep = counts.merge(trips[["trip_id", "line_id", "direction_id"]], on="trip_id")
    rep = rep.sort_values("n", ascending=False).drop_duplicates(["line_id", "direction_id"])
    rep_st = st[st["trip_id"].isin(rep["trip_id"])].sort_values(["trip_id", "stop_sequence"])

    stop_name = dict(zip(stops["stop_id"], stops["stop_name"].map(title_tr)))
    lines_out = []
    line_stops: dict[str, set[str]] = {}
    for line_id, g in routes.groupby("line_id", sort=False):
        r0 = g.iloc[0]
        mode = min(g["mode"], key=lambda m: MODE_RANK.get(m, 9))
        dirs = []
        for _, rt in rep[rep["line_id"] == line_id].sort_values("direction_id").iterrows():
            rows = rep_st[rep_st["trip_id"] == rt["trip_id"]]
            ids = list(rows["stop_id"])
            secs = [service_minutes(t) * 60 + int(t[6:8]) if t else None for t in rows["departure_time"]]
            offsets = [round((x - secs[0]) / 60) if x is not None and secs[0] is not None else None for x in secs]
            line_stops.setdefault(line_id, set()).update(ids)
            fd = firsts[(firsts["line_id"] == line_id) & (firsts["direction_id"] == rt["direction_id"])]
            times = {}
            night = set()
            for svc, sg in fd.groupby("service_id"):
                deps = sorted(sg["departure_time"], key=service_minutes)
                # First trip of the day: earliest from 05:00. Trips between 02:30 and
                # 05:00 mean the line runs all night (weekend night metro).
                day = [x for x in deps if service_minutes(x) >= 5 * 60] or deps
                all_night = any(150 <= service_minutes(x) % (24 * 60) < 300 for x in deps)
                for d in day_type.get(svc, []):
                    cur = times.get(d)
                    times[d] = [min(day[0], cur[0], key=service_minutes) if cur else day[0],
                                max(deps[-1], cur[1], key=service_minutes) if cur else deps[-1]]
                    if all_night:
                        night.add(d)
            dirs.append({"headsign": title_tr(stop_name.get(ids[-1], "")) if ids else "",
                         "stops": ids,
                         "offsets": offsets,
                         "first_last": {d: [hhmm(a), "night" if d in night else hhmm(b)] for d, (a, b) in times.items()}})
        item = {"id": line_id, "name": r0["route_short_name"], "long_name": title_tr(r0["route_long_name"]),
                "mode": mode, "color": r0.get("route_color", "") or "", "text_color": r0.get("route_text_color", "") or "",
                "agency": r0["agency_id"]}
        lines_out.append(item)
        (out / "lines" / f"{line_id}.json").write_text(
            json.dumps({**item, "directions": dirs}, ensure_ascii=False, separators=(",", ":")))

    lines_out.sort(key=lambda l: (MODE_RANK.get(l["mode"], 9), natural(l["name"])))
    by_id = {l["id"]: l for l in lines_out}
    stop_lines: dict[str, list[str]] = {}
    for lid, ids in line_stops.items():
        for s in ids:
            stop_lines.setdefault(s, []).append(lid)

    stops_out, search = [], []
    places: dict[str, list[list]] = {}
    for _, s in stops.iterrows():
        lids = sorted(stop_lines.get(s["stop_id"], []), key=lambda l: (MODE_RANK.get(by_id[l]["mode"], 9), natural(by_id[l]["name"])))
        if not lids:
            continue
        mode = by_id[lids[0]]["mode"]
        name = title_tr(s["stop_name"])
        lat, lon = round(float(s["stop_lat"]), 6), round(float(s["stop_lon"]), 6)
        stops_out.append({"id": s["stop_id"], "name": name, "lat": lat, "lon": lon, "mode": mode, "lines": lids})
        # Search: one entry per place; merge same-name stops within ~400 m
        # (bus stops on both sides of a road, station entrances).
        key = fold(name)
        for e in places.setdefault(key, []):
            if abs(e[2] - lat) < 0.004 and abs(e[3] - lon) < 0.005:
                if MODE_RANK.get(mode, 9) < MODE_RANK.get(e[4], 9):
                    e[4] = mode
                e[5] += [l for l in lids if l not in e[5]]
                break
        else:
            e = [name, key, lat, lon, mode, list(lids)]
            places[key].append(e)
            search.append(e)
    # Rail first in the chips, then by line name; store short names.
    for e in search:
        e[5] = [by_id[l]["name"] for l in sorted(set(e[5]), key=lambda l: (MODE_RANK.get(by_id[l]["mode"], 9), natural(by_id[l]["name"])))][:8]
    # Stations first, then by name, so prefix matches favour rail.
    search.sort(key=lambda x: (MODE_RANK.get(x[4], 9), x[1]))

    dump = lambda p, o: (out / p).write_text(json.dumps(o, ensure_ascii=False, separators=(",", ":")))  # noqa: E731
    dump("lines.json", lines_out)
    dump("stops.json", stops_out)
    dump("search.json", search)
    dump("stations.json", merge_stations(stops_out, by_id))
    dump("network.geojson", network(z, routes, trips, rep, rep_st, stops))
    meta = {"built": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "lines": len(lines_out), "stops": len(stops_out)}
    dump("meta.json", meta)
    return meta


def service_minutes(t: str) -> int:
    """HH:MM[:SS] as minutes into a service day that starts at 04:00."""
    m = int(t[:2]) * 60 + int(t[3:5])
    return m + 24 * 60 if m < 4 * 60 else m


RAIL = {"metro", "rail", "tram", "funicular", "cablecar"}
STATION_MODES = RAIL | {"ferry", "metrobus"}


def merge_stations(stops_out: list[dict], by_id: dict) -> list[dict]:
    """One map marker per station: platforms of the same name within ~400 m merge.

    Output rows: {id, ids, name, lat, lon, mode, lines} where `id` is a stop id the
    router knows (MOTIS groups nearby platforms when asked for departures).
    """
    out: list[dict] = []
    index: dict[str, list[dict]] = {}
    for s in sorted(stops_out, key=lambda x: MODE_RANK.get(x["mode"], 9)):
        if s["mode"] not in STATION_MODES:
            continue
        key = fold(s["name"]).replace(" marmaray", "").replace(" metro", "")
        hit = next((e for e in index.get(key, []) if abs(e["lat"] - s["lat"]) < 0.004 and abs(e["lon"] - s["lon"]) < 0.005), None)
        if hit:
            hit["ids"].append(s["id"])
            hit["lines"] += [l for l in s["lines"] if l not in hit["lines"]]
            continue
        e = {"id": s["id"], "ids": [s["id"]], "name": s["name"], "lat": s["lat"], "lon": s["lon"], "mode": s["mode"],
             "lines": list(s["lines"])}
        index.setdefault(key, []).append(e)
        out.append(e)
    for e in out:
        e["lines"] = sorted(e["lines"], key=lambda l: (MODE_RANK.get(by_id[l]["mode"], 9), natural(by_id[l]["name"])))
    return out


def network(z: zipfile.ZipFile, routes: pd.DataFrame, trips: pd.DataFrame, rep: pd.DataFrame,
            rep_st: pd.DataFrame, stops: pd.DataFrame) -> dict:
    """Rail, tram, funicular, cable car lines from GTFS shapes; ferries as stop-to-stop lines."""
    shapes = read(z, "shapes.txt")
    feats = []
    line_of_route = dict(zip(routes["route_id"], routes["line_id"]))
    info = {r["line_id"]: r for _, r in routes.iterrows()}
    rail_routes = set(routes.loc[routes["mode"].isin(RAIL), "route_id"])
    if len(shapes) and "shape_id" in trips:
        used = trips[trips["route_id"].isin(rail_routes) & (trips["shape_id"] != "")].drop_duplicates("shape_id")
        shapes["shape_pt_sequence"] = shapes["shape_pt_sequence"].astype(int)
        by_shape = {k: g.sort_values("shape_pt_sequence") for k, g in shapes[shapes["shape_id"].isin(used["shape_id"])].groupby("shape_id")}
        seen = set()
        for _, t in used.iterrows():
            g = by_shape.get(t["shape_id"])
            if g is None:
                continue
            coords = [[round(float(x), 5), round(float(y), 5)] for x, y in zip(g["shape_pt_lon"], g["shape_pt_lat"])]
            key = (line_of_route[t["route_id"]], tuple(map(tuple, sorted([coords[0], coords[-1]]))))
            if key in seen:  # the other direction of the same track
                continue
            seen.add(key)
            feats.append(_feature(info[line_of_route[t["route_id"]]], coords))
    pos = {r["stop_id"]: [round(float(r["stop_lon"]), 5), round(float(r["stop_lat"]), 5)] for _, r in stops.iterrows()}
    ferry_lines = set(routes.loc[routes["mode"] == "ferry", "line_id"])
    # Ferries have no shapes: draw each pier-to-pier hop once, whatever line uses it.
    hops = set()
    for _, rt in rep[rep["line_id"].isin(ferry_lines)].iterrows():
        coords = [pos[s] for s in rep_st.loc[rep_st["trip_id"] == rt["trip_id"], "stop_id"] if s in pos]
        for a_, b_ in zip(coords, coords[1:]):
            key = tuple(sorted([tuple(a_), tuple(b_)]))
            if a_ != b_ and key not in hops:
                hops.add(key)
                feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [a_, b_]},
                              "properties": {"line": "", "name": "", "mode": "ferry", "color": "#4a90b8"}})
    return {"type": "FeatureCollection", "features": feats}


def _feature(r, coords) -> dict:
    return {"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"line": r["line_id"], "name": r["route_short_name"], "mode": r["mode"],
                           "color": "#" + (r.get("route_color") or "5a6b7b")}}


def natural(s: str):
    return [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", s or "")]


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtfs", type=Path, default=ETL / "out" / "istanbul-gtfs.zip")
    ap.add_argument("--out", type=Path, default=ETL / "out" / "static")
    a = ap.parse_args(argv)
    for k, v in build(a.gtfs, a.out).items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
