# CLAD pass 9: The map of your area: during the alert the globe zooms into a map around home

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 144 turns and 55 minutes, by Claude Code's own count.

## Prompt

```text
Read the design brief at lens/devpost/design-brief.md (inside this folder as devpost/design-brief.md), especially its newest section, "Notes from the learner's own review of the video (2026-10-22)", and build it. This is the learner's own change. Keep every other feature working. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

What to build: during the alert, the globe zooms into a map of my area.

1. The map's content comes from Core/localmap.ts (copied from ../core by `npm run build`; don't edit Core/ or Data/). Call localMapFor(home, epicentre) once when the alert opens, with the confirmed home (EmergencyOverlay.home) and the simulated quake's lat/lon. It returns a LocalMap in km east (x) and km north (y) of home:
   - radiusKm, and ringsKm (for the demo: 50, and [10, 25, 50]);
   - coast and plates: flat [x0, y0, x1, y1, ...] polylines, already clipped to the map circle;
   - places, and homePlace (for the demo "Hualien", the place at home);
   - epicentre: x, y, km and compass ("S" for the demo);
   - detail: whether the finer coastline is used.
   ringLabel(km) formats ring labels ("10 km"). The map shows home at the centre, north up and east to the right. Every distance from home on it is true.
2. Draw the map as a flat disc facing the viewer, in the globe's place: same centre, the globe's radius in cm as the map's radiusKm, following globe moves and resizes. The display is additive, so use light colours only and no dark backplate. Show:
   - the three distance rings as thin lines, each labelled at its top ("10 km", "25 km", "50 km"), with a small "N" at the top of the outer ring;
   - the coastline, in the globe's coastline style, and the plate boundaries in the globe's quiet plate colour;
   - home at the centre in the home marker's colour, labelled "Home" plus " · " plus homePlace when there is one ("Home · Hualien");
   - the epicentre in the epicentre's red, with its pulsing ring, joined to home by a line, labelled with the distance and direction ("15 km S");
   - the place names in map.places, small.
   Draw no live quakes on this map: the alert replays a 2024 event, and today's quakes on the same map would mix two times. Labels must not overlap one another, the markers or the line.
3. The zoom. When "Phone alert received" is pinched, the globe turns to the epicentre as now. Then, over about 0.8 s, the globe grows and fades out while the map grows from the epicentre's place and fades in, so it reads as zooming in. While the map is up, the globe and its quakes stay hidden, which is how quakes elsewhere fade out. The map stays through both alert stages. When "I'm safe" closes the alert, reverse the zoom: the map shrinks and fades, the globe returns, and everything goes back to how it is today. The alert card stays under the map exactly where it is under the globe now, and the cover spot, its arrow and the arrow's keep-out stay as they are.
4. Check with preview screenshots from the default camera pitched down about 10 degrees: during the "during" stage, during the "after" stage, and after "I'm safe". The map must be fully in view and readable in a 1080p recording, and clear of the alert card.

Tests:
- Done criterion 3 now reads: pinching "Phone alert received" shows the alert card within a second, marks the epicenter on a map of my area, and shows its distance from my home. Update the alert scenario. Within 3 s of the pinch, check:
  - the map is shown and the globe is hidden;
  - home sits at the map's centre;
  - on screen, the epicentre lies below home (south) within 20 degrees;
  - the epicentre's distance from home on the map, in cm, matches 15 km at the map's scale within 5%;
  - the three ring labels and the distance label "15 km S" exist;
  - no two map labels overlap.
  After "I'm safe", within 3 s, check that the map is hidden and the globe is back. Keep the checks that still apply: the panel hidden during the alert, the card under the globe or the map, and the arrow's direction and shape in cover_spot. Remove or adapt the checks for the epicentre label and the map names on the globe during the alert: the globe is hidden then. Say which ones you changed.
- Run all six scenarios (map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker) one at a time. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them all again in a row.
- Finally, run each of the six once with parameters {"__leaf__log_level": "DEBUG"}, strictly one call at a time with no overlapping calls, and report any "setTarget: probe" lines.
- If a run_leaf_scenario call times out at the MCP transport, read LEAF's own PASSED / FAILED line in the log before deciding anything, and don't start another run until that one has finished.
- Leave demo_alert and demo_globe alone (video drivers). Don't run them, and keep every name they rely on: "Button Set cover spot", "Cover spot placement", "Button Phone alert received", "Button Shaking stopped", "Button Send to emergency contacts", "Button I'm safe", "Button Strongest", "Button 30 days", "Button 24 h", "Button 7 days".

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool. Reset the preview camera to its default when done. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands, not even read-only ones: use the file tools to list and read files.

Report:
- what you built: the map's size and scale, its colours and text sizes, and the zoom's timing;
- which test checks you added, changed or removed, and why;
- the LEAF table, and the DEBUG probe results;
- every file you changed.
```

## CLAD skills loaded in this pass

lens-studio-router

## LEAF runs in this pass (in order)

map_detail: succeeded/succeeded, quake_details: succeeded/succeeded, alert: succeeded/no verdict, cover_spot: succeeded, emergency_contacts: succeeded, home_marker: succeeded

## Note

Lens Studio quit during this pass's second round of LEAF runs, without a crash report, and the session ended without a final report. Eight of its nine LEAF calls timed out at the MCP transport after 60 s while LEAF went on running them. For seven, the verdict is LEAF's own line in the Lens Studio log, matched to each call (pass9_leaf_verdicts.json; the lines are in pass9_leaf_log_excerpt.txt). The eighth, the last call, has no verdict: LEAF had started it when Lens Studio quit. Pass 9b re-ran every test after a restart and changed no code.

## The agent's final report

(no final report)
