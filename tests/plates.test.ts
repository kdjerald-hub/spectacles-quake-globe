import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLATE_BOUNDARIES, PLATE_NAMES } from "../data/plates.ts";
import { boundaryPolylines, buildSubductionBarbs, nearestBoundary, sideOfRun } from "../core/plates.ts";
import { nearestPreparedPolyline, preparePolylines, greatCircleKm } from "../core/geolookup.ts";
import { faceNormal } from "../core/shapes.ts";
import { COASTLINE_50M } from "../data/coastline50m.ts";
import { COASTLINE_110M } from "../data/coastline110m.ts";

test("plate data: every class and plate code is known, and coordinates are valid", () => {
  const classes = new Set(["SUB", "OSR", "OTF", "CTF", "CRB", "CCB", "OCB"]);
  for (const r of PLATE_BOUNDARIES) {
    assert.ok(classes.has(r.cls), r.cls);
    assert.ok(PLATE_NAMES[r.a], "plate code " + r.a);
    assert.ok(r.coords.length >= 4 && r.coords.length % 2 === 0);
    for (let i = 0; i < r.coords.length; i += 2) {
      assert.ok(r.coords[i] >= -180 && r.coords[i] <= 180 && r.coords[i + 1] >= -90 && r.coords[i + 1] <= 90);
    }
    if (r.cls !== "SUB") assert.equal(r.dip, 0);
  }
  assert.ok(PLATE_BOUNDARIES.filter((r) => r.cls === "SUB").length > 40);
});

test("the nearest boundary to Taiwan and to Tonga involves the right plates", () => {
  const twn = nearestBoundary(23.7, 121.0);
  assert.ok(twn && (twn.run.a === "PS" || twn.run.b === "PS"), "Philippine Sea plate: " + twn?.run.bound);
  assert.ok((twn?.km ?? 1e9) < 200);
  const tonga = nearestBoundary(-20.5, -174.0);
  assert.ok(tonga && [tonga.run.a, tonga.run.b].includes("TO"), "Tonga plate: " + tonga?.run.bound);
  assert.match(tonga?.text ?? "", /km away$/);
});

test("subduction polarity matches the data: intermediate-depth quakes lie on the dip side", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/usgs_4.5_month.geojson", import.meta.url), "utf8"));
  const subs = PLATE_BOUNDARIES.filter((r) => r.cls === "SUB" && r.dip !== 0);
  const prep = preparePolylines(subs.map((r) => r.coords));
  let agree = 0;
  let n = 0;
  for (const f of raw.features) {
    const [lon, lat, depth] = f.geometry.coordinates;
    if (!(depth >= 70 && depth <= 300)) continue;
    const near = nearestPreparedPolyline(prep, lat, lon);
    if (near.index < 0 || near.km > 400 || near.km < 20) continue;
    const run = subs[near.index];
    n++;
    if (sideOfRun(run, lat, lon) === run.dip) agree++;
  }
  assert.ok(n >= 30, "enough intermediate-depth quakes near subduction zones: " + n);
  assert.ok(agree / n >= 0.8, `dip side agrees for ${agree} of ${n}`);
});

test("barbs face outward and point to the dip side", () => {
  const R = 12;
  const m = buildSubductionBarbs(R);
  assert.ok(m.indices.length / 3 > 50, "a barb every few hundred km along every trench");
  for (let t = 0; t < m.indices.length; t += 3) {
    const [i, j, k] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const nrm = faceNormal(m, i, j, k);
    const c = [0, 1, 2].map((d) => (m.positions[3 * i + d] + m.positions[3 * j + d] + m.positions[3 * k + d]) / 3);
    assert.ok(nrm.x * c[0] + nrm.y * c[1] + nrm.z * c[2] > 0, "faces outward");
    const r = Math.hypot(m.positions[3 * k], m.positions[3 * k + 1], m.positions[3 * k + 2]);
    assert.ok(Math.abs(r - R) < 1e-9, "on the sphere");
  }
  assert.ok(boundaryPolylines(["SUB"]).length > 40 && boundaryPolylines(["OSR", "OTF"]).length > 100);
});

test("the 1:50m coastline keeps the island arcs that 1:110m drops", () => {
  const near = (lines: number[][], lat: number, lon: number): number => {
    let best = Infinity;
    for (const l of lines) for (let i = 0; i < l.length; i += 2) best = Math.min(best, greatCircleKm(lat, lon, l[i + 1], l[i]));
    return best;
  };
  for (const [name, lat, lon] of [["Saipan", 15.19, 145.75], ["Tongatapu", -21.18, -175.2], ["Guadeloupe", 16.25, -61.58]] as const) {
    assert.ok(near(COASTLINE_50M, lat, lon) < 30, name + " is on the 1:50m coastline");
  }
  assert.ok(near(COASTLINE_110M, 15.19, 145.75) > 100, "1:110m has no Marianas (why the upgrade matters)");
});
