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
export const PADDING_CM = 1.2;
/**
 * Side-card buttons are full width (one per row) so no label wraps - "Send to emergency contacts"
 * fit in a half-width button before. A taller button also reads better from a standing distance.
 */
const SIDE_BUTTON_H = 4.4;
/** Vertical gap between stacked full-width buttons. */
const BUTTON_STACK_GAP = 1.4;
const BODY: [number, number, number] = [0.92, 0.96, 1.0];
const MUTED: [number, number, number] = [0.62, 0.72, 0.82];
const TITLE: [number, number, number] = [0.78, 0.9, 1.0];
/** Alert accents are warm so the card reads as urgent without a saturated fill or an emergency-red banner. */
const WARN: [number, number, number] = [1.0, 0.76, 0.4];
const GUIDE: [number, number, number] = [1.0, 0.95, 0.85];
/**
 * The "Guidance: ..." source line on both alert stages. MUTED grey was hard to read at full view
 * (committee's second review 2026-10-21); on the additive display brightness is visibility, so
 * this is light, not grey, while staying visibly dimmer than BODY so it reads as secondary.
 */
const SOURCE: [number, number, number] = [0.82, 0.88, 0.96];

/** Height of `lines` lines of world-space text at `size` (matches LensUi/QuakeGlobeLens). */
function textHeightCm(size: number, lines: number): number {
  return (size / 43.886) * 1.25 * lines;
}

/**
 * Conservative width of one character as a fraction of the text size, in centimetres
 * (cm = CHAR_W * size * chars). Deliberately a touch wide so a wrap we compute here never falls
 * short of what the font actually does, which would overflow the lines we reserve for it.
 */
const CHAR_W = 0.014;

/**
 * Greedily wrap `text` so no line exceeds `maxChars`. Used for the big headline: it is shown about
 * twice the body size, so on a narrow card "Drop, Cover, Hold On" must break across lines - wrapping
 * it here (and reserving exactly the resulting line count) keeps it from spilling over the content
 * below, whatever the font's exact metrics.
 */
function wrapToLines(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur.length === 0 ? w : cur + " " + w;
    if (candidate.length > maxChars && cur.length > 0) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines.length > 0 ? lines : [text];
}

/** Characters that fit on one line of `size` text across `widthCm`, by the conservative CHAR_W. */
function charsPerLine(widthCm: number, size: number): number {
  return Math.max(4, Math.floor(widthCm / (CHAR_W * size)));
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
    this.title = this.line("Title", 50, TITLE, 1);
    this.title.text = "Quake details";
    // Seven lines: magnitude/depth, coordinates, place (may wrap), time, and the nearest plate
    // boundary (which can wrap to two lines).
    this.body = this.line("Body", 44, BODY, 7);
    this.gap(0.6);
    const h = SIDE_BUTTON_H;
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
  private readonly setHomeButton: PanelButton;
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
    this.line("Title", 48, TITLE, 1).text = "Earthquake alert";
    this.line("Hint", 36, MUTED, 2).text = "Mark home and a " + spot + ", then fire the simulated alert.";
    this.gap(0.5);
    const h = SIDE_BUTTON_H;
    const gapY = BUTTON_STACK_GAP;
    let row = this.y - h / 2;
    this.add(new PanelButton(this.root, "Phone alert received", new vec3(0, row, 0), widthCm, h, false, handlers.onAlert, font));
    row -= h + gapY;
    // "Set home" and "Set as home" share one full-width row: exactly one shows at a time
    // (setConfirmHomeVisible), so the card stays full width with no empty slot. "Set home" enters
    // set-home mode; once a point on the globe is picked the Lens swaps in "Set as home" to confirm.
    this.setHomeButton = new PanelButton(this.root, "Set home", new vec3(0, row, 0), widthCm, h, false, handlers.onSetHome, font);
    this.add(this.setHomeButton);
    this.confirmHomeButton = new PanelButton(this.root, "Set as home", new vec3(0, row, 0), widthCm, h, false, handlers.onConfirmHome, font);
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

  /**
   * "Set as home" appears only once a point on the globe has been picked (design brief). It shares a
   * row with "Set home", so showing one hides the other.
   */
  setConfirmHomeVisible(visible: boolean): void {
    if (this.confirmHomeButton.sceneObject.enabled !== visible) this.confirmHomeButton.sceneObject.enabled = visible;
    if (this.setHomeButton.sceneObject.enabled === visible) this.setHomeButton.sceneObject.enabled = !visible;
  }
}

