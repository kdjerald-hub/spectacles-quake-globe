// The earthquake-alert overlay (done criteria 2-5), built on top of the live globe.
//
// It owns every new scene object: the alert / controls / details cards, the home / epicentre /
// cover-spot markers, the home-to-epicentre line, the off-view arrow, the quake pick targets and
// the chime. The Lens component hands it the shared globe objects (handle, spinning content,
// camera) and drives its lifecycle; all the decisions about what the overlay shows live here.
//
// The alert text (headline, the "during"/"after" lines, the "Shaking stopped" label, the cover-spot
// label, the guidance source) comes from the EARTHQUAKE hazard profile in Core/hazards.ts, and the
// stage advances through nextStage(). The alert has two stages:
//   during - the ground is shaking. The card leads with "Drop, Cover, Hold On" and asks for nothing
//            but "Shaking stopped"; the globe marks the epicentre, the home marker and the line, the
//            chime plays, and an arrow (with a chime) points to the cover spot only when it is out
//            of view. Nothing else needs a gesture.
//   after  - "Shaking stopped" was pinched. The card shows the event details, the "after" guidance,
//            "Send to emergency contacts" and "I'm safe" (which closes the alert).
//
// Globe-attached visuals are children of `content`, so they spin and scale with the globe.
// Room-space objects (cards, cover spot, arrow) hang off the Lens root and are posed each frame.
// The quake pick colliders live under a separate root that is synced to the globe every frame,
// NOT under the manipulated handle: a pinch on a quake must select it, never grab the globe.

import type { Quake } from "../Core/usgs";
import type { Vec3, Quat } from "../Core/geo";
import {
  alignmentRotation,
  facingRotation,
  geoToCartesian,
  quakePosition,
  quatFromAxisAngle,
  quatMultiply,
} from "../Core/geo";
import { GEOMETRY, SETTINGS } from "../Core/config";
import { EARTHQUAKE, nextStage, profileForAlert } from "../Core/hazards";
import type { AlertStage } from "../Core/hazards";
import { LINE_RADIUS_FACTOR } from "../Core/occluder";
import { EPICENTER_COLOR, EPICENTER_PULSE, DEPTH_CLASS_COLORS, depthClass, pulse } from "../Core/style";
import { buildEpicenterRing, epicenterRingDeg, highlightHalfSize } from "../Core/markers";
import type { MarkerOptions, TriangleMesh } from "../Core/markers";
import { estimateTextWidthEm, selectionObstacle, toViewAngles } from "../Core/labels";
import type { Box, ViewFrame } from "../Core/labels";
import { buildOctahedron, buildPrism, buildRing, buildSphereCircle } from "../Core/shapes";
import { polylinesToRibbonMeshes } from "../Core/lines";
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
import { createText } from "./LensUi";
import { AlertCard, ControlsCard, DetailsCard } from "./EmergencyUi";
import { localMapFor } from "../Core/localmap";
import type { LocalMap } from "../Core/localmap";
import { LocalMapView } from "./LocalMapView";
import {
  ALERT_SIMULATION_NOTE,
  DEFAULT_HOME,
  SAFE_BUTTON_LABEL,
  SEND_BUTTON_LABEL,
  SENT_MESSAGE,
  SIMULATED_ALERT,
  SIMULATED_QUAKE,
  alertDetailsText,
  distanceFromHomeText,
  formatDistanceKm,
  greatCircleKm,
  greatCirclePolyline,
  quakeCardText,
} from "./Emergency";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";

export interface GlobeContext {
  root: SceneObject;
  handle: SceneObject;
  content: SceneObject;
  globeRadiusCm: number;
  baseMaterial: Material;
  font?: Font;
  chime?: AudioTrackAsset;
  cameraTransform: () => Transform;
  viewerDirectionInGlobe: () => Vec3;
  currentSpin: () => Quat;
  selectQuakeById: (id: string) => void;
  setManipulationEnabled: (enabled: boolean) => void;
  /** Show or hide the main panel: it steps aside while an alert is open (video review 2026-10-21). */
  setPanelVisible: (visible: boolean) => void;
  /** Show or hide the whole globe view while the alert's local map is up (learner's review 2026-10-22). */
  setGlobeVisible: (visible: boolean) => void;
  /** Fade the globe's materials toward black for the zoom's cross-fade (1 restores them). */
  setGlobeFade: (k: number) => void;
}

type Mode = "normal" | "home" | "cover";

const CARD_WIDTH_CM = 16;
/**
 * The alert card takes the panel's place while an alert is open (video review 2026-10-21): the
 * panel's width, centred below the globe at the globe's depth (~1 m at the default placement).
 * Matches PANEL_WIDTH_CM / PANEL_GAP_CM in QuakeGlobeLens so the swap is seamless.
 */
const ALERT_CARD_WIDTH_CM = 30;
const ALERT_CARD_GAP_CM = 2.5;
/**
 * Side cards sit a little behind the globe's plane. The visible display is narrow: with a 24 cm globe
 * at 1 m there is only ~6 degrees of view to each side of the globe's silhouette, so a card cannot be
 * made much wider or brought much nearer without its outer edge sliding off the display (verified in
 * the SPECS 27 Preview from the default viewpoint pitched down ~10 degrees). The readability comes
 * from larger type and full-width buttons rather than from a bigger card. The inner edge is held clear
 * of the globe by angle (see updatePoses), so the depth never slides the card behind the silhouette.
 */
const CARD_BACK_CM = 48;
/**
 * How far, in viewing angle, a card's inner edge clears the globe's silhouette. Measured from the
 * viewer, so it holds regardless of how far the card is pushed back or how large the globe is.
 */
const CARD_CLEARANCE_ANGLE = (2.2 * Math.PI) / 180;
/** Marker / line colours stay light (cyan, mint): the quakes remain the only saturated colour. */
const HOME_COLOR: [number, number, number] = [0.5, 0.9, 1.0];
/** Arc radius of the home ring on the globe, degrees (showHomeMarker and homeMarkerObstacle). */
const HOME_RING_DEG = 2.2;
const LINE_COLOR: [number, number, number] = [0.6, 0.9, 1.0];
const COVER_COLOR: [number, number, number] = [0.55, 1.0, 0.8];
/** Number of strongest quakes given a pinch target on the globe. */
const PICK_SLOTS = 12;
/** Pick targets sit just proud of the surface so a pinch hits them before the globe collider. */
const PICK_RADIUS_FACTOR = 1.03;
/** Half-angle of the "comfortably in view" cone; the arrow shows when the cover spot is outside it. */
const IN_VIEW_HALF_COS = Math.cos((26 * Math.PI) / 180);
/** The off-view arrow floats this far ahead of the eyes (cm). */
const ARROW_AHEAD_CM = 60;
/**
 * How far from the view centre the arrow sits (cm at ARROW_AHEAD_CM), per side, so it reads as an
 * off-screen indicator at the edge of the view rather than a marker in the middle of it. The SPECS
 * 27 preview shows about ±16 degrees horizontally and ±18 vertically (±17 / ±20 cm at 60 cm); these
 * radii stay inside that with room for the arrow's own size, while clearing the globe's disc
 * (~7 degrees around centre). The alert card now sits bottom-centre (it took the panel's place),
 * right where a downward arrow would land, so the card is handled dynamically instead of by a
 * per-side constant: updateArrow projects the card's plate into the arrow's plane and pushes the
 * arrow sideways past the card's outer edge whenever it would land on the card.
 */
