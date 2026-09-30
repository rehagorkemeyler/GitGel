"""BursaKart (BURULAŞ) service: every line with its stops, geometry and timetable.

    python -m bursa.burulas_api            # -> out/bursa/lines.json, stops.json
    python -m bursa.burulas_api --offline  # only use cache/bursa/api

JSON service behind https://www.bursakart.com.tr/wheremybus (no key, no login).
Every call is a POST with a JSON body and the page's Origin header, else HTTP 403.
Notes and samples: docs/api-samples/bursa/.

  static/routeandstation {"keyword": k}   search; scanning 0-9 and A-Z gives every line and stop
  static/routestat       {"routeCode": hatNo}  ordered stops per direction (G/D, or R for rings)
  static/routecoordinate {"keyword": "hatNo"}  geometry per direction
  static/schedulebystop  {"direction", "routeId": hatNo, "stopSequenceNo": 0, "weekday": 0}
                                           departures from the first stop, routeDay 1 (Mon) .. 7 (Sun)

BursaRay (M1, M2) and the trams (T1, T2, T3) are lines of the same service.
One request at a time per worker with a pause (~400 lines x 4 calls, ~15 min). Lines
are refreshed oldest cache first within a time budget (--budget, so the nightly job
never runs long); the rest, and any line that fails to download or parse, use the
cached copy from an earlier run.
Parsing is pure (JSON text in, dicts out) so it is testable without network.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

BASE = "https://bursakartapi.abys-web.com/api/static/"
ORIGIN = "https://www.bursakart.com.tr"
HEADERS = {"Content-Type": "application/json", "Accept": "application/json", "Origin": ORIGIN, "Referer": ORIGIN + "/"}
ETL = Path(__file__).resolve().parents[1]
CACHE = ETL / "cache" / "bursa" / "api"
OUT = ETL / "out" / "bursa"

KEYWORDS = list("0123456789ABCDEFGHIJKLMNOPRSTUVYZÇĞİÖŞÜ")
BBOX = (39.5, 28.0, 40.8, 30.1)
JUNK_LINES = {"GÖREVLİ", "HAT SEÇİLMEMİŞ"}
DAYS = {1: "wk", 6: "sat", 7: "sun"}  # Monday stands for the working week
WORKERS = 3


def _result(text: str) -> list[dict]:
    d = json.loads(text)
    if d.get("statusCode") != 200:
        raise ValueError(f"BURULAŞ: {d.get('message') or d.get('statusCode')}")
    r = d.get("result")
    return r if isinstance(r, list) else []


def _num(v) -> float | None:
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _ok(lat, lon) -> bool:
    # Rows without a real position carry placeholders like 40 / 28.
    return (lat is not None and lon is not None and BBOX[0] < lat < BBOX[2] and BBOX[1] < lon < BBOX[3]
            and not (lat == int(lat) and lon == int(lon)))


def mode_of(code: str) -> str:
    """BursaRay lines are M1/M2, trams T1/T2/T3; everything else is a bus."""
    if re.fullmatch(r"M\d+", code):
        return "metro"
    if re.fullmatch(r"T\d+", code):
        return "tram"
    return "bus"


CODE_RE = re.compile(r"\s*\(([A-ZÇĞİÖŞÜ]{1,3}\d{2,5})\)\s*$")


def split_code(name: str) -> tuple[str, str]:
    """'KENT MEYDANI 1 (D0441)' -> ('KENT MEYDANI 1', 'D0441')."""
    m = CODE_RE.search(name or "")
    return ((name[: m.start()].strip(), m.group(1)) if m else ((name or "").strip(), ""))


def parse_search(text: str) -> tuple[dict[int, dict], dict[int, dict]]:
    """(lines by hatNo, stops by stationId) from one search answer."""
    lines, stops = {}, {}
    for r in _result(text):
        if r.get("type") == "R":
            code, no = str(r.get("kod", "")).strip(), _num(r.get("hatNo"))
            if code and no and no < 65000 and code.upper() not in JUNK_LINES:
                lines[int(no)] = {"code": code, "no": int(no), "mode": mode_of(code)}
        elif r.get("type") == "S":
            sid, lat, lon = _num(r.get("stationId")), _num(r.get("latitude")), _num(r.get("longitude"))
            if sid and _ok(lat, lon):
                name, code = split_code(str(r.get("stationName", "")))
                stops[int(sid)] = {"name": name, "code": code, "lat": round(lat, 6), "lon": round(lon, 6)}
    return lines, stops


def parse_stops(text: str) -> dict[str, list[dict]]:
    """Ordered stops per direction: {"G": [{"seq", "stop", "name", "lat", "lon"}], ...}."""
    out: dict[str, list[dict]] = {}
    for r in _result(text):
        lat, lon = _num(r.get("latitude")), _num(r.get("longitude"))
        ok = _ok(lat, lon)
        out.setdefault(str(r.get("direction", "")).strip() or "R", []).append({
            "seq": int(_num(r.get("sequence")) or 0), "stop": str(r.get("stopId", "")).strip(),
            "name": str(r.get("stopName", "")).strip(), "lat": round(lat, 6) if ok else None, "lon": round(lon, 6) if ok else None})
    for d, v in out.items():
        v.sort(key=lambda s: s["seq"])
        # The service sometimes lists a stop twice in a row (MERİNOS İSTASYONU 2 on line 1026).
        out[d] = [s for k, s in enumerate(v) if k == 0 or s["stop"] != v[k - 1]["stop"]]
    return out


def parse_shapes(text: str) -> dict[str, list[list[float]]]:
    """Geometry per direction as [[lat, lon], ...] (the service spells it 'logitude')."""
    rows: dict[str, list[tuple[int, float, float]]] = {}
    for r in _result(text):
        lat, lon = _num(r.get("latitude")), _num(r.get("logitude", r.get("longitude")))
        if _ok(lat, lon):
            rows.setdefault(str(r.get("routeDirection", "")).strip() or "R", []).append((int(_num(r.get("sequence")) or 0), lat, lon))
    out = {}
    for d, pts in rows.items():
        line: list[list[float]] = []
        for _, lat, lon in sorted(pts):
            p = [round(lat, 6), round(lon, 6)]
            if not line or line[-1] != p:
                line.append(p)
        out[d] = line
    return out


def parse_times(text: str) -> dict[str, list[int]]:
    """First-stop departures in minutes of the day, for the days in DAYS: {"wk": [...], "sat": [...], "sun": [...]}."""
    out: dict[str, set[int]] = {d: set() for d in DAYS.values()}
    for r in _result(text):
        day = DAYS.get(int(_num(r.get("routeDay")) or 0))
        m = re.match(r"^(\d{1,2}):(\d{2})", str(r.get("stopTime", "")))
        if day and m:
            out[day].add(int(m.group(1)) * 60 + int(m.group(2)))
    return {d: sorted(v) for d, v in out.items()}


def stops_index(lines: list[dict], search: dict[int, dict]) -> dict[str, dict]:
    """Every stop used by a line, keyed by stationId, with the stop code from the search index."""
    out: dict[str, dict] = {}
    for ln in lines:
        for d in ln["dirs"]:
            for s in d["stops"]:
                if s["stop"] in out:
                    continue
                known = search.get(int(s["stop"])) if s["stop"].isdigit() else None
                lat, lon = (s["lat"], s["lon"]) if s["lat"] is not None else ((known["lat"], known["lon"]) if known else (None, None))
                if lat is None:
                    continue
                out[s["stop"]] = {"name": s["name"] or (known or {}).get("name", ""), "code": (known or {}).get("code", ""),
                                  "lat": lat, "lon": lon}
    return out


# ---- network ----------------------------------------------------------------

def safe(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", lambda m: f"_{ord(m.group()):x}", name)


def fetch(session: requests.Session, path: str, body: dict, tries: int = 3) -> str:
    err = ""
    for i in range(tries):
        try:
            r = session.post(BASE + path, json=body, headers=HEADERS, timeout=60)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                return r.text
            err = f"HTTP {r.status_code}, {len(r.text)} bytes"
        except requests.RequestException as e:
            err = str(e)
        time.sleep(3 * (i + 1))
    raise RuntimeError(err)


def cached(session, name: str, path: str, body: dict, parse, offline: bool, pause: float):
    """Fresh answer if it downloads and parses, else the last good copy."""
    cp = CACHE / f"{safe(name)}.json"
    if not offline:
        try:
            text = fetch(session, path, body)
            v = parse(text)
            if v:
                cp.write_text(text, encoding="utf-8")
                time.sleep(pause)
                return v, "fresh"
        except (RuntimeError, ValueError, json.JSONDecodeError):
            pass
        time.sleep(pause)
    if cp.exists():
        return parse(cp.read_text(encoding="utf-8")), "cached"
    return None, "missing"


def line_details(ln: dict, offline: bool, pause: float, deadline: float = float("inf")) -> tuple[dict | None, str]:
    no = ln["no"]
    offline = offline or time.monotonic() > deadline
    with requests.Session() as s:
        stops, how = cached(s, f"stops_{no}", "routestat", {"routeCode": no}, parse_stops, offline, pause)
        if not stops:
            return None, how
        shapes, _ = cached(s, f"shape_{no}", "routecoordinate", {"keyword": str(no)}, parse_shapes, offline, pause)
        dirs = []
        for d, st in sorted(stops.items()):
            times, _ = cached(s, f"times_{no}_{d}", "schedulebystop",
                              {"direction": d, "routeId": no, "stopSequenceNo": 0, "weekday": 0},
                              lambda t: parse_times(t) if _result(t) else None, offline, pause)
            dirs.append({"dir": d, "stops": st, "shape": (shapes or {}).get(d, []),
                         "times": times or {v: [] for v in DAYS.values()}})
    return {**ln, "dirs": dirs}, how


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--pause", type=float, default=0.3, help="seconds between requests of one worker")
    ap.add_argument("--limit", type=int, default=0, help="only the first N lines (testing)")
    ap.add_argument("--budget", type=float, default=0, help="minutes for refreshing lines, then cached copies (0 = no limit)")
    a = ap.parse_args(argv)
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    index: dict[int, dict] = {}
    search: dict[int, dict] = {}
    with requests.Session() as s:
        for k in KEYWORDS:
            v, _ = cached(s, f"search_{k}", "routeandstation", {"keyword": k}, parse_search, a.offline, a.pause)
            if v:
                index.update(v[0])
                search.update(v[1])
    if not index:
        sys.exit("BURULAŞ line list unavailable and no cached copy")
    todo = sorted(index.values(), key=lambda x: x["no"])
    if a.limit:
        todo = todo[: a.limit]
    # Oldest (or missing) cache first, so a budget cut still refreshes every line over a few nights.
    age = lambda ln: (CACHE / f"stops_{ln['no']}.json").stat().st_mtime if (CACHE / f"stops_{ln['no']}.json").exists() else 0  # noqa: E731
    deadline = time.monotonic() + a.budget * 60 if a.budget else float("inf")

    lines, stats = [], {"fresh": 0, "cached": 0, "missing": 0}
    with ThreadPoolExecutor(WORKERS) as ex:
        for p, how in ex.map(lambda ln: line_details(ln, a.offline, a.pause, deadline), sorted(todo, key=age)):
            stats[how] += 1
            if p:
                lines.append(p)
    lines.sort(key=lambda x: x["no"])
    stops = stops_index(lines, search)
    (OUT / "lines.json").write_text(json.dumps(lines, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "stops.json").write_text(json.dumps(stops, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    timed = sum(1 for p in lines if any(any(d["times"].values()) for d in p["dirs"]))
    print(f"bursa: {len(lines)}/{len(todo)} lines, {timed} with timetables, {len(stops)} stops, "
          f"{sum(1 for p in lines for d in p['dirs'] if d['shape'])} shapes; {stats}")
    if len(lines) < 0.8 * len(todo):
        sys.exit("bursa: fewer than 80% of lines downloaded")


if __name__ == "__main__":
    main()
