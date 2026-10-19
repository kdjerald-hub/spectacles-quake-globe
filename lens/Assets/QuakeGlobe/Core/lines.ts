// GENERATED from core/lines.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Line geometry for coastlines and the latitude/longitude grid.
// A polyline is a flat array [lon0, lat0, lon1, lat1, ...] in degrees.

import { geoToCartesian } from "./geo";

export type Polyline = number[];

/** Meridians every `stepDeg` and parallels every `stepDeg` (poles excluded), sampled every `sampleDeg`. */
export function graticule(stepDeg = 30, sampleDeg = 5): Polyline[] {
  const lines: Polyline[] = [];
  for (let lon = -180; lon < 180; lon += stepDeg) {
    const line: Polyline = [];
    for (let lat = -90; lat <= 90; lat += sampleDeg) line.push(lon, lat);
    lines.push(line);
  }
  for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
    const line: Polyline = [];
    for (let lon = -180; lon <= 180; lon += sampleDeg) line.push(lon, lat);
    lines.push(line);
  }
  return lines;
}

export interface LineMesh {
  /** xyz per vertex. */
  positions: number[];
  /** Pairs of vertex indices, one pair per segment. */
  indices: number[];
}

/**
 * Converts polylines to an indexed line list on a sphere of the given radius.
 * `maxVertices` guards 16-bit index buffers; extra polylines go to the next chunk.
 */
export function polylinesToLineMeshes(polylines: Polyline[], radius: number, maxVertices = 65535): LineMesh[] {
  const meshes: LineMesh[] = [];
  let cur: LineMesh = { positions: [], indices: [] };
  for (const poly of polylines) {
    const n = Math.floor(poly.length / 2);
    if (n < 2) continue;
    if (n > maxVertices) throw new Error("polyline longer than maxVertices");
    if (cur.positions.length / 3 + n > maxVertices) {
      meshes.push(cur);
      cur = { positions: [], indices: [] };
    }
    const start = cur.positions.length / 3;
    for (let i = 0; i < n; i++) {
      const p = geoToCartesian(poly[2 * i + 1], poly[2 * i], radius);
      cur.positions.push(p.x, p.y, p.z);
      // A jump of more than 180 degrees of longitude is an antimeridian wrap:
      // drawing it would cut a chord through the globe, so the line is broken there.
      const wraps = i > 0 && Math.abs(poly[2 * i] - poly[2 * i - 2]) > 180;
      if (i > 0 && !wraps) cur.indices.push(start + i - 1, start + i);
    }
  }
  if (cur.indices.length > 0) meshes.push(cur);
  return meshes;
}

export interface RibbonMesh {
  positions: number[];
  normals: number[];
  indices: number[];
}

/**
 * Same polylines as thin flat ribbons lying on the sphere, `width` wide, facing outward.
 * Native lines are a single pixel on most hardware and can vanish on see-through displays;
 * ribbons keep a physical width. Four vertices per segment; chunks stay below `maxVertices`.
 */
export function polylinesToRibbonMeshes(polylines: Polyline[], radius: number, width: number, maxVertices = 65535): RibbonMesh[] {
  const meshes: RibbonMesh[] = [];
  let cur: RibbonMesh = { positions: [], normals: [], indices: [] };
  const h = width / 2;
  for (const poly of polylines) {
    const n = Math.floor(poly.length / 2);
    for (let i = 1; i < n; i++) {
      if (Math.abs(poly[2 * i] - poly[2 * i - 2]) > 180) continue; // antimeridian wrap
      if (cur.positions.length / 3 + 4 > maxVertices) {
        meshes.push(cur);
        cur = { positions: [], normals: [], indices: [] };
      }
      const p0 = geoToCartesian(poly[2 * i - 1], poly[2 * i - 2], radius);
      const p1 = geoToCartesian(poly[2 * i + 1], poly[2 * i], radius);
      const tx = p1.x - p0.x;
      const ty = p1.y - p0.y;
      const tz = p1.z - p0.z;
      const tl = Math.hypot(tx, ty, tz);
      if (tl === 0) continue;
      // Outward normal at the segment midpoint, side vector = normal x tangent.
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      const mz = (p0.z + p1.z) / 2;
      const ml = Math.hypot(mx, my, mz);
      const nx = mx / ml;
      const ny = my / ml;
      const nz = mz / ml;
      let sx = ny * tz - nz * ty;
      let sy = nz * tx - nx * tz;
      let sz = nx * ty - ny * tx;
      const sl = Math.hypot(sx, sy, sz);
      sx = (sx / sl) * h;
      sy = (sy / sl) * h;
      sz = (sz / sl) * h;
      const start = cur.positions.length / 3;
      // a = p0 - s, b = p0 + s, c = p1 + s, d = p1 - s; triangles (a, d, c) and (a, c, b) face outward.
      cur.positions.push(p0.x - sx, p0.y - sy, p0.z - sz, p0.x + sx, p0.y + sy, p0.z + sz);
      cur.positions.push(p1.x + sx, p1.y + sy, p1.z + sz, p1.x - sx, p1.y - sy, p1.z - sz);
      for (let k = 0; k < 4; k++) cur.normals.push(nx, ny, nz);
      cur.indices.push(start, start + 3, start + 2, start, start + 2, start + 1);
    }
  }
  if (cur.indices.length > 0) meshes.push(cur);
  return meshes;
}
