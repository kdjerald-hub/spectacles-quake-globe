// Live Quake Globe: Lens entry point.
//
// Setup: attach this component to an empty root-level SceneObject and assign an Unlit
// material to `baseMaterial`. Everything else (globe, quakes, panel, buttons) is built at
// runtime. See docs/SETUP_LENS_STUDIO.md.
//
// This file is a thin adapter. It fetches bytes, hands them to GlobeModel (core/model.ts,
// unit-tested) and draws what the model returns. It never decides what to show.

import { GlobeModel } from "../Core/model";
import { FOOTER_TEXT, GEOMETRY, INNER_GRID_DEPTH_KM, LENS_VERSION, SETTINGS, VIEWS, legendText } from "../Core/config";
import { feedUrl } from "../Core/usgs";
import type { FeedId, Quake } from "../Core/usgs";
import { graticule, polylinesToRibbonMeshes } from "../Core/lines";
import { buildEpicenterRing, buildHaloMesh, buildMarkerMeshes, highlightHalfSize } from "../Core/markers";
import { buildOctahedron, buildPrism, buildRing } from "../Core/shapes";
import { LINE_RADIUS_FACTOR } from "../Core/occluder";
import {
  ATMOSPHERE_RINGS,
  COASTLINE_COLOR,
  DEPTH_CLASSES,
  DEPTH_CLASS_COLORS,
  EPICENTER_COLOR,
  EPICENTER_PULSE,
  GRATICULE_COLOR,
  HALO_COLOR,
  HALO_PULSE,
  HIGHLIGHT_COLOR,
  INNER_GRID_COLOR,
  SELECTED_SCALE_PULSE,
  pulse,
} from "../Core/style";
import {
  alignmentRotation,
  depthToRadius,
  facingRotation,
  geoToCartesian,
  quakePosition,
  quatMultiply,
  quatSlerp,
  silhouetteScale,
  spinRotation,
} from "../Core/geo";
import type { Quat, Vec3 } from "../Core/geo";
import { COASTLINE_110M } from "../Data/coastline110m";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import {
  createEmptyObject,
  createMeshObject,
  fromLensVec,
  glowMaterial,
  tintedMaterial,
  toLensQuat,
  toLensVec,
  triangleRenderMesh,
} from "./LensRender";
import { PanelButton, createBackplate, createText, setText } from "./LensUi";

const CACHE_PREFIX = "quakeglobe.feed.v1.";
const CACHE_SAVE_INTERVAL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_SECONDS = 20;

// Panel layout in centimetres, sized for the default 100 cm viewing distance:
// buttons at least 2 degrees tall with 1 degree gaps (Snap's minimum target size and spacing).
const PANEL_WIDTH_CM = 30;
const PANEL_GAP_CM = 2.5;
const PANEL_PADDING_CM = 1.2;
const BUTTON_HEIGHT_CM = 3.6;
const BUTTON_GAP_CM = 1.8;
const LINE_GAP_CM = 0.25;
const MUTED: [number, number, number] = [0.62, 0.72, 0.82];
const BODY: [number, number, number] = [0.92, 0.96, 1.0];

/** Height of `lines` lines of world-space text at `size` (em = size / 43.886 cm, 1.25 leading). */
function textHeightCm(size: number, lines: number): number {
  return (size / 43.886) * 1.25 * lines;
}

function scaled(rgb: [number, number, number], k: number): vec4 {
  return new vec4(rgb[0] * k, rgb[1] * k, rgb[2] * k, 1);
}

interface PanelTexts {
  status: Text;
  count: Text;
  activity: Text;
  detail: Text;
  legend: Text;
}

@component
export class QuakeGlobeLens extends BaseScriptComponent {
  /** An Unlit material. It is cloned and tinted for every part of the globe. */
  @input
  baseMaterial!: Material;

  /** Optional: the template's "Camera Object". When empty, the Interaction Kit's camera is used. */
  @input
  @allowUndefined
  cameraObject!: SceneObject;

  /** Optional font for every label (for example a Google Font imported with Lens Studio). */
  @input
  @allowUndefined
  font!: Font;

  @input
  globeRadiusCm: number = 12;

  /** Distance from the eyes at start. 100 cm keeps globe and panel inside the field of view. */
  @input
  distanceCm: number = 100;

