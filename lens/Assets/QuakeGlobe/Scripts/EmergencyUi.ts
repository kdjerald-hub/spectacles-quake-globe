// World-space cards for the alert overlay: the quake details card (done criterion 2), the overlay
// controls card, and the earthquake alert card (criteria 3-5). All reuse the panel's backplate,
// text and UI Kit buttons from LensUi, so they match the main panel and respond to mouse, hand ray
// and LEAF.
//
// A card lays its content out top-down from the origin (like LensUi.buildPanel) and sizes a
// backplate behind it. The Lens positions and billboards the whole card each frame; the card
// only knows its own internal layout, text and visibility.
//
// The alert card has two stages, matching the hazard profile's "during"/"after": while the ground
// shakes the card leads with the headline and asks for nothing but "Shaking stopped"; once that is
// pinched it shows the event details, the "after" guidance and the send / "I'm safe" buttons. Each
// stage is its own child page ("Alert During" / "Alert After") under the "Alert Card" root, so only
// the active stage's buttons are reachable (a pinch during shaking can only be "Shaking stopped").

import { PanelButton, createBackplate, createText, setText } from "./LensUi";
import { createEmptyObject } from "./LensRender";

const LINE_GAP_CM = 0.25;
const PADDING_CM = 1.2;
const BODY: [number, number, number] = [0.92, 0.96, 1.0];
const MUTED: [number, number, number] = [0.62, 0.72, 0.82];
const TITLE: [number, number, number] = [0.78, 0.9, 1.0];
/** Alert accents are warm so the card reads as urgent without a saturated fill or an emergency-red banner. */
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
    // Seven lines: magnitude/depth, coordinates, place (may wrap), time, and the nearest plate
    // boundary (which can wrap to two lines).
    this.body = this.line("Body", 38, BODY, 7);
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
 * plus setting the home point and the room cover spot. Shown when no alert is active; the alert
 * card replaces it on the same side during an alert.
 *
 * "Set as home" is hidden until a point on the globe has been picked (design brief): the Lens calls
 * setConfirmHomeVisible(true) from the globe-tap handler, so only "Set home" shows to start with.
 */
export class ControlsCard extends CardBase {
  private readonly confirmHomeButton: PanelButton;

  constructor(
    parent: SceneObject,
    widthCm: number,
    handlers: { onAlert: () => void; onSetHome: () => void; onConfirmHome: () => void; onSetCover: () => void },
    spotLabel: string,
    font?: Font,
  ) {
    super(parent, "Controls Card", widthCm, font);
    const spot = spotLabel.toLowerCase();
    this.line("Title", 40, TITLE, 1).text = "Earthquake alert";
    this.line("Hint", 32, MUTED, 2).text = "Mark home and a " + spot + ", then fire the simulated alert.";
    this.gap(0.5);
    const h = 3.6;
    const gapY = 1.4;
    const gapX = 1.4;
    const w2 = (widthCm - gapX) / 2;
    let row = this.y - h / 2;
    this.add(new PanelButton(this.root, "Phone alert received", new vec3(0, row, 0), widthCm, h, false, handlers.onAlert, font));
    row -= h + gapY;
    this.add(new PanelButton(this.root, "Set home", new vec3(-widthCm / 2 + w2 / 2, row, 0), w2, h, false, handlers.onSetHome, font));
    this.confirmHomeButton = new PanelButton(this.root, "Set as home", new vec3(widthCm / 2 - w2 / 2, row, 0), w2, h, false, handlers.onConfirmHome, font);
    this.add(this.confirmHomeButton);
    row -= h + gapY;
    this.add(new PanelButton(this.root, "Set " + spot, new vec3(0, row, 0), widthCm, h, false, handlers.onSetCover, font));
    this.y = row - h / 2;
    this.finishPlate();
    this.setConfirmHomeVisible(false);
  }

  private add(b: PanelButton): void {
    this.buttons.push(b);
  }

  /** "Set as home" appears only once a point on the globe has been picked (design brief). */
  setConfirmHomeVisible(visible: boolean): void {
    if (this.confirmHomeButton.sceneObject.enabled !== visible) this.confirmHomeButton.sceneObject.enabled = visible;
  }
}

/** Stage one ("during"): headline, the "during" lines, the glanceable distance, SIMULATION, and
 * the single "Shaking stopped" button. Nothing else needs a gesture while the ground shakes. */
class AlertDuringPage extends CardBase {
  readonly advanceButton: PanelButton;
  private readonly distanceText: Text;

  constructor(
    parent: SceneObject,
    widthCm: number,
    opts: { headline: string; during: string[]; simNote: string; source: string; advanceLabel: string },
    onAdvance: () => void,
    font?: Font,
  ) {
    super(parent, "Alert During", widthCm, font);
    // The headline is the biggest text and leads the card.
    this.line("Headline", 52, GUIDE, 1, true).text = opts.headline;
    this.gap(0.35);
    this.line("During", 40, BODY, Math.max(1, opts.during.length)).text = opts.during.join("\n");
    this.gap(0.2);
    this.distanceText = this.line("Distance", 40, WARN, 1);
    this.line("Sim note", 34, WARN, 1).text = opts.simNote;
    this.line("Source", 30, MUTED, 2).text = opts.source;
    this.gap(0.6);
    const h = 3.6;
    const row = this.y - h / 2;
    this.advanceButton = new PanelButton(this.root, opts.advanceLabel, new vec3(0, row, 0), widthCm, h, false, onAdvance, font);
    this.buttons.push(this.advanceButton);
    this.y = row - h / 2;
    this.finishPlate();
  }

