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
            ids = list(rep_st.loc[rep_st["trip_id"] == rt["trip_id"], "stop_id"])
            line_stops.setdefault(line_id, set()).update(ids)
            fd = firsts[(firsts["line_id"] == line_id) & (firsts["direction_id"] == rt["direction_id"])]
            times = {}
            for svc, sg in fd.groupby("service_id"):
                # The service day starts at 04:00: earlier times are the previous night.
                deps = sorted(sg["departure_time"], key=service_minutes)
                for d in day_type.get(svc, []):
                    cur = times.get(d)
                    times[d] = [min(deps[0], cur[0], key=service_minutes) if cur else deps[0],
                                max(deps[-1], cur[1], key=service_minutes) if cur else deps[-1]]
            dirs.append({"headsign": title_tr(stop_name.get(ids[-1], "")) if ids else "",
                         "stops": ids,
                         "first_last": {d: [hhmm(a), hhmm(b)] for d, (a, b) in times.items()}})
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
    meta = {"built": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "lines": len(lines_out), "stops": len(stops_out)}
    dump("meta.json", meta)
    return meta


def service_minutes(t: str) -> int:
    """HH:MM[:SS] as minutes into a service day that starts at 04:00."""
    m = int(t[:2]) * 60 + int(t[3:5])
    return m + 24 * 60 if m < 4 * 60 else m


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
