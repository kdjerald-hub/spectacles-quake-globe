# CLAD pass 6: Changes from the video review

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 133 turns and 33 minutes, by Claude Code's own count.

## Prompt

```text
Read the design brief at lens/devpost/design-brief.md (inside this folder as devpost/design-brief.md), especially its newest section, "Notes from the video review (2026-10-21)", and apply those notes to the Lens. Keep every other feature working. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

1. While the alert is open (both stages), hide the main panel and all its buttons (24 h, 7 days, 30 days, Strongest, Spin). Restore them when the alert closes with "I'm safe". The only button reachable while shaking stays "Shaking stopped".
2. During the alert, the alert card takes the panel's place: centred below the globe, about 1 m from the viewer.
   - Make it big enough that its text reads easily in a 1080p screen recording of the preview: the headline clearly biggest, every other line comfortably readable.
   - It must stay fully inside the view from the default camera pitched down about 10 degrees, never cover the globe's interior, and never cover the off-view arrow. Check the arrow placement constants against the card's new position.
   - Check with preview screenshots for both stages.
3. Label the epicentre ring on the globe with its distance from home, e.g. "15 km from home", facing the viewer, readable, and kept clear of the alert card.
4. While setting the cover spot, keep the hint ("Point at a table or the floor and pinch to place your cover spot") near the line of sight, so it is still readable when looking down at the floor.
5. Text on the "after" card: "USGS M7.4 (Taiwan CWA: ML 7.1)" and "Depth 40 km (USGS)".
6. Choose the hazard profile with profileForAlert(...) from Core/hazards.ts. Pass it an AlertEvent for the simulated alert (event "Earthquake", simulated: true, origin, magnitude, areaDesc "Hualien County", senderName "Simulation"), instead of using EARTHQUAKE directly.

Tests:
- Update the LEAF scenarios for these changes, for example: the panel buttons are not reachable during the alert and are back after "I'm safe"; the card is below the globe; the epicentre label exists.
- Keep the arrow-direction check.
- Run all six scenarios (map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker) one at a time. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them all again in a row.
- Finally, run each of the six once with parameters {"__leaf__log_level": "DEBUG"}, strictly one call at a time with no overlapping calls, and report any "setTarget: probe" lines.
- Leave demo_alert and demo_globe alone (video drivers). Don't run them. Make sure the names they rely on still exist: "Button Set cover spot", "Cover spot placement", "Button Phone alert received", "Button Shaking stopped", "Button Send to emergency contacts", "Button I'm safe", "Button Strongest", "Button 30 days", "Button 24 h", "Button 7 days".

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool. Reset the preview camera to its default when done. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands.

Report: what changed (card position and text sizes, the panel behaviour, the label), the LEAF table, the DEBUG probe results, and every file you changed.
```

## CLAD skills loaded in this pass

none

## LEAF runs in this pass (in order)

map_detail: succeeded/succeeded/succeeded/succeeded, quake_details: succeeded/succeeded/succeeded/succeeded, alert: succeeded/succeeded/succeeded/succeeded, cover_spot: succeeded/succeeded/succeeded, emergency_contacts: succeeded/succeeded/succeeded, home_marker: succeeded/succeeded/succeeded

## The agent's final report

All six video-review notes are applied, verified with screenshots in both alert stages, and all six LEAF scenarios pass — twice in a row and once more each at DEBUG, with zero "setTarget: probe" lines.

## What changed

**Panel behaviour.** While an alert is open (both stages) the main panel and all five buttons (24 h, 7 days, 30 days, Strongest, Spin) are hidden — the overlay calls a new `setPanelVisible` callback on the Lens, which disables the Panel object so none of its buttons are reachable. "I'm safe" restores the panel and the controls card. Verified visually and by LEAF: during the alert the only reachable button is "Shaking stopped".

**Alert card position and sizes.** The card now takes the panel's place: panel width (30 cm instead of 16), top-anchored 2.5 cm below the globe's silhouette, at the globe's depth (~102 cm from the viewer at default placement), following globe moves and resizes. Text sizes: headline 100 (now one clean line at this width), "during" body 54, distance 58, sim note 46, source 38, "Shaking stopped" label 44 on a 5 cm button. The "after" page: title 52, details 42, after-guidance 44, with "Send to emergency contacts" and "I'm safe" side by side (half-width, labels on one line, size 36 — the single row is what keeps this dense page inside the view). Screenshots from the default camera (pitched down 10°) confirm both stages sit fully in view, below the globe, never over its interior.

**Off-view arrow.** The old asymmetric left-edge constant (which stopped the arrow at the card when the card was on the left) is gone. Instead, each frame the overlay projects the alert card's backplate into the arrow's plane and, if the arrow would land on the card — which a downward arrow now would — pushes it sideways past the card's outer edge on the spot's side, clamped to the display edge. The LEAF arrow-direction check still passes: `screen pos (0.891, 0.734), aim −34.6°, spot at −34.6°, offset 0.456 at −30.9°` — pushed clear of the card, still pointing exactly at the spot, inside the view.

