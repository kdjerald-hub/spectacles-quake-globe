// Lens-only logic for the earthquake-alert overlay (done criteria 2-5).
//
// Platform-independent and side-effect free, like the Core modules, but it lives in Scripts/
// because Core/ is generated from ../core and would overwrite anything added here. It imports
// Core types and helpers (reading Core is fine; editing it is not). The Lens component and the
// LEAF tests are the only callers.

import type { Quake } from "../Core/usgs";
import { EARTH_RADIUS_KM, geoToCartesian } from "../Core/geo";
import { formatAge } from "../Core/freshness";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * The simulated national alert. The real glasses would read the alert off the phone; the
 * preview fires it from a button. Hard-coded from the USGS catalog event us7000m9g4, the
 * M7.4 Hualien, Taiwan earthquake of 2024-04-03 (2024-04-02 23:58:12 UTC = 07:58 local).
 * https://earthquake.usgs.gov/earthquakes/eventpage/us7000m9g4
 */
export const SIMULATED_QUAKE: Quake = {
  id: "sim-hualien-2024-04-03",
  lat: 23.8356,
  lon: 121.5976,
  depthKm: 40,
  mag: 7.4,
  timeMs: 1712102292173,
  place: "15 km S of Hualien City, Taiwan",
};

/** Local wall-clock label for the simulated event, shown instead of a relative age. */
export const SIMULATED_TIME_LABEL = "2024-04-03 07:58 local time";

/**
 * Default home: Taipei, Taiwan. The learner "lives in an earthquake zone", so home starts in
 * one. A pinch on the globe in set-home mode moves it; "Set as home" confirms. Having a default
 * means the alert always has a distance to show, even in a quick demo.
 */
export const DEFAULT_HOME = { lat: 25.033, lon: 121.565 };

// ---- alert card copy ------------------------------------------------------

export const ALERT_TITLE = "EARTHQUAKE ALERT";
/** Must stay on screen: the demo fires a simulation, never a real alert. */
export const ALERT_SIMULATION_NOTE = "SIMULATION - demo, not a real alert";
/** Official guidance during shaking (ready.gov / USGS): stay where you are and take cover. */
export const ALERT_GUIDANCE = "Drop, Cover, Hold On";
export const SEND_BUTTON_LABEL = "Send to emergency contacts";
export const SENT_MESSAGE = "Sent to emergency contacts";
export const SAFE_BUTTON_LABEL = "I'm safe";
export const SAFE_SPOT_ARROW_HINT = "Safe spot is behind you";

// ---- geometry / text helpers ---------------------------------------------

/** Great-circle (haversine) distance between two lat/lon points, in kilometres. */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatLat(lat: number): string {
  return Math.abs(lat).toFixed(2) + "°" + (lat >= 0 ? "N" : "S");
}

export function formatLon(lon: number): string {
  return Math.abs(lon).toFixed(2) + "°" + (lon >= 0 ? "E" : "W");
}

export function formatDistanceKm(km: number): string {
  if (km < 10) return km.toFixed(1) + " km";
  return Math.round(km) + " km";
}

/**
 * Body text for the quake details card (done criterion 2): coordinates, magnitude, depth,
 * time and place. `timeLabel` overrides the relative age for a fixed historical event (the
 * simulated quake); otherwise the age is shown, like the rest of the app. The nearest plate
 * boundary is a placeholder until the plate-boundary data module arrives in the next pass.
 */
export function quakeCardText(q: Quake, nowMs: number, timeLabel?: string): string {
  const depth = Math.max(0, Math.round(q.depthKm));
  const where = q.place.length > 0 ? q.place : "Unnamed location";
  const when = timeLabel !== undefined ? timeLabel : formatAge(nowMs - q.timeMs);
  return (
    "M " + q.mag.toFixed(1) + "    depth " + depth + " km\n" +
    formatLat(q.lat) + ",  " + formatLon(q.lon) + "\n" +
    where + "\n" +
    when + "\n" +
    "Nearest plate boundary: added with plate data"
  );
}

/** One line for the alert card: how far the epicentre is from the set home location. */
export function distanceFromHomeText(km: number): string {
  return "Epicentre " + formatDistanceKm(km) + " from home";
}

/**
 * A polyline [lon0, lat0, lon1, lat1, ...] tracing the great circle from one point to another,
 * for the line drawn on the globe from home to the epicentre. Sampled by slerping the two
 * surface unit vectors so the line hugs the sphere instead of cutting a chord through it.
 */
export function greatCirclePolyline(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  segments = 48,
): number[] {
  const a = geoToCartesian(lat1, lon1, 1);
  const b = geoToCartesian(lat2, lon2, 1);
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let x: number;
    let y: number;
    let z: number;
    if (omega < 1e-6) {
      x = a.x;
      y = a.y;
      z = a.z;
    } else {
      const s0 = Math.sin((1 - t) * omega) / sinOmega;
      const s1 = Math.sin(t * omega) / sinOmega;
      x = a.x * s0 + b.x * s1;
      y = a.y * s0 + b.y * s1;
      z = a.z * s0 + b.z * s1;
    }
    const len = Math.hypot(x, y, z) || 1;
    out.push(Math.atan2(x, z) * RAD, Math.asin(y / len) * RAD);
  }
  return out;
}
