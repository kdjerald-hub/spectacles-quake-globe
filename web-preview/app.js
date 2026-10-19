// Browser preview of the Lens. Uses the exact same core modules (built by tools/build.mjs),
// so what you see here is what the Lens computes, drawn with the same geometry: flat ribbons
// for lines, octahedra for quakes, the same glows and the same atmosphere. Only the renderer
// and the input differ.
//
// URL options:  ?fixture   use bundled USGS snapshots (offline, deterministic)
//               ?static    no idle spin and no pulsing (stable screenshots)
//               ?view=day|week|month
//               ?select=N  preselect the N-th strongest event once data arrives
//               ?focus=lat,lon   turn a location toward the viewer without selecting it
//               ?cam=azimuthDeg,elevationDeg,distance   place the camera (default 0,7,3.6)
//               ?debug     expose projection probes for orientation checks

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GlobeModel } from "./js/core/model.js";
import { FOOTER_TEXT, GEOMETRY, INNER_GRID_DEPTH_KM, RECENT_HOURS, SETTINGS, VIEWS } from "./js/core/config.js";
import { feedUrl } from "./js/core/usgs.js";
import { graticule, polylinesToRibbonMeshes } from "./js/core/lines.js";
import { buildEpicenterRing, buildHaloMesh, buildMarkerMeshes, highlightHalfSize } from "./js/core/markers.js";
import { buildOctahedron, buildPrism, buildRing } from "./js/core/shapes.js";
import {
  ATMOSPHERE_RINGS,
  COASTLINE_COLOR,
  DEPTH_CLASSES,
  DEPTH_CLASS_COLORS,
  DEPTH_CLASS_LABELS,
  EPICENTER_COLOR,
  EPICENTER_PULSE,
  GRATICULE_COLOR,
  HALO_COLOR,
  HALO_PULSE,
  HIGHLIGHT_COLOR,
  INNER_GRID_COLOR,
  SELECTED_SCALE_PULSE,
  pulse,
  toHex,
} from "./js/core/style.js";
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
} from "./js/core/geo.js";
import { COASTLINE_110M } from "./js/data/coastline110m.js";
import { LINE_RADIUS_FACTOR, OCCLUDER_RADIUS_FACTOR, buildInwardSphere } from "./js/core/occluder.js";

const params = new URLSearchParams(location.search);
const FIXTURE = params.has("fixture");
const STATIC = params.has("static");
const PRESELECT = Number(params.get("select") || 0);
const FOCUS = (params.get("focus") || "").split(",").map(Number).filter((n) => Number.isFinite(n)).slice(0, 2);
if (FOCUS.length !== 2) FOCUS.length = 0;
const CAM = (params.get("cam") || "").split(",").map(Number);

const RADIUS = 1;
const MARKER_OPTIONS = {
  globeRadius: RADIUS,
  depthExaggeration: SETTINGS.depthExaggeration,
  baseSize: RADIUS * GEOMETRY.markerBaseFraction,
};

const model = new GlobeModel(VIEWS.some((v) => v.id === params.get("view")) ? params.get("view") : SETTINGS.initialView);
model.hintVerb = "Click";

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = vignette();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 100);
{
  const az = Number.isFinite(CAM[0]) ? CAM[0] : 0;
  const el = Number.isFinite(CAM[1]) ? CAM[1] : 7;
  const d = Number.isFinite(CAM[2]) ? CAM[2] : 3.6;
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  camera.position.set(d * Math.cos(e) * Math.sin(a), d * Math.sin(e), d * Math.cos(e) * Math.cos(a));
}
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.6;
controls.maxDistance = 8;

/**
 * Faint vignette behind the globe, so it sits in space on a monitor. (On the glasses the
 * background is the room itself.) Drawn as the scene background rather than in CSS, so the
 * additive glows add onto it instead of replacing it.
 */
function vignette() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size * 0.47, 0, size / 2, size / 2, size * 0.72);
  grad.addColorStop(0, "#08111d");
  grad.addColorStop(0.55, "#050910");
  grad.addColorStop(1, "#020305");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // Dark gradients band visibly in 8 bits; one level of fixed noise hides the steps.
  const img = g.getImageData(0, 0, size, size);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const n = (seed >>> 30) - 1; // -1, 0, 1 or 2
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function triangleMesh(m, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(m.normals, 3));
  g.setIndex(m.indices);
  return new THREE.Mesh(g, material);
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    child.geometry?.dispose();
    group.remove(child);
  }
}

