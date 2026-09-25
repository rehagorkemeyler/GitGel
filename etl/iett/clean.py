"""Download and clean the İETT GTFS published on data.ibb.gov.tr.

Known defects fixed here (see docs/research.md 3.2):
- CSV stop_times is truncated; the full table is in stop_times.zip (comma separated).
- Other files are semicolon separated, some rows break across lines or carry
  extra semicolons inside names.
- Route names are double-encoded UTF-8 ("KADIKÃ–Y" -> "KADIKÖY").
- Coordinates lost their decimal point ("410.191.700.005.564" -> 41.0191700005564);
  a few were mangled by Excel into scientific notation and are dropped.
- Only the first stop of each trip has a time. Intermediate times are estimated
  from straight-line distance and a mode-specific average speed.

Usage: python -m iett.clean [--download] [--cache DIR] [--out DIR]
"""
from __future__ import annotations

import argparse
import io
import math
import re
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

BASE = "https://data.ibb.gov.tr/dataset/8540e256-6df5-4719-85bc-e64e91508ede/resource/"
RESOURCES = {
    "agency.csv": "df13606d-194b-4587-b868-39ecdc5f8769/download/agency.csv",
    "calendar.csv": "6c9623b1-3858-4b37-b936-8ffa78de2a69/download/calendar.csv",
    "routes.csv": "46dbe388-c8c2-45c4-ac72-c06953de56a2/download/routes.csv",
    "stops.csv": "2299bc82-983b-4bdf-8520-5cef8c555e29/download/stops.csv",
    "trips.csv": "7ff49bdd-b0d2-4a6e-9392-b598f77f5070/download/trips.csv",
    "stop_times.zip": "80401c1c-c240-4a32-8f40-ef697100a681/download/stop_times.zip",
}

# Istanbul province with margin.
BBOX = (40.5, 41.8, 27.5, 30.5)  # lat_min, lat_max, lon_min, lon_max

# Segment travel time model. Rough on purpose: these times are shown as
# "tarifeye göre" and can later be calibrated with live GPS.
# time = dwell + distance * detour / speed, where speed grows with hop length
# (short urban hops are slow, long highway hops are fast).
BUS = {"dwell": 12.0, "detour": 1.3, "v_min": 20.0, "v_max": 60.0}
METROBUS = {"dwell": 30.0, "detour": 1.15, "v_min": 40.0, "v_max": 45.0}
HOP_SLOW_M, HOP_FAST_M = 400.0, 3000.0
METROBUS_LINES = {"34", "34A", "34AS", "34B", "34BZ", "34C", "34G", "34Z"}


def fix_mojibake(s: str) -> str:
    """Undo UTF-8 text that was decoded as cp1252/latin-1 and re-encoded."""
    if not isinstance(s, str) or not re.search(r"[ÃÄÅÂ]", s):
        return s
    raw = bytearray()
    for ch in s:
        try:
            raw += ch.encode("cp1252")
        except UnicodeEncodeError:
            if ord(ch) < 256:
                raw.append(ord(ch))
            else:
                return s
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return s


def fix_coord(s: str) -> float | None:
    """'410.191.700.005.564' -> 41.0191700005564. Returns None if unrecoverable."""
    if not isinstance(s, str):
        return None
    s = s.strip()
    if "E+" in s.upper() or "," in s:
        return None
    digits = s.replace(".", "")
    if not digits.isdigit() or len(digits) < 4:
        return None
    return float(digits[:2] + "." + digits[2:])


def _records(text: str, start: re.Pattern) -> list[str]:
    """Join physical lines into records; a record starts where `start` matches."""
    out: list[str] = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if start.match(line) or not out:
            out.append(line)
        else:
            out[-1] += " " + line
    return [r for r in out if r.strip()]


def read_text(path: Path) -> str:
    return path.read_bytes().decode("utf-8-sig")


