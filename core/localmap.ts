// The alert's map of your area. On a 24 cm globe, 15 km is less than 0.3 mm, so home and the
// epicentre sit on one point; during the alert the Lens zooms into this map instead. It is flat,
// centred on home, north up, and every distance from home on it is true (an azimuthal equidistant
// projection). Land is tinted and the sea left clear, so the coast reads at a glance; coastlines and
// plate boundaries are drawn on top. Everything is projected and clipped to the map's circle; the
// map's radius follows the quake, so the epicentre always fits inside the outer ring.
// Pure functions, no platform dependencies. Units: km east (x) and km north (y) of home.
//
// The finer 1:10m land (data/localdetail.ts) covers Taiwan, Japan and the US West Coast, and there
// the coastline is the land's own outline, so the tint and the line match exactly. Elsewhere, and on
// maps wider than the detail allows, the map uses 1:50m land and the globe's 1:50m coastline.

import { COASTLINE_50M } from "../data/coastline50m.ts";
import { DETAIL_REGIONS, LAND_10M_DETAIL, LAND_50M, PLACES } from "../data/localdetail.ts";
import type { DetailRegion, Place } from "../data/localdetail.ts";
import { PLATE_BOUNDARIES } from "../data/plates.ts";
import { EARTH_RADIUS_KM, compass8 } from "./geolookup.ts";

export type { DetailRegion, Place };

const DEG = Math.PI / 180;

/** A point on the map: km east (x) and km north (y) of the centre. */
export interface LocalXY {
  x: number;
  y: number;
}

/**
 * Azimuthal equidistant projection centred on (lat0, lon0): the distance from the centre to the
 * result is the great-circle distance, and the direction is the true bearing (north = +y).
 */
export function projectLocal(lat0: number, lon0: number, lat: number, lon: number): LocalXY {
  const p0 = lat0 * DEG;
  const p = lat * DEG;
  const dl = (lon - lon0) * DEG;
  const cosC = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
  const c = Math.acos(Math.max(-1, Math.min(1, cosC)));
  const k = c < 1e-12 ? 1 : c / Math.sin(c);
  return {
    x: k * Math.cos(p) * Math.sin(dl) * EARTH_RADIUS_KM,
    y: k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl)) * EARTH_RADIUS_KM,
  };
}

/** Map radii to choose from (km). The last one reaches the antipode, so every epicentre fits. */
export const MAP_RADII_KM = [50, 100, 200, 500, 1000, 2000, 5000, 20100];
/** The map is never tighter than this: below it the coastline gives too little to go by. */
export const MIN_MAP_RADIUS_KM = 50;
/** The epicentre sits inside two thirds of the radius, clear of the rim and its ring label. */
export const EPICENTRE_MARGIN = 1.5;
/** Finer coastline only up to this radius: the detail regions end not far past their coasts. */
export const DETAIL_MAX_RADIUS_KM = 200;

/** The smallest map radius that holds the epicentre with a margin (15 km away: 50 km). */
export function mapRadiusKm(epicentreKm: number): number {
  const need = Math.max(MIN_MAP_RADIUS_KM, epicentreKm * EPICENTRE_MARGIN);
  for (const r of MAP_RADII_KM) if (r >= need) return r;
  return MAP_RADII_KM[MAP_RADII_KM.length - 1];
}

/** Distance rings for a map radius: a fifth, a half and the whole (50 km: 10, 25 and 50 km). */
export function ringsKm(radiusKm: number): number[] {
  return [radiusKm / 5, radiusKm / 2, radiusKm];
}

/** Ring label text, e.g. "10 km", "2,000 km" (no Intl: the Lens runtime may not have it). */
export function ringLabel(km: number): string {
  const digits = String(Math.round(km));
  let s = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) s += ",";
    s += digits[i];
  }
  return `${s} km`;
}

/** The part of segment a-b inside the circle of radius r about the origin, as [t0, t1], or null. */
function clipSegment(a: LocalXY, b: LocalXY, r: number): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (a.x * dx + a.y * dy);
  const qc = a.x * a.x + a.y * a.y - r * r;
  if (qa < 1e-12) return qc <= 0 ? [0, 1] : null;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-qb - s) / (2 * qa));
  const t1 = Math.min(1, (-qb + s) / (2 * qa));
  return t0 < t1 ? [t0, t1] : null;
}

