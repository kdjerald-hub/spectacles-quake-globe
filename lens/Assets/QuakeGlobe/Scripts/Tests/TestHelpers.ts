// Shared helpers for the Live Quake Globe LEAF scenarios. Purely additive test code: it reads
// scene state and drives the Lens through its existing Interactable buttons, exactly as a user
// would. It never touches the Lens source.
//
// The scene is built at runtime by QuakeGlobeLens.ts, so every object below is looked up by name
// through LEAF's scene utilities (the authored scene graph does not contain them).
//
// All waits are by wall-clock time (Leaf's Utils.sleep), not by frame count: the Lens enables its
// Panel and cards only after placeInFront() runs ~0.25 s after start, and data arrives from the
// network seconds later, so a fixed number of frames is the wrong unit to wait in.

import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, findSceneObjectsByName, sleep } from "Leaf.lspkg/Utils/common/Utils";

/** How often to re-check scene state while waiting on a condition. */
const POLL_MS = 50;
/** Short settle after a press, to let the resulting enable/disable and text updates land. */
const SETTLE_MS = 120;

/** Sleep `ms` of wall-clock time. Thin wrapper over Leaf's Utils.sleep so call sites read clearly. */
export async function wait(ms: number): Promise<void> {
  await sleep(ms);
}

/** Poll `predicate` every POLL_MS until it is true or `timeoutMs` of wall-clock time elapses. */
export async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await sleep(POLL_MS);
    elapsed += POLL_MS;
  }
  return predicate();
}

/**
 * The object's own `enabled` flag. The Lens toggles these card/marker roots directly, so this is
 * the flag the done criteria care about. Returns false if the object does not exist.
 */
export function objectEnabled(name: string): boolean {
  const obj = findSceneObjectByName(name);
  return !isNull(obj) && obj.enabled;
}

/** Wait up to `timeoutMs` (wall-clock), stopping as soon as `name`'s enabled flag equals `want`. */
export async function waitForEnabled(name: string, want: boolean, timeoutMs = 5000): Promise<boolean> {
  return waitUntil(() => objectEnabled(name) === want, timeoutMs);
}

/** True once a SceneObject named `name` carries an Interactable that LEAF can reach (enabled in hierarchy). */
export function interactableReady(name: string): boolean {
  return !isNull(findInteractableByName(name, undefined, true));
}

/**
 * The `.text` of the Text component on the SceneObject named `name` whose parent is `parentName`.
 * "Body" and "Status" each exist on more than one card, so the parent disambiguates them.
 * Returns undefined when no such object (or no Text component) is found.
 */
export function textUnderParent(name: string, parentName: string): string | undefined {
  const objs = findSceneObjectsByName(name);
  for (const o of objs) {
    const parent = o.getParent();
    if (!isNull(parent) && parent.name === parentName) {
      const t = o.getComponent("Component.Text") as Text;
      if (!isNull(t)) {
        return t.text;
      }
    }
  }
  return undefined;
}

/** How many "Map Label" pool objects exist in the scene, visible or not (done criterion 1). */
export function labelPoolSize(): number {
  return findSceneObjectsByName("Map Label").length;
}

/** How many "Map Label" pool objects are enabled and currently carry non-empty text. */
export function visibleLabelCount(): number {
  const objs = findSceneObjectsByName("Map Label");
  let n = 0;
  for (const o of objs) {
    if (isNull(o) || !o.enabled) continue;
    const t = o.getComponent("Component.Text") as Text;
    if (!isNull(t) && t.text.length > 0) n++;
  }
  return n;
}

/** True when a SceneObject named `name` carries a RenderMeshVisual with a mesh assigned. */
export function hasMesh(name: string): boolean {
  const obj = findSceneObjectByName(name);
  if (isNull(obj)) return false;
  const v = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  return !isNull(v) && !isNull(v.mesh);
}

/**
 * Set the globe handle's local scale, standing in for the two-hand resize gesture. Growing the
 * globe raises the apparent disc and so the label budget. Returns false if the handle is absent.
 */
export function setGlobeScale(scale: number): boolean {
  const globe = findSceneObjectByName("Globe");
  if (isNull(globe)) return false;
  globe.getTransform().setLocalScale(new vec3(scale, scale, scale));
  return true;
}

/** Leading integer of the Panel's Count line ("127 quakes, ..."), or 0 before the feed loads. */
export function loadedQuakeCount(): number {
  const count = textUnderParent("Count", "Panel");
  if (count === undefined) {
    return 0;
  }
  const match = count.match(/^\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Wait up to `timeoutMs` until the live USGS feed has loaded at least one quake (Count > 0). */
export async function waitForQuakes(timeoutMs = 15000): Promise<boolean> {
  return waitUntil(() => loadedQuakeCount() > 0, timeoutMs);
}

/**
 * Trigger an *enabled* Interactable by its SceneObject name. Cards and the Panel self-enable only
 * after the globe is placed, so the target may not be reachable the instant we ask: keep looking
 * for up to 3 s before failing with a clear error.
 */
export async function triggerButton(interactor: DefaultLeafInteractor, name: string): Promise<void> {
  const ready = await waitUntil(() => interactableReady(name), 3000);
  const target = findInteractableByName(name, undefined, true);
  if (!ready || isNull(target)) {
    throw new Error(`Interactable "${name}" not found or not enabled`);
  }
  await interactor.trigger(target);
  await sleep(SETTLE_MS);
}

/**
 * Shared reset run at the start of every scenario, per the done-criteria contract:
 *   1. wait until the Lens has placed its Panel and "Button Spin" is reachable (up to 15 s), then
 *   2. dismiss any active alert, then
 *   3. clear any quake selection ("Button Spin", on the always-present Panel).
 * Leaves the Controls Card active with nothing selected. Scenarios share Lens state, so this
 * guarantees a known baseline regardless of execution order.
 *
 * The alert has two stages. "I'm safe" lives only on the "after" page, so if a previous scenario
 * left the alert mid-shake (the "during" page is up), advance it with "Shaking stopped" first, then
 * close it with "I'm safe".
 *
 * The Lens builds the Panel in onAwake but keeps it disabled until placeInFront() runs ~0.25 s
 * after start; LEAF only finds interactables that are enabled in the hierarchy. Pressing Spin
 * before then is what produced `Interactable "Button Spin" not found or not enabled`, so we wait
 * for it to be reachable before pressing anything.
 */
export async function resetState(interactor: DefaultLeafInteractor): Promise<void> {
  const ready = await waitUntil(() => interactableReady("Button Spin"), 15000);
  if (!ready) {
    throw new Error('Panel never became ready: "Button Spin" not found or not enabled within 15 s');
  }

  if (objectEnabled("Alert Card")) {
    if (objectEnabled("Alert During")) {
      await triggerButton(interactor, "Button Shaking stopped");
      await waitForEnabled("Alert After", true);
    }
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
  }
  await triggerButton(interactor, "Button Spin");
  // The Controls Card self-enables with the Panel; by here it should already be up.
  await waitForEnabled("Controls Card", true);
}
