// Done criterion 4 - Safe spot + arrow.
// Reset state; trigger "Button Set safe spot"; assert "Safe spot" is enabled; trigger "Button
// Phone alert received"; advance frames; assert "Safe spot arrow" is enabled (the seed places the
// safe spot out of the forward view, and the arrow is posed in LateUpdate) and the Guidance text
// reads "Drop, Cover, Hold On". Then trigger "Button I'm safe" to reset.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { objectEnabled, resetState, textUnderParent, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class SafeSpotArrowScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Place the safe spot (seeded off to the side, out of view).
    await triggerButton(interactor, "Button Set safe spot");
    await waitForEnabled("Safe spot", true);
    expect(objectEnabled("Safe spot"), "Safe spot should be enabled after Set safe spot").toBe(true);

    // Fire the alert; the off-view arrow is posed in LateUpdate, so wait for a frame or two.
    await triggerButton(interactor, "Button Phone alert received");
    await waitForEnabled("Safe spot arrow", true);
    expect(
      objectEnabled("Safe spot arrow"),
      "Safe spot arrow should be enabled while the safe spot is out of the forward view",
    ).toBe(true);

    const guidance = textUnderParent("Guidance", "Alert Card");
    expect(guidance !== undefined, "Guidance text should exist on the Alert Card").toBe(true);
    expect(guidance, "Guidance text").toBe("Drop, Cover, Hold On");

    // Reset.
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
  }
}
