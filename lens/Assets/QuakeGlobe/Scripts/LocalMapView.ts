// The alert's map of your area (design brief, learner's own review 2026-10-22).
//
// A flat disc in the globe's place: same centre, the globe's radius in cm standing for the map's
// radiusKm, facing the viewer, north up and east to the right, so every distance from home on it
// is true (the content comes from Core/localmap's azimuthal equidistant projection). It shows the
// land as a faint tint under everything (the sea stays clear: on an additive display it is simply
// not drawn), the three distance rings with their labels and a small "N", the coastline in the
// globe's coastline colour, the plate boundaries in the globe's quiet plate colour, home at the
// centre, the epicentre in the quake's red with a pulsing ring, the home-to-epicentre line as a
// warm dashed line with the distance and direction ("15 km S"), and the nearby place names. No live quakes: the alert replays a 2024
// event, and today's quakes on the same map would mix two times.
//
// The display is additive, so every mesh uses the additive glow material (light on dark, no dark
// backplate) and fading is done by scaling colours toward black. Meshes lie in the root's XY plane
// at small +Z offsets toward the viewer so nothing z-fights. The EmergencyOverlay owns the alert
// lifecycle: it builds the map when the alert opens, billboards the root each frame, and drives
// the zoom through setTransition/applyFade.
//
// Labels never overlap one another, the markers or the home-epicentre line: every label is placed
// against the boxes already on the map, falling back through candidate offsets; a place name that
// fits nowhere is dropped (the rings and markers matter more than a sixth town).
//
// Lines and labels keep out of each other's way (narrated-cut review 2026-10-22): every label
// first looks for a spot where no coastline, plate line or ring crosses its box (ring labels walk
// around their ring; the floating labels fall through their candidates), and wherever a line still
// crosses a label's final box, a gap is cut in the line under the box with a small margin. The
// rings are drawn as polylines rather than annulus meshes so they can carry such gaps. The
// coastline is also left out within a margin of the home-epicentre segment, so the warm dashes
// never add into the white coast on the additive display; the land tint still shows where the
// coast is. The final drawn geometry is published in LocalMapView.lastBuildDebug for the LEAF
// checks.

import type { LocalMap, LocalMesh } from "../Core/localmap";
import { ringLabel } from "../Core/localmap";
import { estimateTextWidthEm } from "../Core/labels";
import type { TriangleMesh } from "../Core/markers";
import { buildOctahedron, buildRing } from "../Core/shapes";
import { COASTLINE_COLOR, EPICENTER_COLOR } from "../Core/style";
import { createEmptyObject, createMeshObject, glowMaterial, toLensQuat, triangleRenderMesh } from "./LensRender";
import { createText } from "./LensUi";
import type { Quat } from "../Core/geo";

// Quiet reference colours. The rings sit between the graticule and the coastline in brightness;
// the plate colour matches QuakeGlobeLens.PLATE_LINE_COLOR, the home colour matches
// EmergencyOverlay's HOME_COLOR, the place colour matches MapLabels' land colour and the distance
// label's warm matches the old on-globe epicentre label. The home-epicentre line shares the
// distance label's warm and is dashed, so it cannot read as part of the cool coastline (checking-
// the-map note 2026-10-22). The land tint is a dim fill in the coastline's cool family: visible
// as land in a 1080p recording, clearly quieter than every line and label on the map. The quakes
// stay the only saturated colour: the epicentre marker's red is passed in by the overlay.
const LAND_COLOR: [number, number, number] = [0.1, 0.14, 0.18];
const RING_COLOR: [number, number, number] = [0.45, 0.58, 0.72];
const RING_LABEL_COLOR: [number, number, number] = [0.72, 0.82, 0.92];
const PLATE_COLOR: [number, number, number] = [0.52, 0.44, 0.66];
const HOME_COLOR: [number, number, number] = [0.5, 0.9, 1.0];
const PLACE_COLOR: [number, number, number] = [0.95, 0.94, 0.86];
const DISTANCE_COLOR: [number, number, number] = [1.0, 0.85, 0.6];

