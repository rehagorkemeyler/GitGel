# Ankara live provider contract

GitGel shows Ankara live buses and stop arrivals through one file:
`live/src/providers/ego.ts`. Everything else (server routes, caching, the app)
depends only on the contract below.

## Source

The provider calls the JSON service behind EGO's "EGO Cepte" app
(`egocptsrvand.ego.gov.tr/mblSrv14/service.asp`, no key): `FNC=Otobus&HAT=`
for vehicles on a line, `FNC=Otobusler&DURAK=` for arrivals at a stop.
Endpoint discovery credit: EGO Mac (github.com/byigitt/egomac, MIT). Field notes
in docs/research.md section 8.6, samples in `docs/api-samples/ankara/`.
`EGO_BASE` overrides the service URL if EGO moves it.

## Functions

```ts
getVehiclesByLine(line: string): Promise<AnkaraVehicle[]>
getArrivalsByStop(stopNo: string): Promise<AnkaraArrival[]>
```

### AnkaraVehicle (map markers)

| Field | Type | Notes |
|---|---|---|
| id | string | Stable per bus (door or vehicle number). Used to animate a marker between updates |
| line | string | EGO line code as shown on the website, e.g. `185-7`, `391` |
| lat, lon | number | WGS84 decimal degrees. Drop records outside Ankara (lat 39.3 to 40.6, lon 31.8 to 33.8) |
| speed | number or null | km/h |
| heading | number or null | Degrees clockwise from north |
| plate | string or null | Normalized `06 HO 1327` (single spaces, no trailing dash) |
| features | string[] | Vehicle attributes from EGO, e.g. `Körüklü`, `Engelli` |
| updatedAt | string | ISO 8601 UTC time of the position fix. Ankara local time is UTC+3 |

Drop vehicles whose fix is older than 5 minutes.

### AnkaraArrival (stop panel)

| Field | Type | Notes |
|---|---|---|
| line | string | Line code |
| lineName | string | Human readable name, e.g. `(ÖHO) ORAN SİTESİ-GÜNEŞEVLER` |
| plate | string or null | Same normalization as above |
| features | string[] | As above |
| speed | number or null | km/h |
| etaSeconds | number | Integer, 0 means at the stop now. Never negative |
| stopsAway | number or null | Stops between the bus and this stop |

Return arrivals sorted by `etaSeconds`, live buses only. Buses that already
passed the stop are not returned. Schedule-only rows are not returned either;
the app builds those itself from GTFS.

## Rules

1. No new runtime dependencies. Use the global `fetch`.
2. Every upstream request has a timeout (use `AbortSignal.timeout(8000)`).
3. On any upstream failure, throw. The cache in `server.ts` then serves the last
   good value marked `stale`, and the app shows a calm message.
4. Do not poll on a timer. The server calls the functions only when a client asks,
   and the cache limits upstream calls to one per line or stop every 10 seconds.
   Do not lower those TTLs.
5. No secrets, keys, IPs or tokens in the repo. If configuration is needed, read it
   from environment variables and document them in `live/README.md`.
6. Parsing code must be pure functions (input text or JSON in, typed arrays out)
   so it can be tested without network.

## Tests

Add cases to `live/test/ankara.test.ts`:

1. Parser turns a saved sample response into the right `AnkaraVehicle[]`.
2. Parser turns a saved sample response into sorted `AnkaraArrival[]`.
3. Stale fixes, out-of-area coordinates and passed buses are dropped.
4. Plate normalization.

Save trimmed sample responses under `docs/api-samples/ankara/` with personal
data removed. Keep them small.

## Check

```
cd live
npm test          # all tests pass
npm run typecheck # no errors
EGO_MOCK=1 npm start   # mock data on :8081
curl ':8081/live/ankara/vehicles?line=185-7'
curl ':8081/live/ankara/arrivals?stop=11654'
```

HTTP responses: 200 with data, 400 for bad input, 503 when the source is down and no cached value is left.
