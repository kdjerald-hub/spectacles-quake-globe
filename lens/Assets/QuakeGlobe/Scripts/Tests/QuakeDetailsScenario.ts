// Done criterion 2 - Quake details.
// Reset state; trigger "Button Strongest"; assert the Details Card becomes enabled and its Body
// text shows a magnitude ("M ") and coordinates ("°"). Then trigger "Button Close" and assert the
// Details Card becomes disabled.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { objectEnabled, resetState, textUnderParent, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class QuakeDetailsScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Select the next-strongest live quake -> the Details Card appears.
    await triggerButton(interactor, "Button Strongest");
    await waitForEnabled("Details Card", true);
    expect(objectEnabled("Details Card"), "Details Card should be enabled after Strongest").toBe(true);

    const body = textUnderParent("Body", "Details Card");
    expect(body !== undefined, "Details Card Body text should exist").toBe(true);
    expect(
      body.includes("M "),
      `Details Body should contain magnitude "M " - got "${body}"`,
    ).toBe(true);
    expect(
      body.includes("°"),
      `Details Body should contain coordinates "°" - got "${body}"`,
    ).toBe(true);

    // Close clears the selection -> the Details Card hides again.
    await triggerButton(interactor, "Button Close");
    await waitForEnabled("Details Card", false);
    expect(objectEnabled("Details Card"), "Details Card should be disabled after Close").toBe(false);
  }
}
