// Visual encoding. Kept separate so the Lens and the web preview look identical.

export type DepthClass = "shallow" | "intermediate" | "deep";

/** Standard seismological depth classes (km): shallow < 70 <= intermediate < 300 <= deep. */
export const SHALLOW_MAX_KM = 70;
export const INTERMEDIATE_MAX_KM = 300;

export const DEPTH_CLASSES: DepthClass[] = ["shallow", "intermediate", "deep"];

export function depthClass(depthKm: number): DepthClass {
  if (depthKm < SHALLOW_MAX_KM) return "shallow";
  if (depthKm < INTERMEDIATE_MAX_KM) return "intermediate";
  return "deep";
}

/** Linear RGB in [0, 1]. Orange / yellow / blue stay distinguishable on a dark see-through display. */
export const DEPTH_CLASS_COLORS: Record<DepthClass, [number, number, number]> = {
  shallow: [1.0, 0.36, 0.22],
  intermediate: [1.0, 0.82, 0.25],
  deep: [0.3, 0.66, 1.0],
};

export const DEPTH_CLASS_LABELS: Record<DepthClass, string> = {
  shallow: "shallow < 70 km",
  intermediate: "70-300 km",
  deep: "deep > 300 km",
};

export const COASTLINE_COLOR: [number, number, number] = [0.78, 0.9, 1.0];
// On an additive display brightness is visibility: dark colours fade out.
export const GRATICULE_COLOR: [number, number, number] = [0.34, 0.48, 0.62];
export const HIGHLIGHT_COLOR: [number, number, number] = [1.0, 1.0, 1.0];
/** Atmosphere rings, from the innermost (brightest) outward. Added onto the view (additive). */
export const ATMOSPHERE_RINGS: { inner: number; outer: number; rgb: [number, number, number] }[] = [
  { inner: 1.004, outer: 1.018, rgb: [0.3, 0.55, 0.95] },
  { inner: 1.018, outer: 1.04, rgb: [0.14, 0.28, 0.55] },
  { inner: 1.04, outer: 1.075, rgb: [0.06, 0.12, 0.26] },
];
export const INNER_GRID_COLOR: [number, number, number] = [0.13, 0.22, 0.36];
export const HALO_COLOR: [number, number, number] = [0.9, 0.95, 1.0];
export const EPICENTER_COLOR: [number, number, number] = [1.0, 1.0, 1.0];

/** A smooth back-and-forth between lo and hi, once every `periodSeconds`. */
export interface PulseSpec {
  lo: number;
  hi: number;
  periodSeconds: number;
}

/** Brightness of the newest quakes' glow. */
export const HALO_PULSE: PulseSpec = { lo: 0.25, hi: 0.75, periodSeconds: 1.6 };
/** Brightness of the ring around the selected epicentre: brighter and a little faster. */
export const EPICENTER_PULSE: PulseSpec = { lo: 0.35, hi: 1.0, periodSeconds: 1.2 };
/** Size of the selected marker, breathing 15 % around its own size. */
export const SELECTED_SCALE_PULSE: PulseSpec = { lo: 0.85, hi: 1.15, periodSeconds: 1.6 };

/** Value of a pulse at time t (seconds). */
export function pulse(tSeconds: number, spec: PulseSpec = HALO_PULSE): number {
  const s = 0.5 + 0.5 * Math.sin((tSeconds * 2 * Math.PI) / spec.periodSeconds);
  return spec.lo + (spec.hi - spec.lo) * s;
}

/**
 * Marker size as a multiple of `base`. Grows linearly with magnitude so that
 * M2.5 is still visible and M8 does not swamp the globe.
 */
export function magnitudeToSize(mag: number, base: number): number {
  const k = 0.6 + 0.35 * (mag - 2.5);
  return base * Math.min(3.0, Math.max(0.6, k));
}

export function toHex(rgb: [number, number, number]): number {
  const c = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2]);
}
