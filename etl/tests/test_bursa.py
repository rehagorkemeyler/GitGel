import datetime as dt
import json
from pathlib import Path

import pytest

from bursa.burulas_api import mode_of, parse_search, parse_shapes, parse_stops, parse_times, split_code, stops_index
from bursa.gtfs import build, name_tr, stop_name

SAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api-samples" / "bursa"


def sample(name: str) -> str:
    return (SAMPLES / name).read_text(encoding="utf-8")


def test_modes_and_stop_codes():
    assert [mode_of(c) for c in ("M1", "M2", "T1", "T3", "38", "B17A", "19İ", "MX")] == \
        ["metro", "metro", "tram", "tram", "bus", "bus", "bus", "bus"]
    assert split_code("KENT MEYDANI 1 (D0441)") == ("KENT MEYDANI 1", "D0441")
    assert split_code("T1-ADLİYE (B69)") == ("T1-ADLİYE", "B69")
    assert split_code("SU UÇTU TABİAT PARKI VE ŞELALESİ 2 (MK0053)") == ("SU UÇTU TABİAT PARKI VE ŞELALESİ 2", "MK0053")
    assert split_code("OTOGAR") == ("OTOGAR", "")


def test_search_gives_lines_and_stops_and_drops_junk():
    lines, stops = parse_search(sample("routeandstation_T1.json"))
    assert lines == {1401: {"code": "T1", "no": 1401, "mode": "tram"}}
    assert stops[107] == {"name": "T1-ADLİYE", "code": "B69", "lat": 40.193454, "lon": 29.069909}
    junk = json.dumps({"statusCode": 200, "result": [
        {"type": "R", "kod": "GÖREVLİ", "hatNo": 65536}, {"type": "R", "kod": "Hat Seçilmemiş", "hatNo": 65535},
        {"type": "S", "stationId": 1, "stationName": "X (D1)", "latitude": 40, "longitude": 28}]})
    assert parse_search(junk) == ({}, {})


def test_line_stops_shape_and_times():
    st = parse_stops(sample("routestat_1012.json"))
    assert list(st) == ["R"]
    assert st["R"][0] == {"seq": 1, "stop": "4677", "name": "TERMİNAL PERON 1", "lat": 40.26453, "lon": 29.05438}
    assert [s["seq"] for s in st["R"]] == sorted(s["seq"] for s in st["R"])
    sh = parse_shapes(sample("routecoordinate_1012.json"))
    assert sh["R"][0] == [40.26453, 29.05438] and len(sh["R"]) >= 10
    t = parse_times(sample("schedulebystop_1012_R.json"))
    assert t["wk"][:3] == [360, 390, 410] and t["sat"] == [] and t["sun"] == []


def test_stop_listed_twice_in_a_row_counts_once():
    row = lambda seq, stop: {"stopId": stop, "stopName": "X", "sequence": seq, "latitude": "40.2", "longitude": "29.0", "direction": "G"}  # noqa: E731
    doc = json.dumps({"statusCode": 200, "result": [row(1, 5), row(2, 7), row(3, 7), row(4, 5)]})
    assert [s["stop"] for s in parse_stops(doc)["G"]] == ["5", "7", "5"]


def test_error_answer_raises():
    with pytest.raises(ValueError):
        parse_stops('{"statusCode": 500, "message": "Hata", "result": null}')


def test_names():
    assert name_tr("ALİ OSMAN SÖNMEZ E.M.L 1") == "Ali Osman Sönmez E.M.L 1"
    assert name_tr("NİLÜFER OSB") == "Nilüfer OSB"
    assert name_tr("SAMANLI İ.Ö.O.") == "Samanlı İ.Ö.O."
    assert name_tr("M.KEMALPAŞA CD. U.Ü.DEVLET") == "M.Kemalpaşa Cd. U.Ü.Devlet"
    assert stop_name("KENT MEYDANI 4", "bus") == "Kent Meydanı 4"
    assert stop_name("EMEK İST. 2", "metro") == "Emek İstasyonu"
    assert stop_name("MERİNOS İST.1", "metro") == "Merinos İstasyonu"
    assert stop_name("T1-ADLİYE", "tram") == "Adliye"
    assert stop_name("T1-KENT MEYDANI", "tram") == "Kent Meydanı"