/**
 * Projects polylines (flat [lon0, lat0, lon1, lat1, ...] in degrees) onto the map and clips them to
 * its circle. Returns flat [x0, y0, x1, y1, ...] polylines in km; a line that leaves and re-enters
 * the circle becomes two. Points far outside are skipped before projecting, so the whole 1:50m
 * coastline costs little.
 */
export function localPolylines(polylines: readonly number[][], lat0: number, lon0: number, radiusKm: number): number[][] {
  const out: number[][] = [];
  // A cheap pre-filter in degrees, with room for a whole segment (1:50m segments are well under 1 degree).
  const wide = radiusKm > 1500;
  const dLat = radiusKm / 111.2 + 1.5;
  const dLon = Math.min(180, dLat / Math.max(0.05, Math.cos(lat0 * DEG)));
  const near = (lon: number, lat: number): boolean => {
    if (wide) return true;
    if (Math.abs(lat - lat0) > dLat) return false;
    const dl = Math.abs(((((lon - lon0 + 180) % 360) + 360) % 360) - 180);
    return dl <= dLon;
  };
  for (const line of polylines) {
    let run: number[] = [];
    let prev: LocalXY | null = null;
    const flush = (): void => {
      if (run.length >= 4) out.push(run);
      run = [];
    };
    for (let i = 0; i + 1 < line.length; i += 2) {
      if (!near(line[i], line[i + 1])) {
        flush();
        prev = null;
        continue;
      }
      const q = projectLocal(lat0, lon0, line[i + 1], line[i]);
      if (prev !== null) {
        const seg = clipSegment(prev, q, radiusKm);
        if (seg === null) {
          flush();
        } else {
          const [t0, t1] = seg;
          if (run.length === 0 || t0 > 0) {
            flush();
            run.push(prev.x + (q.x - prev.x) * t0, prev.y + (q.y - prev.y) * t0);
          }
          run.push(prev.x + (q.x - prev.x) * t1, prev.y + (q.y - prev.y) * t1);
          if (t1 < 1) flush();
        }
      }
      prev = q;
    }
    flush();
  }
  return out;
}

/**
 * Coastlines from land rings (flat [lon, lat, ...], closed): each ring's outline, without the edges
 * where it was cut at a region's box (both ends on the same box edge), which are not coast.
 */
export function landRingsToCoast(rings: readonly number[][], regions: readonly DetailRegion[]): number[][] {
  const onSameBoxEdge = (ax: number, ay: number, bx: number, by: number): boolean =>
    regions.some((r) => {
      const [x0, y0, x1, y1] = r.box;
      const eq = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
      return (eq(ax, x0) && eq(bx, x0)) || (eq(ax, x1) && eq(bx, x1)) || (eq(ay, y0) && eq(by, y0)) || (eq(ay, y1) && eq(by, y1));
    });
  const out: number[][] = [];
  for (const ring of rings) {
    const n = ring.length / 2;
    if (n < 2) continue;
    // start the walk just after a cut edge, so a run never wraps around the ring's start
    let start = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (onSameBoxEdge(ring[2 * i], ring[2 * i + 1], ring[2 * j], ring[2 * j + 1])) {
        start = j;
        break;
      }
    }
    let run: number[] = [ring[2 * start], ring[2 * start + 1]];
    for (let s = 0; s < n; s++) {
      const i = (start + s) % n;
      const j = (i + 1) % n;
      if (onSameBoxEdge(ring[2 * i], ring[2 * i + 1], ring[2 * j], ring[2 * j + 1])) {
        if (run.length >= 4) out.push(run);
        run = [ring[2 * j], ring[2 * j + 1]];
      } else {
        run.push(ring[2 * j], ring[2 * j + 1]);
      }
    }
    if (run.length >= 4) out.push(run);
  }
  return out;
}

/** Signed area of a flat [x, y, ...] polygon (positive when counter-clockwise). */
export function polygonArea(p: readonly number[]): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  return a / 2;
}

