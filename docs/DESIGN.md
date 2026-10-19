# Design notes

Why the globe looks and behaves the way it does. Every tunable below is defined once in `core/`
(mostly `config.ts` and `style.ts`); the Lens and the browser preview read the same files.

## Why 3D at all

Earthquakes have a third coordinate that flat maps throw away: depth. Under Japan, the
Andes or Tonga, events get deeper the further they are from the trench, because they trace
an oceanic plate sliding down into the mantle. On a flat map those slabs collapse into a
smear of dots. On a globe you can walk around, the slab is a visible surface. That is the
one thing this Lens shows that a phone screen cannot, so every design choice protects it.

## Encoding

| Channel | Encodes | Rule |
|---|---|---|
| Position | latitude, longitude, depth | point drawn at radius `R x (1 - depth / 6371 km x 3)` |
| Colour | depth class | orange < 70 km, yellow 70-300 km, blue > 300 km (standard seismological classes) |
| Size | magnitude | linear in magnitude, clamped so M2.5 stays visible and M8 does not swamp the globe |

**Depth is exaggerated three times.** At true scale the deepest events (about 700 km) sit
only 11% of the way to the centre, too thin to read on a 24 cm globe. At x3 they sit about
a third of the way in. The legend always states the factor, so nothing is hidden.

**Markers are octahedra**, batched into one mesh per depth class. That is three draw calls
for thousands of events and no per-event objects, which matters on a battery-powered device.

**No solid sphere on glasses.** On a see-through display dark pixels are transparent, so the
Lens draws only coastlines and a 30-degree grid, and events inside the Earth stay visible from
every angle. Without a surface, far-side coastlines would show through as mirror-image
continents. So the lines are flat ribbons facing outward and every material is pinned to
back-face culling in code, so the far half of every line is dropped by the GPU. The browser
preview draws the same ribbons. It adds only a dark far hemisphere (`core/occluder.ts`), so the
globe reads as a volume on a monitor.

**Line widths.** One Spectacles pixel is about 0.048 cm at 100 cm (about 1000 px across 53 cm at
110 cm). Coastlines are about 2.5 px wide, the grid about 1.7 px, the depth stem about 2.2 px.
Thinner lines shimmer on a see-through display; dark colours fade, so the grid is not dimmed further.

## Light on a see-through display

Spectacles add light to the world: white is brightest and black is transparent. So the Lens
draws only light, uses no gradients, and makes every glow additive (extra light, no fill).

* **Atmosphere.** Three thin rings around the globe's outline, brightest inside and fading
  outward. They are re-aimed at the viewer every frame and scaled so they stay on the outline as
  the viewer walks closer or scales the globe up (`silhouetteScale`). Seen from 100 cm the outline
  is 0.7% wider than the globe's radius; with the globe scaled up three times it is 7% wider, and
  unscaled rings would slide inside the edge.
* **Newest quakes glow.** Events of the past 24 hours (3 hours in the 24 h view, where everything
  is recent) get a larger additive octahedron that pulses slowly. The legend names the window.
* **Selected event.** A white marker 2.2 times its normal size that breathes, a stem from the
  surface down to its depth, and a glowing ring on the surface around the epicentre. The ring is
  at least 2.5 degrees (about 280 km) from the epicentre, and wider for strong events so it always
  clears the marker: a white ring over a white marker would vanish.
* **Inner grid at 660 km**, the base of the mantle transition zone, near which the deepest
  earthquakes stop. Drawn faint at the exaggerated depth, it is a ruler for how deep a slab goes.

The panel and buttons are Snap's free Spectacles UI Kit, the same two components in UI Kit 0.1.5
(Lens Studio 5.15) and 2.0 (5.22+): a RoundedRectangle backplate (dark fill, blue hairline border)
and RectangleButtons with Snap's own hover, press and toggle feedback. The active window and the
idle spin show as toggled on. Free UI resources and their licenses:
[FREE_UI_RESOURCES.md](FREE_UI_RESOURCES.md).

## Time windows

