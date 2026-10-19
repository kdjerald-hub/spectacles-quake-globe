"""Build the map-detail data modules: label anchors, plate boundaries and a finer coastline.

Usage:
    python3 -I tools/build_geodata.py \
        --countries <ne_110m_admin_0_countries.geojson> \
        --marine <ne_110m_geography_marine_polys.geojson> \
        --coast50 <ne_50m_coastline.geojson> \
        --steps <PB2002_steps.json> \
        --plates <PB2002_plates.json> \
        --out data

Writes data/labels.ts, data/plates.ts and data/coastline50m.ts.

Sources:
- Natural Earth v5.1.2 (public domain): https://www.naturalearthdata.com/about/terms-of-use/
- PB2002 plate model (Bird 2003, G-cubed 4(3):1027) as GeoJSON from
  https://github.com/fraxen/tectonicplates, Open Data Commons Attribution License 1.0.
  Credit: Hugo Ahlenius, Nordpil and Peter Bird.
"""

import argparse
import json
import math
import os


def load(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def num(v, digits):
    s = ("%.*f" % (digits, v)).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def flat(coords, digits):
    return ",".join(num(c, digits) for c in coords)


# ---------------------------------------------------------------- simplification

def dp(points, tol):
    """Douglas-Peucker on (lon, lat) pairs; longitude scaled by cos(latitude) at the segment."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        k = math.cos(math.radians((ay + by) / 2))
        dx, dy = (bx - ax) * k, by - ay
        seg = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = (points[i][0] - ax) * k, points[i][1] - ay
            if seg == 0:
                d = px * px + py * py
            else:
                t = max(0.0, min(1.0, (px * dx + py * dy) / seg))
                ex, ey = px - t * dx, py - t * dy
                d = ex * ex + ey * ey
            if d > best:
                best, idx = d, i
        if idx >= 0 and best > tol * tol:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def rounded(points, digits):
    out = []
    last = None
    for lon, lat in points:
        q = (round(lon, digits), round(lat, digits))
        if q != last:
            out.append(q)
            last = q
    return out


# ---------------------------------------------------------------- coastline

def build_coast(src, tol, digits):
    data = load(src)
    lines = []
    pin = 0
    for f in data["features"]:
        g = f["geometry"]
        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for part in parts:
            pts = [(p[0], p[1]) for p in part]
            pin += len(pts)
            simple = dp(pts, tol)
            # A small island must not vanish: keep at least a triangle of its ring.
            if len(simple) < 4 and len(pts) >= 4:
                step = max(1, len(pts) // 3)
                simple = [pts[0], pts[step], pts[min(2 * step, len(pts) - 1)], pts[-1]]
            r = rounded(simple, digits)
            if len(r) >= 2:
                lines.append(r)
    return lines, pin


# ---------------------------------------------------------------- plates

CLASS_TEXT = {
    "SUB": "subduction zone",
    "OSR": "spreading ridge",
    "OTF": "oceanic transform fault",
    "CTF": "continental transform fault",
    "CRB": "continental rift",
    "CCB": "continental collision zone",
    "OCB": "oceanic convergent boundary",
}


def build_plates(steps_path, plates_path, tol, digits):
    names = {}
    for f in load(plates_path)["features"]:
        p = f["properties"]
        names[p["Code"]] = p["PlateName"]
    steps = [f["properties"] for f in load(steps_path)["features"]]
    # Runs of contiguous steps with the same boundary and class, in sequence order.
    steps.sort(key=lambda s: s["SEQNUM"])
    runs = []
    cur = None
    for s in steps:
        start = (s["STARTLONG"], s["STARTLAT"])
        end = (s["FINALLONG"], s["FINALLAT"])
        joined = (
            cur is not None
            and cur["bound"] == s["PLATEBOUND"]
            and cur["cls"] == s["STEPCLASS"]
            and abs(cur["pts"][-1][0] - start[0]) < 1e-3
            and abs(cur["pts"][-1][1] - start[1]) < 1e-3
        )
        if joined:
            cur["pts"].append(end)
        else:
            cur = {"bound": s["PLATEBOUND"], "cls": s["STEPCLASS"], "pts": [start, end]}
            runs.append(cur)
    out = []
    for r in runs:
        bound = r["bound"]
        # Bird (2003) writes subduction zones as A/B or A\B. Checked against intermediate-depth
        # quakes (tests/plates.test.ts): the overriding plate, where the slab dips, lies to the
        # left of the boundary's direction for "/" and to the right for "\".
        dip = 0
        if r["cls"] == "SUB":
            dip = 1 if "/" in bound else (-1 if "\\" in bound else 0)
        pts = rounded(dp(r["pts"], tol), digits)
        if len(pts) >= 2:
            sep = "/" if "/" in bound else ("\\" if "\\" in bound else "-")
            a, b = bound.split(sep)[:2] if sep in bound else (bound, "")
            out.append({"bound": bound, "a": a, "b": b, "cls": r["cls"], "dip": dip, "pts": pts})
    return out, names, len(steps)


# ---------------------------------------------------------------- labels

CONTINENTS = [
    ("EUROPE", 51, 20), ("ASIA", 45, 90), ("AFRICA", 8, 20), ("NORTH AMERICA", 45, -100),
    ("SOUTH AMERICA", -12, -58), ("AUSTRALIA", -25, 134), ("ANTARCTICA", -80, 60),
]

# Natural Earth gives ocean polygons but no label points; these anchors sit in open water.
# North and South parts of one ocean share a display name; the layout shows only one of them.
OCEANS = [
    ("North Pacific Ocean", "Pacific Ocean", [(28, -165), (30, 172), (12, -150)]),
    ("South Pacific Ocean", "Pacific Ocean", [(-28, -130), (-35, 175)]),
    ("North Atlantic Ocean", "Atlantic Ocean", [(33, -42), (15, -35)]),
    ("South Atlantic Ocean", "Atlantic Ocean", [(-25, -15)]),
    ("Indian Ocean", "Indian Ocean", [(-18, 78)]),
    ("Arctic Ocean", "Arctic Ocean", [(84, 0)]),
    ("Southern Ocean", "Southern Ocean", [(-62, 100)]),
]


def polygons(geom):
    return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]


def inside(rings, x, y):
    c = False
    for r in rings:
        n = len(r)
        j = n - 1
        for i in range(n):
            xi, yi = r[i]
            xj, yj = r[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                c = not c
            j = i
    return c


def edge_distance(rings, x, y):
    k = math.cos(math.radians(y))
    best = 1e18
    for r in rings:
        for i in range(len(r)):
            (x1, y1), (x2, y2) = r[i], r[(i + 1) % len(r)]
            ax, ay, bx, by, px, py = x1 * k, y1, x2 * k, y2, x * k, y
            dx, dy = bx - ax, by - ay
            L = dx * dx + dy * dy
            t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
            ex, ey = ax + t * dx - px, ay + t * dy - py
            best = min(best, ex * ex + ey * ey)
    return math.sqrt(best)


def interior_point(rings, steps=50):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    best = None
    for i in range(steps + 1):
        for j in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            y = y0 + (y1 - y0) * j / steps
            if inside(rings, x, y):
                d = edge_distance(rings, x, y)
                if best is None or d > best[0]:
                    best = (d, x, y)
    return best


def build_labels(countries_path, marine_path):
    out = []
    for f in load(countries_path)["features"]:
        p = {k.lower(): v for k, v in f["properties"].items()}
        name, long_ = p.get("name") or "", p.get("name_long") or ""
        text = long_ if long_ and len(long_) < len(name) else name
        out.append({"id": "c:" + p["adm0_a3"], "cls": "country", "text": text,
                    "lat": p["label_y"], "lon": p["label_x"],
                    "minLabel": p["min_label"], "maxLabel": p["max_label"], "rank": p["labelrank"]})
    for text, lat, lon in CONTINENTS:
        out.append({"id": "k:" + text, "cls": "continent", "text": text.title(), "lat": lat, "lon": lon,
                    "minLabel": 0, "maxLabel": 3.3, "rank": 0})
    marine = {}
    for f in load(marine_path)["features"]:
        p = {k.lower(): v for k, v in f["properties"].items()}
        marine[(p.get("name") or "").lower()] = (p, f["geometry"])
    for ne_name, text, anchors in OCEANS:
        p, _ = marine[ne_name.lower()]
        for i, (lat, lon) in enumerate(anchors):
            out.append({"id": "o:%s#%d" % (ne_name, i), "cls": "ocean", "text": text, "lat": lat, "lon": lon,
                        "minLabel": p["min_label"], "maxLabel": p["max_label"], "rank": p["scalerank"]})
    for key, (p, geom) in sorted(marine.items()):
        if p.get("featurecla") == "ocean":
            continue
        best = None
        for poly in polygons(geom):
            ip = interior_point([[(c[0], c[1]) for c in ring] for ring in poly], 40)
            if ip and (best is None or ip[0] > best[0]):
                best = ip
        if best is None:
            continue
        out.append({"id": "s:" + p["name"], "cls": "sea", "text": p["name"], "lat": round(best[2], 2),
                    "lon": round(best[1], 2), "minLabel": p["min_label"], "maxLabel": p["max_label"],
                    "rank": p["scalerank"]})
    return out


# ---------------------------------------------------------------- writers

HEADER_NE = "// Natural Earth v5.1.2, public domain: https://www.naturalearthdata.com/about/terms-of-use/\n"
HEADER_PB = (
    "// PB2002 plate model (Bird 2003, G-cubed 4(3):1027) via https://github.com/fraxen/tectonicplates\n"
    "// Open Data Commons Attribution License 1.0. Credit: Hugo Ahlenius, Nordpil and Peter Bird.\n"
)


def write_coast(path, lines, pin, tol):
    pts = sum(len(l) for l in lines)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/build_geodata.py from Natural Earth 1:50m coastlines. Do not edit by hand.\n")
        fh.write(HEADER_NE)
        fh.write("// %d polylines, %d points (from %d), Douglas-Peucker %.2f degree; every island is kept.\n"
                 % (len(lines), pts, pin, tol))
        fh.write("// Each polyline is a flat array [lon0, lat0, lon1, lat1, ...] in degrees.\n\n")
        fh.write("export const COASTLINE_50M: number[][] = [\n")
        fh.write(",\n".join("  [" + flat([c for p in l for c in p], 2) + "]" for l in lines))
        fh.write(",\n];\n")
    return pts


def write_plates(path, runs, names, nsteps):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/build_geodata.py from PB2002 steps. Do not edit by hand.\n")
        fh.write(HEADER_PB)
        fh.write("// %d boundary runs from %d steps.\n\n" % (len(runs), nsteps))
        fh.write("/** Boundary classes of the PB2002 model. */\n")
        fh.write("export type PlateBoundaryClass = %s;\n\n" % " | ".join('"%s"' % c for c in CLASS_TEXT))
        fh.write("export const PLATE_BOUNDARY_CLASS_TEXT: Record<PlateBoundaryClass, string> = {\n")
        for k, v in CLASS_TEXT.items():
            fh.write('  %s: "%s",\n' % (k, v))
        fh.write("};\n\n")
        fh.write("/** Plate codes to names. */\n")
        fh.write("export const PLATE_NAMES: Record<string, string> = {\n")
        for k in sorted(names):
            fh.write('  %s: %s,\n' % (k, json.dumps(names[k])))
        fh.write("};\n\n")
        fh.write("export interface PlateBoundaryRun {\n")
        fh.write("  /** PB2002 boundary name; for subduction zones the slash shows the polarity. */\n")
        fh.write("  bound: string;\n  a: string;\n  b: string;\n  cls: PlateBoundaryClass;\n")
        fh.write("  /** Subduction only: +1 if the slab dips to the left of the line's direction, -1 right, 0 none. */\n")
        fh.write("  dip: number;\n")
        fh.write("  /** Flat [lon0, lat0, lon1, lat1, ...] in degrees, in the boundary's direction. */\n")
        fh.write("  coords: number[];\n}\n\n")
        fh.write("export const PLATE_BOUNDARIES: PlateBoundaryRun[] = [\n")
        for r in runs:
            fh.write("  { bound: %s, a: %s, b: %s, cls: %s, dip: %d, coords: [%s] },\n" % (
                json.dumps(r["bound"]), json.dumps(r["a"]), json.dumps(r["b"]), json.dumps(r["cls"]),
                r["dip"], flat([c for p in r["pts"] for c in p], 2)))
        fh.write("];\n")


def write_labels(path, items):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/build_geodata.py. Do not edit by hand.\n")
        fh.write(HEADER_NE)
        fh.write("// Countries: admin-0 1:110m label points and zoom ranges. Continents and oceans: anchors chosen\n")
        fh.write("// by hand in open land or water (Natural Earth has polygons but no label points for them).\n")
        fh.write("// Seas: interior points of the 1:110m marine polygons. %d candidates.\n\n" % len(items))
        fh.write("export interface LabelCandidateData {\n")
        fh.write('  id: string;\n  cls: "ocean" | "continent" | "country" | "sea";\n  text: string;\n')
        fh.write("  lat: number;\n  lon: number;\n")
        fh.write("  /** Natural Earth MIN_LABEL / MAX_LABEL: web-map zoom range in which the label is drawn. */\n")
        fh.write("  minLabel: number;\n  maxLabel: number;\n  /** Lower is more important. */\n  rank: number;\n}\n\n")
        fh.write("export const LABEL_CANDIDATES: LabelCandidateData[] = [\n")
        for c in items:
            fh.write("  { id: %s, cls: %s, text: %s, lat: %s, lon: %s, minLabel: %s, maxLabel: %s, rank: %s },\n" % (
                json.dumps(c["id"], ensure_ascii=False), json.dumps(c["cls"]), json.dumps(c["text"], ensure_ascii=False),
                num(c["lat"], 2), num(c["lon"], 2), num(c["minLabel"], 1), num(c["maxLabel"], 1), num(c["rank"], 0)))
        fh.write("];\n")


def main():
    ap = argparse.ArgumentParser()
    for a in ("countries", "marine", "coast50", "steps", "plates", "out"):
        ap.add_argument("--" + a, required=True)
    ap.add_argument("--coast-tol", type=float, default=0.08)
    ap.add_argument("--plate-tol", type=float, default=0.05)
    args = ap.parse_args()

    lines, pin = build_coast(args.coast50, args.coast_tol, 2)
    pts = write_coast(os.path.join(args.out, "coastline50m.ts"), lines, pin, args.coast_tol)
    runs, names, nsteps = build_plates(args.steps, args.plates, args.plate_tol, 2)
    write_plates(os.path.join(args.out, "plates.ts"), runs, names, nsteps)
    labels = build_labels(args.countries, args.marine)
    write_labels(os.path.join(args.out, "labels.ts"), labels)
    sub = sum(1 for r in runs if r["cls"] == "SUB")
    print("coastline50m: %d polylines, %d points" % (len(lines), pts))
    print("plates: %d runs (%d subduction), %d plate names" % (len(runs), sub, len(names)))
    print("labels: %d candidates" % len(labels))


if __name__ == "__main__":
    main()