/** Additive, non-depth-writing material: on the glasses a glow is simply extra light. */
function glowMaterial(rgb) {
  return new THREE.MeshBasicMaterial({
    color: toHex(rgb),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

function setBrightness(material, rgb, k) {
  material.color.setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k, THREE.SRGBColorSpace);
}

const globe = new THREE.Group();
scene.add(globe);

// Lines are the Lens's ribbons, facing outward; three.js culls back faces by default, so the
// far half of every line is dropped exactly as on the glasses.
const gridMaterial = new THREE.MeshBasicMaterial({ color: toHex(GRATICULE_COLOR) });
// Coastlines cross grid lines at the same radius; a small depth offset lets them win.
const coastMaterial = new THREE.MeshBasicMaterial({
  color: toHex(COASTLINE_COLOR),
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
for (const m of polylinesToRibbonMeshes(graticule(30, 5), RADIUS * LINE_RADIUS_FACTOR, RADIUS * GEOMETRY.graticuleWidthFraction)) {
  globe.add(triangleMesh(m, gridMaterial));
}
for (const m of polylinesToRibbonMeshes(COASTLINE_110M, RADIUS * LINE_RADIUS_FACTOR, RADIUS * GEOMETRY.coastlineWidthFraction)) {
  globe.add(triangleMesh(m, coastMaterial));
}
// Faint inner grid where the deepest quakes stop (core/config.ts): a ruler for slabs.
const innerMaterial = new THREE.MeshBasicMaterial({ color: toHex(INNER_GRID_COLOR) });
const innerRadius = depthToRadius(INNER_GRID_DEPTH_KM, RADIUS, SETTINGS.depthExaggeration);
for (const m of polylinesToRibbonMeshes(graticule(60, 6), innerRadius, RADIUS * GEOMETRY.graticuleWidthFraction)) {
  globe.add(triangleMesh(m, innerMaterial));
}

// Dark far hemisphere (see core/occluder.ts): on glasses it would be black, i.e. invisible;
// here it is a shade lighter than the background so the globe reads as a volume on a monitor.
globe.add(triangleMesh(buildInwardSphere(RADIUS * OCCLUDER_RADIUS_FACTOR, 32, 64), new THREE.MeshBasicMaterial({ color: 0x0c1828 })));

const markerMaterials = {};
for (const c of DEPTH_CLASSES) markerMaterials[c] = new THREE.MeshBasicMaterial({ color: toHex(DEPTH_CLASS_COLORS[c]) });
const markerGroup = new THREE.Group();
globe.add(markerGroup);

function rebuildMarkers(quakes) {
  clearGroup(markerGroup);
  const meshes = buildMarkerMeshes(quakes, MARKER_OPTIONS);
  for (const c of DEPTH_CLASSES) if (meshes[c].indices.length > 0) markerGroup.add(triangleMesh(meshes[c], markerMaterials[c]));
}

// The newest quakes glow and pulse (RECENT_HOURS in core/config.ts).
const haloMaterial = glowMaterial(HALO_COLOR);
const haloGroup = new THREE.Group();
globe.add(haloGroup);
let haloKey = "";

function updateHalos(recent) {
  // The newest set changes as time passes, not only when data arrives.
  const key = recent.map((q) => q.id).join(",");
  if (key === haloKey) return;
  haloKey = key;
  clearGroup(haloGroup);
  if (recent.length > 0) haloGroup.add(triangleMesh(buildHaloMesh(recent, MARKER_OPTIONS), haloMaterial));
}

// Selection, as in the Lens: a larger white marker that breathes, a stem from the surface down
// to the event, and a glowing ring around the epicentre.
const highlightMaterial = new THREE.MeshBasicMaterial({ color: toHex(HIGHLIGHT_COLOR) });
const epicenterMaterial = glowMaterial(EPICENTER_COLOR);
const highlightGroup = new THREE.Group();
globe.add(highlightGroup);
let highlightMarker = null;
let highlightedId = "";

function updateHighlight(q) {
  const id = q ? q.id : "";
  if (id === highlightedId) return;
  highlightedId = id;
  clearGroup(highlightGroup);
  highlightMarker = null;
  if (!q) return;
  const p = quakePosition(q.lat, q.lon, q.depthKm, RADIUS, SETTINGS.depthExaggeration);
  highlightMarker = triangleMesh(buildOctahedron(highlightHalfSize(q, MARKER_OPTIONS)), highlightMaterial);
  highlightMarker.position.set(p.x, p.y, p.z);
  highlightGroup.add(highlightMarker);
  // A surface event has no depth to show, and a zero-length prism has no area.
  if (q.depthKm > 1) {
    const top = geoToCartesian(q.lat, q.lon, RADIUS * LINE_RADIUS_FACTOR);
    highlightGroup.add(triangleMesh(buildPrism(top, p, RADIUS * GEOMETRY.stemWidthFraction), highlightMaterial));
  }
  highlightGroup.add(triangleMesh(buildEpicenterRing(q, MARKER_OPTIONS), epicenterMaterial));
}

// Atmosphere: rings around the outline, facing the camera and sized to the outline as seen
// from the camera's distance (silhouetteScale). Not part of the spinning globe.
const atmosphere = new THREE.Group();
scene.add(atmosphere);
for (const ring of ATMOSPHERE_RINGS) {
  atmosphere.add(triangleMesh(buildRing(RADIUS * ring.inner, RADIUS * ring.outer, 128), glowMaterial(ring.rgb)));
}

function updateAtmosphere() {
  const s = silhouetteScale(RADIUS, camera.position.length());
  atmosphere.visible = s > 0;
  if (s === 0) return;
  const q = alignmentRotation({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
  atmosphere.quaternion.set(q.x, q.y, q.z, q.w);
  atmosphere.scale.setScalar(s);
}

// ---------- data ----------
let fixtureNow = 0;
const nowMs = () => (FIXTURE ? fixtureNow : Date.now());
const timers = {};
const inflight = {};

async function fetchFeed(id) {
  if (inflight[id]) return;
  inflight[id] = true;
  try {
    const url = FIXTURE ? "../tests/fixtures/usgs_" + id + ".geojson" : feedUrl(id);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const raw = await res.json();
    model.ingest(id, raw);
    if (FIXTURE && raw && raw.metadata) fixtureNow = Math.max(fixtureNow, raw.metadata.generated + 60_000);
  } catch (e) {
    model.fail(id, e && e.message ? e.message : "network error");
  } finally {
    inflight[id] = false;
  }
  clearTimeout(timers[id]);
  if (!FIXTURE) timers[id] = setTimeout(() => fetchFeed(id), model.nextFetchDelaySeconds(id) * 1000);
  render();
}

function ensureFeeds() {
  for (const id of model.feedsToFetch()) if (!model.slots[id].result && !inflight[id]) fetchFeed(id);
}

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const controlsEl = $("controls");
const viewButtons = {};
for (const v of VIEWS) {
  const b = document.createElement("button");
  b.textContent = v.label;
  b.onclick = () => {
    model.setView(v.id);
    ensureFeeds();
    render();
  };
  controlsEl.appendChild(b);
  viewButtons[v.id] = b;
}
const strongest = document.createElement("button");
strongest.textContent = "Strongest";
strongest.onclick = () => {
  model.selectNext();
  render();
};
controlsEl.appendChild(strongest);
const spin = document.createElement("button");
spin.textContent = "Spin";
spin.onclick = () => {
  model.clearSelection();
  render();
};
controlsEl.appendChild(spin);

const swatch = (rgb, extra = "") =>
  '<span class="dot' + extra + '" style="background:#' + toHex(rgb).toString(16).padStart(6, "0") + '"></span>';
$("legend").innerHTML =
  DEPTH_CLASSES.map((c) => swatch(DEPTH_CLASS_COLORS[c]) + DEPTH_CLASS_LABELS[c]).join("") +
  '<div class="muted" style="margin-top:4px">Depth drawn x' + SETTINGS.depthExaggeration + ". Marker size grows with magnitude.<br>" +
  swatch(HALO_COLOR, " glow") + 'Glowing: <span id="recent"></span>. Faint inner grid: ' + INNER_GRID_DEPTH_KM + " km deep.<br>" +
  FOOTER_TEXT + "</div>";

let renderedVersion = -1;
let preselected = false;
let selected = null;
// The turn toward the viewer is computed once, when a selection is made, and then held,
// so the viewer can walk (orbit) around afterwards to look at the slab from the side.
let selectionTarget = null;

function viewerDirection() {
  const v = camera.position.clone().normalize();
  return { x: v.x, y: v.y, z: v.z };
}

function render() {
  const vm = model.viewModel(nowMs(), navigator.onLine);
  if (!preselected && PRESELECT > 0 && vm.hasData) {
    preselected = true;
    for (let i = 0; i < PRESELECT; i++) model.selectNext();
    return render();
  }
  $("status").textContent = vm.statusLine;
  $("count").textContent = vm.countLine;
  $("activity").textContent = vm.activityText;
  $("detail").textContent = vm.detailText;
  $("recent").textContent = "past " + RECENT_HOURS[vm.view.id] + " h";
  if (vm.markersVersion !== renderedVersion) {
    rebuildMarkers(vm.markers);
    renderedVersion = vm.markersVersion;
  }
  updateHalos(vm.recent);
  if ((vm.selected ? vm.selected.id : "") !== (selected ? selected.id : "")) {
    selectionTarget = vm.selected
      ? quatMultiply(alignmentRotation(viewerDirection()), facingRotation(vm.selected.lat, vm.selected.lon))
      : null;
  }
  selected = vm.selected;
  updateHighlight(selected);
  for (const v of VIEWS) viewButtons[v.id].classList.toggle("active", v.id === vm.view.id);
  spin.classList.toggle("active", selected === null);
}

// ---------- animation ----------
let current = { x: 0, y: 0, z: 0, w: 1 };
let spinDeg = 200; // start with the Pacific facing the viewer
let last = performance.now();

function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  const seconds = t / 1000;
  let target;
  if (selected && selectionTarget) {
    target = selectionTarget;
  } else if (FOCUS.length === 2) {
    target = quatMultiply(alignmentRotation(viewerDirection()), facingRotation(FOCUS[0], FOCUS[1]));
  } else {
    if (!STATIC) spinDeg += SETTINGS.idleSpinDegPerSec * dt;
    target = spinRotation(spinDeg);
  }
  current = quatSlerp(current, target, STATIC ? 1 : 1 - Math.exp(-dt * 3));
  globe.quaternion.set(current.x, current.y, current.z, current.w);

  // Glows breathe as in the Lens; ?static holds them at full brightness for screenshots.
  const level = (spec) => (STATIC ? spec.hi : pulse(seconds, spec));
  setBrightness(haloMaterial, HALO_COLOR, level(HALO_PULSE));
  if (highlightMarker) {
    highlightMarker.scale.setScalar(STATIC ? 1 : pulse(seconds, SELECTED_SCALE_PULSE));
    setBrightness(epicenterMaterial, EPICENTER_COLOR, level(EPICENTER_PULSE));
  }

  controls.update();
  updateAtmosphere();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener("online", render);
window.addEventListener("offline", render);
setInterval(render, 1000); // keeps "updated N min ago" honest

// ?debug exposes a projection probe so orientation can be verified numerically.
if (params.has("debug")) {
  window.__probe = (lat, lon) => {
    const r = Math.cos((lat * Math.PI) / 180);
    const p = new THREE.Vector3(
      RADIUS * r * Math.sin((lon * Math.PI) / 180),
      RADIUS * Math.sin((lat * Math.PI) / 180),
      RADIUS * r * Math.cos((lon * Math.PI) / 180),
    ).applyQuaternion(globe.quaternion);
    const facing = p.dot(camera.position.clone().normalize()) > 0;
    const ndc = p.clone().project(camera);
    return { x: +ndc.x.toFixed(4), y: +ndc.y.toFixed(4), facing };
  };
  window.__selected = () => selected && { lat: selected.lat, lon: selected.lon, mag: selected.mag };
  // Apparent radius of the globe's outline and of the innermost atmosphere ring, in pixels.
  window.__outline = () => {
    const toPx = (v) => {
      const n = v.clone().project(camera);
      return { x: ((n.x + 1) / 2) * window.innerWidth, y: ((1 - n.y) / 2) * window.innerHeight };
    };
    const centre = toPx(new THREE.Vector3(0, 0, 0));
    const d = camera.position.length();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    // A point on the outline: tangent from the camera, in the camera's up direction.
    const tangent = new THREE.Vector3().copy(camera.position).multiplyScalar(1 / (d * d)).add(up.clone().multiplyScalar(Math.sqrt(1 - 1 / (d * d))));
    const ring = up.clone().multiplyScalar(ATMOSPHERE_RINGS[0].inner * RADIUS * atmosphere.scale.x);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return { outline: +dist(toPx(tangent), centre).toFixed(2), innerRing: +dist(toPx(ring), centre).toFixed(2) };
  };
}

render();
ensureFeeds();
requestAnimationFrame(frame);