const ARROW_EDGE_SIDE_CM = 12.5;
const ARROW_EDGE_UP_CM = 12;
const ARROW_EDGE_DOWN_CM = 15;
/** Clearance between the arrow's centre and the alert card's plate, in cm at ARROW_AHEAD_CM. */
const ARROW_CARD_MARGIN_CM = 4;
/** The arrow never gets pushed past this (cm at ARROW_AHEAD_CM): the display edge is ~±17. */
const ARROW_MAX_SIDE_CM = 16;
/** Epicentre label ("15 km from home") text size; its em height is size / 43.886 cm (LensUi). */
const EPICENTER_LABEL_SIZE = 44;
const EPICENTER_LABEL_EM_CM = EPICENTER_LABEL_SIZE / 43.886;
/** Gap between the epicentre ring's edge and the label's nearest glyph (cm). */
const EPICENTER_LABEL_GAP_CM = 1.2;
/** Clear space the map labels keep around the epicentre label (degrees of view angle). */
const EPICENTER_LABEL_MARGIN_DEG = 0.4;
/** The cover-spot placement hint follows the line of sight: this far ahead and above centre (cm). */
const HINT_AHEAD_CM = 70;
const HINT_RAISE_CM = 9;
/** Default hint text size (matches the panel's body lines). */
const HINT_SIZE = 36;
/**
 * The cover-spot hint is ~1.5 x the default so it reads in a 1080p screen recording (committee's
 * second review 2026-10-21). At this size the hint wraps to two lines inside the hint's width,
 * which still fits the display when the user looks down at the floor (the hint follows the line
 * of sight at HINT_AHEAD_CM).
 */
const COVER_HINT_SIZE = 54;
/** How far the world-query ray reaches when probing for the real surface under the user's pinch (cm). */
const PROBE_RANGE_CM = 600;
/** A world-query hit counts as current for this long, so a pinch commits the surface just probed (s). */
const PROBE_FRESH_S = 0.5;

// The zoom into the map of your area (learner's review 2026-10-22). When the alert fires the globe
// first turns the epicentre toward the viewer as before (TURN_S covers most of that slerp); then,
// over ZOOM_S, the globe grows and fades out while the map grows from the epicentre's place and
// fades in, so it reads as zooming in. "I'm safe" plays the same ramp backwards.
const TURN_S = 0.9;
const ZOOM_S = 0.8;
/** The map starts at this share of its full size, growing to 1 as the zoom completes. */
const MAP_START_SCALE = 0.3;
/** The globe grows to this multiple while it fades out, selling the dive into the surface. */
const GLOBE_GROW = 2.2;

