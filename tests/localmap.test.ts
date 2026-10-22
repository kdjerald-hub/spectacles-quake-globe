import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalMap,
  clipPolygonToCircle,
  inDetailRegion,
  landRingsToCoast,
  localMapFor,
  localPolylines,
  mapRadiusKm,
  polygonArea,
  projectLocal,
  ringLabel,
  ringsKm,
  triangulate,
} from "../core/localmap.ts";
import type { LocalMesh } from "../core/localmap.ts";
import { compass8, greatCircleKm } from "../core/geolookup.ts";
import { DETAIL_REGIONS, LAND_10M_DETAIL, LAND_50M, PLACES } from "../data/localdetail.ts";
import { COASTLINE_50M } from "../data/coastline50m.ts";

// The demo: home in Hualien City, and the M7.4 Hualien earthquake of 2024-04-03 (USGS us7000m9g4).
const HOME = { lat: 23.9667, lon: 121.6 };
const QUAKE = { lat: 23.8356, lon: 121.5976 };

/** True when (x, y) lies in one of the mesh's triangles. */
function inMesh(m: LocalMesh, x: number, y: number): boolean {
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const cr = (i: number, j: number): number => (P[2 * j] - P[2 * i]) * (y - P[2 * i + 1]) - (P[2 * j + 1] - P[2 * i + 1]) * (x - P[2 * i]);
    if (cr(a, b) >= 0 && cr(b, c) >= 0 && cr(c, a) >= 0) return true;
  }
  return false;
}

/** Total area of a mesh's triangles, each counted with its sign (counter-clockwise is positive). */
function meshArea(m: LocalMesh): number {
  let a = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].flatMap((i) => [m.positions[2 * i], m.positions[2 * i + 1]]);
    a += polygonArea(tri);
  }
  return a;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("projectLocal: every distance from the centre is the great-circle distance, and north is +y", () => {
  const rand = rng(7);
  const centres = [HOME, { lat: 35.68, lon: 139.69 }, { lat: 34.05, lon: -118.24 }, { lat: 64.15, lon: -21.94 }, { lat: -33.45, lon: -70.67 }];
  for (const c of centres) {
    for (let i = 0; i < 300; i++) {
      const lat = Math.max(-89.9, Math.min(89.9, c.lat + (rand() - 0.5) * 50));
      const lon = c.lon + (rand() - 0.5) * 80;
      const p = projectLocal(c.lat, c.lon, lat, lon);
      const km = greatCircleKm(c.lat, c.lon, lat, lon);
      assert.ok(Math.abs(Math.hypot(p.x, p.y) - km) <= Math.max(0.01, km * 1e-6), `${km} km vs ${Math.hypot(p.x, p.y)}`);
    }
  }
  const south = projectLocal(HOME.lat, HOME.lon, HOME.lat - 0.5, HOME.lon);
  assert.ok(Math.abs(south.x) < 1e-9 && south.y < 0);
  const east = projectLocal(HOME.lat, HOME.lon, HOME.lat, HOME.lon + 0.5);
  assert.ok(east.x > 0 && Math.abs(east.y) < 1, `east of home: ${east.x}, ${east.y}`);
  assert.deepEqual(projectLocal(HOME.lat, HOME.lon, HOME.lat, HOME.lon), { x: 0, y: 0 });
});

test("map radius and rings: the epicentre always fits inside two thirds of the radius", () => {
  assert.equal(mapRadiusKm(0), 50);
  assert.equal(mapRadiusKm(14.6), 50);
  assert.equal(mapRadiusKm(40), 100);
  assert.equal(mapRadiusKm(133), 200);
  assert.equal(mapRadiusKm(1000), 2000);
  assert.equal(mapRadiusKm(20015), 20100);
  for (const km of [1, 20, 33, 34, 66, 67, 140, 400, 3000, 13000]) {
    const r = mapRadiusKm(km);
    assert.ok(km * 1.5 <= r || r === 20100, `${km} km in a ${r} km map`);
  }
  assert.deepEqual(ringsKm(50), [10, 25, 50]);
  assert.deepEqual(ringsKm(200), [40, 100, 200]);
  assert.equal(ringLabel(10), "10 km");
  assert.equal(ringLabel(2000), "2,000 km");
  assert.equal(ringLabel(20100), "20,100 km");
});

test("localPolylines: lines are clipped at the circle, and a line that leaves and re-enters becomes two", () => {
  const r = 50;
  // along the equator, from 111 km west to 111 km east of the centre (0, 0)
  const [run] = localPolylines([[-1, 0, 0, 0, 1, 0]], 0, 0, r);
  assert.ok(run, "one run");
  assert.ok(Math.abs(run[0] + r) < 0.01 && Math.abs(run[run.length - 2] - r) < 0.01, `ends at the circle: ${run[0]}, ${run[run.length - 2]}`);
  // in at the west, out at the north, back in from the north-east, out at the east
  const runs = localPolylines([[-1, 0, 0, 0, 0, 1, 0.2, 0, 1, 0]], 0, 0, r);
  assert.equal(runs.length, 2);
  for (const line of runs) {
    for (let i = 0; i < line.length; i += 2) assert.ok(Math.hypot(line[i], line[i + 1]) <= r + 1e-6);
  }
  // wholly outside: nothing
  assert.equal(localPolylines([[3, 3, 4, 4]], 0, 0, r).length, 0);
});

