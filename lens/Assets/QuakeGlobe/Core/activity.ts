// GENERATED from core/activity.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// "Is today normal?" — compares the last 24 hours with the previous days.
//
// Method (deliberately assumption-light):
//   * Count events at or above a magnitude threshold in consecutive 24-hour windows
//     ending at the feed's generation time (not the device clock).
//   * Window 0 is "today"; windows 1..N are the baseline.
//   * Compare today with the baseline's empirical range and nearest-rank percentiles.
// No Poisson or other distribution is assumed, because aftershock sequences make
// daily counts strongly over-dispersed. This is a description of the recent past,
// never a forecast.
//
// Use M4.5+ for global comparisons: below that the catalog is far more complete
// in some regions than others, so a "global" count of small events is misleading.

import type { Quake } from "./usgs";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivityLevel = "busiest" | "busier" | "usual" | "quieter" | "quietest" | "insufficient";

export interface ActivitySummary {
  level: ActivityLevel;
  todayCount: number;
  baselineDays: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
  minMagnitude: number;
  referenceMs: number;
}

export interface ActivityOptions {
  minMagnitude?: number;
  baselineDays?: number;
  minBaselineDays?: number;
}

/**
 * counts[k] = events with referenceMs - (k+1)*DAY < time <= referenceMs - k*DAY.
 * Events after referenceMs are ignored (they cannot exist in a consistent feed).
 */
export function dailyCounts(quakes: Quake[], referenceMs: number, days: number, minMagnitude: number): number[] {
  const counts: number[] = new Array(days).fill(0);
  for (const q of quakes) {
    if (q.mag < minMagnitude) continue;
    const age = referenceMs - q.timeMs;
    if (age < 0) continue;
    // Window k holds ages in [k*DAY, (k+1)*DAY), i.e. the time interval defined above.
    const k = Math.floor(age / DAY_MS);
    if (k < days) counts[k]++;
  }
  return counts;
}

/** Nearest-rank percentile of an ascending-sorted array, p in (0, 1]. */
export function nearestRank(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const rank = Math.max(1, Math.ceil(p * sortedAsc.length));
  return sortedAsc[Math.min(rank, sortedAsc.length) - 1];
}

export function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

/**
 * Number of baseline windows fully covered by the data. The feed only reaches back
 * `coverageMs`; a partially covered window would read artificially low.
 */
function coveredBaselineDays(wanted: number, coverageMs: number): number {
  const fullDays = Math.floor(coverageMs / DAY_MS) - 1; // minus window 0 ("today")
  return Math.max(0, Math.min(wanted, fullDays));
}

export function summarizeActivity(
  quakes: Quake[],
  referenceMs: number,
  coverageMs: number,
  options: ActivityOptions = {},
): ActivitySummary {
  const minMagnitude = options.minMagnitude ?? 4.5;
  const wanted = options.baselineDays ?? 29;
  const minBaselineDays = options.minBaselineDays ?? 14;
  const baselineDays = coveredBaselineDays(wanted, coverageMs);
  const counts = dailyCounts(quakes, referenceMs, baselineDays + 1, minMagnitude);
  const todayCount = counts[0];
  const baseline = counts.slice(1).sort((a, b) => a - b);

  const empty: ActivitySummary = {
    level: "insufficient",
    todayCount,
    baselineDays: baseline.length,
    median: NaN,
    p10: NaN,
    p90: NaN,
    min: NaN,
    max: NaN,
    minMagnitude,
    referenceMs,
  };
  if (baseline.length < minBaselineDays) return empty;

  const s: ActivitySummary = {
    ...empty,
    median: median(baseline),
    p10: nearestRank(baseline, 0.1),
    p90: nearestRank(baseline, 0.9),
    min: baseline[0],
    max: baseline[baseline.length - 1],
  };
  // Ties at a percentile only count as unusual when that percentile is itself away
  // from the median; otherwise a flat month would label ordinary days as unusual.
  if (todayCount > s.max) s.level = "busiest";
  else if (todayCount < s.min) s.level = "quietest";
  else if (todayCount > s.p90 || (todayCount === s.p90 && s.p90 > s.median)) s.level = "busier";
  else if (todayCount < s.p10 || (todayCount === s.p10 && s.p10 < s.median)) s.level = "quieter";
  else s.level = "usual";
  return s;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Two short lines for a heads-up panel. Plain statements, no forecasting language. */
export function describeActivity(s: ActivitySummary): string {
  const mag = "M" + fmt(s.minMagnitude) + "+";
  const head = "Last 24 h: " + s.todayCount + " quakes " + mag;
  if (s.level === "insufficient") return head + "\nNot enough history to compare yet.";
  const range = "typical " + fmt(s.median) + ", range " + s.min + "-" + s.max + " over " + s.baselineDays + " days";
  const verdict: Record<Exclude<ActivityLevel, "insufficient">, string> = {
    busiest: "Busiest day in the past " + (s.baselineDays + 1) + " days",
    busier: "Busier than usual",
    usual: "Within the usual range",
    quieter: "Quieter than usual",
    quietest: "Quietest day in the past " + (s.baselineDays + 1) + " days",
  };
  return head + "\n" + verdict[s.level] + " (" + range + ")";
}
