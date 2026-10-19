import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOctahedron, buildPrism, faceNormal } from "../core/shapes.ts";
import { polylinesToRibbonMeshes } from "../core/lines.ts";
import { COASTLINE_110M } from "../data/coastline110m.ts";
import type { TriangleMesh } from "../core/markers.ts";

function centroid(m: TriangleMesh, t: number): number[] {
  const c = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const i = m.indices[t + k];
    c[0] += m.positions[3 * i] / 3;
    c[1] += m.positions[3 * i + 1] / 3;
    c[2] += m.positions[3 * i + 2] / 3;
  }
  return c;
}

test("origin octahedron faces outward", () => {
  const m = buildOctahedron(2);
  for (let t = 0; t < m.indices.length; t += 3) {
    const n = faceNormal(m, m.indices[t], m.indices[t + 1], m.indices[t + 2]);
    const c = centroid(m, t);
    assert.ok(n.x * c[0] + n.y * c[1] + n.z * c[2] > 0);
  }
});

test("prism spans the two end points and every side faces away from its axis", () => {
  for (const [a, b] of [
    [{ x: 0, y: 0, z: 15 }, { x: 0, y: 0, z: 11 }],
    [{ x: 0, y: 15, z: 0 }, { x: 0, y: 12, z: 0 }], // axis parallel to the helper vector
    [{ x: 3, y: -4, z: 8 }, { x: 1, y: -2, z: 5 }],
  ]) {
    const m = buildPrism(a, b, 0.1);
    assert.equal(m.positions.length / 3, 16);
    for (let t = 0; t < m.indices.length; t += 3) {
      const n = faceNormal(m, m.indices[t], m.indices[t + 1], m.indices[t + 2]);
      const c = centroid(m, t);
      // Vector from the axis to the face centroid.
      const ab = [b.x - a.x, b.y - a.y, b.z - a.z];
      const ac = [c[0] - a.x, c[1] - a.y, c[2] - a.z];
      const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      const s = (ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / len2;
      const out = [ac[0] - s * ab[0], ac[1] - s * ab[1], ac[2] - s * ab[2]];
      assert.ok(n.x * out[0] + n.y * out[1] + n.z * out[2] > 0, "prism face points inward");
    }
  }
});

test("ribbons face outward, keep their width, and split below the index limit", () => {
  const meshes = polylinesToRibbonMeshes(COASTLINE_110M, 15, 0.1);
  let quads = 0;
  for (const m of meshes) {
    assert.ok(m.positions.length / 3 <= 65535);
    for (let t = 0; t < m.indices.length; t += 3) {
      const n = faceNormal(m, m.indices[t], m.indices[t + 1], m.indices[t + 2]);
      const c = centroid(m, t);
      assert.ok(n.x * c[0] + n.y * c[1] + n.z * c[2] > 0, "ribbon triangle faces inward");
    }
    for (let q = 0; q < m.positions.length / 12; q++) {
      const o = q * 12;
      const w = Math.hypot(m.positions[o + 3] - m.positions[o], m.positions[o + 4] - m.positions[o + 1], m.positions[o + 5] - m.positions[o + 2]);
      assert.ok(Math.abs(w - 0.1) < 1e-9);
      quads++;
    }
  }
  const segments = COASTLINE_110M.reduce((s, p) => s + p.length / 2 - 1, 0);
  assert.equal(quads, segments, "one ribbon quad per coastline segment");
  assert.ok(polylinesToRibbonMeshes(COASTLINE_110M, 15, 0.1, 4000).length > 1);
});

test("ribbons skip antimeridian wraps", () => {
  const [m] = polylinesToRibbonMeshes([[179, 0, -179, 0, -178, 0]], 1, 0.01);
  assert.equal(m.positions.length / 3, 4, "only the -179 to -178 segment is drawn");
});
