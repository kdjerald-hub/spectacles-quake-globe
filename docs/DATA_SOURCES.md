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

## Coastlines, labels: Natural Earth 1:50m and 1:110m (v5.1.2)

* `data/coastline50m.ts`: `ne_50m_coastline`, simplified (Douglas-Peucker, 0.08 degree) with every
  island kept, so the island arcs where many quakes happen (Marianas, Tonga, Lesser Antilles) are
  drawn: 1,429 polylines, 15,088 points. 1:110m has no Marianas at all.
* `data/labels.ts`: country label points and zoom ranges from `ne_110m_admin_0_countries`
  (`LABEL_X`, `LABEL_Y`, `MIN_LABEL`, `MAX_LABEL`, `LABELRANK`); sea anchors computed inside
  `ne_110m_geography_marine_polys`; continent and ocean anchors chosen by hand in open land or water,
  because Natural Earth has no label points for them. 217 candidates.
* Same public-domain terms as above. Built by `tools/build_geodata.py`.
* Names follow Natural Earth's English `NAME` field, which shows boundaries "according to their de
  facto status".

## Plate boundaries: PB2002 (Bird 2003)

* `data/plates.ts`: the PB2002 plate boundary model, from the GeoJSON conversion at
  https://github.com/fraxen/tectonicplates (`PB2002_steps.json`, `PB2002_plates.json`).
  Steps are joined into runs of one boundary and one class (subduction zone, spreading ridge,
  transform fault, rift, collision zone), simplified (Douglas-Peucker, 0.05 degree): 1,680 runs,
  68 of them subduction zones, 52 plate names.
* Subduction polarity comes from the boundary name (`A/B` or `A\B`). The project checks it against
  the data: in the 30-day snapshot, intermediate-depth quakes (70-300 km) near subduction zones lie on
  the side the barbs point to (`tests/plates.test.ts`).
* Licence: "This collection of data is made available under the Open Data Commons Attribution
  License" (ODC-By 1.0, http://opendatacommons.org/licenses/by/1.0/). Requested credit:
  "Hugo Ahlenius, Nordpil and Peter Bird". Original model: Bird, P. (2003), An updated digital model
  of plate boundaries, Geochemistry, Geophysics, Geosystems 4(3), 1027, doi:10.1029/2001GC000252.
  The licence of Bird's original files is not stated in them; the GeoJSON's ODC-By licence is.
* Any Lens or page that shows these boundaries carries this credit.

## Test fixtures

`tests/fixtures/*.geojson` are unmodified snapshots of the three feeds downloaded on
2026-10-19. They make the tests and the `?fixture` preview deterministic and offline.
