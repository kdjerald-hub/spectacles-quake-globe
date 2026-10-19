import { test } from "node:test";
import assert from "node:assert/strict";
import { COASTLINE_110M } from "../data/coastline110m.ts";
import { graticule, polylinesToLineMeshes } from "../core/lines.ts";
import { VERTICES_PER_MARKER, buildDepthStem, buildHighlightMesh, buildMarkerMeshes } from "../core/markers.ts";
import { depthClass, magnitudeToSize, toHex, DEPTH_CLASS_COLORS } from "../core/style.ts";
import type { Quake } from "../core/usgs.ts";

test("coastline data is well formed", () => {
  assert.ok(COASTLINE_110M.length > 100);
  for (const p of COASTLINE_110M) {
    assert.equal(p.length % 2, 0);
    for (let i = 0; i < p.length; i += 2) {
      assert.ok(p[i] >= -180 && p[i] <= 180 && p[i + 1] >= -90 && p[i + 1] <= 90);
    }
  }
});

test("line meshes keep every vertex on the sphere and every index in range", () => {
  const meshes = polylinesToLineMeshes(COASTLINE_110M, 15);
  let vertices = 0;
  for (const m of meshes) {
    const n = m.positions.length / 3;
    vertices += n;
    assert.equal(m.indices.length % 2, 0);
    for (const i of m.indices) assert.ok(i >= 0 && i < n);
    for (let i = 0; i < m.positions.length; i += 3) {
      const r = Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]);
      assert.ok(Math.abs(r - 15) < 1e-9);
    }
  }
  const expected = COASTLINE_110M.reduce((s, p) => s + p.length / 2, 0);
  assert.equal(vertices, expected);
});

test("line meshes split into chunks below the index limit", () => {
  const meshes = polylinesToLineMeshes(COASTLINE_110M, 1, 1000);
  assert.ok(meshes.length > 1);
  for (const m of meshes) assert.ok(m.positions.length / 3 <= 1000);
});

test("an antimeridian wrap breaks the line instead of cutting through the globe", () => {
  const [m] = polylinesToLineMeshes([[179, 0, -179, 0, -178, 0]], 1);
  assert.deepEqual(m.indices, [1, 2]);
});

test("graticule has 12 meridians and 5 parallels at 30 degrees", () => {
  const g = graticule(30, 5);
  assert.equal(g.length, 17);
});

function quake(depthKm: number, mag: number): Quake {
  return { id: "x" + depthKm + mag, lat: 23.9, lon: 121.5, depthKm, mag, timeMs: 1, place: "" };
}

test("markers are bucketed by depth class with six vertices each", () => {
  const meshes = buildMarkerMeshes([quake(10, 5), quake(150, 5), quake(550, 5), quake(30, 3)], {
    globeRadius: 15,
    depthExaggeration: 3,
    baseSize: 0.2,
  });
  assert.equal(meshes.shallow.positions.length / 3, 2 * VERTICES_PER_MARKER);
  assert.equal(meshes.intermediate.positions.length / 3, VERTICES_PER_MARKER);
  assert.equal(meshes.deep.positions.length / 3, VERTICES_PER_MARKER);
  assert.equal(meshes.shallow.indices.length, 2 * 8 * 3);
});

test("marker triangles wind counter-clockwise when seen from outside", () => {
  const m = buildHighlightMesh(quake(10, 5), { globeRadius: 15, depthExaggeration: 3, baseSize: 0.2 });
  const P = m.positions;
  const cx = (P[0] + P[3]) / 2;
  const cy = (P[7] + P[10]) / 2;
  const cz = (P[14] + P[17]) / 2;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const out = [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3 - cy, (a[2] + b[2] + c[2]) / 3 - cz];
    assert.ok(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > 0, "face " + t / 3 + " points inward");
  }
});

test("the depth stem runs from the surface down to the event", () => {
  const s = buildDepthStem(quake(550, 6), { globeRadius: 15, depthExaggeration: 3, baseSize: 0.2 });
  const top = Math.hypot(s.positions[0], s.positions[1], s.positions[2]);
  const bottom = Math.hypot(s.positions[3], s.positions[4], s.positions[5]);
  assert.ok(Math.abs(top - 15) < 1e-9);
  assert.ok(bottom < top && bottom > 10);
  assert.deepEqual(s.indices, [0, 1]);
});

test("too many markers fail loudly instead of corrupting a 16-bit index buffer", () => {
  const many = Array.from({ length: 200 }, (_, i) => quake(10, 3 + (i % 5)));
  assert.throws(() => buildMarkerMeshes(many, { globeRadius: 1, depthExaggeration: 1, baseSize: 0.01, maxVertices: 600 }), /too many markers/);
});

test("style encodings", () => {
  assert.equal(depthClass(69.9), "shallow");
  assert.equal(depthClass(70), "intermediate");
  assert.equal(depthClass(299.9), "intermediate");
  assert.equal(depthClass(300), "deep");
  assert.ok(magnitudeToSize(2.5, 1) < magnitudeToSize(5, 1) && magnitudeToSize(5, 1) < magnitudeToSize(7, 1));
  assert.equal(magnitudeToSize(1, 1), 0.6);
  assert.equal(magnitudeToSize(12, 1), 3.0);
  assert.equal(toHex([1, 1, 1]), 0xffffff);
  assert.equal(toHex(DEPTH_CLASS_COLORS.deep), 0x4da8ff);
});
