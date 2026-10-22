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
//
// Added after the narrated-cut review (2026-10-22):
//   - The zoom never covers the text: an UpdateEvent samples every frame from the alert pinch to
//     the globe's return and measures, from the camera, the globe's drawn angular radius
//     (asin(grown radius / distance)) against the angle to the nearest visible backplate top (the
//     alert card's during the zoom in, the dashboard's during the zoom out). The sphere's disc
//     must stay short of both at every sampled frame, and both cross-fade windows must actually
//     have been sampled. At the old GLOBE_GROW of 2.2 the disc overshot the card by ~7 degrees,
//     so this check would have caught that bug on its first frame.
//   - While the map is up, no drawn coastline, plate line or ring crosses any map label's box
//     (the drawn geometry comes from LocalMapView.lastBuildDebug, which holds the final cut
//     centre lines), and no drawn coastline comes within the published clear margin of the
//     home-epicentre segment (so the warm dashes never add into the white coast).

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
import { PADDING_CM } from "../EmergencyUi";
import { PANEL_PADDING_CM } from "../QuakeGlobeLens";
import { LocalMapView } from "../LocalMapView";
import type { Box as MapBox } from "../LocalMapView";
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

/**
 * True when the segment (x0, y0)-(x1, y1) passes within `pad` of box `b` (its own slab test, so
 * the check does not reuse the Lens's cutting code). `pad` carries the drawn line's half width:
 * a ribbon whose edge touches the box counts as crossing it.
 */
function segmentCrossesBox(x0: number, y0: number, x1: number, y1: number, b: MapBox, pad: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [x0, x1 - x0, b.x0 - pad, b.x1 + pad],
    [y0, y1 - y0, b.y0 - pad, b.y1 + pad],
  ];
  for (const [p, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return false;
      continue;
    }
    let a = (lo - p) / d;
    let z = (hi - p) / d;
    if (a > z) {
      const swap = a;
      a = z;
      z = swap;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, z);
    if (t0 >= t1) return false;
  }
  return true;
}

function polylinesCrossBox(polylines: readonly number[][], b: MapBox, pad: number): boolean {
  for (const line of polylines) {
    for (let i = 0; i + 3 < line.length; i += 2) {
      if (segmentCrossesBox(line[i], line[i + 1], line[i + 2], line[i + 3], b, pad)) return true;
    }
  }
  return false;
}

function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Distance between two segments: 0 when they intersect, else the least endpoint-to-segment gap. */
function segSegDist(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx2: number, dy2: number,
): number {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number): number =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const d1 = cross(cx, cy, dx2, dy2, ax, ay);
  const d2 = cross(cx, cy, dx2, dy2, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx2, dy2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(
    pointSegDist(ax, ay, cx, cy, dx2, dy2),
    pointSegDist(bx, by, cx, cy, dx2, dy2),
    pointSegDist(cx, cy, ax, ay, bx, by),
    pointSegDist(dx2, dy2, ax, ay, bx, by),
  );
}

/** What the per-frame zoom-cover sampler accumulates over the whole alert run. */
interface ZoomCoverStats {
  /** Least angular clearance seen (degrees): target angle minus the globe's drawn disc angle. */
  worstDeg: number;
  /** Which backplate top the worst frame measured against ("alert card" or "dashboard"). */
  worstAt: string;
  /** Cross-fade frames sampled with the alert card up (the zoom in). */
  zoomInFrames: number;
  /** Cross-fade frames sampled after the card closed (the zoom out). */
  zoomOutFrames: number;
}

