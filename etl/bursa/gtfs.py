"""Bursa GTFS from the BursaKart line data (bursa.burulas_api).

    python -m bursa.gtfs [--validate]   # -> out/bursa/gtfs/*.txt, out/bursa-gtfs.zip

Timing (everything here is "tarifeye göre"): BURULAŞ publishes departures from the
first stop of each direction, not per-stop times. Stop times are the model: the
trip's run time spread by distance along BURULAŞ's own route geometry, at a
typical speed per mode. Stops without coordinates are left out of the trip.
Ids are prefixed "br_" to keep Bursa apart from Istanbul and Ankara.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

import numpy as np

from ankara.gtfs import build_line, service_minutes, zip_feed
from common.text import title_tr
from rail.build import SERVICES, VALID_DAYS, hms, write

ETL = Path(__file__).resolve().parents[1]
OUT = ETL / "out" / "bursa"
P = "br_"
ROUTE_TYPE = {"bus": 3, "metro": 1, "tram": 0}
# Typical door-to-door speeds with stops included; build_line spreads time at 18 km/h.
KMH = {"bus": 18.0, "metro": 34.0, "tram": 14.0}
MODEL_KMH = 18.0
# BursaRay's line colours; trams as on BURULAŞ's network map.
COLORS = {"M1": ("0B6FB8", "FFFFFF"), "M2": ("0B6FB8", "FFFFFF"),
          "T1": ("E5222B", "FFFFFF"), "T2": ("E5222B", "FFFFFF"), "T3": ("E5222B", "FFFFFF")}
DIRECTION_ID = {"G": 0, "R": 0, "D": 1}

# Abbreviations that stay upper case in names.
ABBR = {"OSB", "AVM", "TOKİ", "SGK", "PTT", "DSİ", "BUTTİM", "BTSO", "BUÜ", "TEİAŞ", "TRT", "TCDD", "BUSKİ", "BURULAŞ",
        "SSK", "KYK", "MKE", "TEM", "UÜ", "U.Ü.", "İHL", "BOTAŞ", "YHT", "TOFAŞ", "OYAK", "İMKB", "ASKİ", "AŞ", "LTD",
        "TSO", "KOSGEB", "E.M.L", "E.M.L.", "M.T.S.K.", "K.Y.K.", "T.C.", "S.S."}


def name_tr(s: str) -> str:
    """'ALİ OSMAN SÖNMEZ E.M.L 1' -> 'Ali Osman Sönmez E.M.L 1', 'M.KEMALPAŞA' -> 'M.Kemalpaşa'
    (title_tr only splits on spaces; splitting on dots keeps initials like İ.Ö.O. upper case)."""
    parts = re.split(r"([-/(). ])", (s or "").strip())
    return re.sub(r"\s+", " ", "".join(p if p in ABBR else title_tr(p) for p in parts)).strip()


def stop_name(name: str, mode: str) -> str:
    """Bus stops keep their bay number ('Kent Meydanı 4'). Rail platforms become the station:
    'EMEK İST. 2' -> 'Emek İstasyonu', 'T1-ADLİYE' -> 'Adliye'."""
    if mode == "bus":
        return name_tr(name)
    n = re.sub(r"^T\d+\s*-\s*", "", name.strip())
    n = re.sub(r"\s*İST\.?\s*\d*$", " İSTASYONU", n)  # 'MERİNOS İST.1'
    n = re.sub(r"\s+\d+$", "", n)
    return name_tr(n)


def long_name(ln: dict) -> str:
    """'Terminal - Görükle' from the first direction's end stops, without bay numbers; rings: 'Kent Meydanı - Ring'."""
    st = ln["dirs"][0]["stops"] if ln["dirs"] else []
    if not st:
        return ""
    a, b = (re.sub(r"\s+\d+$", "", stop_name(s["name"], ln["mode"])) for s in (st[0], st[-1]))
    return f"{a} - Ring" if a == b else f"{a} - {b}"


def mode_rank(m: str) -> int:
    return {"metro": 0, "tram": 1, "bus": 2}.get(m, 3)


