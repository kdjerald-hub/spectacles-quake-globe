# CLAD pass 12b: Finish pass 12 after a usage limit

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 86 turns and 12 minutes, by Claude Code's own count.

## Prompt

```text
This pass finishes pass 12, which stopped at a usage limit before its tests were done.

Pass 12 worked from the design brief's newest section, "Notes from the review of the narrated cut (2026-10-22)" (devpost/design-brief.md in this folder). It changed Scripts/EmergencyOverlay.ts, Scripts/QuakeGlobeLens.ts, Scripts/LocalMapView.ts and Scripts/Tests/AlertScenario.ts:
- the zoom caps the globe's growth each frame (maxGlobeGrow) so the globe never covers the alert card or the dashboard;
- the map's labels keep clear of the coastline, plate lines and rings, and a gap is cut in any line that still crosses a label;
- the coastline keeps a margin around the home-epicentre segment, so the warm dashes read;
- the alert scenario checks all three.
Before it stopped, pass 12 had captured zoom screenshots (the zoom in at about 0, a quarter and a half, with the zoom slowed for the captures and then restored, and a burst during the zoom out), and run map_detail (passed), quake_details (passed) and alert (failed, then passed after a fix to the test). It did not run cover_spot, emergency_contacts or home_marker, the second round or the DEBUG round, and it wrote no report.

Finish it. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

1. Read pass 12's changes in those four files and confirm nothing temporary is left, in particular the zoom timing (TURN_S 0.9 and ZOOM_S 0.8, as before). Change code only if a test or a screenshot shows a real problem.
2. Recompile and confirm the build is clean.
3. Run all six scenarios (map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker) one at a time. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them all again in a row. Finally, run each of the six once with parameters {"__leaf__log_level": "DEBUG"}, strictly one call at a time with no overlapping calls, and report any "setTarget: probe" lines.
4. Preview screenshots from the default camera (pitched down about 10 degrees):
   - during the zoom in: every letter of the alert card whole;
   - during the zoom out after "I'm safe": every letter of the dashboard whole;
   - in the alert's "during" stage: the labels clear of the lines, the warm dashes readable between home and the epicentre, the land tint and the rest of the coastline as before.
   If you slow the zoom to capture it, restore it and recompile before any LEAF run.
5. If a run_leaf_scenario call times out at the MCP transport, read LEAF's own PASSED / FAILED line in the log before deciding anything, and don't start another run until that one has finished. If Lens Studio quits, stop and report; don't try to reopen it.
6. Leave demo_alert and demo_globe alone (video drivers). Don't run them, and keep every name they rely on.

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool. Reset the preview camera to its default when done. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands, not even read-only ones: use the file tools to list and read files.

Report:
- how the zoom now keeps clear of the card and the dashboard, and what the zoom screenshots showed, in and out;
- where the ring labels went, which lines got gaps, and the coastline margin around the dashed line;
- the new checks in the alert scenario, and what each measures;
- the LEAF table, and the DEBUG probe results;
- every file pass 12 and this pass changed.
```

## CLAD skills loaded in this pass

lens-studio-router, specs-leaf-run-in-preview, lens-log-analysis, preview-inspection, editor-api

## LEAF runs in this pass (in order)

map_detail: succeeded/succeeded/succeeded, quake_details: succeeded/succeeded/succeeded, alert: succeeded/succeeded/succeeded, cover_spot: succeeded/succeeded/succeeded, emergency_contacts: succeeded/succeeded/succeeded, home_marker: succeeded/succeeded/succeeded

## Written outside the repo

Besides the project, this pass wrote: Claude Code's own memory note lens-preview-driving.md. It changed no file in the repo outside lens/.

## The agent's final report

Pass 12 is finished: all 18 LEAF runs passed (6 + 6 + 6 DEBUG), the build is clean, the zoom screenshots confirm no letter is ever covered, and nothing temporary is left in the code — the zoom timing stands at TURN_S 0.9 / ZOOM_S 0.8.

## How the zoom keeps clear of the card and the dashboard

`EmergencyOverlay.maxGlobeGrow()` recomputes the growth cap every frame of the cross-fade: seen from the camera, the grown globe is an angular disc of half-angle asin(grown radius / distance), and the cap keeps that disc at least `ZOOM_CLEAR_MARGIN_CM` (0.5 cm, converted to an angle at the target's distance) short of every visible backplate top — the alert card's (`plateRect.topCm` above its origin) during the zoom in, and the dashboard's (`PANEL_PADDING_CM` above the panel origin, supplied by the new `dashboardTopWorld()` callback in QuakeGlobeLens) during the zoom out. The nominal `GLOBE_GROW` of 2.2 stays as the ceiling, but with the current layout the cap allows only a few percent of growth, and the map's growth carries the zoom. The cap never returns less than 1, so the globe is never shrunk below rest size.

**Zoom-in screenshots** (default camera, pitched down 10°): an early frame (card up, globe turned to the epicentre, full brightness), a mid-fade frame (globe dimmed and slightly grown, map fading in), and a late frame (map nearly full, globe almost gone) — in every frame, every letter of "Drop, Cover, Hold On" and the lines below it is whole, with the globe's disc staying clear of the card's plate. **Zoom-out**: a mid-fade frame right after "I'm safe" shows the globe returning (dimmed, map remnants still shrinking) with the dashboard fully legible — every letter of the title, counts, legend and all five buttons whole — then a final frame with the globe fully back and idle spin resumed. The captures were made with ZOOM_S temporarily at 8 s; it was restored to 0.8 and recompiled before any subsequent LEAF run.

## The map's labels, gaps, and the coastline margin

- **Ring labels**: each walks around its own ring from the top (inside first, then outside) to the first spot clear of other labels, markers, the home-epicentre line *and* every drawn line. In this run "50 km" sits at the top inside its ring just under "N", while "25 km" and "10 km" walked a step anticlockwise to the upper-left — the top spot is where the coastline crosses. "Home · Hualien" sits right of home, "15 km S" right of the epicentre ring; all clear.
- **Gaps in lines**: any coastline, plate line or ring that still crosses a label's final box gets the crossing interval cut out (box grown by the line's half width plus the 0.25 cm label margin); the rings are now drawn as polylines rather than annulus meshes precisely so they can carry gaps. The LEAF geometric check confirms zero crossings in the final drawn geometry.
- **Coastline margin**: the coastline is cut away within a capsule around the home-epicentre segment — `SEGMENT_CLEAR_F` (2.5 % of the map radius, 0.300 cm on this map) plus both lines' half widths, computed exactly (Liang–Barsky slab plus end discs, no sampling). The run measured the nearest drawn coastline at **0.396 cm** from the segment, ≥ the 0.300 cm published margin, and the screenshot shows the warm dashes reading cleanly through the coast's gap while the land tint still marks where the coast is.

