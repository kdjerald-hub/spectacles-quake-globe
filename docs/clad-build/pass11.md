# CLAD pass 11: The two demo-video drivers, written fresh from a shot list

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 47 turns and 7 minutes, by Claude Code's own count.

## Prompt

```text
Write the two LEAF scenarios that drive the demo video, from the shot list below. They are not done-criterion tests: they press the Lens's real buttons at a pace a viewer can follow, and print a marker line at each step so the camera can be moved from outside while they run. Work in the foreground: run everything yourself, start no background agents, and don't end your turn until you have the results below.

The previous versions were written outside CLAD and have been removed from the project. Scripts/Tests/LeafIndex.ts still registers them: demo_alert (class DemoAlertScenario, file Scripts/Tests/DemoAlertScenario.ts) and demo_globe (class DemoGlobeScenario, file Scripts/Tests/DemoGlobeScenario.ts). Create those two files, with those class names and ids, written fresh from this shot list. Use the helpers in Scripts/Tests/TestHelpers.ts for resetting the state, waiting for live quakes, pressing a button by name and waiting.

Each marker line is printed exactly as `DEMO: <name>`, right after its step. After the marker, hold for the given time before the next step.

demo_alert, the alert moment:
1. Reset to the known start state, then wait until live quakes have loaded. Marker "start". Hold 2 s.
2. Pinch "Button Set cover spot". Marker "cover" (the camera looks down at the floor). Hold 3 s.
3. Pinch "Cover spot placement", which places the cover spot where the view points. Marker "placed". Hold 4.5 s.
4. Pinch "Button Phone alert received". Marker "alert" (the globe turns and zooms into the map of my area; the viewer reads the card). Hold 8 s.
5. No pinch. Marker "look" (the camera turns to the cover spot and back). Hold 8.5 s.
6. Pinch "Button Shaking stopped". Marker "stopped". Hold 7.5 s.
7. Pinch "Button Send to emergency contacts". Marker "sent". Hold 4.5 s.
8. Pinch "Button I'm safe". Marker "safe". Hold 3.5 s.
9. Marker "end".

demo_globe, the live globe:
1. Reset to the known start state, then wait until live quakes have loaded. Marker "start". Hold 2 s.
2. No pinch. Marker "walk" (the camera walks around the globe). Hold 12 s.
3. Pinch "Button Strongest". Marker "strongest". Hold 5 s.
4. Pinch "Button Strongest" again. Marker "strongest 2". Hold 5 s.
5. Pinch "Button 30 days". Marker "30 days". Hold 4 s.
6. Pinch "Button 24 h". Marker "24 h". Hold 3.5 s.
7. Pinch "Button 7 days". Marker "7 days". Hold 3 s.
8. Marker "end".

Give each file a short header comment saying what it is for (filming, not a test) and that it was written by CLAD from the shot list.

Check:
- Recompile and confirm the build is clean.
- Run demo_alert once, then demo_globe once, strictly one at a time. Read the log with RunAndCollectLogsTool mode "tail" and confirm that every marker printed, in order, with the holds roughly as listed.
- Then run the six test scenarios once each, one at a time (map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker), to confirm nothing else changed.
- If a run_leaf_scenario call times out at the MCP transport, read LEAF's own PASSED / FAILED line in the log before deciding anything, and don't start another run until that one has finished. If Lens Studio quits, stop and report; don't try to reopen it.

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool. Reset the preview camera to its default when done. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/, and change no other file except, if it must, LeafIndex.ts. No shell commands, not even read-only ones: use the file tools to list and read files.

Report: the two files you wrote, the markers and holds you saw in the log for each run, the LEAF table for the six tests, and every file you changed.
```

## CLAD skills loaded in this pass

specs-leaf-write-scenarios, specs-leaf-run-in-preview

## LEAF runs in this pass (in order)

demo_alert: succeeded, demo_globe: succeeded, map_detail: succeeded, quake_details: succeeded, alert: succeeded, cover_spot: succeeded, emergency_contacts: succeeded, home_marker: succeeded

## Note

