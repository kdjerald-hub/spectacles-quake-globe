import { test } from "node:test";
import assert from "node:assert/strict";
import { LINE_RADIUS_FACTOR, OCCLUDER_RADIUS_FACTOR, buildInwardSphere } from "../core/occluder.ts";

function faces(m: { positions: number[]; indices: number[] }) {
  const P = m.positions;
  const out: { n: number[]; c: number[] }[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    out.push({
      n: [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]],
      c: [(v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][1] + v[1][1] + v[2][1]) / 3, (v[0][2] + v[1][2] + v[2][2]) / 3],
    });
  }
  return out;
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("occluder vertices lie on the sphere and indices are in range", () => {
  const m = buildInwardSphere(10, 12, 24);
  for (let i = 0; i < m.positions.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]) - 10) < 1e-9);
  }
  for (const i of m.indices) assert.ok(i >= 0 && i < m.positions.length / 3);
});

test("every occluder triangle faces the centre and none is degenerate", () => {
  for (const f of faces(buildInwardSphere(1, 10, 20))) {
    assert.ok(Math.hypot(f.n[0], f.n[1], f.n[2]) > 1e-9, "degenerate triangle");
    assert.ok(dot(f.n, f.c) < 0, "triangle faces outward");
  }
});

test("with back-face culling only the far side is drawn, from any viewpoint", () => {
  // From an eye at distance d the visible cap ends at the horizon angle acos(R / d).
  // Faceting blurs that edge by about half a facet (5.6 degrees here), so triangles
  // within 10 degrees of the horizon may go either way; everything else must be exact.
  const m = buildInwardSphere(1, 16, 32);
  const MARGIN = (10 * Math.PI) / 180;
  for (const eye of [[0, 0, 4], [3, 2, -1], [0, -5, 0.5], [1.5, 0, 1.2]]) {
    const d = Math.hypot(eye[0], eye[1], eye[2]);
    const horizon = Math.acos(1 / d);
    let drawnCount = 0;
    for (const f of faces(m)) {
      const toEye = [eye[0] - f.c[0], eye[1] - f.c[1], eye[2] - f.c[2]];
      const drawn = dot(f.n, toEye) > 0; // front-facing toward the eye survives culling
      const angle = Math.acos(dot(f.c, eye) / (Math.hypot(f.c[0], f.c[1], f.c[2]) * d));
      if (angle < horizon - MARGIN) assert.equal(drawn, false, "a triangle on the visible cap would hide the near side");
      if (angle > horizon + MARGIN) assert.equal(drawn, true, "a far-side triangle would let far coastlines show through");
      if (drawn) drawnCount++;
    }
    assert.ok(drawnCount > 0);
  }
});

test("lines sit just outside the occluder so far-side lines are hidden behind it", () => {
  assert.ok(LINE_RADIUS_FACTOR > OCCLUDER_RADIUS_FACTOR && OCCLUDER_RADIUS_FACTOR > 1);
});
