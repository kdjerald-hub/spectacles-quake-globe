// Demo-video drivers (not done-criterion tests): demo_alert and demo_globe press the Lens's real
// buttons at a pace a viewer can follow. They were written for filming by the orchestrating agent,
// not by CLAD. LEAF resets the Lens before every scenario, so each one plays a whole take; it
// prints "DEMO: <step>" markers so the camera can be moved from outside while it runs.
//
// demo_alert: set the cover spot on the floor, fire the alert, look at the cover spot, then the
// "after" stage: details, send to emergency contacts, I'm safe.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { resetState, triggerButton, wait, waitForQuakes } from "./TestHelpers";

@component
export class DemoAlertScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);
    await waitForQuakes();
    print("DEMO: start");
    await wait(2000);
    await triggerButton(interactor, "Button Set cover spot");
    print("DEMO: cover"); // the camera looks down at the floor
    await wait(2600);
    await triggerButton(interactor, "Cover spot placement");
    print("DEMO: placed"); // the camera looks back up
    await wait(2800);
    await triggerButton(interactor, "Button Phone alert received");
    print("DEMO: alert");
    await wait(5000);
    print("DEMO: look"); // the camera turns to the cover spot and back
    await wait(6500);
    await triggerButton(interactor, "Button Shaking stopped");
    print("DEMO: stopped");
    await wait(6500);
    await triggerButton(interactor, "Button Send to emergency contacts");
    print("DEMO: sent");
    await wait(3500);
    await triggerButton(interactor, "Button I'm safe");
    print("DEMO: safe");
    await wait(2500);
    print("DEMO: end");
  }
}
