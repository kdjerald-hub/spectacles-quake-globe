// Lens-only label layer for the globe (done criterion 1, map detail).
//
// Continent, ocean, sea and country names that face the viewer, fade before the edge, never
// overlap, and grow in number as the globe grows. Every geography decision lives in the
// unit-tested core (Core/labels: layoutLabels, activeLabelIds, nearestCountryLabelId) over the
// Natural Earth candidates (Data/labels). This file owns only the Lens side: a small pool of
// world-space Text objects reused across layouts, and the per-frame brightness easing.
//
// The Lens calls relayout() a few times a second (not every frame: the layout walks every
// candidate) with the current globe view; ease() runs every frame to fade labels in and out.
// Labels hang off the Lens root, not the spinning globe content, so they hold still in the world
// between layouts and are re-placed as a set when relayout() runs.

import { LABEL_CANDIDATES } from "../Data/labels";
import { DEFAULT_LABEL_CONFIG, activeLabelIds, layoutLabels, nearestCountryLabelId } from "../Core/labels";
import type { LabelConfig, LabelMemory, LabelView, PlacedLabel } from "../Core/labels";
import { createText } from "./LensUi";
import { createEmptyObject, toLensQuat, toLensVec } from "./LensRender";

/** Budget never exceeds DEFAULT_LABEL_CONFIG.maxLabels (16); a little headroom keeps slots free. */
const POOL_SIZE = 20;
/** Lens Text size per cm of em height (matches LensUi/QuakeGlobeLens: em = size / 43.886 cm). */
const EM_TO_SIZE = 43.886;
/** Generous transparent layout box so short names are centred and never wrap or clip. */
const LABEL_BOX_CM = 60;
const LABEL_BOX_HEIGHT_CM = 16;
/** Brightness easing rate (per second) toward each layout's target alpha: a soft fade, no pop. */
const FADE_PER_SEC = 4;

// Quiet, desaturated label colours: land warm-white, water cool. On the additive display
// brightness is visibility, so the eased alpha scales the RGB (never a dark fill, never a
// saturated one: the quakes stay the only saturated colour).
const LAND_COLOR: [number, number, number] = [0.95, 0.94, 0.86];
const WATER_COLOR: [number, number, number] = [0.72, 0.85, 1.0];

interface Slot {
  obj: SceneObject;
  text: Text;
  /** The candidate id this slot currently shows, or "" when free. */
  id: string;
  /** Eased brightness, 0-1. */
  current: number;
  /** Brightness the latest layout asked for. */
  target: number;
  color: [number, number, number];
}

export class MapLabels {
  private readonly root: SceneObject;
  private readonly slots: Slot[] = [];
  private readonly cfg: LabelConfig = DEFAULT_LABEL_CONFIG;
  private memory: LabelMemory = new Map();
  private nowS = 0;
  private homeId: string | null = null;
  private homeKey = "";
  private boosted: ReadonlySet<string> = new Set();

  constructor(parent: SceneObject, font?: Font) {
    this.root = createEmptyObject("Map Labels", parent);
    for (let i = 0; i < POOL_SIZE; i++) {
      const text = createText(this.root, "Map Label", new vec3(0, 0, 0), {
        size: 40,
        color: LAND_COLOR,
        widthCm: LABEL_BOX_CM,
        heightCm: LABEL_BOX_HEIGHT_CM,
        centered: true,
        font,
      });
      const obj = text.getSceneObject();
      obj.enabled = false;
      this.slots.push({ obj, text, id: "", current: 0, target: 0, color: LAND_COLOR });
    }
  }

  /** Countries within range of a strong quake, so active regions get named even on a small globe. */
  setBoosted(quakes: readonly { lat: number; lon: number; mag: number }[]): void {
    this.boosted = activeLabelIds(LABEL_CANDIDATES, quakes);
  }

  /**
   * Recompute which labels show and where, for the given globe view and home point. Call a few
   * times a second: the layout walks every candidate, so running it every frame is wasteful and
   * the output barely changes between frames. `dt` advances the layout's own dwell/hysteresis clock.
   */
  relayout(view: LabelView, home: { lat: number; lon: number }, selectionActive: boolean, dt: number): void {
    this.nowS += dt;
    const homeKey = home.lat.toFixed(2) + "," + home.lon.toFixed(2);
    if (homeKey !== this.homeKey) {
      this.homeKey = homeKey;
      this.homeId = nearestCountryLabelId(LABEL_CANDIDATES, home.lat, home.lon);
    }
    const pinned = this.homeId ? new Set<string>([this.homeId]) : new Set<string>();
    const result = layoutLabels(LABEL_CANDIDATES, view, this.cfg, this.memory, this.nowS, [], selectionActive, this.boosted, pinned);
    this.memory = result.memory;
    this.assign(result.placed);
  }

  /** Map the placed labels onto the pool, keeping each label in its slot so text never swaps mid-fade. */
  private assign(placed: PlacedLabel[]): void {
    const used = new Array<boolean>(this.slots.length).fill(false);
    const fresh: PlacedLabel[] = [];
    for (const p of placed) {
      let matched = false;
      for (let i = 0; i < this.slots.length; i++) {
        if (!used[i] && this.slots[i].id === p.id && p.id !== "") {
          used[i] = true;
          this.apply(this.slots[i], p);
          matched = true;
          break;
        }
      }
      if (!matched) fresh.push(p);
    }
    for (const p of fresh) {
      const idx = used.indexOf(false);
      if (idx < 0) break; // pool full (does not happen: budget <= POOL_SIZE)
      used[idx] = true;
      this.slots[idx].current = 0; // a freshly-claimed slot fades in from dark
      this.apply(this.slots[idx], p);
    }
    for (let i = 0; i < this.slots.length; i++) if (!used[i]) this.slots[i].target = 0;
  }

  private apply(slot: Slot, p: PlacedLabel): void {
    slot.id = p.id;
    slot.target = Math.max(0, Math.min(1, p.alpha));
    slot.color = p.cls === "ocean" || p.cls === "sea" ? WATER_COLOR : LAND_COLOR;
    slot.text.text = p.lines.join("\n");
    slot.text.size = p.emCm * EM_TO_SIZE;
    const t = slot.obj.getTransform();
    t.setWorldPosition(toLensVec(p.position));
    t.setWorldRotation(toLensQuat(p.rotation));
  }

  /** Ease every slot toward its target brightness and enable it while visible. Call every frame. */
  ease(dt: number): void {
    const k = 1 - Math.exp(-dt * FADE_PER_SEC);
    for (const slot of this.slots) {
      slot.current += (slot.target - slot.current) * k;
      const visible = slot.current > 0.01 || slot.target > 0.01;
      if (slot.obj.enabled !== visible) slot.obj.enabled = visible;
      if (visible) {
        const a = Math.max(0, slot.current);
        slot.text.textFill.color = new vec4(slot.color[0] * a, slot.color[1] * a, slot.color[2] * a, 1);
      } else if (slot.id !== "") {
        slot.id = ""; // slot fully faded: free it for the next label
      }
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.root.enabled !== enabled) this.root.enabled = enabled;
  }
}
