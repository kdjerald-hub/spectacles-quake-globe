// Done criterion 4 - Cover spot. (Registered as scenario id "cover_spot"; the class keeps its old
// name so the script asset's identity is unchanged.)
//
// Reset state; set the cover spot (seeded out of the forward view); fire the alert; then assert the
// shaking-stage behaviour: the headline reads "Drop, Cover, Hold On", the off-view arrow points to
// the cover spot, and the ONLY reachable alert button is "Shaking stopped" (Send and "I'm safe"
// live on the "after" page and must not be reachable while the ground shakes). Advance and close to
// leave a clean state.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { interactableReady, objectEnabled, resetState, textUnderParent, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class SafeSpotArrowScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Place the cover spot (seeded off to the side, out of view).
    await triggerButton(interactor, "Button Set cover spot");
    await waitForEnabled("Cover spot", true);
    expect(objectEnabled("Cover spot"), "Cover spot should be enabled after Set cover spot").toBe(true);

    // Fire the alert; the off-view arrow is posed in LateUpdate, so wait for a frame or two.
    await triggerButton(interactor, "Button Phone alert received");
    await waitForEnabled("Cover spot arrow", true);
    expect(
      objectEnabled("Cover spot arrow"),
      "Cover spot arrow should be enabled while the cover spot is out of the forward view",
    ).toBe(true);

    const headline = textUnderParent("Headline", "Alert During");
    expect(headline !== undefined, "Headline text should exist on the alert card").toBe(true);
    expect(headline, "Headline text during shaking").toBe("Drop, Cover, Hold On");

    // During shaking, the only reachable alert button is "Shaking stopped".
    expect(interactableReady("Button Shaking stopped"), '"Shaking stopped" should be reachable during shaking').toBe(true);
    expect(
      interactableReady("Button Send to emergency contacts"),
      "Send should NOT be reachable during shaking",
    ).toBe(false);
    expect(interactableReady("Button I'm safe"), "'I'm safe' should NOT be reachable during shaking").toBe(false);

    // Advance to "after", then close.
    await triggerButton(interactor, "Button Shaking stopped");
    await waitForEnabled("Alert After", true);
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
  }
}
