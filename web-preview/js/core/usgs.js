// GENERATED from core/usgs.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Parser for the USGS earthquake GeoJSON summary feeds.
// https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
//
// Design rule: never drop data silently. Features that fail validation are counted
// by reason and surfaced to the caller, so a bad feed shows up as a number, not a gap.

                        
             
              
              
                                                                                    
                  
              
                 
                                                                                    
                
 

                                  
                
                                                                                        
                      
                  
                                                    
                                         
                  
                                                                                        
                              
 

export class FeedError extends Error {
  constructor(message        ) {
    super(message);
    this.name = "FeedError";
  }
}

                                                          

export const FEED_BASE_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/";

export function feedUrl(id        )         {
  return FEED_BASE_URL + id + ".geojson";
}

/** Plausibility bounds; values outside are data errors, not science. */
export const DEPTH_MIN_KM = -10;
export const DEPTH_MAX_KM = 1000;
export const MAG_MIN = -2;
export const MAG_MAX = 10;

function isObject(v         )                               {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite(v         )              {
  return typeof v === "number" && Number.isFinite(v);
}

export function parseFeed(raw         )                  {
  if (!isObject(raw)) throw new FeedError("feed is not a JSON object");
  if (raw.type !== "FeatureCollection") throw new FeedError("feed type is not FeatureCollection");
  const metadata = raw.metadata;
  if (!isObject(metadata)) throw new FeedError("feed has no metadata");
  if (!finite(metadata.generated) || metadata.generated <= 0) {
    throw new FeedError("feed metadata.generated is missing or invalid");
  }
  if (finite(metadata.status) && metadata.status !== 200) {
    throw new FeedError("feed metadata.status is " + metadata.status);
  }
  const features = raw.features;
  if (!Array.isArray(features)) throw new FeedError("feed has no features array");

  const quakes          = [];
  const skippedReasons                         = {};
  let nonEarthquakeEvents = 0;
  const skip = (reason        )       => {
    skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
  };

  for (const f of features) {
    if (!isObject(f)) {
      skip("not_an_object");
      continue;
    }
    const props = f.properties;
    const geom = f.geometry;
    if (!isObject(props)) {
      skip("no_properties");
      continue;
    }
    if (typeof props.type === "string" && props.type !== "earthquake") {
      nonEarthquakeEvents++;
      continue;
    }
    if (!isObject(geom) || geom.type !== "Point" || !Array.isArray(geom.coordinates)) {
      skip("bad_geometry");
      continue;
    }
    const [lon, lat, depth] = geom.coordinates             ;
    if (!finite(lon) || !finite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      skip("bad_coordinates");
      continue;
    }
    if (!finite(depth) || depth < DEPTH_MIN_KM || depth > DEPTH_MAX_KM) {
      skip("implausible_depth");
      continue;
    }
    if (!finite(props.mag)) {
      skip("missing_magnitude");
      continue;
    }
    if (props.mag < MAG_MIN || props.mag > MAG_MAX) {
      skip("implausible_magnitude");
      continue;
    }
    if (!finite(props.time) || props.time <= 0) {
      skip("bad_time");
      continue;
    }
    const id = typeof f.id === "string" && f.id.length > 0 ? f.id : "";
    if (id === "") {
      skip("missing_id");
      continue;
    }
    quakes.push({
      id,
      lat,
      lon,
      depthKm: depth,
      mag: props.mag,
      timeMs: props.time,
      place: typeof props.place === "string" ? props.place : "",
    });
  }

  let skipped = 0;
  for (const k of Object.keys(skippedReasons)) skipped += skippedReasons[k];

  return {
    title: typeof metadata.title === "string" ? metadata.title : "",
    generatedMs: metadata.generated,
    quakes,
    skippedReasons,
    skipped,
    nonEarthquakeEvents,
  };
}

/** Largest first; ties broken by most recent. Does not mutate the input. */
export function strongestFirst(quakes         )          {
  return quakes.slice().sort((a, b) => b.mag - a.mag || b.timeMs - a.timeMs);
}

/**
 * Keep at most `limit` events for rendering, preferring the strongest.
 * Returns the kept events plus how many were left out, so the UI can say so.
 */
export function capForDisplay(quakes         , limit        )                                     {
  if (quakes.length <= limit) return { kept: quakes.slice(), omitted: 0 };
  const kept = strongestFirst(quakes).slice(0, limit);
  return { kept, omitted: quakes.length - limit };
}
