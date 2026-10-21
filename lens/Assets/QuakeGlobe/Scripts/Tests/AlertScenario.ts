// Done criterion 3 - Alert.
// Reset state; trigger "Button Phone alert received" and assert the alert card appears within one
// second (the "during" page), the epicentre ring is marked on the globe with a distance label, and
// the glanceable distance line reads like a real distance ("from home" ... "km"). The video-review
// changes (2026-10-21) are asserted too: the main panel and all its buttons hide while the alert is
// open (both stages) and come back after "I'm safe", and the alert card takes the panel's place -
// centred below the globe at about 1 m from the viewer. Then advance ("Shaking stopped") and close
// ("I'm safe") so the card hides and later scenarios start clean.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import {
  interactableReady,
  objectEnabled,
  resetState,
  textOnObject,
  textUnderParent,
  triggerButton,
  waitForEnabled,
  waitUntil,
} from "./TestHelpers";

/** Every button on the main panel; none may be reachable while the alert is open. */
const PANEL_BUTTONS = ["Button 24 h", "Button 7 days", "Button 30 days", "Button Strongest", "Button Spin"];

@component
export class AlertScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Fire the simulated phone alert; the card must show within one second (done criterion 3).
    await triggerButton(interactor, "Button Phone alert received");
    const shownInTime = await waitForEnabled("Alert Card", true, 1000);
    expect(shownInTime, "Alert Card should be enabled within 1 s of the alert").toBe(true);

    expect(objectEnabled("Alert During"), "Alert should open on the 'during' stage").toBe(true);
    expect(
      objectEnabled("Alert epicentre ring"),
      "Alert epicentre ring should be enabled during an alert",
    ).toBe(true);

    // The dashboard steps aside: the main panel and all its buttons hide while the alert is open,
    // so the only reachable button while shaking is "Shaking stopped".
    expect(objectEnabled("Panel"), "The main panel should hide during the alert").toBe(false);
    for (const name of PANEL_BUTTONS) {
      expect(interactableReady(name), `"${name}" should NOT be reachable during the alert`).toBe(false);
    }

    // The alert card takes the panel's place: centred below the globe, about 1 m from the viewer.
    const globe = findSceneObjectByName("Globe");
    const card = findSceneObjectByName("Alert Card");
    expect(!isNull(globe) && !isNull(card), "Globe and Alert Card should exist").toBe(true);
    const globePos = globe!.getTransform().getWorldPosition();
    const cardPos = card!.getTransform().getWorldPosition();
    expect(
      cardPos.y < globePos.y - 10,
      `Alert Card top should be below the globe (card y ${cardPos.y.toFixed(1)}, globe y ${globePos.y.toFixed(1)})`,
    ).toBe(true);
    const lateral = Math.hypot(cardPos.x - globePos.x, cardPos.z - globePos.z);
    expect(lateral < 3, `Alert Card should be centred under the globe (lateral offset ${lateral.toFixed(1)} cm)`).toBe(true);
    const camPos = WorldCameraFinderProvider.getInstance().getTransform().getWorldPosition();
    const viewerDistance = camPos.distance(cardPos);
    expect(
      viewerDistance > 70 && viewerDistance < 140,
      `Alert Card should be about 1 m from the viewer (got ${viewerDistance.toFixed(0)} cm)`,
    ).toBe(true);

    // The epicentre ring is labelled with its distance from home, e.g. "15 km from home".
    expect(objectEnabled("Epicentre distance"), "Epicentre distance label should show during the alert").toBe(true);
    const label = textOnObject("Epicentre distance");
    expect(label !== undefined, "Epicentre distance label text should exist").toBe(true);
    expect(
      label !== undefined && label.includes("km") && label.includes("from home"),
      `Epicentre label should read like "15 km from home" - got "${label}"`,
    ).toBe(true);

    const distance = textUnderParent("Distance", "Alert During");
    expect(distance !== undefined, "Distance text should exist on the alert card").toBe(true);
    expect(
      distance.includes("from home"),
      `Distance should contain "from home" - got "${distance}"`,
    ).toBe(true);
    expect(distance.includes("km"), `Distance should contain "km" - got "${distance}"`).toBe(true);

    // Advance to "after": the panel stays hidden on this stage too.
    await triggerButton(interactor, "Button Shaking stopped");
    await waitForEnabled("Alert After", true);
    expect(objectEnabled("Panel"), "The main panel should stay hidden on the 'after' stage").toBe(false);
    for (const name of PANEL_BUTTONS) {
      expect(interactableReady(name), `"${name}" should NOT be reachable on the 'after' stage`).toBe(false);
    }

    // Dismiss the alert ("I'm safe" lives on the "after" page): the panel and its buttons return.
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
    expect(objectEnabled("Alert Card"), "Alert Card should be disabled after I'm safe").toBe(false);
    const panelBack = await waitUntil(() => objectEnabled("Panel"), 3000);
    expect(panelBack, "The main panel should come back after I'm safe").toBe(true);
    for (const name of PANEL_BUTTONS) {
      expect(interactableReady(name), `"${name}" should be reachable again after I'm safe`).toBe(true);
    }
  }
}
