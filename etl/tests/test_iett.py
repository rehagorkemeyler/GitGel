import pandas as pd
import pytest

from iett.clean import (fix_coord, fix_mojibake, interpolate_times, parse_routes,
                        parse_stops, segment_seconds, BUS)


def test_fix_mojibake():
    assert fix_mojibake("KADIKÃ–Y - KÄ°RAZLITEPE") == "KADIKÖY - KİRAZLITEPE"
    assert fix_mojibake("11CÃœ") == "11CÜ"
    assert fix_mojibake("BEŞİKTAŞ") == "BEŞİKTAŞ"  # already fine


def test_fix_coord():
    assert fix_coord("410.191.700.005.564") == pytest.approx(41.0191700005564)
    assert fix_coord("286.843.529.999.755") == pytest.approx(28.6843529999755)
    assert fix_coord("4,12E+14") is None
    assert fix_coord("") is None


def test_parse_stops_handles_broken_rows():
    text = (
        "stop_id;stop_code;stop_name;stop_desc;stop_lat;stop_lon;location_type;\n"
        "1;100001;RIFAT ILGAZ CADDESİ;direction: AVCILAR;410.191.700.005.564;286.843.529.999.755;0;\n"
        "2;291671;MARMARA ÜNİ; İKTİSAT FAKÜLTESİ;direction: X;410.104.540.005.549;286.886.289.999.758;0;\n"
        "3;188081;HAMAM ÇEŞME CADDESİ;;direction: GİDİŞ;4,12E+14;2,83E+14;\n"
    )
    df, bad = parse_stops(text)
    assert bad == 1
    assert list(df["stop_id"]) == ["1", "2"]
    assert df.iloc[1]["stop_name"] == "MARMARA ÜNİ / İKTİSAT FAKÜLTESİ"
    assert df.iloc[1]["stop_desc"] == "direction: X"


def test_parse_routes_joins_broken_lines():
    text = (
        "route_id;agency_id;route_short_name;route_long_name;route_type;route_desc;route_code\n"
        "1;1;1;KADIKÃ–Y - KÄ°RAZLITEPE;3;;1_D_D0\n"
        "2;1;34;A - B;3;SEFERLER\n"
        ";;34_D_D1;;;;\n"
    )
    df = parse_routes(text)
    assert list(df["route_id"]) == ["1", "2"]
    assert df.iloc[0]["route_long_name"] == "KADIKÖY - KİRAZLITEPE"
    assert df.iloc[1]["route_color"] == "E30613"  # metrobüs


def test_segment_speed_grows_with_hop_length():
    import numpy as np
    t = segment_seconds(np.array([300.0, 3000.0]), BUS)
    assert (3000.0 / (t[1] - BUS["dwell"])) > (300.0 / (t[0] - BUS["dwell"]))


def test_interpolate_times_monotonic():
    stops = pd.DataFrame({"stop_id": ["a", "b", "c"], "stop_lat": [41.0, 41.005, 41.01],
                          "stop_lon": [29.0, 29.0, 29.0]})
    st = pd.DataFrame({"trip_id": ["t"] * 3, "stop_id": ["a", "b", "c"], "stop_sequence": [1, 2, 3],
                       "departure_time": ["23:59:00", None, None]})
    trips = pd.DataFrame({"trip_id": ["t"], "route_id": ["r"]})
    routes = pd.DataFrame({"route_id": ["r"], "route_short_name": ["15F"]})
    out = interpolate_times(st, stops, trips, routes)
    times = list(out["arrival_time"])
    assert times[0] == "23:59:00"
    assert times == sorted(times) and times[2] > "24:00:00"
    assert list(out["timepoint"]) == [1, 0, 0]