/** Sides of the regular polygon that stands in for the map's circle when clipping land. */
const CIRCLE_SIDES = 96;

/** Sutherland-Hodgman: the part of a polygon inside the map's circle (a regular polygon inscribed in it). */
export function clipPolygonToCircle(p: readonly number[], r: number, sides = CIRCLE_SIDES): number[] {
  let pts = p.slice();
  for (let k = 0; k < sides && pts.length >= 6; k++) {
    const a0 = (2 * Math.PI * k) / sides;
    const a1 = (2 * Math.PI * (k + 1)) / sides;
    const ex = r * Math.cos(a0);
    const ey = r * Math.sin(a0);
    const fx = r * Math.cos(a1);
    const fy = r * Math.sin(a1);
    // inside = left of the edge e->f (the polygon runs counter-clockwise)
    const side = (x: number, y: number): number => (fx - ex) * (y - ey) - (fy - ey) * (x - ex);
    const out: number[] = [];
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const cx = pts[2 * i];
      const cy = pts[2 * i + 1];
      const px = pts[2 * ((i + n - 1) % n)];
      const py = pts[2 * ((i + n - 1) % n) + 1];
      const sc = side(cx, cy);
      const sp = side(px, py);
      if (sc >= 0) {
        if (sp < 0) {
          const t = sp / (sp - sc);
          out.push(px + (cx - px) * t, py + (cy - py) * t);
        }
        out.push(cx, cy);
      } else if (sp >= 0) {
        const t = sp / (sp - sc);
        out.push(px + (cx - px) * t, py + (cy - py) * t);
      }
    }
    pts = out;
  }
  return pts;
}

/** Douglas-Peucker on a closed flat [x, y, ...] ring; returns the kept points, still closed implicitly. */
function simplifyRing(p: readonly number[], tol: number): number[] {
  const n = p.length / 2;
  if (n <= 4 || tol <= 0) return p.slice();
  const keep = new Array<boolean>(n + 1).fill(false);
  keep[0] = keep[n] = true;
  const px = (i: number): number => p[2 * (i % n)];
  const py = (i: number): number => p[2 * (i % n) + 1];
  const stack: [number, number][] = [[0, n]];
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    const ax = px(a);
    const ay = py(a);
    const dx = px(b) - ax;
    const dy = py(b) - ay;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = len < 1e-12 ? Math.hypot(px(i) - ax, py(i) - ay) : Math.abs(dx * (py(i) - ay) - dy * (px(i) - ax)) / len;
      if (d > best) {
        best = d;
        idx = i;
      }
    }
    if (idx >= 0 && best > tol) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out;
}

/**
 * Ear clipping: triangles covering a simple polygon (flat [x, y, ...], either winding). Returns index
 * triples into the polygon's points, each triangle counter-clockwise. Only reflex vertices can sit
 * inside an ear, so only they are tested. If rounding leaves no clean ear, the vertex with the widest
 * convex angle is clipped anyway, so the loop always ends.
 */
export function triangulate(p: readonly number[]): number[] {
  const n = p.length / 2;
  if (n < 3) return [];
  let idx = Array.from({ length: n }, (_, i) => i);
  if (polygonArea(p) < 0) idx.reverse();
  const x = (i: number): number => p[2 * i];
  const y = (i: number): number => p[2 * i + 1];
  const cross = (a: number, b: number, c: number): number => (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a));
  const inTri = (q: number, a: number, b: number, c: number): boolean =>
    cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0;
  const out: number[] = [];
  while (idx.length > 3) {
    const m = idx.length;
    const reflex: number[] = [];
    for (let k = 0; k < m; k++) {
      if (cross(idx[(k + m - 1) % m], idx[k], idx[(k + 1) % m]) <= 0) reflex.push(idx[k]);
    }
    let ear = -1;
    let widest = -1;
    let widestCross = -Infinity;
    for (let k = 0; k < m && ear < 0; k++) {
      const a = idx[(k + m - 1) % m];
      const b = idx[k];
      const c = idx[(k + 1) % m];
      const cr = cross(a, b, c);
      if (cr <= 1e-12) continue;
      if (cr > widestCross) {
        widestCross = cr;
        widest = k;
      }
      let clear = true;
      for (const q of reflex) {
        if (q !== a && q !== b && q !== c && inTri(q, a, b, c)) {
          clear = false;
          break;
        }
      }
      if (clear) ear = k;
    }
    if (ear < 0) {
      if (widest < 0) {
        // every corner is flat or reflex: the rest has no area left; drop it
        return out;
      }
      ear = widest;
    }
    out.push(idx[(ear + m - 1) % m], idx[ear], idx[(ear + 1) % m]);
    idx = idx.slice(0, ear).concat(idx.slice(ear + 1));
  }
  if (cross(idx[0], idx[1], idx[2]) > 1e-12) out.push(idx[0], idx[1], idx[2]);
  return out;
}