/** Stage one ("during"): headline, the "during" lines, the glanceable distance, SIMULATION, and
 * the single "Shaking stopped" button. Nothing else needs a gesture while the ground shakes.
 *
 * The card took the panel's place below the globe (video review 2026-10-21), so it is the panel's
 * width and ~1 m from the viewer; every size here is chosen to read in a 1080p screen recording
 * from that distance, with the headline clearly the biggest thing on the card (one line at the
 * panel width). */
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
    // The headline leads the card and is by far the biggest text. At the panel width it fits on
    // one line; wrapToLines still guards the layout if a longer hazard headline ever wraps.
    const headlineSize = 100;
    const headlineLines = wrapToLines(opts.headline, charsPerLine(widthCm, headlineSize));
    this.line("Headline", headlineSize, GUIDE, headlineLines.length, true).text = headlineLines.join("\n");
    this.gap(0.5);
    this.line("During", 54, BODY, Math.max(1, opts.during.length)).text = opts.during.join("\n");
    this.gap(0.25);
    this.distanceText = this.line("Distance", 58, WARN, 1);
    this.line("Sim note", 46, WARN, 1).text = opts.simNote;
    this.line("Source", 38, SOURCE, 2).text = opts.source;
    this.gap(0.6);
    const h = 5;
    const row = this.y - h / 2;
    this.advanceButton = new PanelButton(this.root, opts.advanceLabel, new vec3(0, row, 0), widthCm, h, false, onAdvance, font, 44);
    this.buttons.push(this.advanceButton);
    this.y = row - h / 2;
    this.finishPlate();
  }

  setDistance(text: string): void {
    setText(this.distanceText, text);
  }
}

/** Stage two ("after"): the event details, the "after" guidance, SIMULATION, the send result, and
 * the "Send to emergency contacts" and "I'm safe" buttons.
 *
 * Like the "during" page, this page is the panel's width below the globe. The two buttons share
 * one row (half width each): at the panel width neither label wraps — the one-line-label rule
 * that made the old narrow side cards go full width — and the single row keeps this dense page
 * short enough to stay inside the view from the default camera. */
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
    this.line("Title", 52, TITLE, 1).text = opts.title;
    this.line("Sim note", 46, WARN, 1).text = opts.simNote;
    this.gap(0.3);
    // Five detail items: magnitude (both scales), depth with source, local time, place, nearest
    // boundary; only the boundary wraps at this width, so reserve six lines.
    this.detailsText = this.line("Details", 42, BODY, 6);
    this.gap(0.2);
    this.line("After", 44, GUIDE, Math.max(1, opts.after.length) + 1).text = opts.after.join("\n");
    this.line("Source", 38, SOURCE, 2).text = opts.source;
    this.statusText = this.line("Status", 44, WARN, 1);
    this.gap(0.5);
    const h = 4.6;
    const w2 = (widthCm - BUTTON_STACK_GAP) / 2;
    const row = this.y - h / 2;
    this.sendButton = new PanelButton(this.root, opts.sendLabel, new vec3(-widthCm / 2 + w2 / 2, row, 0), w2, h, false, onSend, font, 36);
    this.safeButton = new PanelButton(this.root, opts.safeLabel, new vec3(widthCm / 2 - w2 / 2, row, 0), w2, h, false, onSafe, font, 36);
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
  private readonly widthCm: number;
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
    this.widthCm = widthCm;
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

  /**
   * The active stage's backplate rectangle in the card root's local frame (matches finishPlate:
   * the plate reaches 1.5 paddings above the content top and half a padding below its bottom).
   * The overlay projects it into the view to keep the off-view arrow clear of the card.
   */
  get plateRect(): { halfWidthCm: number; topCm: number; bottomCm: number } {
    return {
      halfWidthCm: this.widthCm / 2 + PADDING_CM,
      topCm: 1.5 * PADDING_CM,
      bottomCm: -this.contentHeightCm - PADDING_CM / 2,
    };
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
