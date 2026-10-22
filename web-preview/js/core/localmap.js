// GENERATED from core/localmap.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// The alert's map of your area. On a 24 cm globe, 15 km is less than 0.3 mm, so home and the
// epicentre sit on one point; during the alert the Lens zooms into this map instead. It is flat,
// centred on home, north up, and every distance from home on it is true (an azimuthal equidistant
// projection). Coastlines and plate boundaries are projected and clipped to the map's circle; the
// map's radius follows the quake, so the epicentre always fits inside the outer ring.
// Pure functions, no platform dependencies. Units: km east (x) and km north (y) of home.
//
// The finer coastline (data/localdetail.ts) covers Taiwan, Japan and the US West Coast; elsewhere,
// and on maps wider than the detail allows, the map uses the globe's 1:50m coastline.

import { COASTLINE_50M } from "../data/coastline50m.js";
import { COASTLINE_10M_DETAIL, DETAIL_REGIONS, PLACES } from "../data/localdetail.js";
                                                                  
import { PLATE_BOUNDARIES } from "../data/plates.js";
import { EARTH_RADIUS_KM, compass8 } from "./geolookup.js";

                                    

const DEG = Math.PI / 180;

/** A point on the map: km east (x) and km north (y) of the centre. */
                          
            
            
 

/**
 * Azimuthal equidistant projection centred on (lat0, lon0): the distance from the centre to the
 * result is the great-circle distance, and the direction is the true bearing (north = +y).
 */
export function projectLocal(lat0        , lon0        , lat        , lon        )          {
  const p0 = lat0 * DEG;
  const p = lat * DEG;
  const dl = (lon - lon0) * DEG;
  const cosC = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
  const c = Math.acos(Math.max(-1, Math.min(1, cosC)));
  const k = c < 1e-12 ? 1 : c / Math.sin(c);
  return {
    x: k * Math.cos(p) * Math.sin(dl) * EARTH_RADIUS_KM,
    y: k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl)) * EARTH_RADIUS_KM,
  };
}

/** Map radii to choose from (km). The last one reaches the antipode, so every epicentre fits. */
export const MAP_RADII_KM = [50, 100, 200, 500, 1000, 2000, 5000, 20100];
/** The map is never tighter than this: below it the coastline gives too little to go by. */
export const MIN_MAP_RADIUS_KM = 50;
/** The epicentre sits inside two thirds of the radius, clear of the rim and its ring label. */
export const EPICENTRE_MARGIN = 1.5;
/** Finer coastline only up to this radius: the detail regions end not far past their coasts. */
export const DETAIL_MAX_RADIUS_KM = 200;

/** The smallest map radius that holds the epicentre with a margin (15 km away: 50 km). */
export function mapRadiusKm(epicentreKm        )         {
  const need = Math.max(MIN_MAP_RADIUS_KM, epicentreKm * EPICENTRE_MARGIN);
  for (const r of MAP_RADII_KM) if (r >= need) return r;
  return MAP_RADII_KM[MAP_RADII_KM.length - 1];
}

/** Distance rings for a map radius: a fifth, a half and the whole (50 km: 10, 25 and 50 km). */
export function ringsKm(radiusKm        )           {
  return [radiusKm / 5, radiusKm / 2, radiusKm];
}

/** Ring label text, e.g. "10 km", "2,000 km" (no Intl: the Lens runtime may not have it). */
export function ringLabel(km        )         {
  const digits = String(Math.round(km));
  let s = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) s += ",";
    s += digits[i];
  }
  return `${s} km`;
}

/** The part of segment a-b inside the circle of radius r about the origin, as [t0, t1], or null. */
function clipSegment(a         , b         , r        )                          {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (a.x * dx + a.y * dy);
  const qc = a.x * a.x + a.y * a.y - r * r;
  if (qa < 1e-12) return qc <= 0 ? [0, 1] : null;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-qb - s) / (2 * qa));
  const t1 = Math.min(1, (-qb + s) / (2 * qa));
  return t0 < t1 ? [t0, t1] : null;
}

/**
 * Projects polylines (flat [lon0, lat0, lon1, lat1, ...] in degrees) onto the map and clips them to
 * its circle. Returns flat [x0, y0, x1, y1, ...] polylines in km; a line that leaves and re-enters
 * the circle becomes two. Points far outside are skipped before projecting, so the whole 1:50m
 * coastline costs little.
 */
