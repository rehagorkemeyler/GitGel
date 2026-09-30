"""Time the test trips on the live MOTIS, to check that adding a city does not slow the others.

    python3 scripts/motis-timing.py [https://gitgel.tail90b397.ts.net]

Prints the median of 3 requests per trip (seconds) and the number of itineraries.
"""
import datetime as dt
import json
import statistics
import sys
import time
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://gitgel.tail90b397.ts.net").rstrip("/")
TRIPS = [
    ("Yenikapı", (41.0053, 28.9510), "Ayrılık Çeşmesi", (41.0006, 29.0290)),
    ("Kadıköy", (40.9910, 29.0240), "Alibeyköy", (41.0760, 28.9460)),
    ("Taksim", (41.0369, 28.9850), "Sabiha Gökçen", (40.9050, 29.3160)),
    ("İstanbul Havalimanı", (41.2610, 28.7420), "Kadıköy", (40.9910, 29.0240)),
    ("Üsküdar", (41.0260, 29.0150), "Beşiktaş", (41.0420, 29.0070)),
    ("Kabataş", (41.0330, 28.9930), "Bağcılar", (41.0340, 28.8330)),
    ("Eminönü", (41.0170, 28.9700), "Eyüpsultan", (41.0470, 28.9340)),
    ("Hacıosman", (41.1480, 29.0380), "Yenikapı", (41.0053, 28.9510)),
    ("Mecidiyeköy", (41.0670, 28.9950), "Ümraniye", (41.0260, 29.1090)),
    ("Bakırköy", (40.9800, 28.8730), "Levent", (41.0780, 29.0110)),
    ("Kızılay", (39.9208, 32.8541), "AŞTİ", (39.9180, 32.8100)),
    ("Ulus", (39.9420, 32.8540), "ODTÜ", (39.8910, 32.7840)),
    ("Batıkent", (39.9680, 32.7300), "Kızılay", (39.9208, 32.8541)),
]
when = (dt.datetime.now(dt.timezone(dt.timedelta(hours=3))) + dt.timedelta(days=1)).replace(hour=8, minute=30, second=0, microsecond=0)
total = []
for a, pa, b, pb in TRIPS:
    q = urllib.parse.urlencode({"fromPlace": f"{pa[0]},{pa[1]}", "toPlace": f"{pb[0]},{pb[1]}", "time": when.isoformat()})
    times, n = [], 0
    for _ in range(3):
        t = time.monotonic()
        try:
            with urllib.request.urlopen(f"{BASE}/api/v5/plan?{q}", timeout=60) as r:
                n = len(json.load(r).get("itineraries", []))
        except Exception as e:  # noqa: BLE001
            n = f"error {e}"
        times.append(time.monotonic() - t)
    total.append(statistics.median(times))
    print(f"{a} -> {b}: {statistics.median(times):.2f}s, {n} itineraries")
print(f"median of all: {statistics.median(total):.2f}s")
