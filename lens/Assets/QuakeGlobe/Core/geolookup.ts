// GENERATED from core/geolookup.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Distances on the sphere and "what is the nearest line?" lookups, for the quake details card
// (nearest plate boundary) and for label weighting. Pure functions, no platform dependencies.

export const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export type V3 = [number, number, number];

/** Longitude wrapped to [-180, 180). */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function unitVector(latDeg: number, lonDeg: number): V3 {
  const a = latDeg * DEG;
  const b = lonDeg * DEG;
  const c = Math.cos(a);
  return [c * Math.sin(b), Math.sin(a), c * Math.cos(b)];
}

function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** Angle between unit vectors (radians), stable for tiny and near-antipodal angles. */
export function angleBetween(a: V3, b: V3): number {
  return Math.atan2(norm(cross(a, b)), dot(a, b));
}

export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return angleBetween(unitVector(lat1, lon1), unitVector(lat2, lon2)) * EARTH_RADIUS_KM;
}

/** Angular distance (radians) from p to the minor great-circle arc a-b (all unit vectors). */
export function pointToArc(p: V3, a: V3, b: V3): number {
  const n0 = cross(a, b);
  const nl = norm(n0);
  if (nl < 1e-12) return angleBetween(p, a);
  const n: V3 = [n0[0] / nl, n0[1] / nl, n0[2] / nl];
  const s = dot(p, n);
  const q0: V3 = [p[0] - s * n[0], p[1] - s * n[1], p[2] - s * n[2]];
  const ql = norm(q0);
  if (ql > 1e-12) {
    const q: V3 = [q0[0] / ql, q0[1] / ql, q0[2] / ql];
    if (dot(cross(a, q), n) >= 0 && dot(cross(q, b), n) >= 0) return Math.asin(Math.min(1, Math.abs(s)));
  }
  return Math.min(angleBetween(p, a), angleBetween(p, b));
}

/** Compass direction (8 points) from a to b, for "120 km SE of ..." style text. */
export function compass8(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dl = (lon2 - lon1) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const brg = (Math.atan2(y, x) / DEG + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(brg / 45) % 8];
}

/** Edges per chunk: small enough to prune most of a long line, large enough to stay cheap. */
export const CHUNK_EDGES = 32;

/** Polylines with unit vectors and per-chunk bounding caps, built once (e.g. at startup). */
export interface PreparedPolylines {
  vecs: Float64Array[];
  chunks: { line: number; start: number; end: number; centre: V3; radius: number }[];
}

function vtx(a: Float64Array, i: number): V3 {
  return [a[3 * i], a[3 * i + 1], a[3 * i + 2]];
}

/** Bounding cap of the given unit vectors. Caps wider than a hemisphere are not convex: no bound. */
function capOf(points: V3[]): { centre: V3; radius: number } {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const v of points) {
    sx += v[0];
    sy += v[1];
    sz += v[2];
  }
  const l = Math.hypot(sx, sy, sz);
  const c: V3 = l > 1e-9 ? [sx / l, sy / l, sz / l] : [0, 1, 0];
  let rad = 0;
  for (const v of points) {
    const d = angleBetween(c, v);
    if (d > rad) rad = d;
  }
  return { centre: c, radius: rad < Math.PI / 2 ? rad : Math.PI };
}

/** Polylines are flat [lon0, lat0, lon1, lat1, ...] arrays in degrees. */
export function preparePolylines(polylines: number[][]): PreparedPolylines {
  const vecs: Float64Array[] = [];
  const chunks: PreparedPolylines["chunks"] = [];
  polylines.forEach((pl, li) => {
    const n = pl.length >> 1;
    const a = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) {
      const v = unitVector(pl[2 * i + 1], pl[2 * i]);
      a[3 * i] = v[0];
      a[3 * i + 1] = v[1];
      a[3 * i + 2] = v[2];
    }
    vecs.push(a);
    // Chunk k covers vertices [start, end] inclusive, i.e. edges start..end-1.
    for (let s = 0; s < Math.max(1, n - 1); s += CHUNK_EDGES) {
      const e = Math.min(n - 1, s + CHUNK_EDGES);
      const pts: V3[] = [];
      for (let i = s; i <= e; i++) pts.push(vtx(a, i));
      const cap = capOf(pts);
      chunks.push({ line: li, start: s, end: e, centre: cap.centre, radius: cap.radius });
    }
  });
  return { vecs, chunks };
}

/** Index of the closest polyline and the distance to it (km), skipping chunks that cannot win. */
export function nearestPreparedPolyline(prep: PreparedPolylines, lat: number, lon: number): { index: number; km: number } {
  const p = unitVector(lat, lon);
  // Visit chunks nearest-cap-first so the bound tightens quickly.
  const order = prep.chunks
    .map((c, i) => ({ i, lb: c.radius < Math.PI / 2 ? angleBetween(p, c.centre) - c.radius : 0 }))
    .sort((x, y) => x.lb - y.lb);
  let best = Infinity;
  let index = -1;
  for (const o of order) {
    if (o.lb > best) break;
    const c = prep.chunks[o.i];
    const a = prep.vecs[c.line];
    if (c.start === c.end) {
      const d = angleBetween(p, vtx(a, c.start));
      if (d < best) {
        best = d;
        index = c.line;
      }
      continue;
    }
    for (let i = c.start + 1; i <= c.end; i++) {
      const d = pointToArc(p, vtx(a, i - 1), vtx(a, i));
      if (d < best) {
        best = d;
        index = c.line;
      }
    }
  }
  return { index, km: best * EARTH_RADIUS_KM };
}

/** Brute-force reference for nearestPreparedPolyline (used by the tests). */
export function nearestPolyline(polylines: number[][], lat: number, lon: number): { index: number; km: number } {
  const p = unitVector(lat, lon);
  let best = Infinity;
  let index = -1;
  for (let k = 0; k < polylines.length; k++) {
    const pl = polylines[k];
    const n = pl.length >> 1;
    if (n === 0) continue;
    let prev = unitVector(pl[1], pl[0]);
    if (n === 1 && angleBetween(p, prev) < best) {
      best = angleBetween(p, prev);
      index = k;
    }
    for (let i = 1; i < n; i++) {
      const cur = unitVector(pl[2 * i + 1], pl[2 * i]);
      const d = pointToArc(p, prev, cur);
      if (d < best) {
        best = d;
        index = k;
      }
      prev = cur;
    }
  }
  return { index, km: best * EARTH_RADIUS_KM };
}
