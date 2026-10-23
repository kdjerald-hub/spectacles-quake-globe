// Done criterion 4 - Cover spot. (Registered as scenario id "cover_spot"; the class keeps its old
// name so the script asset's identity is unchanged.)
//
// Reset state; set the cover spot (seeded out of the forward view); while cover mode is up, check
// that the placement hint keeps clear of the globe and the dashboard (final-cut review 2026-10-23,
// see the block below for what is measured); fire the alert; then assert the
// shaking-stage behaviour: the headline reads "Drop, Cover, Hold On", the off-view arrow shows and
// — measured through the engine's own screen projection — points toward the cover spot from an
// off-centre position on the spot's side of the view, staying fully inside the view; and the ONLY
// reachable alert button is "Shaking stopped" (Send and "I'm safe" live on the "after" page and
// must not be reachable while the ground shakes). Advance and close to leave a clean state.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findSceneObjectByName, findSceneObjectsByName } from "Leaf.lspkg/Utils/common/Utils";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { estimateTextWidthEm } from "../../Core/labels";
import { HINT_AHEAD_CM, HINT_HALF_H_CM, HINT_HALF_W_CM, HINT_VIEW_HALF_CM, coverHintPlanFor } from "../EmergencyOverlay";
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

    // The cover-spot hint keeps clear of the globe and the dashboard (final-cut review
    // 2026-10-23). What this measures, while cover mode is up and before anything else happens:
    //   1. The hint as actually posed this frame: its wrapped-text box is sampled as a 5 x 3 grid
    //      of points, and no eye-ray through a sample may fall inside the globe's silhouette cone
    //      (within asin(R / d) of the eye-to-centre direction) nor hit the dashboard's backplate
    //      rectangle (ray-plane intersection inside the plate, measured from the plate's own
    //      RoundedRectangle, not from the Lens's accessor). This is the frame the old hint failed:
    //      fixed at +9 cm it was drawn over the globe while the view rested on it.
    //   2. The decision the overlay runs every frame (coverHintPlanFor, a pure function), swept
    //      through camera pitches from the globe down toward the floor (-10 to -60 deg at the
    //      preview's own yaw): each steady-state spot must stay inside the view
    //      (|offset| <= HINT_VIEW_HALF_CM in the plane at HINT_AHEAD_CM) and its planned box must
    //      pass the same two ray tests - a plan that parks the hint over the globe's silhouette or
    //      the dashboard's text at any pitch of the sweep fails here (the old fixed raise fails at
    //      the first and second pitches).
    await wait(300); // the hint is planned and eased in LateUpdate; let it settle
    expect(objectEnabled("Overlay hint"), "The placement hint should be up in cover mode").toBe(true);

    const camT = WorldCameraFinderProvider.getInstance().getTransform();
    const eye = camT.getWorldPosition();
    const globeObj = findSceneObjectByName("Globe");
    expect(!isNull(globeObj), "Globe should exist").toBe(true);
    const gCollider = globeObj!.getComponent("Physics.ColliderComponent") as ColliderComponent;
    const gR = (isNull(gCollider) ? 12 : (gCollider.shape as SphereShape).radius) * globeObj!.getTransform().getWorldScale().y;
    const gC = globeObj!.getTransform().getWorldPosition();
    let plate: { pos: vec3; rot: quat; halfW: number; top: number; bottom: number } | null = null;
    for (const o of findSceneObjectsByName("Backplate")) {
      if (isNull(o)) continue;
      const parent = o.getParent();
      if (isNull(parent) || parent.name !== "Panel") continue;
      const rr = o.getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle;
      if (isNull(rr)) continue;
      const t = o.getTransform();
      plate = { pos: t.getWorldPosition(), rot: t.getWorldRotation(), halfW: rr.size.x / 2, top: rr.size.y / 2, bottom: -rr.size.y / 2 };
    }
    expect(plate !== null, "The Panel's backplate should exist (the dashboard is up in cover mode)").toBe(true);

    const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));
    const overlapsGlobe = (p: vec3): boolean => {
      const toC = gC.sub(eye);
      const ang = Math.acos(clamp1(p.sub(eye).normalize().dot(toC.normalize())));
      return ang < Math.asin(Math.min(0.999, gR / Math.max(gR + 1, toC.length)));
    };
    const hitsPlate = (p: vec3): boolean => {
      const n = plate!.rot.multiplyVec3(new vec3(0, 0, 1));
      const dir = p.sub(eye);
      const denom = dir.dot(n);
      if (Math.abs(denom) < 1e-6) return false;
      const t = plate!.pos.sub(eye).dot(n) / denom;
      if (t <= 0) return false;
      const local = plate!.rot.invert().multiplyVec3(eye.add(dir.uniformScale(t)).sub(plate!.pos));
      return Math.abs(local.x) <= plate!.halfW && local.y >= plate!.bottom && local.y <= plate!.top;
    };
    /** First obstacle a sample of the box (centre, right/up half-extents) overlaps, else null. */
    const boxOverlap = (centre: vec3, rightAxis: vec3, upAxis: vec3, halfW: number, halfH: number): string | null => {
      for (let i = -2; i <= 2; i++) {
        for (let j = -1; j <= 1; j++) {
          const p = centre.add(rightAxis.uniformScale((i / 2) * halfW)).add(upAxis.uniformScale(j * halfH));
          if (overlapsGlobe(p)) return "the globe's silhouette";
          if (hitsPlate(p)) return "the dashboard's plate";
        }
      }
      return null;
    };

    // 1. The hint as actually posed, its glyph box from the Text's own size and wrap width.
    const hintObj = findSceneObjectByName("Overlay hint");
    expect(!isNull(hintObj), "Overlay hint should exist").toBe(true);
    const hintText = hintObj!.getComponent("Component.Text") as Text;
    expect(!isNull(hintText) && hintText.text.length > 0, "The hint should carry text").toBe(true);
    const em = hintText.size / 43.886;
    const estW = estimateTextWidthEm(hintText.text) * em;
    const wrapCm = 34; // the hint's layout box width (EmergencyOverlay.build)
    const hintLines = Math.max(1, Math.ceil(estW / wrapCm));
    const hintT = hintObj!.getTransform();
    const posedAt = boxOverlap(
      hintT.getWorldPosition(),
      hintT.getWorldRotation().multiplyVec3(new vec3(1, 0, 0)),
      hintT.getWorldRotation().multiplyVec3(new vec3(0, 1, 0)),
      Math.min(estW, wrapCm) / 2,
      (hintLines * 1.2 * em) / 2,
    );
    print(`cover_spot hint: posed text ${hintLines} line(s), ${posedAt === null ? "clear of the globe and the dashboard" : "over " + posedAt}`);
    expect(posedAt === null, `The posed hint should overlap neither the globe nor the dashboard (got ${posedAt})`).toBe(true);

    // 2. The planner swept from the globe down toward the floor at the preview's own yaw.
    const fwd = camT.forward.uniformScale(-1);
    let flat = new vec3(fwd.x, 0, fwd.z);
    flat = flat.length < 1e-4 ? new vec3(0, 0, -1) : flat.normalize();
    for (const pitchDeg of [-10, -20, -30, -45, -60]) {
      const p = (pitchDeg * Math.PI) / 180;
      const look = flat.uniformScale(Math.cos(p)).add(new vec3(0, Math.sin(p), 0));
      const back = look.uniformScale(-1);
      const rightAxis = new vec3(0, 1, 0).cross(back).normalize();
      const upAxis = back.cross(rightAxis).normalize();
      const plan = coverHintPlanFor(eye, rightAxis, upAxis, look, gC, gR, {
        pos: plate!.pos,
        rot: plate!.rot,
        halfWidthCm: plate!.halfW,
        topCm: plate!.top,
        bottomCm: plate!.bottom,
      });
      const centre = eye.add(look.uniformScale(HINT_AHEAD_CM)).add(upAxis.uniformScale(plan.targetY));
      const sweptAt = boxOverlap(centre, rightAxis, upAxis, HINT_HALF_W_CM, HINT_HALF_H_CM);
      print(`cover_spot hint sweep: pitch ${pitchDeg} deg -> offset ${plan.targetY.toFixed(1)} cm, ${sweptAt === null ? "clear" : "over " + sweptAt}`);
      expect(
        Math.abs(plan.targetY) <= HINT_VIEW_HALF_CM,
        `The hint should stay in view at pitch ${pitchDeg} deg (offset ${plan.targetY.toFixed(1)} cm)`,
      ).toBe(true);
      expect(
        sweptAt === null,
        `The hint at pitch ${pitchDeg} deg should overlap neither the globe nor the dashboard (got ${sweptAt})`,
      ).toBe(true);
    }

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

    // The arrow reads as a dart, not a near-equilateral triangle (second-cut check 2026-10-21):
    // its mesh runs longer along the tip axis (local X) than it is wide (local Y).
    expect(arrowObj!.getChildrenCount() > 0, "Cover spot arrow should carry a mesh child").toBe(true);
    const arrowVisual = arrowObj!.getChild(0).getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    expect(!isNull(arrowVisual) && !isNull(arrowVisual.mesh), "Arrow mesh should exist under Cover spot arrow").toBe(true);
    const arrowLength = arrowVisual.mesh.aabbMax.x - arrowVisual.mesh.aabbMin.x;
    const arrowWidth = arrowVisual.mesh.aabbMax.y - arrowVisual.mesh.aabbMin.y;
    expect(
      arrowLength > arrowWidth,
      `Arrow mesh should be longer than it is wide (length ${arrowLength.toFixed(2)} cm, width ${arrowWidth.toFixed(2)} cm)`,
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