@component
export class AlertScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Sample every frame from here to the globe's return: the zoom must never cover any part of
    // the alert card or the dashboard (narrated-cut review 2026-10-22). See sampleZoomCover.
    const zoomStats: ZoomCoverStats = { worstDeg: Infinity, worstAt: "none", zoomInFrames: 0, zoomOutFrames: 0 };
    const camTransform = WorldCameraFinderProvider.getInstance().getTransform();
    const sampler = this.createEvent("UpdateEvent");
    sampler.bind(() => this.sampleZoomCover(zoomStats, camTransform));

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

    // The map's lines keep out of its labels' boxes (narrated-cut review 2026-10-22): in the final
    // drawn geometry (LocalMapView.lastBuildDebug holds the cut centre lines actually meshed), no
    // coastline, plate line or ring may pass within its half width of any label's box - a gap must
    // have been cut wherever a line would have crossed.
    const dbg = LocalMapView.lastBuildDebug;
    expect(dbg !== null, "LocalMapView should publish its drawn geometry for the map checks").toBe(true);
    const crossings: string[] = [];
    for (const label of dbg!.labels) {
      for (const line of dbg!.lines) {
        if (line.kind === "dash") continue; // the dashes are the line labels already keep clear of
        if (polylinesCrossBox(line.polylines, label.box, line.halfWidthCm)) {
          crossings.push(`${line.kind} x "${label.text}"`);
        }
      }
    }
    expect(
      crossings.length === 0,
      `No drawn coastline, plate line or ring should cross a map label's box (crossing: ${crossings.length > 0 ? crossings.join("; ") : "none"})`,
    ).toBe(true);

    // No drawn coastline comes within the clear margin of the home-epicentre segment, so the warm
    // dashes never add into the white coast on the additive display (narrated-cut review).
    let coastGapCm = Infinity;
    for (const line of dbg!.lines) {
      if (line.kind !== "coast") continue;
      for (const poly of line.polylines) {
        for (let i = 0; i + 3 < poly.length; i += 2) {
          coastGapCm = Math.min(
            coastGapCm,
            segSegDist(poly[i], poly[i + 1], poly[i + 2], poly[i + 3], 0, 0, dbg!.epicentreCm.x, dbg!.epicentreCm.y),
          );
        }
      }
    }
    print(`alert map: nearest drawn coastline ${coastGapCm.toFixed(3)} cm from the home-epicentre segment (margin ${dbg!.segmentClearCm.toFixed(3)} cm)`);
    expect(
      coastGapCm >= dbg!.segmentClearCm - 1e-6,
      `The drawn coastline should keep ${dbg!.segmentClearCm.toFixed(2)} cm clear of the home-epicentre segment (got ${coastGapCm.toFixed(3)} cm)`,
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

    // The zoom never covered the text (narrated-cut review 2026-10-22): over every sampled frame,
    // the globe's drawn disc stayed short of the nearest visible backplate top, and both
    // cross-fade windows (in with the card up, out with the dashboard back) were really sampled.
    this.removeEvent(sampler);
    print(
      `alert zoom: worst clearance ${zoomStats.worstDeg === Infinity ? "none" : zoomStats.worstDeg.toFixed(2)} deg ` +
        `(against the ${zoomStats.worstAt}), ${zoomStats.zoomInFrames} zoom-in and ${zoomStats.zoomOutFrames} zoom-out frames sampled`,
    );
    expect(zoomStats.zoomInFrames >= 3, `The zoom in should be sampled frame by frame (got ${zoomStats.zoomInFrames} frames)`).toBe(true);
    expect(zoomStats.zoomOutFrames >= 3, `The zoom out should be sampled frame by frame (got ${zoomStats.zoomOutFrames} frames)`).toBe(true);
    expect(
      zoomStats.worstDeg > 0.03,
      `The globe should never cover the alert card or the dashboard during the zoom ` +
        `(worst clearance ${zoomStats.worstDeg.toFixed(2)} deg against the ${zoomStats.worstAt})`,
    ).toBe(true);
  }

  /**
   * One frame of the zoom-cover check. Seen from the camera the globe's drawn sphere (collider
   * radius x the spinning content's world scale, which carries the zoom's grow) is an angular
   * disc of half-angle asin(radius / distance); the alert card and the dashboard hang below the
   * globe, so each one's point nearest that disc is its backplate's top edge centre (1.5 paddings
   * above the card's origin, one padding above the panel's). The frame's clearance is the angle
   * from the globe-centre ray to that point minus the disc's half-angle: negative would mean the
   * globe covers part of the plate, and so possibly its letters. Frames with the globe hidden
   * cover nothing and frames with neither plate visible have nothing to cover.
   */
  private sampleZoomCover(stats: ZoomCoverStats, camTransform: Transform): void {
    const content = findSceneObjectByName("Globe Content");
    const globe = findSceneObjectByName("Globe");
    if (isNull(content) || isNull(globe) || !content!.isEnabledInHierarchy) return;
    const collider = globe!.getComponent("Physics.ColliderComponent") as ColliderComponent;
    const baseR = isNull(collider) ? 12 : (collider.shape as SphereShape).radius;
    const drawnR = baseR * content!.getTransform().getWorldScale().y;
    const eye = camTransform.getWorldPosition();
    const centre = globe!.getTransform().getWorldPosition();
    const d = eye.distance(centre);
    if (d <= drawnR + 1) return;
    const sphereDeg = Math.asin(Math.min(0.999, drawnR / d)) * DEG;
    const toCentre = centre.sub(eye).normalize();
    // Both plates hang below the globe when posed. This sampler runs in UpdateEvent, BEFORE the
    // Lens's LateUpdate poses a plate enabled this very frame, so a just-enabled card still
    // carries its stale transform (at the globe's centre) for one read - a frame that never
    // renders that way. A top that is not below the globe's centre is such a stale read: skip it.
    const targets: { name: string; top: vec3 }[] = [];
    const addTarget = (name: string, obj: SceneObject | null, topLocalY: number): void => {
      if (obj === null || isNull(obj) || !obj.enabled) return;
      const t = obj.getTransform();
      const top = t.getWorldPosition().add(t.getWorldRotation().multiplyVec3(new vec3(0, topLocalY, 0)));
      if (top.y < centre.y) targets.push({ name, top });
    };
    const cardObj = findSceneObjectByName("Alert Card");
    addTarget("alert card", cardObj, 1.5 * PADDING_CM);
    addTarget("dashboard", findSceneObjectByName("Panel"), PANEL_PADDING_CM);
    if (targets.length === 0) return;
    for (const target of targets) {
      const v = target.top.sub(eye);
      const dot = Math.max(-1, Math.min(1, v.normalize().dot(toCentre)));
      const clearanceDeg = Math.acos(dot) * DEG - sphereDeg;
      if (clearanceDeg < stats.worstDeg) {
        stats.worstDeg = clearanceDeg;
        stats.worstAt = target.name;
      }
    }
    // Count the cross-fade frames actually sampled: globe drawn AND map up, split by direction.
    if (objectEnabled("Local Map")) {
      if (!isNull(cardObj) && cardObj!.enabled) stats.zoomInFrames++;
      else stats.zoomOutFrames++;
    }
  }
}
