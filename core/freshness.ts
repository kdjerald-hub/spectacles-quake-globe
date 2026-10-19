// Data freshness and retry policy.
//
// The feed carries its own generation timestamp. We compare it with the device clock
// to tell the user how old the picture is, and we refuse to pretend old data is live.

export type Freshness = "live" | "delayed" | "stale" | "clock_mismatch";

export const MINUTE_MS = 60 * 1000;

export interface FreshnessThresholds {
  /** Up to this age the data counts as live. USGS regenerates feeds every minute. */
  liveMaxMs: number;
  /** Up to this age the data is delayed but still recent. Older is stale. */
  delayedMaxMs: number;
  /** A feed stamped further in the future than this means the device clock is off. */
  futureToleranceMs: number;
}

export const DEFAULT_THRESHOLDS: FreshnessThresholds = {
  liveMaxMs: 15 * MINUTE_MS,
  delayedMaxMs: 60 * MINUTE_MS,
  futureToleranceMs: 5 * MINUTE_MS,
};

export function classifyFreshness(
  generatedMs: number,
  nowMs: number,
  t: FreshnessThresholds = DEFAULT_THRESHOLDS,
): Freshness {
  const age = nowMs - generatedMs;
  if (age < -t.futureToleranceMs) return "clock_mismatch";
  if (age <= t.liveMaxMs) return "live";
  if (age <= t.delayedMaxMs) return "delayed";
  return "stale";
}

/** "just now", "4 min ago", "3 h ago", "2 d ago". Negative ages read as "just now". */
export function formatAge(ageMs: number): string {
  if (ageMs < MINUTE_MS) return "just now";
  const min = Math.floor(ageMs / MINUTE_MS);
  if (min < 60) return min + " min ago";
  const h = Math.floor(min / 60);
  if (h < 48) return h + " h ago";
  return Math.floor(h / 24) + " d ago";
}

/** Exponential backoff: 30 s, 60 s, 120 s, ... capped at 10 min. attempt starts at 0. */
export function retryDelaySeconds(attempt: number, baseSeconds = 30, maxSeconds = 600): number {
  const a = Math.max(0, Math.floor(attempt));
  return Math.min(maxSeconds, baseSeconds * Math.pow(2, Math.min(a, 20)));
}

/** One status line combining freshness with what is on screen. */
export function describeFreshness(f: Freshness, ageMs: number, offline: boolean): string {
  if (offline) return "Offline - showing data from " + formatAge(ageMs);
  if (f === "clock_mismatch") return "Device clock looks wrong - data age unknown";
  if (f === "live") return "Updated " + formatAge(ageMs);
  if (f === "delayed") return "Delayed - updated " + formatAge(ageMs);
  return "Stale - last update " + formatAge(ageMs);
}
