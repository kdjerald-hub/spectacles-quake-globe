// GENERATED from core/format.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Text for the detail panel. English only (submission language).

import type { Quake } from "./usgs";
import { formatAge } from "./freshness";

export function describeQuake(q: Quake, nowMs: number): string {
  const depth = Math.max(0, Math.round(q.depthKm));
  const where = q.place.length > 0 ? q.place : "Unnamed location";
  return "M " + q.mag.toFixed(1) + "  -  " + depth + " km deep  -  " + formatAge(nowMs - q.timeMs) + "\n" + where;
}

export function describeCount(shown: number, omitted: number, label: string): string {
  const base = shown + " quakes, " + label;
  return omitted > 0 ? base + " (" + omitted + " smaller not drawn)" : base;
}
