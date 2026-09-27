"""Ankara GTFS from the EGO Cepte line data (ankara.ego_api).

    python -m ankara.gtfs [--validate]   # -> out/ankara/gtfs/*.txt, out/ankara-gtfs.zip

Timing model (everything here is "tarifeye göre"): EGO publishes departures
from the first stop and one trip duration per line. Intermediate stops get
times proportional to distance along EGO's route geometry. Stops without
coordinates are left out of the trip rather than guessed. Short-working notes
("...DEN BAŞLAR", "...DA BİTER") are not modelled yet; those trips run the
full route.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import zipfile
from pathlib import Path

import numpy as np

from common.geo import _xy, cut, haversine_m
from common.text import title_tr
from rail.build import SERVICES, VALID_DAYS, hms, write

ETL = Path(__file__).resolve().parents[1]
OUT = ETL / "out" / "ankara"
P = "eg_"  # id prefix, keeps Ankara ids apart from Istanbul ones
ROUTE_TYPE = {"bus": 3, "metro": 1, "ankaray": 1, "suburban": 2}
# Official colours (as tagged on the OSM route relations of Ankara Metrosu).
COLORS = {"M1": ("BF0E1C", "FFFFFF"), "M2": ("BF0E1C", "FFFFFF"), "M3": ("BF0E1C", "FFFFFF"),
          "M4": ("EDAF2E", "000000"), "A1": ("056D2E", "FFFFFF")}
FALLBACK_KMH = 18.0
NIGHT_END = 4 * 60  # a departure before 04:00 in a list that also has daytime times belongs to the evening before


# Abbreviations that stay upper case in names.
ABBR = {"ÖHO", "AŞTİ", "ODTÜ", "OSB", "AKM", "MTA", "GOP", "TBMM", "PTT", "SGK", "TRT", "TCDD", "YHT", "ASKİ", "EGO", "OSTİM"}


def name_tr(s: str) -> str:
    """'BAĞLUM-UFUKTEPE-ŞEHİTLER' -> 'Bağlum-Ufuktepe-Şehitler' (title_tr only splits on spaces)."""
    parts = re.split(r"([-/() ])", s or "")
    return "".join(p if p in ABBR else title_tr(p) for p in parts)


def service_minutes(times: list[dict]) -> list[int]:
    mins = sorted(t["min"] for t in times)
    if mins and mins[-1] >= NIGHT_END:
        mins = sorted(m + 1440 if m < NIGHT_END else m for m in mins)
    return mins


class Line:
    """One route polyline with the numbers needed to project stops on it."""

    def __init__(self, line: np.ndarray):
        self.line = line
        self.lat0 = float(line[:, 0].mean())
        xy = _xy(line, self.lat0)
        self.a, self.ab = xy[:-1], np.diff(xy, axis=0)
        self.L2 = (self.ab ** 2).sum(1)
        self.seg = np.sqrt(self.L2)
        self.cum = np.concatenate([[0], np.cumsum(self.seg)])

    def positions(self, pts: list[tuple[float, float]], near: float) -> list[list[float]]:
        """Per stop: distances along the line of every pass within `near` metres."""
        out = []
        for p in _xy(np.array(pts), self.lat0):
            t = np.clip(((p - self.a) * self.ab).sum(1) / np.where(self.L2 == 0, 1, self.L2), 0, 1)
            d = np.sqrt(((self.a + self.ab * t[:, None] - p) ** 2).sum(1))
            al: list[tuple[float, float]] = []
            for i in np.nonzero(d <= near)[0]:  # closest segment of each run = one pass
                x = float(self.cum[i] + self.seg[i] * t[i])
                if al and x - al[-1][0] < 80:
                    if d[i] < al[-1][1]:
                        al[-1] = (x, float(d[i]))
                    continue
                al.append((x, float(d[i])))
            out.append([x for x, _ in al])
        return out


def piecewise(cand: Line, pts: list[tuple[float, float]], near: float = 60.0) -> tuple[list, int]:
    """For each pair of consecutive stops, the piece of the route line between them if
    one goes forward with a plausible length, else None (straight). Returns (pieces,
    count of line pieces).

    Loop and out-and-back routes pass the same street twice, so a stop can sit on
    several passes; working pair by pair picks the pass that fits each hop and keeps
    a local glitch in the geometry from spoiling the whole line."""
    pos = cand.positions(pts, near)
    pieces, n = [], 0
    for k in range(1, len(pts)):
        straight = float(haversine_m(*pts[k - 1], *pts[k]))
        best = None
        for x in pos[k - 1]:
            for y in pos[k]:
                if y > x and y - x <= 3 * straight + 200:
                    err = abs(y - x - straight)
                    if best is None or err < best[0]:
                        best = (err, x, y)
        pieces.append((best[1], best[2]) if best else None)
        n += best is not None
    return pieces, n


def build_line(line: dict, stops: dict, candidates: list[np.ndarray]) -> dict | None:
    seq = [s["stop"] for s in line["stops"] if s["stop"] in stops]
    if len(seq) < 2:
        return None
    pts = [(stops[s]["lat"], stops[s]["lon"]) for s in seq]
    best, best_n = None, 0
    for c in candidates:
        cand = Line(c)
        pieces, n = piecewise(cand, pts)
        if n > best_n:
            best, best_n = (cand, pieces), n
    shape, dist = [np.array([pts[0]])], [0.0]
    at_vertex = [0]  # index of each stop's point in the concatenated shape
    for k in range(1, len(pts)):
        piece = best[1][k - 1] if best else None
        if piece:
            part = cut(best[0].line, *piece)
            dist.append(dist[-1] + piece[1] - piece[0])
        else:
            part = np.array([pts[k - 1], pts[k]])
            dist.append(dist[-1] + float(haversine_m(*pts[k - 1], *pts[k])))
        shape.append(part[1:] if len(part) > 1 else part)
        at_vertex.append(at_vertex[-1] + len(shape[-1]))
    dist = np.array(dist)
    if dist[-1] <= 0:
        return None
    total_min = line.get("minutes") or 0
    if total_min <= 0:
        total_min = dist[-1] / 1000 / FALLBACK_KMH * 60
    geom = np.vstack(shape)
    # Distance along the shape of every vertex and every stop (GTFS shape_dist_traveled): without
    # it MOTIS has to guess where a stop sits on loop and out-and-back shapes, and then draws a
    # ride from the start of the line instead of from the boarding stop.
    seg = [float(haversine_m(*a, *b)) for a, b in zip(geom, geom[1:])]
    along = np.concatenate([[0.0], np.cumsum(seg)])
    return {"stops": seq, "offsets": dist / dist[-1] * total_min * 60, "shape": geom, "shape_dist": along,
            "stop_dist": along[np.array(at_vertex)], "fitted": best_n >= 0.5 * (len(pts) - 1)}


def build(lines: list[dict], stops: dict, today: dt.date, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)

    routes, trips, stop_times, shapes, used = [], [], [], [], set()
    stats = {"lines": 0, "skipped": [], "ego_shape": 0, "straight_shape": 0}
    for ln in lines:
        code, mode = ln["code"], ln.get("mode", "bus")
        shape = ln.get("shape") or []
        b = build_line(ln, stops, [np.array(shape)] if len(shape) >= 2 else [])
        days = {d: service_minutes(ln["times"][d]) for d in SERVICES}
        if not b or not any(days.values()):
            stats["skipped"].append(code)
            continue
        stats["lines"] += 1
        stats["ego_shape" if b["fitted"] else "straight_shape"] += 1
        rid = P + code
        color, text = COLORS.get(code.split("-")[0], ("", "")) if mode != "bus" else ("", "")
        routes.append({"route_id": rid, "agency_id": "ego", "route_short_name": code,
                       "route_long_name": name_tr(ln["name"]), "route_type": ROUTE_TYPE[mode],
                       "route_color": color, "route_text_color": text})
        shapes += [{"shape_id": rid, "shape_pt_lat": round(p[0], 6), "shape_pt_lon": round(p[1], 6),
                    "shape_pt_sequence": k, "shape_dist_traveled": round(float(d), 1)}
                   for k, (p, d) in enumerate(zip(b["shape"], b["shape_dist"]))]
        headsign = name_tr(stops[b["stops"][-1]]["name"])
        used.update(b["stops"])
        for svc, mins in days.items():
            for i, m in enumerate(mins):
                tid = f"{rid}_{svc}_{i}"
                # EGO publishes each direction as its own line code (M1-D / M1-G, 102-1 / 102-2).
                trips.append({"route_id": rid, "service_id": P + svc, "trip_id": tid,
                              "trip_headsign": headsign, "direction_id": 0, "shape_id": rid})
                for k, (s, off, sd) in enumerate(zip(b["stops"], b["offsets"], b["stop_dist"])):
                    ts = hms(m * 60 + off)
                    stop_times.append({"trip_id": tid, "arrival_time": ts, "departure_time": ts,
                                       "stop_id": P + s, "stop_sequence": k + 1, "shape_dist_traveled": round(float(sd), 1)})

    # Start a day early: the nightly runs after midnight, and yesterday's service day
    # still has trips after midnight (night buses, weekend night metro).
    start = today - dt.timedelta(days=1)
    end = today + dt.timedelta(days=VALID_DAYS)
    calendar = [{"service_id": P + s, **dict(zip(
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], d)),
        "start_date": start.strftime("%Y%m%d"), "end_date": end.strftime("%Y%m%d")} for s, d in SERVICES.items()]
    write(out / "agency.txt", [{"agency_id": "ego", "agency_name": "EGO Genel Müdürlüğü", "agency_url": "https://www.ego.gov.tr",
                                "agency_timezone": "Europe/Istanbul", "agency_lang": "tr"}])
    write(out / "stops.txt", [{"stop_id": P + s, "stop_code": s, "stop_name": name_tr(stops[s]["name"]),
                               "stop_lat": stops[s]["lat"], "stop_lon": stops[s]["lon"]} for s in sorted(used)])
    write(out / "routes.txt", routes)
    write(out / "trips.txt", trips)
    write(out / "stop_times.txt", stop_times)
    write(out / "calendar.txt", calendar)
    write(out / "shapes.txt", shapes)
    (out / "feed_info.txt").write_text("feed_publisher_name,feed_publisher_url,feed_lang,feed_version\n"
                                       f"GitGel,https://github.com/rehagorkemeyler/GitGel,tr,{today.isoformat()}\n")
    stats.update(trips=len(trips), stop_times=len(stop_times), stops=len(used))
    return stats


def zip_feed(src: Path, dst: Path) -> None:
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(src.glob("*.txt")):
            z.write(f, f.name)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--validate", action="store_true")
    a = ap.parse_args(argv)
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date()
    lines = json.loads((OUT / "lines.json").read_text(encoding="utf-8"))
    stops = json.loads((OUT / "stops.json").read_text(encoding="utf-8"))
    stats = build(lines, stops, today, OUT / "gtfs")
    zp = ETL / "out" / "ankara-gtfs.zip"
    zip_feed(OUT / "gtfs", zp)
    skipped = stats.pop("skipped")
    print(f"ankara gtfs: {stats}; skipped {len(skipped)}: {' '.join(skipped[:30])}")
    if a.validate:
        from merge.build import validate

        counts = validate(zp, ETL / "out" / "ankara-validation")
        for sev in ("ERROR", "WARNING"):
            for code, n in sorted(counts.get(sev, {}).items()):
                print(f"{sev} {code}: {n}")
        if counts.get("ERROR"):
            sys.exit(1)


if __name__ == "__main__":
    main()
