import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alignmentRotation, facingRotation, quatMultiply, quatRotateVector } from "../core/geo.ts";
import type { Vec3 } from "../core/geo.ts";
import {
  DEFAULT_LABEL_CONFIG,
  activeLabelIds,
  apparentRadiusDeg,
  boxesOverlap,
  estimateTextWidthEm,
  labelBudget,
  layoutLabels,
  limbAlpha,
  nearestCountryLabelId,
  toViewAngles,
  viewFrame,
  zoomEquivalent,
} from "../core/labels.ts";
import type { LabelCandidate, LabelView } from "../core/labels.ts";
import { LABEL_CANDIDATES } from "../data/labels.ts";

const cfg = DEFAULT_LABEL_CONFIG;
const EYE: Vec3 = { x: 0, y: 0, z: 0 };

/** The Lens layout: globe 100 cm ahead (scaled by `distance`), 8 cm below eye level, facing (lat, lon). */
function view(faceLat: number, faceLon: number, scale = 1, distance = 100): LabelView {
  const k = distance / Math.hypot(8, 100);
  const centre = { x: 0, y: -8 * k, z: -100 * k };
  const rot = quatMultiply(alignmentRotation({ x: -centre.x, y: -centre.y, z: -centre.z }), facingRotation(faceLat, faceLon));
  return { globeCentre: centre, globeRotation: rot, globeRadius: 12 * scale, eye: EYE };
}

function cand(id: string, lat: number, lon: number, minLabel = 2, text = id, cls: LabelCandidate["cls"] = "country"): LabelCandidate {
  return { id, cls, text, lat, lon, minLabel, maxLabel: 9, rank: 3 };
}

test("apparent size and zoom equivalent at the default placement", () => {
  assert.ok(Math.abs(apparentRadiusDeg(12, 100) - 6.892) < 0.01);
  const z = zoomEquivalent(12, 100, cfg.pxDeg);
  assert.ok(z > 2.75 && z < 2.85, `z=${z}`);
  assert.ok(zoomEquivalent(36, 100, cfg.pxDeg) > z, "bigger globe, higher zoom");
  assert.ok(zoomEquivalent(12, 60, cfg.pxDeg) > z, "walking closer raises the zoom");
  assert.ok(Math.abs(zoomEquivalent(24, 200, cfg.pxDeg) - z) < 1e-9, "only R / (d - R) matters");
});

test("label budget: none on a tiny globe, capped when large, limited in the near field", () => {
  assert.equal(labelBudget(4.8, 100, cfg), 0);
  assert.equal(labelBudget(12, 100, cfg), 7);
  assert.equal(labelBudget(36, 100, cfg), cfg.maxLabels);
  assert.ok(labelBudget(12, 50, cfg) <= cfg.nearFieldMax);
});

test("limb fade: 1 facing the viewer, 0 at and beyond the horizon, never increasing outward", () => {
  const centre = { x: 0, y: 0, z: -100 };
  assert.equal(limbAlpha({ x: 0, y: 0, z: 1 }, centre, EYE, 12, cfg), 1);
  assert.equal(limbAlpha({ x: 0, y: 0, z: -1 }, centre, EYE, 12, cfg), 0);
  const horizon = Math.acos(12 / 100);
  assert.equal(limbAlpha({ x: Math.sin(horizon), y: 0, z: Math.cos(horizon) }, centre, EYE, 12, cfg), 0);
  let prev = 2;
  for (let deg = 0; deg <= 90; deg += 2) {
    const a = (deg * Math.PI) / 180;
    const v = limbAlpha({ x: Math.sin(a), y: 0, z: Math.cos(a) }, centre, EYE, 12, cfg);
    assert.ok(v <= prev + 1e-12);
    prev = v;
  }
});

