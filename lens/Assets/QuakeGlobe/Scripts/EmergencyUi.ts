// World-space cards for the alert overlay: the quake details card (done criterion 2) and the
// earthquake alert card (criteria 3-5). Both reuse the panel's backplate, text and UI Kit
// buttons from LensUi, so they match the main panel and respond to mouse, hand ray and LEAF.
//
// A card lays its content out top-down from the origin (like LensUi.buildPanel) and sizes a
// backplate behind it. The Lens positions and billboards the whole card each frame; the card
// only knows its own internal layout, text and visibility.

import { PanelButton, createBackplate, createText, setText } from "./LensUi";
import { createEmptyObject } from "./LensRender";

const LINE_GAP_CM = 0.25;
const PADDING_CM = 1.2;
const BODY: [number, number, number] = [0.92, 0.96, 1.0];
const MUTED: [number, number, number] = [0.62, 0.72, 0.82];
const TITLE: [number, number, number] = [0.78, 0.9, 1.0];
/** Alert accents are warm so the card reads as urgent without a saturated fill. */
const WARN: [number, number, number] = [1.0, 0.76, 0.4];
const GUIDE: [number, number, number] = [1.0, 0.95, 0.85];

/** Height of `lines` lines of world-space text at `size` (matches LensUi/QuakeGlobeLens). */
function textHeightCm(size: number, lines: number): number {
  return (size / 43.886) * 1.25 * lines;
}

/** A stack of text lines and buttons with a backplate behind them; the Lens poses the root. */
class CardBase {
  readonly root: SceneObject;
  readonly buttons: PanelButton[] = [];
  protected readonly widthCm: number;
  protected readonly font?: Font;
  protected y = 0;
  protected bottomY = 0;

  constructor(parent: SceneObject, name: string, widthCm: number, font?: Font) {
    this.root = createEmptyObject(name, parent);
    this.widthCm = widthCm;
    this.font = font;
  }

  protected line(name: string, size: number, color: [number, number, number], lines: number, centered = false): Text {
    const h = textHeightCm(size, lines);
    const t = createText(this.root, name, new vec3(0, this.y, 0), {
      size,
      color,
      widthCm: this.widthCm,
      heightCm: h,
      centered,
      font: this.font,
    });
    this.y -= h + LINE_GAP_CM;
    return t;
  }

  protected gap(cm: number): void {
    this.y -= cm;
  }

  /** Dark rounded backplate sized to everything added so far, placed behind the content. */
  protected finishPlate(): void {
    this.bottomY = this.y;
    const plateHeight = -this.bottomY + 2 * PADDING_CM;
    createBackplate(this.root, this.widthCm + 2 * PADDING_CM, plateHeight, new vec3(0, this.bottomY / 2 + PADDING_CM / 2, -0.8));
  }

  /** Height of the laid-out content, so the Lens can centre the card vertically. */
  get contentHeightCm(): number {
    return -this.bottomY;
  }

  setVisible(visible: boolean): void {
    if (this.root.enabled !== visible) this.root.enabled = visible;
  }

  get visible(): boolean {
    return this.root.enabled;
  }

  /** True while any button on the card is aimed at; the Lens holds the card still meanwhile. */
  anyHovered(): boolean {
    for (const b of this.buttons) if (b.isHovered()) return true;
    return false;
  }

  bind(): void {
    for (const b of this.buttons) b.bind();
  }
}

/** Details for one selected quake, with a Close button. Shown beside the globe. */
export class DetailsCard extends CardBase {
  private readonly title: Text;
  private readonly body: Text;
  readonly closeButton: PanelButton;

  constructor(parent: SceneObject, widthCm: number, onClose: () => void, font?: Font) {
    super(parent, "Details Card", widthCm, font);
    this.title = this.line("Title", 44, TITLE, 1);
    this.title.text = "Quake details";
    this.body = this.line("Body", 38, BODY, 5);
    this.gap(0.6);
    const h = 3.2;
    const row = this.y - h / 2;
    this.closeButton = new PanelButton(this.root, "Close", new vec3(0, row, 0), widthCm, h, false, onClose, font);
    this.buttons.push(this.closeButton);
    this.y = row - h / 2;
    this.finishPlate();
    this.setVisible(false);
  }

