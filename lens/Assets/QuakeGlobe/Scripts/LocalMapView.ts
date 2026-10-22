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

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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

    const ringW = R * RING_WIDTH_F;
    map.ringsKm.forEach((km, i) => {
      const r = km * cmPerKm;
      meshAt("Map ring " + i, buildRing(r - ringW / 2, r + ringW / 2, 128), RING_COLOR, 0, 0, Z_RINGS);
    });
    flatRibbonMeshes(map.coast, cmPerKm, R * COAST_WIDTH_F, Z_COAST).forEach((m, i) => mesh("Map coast " + i, m, COASTLINE_COLOR));
    flatRibbonMeshes(map.plates, cmPerKm, R * PLATE_WIDTH_F, Z_PLATES).forEach((m, i) => mesh("Map plates " + i, m, PLATE_COLOR));
    // The home-epicentre line, dashed and in the distance label's warm (checking-the-map note
    // 2026-10-22): solid and cool it read as part of the coastline. The dash count is rounded so
    // a dash ends exactly at each end: the ends stay at home and the epicentre. For a line shorter
    // than one dash-gap period the count falls to 1 and the line is simply solid.
    {
      const lineLen = Math.hypot(ex, ey);
      const dashes: number[][] = [];
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
      flatRibbonMeshes(dashes, 1, R * LINE_WIDTH_F, Z_LINE).forEach((m, i) => mesh("Map home line " + i, m, DISTANCE_COLOR));
    }

    meshAt("Map home marker", buildOctahedron(R * HOME_OCTA_F), HOME_COLOR, 0, 0, Z_MARKERS);
    meshAt("Map home ring", buildRing(R * HOME_RING_INNER_F, R * HOME_RING_OUTER_F, 64), HOME_COLOR, 0, 0, Z_MARKERS);
    meshAt("Map epicentre marker", buildOctahedron(R * EPI_OCTA_F), epicentreRgb, ex, ey, Z_MARKERS);
    meshAt("Map epicentre ring", buildRing(R * EPI_RING_INNER_F, R * EPI_RING_OUTER_F, 64), EPICENTER_COLOR, ex, ey, Z_MARKERS, true);

    // --- labels -----------------------------------------------------------
    // Obstacles no label may cover: the two markers and the home-epicentre line (design brief).
    const taken: Box[] = [];
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
    };

    // Ring labels sit just inside each ring at its top; the "N" sits just outside the outer ring,
    // so the two never collide. These are fixed landmarks: they are placed first and never move.
    map.ringsKm.forEach((km) => {
      const text = ringLabel(km);
      const hw = halfWidthCm(text, RING_LABEL_SIZE);
      const hh = halfHeightCm(RING_LABEL_SIZE);
      addText("Map ring label", text, RING_LABEL_SIZE, RING_LABEL_COLOR, boxAt(0, km * cmPerKm - 0.2 - hh, hw, hh));
    });
    {
      const hw = halfWidthCm("N", NORTH_SIZE);
      const hh = halfHeightCm(NORTH_SIZE);
      addText("Map north label", "N", NORTH_SIZE, RING_LABEL_COLOR, boxAt(0, R + 0.25 + hh, hw, hh));
    }

    // The distance label ("15 km S") belongs to the epicentre: beside its ring, flipping through
    // right / left / below / above until it is clear of the rim, the line and what is placed.
    const distanceText = formatKm(map.epicentre.km) + " " + map.epicentre.compass;
    this.placeFloating("Map distance label", distanceText, DISTANCE_SIZE, DISTANCE_COLOR, ex, ey, epiR, fits, boxAt, addText);

    // The home label ("Home · Hualien") beside the centre marker, same fallback order.
    const homeText = map.homePlace.length > 0 ? "Home · " + map.homePlace : "Home";
    this.placeFloating("Map home label", homeText, HOME_LABEL_SIZE, HOME_COLOR, 0, 0, homeR, fits, boxAt, addText);

    // Place names, small; a place whose label fits nowhere is dropped rather than overlapped.
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
      for (const [cx, cy] of candidates) {
        const b = boxAt(cx, cy, hw, hh);
        if (fits(b, true)) {
          addText("Map place label", p.name, PLACE_SIZE, PLACE_COLOR, b);
          break;
        }
      }
    }
  }

  /** A label tied to a point: try right, left, below, above of it; accept right as a last resort. */
  private placeFloating(
    name: string,
    text: string,
    size: number,
    rgb: [number, number, number],
    x: number,
    y: number,
    clearance: number,
    fits: (b: Box, insideRim: boolean) => boolean,
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
    for (const [cx, cy] of candidates) {
      const b = boxAt(cx, cy, hw, hh);
      if (fits(b, true)) {
        addText(name, text, size, rgb, b);
        return;
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
