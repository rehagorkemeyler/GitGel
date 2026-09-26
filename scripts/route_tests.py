"""Run the CLAUDE.md test trips against a MOTIS server.

Usage: python3 scripts/route_tests.py [http://127.0.0.1:8080] < docs/route-tests.txt
"""
import json, sys, urllib.request, urllib.parse
B = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http") else "http://127.0.0.1:8080"
def geo(q):
    d = json.load(urllib.request.urlopen(B + "/api/v1/geocode?" + urllib.parse.urlencode({"text": q})))
    stops = [x for x in d if x["type"] == "STOP"] or d
    x = stops[0]; return f"{x['lat']},{x['lon']}", x["name"]
def plan(a, b, time="2026-09-29T08:00:00+03:00"):
    (fa, na), (fb, nb) = geo(a), geo(b)
    for v in ("v5", "v4", "v3"):
        try:
            d = json.load(urllib.request.urlopen(B + f"/api/{v}/plan?" + urllib.parse.urlencode({"fromPlace": fa, "toPlace": fb, "time": time})))
            break
        except Exception as e:
            err = e
    else:
        raise err
    out = []
    for it in d.get("itineraries", [])[:3]:
        legs = [l for l in it["legs"] if l["mode"] != "WALK"]
        out.append(f"{round(it['duration']/60)} dk, {it['transfers']} aktarma: " + " > ".join(f"{l.get('routeShortName') or l['mode']}({l['from']['name']}→{l['to']['name']})" for l in legs))
    return na, nb, out
if __name__ == "__main__":
    pairs = [l.split("|") for l in sys.stdin.read().strip().splitlines()]
    for a, b in pairs:
        try:
            na, nb, out = plan(a.strip(), b.strip())
            print(f"## {a.strip()} → {b.strip()}  [{na} → {nb}]")
            for o in out or ["ROTA YOK"]: print("  -", o)
        except Exception as e:
            print(f"## {a} → {b}: HATA {e}")