## The new checks in the alert scenario

1. **Zoom-cover sampler** — an UpdateEvent samples every frame from the alert pinch to the globe's return, measuring the globe's drawn angular radius against the angle to the nearest visible backplate top (card or dashboard). It requires positive clearance at every frame *and* at least 3 sampled frames in each cross-fade direction. This run: worst clearance **0.23° against the alert card**, 24 zoom-in and 23 zoom-out frames sampled.
2. **Lines-vs-labels** — reads `LocalMapView.lastBuildDebug` (the final cut centre lines actually meshed) and asserts no coastline, plate line or ring passes within its half width of any label's box. Result: no crossings.
3. **Coastline margin** — from the same debug data, asserts no drawn coastline segment comes within the published `segmentClearCm` of the home-epicentre segment (exact segment-to-segment distance). Result: 0.396 cm ≥ 0.300 cm.

## LEAF results (SPECS 27 preview, 18 runs, all serial)

| Scenario | Round 1 | Round 2 | DEBUG round |
| --- | --- | --- | --- |
| map_detail | ✅ succeeded | ✅ succeeded | ✅ succeeded |
| quake_details | ✅ succeeded | ✅ succeeded | ✅ succeeded |
| alert | ✅ succeeded | ✅ succeeded | ✅ succeeded |
| cover_spot | ✅ succeeded | ✅ succeeded | ✅ succeeded |
| emergency_contacts | ✅ succeeded | ✅ succeeded | ✅ succeeded |
| home_marker | ✅ succeeded | ✅ succeeded | ✅ succeeded |

**DEBUG probe results**: no "setTarget: probe" lines appeared in any of the six DEBUG runs — the interactor traces show only `trigger` / `enterHover` / `exitHover` lines for the named buttons. The only probe-related output is the Lens's own world-query print in cover_spot ("probe hit at (-107.7, -28.0, -502.6) normal (-0.06, 0.00, 1.00)"), which is the expected surface-probe instrumentation. The alert's DEBUG run also reprinted its measurements: epicentre on screen at −91.1° vs true bearing −91.0°, 14.6 km S, map radius 50 km. demo_alert and demo_globe were left untouched and remain registered.

## Build, scene and environment notes

- Recompile clean both times; runtime log shows "Lens Opened: v0.1.0" and all eight scenarios registered, with zero script errors or warnings. The only W-level lines are engine-side notices (a depth-format fallback from the renderer and SceneMaterialBatcher "stays unbatched" notes for text visuals), not Lens code.
- No "AiPreviewAgent Handler" object exists in the scene (verified over all scene objects); LeafIndex and the LEAF Plugin Bridge remain. The project was saved, and the preview camera is at its default pose (origin, pitched down 10°) — it was never moved this pass.
- The repo-level `npm test` and typecheck were not run because this pass disallowed shell commands; no Core/ or Data/ file was touched, so nothing they cover changed.
- The editor reports it is not signed in to a Lens Studio account. That doesn't affect preview testing, but publishing or Asset Library work will need a sign-in.

## Files changed

**Pass 12** (all still as it left them, verified no temporaries):
- `lens/Assets/QuakeGlobe/Scripts/EmergencyOverlay.ts` — `maxGlobeGrow()` per-frame cap, `ZOOM_CLEAR_MARGIN_CM`, `dashboardTopWorld` in `GlobeContext`; TURN_S 0.9 / ZOOM_S 0.8 confirmed.
- `lens/Assets/QuakeGlobe/Scripts/QuakeGlobeLens.ts` — `dashboardTopWorld()` callback; `PANEL_PADDING_CM` exported for the test.
- `lens/Assets/QuakeGlobe/Scripts/LocalMapView.ts` — label placement that avoids drawn lines, gap cutting under label boxes, rings as polylines, coastline capsule cut around the dashed segment, `lastBuildDebug` publishing.
- `lens/Assets/QuakeGlobe/Scripts/Tests/AlertScenario.ts` — the three checks above.
- `docs/clad-build/README.md` and `docs/clad-build/pass9b_stopped_blank_project.md` — doc edits already pending when this pass started.

**This pass**: only `EmergencyOverlay.ts` was edited — ZOOM_S temporarily 8 for the captures, then restored to 0.8 — so its net change is zero; no other file was modified.
