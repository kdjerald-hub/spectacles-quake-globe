import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRing, buildSphereCircle, faceNormal } from "../core/shapes.ts";
import {
  VERTICES_PER_MARKER,
  buildEpicenterRing,
  buildHaloMesh,
  buildHighlightMesh,
  epicenterRingDeg,
  highlightHalfSize,
} from "../core/markers.ts";
import { geoToCartesian, silhouetteScale } from "../core/geo.ts";
import { GlobeModel } from "../core/model.ts";
import { GEOMETRY, INNER_GRID_DEPTH_KM, RECENT_HOURS, SETTINGS, VIEWS, legendText } from "../core/config.ts";
import { LINE_RADIUS_FACTOR } from "../core/occluder.ts";
import { ATMOSPHERE_RINGS, EPICENTER_PULSE, HALO_PULSE, SELECTED_SCALE_PULSE, pulse } from "../core/style.ts";
import type { Quake } from "../core/usgs.ts";

function centroid(m: { positions: number[]; indices: number[] }, t: number): number[] {
  const c = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const i = m.indices[t + k];
    for (let d = 0; d < 3; d++) c[d] += m.positions[3 * i + d] / 3;
  }
  return c;
}

test("atmosphere ring faces +Z and spans the requested radii", () => {
  const m = buildRing(10, 12, 48);
  for (let t = 0; t < m.indices.length; t += 3) {
    assert.ok(faceNormal(m, m.indices[t], m.indices[t + 1], m.indices[t + 2]).z > 0);
  }
  for (let i = 0; i < m.positions.length; i += 3) {
    const r = Math.hypot(m.positions[i], m.positions[i + 1]);
    assert.ok(Math.abs(r - 10) < 1e-9 || Math.abs(r - 12) < 1e-9);
    assert.equal(m.positions[i + 2], 0);
  }
});

test("atmosphere rings are contiguous, outward and dimming", () => {
  for (let i = 0; i < ATMOSPHERE_RINGS.length; i++) {
    const r = ATMOSPHERE_RINGS[i];
    assert.ok(r.inner > 1 && r.outer > r.inner);
    if (i > 0) {
      assert.equal(r.inner, ATMOSPHERE_RINGS[i - 1].outer, "no gap between rings");
      const sum = (c: number[]) => c[0] + c[1] + c[2];
      assert.ok(sum(r.rgb) < sum(ATMOSPHERE_RINGS[i - 1].rgb), "outer rings are dimmer");
    }
  }
});

test("epicentre circle lies on the sphere at the requested angular radius and faces outward", () => {
  for (const [lat, lon] of [[23.9, 121.5], [89, 0], [-60, -179.5], [0, 180]]) {
    const m = buildSphereCircle(lat, lon, 3, 12, 0.05, 48);
    const c = geoToCartesian(lat, lon, 1);
    for (let i = 0; i < m.positions.length; i += 3) {
      const p = [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
      const r = Math.hypot(p[0], p[1], p[2]);
      assert.ok(Math.abs(r - 12) < 0.01, "ribbon stays on the surface (within its half-width)");
      const ang = (Math.acos((p[0] * c.x + p[1] * c.y + p[2] * c.z) / r) * 180) / Math.PI;
      assert.ok(Math.abs(ang - 3) < 0.2, "at the requested distance from the epicentre");
    }
    for (let t = 0; t < m.indices.length; t += 3) {
      const n = faceNormal(m, m.indices[t], m.indices[t + 1], m.indices[t + 2]);
      const q = centroid(m, t);
      assert.ok(n.x * q[0] + n.y * q[1] + n.z * q[2] > 0, "faces outward");
    }
  }
});

function quake(id: string, mag: number, ageHours: number, now: number): Quake {
  return { id, lat: 10, lon: 20, depthKm: 33, mag, timeMs: now - ageHours * 3600_000, place: "" };
}

test("halo mesh wraps each newest quake in a larger octahedron", () => {
  const now = 1_800_000_000_000;
  const qs = [quake("a", 5, 1, now), quake("b", 3, 2, now)];
  const opt = { globeRadius: 12, depthExaggeration: 3, baseSize: 0.13 };
  const halo = buildHaloMesh(qs, opt);
  assert.equal(halo.positions.length / 3, 2 * VERTICES_PER_MARKER);
  const marker = buildHighlightMesh(qs[0], opt, 1);
  const extent = (m: { positions: number[] }) => Math.max(...m.positions) - Math.min(...m.positions);
  assert.ok(extent({ positions: halo.positions.slice(0, 18) }) > extent(marker), "halo is larger than the marker");
});

test("recent windows exist for every view and are shorter in the 24 h view", () => {
  for (const v of VIEWS) assert.ok(RECENT_HOURS[v.id] > 0);
  assert.ok(RECENT_HOURS.day < RECENT_HOURS.week);
});

test("the view model marks only quakes inside the recent window", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/usgs_2.5_week.geojson", import.meta.url), "utf8"));
  const m = new GlobeModel();
  m.ingest("2.5_week", raw);
  const now = raw.metadata.generated + 60_000;
  const vm = m.viewModel(now, true);
  const cutoff = now - RECENT_HOURS.week * 3600_000;
  assert.ok(vm.recent.length > 0 && vm.recent.length < vm.markers.length);
  for (const q of vm.recent) assert.ok(q.timeMs >= cutoff);
  const expected = vm.markers.filter((q) => q.timeMs >= cutoff).length;
  assert.equal(vm.recent.length, expected);
});

