# Bursa (BURULAŞ / BursaKart) samples

Captured 2026-09-30 ~12:20 Bursa time from the service behind https://www.bursakart.com.tr/wheremybus. No key, no login.

- Base `https://bursakartapi.abys-web.com/api/static/`, every call `POST` with a JSON body.
- Needs `Origin: https://www.bursakart.com.tr` (and `Referer`). Without it: HTTP 403 `Access denied: invalid origin`.
- A wrong body type (e.g. a stop id as string) gives HTTP 400 with an ASP.NET validation error.
- An unknown line gives `{"statusCode":200,"result":[]}`.
- Driver names (`surucu`) are replaced by "AD SOYAD" in these files. Never store or forward them.

| Endpoint | Body | File | Notes |
|---|---|---|---|
| realtimedata | `{"keyword":"38"}` | realtimedata_38.json, realtimedata_T1.json | Live vehicles of a line. Trams (T1, T2) too, plate like "T1-251-A". See fields below |
| stationremainingtime | `{"keyword":565}` (number) | stationremainingtime_565.json, _4702.json | Buses coming to a stop, sorted by time. `passTime` = `realTime` = remaining time "HH:MM:SS" (minute precision, "00:00:00" = at the stop). `vehicleLat/Lng` are always 40/29 and `vehicleSpeed` 0: useless, match by `licencePlate` instead. `routeId` = hatNo. `direction` R/G/D. No "stops away" |
| RouteByStop | `{"keyword":4702}` (number) | RouteByStop_4702.json | Lines at a stop: `routeNo` (hatNo), `routeCode` |
| routeandstation | `{"keyword":"T1"}` | routeandstation_T1.json | Search. Lines `type:"R"` (`kod`, `hatNo`), stops `type:"S"` (`stationName` ends in the stop code, e.g. "(B69)", "(D0441)") |
| activestations | `{}` | activestations.json | Returned only 20 rows (placeholder coords 40/28): not a full stop list. Use routestat per line instead |
| routestat | `{"routeCode":1012}` (hatNo) | routestat_1012.json | Ordered stops (`stopId`, `stopName`, `sequence`, lat/lon as strings, `direction`) |
| routecoordinate | `{"keyword":"1012"}` (hatNo as string) | routecoordinate_1012.json | Line shape; note the typo `logitude`. `routeDirection` R/G/D |
| schedulebystop | `{"direction":"R","routeId":1012,"stopSequenceNo":0,"weekday":0}` | schedulebystop_1012_R.json | Departures from the first stop, `routeDay` 1-7 |
| ScheduleByRoute | `{"stopId":565,"weekDay":3}` (1 = Monday ... 7 = Sunday) | ScheduleByRoute_stop565_day3.json | Times at a stop; contents looked like a terminal's timetable, check again in the ETL |

Rail: T1 (hatNo 1401) and T2 (1726) are in the service with live positions. BursaRay (metro) is not: only the night buses "Bursaray Gece 1/2" exist. Take BursaRay from OpenStreetMap.

## realtimedata fields

`validatorNo` stable bus id · `plaka` plate · `enlem`/`boylam` position · `hiz` km/h · `istikamet` G/D · `klimaVarMi`, `engelliUygunMu` 0/1 · `hatkodu` line code. `yon` is always 0 (no heading), `editDate` is empty (no fix time).

Passenger counts (card taps; Bursa buses are tap-in only, getting off is not counted):

- `seferYolcu`: boardings on this trip so far. Polled twice ~1 min apart: it only grew (25 → 32), and buses waiting at the terminal showed 0, so it resets per trip.
- `durakYolcu`: boardings since a recent point on the trip (grew 3 → 7 on the same bus); not used.
- `gunlukYolcu`: boardings today on this bus; not used.
