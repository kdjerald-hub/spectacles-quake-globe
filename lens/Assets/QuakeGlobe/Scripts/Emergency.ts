// Lens-only logic for the earthquake-alert overlay (done criteria 2-5).
//
// Platform-independent and side-effect free, like the Core modules, but it lives in Scripts/
// because Core/ is generated from ../core and would overwrite anything added here. It imports
// Core types and helpers (reading Core is fine; editing it is not). The Lens component and the
// LEAF tests are the only callers.

import type { Quake } from "../Core/usgs";
import type { AlertEvent } from "../Core/hazards";
import { EARTH_RADIUS_KM, geoToCartesian } from "../Core/geo";
import { formatAge } from "../Core/freshness";
import { nearestBoundary } from "../Core/plates";

// The alert copy that varies by hazard (headline, the "during" and "after" lines, the spot label,
// the "Shaking stopped" label, the guidance source) comes from the EARTHQUAKE profile in
// Core/hazards.ts; the overlay reads it from there. This file keeps only what is specific to the
// simulated event (the Hualien quake, its home default) and the Lens's own button labels.

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
 * The simulated alert as a CAP-style event (Core/hazards.AlertEvent). The overlay picks its hazard
 * profile with profileForAlert(SIMULATED_ALERT) rather than naming EARTHQUAKE directly, so another
 * hazard plugs in as data. The `sent` time is SIMULATED_QUAKE.timeMs as ISO 8601.
 */
export const SIMULATED_ALERT: AlertEvent = {
  event: "Earthquake",
  sent: "2024-04-02T23:58:12.173Z",
  senderName: "Simulation",
  areaDesc: "Hualien County",
  origin: { lat: SIMULATED_QUAKE.lat, lon: SIMULATED_QUAKE.lon, depthKm: SIMULATED_QUAKE.depthKm },
  magnitude: SIMULATED_QUAKE.mag,
  simulated: true,
};

/**
 * Default home: Hualien City, Taiwan. The 2024 alert reached Hualien (and 11 other counties); the
 * demo stands there. A pinch on the globe in set-home mode moves it; "Set as home" confirms. Having
 * a default means the alert always has a distance to show, even in a quick demo.
 */
export const DEFAULT_HOME = { lat: 23.9667, lon: 121.6 };

// ---- alert card copy ------------------------------------------------------
// The headline, the "during"/"after" lines, the "Shaking stopped" label and the guidance source
// come from Core/hazards.ts (EARTHQUAKE). These constants are the parts that are the Lens's own:
// the simulation note, the two "after"-stage button labels, the magnitude reading, and the detail
// text for the simulated event.

/** Must stay on screen in every alert stage: the demo fires a simulation, never a real alert. */
export const ALERT_SIMULATION_NOTE = "SIMULATION - demo, not a real alert";
export const SEND_BUTTON_LABEL = "Send to emergency contacts";
/** Shown once the send button is pinched; the "(simulated)" keeps the demo honest (nothing is sent). */
export const SENT_MESSAGE = "Sent to emergency contacts (simulated)";
export const SAFE_BUTTON_LABEL = "I'm safe";
/** This event as reported on both scales: USGS moment magnitude, and Taiwan CWA local magnitude
 * ML 7.1 from the CWA's official report No. 019 (7.2 was the first figure that morning). */
export const SIMULATED_MAG_LABEL = "USGS M7.4 (Taiwan CWA: ML 7.1)";

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
 * time and place, and the nearest plate boundary. `timeLabel` overrides the relative age for a
 * fixed historical event (the simulated quake); otherwise the age is shown, like the rest of the
 * app. The boundary comes from the unit-tested PB2002 lookup (Core/plates.nearestBoundary) and
 * reads like "Subduction zone, Pacific and Okhotsk plates, 40 km away".
 */
export function quakeCardText(q: Quake, nowMs: number, timeLabel?: string): string {
  const depth = Math.max(0, Math.round(q.depthKm));
  const where = q.place.length > 0 ? q.place : "Unnamed location";
  const when = timeLabel !== undefined ? timeLabel : formatAge(nowMs - q.timeMs);
  const nb = nearestBoundary(q.lat, q.lon);
  const boundary = nb ? "Nearest boundary: " + nb.text : "Nearest boundary: none nearby";
  return (
    "M " + q.mag.toFixed(1) + "    depth " + depth + " km\n" +
    formatLat(q.lat) + ",  " + formatLon(q.lon) + "\n" +
    where + "\n" +
    when + "\n" +
    boundary
  );
}

/** One line for the alert card: how far the epicentre is from the set home location. */
export function distanceFromHomeText(km: number): string {
  return "Epicentre " + formatDistanceKm(km) + " from home";
}

/**
 * The details shown once the shaking stops (alert stage "after"): the magnitude on both the USGS
 * and Taiwan CWA scales, the depth with its source ("Depth 40 km (USGS)"), the local wall-clock
 * time, the place, and the nearest plate boundary (Core/plates.nearestBoundary). The simulated
 * event is fixed, so the time is a fixed label rather than a relative age.
 */
export function alertDetailsText(): string {
  const q = SIMULATED_QUAKE;
  const nb = nearestBoundary(q.lat, q.lon);
  const boundary = nb ? "Nearest boundary: " + nb.text : "Nearest boundary: none nearby";
  return (
    SIMULATED_MAG_LABEL + "\n" +
    "Depth " + Math.max(0, Math.round(q.depthKm)) + " km (USGS)\n" +
    SIMULATED_TIME_LABEL + "\n" +
    q.place + "\n" +
    boundary
  );
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
