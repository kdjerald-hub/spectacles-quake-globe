// Done criterion 3 - Alert.
// Reset state; trigger "Button Phone alert received" and assert the alert card appears within one
// second (the "during" page), the epicentre ring is marked on the globe with a distance label, and
// the glanceable distance line reads like a real distance ("from home" ... "km"). The video-review
// changes (2026-10-21) are asserted too: the main panel and all its buttons hide while the alert is
// open (both stages) and come back after "I'm safe", and the alert card takes the panel's place -
// centred below the globe at about 1 m from the viewer. No visible map label may overlap the
// epicentre distance label (second-cut check) or the epicentre ring (committee's second review,
// both 2026-10-21). Then advance ("Shaking stopped") and close ("I'm safe") so the card hides and
// later scenarios start clean.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findSceneObjectByName, findSceneObjectsByName } from "Leaf.lspkg/Utils/common/Utils";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { GEOMETRY, SETTINGS } from "../../Core/config";
import { estimateTextWidthEm } from "../../Core/labels";
import { buildEpicenterRing } from "../../Core/markers";
import type { TriangleMesh } from "../../Core/markers";
import { SIMULATED_QUAKE } from "../Emergency";
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

/** A rectangle in screen fractions, from the engine's own projection (worldSpaceToScreenSpace). */
interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Lens Text em height in cm per unit of Text.size (matches LensUi/MapLabels: em = size / 43.886). */
const EM_CM_PER_SIZE = 1 / 43.886;

/**
 * The screen box a world-space Text's glyphs cover, built from the same text-width estimate the
 * label layout uses (Core/labels.estimateTextWidthEm), the Text's own size and pose, and the
 * engine's projection. All-caps lines (oceans, continents) carry the layout's letter spacing.
 */
function textScreenBox(camera: Camera, obj: SceneObject, t: Text): ScreenBox {
  const emCm = t.size * EM_CM_PER_SIZE;
  const lines = t.text.split("\n");
  const spacing = (l: string): number => (l === l.toUpperCase() && /[A-Z]/.test(l) ? 0.12 : 0);
  const halfWCm = (Math.max(...lines.map((l) => estimateTextWidthEm(l, spacing(l)))) * emCm) / 2;
  const halfHCm = (lines.length * 1.2 * emCm) / 2;
  const tr = obj.getTransform();
  const pos = tr.getWorldPosition();
  const rot = tr.getWorldRotation();
  const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [sx, sy] of corners) {
    const s = camera.worldSpaceToScreenSpace(pos.add(rot.multiplyVec3(new vec3(sx * halfWCm, sy * halfHCm, 0))));
    x0 = Math.min(x0, s.x);
    x1 = Math.max(x1, s.x);
    y0 = Math.min(y0, s.y);
    y1 = Math.max(y1, s.y);
  }
  return { x0, y0, x1, y1 };
}

function boxesIntersect(a: ScreenBox, b: ScreenBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** The alert ring's own mesh (built once: it depends only on constants and the collider radius). */
let ringMeshCache: TriangleMesh | null = null;

/**
 * The screen box of the alert's epicentre ring: the same small-circle mesh the overlay draws
 * (Core/markers.buildEpicenterRing), taken through the live "Globe Content" transform and the
 * engine's projection. The visual's runtime AABB is NOT usable here: Lens Studio clamps a built
 * mesh's aabbMin/aabbMax to include the origin (measured on this ring: min (0.00, 0.00, -6.83),
 * max (10.11, 5.98, 0.00) for a true x span of ~8.3..10.1), which inflates the box across a
 * quarter of the view. The globe radius is read from the handle's own collider sphere, so an
 * authored radius change cannot silently skew this. Null while the ring visual is hidden.
 */
function ringScreenBox(camera: Camera): ScreenBox | null {
  const ringObj = findSceneObjectByName("Alert epicentre ring");
  if (isNull(ringObj) || !ringObj!.isEnabledInHierarchy) return null;
  const visual = ringObj!.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  if (isNull(visual) || !visual.enabled || isNull(visual.mesh)) return null;
  const globe = findSceneObjectByName("Globe");
  const content = findSceneObjectByName("Globe Content");
  if (isNull(globe) || isNull(content)) return null;
  if (ringMeshCache === null) {
    const collider = globe!.getComponent("Physics.ColliderComponent") as ColliderComponent;
    const R = isNull(collider) ? 12 : (collider.shape as SphereShape).radius;
    const opt = { globeRadius: R, depthExaggeration: SETTINGS.depthExaggeration, baseSize: R * GEOMETRY.markerBaseFraction };
    ringMeshCache = buildEpicenterRing(SIMULATED_QUAKE, opt);
  }
  const w = content!.getTransform().getWorldTransform();
  const p = ringMeshCache.positions;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const s = camera.worldSpaceToScreenSpace(w.multiplyPoint(new vec3(p[i], p[i + 1], p[i + 2])));
    x0 = Math.min(x0, s.x);
    x1 = Math.max(x1, s.x);
    y0 = Math.min(y0, s.y);
    y1 = Math.max(y1, s.y);
  }
  return { x0, y0, x1, y1 };
}