  setText(body: string): void {
    setText(this.body, body);
  }
}

/**
 * The overlay's action controls, beside the globe: the simulated phone alert (the hero target),
 * plus setting the home point and the room safe spot. Shown when no alert is active; the alert
 * card replaces it on the same side during an alert.
 */
export class ControlsCard extends CardBase {
  constructor(
    parent: SceneObject,
    widthCm: number,
    handlers: { onAlert: () => void; onSetHome: () => void; onConfirmHome: () => void; onSetSafe: () => void },
    font?: Font,
  ) {
    super(parent, "Controls Card", widthCm, font);
    this.line("Title", 40, TITLE, 1).text = "Earthquake alert";
    this.line("Hint", 32, MUTED, 2).text = "Mark home and a safe spot, then fire the simulated alert.";
    this.gap(0.5);
    const h = 3.6;
    const gapY = 1.4;
    const gapX = 1.4;
    const w2 = (widthCm - gapX) / 2;
    let row = this.y - h / 2;
    this.add(new PanelButton(this.root, "Phone alert received", new vec3(0, row, 0), widthCm, h, false, handlers.onAlert, font));
    row -= h + gapY;
    this.add(new PanelButton(this.root, "Set home", new vec3(-widthCm / 2 + w2 / 2, row, 0), w2, h, false, handlers.onSetHome, font));
    this.add(new PanelButton(this.root, "Set as Home", new vec3(widthCm / 2 - w2 / 2, row, 0), w2, h, false, handlers.onConfirmHome, font));
    row -= h + gapY;
    this.add(new PanelButton(this.root, "Set safe spot", new vec3(0, row, 0), widthCm, h, false, handlers.onSetSafe, font));
    this.y = row - h / 2;
    this.finishPlate();
  }

  private add(b: PanelButton): void {
    this.buttons.push(b);
  }
}

/** The earthquake alert: guidance, distance from home, and the two action buttons. */
export class AlertCard extends CardBase {
  private readonly body: Text;
  private readonly distance: Text;
  private readonly status: Text;
  readonly sendButton: PanelButton;
  readonly safeButton: PanelButton;

  constructor(
    parent: SceneObject,
    widthCm: number,
    opts: { title: string; simNote: string; guidance: string; sendLabel: string; safeLabel: string },
    onSend: () => void,
    onSafe: () => void,
    font?: Font,
  ) {
    super(parent, "Alert Card", widthCm, font);
    this.line("Title", 46, WARN, 1).text = opts.title;
    this.line("Sim note", 34, MUTED, 1).text = opts.simNote;
    this.gap(0.4);
    this.body = this.line("Body", 38, BODY, 4);
    this.gap(0.3);
    this.line("Guidance", 50, GUIDE, 1).text = opts.guidance;
    this.gap(0.3);
    this.distance = this.line("Distance", 38, WARN, 1);
    this.status = this.line("Status", 36, MUTED, 1);
    this.gap(0.6);
    const h = 3.6;
    const gapX = 1.6;
    const w = (widthCm - gapX) / 2;
    const row = this.y - h / 2;
    this.sendButton = new PanelButton(this.root, opts.sendLabel, new vec3(-widthCm / 2 + w / 2, row, 0), w, h, false, onSend, font);
    this.safeButton = new PanelButton(this.root, opts.safeLabel, new vec3(widthCm / 2 - w / 2, row, 0), w, h, false, onSafe, font);
    this.buttons.push(this.sendButton, this.safeButton);
    this.y = row - h / 2;
    this.finishPlate();
    this.setVisible(false);
  }

  setBody(text: string): void {
    setText(this.body, text);
  }

  setDistance(text: string): void {
    setText(this.distance, text);
  }

  setStatus(text: string): void {
    setText(this.status, text);
  }
}
