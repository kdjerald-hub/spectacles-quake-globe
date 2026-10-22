# CLAD pass 10: Land tint and a warm dashed home-to-epicentre line on the map

Headless Claude Code with Snap's ls-clad plugin, driving Lens Studio 5.24.1 through its MCP server. 74 turns and 11 minutes, by Claude Code's own count.

## Prompt

```text
Read the design brief at lens/devpost/design-brief.md (inside this folder as devpost/design-brief.md), especially its newest section, "Notes from checking the map of your area (2026-10-22)", and apply those two notes to the map of your area (Scripts/LocalMapView.ts, built in the previous pass). Change nothing else. Work in the foreground: run every test yourself, start no background agents, and don't end your turn until you have the LEAF results table.

1. Land tint. Core/localmap.ts (copied from ../core by `npm run build`; don't edit Core/ or Data/) now gives LocalMap a `land` field: a flat triangle mesh in the same km units as the rest of the map, with positions [x0, y0, x1, y1, ...] and indices as triangle triples, already clipped to the map's circle. For the demo it covers inland Taiwan, west of the coast, and leaves the Pacific clear.
   - Draw it as a faint fill under everything else on the map, in the map's plane.
   - The display is additive, so the sea stays clear by simply not being drawn. The land needs a light tint: visible as land in a 1080p screen recording of the preview, and clearly quieter than the coastline, the rings and the labels.
   - It must fade and scale with the rest of the map during the zoom in and the zoom out.
2. The line from home to the epicentre. Make it a warm dashed line in the distance label's colour (the "15 km S" label), so it no longer reads as part of the coastline. Its ends stay at home and the epicentre.
3. Check with preview screenshots from the default camera pitched down about 10 degrees, during the alert's "during" stage. The land must be tinted, the sea clear, the coastline still on top, and the dashed line clearly separate from the coast.

Tests:
- In the alert scenario, also check that the map's land mesh exists and is not empty while the map is up. Keep every existing check.
- Run all six scenarios (map_detail, quake_details, alert, cover_spot, emergency_contacts, home_marker) one at a time. After a failure, read the log with RunAndCollectLogsTool mode "tail" before changing anything. Then run them all again in a row.
- Finally, run each of the six once with parameters {"__leaf__log_level": "DEBUG"}, strictly one call at a time with no overlapping calls, and report any "setTarget: probe" lines.
- If a run_leaf_scenario call times out at the MCP transport, read LEAF's own PASSED / FAILED line in the log before deciding anything, and don't start another run until that one has finished. If Lens Studio quits, stop and report; don't try to reopen it.
- Leave demo_alert and demo_globe alone (video drivers). Don't run them, and keep every name they rely on.

Before saving the scene, delete any "AiPreviewAgent Handler" object; keep LeafIndex. Avoid QueryRuntimeSceneTool and PreviewInteractTool. Reset the preview camera to its default when done. Keep the device on SPECS 27. Don't edit Core/, Data/ or anything outside lens/. No shell commands, not even read-only ones: use the file tools to list and read files.

Report:
- the land tint's colour and how it fades;
- the dashed line's colour, dash length and gap;
- what the screenshots showed;
- the LEAF table, and the DEBUG probe results;
- every file you changed.
```

## CLAD skills loaded in this pass

none

## LEAF runs in this pass (in order)

map_detail: succeeded/succeeded/succeeded, quake_details: succeeded/succeeded/succeeded, alert: succeeded/succeeded/succeeded, cover_spot: succeeded/succeeded/succeeded, emergency_contacts: succeeded/succeeded/succeeded, home_marker: succeeded/succeeded/succeeded

## The agent's final report

All done. Here's the full report.

## What changed on the map

