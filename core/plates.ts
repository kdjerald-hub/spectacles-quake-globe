// Plate boundaries from the PB2002 model (data/plates.ts): the nearest boundary to a point, for
// the quake details card, the boundary lines grouped by class for drawing, and subduction "barbs",
// the standard map symbol for a trench. Pure functions, no platform dependencies.
//
// Data credit (ODC-By 1.0): Hugo Ahlenius, Nordpil and Peter Bird (Bird 2003, G-cubed 4(3):1027).

import { PLATE_BOUNDARIES, PLATE_BOUNDARY_CLASS_TEXT, PLATE_NAMES } from "../data/plates.ts";
import type { PlateBoundaryClass, PlateBoundaryRun } from "../data/plates.ts";
import { EARTH_RADIUS_KM, angleBetween, nearestPreparedPolyline, preparePolylines, unitVector } from "./geolookup.ts";
import type { PreparedPolylines, V3 } from "./geolookup.ts";
import type { TriangleMesh } from "./markers.ts";

export type { PlateBoundaryClass, PlateBoundaryRun };

let prepared: PreparedPolylines | null = null;
function prep(): PreparedPolylines {
  if (prepared === null) prepared = preparePolylines(PLATE_BOUNDARIES.map((r) => r.coords));
  return prepared;
}

export function plateName(code: string): string {
  return PLATE_NAMES[code] ?? code;
}

export interface NearestBoundary {
  run: PlateBoundaryRun;
  km: number;
  /** "subduction zone", "spreading ridge", ... */
  kind: string;
  /** "Pacific and Okhotsk plates" */
  plates: string;
  /** One line for a card: "Subduction zone, Pacific and Okhotsk plates, 40 km away" */
  text: string;
}

/** The plate boundary closest to (lat, lon), or null if there is none (never, with real data). */
export function nearestBoundary(lat: number, lon: number): NearestBoundary | null {
  const r = nearestPreparedPolyline(prep(), lat, lon);
  if (r.index < 0) return null;
  const run = PLATE_BOUNDARIES[r.index];
  const kind = PLATE_BOUNDARY_CLASS_TEXT[run.cls];
  const plates = run.b ? plateName(run.a) + " and " + plateName(run.b) + " plates" : plateName(run.a) + " plate";
  const km = Math.round(r.km);
  const text = kind.charAt(0).toUpperCase() + kind.slice(1) + ", " + plates + ", " + km + " km away";
  return { run, km: r.km, kind, plates, text };
}

/** Boundary lines of the given classes, as flat [lon, lat, ...] polylines ready for ribbons. */
export function boundaryPolylines(classes: readonly PlateBoundaryClass[]): number[][] {
  return PLATE_BOUNDARIES.filter((r) => classes.indexOf(r.cls) >= 0).map((r) => r.coords);
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function addScaled(a: V3, b: V3, k: number): V3 {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function unit3(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

/**
 * Side of a point relative to a boundary run, seen from outside the Earth: +1 if it lies to the
 * left of the run's direction, -1 to the right. Measured at the run's vertex nearest the point.
 */
export function sideOfRun(run: PlateBoundaryRun, lat: number, lon: number): number {
  const q = unitVector(lat, lon);
  const n = run.coords.length >> 1;
  let best = Infinity;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const d = angleBetween(q, unitVector(run.coords[2 * i + 1], run.coords[2 * i]));
    if (d < best) {
      best = d;
      k = i;
    }
  }
  const a = Math.max(0, k - 1);
  const b = Math.min(n - 1, k + 1);
  const p = unitVector(run.coords[2 * k + 1], run.coords[2 * k]);
  const t = sub(unitVector(run.coords[2 * b + 1], run.coords[2 * b]), unitVector(run.coords[2 * a + 1], run.coords[2 * a]));
  // Seen from outside (normal p), p x t points to the left of the direction of travel t.
  return dot3(sub(q, p), cross(p, t)) >= 0 ? 1 : -1;
}

/**
 * Small triangles along every subduction zone, on the side where the slab dips (the overriding
 * plate), pointing in the dip direction. Spacing and size are along the surface, in km; the mesh
 * sits at `radius`. Triangles wind counter-clockwise seen from outside, like the other surface
 * geometry, so back-face culling drops the ones on the far side.
 */
export function buildSubductionBarbs(radius: number, spacingKm = 300, sizeKm = 90): TriangleMesh {
  const m: TriangleMesh = { positions: [], normals: [], indices: [] };
  const step = spacingKm / EARTH_RADIUS_KM;
  const half = sizeKm / 2 / EARTH_RADIUS_KM;
  const height = (sizeKm * 0.9) / EARTH_RADIUS_KM;
  for (const run of PLATE_BOUNDARIES) {
    if (run.cls !== "SUB" || run.dip === 0) continue;
    const n = run.coords.length >> 1;
    let carry = step / 2; // first barb half a spacing in
    for (let i = 1; i < n; i++) {
      const a = unitVector(run.coords[2 * i - 1], run.coords[2 * i - 2]);
      const b = unitVector(run.coords[2 * i + 1], run.coords[2 * i]);
      const seg = angleBetween(a, b);
      if (seg === 0) continue;
      let along = carry;
      while (along <= seg) {
        const f = along / seg;
        const p = unit3([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
        const t = unit3(sub(b, a));
        const left = unit3(cross(p, t));
        const dir: V3 = run.dip > 0 ? left : [-left[0], -left[1], -left[2]];
        let v0 = unit3(addScaled(p, t, half));
        let v1 = unit3(addScaled(p, t, -half));
        const v2 = unit3(addScaled(p, dir, height));
        // Counter-clockwise seen from outside: the face normal must point away from the centre.
        if (dot3(cross(sub(v1, v0), sub(v2, v0)), p) < 0) {
          const tmp = v0;
          v0 = v1;
          v1 = tmp;
        }
        const start = m.positions.length / 3;
        for (const v of [v0, v1, v2]) {
          m.positions.push(v[0] * radius, v[1] * radius, v[2] * radius);
          m.normals.push(p[0], p[1], p[2]);
        }
        m.indices.push(start, start + 1, start + 2);
        along += step;
      }
      carry = along - seg;
    }
  }
  return m;
}
