import { test } from "node:test";
import assert from "node:assert/strict";
import { MINUTE_MS, classifyFreshness, describeFreshness, formatAge, retryDelaySeconds } from "../core/freshness.ts";

const NOW = 1_800_000_000_000;

test("freshness classes follow the documented thresholds", () => {
  assert.equal(classifyFreshness(NOW, NOW), "live");
  assert.equal(classifyFreshness(NOW - 15 * MINUTE_MS, NOW), "live");
  assert.equal(classifyFreshness(NOW - 16 * MINUTE_MS, NOW), "delayed");
  assert.equal(classifyFreshness(NOW - 60 * MINUTE_MS, NOW), "delayed");
  assert.equal(classifyFreshness(NOW - 61 * MINUTE_MS, NOW), "stale");
});

test("a feed from the future flags the device clock instead of claiming live data", () => {
  assert.equal(classifyFreshness(NOW + 4 * MINUTE_MS, NOW), "live", "small skew is tolerated");
  assert.equal(classifyFreshness(NOW + 6 * MINUTE_MS, NOW), "clock_mismatch");
  assert.match(describeFreshness("clock_mismatch", -6 * MINUTE_MS, false), /clock/);
});

test("ages read naturally", () => {
  assert.equal(formatAge(-5000), "just now");
  assert.equal(formatAge(30_000), "just now");
  assert.equal(formatAge(4 * MINUTE_MS + 59_000), "4 min ago");
  assert.equal(formatAge(3 * 60 * MINUTE_MS), "3 h ago");
  assert.equal(formatAge(50 * 60 * MINUTE_MS), "2 d ago");
});

test("retry backoff doubles and caps at ten minutes", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((a) => retryDelaySeconds(a)), [30, 60, 120, 240, 480, 600]);
  assert.equal(retryDelaySeconds(1000), 600);
  assert.equal(retryDelaySeconds(-3), 30);
});

test("offline status always says so, whatever the age", () => {
  assert.equal(describeFreshness("live", 2 * MINUTE_MS, true), "Offline - showing data from 2 min ago");
  assert.equal(describeFreshness("stale", 2 * 60 * MINUTE_MS, false), "Stale - last update 2 h ago");
});