// Line widths and marker sizes as fractions of the map radius, so the map scales as one piece.
const RING_WIDTH_F = 0.004;
const COAST_WIDTH_F = 0.008;
const PLATE_WIDTH_F = 0.005;
const LINE_WIDTH_F = 0.008;
/** The home-epicentre line's dashes: nominal dash and gap lengths as fractions of the map radius. */
const LINE_DASH_F = 0.045;
const LINE_GAP_F = 0.03;
const HOME_OCTA_F = 0.035;
const HOME_RING_INNER_F = 0.052;
const HOME_RING_OUTER_F = 0.062;
const EPI_OCTA_F = 0.04;
const EPI_RING_INNER_F = 0.075;
const EPI_RING_OUTER_F = 0.09;

// Z offsets toward the viewer (cm): the land tint under plates under coast under rings under the
// line under markers, labels on top. All materials are additive and non-depth-writing, so these
// only fix draw order against the text's depth test.
const Z_LAND = 0.01;
const Z_PLATES = 0.02;
const Z_COAST = 0.06;
const Z_RINGS = 0.1;
const Z_LINE = 0.14;
const Z_MARKERS = 0.2;
const Z_LABELS = 0.3;

// Text sizes (Lens Text units; em height = size / 43.886 cm), chosen to read in a 1080p recording
// from the default ~1 m: ring labels and place names like the panel's status lines, the home label
// like the body, the distance label the biggest thing on the map after the rings.
const RING_LABEL_SIZE = 36;
const NORTH_SIZE = 40;
const HOME_LABEL_SIZE = 44;
const DISTANCE_SIZE = 54;
const PLACE_SIZE = 36;
const EM_CM = 1 / 43.886;
/** Minimum clear space between any two label boxes, and around markers and the line (cm). */
const LABEL_MARGIN_CM = 0.25;
/** Candidate directions around a ring for its label, degrees from east; the top is tried first. */
const RING_LABEL_ANGLES = [90, 110, 70, 130, 50, 150, 30, 170, 10, 190, 350, 210, 330, 230, 310, 250, 290, 270];
/** Segments per full circle when a ring is drawn (as a polyline, so a label can cut a gap in it). */
const RING_SEGMENTS = 160;
/**
 * The coastline keeps this share of the map radius clear of the home-epicentre segment on each
 * side - 0.3 cm on the default map (globe radius 12 cm), scaling with the map's size - so the
 * warm dashes never add into the white coast (narrated-cut review 2026-10-22). The drawn lines'
 * half widths are added on top, so the margin holds between the ribbons' edges too.
 */
const SEGMENT_CLEAR_F = 0.025;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One drawn line layer of the map: its final cut centre-line polylines (content frame, cm). */
export interface MapLineDebug {
  kind: "coast" | "plate" | "ring" | "dash";
  halfWidthCm: number;
  polylines: number[][];
}

/** What the last build() actually drew, in the map content's frame (cm); the LEAF checks read it. */
export interface MapBuildDebug {
  radiusCm: number;
  epicentreCm: { x: number; y: number };
  /** Margin the drawn coastline keeps to the home-epicentre segment (centre line to segment). */
  segmentClearCm: number;
  labels: { name: string; text: string; box: Box }[];
  lines: MapLineDebug[];
}

function boxesIntersect(a: Box, b: Box, margin: number): boolean {
  return a.x0 - margin < b.x1 && b.x0 - margin < a.x1 && a.y0 - margin < b.y1 && b.y0 - margin < a.y1;
}

function halfWidthCm(text: string, size: number): number {
  return (estimateTextWidthEm(text) * size * EM_CM) / 2;
}

function halfHeightCm(size: number): number {
  return (1.2 * size * EM_CM) / 2;
}

/** A closed circle about the origin as a flat [x, y, ...] polyline (first point repeated last). */
function circlePolyline(r: number, segments: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    out.push(r * Math.cos(a), r * Math.sin(a));
  }
  return out;
}

function scalePolylines(polylines: readonly number[][], scale: number): number[][] {
  return polylines.map((line) => line.map((v) => v * scale));
}

/** Merge overlapping [t0, t1] intervals; the input is sorted in place. */
function mergeIntervals(cuts: [number, number][]): [number, number][] {
  cuts.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const c of cuts) {
    const last = out.length > 0 ? out[out.length - 1] : null;
    if (last !== null && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]);
    else out.push([c[0], c[1]]);
  }
  return out;
}