**Epicentre label.** A billboarded "15 km from home" (size 44, warm tint) is pinned just below the epicentre ring on the globe, updating if home is re-confirmed and hidden when the alert closes. It sits below rather than above the ring because the home marker and pinned "Taiwan" label are just north of the epicentre; the first screenshot showed them colliding, so I moved it into open ocean.

**Cover-spot hint.** In cover mode the hint now floats 70 cm along the line of sight, 9 cm above view centre — readable while looking down at the floor, leaving the centre clear for aiming. Other hints keep their above-globe placement.

**Card text.** `SIMULATED_MAG_LABEL` is now "USGS M7.4 (Taiwan CWA: ML 7.1)" and the depth line reads "Depth 40 km (USGS)" — both visible in the after-stage screenshot and asserted by LEAF.

**Hazard profile.** A new `SIMULATED_ALERT: AlertEvent` (event "Earthquake", simulated true, origin/magnitude from the Hualien quake, areaDesc "Hualien County", senderName "Simulation") lives in Emergency.ts; the overlay picks its profile with `profileForAlert(SIMULATED_ALERT) ?? EARTHQUAKE` instead of naming EARTHQUAKE directly.

## LEAF results

| Scenario | Pass 1 (one at a time) | Pass 2 (in a row) | DEBUG run |
|---|---|---|---|
| map_detail | PASSED | PASSED | PASSED |
| quake_details | PASSED | PASSED | PASSED |
| alert | PASSED | PASSED | PASSED |
| cover_spot | PASSED | PASSED | PASSED |
| emergency_contacts | PASSED | PASSED | PASSED |
| home_marker | PASSED | PASSED | PASSED |

**DEBUG probe results:** no "setTarget: probe" lines in any of the six DEBUG runs (each run with `{"__leaf__log_level": "DEBUG"}`, strictly one call at a time; I verified full log coverage of every run — the first three runs' logs scrolled past the tail window, so I ran those three once more at DEBUG to capture them completely). The only probe-related output is the Lens's own world-query print in cover_spot, `probe hit at (-107.7, -28.0, -502.6) normal (-0.06, 0.00, 1.00)` — the cover spot landing on a real surface, which is expected behaviour, not a LEAF setTarget line.

## Scene and cleanup

No "AiPreviewAgent Handler" object existed in the scene (root objects: Camera Object, Lighting, SpectaclesInteractionKit, Quake Globe, LeafIndex, LEAF Plugin Bridge); LeafIndex kept; project saved via the Editor API. Preview camera restored to its exact default (origin, pitched down 10°), device still SPECS 27. demo_alert and demo_globe were not run and were not edited; every name they rely on still exists — I verified all ten in code, and the test runs exercised eight of them by name ("Button Set cover spot", "Cover spot placement", "Button Phone alert received", "Button Shaking stopped", "Button Send to emergency contacts", "Button I'm safe", "Button Strongest", plus the view buttons via the panel). The runtime log is clean of script errors and warnings (the only warnings are pre-existing LEAF-plugin/engine noise, e.g. material-batching notes for text visuals, present before these changes).

One caveat: AGENTS.md asks for `npm test` and the check-lens typecheck at the repo root, but you ruled out shell commands, so I validated with Lens Studio's own TypeScript compiler (clean) plus the runtime instead. Core/ and Data/ are untouched, so the unit-tested core is unchanged.

## Files changed (all under `Assets/QuakeGlobe/Scripts/`)

- `Emergency.ts` — ML 7.1 magnitude label, "Depth 40 km (USGS)", new `SIMULATED_ALERT` CAP event
- `EmergencyUi.ts` — enlarged panel-width alert pages, one-line headline, side-by-side after-buttons, `plateRect` getter for the arrow keep-out
- `EmergencyOverlay.ts` — profile via `profileForAlert`, panel hide/show, bottom-centred card pose, epicentre distance label, line-of-sight hint, card-aware arrow keep-out
- `QuakeGlobeLens.ts` — `setPanelVisible` in the globe context; skip posing a hidden panel
- `Tests/TestHelpers.ts` — `resetState` handles the hidden-panel/open-alert start; new `textOnObject` helper
- `Tests/AlertScenario.ts` — asserts panel hidden on both stages and restored after "I'm safe", card below/centred under the globe at ~1 m, epicentre label present and well-formed
- `Tests/EmergencyContactsScenario.ts` — asserts the exact "USGS M7.4 (Taiwan CWA: ML 7.1)" and "Depth 40 km (USGS)" lines

Screenshots are in the scratchpad: `alert-during-v2.png` / `alert-during-hires.png` (during), `alert-after2.png` (after), `after-imsafe.png` (panel restored).