test("the demo map: Hualien home, the 2024 Hualien epicentre 15 km south, 1:10m coastline", () => {
  const m = localMapFor(HOME, QUAKE);
  assert.ok(Math.abs(m.epicentre.km - greatCircleKm(HOME.lat, HOME.lon, QUAKE.lat, QUAKE.lon)) < 0.01);
  assert.ok(m.epicentre.km > 14 && m.epicentre.km < 15.5, `${m.epicentre.km} km`);
  assert.equal(m.epicentre.compass, "S");
  assert.equal(m.epicentre.compass, compass8(HOME.lat, HOME.lon, QUAKE.lat, QUAKE.lon));
  assert.ok(m.epicentre.y < -14 && Math.abs(m.epicentre.x) < 1, `epicentre at (${m.epicentre.x}, ${m.epicentre.y})`);
  assert.equal(m.radiusKm, 50);
  assert.deepEqual(m.ringsKm, [10, 25, 50]);
  assert.equal(m.detail, true);
  assert.ok(m.coast.length > 0, "the east coast of Taiwan is on the map");
  for (const line of [...m.coast, ...m.plates]) {
    assert.ok(line.length >= 4 && line.length % 2 === 0);
    for (let i = 0; i < line.length; i += 2) assert.ok(Math.hypot(line[i], line[i + 1]) <= m.radiusKm + 1e-6);
  }
  // Hualien City is on the coast, and the coast runs through the whole map from south to north
  let nearest = Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const line of m.coast) {
    for (let i = 0; i < line.length; i += 2) {
      nearest = Math.min(nearest, Math.hypot(line[i], line[i + 1]));
      yMin = Math.min(yMin, line[i + 1]);
      yMax = Math.max(yMax, line[i + 1]);
    }
  }
  assert.ok(nearest < 3, `coast ${nearest} km from home`);
  assert.ok(yMax - yMin > 80, `coast spans ${yMax - yMin} km`);
  assert.ok(m.plates.length > 0, "the plate boundary 46 km away is on the map");
  // Natural Earth's "Hualien" is 1.9 km from home: it names home and gets no label of its own
  assert.equal(m.homePlace, "Hualien");
  assert.ok(!m.places.some((p) => p.name === "Hualien"));
  for (const p of m.places) assert.ok(p.km <= m.radiusKm * 0.9);
});

test("outside the detail regions, or on a wide map, the 1:50m coastline is used", () => {
  assert.equal(inDetailRegion(HOME.lat, HOME.lon), true);
  assert.equal(inDetailRegion(35.68, 139.69), true); // Tokyo
  assert.equal(inDetailRegion(34.05, -118.24), true); // Los Angeles
  assert.equal(inDetailRegion(38.72, -9.14), false); // Lisbon
  const lisbon = localMapFor({ lat: 38.72, lon: -9.14 }, { lat: 36.0, lon: -10.5 });
  assert.equal(lisbon.detail, false);
  assert.ok(lisbon.coast.length > 0);
  // home in Taiwan, quake far away: the map is too wide for the detail regions
  const far = localMapFor(HOME, { lat: 35.68, lon: 139.69 });
  assert.equal(far.detail, false);
  assert.ok(far.radiusKm >= 2000 && far.epicentre.km * 1.5 <= far.radiusKm);
});

test("the map's inputs are used as given (no hidden data)", () => {
  const m = buildLocalMap({
    home: { lat: 0, lon: 0 },
    epicentre: { lat: -0.1, lon: 0 },
    detailCoast: [],
    detailRegions: [],
    coarseCoast: [[-1, 0, 1, 0]],
    detailLand: [],
    coarseLand: [[-1, -1, 1, -1, 1, 0, -1, 0]],
    plates: [],
    places: [{ name: "Near", lat: 0, lon: 0.2, rank: 3 }, { name: "Home town", lat: 0.01, lon: 0, rank: 9 }],
  });
  assert.equal(m.detail, false);
  assert.equal(m.coast.length, 1);
  assert.equal(m.plates.length, 0);
  assert.equal(m.homePlace, "Home town");
  assert.deepEqual(m.places.map((p) => p.name), ["Near"]);
  assert.ok(m.land.indices.length > 0, "the coarse land is used");
  assert.ok(inMesh(m.land, 0, -20) && !inMesh(m.land, 0, 20), "land south of the line, none north");
});

