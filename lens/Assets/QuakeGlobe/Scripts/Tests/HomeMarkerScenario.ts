// Optional extra - Home.
// Reset state; trigger "Button Set home" (enters set-home mode, shows a provisional home marker);
// trigger "Button Set as Home" (confirms home); assert the "Home marker" object is enabled.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { objectEnabled, resetState, triggerButton, waitForEnabled } from "./TestHelpers";

@component
export class HomeMarkerScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Enter set-home mode, then confirm (confirm only acts if Set home was pressed first).
    await triggerButton(interactor, "Button Set home");
    await triggerButton(interactor, "Button Set as Home");

    await waitForEnabled("Home marker", true);
    expect(objectEnabled("Home marker"), "Home marker should be enabled after Set as Home").toBe(true);
  }
}
