# Open the Lens in Lens Studio

## Fastest: open the included project (SPECS 27, Lens Studio 5.22 or later)

1. Open `lens/QuakeGlobe.esproj` in Lens Studio 5.22 or later (built and tested with 5.24.1).
2. Make sure the Preview panel's device is **SPECS 27** (it is saved that way) and press play.

The project already contains the Spectacles Interaction Kit, the Spectacles UI Kit, the camera
with world tracking, an Unlit material and the `Quake Globe` object with its component wired up.
The README screenshots use the Preview's simulated **Evening Room** environment: a dim room is
closest to how light-on-dark content looks on the glasses.

## Manual setup (any project, including Spectacles 2024 with Lens Studio 5.15)

About ten minutes. The scripts build the whole scene at runtime, so the only manual steps are
installing one package, copying one folder, creating one material and attaching one component.

## 1. Pick the Lens Studio version for your device

| Device | Lens Studio | Project template |
|---|---|---|
| Spectacles (2024) | **5.15.x** (latest 5.15.4) | Spectacles → Base Template |
| SPECS 27 | **5.22 or later** | SPECS → Base Template |

Snap states that 5.15.x is the last series for Spectacles (2024), and that 5.22+ is for SPECS 27
only (https://ar.snap.com/lts, release notes at https://ar.snap.com/download). This project uses
only APIs present in both lines; see "What has been verified" below.

## 2. Create the project and add the scripts

1. Lens Studio Home → create a project from the Base Template in the table above. It already
   contains the Camera Object (world tracking) and the Spectacles Interaction Kit.
2. In Finder, copy this repository's `lens/Assets/QuakeGlobe` folder into the new project's
   `Assets/` folder. Lens Studio picks up files added to `Assets/` on disk automatically.
3. In the Asset Browser, click **+**, search for **Unlit**, and create an Unlit material. Leave its
   Base Texture empty. Culling, depth and blending are set by the script, so the material's own
   settings for those do not matter.
4. Install **Spectacles UI Kit** from the Asset Library (free; Snap's official package). The panel's
   buttons and backplate come from it. Snap's samples use UI Kit 0.1.5 with Lens Studio 5.15 and
   2.0 with 5.22+; the scripts use only components that both have.

## 3. Add the component

1. Scene Hierarchy → **+** → Empty Object, at the root (not under the camera). Name it `Quake Globe`.
2. Select it, then drag `QuakeGlobe/Scripts/QuakeGlobeLens.ts` from the Asset Browser onto the
   Inspector (or **Add Component** and search for `QuakeGlobeLens`).
3. Assign the Unlit material to **Base Material**.
4. Optional: drag `Camera Object` into **Camera Object**. If empty, the Interaction Kit's camera
   is used.
5. Optional inputs: **Font** (any font asset, for example a Google Font added with Lens Studio's
   font tool; empty means the default font), **Globe Radius Cm** (default 12), **Distance Cm** (100),
   **Height Offset Cm** (-8, the globe's centre relative to eye level). With these defaults the
   globe and the panel below it fit the SPECS 27 Preview, whose camera looks 12 degrees down; see
   [DESIGN.md](DESIGN.md#placement-and-the-panel). Buttons are at Snap's minimum target size.

## 4. Preview

1. In the Preview panel set **Device Type Override** to *Spectacles* (5.15) or *SPECS 27* (5.22+).
   Otherwise every network request returns 404 and the globe stays empty.
2. The Logger should print `Lens Opened: v0.1.0`, then the status line changes from
   `Loading earthquake data...` to `Updated just now`.
3. Interactive Preview: W/A/S/D/Q/E move, hold the right mouse button to look around. Left-click
   the buttons. Click-drag the globe to move it (two-hand rotate and resize need a device).

## 5. Publish

* Lens name, icon and a 3:4 preview image in Project Info.
* The panel already shows the version and the Lens logs it at startup, as Snap's publishing
  checklist asks.
* Test on a device if at all possible (or ask on r/Spectacles). Snap's quality bar asks for
  60 fps; the globe draws a fixed set of meshes and rebuilds markers only when data changes.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Could not load data (HTTP 404)` in Preview | Device Type Override is not set to Spectacles / SPECS 27. |
| Nothing renders, error about an undefined input | Base Material is not assigned. |
| Buttons do not react | The scene needs the `SpectaclesInteractionKit` object from the Base Template. |
| Compile error `Cannot find module 'SpectaclesUIKit.lspkg/...'` | Spectacles UI Kit is not installed (step 2.4). |
| Globe is behind you or too high | The camera pose was not ready at start. Grab and move the globe, or raise `Distance Cm`. |
| Status says `Device clock looks wrong` | The feed's timestamp is ahead of the device clock by more than 5 minutes. |

## What has been verified, and what has not

Verified on this repository:

* `npm test`: the platform-independent core (parsing, statistics, state, geometry), including
  runs against real USGS snapshots.
* The browser preview renders the same core with three.js; orientation was checked numerically
  (a selected event lands at screen centre, east to the right, north up).
* The Lens scripts and the core type-check in strict mode against the official Lens Studio API
  declarations for 5.12, 5.19 and 5.24 with Interaction Kit 0.17.2 / 0.18.0 and UI Kit 0.1.5 / 2.0.0:
  `node tools/typecheck/check-lens.mjs --dts <studio.d.ts> --sik <SIK root> --uikit <UI Kit root>`.

* The included project runs in the Lens Studio 5.24.1 Preview (SPECS 27) with live USGS data and
  zero runtime errors or warnings. Simulated hand pinches on **Strongest**, **30 days** and **24 h**
  gave the expected results, including the epicentre ring and the legend's glow window. The
  atmosphere scale read back from the running Lens matched the formula at 100 cm and, after a
  simulated drag, at 50 cm. This was driven through Lens Studio's built-in MCP server (recompile,
  run and collect logs, simulated SIK interaction, runtime scene queries, panel capture).

Not yet verified (no device was available):

* Running on hardware, and the Lens Studio 5.15 path for Spectacles (2024).
* Frame rate on device, text legibility at 100 cm, and how two-hand manipulation feels.

An independent review of the Lens scripts against Snap's samples, SIK sources and design
guidelines found no blockers; its findings (refresh after switching views, render state pinned in
code, hidden-until-placed start, button size and spacing, text wrapping, line widths) are fixed.
