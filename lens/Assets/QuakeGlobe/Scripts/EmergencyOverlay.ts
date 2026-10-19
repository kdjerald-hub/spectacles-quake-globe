// The earthquake-alert overlay (done criteria 2-5), built on top of the live globe.
//
// It owns every new scene object: the two cards, the home / epicentre / safe-spot markers,
// the home-to-epicentre line, the off-view arrow, the quake pick targets and the chime. The
// Lens component hands it the shared globe objects (handle, spinning content, camera) and
// drives its lifecycle; all the decisions about what the overlay shows live here.
//
// Globe-attached visuals are children of `content`, so they spin and scale with the globe.
// Room-space objects (cards, safe spot, arrow) hang off the Lens root and are posed each frame.
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
import { LINE_RADIUS_FACTOR } from "../Core/occluder";
import { EPICENTER_COLOR, EPICENTER_PULSE, DEPTH_CLASS_COLORS, depthClass, pulse } from "../Core/style";
import { buildEpicenterRing, highlightHalfSize } from "../Core/markers";
import type { MarkerOptions, TriangleMesh } from "../Core/markers";
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
import {
  ALERT_GUIDANCE,
  ALERT_SIMULATION_NOTE,
  ALERT_TITLE,
  DEFAULT_HOME,
  SAFE_BUTTON_LABEL,
  SEND_BUTTON_LABEL,
  SENT_MESSAGE,
  SIMULATED_QUAKE,
  SIMULATED_TIME_LABEL,
  distanceFromHomeText,
  greatCircleKm,
  greatCirclePolyline,
  quakeCardText,
} from "./Emergency";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";

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
}

type Mode = "normal" | "home" | "safe";

const CARD_WIDTH_CM = 18;
/** Horizontal gap between the globe's surface and the inner edge of a side card. */
const CARD_MARGIN_CM = 2;
/**
 * Side cards sit a little behind the globe's plane as well as beside it. On the narrow SPECS
 * display there is little room next to a 24 cm globe at 1 m; the extra depth shrinks the card
 * just enough to keep it fully in view and clear of the globe's silhouette.
 */
const CARD_BACK_CM = 30;
/** Marker / line colours stay light (cyan, mint): the quakes remain the only saturated colour. */
const HOME_COLOR: [number, number, number] = [0.5, 0.9, 1.0];
const LINE_COLOR: [number, number, number] = [0.6, 0.9, 1.0];
const SAFE_COLOR: [number, number, number] = [0.55, 1.0, 0.8];
/** Number of strongest quakes given a pinch target on the globe. */
const PICK_SLOTS = 12;
/** Pick targets sit just proud of the surface so a pinch hits them before the globe collider. */
const PICK_RADIUS_FACTOR = 1.03;
/** Half-angle of the "comfortably in view" cone; the arrow shows when the safe spot is outside it. */
const IN_VIEW_HALF_COS = Math.cos((26 * Math.PI) / 180);

function buildArrowMesh(size: number): TriangleMesh {
  const pts: [number, number][] = [[1.5, 0], [-0.8, 0.9], [-0.8, -0.9]];
  const positions: number[] = [];
  const normals: number[] = [];
  for (const p of pts) {
    positions.push(p[0] * size, p[1] * size, 0);
    normals.push(0, 0, 1);
  }
  return { positions, normals, indices: [0, 1, 2] };
}

export class EmergencyOverlay {
  private readonly ctx: GlobeContext;
  private mode: Mode = "normal";

  private homeConfirmed = false;
  private homeLatLon = { lat: DEFAULT_HOME.lat, lon: DEFAULT_HOME.lon };
  private pendingHome = { lat: DEFAULT_HOME.lat, lon: DEFAULT_HOME.lon };
  private safeSpotWorld: vec3 | null = null;
  private alertActive = false;
  private sentToContacts = false;
  private alertFacing: Quat | null = null;
  private elapsed = 0;
  private hintUntil = 0;
  private placed = false;

  private controlsCard!: ControlsCard;
  private detailsCard!: DetailsCard;
  private alertCard!: AlertCard;
  private hint!: Text;

