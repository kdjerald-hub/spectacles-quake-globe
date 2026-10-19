import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GlobeModel } from "../core/model.ts";
import { SETTINGS } from "../core/config.ts";

function raw(name: string): any {
  return JSON.parse(readFileSync(new URL("./fixtures/usgs_" + name + ".geojson", import.meta.url), "utf8"));
}

test("starts on the configured view and asks for the view feed plus the activity feed", () => {
  const m = new GlobeModel();
  assert.equal(m.viewId, SETTINGS.initialView);
  assert.deepEqual(m.feedsToFetch(), ["2.5_week", "4.5_month"]);
  m.setView("month");
  assert.deepEqual(m.feedsToFetch(), ["4.5_month"], "no duplicate fetch when the view uses the activity feed");
});

test("before data arrives the status says what is happening", () => {
  const m = new GlobeModel();
  assert.match(m.viewModel(Date.now(), true).statusLine, /Loading/);
  assert.match(m.viewModel(Date.now(), false).statusLine, /Waiting for an internet connection/);
  m.fail("2.5_week", "HTTP 503");
  const vm = m.viewModel(Date.now(), true);
  assert.equal(vm.hasData, false);
  assert.match(vm.statusLine, /HTTP 503.*retrying in 30 s/);
});

test("good data produces markers, counts and an activity comparison", () => {
  const m = new GlobeModel();
  const week = raw("2.5_week");
  const month = raw("4.5_month");
  m.ingest("2.5_week", week);
  m.ingest("4.5_month", month);
  const vm = m.viewModel(week.metadata.generated + 60_000, true);
  assert.equal(vm.hasData, true);
  assert.equal(vm.freshness, "live");
  assert.equal(vm.markers.length, week.features.length);
  assert.match(vm.countLine, new RegExp("^" + week.features.length + " quakes, M2.5\\+, past 7 days$"));
  assert.match(vm.activityText, /^Last 24 h: \d+ quakes M4\.5\+\n/);
  assert.match(vm.statusLine, /^Updated 1 min ago$/);
});

test("offline with old data says offline instead of pretending to be live", () => {
  const m = new GlobeModel();
  const week = raw("2.5_week");
  m.ingest("2.5_week", week);
  const vm = m.viewModel(week.metadata.generated + 3 * 3600_000, false);
  assert.match(vm.statusLine, /^Offline - showing data from 3 h ago/);
  assert.equal(vm.markers.length, week.features.length, "the last good picture stays on screen");
});

test("a failed refresh keeps the last good data and backs off", () => {
  const m = new GlobeModel();
  m.ingest("2.5_week", raw("2.5_week"));
  assert.equal(m.nextFetchDelaySeconds("2.5_week"), SETTINGS.refreshSeconds);
  m.fail("2.5_week", "timeout");
  m.fail("2.5_week", "timeout");
  assert.equal(m.nextFetchDelaySeconds("2.5_week"), 60);
  const vm = m.viewModel(Date.now(), true);
  assert.equal(vm.hasData, true);
  assert.match(vm.statusLine, /update failed, retrying/);
});

test("returning to a view refetches data that has gone stale", () => {
  const m = new GlobeModel();
  const week = raw("2.5_week");
  const gen = week.metadata.generated;
  assert.equal(m.refreshDueInSeconds("2.5_week", gen), 0, "no data yet: due now");
  m.ingest("2.5_week", week);
  assert.equal(m.refreshDueInSeconds("2.5_week", gen + 60_000), SETTINGS.refreshSeconds - 60);
  assert.equal(m.refreshDueInSeconds("2.5_week", gen + 3 * 3600_000), 0, "cache from hours ago: due now");
  // A device clock far behind the server cannot postpone a refresh beyond one interval...
  assert.equal(m.refreshDueInSeconds("2.5_week", gen - 3600_000), SETTINGS.refreshSeconds);
  // ...and a clock far ahead only makes it due now; after that fetch the fixed interval applies.
  assert.equal(m.refreshDueInSeconds("2.5_week", gen + 10 * 3600_000), 0);
  assert.equal(m.nextFetchDelaySeconds("2.5_week"), SETTINGS.refreshSeconds);
  m.fail("2.5_week", "timeout");
  assert.equal(m.refreshDueInSeconds("2.5_week", gen + 3 * 3600_000), 30, "a failing feed keeps its backoff");
});

test("garbage counts as a failure and never replaces good data", () => {
  const m = new GlobeModel();
  const week = raw("2.5_week");
  m.ingest("2.5_week", week);
  const before = m.markersVersion;
  m.ingest("2.5_week", { hello: "world" });
  assert.equal(m.slots["2.5_week"].failures, 1);
  assert.equal(m.markersVersion, before);
  assert.equal(m.viewModel(week.metadata.generated, true).markers.length, week.features.length);
});

test("an older feed cannot roll the picture back in time", () => {
  const m = new GlobeModel();
  const week = raw("2.5_week");
  m.ingest("2.5_week", week);
  const older = structuredClone(week);
  older.metadata.generated -= 600_000;
  older.features = older.features.slice(0, 3);
  m.ingest("2.5_week", older);
  assert.equal(m.viewModel(week.metadata.generated, true).markers.length, week.features.length);
});

test("the tour cycles through the strongest events and wraps", () => {
  const m = new GlobeModel();
  const week = raw("2.5_week");
  m.ingest("2.5_week", week);
  const tour = m.tour();
  assert.equal(tour.length, SETTINGS.tourSize);
  for (let i = 1; i < tour.length; i++) assert.ok(tour[i - 1].mag >= tour[i].mag);
  const seen: string[] = [];
  for (let i = 0; i < tour.length + 1; i++) seen.push(m.selectNext()!.id);
  assert.equal(seen[0], tour[0].id);
  assert.equal(seen[tour.length], tour[0].id, "wraps to the start");
  const vm = m.viewModel(week.metadata.generated, true);
  assert.equal(vm.selected?.id, tour[0].id);
  assert.match(vm.detailText, /^M \d\.\d  -  \d+ km deep  -  .+\n.+\nStrongest 1 of 10$/);
});

test("switching views clears the selection and bumps the markers version", () => {
  const m = new GlobeModel();
  m.ingest("2.5_week", raw("2.5_week"));
  m.selectNext();
  const v = m.markersVersion;
  m.setView("day");
  assert.equal(m.selectedId, "");
  assert.ok(m.markersVersion > v);
  assert.throws(() => m.setView("year" as any), /unknown view/);
});

test("invalid records are admitted in the status line", () => {
  const m = new GlobeModel();
  const week = raw("2.5_week");
  week.features[0].properties.mag = null;
  m.ingest("2.5_week", week);
  assert.match(m.viewModel(week.metadata.generated, true).statusLine, /1 invalid records ignored/);
});
