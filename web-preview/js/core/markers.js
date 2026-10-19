// GENERATED from core/markers.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Triangle geometry for quake markers: one small octahedron per event,
// batched into one mesh per depth class so each batch needs a single material.

                                       
import { GEOMETRY } from "./config.js";
import { geoToCartesian, quakePosition } from "./geo.js";
import { LINE_RADIUS_FACTOR } from "./occluder.js";
import { buildSphereCircle } from "./shapes.js";
import { SELECTED_SCALE_PULSE, depthClass, magnitudeToSize } from "./style.js";
                                             

                               
                      
                    
                    
 

                                
                      
                            
                                                                           
                   
                                        
                       
 

const OCTA_DIRS                             = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
// Counter-clockwise when seen from outside.
const OCTA_FACES                             = [
  [0, 2, 4],
  [4, 2, 1],
  [1, 2, 5],
  [5, 2, 0],
  [4, 3, 0],
  [1, 3, 4],
  [5, 3, 1],
  [0, 3, 5],
];

export const VERTICES_PER_MARKER = OCTA_DIRS.length;

function emptyMesh()               {
  return { positions: [], normals: [], indices: [] };
}

function appendOctahedron(m              , cx        , cy        , cz        , s        )       {
  const start = m.positions.length / 3;
  for (const d of OCTA_DIRS) {
    m.positions.push(cx + d[0] * s, cy + d[1] * s, cz + d[2] * s);
    m.normals.push(d[0], d[1], d[2]);
  }
  for (const f of OCTA_FACES) m.indices.push(start + f[0], start + f[1], start + f[2]);
}

export function buildMarkerMeshes(quakes         , opt               )                                   {
  const maxVertices = opt.maxVertices ?? 65535;
  const out                                   = {
    shallow: emptyMesh(),
    intermediate: emptyMesh(),
    deep: emptyMesh(),
  };
  for (const q of quakes) {
    const m = out[depthClass(q.depthKm)];
    if (m.positions.length / 3 + VERTICES_PER_MARKER > maxVertices) {
      throw new Error("too many markers for one mesh; cap the list before building");
    }
    const p = quakePosition(q.lat, q.lon, q.depthKm, opt.globeRadius, opt.depthExaggeration);
    appendOctahedron(m, p.x, p.y, p.z, magnitudeToSize(q.mag, opt.baseSize));
  }
  return out;
}

/**
 * Larger octahedra around the given (newest) events, drawn additively and pulsing, so the
 * freshest quakes glow. One mesh for all depth classes; the marker keeps its own colour.
 */
export function buildHaloMesh(quakes         , opt               , scale = 1.9)               {
  const maxVertices = opt.maxVertices ?? 65535;
  const m = emptyMesh();
  for (const q of quakes) {
    if (m.positions.length / 3 + VERTICES_PER_MARKER > maxVertices) {
      throw new Error("too many halos for one mesh; cap the list before building");
    }
    const p = quakePosition(q.lat, q.lon, q.depthKm, opt.globeRadius, opt.depthExaggeration);
    appendOctahedron(m, p.x, p.y, p.z, magnitudeToSize(q.mag, opt.baseSize) * scale);
  }
  return m;
}

/** A radial line from the surface straight down to the event: makes depth readable. */
export function buildDepthStem(q       , opt               )                                             {
  const top = geoToCartesian(q.lat, q.lon, opt.globeRadius);
  const p = quakePosition(q.lat, q.lon, q.depthKm, opt.globeRadius, opt.depthExaggeration);
  return { positions: [top.x, top.y, top.z, p.x, p.y, p.z], indices: [0, 1] };
}

/** The selected event is drawn this many times larger than its ordinary marker. */
export const HIGHLIGHT_SCALE = 2.2;

/** Half-size of the selected event's marker (before it pulses). */
export function highlightHalfSize(q       , opt               )         {
  return magnitudeToSize(q.mag, opt.baseSize) * HIGHLIGHT_SCALE;
}

/**
 * Angular radius of the ring around the selected epicentre: GEOMETRY.epicenterRingDeg, or more
 * for a strong event, so the ring stays clear of the marker at its largest pulse (1.5 times its
 * half-size). A white ring drawn over the white marker would simply vanish into it.
 */
export function epicenterRingDeg(q       , opt               )         {
  const clear = (1.5 * highlightHalfSize(q, opt) * SELECTED_SCALE_PULSE.hi) / opt.globeRadius;
  const deg = (Math.asin(Math.min(1, clear)) * 180) / Math.PI;
  return Math.max(GEOMETRY.epicenterRingDeg, deg);
}

/**
 * Ring on the surface around the selected event's epicentre, just above the coastlines so it
 * is never hidden by them. Faces outward, so the far side of the globe culls it like the lines.
 */
export function buildEpicenterRing(q       , opt               )               {
  return buildSphereCircle(
    q.lat,
    q.lon,
    epicenterRingDeg(q, opt),
    opt.globeRadius * LINE_RADIUS_FACTOR * 1.001,
    opt.globeRadius * GEOMETRY.epicenterWidthFraction,
  );
}

/** A single larger octahedron for the selected event. */
export function buildHighlightMesh(q       , opt               , scale = HIGHLIGHT_SCALE)               {
  const m = emptyMesh();
  const p = quakePosition(q.lat, q.lon, q.depthKm, opt.globeRadius, opt.depthExaggeration);
  appendOctahedron(m, p.x, p.y, p.z, magnitudeToSize(q.mag, opt.baseSize) * scale);
  return m;
}
