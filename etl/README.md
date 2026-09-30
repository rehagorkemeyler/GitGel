# ETL

Builds one clean Istanbul GTFS plus the small JSON files the app needs.

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
curl -o cache/osm/marmara.osm.pbf https://download.openstreetmap.fr/extracts/europe/turkey/marmara-latest.osm.pbf
.venv/bin/python -m iett.clean --download   # -> out/iett/*.txt
.venv/bin/python -m rail.build              # -> out/rail/*.txt  (~3000 API calls, cached)
.venv/bin/python -m other.build             # -> out/other/*.txt
.venv/bin/python -m ankara.ego_api          # -> out/ankara/lines.json, stops.json (~665 calls, ~40 min)
.venv/bin/python -m ankara.gtfs --validate  # -> out/ankara-gtfs.zip
.venv/bin/python -m bursa.burulas_api       # -> out/bursa/lines.json, stops.json (~1 700 calls, ~15 min; --budget N minutes)
.venv/bin/python -m bursa.gtfs --validate   # -> out/bursa-gtfs.zip
.venv/bin/python -m pytest -q tests
```

| Module | Output | Notes |
|---|---|---|
| `iett/clean.py` | `out/iett/` | İETT bus + Metrobüs. Intermediate stop times are estimated (see module docstring) |
| `rail/build.py` | `out/rail/` | 18 Metro İstanbul lines from its API (timetables per weekday/Saturday/Sunday) + OSM shapes |
| `ankara/ego_api.py` | `out/ankara/` | Ankara: every EGO line (bus, metro, Ankaray, Başkentray) from the EGO Cepte service: ordered stops with coordinates, weekday/Saturday/Sunday departures, route geometry. Failed lines fall back to the last good answer |
| `bursa/burulas_api.py` | `out/bursa/` | Bursa: every BURULAŞ line (bus, BursaRay M1/M2, trams T1-T3) from the BursaKart service: lines and stops by scanning the search with 0-9 and A-Z, ordered stops and geometry per direction, first-stop departures per weekday. Refreshed oldest first within a time budget; the rest from the last good answers |
| `bursa/gtfs.py` | `out/bursa-gtfs.zip` | Bursa GTFS (ids prefixed `br_`, stop codes like D0441). Shapes from BURULAŞ's geometry; stop times from first-stop departures at a typical speed per mode (bus 18, tram 14, BursaRay 34 km/h) spread by distance |
| `ankara/gtfs.py` | `out/ankara-gtfs.zip` | Ankara GTFS (ids prefixed `eg_`). Shapes from EGO's route geometry fitted stop pair by stop pair, else stop-to-stop lines; intermediate times proportional to distance within EGO's published trip duration |
| `other/build.py` | `out/other/` | Marmaray, M11, T2, F2 from `other/manual/*.yaml` + OSM; ferries from the last İBB multi-operator GTFS, re-dated |

OSM input: `cache/osm/marmara.osm.pbf` from download.openstreetmap.fr (covers all of Istanbul incl. Gebze).
Not yet covered: F3 Seyrantepe–Vadistanbul, T6 Sirkeci–Kazlıçeşme, B2 Halkalı–Bahçeşehir (add a YAML in `other/manual/` once their timetables are confirmed).

Downloads go to `cache/`, results to `out/`; both are git-ignored.
