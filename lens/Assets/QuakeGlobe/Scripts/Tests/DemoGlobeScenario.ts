// Demo-video driver for the live globe - for filming, not a test. Written by CLAD from the
// shot list. It presses the Lens's real buttons at a pace a viewer can follow and prints a
// "DEMO: <name>" marker line right after each step, so the camera can be moved from outside
// while it runs. No done criteria are asserted here; the six test scenarios cover those.
// Registered as scenario id "demo_globe" in LeafIndex.ts.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { resetState, triggerButton, wait, waitForQuakes } from "./TestHelpers";

@component
export class DemoGlobeScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();

    // 1. Known start state, live quakes on the globe.
    await resetState(interactor);
    await waitForQuakes();
    print("DEMO: start");
    await wait(2000);

    // 2. No pinch: the camera walks around the spinning globe.
    print("DEMO: walk");
    await wait(12000);

    // 3. Strongest: the globe turns the strongest quake toward the viewer.
    await triggerButton(interactor, "Button Strongest");
    print("DEMO: strongest");
    await wait(5000);

    // 4. Strongest again: the next-strongest quake.
    await triggerButton(interactor, "Button Strongest");
    print("DEMO: strongest 2");
    await wait(5000);

    // 5-7. The three time windows.
    await triggerButton(interactor, "Button 30 days");
    print("DEMO: 30 days");
    await wait(4000);

    await triggerButton(interactor, "Button 24 h");
    print("DEMO: 24 h");
    await wait(3500);

    await triggerButton(interactor, "Button 7 days");
    print("DEMO: 7 days");
    await wait(3000);

    // 8. Done.
    print("DEMO: end");
  }
}