  /**
   * Height of the globe's centre relative to the eyes at start. Measured in the SPECS 27
   * Preview: at 100 cm, -8 cm centres the globe and the panel below it in the display.
   */
  @input
  heightOffsetCm: number = -8;

  private internetModule: InternetModule = require("LensStudio:InternetModule");
  private model = new GlobeModel();
  private online = true;
  private placed = false;
  private inflight: Record<string, boolean> = {};
  private timers: Record<string, DelayedCallbackEvent> = {};
  private lastSavedMs: Record<string, number> = {};
  private finishedEvents: SceneEvent[] = [];

  private handle!: SceneObject;
  private content!: SceneObject;
  private atmosphere!: SceneObject;
  private panel!: SceneObject;
  private highlight!: SceneObject;
  private highlightVisual!: RenderMeshVisual;
  private stemVisual!: RenderMeshVisual;
  private haloVisual!: RenderMeshVisual;
  private haloMaterial!: Material;
  private epicenterVisual!: RenderMeshVisual;
  private epicenterMaterial!: Material;
  private markerVisuals: Record<string, RenderMeshVisual> = {};
  private texts!: PanelTexts;
  private buttons: PanelButton[] = [];
  private viewButtons: Record<string, PanelButton> = {};
  private spinButton!: PanelButton;

  private renderedVersion = -1;
  private haloKey = "";
  private selectedId = "";
  private selectionTarget: Quat | null = null;
  private current: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private spinDeg = 200; // start with the Pacific facing the viewer
  private elapsed = 0;
  private sinceRender = 0;

  onAwake(): void {
    print("Lens Opened: v" + LENS_VERSION);
    this.buildGlobe();
    this.buildPanel();
    // Hidden until placed: the root starts wherever it was left in the scene, often at the
    // camera, and the globe should not flash up against the user's face.
    this.handle.enabled = false;
    this.panel.enabled = false;
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    // After the Interaction Kit has moved the globe this frame, so nothing lags behind it.
    this.createEvent("LateUpdateEvent").bind(() => {
      this.updatePanelPose();
      this.updateAtmosphere();
    });
  }

  // ---------------------------------------------------------------- scene

  private buildGlobe(): void {
    const R = this.globeRadiusCm;
    const base = this.baseMaterial;
    this.handle = createEmptyObject("Globe", this.sceneObject);
    this.content = createEmptyObject("Globe Content", this.handle);

    // Ribbons face outward and materials cull back faces, so the far side of every line is
    // dropped by the GPU: no mirror-image continents, and the Earth's interior stays open.
    const gridMaterial = tintedMaterial(base, GRATICULE_COLOR);
    polylinesToRibbonMeshes(graticule(30, 5), R * LINE_RADIUS_FACTOR, R * GEOMETRY.graticuleWidthFraction).forEach((m, i) =>
      createMeshObject("Grid " + i, this.content, triangleRenderMesh(m), gridMaterial),
    );
    const coastMaterial = tintedMaterial(base, COASTLINE_COLOR);
    polylinesToRibbonMeshes(COASTLINE_110M, R * LINE_RADIUS_FACTOR, R * GEOMETRY.coastlineWidthFraction).forEach((m, i) =>
      createMeshObject("Coastline " + i, this.content, triangleRenderMesh(m), coastMaterial),
    );
    // Faint inner grid at the depth where the deepest quakes stop: a ruler for slabs.
    const innerRadius = depthToRadius(INNER_GRID_DEPTH_KM, R, SETTINGS.depthExaggeration);
    const innerMaterial = tintedMaterial(base, INNER_GRID_COLOR);
    polylinesToRibbonMeshes(graticule(60, 6), innerRadius, R * GEOMETRY.graticuleWidthFraction).forEach((m, i) =>
      createMeshObject("Inner grid " + i, this.content, triangleRenderMesh(m), innerMaterial),
    );

    for (const c of DEPTH_CLASSES) {
      this.markerVisuals[c] = createMeshObject("Quakes " + c, this.content, null, tintedMaterial(base, DEPTH_CLASS_COLORS[c]));
    }
    this.haloMaterial = glowMaterial(base, HALO_COLOR);
    this.haloVisual = createMeshObject("Newest quakes glow", this.content, null, this.haloMaterial);

    const highlightMaterial = tintedMaterial(base, HIGHLIGHT_COLOR);
    this.highlight = createEmptyObject("Selected quake", this.content);
    this.highlightVisual = createMeshObject("Marker", this.highlight, null, highlightMaterial);
    this.stemVisual = createMeshObject("Depth stem", this.content, null, highlightMaterial);
    this.epicenterMaterial = glowMaterial(base, EPICENTER_COLOR);
    this.epicenterVisual = createMeshObject("Epicentre ring", this.content, null, this.epicenterMaterial);

    // Atmosphere: rings around the silhouette, re-aimed at the viewer every frame. They are
    // children of the handle, not of the spinning content, so only the aim changes.
    this.atmosphere = createEmptyObject("Atmosphere", this.handle);
    for (const ring of ATMOSPHERE_RINGS) {
      createMeshObject("Atmosphere ring", this.atmosphere, triangleRenderMesh(buildRing(R * ring.inner, R * ring.outer, 128)), glowMaterial(base, ring.rgb));
    }

    // Grab to move; grab directly or use two hands to rotate and resize (Interaction Kit).
    // The collider must exist before the Interactable, which looks for it on creation.
    const collider = this.handle.createComponent("Physics.ColliderComponent");
    const sphere = Shape.createSphereShape();
    sphere.radius = R;
    collider.shape = sphere;
    collider.fitVisual = false;
    this.handle.createComponent(Interactable.getTypeName());
    const manipulation = this.handle.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation;
    manipulation.minimumScaleFactor = 0.4;
    manipulation.maximumScaleFactor = 3;
  }