export function localPolylines(polylines                     , lat0        , lon0        , radiusKm        )             {
  const out             = [];
  // A cheap pre-filter in degrees, with room for a whole segment (1:50m segments are well under 1 degree).
  const wide = radiusKm > 1500;
  const dLat = radiusKm / 111.2 + 1.5;
  const dLon = Math.min(180, dLat / Math.max(0.05, Math.cos(lat0 * DEG)));
  const near = (lon        , lat        )          => {
    if (wide) return true;
    if (Math.abs(lat - lat0) > dLat) return false;
    const dl = Math.abs(((((lon - lon0 + 180) % 360) + 360) % 360) - 180);
    return dl <= dLon;
  };
  for (const line of polylines) {
    let run           = [];
    let prev                 = null;
    const flush = ()       => {
      if (run.length >= 4) out.push(run);
      run = [];
    };
    for (let i = 0; i + 1 < line.length; i += 2) {
      if (!near(line[i], line[i + 1])) {
        flush();
        prev = null;
        continue;
      }
      const q = projectLocal(lat0, lon0, line[i + 1], line[i]);
      if (prev !== null) {
        const seg = clipSegment(prev, q, radiusKm);
        if (seg === null) {
          flush();
        } else {
          const [t0, t1] = seg;
          if (run.length === 0 || t0 > 0) {
            flush();
            run.push(prev.x + (q.x - prev.x) * t0, prev.y + (q.y - prev.y) * t0);
          }
          run.push(prev.x + (q.x - prev.x) * t1, prev.y + (q.y - prev.y) * t1);
          if (t1 < 1) flush();
        }
      }
      prev = q;
    }
    flush();
  }
  return out;
}

/** True when (lat, lon) lies in one of the regions with the finer coastline. */
export function inDetailRegion(lat        , lon        , regions                          = DETAIL_REGIONS)          {
  return regions.some((r) => lon >= r.box[0] && lon <= r.box[2] && lat >= r.box[1] && lat <= r.box[3]);
}

/** A place name placed on the map. */
                                             
               
             
               
 

/** The epicentre on the map, with its distance and the compass direction from home ("S"). */
                                                 
             
                  
 

/** Everything the Lens draws for the map of your area. */
                           
                   
                    
                    
                     
                                                                                                     
                       
                                                                                            
                    
                            
                                                                                    
                  
 

                                
                                     
                                          
                                   
                                         
                                   
                              
                           
                                                                
                     
 

/** A place this close to home (as a share of the map radius) names home instead of getting a label. */
const HOME_PLACE_SHARE = 0.08;
/** Place names stay inside this share of the radius, clear of the rim. */
const PLACE_RIM_SHARE = 0.9;

/** Builds the map of your area around home for an epicentre. */
export function buildLocalMap(inp               )           {
  const { home, epicentre } = inp;
  const e = projectLocal(home.lat, home.lon, epicentre.lat, epicentre.lon);
  const km = Math.hypot(e.x, e.y);
  const radiusKm = mapRadiusKm(km);
  const detail = radiusKm <= DETAIL_MAX_RADIUS_KM && inDetailRegion(home.lat, home.lon, inp.detailRegions);
  const coast = localPolylines(detail ? inp.detailCoast : inp.coarseCoast, home.lat, home.lon, radiusKm);
  const plates = localPolylines(inp.plates, home.lat, home.lon, radiusKm);

  let homePlace = "";
  let homePlaceKm = Infinity;
  const candidates               = [];
  for (const p of inp.places) {
    const q = projectLocal(home.lat, home.lon, p.lat, p.lon);
    const d = Math.hypot(q.x, q.y);
    if (d <= radiusKm * HOME_PLACE_SHARE) {
      if (d < homePlaceKm) {
        homePlace = p.name;
        homePlaceKm = d;
      }
    } else if (d <= radiusKm * PLACE_RIM_SHARE) {
      candidates.push({ name: p.name, x: q.x, y: q.y, km: d, rank: p.rank });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.km - b.km || (a.name < b.name ? -1 : 1));
  const places = candidates.slice(0, inp.maxPlaces ?? 6);

  return {
    radiusKm,
    ringsKm: ringsKm(radiusKm),
    coast,
    plates,
    places,
    homePlace,
    epicentre: { x: e.x, y: e.y, km, compass: compass8(home.lat, home.lon, epicentre.lat, epicentre.lon) },
    detail,
  };
}

/** The map of your area from the bundled data: 1:10m detail, 1:50m fallback, PB2002 boundaries. */
export function localMapFor(home                              , epicentre                              )           {
  return buildLocalMap({
    home,
    epicentre,
    detailCoast: COASTLINE_10M_DETAIL,
    detailRegions: DETAIL_REGIONS,
    coarseCoast: COASTLINE_50M,
    plates: PLATE_BOUNDARIES.map((r) => r.coords),
    places: PLACES,
  });
}
