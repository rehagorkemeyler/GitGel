from pathlib import Path

import numpy as np

from ankara.ego_api import mode_of, parse_line, parse_lines, parse_shape, stops_index
from ankara.gtfs import build_line, name_tr, service_minutes

HERE = Path(__file__).parent
LINE = (HERE / "ego_hatbilgileri_481.json").read_text(encoding="utf-8")
LINES = (HERE / "ego_hatlar.json").read_text(encoding="utf-8")


def test_line_list_and_modes():
    lines = parse_lines(LINES)
    assert lines[0] == {"code": "101", "name": "GÖLBAŞI-HAYMANA YOLU-BAHÇELİEVLER", "mode": "bus"}
    assert {x["code"]: x["mode"] for x in lines[2:]} == {
        "113-5": "bus", "114-7": "bus", "M1-D": "metro", "A1-D": "ankaray", "B1-D": "suburban"}
    assert mode_of("ÖHO, OTOBÜS") == "bus"


def test_line_details_stops_times_and_shape():
    p = parse_line(LINE)
    assert (p["code"], p["mode"], p["minutes"], p["km"], p["note"]) == ("481", "bus", 170, 43, None)
    assert p["stops"][0] == {"seq": 1, "stop": "40010", "name": "GÜLBABA CD. 2.DURAK",
                             "address": p["stops"][0]["address"], "lat": p["stops"][0]["lat"], "lon": p["stops"][0]["lon"]}
    assert all(39.3 < s["lat"] < 40.6 and 31.8 < s["lon"] < 33.8 for s in p["stops"])
    assert [t["min"] for t in p["times"]["wk"]] == [377, 380, 385, 395]
    assert p["times"]["wk"][0]["note"] == "21071DEN BAŞLAR /KARAPINARDAN 06:50"
    assert p["times"]["wk"][1]["note"] is None
    assert len(p["times"]["sat"]) == 2 and p["times"]["sun"][-1]["min"] == 22 * 60 + 40
    assert len(p["shape"]) == 12 and p["shape"][0] == [40.008286, 32.866718]


def test_shape_and_stop_index_drop_bad_points():
    assert parse_shape("32.8,39.9,0 32.8,39.9,0 0,0,0 bad 32.9,39.95,0") == [[39.9, 32.8], [39.95, 32.9]]
    lines = [{"stops": [{"stop": "1", "name": "A", "lat": 39.9, "lon": 32.8}, {"stop": "2", "name": "B", "lat": None, "lon": None}]}]
    assert stops_index(lines) == {"1": {"name": "A", "lat": 39.9, "lon": 32.8}}


def test_gtfs_names_and_night_times():
    assert name_tr("(ÖHO) ORAN SİTESİ-GÜNEŞEVLER") == "(ÖHO) Oran Sitesi-Güneşevler"
    assert name_tr("AŞTİ-KIZILAY") == "AŞTİ-Kızılay"
    # 00:30 after an evening list belongs to the same service day
    assert service_minutes([{"min": 30}, {"min": 1380}, {"min": 400}]) == [400, 1380, 1470]


def test_out_and_back_line_follows_the_route_both_ways():
    # North along one street and back south on it: stops on both legs.
    street = np.array([(39.90 + i * 0.001, 32.85) for i in range(21)] + [(39.92 - i * 0.001, 32.85) for i in range(1, 21)])
    stops = {str(i): {"name": f"S{i}", "lat": 39.90 + k * 0.004, "lon": 32.85} for i, k in
             enumerate([0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0])}
    line = {"stops": [{"stop": str(i)} for i in range(11)], "minutes": 20}
    b = build_line(line, stops, [street])
    assert b["fitted"]
    assert np.all(np.diff(b["offsets"]) > 0)
    assert abs(b["offsets"][-1] - 20 * 60) < 1e-6
    assert abs(b["offsets"][5] - 10 * 60) < 30  # turnaround halfway


def test_line_without_shape_uses_stop_to_stop_lines():
    stops = {"a": {"name": "A", "lat": 39.9, "lon": 32.85}, "b": {"name": "B", "lat": 39.91, "lon": 32.85}}
    b = build_line({"stops": [{"stop": "a"}, {"stop": "x"}, {"stop": "b"}], "minutes": 0}, stops, [])
    assert b["stops"] == ["a", "b"] and not b["fitted"]
    assert len(b["shape"]) == 2
    assert abs(b["offsets"][-1] - 1112 / 1000 / 18 * 3600) < 5  # 18 km/h fallback


def test_calendar_starts_a_day_early_for_night_trips(tmp_path):
    """The nightly runs after midnight: yesterday's night trips (e.g. 185-6 at 02:00) must stay valid."""
    import csv
    import datetime as dt

    from ankara.gtfs import build

    stops = {"a": {"name": "A", "lat": 39.9, "lon": 32.85}, "b": {"name": "B", "lat": 39.91, "lon": 32.85}}
    times = {"wk": [{"min": 1415, "note": None}, {"min": 120, "note": None}], "sat": [], "sun": []}
    line = {"code": "185-6", "name": "X", "mode": "bus", "minutes": 30, "stops": [{"stop": "a"}, {"stop": "b"}],
            "times": times, "shape": []}
    build([line], stops, dt.date(2026, 9, 27), tmp_path)
    cal = list(csv.DictReader(open(tmp_path / "calendar.txt")))
    assert {c["start_date"] for c in cal} == {"20260926"}
    st = list(csv.DictReader(open(tmp_path / "stop_times.txt")))
    assert sorted({r["departure_time"] for r in st if r["stop_sequence"] == "1"}) == ["23:35:00", "26:00:00"]
