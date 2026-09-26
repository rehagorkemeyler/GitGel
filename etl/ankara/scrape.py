"""Scrape every EGO line page once, politely, keeping the last good copy.

    python -m ankara.scrape            # -> out/ankara/lines.json
    python -m ankara.scrape --offline  # only use cache/ankara/pages

One request per line with a pause in between (~660 lines, ~15 min). A page
that fails to download or parse falls back to its cached copy from an earlier
run, so a flaky night never drops a line.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests

from ankara.ego_web import UA, URL, parse_line_list, parse_line_page

ETL = Path(__file__).resolve().parents[1]
CACHE = ETL / "cache" / "ankara" / "pages"
OUT = ETL / "out" / "ankara"


def safe(code: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "_", code)


def fetch(session: requests.Session, field: str, code: str, tries: int = 3) -> str:
    for i in range(tries):
        try:
            r = session.post(URL, data={field: code}, headers={"User-Agent": UA}, timeout=30)
            if r.status_code == 200 and "hs-kv" in r.text:
                return r.text
            err = f"HTTP {r.status_code}"
        except requests.RequestException as e:
            err = str(e)
        time.sleep(3 * (i + 1))
    raise RuntimeError(f"{code}: {err}")


def page_for(session, field, code, offline: bool, pause: float) -> tuple[str | None, str]:
    cp = CACHE / f"{safe(code)}.html"
    if not offline:
        try:
            html = fetch(session, field, code)
            if parse_line_page(html):
                cp.write_text(html, encoding="utf-8")
                time.sleep(pause)
                return html, "fresh"
        except RuntimeError:
            pass
        time.sleep(pause)
    if cp.exists():
        return cp.read_text(encoding="utf-8"), "cached"
    return None, "missing"


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--pause", type=float, default=1.0, help="seconds between requests")
    ap.add_argument("--limit", type=int, default=0, help="only the first N lines (testing)")
    a = ap.parse_args(argv)
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    s = requests.Session()

    index, how = page_for(s, "hat_no1", "101", a.offline, a.pause)
    if not index:
        sys.exit("EGO line list unavailable and no cached copy")
    lines = parse_line_list(index)
    if a.limit:
        lines = lines[: a.limit]

    out, stats = [], {"fresh": 0, "cached": 0, "missing": 0}
    for ln in lines:
        html, how = page_for(s, ln["field"], ln["code"], a.offline, a.pause) if ln["code"] != "101" else (index, how)
        stats[how] += 1
        p = parse_line_page(html) if html else None
        if not p:
            continue
        p["code"] = p["code"] or ln["code"]
        p["mode"] = ln["mode"]
        out.append(p)

    (OUT / "lines.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    nstops = len({st["stop"] for p in out for st in p["stops"]})
    print(f"ankara: {len(out)}/{len(lines)} lines, {nstops} distinct stops; {stats}")
    if len(out) < 0.8 * len(lines):
        sys.exit("ankara: fewer than 80% of lines scraped")


if __name__ == "__main__":
    main()
