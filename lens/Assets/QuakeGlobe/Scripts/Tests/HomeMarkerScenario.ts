// Optional extra - Home.
// Reset state; trigger "Button Set home" (enters set-home mode). "Set as home" is hidden until a
// point on the globe has been picked (design brief), so first pinch the globe itself, then pinch
// "Button Set as home" to confirm; assert the "Home marker" object is enabled.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { interactableReady, objectEnabled, resetState, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class HomeMarkerScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Enter set-home mode. Only "Set home" shows to start with.
    await triggerButton(interactor, "Button Set home");
    expect(
      interactableReady("Button Set as home"),
      '"Set as home" should be hidden until a point on the globe is picked',
    ).toBe(false);

    // Pick a point on the globe (a pinch on the globe in home mode), which reveals "Set as home".
    await triggerButton(interactor, "Globe");

    // Confirm home.
    await triggerButton(interactor, "Button Set as home");
    await waitForEnabled("Home marker", true);
    expect(objectEnabled("Home marker"), "Home marker should be enabled after Set as home").toBe(true);
  }
}
