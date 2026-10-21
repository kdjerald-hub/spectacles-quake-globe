// Done criterion 5 - Emergency contacts.
// Reset state; fire the alert; pinch "Shaking stopped" to reach the "after" page (which shows the
// details and the send button); assert the details are shown; pinch "Send to emergency contacts"
// and assert the status line reads "Sent to emergency contacts". Then close with "I'm safe".

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { objectEnabled, resetState, textUnderParent, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class EmergencyContactsScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Fire the alert (opens on the "during" page).
    await triggerButton(interactor, "Button Phone alert received");
    await waitForEnabled("Alert Card", true);

    // "Shaking stopped" leads to the details ("after" page).
    await triggerButton(interactor, "Button Shaking stopped");
    await waitForEnabled("Alert After", true);
    expect(objectEnabled("Alert After"), "The 'after' page should show after Shaking stopped").toBe(true);
    const details = textUnderParent("Details", "Alert After");
    expect(details !== undefined, "Details text should exist on the 'after' page").toBe(true);
    expect(
      details.includes("USGS M7.4 (Taiwan CWA: ML 7.1)"),
      `Details should show the magnitude on both scales - got "${details}"`,
    ).toBe(true);
    expect(
      details.includes("Depth 40 km (USGS)"),
      `Details should show the sourced depth - got "${details}"`,
    ).toBe(true);

    // Send to the emergency contacts.
    await triggerButton(interactor, "Button Send to emergency contacts");
    const status = textUnderParent("Status", "Alert After");
    expect(status !== undefined, "Status text should exist on the 'after' page").toBe(true);
    expect(
      status.includes("Sent to emergency contacts"),
      `Status should confirm the send - got "${status}"`,
    ).toBe(true);

    // Close the alert.
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
  }
}