def build(lines: list[dict], stops: dict, today: dt.date, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    # A stop served by rail is named as a station; the best mode decides.
    stop_mode: dict[str, str] = {}
    for ln in lines:
        for d in ln["dirs"]:
            for s in d["stops"]:
                cur = stop_mode.get(s["stop"])
                if cur is None or mode_rank(ln["mode"]) < mode_rank(cur):
                    stop_mode[s["stop"]] = ln["mode"]

    routes, trips, stop_times, shapes, used = [], [], [], [], set()
    stats = {"lines": 0, "skipped": [], "directions": 0, "fitted": 0, "straight": 0}
    for ln in lines:
        code, mode = ln["code"], ln["mode"]
        rid = f"{P}{ln['no']}"
        route_trips = 0
        for d in ln["dirs"]:
            shape = d.get("shape") or []
            b = build_line({"stops": d["stops"], "minutes": None}, stops, [np.array(shape)] if len(shape) >= 2 else [])
            if not b:
                continue
            days = {svc: service_minutes([{"min": m} for m in d["times"].get(svc, [])]) for svc in SERVICES}
            if not any(days.values()):
                continue
            stats["directions"] += 1
            stats["fitted" if b["fitted"] else "straight"] += 1
            offsets = b["offsets"] * MODEL_KMH / KMH.get(mode, MODEL_KMH)
            sid = f"{rid}_{d['dir']}"
            shapes += [{"shape_id": sid, "shape_pt_lat": round(p[0], 6), "shape_pt_lon": round(p[1], 6),
                        "shape_pt_sequence": k, "shape_dist_traveled": round(float(x), 1)}
                       for k, (p, x) in enumerate(zip(b["shape"], b["shape_dist"]))]
            headsign = stop_name(stops[b["stops"][-1]]["name"], stop_mode.get(b["stops"][-1], "bus"))
            used.update(b["stops"])
            for svc, mins in days.items():
                for i, m in enumerate(mins):
                    tid = f"{sid}_{svc}_{i}"
                    trips.append({"route_id": rid, "service_id": P + svc, "trip_id": tid, "trip_headsign": headsign,
                                  "direction_id": DIRECTION_ID.get(d["dir"], 0), "shape_id": sid})
                    route_trips += 1
                    for k, (s, off, sd) in enumerate(zip(b["stops"], offsets, b["stop_dist"])):
                        ts = hms(m * 60 + off)
                        stop_times.append({"trip_id": tid, "arrival_time": ts, "departure_time": ts,
                                           "stop_id": P + s, "stop_sequence": k + 1, "shape_dist_traveled": round(float(sd), 1)})
        if not route_trips:
            stats["skipped"].append(code)
            continue
        stats["lines"] += 1
        color, text = COLORS.get(code, ("", ""))
        routes.append({"route_id": rid, "agency_id": "burulas", "route_short_name": code,
                       "route_long_name": long_name(ln),
                       "route_type": ROUTE_TYPE[mode], "route_color": color, "route_text_color": text})

    # Start a day early: the nightly runs after midnight, and yesterday's service day
    # still has trips after midnight.
    start = today - dt.timedelta(days=1)
    end = today + dt.timedelta(days=VALID_DAYS)
    calendar = [{"service_id": P + s, **dict(zip(
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], d)),
        "start_date": start.strftime("%Y%m%d"), "end_date": end.strftime("%Y%m%d")} for s, d in SERVICES.items()]
    write(out / "agency.txt", [{"agency_id": "burulas", "agency_name": "BURULAŞ", "agency_url": "https://www.burulas.com.tr",
                                "agency_timezone": "Europe/Istanbul", "agency_lang": "tr"}])
    write(out / "stops.txt", [{"stop_id": P + s, "stop_code": stops[s].get("code", ""),
                               "stop_name": stop_name(stops[s]["name"], stop_mode.get(s, "bus")),
                               "stop_lat": stops[s]["lat"], "stop_lon": stops[s]["lon"]} for s in sorted(used, key=int)])
    write(out / "routes.txt", routes)
    write(out / "trips.txt", trips)
    write(out / "stop_times.txt", stop_times)
    write(out / "calendar.txt", calendar)
    write(out / "shapes.txt", shapes)
    (out / "feed_info.txt").write_text("feed_publisher_name,feed_publisher_url,feed_lang,feed_version\n"
                                       f"GitGel,https://github.com/rehagorkemeyler/GitGel,tr,{today.isoformat()}\n")
    stats.update(trips=len(trips), stop_times=len(stop_times), stops=len(used))
    return stats


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--validate", action="store_true")
    a = ap.parse_args(argv)
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date()
    lines = json.loads((OUT / "lines.json").read_text(encoding="utf-8"))
    stops = json.loads((OUT / "stops.json").read_text(encoding="utf-8"))
    stats = build(lines, stops, today, OUT / "gtfs")
    zp = ETL / "out" / "bursa-gtfs.zip"
    zip_feed(OUT / "gtfs", zp)
    skipped = stats.pop("skipped")
    print(f"bursa gtfs: {stats}; skipped {len(skipped)}: {' '.join(skipped[:30])}")
    if a.validate:
        from merge.build import validate

        counts = validate(zp, ETL / "out" / "bursa-validation")
        for sev in ("ERROR", "WARNING"):
            for code, n in sorted(counts.get(sev, {}).items()):
                print(f"{sev} {code}: {n}")
        if counts.get("ERROR"):
            sys.exit(1)


if __name__ == "__main__":
    main()
