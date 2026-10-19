// Label placement for an AR globe: continent, ocean, country and sea names that face the viewer,
// fade before the edge, never overlap each other or the selection, and grow in number as the
// globe grows. Pure functions; the Lens and the browser preview call layoutLabels() a few times
// per second and only apply its output. Candidate data: data/labels.ts (Natural Earth).

import { alignmentRotation, geoToCartesian, quatRotateVector } from "./geo.ts";
import type { Quat, Vec3 } from "./geo.ts";
import { greatCircleKm } from "./geolookup.ts";

export type LabelClass = "ocean" | "continent" | "country" | "sea";

export interface LabelCandidate {
  id: string;
  cls: LabelClass;
  /** English display text. */
  text: string;
  /** Optional Traditional Chinese text. */
  zht?: string | null;
  lat: number;
  lon: number;
  /** Natural Earth MIN_LABEL / MAX_LABEL: web-map zoom range in which the label is drawn. */
  minLabel: number;
  maxLabel: number;
  /** Lower is more important. */
  rank: number;
}

export interface LabelView {
  globeCentre: Vec3;
  /** World rotation of the globe content (spin x user manipulation). */
  globeRotation: Quat;
  /** World radius, including the user's scale. */
  globeRadius: number;
  eye: Vec3;
  worldUp?: Vec3;
}

/** A rectangle in view angles (degrees): x to the viewer's right, y up, centred on the globe. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelConfig {
  /** Anchor height above the surface, as a fraction of the radius (coastlines sit at 1.002). */
  liftFraction: number;
  /** Angular em height per class, degrees. Size 40 text at 100 cm is about 0.52 degrees. */
  emDeg: Record<LabelClass, number>;
  /** Added to the zoom equivalent: AR text is larger than web-map text, so fewer labels fit. */
  zoomBias: number;
  /** Degrees per display pixel. */
  pxDeg: number;
  /** Fade begins this far (degrees of arc on the globe) before the horizon... */
  fadeStartDeg: number;
  /** ...and is complete this far before it. */
  fadeEndDeg: number;
  /** Clear space around each label, in em. */
  paddingEm: number;
  /** Labels allowed per square degree of the globe's apparent disc... */
  densityPerDeg2: number;
  /** ...but never more than this at once. */
  maxLabels: number;
  /** Snap: in the near field "limit text and visual detail". */
  nearFieldCm: number;
  nearFieldMax: number;
  /** A label shown last time is treated as this many zoom levels more important (hysteresis). */
  incumbentBonus: number;
  /** A label stays at least this long once shown, unless it leaves the visible band. */
  minDwellS: number;
  /** Multiplies every label's brightness while a quake is selected. */
  selectionDim: number;
  language: "en" | "zht" | "both";
  /** Below this apparent globe radius (degrees) no labels are drawn: one label would cover the data. */
  minDiscRadiusDeg: number;
  /** A label's box must stay inside this fraction of the globe's outline (no labels on the rim). */
  insideDiscFraction: number;
  /** Boosted labels (places with recent quakes) are shown this many zoom levels earlier. */
  boostZoom: number;
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  liftFraction: 0.015,
  emDeg: { ocean: 0.6, continent: 0.6, country: 0.52, sea: 0.48 },
  zoomBias: -0.6,
  pxDeg: 0.0275,
  fadeStartDeg: 30,
  fadeEndDeg: 12,
  paddingEm: 0.3,
  densityPerDeg2: 0.15,
  maxLabels: 16,
  nearFieldCm: 60,
  nearFieldMax: 6,
  incumbentBonus: 0.5,
  minDwellS: 0.6,
  selectionDim: 0.5,
  language: "en",
  minDiscRadiusDeg: 4,
  insideDiscFraction: 0.95,
  boostZoom: 2.5,
};

