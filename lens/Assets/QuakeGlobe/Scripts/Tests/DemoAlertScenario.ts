// Demo-video driver for the alert moment - for filming, not a test. Written by CLAD from the
// shot list. It presses the Lens's real buttons at a pace a viewer can follow and prints a
// "DEMO: <name>" marker line right after each step, so the camera can be moved from outside
// while it runs. No done criteria are asserted here; the six test scenarios cover those.
// Registered as scenario id "demo_alert" in LeafIndex.ts.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { resetState, triggerButton, wait, waitForQuakes } from "./TestHelpers";

@component
export class DemoAlertScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();

    // 1. Known start state, live quakes on the globe.
    await resetState(interactor);
    await waitForQuakes();
    print("DEMO: start");
    await wait(2000);

    // 2. Enter cover-spot placement (the camera looks down at the floor).
    await triggerButton(interactor, "Button Set cover spot");
    print("DEMO: cover");
    await wait(3000);

    // 3. The placement plane places the cover spot where the view points.
    await triggerButton(interactor, "Cover spot placement");
    print("DEMO: placed");
    await wait(4500);

    // 4. The alert fires: the globe turns and zooms into the map of my area; the viewer reads the card.
    await triggerButton(interactor, "Button Phone alert received");
    print("DEMO: alert");
    await wait(8000);

    // 5. No pinch: the camera turns to the cover spot and back.
    print("DEMO: look");
    await wait(8500);

    // 6. The shaking stops: the card advances to the details and next steps.
    await triggerButton(interactor, "Button Shaking stopped");
    print("DEMO: stopped");
    await wait(7500);

    // 7. Send the (simulated) message to the emergency contacts.
    await triggerButton(interactor, "Button Send to emergency contacts");
    print("DEMO: sent");
    await wait(4500);

    // 8. Close the alert: the map zooms back out to the live globe.
    await triggerButton(interactor, "Button I'm safe");
    print("DEMO: safe");
    await wait(3500);

    // 9. Done.
    print("DEMO: end");
  }
}
