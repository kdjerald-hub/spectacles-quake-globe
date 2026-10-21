// Demo-video driver (not a done-criterion test; see DemoAlertScenario.ts).
// demo_globe: a walk around the live globe (the camera moves from outside on "DEMO: walk"), then
// Strongest twice and the three time windows.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { resetState, triggerButton, wait, waitForQuakes } from "./TestHelpers";

@component
export class DemoGlobeScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);
    await waitForQuakes();
    print("DEMO: start");
    await wait(2000);
    print("DEMO: walk");
    await wait(12000);
    await triggerButton(interactor, "Button Strongest");
    print("DEMO: strongest");
    await wait(5000);
    await triggerButton(interactor, "Button Strongest");
    print("DEMO: strongest 2");
    await wait(5000);
    await triggerButton(interactor, "Button 30 days");
    print("DEMO: 30 days");
    await wait(4000);
    await triggerButton(interactor, "Button 24 h");
    print("DEMO: 24 h");
    await wait(3500);
    await triggerButton(interactor, "Button 7 days");
    print("DEMO: 7 days");
    await wait(3000);
    print("DEMO: end");
  }
}
