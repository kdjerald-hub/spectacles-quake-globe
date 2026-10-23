# CLAD pass 9b: Finish pass 9 after a Lens Studio restart

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 67 turns and 8 minutes, by Claude Code's own count.

## Prompt

```text
Finish the previous pass. Lens Studio quit during its second round of LEAF runs, just as "alert" was starting (10:10 local time), and has been reopened with this project. That pass's code is on disk: Scripts/LocalMapView.ts (new), Scripts/EmergencyOverlay.ts, Scripts/QuakeGlobeLens.ts, Scripts/MapLabels.ts and Scripts/Tests/AlertScenario.ts. It builds the design brief's newest section, "Notes from the learner's own review of the video (2026-10-22)": during the alert, the globe zooms into a map of my area. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the results below.

1. Recompile and confirm the build is clean.
2. The previous pass's first round passed all six scenarios one at a time (LEAF's own lines in the Lens Studio log, 09:56-10:05). Run all six again in a row: map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker. If a run_leaf_scenario call times out at the MCP transport, read LEAF's own PASSED / FAILED line in the log with RunAndCollectLogsTool mode "tail" before anything else, and don't start another run until that one has finished. After a failure, read the log before changing anything.
3. Then run each of the six once with parameters {"__leaf__log_level": "DEBUG"}, strictly one call at a time with no overlapping calls, and report any "setTarget: probe" lines.
4. Check with preview screenshots from the default camera pitched down about 10 degrees: during the alert's "during" stage, during its "after" stage, and after "I'm safe". The map must be fully in view, readable in a 1080p recording and clear of the alert card, and the globe must be back after "I'm safe".
5. Change code only if a test fails or a screenshot shows a real problem, and say what you changed and why.
6. Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool. Reset the preview camera to its default when done. Keep the device on SPECS 27. Save the project. Don't edit Core/, Data/ or anything outside lens/. No shell commands, not even read-only ones: use the file tools to list and read files.

Report:
- what the map is, as built: its size and scale, colours, text sizes and the zoom's timing (read the code);
- what the alert scenario checks now;
- the LEAF table for this pass, and the DEBUG probe results;
- what the screenshots showed;
- every file you changed.
```

## CLAD skills loaded in this pass

lens-studio-router, specs-leaf-run-in-preview, lens-log-analysis, preview-inspection, editor-api

## LEAF runs in this pass (in order)

map_detail: succeeded/succeeded, quake_details: succeeded/succeeded, alert: succeeded/succeeded, cover_spot: succeeded/succeeded, emergency_contacts: succeeded/succeeded, home_marker: succeeded/succeeded

## Written outside the repo

Besides the project, this pass wrote: Claude Code's own memory note lens-preview-driving.md. It changed no file in the repo outside lens/.

## The agent's final report