  private epicenterRingVisual!: RenderMeshVisual;
  private epicenterRingMaterial!: Material;
  private epicenterMarkerVisual!: RenderMeshVisual;
  private epicenterStemVisual!: RenderMeshVisual;
  private lineVisual!: RenderMeshVisual;
  private homeMarkerVisual!: RenderMeshVisual;
  private homeRingVisual!: RenderMeshVisual;

  private safeSpotRoot!: SceneObject;
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

    // Alert card to the left of the globe, details card to the right (see updatePoses).
    this.alertCard = new AlertCard(
      this.ctx.root,
      CARD_WIDTH_CM,
      { title: ALERT_TITLE, simNote: ALERT_SIMULATION_NOTE, guidance: ALERT_GUIDANCE, sendLabel: SEND_BUTTON_LABEL, safeLabel: SAFE_BUTTON_LABEL },
      () => this.sendContacts(),
      () => this.imSafe(),
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
        onSetSafe: () => this.enterSafeMode(),
      },
      this.ctx.font,
    );
    this.controlsCard.setVisible(false); // shown once the globe is placed (onPlaced)

    this.hint = createText(this.ctx.root, "Overlay hint", new vec3(0, 0, 0), {
      size: 36,
      color: [0.85, 0.92, 1.0],
      widthCm: 34,
      heightCm: 2.2,
      centered: true,
      font: this.ctx.font,
    });
    this.hint.getSceneObject().enabled = false;

    // Epicentre of the simulated quake (shown only during an alert).
    this.epicenterRingMaterial = glowMaterial(base, EPICENTER_COLOR);
    this.epicenterRingVisual = createMeshObject("Alert epicentre ring", content, null, this.epicenterRingMaterial);
    this.epicenterMarkerVisual = createMeshObject("Alert epicentre marker", content, null, tintedMaterial(base, DEPTH_CLASS_COLORS[depthClass(SIMULATED_QUAKE.depthKm)]));
    this.epicenterStemVisual = createMeshObject("Alert epicentre stem", content, null, tintedMaterial(base, [1, 1, 1]));
    this.lineVisual = createMeshObject("Home to epicentre line", content, null, glowMaterial(base, LINE_COLOR));

    // Home marker on the globe.
    this.homeMarkerVisual = createMeshObject("Home marker", content, null, glowMaterial(base, HOME_COLOR));
    this.homeRingVisual = createMeshObject("Home ring", content, null, glowMaterial(base, HOME_COLOR));

    // Safe-spot marker in the room: a flat glowing ring, a dot and an upright beam.
    this.safeSpotRoot = createEmptyObject("Safe spot", this.ctx.root);
    const safeMat = glowMaterial(base, SAFE_COLOR);
    const ring = createMeshObject("Safe ring", this.safeSpotRoot, triangleRenderMesh(buildRing(18, 20, 64)), safeMat);
    ring.getSceneObject().getTransform().setLocalRotation(toLensQuat(quatFromAxisAngle({ x: 1, y: 0, z: 0 }, -Math.PI / 2)));
    createMeshObject("Safe dot", this.safeSpotRoot, triangleRenderMesh(buildOctahedron(3)), safeMat);
    createMeshObject("Safe beam", this.safeSpotRoot, triangleRenderMesh(buildPrism({ x: 0, y: 0, z: 0 }, { x: 0, y: 34, z: 0 }, 1.4)), safeMat);
    this.safeSpotRoot.enabled = false;

    // Off-view arrow, posed in front of the camera each frame.
    this.arrowRoot = createEmptyObject("Safe spot arrow", this.ctx.root);
    createMeshObject("Arrow", this.arrowRoot, triangleRenderMesh(buildArrowMesh(3.2)), glowMaterial(base, SAFE_COLOR));
    this.arrowRoot.enabled = false;

    // Large invisible plane that catches a pinch "in the room" while setting the safe spot.
    this.placementPlane = createEmptyObject("Safe spot placement", this.ctx.root);
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

  /** The controls card shows while no alert is active; the alert card takes its place otherwise. */
  private refreshControls(): void {
    this.controlsCard.setVisible(this.placed && !this.alertActive);
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number): void {
    this.elapsed += dt;
    if (this.alertActive) {
      this.epicenterRingMaterial.mainPass.baseColor = this.scaledColor(EPICENTER_COLOR, pulse(this.elapsed, EPICENTER_PULSE));
    }
    if (this.mode === "normal" && this.elapsed > this.hintUntil && this.hint.getSceneObject().enabled) {
      this.hint.getSceneObject().enabled = false;
    }
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
    const offset = this.ctx.globeRadiusCm * scale + CARD_WIDTH_CM / 2 + CARD_MARGIN_CM;
    const back = forward.uniformScale(-CARD_BACK_CM);

    const leftCenter = globeCenter.add(right.uniformScale(-offset)).add(back);
    const rightCenter = globeCenter.add(right.uniformScale(offset)).add(back);
    this.poseCard(this.controlsCard, leftCenter, camPos, this.controlsCard.contentHeightCm);
    this.poseCard(this.alertCard, leftCenter, camPos, this.alertCard.contentHeightCm);
    this.poseCard(this.detailsCard, rightCenter, camPos, this.detailsCard.contentHeightCm);

    // Hint floats just above the globe.
    if (this.hint.getSceneObject().enabled) {
      const hintPos = globeCenter.add(new vec3(0, this.ctx.globeRadiusCm * scale + 3, 0));
      const ht = this.hint.getSceneObject().getTransform();
      ht.setWorldPosition(hintPos);
      ht.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(hintPos)))));
    }

    // Safe-spot placement plane catches a room pinch while setting the safe spot. Keep it beyond
    // the side cards (which sit CARD_BACK_CM behind the globe) so it never occludes their buttons:
    // a pinch aimed at a card hits the nearer card, while a pinch into open space still lands here.
    // (At 110 cm it sat in front of the cards and swallowed the ray to "Phone alert received".)
    if (this.mode === "safe") {
      const lookDir = cam.forward.uniformScale(-1).normalize();
      const planeDist = camPos.distance(globeCenter) + CARD_BACK_CM + 60;
      const planePos = camPos.add(lookDir.uniformScale(planeDist));
      const pt = this.placementPlane.getTransform();
      pt.setWorldPosition(planePos);
      pt.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(planePos)))));
    }

    this.updateArrow(cam, camPos);
  }

  private poseCard(card: { root: SceneObject; anyHovered: () => boolean }, center: vec3, camPos: vec3, heightCm: number): void {
    if (!card.root.enabled || card.anyHovered()) return;
    const pos = center.add(new vec3(0, heightCm / 2, 0));
    const t = card.root.getTransform();
    t.setWorldPosition(pos);
    t.setWorldRotation(toLensQuat(alignmentRotation(fromLensVec(camPos.sub(pos)))));
  }

  private updateArrow(cam: Transform, camPos: vec3): void {
    const show = this.alertActive && this.safeSpotWorld !== null;
    if (!show) {
      if (this.arrowRoot.enabled) this.arrowRoot.enabled = false;
      return;
    }
    const lookDir = cam.forward.uniformScale(-1).normalize();
    const toSafe = this.safeSpotWorld!.sub(camPos);
    const dir = toSafe.normalize();
    const inView = lookDir.dot(dir) > IN_VIEW_HALF_COS;
    if (inView) {
      if (this.arrowRoot.enabled) this.arrowRoot.enabled = false;
      return;
    }
    const right = cam.right;
    const up = cam.up;
    const rx = dir.dot(right);
    const uy = dir.dot(up);
    const angle = Math.atan2(uy, rx);
    const arrowPos = camPos.add(lookDir.uniformScale(60)).add(right.uniformScale(rx * 10)).add(up.uniformScale(uy * 10));
    const billboard = alignmentRotation(fromLensVec(camPos.sub(arrowPos)));
    const spin = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, angle);
    const t = this.arrowRoot.getTransform();
    t.setWorldPosition(arrowPos);
    t.setWorldRotation(toLensQuat(quatMultiply(billboard, spin)));
    if (!this.arrowRoot.enabled) this.arrowRoot.enabled = true;
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

  phoneAlert(): void {
    this.alertActive = true;
    this.sentToContacts = false;
    this.ctx.selectQuakeById(""); // the epicentre takes over the globe
    this.setMode("normal");

    const home = this.homeConfirmed ? this.homeLatLon : DEFAULT_HOME;
    this.showHomeMarker(home);
    this.showEpicenter();
    this.showLine(home);

    const km = greatCircleKm(home.lat, home.lon, SIMULATED_QUAKE.lat, SIMULATED_QUAKE.lon);
    const sim = SIMULATED_QUAKE;
    this.alertCard.setBody(
      "M " + sim.mag.toFixed(1) + "    depth " + sim.depthKm + " km\n" +
      sim.place + "\n" +
      SIMULATED_TIME_LABEL,
    );
    this.alertCard.setDistance(distanceFromHomeText(km));
    this.alertCard.setStatus("");
    this.alertCard.setVisible(true);

    this.alertFacing = quatMultiply(alignmentRotation(this.ctx.viewerDirectionInGlobe()), facingRotation(sim.lat, sim.lon));
    this.refreshControls();
    this.playChime();
  }

  imSafe(): void {
    this.alertActive = false;
    this.alertFacing = null;
    this.alertCard.setVisible(false);
    this.epicenterRingVisual.enabled = false;
    this.epicenterMarkerVisual.enabled = false;
    this.epicenterStemVisual.enabled = false;
    this.lineVisual.enabled = false;
    this.arrowRoot.enabled = false;
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
    this.showHint("Pinch the globe to place home, then Set as Home", 0);
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
    this.showHint("Pinch Set as Home to confirm", 0);
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
    }
  }

  enterSafeMode(): void {
    if (this.alertActive) return;
    this.setMode("safe");
    const cam = this.ctx.cameraTransform();
    const camPos = cam.getWorldPosition();
    // Seed a spot off to the side at floor height, so the arrow has something to point to even
    // without a room pinch; a pinch on the placement plane moves it (roomTap).
    const floorY = camPos.y - 120;
    const seed = camPos.add(cam.right.uniformScale(150));
    this.safeSpotWorld = new vec3(seed.x, floorY, seed.z);
    this.placeSafeSpot();
    this.placementPlane.enabled = true;
    this.showHint("Pinch in front of you to place your safe spot", 0);
  }

  /** Called by the Lens when the placement plane is tapped in safe mode. */
  roomTap(hit: vec3 | null): void {
    if (this.mode !== "safe") return;
    const cam = this.ctx.cameraTransform();
    const floorY = cam.getWorldPosition().y - 120;
    if (hit !== null) this.safeSpotWorld = new vec3(hit.x, floorY, hit.z);
    this.placeSafeSpot();
    this.placementPlane.enabled = false;
    this.setMode("normal");
    this.showHint("Safe spot set", 2.5);
  }

  sendContacts(): void {
    if (!this.alertActive) return;
    this.sentToContacts = true;
    this.alertCard.setStatus(SENT_MESSAGE);
  }

  // ---------------------------------------------------------------- helpers

  private setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    const normal = mode === "normal";
    this.ctx.setManipulationEnabled(normal);
    if (mode !== "safe") {
      this.placementPlane.enabled = false;
      this.parkPlacementPlane();
    }
    if (mode !== "home" && mode !== "safe" && this.elapsed > this.hintUntil) {
      this.hint.getSceneObject().enabled = false;
    }
  }

  private showHint(text: string, seconds: number): void {
    this.hint.text = text;
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
    const ring = triangleRenderMesh(buildSphereCircle(where.lat, where.lon, 2.2, R * LINE_RADIUS_FACTOR * 1.001, R * 0.01));
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

  private placeSafeSpot(): void {
    if (this.safeSpotWorld === null) return;
    this.safeSpotRoot.getTransform().setWorldPosition(this.safeSpotWorld);
    this.safeSpotRoot.enabled = true;
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
}