**1. Land tint** — `Core/localmap`'s `land` mesh (flat km triangles, already clipped to the map circle) is now drawn as "Map land N" meshes at the lowest Z offset (`Z_LAND = 0.01` cm, under plates, coast, rings, line, markers). Colour `[0.10, 0.14, 0.18]` — a dim cool blue-grey in the coastline's family, clearly quieter than the rings (0.45–0.72) and the coastline (0.78–1.0). The sea is simply not drawn, so on the additive display it stays clear. The tint's passes join the same `passes` list as every other map mesh, so `applyFade` scales its colour toward black with the zoom's cross-fade, and it sits under the map content node, so the grow-from-the-epicentre scale and offset carry it too. A small helper packs the triangles into as few meshes as the 16-bit index limit allows.

**2. Home–epicentre line** — now dashed and in the distance label's warm amber `[1.0, 0.85, 0.6]` (identical to the "15 km S" text), instead of the old solid cool cyan. Nominal dash = 0.045 × map radius, gap = 0.03 × map radius; the dash count is rounded so a dash ends exactly at *both* ends — home and the epicentre. For the demo quake (14.6 km S on a 50 km map, 12 cm globe radius) that is **4 dashes of ≈ 0.61 cm with 0.36 cm gaps**; a line shorter than one period degrades to a single solid stroke. Width unchanged.

## Screenshots (default camera, pitched down 10°, "during" stage)

From the default pose — position (0,0,0), rotation x=350, which *is* the 10°-down view — the full-res capture shows: inland Taiwan west of the coast filled with the faint tint, the Pacific completely clear, the bright coastline running on top of the tint's exact edge, and the home–epicentre line in warm amber. A brief close-up (camera moved forward 55 cm, restored afterwards) confirmed the individual dashes and gaps read clearly and the line no longer resembles the cool coastline beside it. Full capture saved at `scratchpad/alert-during-full.png`. Camera verified back at its default pose at the end.

## LEAF results

| Scenario | Run 1 | Run 2 | DEBUG run |
|---|---|---|---|
| map_detail | PASSED | PASSED (0.55 s) | PASSED (0.51 s) |
| quake_details | PASSED | PASSED (1.12 s) | PASSED (1.07 s) |
| alert | PASSED | PASSED (3.56 s) | PASSED (3.52 s) |
| cover_spot | PASSED | PASSED (2.02 s) | PASSED (2.06 s) |
| emergency_contacts | PASSED | PASSED (1.83 s) | PASSED (1.85 s) |
| home_marker | PASSED | PASSED (1.47 s) | PASSED (1.42 s) |

18 runs, 18 passes, no failures and no MCP timeouts. The alert scenario now also asserts the map's land mesh exists, is enabled, and carries a non-empty RenderMesh while the map is up; its own print confirmed "epicentre on screen at −91.1°, true bearing −91.0°, 14.6 km S of home, map radius 50 km". `demo_alert` / `demo_globe` were not run and every name they press is unchanged.

**DEBUG probe results:** zero "setTarget: probe" lines across all six DEBUG runs — the LEAF interactor logged only `trigger:` / `enterHover:` / `exitHover` lines. (cover_spot printed the Lens's own "probe hit at …" world-query line, which is the overlay's surface probe, not a LEAF setTarget line.)

## Housekeeping

- No "AiPreviewAgent Handler" object existed anywhere in the scene (checked all scene objects); LeafIndex kept; project saved.
- Preview camera at its default; device stayed SPECS 27; preview refresh after the recompile showed zero runtime errors and warnings.
- Per your no-shell constraint I did not run `npm test` or the typecheck script; TypeScript was verified via Lens Studio's recompile (clean) and the runs above.

## Files changed

- `Assets/QuakeGlobe/Scripts/LocalMapView.ts` — land tint (colour, Z offset, mesh helper, draw call) and the dashed warm line; doc comments updated.
- `Assets/QuakeGlobe/Scripts/Tests/AlertScenario.ts` — land-mesh check added after the zoom assertion; header comment updated. Every existing check kept.

Nothing in `Core/`, `Data/`, or outside `lens/` was touched.
