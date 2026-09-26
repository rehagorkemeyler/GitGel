import datetime as dt

import numpy as np

from other.build import departures, find_stop, service_id, station_minutes
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
    # Past midnight: times continue above 24:00 on the same service day.
    assert departures([{"start": "23:58", "end": "01:28", "headway": 30}]) == [1438, 1468, 1498, 1528]


def test_service_id():
    assert service_id({"start": "06:00"}) == "oth_daily"
    assert service_id({"days": ["friday", "saturday"]}) == "oth_fri_sat"


def test_station_minutes_interpolates_missing_stops():
    stops = [{"name": n} for n in ["A", "B", "C", "D"]]
    along = np.array([0.0, 1000.0, 3000.0, 4000.0])
    cfg = {"stop_times": {"D": {"A": "23:50", "C": "00:05", "D": "00:10"}}}
    m = station_minutes(cfg, stops, along)[3]
    assert list(m) == [0, 5, 15, 20]


def test_find_stop():
    stops = [{"name": "Halkalı"}, {"name": "İstanbul Havalimanı"}]
    assert find_stop("Istanbul Havalimani", stops) == 1


def test_timetable_store_expires(tmp_path):
    from rail.build import TimetableStore, today_service
    st = TimetableStore(tmp_path / "t.json")
    st.put(34, "wk", dt.date(2026, 9, 1), ["06:00"])
    st.save()
    st2 = TimetableStore(tmp_path / "t.json")
    assert st2.get(34, "wk", dt.date(2026, 9, 10)) == ["06:00"]
    assert st2.get(34, "wk", dt.date(2026, 10, 1)) is None
    assert today_service(dt.date(2026, 9, 26)) == "sat"