  private buildPanel(): void {
    const W = PANEL_WIDTH_CM;
    const font = this.font ? this.font : undefined;
    this.panel = createEmptyObject("Panel", this.sceneObject);
    let y = 0;
    const line = (name: string, size: number, color: [number, number, number], lines: number): Text => {
      const h = textHeightCm(size, lines);
      const t = createText(this.panel, name, new vec3(0, y, 0), { size, color, widthCm: W, heightCm: h, centered: false, font });
      y -= h + LINE_GAP_CM;
      return t;
    };
    line("Title", 48, [0.78, 0.9, 1.0], 1).text = "Live Quake Globe   v" + LENS_VERSION;
    this.texts = {
      status: line("Status", 36, MUTED, 1),
      count: line("Count", 40, BODY, 1),
      activity: line("Activity", 40, BODY, 2),
      detail: line("Detail", 40, BODY, 3),
      // Two legend lines (they name the current view's glow window) and the data credit.
      legend: line("Legend", 36, MUTED, 3),
    };

    // Row 1: the three time windows. Row 2: Strongest and Spin.
    const h = BUTTON_HEIGHT_CM;
    const g = BUTTON_GAP_CM;
    const row1 = y - 0.6 - h / 2;
    const row2 = row1 - h - g;
    const w3 = (W - 2 * g) / 3;
    VIEWS.forEach((v, i) => {
      const x = -W / 2 + w3 / 2 + i * (w3 + g);
      const b = new PanelButton(this.panel, v.label, new vec3(x, row1, 0), w3, h, true, () => this.chooseView(v.id), font);
      this.viewButtons[v.id] = b;
      this.buttons.push(b);
    });
    const w2 = (W - g) / 2;
    this.buttons.push(new PanelButton(this.panel, "Strongest", new vec3(-W / 2 + w2 / 2, row2, 0), w2, h, false, () => this.nextStrongest(), font));
    this.spinButton = new PanelButton(this.panel, "Spin", new vec3(W / 2 - w2 / 2, row2, 0), w2, h, true, () => this.resumeSpin(), font);
    this.buttons.push(this.spinButton);

    // Backplate behind everything on the panel, padded around the content.
    const contentBottom = row2 - h / 2;
    const plateHeight = -contentBottom + 2 * PANEL_PADDING_CM;
    createBackplate(this.panel, W + 2 * PANEL_PADDING_CM, plateHeight, new vec3(0, contentBottom / 2, -0.8));
  }

  // ---------------------------------------------------------------- lifecycle

  private onStart(): void {
    // Placement first, so nothing below can leave the globe unplaced.
    const place = this.createEvent("DelayedCallbackEvent");
    place.bind(() => this.placeInFront());
    place.reset(0.25); // let the camera pose settle
    for (const b of this.buttons) b.bind();
    this.online = global.deviceInfoSystem.isInternetAvailable();
    global.deviceInfoSystem.onInternetStatusChanged.add((args) => {
      this.online = args.isInternetAvailable;
      if (this.online) this.ensureFresh();
      this.render();
    });
    this.ensureFresh();
    this.render();
  }