test("detail data: regions, land rings and places are well formed", () => {
  assert.equal(DETAIL_REGIONS.length, 3);
  for (const line of [...LAND_10M_DETAIL, ...LAND_50M]) {
    assert.ok(line.length >= 6 && line.length % 2 === 0);
    for (let i = 0; i < line.length; i += 2) {
      assert.ok(line[i] >= -180 && line[i] <= 180 && line[i + 1] >= -90 && line[i + 1] <= 90);
    }
  }
  assert.ok(PLACES.some((p) => p.name === "Hualien"));
  assert.ok(PLACES.every((p) => p.name.length > 0 && p.rank >= 0));
  assert.ok(COASTLINE_50M.length > 1000);
});

test("triangulate: area is preserved and every triangle runs counter-clockwise", () => {
  const shapes: number[][] = [
    [0, 0, 1, 0, 1, 1, 0, 1], // square
    [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2], // L shape
    [0, 0, 0, 2, 2, 2, 2, 0], // clockwise square
  ];
  const rand = rng(11);
  for (let s = 0; s < 20; s++) {
    // a random star: concave, simple
    const star: number[] = [];
    const n = 5 + Math.floor(rand() * 40);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const r = 1 + rand() * 4;
      star.push(r * Math.cos(a), r * Math.sin(a));
    }
    shapes.push(star);
  }
  for (const p of shapes) {
    const idx = triangulate(p);
    assert.equal(idx.length % 3, 0);
    assert.equal(idx.length / 3, p.length / 2 - 2, "n - 2 triangles");
    const mesh = { positions: p, indices: idx };
    assert.ok(Math.abs(meshArea(mesh) - Math.abs(polygonArea(p))) < 1e-9 * Math.max(1, Math.abs(polygonArea(p))));
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]].flatMap((i) => [p[2 * i], p[2 * i + 1]]);
      assert.ok(polygonArea(tri) > 0);
    }
  }
});

test("clipPolygonToCircle: keeps what is inside the map's circle", () => {
  const r = 10;
  const big = [-40, -40, 40, -40, 40, 40, -40, 40];
  const disc = clipPolygonToCircle(big, r);
  const ideal = 0.5 * 96 * r * r * Math.sin((2 * Math.PI) / 96); // the inscribed 96-gon
  assert.ok(Math.abs(polygonArea(disc) - ideal) < 1e-6, `${polygonArea(disc)} vs ${ideal}`);
  const small = [-1, -1, 1, -1, 1, 1, -1, 1];
  assert.ok(Math.abs(polygonArea(clipPolygonToCircle(small, r)) - 4) < 1e-9);
  assert.equal(clipPolygonToCircle([20, 20, 30, 20, 30, 30], r).length, 0);
  const half = clipPolygonToCircle([-40, -40, 40, -40, 40, 0, -40, 0], r);
  assert.ok(Math.abs(polygonArea(half) - ideal / 2) < 0.02 * ideal, "the southern half");
});

test("landRingsToCoast: a ring's outline, without the edges cut at a region's box", () => {
  const box = { id: "t", name: "T", box: [0, 0, 10, 10] as [number, number, number, number] };
  // an island cut by the box's east edge (x = 10): its cut edge is not coast
  const ring = [5, 2, 10, 2, 10, 8, 5, 8];
  const coast = landRingsToCoast([ring], [box]);
  assert.equal(coast.length, 1);
  assert.deepEqual(coast[0], [10, 8, 5, 8, 5, 2, 10, 2]);
  // a whole island: its full outline, closed
  const whole = landRingsToCoast([[2, 2, 4, 2, 4, 4]], [box]);
  assert.deepEqual(whole, [[2, 2, 4, 2, 4, 4, 2, 2]]);
});

test("the demo map's land: inland Taiwan is tinted, the sea east of Hualien is not", () => {
  const m = localMapFor(HOME, QUAKE);
  assert.ok(m.land.indices.length >= 3 && m.land.indices.length % 3 === 0);
  for (let i = 0; i < m.land.positions.length; i += 2) {
    assert.ok(Math.hypot(m.land.positions[i], m.land.positions[i + 1]) <= m.radiusKm + 1e-6);
  }
  assert.ok(inMesh(m.land, -20, 0), "20 km west of home: the Central Mountain Range");
  assert.ok(!inMesh(m.land, 20, 0), "20 km east of home: the Pacific");
  assert.ok(!inMesh(m.land, m.epicentre.x + 3, m.epicentre.y), "just east of the epicentre is sea");
  const lisbon = localMapFor({ lat: 38.72, lon: -9.14 }, { lat: 38.4, lon: -9.6 });
  assert.equal(lisbon.detail, false);
  assert.ok(inMesh(lisbon.land, 25, 0), "inland Portugal");
  assert.ok(!inMesh(lisbon.land, -30, 0), "the Atlantic");
});
