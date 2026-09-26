import datetime as dt
import zipfile

from merge.build import merge
from static.build import fold, title_tr


def test_fold_and_title():
    assert fold("Kadıköy İDO") == "kadikoy ido"
    assert fold("ÜSKÜDAR") == "uskudar"
    assert title_tr("KADIKÖY İSKELE") == "Kadıköy İskele"
    assert title_tr("Already Mixed") == "Already Mixed"


def test_merge_unions_columns_and_drops_duplicate_keys(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir(), b.mkdir()
    (a / "stops.txt").write_text("stop_id,stop_name,stop_lat,stop_lon\n1,A,41,29\n")
    (b / "stops.txt").write_text("stop_id,stop_name,stop_lat,stop_lon,stop_code\n1,dup,0,0,x\n2,B,41,29,c\n")
    out = tmp_path / "g.zip"
    stats = merge([a, b], out, dt.date(2026, 9, 26))
    assert stats["stops"] == 2 and stats["stops_duplicates_dropped"] == 1
    with zipfile.ZipFile(out) as z:
        lines = z.read("stops.txt").decode().splitlines()
        assert lines[0] == "stop_id,stop_name,stop_lat,stop_lon,stop_code"
        assert lines[1] == "1,A,41,29,"
        assert "feed_info.txt" in z.namelist()
