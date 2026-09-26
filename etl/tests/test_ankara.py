from pathlib import Path

from ankara.ego_web import parse_line_list, parse_line_page, parse_times

PAGE = (Path(__file__).parent / "ego_481.html").read_text(encoding="utf-8")


def test_line_list_has_all_modes():
    lines = parse_line_list(PAGE)
    assert {"code": "101", "name": "GÖLBAŞI-HAYMANA YOLU-BAHÇELİEVLER", "mode": "bus", "field": "hat_no1"} in lines
    assert [x["code"] for x in lines if x["mode"] == "metro"] == ["M1-D", "M1-G", "M4-D"]
    assert [x["field"] for x in lines if x["mode"] == "ankaray"] == ["hat_no3", "hat_no3"]


def test_line_page_meta_times_and_stops():
    p = parse_line_page(PAGE)
    assert p["code"] == "481" and p["km"] == 43 and p["minutes"] == 170
    assert p["from"] == "UYANIŞ MH.1090.SK.KEÇİÖREN/ANKARA"
    assert p["note"].startswith("DİNİ VE RESMİ BAYRAMLARDA")
    assert [t["min"] for t in p["times"]["wk"]] == [377, 380, 385, 395, 410]
    assert p["times"]["wk"][0]["note"] == "21071DEN BAŞLAR /KARAPINARDAN 06:50"
    assert p["times"]["sat"][1] == {"min": 380, "note": None}
    assert [s["stop"] for s in p["stops"]] == ["40010", "42036", "40251", "40248"]
    assert p["stops"][2]["name"] == "ANKARA TİCARET ODASI İLKÖĞRETİM OKULU"


def test_times_in_notes_are_not_departures():
    t = parse_times("06:25 MHP &#214;N&#220;NDEN KARAPINARDAN 06:31<br />\n 06:35 -<br />")
    assert t == [{"min": 385, "note": "MHP ÖNÜNDEN KARAPINARDAN 06:31"}, {"min": 395, "note": None}]


def test_not_a_line_page():
    assert parse_line_page("<html>404</html>") is None


def test_station_names_and_stop_matching():
    from ankara.stops import build, station_key

    assert station_key("ÇAYYOLU İSTASYONU") == station_key("Çayyolu") == "CAYYOLU"
    assert station_key("ÜMİTKÖY METRO İSTASYONU") == "UMITKOY"
    stations = [{"name": "Kızılay", "lat": 39.92, "lon": 32.85}, {"name": "Kolej", "lat": 39.93, "lon": 32.86}]
    by_ref = {"12457": {"lat": 39.9, "lon": 32.86, "name": "Arjantin"}}
    lines = [
        {"code": "A1-G", "stops": [{"stop": "M1", "name": "15 TEMMUZ KIZILAY MİLLİ İRADE İSTASYONU"},
                                   {"stop": "A3", "name": "KOLEJ İSTASYONU"}]},
        {"code": "185-7", "stops": [{"stop": "12457", "name": "ARJANTİN"}, {"stop": "99999", "name": "YOK", "address": "X"}]},
        {"code": "391", "stops": [{"stop": "99999", "name": "YOK"}]},
    ]
    stops, unmatched = build(lines, by_ref, stations)
    assert stops["M1"]["lat"] == 39.92 and stops["A3"]["lat"] == 39.93
    assert stops["12457"] == {"name": "ARJANTİN", "lat": 39.9, "lon": 32.86}
    assert unmatched == [{"stop": "99999", "name": "YOK", "address": "X", "lines": ["185-7", "391"]}]


def test_gtfs_names_and_night_times():
    from ankara.gtfs import name_tr, service_minutes

    assert name_tr("(ÖHO) ORAN SİTESİ-GÜNEŞEVLER") == "(ÖHO) Oran Sitesi-Güneşevler"
    assert name_tr("AŞTİ-KIZILAY") == "AŞTİ-Kızılay"
    # 00:30 after an evening list belongs to the same service day
    assert service_minutes([{"min": 30}, {"min": 1380}, {"min": 400}]) == [400, 1380, 1470]


def test_out_and_back_line_follows_osm_both_ways():
    import numpy as np

    from ankara.gtfs import build_line, candidates

    # A straight street north, then back south on the same street: stops on both legs.
    street = np.array([(39.90 + i * 0.001, 32.85) for i in range(21)])
    stops = {str(i): {"name": f"S{i}", "lat": 39.90 + k * 0.004, "lon": 32.85} for i, k in
             enumerate([0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0])}
    line = {"stops": [{"stop": str(i)} for i in range(11)], "minutes": 20}
    b = build_line(line, stops, candidates([{"line": street, "line_in_order": street}]))
    assert b["fitted"]
    assert np.all(np.diff(b["offsets"]) > 0)
    assert abs(b["offsets"][-1] - 20 * 60) < 1e-6
    assert abs(b["offsets"][5] - 10 * 60) < 30  # turnaround halfway


def test_line_without_osm_route_uses_stop_to_stop_lines():
    from ankara.gtfs import build_line

    stops = {"a": {"name": "A", "lat": 39.9, "lon": 32.85}, "b": {"name": "B", "lat": 39.91, "lon": 32.85}}
    b = build_line({"stops": [{"stop": "a"}, {"stop": "x"}, {"stop": "b"}], "minutes": 0}, stops, [])
    assert b["stops"] == ["a", "b"] and not b["fitted"]
    assert len(b["shape"]) == 2
    assert abs(b["offsets"][-1] - 1112 / 1000 / 18 * 3600) < 5  # 18 km/h fallback