test("view angles: the globe centre is the origin, right is +x, up is +y", () => {
  const v = view(0, 0);
  const f = viewFrame(EYE, v.globeCentre);
  const c = toViewAngles(f, EYE, v.globeCentre);
  assert.ok(Math.abs(c.x) < 1e-9 && Math.abs(c.y) < 1e-9);
  assert.ok(toViewAngles(f, EYE, { x: 5, y: -8, z: -100 }).x > 0);
  assert.ok(toViewAngles(f, EYE, { x: 0, y: 0, z: -100 }).y > 0);
});

test("text width estimate: CJK one em per glyph, capitals wider than lower case", () => {
  assert.equal(estimateTextWidthEm("日本"), 2);
  assert.ok(estimateTextWidthEm("JAPAN") > estimateTextWidthEm("japan"));
});

test("placed labels face the eye, stay upright, sit above the surface and never overlap", () => {
  const cands: LabelCandidate[] = [];
  for (let lat = -60; lat <= 60; lat += 10) for (let lon = -60; lon <= 60; lon += 10) cands.push(cand(`L${lat},${lon}`, lat, lon, 2, `Place ${lat} ${lon}`));
  const v = view(0, 0, 3);
  const r = layoutLabels(cands, v, cfg, new Map(), 0);
  assert.ok(r.placed.length > 3 && r.placed.length <= r.budget);
  for (let i = 0; i < r.placed.length; i++) {
    const p = r.placed[i];
    const toEye = { x: EYE.x - p.position.x, y: EYE.y - p.position.y, z: EYE.z - p.position.z };
    const l = Math.hypot(toEye.x, toEye.y, toEye.z);
    const fwd = quatRotateVector(p.rotation, { x: 0, y: 0, z: 1 });
    assert.ok(Math.abs(fwd.x - toEye.x / l) < 1e-9 && Math.abs(fwd.y - toEye.y / l) < 1e-9 && Math.abs(fwd.z - toEye.z / l) < 1e-9, "faces the eye");
    assert.ok(Math.abs(quatRotateVector(p.rotation, { x: 1, y: 0, z: 0 }).y) < 1e-9, "no roll");
    const rc = Math.hypot(p.position.x - v.globeCentre.x, p.position.y - v.globeCentre.y, p.position.z - v.globeCentre.z);
    assert.ok(Math.abs(rc - v.globeRadius * (1 + cfg.liftFraction)) < 1e-9, "lifted above the surface");
    for (let j = 0; j < i; j++) assert.ok(!boxesOverlap(p.box, r.placed[j].box), `${p.id} overlaps ${r.placed[j].id}`);
  }
});

test("layout is deterministic and independent of input order", () => {
  const cands = [cand("A", 0, 0, 1.7), cand("B", 0, 3, 2), cand("C", 10, -10, 2), cand("D", -20, 15, 3), cand("E", 30, 30, 1.7)];
  const v = view(0, 0, 3);
  const ids = (cs: LabelCandidate[]): string => layoutLabels(cs, v, cfg, new Map(), 0).placed.map((p) => p.id).sort().join();
  assert.equal(ids(cands), ids([...cands].reverse()));
  assert.equal(ids(cands), ids([cands[2], cands[0], cands[4], cands[1], cands[3]]));
});

test("in a conflict the more important label wins; far-side and out-of-zoom labels are dropped", () => {
  const v = view(0, 0, 1);
  const r = layoutLabels([cand("minor", 0, 1, 2.0), cand("major", 0, 0, 1.7), cand("farside", 0, 180, 1.7), cand("tooSmall", 20, 20, 6)], v, cfg, new Map(), 0);
  const ids = r.placed.map((p) => p.id);
  assert.ok(ids.includes("major") && !ids.includes("minor"));
  assert.ok(!ids.includes("farside"));
  assert.ok(!ids.includes("tooSmall"));
});

test("labels avoid obstacles such as the selected quake, and dim while it is selected", () => {
  const v = view(0, 0, 1);
  const c = [cand("here", 0, 0, 1.7)];
  const free = layoutLabels(c, v, cfg, new Map(), 0);
  assert.equal(free.placed.length, 1);
  assert.equal(layoutLabels(c, v, cfg, new Map(), 0, [{ x0: -1, y0: -1, x1: 1, y1: 1 }]).placed.length, 0);
  const dimmed = layoutLabels(c, v, cfg, new Map(), 0, [], true);
  assert.ok(Math.abs(dimmed.placed[0].alpha - free.placed[0].alpha * cfg.selectionDim) < 1e-12);
});

