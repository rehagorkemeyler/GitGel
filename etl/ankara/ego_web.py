"""EGO website: line list, line details, timetables and ordered stops.

Everything comes from one page, POST https://www.ego.gov.tr/HareketSaatleri
with hat_no1 (bus), hat_no2 (metro) or hat_no3 (Ankaray) = line code. The page
also carries the full line list in three <select> elements. Endpoint notes:
docs/research.md section 8.6 (credit: EGO Mac, github.com/byigitt/egomac, MIT).

Parsing is pure (html in, dicts out) so it is testable without network.
"""
from __future__ import annotations

import html as htmlmod
import re

URL = "https://www.ego.gov.tr/HareketSaatleri"
UA = "Mozilla/5.0 (compatible; GitGel ETL; +https://github.com/rehagorkemeyler/GitGel)"

# <select id> -> (mode, form field)
SELECTS = {
    "hat_liste_otobus": ("bus", "hat_no1"),
    "hat_liste_metro": ("metro", "hat_no2"),
    "hat_liste_ankaray": ("ankaray", "hat_no3"),
}
DAYS = ("wk", "sat", "sun")  # Hafta içi, Cumartesi, Pazar


def text(fragment: str) -> str:
    """Strip tags, decode entities, collapse whitespace."""
    s = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", htmlmod.unescape(s)).strip()


def _cells(row: str) -> list[str]:
    return re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", row)


def _rows(table: str) -> list[str]:
    return re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", table)


def _table(page: str, cls: str) -> str | None:
    m = re.search(r'<table[^>]*class="[^"]*\b' + re.escape(cls) + r'\b[^"]*"[^>]*>([\s\S]*?)</table>', page)
    return m.group(1) if m else None


def parse_line_list(page: str) -> list[dict]:
    """All lines offered in the page's three <select> lists."""
    out, seen = [], set()
    for sid, (mode, field) in SELECTS.items():
        m = re.search(r'id="' + sid + r'"[^>]*>([\s\S]*?)</select>', page)
        if not m:
            continue
        for code, label in re.findall(r'<option value="([^"]+)"[^>]*>([^<]*)</option>', m.group(1)):
            code = code.strip()
            if code == "0" or code in seen:
                continue
            seen.add(code)
            # "(481 ) - UYANIŞ-ASFALT-..." -> "UYANIŞ-ASFALT-..."
            name = re.sub(r"^\s*\(\s*" + re.escape(code) + r"\s*\)\s*-\s*", "", text(label))
            out.append({"code": code, "name": name, "mode": mode, "field": field})
    return out


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def parse_times(cell: str) -> list[dict]:
    """One timetable cell: '06:17 21071DEN BAŞLAR<br />06:20 -<br />' -> [{min, note}].

    Notes can contain times themselves ('KARAPINARDAN 06:50'), so split on <br>,
    never on every HH:MM."""
    out = []
    for line in re.split(r"<br\s*/?>", cell):
        t = text(line)
        m = re.match(r"^(\d{1,2}:\d{2})\s*(.*)$", t)
        if not m:
            continue
        note = m.group(2).strip()
        out.append({"min": _minutes(m.group(1)), "note": None if note in ("", "-") else note})
    return out


def parse_line_page(page: str) -> dict | None:
    """Line details, timetables (weekday/Saturday/Sunday) and ordered stops."""
    kv = _table(page, "hs-kv")
    if kv is None:
        return None
    meta = {}
    for row in _rows(kv):
        c = _cells(row)
        if len(c) >= 3:
            meta[text(c[0])] = text(c[2])
    note = re.search(r'<p class="hs-note">([\s\S]*?)</p>', page)

    times = {d: [] for d in DAYS}
    tt = _table(page, "hs-table")
    if tt:
        for row in _rows(tt):
            for d, cell in zip(DAYS, _cells(row)):
                if "<th" not in row:
                    times[d].extend(parse_times(cell))
    for d in DAYS:
        times[d].sort(key=lambda x: x["min"])

    stops = []
    rt = _table(page, "route-table")
    if rt:
        for row in _rows(rt):
            c = [text(x) for x in _cells(row)]
            if len(c) >= 3 and c[0].isdigit():
                stops.append({"seq": int(c[0]), "stop": c[1], "name": c[2], "address": c[3] if len(c) > 3 else ""})
    stops.sort(key=lambda s: s["seq"])

    def num(label: str) -> int | None:
        m = re.match(r"(\d+)", meta.get(label, ""))
        return int(m.group(1)) if m else None

    return {
        "code": meta.get("Hat No", ""),
        "name": meta.get("Hat Adı", ""),
        "from": meta.get("Kalkış Yeri", ""),
        "to": meta.get("Varış Yeri", ""),
        "km": num("Mesafesi"),
        "minutes": num("Süresi"),
        "note": text(note.group(1)) if note else None,
        "times": times,
        "stops": stops,
    }
