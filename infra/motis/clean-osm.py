#!/usr/bin/env python3
"""Make a city OSM extract safe for the MOTIS street-graph import.

    clean-osm.py in.osm.pbf out.osm.pbf

MOTIS (osr) aborts the whole import on two kinds of mapping quirks:
  1. a way whose nodes are missing: a road or power line that leaves the
     regional download (osmium extract cannot complete it);
  2. a node shared by more than 16 routable ways, e.g. a plaza drawn as 38
     pedestrian-area slices around one centre point.
This drops those ways (for 2, only the surplus, pedestrian areas first) and
prints what it dropped. Needs only python3 and osmium-tool.
"""
import subprocess
import sys
from collections import defaultdict

MAX_WAYS_PER_NODE = 16


def run(*args: str) -> str:
    return subprocess.run(["osmium", *args], check=True, capture_output=True, text=True).stdout


def main(src: str, dst: str) -> None:
    drop: set[str] = set()

    # 1. Ways with missing nodes ("n123 in w456").
    refs = subprocess.run(["osmium", "check-refs", "--show-ids", src], capture_output=True, text=True).stdout
    for line in refs.splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[1] == "in" and parts[2].startswith("w"):
            drop.add(parts[2])
    missing = len(drop)

    # 2. Nodes with too many highway ways. OPL: "w123 v1 ... Thighway=x,area=yes Nn1,n2,...".
    ways_at: dict[str, list[tuple[bool, str]]] = defaultdict(list)
    opl = run("tags-filter", "-R", src, "w/highway", "-f", "opl", "-o", "-")
    for line in opl.splitlines():
        if not line.startswith("w"):
            continue
        fields = line.split(" ")
        wid = fields[0]
        tags = next((f[1:] for f in fields if f.startswith("T")), "")
        nodes = next((f[1:] for f in fields if f.startswith("N")), "")
        is_area = "area=yes" in tags.split(",")
        # Count every occurrence: a closed ring starts and ends on the same node,
        # and MOTIS counts it twice there.
        for n in nodes.split(",") if nodes else ():
            ways_at[n].append((is_area, wid))
    crowded = 0
    for ways in ways_at.values():
        live = [w for w in ways if w[1] not in drop]
        if len(live) <= MAX_WAYS_PER_NODE:
            continue
        crowded += 1
        # Keep lines before areas; drop whole ways from the end until it fits.
        live.sort(key=lambda w: (w[0], w[1]))
        while len(live) > MAX_WAYS_PER_NODE:
            wid = live[-1][1]
            drop.add(wid)
            live = [w for w in live if w[1] != wid]

    if not drop:
        run("cat", "--overwrite", src, "-o", dst)
    else:
        ids = dst + ".drop.txt"
        with open(ids, "w") as f:
            f.write("\n".join(sorted(drop)) + "\n")
        run("removeid", "--overwrite", "-i", ids, src, "-o", dst)
    print(f"clean-osm: dropped {len(drop)} ways ({missing} with missing nodes, "
          f"surplus at {crowded} crowded nodes)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
