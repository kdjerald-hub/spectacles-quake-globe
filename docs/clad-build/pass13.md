# CLAD pass 13: The final cut's review: ring labels on their rings, the cover-spot hint clear of the globe

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 106 turns and 33 minutes, by Claude Code's own count.

## Prompt

```text
Read the design brief at lens/devpost/design-brief.md (inside this folder as devpost/design-brief.md), especially its newest section, "Notes from the review of the final cut (2026-10-23)", and make those two changes to the Lens. Change nothing else. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

1. Ring labels on their rings (Scripts/LocalMapView.ts). Today each ring label walks around its own ring to a free spot (RING_LABEL_ANGLES, inside or outside the ring), so "25 km" and "10 km" ended up next to each other between their rings.
   - Put each ring's label centred on its own ring line, with a gap cut in that ring under the label (the rings are polylines and already carry such gaps).
   - Put all the ring labels on one ray from home, at the same direction: the first direction from a list of candidates where every ring label on that ray is clear of the coastline, the plate lines, the markers, the home-epicentre line, the other labels and "N". If no direction clears them all, use the one that clears the most, and keep the existing rules for the rest (gaps under labels, no two labels overlapping).
   - Keep everything else on the map as it is.
2. The cover-spot hint stays clear (Scripts/EmergencyOverlay.ts; the hint follows the line of sight in cover mode, HINT_AHEAD_CM / HINT_RAISE_CM). While the view still rests on the globe after "Set cover spot", and then sweeps down past the dashboard, the hint is drawn over the globe and over the dashboard's text.
   - In cover mode, at every frame, the hint must stay readable and in view, and, seen from the camera, its text must never overlap the globe's silhouette or the dashboard's plate.
   - For example: while its line-of-sight place would overlap either of them, hold it just above the globe (or wherever is nearest and clear), and follow the line of sight again, as now, once that place is clear. Move it smoothly, without popping. The choice is yours; explain it.
3. Tests: keep every existing check.
   - In the alert scenario (or wherever the map is up), also check that each ring label's box is centred on its own ring, that all ring labels lie on one ray from home, and that no drawn line crosses a label.
   - In the cover-spot scenario, add a check that would have caught the hint overlap: for example, compute the hint's place for the default camera and for a few camera directions sweeping down from the globe to the floor, and require that the hint's box, seen from that camera, overlaps neither the globe's silhouette nor the dashboard's plate. Say what it measures.
   - Run all six scenarios (map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker) one at a time. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them all again in a row. Finally, run each of the six once with parameters {"__leaf__log_level": "DEBUG"}, strictly one call at a time with no overlapping calls, and report any "setTarget: probe" lines.
   - If a run_leaf_scenario call times out at the MCP transport, read LEAF's own PASSED / FAILED line in the log before deciding anything, and don't start another run until that one has finished. If Lens Studio quits, stop and report; don't try to reopen it.
   - Leave demo_alert and demo_globe alone (video drivers). Don't run them, and keep every name they rely on.
4. Screenshots from the default camera:
   - pitched down about 10 degrees, in the alert's "during" stage: the three ring labels on their rings along one ray, the coastline, the dashes and the other labels as before;
   - right after "Set cover spot", with the camera at the default pose and then turned down toward the floor in a few steps (MovePreviewCamera): the hint readable and clear of the globe and the dashboard at each step.
   If you slow anything down to capture it, restore it and recompile before any LEAF run.

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool. Reset the preview camera to its default when done. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands, not even read-only ones: use the file tools to list and read files.

Report:
- where the ring labels went (the ray's direction) and what the map screenshot showed;
- how the hint now keeps clear, and what the cover-spot screenshots showed at each step;
- the new checks and what each measures;
- the LEAF table, and the DEBUG probe results;
- every file you changed.
```

## CLAD skills loaded in this pass

lens-studio-router, specs-leaf-run-in-preview

## LEAF runs in this pass (in order)

map_detail: succeeded/succeeded/succeeded/succeeded, quake_details: succeeded/succeeded/succeeded/succeeded, alert: succeeded/succeeded/succeeded/succeeded, cover_spot: succeeded/succeeded/succeeded/succeeded, emergency_contacts: succeeded/succeeded/succeeded, home_marker: succeeded/succeeded/succeeded

## Note

One Read of the Lens Studio log file, outside the project folder, was denied by the headless permissions; the agent read the log through the MCP instead. It re-ran four of the DEBUG runs to read their full logs, so this pass has 22 LEAF runs, all passed.

## The agent's final report

Done. Both design-brief fixes are in, all six LEAF scenarios pass three times over, and the screenshots confirm both behaviours. Details:

## 1. Ring labels (where they went, and the map screenshot)

Each ring label is now centred on its own ring line, and all three sit on **one ray due west of home (180° from east)** — spread 0.00°, per the scenario's own print. The placement tries a fixed candidate list of directions (east and west first, as the open sides of a coastal map; up and down last since "N" owns the top and the demo's line runs south) and takes the first direction where **every** label clears the coastline, plate lines, other rings, markers, the home-epicentre line, "N" and its siblings; east was blocked (coast/plate lines run NE of home), west — over the quiet land tint — cleared all three. If no direction cleared everything, the one clearing the most would win, with the existing gap-cutting rules covering the rest. The shared gap pass cuts each ring under its own label.

The screenshot at the default camera (pitched down 10°), "during" stage, shows: "50 km", "25 km", "10 km" in a row on their rings to the left of home, a visible gap in each ring under its label, "N" at top, "Home · Hualien", the warm dashed line south to "15 km S", the coastline with its margin around the dashes, the land tint, and the plate line — nothing else moved.

