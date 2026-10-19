// Shared configuration. The Lens and the web preview both read this file, so the
// two cannot silently drift apart (one source of truth for every tunable).

import type { FeedId } from "./usgs.ts";

export type ViewId = "day" | "week" | "month";

export interface ViewDef {
  id: ViewId;
  /** Button label. */
  label: string;
  feed: FeedId;
  /** What the markers on screen represent. */
  description: string;
}

export const VIEWS: ViewDef[] = [
  { id: "day", label: "24 h", feed: "2.5_day", description: "M2.5+, past 24 h" },
  { id: "week", label: "7 days", feed: "2.5_week", description: "M2.5+, past 7 days" },
  // Over 30 days the global catalog is only complete for larger events, so M4.5+.
  { id: "month", label: "30 days", feed: "4.5_month", description: "M4.5+, past 30 days" },
];

/** Feed used for the "is today normal?" comparison (complete globally at M4.5+). */
export const ACTIVITY_FEED: FeedId = "4.5_month";
export const ACTIVITY_FEED_COVERAGE_DAYS = 30;

export const SETTINGS = {
  initialView: "week" as ViewId,
  /** Depth is drawn this many times deeper than true scale; the legend says so. */
  depthExaggeration: 3,
  /** Seconds between refreshes while data loads fine. */
  refreshSeconds: 300,
  /** Upper bound on markers drawn at once; the strongest are kept and the rest counted. */
  maxMarkers: 3000,
  /** How many of the strongest events the "Strongest" button cycles through. */
  tourSize: 10,
  /** Degrees per second of the idle spin when nothing is selected. */
  idleSpinDegPerSec: 6,
};

/** Shown on the panel and logged at startup ("Lens Opened: vX.Y.Z"), per the publishing checklist. */
export const LENS_VERSION = "0.1.0";

/**
 * Geometry proportions, as fractions of the globe radius (so the globe scales as one piece).
 * At the default 12 cm radius and 100 cm distance one Spectacles pixel is about 0.048 cm
 * (about 1000 px across 53 cm at 110 cm), so coastlines are about 2.5 px wide, the grid about
 * 1.7 px and the depth stem about 2.2 px. Thinner lines shimmer on a see-through display.
 */
export const GEOMETRY = {
  markerBaseFraction: 0.011,
  coastlineWidthFraction: 0.01,
  graticuleWidthFraction: 0.007,
  stemWidthFraction: 0.009,
  /** The ring around the selected epicentre: its angular radius on the globe, and its width. */
  epicenterRingDeg: 2.5,
  epicenterWidthFraction: 0.014,
};

/** Events newer than this glow and pulse. Shorter in the 24 h view, where everything is recent. */
export const RECENT_HOURS: Record<ViewId, number> = { day: 3, week: 24, month: 24 };

/**
 * Depth of the faint inner grid: the base of the mantle transition zone, near which the
 * deepest earthquakes stop. A reference for reading how deep a slab goes.
 */
export const INNER_GRID_DEPTH_KM = 660;

/** Two legend lines for the panel. What glows depends on the view (see RECENT_HOURS). */
export function legendText(view: ViewId): string {
  return (
    "orange: shallow < 70 km   yellow: 70-300 km   blue: deep > 300 km\n" +
    "depth x" + SETTINGS.depthExaggeration +
    "   glow: past " + RECENT_HOURS[view] + " h" +
    "   faint inner grid: " + INNER_GRID_DEPTH_KM + " km deep"
  );
}

export const FOOTER_TEXT = "Data: USGS earthquake catalog. Not a warning system.";

export function viewById(id: ViewId): ViewDef {
  for (const v of VIEWS) if (v.id === id) return v;
  throw new Error("unknown view: " + id);
}
