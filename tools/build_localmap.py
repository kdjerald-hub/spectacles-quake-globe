"""Build data/localdetail.ts: finer coastlines, land and place names for the alert's map of your area.

Usage:
    python3 -I tools/build_localmap.py \
        --places <ne_10m_populated_places_simple.geojson> \
        --land10 <ne_10m_land.geojson> --land50 <ne_50m_land.geojson> \
        --out data/localdetail.ts

The globe's 1:50m coastline is far too coarse for a map 100 km across, and the full 1:10m land
(about 446,000 points) is far too big for a Lens. So the 1:10m detail covers the earthquake regions
the project is for: Taiwan, Japan and the US West Coast. Elsewhere the map of your area falls back to
the 1:50m coastline. In the regions the coastline is the land's own outline (core/localmap.ts drops
the edges where a ring was cut at a region's box), so the coast and the land tint match exactly. Place names: every Natural Earth populated place inside those regions, plus the
major cities (scalerank 0-3) everywhere else. Land: the 1:10m land polygons clipped to the same regions,
and the 1:50m land polygons elsewhere, so the map can tint the land and leave the sea clear. Only outer
rings are kept (Natural Earth's land has one hole in each scale, a large lake far from these regions).

Source: Natural Earth v5.1.2, public domain (https://www.naturalearthdata.com/about/terms-of-use/),
from https://github.com/nvkelso/natural-earth-vector (tag v5.1.2).
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_geodata import dp, flat  # noqa: E402

# lon0, lat0, lon1, lat1. The boxes reach past each coast, so a map around any home inside still has
# the coastline to its edge.
REGIONS = [
    ("taiwan", "Taiwan", (118.0, 20.5, 123.5, 26.5)),
    ("japan", "Japan", (122.5, 24.0, 146.5, 46.0)),
    ("us_west", "US West Coast", (-125.5, 31.5, -114.0, 49.5)),
]
TOLERANCE_DEG = 0.002  # about 200 m: half a millimetre on a 24 cm map 100 km across
DIGITS = 3             # about 110 m
WORLD_PLACE_RANK = 3   # Natural Earth scalerank 0-3: major cities, for homes outside the regions
LAND50_TOLERANCE_DEG = 0.08  # like the globe's 1:50m coastline
LAND50_DIGITS = 2


def lines_of(geometry):
    t = geometry.get("type")
    if t == "LineString":
        return [geometry["coordinates"]]
    if t == "MultiLineString":
        return list(geometry["coordinates"])
    raise ValueError("unexpected geometry type: %r" % t)


def inside(p, box):
    return box[0] <= p[0] <= box[2] and box[1] <= p[1] <= box[3]


def clip_to_box(line, box):
    """Runs of consecutive points inside the box, each extended by its outside neighbours so the
    coastline reaches the box edge; the map clips again at its own circle."""
    runs, run = [], []
    for i, p in enumerate(line):
        if inside(p, box):
            if not run and i > 0:
                run.append(line[i - 1])
            run.append(p)
        elif run:
            run.append(p)
            runs.append(run)
            run = []
    if run:
        runs.append(run)
    return [r for r in runs if len(r) >= 2]


def clip_ring_to_box(ring, box):
    """Sutherland-Hodgman: the part of a closed ring inside the box (convex), as a closed ring."""
    def clip(points, inside_fn, cross_fn):
        out = []
        for i, cur in enumerate(points):
            prev = points[i - 1]
            if inside_fn(cur):
                if not inside_fn(prev):
                    out.append(cross_fn(prev, cur))
                out.append(cur)
            elif inside_fn(prev):
                out.append(cross_fn(prev, cur))
        return out

    def at_x(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))

    def at_y(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)

    x0, y0, x1, y1 = box
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    for inside_fn, cross_fn in ((lambda p: p[0] >= x0, at_x(x0)), (lambda p: p[0] <= x1, at_x(x1)),
                                (lambda p: p[1] >= y0, at_y(y0)), (lambda p: p[1] <= y1, at_y(y1))):
        if not pts:
            break
        pts = clip(pts, inside_fn, cross_fn)
    return pts


def outer_rings(feature_collection):
    for feat in feature_collection["features"]:
        g = feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            yield [(float(x), float(y)) for x, y in poly[0]]


def ring_coords(ring, tol, digits):
    """A closed ring, simplified and rounded, as a flat [lon, lat, ...] list without the closing point."""
    closed = list(ring) + [ring[0]]
    simple = dp(closed, tol)[:-1]
    coords = []
    for x, y in simple:
        pt = [round(x, digits), round(y, digits)]
        if len(coords) < 2 or coords[-2:] != pt:
            coords += pt
    if len(coords) >= 4 and coords[:2] == coords[-2:]:
        coords = coords[:-2]
    return coords if len(coords) >= 6 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--places", required=True)
    ap.add_argument("--land10", required=True)
    ap.add_argument("--land50", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    places = json.load(open(args.places, encoding="utf-8"))
    if places.get("type") != "FeatureCollection":
        raise ValueError("not a FeatureCollection")

    land10, land10_points = [], 0
    land10_src = list(outer_rings(json.load(open(args.land10, encoding="utf-8"))))
    for k, (_, _, box) in enumerate(REGIONS):
        earlier = [b for _, _, b in REGIONS[:k]]
        for ring in land10_src:
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            if max(xs) < box[0] or min(xs) > box[2] or max(ys) < box[1] or min(ys) > box[3]:
                continue
            # an island already wholly inside an earlier (overlapping) box is not filled twice
            if any(min(xs) >= b[0] and max(xs) <= b[2] and min(ys) >= b[1] and max(ys) <= b[3] for b in earlier):
                continue
            clipped = clip_ring_to_box(ring, box)
            if len(clipped) < 3:
                continue
            coords = ring_coords(clipped, TOLERANCE_DEG, DIGITS)
            if coords:
                land10.append(coords)
                land10_points += len(coords) // 2
    land50, land50_points = [], 0
    for ring in outer_rings(json.load(open(args.land50, encoding="utf-8"))):
        coords = ring_coords(ring, LAND50_TOLERANCE_DEG, LAND50_DIGITS)
        if coords:
            land50.append(coords)
            land50_points += len(coords) // 2

    chosen = {}
    for feat in places["features"]:
        p = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"]
        rank = int(p.get("scalerank", 10))
        in_region = any(inside((lon, lat), box) for _, _, box in REGIONS)
        if not in_region and rank > WORLD_PLACE_RANK:
            continue
        name = (p.get("nameascii") or p.get("name") or "").strip()
        if not name:
            continue
        key = (name, round(lat, 2), round(lon, 2))
        chosen[key] = (name, round(lat, 3), round(lon, 3), rank)
    place_rows = sorted(chosen.values(), key=lambda r: (r[3], r[0]))

    out = []
    out.append("// Generated by tools/build_localmap.py from Natural Earth land (1:10m, 1:50m) and populated places.")
    out.append("// Natural Earth v5.1.2, public domain: https://www.naturalearthdata.com/about/terms-of-use/")
    out.append("// Detail regions: %s." % ", ".join(n for _, n, _ in REGIONS))
    out.append("// Places: %d (every populated place in the regions, plus scalerank 0-%d elsewhere)." % (len(place_rows), WORLD_PLACE_RANK))
    out.append("// Land: 1:10m in the regions, %d rings, %d points (Douglas-Peucker %s degree); 1:50m elsewhere,"
               % (len(land10), land10_points, TOLERANCE_DEG))
    out.append("// %d rings, %d points (Douglas-Peucker %s degree). Coastlines in the regions come from these rings."
               % (len(land50), land50_points, LAND50_TOLERANCE_DEG))
    out.append("// Do not edit by hand.")
    out.append("")
    out.append("/** A region with the finer coastline: [lon0, lat0, lon1, lat1] in degrees. */")
    out.append("export interface DetailRegion {")
    out.append("  id: string;")
    out.append("  name: string;")
    out.append("  box: [number, number, number, number];")
    out.append("}")
    out.append("")
    out.append("export const DETAIL_REGIONS: DetailRegion[] = [")
    for rid, name, box in REGIONS:
        out.append('  { id: "%s", name: "%s", box: [%s] },' % (rid, name, flat(box, 3)))
    out.append("];")
    out.append("")
    out.append("/** Land: closed outer rings, flat [lon0, lat0, lon1, lat1, ...] without the closing point. */")
    out.append("export const LAND_10M_DETAIL: number[][] = [")
    for coords in land10:
        out.append("  [%s]," % flat(coords, DIGITS))
    out.append("];")
    out.append("")
    out.append("export const LAND_50M: number[][] = [")
    for coords in land50:
        out.append("  [%s]," % flat(coords, LAND50_DIGITS))
    out.append("];")
    out.append("")
    out.append("/** A place name; rank is Natural Earth's scalerank (0 = most prominent). */")
    out.append("export interface Place {")
    out.append("  name: string;")
    out.append("  lat: number;")
    out.append("  lon: number;")
    out.append("  rank: number;")
    out.append("}")
    out.append("")
    out.append("export const PLACES: Place[] = [")
    for name, lat, lon, rank in place_rows:
        out.append("  { name: %s, lat: %s, lon: %s, rank: %d }," % (json.dumps(name), flat([lat], 3), flat([lon], 3), rank))
    out.append("];")
    out.append("")
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))
    print("%s: %d places, land %d+%d rings, %d+%d points, %d bytes"
          % (args.out, len(place_rows), len(land10), len(land50), land10_points, land50_points,
             os.path.getsize(args.out)))


if __name__ == "__main__":
    main()
