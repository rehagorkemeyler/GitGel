"""EGO Cepte service: every line with its stops (exact coordinates), timetable and route geometry.

    python -m ankara.ego_api            # -> out/ankara/lines.json, out/ankara/stops.json
    python -m ankara.ego_api --offline  # only use cache/ankara/api

Two calls on https://egocptsrvand.ego.gov.tr/hibrit/ (no key, no session):
  act.asp?FNC=Hatlar&QUERY=                   all lines (bus, metro, Ankaray, Başkentray)
  act.asp?FNC=HatBilgileri&YOL=TRUE&KOD={hat} one line: details, table_durak (ordered stops
                                              with lat/lng), table_saat (weekday/Saturday/
                                              Sunday departures with notes), yol (geometry)
Notes and samples: docs/research.md section 8.6, docs/api-samples/ankara/.

One request per line with a pause in between (~665 lines, ~40 min). A line that
fails to download or parse falls back to its cached copy from an earlier run.
Parsing is pure (JSON text in, dicts out) so it is testable without network.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests

BASE = "https://egocptsrvand.ego.gov.tr/hibrit/act.asp"
UA = "Dart/3.5 (dart:io)"  # what the official Android app sends
ETL = Path(__file__).resolve().parents[1]
CACHE = ETL / "cache" / "ankara" / "api"
OUT = ETL / "out" / "ankara"

MODES = {"OTOBÜS": "bus", "METRO": "metro", "ANKARAY": "ankaray", "BANLİYO": "suburban"}
DAYS = {"HAFTA İÇİ": "wk", "CUMARTESİ": "sat", "PAZAR": "sun"}
BBOX = (39.3, 31.8, 40.6, 33.8)


def _table(text: str, key: str = "table") -> list[dict]:
    d = json.loads(text)
    if str(d.get("status", "TRUE")).upper() == "FALSE":
        raise ValueError(f"EGO: {d.get('message') or 'status FALSE'}")
    t = d.get(key)
    return t if isinstance(t, list) else []


def mode_of(tur: str) -> str:
    """'EGO, OTOBÜS' / 'ÖHO, OTOBÜS' / 'METRO, METRO' / 'BANLİYO, BANLİYO' -> bus / metro / suburban."""
    return MODES.get(tur.split(",")[-1].strip(), "bus")


def parse_lines(text: str) -> list[dict]:
    out, seen = [], set()
    for r in _table(text):
        code = str(r.get("kod", "")).strip()
        if code and code not in seen:
            seen.add(code)
            out.append({"code": code, "name": str(r.get("ad", "")).strip(), "mode": mode_of(str(r.get("tur", "")))})
    return out


def _num(v) -> float | None:
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def parse_shape(yol: str) -> list[list[float]]:
    """'32.58,40.06,0 32.59,40.07,0' (lon,lat,alt) -> [[40.06, 32.58], ...] (lat, lon)."""
    pts = []
    for tok in (yol or "").split():
        p = tok.split(",")
        lon, lat = (_num(p[0]), _num(p[1])) if len(p) >= 2 else (None, None)
        if lat is not None and lon is not None and BBOX[0] < lat < BBOX[2] and BBOX[1] < lon < BBOX[3]:
            if not pts or pts[-1] != [lat, lon]:
                pts.append([lat, lon])
    return pts


def parse_line(text: str) -> dict | None:
    d = json.loads(text)
    info = (d.get("table") or [None])[0]
    if not info:
        return None
    stops = []
    for r in d.get("table_durak") or []:
        lat, lon = _num(r.get("lat")), _num(r.get("lng"))
        ok = lat is not None and lon is not None and BBOX[0] < lat < BBOX[2] and BBOX[1] < lon < BBOX[3]
        stops.append({"seq": int(_num(r.get("sira")) or 0), "stop": str(r.get("kod", "")).strip(),
                      "name": str(r.get("ad", "")).strip(), "address": str(r.get("konum", "")).strip(),
                      "lat": lat if ok else None, "lon": lon if ok else None})
    stops.sort(key=lambda s: s["seq"])
    times: dict[str, list[dict]] = {d: [] for d in DAYS.values()}
    for r in d.get("table_saat") or []:
        day = DAYS.get(str(r.get("tur", "")).strip())
        h, m = _num(r.get("saat")), _num(r.get("dakika"))
        if day and h is not None and m is not None:
            note = str(r.get("detay", "")).strip()
            times[day].append({"min": int(h) * 60 + int(m), "note": None if note in ("", "-") else note})
    for v in times.values():
        v.sort(key=lambda x: x["min"])
    minutes, km = _num(info.get("sure")), _num(info.get("mesafe"))
    aciklama = str(info.get("aciklama", "")).strip()
    return {
        "code": str(info.get("kod", "")).strip(),
        "name": str(info.get("ad", "")).strip(),
        "mode": mode_of(str(info.get("tur", ""))),
        "minutes": int(minutes) if minutes else None,
        "km": km,
        "note": None if not aciklama or aciklama.startswith("Hat ile ilgili açıklama girilmemiş") else aciklama,
        "times": times,
        "stops": stops,
        "shape": parse_shape(str(d.get("yol") or "")),
    }


def stops_index(lines: list[dict]) -> dict[str, dict]:
    """Every stop with coordinates, keyed by EGO stop code."""
    out: dict[str, dict] = {}
    for ln in lines:
        for s in ln["stops"]:
            if s["lat"] is not None and s["stop"] not in out:
                out[s["stop"]] = {"name": s["name"], "lat": round(s["lat"], 6), "lon": round(s["lon"], 6)}
    return out


# ---- network ----------------------------------------------------------------

def safe(code: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "_", code)


def fetch(session: requests.Session, params: dict, tries: int = 3) -> str:
    err = ""
    for i in range(tries):
        try:
            r = session.get(BASE, params={**params, "LAN": "tr", "VER": "4.0.7"}, headers={"User-Agent": UA}, timeout=30)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                return r.text
            err = f"HTTP {r.status_code}, {len(r.text)} bytes"
        except requests.RequestException as e:
            err = str(e)
        time.sleep(3 * (i + 1))
    raise RuntimeError(err)


def cached(session, name: str, params: dict, parse, offline: bool, pause: float):
    """Fresh answer if it downloads and parses, else the last good copy."""
    cp = CACHE / f"{safe(name)}.json"
    if not offline:
        try:
            text = fetch(session, params)
            if parse(text):
                cp.write_text(text, encoding="utf-8")
                time.sleep(pause)
                return parse(text), "fresh"
        except (RuntimeError, ValueError, json.JSONDecodeError):
            pass
        time.sleep(pause)
    if cp.exists():
        return parse(cp.read_text(encoding="utf-8")), "cached"
    return None, "missing"


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--pause", type=float, default=0.5, help="seconds between requests")
    ap.add_argument("--limit", type=int, default=0, help="only the first N lines (testing)")
    a = ap.parse_args(argv)
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    s = requests.Session()

    index, _ = cached(s, "_lines", {"FNC": "Hatlar", "QUERY": ""}, parse_lines, a.offline, a.pause)
    if not index:
        sys.exit("EGO line list unavailable and no cached copy")
    if a.limit:
        index = index[: a.limit]
    lines, stats = [], {"fresh": 0, "cached": 0, "missing": 0}
    for ln in index:
        p, how = cached(s, ln["code"], {"FNC": "HatBilgileri", "YOL": "TRUE", "KOD": ln["code"]},
                        parse_line, a.offline, a.pause)
        stats[how] += 1
        if p:
            p["code"] = p["code"] or ln["code"]
            lines.append(p)

    stops = stops_index(lines)
    (OUT / "lines.json").write_text(json.dumps(lines, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "stops.json").write_text(json.dumps(stops, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total = len({st["stop"] for p in lines for st in p["stops"]})
    print(f"ankara: {len(lines)}/{len(index)} lines, {len(stops)}/{total} stops with coordinates, "
          f"{sum(1 for p in lines if p['shape'])} shapes; {stats}")
    if len(lines) < 0.8 * len(index):
        sys.exit("ankara: fewer than 80% of lines downloaded")


if __name__ == "__main__":
    main()
