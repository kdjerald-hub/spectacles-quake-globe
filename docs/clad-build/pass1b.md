# CLAD pass 1b: Make every LEAF test pass

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 71 turns and 17 minutes, by Claude Code's own count.

## Prompt

```text
Finish and verify pass 1 before anything new. Work in the foreground the whole time: run every test yourself, start no background agents or background tasks, and don't end your turn until you have the LEAF results table below.

The scene open in Lens Studio has unsaved changes: a LeafIndex root object (keep it), an "AiPreviewAgent Handler" root object (left by the preview inspection tool; delete it before saving) and "LEAF Plugin Bridge" (made by the LEAF panel; leave it alone).

1. Make the 5 LEAF scenarios in Assets/QuakeGlobe/Scripts/Tests/ pass in the preview.
   Root cause already found for quake_details, from the Lens log: `Interactable "Button Spin" not found or not enabled`. The scenario starts about 0.3 s after the Lens opens. The Lens builds its Panel in onAwake but keeps it disabled until placeInFront() runs, 0.25 s after start, and LEAF only finds interactables that are enabled in the hierarchy. So resetState() pressed Spin too early.
   In TestHelpers.ts:
   - Wait by elapsed time, not by frame count. Leaf's Utils has sleep(ms).
   - resetState: first wait, up to 15 s, until the Panel is enabled in the hierarchy and "Button Spin" can be found enabled.
   - Before pressing Strongest, wait until live quakes have loaded (the Count text shows a number above zero).
   - triggerButton: keep looking for the enabled interactable for up to 3 s before failing.
   Fix the tests first. Change Lens code only for a real bug, and say which one.
2. Run each scenario with run_leaf_scenario, one at a time. After any failure, read the log with RunAndCollectLogsTool in mode "tail" to get the verbatim cause before you change anything. When all five pass, run all five again in a row.
3. Run each scenario once more with parameters {"__leaf__log_level": "DEBUG"} and look in the log for "probe hit" lines. Those mean a ray to a button was blocked, so a person clicking in the preview could not reach it even though the test passed. List every one, and fix the layout if a button is blocked.
4. Chime: Assets/QuakeGlobe/Audio/alert_chime.wav is in the project (1.1 s, two soft tones). Assign it to the Quake Globe script's chime input, and check in the log that it plays when the alert fires.
5. Before you save the scene: keep LeafIndex, delete "AiPreviewAgent Handler", add nothing else. Avoid QueryRuntimeSceneTool; if you use it, it creates the handler again, so delete it again before saving. Save the scene.
6. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands.

Report: a table of the 5 scenarios (pass or fail, and what you changed for each), any "probe hit" findings, which done criteria have no test yet, and every file you changed.
```

## CLAD skills loaded in this pass

specs-leaf-run-in-preview, specs-leaf-write-scenarios

## LEAF runs in this pass (in order)

quake_details: succeeded/succeeded/succeeded, alert: succeeded/succeeded/succeeded, safe_spot_arrow: succeeded/succeeded/succeeded, emergency_contacts: succeeded/succeeded/succeeded, home_marker: succeeded/succeeded/succeeded

## Note

Lens Studio quit near the end of this pass, just after the edit that moved the placement plane, so the session stopped before compiling it and wrote no final report. Pass 1c finished that work.

## The agent's final report

(no final report)
