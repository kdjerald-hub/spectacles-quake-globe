// Done criterion 3 - Alert.
// Reset state; trigger "Button Phone alert received"; within a frame or two assert the Alert Card
// is enabled, the Alert epicentre ring is enabled, and the Distance text reads like a real
// distance ("from home" ... "km"). Then trigger "Button I'm safe" and assert the Alert Card hides.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { advanceFrames, objectEnabled, resetState, textUnderParent, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class AlertScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Fire the simulated phone alert.
    await triggerButton(interactor, "Button Phone alert received");
    await waitForEnabled("Alert Card", true);
    await advanceFrames(2);

    expect(objectEnabled("Alert Card"), "Alert Card should be enabled during an alert").toBe(true);
    expect(
      objectEnabled("Alert epicentre ring"),
      "Alert epicentre ring should be enabled during an alert",
    ).toBe(true);

    const distance = textUnderParent("Distance", "Alert Card");
    expect(distance !== undefined, "Distance text should exist on the Alert Card").toBe(true);
    expect(
      distance.includes("from home"),
      `Distance should contain "from home" - got "${distance}"`,
    ).toBe(true);
    expect(distance.includes("km"), `Distance should contain "km" - got "${distance}"`).toBe(true);

    // Dismiss the alert.
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
    expect(objectEnabled("Alert Card"), "Alert Card should be disabled after I'm safe").toBe(false);
  }
}
