# API samples

Captured 2026-09-26 (Istanbul night, ~02:30) from a US cloud IP. No API key needed anywhere.

## Gateway behaviour

`api.ibb.gov.tr` is flaky: roughly half of requests return 503, time out or close the connection. Every client (ETL, live service) must retry with backoff (see `scripts/fetch.sh`, `scripts/metro_api.py`). It is not geo-blocked.

## Metro İstanbul (`https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/`)

| Endpoint | Method | File | Notes |
|---|---|---|---|
| GetLines | GET | metro_GetLines.json | 18 lines (F1, F4, M1A, M1B, M2–M9, T1, T3, T4, T5, TF1, TF2). No M11, Marmaray, T2, F2, M12 |
| GetStations | GET | metro_GetStations.json | 248 stations, lat/lon in DetailInfo |
| GetStationById/{LineId} | GET | metro_GetStationById_{1,3,14}.json | Ordered stations of one line |
| GetDirectionById/{LineId} | GET | metro_GetDirectionById_1.json | DirectionId per line, including short-turn patterns (M2 Sanayi–Seyrantepe) |
| GetDirections | GET | – | Returns 500 (server error) |
| GetServiceStatuses | GET | metro_GetServiceStatuses.json | Only lines with problems |
| GetAnnouncements/{tr,en} | GET | metro_GetAnnouncements_*.json | EN is empty |
| GetFailureTypes, GetFaultyEquipments | GET | metro_GetFailure*.json | Lift/escalator faults |
| GetTimeTable | POST | metro_GetTimeTable_*.json | See below |
| GetStationBetweenTime | POST | metro_GetStationBetweenTime_M2_dir34.json | See below |

### GetTimeTable (found by trial)

```json
{"BoardingStationId": 20, "DirectionId": 34, "DateTime": "2026-09-26T08:00:00"}
```

- `DirectionId` must be a real id from GetDirectionById (not 0/1); with a wrong id the server fails with a JSON parse error.
- With `DateTime`: departures in that hour of that date only. Without `DateTime`: today's full day (151 departures for M2 Yenikapı, incl. weekend night service).
- The date matters (weekday/Saturday/Sunday timetables differ).
- Times appear to be the departure times from the direction's first station (Osmanbey returned the same times as Yenikapı), so station times = departure + GetStationBetweenTime offset.

### GetStationBetweenTime (found by trial)

```json
{"BoardingStationId": 20, "DirectionId": 34}
```

Returns the whole direction's station order with cumulative minutes from the first station (`Time`, integer minutes). `AlightingStationId` and `DateTime` are accepted but ignored.

## İETT SOAP (`https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx`)

| Operation | File | Notes |
|---|---|---|
| GetHatOtoKonum_json(HatKodu) | iett_GetHatOtoKonum_json.xml | Empty `[]` at 02:30 for 500T (no service at night); field list in docs/research.md |
| GetFiloAracKonum_json() | iett_GetFiloAracKonum_json.sample.json | 6,921 vehicles, first 20 kept. Only `Saat` (HH:MM:SS, no date): filter stale records by time |

## metro.istanbul website

`/SeferDurumlari/AJAXSeferGetir` answers "Geçersiz işlem, lütfen web sitemiz üzerinden işlem yapınız" to non-browser calls. We do not use or work around it; the open API above covers the same data.