  private onUpdate(): void {
    const dt = getDeltaTime();
    this.elapsed += dt;

    // Events whose job is done are unregistered here, outside their own callbacks.
    if (this.finishedEvents.length > 0) {
      for (const e of this.finishedEvents) this.removeEvent(e);
      this.finishedEvents = [];
    }

    let target: Quat;
    if (this.selectionTarget !== null) {
      target = this.selectionTarget;
    } else {
      this.spinDeg += SETTINGS.idleSpinDegPerSec * dt;
      target = spinRotation(this.spinDeg);
    }
    this.current = quatSlerp(this.current, target, 1 - Math.exp(-dt * 3));
    this.content.getTransform().setLocalRotation(toLensQuat(this.current));

    // Glows breathe: the newest quakes, and the ring around the selected epicentre.
    this.haloMaterial.mainPass.baseColor = scaled(HALO_COLOR, pulse(this.elapsed, HALO_PULSE));
    if (this.selectedId !== "") {
      const s = pulse(this.elapsed, SELECTED_SCALE_PULSE);
      this.highlight.getTransform().setLocalScale(new vec3(s, s, s));
      this.epicenterMaterial.mainPass.baseColor = scaled(EPICENTER_COLOR, pulse(this.elapsed, EPICENTER_PULSE));
    }

    this.sinceRender += dt;
    if (this.sinceRender >= 1) {
      this.sinceRender = 0;
      this.render(); // keeps "Updated N min ago" honest
    }
  }

  // ---------------------------------------------------------------- actions

  private chooseView(id: string): void {
    for (const v of VIEWS) if (v.id === id) this.model.setView(v.id);
    this.ensureFresh();
    this.render();
  }

  private nextStrongest(): void {
    this.model.selectNext();
    this.render();
  }

  private resumeSpin(): void {
    this.model.clearSelection();
    this.render();
  }

  // ---------------------------------------------------------------- data

  /**
   * Makes sure every feed the current screen needs is shown and kept fresh: the last saved
   * copy appears at once, then a fetch runs now or when the data on hand reaches the
   * refresh interval (GlobeModel.refreshDueInSeconds, unit-tested).
   */
  private ensureFresh(): void {
    const now = Date.now();
    for (const id of this.model.feedsToFetch()) {
      if (this.model.slots[id].result === null) this.loadCached(id);
      if (this.inflight[id]) continue;
      const due = this.model.refreshDueInSeconds(id, now);
      if (due <= 0) this.fetchFeed(id);
      else this.scheduleFetch(id, due);
    }
  }

  private scheduleFetch(id: FeedId, seconds: number): void {
    let timer = this.timers[id];
    if (timer === undefined) {
      timer = this.createEvent("DelayedCallbackEvent");
      timer.bind(() => this.fetchFeed(id));
      this.timers[id] = timer;
    }
    timer.reset(seconds);
  }

  private fetchFeed(id: FeedId): void {
    if (this.inflight[id]) return;
    this.inflight[id] = true;
    this.download(feedUrl(id))
      .then((text) => {
        this.online = true; // a response is proof of connectivity, whatever the status API says
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch (e) {
          this.model.fail(id, "invalid JSON");
          return;
        }
        this.model.ingest(id, raw);
        if (this.model.slots[id].failures === 0) this.saveCached(id, text);
      })
      .catch((e) => this.model.fail(id, e instanceof Error ? e.message : String(e)))
      .then(() => {
        this.inflight[id] = false;
        // Keep refreshing only what the screen still shows; ensureFresh() resumes the rest.
        if (this.model.feedsToFetch().indexOf(id) >= 0) this.scheduleFetch(id, this.model.nextFetchDelaySeconds(id));
        this.render();
      });
  }

  private download(url: string): Promise<string> {
    return this.withTimeout(this.internetModule.fetch(url, { method: "GET" }), FETCH_TIMEOUT_SECONDS).then((response) => {
      // Snap's `ok` means exactly 200, so check the status code directly.
      if (response.status !== 200) throw new Error("HTTP " + response.status);
      return response.text();
    });
  }