/** A flat triangle mesh on the map: positions are [x0, y0, x1, y1, ...] in km. */
export interface LocalMesh {
  positions: number[];
  indices: number[];
}

/** Land is tinted only on maps up to this radius: beyond it the map is about direction, not coast. */
export const LAND_MAX_RADIUS_KM = 2000;

/**
 * Land polygons (closed rings, flat [lon, lat, ...]) projected onto the map, clipped to its circle and
 * triangulated. Rings far from the map are skipped before projecting; each clipped ring is simplified
 * to a tolerance that scales with the map (a 400th of its radius), which keeps triangulation cheap.
 */
export function localLand(rings: readonly number[][], lat0: number, lon0: number, radiusKm: number): LocalMesh {
  const mesh: LocalMesh = { positions: [], indices: [] };
  if (radiusKm > LAND_MAX_RADIUS_KM) return mesh;
  const dLat = radiusKm / 111.2 + 0.5;
  const dLon = Math.min(180, dLat / Math.max(0.05, Math.cos(lat0 * DEG)));
  const lonOff = (lon: number): number => ((((lon - lon0 + 180) % 360) + 360) % 360) - 180;
  for (const ring of rings) {
    // skip rings whose bounding box misses the map's window
    let latMin = Infinity;
    let latMax = -Infinity;
    let offMin = Infinity;
    let offMax = -Infinity;
    for (let i = 0; i + 1 < ring.length; i += 2) {
      latMin = Math.min(latMin, ring[i + 1]);
      latMax = Math.max(latMax, ring[i + 1]);
      const o = lonOff(ring[i]);
      offMin = Math.min(offMin, o);
      offMax = Math.max(offMax, o);
    }
    if (latMax < lat0 - dLat || latMin > lat0 + dLat || offMax < -dLon || offMin > dLon) continue;
    const projected: number[] = [];
    for (let i = 0; i + 1 < ring.length; i += 2) {
      const q = projectLocal(lat0, lon0, ring[i + 1], ring[i]);
      projected.push(q.x, q.y);
    }
    const ccw = polygonArea(projected) >= 0 ? projected : reversePoints(projected);
    const clipped = simplifyRing(clipPolygonToCircle(ccw, radiusKm), radiusKm / 400);
    if (clipped.length < 6 || Math.abs(polygonArea(clipped)) < 1e-9 * radiusKm * radiusKm) continue;
    const base = mesh.positions.length / 2;
    for (const v of clipped) mesh.positions.push(v);
    for (const i of triangulate(clipped)) mesh.indices.push(base + i);
  }
  return mesh;
}

function reversePoints(p: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}

/** True when (lat, lon) lies in one of the regions with the finer coastline. */
export function inDetailRegion(lat: number, lon: number, regions: readonly DetailRegion[] = DETAIL_REGIONS): boolean {
  return regions.some((r) => lon >= r.box[0] && lon <= r.box[2] && lat >= r.box[1] && lat <= r.box[3]);
}

/** A place name placed on the map. */
export interface LocalPlace extends LocalXY {
  name: string;
  km: number;
  rank: number;
}

/** The epicentre on the map, with its distance and the compass direction from home ("S"). */
export interface LocalEpicentre extends LocalXY {
  km: number;
  compass: string;
}

