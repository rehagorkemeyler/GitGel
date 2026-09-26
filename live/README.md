# live

Small live-data service (Node 24, no dependencies at runtime).

| Endpoint | Source | Cache |
|---|---|---|
| `GET /live/vehicles?line=500T` | İETT GetHatOtoKonum_json (GPS; fixes older than 5 min dropped) | 15 s, stale up to 10 min |
| `GET /live/status?lang=tr` | Metro İstanbul GetServiceStatuses + GetAnnouncements | 60 s, stale up to 6 h |
| `GET /live/ankara/vehicles?line=481` | EGO Cepte `FNC=Otobus` (fixes older than 5 min dropped) | 10 s, stale up to 5 min |
| `GET /live/ankara/arrivals?stop=10940` | EGO Cepte `FNC=Otobusler` (live buses only, sorted by ETA) | 10 s, stale up to 2 min |
| `GET /live/health` | | |

Environment: `EGO_MOCK=1` serves fake Ankara data; `EGO_BASE` overrides the EGO service URL.

```
npm install        # dev only: typescript, @types/node
npm test
npm run typecheck
npm start          # :8081
```
