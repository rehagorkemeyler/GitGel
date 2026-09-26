import datetime as dt

from other.build import departures, find_stop
from rail.build import match_station, norm, rep_dates, segment_minutes, trip_minutes


def st(i, name, desc, lat, lon):
    return {"Id": i, "Name": name, "Description": desc, "DetailInfo": {"Latitude": str(lat), "Longitude": str(lon)}}


STATIONS = [st(1, "YENIKAPI", "Yenikapı", 41.0, 28.95), st(2, "VEZNECILER", "Vezneciler", 41.01, 28.96),
            st(3, "HISARUSTU-BOGAZICI UNIVERSITESI", "Hisarüstü", 41.02, 28.97)]


def test_norm_and_match():
    assert norm("Hacıosman") == "HACIOSMAN"
    assert norm("İskele Cami") == "ISKELECAMI"
    assert match_station("Yenikapı", STATIONS) == 0
    assert match_station("Hisarüstü-Boğaziçi Üniversitesi", STATIONS) == 2


def test_trip_minutes():
    assert trip_minutes("<li>Sefer S&uuml;resi: 2,5 Dakika (Tek Y&ouml;nde)</li>") == 2.5
    assert trip_minutes("<p>Sefer Süresi: 44 Dakika</p>") == 44
    assert trip_minutes("nothing") is None


def test_segment_minutes_scales_to_official_total():
    api = [[{"Id": 1, "Time": 0}, {"Id": 2, "Time": 3}, {"Id": 3, "Time": 3}]]  # 2->3 missing (0 diff)
    seg = segment_minutes(STATIONS, api, 10.0)
    assert abs(sum(seg) - 10.0) < 1e-6
    assert all(s > 0 for s in seg)


def test_rep_dates():
    d = rep_dates(dt.date(2026, 9, 26))  # Saturday
    assert d == {"wk": dt.date(2026, 9, 29), "sat": dt.date(2026, 10, 3), "sun": dt.date(2026, 9, 27)}


def test_departures():
    assert departures([{"start": "06:00", "end": "06:30", "headway": 15}]) == [360, 375, 390]


def test_find_stop():
    stops = [{"name": "Halkalı"}, {"name": "İstanbul Havalimanı"}]
    assert find_stop("Istanbul Havalimani", stops) == 1