  setDistance(text: string): void {
    setText(this.distanceText, text);
  }
}

/** Stage two ("after"): the event details, the "after" guidance, SIMULATION, the send result, and
 * the "Send to emergency contacts" and "I'm safe" buttons. */
class AlertAfterPage extends CardBase {
  private readonly detailsText: Text;
  private readonly statusText: Text;
  readonly sendButton: PanelButton;
  readonly safeButton: PanelButton;

  constructor(
    parent: SceneObject,
    widthCm: number,
    opts: { title: string; simNote: string; after: string[]; source: string; sendLabel: string; safeLabel: string },
    onSend: () => void,
    onSafe: () => void,
    font?: Font,
  ) {
    super(parent, "Alert After", widthCm, font);
    this.line("Title", 44, TITLE, 1).text = opts.title;
    this.line("Sim note", 32, WARN, 1).text = opts.simNote;
    this.gap(0.3);
    // Five detail items: magnitude (both scales), depth, local time, place, nearest boundary; the
    // place and the boundary can each wrap, so reserve seven lines.
    this.detailsText = this.line("Details", 36, BODY, 7);
    this.gap(0.2);
    this.line("After", 38, GUIDE, Math.max(1, opts.after.length) + 1).text = opts.after.join("\n");
    this.line("Source", 30, MUTED, 2).text = opts.source;
    this.statusText = this.line("Status", 36, WARN, 2);
    this.gap(0.5);
    const h = 3.6;
    const gapX = 1.6;
    const w = (widthCm - gapX) / 2;
    const row = this.y - h / 2;
    this.sendButton = new PanelButton(this.root, opts.sendLabel, new vec3(-widthCm / 2 + w / 2, row, 0), w, h, false, onSend, font);
    this.safeButton = new PanelButton(this.root, opts.safeLabel, new vec3(widthCm / 2 - w / 2, row, 0), w, h, false, onSafe, font);
    this.buttons.push(this.sendButton, this.safeButton);
    this.y = row - h / 2;
    this.finishPlate();
  }

  setDetails(text: string): void {
    setText(this.detailsText, text);
  }

  setStatus(text: string): void {
    setText(this.statusText, text);
  }
}

/**
 * The earthquake alert card: two stacked stage pages under one "Alert Card" root. Only the active
 * stage is enabled, so the other stage's buttons are never reachable. The Lens poses the root and
 * reads contentHeightCm (which tracks the active stage) to keep the card inside the view.
 */
export class AlertCard {
  readonly root: SceneObject;
  private readonly duringPage: AlertDuringPage;
  private readonly afterPage: AlertAfterPage;
  private stage: "during" | "after" = "during";

  constructor(
    parent: SceneObject,
    widthCm: number,
    opts: {
      title: string;
      simNote: string;
      headline: string;
      during: string[];
      after: string[];
      source: string;
      advanceLabel: string;
      sendLabel: string;
      safeLabel: string;
    },
    handlers: { onAdvance: () => void; onSend: () => void; onSafe: () => void },
    font?: Font,
  ) {
    this.root = createEmptyObject("Alert Card", parent);
    this.duringPage = new AlertDuringPage(
      this.root,
      widthCm,
      { headline: opts.headline, during: opts.during, simNote: opts.simNote, source: opts.source, advanceLabel: opts.advanceLabel },
      handlers.onAdvance,
      font,
    );
    this.afterPage = new AlertAfterPage(
      this.root,
      widthCm,
      { title: opts.title, simNote: opts.simNote, after: opts.after, source: opts.source, sendLabel: opts.sendLabel, safeLabel: opts.safeLabel },
      handlers.onSend,
      handlers.onSafe,
      font,
    );
    this.setStage("during");
    this.setVisible(false);
  }

  bind(): void {
    this.duringPage.bind();
    this.afterPage.bind();
  }

  setVisible(visible: boolean): void {
    if (this.root.enabled !== visible) this.root.enabled = visible;
  }

  get visible(): boolean {
    return this.root.enabled;
  }

  anyHovered(): boolean {
    return this.duringPage.anyHovered() || this.afterPage.anyHovered();
  }

  /** The active stage's content height, so the Lens centres whichever page is showing. */
  get contentHeightCm(): number {
    return this.stage === "during" ? this.duringPage.contentHeightCm : this.afterPage.contentHeightCm;
  }

  get currentStage(): "during" | "after" {
    return this.stage;
  }

  setStage(stage: "during" | "after"): void {
    this.stage = stage;
    this.duringPage.setVisible(stage === "during");
    this.afterPage.setVisible(stage === "after");
  }

  setDistance(text: string): void {
    this.duringPage.setDistance(text);
  }

  setDetails(text: string): void {
    this.afterPage.setDetails(text);
  }

  setStatus(text: string): void {
    this.afterPage.setStatus(text);
  }
}
