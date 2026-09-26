"""Merge the per-source GTFS folders into one Istanbul GTFS zip and validate it.

Usage: python -m merge.build [--parts iett rail other] [--out FILE] [--validate]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import subprocess
import sys
import zipfile
from pathlib import Path

ETL = Path(__file__).resolve().parent.parent
FILES = ["agency", "stops", "routes", "trips", "stop_times", "calendar", "frequencies", "shapes"]
# The first column is the primary key used for duplicate detection.
KEYS = {"agency": "agency_id", "stops": "stop_id", "routes": "route_id", "trips": "trip_id",
        "calendar": "service_id"}
VALIDATOR = ETL / "cache" / "tools" / "gtfs-validator.jar"


def read(path: Path) -> tuple[list[str], list[list[str]]]:
    if not path.exists() or path.stat().st_size == 0:
        return [], []
    with path.open(newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        header = next(r, [])
        return header, list(r)


def merge(parts: list[Path], zip_path: Path, today: dt.date) -> dict:
    stats: dict = {}
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for name in FILES:
            header: list[str] = []
            blocks = []
            for p in parts:
                h, rows = read(p / f"{name}.txt")
                if not h:
                    continue
                for c in h:
                    if c not in header:
                        header.append(c)
                blocks.append((h, rows))
            if not header:
                continue
            key = KEYS.get(name)
            seen: set[str] = set()
            dup = 0
            tmp = zip_path.parent / f".{name}.txt"
            with tmp.open("w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(header)
                n = 0
                for h, rows in blocks:
                    idx = [h.index(c) if c in h else None for c in header]
                    kpos = h.index(key) if key else None
                    for row in rows:
                        if kpos is not None:
                            if row[kpos] in seen:
                                dup += 1
                                continue
                            seen.add(row[kpos])
                        w.writerow(["" if i is None or i >= len(row) else row[i] for i in idx])
                        n += 1
            z.write(tmp, f"{name}.txt")
            tmp.unlink()
            stats[name] = n
            if dup:
                stats[f"{name}_duplicates_dropped"] = dup
        z.writestr("feed_info.txt",
                   "feed_publisher_name,feed_publisher_url,feed_lang,feed_version\n"
                   f"GitGel,https://github.com/rehagorkemeyler/GitGel,tr,{today.isoformat()}\n")
    return stats


def validate(zip_path: Path, report_dir: Path) -> dict:
    """Run MobilityData gtfs-validator; return notice counts by severity."""
    subprocess.run(["java", "-Xmx6g", "-jar", str(VALIDATOR), "-i", str(zip_path), "-o", str(report_dir),
                    "-c", "tr"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rep = json.loads((report_dir / "report.json").read_text())
    counts: dict[str, dict[str, int]] = {}
    for n in rep.get("notices", []):
        counts.setdefault(n["severity"], {})[n["code"]] = n["totalNotices"]
    return counts


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--parts", nargs="+", default=["iett", "rail", "other"])
    ap.add_argument("--out", type=Path, default=ETL / "out" / "istanbul-gtfs.zip")
    ap.add_argument("--validate", action="store_true")
    a = ap.parse_args(argv)
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date()
    parts = [ETL / "out" / p for p in a.parts]
    for k, v in merge(parts, a.out, today).items():
        print(f"{k}: {v}")
    if a.validate:
        counts = validate(a.out, a.out.parent / "validation")
        for sev in ("ERROR", "WARNING", "INFO"):
            for code, n in sorted(counts.get(sev, {}).items()):
                print(f"{sev} {code}: {n}")
        if counts.get("ERROR"):
            sys.exit(1)


if __name__ == "__main__":
    main()
