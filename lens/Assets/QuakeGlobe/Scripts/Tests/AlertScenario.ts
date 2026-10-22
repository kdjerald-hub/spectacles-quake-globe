// Done criterion 3 - Alert (learner's review 2026-10-22: the alert zooms into a map of my area).
// Reset state; trigger "Button Phone alert received" and assert the alert card appears within one
// second (the "during" page). Within 3 s of the pinch the globe must zoom into the map of my area:
// the map is shown and the globe hidden, home sits at the map's centre, the epicentre lies at its
// true direction from home on screen (south for the demo home) within 20 degrees, its distance
// from home on the map matches the real distance at the map's scale within 5 %, the map's land
// mesh exists and is not empty (the land tint; the sea stays clear by not being drawn), the three
// ring labels and the distance label ("15 km S") exist, and no two map labels overlap. The dashboard
// checks stay: the main panel and its buttons hide while the alert is open (both stages) and come
// back after "I'm safe", and the alert card keeps the panel's place - centred below the globe (and
// so below the map, which takes the globe's place) at about 1 m. After "I'm safe" the map must
// hide and the globe return within 3 s.
//
// Expected map values are computed from the Lens's own home point (read back from the on-globe
// "Home marker", which phoneAlert always positions), so the scenario also passes when an earlier
// home_marker run has moved home: with the default home (Hualien City) the expectations are
// literally "10 km", "25 km", "50 km" and "15 km S", per the design brief.
//
// Removed from the pre-map version (the globe is hidden during the alert, so they no longer
// apply): the on-globe epicentre distance label ("15 km from home") and its text, and the checks
// that no globe map label overlaps that label or the epicentre ring.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findSceneObjectByName, findSceneObjectsByName } from "Leaf.lspkg/Utils/common/Utils";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { estimateTextWidthEm } from "../../Core/labels";
import { mapRadiusKm, projectLocal, ringLabel, ringsKm } from "../../Core/localmap";
import { compass8 } from "../../Core/geolookup";
import { SIMULATED_QUAKE, formatDistanceKm, greatCircleKm } from "../Emergency";
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

const DEG = 180 / Math.PI;

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
 * label layouts use (Core/labels.estimateTextWidthEm), the Text's own size and pose, and the
 * engine's projection. All-caps lines carry the globe layout's letter spacing.
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

/** Absolute difference between two angles in degrees, folded to [0, 180]. */
function angleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * The Lens's current home point, read back from the on-globe "Home marker": phoneAlert always
 * positions it at geoToCartesian(home) in the globe content's frame, so inverting that gives the
 * same home the map was built from, whether or not an earlier scenario confirmed a new one.
 */
function homeLatLonFromMarker(): { lat: number; lon: number } | null {
  const hm = findSceneObjectByName("Home marker");
  if (isNull(hm)) return null;
  const p = hm!.getTransform().getLocalPosition();
  const len = p.length;
  if (len < 1e-3) return null;
  return { lat: Math.asin(p.y / len) * DEG, lon: Math.atan2(p.x, p.z) * DEG };
}

