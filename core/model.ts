// Platform-independent application state.
//
// The Lens component and the web preview are thin adapters: they fetch bytes, call
// `ingest`/`fail`, and render whatever `viewModel()` returns. All decisions about what
// to show (and what to admit is missing or old) live here, where they are unit-tested.

import { FeedError, capForDisplay, parseFeed, strongestFirst } from "./usgs.ts";
import type { FeedId, FeedParseResult, Quake } from "./usgs.ts";
import { DAY_MS, describeActivity, summarizeActivity } from "./activity.ts";
import { classifyFreshness, describeFreshness, retryDelaySeconds } from "./freshness.ts";
import type { Freshness } from "./freshness.ts";
import { describeCount, describeQuake } from "./format.ts";
import { ACTIVITY_FEED, ACTIVITY_FEED_COVERAGE_DAYS, RECENT_HOURS, SETTINGS, VIEWS, viewById } from "./config.ts";
import type { ViewDef, ViewId } from "./config.ts";

export interface FeedSlot {
  result: FeedParseResult | null;
  /** Consecutive failures since the last good response. */
  failures: number;
  lastError: string;
}

export interface ViewModel {
  view: ViewDef;
  hasData: boolean;
  freshness: Freshness | "none";
  statusLine: string;
  countLine: string;
  activityText: string;
  detailText: string;
  /** Events to draw, already capped. */
  markers: Quake[];
  /** The newest of `markers` (see RECENT_HOURS), drawn with a pulsing glow. */
  recent: Quake[];
  omitted: number;
  selected: Quake | null;
  /** Changes whenever `markers` changes, so adapters rebuild meshes only when needed. */
  markersVersion: number;
}

function emptySlot(): FeedSlot {
  return { result: null, failures: 0, lastError: "" };
}

export class GlobeModel {
  viewId: ViewId;
  selectedId = "";
  slots: Record<string, FeedSlot> = {};
  markersVersion = 0;
  /** Word used in on-screen hints: "Pinch" on glasses, "Click" in the browser preview. */
  hintVerb = "Pinch";

  constructor(initialView: ViewId = SETTINGS.initialView) {
    this.viewId = initialView;
    for (const v of VIEWS) this.slots[v.feed] = emptySlot();
    this.slots[ACTIVITY_FEED] = this.slots[ACTIVITY_FEED] ?? emptySlot();
  }

  get view(): ViewDef {
    return viewById(this.viewId);
  }

  /** Feeds the current screen needs, current view first. */
  feedsToFetch(): FeedId[] {
    const out: FeedId[] = [this.view.feed];
    if (ACTIVITY_FEED !== this.view.feed) out.push(ACTIVITY_FEED);
    return out;
  }

  /** Accepts raw JSON. Bad data counts as a failure; good data replaces the old picture. */
  ingest(feed: FeedId, raw: unknown): void {
    let parsed: FeedParseResult;
    try {
      parsed = parseFeed(raw);
    } catch (e) {
      this.fail(feed, e instanceof FeedError ? e.message : "unreadable data");
      return;
    }
    const slot = this.slots[feed] ?? (this.slots[feed] = emptySlot());
    const prev = slot.result;
    // A feed older than what we already show is ignored rather than allowed to roll time back.
    if (prev !== null && parsed.generatedMs < prev.generatedMs) return;
    slot.result = parsed;
    slot.failures = 0;
    slot.lastError = "";
    if (feed === this.view.feed) {
      this.markersVersion++;
      if (this.selectedId !== "" && !parsed.quakes.some((q) => q.id === this.selectedId)) this.selectedId = "";
    }
  }

  fail(feed: FeedId, message: string): void {
    const slot = this.slots[feed] ?? (this.slots[feed] = emptySlot());
    slot.failures++;
    slot.lastError = message;
  }

  /** Seconds until this feed should be fetched again, right after a fetch completed. */
  nextFetchDelaySeconds(feed: FeedId): number {
    const slot = this.slots[feed];
    if (slot === undefined || slot.failures === 0) return SETTINGS.refreshSeconds;
    return retryDelaySeconds(slot.failures - 1);
  }