const DEG = Math.PI / 180;
const CLASS_ORDER: Record<LabelClass, number> = { ocean: 0, continent: 1, country: 2, sea: 3 };

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function mul(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
function unit(a: Vec3): Vec3 {
  const l = len(a);
  return l > 0 ? mul(a, 1 / l) : { x: 0, y: 0, z: 0 };
}

/** Angular radius (degrees) of the globe's outline seen from `distance` (eye to centre). */
export function apparentRadiusDeg(globeRadius: number, distance: number): number {
  if (!(distance > globeRadius)) return 90;
  return Math.asin(globeRadius / distance) / DEG;
}

/**
 * The web-map zoom level whose scale matches the globe at the point facing the viewer, so
 * Natural Earth's MIN_LABEL / MAX_LABEL can be used directly. A web map at zoom z draws 360
 * degrees of longitude in 256 x 2^z pixels. Default globe (R 12 cm, d 100 cm): about 2.8.
 */
export function zoomEquivalent(globeRadius: number, distance: number, pxDeg: number): number {
  const gap = Math.max(distance - globeRadius, 1e-6);
  const pxPerDegreeOfArc = (globeRadius * DEG) / gap / (pxDeg * DEG);
  return Math.log2(pxPerDegreeOfArc / (256 / 360));
}

/** How many labels may be shown: by apparent disc area, the hard cap, and the near-field rule. */
export function labelBudget(globeRadius: number, distance: number, cfg: LabelConfig): number {
  const a = apparentRadiusDeg(globeRadius, distance);
  if (a < cfg.minDiscRadiusDeg) return 0;
  let n = Math.floor(cfg.densityPerDeg2 * a * a);
  n = Math.min(n, cfg.maxLabels);
  if (distance - globeRadius < cfg.nearFieldCm) n = Math.min(n, cfg.nearFieldMax);
  return Math.max(0, n);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Brightness factor for a surface point with outward unit normal `n`: 1 well inside the visible
 * cap, 0 near and beyond the horizon. The horizon is where cos(angle to the eye) = R / d.
 */
export function limbAlpha(n: Vec3, centre: Vec3, eye: Vec3, globeRadius: number, cfg: LabelConfig): number {
  const toEye = sub(eye, centre);
  const d = len(toEye);
  if (!(d > globeRadius)) return 0;
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(n, toEye) / d))) / DEG;
  const horizon = Math.acos(globeRadius / d) / DEG;
  return smoothstep(cfg.fadeEndDeg, cfg.fadeStartDeg, horizon - theta);
}

export interface ViewFrame {
  f: Vec3;
  r: Vec3;
  u: Vec3;
}

/** View axes centred on the globe: f from the eye to the centre, r to the right, u up (world up kept). */
export function viewFrame(eye: Vec3, centre: Vec3, worldUp: Vec3 = { x: 0, y: 1, z: 0 }): ViewFrame {
  const f = unit(sub(centre, eye));
  let r = cross(f, worldUp);
  if (len(r) < 1e-6) r = cross(f, { x: 0, y: 0, z: 1 });
  r = unit(r);
  return { f, r, u: cross(r, f) };
}

export function toViewAngles(frame: ViewFrame, eye: Vec3, p: Vec3): { x: number; y: number } {
  const v = sub(p, eye);
  const fz = dot(v, frame.f);
  return { x: Math.atan2(dot(v, frame.r), fz) / DEG, y: Math.atan2(dot(v, frame.u), fz) / DEG };
}

/** Rough advance widths in em for a sans-serif face; CJK glyphs are one em wide. */
export function estimateTextWidthEm(text: string, letterSpacingEm = 0): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x2e80) w += 1.0;
    else if (ch === " ") w += 0.28;
    else if (/[A-Z]/.test(ch)) w += 0.68;
    else if (/[a-z0-9]/.test(ch)) w += 0.54;
    else w += 0.32;
    w += letterSpacingEm;
  }
  return w;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Display text for a candidate, one string per line. Oceans and continents in capitals and
 * stacked on two lines ("PACIFIC" / "OCEAN"), as on printed maps.
 */
export function displayText(c: LabelCandidate, language: LabelConfig["language"]): string[] {
  let en = c.text;
  const big = c.cls === "ocean" || c.cls === "continent";
  if (big) en = en.toUpperCase();
  const sp = en.lastIndexOf(" ");
  const enLines = big && sp > 0 ? [en.slice(0, sp), en.slice(sp + 1)] : [en];
  if (language === "en" || !c.zht) return enLines;
  if (language === "zht") return [c.zht];
  return [big ? en : enLines[0], c.zht];
}

