// GENERATED from core/occluder.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Dark far hemisphere, and the radii the surface lines sit at.
//
// The globe has no solid surface, so events inside the Earth stay visible. Both targets draw
// coastlines and grid as outward-facing ribbons with back-face culling, so the far half of
// every line is dropped and never shows through as mirror-image continents.
//
// The browser preview also draws this sphere, whose triangles all face inward, with ordinary
// back-face culling: from any viewpoint only the far half faces the viewer, so exactly the
// hidden half is drawn, with a perspective-correct edge and nothing to re-aim per frame. A
// shade lighter than the background, it makes the globe read as a volume on a monitor. It
// writes depth, so it would also hide far-side lines that cannot be culled (one-pixel lines).
// The Lens does not draw it: on a see-through display a dark surface is simply invisible.

                                                 

/** Coastlines and grid sit at this multiple of the globe radius... */
export const LINE_RADIUS_FACTOR = 1.002;
/** ...and the occluder just inside them, so far-side lines are behind it. */
export const OCCLUDER_RADIUS_FACTOR = 1.001;

/** UV sphere with inward-facing triangles (face normals point at the centre). */
export function buildInwardSphere(radius        , rings = 24, segments = 48)               {
  const m               = { positions: [], normals: [], indices: [] };
  for (let r = 0; r <= rings; r++) {
    const theta = (r / rings) * Math.PI; // 0 at +Y, pi at -Y
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    for (let k = 0; k <= segments; k++) {
      const phi = (k / segments) * Math.PI * 2;
      const dx = s * Math.sin(phi);
      const dy = c;
      const dz = s * Math.cos(phi);
      m.positions.push(radius * dx, radius * dy, radius * dz);
      m.normals.push(-dx, -dy, -dz);
    }
  }
  const row = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < segments; k++) {
      const a = r * row + k;
      const b = a + 1;
      const c2 = a + row;
      const d = c2 + 1;
      // Skip the degenerate triangles that touch a pole.
      if (r > 0) m.indices.push(a, b, c2);
      if (r < rings - 1) m.indices.push(b, d, c2);
    }
  }
  return m;
}
