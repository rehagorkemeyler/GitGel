"""Small client for the Metro İstanbul open API with retries and on-disk caching.

The api.ibb.gov.tr gateway fails about half of the requests (503, resets,
timeouts), so every call retries with backoff.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests

BASE = "https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/"
HEADERS = {"User-Agent": "GitGel-ETL (+https://github.com/rehagorkemeyler/GitGel)",
           "Accept": "application/json"}


class MetroApi:
    def __init__(self, cache_dir: Path | None = None, tries: int = 12):
        self.cache_dir = cache_dir
        self.tries = tries
        self.session = requests.Session()
        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, key: str) -> Path | None:
        if not self.cache_dir:
            return None
        return self.cache_dir / (hashlib.sha1(key.encode()).hexdigest()[:16] + ".json")

    def call(self, endpoint: str, body: dict | None = None) -> list | dict:
        key = endpoint + json.dumps(body, sort_keys=True)
        cp = self._cache_path(key)
        if cp and cp.exists():
            cached = json.loads(cp.read_text())
            if isinstance(cached, dict) and "__error__" in cached:
                raise RuntimeError(f"{endpoint} {body}: {cached['__error__']} (cached)")
            return cached
        last = None
        for i in range(self.tries):
            try:
                if body is None:
                    r = self.session.get(BASE + endpoint, headers=HEADERS, timeout=30)
                else:
                    r = self.session.post(BASE + endpoint, json=body, headers=HEADERS, timeout=30)
                if r.status_code == 200:
                    d = r.json()
                    if d.get("Success"):
                        if cp:
                            cp.write_text(json.dumps(d["Data"], ensure_ascii=False))
                        return d["Data"]
                    last = (d.get("Error") or {}).get("Message")
                    # Application errors are deterministic; do not hammer, and
                    # remember them so a rerun does not ask again.
                    if i >= 2:
                        if cp:
                            cp.write_text(json.dumps({"__error__": last}))
                        break
                else:
                    last = f"HTTP {r.status_code}"
            except (requests.RequestException, ValueError) as e:
                last = str(e)
            time.sleep(min(1 + i, 6))
        raise RuntimeError(f"{endpoint} {body}: {last}")
