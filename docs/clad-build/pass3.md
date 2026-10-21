# CLAD pass 3: The two-stage alert

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 113 turns and 59 minutes, by Claude Code's own count.

## Prompt

```text
Read the design brief at devpost/design-brief.md inside this folder, which is lens/devpost/design-brief.md. It is not at the repo root. Read the section "Design notes after the first build" especially, and apply those notes to the alert. Keep every other feature working, including the map detail from the last pass. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

Use Core/hazards.ts (copied from ../core by `npm run build`; don't edit it). Its EARTHQUAKE profile gives the text: title, headline "Drop, Cover, Hold On", the `during` lines, spotLabel "Cover spot", advanceLabel "Shaking stopped", the `after` lines and guidanceSource. nextStage(stage, action) moves the alert from "during" to "after" to "done".

The alert has two stages.
1. During (the moment "Phone alert received" is pinched):
   - The alert card leads with the headline in the biggest text, then the `during` lines.
   - "SIMULATION" is clearly on the card.
   - One glanceable line gives the epicentre's distance from home.
   - At the same moment the globe shows the epicentre ring, the home marker and the home-to-epicentre line, and the chime plays.
   - The safe spot is now the cover spot. Rename it "Cover spot" everywhere, including the button ("Set cover spot").
   - The off-view arrow and its chime appear only when the cover spot is out of view.
   - The card's only button is "Shaking stopped". Nothing else needs a gesture.
2. After ("Shaking stopped" pinched):
   - The card shows the details: "USGS M7.4 (Taiwan CWA: ML 7.2)", depth, local time, place, and the nearest plate boundary.
   - Then the `after` lines.
   - "Send to emergency contacts" shows "Sent to emergency contacts (simulated)" once pinched.
   - "I'm safe" closes the alert (done).
   - "SIMULATION" stays on the card.

Also:
- The default demo home becomes Hualien City, 23.9667 N, 121.6000 E. Setting home by pinching the globe still works.
- Show "Set as home" only after a point on the globe has been picked. Until then only "Set home" shows.
- The alert card must not copy the look of an official phone alert: keep the Lens's own palette and layout, with no emergency-red banner.
- Add a small source line: "Guidance: " + guidanceSource.
- Layout fix: from the default preview viewpoint, the controls card beside the globe overlaps the globe's edge, and "Set as Home" is half hidden behind the globe. Keep every side card fully outside the globe's silhouette and inside the view, for the controls card, the alert card in both stages, and the details card. Check with a preview screenshot.

Tests:
- Update the LEAF scenarios to the new flow:
  - alert (criterion 3): the card within 1 s, the epicentre marked, the distance shown.
  - cover spot (criterion 4): the headline, only the "Shaking stopped" button during shaking, and the arrow when the cover spot is out of view.
  - emergency contacts (criterion 5): "Shaking stopped" leads to the details, and send leads to "Sent to emergency contacts".
- Keep map_detail, quake_details and home_marker passing.
- Run all scenarios one at a time. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them all again in a row.
- Run every scenario once more with parameters {"__leaf__log_level": "DEBUG"}. Search the new log lines for "probe hit" (a button blocked for a real pointer). Fix any you find and re-check.

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool, which creates that handler. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands.

Report: what changed, a LEAF table (every scenario, pass or fail), the probe-hit results, any warnings, and every file you changed.
```

## CLAD skills loaded in this pass

none

## LEAF runs in this pass (in order)

map_detail: succeeded/succeeded, quake_details: succeeded/succeeded/timed out, alert: succeeded/succeeded/succeeded/timed out, cover_spot: succeeded/succeeded/timed out/timed out, emergency_contacts: succeeded/succeeded, home_marker: succeeded/succeeded

## Note

The session ended on an API disconnect just before it saved the scene, so it has no final report. The orchestrating session saved the project and re-ran all six LEAF scenarios, one by one and at DEBUG level; all passed.

## The agent's final report

(no final report)