/** The [t0, t1] part of segment p + t*d (t in 0..1) inside `b` grown by `pad`, or null (Liang-Barsky). */
function boxCutInterval(px: number, py: number, dx: number, dy: number, b: Box, pad: number): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [px, dx, b.x0 - pad, b.x1 + pad],
    [py, dy, b.y0 - pad, b.y1 + pad],
  ];
  for (const [p, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return null;
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
    if (t0 >= t1) return null;
  }
  return [t0, t1];
}

/**
 * The parts of segment p0->p1 (as [t0, t1] intervals of it) within `dist` of segment a->b: the
 * interval through the capsule's rectangle plus the two end discs. Exact, so no sampling step can
 * leave a sliver of coastline inside the margin.
 */
function capsuleCutIntervals(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  dist: number,
): [number, number][] {
  const out: [number, number][] = [];
  const abx = bx - ax;
  const aby = by - ay;
  const len = Math.hypot(abx, aby);
  const dx = p1x - p0x;
  const dy = p1y - p0y;
  if (len > 1e-9) {
    // In the a->b frame: u along the segment, v across it; the rectangle is u in [0, len], |v| < dist.
    const ux = abx / len;
    const uy = aby / len;
    const u0 = (p0x - ax) * ux + (p0y - ay) * uy;
    const v0 = -(p0x - ax) * uy + (p0y - ay) * ux;
    const du = dx * ux + dy * uy;
    const dv = -dx * uy + dy * ux;
    const rect = boxCutInterval(u0, v0, du, dv, { x0: 0, y0: -dist, x1: len, y1: dist }, 0);
    if (rect !== null) out.push(rect);
  }
  const disc = (cx: number, cy: number): void => {
    const ex = p0x - cx;
    const ey = p0y - cy;
    const qa = dx * dx + dy * dy;
    const qb = 2 * (ex * dx + ey * dy);
    const qc = ex * ex + ey * ey - dist * dist;
    if (qa < 1e-12) {
      if (qc < 0) out.push([0, 1]);
      return;
    }
    const d2 = qb * qb - 4 * qa * qc;
    if (d2 <= 0) return;
    const s = Math.sqrt(d2);
    const t0 = Math.max(0, (-qb - s) / (2 * qa));
    const t1 = Math.min(1, (-qb + s) / (2 * qa));
    if (t0 < t1) out.push([t0, t1]);
  };
  disc(ax, ay);
  disc(bx, by);
  return out;
}

/**
 * Rebuilds polylines with cut intervals removed from every segment: `cutsFor` returns the
 * [t0, t1] parts of one segment to drop. A run that ends at a cut is flushed, so each kept piece
 * becomes its own polyline and the ribbons show real gaps.
 */
function cutPolylines(
  polylines: readonly number[][],
  cutsFor: (x0: number, y0: number, x1: number, y1: number) => [number, number][],
): number[][] {
  const out: number[][] = [];
  for (const line of polylines) {
    let run: number[] = [];
    const flush = (): void => {
      if (run.length >= 4) out.push(run);
      run = [];
    };
    for (let i = 0; i + 3 < line.length; i += 2) {
      const x0 = line[i];
      const y0 = line[i + 1];
      const x1 = line[i + 2];
      const y1 = line[i + 3];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const cuts = mergeIntervals(cutsFor(x0, y0, x1, y1).filter(([a, b]) => b - a > 1e-9));
      const kept: [number, number][] = [];
      let at = 0;
      for (const [c0, c1] of cuts) {
        if (c0 > at + 1e-9) kept.push([at, Math.min(1, c0)]);
        at = Math.max(at, Math.min(1, c1));
      }
      if (at < 1 - 1e-9) kept.push([at, 1]);
      if (kept.length === 0) {
        flush();
        continue;
      }
      for (let k = 0; k < kept.length; k++) {
        const [t0, t1] = kept[k];
        if (!(k === 0 && t0 <= 1e-9 && run.length >= 2)) {
          flush();
          run.push(x0 + dx * t0, y0 + dy * t0);
        }
        run.push(x0 + dx * t1, y0 + dy * t1);
        if (t1 < 1 - 1e-9) flush();
      }
    }
    flush();
  }
  return out;
}

