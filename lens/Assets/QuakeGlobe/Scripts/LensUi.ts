// World-space text, the panel backplate and the panel buttons.
//
// Buttons and the backplate come from Snap's free Spectacles UI Kit. The two classes
// used here, RectangleButton and RoundedRectangle, exist with the same API in UI Kit 0.1.5
// (Lens Studio 5.15, Spectacles 2024) and 2.0 (Lens Studio 5.22+, SPECS 27), so the
// scripts stay portable between the two lines. UI Kit buttons bring Snap's own hover,
// press ("squish") and toggle feedback, which Snap's design guidance asks for.

import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { createEmptyObject } from "./LensRender";

export interface TextOptions {
  size: number;
  color: [number, number, number];
  widthCm: number;
  heightCm: number;
  centered: boolean;
  /** Optional font asset; the Lens Studio default font is used when absent. */
  font?: Font;
}

/** Text draws after opaque and UI Kit visuals behind it. */
const TEXT_RENDER_ORDER = 10;

/**
 * World-space Text whose top edge sits at the object's origin (or centred, for labels).
 */
export function createText(parent: SceneObject, name: string, position: vec3, o: TextOptions): Text {
  const obj = createEmptyObject(name, parent);
  obj.getTransform().setLocalPosition(position);
  const text = obj.createComponent("Component.Text");
  text.size = o.size;
  text.textFill.color = new vec4(o.color[0], o.color[1], o.color[2], 1);
  text.horizontalAlignment = o.centered ? HorizontalAlignment.Center : HorizontalAlignment.Left;
  text.verticalAlignment = o.centered ? VerticalAlignment.Center : VerticalAlignment.Top;
  if (o.font) text.font = o.font;
  const rect = o.centered
    ? Rect.create(-o.widthCm / 2, o.widthCm / 2, -o.heightCm / 2, o.heightCm / 2)
    : Rect.create(-o.widthCm / 2, o.widthCm / 2, -o.heightCm, 0);
  // Lens Studio 5.22+ renamed worldSpaceRect to layoutRect and warns that the old name will
  // stop working; 5.15 (Spectacles 2024) only has worldSpaceRect. Use whichever exists.
  // (The check runs on a separate value so TypeScript does not narrow `text` per version.)
  const hasLayoutRect = "layoutRect" in (text as object);
  if (hasLayoutRect) (text as any).layoutRect = rect;
  else text.worldSpaceRect = rect;
  // The default is to overflow the box; long status lines must wrap instead.
  text.horizontalOverflow = HorizontalOverflow.Wrap;
  // Let the user's hands (depth-writing occluders) hide text behind them.
  text.depthTest = true;
  text.setRenderOrder(TEXT_RENDER_ORDER);
  text.text = "";
  return text;
}

/** Assigns only when the value changed, so a once-per-second refresh does no needless work. */
export function setText(t: Text, value: string): void {
  if (t.text !== value) t.text = value;
}

/**
 * Dark rounded backplate with a bright hairline border (UI Kit RoundedRectangle).
 * On a see-through display dark pixels are transparent, so the border defines the panel;
 * the dark fill matters in recordings and keeps text readable over busy backgrounds.
 * No gradient, as Snap's guidance advises against gradients with opacity.
 */
export function createBackplate(parent: SceneObject, widthCm: number, heightCm: number, center: vec3): RoundedRectangle {
  const obj = createEmptyObject("Backplate", parent);
  obj.getTransform().setLocalPosition(center);
  const plate = obj.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle;
  plate.size = new vec2(widthCm, heightCm);
  plate.cornerRadius = 1.2;
  plate.backgroundColor = new vec4(0.02, 0.05, 0.09, 0.85);
  plate.border = true;
  plate.borderSize = 0.09;
  plate.borderColor = new vec4(0.42, 0.66, 1.0, 0.9);
  plate.initialize();
  return plate;
}

export const BUTTON_DEPTH_CM = 1;

export class PanelButton {
  readonly sceneObject: SceneObject;
  private readonly button: RectangleButton;
  private readonly onPress: () => void;
  private readonly toggle: boolean;
  private hovered = false;

  /**
   * `toggle` buttons show an on/off state (the current time window, the idle spin); the
   * Lens sets that state from the model after every change, so a press on an already
   * active window cannot leave it looking off.
   */
  constructor(
    parent: SceneObject,
    label: string,
    position: vec3,
    widthCm: number,
    heightCm: number,
    toggle: boolean,
    onPress: () => void,
    font?: Font,
    labelSize = 40,
  ) {
    this.onPress = onPress;
    this.toggle = toggle;
    this.sceneObject = createEmptyObject("Button " + label, parent);
    this.sceneObject.getTransform().setLocalPosition(position);
    // UI Kit buttons create their own collider and Interactable when initialised.
    this.button = this.sceneObject.createComponent(RectangleButton.getTypeName()) as RectangleButton;
    this.button.size = new vec3(widthCm, heightCm, BUTTON_DEPTH_CM);
    if (toggle) {
      // Toggle mode is UI Kit's `_toggleable` input, the Inspector's "Toggleable" checkbox, and
      // initialize() reads it. Setting it first is what that checkbox does; setIsToggleable()
      // after creation works too but prints "WARNING: ... automatically converted to a toggle".
      // The field has this name in UI Kit 0.1.5 and 2.0; if it ever changes, fall back.
      // (The check runs on a separate value so TypeScript does not narrow `button` to never.)
      const hasToggleInput = "_toggleable" in (this.button as object);
      if (hasToggleInput) (this.button as unknown as { _toggleable: boolean })._toggleable = true;
      else this.button.setIsToggleable(true);
    }
    this.button.initialize();
    const caption = createText(this.sceneObject, "Label", new vec3(0, 0, BUTTON_DEPTH_CM / 2 + 0.05), {
      size: labelSize,
      color: [1, 1, 1],
      widthCm,
      heightCm,
      centered: true,
      font,
    });
    caption.text = label;
  }

  /** Subscribe from OnStartEvent, as the Interaction Kit requires. */
  bind(): void {
    this.button.onTriggerUp.add(() => this.onPress());
    this.button.onHoverEnter.add(() => {
      this.hovered = true;
    });
    this.button.onHoverExit.add(() => {
      this.hovered = false;
    });
  }

  /** True while a hand ray or the mouse is on the button (the panel holds still meanwhile). */
  isHovered(): boolean {
    return this.hovered;
  }

  setActive(active: boolean): void {
    if (!this.toggle) return;
    if (this.button.isOn !== active) this.button.isOn = active;
  }
}
