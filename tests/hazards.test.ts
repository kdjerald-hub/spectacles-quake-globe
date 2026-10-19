import { test } from "node:test";
import assert from "node:assert/strict";
import { EARTHQUAKE, nextStage, profileForAlert } from "../core/hazards.ts";
import type { AlertEvent, HazardProfile } from "../core/hazards.ts";

const quakeAlert: AlertEvent = {
  event: "Earthquake",
  sent: "2024-04-02T23:58:12Z",
  senderName: "Simulation of a national earthquake alert",
  areaDesc: "Hualien County",
  origin: { lat: 23.8356, lon: 121.5976, depthKm: 40 },
  magnitude: 7.4,
  simulated: true,
};

test("an earthquake alert selects the earthquake profile, whatever the case of the event name", () => {
  assert.equal(profileForAlert(quakeAlert), EARTHQUAKE);
  assert.equal(profileForAlert({ ...quakeAlert, event: " earthquake " }), EARTHQUAKE);
  assert.equal(profileForAlert({ ...quakeAlert, event: "Tsunami" }), undefined, "unknown hazards are not guessed");
});

test("the earthquake guidance leads with drop, cover, hold on, and keeps you where you are", () => {
  assert.equal(EARTHQUAKE.headline, "Drop, Cover, Hold On");
  assert.ok(EARTHQUAKE.during.some((l) => /stay where you are/i.test(l)));
  assert.ok(!EARTHQUAKE.during.some((l) => /\b(run|go to|move to)\b/i.test(l)), "no instruction to move while shaking");
  assert.ok(EARTHQUAKE.after.some((l) => /aftershock/i.test(l)));
});

test("stages: the user ends 'during' with the advance button and 'after' with I'm safe", () => {
  assert.equal(nextStage("during", "safe"), "during", "can't skip straight to safe while shaking");
  assert.equal(nextStage("during", "advance"), "after");
  assert.equal(nextStage("after", "advance"), "after");
  assert.equal(nextStage("after", "safe"), "done");
  assert.equal(nextStage("done", "advance"), "done");
});

test("another hazard plugs in as data, without code changes", () => {
  // Illustration only: this profile is not wired into the Lens.
  const shelter: HazardProfile = {
    id: "air-raid",
    capEvent: "Air Raid",
    title: "Air-raid alert",
    headline: "Go to the nearest shelter",
    during: ["Move away from windows."],
    spotLabel: "Shelter",
    advanceLabel: "All clear",
    after: ["Wait for the official all-clear."],
    guidanceSource: "Example only",
  };
  const profiles = [EARTHQUAKE, shelter];
  assert.equal(profileForAlert({ ...quakeAlert, event: "Air Raid", origin: undefined }, profiles), shelter);
  assert.equal(profileForAlert(quakeAlert, profiles), EARTHQUAKE);
});