/** True when any segment of `lines` comes within `pad` of box `b` (pad: half line width + margin). */
function lineCrossesBox(lines: readonly number[][], b: Box, pad: number): boolean {
  for (const line of lines) {
    for (let i = 0; i + 3 < line.length; i += 2) {
      if (boxCutInterval(line[i], line[i + 1], line[i + 2] - line[i], line[i + 3] - line[i + 1], b, pad) !== null) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Flat ribbons for polylines in the map's XY plane: each segment becomes a quad of `width`,
 * normal +Z, wound counter-clockwise seen from +Z (the face the viewer sees). Packs everything
 * into as few meshes as the 16-bit index limit allows.
 */
function flatRibbonMeshes(polylines: readonly number[][], scale: number, width: number, z: number): TriangleMesh[] {
  const out: TriangleMesh[] = [];
  let m: TriangleMesh = { positions: [], normals: [], indices: [] };
  const h = width / 2;
  for (const line of polylines) {
    for (let i = 0; i + 3 < line.length; i += 2) {
      const x0 = line[i] * scale;
      const y0 = line[i + 1] * scale;
      const x1 = line[i + 2] * scale;
      const y1 = line[i + 3] * scale;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      if (m.positions.length / 3 > 65000) {
        out.push(m);
        m = { positions: [], normals: [], indices: [] };
      }
      const px = (-dy / len) * h;
      const py = (dx / len) * h;
      const start = m.positions.length / 3;
      m.positions.push(x0 + px, y0 + py, z, x0 - px, y0 - py, z, x1 - px, y1 - py, z, x1 + px, y1 + py, z);
      m.normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
      m.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
  if (m.positions.length > 0) out.push(m);
  return out;
}

/**
 * The land tint as triangle meshes in the map's plane: Core/localmap's flat km triangles scaled to
 * cm at `z`, normal +Z (the triangles come counter-clockwise from the core's triangulation, the
 * face the viewer sees). Packs triangles into as few meshes as the 16-bit index limit allows,
 * remapping vertex indices per chunk.
 */
function landMeshes(land: LocalMesh, scale: number, z: number): TriangleMesh[] {
  const out: TriangleMesh[] = [];
  let m: TriangleMesh = { positions: [], normals: [], indices: [] };
  let remap = new Map<number, number>();
  for (let t = 0; t + 2 < land.indices.length; t += 3) {
    if (m.positions.length / 3 > 65000) {
      out.push(m);
      m = { positions: [], normals: [], indices: [] };
      remap = new Map<number, number>();
    }
    for (let k = 0; k < 3; k++) {
      const src = land.indices[t + k];
      let dst = remap.get(src);
      if (dst === undefined) {
        dst = m.positions.length / 3;
        remap.set(src, dst);
        m.positions.push(land.positions[2 * src] * scale, land.positions[2 * src + 1] * scale, z);
        m.normals.push(0, 0, 1);
      }
      m.indices.push(dst);
    }
  }
  if (m.indices.length > 0) out.push(m);
  return out;
}

export class LocalMapView {
  /** Final drawn geometry of the most recent build(), for the LEAF checks; null before any alert. */
  static lastBuildDebug: MapBuildDebug | null = null;

  private readonly parent: SceneObject;
  private readonly baseMaterial: Material;
  private readonly font?: Font;
  readonly root: SceneObject;
  private content: SceneObject | null = null;

  /** Everything that fades with the map: glow passes with their full-brightness colour. The
   * epicentre ring's entry is flagged and pulsed on top of the fade, like the globe's alert ring. */
  private passes: { pass: Pass; rgb: [number, number, number]; pulse: boolean }[] = [];
  private texts: { text: Text; rgb: [number, number, number] }[] = [];

  /** The epicentre's position on the map in cm, for the overlay's grow-from-the-epicentre pivot. */
  epicentreCm: { x: number; y: number } = { x: 0, y: 0 };
  radiusCm = 0;

  constructor(parent: SceneObject, baseMaterial: Material, font?: Font) {
    this.parent = parent;
    this.baseMaterial = baseMaterial;
    this.font = font;
    this.root = createEmptyObject("Local Map", parent);
    this.root.enabled = false;
  }

  /**
   * Rebuilds the whole map for one alert. `radiusCm` is the globe's radius: the disc takes the
   * globe's place at the globe's size. `epicentreRgb` is the simulated quake's marker colour.
   */
  build(map: LocalMap, radiusCm: number, epicentreRgb: [number, number, number]): void {
    if (this.content !== null) this.content.destroy();
    this.passes = [];
    this.texts = [];
    this.content = createEmptyObject("Local Map Content", this.root);
    this.radiusCm = radiusCm;

    const R = radiusCm;
    const cmPerKm = R / map.radiusKm;
    const ex = map.epicentre.x * cmPerKm;
    const ey = map.epicentre.y * cmPerKm;
    this.epicentreCm = { x: ex, y: ey };

    // --- meshes -----------------------------------------------------------
    const mesh = (name: string, m: TriangleMesh, rgb: [number, number, number]): void => {
      const material = glowMaterial(this.baseMaterial, rgb);
      createMeshObject(name, this.content!, triangleRenderMesh(m), material);
      this.passes.push({ pass: material.mainPass, rgb, pulse: false });
    };
    const meshAt = (name: string, m: TriangleMesh, rgb: [number, number, number], x: number, y: number, z: number, pulse = false): void => {
      const material = glowMaterial(this.baseMaterial, rgb);
      const visual = createMeshObject(name, this.content!, triangleRenderMesh(m), material);
      visual.getSceneObject().getTransform().setLocalPosition(new vec3(x, y, z));
      this.passes.push({ pass: material.mainPass, rgb, pulse });
    };

    // The land, a faint fill under everything in the map's plane; the sea is simply not drawn
    // (checking-the-map note 2026-10-22). Registered like every pass, so it fades and scales
    // with the rest of the map through the zoom.
    landMeshes(map.land, cmPerKm, Z_LAND).forEach((m, i) => mesh("Map land " + i, m, LAND_COLOR));

    // --- line geometry (centre lines, cm) ----------------------------------
    // Computed here, meshed only after the labels are placed: every label claims the first spot
    // where no line crosses its box, and any line that still must cross a label's final box gets
    // a gap cut under the box (narrated-cut review 2026-10-22). The rings are polylines, not
    // annulus meshes, for the same reason: a gap can be cut into a polyline.
    const rings: number[][] = map.ringsKm.map((km) => circlePolyline(km * cmPerKm, RING_SEGMENTS));
    // The coastline is left out within a margin of the home-epicentre segment (its clear margin
    // plus the two half line widths), so the warm dashes never add into the white coast; the land
    // tint still shows where the coast is (narrated-cut review 2026-10-22).
    const segmentClearCm = R * SEGMENT_CLEAR_F;
    const lineLen = Math.hypot(ex, ey);
    let coast = scalePolylines(map.coast, cmPerKm);
    if (lineLen > 1e-3) {
      const clear = segmentClearCm + (R * COAST_WIDTH_F) / 2 + (R * LINE_WIDTH_F) / 2;
      coast = cutPolylines(coast, (x0, y0, x1, y1) => capsuleCutIntervals(x0, y0, x1, y1, 0, 0, ex, ey, clear));
    }
    let plates = scalePolylines(map.plates, cmPerKm);
    // The home-epicentre line, dashed and in the distance label's warm (checking-the-map note
    // 2026-10-22): solid and cool it read as part of the coastline. The dash count is rounded so
    // a dash ends exactly at each end: the ends stay at home and the epicentre. For a line shorter
    // than one dash-gap period the count falls to 1 and the line is simply solid.
    let dashes: number[][] = [];
    if (lineLen > 1e-3) {
      const gap = R * LINE_GAP_F;
      const n = Math.max(1, Math.round((lineLen + gap) / (R * LINE_DASH_F + gap)));
      const period = (lineLen + gap) / n;
      const ux = ex / lineLen;
      const uy = ey / lineLen;
      for (let i = 0; i < n; i++) {
        const s0 = i * period;
        const s1 = s0 + period - gap;
        dashes.push([ux * s0, uy * s0, ux * s1, uy * s1]);
      }
    }

    meshAt("Map home marker", buildOctahedron(R * HOME_OCTA_F), HOME_COLOR, 0, 0, Z_MARKERS);
    meshAt("Map home ring", buildRing(R * HOME_RING_INNER_F, R * HOME_RING_OUTER_F, 64), HOME_COLOR, 0, 0, Z_MARKERS);
    meshAt("Map epicentre marker", buildOctahedron(R * EPI_OCTA_F), epicentreRgb, ex, ey, Z_MARKERS);
    meshAt("Map epicentre ring", buildRing(R * EPI_RING_INNER_F, R * EPI_RING_OUTER_F, 64), EPICENTER_COLOR, ex, ey, Z_MARKERS, true);

    // --- labels -----------------------------------------------------------
    // Obstacles no label may cover: the two markers and the home-epicentre line (design brief).
    // Each label also prefers the first candidate spot where no coastline, plate line or ring
    // crosses its box (narrated-cut review 2026-10-22); where no candidate is that clear, the
    // older rules alone choose the spot and the crossing lines get a gap cut under the box.
    const taken: Box[] = [];
    const placedLabels: { name: string; text: string; box: Box }[] = [];
    const homeR = R * HOME_RING_OUTER_F + 0.2;
    const epiR = R * EPI_RING_OUTER_F + 0.2;
    const markerBoxes: Box[] = [
      { x0: -homeR, y0: -homeR, x1: homeR, y1: homeR },
      { x0: ex - epiR, y0: ey - epiR, x1: ex + epiR, y1: ey + epiR },
    ];
    const clearOfLine = (b: Box): boolean => {
      // Sample the segment; a label box must keep LABEL_MARGIN_CM + half the line width clear.
      const pad = LABEL_MARGIN_CM + (R * LINE_WIDTH_F) / 2;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const sx = ex * t;
        const sy = ey * t;
        if (sx > b.x0 - pad && sx < b.x1 + pad && sy > b.y0 - pad && sy < b.y1 + pad) return false;
      }
      return true;
    };
    const fits = (b: Box, insideRim: boolean): boolean => {
      if (insideRim) {
        for (const [cx, cy] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]] as [number, number][]) {
          if (Math.hypot(cx, cy) > R * 0.99) return false;
        }
      }
      for (const t of taken) if (boxesIntersect(b, t, LABEL_MARGIN_CM)) return false;
      for (const mb of markerBoxes) if (boxesIntersect(b, mb, LABEL_MARGIN_CM)) return false;
      return clearOfLine(b);
    };
    const boxAt = (cx: number, cy: number, hw: number, hh: number): Box => ({ x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh });
    const addText = (name: string, text: string, size: number, rgb: [number, number, number], b: Box): void => {
      const t = createText(this.content!, name, new vec3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, Z_LABELS), {
        size,
        color: rgb,
        widthCm: (b.x1 - b.x0) + 4,
        heightCm: (b.y1 - b.y0) + 1,
        centered: true,
        font: this.font,
      });
      t.text = text;
      this.texts.push({ text: t, rgb });
      taken.push(b);
      placedLabels.push({ name, text, box: b });
    };

    // Line clearance for a label box: the box, grown by each line's half width plus the label
    // margin, is crossed by no coastline, plate line or ring. `skipRing` leaves out the ring a
    // ring label belongs to - it hugs its own ring by design, and the arc swinging past the box's
    // corners is its own, not a stray line through the text.
    const clearOfMapLines = (b: Box, skipRing = -1): boolean => {
      if (lineCrossesBox(coast, b, (R * COAST_WIDTH_F) / 2 + LABEL_MARGIN_CM)) return false;
      if (lineCrossesBox(plates, b, (R * PLATE_WIDTH_F) / 2 + LABEL_MARGIN_CM)) return false;
      for (let i = 0; i < rings.length; i++) {
        if (i !== skipRing && lineCrossesBox([rings[i]], b, (R * RING_WIDTH_F) / 2 + LABEL_MARGIN_CM)) return false;
      }
      return true;
    };

    // Each ring label walks around its ring from the top - hugging it from the inside, then from
    // the outside - to the first spot clear of the other labels, the markers, the line AND the
    // map's drawn lines (narrated-cut review 2026-10-22: the coastline ran through "10 km" and
    // "25 km" at the top). The top-inside spot stands as the last resort; any line still crossing
    // there gets a gap cut under the label. The "N" sits just outside the outer ring at the top.
    map.ringsKm.forEach((km, ringIndex) => {
      const text = ringLabel(km);
      const hw = halfWidthCm(text, RING_LABEL_SIZE);
      const hh = halfHeightCm(RING_LABEL_SIZE);
      const r = km * cmPerKm;
      const boxFor = (deg: number, outside: boolean): Box => {
        const a = (deg * Math.PI) / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        // The box's whole extent along the radial direction stays 0.3 cm off the ring's arc.
        const off = 0.3 + Math.abs(ca) * hw + Math.abs(sa) * hh;
        const c = outside ? r + off : r - off;
        return boxAt(ca * c, sa * c, hw, hh);
      };
      let box: Box | null = null;
      for (const requireClear of [true, false]) {
        for (const outside of [false, true]) {
          for (const deg of RING_LABEL_ANGLES) {
            const b = boxFor(deg, outside);
            if (fits(b, true) && (!requireClear || clearOfMapLines(b, ringIndex))) {
              box = b;
              break;
            }
          }
          if (box !== null) break;
        }
        if (box !== null) break;
      }
      addText("Map ring label", text, RING_LABEL_SIZE, RING_LABEL_COLOR, box !== null ? box : boxFor(90, false));
    });
    {
      const hw = halfWidthCm("N", NORTH_SIZE);
      const hh = halfHeightCm(NORTH_SIZE);
      addText("Map north label", "N", NORTH_SIZE, RING_LABEL_COLOR, boxAt(0, R + 0.25 + hh, hw, hh));
    }

    // The distance label ("15 km S") belongs to the epicentre: beside its ring, flipping through
    // right / left / below / above - first to a spot also clear of the map's drawn lines, then,
    // failing that, by the older rules alone (any crossing line then gets a gap under the label).
    const distanceText = formatKm(map.epicentre.km) + " " + map.epicentre.compass;
    this.placeFloating("Map distance label", distanceText, DISTANCE_SIZE, DISTANCE_COLOR, ex, ey, epiR, fits, clearOfMapLines, boxAt, addText);

    // The home label ("Home · Hualien") beside the centre marker, same fallback order.
    const homeText = map.homePlace.length > 0 ? "Home · " + map.homePlace : "Home";
    this.placeFloating("Map home label", homeText, HOME_LABEL_SIZE, HOME_COLOR, 0, 0, homeR, fits, clearOfMapLines, boxAt, addText);

    // Place names, small: clear spots first, then any spot the older rules allow; a place whose
    // label fits nowhere is dropped rather than overlapped.
    for (const p of map.places) {
      const hw = halfWidthCm(p.name, PLACE_SIZE);
      const hh = halfHeightCm(PLACE_SIZE);
      const px = p.x * cmPerKm;
      const py = p.y * cmPerKm;
      const candidates: [number, number][] = [
        [px, py + hh + 0.4],
        [px, py - hh - 0.4],
        [px + hw + 0.5, py],
        [px - hw - 0.5, py],
        [px, py],
      ];
      let placedBox: Box | null = null;
      for (const requireClear of [true, false]) {
        for (const [cx, cy] of candidates) {
          const b = boxAt(cx, cy, hw, hh);
          if (fits(b, true) && (!requireClear || clearOfMapLines(b))) {
            placedBox = b;
            break;
          }
        }
        if (placedBox !== null) break;
      }
      if (placedBox !== null) addText("Map place label", p.name, PLACE_SIZE, PLACE_COLOR, placedBox);
    }

    // --- gaps under the labels, then the line meshes ------------------------
    // Wherever a line would still run through a label's box, the line gives way, not the label:
    // the part of it inside the box, grown by the line's half width plus the label margin, is cut
    // out (narrated-cut review 2026-10-22). A label on a clear spot cuts nothing.
    const gapCut = (lines: number[][], halfWidth: number): number[][] => {
      const pad = halfWidth + LABEL_MARGIN_CM;
      return cutPolylines(lines, (x0, y0, x1, y1) => {
        const cuts: [number, number][] = [];
        for (const l of placedLabels) {
          const c = boxCutInterval(x0, y0, x1 - x0, y1 - y0, l.box, pad);
          if (c !== null) cuts.push(c);
        }
        return cuts;
      });
    };
    coast = gapCut(coast, (R * COAST_WIDTH_F) / 2);
    plates = gapCut(plates, (R * PLATE_WIDTH_F) / 2);
    const cutRings = rings.map((ring) => gapCut([ring], (R * RING_WIDTH_F) / 2));
    dashes = gapCut(dashes, (R * LINE_WIDTH_F) / 2);

    cutRings.forEach((ring, i) => flatRibbonMeshes(ring, 1, R * RING_WIDTH_F, Z_RINGS).forEach((m) => mesh("Map ring " + i, m, RING_COLOR)));
    flatRibbonMeshes(coast, 1, R * COAST_WIDTH_F, Z_COAST).forEach((m, i) => mesh("Map coast " + i, m, COASTLINE_COLOR));
    flatRibbonMeshes(plates, 1, R * PLATE_WIDTH_F, Z_PLATES).forEach((m, i) => mesh("Map plates " + i, m, PLATE_COLOR));
    flatRibbonMeshes(dashes, 1, R * LINE_WIDTH_F, Z_LINE).forEach((m, i) => mesh("Map home line " + i, m, DISTANCE_COLOR));

    // What was actually drawn, for the LEAF checks: final centre lines, boxes and the margin.
    const debugLines: MapLineDebug[] = [
      { kind: "coast", halfWidthCm: (R * COAST_WIDTH_F) / 2, polylines: coast },
      { kind: "plate", halfWidthCm: (R * PLATE_WIDTH_F) / 2, polylines: plates },
      { kind: "dash", halfWidthCm: (R * LINE_WIDTH_F) / 2, polylines: dashes },
    ];
    for (const r of cutRings) debugLines.push({ kind: "ring", halfWidthCm: (R * RING_WIDTH_F) / 2, polylines: r });
    LocalMapView.lastBuildDebug = {
      radiusCm: R,
      epicentreCm: { x: ex, y: ey },
      segmentClearCm,
      labels: placedLabels,
      lines: debugLines,
    };
  }

  /**
   * A label tied to a point: try right, left, below, above of it - first requiring a spot clear
   * of the map's drawn lines, then without that - and accept right as a last resort (any line
   * still crossing there gets a gap cut under the label).
   */
  private placeFloating(
    name: string,
    text: string,
    size: number,
    rgb: [number, number, number],
    x: number,
    y: number,
    clearance: number,
    fits: (b: Box, insideRim: boolean) => boolean,
    lineClear: (b: Box) => boolean,
    boxAt: (cx: number, cy: number, hw: number, hh: number) => Box,
    addText: (name: string, text: string, size: number, rgb: [number, number, number], b: Box) => void,
  ): void {
    const hw = halfWidthCm(text, size);
    const hh = halfHeightCm(size);
    const gap = 0.4;
    const candidates: [number, number][] = [
      [x + clearance + gap + hw, y],
      [x - clearance - gap - hw, y],
      [x, y - clearance - gap - hh],
      [x, y + clearance + gap + hh],
    ];
    for (const requireClear of [true, false]) {
      for (const [cx, cy] of candidates) {
        const b = boxAt(cx, cy, hw, hh);
        if (fits(b, true) && (!requireClear || lineClear(b))) {
          addText(name, text, size, rgb, b);
          return;
        }
      }
    }
    addText(name, text, size, rgb, boxAt(candidates[0][0], candidates[0][1], hw, hh));
  }

  setVisible(visible: boolean): void {
    if (this.root.enabled !== visible) this.root.enabled = visible;
  }

  get visible(): boolean {
    return this.root.enabled;
  }

  /** Face the viewer (north up): the overlay passes the same roll-free alignment the globe uses. */
  billboard(rotation: Quat): void {
    this.root.getTransform().setLocalRotation(toLensQuat(rotation));
  }

  /** The zoom's grow-from-the-epicentre pivot: scale plus an XY offset in the map's plane (cm). */
  setTransition(scale: number, offsetXCm: number, offsetYCm: number): void {
    if (this.content === null) return;
    const t = this.content.getTransform();
    t.setLocalScale(new vec3(scale, scale, scale));
    t.setLocalPosition(new vec3(offsetXCm, offsetYCm, 0));
  }

  /** Scale every colour by `fade` (additive display: darker is more transparent); pulse the ring. */
  applyFade(fade: number, ringPulse: number): void {
    const k = Math.max(0, Math.min(1, fade));
    for (const e of this.passes) {
      const p = e.pulse ? k * ringPulse : k;
      e.pass.baseColor = new vec4(e.rgb[0] * p, e.rgb[1] * p, e.rgb[2] * p, 1);
    }
    for (const e of this.texts) {
      e.text.textFill.color = new vec4(e.rgb[0] * k, e.rgb[1] * k, e.rgb[2] * k, 1);
    }
  }
}

/** "15 km", like Emergency.formatDistanceKm (kept local: Core may not import Scripts). */
function formatKm(km: number): string {
  return km < 10 ? km.toFixed(1) + " km" : Math.round(km) + " km";
}
