// GENERATED from core/hazards.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Hazard profiles: what an alert tells the user and asks of them, kept apart from how a Lens
// draws it. The Lens wires up one profile, the earthquake; another hazard plugs in as data.

/**
 * The parts of an incoming alert that the guidance needs. Field names follow the Common Alerting
 * Protocol (CAP 1.2), the format that public alert systems such as IPAWS use.
 */
export interface AlertEvent {
  /** CAP `event`, for example "Earthquake". Selects the hazard profile. */
  event: string;
  /** CAP `sent`, ISO 8601. */
  sent: string;
  /** CAP `senderName`, shown as the source. */
  senderName: string;
  /** CAP `areaDesc`: the region, which is all a phone alert text carries. */
  areaDesc: string;
  /** Where it started, once an official report gives it; phone alerts don't carry this. */
  origin?: { lat: number; lon: number; depthKm?: number };
  magnitude?: number;
  /** Drills and replays. The Lens marks every screen of these SIMULATION. */
  simulated: boolean;
}

/** During: act now, no gesture needed. After: the danger has passed, details and next steps. */
export type AlertStage = "during" | "after" | "done";

export interface HazardProfile {
  id: string;
  /** Matched against `AlertEvent.event`, ignoring case. */
  capEvent: string;
  title: string;
  /** The one instruction shown biggest the moment the alert arrives. */
  headline: string;
  /** Short lines under the headline. */
  during: string[];
  /** What the marked spot in the room is called. */
  spotLabel: string;
  /** The button that ends the "during" stage. */
  advanceLabel: string;
  /** Lines shown once the user says the danger has passed. */
  after: string[];
  /** Where the guidance comes from, shown on the card. */
  guidanceSource: string;
}

/**
 * Guidance: Earthquake Country Alliance, Ready.gov and Taiwan's Central Weather Administration
 * (its phone alert says 趴下、掩護、穩住). Drop, cover and hold on where you are; don't move to
 * another room while the ground shakes; expect aftershocks.
 */
export const EARTHQUAKE: HazardProfile = {
  id: "earthquake",
  capEvent: "Earthquake",
  title: "Earthquake alert",
  headline: "Drop, Cover, Hold On",
  during: ["Stay where you are.", "Protect your head and neck."],
  spotLabel: "Cover spot",
  advanceLabel: "Shaking stopped",
  after: ["Expect aftershocks: drop, cover and hold on again."],
  guidanceSource: "Earthquake Country Alliance, Ready.gov, Taiwan CWA",
};

export const HAZARD_PROFILES: readonly HazardProfile[] = [EARTHQUAKE];

export function profileForAlert(alert: AlertEvent, profiles: readonly HazardProfile[] = HAZARD_PROFILES): HazardProfile | undefined {
  const event = alert.event.trim().toLowerCase();
  return profiles.find((p) => p.capEvent.toLowerCase() === event);
}

/** The stage after the user's action; other actions leave the stage as it is. */
export function nextStage(stage: AlertStage, action: "advance" | "safe"): AlertStage {
  if (stage === "during" && action === "advance") return "after";
  if (stage === "after" && action === "safe") return "done";
  return stage;
}