export interface PlacedLabel {
  id: string;
  cls: LabelClass;
  lines: string[];
  position: Vec3;
  /** World rotation: faces the eye, local +Y kept in the vertical plane (no roll). */
  rotation: Quat;
  /** Em height in world units at the label's distance (Lens Text size = emCm x 43.886). */
  emCm: number;
  /** Target brightness 0-1 (limb fade x selection dim); the renderer eases toward it. */
  alpha: number;
  box: Box;
}

/** Labels currently on screen and since when (seconds), carried from one layout to the next. */
export type LabelMemory = Map<string, number>;

export interface LayoutResult {
  placed: PlacedLabel[];
  memory: LabelMemory;
  zoom: number;
  budget: number;
  eligible: number;
}

interface Scored {
  c: LabelCandidate;
  position: Vec3;
  centre: { x: number; y: number };
  alpha: number;
  key: number;
  incumbent: boolean;
  locked: boolean;
  pinned: boolean;
}

function boxFor(c: LabelCandidate, lines: string[], at: { x: number; y: number }, cfg: LabelConfig, shrink = 1): Box {
  const em = cfg.emDeg[c.cls];
  const spacing = c.cls === "ocean" || c.cls === "continent" ? 0.12 : 0;
  const w = Math.max(...lines.map((l) => estimateTextWidthEm(l, spacing))) * em;
  const h = lines.length * 1.2 * em;
  const pad = cfg.paddingEm * em;
  const hw = (w / 2 + pad) * shrink;
  const hh = (h / 2 + pad) * shrink;
  return { x0: at.x - hw, y0: at.y - hh, x1: at.x + hw, y1: at.y + hh };
}

/**
 * Chooses which labels to show and where. Pinned ids (the user's home country) come first at any
 * size. Then greedy by importance: Natural Earth MIN_LABEL (lowered for boosted ids, the places
 * with strong quakes), then class (ocean, continent, country, sea), then rank, then closeness to
 * the centre of the disc. A label is accepted when its box clears every accepted box and every
 * obstacle (selected quake, its stem, a floating card). Labels shown recently are kept for
 * minDwellS and favoured afterwards, so labels do not flicker as the globe turns.
 */
export function layoutLabels(
  candidates: readonly LabelCandidate[],
  view: LabelView,
  cfg: LabelConfig,
  memory: LabelMemory,
  nowS: number,
  obstacles: Box[] = [],
  selectionActive = false,
  boosted: ReadonlySet<string> = new Set(),
  pinned: ReadonlySet<string> = new Set(),
): LayoutResult {
  const R = view.globeRadius;
  const d = len(sub(view.eye, view.globeCentre));
  const empty: LayoutResult = { placed: [], memory: new Map(), zoom: NaN, budget: 0, eligible: 0 };
  if (!(d > R * 1.05)) return empty;
  const zoom = zoomEquivalent(R, d, cfg.pxDeg) + cfg.zoomBias;
  const budget = labelBudget(R, d, cfg);
  if (budget === 0) return { ...empty, zoom };
  const frame = viewFrame(view.eye, view.globeCentre, view.worldUp);
  const rimDeg = apparentRadiusDeg(R, d) * cfg.insideDiscFraction;
  const insideRim = (b: Box): boolean =>
    Math.hypot(Math.max(Math.abs(b.x0), Math.abs(b.x1)), Math.max(Math.abs(b.y0), Math.abs(b.y1))) <= rimDeg;

  const toEyeU = unit(sub(view.eye, view.globeCentre));
  const scored: Scored[] = [];
  for (const c of candidates) {
    const isPinned = pinned.has(c.id);
    const minL = c.minLabel - (boosted.has(c.id) ? cfg.boostZoom : 0);
    if (!isPinned && (zoom < minL || zoom > c.maxLabel)) continue;
    const n = quatRotateVector(view.globeRotation, geoToCartesian(c.lat, c.lon, 1));
    const alpha = limbAlpha(n, view.globeCentre, view.eye, R, cfg);
    if (alpha < 0.02) continue;
    const position = add(view.globeCentre, mul(n, R * (1 + cfg.liftFraction)));
    const since = memory.get(c.id);
    const incumbent = since !== undefined;
    const locked = incumbent && nowS - (since as number) < cfg.minDwellS;
    const offCentreDeg = Math.acos(Math.max(-1, Math.min(1, dot(n, toEyeU)))) / DEG;
    const key = (minL - (incumbent ? cfg.incumbentBonus : 0)) * 1e6 + CLASS_ORDER[c.cls] * 1e4 + c.rank * 1e2 + offCentreDeg / 10;
    scored.push({ c, position, centre: toViewAngles(frame, view.eye, position), alpha, key, incumbent, locked, pinned: isPinned });
  }
  // Pinned labels first, then locked ones so a just-shown label is not displaced; the id breaks
  // ties deterministically.
  scored.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || Number(b.locked) - Number(a.locked) || a.key - b.key || (a.c.id < b.c.id ? -1 : 1),
  );

  const placed: PlacedLabel[] = [];
  const shownText = new Set<string>();
  const next: LabelMemory = new Map();
  const dim = selectionActive ? cfg.selectionDim : 1;
  for (const s of scored) {
    if (placed.length >= budget) break;
    const lines = displayText(s.c, cfg.language);
    const textKey = lines.join("\n");
    // The same words twice (North and South Pacific) read as an error: keep the first.
    if (shownText.has(textKey)) continue;
    const test = boxFor(s.c, lines, s.centre, cfg, s.incumbent ? 0.85 : 1);
    const clear = insideRim(test) && !obstacles.some((o) => boxesOverlap(test, o)) && !placed.some((p) => boxesOverlap(test, p.box));
    if (!clear) continue;
    shownText.add(textKey);
    const distEye = len(sub(s.position, view.eye));
    placed.push({
      id: s.c.id,
      cls: s.c.cls,
      lines,
      position: s.position,
      rotation: alignmentRotation(sub(view.eye, s.position)),
      emCm: Math.tan(cfg.emDeg[s.c.cls] * DEG) * distEye,
      alpha: s.alpha * dim,
      box: boxFor(s.c, lines, s.centre, cfg),
    });
    next.set(s.c.id, s.incumbent ? (memory.get(s.c.id) as number) : nowS);
  }
  return { placed, memory: next, zoom, budget, eligible: scored.length };
}

