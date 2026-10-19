// Small triangle shapes: the selected marker, the depth stem, atmosphere rings and the ring
// around an epicentre. All triangles wind counter-clockwise seen from their front (back faces
// are culled).

import { geoToCartesian } from "./geo.ts";
import type { Vec3 } from "./geo.ts";
import type { TriangleMesh } from "./markers.ts";

function push(m: TriangleMesh, p: Vec3, n: Vec3): void {
  m.positions.push(p.x, p.y, p.z);
  m.normals.push(n.x, n.y, n.z);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Octahedron of half-size `s` centred on the origin (for a marker that can pulse in place). */
export function buildOctahedron(s: number): TriangleMesh {
  const m: TriangleMesh = { positions: [], normals: [], indices: [] };
  const dirs: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const d of dirs) push(m, { x: d[0] * s, y: d[1] * s, z: d[2] * s }, { x: d[0], y: d[1], z: d[2] });
  m.indices.push(0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5);
  return m;
}

/**
 * Square prism from `a` to `b` with side `width`: a line that stays visible from any angle,
 * unlike native lines, which are one pixel wide on most hardware.
 */
export function buildPrism(a: Vec3, b: Vec3, width: number): TriangleMesh {
  const m: TriangleMesh = { positions: [], normals: [], indices: [] };
  const axis = normalize(sub(b, a));
  const helper = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(axis, helper));
  const v = cross(axis, u);
  const h = width / 2;
  // Four side faces, each with its own outward normal (flat shading, 4 vertices per face).
  const sides: Vec3[] = [u, v, { x: -u.x, y: -u.y, z: -u.z }, { x: -v.x, y: -v.y, z: -v.z }];
  for (let i = 0; i < 4; i++) {
    const n = sides[i];
    const t = sides[(i + 1) % 4];
    // Face spans directions n (outward) and t (along the face); corners at +-t.
    const c0 = { x: (n.x - t.x) * h, y: (n.y - t.y) * h, z: (n.z - t.z) * h };
    const c1 = { x: (n.x + t.x) * h, y: (n.y + t.y) * h, z: (n.z + t.z) * h };
    const start = m.positions.length / 3;
    push(m, { x: a.x + c0.x, y: a.y + c0.y, z: a.z + c0.z }, n);
    push(m, { x: a.x + c1.x, y: a.y + c1.y, z: a.z + c1.z }, n);
    push(m, { x: b.x + c1.x, y: b.y + c1.y, z: b.z + c1.z }, n);
    push(m, { x: b.x + c0.x, y: b.y + c0.y, z: b.z + c0.z }, n);
    // (n, t, axis) is right-handed, so (v0, v1, v2) and (v0, v2, v3) face +n (outward).
    m.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return m;
}

/**
 * Flat ring (annulus) in the XY plane facing +Z. Billboarded toward the viewer around the
 * globe, a few of these with fading brightness read as a soft atmosphere.
 */
export function buildRing(inner: number, outer: number, segments = 96): TriangleMesh {
  const m: TriangleMesh = { positions: [], normals: [], indices: [] };
  const n = { x: 0, y: 0, z: 1 };
  for (let k = 0; k <= segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    push(m, { x: inner * c, y: inner * s, z: 0 }, n);
    push(m, { x: outer * c, y: outer * s, z: 0 }, n);
  }
  for (let k = 0; k < segments; k++) {
    const i0 = 2 * k;
    const o0 = 2 * k + 1;
    const i1 = 2 * k + 2;
    const o1 = 2 * k + 3;
    m.indices.push(i0, o0, o1, i0, o1, i1);
  }
  return m;
}

/**
 * Ribbon tracing a small circle on the sphere of `radius`: every point lies
 * `angularRadiusDeg` from the centre (lat, lon). Used to ring the epicentre of the
 * selected quake on the surface. Faces outward, like the coastline ribbons.
 */
export function buildSphereCircle(
  latDeg: number,
  lonDeg: number,
  angularRadiusDeg: number,
  radius: number,
  width: number,
  segments = 64,
): TriangleMesh {
  const c = geoToCartesian(latDeg, lonDeg, 1);
  const helper = Math.abs(c.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(c, helper));
  const v = cross(c, u);
  const a = (angularRadiusDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const pts: Vec3[] = [];
  for (let k = 0; k < segments; k++) {
    const t = (k / segments) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    pts.push({
      x: radius * (c.x * ca + (u.x * ct + v.x * st) * sa),
      y: radius * (c.y * ca + (u.y * ct + v.y * st) * sa),
      z: radius * (c.z * ca + (u.z * ct + v.z * st) * sa),
    });
  }
  const m: TriangleMesh = { positions: [], normals: [], indices: [] };
  const h = width / 2;
  for (let k = 0; k < segments; k++) {
    const p0 = pts[k];
    const p1 = pts[(k + 1) % segments];
    const nrm = normalize({ x: p0.x + p1.x, y: p0.y + p1.y, z: p0.z + p1.z });
    const side = normalize(cross(nrm, sub(p1, p0)));
    const s = { x: side.x * h, y: side.y * h, z: side.z * h };
    const start = m.positions.length / 3;
    push(m, { x: p0.x - s.x, y: p0.y - s.y, z: p0.z - s.z }, nrm);
    push(m, { x: p0.x + s.x, y: p0.y + s.y, z: p0.z + s.z }, nrm);
    push(m, { x: p1.x + s.x, y: p1.y + s.y, z: p1.z + s.z }, nrm);
    push(m, { x: p1.x - s.x, y: p1.y - s.y, z: p1.z - s.z }, nrm);
    m.indices.push(start, start + 3, start + 2, start, start + 2, start + 1);
  }
  return m;
}

/** Outward face normal of triangle (i, j, k): used by tests to check winding. */
export function faceNormal(m: TriangleMesh, i: number, j: number, k: number): Vec3 {
  const p = (q: number): Vec3 => ({ x: m.positions[3 * q], y: m.positions[3 * q + 1], z: m.positions[3 * q + 2] });
  return cross(sub(p(j), p(i)), sub(p(k), p(i)));
}
