# live

Small live-data service (Node 24, no dependencies at runtime).

| Endpoint | Source | Cache |
|---|---|---|
| `GET /live/vehicles?line=500T` | İETT GetHatOtoKonum_json (GPS; fixes older than 5 min dropped) | 15 s, stale up to 10 min |
| `GET /live/status?lang=tr` | Metro İstanbul GetServiceStatuses + GetAnnouncements | 60 s, stale up to 6 h |
| `GET /live/ankara/vehicles?line=481` | EGO Cepte `FNC=Otobus` (fixes older than 5 min dropped) | 10 s, stale up to 5 min |
| `GET /live/ankara/arrivals?stop=10940` | EGO Cepte `FNC=Otobusler` (live buses only, sorted by ETA) | 10 s, stale up to 2 min |
| `GET /live/places/autocomplete?q=moda&session=<uuid>&lat=&lon=` | Google Places (New) autocomplete, Istanbul only (native app) | none; 300/day cap |
| `GET /live/places/details?id=<placeId>&session=<uuid>` | Google Places (New) details: id, name, address, location | 30 days per place id; 160/day cap |
| `GET /live/health` | | |

Places: daily caps (Istanbul day) and 60 requests/hour per client; counters and the details cache live in `/data/places.json`. Any limit, a missing key or a Google error answers 429/503 `{"fallback":true}` and the app falls back to `/live/search`.

Environment: `PLACES_API_KEY` (empty turns Places off), `EGO_MOCK=1` serves fake Ankara data; `EGO_BASE` overrides the EGO service URL.

```
npm install        # dev only: typescript, @types/node
npm test
npm run typecheck
npm start          # :8081
```
