// Done criterion 2 - Quake details.
// Reset state; pinch a quake on the globe the way a person would: trigger one of the overlay's
// "Quake pick N" targets, which hold the current strongest live quakes (committee's second review
// 2026-10-21). Assert the Details Card becomes enabled and its Body shows every field the
// criterion names, one per line (Emergency.quakeCardText): magnitude and depth, coordinates,
// place, time, and the nearest plate boundary. Then trigger "Button Close" and assert the Details
// Card becomes disabled. The Strongest button stays covered by the demo drivers and resetState.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import {
  interactableReady,
  objectEnabled,
  resetState,
  textUnderParent,
  triggerButton,
  waitForEnabled,
  waitForQuakes,
  waitUntil,
} from "./TestHelpers";

@component
export class QuakeDetailsScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // The pick targets overlay the strongest live quakes, so wait until the feed has loaded
    // (Count shows a number above zero), then until a pick slot holds a quake: updatePickTargets
    // enables "Quake pick 0" only once it carries a live quake id.
    const loaded = await waitForQuakes();
    expect(loaded, "Live quakes should load (Count > 0) before pinching a quake").toBe(true);
    const pickReady = await waitUntil(() => interactableReady("Quake pick 0"), 5000);
    expect(pickReady, '"Quake pick 0" should hold a live quake once the feed has loaded').toBe(true);

    // Pinch the quake on the globe -> the Details Card appears.
    await triggerButton(interactor, "Quake pick 0");
    await waitForEnabled("Details Card", true);
    expect(objectEnabled("Details Card"), "Details Card should be enabled after pinching a quake").toBe(true);

    const body = textUnderParent("Body", "Details Card");
    expect(body !== undefined, "Details Card Body text should exist").toBe(true);
    const lines = (body !== undefined ? body : "").split("\n");
    expect(lines.length, `Details Body should have 5 lines - got "${body}"`).toBe(5);
    expect(
      /^M \d+\.\d+\s+depth \d+ km$/.test(lines[0]),
      `Line 1 should show magnitude and depth like "M 5.6    depth 40 km" - got "${lines[0]}"`,
    ).toBe(true);
    expect(
      /^\d+\.\d+°[NS],\s+\d+\.\d+°[EW]$/.test(lines[1]),
      `Line 2 should show coordinates like "23.84°N,  121.60°E" - got "${lines[1]}"`,
    ).toBe(true);
    expect(lines[2].length > 0, `Line 3 should name the place - got "${lines[2]}"`).toBe(true);
    expect(
      /^(just now|\d+ (min|h|d) ago)$/.test(lines[3]),
      `Line 4 should show the time like "4 min ago" - got "${lines[3]}"`,
    ).toBe(true);
    expect(
      /^Nearest boundary: .+ km away$/.test(lines[4]),
      `Line 5 should name the nearest plate boundary - got "${lines[4]}"`,
    ).toBe(true);

    // Close clears the selection -> the Details Card hides again.
    await triggerButton(interactor, "Button Close");
    await waitForEnabled("Details Card", false);
    expect(objectEnabled("Details Card"), "Details Card should be disabled after Close").toBe(false);
  }
}
