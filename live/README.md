# live

Small live-data service (Node 24, no dependencies at runtime).

| Endpoint | Source | Cache |
|---|---|---|
| `GET /live/vehicles?line=500T` | İETT GetHatOtoKonum_json (GPS; fixes older than 5 min dropped) | 15 s, stale up to 10 min |
| `GET /live/status?lang=tr` | Metro İstanbul GetServiceStatuses + GetAnnouncements | 60 s, stale up to 6 h |
| `GET /live/health` | | |

```
npm install        # dev only: typescript, @types/node
npm test
npm run typecheck
npm start          # :8081
```