/**
 * Texts of the visible map labels whose glyph box intersects the epicentre ring's on-screen box
 * (committee's second review 2026-10-21: the pinned "Taiwan" sat under the ring and read as
 * "Ta...an"). Visibility rules match mapLabelsOverlappingEpicentreLabel. Empty when the ring
 * visual is hidden.
 */
function mapLabelsOverlappingEpicentreRing(camera: Camera): string[] {
  const target = ringScreenBox(camera);
  if (target === null) return [];
  const out: string[] = [];
  for (const o of findSceneObjectsByName("Map Label")) {
    if (isNull(o) || !o.isEnabledInHierarchy) continue;
    const t = o.getComponent("Component.Text") as Text;
    if (isNull(t) || t.text.length === 0) continue;
    const c = t.textFill.color;
    if (Math.max(c.x, c.y, c.z) < 0.05) continue;
    if (boxesIntersect(textScreenBox(camera, o, t), target)) out.push(t.text.replace(/\n/g, " "));
  }
  return out;
}

/**
 * Texts of the visible map labels whose glyph box intersects the epicentre distance label's box
 * on screen. "Visible" means enabled with non-empty text and not faded out: MapLabels writes its
 * eased brightness into textFill.color, so a nearly-black label is invisible on the additive
 * display. Empty when the epicentre label itself is hidden.
 */
function mapLabelsOverlappingEpicentreLabel(camera: Camera): string[] {
  const labelObj = findSceneObjectByName("Epicentre distance");
  if (isNull(labelObj) || !labelObj!.enabled) return [];
  const labelText = labelObj!.getComponent("Component.Text") as Text;
  if (isNull(labelText)) return [];
  const target = textScreenBox(camera, labelObj!, labelText);
  const out: string[] = [];
  for (const o of findSceneObjectsByName("Map Label")) {
    if (isNull(o) || !o.isEnabledInHierarchy) continue;
    const t = o.getComponent("Component.Text") as Text;
    if (isNull(t) || t.text.length === 0) continue;
    const c = t.textFill.color;
    if (Math.max(c.x, c.y, c.z) < 0.05) continue;
    if (boxesIntersect(textScreenBox(camera, o, t), target)) out.push(t.text.replace(/\n/g, " "));
  }
  return out;
}

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

    // No visible map label may overlap the epicentre label (second-cut check 2026-10-21). The
    // label layout recomputes a few times a second and a displaced name fades out rather than
    // vanishing, so poll until the view settles before requiring a clear label.
    const camera = WorldCameraFinderProvider.getInstance().getComponent();
    const labelClear = await waitUntil(() => mapLabelsOverlappingEpicentreLabel(camera).length === 0, 5000);
    const overlapping = mapLabelsOverlappingEpicentreLabel(camera);
    expect(
      labelClear && overlapping.length === 0,
      `No visible map label should overlap the epicentre label (overlapping: ${overlapping.length > 0 ? overlapping.join(", ") : "none"})`,
    ).toBe(true);

    // No visible map label may sit under the epicentre ring either (committee's second review
    // 2026-10-21: the pinned home-country name read as "Ta...an" through the ring). Same polling:
    // the layout recomputes a few times a second and a displaced name fades out rather than popping.
    // The diagnostic print mirrors the cover_spot scenario's: the measured geometry on record.
    const ringBox = ringScreenBox(camera);
    print(`alert ring screen box ${JSON.stringify(ringBox)}`);
    const ringClear = await waitUntil(() => mapLabelsOverlappingEpicentreRing(camera).length === 0, 5000);
    const overRing = mapLabelsOverlappingEpicentreRing(camera);
    expect(
      ringClear && overRing.length === 0,
      `No visible map label should overlap the epicentre ring (overlapping: ${overRing.length > 0 ? overRing.join(", ") : "none"})`,
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
