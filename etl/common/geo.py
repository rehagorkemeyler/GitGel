"""Geometry helpers: distances, OSM route relation lines, projecting stops on lines."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

EARTH_M = 6371000.0


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * EARTH_M * np.arcsin(np.sqrt(a))


def _xy(pts: np.ndarray, lat0: float) -> np.ndarray:
    """Equirectangular projection in metres, good enough inside one city."""
    k = math.pi / 180 * EARTH_M
    return np.column_stack([pts[:, 1] * k * math.cos(math.radians(lat0)), pts[:, 0] * k])


def project(line: np.ndarray, pt: tuple[float, float]) -> tuple[float, float]:
    """Project (lat, lon) onto a polyline of (lat, lon). Returns (distance along line m, offset m)."""
    lat0 = float(line[:, 0].mean())
    xy = _xy(line, lat0)
    p = _xy(np.array([pt]), lat0)[0]
    a, b = xy[:-1], xy[1:]
    ab = b - a
    L2 = (ab ** 2).sum(1)
    t = np.clip(((p - a) * ab).sum(1) / np.where(L2 == 0, 1, L2), 0, 1)
    proj = a + ab * t[:, None]
    d = np.sqrt(((proj - p) ** 2).sum(1))
    i = int(d.argmin())
    seglen = np.sqrt(L2)
    along = float(seglen[:i].sum() + seglen[i] * t[i])
    return along, float(d[i])


def cut(line: np.ndarray, start_m: float, end_m: float) -> np.ndarray:
    """Sub-polyline between two distances along the line (start < end)."""
    lat0 = float(line[:, 0].mean())
    xy = _xy(line, lat0)
    seg = np.sqrt((np.diff(xy, axis=0) ** 2).sum(1))
    cum = np.concatenate([[0], np.cumsum(seg)])

    def at(m):
        i = int(np.clip(np.searchsorted(cum, m) - 1, 0, len(seg) - 1))
        t = 0 if seg[i] == 0 else (m - cum[i]) / seg[i]
        return line[i] + (line[i + 1] - line[i]) * np.clip(t, 0, 1)

    inner = line[(cum > start_m) & (cum < end_m)]
    return np.vstack([at(start_m), inner, at(end_m)])


def chain_ways(ways: list[list[tuple[float, float]]]) -> np.ndarray:
    """Join ordered way geometries into one polyline, flipping ways as needed."""
    ways = [w for w in ways if len(w) >= 2]
    if not ways:
        return np.empty((0, 2))
    out = list(ways[0])
    if len(ways) > 1:
        w1 = ways[1]
        # Orient the first way so that its end touches the second way.
        if out[0] in (w1[0], w1[-1]) and out[-1] not in (w1[0], w1[-1]):
            out.reverse()
    for w in ways[1:]:
        if w[0] == out[-1]:
            out.extend(w[1:])
        elif w[-1] == out[-1]:
            out.extend(reversed(w[:-1]))
        else:
            # Gap: connect to the nearer end.
            d0 = (w[0][0] - out[-1][0]) ** 2 + (w[0][1] - out[-1][1]) ** 2
            d1 = (w[-1][0] - out[-1][0]) ** 2 + (w[-1][1] - out[-1][1]) ** 2
            out.extend(w if d0 <= d1 else list(reversed(w)))
    return np.array(out)


def load_route_lines(pbf: Path, route_types: set[str]) -> list[dict]:
    """Read OSM route relations and build one polyline per relation.

    Returns [{id, route, ref, name, colour, line: ndarray[(lat, lon)],
              stops: [{osm_id, name, lat, lon}] in relation order}].
    """
    import osmium

    rels: list[dict] = []

    class Rels(osmium.SimpleHandler):
        def relation(self, r):
            t = r.tags
            if t.get("type") == "route" and t.get("route") in route_types:
                ways = [m.ref for m in r.members
                        if m.type == "w" and m.role in ("", "forward", "backward", "main")]
                stops = [m.ref for m in r.members if m.type == "n" and m.role.startswith("stop")]
                rels.append({"id": r.id, "route": t.get("route"), "ref": t.get("ref", ""),
                             "name": t.get("name", ""), "colour": t.get("colour", ""), "ways": ways,
                             "stop_nodes": stops})

    Rels().apply_file(str(pbf))
    need = {w for r in rels for w in r["ways"]}
    need_nodes = {n for r in rels for n in r["stop_nodes"]}
    geom: dict[int, list[tuple[float, float]]] = {}
    nodes: dict[int, dict] = {}

    class Ways(osmium.SimpleHandler):
        def node(self, n):
            if n.id in need_nodes and n.location.valid():
                nodes[n.id] = {"osm_id": n.id, "name": n.tags.get("name", ""),
                               "lat": n.location.lat, "lon": n.location.lon}

        def way(self, w):
            if w.id in need:
                try:
                    geom[w.id] = [(n.lat, n.lon) for n in w.nodes]
                except osmium.InvalidLocationError:
                    pass

    Ways().apply_file(str(pbf), locations=True)
    for r in rels:
        r["line"] = chain_ways([geom[w] for w in r.pop("ways") if w in geom])
        r["stops"] = [nodes[n] for n in r.pop("stop_nodes") if n in nodes]
    return [r for r in rels if len(r["line"]) >= 2]


def shape_for_stops(candidates: list[np.ndarray], stops: list[tuple[float, float]],
                    max_offset_m: float = 400.0) -> np.ndarray:
    """Pick the candidate line that fits the stops best and cut it to them.

    Falls back to straight segments between stops when nothing fits.
    """
    best, best_err = None, max_offset_m
    for line in candidates:
        proj = [project(line, s) for s in stops]
        err = max(p[1] for p in proj)
        along = [p[0] for p in proj]
        if along[0] > along[-1]:
            line = line[::-1]
            proj = [project(line, s) for s in stops]
            along = [p[0] for p in proj]
        monotonic = all(b >= a - 50 for a, b in zip(along, along[1:]))
        if err < best_err and monotonic and along[-1] > along[0]:
            best, best_err = cut(line, along[0], along[-1]), err
    if best is None:
        return np.array(stops)
    return best