| Button | Feed | Why |
|---|---|---|
| 24 h | M2.5+, past day | everything recent |
| 7 days | M2.5+, past 7 days | default; enough events to see plate boundaries |
| 30 days | M4.5+, past 30 days | over a month, only larger events are recorded consistently worldwide |

At most 3,000 markers are drawn. If a window ever holds more, the strongest are kept and the
status line says how many smaller ones were left out.

## "Is today normal?"

The panel compares the last 24 hours of M4.5+ events with each of the previous 29 days.

* Windows are counted backwards from the time the feed was generated, not from the device
  clock, so a wrong clock cannot shift the comparison.
* Only fully covered days enter the baseline. A partly covered day would read low.
* Today is compared with the baseline's range and nearest-rank 10th/90th percentiles.
  No Poisson model is assumed: aftershock sequences make daily counts strongly
  over-dispersed (the bundled snapshot ranges from 6 to 51 events per day).
* M4.5+ only. Below that, coverage differs strongly between regions, so a global count of
  small events mostly measures where the seismometers are.
* The newest events can take a while to appear in the catalog, so "today" can read slightly
  low. The panel describes the recent past. It never forecasts.

Possible verdicts: busiest or quietest day of the month, busier or quieter than usual,
within the usual range, or not enough history yet.

## Honesty about data

* **Freshness comes from the feed itself.** USGS stamps every feed with its generation time.
  The status line reads `Updated 3 min ago`, `Delayed`, `Stale`, `Offline - showing data
  from ...`, or `Device clock looks wrong` when the feed claims to be from the future.
* **Nothing is dropped silently.** Records that fail validation are counted by reason and the
  status line says `N invalid records ignored`. Quarry blasts and explosions are excluded on
  purpose and counted separately.
* **Old data cannot overwrite new data.** A response older than what is on screen is ignored.
* **Failures back off**: 30 s, 60 s, 120 s, up to 10 minutes, while the last good picture
  stays on screen.

## Placement and the panel

* The globe (12 cm radius) is placed 100 cm in front of the user, its centre 8 cm below eye
  level, and stays world-locked. The panel hangs below it. Together they span from 2 degrees above
  to about 26 degrees below eye level.
* The offset was set in the Lens Studio SPECS 27 Preview. Its camera looks 12 degrees down and has
  a 36.6-degree vertical field of view (both read from the running Lens). There the globe and the
  whole panel fit with a margin; with the earlier +6 cm the top of the globe was cut off. If a
  device's field of view matches the Preview's, looking straight ahead shows the whole globe, and
  the buttons are a short glance down (21 to 26 degrees below eye level). This has not been
  checked on hardware yet.
* Nothing is shown until it is placed, so the globe never flashes up against the user's face.
* Buttons are 3.6 cm tall with 1.8 cm gaps: 2 degrees and 1 degree at 100 cm, Snap's minimum
  target size and spacing. The panel turns to face the user every frame, but holds still while a
  button is targeted, so a pinch is not lost to head motion.

## Refresh

* After each fetch the next one is scheduled 5 minutes later, or with backoff after a failure.
* Switching to a window (or starting up) shows the saved copy at once, then fetches immediately
  if the data on hand is older than 5 minutes, otherwise when it turns 5 minutes old. The delay
  is clamped, so a wrong device clock can cause at most one early fetch, never a loop.
* Only the feeds on screen are refreshed. The last good copy of each feed is saved at most every
  30 minutes, as a fallback for offline starts.

## Interaction

* Grab the globe to move, rotate or resize it.
* **24 h / 7 days / 30 days** switch the window.
* **Strongest** tours the ten largest events in the window. The globe turns the selected
  event toward wherever you are standing, rings its epicentre, draws a stem from the surface
  down to its depth, and shows magnitude, depth, age and place.
* **Spin** clears the selection and resumes a slow idle rotation.

## Out of scope, on purpose

* **Not a warning system.** The feed updates every minute, but a Lens only runs while it is
  open. The footer says so.
* No tsunami indicators. The catalog's tsunami flag is an information pointer, not a warning,
  and showing it next to live data invites the wrong reading.
* No location features. Using the network in a Lens disables location, camera and
  microphone access, and the globe does not need them.
