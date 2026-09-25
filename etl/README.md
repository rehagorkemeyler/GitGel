# ETL

Builds one clean Istanbul GTFS plus the small JSON files the app needs.

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m iett.clean --download   # -> out/iett/*.txt
.venv/bin/python -m pytest -q tests
```

| Module | Output | Notes |
|---|---|---|
| `iett/clean.py` | `out/iett/` | İETT bus + Metrobüs. Intermediate stop times are estimated (see module docstring) |

Downloads go to `cache/`, results to `out/`; both are git-ignored.
