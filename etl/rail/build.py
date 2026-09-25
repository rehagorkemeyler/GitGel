"""Build GTFS for the lines operated by Metro İstanbul from its open API + OSM.

Timetables come from GetTimeTable (departures from each direction's first
station, one call per hour of a representative weekday, Saturday and Sunday).
Station-to-station times come from GetStationBetweenTime where it works, are
scaled to the official one-way trip time written in GetLines ("Sefer Süresi"),
and fall back to distance where the API has gaps.

Usage: python -m rail.build [--out DIR] [--osm PBF] [--date YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import difflib
import html
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from common.geo import haversine_m, load_route_lines, shape_for_stops
from rail.metro_api import MetroApi

ETL = Path(__file__).resolve().parent.parent

# GTFS route_type and OSM route type by line prefix.
ROUTE_TYPES = [("TF", 6, "aerialway"), ("F", 7, "funicular"), ("T", 0, "tram"), ("M", 1, "subway")]
SERVICES = {"wk": (1, 1, 1, 1, 1, 0, 0), "sat": (0, 0, 0, 0, 0, 1, 0), "sun": (0, 0, 0, 0, 0, 0, 1)}
VALID_DAYS = 60


def norm(s: str) -> str:
    s = s.replace("ı", "i").replace("İ", "I")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", s)


def match_station(name: str, stations: list[dict]) -> int:
    """Index of the station best matching a direction endpoint name."""
    n = norm(name)
    keys = [norm(s["Name"]) for s in stations] + [norm(s["Description"]) for s in stations]
    for i, k in enumerate(keys):
        if k == n:
            return i % len(stations)
    for i, k in enumerate(keys):
        if n and (n in k or k in n):
            return i % len(stations)
    best = difflib.get_close_matches(n, keys, n=1, cutoff=0.4)
    if not best:
        raise ValueError(f"no station for {name!r}")
    return keys.index(best[0]) % len(stations)


def trip_minutes(content: str) -> float | None:
    t = html.unescape(re.sub(r"<[^>]+>", " ", content or ""))
    m = re.search(r"Sefer Süresi\s*:?\s*(\d+(?:[.,]\d+)?)", t, re.I)
    return float(m.group(1).replace(",", ".")) if m else None


def route_type(name: str) -> tuple[int, str]:
    for prefix, gtfs, osm in ROUTE_TYPES:
        if name.startswith(prefix):
            return gtfs, osm
    return 1, "subway"


def segment_minutes(stations: list[dict], api_orders: list[list[dict]], total: float | None) -> list[float]:
    """Minutes for each consecutive station pair in line order."""
    ids = [s["Id"] for s in stations]
    lat = np.array([float(s["DetailInfo"]["Latitude"]) for s in stations])
    lon = np.array([float(s["DetailInfo"]["Longitude"]) for s in stations])
    dist = haversine_m(lat[:-1], lon[:-1], lat[1:], lon[1:])

    known: dict[frozenset, float] = {}
    for order in api_orders:
        for a, b in zip(order, order[1:]):
            d = b["Time"] - a["Time"]
            if d > 0:
                known.setdefault(frozenset((a["Id"], b["Id"])), d)
    seg = [known.get(frozenset((a, b))) for a, b in zip(ids, ids[1:])]
    k_dist = sum(d for d, s in zip(dist, seg) if s)
    k_min = sum(s for s in seg if s)
    if total is None:
        total = k_min if k_min else dist.sum() / 1000 / 35 * 60  # 35 km/h
    per_m = (k_min / k_dist) if k_dist else total / max(dist.sum(), 1)
    seg = [s if s else d * per_m for s, d in zip(seg, dist)]
    scale = total / sum(seg) if sum(seg) else 1
    return [max(s * scale, 0.5) for s in seg]


def rep_dates(today: dt.date) -> dict[str, dt.date]:
    """Next Tuesday, Saturday and Sunday strictly after today."""
    def nxt(wd):
        d = today + dt.timedelta(days=1)
        while d.weekday() != wd:
            d += dt.timedelta(days=1)
        return d
    return {"wk": nxt(1), "sat": nxt(5), "sun": nxt(6)}


def fetch_day(api: MetroApi, station_id: int, direction_id: int, day: dt.date,
              pool: ThreadPoolExecutor) -> list[str]:
    def hour(h: int) -> list[str]:
        body = {"BoardingStationId": station_id, "DirectionId": direction_id,
                "DateTime": f"{day.isoformat()}T{h:02d}:00:00"}
        try:
            data = api.call("GetTimeTable", body)
        except RuntimeError:
            return []
        return [t for d in data for t in (d.get("TimeInfos", {}).get("Times") or [])]

    times = [t for part in pool.map(hour, range(24)) for t in part]
    # Each date covers its own 00:00-23:59, so after-midnight departures stay
    # on the date they are listed under (Friday night metro -> Saturday 00:20).
    return sorted(set(times))


def build(out: Path, osm: Path | None, today: dt.date, workers: int = 16) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    api = MetroApi(ETL / "cache" / "rail" / "api" / today.isoformat())
    lines = api.call("GetLines")
    dates = rep_dates(today)

    osm_lines = load_route_lines(osm, {"subway", "tram", "funicular", "aerialway", "light_rail"}) if osm and osm.exists() else []

    pool = ThreadPoolExecutor(workers)
    routes, stops, trips, stop_times, shapes = [], {}, [], [], []
    stats = {"lines": 0, "directions": 0, "directions_without_times": []}

    for line in sorted(lines, key=lambda l: int(l["Order"])):
        name = line["Name"]
        rtype, osm_type = route_type(name)
        c = eval_color(line["Color"])
        routes.append({"route_id": f"mi_{name}", "agency_id": "metro_istanbul", "route_short_name": name,
                       "route_long_name": line["LongDescription"], "route_type": rtype,
                       "route_color": c, "route_text_color": text_color(c)})
        stations = api.call(f"GetStationById/{line['Id']}")
        stations = sorted(stations, key=lambda s: s["Order"])
        for s in stations:
            stops[s["Id"]] = {"stop_id": f"mi_{s['Id']}", "stop_name": s["Description"].strip(),
                              "stop_lat": round(float(s["DetailInfo"]["Latitude"]), 7),
                              "stop_lon": round(float(s["DetailInfo"]["Longitude"]), 7)}
        directions = api.call(f"GetDirectionById/{line['Id']}")

        api_orders = []
        for d in directions:
            for sid in (stations[0]["Id"], stations[-1]["Id"]):
                try:
                    res = api.call("GetStationBetweenTime", {"BoardingStationId": sid, "DirectionId": d["DirectionId"]})
                    if res:
                        api_orders.append(res[0]["StationOrder"])
                        break
                except RuntimeError:
                    pass
        seg = segment_minutes(stations, api_orders, trip_minutes(line["Content"]))
        cum = np.concatenate([[0], np.cumsum(seg)])
        candidates = [r["line"] for r in osm_lines if r["ref"] == name]
        stats["lines"] += 1

        for d in directions:
            a_name, _, b_name = d["DirectionName"].partition("->")
            ia, ib = match_station(a_name.strip(), stations), match_station(b_name.strip(), stations)
            if ia == ib:  # loop line (T3): run the whole order
                idx = list(range(len(stations)))
            else:
                idx = list(range(ia, ib + 1)) if ia < ib else list(range(ia, ib - 1, -1))
            offs = [abs(cum[i] - cum[idx[0]]) * 60 for i in idx]
            shape_id = f"mi_{name}_{d['DirectionId']}"
            pts = [(stops[stations[i]["Id"]]["stop_lat"], stops[stations[i]["Id"]]["stop_lon"]) for i in idx]
            geom = shape_for_stops(candidates, pts)
            shapes += [{"shape_id": shape_id, "shape_pt_lat": round(p[0], 6), "shape_pt_lon": round(p[1], 6),
                        "shape_pt_sequence": k} for k, p in enumerate(geom)]
            stats["directions"] += 1

            days = {svc: fetch_day(api, stations[idx[0]]["Id"], d["DirectionId"], day, pool)
                    for svc, day in dates.items()}
            if not any(days.values()):
                stats["directions_without_times"].append(f"{name} {d['DirectionName']}")
            for svc, times in days.items():
                for t in times:
                    m = int(t[:2]) * 60 + int(t[3:5])
                    trip_id = f"mi_{name}_{d['DirectionId']}_{svc}_{m:04d}"
                    trips.append({"route_id": f"mi_{name}", "service_id": f"mi_{svc}", "trip_id": trip_id,
                                  "trip_headsign": b_name.strip() or line["LongDescription"],
                                  "direction_id": d["DirectionValue"], "shape_id": shape_id})
                    for k, (i, off) in enumerate(zip(idx, offs)):
                        ts = hms(m * 60 + off)
                        stop_times.append({"trip_id": trip_id, "arrival_time": ts, "departure_time": ts,
                                           "stop_id": f"mi_{stations[i]['Id']}", "stop_sequence": k + 1})

    start = today
    end = today + dt.timedelta(days=VALID_DAYS)
    calendar = [{"service_id": f"mi_{s}", **dict(zip(
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], days)),
        "start_date": start.strftime("%Y%m%d"), "end_date": end.strftime("%Y%m%d")} for s, days in SERVICES.items()]
    agency = [{"agency_id": "metro_istanbul", "agency_name": "Metro İstanbul", "agency_url": "https://www.metro.istanbul",
               "agency_timezone": "Europe/Istanbul", "agency_lang": "tr"}]

    write(out / "agency.txt", agency)
    write(out / "routes.txt", routes)
    write(out / "stops.txt", list(stops.values()))
    write(out / "trips.txt", trips)
    write(out / "stop_times.txt", stop_times)
    write(out / "calendar.txt", calendar)
    write(out / "shapes.txt", shapes)
    stats.update(trips=len(trips), stop_times=len(stop_times), stops=len(stops))
    return stats


def eval_color(c) -> str:
    if isinstance(c, str):
        nums = re.findall(r"\d+", c)
    else:
        nums = [c.get("Color_R"), c.get("Color_G"), c.get("Color_B")]
    return "".join(f"{int(x):02X}" for x in nums[:3])


def text_color(hex6: str) -> str:
    r, g, b = (int(hex6[i:i + 2], 16) for i in (0, 2, 4))
    return "000000" if (0.299 * r + 0.587 * g + 0.114 * b) > 150 else "FFFFFF"


def hms(sec: float) -> str:
    s = int(round(sec))
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def write(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("")
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ETL / "out" / "rail")
    ap.add_argument("--osm", type=Path, default=ETL / "cache" / "osm" / "istanbul.osm.pbf")
    ap.add_argument("--date", type=dt.date.fromisoformat, default=None)
    a = ap.parse_args(argv)
    today = a.date or dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date()
    for k, v in build(a.out, a.osm, today).items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
