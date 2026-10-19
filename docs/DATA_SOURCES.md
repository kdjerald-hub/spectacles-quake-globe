# Data sources and licensing

## Earthquakes: USGS real-time GeoJSON summary feeds

* Feeds used: `2.5_day`, `2.5_week`, `4.5_month` from
  `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/`
* Format reference: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
  (feeds are regenerated every minute; each event carries longitude, latitude and depth).
* Licence: "USGS-authored or produced data and information are considered to be in the
  U.S. Public Domain." Requested credit: "Credit: U.S. Geological Survey".
  https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits
* This project does not use the USGS logo or visual identifier, which is trademarked,
  and does not imply endorsement by the USGS.
* The Lens refreshes every five minutes while open, far below the feeds' own update rate.

## Coastlines: Natural Earth 1:110m

* Source file: `ne_110m_coastline.geojson` from the Natural Earth vector repository.
* Licence: "All versions of Natural Earth raster + vector map data found on this website
  are in the public domain." Credit is optional ("Made with Natural Earth").
  https://www.naturalearthdata.com/about/terms-of-use/
* Converted by `tools/build_coastline.py`: coordinates rounded to 0.1 degree and
  consecutive duplicates removed (134 polylines, 5,121 points, about 55 KB).

## Test fixtures

`tests/fixtures/*.geojson` are unmodified snapshots of the three feeds downloaded on
2026-10-19. They make the tests and the `?fixture` preview deterministic and offline.
