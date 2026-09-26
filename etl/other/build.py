"""GTFS for lines without an API: Marmaray, M11, T2, F2 (manual YAML + OSM),
and ferries (last published İBB multi-operator GTFS, re-dated).

Usage: python -m other.build [--out DIR] [--osm PBF] [--date YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from common.geo import haversine_m, load_route_lines, project, shape_for_stops
from rail.build import hms, norm, text_color, write

ETL = Path(__file__).resolve().parent.parent
MANUAL = Path(__file__).resolve().parent / "manual"
VALID_DAYS = 60
STALE_DAYS = 180

OLD_GTFS = "https://data.ibb.gov.tr/dataset/121a9892-7945-419a-9b89-49f6083926df/resource/"
OLD_FILES = {
    "agency": "42ae499d-ae9c-4906-ac5c-96e0c155e00b/download/agency.csv",
    "calendar": "c84ca913-29ac-4f15-87cd-076aef3dccd6/download/calendar.csv",
    "frequencies": "a4c86ce6-64da-41e2-9584-5d83b5fb895c/download/frequencies.csv",
    "routes": "36b554c7-cae0-4b7e-978f-fc6a43664e88/download/routes.csv",
    "stop_times": "ac646b83-3b6f-4ca2-afb4-9071ab44d9af/download/stop_times.csv",
    "stops": "d1f7c258-bbc1-406f-9ab2-7a7c1797c673/download/stops.csv",
    "trips": "dcee1700-e59f-4a5f-8009-f602045a4507/download/trips.csv",
}
FERRY_AGENCIES = {"6": "sehir_hatlari", "48": "turyol", "33": "dentur", "20": "ido"}


def minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def departures(periods: list[dict]) -> list[int]:
    out = []
    for p in periods:
        m, end = minutes(p["start"]), minutes(p["end"])
        while m <= end:
            out.append(m)
            m += p["headway"]
    return sorted(set(out))


def find_stop(name: str, stops: list[dict]) -> int:
    n = norm(name)
    for i, s in enumerate(stops):
        if norm(s["name"]) == n:
            return i
    for i, s in enumerate(stops):
        if n in norm(s["name"]) or norm(s["name"]) in n:
            return i
    raise ValueError(f"stop {name!r} not in {[s['name'] for s in stops]}")


def build_manual(cfg: dict, rel: dict, today: dt.date, warnings: list[str]) -> dict[str, list[dict]]:
    lid = cfg["id"]
    if (today - dt.date.fromisoformat(str(cfg["checked"]))).days > STALE_DAYS:
        warnings.append(f"{lid}: timetable last checked {cfg['checked']}, verify sources")
    line = rel["line"]
    if cfg.get("line_end_stops"):
        a, b = cfg["line_end_stops"]
        stops = [{"name": a, "lat": line[0][0], "lon": line[0][1]},
                 {"name": b, "lat": line[-1][0], "lon": line[-1][1]}]
    else:
        stops, seen = [], set()
        for s in rel["stops"]:
            if s["name"] and norm(s["name"]) not in seen:
                seen.add(norm(s["name"]))
                stops.append(s)
    along = np.array([project(line, (s["lat"], s["lon"]))[0] for s in stops])
    if along[-1] < along[0]:
        along = along.max() - along
    route_id = f"oth_{lid}"
    out = {"routes": [{"route_id": route_id, "agency_id": cfg["agency"]["agency_id"], **cfg["route"],
                       "route_text_color": text_color(cfg["route"]["route_color"])}],
           "stops": [], "trips": [], "stop_times": [], "shapes": [], "agency": [cfg["agency"]]}
    sid = [f"oth_{lid}_{norm(s['name']).lower()}" for s in stops]
    out["stops"] = [{"stop_id": i, "stop_name": s["name"], "stop_lat": round(s["lat"], 7),
                     "stop_lon": round(s["lon"], 7)} for i, s in zip(sid, stops)]
    full_len = abs(along[-1] - along[0]) or 1

    for pi, p in enumerate(cfg["patterns"]):
        ia, ib = find_stop(p["from"], stops), find_stop(p["to"], stops)
        span = abs(along[ib] - along[ia]) or 1
        run = p.get("minutes") or cfg["line_minutes"] * span / full_len
        for di, (i0, i1, periods) in enumerate([(ia, ib, p["periods"]),
                                                (ib, ia, p.get("reverse_periods", p["periods"]))]):
            idx = list(range(i0, i1 + 1)) if i0 < i1 else list(range(i0, i1 - 1, -1))
            offs = [abs(along[i] - along[i0]) / span * run * 60 for i in idx]
            shape_id = f"{route_id}_{pi}_{di}"
            geom = shape_for_stops([line], [(stops[i]["lat"], stops[i]["lon"]) for i in idx], max_offset_m=600)
            out["shapes"] += [{"shape_id": shape_id, "shape_pt_lat": round(x[0], 6), "shape_pt_lon": round(x[1], 6),
                               "shape_pt_sequence": k} for k, x in enumerate(geom)]
            for m in departures(periods):
                tid = f"{shape_id}_{m:04d}"
                out["trips"].append({"route_id": route_id, "service_id": "oth_daily", "trip_id": tid,
                                     "trip_headsign": stops[i1]["name"], "direction_id": di, "shape_id": shape_id})
                out["stop_times"] += [{"trip_id": tid, "arrival_time": hms(m * 60 + o), "departure_time": hms(m * 60 + o),
                                       "stop_id": sid[i], "stop_sequence": k + 1} for k, (i, o) in enumerate(zip(idx, offs))]
    return out


def fetch_old(cache: Path) -> dict[str, pd.DataFrame]:
    import requests
    cache.mkdir(parents=True, exist_ok=True)
    frames = {}
    for name, path in OLD_FILES.items():
        f = cache / f"{name}.csv"
        if not f.exists():
            r = requests.get(OLD_GTFS + path, timeout=300)
            r.raise_for_status()
            f.write_bytes(r.content)
        raw = f.read_bytes()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("cp1254")
        frames[name] = pd.read_csv(io.StringIO(text), dtype=str)
    return frames


def build_ferries(today: dt.date) -> dict[str, list[dict]]:
    g = fetch_old(ETL / "cache" / "old_gtfs")
    routes = g["routes"][g["routes"]["agency_id"].isin(FERRY_AGENCIES)].copy()
    trips = g["trips"][g["trips"]["route_id"].isin(routes["route_id"])].copy()
    st = g["stop_times"][g["stop_times"]["trip_id"].isin(trips["trip_id"])].copy()
    stops = g["stops"][g["stops"]["stop_id"].isin(st["stop_id"])].copy()
    freq = g["frequencies"][g["frequencies"]["trip_id"].isin(trips["trip_id"])].copy()
    cal = g["calendar"][g["calendar"]["service_id"].isin(trips["service_id"])].drop_duplicates("service_id").copy()

    p = lambda s: "fer_" + s.astype(str)  # noqa: E731
    routes["route_id"] = p(routes["route_id"])
    routes["agency_id"] = routes["agency_id"].map(FERRY_AGENCIES)
    routes["route_type"] = "4"
    trips["route_id"], trips["trip_id"], trips["service_id"] = p(trips["route_id"]), p(trips["trip_id"]), p(trips["service_id"])
    st["trip_id"], st["stop_id"] = p(st["trip_id"]), p(st["stop_id"])
    stops["stop_id"] = p(stops["stop_id"])
    if "parent_station" in stops:
        stops["parent_station"] = stops["parent_station"].where(stops["parent_station"].isna(), p(stops["parent_station"].fillna("")))
    freq["trip_id"] = p(freq["trip_id"])
    cal["service_id"] = p(cal["service_id"])
    cal["start_date"] = today.strftime("%Y%m%d")
    cal["end_date"] = (today + dt.timedelta(days=VALID_DAYS)).strftime("%Y%m%d")
    old_ag = g["agency"][g["agency"]["agency_id"].isin(FERRY_AGENCIES)].copy()
    old_ag["agency_id"] = old_ag["agency_id"].map(FERRY_AGENCIES)

    keep = lambda df, cols: df[[c for c in cols if c in df.columns]].fillna("").to_dict("records")  # noqa: E731
    return {
        "agency": keep(old_ag, ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"]),
        "routes": keep(routes, ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"]),
        "trips": keep(trips, ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"]),
        "stop_times": keep(st, ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"]),
        "stops": keep(stops, ["stop_id", "stop_name", "stop_lat", "stop_lon"]),
        "frequencies": keep(freq, ["trip_id", "start_time", "end_time", "headway_secs", "exact_times"]),
        "calendar": keep(cal, ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday",
                               "saturday", "sunday", "start_date", "end_date"]),
    }


def build(out: Path, osm: Path, today: dt.date) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    rels = {r["id"]: r for r in load_route_lines(osm, {"train", "subway", "tram", "light_rail", "funicular"})}
    tables: dict[str, list[dict]] = {k: [] for k in
                                      ["agency", "routes", "stops", "trips", "stop_times", "shapes", "calendar", "frequencies"]}
    warnings: list[str] = []
    for f in sorted(MANUAL.glob("*.yaml")):
        cfg = yaml.safe_load(f.read_text())
        rel = rels.get(cfg["osm_relation"])
        if rel is None:
            warnings.append(f"{cfg['id']}: OSM relation {cfg['osm_relation']} not found, line skipped")
            continue
        for k, v in build_manual(cfg, rel, today, warnings).items():
            tables[k] += v
    tables["calendar"].append({"service_id": "oth_daily", "monday": 1, "tuesday": 1, "wednesday": 1, "thursday": 1,
                               "friday": 1, "saturday": 1, "sunday": 1, "start_date": today.strftime("%Y%m%d"),
                               "end_date": (today + dt.timedelta(days=VALID_DAYS)).strftime("%Y%m%d")})
    for k, v in build_ferries(today).items():
        tables[k] += v
    # Agencies: one row per id, GTFS requires timezone.
    ag = {}
    for a in tables["agency"]:
        ag.setdefault(a["agency_id"], {"agency_timezone": "Europe/Istanbul", "agency_lang": "tr", **a})
    tables["agency"] = list(ag.values())
    for k, v in tables.items():
        write(out / f"{k}.txt", v)
    for w in warnings:
        print("WARNING:", w, file=sys.stderr)
    return {k: len(v) for k, v in tables.items()} | {"warnings": len(warnings)}


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ETL / "out" / "other")
    ap.add_argument("--osm", type=Path, default=ETL / "cache" / "osm" / "marmara.osm.pbf")
    ap.add_argument("--date", type=dt.date.fromisoformat, default=None)
    a = ap.parse_args(argv)
    today = a.date or dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date()
    for k, v in build(a.out, a.osm, today).items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
