// Done criterion 3 - Alert.
// Reset state; trigger "Button Phone alert received" and assert the alert card appears within one
// second (the "during" page), the epicentre ring is marked on the globe, and the glanceable
// distance line reads like a real distance ("from home" ... "km"). Then advance ("Shaking stopped")
// and close ("I'm safe") so the card hides and later scenarios start clean.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { objectEnabled, resetState, textUnderParent, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class AlertScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Fire the simulated phone alert; the card must show within one second (done criterion 3).
    await triggerButton(interactor, "Button Phone alert received");
    const shownInTime = await waitForEnabled("Alert Card", true, 1000);
    expect(shownInTime, "Alert Card should be enabled within 1 s of the alert").toBe(true);

    expect(objectEnabled("Alert During"), "Alert should open on the 'during' stage").toBe(true);
    expect(
      objectEnabled("Alert epicentre ring"),
      "Alert epicentre ring should be enabled during an alert",
    ).toBe(true);

    const distance = textUnderParent("Distance", "Alert During");
    expect(distance !== undefined, "Distance text should exist on the alert card").toBe(true);
    expect(
      distance.includes("from home"),
      `Distance should contain "from home" - got "${distance}"`,
    ).toBe(true);
    expect(distance.includes("km"), `Distance should contain "km" - got "${distance}"`).toBe(true);

    // Advance to "after", then dismiss the alert ("I'm safe" lives on the "after" page).
    await triggerButton(interactor, "Button Shaking stopped");
    await waitForEnabled("Alert After", true);
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
    expect(objectEnabled("Alert Card"), "Alert Card should be disabled after I'm safe").toBe(false);
  }
}
