# How CLAD built the Lens

Each pass is one headless Claude Code session with Snap's ls-clad plugin, working in Lens Studio through its MCP server. The prompt and the agent's own final report are kept as they were; local paths are removed. The orchestrating session wrote the prompts and checked every pass afterwards: unit tests, a strict type check, the raw LEAF results in the logs, and the saved scene.

| Pass | What it did | Turns | Minutes | CLAD skills loaded |
|---|---|---|---|---|
| [1](pass1.md) | The alert overlay | 160 | 53 | specs-leaf-write-scenarios, build-sfx, lens-studio-field-notes, specs-leaf-install-packages, specs-leaf-run-in-preview |
| [1b](pass1b.md) | Make every LEAF test pass | 71 | 17 | specs-leaf-run-in-preview, specs-leaf-write-scenarios |
| [1c](pass1c.md) | Finish after a Lens Studio restart | 48 | 13 | none |
| [2](pass2.md) | Map detail | 109 | 29 | none |
| [3](pass3.md) | The two-stage alert | 113 | 59 | none |
| [4](pass4.md) | Readability, and the cover spot on surfaces | 128 | 42 | specs-world-query |
| [5](pass5.md) | The off-view arrow points at the cover spot | 67 | 26 | specs-leaf-run-in-preview, specs-leaf-write-scenarios |
| [6](pass6.md) | Changes from the video review | 133 | 33 | none |
| [7](pass7.md) | The arrow's shape and the epicentre label | 84 | 15 | none |
| [8](pass8.md) | The committee's second review: the Taiwan name, a real pinch test, the hint, the guidance line | 154 | 48 | lens-studio-router, specs-leaf-run-in-preview, preview-inspection |
| [9](pass9.md) | The map of your area: during the alert the globe zooms into a map around home | 144 | 55 | lens-studio-router |
| [9b, first try](pass9b_stopped_blank_project.md) | Stopped: Lens Studio had reopened on a blank project | 29 | 4 | specs-leaf-run-in-preview, preview-inspection, lens-log-analysis |
| [9b](pass9b.md) | Finish pass 9 after a Lens Studio restart | 67 | 8 | lens-studio-router, specs-leaf-run-in-preview, lens-log-analysis, preview-inspection, editor-api |
| [10](pass10.md) | Land tint and a warm dashed home-to-epicentre line on the map | 74 | 11 | none |
| [11](pass11.md) | The two demo-video drivers, written fresh from a shot list | 47 | 7 | specs-leaf-write-scenarios, specs-leaf-run-in-preview |
| [12](pass12.md) | The narrated cut's review: no text hidden during the zoom, labels clear of lines, the dashed line readable | 120 | 30 | lens-studio-router, lens-studio-field-notes, editor-api, specs-leaf-run-in-preview, preview-inspection, lens-log-analysis |
| [12b](pass12b.md) | Finish pass 12 after a usage limit | 86 | 12 | lens-studio-router, specs-leaf-run-in-preview, lens-log-analysis, preview-inspection, editor-api |

In all: 1605 turns, 7 h 37 min. The total is summed from each pass's exact duration and then rounded to the minute, like each pass; it is not a sum of the rounded minutes above.

Not in that total: the stopped first try at pass 9b, 29 turns and 4 minutes, with 10 Lens Studio MCP calls, 7 file reads and 0 edits (see its note). The video's build replay shows the other 16 passes and counts only their calls.

Turns and minutes are Claude Code's own count. By the logs' clock, pass 3 took about 6 hours: it ran overnight, with long pauses between steps that Claude Code's count leaves out.