/** Texts of all enabled, non-empty labels on the local map, with their screen boxes. */
function mapLabelBoxes(camera: Camera): { text: string; box: ScreenBox }[] {
  const names = ["Map ring label", "Map north label", "Map home label", "Map distance label", "Map place label"];
  const out: { text: string; box: ScreenBox }[] = [];
  for (const name of names) {
    for (const o of findSceneObjectsByName(name)) {
      if (isNull(o) || !o.isEnabledInHierarchy) continue;
      const t = o.getComponent("Component.Text") as Text;
      if (isNull(t) || t.text.length === 0) continue;
      out.push({ text: t.text.replace(/\n/g, " "), box: textScreenBox(camera, o, t) });
    }
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
      "Alert epicentre ring should be enabled while the globe turns to the epicentre",
    ).toBe(true);

    // The dashboard steps aside: the main panel and all its buttons hide while the alert is open,
    // so the only reachable button while shaking is "Shaking stopped".
    expect(objectEnabled("Panel"), "The main panel should hide during the alert").toBe(false);
    for (const name of PANEL_BUTTONS) {
      expect(interactableReady(name), `"${name}" should NOT be reachable during the alert`).toBe(false);
    }

    // The alert card keeps the panel's place: centred below the globe (and so below the map, which
    // takes the globe's place), about 1 m from the viewer.
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

    // Within 3 s of the pinch the globe zooms into the map of my area: the map is shown and the
    // globe (its spinning content with every quake) is hidden.
    const zoomed = await waitUntil(() => objectEnabled("Local Map") && !objectEnabled("Globe Content"), 3000);
    expect(zoomed, "The local map should be shown and the globe hidden within 3 s of the alert").toBe(true);

    // The land tint (checking-the-map note 2026-10-22): the map's land mesh exists and is not
    // empty while the map is up. An empty land would never get a mesh (triangleRenderMesh returns
    // null and createMeshObject then disables the visual), so an enabled visual with a mesh IS a
    // non-empty land.
    const land = findSceneObjectByName("Map land 0");
    expect(
      !isNull(land) && land!.isEnabledInHierarchy,
      "The map's land object should exist and be enabled while the map is up",
    ).toBe(true);
    const landVisual = isNull(land) ? null : (land!.getComponent("Component.RenderMeshVisual") as RenderMeshVisual);
    expect(
      landVisual !== null && !isNull(landVisual) && landVisual.enabled && !isNull(landVisual.mesh),
      "The map's land mesh should exist and be non-empty",
    ).toBe(true);

    const mapHome = findSceneObjectByName("Map home marker");
    const mapEpi = findSceneObjectByName("Map epicentre marker");
    expect(!isNull(mapHome) && !isNull(mapEpi), "Map home and epicentre markers should exist").toBe(true);

    // Home sits at the map's centre (the map keeps the globe's place): wait for the
    // grow-from-the-epicentre transition to settle, then measure.
    const centred = await waitUntil(
      () => mapHome!.getTransform().getWorldPosition().distance(globe!.getTransform().getWorldPosition()) < 2,
      3000,
    );
    const homeOffset = mapHome!.getTransform().getWorldPosition().distance(globe!.getTransform().getWorldPosition());
    expect(centred, `Home should sit at the map's centre (offset ${homeOffset.toFixed(2)} cm)`).toBe(true);

    // Expected map values from the Lens's own home point (default: Hualien City, 15 km N of the
    // 2024 epicentre, so the demo expectations are 10/25/50 km rings and "15 km S").
    const home = homeLatLonFromMarker();
    expect(home !== null, "Home lat/lon should be readable from the on-globe home marker").toBe(true);
    const km = greatCircleKm(home!.lat, home!.lon, SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon);
    const radiusKm = mapRadiusKm(km);
    const e = projectLocal(home!.lat, home!.lon, SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon);

    // On screen, the epicentre lies at its true direction from home (south = below for the demo)
    // within 20 degrees. Measured through the engine's own projection, like the cover_spot arrow.
    const camera = WorldCameraFinderProvider.getInstance().getComponent();
    const sHome = camera.worldSpaceToScreenSpace(mapHome!.getTransform().getWorldPosition());
    const sEpi = camera.worldSpaceToScreenSpace(mapEpi!.getTransform().getWorldPosition());
    const screenDeg = Math.atan2(-(sEpi.y - sHome.y), sEpi.x - sHome.x) * DEG;
    const expectedDeg = Math.atan2(e.y, e.x) * DEG; // map frame: +x east (right), +y north (up)
    print(
      `alert map: epicentre on screen at ${screenDeg.toFixed(1)} deg, true bearing ${expectedDeg.toFixed(1)} deg, ` +
        `${km.toFixed(1)} km ${compass8(home!.lat, home!.lon, SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon)} of home, map radius ${radiusKm} km`,
    );
    expect(
      angleDiffDeg(screenDeg, expectedDeg) <= 20,
      `Epicentre should lie at its true direction from home on screen (got ${screenDeg.toFixed(1)} deg, want ${expectedDeg.toFixed(1)} deg)`,
    ).toBe(true);

    // The epicentre's distance from home on the map matches the real distance at the map's scale
    // within 5 %. The scale is the globe's radius (from its own collider sphere, times the handle's
    // current scale) standing for the map's radius in km.
    const collider = globe!.getComponent("Physics.ColliderComponent") as ColliderComponent;
    const R = isNull(collider) ? 12 : (collider.shape as SphereShape).radius;
    const handleScale = globe!.getTransform().getWorldScale().y;
    const expectedCm = km * ((R * handleScale) / radiusKm);
    const measuredCm = mapEpi!.getTransform().getWorldPosition().distance(mapHome!.getTransform().getWorldPosition());
    expect(
      Math.abs(measuredCm - expectedCm) <= expectedCm * 0.05,
      `Epicentre should sit ${expectedCm.toFixed(2)} cm from home on the map (got ${measuredCm.toFixed(2)} cm)`,
    ).toBe(true);

    // The three ring labels and the distance label exist ("10 km", "25 km", "50 km", "15 km S"
    // for the demo home).
    const expectedRings = ringsKm(radiusKm).map(ringLabel).sort();
    const ringTexts: string[] = [];
    for (const o of findSceneObjectsByName("Map ring label")) {
      if (isNull(o)) continue;
      const t = o.getComponent("Component.Text") as Text;
      if (!isNull(t) && t.text.length > 0) ringTexts.push(t.text);
    }
    ringTexts.sort();
    expect(
      ringTexts.join("|") === expectedRings.join("|"),
      `Ring labels should read ${expectedRings.join(", ")} - got ${ringTexts.join(", ") || "none"}`,
    ).toBe(true);
    const expectedDistance = formatDistanceKm(km) + " " + compass8(home!.lat, home!.lon, SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon);
    const distLabel = textOnObject("Map distance label");
    expect(
      distLabel === expectedDistance,
      `The map distance label should read "${expectedDistance}" - got "${distLabel}"`,
    ).toBe(true);

    // No two map labels overlap on screen (rings, N, home, distance, place names).
    const labels = mapLabelBoxes(camera);
    const overlaps: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        if (boxesIntersect(labels[i].box, labels[j].box)) overlaps.push(`"${labels[i].text}" x "${labels[j].text}"`);
      }
    }
    expect(
      overlaps.length === 0,
      `No two map labels should overlap (overlapping: ${overlaps.length > 0 ? overlaps.join("; ") : "none"})`,
    ).toBe(true);

    const distance = textUnderParent("Distance", "Alert During");
    expect(distance !== undefined, "Distance text should exist on the alert card").toBe(true);
    expect(
      distance.includes("from home"),
      `Distance should contain "from home" - got "${distance}"`,
    ).toBe(true);
    expect(distance.includes("km"), `Distance should contain "km" - got "${distance}"`).toBe(true);

    // Advance to "after": the panel stays hidden and the map stays up on this stage too.
    await triggerButton(interactor, "Button Shaking stopped");
    await waitForEnabled("Alert After", true);
    expect(objectEnabled("Panel"), "The main panel should stay hidden on the 'after' stage").toBe(false);
    for (const name of PANEL_BUTTONS) {
      expect(interactableReady(name), `"${name}" should NOT be reachable on the 'after' stage`).toBe(false);
    }
    expect(objectEnabled("Local Map"), "The map should stay up through the 'after' stage").toBe(true);
    expect(objectEnabled("Globe Content"), "The globe should stay hidden through the 'after' stage").toBe(false);

    // Dismiss the alert ("I'm safe" lives on the "after" page): the zoom reverses - the map hides
    // and the globe returns within 3 s - and the panel and its buttons come back.
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
    expect(objectEnabled("Alert Card"), "Alert Card should be disabled after I'm safe").toBe(false);
    const globeBack = await waitUntil(() => !objectEnabled("Local Map") && objectEnabled("Globe Content"), 3000);
    expect(globeBack, "The map should hide and the globe return within 3 s of I'm safe").toBe(true);
    const panelBack = await waitUntil(() => objectEnabled("Panel"), 3000);
    expect(panelBack, "The main panel should come back after I'm safe").toBe(true);
    for (const name of PANEL_BUTTONS) {
      expect(interactableReady(name), `"${name}" should be reachable again after I'm safe`).toBe(true);
    }
  }
}