/** Everything the Lens draws for the map of your area. */
export interface LocalMap {
  radiusKm: number;
  ringsKm: number[];
  coast: number[][];
  plates: number[][];
  /** Place names inside the map, most prominent first; the place at home is in homePlace instead. */
  places: LocalPlace[];
  /** The name of the place at home, if one is within a few km (e.g. "Hualien"), else "". */
  homePlace: string;
  epicentre: LocalEpicentre;
  /** True when the finer 1:10m coastline and land are drawn, false for the 1:50m fallback. */
  detail: boolean;
  /** The land, to tint (the sea stays clear): triangles in km, inside the map's circle. */
  land: LocalMesh;
}

export interface LocalMapInput {
  home: { lat: number; lon: number };
  epicentre: { lat: number; lon: number };
  /** Coastlines for the detail regions (the 1:10m land's outline, see landRingsToCoast). */
  detailCoast: readonly number[][];
  detailRegions: readonly DetailRegion[];
  coarseCoast: readonly number[][];
  /** Land rings (flat [lon, lat, ...], closed): 1:10m in the regions, 1:50m elsewhere. */
  detailLand: readonly number[][];
  coarseLand: readonly number[][];
  plates: readonly number[][];
  places: readonly Place[];
  /** At most this many place names besides home (default 6). */
  maxPlaces?: number;
}

/** A place this close to home (as a share of the map radius) names home instead of getting a label. */
const HOME_PLACE_SHARE = 0.08;
/** Place names stay inside this share of the radius, clear of the rim. */
const PLACE_RIM_SHARE = 0.9;

/** Builds the map of your area around home for an epicentre. */
export function buildLocalMap(inp: LocalMapInput): LocalMap {
  const { home, epicentre } = inp;
  const e = projectLocal(home.lat, home.lon, epicentre.lat, epicentre.lon);
  const km = Math.hypot(e.x, e.y);
  const radiusKm = mapRadiusKm(km);
  const detail = radiusKm <= DETAIL_MAX_RADIUS_KM && inDetailRegion(home.lat, home.lon, inp.detailRegions);
  const coast = localPolylines(detail ? inp.detailCoast : inp.coarseCoast, home.lat, home.lon, radiusKm);
  const land = localLand(detail ? inp.detailLand : inp.coarseLand, home.lat, home.lon, radiusKm);
  const plates = localPolylines(inp.plates, home.lat, home.lon, radiusKm);

  let homePlace = "";
  let homePlaceKm = Infinity;
  const candidates: LocalPlace[] = [];
  for (const p of inp.places) {
    const q = projectLocal(home.lat, home.lon, p.lat, p.lon);
    const d = Math.hypot(q.x, q.y);
    if (d <= radiusKm * HOME_PLACE_SHARE) {
      if (d < homePlaceKm) {
        homePlace = p.name;
        homePlaceKm = d;
      }
    } else if (d <= radiusKm * PLACE_RIM_SHARE) {
      candidates.push({ name: p.name, x: q.x, y: q.y, km: d, rank: p.rank });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.km - b.km || (a.name < b.name ? -1 : 1));
  const places = candidates.slice(0, inp.maxPlaces ?? 6);

  return {
    radiusKm,
    ringsKm: ringsKm(radiusKm),
    coast,
    plates,
    places,
    homePlace,
    epicentre: { x: e.x, y: e.y, km, compass: compass8(home.lat, home.lon, epicentre.lat, epicentre.lon) },
    detail,
    land,
  };
}

let detailCoastCache: number[][] | null = null;

/** The detail regions' coastline: the 1:10m land's outline, computed once. */
export function detailCoastline(): number[][] {
  if (detailCoastCache === null) detailCoastCache = landRingsToCoast(LAND_10M_DETAIL, DETAIL_REGIONS);
  return detailCoastCache;
}

/** The map of your area from the bundled data: 1:10m detail, 1:50m fallback, PB2002 boundaries. */
export function localMapFor(home: { lat: number; lon: number }, epicentre: { lat: number; lon: number }): LocalMap {
  return buildLocalMap({
    home,
    epicentre,
    detailCoast: detailCoastline(),
    detailRegions: DETAIL_REGIONS,
    coarseCoast: COASTLINE_50M,
    detailLand: LAND_10M_DETAIL,
    coarseLand: LAND_50M,
    plates: PLATE_BOUNDARIES.map((r) => r.coords),
    places: PLACES,
  });
}