  /**
   * Seconds until a feed is due when (re)entering a view or starting up, from the age of
   * the data on hand: 0 when there is none or it is older than the refresh interval.
   * Clamped to [0, refreshSeconds], so a wrong device clock can cause at most one early
   * fetch, never a loop (after a fetch, nextFetchDelaySeconds takes over).
   */
  refreshDueInSeconds(feed: FeedId, nowMs: number): number {
    const slot = this.slots[feed];
    if (slot === undefined || slot.result === null) return 0;
    if (slot.failures > 0) return retryDelaySeconds(slot.failures - 1);
    const ageSeconds = (nowMs - slot.result.generatedMs) / 1000;
    return Math.min(SETTINGS.refreshSeconds, Math.max(0, SETTINGS.refreshSeconds - ageSeconds));
  }

  setView(id: ViewId): void {
    if (id === this.viewId) return;
    viewById(id); // throws on unknown ids
    this.viewId = id;
    this.selectedId = "";
    this.markersVersion++;
  }

  /** The strongest events in the current view, in tour order. */
  tour(): Quake[] {
    const r = this.slots[this.view.feed].result;
    return r === null ? [] : strongestFirst(r.quakes).slice(0, SETTINGS.tourSize);
  }

  /** Step through the tour; wraps around. Returns the newly selected event, if any. */
  selectNext(): Quake | null {
    const tour = this.tour();
    if (tour.length === 0) return null;
    const i = tour.findIndex((q) => q.id === this.selectedId);
    const next = tour[(i + 1) % tour.length];
    this.selectedId = next.id;
    return next;
  }

  clearSelection(): void {
    this.selectedId = "";
  }

  viewModel(nowMs: number, online: boolean): ViewModel {
    const view = this.view;
    const slot = this.slots[view.feed];
    const r = slot.result;

    if (r === null) {
      const status = slot.failures > 0
        ? "Could not load data (" + slot.lastError + "), retrying in " + this.nextFetchDelaySeconds(view.feed) + " s"
        : online ? "Loading earthquake data..." : "Waiting for an internet connection...";
      return {
        view,
        hasData: false,
        freshness: "none",
        statusLine: status,
        countLine: "",
        activityText: this.activityText(),
        detailText: "",
        markers: [],
        recent: [],
        omitted: 0,
        selected: null,
        markersVersion: this.markersVersion,
      };
    }

    const age = nowMs - r.generatedMs;
    const freshness = classifyFreshness(r.generatedMs, nowMs);
    let status = describeFreshness(freshness, age, !online);
    if (online && slot.failures > 0) status += " (update failed, retrying)";
    if (r.skipped > 0) status += " - " + r.skipped + " invalid records ignored";

    const { kept, omitted } = capForDisplay(r.quakes, SETTINGS.maxMarkers);
    const recentCutoff = nowMs - RECENT_HOURS[view.id] * 3600 * 1000;
    const recent = kept.filter((q) => q.timeMs >= recentCutoff);
    const selected = this.selectedId === "" ? null : r.quakes.find((q) => q.id === this.selectedId) ?? null;
    const tour = this.tour();
    let detail = this.hintVerb + " Strongest to tour the " + tour.length + " largest quakes.";
    if (selected !== null) {
      const pos = tour.findIndex((q) => q.id === selected.id);
      detail = describeQuake(selected, nowMs) + (pos >= 0 ? "\nStrongest " + (pos + 1) + " of " + tour.length : "");
    }

    return {
      view,
      hasData: true,
      freshness,
      statusLine: status,
      countLine: describeCount(kept.length, omitted, view.description),
      activityText: this.activityText(),
      detailText: tour.length === 0 ? "No quakes in this window." : detail,
      markers: kept,
      recent,
      omitted,
      selected,
      markersVersion: this.markersVersion,
    };
  }

  activityText(): string {
    const a = this.slots[ACTIVITY_FEED].result;
    if (a === null) return "Comparing with the past month once 30-day data arrives.";
    const s = summarizeActivity(a.quakes, a.generatedMs, ACTIVITY_FEED_COVERAGE_DAYS * DAY_MS);
    return describeActivity(s);
  }
}
