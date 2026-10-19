// Shared helpers for the Live Quake Globe LEAF scenarios. Purely additive test code: it reads
// scene state and drives the Lens through its existing Interactable buttons, exactly as a user
// would. It never touches the Lens source.
//
// The scene is built at runtime by QuakeGlobeLens.ts, so every object below is looked up by name
// through LEAF's scene utilities (the authored scene graph does not contain them).

import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, findSceneObjectsByName, nextFrame } from "Leaf.lspkg/Utils/common/Utils";

/** Await `count` render frames. */
export async function advanceFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextFrame();
  }
}

/**
 * The object's own `enabled` flag. The Lens toggles these card/marker roots directly, so this is
 * the flag the done criteria care about. Returns false if the object does not exist.
 */
export function objectEnabled(name: string): boolean {
  const obj = findSceneObjectByName(name);
  return !isNull(obj) && obj.enabled;
}

/** Advance up to `maxFrames`, stopping as soon as `name`'s enabled flag equals `want`. */
export async function waitForEnabled(name: string, want: boolean, maxFrames = 20): Promise<boolean> {
  for (let i = 0; i < maxFrames; i++) {
    if (objectEnabled(name) === want) {
      return true;
    }
    await nextFrame();
  }
  return objectEnabled(name) === want;
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

/** Trigger an *enabled* Interactable by its SceneObject name; throws a clear error if absent. */
export async function triggerButton(interactor: DefaultLeafInteractor, name: string): Promise<void> {
  const target = findInteractableByName(name, undefined, true);
  if (isNull(target)) {
    throw new Error(`Interactable "${name}" not found or not enabled`);
  }
  await interactor.trigger(target);
  await advanceFrames(2);
}

/**
 * Shared reset run at the start of every scenario, per the done-criteria contract:
 *   1. dismiss any active alert ("Button I'm safe", only while the Alert Card is enabled), then
 *   2. clear any quake selection ("Button Spin", on the always-present Panel).
 * Leaves the Controls Card active with nothing selected. Scenarios share Lens state, so this
 * guarantees a known baseline regardless of execution order.
 */
export async function resetState(interactor: DefaultLeafInteractor): Promise<void> {
  if (objectEnabled("Alert Card")) {
    await triggerButton(interactor, "Button I'm safe");
    await waitForEnabled("Alert Card", false);
  }
  await triggerButton(interactor, "Button Spin");
  await advanceFrames(2);
  // The Controls Card self-enables ~0.25 s after the Lens starts (automatic placement). Give it a
  // moment so the control buttons are present for scenarios that need them.
  await waitForEnabled("Controls Card", true);
}