  /** fetch() has no timeout or abort signal on this platform, so race a delayed callback. */
  private withTimeout<T>(p: Promise<T>, seconds: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = this.createEvent("DelayedCallbackEvent");
      // One timer per request; it is cancelled when the request settles and unregistered on
      // the next frame, so a Lens left open for hours does not accumulate events.
      const finish = (): void => {
        timer.cancel();
        this.finishedEvents.push(timer);
      };
      timer.bind(() => {
        if (!settled) {
          settled = true;
          finish();
          reject(new Error("timeout after " + seconds + " s"));
        }
      });
      timer.reset(seconds);
      p.then(
        (v) => {
          if (!settled) {
            settled = true;
            finish();
            resolve(v);
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            finish();
            reject(err);
          }
        },
      );
    });
  }

  /** The last good copy of a feed, so the globe has something honest to show offline. */
  private loadCached(id: FeedId): void {
    const store = global.persistentStorageSystem.store;
    const key = CACHE_PREFIX + id;
    if (!store.has(key)) return;
    try {
      this.model.ingest(id, JSON.parse(store.getString(key)));
    } catch (e) {
      store.remove(key);
    }
  }

  /** Saved at most every 30 minutes per feed: a fallback for offline starts, not a mirror. */
  private saveCached(id: FeedId, text: string): void {
    const now = Date.now();
    const last = this.lastSavedMs[id];
    if (last !== undefined && now - last < CACHE_SAVE_INTERVAL_MS) return;
    const store = global.persistentStorageSystem.store;
    store.onStoreFull = () => {
      for (const v of VIEWS) store.remove(CACHE_PREFIX + v.feed);
    };
    try {
      store.putString(CACHE_PREFIX + id, text);
      this.lastSavedMs[id] = now;
    } catch (e) {
      print("cache write failed for " + id + ": " + String(e));
    }
  }

  // ---------------------------------------------------------------- drawing

  private render(): void {
    const vm = this.model.viewModel(Date.now(), this.online);
    setText(this.texts.status, vm.statusLine);
    setText(this.texts.count, vm.countLine);
    setText(this.texts.activity, vm.activityText);
    setText(this.texts.detail, vm.detailText);
    setText(this.texts.legend, legendText(vm.view.id) + "\n" + FOOTER_TEXT);
    if (vm.markersVersion !== this.renderedVersion) {
      this.rebuildMarkers(vm.markers);
      this.renderedVersion = vm.markersVersion;
    }
    // The newest set changes as time passes, not only when data arrives.
    const haloKey = vm.recent.map((q) => q.id).join(",");
    if (haloKey !== this.haloKey) {
      this.haloKey = haloKey;
      const mesh = triangleRenderMesh(buildHaloMesh(vm.recent, this.markerOptions()));
      if (mesh !== null) this.haloVisual.mesh = mesh;
      this.haloVisual.enabled = mesh !== null;
    }
    const id = vm.selected === null ? "" : vm.selected.id;
    if (id !== this.selectedId) {
      this.selectedId = id;
      this.showSelection(vm.selected);
    }
    for (const v of VIEWS) this.viewButtons[v.id].setActive(v.id === vm.view.id);
    this.spinButton.setActive(vm.selected === null);
  }

  private markerOptions(): { globeRadius: number; depthExaggeration: number; baseSize: number } {
    return {
      globeRadius: this.globeRadiusCm,
      depthExaggeration: SETTINGS.depthExaggeration,
      baseSize: this.globeRadiusCm * GEOMETRY.markerBaseFraction,
    };
  }

  private rebuildMarkers(quakes: Quake[]): void {
    const meshes = buildMarkerMeshes(quakes, this.markerOptions());
    for (const c of DEPTH_CLASSES) {
      const mesh = triangleRenderMesh(meshes[c]);
      const visual = this.markerVisuals[c];
      if (mesh !== null) visual.mesh = mesh;
      visual.enabled = mesh !== null;
    }
  }

  private showSelection(q: Quake | null): void {
    if (q === null) {
      this.highlightVisual.enabled = false;
      this.stemVisual.enabled = false;
      this.epicenterVisual.enabled = false;
      this.selectionTarget = null;
      return;
    }
    const R = this.globeRadiusCm;
    const p = quakePosition(q.lat, q.lon, q.depthKm, R, SETTINGS.depthExaggeration);
    this.highlight.getTransform().setLocalPosition(toLensVec(p));
    const marker = triangleRenderMesh(buildOctahedron(highlightHalfSize(q, this.markerOptions())));
    if (marker !== null) this.highlightVisual.mesh = marker;
    this.highlightVisual.enabled = marker !== null;
    const top = geoToCartesian(q.lat, q.lon, R * LINE_RADIUS_FACTOR);
    // A surface event has no depth to show, and a zero-length prism has no area.
    const stem = q.depthKm > 1 ? triangleRenderMesh(buildPrism(top, p, R * GEOMETRY.stemWidthFraction)) : null;
    if (stem !== null) this.stemVisual.mesh = stem;
    this.stemVisual.enabled = stem !== null;
    const ring = triangleRenderMesh(buildEpicenterRing(q, this.markerOptions()));
    if (ring !== null) this.epicenterVisual.mesh = ring;
    this.epicenterVisual.enabled = ring !== null;
    // Turn the event toward wherever the viewer stands now, then hold still so they can
    // walk around it and see the slab from the side.
    this.selectionTarget = quatMultiply(alignmentRotation(this.viewerDirectionInGlobe()), facingRotation(q.lat, q.lon));
  }

  // ---------------------------------------------------------------- placement

  private cameraTransform(): Transform {
    return this.cameraObject ? this.cameraObject.getTransform() : WorldCameraFinderProvider.getInstance().getTransform();
  }

  /** Direction from the globe's centre to the viewer, in the globe handle's local frame. */
  private viewerDirectionInGlobe(): Vec3 {
    const t = this.handle.getTransform();
    const toViewer = this.cameraTransform().getWorldPosition().sub(t.getWorldPosition());
    return fromLensVec(t.getWorldRotation().invert().multiplyVec3(toViewer));
  }

  /** World-locked placement in front of the user, level with the floor. */
  private placeInFront(): void {
    const cam = this.cameraTransform();
    const fwd = cam.forward; // cameras look down -Z, so +Z (forward) points back toward the user
    let flat = new vec3(fwd.x, 0, fwd.z);
    flat = flat.length < 1e-4 ? new vec3(0, 0, 1) : flat.normalize();
    const pos = cam.getWorldPosition().add(flat.uniformScale(-this.distanceCm)).add(new vec3(0, this.heightOffsetCm, 0));
    const t = this.sceneObject.getTransform();
    t.setWorldPosition(pos);
    t.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(flat)))); // +Z faces the user
    this.placed = true;
    this.handle.enabled = true;
    this.panel.enabled = true;
    this.updatePanelPose();
    this.updateAtmosphere();
  }

  /**
   * The panel hangs below the globe (following moves and resizes) and turns to face the
   * viewer. It holds still while a button is targeted, so a press is not lost to head motion.
   */
  private updatePanelPose(): void {
    if (!this.placed) return;
    for (const b of this.buttons) if (b.isHovered()) return;
    const g = this.handle.getTransform();
    const scale = g.getWorldScale().y;
    const pos = g.getWorldPosition().add(new vec3(0, -(this.globeRadiusCm * scale + PANEL_GAP_CM), 0));
    const p = this.panel.getTransform();
    p.setWorldPosition(pos);
    p.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(this.cameraTransform().getWorldPosition().sub(pos)))));
  }

  /**
   * Keeps the atmosphere rings facing the viewer and sized to the globe's outline as seen from
   * where the viewer is now: walking up to the globe or scaling it up makes the outline larger
   * than the globe's radius, and unscaled rings would slide inside the edge (silhouetteScale).
   */
  private updateAtmosphere(): void {
    if (!this.placed) return;
    const toViewer = this.viewerDirectionInGlobe();
    const distance = Math.hypot(toViewer.x, toViewer.y, toViewer.z);
    const s = silhouetteScale(this.globeRadiusCm * this.handle.getTransform().getWorldScale().y, distance);
    const visible = s > 0;
    if (this.atmosphere.enabled !== visible) this.atmosphere.enabled = visible;
    if (!visible) return;
    const t = this.atmosphere.getTransform();
    t.setLocalRotation(toLensQuat(alignmentRotation(toViewer)));
    t.setLocalScale(new vec3(s, s, s));
  }
}
