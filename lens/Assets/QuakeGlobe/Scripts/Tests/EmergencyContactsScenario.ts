// Done criterion 5 - Emergency contacts.
// Reset state; trigger "Button Phone alert received"; trigger "Button Send to emergency contacts";
// assert the Status text (on the Alert Card) reads "Sent to emergency contacts". Then trigger
// "Button I'm safe" to reset.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { resetState, textUnderParent, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class EmergencyContactsScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Fire the alert, then send to the emergency contacts.
    await triggerButton(interactor, "Button Phone alert received");
    await waitForEnabled("Alert Card", true);

    await triggerButton(interactor, "Button Send to emergency contacts");

    // The Status line on the Alert Card (not the always-on Status line on the main Panel).
    const status = textUnderParent("Status", "Alert Card");
    expect(status !== undefined, "Status text should exist on the Alert Card").toBe(true);
    expect(status, "Alert Card Status text after sending").toBe("Sent to emergency contacts");

    // Reset.
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
  }
}