## 2. The cover-spot hint (how it keeps clear, and the sweep)

The hint still follows the line of sight at 70 cm, but its height in the view is now planned every frame (`coverHintPlanFor`, a pure function): project the globe's silhouette and the dashboard's backplate into the hint's view plane, grow them by the hint's text box plus a 2 cm margin, and merge them into blocked vertical bands. If the default spot (+9 cm) is clear, use it; otherwise take the nearer clear band edge that is still in view — above the globe while the view rests on it, below the dashboard while the view sweeps across it. The offset glides with an exponential ease and is clamped out of the bands, so lag can never leave text over an obstacle; when the clear side flips (above-globe → below-dashboard mid-sweep), a glide would cross the obstacles, so the hint instead **cross-fades** — out in place, across while invisible, in at the new spot (or jumps silently if its box is already fully off-view). Entering cover mode seeds the hint directly at the clear spot, so there's no initial slide.

Screenshots: **default pose** — hint above the globe, clear of silhouette and panel; **−20°** — hint below the dashboard's plate; **−30°** — hint just under the plate's bottom edge; **−45°** — both obstacles out of view, hint back at its default line-of-sight spot over the floor. Readable and clear at every step. Nothing was slowed down for the captures, so no restore/recompile was needed.

## 3. New checks and what each measures

In **`alert`** (AlertScenario.ts, on `LocalMapView.lastBuildDebug`, the final drawn geometry):
- Each ring label's box centre lies on its own ring: distance from home equals the matching ring's radius at the map's scale within 0.05 cm, matched by label text.
- All ring labels lie on one ray: their centres' angles from home agree within 0.5°.
- The existing "no drawn line crosses a label's box" check now includes the **dashes** too (it already covered coastline, plates, rings), which also proves the gap cut under each ring label.

In **`cover_spot`** (SafeSpotArrowScenario.ts, while cover mode is up):
- *Posed-hint check*: the hint object's wrapped-glyph box is sampled as a 5×3 grid of eye-rays; no ray may fall inside the globe's silhouette cone (within asin(R/d) of the eye-to-centre direction) or hit the dashboard's backplate rectangle (ray–plane intersection inside the plate, measured from the plate's own RoundedRectangle, independent of the Lens's accessor). This is the frame the old hint failed.
- *Sweep check*: `coverHintPlanFor` is evaluated at pitches −10, −20, −30, −45, −60; each steady-state spot must stay in view (|offset| ≤ 22 cm at 70 cm) and its box must pass the same two ray tests. The old fixed +9 cm raise fails this at −10 (over the globe) and −20 (over the dashboard's text).

## 4. LEAF results and DEBUG probe report

| Scenario | Pass 1 | Pass 2 (in a row) | DEBUG pass |
| --- | --- | --- | --- |
| map_detail | ✅ PASSED | ✅ PASSED | ✅ PASSED |
| quake_details | ✅ PASSED | ✅ PASSED | ✅ PASSED |
| alert | ✅ PASSED | ✅ PASSED | ✅ PASSED |
| cover_spot | ✅ PASSED | ✅ PASSED | ✅ PASSED |
| emergency_contacts | ✅ PASSED | ✅ PASSED | ✅ PASSED |
| home_marker | ✅ PASSED | ✅ PASSED | ✅ PASSED |

Every result above is the scenario manager's own `PASSED: <id>` line; no run timed out, no run overlapped another. `demo_alert` and `demo_globe` were not run and every name they rely on is unchanged. **DEBUG probe report: zero "setTarget: probe" lines — in fact zero "setTarget" lines of any kind — across all six DEBUG runs.** The only probe output is the Lens's own `probe hit at (-107.7, -28.0, -502.5) normal (-0.07, 0.00, 1.00)` in cover_spot (the world-query surface probe working). One honesty note: the first DEBUG pass ran all six, but its earlier logs scrolled past the readable tail window, so I ran map_detail, quake_details, alert and cover_spot once more at DEBUG, tailing right after each, to read their full logs (all passed again).

## 5. Files changed (all inside `lens/Assets/QuakeGlobe/Scripts/`)

- `LocalMapView.ts` — ring labels on one ray, centred on their rings (`RING_LABEL_RAY_DEGREES` replaces `RING_LABEL_ANGLES`; "N" placed first).
- `EmergencyOverlay.ts` — `coverHintPlanFor` planner, glide/clamp/cross-fade posing, seeding in `enterCoverMode`, `HintObstacleRect` on `GlobeContext`.
- `QuakeGlobeLens.ts` — `dashboardPlateWorld` accessor (stores the panel plate's bottom edge).
- `Tests/AlertScenario.ts` — ring-label ray/centre checks; crossing check now includes dashes.
- `Tests/SafeSpotArrowScenario.ts` — posed-hint and pitch-sweep overlap checks.

Housekeeping: no "AiPreviewAgent Handler" object existed anywhere in the scene (nothing deleted); `LeafIndex` kept; project saved; preview camera back at the default pose (origin, pitched down 10°); device untouched on SPECS 27 (live USGS loads fine — "375 quakes, M2.5+, past 7 days"). Two caveats: `npm test` and the typecheck script couldn't be run because the task forbids shell commands — `RecompileTypeScriptTool` passed and no Core/ or Data/ file was touched, so the unit-tested core is unchanged; and Lens Studio reports you're signed out, which didn't affect any of this work but will matter for publishing.