def parse_routes(text: str) -> pd.DataFrame:
    recs = _records(text, re.compile(r"^\d+;\d+;"))[1:]
    rows = []
    for r in recs:
        f = r.split(";")
        rows.append({
            "route_id": f[0],
            "agency_id": f[1],
            "route_short_name": fix_mojibake(f[2]).strip(),
            "route_long_name": fix_mojibake(f[3]).strip(),
        })
    df = pd.DataFrame(rows).drop_duplicates("route_id")
    df["route_type"] = 3
    is_mb = df["route_short_name"].isin(METROBUS_LINES)
    df.loc[is_mb, "route_color"] = "E30613"
    df.loc[is_mb, "route_text_color"] = "FFFFFF"
    return df


def parse_stops(text: str) -> tuple[pd.DataFrame, int]:
    recs = _records(text, re.compile(r"^\d+;"))[1:]
    rows, bad = [], 0
    for r in recs:
        f = r.rstrip().rstrip(";").split(";")
        # location_type may be missing on broken rows
        if len(f) >= 7 and f[-1] in ("0", "1"):
            loc = int(f[-1])
            f = f[:-1]
        else:
            loc = 0
        lat, lon = fix_coord(f[-2]), fix_coord(f[-1])
        desc_idx = next((i for i in range(len(f) - 3, 1, -1) if f[i].startswith("direction:")), len(f) - 3)
        name = ";".join(x for x in f[2:desc_idx] if x.strip()).replace(";", " /")
        if lat is None or lon is None or not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]):
            bad += 1
            continue
        rows.append({
            "stop_id": f[0],
            "stop_code": f[1],
            "stop_name": fix_mojibake(name).strip(),
            "stop_desc": f[desc_idx].strip() if desc_idx < len(f) else "",
            "stop_lat": round(lat, 7),
            "stop_lon": round(lon, 7),
            "location_type": loc,
        })
    return pd.DataFrame(rows).drop_duplicates("stop_id"), bad


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def segment_seconds(dist_m: np.ndarray, p: dict) -> np.ndarray:
    """Seconds to travel one hop of straight-line length dist_m, dwell included."""
    frac = np.clip((dist_m - HOP_SLOW_M) / (HOP_FAST_M - HOP_SLOW_M), 0.0, 1.0)
    v = (p["v_min"] + frac * (p["v_max"] - p["v_min"])) / 3.6
    return p["dwell"] + dist_m * p["detour"] / v