/** Smoothstep: eases both ends of the zoom so neither the globe nor the map pops. */
function easeSmooth(u: number): number {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

/**
 * The off-view arrow as a notched dart: a tip on local +X, two swept-back wings, and a notch cut
 * into the axis behind them. The old wide triangle read as pointing at whichever corner stood out
 * in a flat frame (second-cut check 2026-10-21); the dart is clearly longer (2.3 x size along +X)
 * than wide (1.2 x size), so the pointing end is unmistakable. Two triangles sharing the tip-notch
 * edge, wound counter-clockwise seen from local +Z (the face the billboard shows the viewer).
 */
function buildArrowMesh(size: number): TriangleMesh {
  const pts: [number, number][] = [
    [1.5, 0], // tip
    [-0.8, 0.6], // left wing, swept back
    [-0.3, 0], // notch on the axis
    [-0.8, -0.6], // right wing, swept back
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  for (const p of pts) {
    positions.push(p[0] * size, p[1] * size, 0);
    normals.push(0, 0, 1);
  }
  return { positions, normals, indices: [0, 1, 2, 0, 2, 3] };
}

export class EmergencyOverlay {
  private readonly ctx: GlobeContext;
  /**
   * The hazard profile is chosen from the simulated alert's CAP event type (profileForAlert), not
   * named directly, so the wording follows the alert. EARTHQUAKE only backstops the type: the
   * simulated alert's event is "Earthquake", which always matches.
   */
  private readonly profile = profileForAlert(SIMULATED_ALERT) ?? EARTHQUAKE;
  private mode: Mode = "normal";

  private homeConfirmed = false;
  private homeLatLon = { lat: DEFAULT_HOME.lat, lon: DEFAULT_HOME.lon };
  private pendingHome = { lat: DEFAULT_HOME.lat, lon: DEFAULT_HOME.lon };
  private coverSpotWorld: vec3 | null = null;
  /** Surface normal at the cover spot, when it was placed on a real surface; null = flat (upright). */
  private coverSpotNormal: vec3 | null = null;
  /** World-query hit-test session (LensStudio:WorldQueryModule), created lazily when first needed. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hitSession: any = null;
  private hitSessionTried = false;
  private lastProbeHit: { position: vec3; normal: vec3 } | null = null;
  private lastProbeElapsed = -999;
  private lastProbePrintElapsed = -999;
  private alertActive = false;
  private stage: AlertStage = "during";
  private sentToContacts = false;
  private alertFacing: Quat | null = null;
  private elapsed = 0;
  private alertStartElapsed = -999;
  private arrowShown = false;
  private hintUntil = 0;
  private placed = false;

  /** The map of your area, built once per alert (localMapFor), and its view in the globe's place. */
  private mapView!: LocalMapView;
  private localMap: LocalMap | null = null;
  /**
   * The zoom's stages: "turn" while the globe turns to the epicentre, "in" while the cross-fade
   * runs, "map" while the map has fully replaced the globe (both alert stages), "out" while the
   * reverse plays after "I'm safe". zoomU is the cross-fade's 0..1 position, so an alert closed
   * mid-fade simply plays back from wherever it was.
   */
  private zoomPhase: "none" | "turn" | "in" | "map" | "out" = "none";
  private turnT = 0;
  private zoomU = 0;

  private controlsCard!: ControlsCard;
  private detailsCard!: DetailsCard;
  private alertCard!: AlertCard;
  private hint!: Text;
  /** "15 km from home" beside the epicentre ring on the globe (video review 2026-10-21). */
  private epicenterLabel!: Text;
  /** Where updatePoses last put the epicentre label; null while it is hidden or not yet posed. */
  private epicenterLabelWorld: vec3 | null = null;

  private epicenterRingVisual!: RenderMeshVisual;
  private epicenterRingMaterial!: Material;
  private epicenterMarkerVisual!: RenderMeshVisual;
  private epicenterStemVisual!: RenderMeshVisual;
  private lineVisual!: RenderMeshVisual;
  private homeMarkerVisual!: RenderMeshVisual;
  private homeRingVisual!: RenderMeshVisual;

  private coverSpotRoot!: SceneObject;
  private arrowRoot!: SceneObject;
  private placementPlane!: SceneObject;
  private placementInteractable!: Interactable;

  private picksRoot!: SceneObject;
  private picksContent!: SceneObject;
  private pickObjects: SceneObject[] = [];
  private pickInteractables: Interactable[] = [];
  private pickIds: string[] = [];

  private audio: AudioComponent | null = null;

  constructor(ctx: GlobeContext) {
    this.ctx = ctx;
  }

  private markerOpt(): MarkerOptions {
    return {
      globeRadius: this.ctx.globeRadiusCm,
      depthExaggeration: SETTINGS.depthExaggeration,
      baseSize: this.ctx.globeRadiusCm * GEOMETRY.markerBaseFraction,
    };
  }

  // ---------------------------------------------------------------- build

  build(): void {
    const base = this.ctx.baseMaterial;
    const content = this.ctx.content;
    const source = "Guidance: " + this.profile.guidanceSource;

    // Controls card to the left of the globe, details card to the right; the alert card (both
    // stages) takes the panel's place below the globe while an alert is open (see updatePoses).
    // The card copy comes from the hazard profile matching the simulated alert's event type.
    this.alertCard = new AlertCard(
      this.ctx.root,
      ALERT_CARD_WIDTH_CM,
      {
        title: this.profile.title,
        simNote: ALERT_SIMULATION_NOTE,
        headline: this.profile.headline,
        during: this.profile.during,
        after: this.profile.after,
        source,
        advanceLabel: this.profile.advanceLabel,
        sendLabel: SEND_BUTTON_LABEL,
        safeLabel: SAFE_BUTTON_LABEL,
      },
      { onAdvance: () => this.advanceStage(), onSend: () => this.sendContacts(), onSafe: () => this.imSafe() },
      this.ctx.font,
    );
    this.detailsCard = new DetailsCard(this.ctx.root, CARD_WIDTH_CM, () => this.ctx.selectQuakeById(""), this.ctx.font);
    this.controlsCard = new ControlsCard(
      this.ctx.root,
      CARD_WIDTH_CM,
      {
        onAlert: () => this.phoneAlert(),
        onSetHome: () => this.enterHomeMode(),
        onConfirmHome: () => this.confirmHome(),
        onSetCover: () => this.enterCoverMode(),
      },
      this.profile.spotLabel,
      this.ctx.font,
    );
    this.controlsCard.setVisible(false); // shown once the globe is placed (onPlaced)

    // The box is tall enough for two lines at COVER_HINT_SIZE: the cover-spot hint wraps.
    this.hint = createText(this.ctx.root, "Overlay hint", new vec3(0, 0, 0), {
      size: HINT_SIZE,
      color: [0.85, 0.92, 1.0],
      widthCm: 34,
      heightCm: 3.4,
      centered: true,
      font: this.ctx.font,
    });
    this.hint.getSceneObject().enabled = false;

    // Distance label beside the epicentre ring ("15 km from home"), billboarded to the
    // viewer each frame (updatePoses). Light warm, like the card's distance line: the quakes stay
    // the only saturated colour.
    this.epicenterLabel = createText(this.ctx.root, "Epicentre distance", new vec3(0, 0, 0), {
      size: EPICENTER_LABEL_SIZE,
      color: [1.0, 0.85, 0.6],
      widthCm: 26,
      heightCm: 1.6,
      centered: true,
      font: this.ctx.font,
    });
    this.epicenterLabel.getSceneObject().enabled = false;

    // Epicentre of the simulated quake (shown only during an alert).
    this.epicenterRingMaterial = glowMaterial(base, EPICENTER_COLOR);
    this.epicenterRingVisual = createMeshObject("Alert epicentre ring", content, null, this.epicenterRingMaterial);
    this.epicenterMarkerVisual = createMeshObject("Alert epicentre marker", content, null, tintedMaterial(base, DEPTH_CLASS_COLORS[depthClass(SIMULATED_QUAKE.depthKm)]));
    this.epicenterStemVisual = createMeshObject("Alert epicentre stem", content, null, tintedMaterial(base, [1, 1, 1]));
    this.lineVisual = createMeshObject("Home to epicentre line", content, null, glowMaterial(base, LINE_COLOR));

    // Home marker on the globe.
    this.homeMarkerVisual = createMeshObject("Home marker", content, null, glowMaterial(base, HOME_COLOR));
    this.homeRingVisual = createMeshObject("Home ring", content, null, glowMaterial(base, HOME_COLOR));

    // Cover-spot marker in the room: a flat glowing ring, a dot and an upright beam.
    this.coverSpotRoot = createEmptyObject("Cover spot", this.ctx.root);
    const coverMat = glowMaterial(base, COVER_COLOR);
    const ring = createMeshObject("Cover ring", this.coverSpotRoot, triangleRenderMesh(buildRing(18, 20, 64)), coverMat);
    ring.getSceneObject().getTransform().setLocalRotation(toLensQuat(quatFromAxisAngle({ x: 1, y: 0, z: 0 }, -Math.PI / 2)));
    createMeshObject("Cover dot", this.coverSpotRoot, triangleRenderMesh(buildOctahedron(3)), coverMat);
    createMeshObject("Cover beam", this.coverSpotRoot, triangleRenderMesh(buildPrism({ x: 0, y: 0, z: 0 }, { x: 0, y: 34, z: 0 }, 1.4)), coverMat);
    this.coverSpotRoot.enabled = false;

    // Off-view arrow: a small edge-of-view indicator, posed near the view edge each frame.
    this.arrowRoot = createEmptyObject("Cover spot arrow", this.ctx.root);
    createMeshObject("Arrow", this.arrowRoot, triangleRenderMesh(buildArrowMesh(1.8)), glowMaterial(base, COVER_COLOR));
    this.arrowRoot.enabled = false;

    // Large invisible plane that catches a pinch "in the room" while setting the cover spot.
    this.placementPlane = createEmptyObject("Cover spot placement", this.ctx.root);
    const planeCollider = this.placementPlane.createComponent("Physics.ColliderComponent");
    const box = Shape.createBoxShape();
    box.size = new vec3(320, 240, 4);
    planeCollider.shape = box;
    planeCollider.fitVisual = false;
    this.placementInteractable = this.placementPlane.createComponent(Interactable.getTypeName()) as Interactable;
    this.placementPlane.enabled = false;
    this.parkPlacementPlane();

    // Decoupled pick targets, synced to the globe in updatePoses().
    this.picksRoot = createEmptyObject("Quake Picks", this.ctx.root);
    this.picksContent = createEmptyObject("Quake Picks Content", this.picksRoot);
    const pickRadius = this.ctx.globeRadiusCm * 0.08;
    for (let i = 0; i < PICK_SLOTS; i++) {
      const obj = createEmptyObject("Quake pick " + i, this.picksContent);
      const collider = obj.createComponent("Physics.ColliderComponent");
      const sphere = Shape.createSphereShape();
      sphere.radius = pickRadius;
      collider.shape = sphere;
      collider.fitVisual = false;
      const inter = obj.createComponent(Interactable.getTypeName()) as Interactable;
      obj.enabled = false;
      this.pickObjects.push(obj);
      this.pickInteractables.push(inter);
      this.pickIds.push("");
    }

    // Chime (optional asset): the alert sound and the out-of-view cue.
    const audioObj = createEmptyObject("Alert chime", this.ctx.root);
    this.audio = audioObj.createComponent("Component.AudioComponent") as AudioComponent;
    if (this.ctx.chime) this.audio.audioTrack = this.ctx.chime;

    // The map of your area, hidden until an alert's zoom brings it up. A child of the globe's
    // handle, so it keeps the globe's place through moves and resizes; its content is rebuilt
    // for each alert from the confirmed home.
    this.mapView = new LocalMapView(this.ctx.handle, base, this.ctx.font);
  }

  /** Subscribe to card buttons and pick targets. Call from OnStartEvent, like the panel. */
  bindButtons(): void {
    this.controlsCard.bind();
    this.alertCard.bind();
    this.detailsCard.bind();
    for (let i = 0; i < this.pickInteractables.length; i++) {
      const slot = i;
      this.pickInteractables[slot].onTriggerEnd.add(() => this.onPickTap(slot));
    }
    this.placementInteractable.onTriggerEnd.add((e) => this.roomTap(e.interactor.targetHitPosition));
  }

  /** Called once the globe is placed in front of the user; reveals the controls card. */
  onPlaced(): void {
    this.placed = true;
    this.refreshControls();
  }

  /**
   * The controls card and the main panel show while no alert is active. While an alert is open the
   * dashboard steps aside: the panel and all its buttons hide (the alert card takes the panel's
   * place), so the only thing to pinch while the ground shakes is "Shaking stopped". Both return
   * when the alert closes with "I'm safe".
   */
  private refreshControls(): void {
    this.controlsCard.setVisible(this.placed && !this.alertActive);
    this.ctx.setPanelVisible(this.placed && !this.alertActive);
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number): void {
    this.elapsed += dt;
    // While setting the cover spot, probe the real surface the user is pointing at so the marker
    // previews where it will rest; a pinch (roomTap) commits whatever was last probed.
    if (this.mode === "cover") this.probeSurface();
    if (this.alertActive) {
      this.epicenterRingMaterial.mainPass.baseColor = this.scaledColor(EPICENTER_COLOR, pulse(this.elapsed, EPICENTER_PULSE));
    }
    if (this.mode === "normal" && this.elapsed > this.hintUntil && this.hint.getSceneObject().enabled) {
      this.hint.getSceneObject().enabled = false;
    }
    this.advanceZoom(dt);
  }

  /**
   * Advance the zoom's clock. Only state moves here; the visuals (fades, scales, the billboard)
   * are written in applyZoomVisuals from LateUpdate, after the per-frame pulse writes, so the
   * cross-fade owns the colours it is fading.
   */
  private advanceZoom(dt: number): void {
    switch (this.zoomPhase) {
      case "turn":
        this.turnT += dt;
        if (this.turnT >= TURN_S) {
          this.zoomPhase = "in";
          this.mapView.setVisible(true);
          // The map carries its own distance label ("15 km S"); the on-globe one retires.
          this.epicenterLabel.getSceneObject().enabled = false;
        }
        break;
      case "in":
        this.zoomU = Math.min(1, this.zoomU + dt / ZOOM_S);
        if (this.zoomU >= 1) {
          this.zoomPhase = "map";
          // Fully zoomed: the globe and its quakes stay hidden while the map is up, which is how
          // quakes elsewhere fade out. Colours are restored while hidden so the fade cache is
          // clean for the zoom back out.
          this.ctx.setGlobeVisible(false);
          this.ctx.setGlobeFade(1);
        }
        break;
      case "out":
        this.zoomU = Math.max(0, this.zoomU - dt / ZOOM_S);
        if (this.zoomU <= 0) this.resetZoom();
        break;
      default:
        break;
    }
  }

  /** Snap the zoom off: map hidden, globe fully back, as before any alert. */
  private resetZoom(): void {
    if (this.zoomPhase === "none") return;
    this.zoomPhase = "none";
    this.zoomU = 0;
    this.mapView.setVisible(false);
    this.ctx.setGlobeVisible(true);
    this.ctx.setGlobeFade(1);
    this.ctx.content.getTransform().setLocalScale(new vec3(1, 1, 1));
  }

  /** Highest-priority rotation target: during an alert the globe faces the epicentre and holds. */
  rotationOverride(): Quat | null {
    return this.alertActive ? this.alertFacing : null;
  }

  /** Pose the room-space elements and keep the pick targets glued to the globe. */
  updatePoses(): void {
    const cam = this.ctx.cameraTransform();
    const handleT = this.ctx.handle.getTransform();

    // Sync the decoupled pick root to the globe (world pose + scale, then the spin).
    this.picksRoot.enabled = this.mode === "normal" && !this.alertActive;
    if (this.picksRoot.enabled) {
      const pt = this.picksRoot.getTransform();
      pt.setWorldPosition(handleT.getWorldPosition());
      pt.setWorldRotation(handleT.getWorldRotation());
      pt.setWorldScale(handleT.getWorldScale());
      this.picksContent.getTransform().setLocalRotation(toLensQuat(this.ctx.currentSpin()));
    }

    const globeCenter = handleT.getWorldPosition();
    const camPos = cam.getWorldPosition();
    let forward = camPos.sub(globeCenter);
    if (forward.length < 1e-3) forward = new vec3(0, 0, 1);
    forward = forward.normalize();
    const right = new vec3(0, 1, 0).cross(forward).normalize();
    const scale = handleT.getWorldScale().y;

    // Keep each side card fully clear of the globe's silhouette AND inside the view. The silhouette
    // is an angular disc seen from the viewer (half-angle theta); hold the card's inner edge a few
    // degrees beyond it. That angle is measured from the viewer, so pushing the card back only
    // shrinks its apparent width (helping it fit the display) instead of sliding it behind the globe
    // (the old fixed-offset + push-back is what hid "Set as home" behind the globe's edge).
    const silhouetteR = this.ctx.globeRadiusCm * scale;
    const eyeToCenter = Math.max(silhouetteR + 1, camPos.distance(globeCenter));
    const theta = Math.asin(Math.min(0.999, silhouetteR / eyeToCenter));
    const cardDepth = eyeToCenter + CARD_BACK_CM;
    const innerLateral = Math.tan(theta + CARD_CLEARANCE_ANGLE) * cardDepth;
    const offset = innerLateral + CARD_WIDTH_CM / 2;
    const back = forward.uniformScale(-CARD_BACK_CM);

    const leftCenter = globeCenter.add(right.uniformScale(-offset)).add(back);
    const rightCenter = globeCenter.add(right.uniformScale(offset)).add(back);
    this.poseCard(this.controlsCard, leftCenter, camPos, this.controlsCard.contentHeightCm);
    this.poseCard(this.detailsCard, rightCenter, camPos, this.detailsCard.contentHeightCm);

    // The alert card takes the panel's place (video review 2026-10-21): centred below the globe at
    // the globe's depth (~1 m at the default placement), top-anchored just below the silhouette so
    // it never covers the globe's interior, following moves and resizes like the panel did. The
    // panel itself hides while the alert is open (refreshControls).
    if (this.alertCard.visible && !this.alertCard.anyHovered()) {
      const cardTop = globeCenter.add(new vec3(0, -(this.ctx.globeRadiusCm * scale + ALERT_CARD_GAP_CM), 0));
      const ct = this.alertCard.root.getTransform();
      ct.setWorldPosition(cardTop);
      ct.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(cardTop)))));
    }

    // Distance label in the open space to the viewer's right of the epicentre ring, facing the
    // viewer. Right, not below or above: home (Hualien City, 15 km north) and the pinned country
    // name sit at and above the ring, the dense coastline south of Taiwan ran through the old
    // below-the-ring spot ("Indonesia" overlapped it; second-cut check 2026-10-21), and during an
    // alert the epicentre faces the viewer (rotationOverride), so to its right lies the open
    // Philippine Sea. The offset clears the ring by the label's own half-width, so the text starts
    // just past the ring's edge; map names keep clear of it via epicenterLabelObstacle. The glyphs
    // do not scale with the globe, so only the ring's share of the offset is scaled.
    if (this.epicenterLabel.getSceneObject().enabled) {
      const q = SIMULATED_QUAKE;
      const surface = this.ctx.content
        .getTransform()
        .getWorldTransform()
        .multiplyPoint(toLensVec(geoToCartesian(q.lat, q.lon, this.ctx.globeRadiusCm * LINE_RADIUS_FACTOR)));
      const outward = surface.sub(globeCenter).normalize();
      const ringCm = this.ctx.globeRadiusCm * Math.sin((epicenterRingDeg(q, this.markerOpt()) * Math.PI) / 180);
      const halfTextCm = (estimateTextWidthEm(this.epicenterLabel.text) * EPICENTER_LABEL_EM_CM) / 2;
      const sideCm = ringCm * scale + EPICENTER_LABEL_GAP_CM + halfTextCm;
      const labelPos = surface.add(outward.uniformScale(2.5 * scale)).add(right.uniformScale(sideCm));
      const lt = this.epicenterLabel.getSceneObject().getTransform();
      lt.setWorldPosition(labelPos);
      lt.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(labelPos)))));
      this.epicenterLabelWorld = labelPos;
    } else {
      this.epicenterLabelWorld = null;
    }

    if (this.hint.getSceneObject().enabled) {
      const ht = this.hint.getSceneObject().getTransform();
      if (this.mode === "cover") {
        // While setting the cover spot the hint follows the line of sight (video review
        // 2026-10-21): slightly above the view centre so it stays readable when the user looks
        // down at a table or the floor, while leaving the centre clear for aiming the pinch.
        const lookDir = cam.forward.uniformScale(-1).normalize();
        const hintPos = camPos.add(lookDir.uniformScale(HINT_AHEAD_CM)).add(cam.up.uniformScale(HINT_RAISE_CM));
        ht.setWorldPosition(hintPos);
        ht.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(hintPos)))));
      } else {
        // Other hints float just above the globe, where the user is already looking.
        const hintPos = globeCenter.add(new vec3(0, silhouetteR + 3, 0));
        ht.setWorldPosition(hintPos);
        ht.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(hintPos)))));
      }
    }

    // Cover-spot placement plane catches a room pinch while setting the cover spot. Keep it beyond
    // the side cards (which sit CARD_BACK_CM behind the globe) so it never occludes their buttons:
    // a pinch aimed at a card hits the nearer card, while a pinch into open space still lands here.
    if (this.mode === "cover") {
      const lookDir = cam.forward.uniformScale(-1).normalize();
      const planeDist = camPos.distance(globeCenter) + CARD_BACK_CM + 60;
      const planePos = camPos.add(lookDir.uniformScale(planeDist));
      const pt = this.placementPlane.getTransform();
      pt.setWorldPosition(planePos);
      pt.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(planePos)))));
    }

    this.updateArrow(cam, camPos);
    this.applyZoomVisuals();
  }

  /**
   * The zoom's visuals, written from LateUpdate so they win the frame over the pulse writes in
   * UpdateEvent. The map is billboarded to the viewer (roll-free, like the atmosphere, so north
   * stays up) and grows from the epicentre's place: at u=0 its epicentre point sits at the map
   * plane's origin (where the epicentre faced the viewer on the turned globe), at u=1 home sits
   * there, the map at full size. The globe meanwhile grows and fades out, and the reverse plays
   * the same ramp backwards.
   */
  private applyZoomVisuals(): void {
    if (this.zoomPhase === "none" || this.zoomPhase === "turn") return;
    const u = easeSmooth(this.zoomU);
    this.mapView.billboard(alignmentRotation(this.ctx.viewerDirectionInGlobe()));
    const mapScale = MAP_START_SCALE + (1 - MAP_START_SCALE) * u;
    const e = this.mapView.epicentreCm;
    this.mapView.setTransition(mapScale, -e.x * mapScale * (1 - u), -e.y * mapScale * (1 - u));
    this.mapView.applyFade(u, pulse(this.elapsed, EPICENTER_PULSE));
    if (this.zoomPhase !== "map") {
      const g = 1 + (GLOBE_GROW - 1) * u;
      this.ctx.content.getTransform().setLocalScale(new vec3(g, g, g));
      this.ctx.setGlobeFade(1 - u);
    }
  }

  private poseCard(card: { root: SceneObject; anyHovered: () => boolean }, center: vec3, camPos: vec3, heightCm: number): void {
    if (!card.root.enabled || card.anyHovered()) return;
    const pos = center.add(new vec3(0, heightCm / 2, 0));
    const t = card.root.getTransform();
    t.setWorldPosition(pos);
    t.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(pos)))));
  }

  /**
   * The off-view arrow points to the cover spot while the ground shakes (stage "during") and the
   * spot is outside the comfortable forward cone. It sits near the edge of the view on the spot's
   * side (an off-screen indicator, not a marker in the middle of the view) and chimes the moment
   * the spot leaves view, but not on top of the alert's own onset chime.
   *
   * The rotation is built from the camera's own axes: the camera's world rotation IS the screen
   * frame, so spinning about its Z by atan2(uy, rx) points the mesh tip (local +X) at the spot's
   * on-screen direction in every camera pose. (The previous alignmentRotation billboard was
   * roll-free in WORLD terms - its X axis is forced horizontal and its yaw collapses as the
   * arrow-to-camera direction nears vertical - so with the camera pitched down at a floor-level
   * cover spot the spin lost its screen reference and the arrow could point up to 180 degrees off.)
   */
  private updateArrow(cam: Transform, camPos: vec3): void {
    const canShow = this.alertActive && this.stage === "during" && this.coverSpotWorld !== null;
    let visible = false;
    if (canShow) {
      const lookDir = cam.forward.uniformScale(-1).normalize();
      const dir = this.coverSpotWorld!.sub(camPos).normalize();
      if (lookDir.dot(dir) <= IN_VIEW_HALF_COS) {
        visible = true;
        const right = cam.right;
        const up = cam.up;
        const rx = dir.dot(right);
        const uy = dir.dot(up);
        const len = Math.hypot(rx, uy);
        const sx = len > 1e-5 ? rx / len : 1;
        const sy = len > 1e-5 ? uy / len : 0;
        let ex = sx * ARROW_EDGE_SIDE_CM;
        const ey = sy * (sy >= 0 ? ARROW_EDGE_UP_CM : ARROW_EDGE_DOWN_CM);
        // The alert card sits bottom-centre, where a downward arrow would land. Project the card's
        // plate into the arrow's plane; if the arrow would land on it, push the arrow sideways past
        // the card's outer edge on the spot's side, clamped to the display edge.
        const rect = this.cardRectInArrowPlane(camPos, lookDir, right, up);
        if (
          rect !== null &&
          ex > rect.minX - ARROW_CARD_MARGIN_CM &&
          ex < rect.maxX + ARROW_CARD_MARGIN_CM &&
          ey > rect.minY - ARROW_CARD_MARGIN_CM &&
          ey < rect.maxY + ARROW_CARD_MARGIN_CM
        ) {
          ex = sx >= 0 ? rect.maxX + ARROW_CARD_MARGIN_CM : rect.minX - ARROW_CARD_MARGIN_CM;
          ex = Math.max(-ARROW_MAX_SIDE_CM, Math.min(ARROW_MAX_SIDE_CM, ex));
        }
        const arrowPos = camPos
          .add(lookDir.uniformScale(ARROW_AHEAD_CM))
          .add(right.uniformScale(ex))
          .add(up.uniformScale(ey));
        const spin = quat.angleAxis(Math.atan2(sy, sx), vec3.forward());
        const t = this.arrowRoot.getTransform();
        t.setWorldPosition(arrowPos);
        t.setWorldRotation(cam.getWorldRotation().multiply(spin));
      }
    }
    if (visible && !this.arrowShown && this.elapsed - this.alertStartElapsed > 0.8) {
      this.playChime();
    }
    this.arrowShown = visible;
    if (this.arrowRoot.enabled !== visible) this.arrowRoot.enabled = visible;
  }

  /**
   * The alert card's backplate as seen by the viewer, projected onto the arrow's plane (cm at
   * ARROW_AHEAD_CM in the camera's right/up frame), so the arrow can keep clear of the card
   * whatever the card's current distance or the globe's scale. Null when no card is up or it is
   * out of usable range.
   */
  private cardRectInArrowPlane(
    camPos: vec3,
    lookDir: vec3,
    right: vec3,
    up: vec3,
  ): { minX: number; maxX: number; minY: number; maxY: number } | null {
    if (!this.alertCard.visible) return null;
    const t = this.alertCard.root.getTransform();
    const pos = t.getWorldPosition();
    const rot = t.getWorldRotation();
    const plate = this.alertCard.plateRect;
    const corners = [
      new vec3(-plate.halfWidthCm, plate.topCm, 0),
      new vec3(plate.halfWidthCm, plate.topCm, 0),
      new vec3(-plate.halfWidthCm, plate.bottomCm, 0),
      new vec3(plate.halfWidthCm, plate.bottomCm, 0),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      const world = pos.add(rot.multiplyVec3(c));
      const v = world.sub(camPos);
      const depth = v.dot(lookDir);
      if (depth < 1) return null; // card at or behind the eyes: no meaningful projection
      const px = (v.dot(right) / depth) * ARROW_AHEAD_CM;
      const py = (v.dot(up) / depth) * ARROW_AHEAD_CM;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    return { minX, maxX, minY, maxY };
  }

  /**
   * The epicentre label's box in the label layout's view-angle frame, so the map names keep clear
   * of it (second-cut check 2026-10-21) the way the selected quake and its stem are kept clear by
   * the core's selectionObstacle. The Lens passes it into layoutLabels as an obstacle. Null while
   * the label is hidden or not yet posed. `frame` and `eye` are the same values the layout uses.
   */
  epicenterLabelObstacle(frame: ViewFrame, eye: Vec3): Box | null {
    if (this.epicenterLabelWorld === null || !this.epicenterLabel.getSceneObject().enabled) return null;
    const pos = this.epicenterLabelWorld;
    const centre = toViewAngles(frame, eye, fromLensVec(pos));
    const dist = Math.max(1, Math.hypot(pos.x - eye.x, pos.y - eye.y, pos.z - eye.z));
    const halfWCm = (estimateTextWidthEm(this.epicenterLabel.text) * EPICENTER_LABEL_EM_CM) / 2;
    const halfHCm = (1.2 * EPICENTER_LABEL_EM_CM) / 2;
    const rad = 180 / Math.PI;
    const halfWDeg = Math.atan(halfWCm / dist) * rad + EPICENTER_LABEL_MARGIN_DEG;
    const halfHDeg = Math.atan(halfHCm / dist) * rad + EPICENTER_LABEL_MARGIN_DEG;
    return { x0: centre.x - halfWDeg, y0: centre.y - halfHDeg, x1: centre.x + halfWDeg, y1: centre.y + halfHDeg };
  }

  /**
   * The epicentre ring (with its red marker and stem) as a label obstacle while the alert is open,
   * so no map name sits under the ring (committee's second review 2026-10-21: the pinned "Taiwan"
   * sat under it and read as "Ta...an"). Built with the core's selectionObstacle, exactly like the
   * selected-quake obstacle; the home country's name steps aside until the alert closes (pinned
   * labels keep their anchor, so "nearby open space" only happens when the anchor already clears
   * the ring). Null while no alert is active.
   */
  epicenterRingObstacle(frame: ViewFrame, eye: Vec3): Box | null {
    if (!this.alertActive || !this.epicenterRingVisual.enabled) return null;
    const q = SIMULATED_QUAKE;
    const R = this.ctx.globeRadiusCm;
    const world = this.ctx.content.getTransform().getWorldTransform();
    const scale = this.ctx.handle.getTransform().getWorldScale().y;
    const surface = world.multiplyPoint(toLensVec(geoToCartesian(q.lat, q.lon, R * LINE_RADIUS_FACTOR)));
    const marker = world.multiplyPoint(toLensVec(quakePosition(q.lat, q.lon, q.depthKm, R, SETTINGS.depthExaggeration)));
    const ringWorld = R * Math.sin((epicenterRingDeg(q, this.markerOpt()) * Math.PI) / 180) * scale;
    return selectionObstacle(frame, eye, fromLensVec(surface), fromLensVec(marker), ringWorld);
  }

  /**
   * The home marker (its octahedron and ring) as a label obstacle while the alert is open, built
   * the same way (committee's second review 2026-10-21). Null outside an alert: the marker alone
   * does not displace the pinned home-country name.
   */
  homeMarkerObstacle(frame: ViewFrame, eye: Vec3): Box | null {
    if (!this.alertActive || !this.homeMarkerVisual.enabled) return null;
    const home = this.home;
    const R = this.ctx.globeRadiusCm;
    const world = this.ctx.content.getTransform().getWorldTransform();
    const scale = this.ctx.handle.getTransform().getWorldScale().y;
    const p = fromLensVec(world.multiplyPoint(toLensVec(geoToCartesian(home.lat, home.lon, R * LINE_RADIUS_FACTOR))));
    const radius = Math.max(R * Math.sin((HOME_RING_DEG * Math.PI) / 180), this.markerOpt().baseSize * 1.8) * scale;
    return selectionObstacle(frame, eye, p, p, radius);
  }

  // ---------------------------------------------------------------- selection (details card)

  onSelection(q: Quake | null, nowMs: number): void {
    if (q === null || this.alertActive) {
      this.detailsCard.setVisible(false);
      return;
    }
    this.detailsCard.setText(quakeCardText(q, nowMs));
    this.detailsCard.setVisible(true);
  }

  /** Overlay the pick targets on the current strongest quakes (tour order). */
  updatePickTargets(quakes: Quake[]): void {
    const R = this.ctx.globeRadiusCm;
    for (let i = 0; i < this.pickObjects.length; i++) {
      const q = i < quakes.length ? quakes[i] : null;
      if (q === null) {
        if (this.pickObjects[i].enabled) this.pickObjects[i].enabled = false;
        this.pickIds[i] = "";
        continue;
      }
      const p = geoToCartesian(q.lat, q.lon, R * PICK_RADIUS_FACTOR);
      this.pickObjects[i].getTransform().setLocalPosition(toLensVec(p));
      this.pickObjects[i].enabled = true;
      this.pickIds[i] = q.id;
    }
  }

  private onPickTap(slot: number): void {
    if (this.mode !== "normal" || this.alertActive) return;
    const id = this.pickIds[slot];
    if (id !== "") this.ctx.selectQuakeById(id);
  }

  // ---------------------------------------------------------------- actions

  /** Fire the simulated alert and enter stage "during". */
  phoneAlert(): void {
    this.resetZoom(); // a re-fired alert mid-zoom starts from the plain globe
    this.alertActive = true;
    this.stage = "during";
    this.sentToContacts = false;
    this.alertStartElapsed = this.elapsed;
    this.arrowShown = false;
    this.ctx.selectQuakeById(""); // the epicentre takes over the globe
    this.setMode("normal");

    const home = this.homeConfirmed ? this.homeLatLon : DEFAULT_HOME;
    this.showHomeMarker(home);
    this.showEpicenter();
    this.showLine(home);

    // The map of your area, built once per alert from the confirmed home (learner's review
    // 2026-10-22). The zoom brings it up after the globe has turned to the epicentre.
    this.localMap = localMapFor(home, { lat: SIMULATED_QUAKE.lat, lon: SIMULATED_QUAKE.lon });
    this.mapView.build(this.localMap, this.ctx.globeRadiusCm, DEPTH_CLASS_COLORS[depthClass(SIMULATED_QUAKE.depthKm)]);
    this.zoomPhase = "turn";
    this.turnT = 0;
    this.zoomU = 0;

    const km = greatCircleKm(home.lat, home.lon, SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon);
    this.alertCard.setStage("during");
    this.alertCard.setDistance(distanceFromHomeText(km));
    this.alertCard.setDetails(alertDetailsText());
    this.alertCard.setStatus("");
    this.alertCard.setVisible(true);
    this.setEpicenterLabel(km);

    this.alertFacing = quatMultiply(alignmentRotation(this.ctx.viewerDirectionInGlobe()), facingRotation(SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon));
    this.refreshControls();
    this.playChime();
  }

  /** "Shaking stopped": advance from "during" to "after" and reveal the details and next steps. */
  advanceStage(): void {
    if (!this.alertActive) return;
    const next = nextStage(this.stage, "advance");
    if (next === this.stage) return;
    this.stage = next; // "after"
    this.alertCard.setStage("after");
    this.alertCard.setDetails(alertDetailsText());
    this.arrowShown = false;
    if (this.arrowRoot.enabled) this.arrowRoot.enabled = false; // the arrow belongs to the shaking stage
  }

  /** "I'm safe": only the "after" stage can close the alert (done). */
  imSafe(): void {
    if (!this.alertActive) return;
    if (nextStage(this.stage, "safe") !== "done") return;
    this.stage = "during"; // ready for the next alert
    this.closeAlert();
  }

  private closeAlert(): void {
    this.alertActive = false;
    this.alertFacing = null;
    // Reverse the zoom: the map shrinks and fades while the globe returns. If the map never came
    // up (the alert closed during the turn), there is nothing to play backwards.
    if (this.zoomPhase === "map" || this.zoomPhase === "in") {
      this.ctx.setGlobeVisible(true);
      this.zoomPhase = "out";
    } else if (this.zoomPhase === "turn") {
      this.resetZoom();
    }
    this.alertCard.setStage("during");
    this.alertCard.setVisible(false);
    this.epicenterLabel.getSceneObject().enabled = false;
    this.epicenterRingVisual.enabled = false;
    this.epicenterMarkerVisual.enabled = false;
    this.epicenterStemVisual.enabled = false;
    this.lineVisual.enabled = false;
    this.arrowRoot.enabled = false;
    this.arrowShown = false;
    if (!this.homeConfirmed) {
      this.homeMarkerVisual.enabled = false;
      this.homeRingVisual.enabled = false;
    }
    this.refreshControls();
  }

  enterHomeMode(): void {
    if (this.alertActive) return;
    this.setMode("home");
    this.pendingHome = this.homeConfirmed ? { lat: this.homeLatLon.lat, lon: this.homeLatLon.lon } : { lat: DEFAULT_HOME.lat, lon: DEFAULT_HOME.lon };
    this.showHomeMarker(this.pendingHome);
    this.showHint("Pinch the globe to place home, then Set as home", 0);
  }

  /** Called by the Lens when the globe is tapped in home mode; `hit` is a world point on the sphere. */
  globeTap(hit: vec3 | null): void {
    if (this.mode !== "home" || hit === null) return;
    // Direction from the globe centre to the hit, rotated into the spinning content's frame,
    // then read back as lat/lon (the inverse of geoToCartesian).
    const center = this.ctx.handle.getTransform().getWorldPosition();
    const dirWorld = hit.sub(center);
    const local = this.ctx.content.getTransform().getWorldRotation().invert().multiplyVec3(dirWorld);
    const len = local.length || 1;
    const lat = (Math.asin(local.y / len) * 180) / Math.PI;
    const lon = (Math.atan2(local.x, local.z) * 180) / Math.PI;
    this.pendingHome = { lat, lon };
    this.showHomeMarker(this.pendingHome);
    // A point has now been picked: offer "Set as home" (hidden until now, per the design brief).
    this.controlsCard.setConfirmHomeVisible(true);
    this.showHint("Pinch Set as home to confirm", 0);
  }

  confirmHome(): void {
    if (this.mode !== "home") return;
    this.homeConfirmed = true;
    this.homeLatLon = { lat: this.pendingHome.lat, lon: this.pendingHome.lon };
    this.showHomeMarker(this.homeLatLon);
    this.setMode("normal");
    this.showHint("Home set", 2.5);
    if (this.alertActive) {
      this.showLine(this.homeLatLon);
      const km = greatCircleKm(this.homeLatLon.lat, this.homeLatLon.lon, SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon);
      this.alertCard.setDistance(distanceFromHomeText(km));
      this.setEpicenterLabel(km);
    }
  }

  /** Show the on-globe epicentre label with the current home distance ("15 km from home"). */
  private setEpicenterLabel(km: number): void {
    this.epicenterLabel.text = formatDistanceKm(km) + " from home";
    this.epicenterLabel.getSceneObject().enabled = true;
  }

  enterCoverMode(): void {
    if (this.alertActive) return;
    this.setMode("cover");
    this.ensureHitSession();
    this.lastProbeHit = null;
    const cam = this.ctx.cameraTransform();
    const camPos = cam.getWorldPosition();
    // Seed a spot off to the side at floor height, so the arrow has something to point to even
    // without a pinch; pointing at a surface moves it (probeSurface) and a pinch commits (roomTap).
    const floorY = camPos.y - 120;
    const seed = camPos.add(cam.right.uniformScale(150));
    this.coverSpotWorld = new vec3(seed.x, floorY, seed.z);
    this.coverSpotNormal = null;
    this.placeCoverSpot();
    this.placementPlane.enabled = true;
    this.showHint("Point at a table or the floor and pinch to place your cover spot", 0, COVER_HINT_SIZE);
  }

  /**
   * Called by the Lens when the placement plane is tapped in cover mode. If the world-query probe
   * found a real surface a moment ago, commit the cover spot there (resting on that surface);
   * otherwise fall back to the placement plane at floor height (upright), as before.
   */
  roomTap(hit: vec3 | null): void {
    if (this.mode !== "cover") return;
    const cam = this.ctx.cameraTransform();
    const floorY = cam.getWorldPosition().y - 120;
    const probed = this.lastProbeHit !== null && this.elapsed - this.lastProbeElapsed < PROBE_FRESH_S;
    if (probed) {
      this.coverSpotWorld = this.lastProbeHit!.position;
      this.coverSpotNormal = this.lastProbeHit!.normal;
      print("Cover spot placed on a real surface (world-query hit)");
    } else if (hit !== null) {
      this.coverSpotWorld = new vec3(hit.x, floorY, hit.z);
      this.coverSpotNormal = null;
      print("Cover spot placed on the fallback placement plane (no surface hit)");
    }
    this.placeCoverSpot();
    this.placementPlane.enabled = false;
    this.setMode("normal");
    this.showHint("Cover spot set", 2.5);
  }

  sendContacts(): void {
    if (!this.alertActive || this.stage !== "after") return;
    this.sentToContacts = true;
    this.alertCard.setStatus(SENT_MESSAGE);
  }

  // ---------------------------------------------------------------- helpers

  private setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    const normal = mode === "normal";
    this.ctx.setManipulationEnabled(normal);
    if (mode !== "cover") {
      this.placementPlane.enabled = false;
      this.parkPlacementPlane();
    }
    // "Set as home" belongs to set-home mode and only after a point is picked; drop it otherwise.
    if (mode !== "home") this.controlsCard.setConfirmHomeVisible(false);
    if (mode !== "home" && mode !== "cover" && this.elapsed > this.hintUntil) {
      this.hint.getSceneObject().enabled = false;
    }
  }

  private showHint(text: string, seconds: number, size = HINT_SIZE): void {
    this.hint.text = text;
    this.hint.size = size;
    this.hint.getSceneObject().enabled = true;
    this.hintUntil = seconds > 0 ? this.elapsed + seconds : Number.MAX_VALUE;
  }

  private showHomeMarker(where: { lat: number; lon: number }): void {
    const R = this.ctx.globeRadiusCm;
    const opt = this.markerOpt();
    const p = geoToCartesian(where.lat, where.lon, R * LINE_RADIUS_FACTOR);
    const octa = triangleRenderMesh(buildOctahedron(opt.baseSize * 1.8));
    if (octa !== null) {
      this.homeMarkerVisual.mesh = octa;
      this.homeMarkerVisual.getSceneObject().getTransform().setLocalPosition(toLensVec(p));
      this.homeMarkerVisual.enabled = true;
    }
    const ring = triangleRenderMesh(buildSphereCircle(where.lat, where.lon, HOME_RING_DEG, R * LINE_RADIUS_FACTOR * 1.001, R * 0.01));
    if (ring !== null) {
      this.homeRingVisual.mesh = ring;
      this.homeRingVisual.enabled = true;
    }
  }

  private showEpicenter(): void {
    const R = this.ctx.globeRadiusCm;
    const opt = this.markerOpt();
    const q = SIMULATED_QUAKE;
    const p = quakePosition(q.lat, q.lon, q.depthKm, R, SETTINGS.depthExaggeration);
    const marker = triangleRenderMesh(buildOctahedron(highlightHalfSize(q, opt)));
    if (marker !== null) {
      this.epicenterMarkerVisual.mesh = marker;
      this.epicenterMarkerVisual.getSceneObject().getTransform().setLocalPosition(toLensVec(p));
      this.epicenterMarkerVisual.enabled = true;
    }
    const top = geoToCartesian(q.lat, q.lon, R * LINE_RADIUS_FACTOR);
    const stem = q.depthKm > 1 ? triangleRenderMesh(buildPrism(top, p, R * GEOMETRY.stemWidthFraction)) : null;
    if (stem !== null) {
      this.epicenterStemVisual.mesh = stem;
      this.epicenterStemVisual.enabled = true;
    } else {
      this.epicenterStemVisual.enabled = false;
    }
    const ring = triangleRenderMesh(buildEpicenterRing(q, opt));
    if (ring !== null) {
      this.epicenterRingVisual.mesh = ring;
      this.epicenterRingVisual.enabled = true;
    }
  }

  private showLine(home: { lat: number; lon: number }): void {
    const R = this.ctx.globeRadiusCm;
    const poly = greatCirclePolyline(home.lat, home.lon, SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon, 48);
    const meshes = polylinesToRibbonMeshes([poly], R * LINE_RADIUS_FACTOR * 1.002, R * 0.012);
    const mesh = meshes.length > 0 ? triangleRenderMesh(meshes[0]) : null;
    if (mesh !== null) {
      this.lineVisual.mesh = mesh;
      this.lineVisual.enabled = true;
    } else {
      this.lineVisual.enabled = false;
    }
  }

  private placeCoverSpot(): void {
    if (this.coverSpotWorld === null) return;
    const t = this.coverSpotRoot.getTransform();
    t.setWorldPosition(this.coverSpotWorld);
    // The marker's ring lies in its local XZ plane and its beam points along local +Y, so aligning
    // +Y to the surface normal makes the ring sit flat on the surface and the beam stand out of it.
    t.setWorldRotation(this.coverSpotNormal !== null ? this.upToNormal(this.coverSpotNormal) : toLensQuat({ x: 0, y: 0, z: 0, w: 1 }));
    this.coverSpotRoot.enabled = true;
  }

  /** Start the world-query session once (LensStudio:WorldQueryModule). Null session = plane fallback. */
  private ensureHitSession(): void {
    if (this.hitSession !== null || this.hitSessionTried) return;
    this.hitSessionTried = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wq: any = require("LensStudio:WorldQueryModule");
      this.hitSession = wq.createHitTestSession();
      this.hitSession.start();
      print("Cover spot: world-query session started");
    } catch (e) {
      this.hitSession = null;
      print("Cover spot: world query unavailable, using placement-plane fallback. " + e);
    }
  }

  /**
   * Cast the world-query ray along the current targeting interactor and remember the surface it
   * hits, so the next pinch can commit the cover spot there (roomTap). The marker itself is NOT moved
   * here: it stays at the seeded fallback until a pinch places it, which keeps the flow a deliberate
   * "point, then pinch" (per the brief) and keeps the seed out of view so the off-view arrow still
   * fires. Prints a throttled "probe hit" line so a DEBUG run shows whether a real surface was found.
   */
  private probeSurface(): void {
    if (this.hitSession === null) return;
    const interactors = SIK.InteractionManager.getTargetingInteractors();
    const interactor = interactors.length > 0 ? interactors[0] : null;
    if (interactor === null || interactor.startPoint === null || interactor.direction === null) return;
    const start = interactor.startPoint;
    const end = start.add(interactor.direction.normalize().uniformScale(PROBE_RANGE_CM));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.hitSession.hitTest(start, end, (result: any) => {
      if (result === null || result === undefined) return;
      const p: vec3 = result.position;
      const n: vec3 = result.normal;
      this.lastProbeHit = { position: p, normal: n };
      this.lastProbeElapsed = this.elapsed;
      if (this.elapsed - this.lastProbePrintElapsed > 0.5) {
        this.lastProbePrintElapsed = this.elapsed;
        print(
          "probe hit at (" + p.x.toFixed(1) + ", " + p.y.toFixed(1) + ", " + p.z.toFixed(1) + ") " +
            "normal (" + n.x.toFixed(2) + ", " + n.y.toFixed(2) + ", " + n.z.toFixed(2) + ")",
        );
      }
    });
  }

  /** Rotation taking local +Y onto the surface normal, so the flat marker rests on the surface. */
  private upToNormal(n: vec3): quat {
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
    const ny = n.y / len;
    const d = Math.max(-1, Math.min(1, ny)); // up . n, with up = (0, 1, 0)
    if (d > 0.9999) return toLensQuat({ x: 0, y: 0, z: 0, w: 1 });
    if (d < -0.9999) return toLensQuat(quatFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI));
    // axis = up x n = (n.z, 0, -n.x), normalized.
    const ax = n.z / len;
    const az = -n.x / len;
    const al = Math.sqrt(ax * ax + az * az) || 1;
    return toLensQuat(quatFromAxisAngle({ x: ax / al, y: 0, z: az / al }, Math.acos(d)));
  }

  /** Keep the big placement collider far from any pinch ray while it is not in use. */
  private parkPlacementPlane(): void {
    this.placementPlane.getTransform().setLocalPosition(new vec3(0, -100000, 0));
  }

  private playChime(): void {
    if (this.audio !== null && this.audio.audioTrack) {
      this.audio.play(1);
      print("Alert chime played");
    }
  }

  private scaledColor(rgb: [number, number, number], k: number): vec4 {
    return new vec4(rgb[0] * k, rgb[1] * k, rgb[2] * k, 1);
  }

  // Accessors used by the Lens for routing taps and for tests/inspection.
  get currentMode(): Mode {
    return this.mode;
  }

  get isAlertActive(): boolean {
    return this.alertActive;
  }

  /** The current home point (confirmed, else the default), for pinning the home country's label. */
  get home(): { lat: number; lon: number } {
    return this.homeConfirmed ? this.homeLatLon : DEFAULT_HOME;
  }
}
