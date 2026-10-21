# CLAD pass 4: Readability, and the cover spot on surfaces

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 128 turns and 42 minutes, by Claude Code's own count.

## Prompt

```text
Read the design brief at lens/devpost/design-brief.md (inside this folder as devpost/design-brief.md; it is not at the repo root), especially the newest section, "Polish notes after judging the third build", and apply those notes. Keep every feature working: the two-stage alert, the map detail and the live globe. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

1. Readability on the side cards (alert card in both stages, controls card, details card):
   - The alert headline ("Drop, Cover, Hold On", from Core/hazards.ts) is clearly the biggest text, about twice its current size.
   - Every other line stays easy to read in a 1080p screen recording of the preview.
   - Cards may grow, or sit a little nearer to the viewer, but they must stay fully inside the view and fully outside the globe's silhouette from the default viewpoint.
   - Check with preview screenshots from the default camera pitched down about 10 degrees, which is how a person wearing the glasses looks at the globe and the panel below it.
2. Buttons on the side cards are full width, with labels on one line. "Send to emergency contacts" must not wrap inside a small button.
3. Cover spot on real surfaces: "Set cover spot", then a pinch on a table or the floor of the preview room, places the cover spot on that surface (use the Spectacles world-query hit test, or whatever the current SIK and Lens Studio provide for surface placement). Keep the current placement plane as the fallback when no surface is hit. The marker should look like it rests on the surface.
4. Tests: update the LEAF scenarios if needed. Run all scenarios one at a time. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them all again in a row. Run DEBUG ({"__leaf__log_level": "DEBUG"}) only once per scenario, strictly one call at a time. Never overlap a log read with a running scenario: long DEBUG runs with overlapping calls jam the LEAF bridge. Report any "probe hit" lines.
5. Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool, which create that handler. When you are done, reset the preview camera to its default. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands.

Report: what changed (with the new text sizes), a LEAF table (every scenario, pass or fail), the probe-hit results, how the cover spot is placed now, and every file you changed.
```

## CLAD skills loaded in this pass

specs-world-query

## LEAF runs in this pass (in order)

map_detail: succeeded/succeeded, quake_details: succeeded/succeeded, alert: succeeded/succeeded, cover_spot: failed/succeeded/succeeded, emergency_contacts: succeeded/succeeded, home_marker: succeeded/succeeded

## The agent's final report

All polish notes from the design brief are applied and verified in the SPECS 27 preview. The two-stage alert, map detail, and live globe all still work.

## What changed (with new text sizes)

I verified by capturing the SPECS 27 preview from the default viewpoint pitched down ~10°, driving the real buttons with injected pinches to open each card state. One key finding shaped the layout: the display's visible content FOV is only ~16° to each side, and the 24 cm globe eats the center, leaving ~6° per side card — so a wider/nearer card gets clipped off the edge. The readability win therefore comes from **bigger type + full-width buttons + a dominant headline**, not a bigger card.

**Alert card — "during" stage**
- Headline "Drop, Cover, Hold On": **52 → 104** (exactly 2×). It now wraps to three short centered lines ("Drop," / "Cover," / "Hold On") so it fits the narrow card and is unmistakably the biggest thing on the card.
- "Stay where you are." / "Protect your head and neck.": **40 → 46**
- "Epicentre N km from home": **40 → 50**
- SIMULATION note: **34 → 42**; guidance source: **30 → 36**
- "Shaking stopped" button: full width, height **3.6 → 4.4**

**Alert card — "after" stage**
- Title: **44 → 50**; SIMULATION note: **32 → 42**; "after" guidance: **38 → 42**; source: **30 → 36**; status line: **36 → 42**
- Quake details block: **36 → 38** (kept a touch smaller than the body so the dense 5-item block still fits its 7 reserved lines on the narrow card)
- **Send to emergency contacts** and **I'm safe**: were two half-width buttons (Send wrapped) → now **two full-width stacked buttons**, height 4.4. Send is on **one line** (verified).

**Controls card**
- Title: **40 → 48**; hint: **32 → 36**
- All buttons **full width**, height **3.6 → 4.4**. "Set home" and "Set as home" now share one full-width row (only one is visible at a time via `setConfirmHomeVisible`), which keeps every button full width with no empty slot.

**Details card**
- Title: **44 → 50**; body: **38 → 44**; Close button full width, height **3.2 → 4.4**

**Card geometry** (`EmergencyOverlay.ts`): width stayed **16 cm** (22 cm was clipped off-screen), depth brought slightly nearer: `CARD_BACK_CM` **55 → 48**. Both side cards stay fully in view and clear of the globe silhouette from the pitched-down viewpoint (verified for controls, alert-during, alert-after, and details).

## LEAF results

Execution target: preview (SPECS 27). Pass 1 = one at a time at DEBUG; Pass 2 = all again in a row.

