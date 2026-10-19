import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FeedError, capForDisplay, feedUrl, parseFeed, strongestFirst } from "../core/usgs.ts";
import type { Quake } from "../core/usgs.ts";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8"));
}

function feature(over: Record<string, unknown> = {}, props: Record<string, unknown> = {}, coords?: unknown): unknown {
  return {
    type: "Feature",
    id: "id" + Math.random(),
    properties: { mag: 4.6, time: 1_700_000_000_000, place: "Somewhere", type: "earthquake", ...props },
    geometry: { type: "Point", coordinates: coords ?? [121.5, 23.9, 12.3] },
    ...over,
  };
}

function feed(features: unknown[], meta: Record<string, unknown> = {}): unknown {
  return { type: "FeatureCollection", metadata: { generated: 1_700_000_100_000, status: 200, title: "t", ...meta }, features };
}

for (const name of ["usgs_2.5_day.geojson", "usgs_2.5_week.geojson", "usgs_4.5_month.geojson"]) {
  test("real snapshot parses without losing events: " + name, () => {
    const raw = fixture(name) as { features: unknown[]; metadata: { generated: number } };
    const r = parseFeed(raw);
    assert.equal(r.generatedMs, raw.metadata.generated);
    assert.equal(r.quakes.length + r.skipped + r.nonEarthquakeEvents, raw.features.length, "every feature is accounted for");
    assert.equal(r.skipped, 0, "real snapshots should validate cleanly: " + JSON.stringify(r.skippedReasons));
    for (const q of r.quakes) {
      assert.ok(Number.isFinite(q.lat) && Number.isFinite(q.lon) && Number.isFinite(q.depthKm));
      assert.ok(Number.isFinite(q.mag) && q.timeMs > 0 && q.id.length > 0);
      assert.ok(q.timeMs <= r.generatedMs, "no event is newer than the feed itself");
    }
  });
}

test("structural problems fail loudly", () => {
  assert.throws(() => parseFeed(null), FeedError);
  assert.throws(() => parseFeed([]), FeedError);
  assert.throws(() => parseFeed({ type: "Feature" }), FeedError);
  assert.throws(() => parseFeed({ type: "FeatureCollection", features: [] }), /metadata/);
  assert.throws(() => parseFeed(feed([], { generated: "soon" })), /generated/);
  assert.throws(() => parseFeed(feed([], { status: 500 })), /status/);
  assert.throws(() => parseFeed({ type: "FeatureCollection", metadata: { generated: 1 } }), /features/);
});

test("bad features are skipped and counted by reason, never silently", () => {
  const r = parseFeed(
    feed([
      feature(),
      feature({}, { mag: null }),
      feature({}, {}, [200, 10, 5]),
      feature({}, {}, [10, 10, 4000]),
      feature({}, { time: "yesterday" }),
      feature({ id: "" }),
      feature({}, { mag: 42 }),
      feature({}, { type: "quarry blast" }),
      "garbage",
    ]),
  );
  assert.equal(r.quakes.length, 1);
  assert.equal(r.nonEarthquakeEvents, 1);
  assert.deepEqual(r.skippedReasons, {
    missing_magnitude: 1,
    bad_coordinates: 1,
    implausible_depth: 1,
    bad_time: 1,
    missing_id: 1,
    implausible_magnitude: 1,
    not_an_object: 1,
  });
  assert.equal(r.skipped, 7);
});

test("small negative depths are valid; null place becomes empty string", () => {
  const r = parseFeed(feed([feature({}, { place: null }, [-155.2, 19.4, -2.5])]));
  assert.equal(r.quakes[0].depthKm, -2.5);
  assert.equal(r.quakes[0].place, "");
});

function q(mag: number, timeMs: number): Quake {
  return { id: mag + "@" + timeMs, lat: 0, lon: 0, depthKm: 10, mag, timeMs, place: "" };
}

test("strongestFirst sorts by magnitude then recency without mutating", () => {
  const input = [q(3, 1), q(5, 1), q(5, 2), q(4, 9)];
  const copy = input.slice();
  assert.deepEqual(strongestFirst(input).map((e) => e.id), ["5@2", "5@1", "4@9", "3@1"]);
  assert.deepEqual(input, copy);
});

test("capForDisplay keeps the strongest and reports what it left out", () => {
  const input = [q(2.5, 1), q(6, 1), q(3, 1), q(5, 1)];
  const { kept, omitted } = capForDisplay(input, 2);
  assert.deepEqual(kept.map((e) => e.mag), [6, 5]);
  assert.equal(omitted, 2);
  assert.equal(capForDisplay(input, 10).omitted, 0);
});

test("feed URLs point at the USGS summary feeds over https", () => {
  assert.equal(feedUrl("4.5_month"), "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson");
});
