// Done criterion 4 - Cover spot. (Registered as scenario id "cover_spot"; the class keeps its old
// name so the script asset's identity is unchanged.)
//
// Reset state; set the cover spot (seeded out of the forward view); fire the alert; then assert the
// shaking-stage behaviour: the headline reads "Drop, Cover, Hold On", the off-view arrow shows and
// — measured through the engine's own screen projection — points toward the cover spot from an
// off-centre position on the spot's side of the view, staying fully inside the view; and the ONLY
// reachable alert button is "Shaking stopped" (Send and "I'm safe" live on the "after" page and
// must not be reachable while the ground shakes). Advance and close to leave a clean state.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { interactableReady, objectEnabled, resetState, textUnderParent, triggerButton, wait, waitForEnabled } from "./TestHelpers";

const DEG = 180 / Math.PI;

/** Absolute difference between two angles in degrees, folded to [0, 180]. */
function angleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

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

    // The arrow is an off-screen indicator (brief: "a chime and a small arrow point to it"). Check
    // what the viewer actually sees through the engine's own projection (worldSpaceToScreenSpace;
    // (0,0) is the top-left of the view, (1,1) the bottom-right, so screen y is flipped to make up
    // positive). This deliberately avoids re-using the overlay's camera-axis math: a handedness bug
    // there would cancel out of any check built on the same formulas.
    await wait(150); // let the per-frame arrow pose settle after the enable
    const camera = WorldCameraFinderProvider.getInstance().getComponent();
    const spotObj = findSceneObjectByName("Cover spot");
    const arrowObj = findSceneObjectByName("Cover spot arrow");
    expect(!isNull(spotObj) && !isNull(arrowObj), "Cover spot and Cover spot arrow should exist").toBe(true);

    const arrowT = arrowObj!.getTransform();
    const arrowPos = arrowT.getWorldPosition();
    const sArrow = camera.worldSpaceToScreenSpace(arrowPos);
    const sSpot = camera.worldSpaceToScreenSpace(spotObj!.getTransform().getWorldPosition());
    // The arrow mesh's tip lies along local +X; project a world point a few cm out along it.
    const tipWorld = arrowPos.add(arrowT.getWorldRotation().multiplyVec3(new vec3(1, 0, 0)).uniformScale(3));
    const sTip = camera.worldSpaceToScreenSpace(tipWorld);

    const aimDeg = Math.atan2(-(sTip.y - sArrow.y), sTip.x - sArrow.x) * DEG;
    const spotDeg = Math.atan2(-(sSpot.y - 0.5), sSpot.x - 0.5) * DEG;
    const offX = sArrow.x - 0.5;
    const offY = -(sArrow.y - 0.5);
    const offDeg = Math.atan2(offY, offX) * DEG;
    const offLen = Math.hypot(offX, offY);
    print(
      `cover_spot arrow: screen pos (${sArrow.x.toFixed(3)}, ${sArrow.y.toFixed(3)}), aim ${aimDeg.toFixed(1)} deg, ` +
        `spot at ${spotDeg.toFixed(1)} deg (screen (${sSpot.x.toFixed(2)}, ${sSpot.y.toFixed(2)})), ` +
        `offset ${offLen.toFixed(3)} at ${offDeg.toFixed(1)} deg, fov ${(camera.fov * DEG).toFixed(1)} aspect ${camera.aspect.toFixed(2)}`,
    );

    expect(
      angleDiffDeg(aimDeg, spotDeg) <= 30,
      `Arrow should point toward the cover spot on screen (arrow ${aimDeg.toFixed(1)} deg, spot ${spotDeg.toFixed(1)} deg)`,
    ).toBe(true);
    expect(offLen >= 0.15, `Arrow should sit off-centre toward the view edge (offset ${offLen.toFixed(3)})`).toBe(true);
    expect(
      angleDiffDeg(offDeg, spotDeg) <= 45,
      `Arrow should sit on the cover spot's side of the view (offset at ${offDeg.toFixed(1)} deg, spot at ${spotDeg.toFixed(1)} deg)`,
    ).toBe(true);
    const inView =
      sArrow.x > 0.04 && sArrow.x < 0.96 && sArrow.y > 0.04 && sArrow.y < 0.96 &&
      sTip.x > 0.01 && sTip.x < 0.99 && sTip.y > 0.01 && sTip.y < 0.99;
    expect(
      inView,
      `Arrow (and its tip) should stay fully inside the view (arrow (${sArrow.x.toFixed(3)}, ${sArrow.y.toFixed(3)}), tip (${sTip.x.toFixed(3)}, ${sTip.y.toFixed(3)}))`,
    ).toBe(true);

    const headline = textUnderParent("Headline", "Alert During");
    expect(headline !== undefined, "Headline text should exist on the alert card").toBe(true);
    // The headline is shown very large and wraps to a few short lines on the narrow card, so compare
    // with newlines flattened back to spaces.
    const headlineFlat = (headline !== undefined ? headline : "").replace(/\n/g, " ");
    expect(headlineFlat, `Headline during shaking (got "${headline}")`).toBe("Drop, Cover, Hold On");

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