| Scenario | Done criterion | Pass 1 (DEBUG, one-at-a-time) | Pass 2 (in a row) |
|---|---|---|---|
| `map_detail` | 1 — Map detail | ✅ PASS | ✅ PASS |
| `quake_details` | 2 — Quake details | ✅ PASS | ✅ PASS |
| `alert` | 3 — Alert | ✅ PASS | ✅ PASS |
| `cover_spot` | 4 — Cover spot | ❌ FAIL → fixed → ✅ PASS | ✅ PASS |
| `emergency_contacts` | 5 — Emergency contacts | ✅ PASS | ✅ PASS |
| `home_marker` | (extra — Home) | ✅ PASS | ✅ PASS |

All 5 done criteria have a test; `home_marker` is an extra. `cover_spot` failed first at DEBUG — read via `RunAndCollectLogsTool` "tail": *"Cover spot arrow should be enabled … Expected true, Received false."* Cause: my first cover implementation moved the marker to follow the pointer every frame, and the LEAF interactor is a registered targeting interactor, so it dragged the seeded off-view spot into the forward view and suppressed the arrow. Fixed by making it **pinch-to-place** (probe only *remembers* the surface; the marker is placed on the pinch), which matches the brief and keeps the seed off-view. Re-verified PASS, then PASS again in the full in-a-row pass.

Two LEAF scenarios were updated:
- `SafeSpotArrowScenario.ts`: headline assertion now flattens newlines (the headline is multi-line now).
- The cover-spot behavior fix lives in `EmergencyOverlay.ts`, not the scenario.

## Probe-hit results

World-query probing works in the preview. Driving a live pointer at surfaces and pinching produced these `probe hit` DEBUG lines (from `EmergencyOverlay.ts`):

- `probe hit at (-107.9, -67.5, -498.8) normal (-0.06, 0.00, 1.00)` — a near-vertical surface (back wall), normal ≈ +Z
- `probe hit at (-55.6, -144.5, -317.4) normal (0.00, 1.00, -0.00)` and `probe hit at (-70.1, -180.0, -389.1) normal (0.00, 1.00, -0.00)` — horizontal surfaces (floor/console, below eye level), normal = +Y
- On pinch: `Cover spot placed on a real surface (world-query hit)`

Note: the automated LEAF `cover_spot` run has no real pointing ray at an off-view surface, so it exercises the seeded fallback and does not emit probe-hit lines; the probe hits above come from a live pointer in the preview (captured via a pinch sequence, then read with `tail` mode so no read overlapped a running scenario).

## How the cover spot is placed now

1. **"Set cover spot"** enters cover mode, seeds a fallback marker at floor height off to the side (so the off-view arrow still has a target), and lazily starts a `LensStudio:WorldQueryModule` hit-test session.
2. **While pointing**, each frame casts a world-query ray along the SIK targeting interactor and remembers the surface it hits (position + normal), logging a throttled `probe hit` line.
3. **On the pinch**, if a surface was probed within the last 0.5 s, the cover spot is committed there and the marker is **oriented to the surface normal** — its ring lies flat on the surface and its beam stands out of it, so it looks like it rests on the table/floor. If nothing was hit, it falls back to the existing placement plane at floor height (upright), exactly as before.

## Files changed (all inside `lens/`; no `Core/`, `Data/`, or anything outside `lens/`)

- `Assets/QuakeGlobe/Scripts/LensUi.ts` — added optional `labelSize` param to `PanelButton`.
- `Assets/QuakeGlobe/Scripts/EmergencyUi.ts` — new text sizes on all side cards; full-width stacked buttons; overlapping Set home / Set as home row; headline word-wrap helper (`wrapToLines` / `charsPerLine`).
- `Assets/QuakeGlobe/Scripts/EmergencyOverlay.ts` — card width/depth constants; world-query cover-spot placement (session, per-frame probe + `probe hit` logging, pinch-to-commit, surface-normal orientation, plane fallback).
- `Assets/QuakeGlobe/Scripts/Tests/SafeSpotArrowScenario.ts` — headline assertion normalizes newlines.

## Cleanup

- Walked all 121 scene objects: **no "AiPreviewAgent Handler"** anywhere; **LeafIndex** present (I used only `scene-graphql`/editor-code/`InjectPreviewGesture`/`CapturePanelScreenshot`/`MovePreviewCamera`, never `QueryRuntimeSceneTool` or `PreviewInteractTool`).
- Preview camera **reset to default** (rotation 0,0,0); device confirmed **SPECS 27**.
- Project **saved**. Final clean load logs "Lens Opened: v0.1.0" with **no script errors** (the two W-lines are environmental: the LEAF-plugin state-save note during the MCP refresh, and an engine depth-format init note — neither from the Lens code, and the world-query session isn't created until cover mode is entered).