def hms_to_s(s: pd.Series) -> pd.Series:
    parts = s.str.split(":", expand=True).astype(float)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def s_to_hms(s: pd.Series) -> pd.Series:
    s = s.round().astype(int)
    return (
        (s // 3600).astype(str).str.zfill(2) + ":" +
        ((s % 3600) // 60).astype(str).str.zfill(2) + ":" +
        (s % 60).astype(str).str.zfill(2)
    )


def interpolate_times(st: pd.DataFrame, stops: pd.DataFrame, trips: pd.DataFrame,
                      routes: pd.DataFrame) -> pd.DataFrame:
    """Fill arrival/departure times from the first stop's time using distance/speed."""
    t0 = st.dropna(subset=["departure_time"]).groupby("trip_id")["departure_time"].first()
    t0 = hms_to_s(t0)
    st = st.merge(stops[["stop_id", "stop_lat", "stop_lon"]], on="stop_id", how="inner")
    st = st[st["trip_id"].isin(t0.index)]
    st = st.sort_values(["trip_id", "stop_sequence"]).reset_index(drop=True)
    first = st.groupby("trip_id", sort=False).cumcount() == 0
    prev_lat = st["stop_lat"].shift()
    prev_lon = st["stop_lon"].shift()
    d = haversine_m(prev_lat, prev_lon, st["stop_lat"], st["stop_lon"])
    d = pd.Series(np.where(first, 0.0, d), index=st.index).fillna(0.0)

    mb_routes = set(routes.loc[routes["route_short_name"].isin(METROBUS_LINES), "route_id"])
    is_mb = st["trip_id"].isin(set(trips.loc[trips["route_id"].isin(mb_routes), "trip_id"])).to_numpy()
    seg = np.where(is_mb, segment_seconds(d.to_numpy(), METROBUS), segment_seconds(d.to_numpy(), BUS))
    seg = np.where(first, 0.0, seg)
    st["elapsed"] = pd.Series(seg, index=st.index).groupby(st["trip_id"]).cumsum()

    # Round to whole seconds, then force non-decreasing within a trip.
    t = (st["trip_id"].map(t0) + st["elapsed"]).round()
    t = t.groupby(st["trip_id"]).cummax()
    st["arrival_time"] = s_to_hms(t)
    st["departure_time"] = st["arrival_time"]
    st["timepoint"] = np.where(first, 1, 0)
    # Resequence after dropped stops.
    st["stop_sequence"] = st.groupby("trip_id").cumcount() + 1
    return st[["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "timepoint"]]


def download(cache: Path) -> None:
    import requests
    cache.mkdir(parents=True, exist_ok=True)
    for name, path in RESOURCES.items():
        for attempt in range(5):
            try:
                r = requests.get(BASE + path, timeout=300)
                r.raise_for_status()
                (cache / name).write_bytes(r.content)
                break
            except Exception as e:  # noqa: BLE001
                print(f"retry {name}: {e}", file=sys.stderr)
        else:
            raise SystemExit(f"download failed: {name}")


def build(cache: Path, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    routes = parse_routes(read_text(cache / "routes.csv"))
    stops, bad_stops = parse_stops(read_text(cache / "stops.csv"))

    trips = pd.read_csv(cache / "trips.csv", sep=";", dtype=str, encoding="utf-8-sig")
    trips.columns = [c.strip() for c in trips.columns]
    trips = trips.dropna(subset=["trip_id", "route_id", "service_id"])
    trips["trip_headsign"] = trips["trip_headsign"].map(fix_mojibake)
    trips = trips[trips["route_id"].isin(routes["route_id"])]

    with zipfile.ZipFile(cache / "stop_times.zip") as z:
        name = next(n for n in z.namelist() if n.endswith(".txt") or n.endswith(".csv"))
        with z.open(name) as fh:
            st = pd.read_csv(io.TextIOWrapper(fh, encoding="utf-8-sig"), dtype=str,
                             usecols=["trip_id", "stop_id", "stop_sequence", "departure_time"])
    st["stop_sequence"] = st["stop_sequence"].astype(int)
    st = st[st["trip_id"].isin(trips["trip_id"])]
    n_raw = len(st)
    st = interpolate_times(st, stops, trips, routes)

    # Keep only trips with at least two stops, and stops that are used.
    counts = st.groupby("trip_id").size()
    st = st[st["trip_id"].isin(counts[counts >= 2].index)]
    trips = trips[trips["trip_id"].isin(st["trip_id"])]
    routes = routes[routes["route_id"].isin(trips["route_id"])]
    stops = stops[stops["stop_id"].isin(st["stop_id"])]

    cal = pd.read_csv(cache / "calendar.csv", sep=";", dtype=str, encoding="utf-8-sig")
    cal = cal[["service_id", "monday", "tuesday", "wednesday", "thursday", "friday",
               "saturday", "sunday", "start_date", "end_date"]]
    cal = cal[cal["service_id"].isin(trips["service_id"])]

    agency = pd.DataFrame([{
        "agency_id": "1", "agency_name": "İETT", "agency_url": "https://www.iett.istanbul",
        "agency_timezone": "Europe/Istanbul", "agency_lang": "tr",
    }])

    agency.to_csv(out / "agency.txt", index=False)
    routes.to_csv(out / "routes.txt", index=False)
    stops.to_csv(out / "stops.txt", index=False)
    trips[["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"]].to_csv(out / "trips.txt", index=False)
    st.to_csv(out / "stop_times.txt", index=False)
    cal.to_csv(out / "calendar.txt", index=False)

    stats = {
        "routes": len(routes), "lines": routes["route_short_name"].nunique(),
        "stops": len(stops), "bad_stops_dropped": bad_stops, "trips": len(trips),
        "stop_times_raw": n_raw, "stop_times": len(st),
    }
    return stats


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path(__file__).resolve().parent.parent / "cache" / "iett")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "out" / "iett")
    ap.add_argument("--download", action="store_true")
    a = ap.parse_args(argv)
    if a.download or not (a.cache / "stop_times.zip").exists():
        download(a.cache)
    stats = build(a.cache, a.out)
    for k, v in stats.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
