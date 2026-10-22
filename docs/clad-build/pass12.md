# CLAD pass 12: The narrated cut's review: no text hidden during the zoom, labels clear of lines, the dashed line readable

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 120 turns and 30 minutes, by Claude Code's own count.

## Prompt

```text
Read the design brief at lens/devpost/design-brief.md (inside this folder as devpost/design-brief.md), especially its newest section, "Notes from the review of the narrated cut (2026-10-22)", and fix those three things in the Lens. Change nothing else. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

1. The zoom must never hide text. What the reviewers found: in EmergencyOverlay.ts the globe grows around its centre during the zoom (GLOBE_GROW = 2.2, applied in applyZoomVisuals) while the alert card sits at about the depth of the globe's centre, so the front of the growing globe passes in front of the card. The fade (QuakeGlobeLens.setGlobeFade) only darkens the globe's colour, so even a nearly invisible globe still hides the card's letters. On the zoom out after "I'm safe", the same happens to the dashboard's text.
   - Keep the transition as it is meant to read: the globe turns the epicentre toward the viewer, then gives way to the map growing from the epicentre. But the globe must never cover any part of the card or the dashboard, at any moment of the zoom in or the zoom out. For example, grow it only as far as the gap to the card allows, or turn its meshes off from the moment it would reach them, or both. The choice is yours; explain it.
   - Check it with preview screenshots from the default camera at about a quarter, a half and three quarters of the zoom in, and the same during the zoom out after "I'm safe". Every letter of the card and of the dashboard must be whole.
   - Add a LEAF check to the alert scenario that would have caught this bug, sampling the zoom in and the zoom out frame by frame; say what it measures.
2. Labels clear of lines. Today each ring label sits at the top of its ring, where the coastline runs through "10 km" and "25 km", and the 25 km ring runs through "Home · Hualien".
   - Place each ring label at the first of several positions around its ring where no coastline, plate line or other ring crosses its box.
   - Keep the place, home and distance labels clear of these lines too, whenever one of their candidate positions allows it.
   - Wherever a label still overlaps a line, leave a gap in that line under the label's box, with a small margin.
   - Keep all the existing label rules (no two labels overlap, labels clear of the markers and of the home-epicentre line).
3. The dashed line must read. Leave the coastline out within a margin of about 0.3 cm on the default map (scale it with the map's size) on each side of the segment from home to the epicentre, so the warm dashes are no longer added into the white coast. The land tint stays as it is.

Tests:
- Keep every existing check. In the alert scenario also check, while the map is up, that no map label's box is crossed by a drawn coastline, plate line or ring, and that no drawn coastline comes within the margin of the home-epicentre segment.
- Run all six scenarios (map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker) one at a time. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them all again in a row.
- Finally, run each of the six once with parameters {"__leaf__log_level": "DEBUG"}, strictly one call at a time with no overlapping calls, and report any "setTarget: probe" lines.
- If a run_leaf_scenario call times out at the MCP transport, read LEAF's own PASSED / FAILED line in the log before deciding anything, and don't start another run until that one has finished. If Lens Studio quits, stop and report; don't try to reopen it.
- Leave demo_alert and demo_globe alone (video drivers). Don't run them, and keep every name they rely on.

Also check with a preview screenshot from the default camera, pitched down about 10 degrees, during the alert's "during" stage: the labels are clear of the lines, the warm dashes read between home and the epicentre, and the land tint and the rest of the coastline are as before.

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool. Reset the preview camera to its default when done. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands, not even read-only ones: use the file tools to list and read files.

Report:
- how you fixed the zoom, and what the zoom screenshots showed, in and out;
- where the ring labels went, which lines got gaps, and the coastline margin around the dashed line;
- the new checks, the LEAF table, and the DEBUG probe results;
- every file you changed.
```

## CLAD skills loaded in this pass

lens-studio-router, lens-studio-field-notes, editor-api, specs-leaf-run-in-preview, preview-inspection, lens-log-analysis

## LEAF runs in this pass (in order)

map_detail: succeeded, quake_details: succeeded, alert: failed/succeeded

## Note

This pass stopped at the account's usage limit, after its zoom screenshots and four LEAF runs (map_detail and quake_details passed; alert failed, then passed after a fix to the test), so it wrote no final report. Pass 12b finished the tests with the same changes.

## The agent's final report

(no final report)
