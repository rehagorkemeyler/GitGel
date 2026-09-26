# ETL

Builds one clean Istanbul GTFS plus the small JSON files the app needs.

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
curl -o cache/osm/marmara.osm.pbf https://download.openstreetmap.fr/extracts/europe/turkey/marmara-latest.osm.pbf
.venv/bin/python -m iett.clean --download   # -> out/iett/*.txt
.venv/bin/python -m rail.build              # -> out/rail/*.txt  (~3000 API calls, cached)
.venv/bin/python -m other.build             # -> out/other/*.txt
.venv/bin/python -m pytest -q tests
```

| Module | Output | Notes |
|---|---|---|
| `iett/clean.py` | `out/iett/` | İETT bus + Metrobüs. Intermediate stop times are estimated (see module docstring) |
| `rail/build.py` | `out/rail/` | 18 Metro İstanbul lines from its API (timetables per weekday/Saturday/Sunday) + OSM shapes |
| `other/build.py` | `out/other/` | Marmaray, M11, T2, F2 from `other/manual/*.yaml` + OSM; ferries from the last İBB multi-operator GTFS, re-dated |

OSM input: `cache/osm/marmara.osm.pbf` from download.openstreetmap.fr (covers all of Istanbul incl. Gebze).
Not yet covered: F3 Seyrantepe–Vadistanbul, T6 Sirkeci–Kazlıçeşme, B2 Halkalı–Bahçeşehir (add a YAML in `other/manual/` once their timetables are confirmed).

Downloads go to `cache/`, results to `out/`; both are git-ignored.
