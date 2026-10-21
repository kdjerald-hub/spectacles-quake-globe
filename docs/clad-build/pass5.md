# CLAD pass 5: The off-view arrow points at the cover spot

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 67 turns and 26 minutes, by Claude Code's own count.

## Prompt

```text
Fix the off-view cover-spot arrow in Assets/QuakeGlobe/Scripts/EmergencyOverlay.ts (updateArrow). The design brief is lens/devpost/design-brief.md: "if the safe spot is out of view during the alert, a chime and a small arrow point to it". Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

Two bugs were seen in a screen recording of the preview. The cover spot had been placed on a surface down and to the left of the view, and the alert was on its "during" stage.
1. Direction: the arrow pointed up and to the right, away from the cover spot (about 180 degrees off). It must point toward the cover spot. Check the arrow mesh's rest orientation against the spin from atan2(uy, rx), and the handedness of the billboard rotation.
2. Placement: the arrow sits near the centre of the view (60 cm ahead, offset by at most 10 cm) and covers the main panel's text. Make it an off-screen indicator: near the edge of the view on the side of the cover spot, still fully inside the view. Make it small (a "small arrow", as the brief says). It must not cover the alert card's text or the globe's interior.

Tests:
- Extend the cover_spot scenario so it also checks the direction. With the seeded cover spot out of view, the arrow's on-screen pointing direction must agree with the on-screen direction to the cover spot (within about 30 degrees), and the arrow must sit off-centre toward that side. Keep the existing assertions.
- Run all scenarios one at a time (map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker); all must pass. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them again in a row.
- Leave demo_alert and demo_globe alone: they are video drivers, not tests. Don't run them.

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool, which create that handler. Reset the preview camera to its default when done. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands.

Report: the cause of each bug, what you changed, the LEAF table, and every file you changed.
```

## LEAF runs in this pass (in order)

cover_spot: succeeded/succeeded/succeeded/succeeded, map_detail: succeeded/succeeded, quake_details: succeeded/succeeded, alert: succeeded/succeeded, emergency_contacts: succeeded/succeeded, home_marker: succeeded/succeeded

## The agent's final report

Both bugs are fixed in `EmergencyOverlay.ts`, the cover_spot scenario now checks the arrow's direction and placement, and all six scenarios passed twice in a row.

## Cause of each bug

**1. Direction (~180° off).** The old code built the arrow's facing with `alignmentRotation(camPos − arrowPos)` and then spun the mesh about that billboard's Z by `atan2(uy, rx)`. The spin angle was measured in the **camera's** right/up frame, but `alignmentRotation` is roll-free in **world** terms: its X axis is forced horizontal, and its yaw is computed as `atan2(toViewer.x, toViewer.z)` — which collapses as the arrow-to-camera direction nears vertical. With the camera level the two frames coincide (I measured this: with the seeded spot the old code aimed −36.2° vs target −34.6°, nearly perfect), but when the camera pitches down toward a floor-level cover spot — exactly the recording's situation — the billboard's X axis detaches from the camera's right axis and the spin lands anywhere up to 180° off screen. The fix removes the billboard entirely: the camera's world rotation *is* the screen frame, so the arrow's rotation is now `cameraRotation ∘ Rz(atan2(sy, sx))`, which points the mesh tip (local +X, unchanged) at the spot's on-screen direction in every camera pose by construction.

**2. Placement (centre-hugging).** The offset was `right·(rx·10) + up·(uy·10)` with `rx, uy` being direction cosines ≤ 1 — at most 10 cm of lateral offset at 60 cm depth (~9°), i.e. always near the view centre, sitting on the panel text. Now the screen direction is normalized and pushed to per-side edge radii at 60 cm: 12.5 cm right, 8.2 cm left (stops at the alert card's inner edge, since that card is up during alerts), 12 cm up, 15 cm down (clears the globe's disc). Measured against the preview camera (fov 36.6°, aspect 0.88 → ~±16° × ±18° view), that puts the arrow around 65–75 % of the way to the edge, clear of the globe interior and the alert card, fully inside the view. The mesh size dropped from 3.2 to 1.8 (~4 cm long — the brief's "small arrow").

## Test extension

`cover_spot` now measures, through the engine's own projection (`Camera.worldSpaceToScreenSpace`, deliberately not re-using the overlay's math), that: the arrow's on-screen aim agrees with the on-screen direction to the cover spot within 30°; the arrow sits ≥ 0.15 screen units off-centre, on the spot's side (within 45°); and the arrow and its tip stay fully inside the view. All previous assertions are kept. Final measured run: aim −34.6° vs spot −34.6°, screen position (0.783, 0.734), offset 0.367 toward the spot.

## LEAF results (two consecutive full passes, run one at a time in the preview)

| Scenario | Pass 1 | Pass 2 |
| --- | --- | --- |
| map_detail | ✅ succeeded | ✅ succeeded |
| quake_details | ✅ succeeded | ✅ succeeded |
| alert | ✅ succeeded | ✅ succeeded |
| cover_spot | ✅ succeeded | ✅ succeeded |
| emergency_contacts | ✅ succeeded | ✅ succeeded |
| home_marker | ✅ succeeded | ✅ succeeded |

demo_alert and demo_globe were left untouched and not run. The logs show no Lens script errors — only pre-existing editor noise (Snap-service auth warnings, material-batcher notices).

## Files changed

- `Assets/QuakeGlobe/Scripts/EmergencyOverlay.ts` — new edge-placement constants, smaller arrow mesh, rewritten `updateArrow` rotation and placement.
- `Assets/QuakeGlobe/Scripts/Tests/SafeSpotArrowScenario.ts` — direction/off-centre/in-view assertions with screen-space diagnostics.

## Housekeeping

No "AiPreviewAgent Handler" existed in the scene (I avoided the tools that create it); LeafIndex kept; scene saved; preview camera reset to default; device left on SPECS 27. One note: the project's usual `npm test` / typecheck scripts weren't run because shell commands were off-limits this session — TypeScript was verified through Lens Studio's compiler instead, and no `Core/`/`Data/` files were touched, so the unit-test surface is unchanged.
