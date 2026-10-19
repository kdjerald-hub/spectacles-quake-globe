import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compass8,
  greatCircleKm,
  nearestPolyline,
  nearestPreparedPolyline,
  normalizeLon,
  pointToArc,
  preparePolylines,
  unitVector,
} from "../core/geolookup.ts";

const KM_PER_DEG = (Math.PI / 180) * 6371;

test("normalizeLon wraps into [-180, 180)", () => {
  assert.equal(normalizeLon(180), -180);
  assert.equal(normalizeLon(-180), -180);
  assert.equal(normalizeLon(190), -170);
  assert.equal(normalizeLon(-190), 170);
  assert.equal(normalizeLon(540), -180);
  assert.equal(normalizeLon(12.5), 12.5);
});

test("greatCircleKm: one degree of the equator, the antipode, and across the antimeridian", () => {
  assert.ok(Math.abs(greatCircleKm(0, 0, 0, 1) - KM_PER_DEG) < 1e-6);
  assert.ok(Math.abs(greatCircleKm(0, 0, 0, 180) - 180 * KM_PER_DEG) < 1e-6);
  assert.ok(Math.abs(greatCircleKm(10, 179.5, 10, -179.5) - greatCircleKm(10, 0, 10, 1)) < 1e-6);
});

test("pointToArc: perpendicular foot inside the arc, beyond its ends, and at the pole", () => {
  const a = unitVector(0, -10);
  const b = unitVector(0, 10);
  const deg = (r: number): number => (r * 180) / Math.PI;
  assert.ok(Math.abs(deg(pointToArc(unitVector(5, 0), a, b)) - 5) < 1e-9);
  assert.ok(Math.abs(deg(pointToArc(unitVector(0, 20), a, b)) - 10) < 1e-9);
  assert.ok(Math.abs(deg(pointToArc(unitVector(90, 0), a, b)) - 90) < 1e-9);
  const o = unitVector(0, 0);
  assert.ok(Math.abs(deg(pointToArc(unitVector(3, 0), o, o)) - 3) < 1e-9);
});

test("nearestPolyline reports the closest line and its distance, across the antimeridian too", () => {
  const lines = [
    [0, 0, 10, 0],
    [170, -5, 179.9, -5, -179.9, -5, -170, -5],
  ];
  const r1 = nearestPolyline(lines, 2, 5);
  assert.equal(r1.index, 0);
  assert.ok(Math.abs(r1.km - 2 * KM_PER_DEG) < 1e-6);
  const r2 = nearestPolyline(lines, -3, 180);
  assert.equal(r2.index, 1);
  assert.ok(Math.abs(r2.km - 2 * KM_PER_DEG) < 0.5);
});

test("pruned polyline search returns exactly what brute force returns", () => {
  let seed = 3;
  const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const lines: number[][] = [];
  for (let k = 0; k < 60; k++) {
    let lat = (rnd() - 0.5) * 140;
    let lon = rnd() * 360 - 180;
    const pl: number[] = [];
    for (let i = 0; i < 40; i++) {
      pl.push(lon, lat);
      lon = normalizeLon(lon + (rnd() - 0.5));
      lat = Math.max(-89, Math.min(89, lat + (rnd() - 0.5)));
    }
    lines.push(pl);
  }
  lines.push([10, 10]);
  const prep = preparePolylines(lines);
  for (let k = 0; k < 400; k++) {
    const lat = (Math.asin(2 * rnd() - 1) * 180) / Math.PI;
    const lon = rnd() * 360 - 180;
    const a = nearestPolyline(lines, lat, lon);
    const b = nearestPreparedPolyline(prep, lat, lon);
    assert.equal(b.index, a.index);
    assert.ok(Math.abs(a.km - b.km) < 1e-6);
  }
});

test("compass8 gives the 8-point bearing, the short way across the antimeridian", () => {
  assert.equal(compass8(0, 0, 1, 0), "N");
  assert.equal(compass8(0, 0, 1, 1), "NE");
  assert.equal(compass8(0, 0, 0, -1), "W");
  assert.equal(compass8(0, 179, 0, -179), "E");
});