/**
 * Countries to boost: those whose label point lies within `radiusKm` of a quake of at least
 * `minMag` in the current window, so places with strong quakes get named even on a small globe.
 * Keep it selective: with M4.5 and 600 km, the 30-day snapshot boosts about 60 countries.
 */
export function activeLabelIds(
  candidates: readonly LabelCandidate[],
  quakes: readonly { lat: number; lon: number; mag: number }[],
  radiusKm = 300,
  minMag = 5.5,
): Set<string> {
  const strong = quakes.filter((q) => q.mag >= minMag);
  const out = new Set<string>();
  for (const c of candidates) {
    if (c.cls !== "country") continue;
    for (const q of strong) {
      if (greatCircleKm(c.lat, c.lon, q.lat, q.lon) <= radiusKm) {
        out.add(c.id);
        break;
      }
    }
  }
  return out;
}

/** The country label nearest to a point (for pinning the user's home country). */
export function nearestCountryLabelId(candidates: readonly LabelCandidate[], lat: number, lon: number): string | null {
  let best = Infinity;
  let id: string | null = null;
  for (const c of candidates) {
    if (c.cls !== "country") continue;
    const d = greatCircleKm(lat, lon, c.lat, c.lon);
    if (d < best) {
      best = d;
      id = c.id;
    }
  }
  return id;
}

/**
 * Obstacle for the selected quake: a square around its epicentre ring plus the depth stem
 * (surface point to marker), in view angles, with a margin. Labels never cover the selection.
 */
export function selectionObstacle(
  frame: ViewFrame,
  eye: Vec3,
  surfacePoint: Vec3,
  markerPoint: Vec3,
  ringRadiusWorld: number,
  marginDeg = 0.4,
): Box {
  const a = toViewAngles(frame, eye, surfacePoint);
  const b = toViewAngles(frame, eye, markerPoint);
  const ringDeg = Math.atan(ringRadiusWorld / len(sub(surfacePoint, eye))) / DEG;
  return {
    x0: Math.min(a.x - ringDeg, b.x) - marginDeg,
    y0: Math.min(a.y - ringDeg, b.y) - marginDeg,
    x1: Math.max(a.x + ringDeg, b.x) + marginDeg,
    y1: Math.max(a.y + ringDeg, b.y) + marginDeg,
  };
}
