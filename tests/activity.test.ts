import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAY_MS, dailyCounts, describeActivity, median, nearestRank, summarizeActivity } from "../core/activity.ts";
import { parseFeed } from "../core/usgs.ts";
import type { Quake } from "../core/usgs.ts";

const REF = 1_800_000_000_000;
let seq = 0;

function at(ageMs: number, mag = 5): Quake {
  return { id: "q" + seq++, lat: 0, lon: 0, depthKm: 10, mag, timeMs: REF - ageMs, place: "" };
}

/** counts[k] events placed in the middle of window k. */
function synth(counts: number[], mag = 5): Quake[] {
  const out: Quake[] = [];
  counts.forEach((n, k) => {
    for (let i = 0; i < n; i++) out.push(at(k * DAY_MS + DAY_MS / 2, mag));
  });
  return out;
}

test("dailyCounts window boundaries match the documented intervals", () => {
  const quakes = [at(0), at(1), at(DAY_MS - 1), at(DAY_MS), at(2 * DAY_MS + 5), at(-1000)];
  // window 0: ages 0, 1, DAY-1; window 1: age DAY; window 2: age 2DAY+5; future event ignored
  assert.deepEqual(dailyCounts(quakes, REF, 3, 4.5), [3, 1, 1]);
});

test("dailyCounts applies the magnitude threshold", () => {
  assert.deepEqual(dailyCounts([at(10, 4.4), at(10, 4.5), at(10, 6)], REF, 1, 4.5), [2]);
});

test("percentile helpers use nearest rank and the usual median", () => {
  const s = Array.from({ length: 29 }, (_, i) => i + 1); // 1..29
  assert.equal(nearestRank(s, 0.1), 3);
  assert.equal(nearestRank(s, 0.9), 27);
  assert.equal(median(s), 15);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.ok(Number.isNaN(median([])));
});

function level(today: number, baseline: number[]): string {
  const counts = [today, ...baseline];
  return summarizeActivity(synth(counts), REF, 30 * DAY_MS).level;
}

test("classification against a varied month", () => {
  const baseline = [8, 9, 10, 10, 11, 12, 12, 12, 13, 13, 13, 14, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22, 24];
  assert.equal(baseline.length, 29);
  assert.equal(level(25, baseline), "busiest");
  assert.equal(level(23, baseline), "busier");
  assert.equal(level(14, baseline), "usual");
  assert.equal(level(9, baseline), "quieter");
  assert.equal(level(7, baseline), "quietest");
});

test("a flat month does not label ordinary days as unusual", () => {
  const flat = new Array(29).fill(10);
  flat[0] = 12; // one busier day so max > median
  assert.equal(level(10, flat), "usual");
  assert.equal(level(11, flat), "busier", "above p90 when p90 equals the median");
});

test("too little history is reported as insufficient, not guessed", () => {
  const s = summarizeActivity(synth([5, 5, 5]), REF, 10 * DAY_MS);
  assert.equal(s.level, "insufficient");
  assert.equal(s.baselineDays, 9);
  assert.match(describeActivity(s), /Not enough history/);
});

test("the oldest partially covered window is excluded", () => {
  // 30 days of coverage gives 29 full baseline windows, never 30.
  const s = summarizeActivity(synth(new Array(31).fill(3)), REF, 30 * DAY_MS);
  assert.equal(s.baselineDays, 29);
});

test("real 30-day snapshot: today's count matches an independent tally", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/usgs_4.5_month.geojson", import.meta.url), "utf8"));
  const feed = parseFeed(raw);
  const s = summarizeActivity(feed.quakes, feed.generatedMs, 30 * DAY_MS);
  const independent = feed.quakes.filter((e) => e.mag >= 4.5 && feed.generatedMs - e.timeMs < DAY_MS).length;
  assert.equal(s.todayCount, independent);
  assert.equal(s.baselineDays, 29);
  assert.ok(["busiest", "busier", "usual", "quieter", "quietest"].includes(s.level));
  assert.ok(s.min <= s.p10 && s.p10 <= s.median && s.median <= s.p90 && s.p90 <= s.max);
  const text = describeActivity(s);
  assert.match(text, new RegExp("Last 24 h: " + s.todayCount + " quakes M4.5\\+"));
});