The earlier demo-video drivers were written outside CLAD by the orchestrating session. Before this pass it moved them out of the project (they stay in the git history), and CLAD wrote both files fresh from the shot list in the prompt. One Read of a CLAD skill's reference file, outside the project folder, was denied by the headless permissions; the agent went on from the existing scenarios.

## The agent's final report

Done. Both demo drivers are written, both ran clean on the first dispatch, and all six test scenarios still pass.

## Files written

- `Assets/QuakeGlobe/Scripts/Tests/DemoAlertScenario.ts` — demo-video driver for the alert moment (id `demo_alert`), header says it's for filming, not a test, written by CLAD from the shot list. It uses the TestHelpers (`resetState`, `waitForQuakes`, `triggerButton`, `wait`) and prints `DEMO: <name>` right after each step.
- `Assets/QuakeGlobe/Scripts/Tests/DemoGlobeScenario.ts` — same shape for the live globe (id `demo_globe`).

`LeafIndex.ts` needed no edit — it already registered both ids with those class names. The one name not already proven by the existing tests, `"Cover spot placement"`, I verified in `EmergencyOverlay.ts:397`: it's the invisible placement plane that catches the pinch while in cover mode.

## demo_alert — PASSED (LEAF: `PASSED: demo_alert`, 44.5 s)

All nine markers printed in order. Gaps between markers = the requested hold plus ~0.3–0.6 s of LEAF button travel before the next marker:

| Marker | Gap from previous | Hold asked |
|---|---|---|
| start | — | — |
| cover | 2.4 s | 2 s |
| placed | 3.4 s | 3 s |
| alert | 5.1 s | 4.5 s |
| look | 8.0 s | 8 s |
| stopped | 8.9 s | 8.5 s |
| sent | 7.9 s | 7.5 s |
| safe | 4.9 s | 4.5 s |
| end | 3.5 s | 3.5 s |

The placement pinch landed on a real surface ("Cover spot placed on a real surface (world-query hit)") and the alert chime fired on cue.

## demo_globe — PASSED (LEAF: `PASSED: demo_globe`, 36.9 s)

| Marker | Gap from previous | Hold asked |
|---|---|---|
| start | — | — |
| walk | 2.0 s | 2 s |
| strongest | 12.4 s | 12 s |
| strongest 2 | 5.4 s | 5 s |
| 30 days | 5.4 s | 4 s* |
| 24 h | 4.4 s | 4 s† |
| 7 days | 3.9 s | 3.5 s |
| end | 3.0 s | 3 s |

\* the 30-days press itself took ~1 s (the window change triggers a feed fetch), so the marker-to-marker gap reads 5.4 s; the hold after "strongest 2" was the coded 5 s. † gap includes the fetch-delayed press; the coded holds match the shot list exactly (2, 12, 5, 5, 4, 3.5, 3).

## The six test scenarios — all PASSED, one at a time

| Scenario | Outcome | LEAF time |
|---|---|---|
| map_detail | ✅ succeeded | 0.51 s |
| quake_details | ✅ succeeded | 1.07 s |
| alert | ✅ succeeded | 3.63 s |
| cover_spot | ✅ succeeded | 2.09 s |
| emergency_contacts | ✅ succeeded | 1.82 s |
| home_marker | ✅ succeeded | 1.42 s |

## Housekeeping

- Recompile was clean ("TypeScript compilation succeeded"). The TS2307 errors visible earlier in the log are from before the files existed (LeafIndex importing the then-missing modules) and cleared the moment both files imported. No script errors or warnings during any run; the `SceneMaterialBatcher` W-lines are engine-level batching notes that also appear in the pre-change log window.
- No "AiPreviewAgent Handler" exists anywhere in the scene (checked `allSceneObjects`) — nothing to delete; LeafIndex kept. Project saved via the editor API.
- Preview camera restored to its true default: position (0,0,0), rotation x=350 (the stock −10° pitch — plain `reset` zeroes it, so I re-applied the pitch). Device stayed SPECS 27 throughout.

**Files changed:** `DemoAlertScenario.ts` and `DemoGlobeScenario.ts` (written by me), plus their two `.meta` files auto-generated by Lens Studio on import. Nothing else — no edits to `LeafIndex.ts`, `Core/`, `Data/`, or anything outside `lens/`.
