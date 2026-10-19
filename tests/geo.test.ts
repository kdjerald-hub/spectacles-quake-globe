import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EARTH_RADIUS_KM,
  MIN_RADIUS_FRACTION,
  alignmentRotation,
  depthToRadius,
  facingRotation,
  geoToCartesian,
  quatFromAxisAngle,
  quatMultiply,
  quatRotateVector,
  quatSlerp,
} from "../core/geo.ts";
import type { Vec3 } from "../core/geo.ts";

const EPS = 1e-9;

function near(a: Vec3, b: Vec3, eps = 1e-9): void {
  assert.ok(
    Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps,
    `expected (${b.x}, ${b.y}, ${b.z}) got (${a.x}, ${a.y}, ${a.z})`,
  );
}

test("geoToCartesian follows the documented axis convention", () => {
  near(geoToCartesian(0, 0, 1), { x: 0, y: 0, z: 1 });
  near(geoToCartesian(90, 0, 1), { x: 0, y: 1, z: 0 });
  near(geoToCartesian(-90, 0, 1), { x: 0, y: -1, z: 0 });
  near(geoToCartesian(0, 90, 1), { x: 1, y: 0, z: 0 }); // east is to the viewer's right
  near(geoToCartesian(0, -90, 1), { x: -1, y: 0, z: 0 });
  near(geoToCartesian(0, 180, 1), { x: 0, y: 0, z: -1 });
});

test("geoToCartesian keeps points on the requested radius", () => {
  for (let lat = -90; lat <= 90; lat += 15) {
    for (let lon = -180; lon <= 180; lon += 20) {
      const p = geoToCartesian(lat, lon, 15);
      assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - 15) < 1e-9);
    }
  }
});

test("depthToRadius scales depth, clamps negatives and never collapses to the centre", () => {
  assert.equal(depthToRadius(0, 10, 3), 10);
  assert.equal(depthToRadius(-2.5, 10, 3), 10, "events above the datum sit on the surface");
  const r700 = depthToRadius(700, 10, 3);
  assert.ok(Math.abs(r700 - 10 * (1 - (700 / EARTH_RADIUS_KM) * 3)) < EPS);
  assert.ok(r700 < 10 && r700 > 6, "a 700 km event at x3 sits about a third of the way in");
  assert.equal(depthToRadius(700, 10, 1000), 10 * MIN_RADIUS_FRACTION);
  assert.equal(depthToRadius(5000, 10, 1), depthToRadius(800, 10, 1), "absurd depths are clamped");
});

test("facingRotation turns any location to face the viewer (+Z)", () => {
  for (let lat = -89; lat <= 89; lat += 11) {
    for (let lon = -180; lon <= 180; lon += 13) {
      const q = facingRotation(lat, lon);
      near(quatRotateVector(q, geoToCartesian(lat, lon, 1)), { x: 0, y: 0, z: 1 }, 1e-9);
    }
  }
});

test("facingRotation keeps north up (no roll)", () => {
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let lon = -180; lon <= 180; lon += 30) {
      const north = quatRotateVector(facingRotation(lat, lon), { x: 0, y: 1, z: 0 });
      assert.ok(Math.abs(north.x) < 1e-9, "north pole must stay in the vertical plane");
      assert.ok(north.y > 0, "north pole must stay above the horizon");
    }
  }
});

test("alignmentRotation points +Z at the viewer, so a selection faces them from any side", () => {
  const viewers: Vec3[] = [
    { x: 0, y: 0, z: 5 },
    { x: 3, y: 1, z: -2 },
    { x: -1, y: -2, z: 0.5 },
    { x: 0, y: 4, z: 0.001 },
  ];
  for (const v of viewers) {
    const len = Math.hypot(v.x, v.y, v.z);
    near(quatRotateVector(alignmentRotation(v), { x: 0, y: 0, z: 1 }), { x: v.x / len, y: v.y / len, z: v.z / len }, 1e-9);
    const q = quatMultiply(alignmentRotation(v), facingRotation(23.9, 121.5));
    near(quatRotateVector(q, geoToCartesian(23.9, 121.5, 1)), { x: v.x / len, y: v.y / len, z: v.z / len }, 1e-9);
  }
});

test("quaternion helpers agree with each other", () => {
  const a = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
  near(quatRotateVector(a, { x: 0, y: 0, z: 1 }), { x: 1, y: 0, z: 0 });
  const b = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
  // b*a applies a first: +Z -> +X -> +X (rotation about X leaves X unchanged)
  near(quatRotateVector(quatMultiply(b, a), { x: 0, y: 0, z: 1 }), { x: 1, y: 0, z: 0 });
  // a*b applies b first: +Z -> -Y -> -Y (rotation about Y leaves Y unchanged)
  near(quatRotateVector(quatMultiply(a, b), { x: 0, y: 0, z: 1 }), { x: 0, y: -1, z: 0 });
});

test("quatSlerp hits both endpoints and stays unit length", () => {
  const a = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.2);
  const b = quatFromAxisAngle({ x: 1, y: 1, z: 0 }, 2.5);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const q = quatSlerp(a, b, t);
    assert.ok(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-12);
  }
  const s0 = quatSlerp(a, b, 0);
  const s1 = quatSlerp(a, b, 1);
  assert.ok(Math.abs(s0.w - a.w) < 1e-12 && Math.abs(s0.y - a.y) < 1e-12);
  // b and -b are the same rotation; compare by rotating a vector.
  near(quatRotateVector(s1, { x: 0, y: 0, z: 1 }), quatRotateVector(b, { x: 0, y: 0, z: 1 }), 1e-9);
});
