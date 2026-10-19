// GENERATED from core/freshness.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Data freshness and retry policy.
//
// The feed carries its own generation timestamp. We compare it with the device clock
// to tell the user how old the picture is, and we refuse to pretend old data is live.

                                                                        

export const MINUTE_MS = 60 * 1000;

                                      
                                                                                     
                    
                                                                             
                       
                                                                                      
                            
 

export const DEFAULT_THRESHOLDS                      = {
  liveMaxMs: 15 * MINUTE_MS,
  delayedMaxMs: 60 * MINUTE_MS,
  futureToleranceMs: 5 * MINUTE_MS,
};

export function classifyFreshness(
  generatedMs        ,
  nowMs        ,
  t                      = DEFAULT_THRESHOLDS,
)            {
  const age = nowMs - generatedMs;
  if (age < -t.futureToleranceMs) return "clock_mismatch";
  if (age <= t.liveMaxMs) return "live";
  if (age <= t.delayedMaxMs) return "delayed";
  return "stale";
}

/** "just now", "4 min ago", "3 h ago", "2 d ago". Negative ages read as "just now". */
export function formatAge(ageMs        )         {
  if (ageMs < MINUTE_MS) return "just now";
  const min = Math.floor(ageMs / MINUTE_MS);
  if (min < 60) return min + " min ago";
  const h = Math.floor(min / 60);
  if (h < 48) return h + " h ago";
  return Math.floor(h / 24) + " d ago";
}

/** Exponential backoff: 30 s, 60 s, 120 s, ... capped at 10 min. attempt starts at 0. */
export function retryDelaySeconds(attempt        , baseSeconds = 30, maxSeconds = 600)         {
  const a = Math.max(0, Math.floor(attempt));
  return Math.min(maxSeconds, baseSeconds * Math.pow(2, Math.min(a, 20)));
}

/** One status line combining freshness with what is on screen. */
export function describeFreshness(f           , ageMs        , offline         )         {
  if (offline) return "Offline - showing data from " + formatAge(ageMs);
  if (f === "clock_mismatch") return "Device clock looks wrong - data age unknown";
  if (f === "live") return "Updated " + formatAge(ageMs);
  if (f === "delayed") return "Delayed - updated " + formatAge(ageMs);
  return "Stale - last update " + formatAge(ageMs);
}