The pass is finished: the build is clean, all six scenarios passed twice (INFO and DEBUG rounds, LEAF's own log lines confirmed for every run), the three screenshots look right, and the project is saved. **I changed no code** — nothing failed and no screenshot showed a real problem.

## The map, as built (from the code)

`LocalMapView.ts` builds a flat disc that takes the globe's place: a child of the globe's handle, same centre, billboarded to the viewer each frame with north up and east right. **Scale:** the globe's radius in cm stands for the map's radius in km — for the demo home the map radius is 50 km, so with the default 12 cm globe, 1 cm ≈ 4.17 km; content comes from Core/localmap's azimuthal equidistant projection, so every distance from home is true. It draws the three distance rings with labels and a small "N" outside the outer ring, the coastline, the plate boundaries, home at the centre (octahedron + ring), the epicentre (octahedron in its depth-class colour plus a pulsing red ring), the home-to-epicentre line with the distance label, and nearby place names. Labels are placed against boxes already on the map with fallback offsets; a place name that fits nowhere is dropped.

**Colours** (all additive glow, light on dark, fading by scaling toward black): rings (0.45, 0.58, 0.72) with labels (0.72, 0.82, 0.92); coastline in the globe's coastline colour; plates in the globe's quiet violet (0.52, 0.44, 0.66); home and the home line in cyan (0.5, 0.9, 1.0 / 0.6, 0.9, 1.0); place names warm-white (0.95, 0.94, 0.86); the distance label warm (1.0, 0.85, 0.6); the epicentre stays the only saturated colour.

**Text sizes** (Lens units, em = size/43.886 cm): ring labels and place names 36, "N" 40, home label 44, distance label 54 — the biggest text on the map.

**Zoom timing** (`EmergencyOverlay.ts`): on the alert the globe turns the epicentre to the viewer over **0.9 s**, then a **0.8 s** smoothstepped cross-fade: the map grows from 30 % of full size out of the epicentre's spot while the globe grows to 2.2× and fades out; fully zoomed, the globe is hidden. "I'm safe" plays the same ramp backwards (0.8 s); an alert closed mid-fade resumes from wherever it was.

## What the alert scenario checks now

`AlertScenario.ts` fires the simulated alert and asserts: card within 1 s on the "during" stage; panel and all five of its buttons unreachable through both stages; card centred below the globe at ~1 m; **within 3 s the map is shown and the globe content hidden**; home settles at the map's centre (< 2 cm); with expectations computed from the Lens's own home marker — the epicentre's on-screen direction within 20° of its true bearing, its map distance within 5 % at the map's scale, ring labels exactly `ringsKm` ("10 km / 25 km / 50 km"), the distance label exactly "15 km S", and **no two map labels overlapping on screen** (engine-projected boxes); then "Shaking stopped" (map stays up, panel stays hidden) and "I'm safe" (map hides and globe returns within 3 s, panel and buttons come back).

## LEAF results (this pass, log timestamps UTC)

| Scenario | Round 1 (INFO) | Round 2 (DEBUG) |
|---|---|---|
| map_detail | ✅ PASSED 0.73 s | ✅ PASSED 0.68 s |
| quake_details | ✅ PASSED 1.26 s | ✅ PASSED 1.28 s |
| alert | ✅ PASSED 3.70 s | ✅ PASSED 3.76 s |
| cover_spot | ✅ PASSED 2.08 s | ✅ PASSED 2.04 s |
| emergency_contacts | ✅ PASSED 1.96 s | ✅ PASSED 1.85 s |
| home_marker | ✅ PASSED 1.58 s | ✅ PASSED 1.54 s |

No MCP-call timeouts in either round, and every result is backed by LEAF's own `[DefaultLeafScenarioManager] PASSED: <id>` line in the log — including `alert`, the scenario that was starting when Lens Studio quit. `cover_spot` did not repeat its earlier 600 s DEBUG stall.

**DEBUG probe results: no `setTarget: probe` lines appeared in any of the six DEBUG runs.** The interactor traces show only `trigger` / `enterHover` / `exitHover`. The only probe-related lines are the overlay's own prints during cover_spot: `probe hit at (-107.7, -28.0, -502.5) normal (-0.07, 0.00, 1.00)`. The alert runs printed `alert map: epicentre on screen at -91.1 deg, true bearing -91.0 deg, 14.6 km S of home, map radius 50 km` — screen direction matching the true bearing to 0.1°.

## Screenshots (default camera, already at its 10°-down pose; capture source 2081×1590)

- **During:** the globe is fully replaced by the map — 10/25/50 km rings with labels, "N", Taiwan's coastline, the dashed plate boundary, "Home · Hualien" at centre, the red epicentre with pulsing ring, the home line, and "15 km S". The whole disc is in frame, every label legible at recording scale, and the map's outer ring ends clear above the "Drop, Cover, Hold On" card.
- **After:** the map stays up unchanged; the card swaps to the event details (USGS M7.4, depth 40 km, 2024-04-03, 15 km S of Hualien City) with "Send to emergency contacts" and "I'm safe" — still clear of the map.
- **After "I'm safe":** the map is gone, the globe is back and spinning with its quakes, and the panel and controls card are restored.

## Cleanup and files

- No "AiPreviewAgent Handler" object exists anywhere in the authored scene (verified over all 130 scene objects), so there was nothing to delete; **LeafIndex** and the LEAF Plugin Bridge are untouched. Preview camera is at its default pose (0, 0, 0, pitched down 10°), device stayed **SPECS 27**, and the project was saved.
- **Files changed this session:** none in the project. The only edit anywhere was a one-bullet addition to my own memory note (`lens-preview-driving.md`) about scene-graphql's query roots.
- One pre-existing, engine-level log note worth knowing: a `Depth format Depth24UnormStencil8 is not renderable` warning from the renderer and SceneMaterialBatcher "batching retries exhausted" notices for text visuals. Neither comes from the Lens scripts; there are zero script errors or warnings.