test("every pulse stays within its bounds and sweeps nearly all of them", () => {
  for (const spec of [HALO_PULSE, EPICENTER_PULSE, SELECTED_SCALE_PULSE]) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 4; t += 0.01) {
      const p = pulse(t, spec);
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
    }
    assert.ok(lo >= spec.lo - 1e-9 && hi <= spec.hi + 1e-9);
    assert.ok(hi - lo > 0.95 * (spec.hi - spec.lo));
  }
  assert.equal(pulse(1.234), pulse(1.234, HALO_PULSE), "the newest-quake glow is the default");
  assert.ok(SELECTED_SCALE_PULSE.lo < 1 && SELECTED_SCALE_PULSE.hi > 1, "the selected marker breathes around its size");
});

test("the legend states the glow window of the current view, the depth scale and the inner grid", () => {
  for (const v of VIEWS) {
    const text = legendText(v.id);
    assert.equal(text.split("\n").length, 2, "two lines, as the panel reserves");
    assert.ok(text.includes("glow: past " + RECENT_HOURS[v.id] + " h"));
    assert.ok(text.includes("depth x" + SETTINGS.depthExaggeration));
    assert.ok(text.includes(INNER_GRID_DEPTH_KM + " km"));
  }
  assert.notEqual(legendText("day"), legendText("week"));
});

test("atmosphere rings scaled by silhouetteScale sit on the globe's visible outline", () => {
  for (const [r, d] of [[12, 100], [36, 100], [1, 3.6], [1, 1.6]]) {
    const s = silhouetteScale(r, d);
    // The sight line that grazes the sphere crosses the centre plane at d * tan(asin(r / d)).
    const outline = d * Math.tan(Math.asin(r / d));
    assert.ok(Math.abs(r * s - outline) < 1e-9 * outline, "outline at radius r * s for r=" + r + ", d=" + d);
  }
  assert.ok(silhouetteScale(12, 100) > 1 && silhouetteScale(12, 100) < 1.01, "barely changes at the default distance");
  assert.ok(silhouetteScale(36, 100) > 1.06, "matters once the globe is scaled up");
  assert.equal(silhouetteScale(12, 12.5), 0, "nothing to outline from (nearly) inside the globe");
  assert.equal(silhouetteScale(12, NaN), 0);
});

test("the epicentre ring circles the event just above the coastlines", () => {
  const now = 1_800_000_000_000;
  const R = 12;
  const opt = { globeRadius: R, depthExaggeration: SETTINGS.depthExaggeration, baseSize: R * GEOMETRY.markerBaseFraction };
  for (const mag of [2.5, 4.5, 6.5, 7.7, 9.1]) {
    const q = { ...quake("e", mag, 1, now), lat: 51.2, lon: 158.6 };
    const deg = epicenterRingDeg(q, opt);
    const ring = buildEpicenterRing(q, opt);
    const c = geoToCartesian(q.lat, q.lon, 1);
    const P = (i: number) => [ring.positions[3 * i], ring.positions[3 * i + 1], ring.positions[3 * i + 2]];
    // Four vertices per segment: (p0 - side, p0 + side, p1 + side, p1 - side).
    for (let v = 0; v < ring.positions.length / 3; v += 4) {
      const a = P(v);
      const b = P(v + 1);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const r = Math.hypot(mid[0], mid[1], mid[2]);
      assert.ok(r > R * LINE_RADIUS_FACTOR, "above the coastline ribbons");
      const ang = (Math.acos((mid[0] * c.x + mid[1] * c.y + mid[2] * c.z) / r) * 180) / Math.PI;
      assert.ok(Math.abs(ang - deg) < 1e-6, "centre line at the computed angle");
      const width = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      assert.ok(Math.abs(width - R * GEOMETRY.epicenterWidthFraction) < 1e-9, "configured width");
    }
    // Seen from straight above, the ring must clear the white marker at its largest pulse,
    // or the white ring disappears into the white marker.
    const ringRadius = R * Math.sin((deg * Math.PI) / 180) - (R * GEOMETRY.epicenterWidthFraction) / 2;
    assert.ok(ringRadius > highlightHalfSize(q, opt) * SELECTED_SCALE_PULSE.hi, "clear of the marker at M" + mag);
  }
  const small = { ...quake("s", 2.5, 1, now), lat: 0, lon: 0 };
  assert.equal(epicenterRingDeg(small, opt), GEOMETRY.epicenterRingDeg, "small events use the configured minimum");
});
