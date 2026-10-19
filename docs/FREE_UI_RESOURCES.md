# Free UI resources for Spectacles

What was found while designing the panel, and what the Lens uses. Licenses are as stated by each
source on 2026-10-19; check again before shipping anything new.

| Resource | What it is | Used here | License as stated |
|---|---|---|---|
| **Spectacles UI Kit** (Lens Studio Asset Library) | Snap's official component package: buttons, toggles, sliders, frames, backplates, with Snap's hover, press and toggle feedback | Yes: `RectangleButton` for every button and `RoundedRectangle` for the panel backplate | Free in the Asset Library and made for use in Lenses. The package README states no separate license. |
| **Snap OS 2.0 Design Kit** (Figma Community): https://www.figma.com/community/file/1596680511621353511 | Snap's design file for Snap OS screens and components | As a visual reference only; nothing copied | No license stated on the page. Treat it as reference until Snap says otherwise. |
| **Google Fonts**, through Lens Studio's font tool (the `FontSelector` tool of its MCP server) | Imports a Google Font as a font asset | No. The Lens has an optional **Font** input for one | Each family is open source, under the SIL Open Font License, Apache 2.0 or the Ubuntu Font License. Check the family's page on fonts.google.com. |
| **Material Symbols**, through Lens Studio's icon tool (the `IconSelector` tool) | Imports an icon as an image (defaults: Rounded, weight 600, filled, white, 512 px) | No. The buttons are text-only | Apache License 2.0. |
| **Snap's UI design guidance**: https://developers.snap.com/spectacles/best-practices/design-for-spectacles/ui-design | Rules for additive displays: light on dark, no gradients with opacity, minimum target sizes | Yes: the panel and every glow follow it | Documentation. |

Notes for an additive display, from that guidance and from building this Lens:

* White is brightest and black is transparent. Dark fills only matter in recordings.
* Avoid gradients with opacity; use solid colours and additive glows instead.
* Buttons should give 3D press feedback. UI Kit buttons do this out of the box.
* UI Kit buttons create their own collider on a child object named `Collider` when they are
  initialised. To make one a toggle from code, set its toggle input before `initialize()`; calling
  `setIsToggleable(true)` afterwards also works but prints a warning (see `LensUi.ts`).
