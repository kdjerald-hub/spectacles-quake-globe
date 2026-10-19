// GENERATED from core/geo.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Geometry for a tabletop globe. Pure functions, no platform dependencies.
//
// Coordinate convention (right-handed, Y up; identical in Lens Studio and three.js):
//   lat = 0,  lon = 0    -> +Z  (faces the viewer when the globe is unrotated)
//   lat = +90            -> +Y  (north pole up)
//   lon = +90 (east)     -> +X  (east appears to the viewer's right)

export const EARTH_RADIUS_KM = 6371;

/** Deepest earthquakes are ~700 km; anything below this is clamped for display. */
export const MAX_DISPLAY_DEPTH_KM = 800;

/** Never place a point closer to the centre than this fraction of the globe radius. */
export const MIN_RADIUS_FRACTION = 0.05;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function geoToCartesian(latDeg: number, lonDeg: number, radius: number): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const c = Math.cos(lat);
  return {
    x: radius * c * Math.sin(lon),
    y: radius * Math.sin(lat),
    z: radius * c * Math.cos(lon),
  };
}

/**
 * Radius at which an event of the given depth is drawn.
 * Depth is scaled by `exaggeration` so subducting slabs are visible on a small globe;
 * the UI must state the factor (e.g. "depth x3").
 * Negative depths (events above the sea-level datum) are drawn on the surface.
 */
export function depthToRadius(depthKm: number, globeRadius: number, exaggeration: number): number {
  const d = clamp(depthKm, 0, MAX_DISPLAY_DEPTH_KM);
  const r = globeRadius * (1 - (d / EARTH_RADIUS_KM) * exaggeration);
  return Math.max(r, globeRadius * MIN_RADIUS_FRACTION);
}

export function quakePosition(
  latDeg: number,
  lonDeg: number,
  depthKm: number,
  globeRadius: number,
  exaggeration: number,
): Vec3 {
  return geoToCartesian(latDeg, lonDeg, depthToRadius(depthKm, globeRadius, exaggeration));
}

export function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const len = Math.hypot(axis.x, axis.y, axis.z);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  const s = Math.sin(angleRad / 2) / len;
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angleRad / 2) };
}

/** Hamilton product a*b: rotating by the result applies b first, then a. */
export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatRotateVector(q: Quat, v: Vec3): Vec3 {
  // v' = q * v * q^-1, expanded (q assumed unit length).
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

/** Spherical interpolation between unit quaternions, t in [0, 1]. Takes the short path. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let ka: number;
  let kb: number;
  if (cos > 0.9995) {
    ka = 1 - t;
    kb = t;
  } else {
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    ka = Math.sin((1 - t) * theta) / sin;
    kb = Math.sin(t * theta) / sin;
  }
  const out = {
    x: a.x * ka + bx * kb,
    y: a.y * ka + by * kb,
    z: a.z * ka + bz * kb,
    w: a.w * ka + bw * kb,
  };
  const n = Math.hypot(out.x, out.y, out.z, out.w);
  return { x: out.x / n, y: out.y / n, z: out.z / n, w: out.w / n };
}

/**
 * Rotation that turns the globe so the point (lat, lon) faces the viewer (+Z)
 * while keeping north up: first spin about Y by -lon, then tilt about X by +lat.
 */
export function facingRotation(latDeg: number, lonDeg: number): Quat {
  const spin = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, -lonDeg * DEG);
  const tilt = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, latDeg * DEG);
  return quatMultiply(tilt, spin);
}

/**
 * Rotation that takes +Z to the direction `toViewer` (need not be normalised), without roll.
 * Combined with facingRotation it turns a location toward wherever the viewer stands,
 * so a selected quake ends up facing the user even after they walk around the globe.
 */
export function alignmentRotation(toViewer: Vec3): Quat {
  const len = Math.hypot(toViewer.x, toViewer.y, toViewer.z);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  const yaw = Math.atan2(toViewer.x, toViewer.z);
  const pitch = Math.asin(clamp(toViewer.y / len, -1, 1));
  return quatMultiply(
    quatFromAxisAngle({ x: 0, y: 1, z: 0 }, yaw),
    quatFromAxisAngle({ x: 1, y: 0, z: 0 }, -pitch),
  );
}

/** Rotation about +Y by the given angle (degrees); used for the idle spin. */
export function spinRotation(angleDeg: number): Quat {
  return quatFromAxisAngle({ x: 0, y: 1, z: 0 }, angleDeg * DEG);
}

/**
 * Scale for rings drawn in the plane through the globe's centre, facing the viewer, so that a
 * ring of radius k x globeRadius appears exactly k times as large as the globe's outline.
 * Seen from `distance`, the outline of a sphere of radius r covers radius r / sqrt(1 - (r/d)^2)
 * in that plane: about 1.007 r from 100 cm, but 1.07 r once the globe is scaled up three times.
 * Returns 0 when the viewer is at or inside `minDistanceRatio` globe radii (nothing to outline).
 */
export function silhouetteScale(globeRadius: number, distance: number, minDistanceRatio = 1.05): number {
  if (!(distance > globeRadius * minDistanceRatio)) return 0;
  const k = globeRadius / distance;
  return 1 / Math.sqrt(1 - k * k);
}