test("hysteresis: a newly shown label is kept for minDwellS, then the better label takes over", () => {
  const v = view(0, 0, 1);
  const shown = layoutLabels([cand("old", 0, 0, 2.0)], v, cfg, new Map(), 0);
  assert.equal(shown.placed[0].id, "old");
  const both = [cand("old", 0, 0, 2.0), cand("new", 0, 0.5, 1.0)];
  const soon = layoutLabels(both, v, cfg, shown.memory, cfg.minDwellS / 2);
  assert.deepEqual(soon.placed.map((p) => p.id), ["old"]);
  const later = layoutLabels(both, v, cfg, soon.memory, cfg.minDwellS * 2);
  assert.deepEqual(later.placed.map((p) => p.id), ["new"]);
});

test("the same words are never shown twice (North and South Pacific)", () => {
  const v = view(0, -150, 3);
  const r = layoutLabels([cand("np", 20, -150, 1, "Pacific Ocean", "ocean"), cand("sp", -20, -150, 1, "Pacific Ocean", "ocean")], v, cfg, new Map(), 0);
  assert.equal(r.placed.length, 1);
});

test("a boosted label appears earlier; activeLabelIds picks countries near strong quakes", () => {
  const v = view(23, 121, 1);
  const twn = cand("TWN", 23.65, 120.87, 4.5, "Taiwan");
  assert.equal(layoutLabels([twn], v, cfg, new Map(), 0).placed.length, 0, "Natural Earth hides Taiwan at this size");
  assert.equal(layoutLabels([twn], v, cfg, new Map(), 0, [], false, new Set(["TWN"])).placed.length, 1);
  const ids = activeLabelIds([twn, cand("FAR", -40, -60)], [{ lat: 24.0, lon: 122.0, mag: 5.8 }, { lat: -40, lon: -60, mag: 4.0 }]);
  assert.deepEqual([...ids], ["TWN"], "only strong quakes count, only nearby countries");
  assert.equal(activeLabelIds([twn], [{ lat: 24.0, lon: 122.0, mag: 5.1 }]).size, 0, "M5.1 is below the default threshold");
});

test("a pinned label (the user's home) is shown at any size, before everything else", () => {
  const v = view(23, 121, 1);
  const twn = cand("TWN", 23.65, 120.87, 6, "Taiwan");
  const r = layoutLabels([cand("BIG", 23.65, 120.87, 0, "Big Place"), twn], v, cfg, new Map(), 0, [], false, new Set(), new Set(["TWN"]));
  assert.deepEqual(r.placed.map((p) => p.id), ["TWN"], "the pinned label wins the shared spot");
});

test("with the real data and Taipei as home, Taiwan and Japan are named at the default size", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/usgs_4.5_month.geojson", import.meta.url), "utf8"));
  const quakes = raw.features.map((f: any) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], mag: f.properties.mag }));
  const boosted = activeLabelIds(LABEL_CANDIDATES, quakes);
  assert.ok(boosted.size > 0 && boosted.size < 25, "boost stays selective: " + boosted.size);
  const home = nearestCountryLabelId(LABEL_CANDIDATES, 25.03, 121.56);
  assert.equal(home, "c:TWN");
  const r = layoutLabels(LABEL_CANDIDATES, view(28, 128, 1), cfg, new Map(), 0, [], false, boosted, new Set([home as string]));
  const ids = r.placed.map((p) => p.id);
  assert.ok(ids.includes("c:TWN"), "Taiwan: " + ids.join(", "));
  assert.ok(ids.includes("c:JPN"), "Japan: " + ids.join(", "));
  assert.ok(r.placed.length <= labelBudget(12, Math.hypot(8, 100), cfg));
});