def test_stops_index_takes_codes_from_search_and_skips_unknown_positions():
    lines = [{"dirs": [{"stops": [
        {"stop": "564", "name": "KENT MEYDANI 1", "lat": 40.19744, "lon": 29.0599},
        {"stop": "107", "name": "T1-ADLİYE", "lat": None, "lon": None},
        {"stop": "9", "name": "YOK", "lat": None, "lon": None}]}]}]
    search = {564: {"name": "KENT MEYDANI 1", "code": "D0441", "lat": 40.19744, "lon": 29.0599},
              107: {"name": "T1-ADLİYE", "code": "B69", "lat": 40.193454, "lon": 29.069909}}
    assert stops_index(lines, search) == {
        "564": {"name": "KENT MEYDANI 1", "code": "D0441", "lat": 40.19744, "lon": 29.0599},
        "107": {"name": "T1-ADLİYE", "code": "B69", "lat": 40.193454, "lon": 29.069909}}


def test_gtfs_trips_per_direction_with_mode_speeds(tmp_path):
    # Two stops ~1.1 km apart on a straight street, the same line as bus and as metro.
    stops = {"1": {"name": "A 1", "code": "D1", "lat": 40.19, "lon": 29.05},
             "2": {"name": "B 1", "code": "D2", "lat": 40.20, "lon": 29.05}}
    def line(no, code, mode):
        return {"no": no, "code": code, "mode": mode, "dirs": [
            {"dir": "G", "stops": [{"seq": 1, "stop": "1", "name": "A 1"}, {"seq": 2, "stop": "2", "name": "B 1"}],
             "shape": [], "times": {"wk": [360, 1450 - 1440], "sat": [], "sun": []}},
            {"dir": "D", "stops": [{"seq": 1, "stop": "2", "name": "B 1"}, {"seq": 2, "stop": "1", "name": "A 1"}],
             "shape": [], "times": {"wk": [], "sat": [], "sun": [480]}}]}
    stats = build([line(1, "38", "bus"), line(2, "M1", "metro"), {"no": 3, "code": "X", "mode": "bus", "dirs": []}],
                  stops, dt.date(2026, 9, 30), tmp_path)
    assert stats["lines"] == 2 and stats["skipped"] == ["X"] and stats["directions"] == 4
    trips = (tmp_path / "trips.txt").read_text().splitlines()
    assert trips[0].startswith("route_id")
    # Stops shared with the metro line are named as stations, headsigns too.
    assert "br_1,br_sun,br_1_D_sun_0,A,1,br_1_D" in trips
    st = [r.split(",") for r in (tmp_path / "stop_times.txt").read_text().splitlines()[1:]]
    times = {(r[0], r[4]): r[1] for r in st}
    # 00:10 after a 06:00 departure is the same service day's night trip.
    assert times[("br_1_G_wk_1", "1")] == "24:10:00"
    bus = int(times[("br_1_G_wk_0", "2")][3:5])
    metro = int(times[("br_2_G_wk_0", "2")][3:5])
    assert 3 <= bus <= 5 and metro < bus
    routes = (tmp_path / "routes.txt").read_text()
    assert "br_2,burulas,M1,A - B,1,0B6FB8,FFFFFF" in routes
    assert "br_1,D1,A,40.19,29.05" in (tmp_path / "stops.txt").read_text()


def test_long_names():
    from bursa.gtfs import long_name
    ring = {"mode": "tram", "dirs": [{"stops": [{"name": "T1-KENT MEYDANI"}, {"name": "T1-ADLİYE"}, {"name": "T1-KENT MEYDANI"}]}]}
    assert long_name(ring) == "Kent Meydanı - Ring"
    bus = {"mode": "bus", "dirs": [{"stops": [{"name": "TERMİNAL PERON 1"}, {"name": "GÖRÜKLE 3"}]}]}
    assert long_name(bus) == "Terminal Peron - Görükle"
    assert long_name({"mode": "bus", "dirs": []}) == ""
