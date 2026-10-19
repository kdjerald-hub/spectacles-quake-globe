# Submission kit (Spectacles Community Challenge)

Everything the entry needs besides the Lens itself. Rules referenced here are from the
2026 Terms and Conditions (Lenslist / Snap) and the challenge page; re-check both for the
edition you enter, because the organiser can change them.

## Before you start

- [ ] Confirm the next edition is open and note its submission window and deadline:
      https://lenslist.co/spectacles-community-challenges
- [ ] Search Lens Explorer on a device (or ask on r/Spectacles) for an existing earthquake
      globe, so the entry is not a duplicate.
- [ ] Register for the edition (name, e-mail, Snapchat username, country of residence).

## Categories this project can enter

| Month | Category | What to submit |
|---|---|---|
| 1 | New Lens **and** Open Source | Publish the Lens; put this repository on GitHub. The rules allow prizes in both in the same month. |
| 2 | Lens Update | A substantial new feature (bug fixes do not count). Candidates: historical replay of a major quake, a cross-section slice tool, plate-boundary overlay. |
| 3 | Open Source | The data layer as a separate reusable library (fetch, retry, freshness, validation). It must be substantially different from the first entry. |

## Rule checklist

- [ ] The Lens contains no Snapchat or Spectacles logos or branding.
- [ ] No third-party company names, products or logos inside the Lens. The only external name
      shown is the data credit "USGS", a US government science agency, not a brand. If you want
      zero risk, shorten the footer to "Not a warning system" and keep the credit in the Lens
      description and README.
- [ ] All submission materials in English.
- [ ] Demo video under 30 seconds.
- [ ] Video posted on r/Spectacles, link included in the form.
- [ ] For New Lens: the Lens passes the Lens Explorer quality bar and is published from your own
      Snapchat account. Publishing review can take 24-48 hours, so publish early.
- [ ] Not funded by the Spectacles Lens Fund.
- [ ] Prize payment needs a bank account; 10% Polish flat-rate tax is withheld unless you send a
      certificate of tax residence (check with the National Taxation Bureau whether the Taiwan-
      Poland tax agreement applies to prize income).

## Lens name and description (draft)

**Name:** Live Quake Globe (placeholder; pick your own)

**Description (Lens Explorer, short):**
A live globe of the world's earthquakes, floating in front of you. Walk around it to see quakes
inside the Earth, where they trace plates sinking into the mantle. Tour the strongest events,
switch between 24 hours, 7 days and 30 days, and see whether today is busier than usual.
Data: USGS, refreshed every five minutes. Not a warning system.

**Description (submission form, longer):**
Flat maps hide the most revealing thing about earthquakes: depth. This Lens draws the last day,
week or month of earthquakes from the USGS real-time catalog on a globe in front of you, each one at its
true location and depth (exaggerated three times so the deepest events sit a third of the way to
the centre). Walking around the globe, you can see the dipping planes of quakes under Tonga, Japan
and the Andes, the slabs of ocean floor descending into the mantle, which no phone screen can show.

"Strongest" tours the ten largest events in the window and turns each one toward you, rings its
epicentre and drops a stem down to its depth. A small panel compares the last 24 hours with the previous 29 days ("within the
usual range", "busier than usual") using plain counts, no forecasting.

Built for honesty with live data: the Lens says how old the picture is, admits when it is offline
or stale, never drops records silently, and keeps the last good data when a refresh fails. All logic
lives in a platform-independent TypeScript core with 69 unit tests run against real USGS snapshots,
the same core drives a browser preview, and the Lens scripts type-check in strict mode against the
official API declarations of three Lens Studio versions.

## 30-second demo video, shot list

| Time | Shot | On screen |
|---|---|---|
| 0-4 s | Globe appears in front of you, idle spin | caption: "Every earthquake on Earth this week" |
| 4-10 s | Walk around to the side of Tonga or Japan; deep blue quakes form a dipping plane | caption: "See them inside the Earth" |
| 10-17 s | Pinch Strongest twice; globe turns, a ring marks the epicentre, the stem drops to the event, panel shows M / depth / place | |
| 17-23 s | Switch to 30 days; globe fills in along the plate boundaries | |
| 23-28 s | Panel: "Within the usual range (typical 19 ...)" | caption: "Is today normal?" |
| 28-30 s | Hold on globe | "Live USGS data. Not a warning system." |

Recording without your own device: ask on r/Spectacles for someone to record a capture, or use the
Lens Studio Preview recording if the edition's rules accept it (check the current FAQ). In the
Preview, the simulated **Evening Room** environment shows the glows best: a dim room is closest to
how light-on-dark content looks on the glasses.

## r/Spectacles post (draft)

**Title:** Live Quake Globe: this week's earthquakes on your table, at their real depth

**Body:**
I built a Lens that puts the USGS real-time earthquake catalog on a globe in front of you. Each quake sits
at its true depth (x3), so if you walk around to Tonga or Japan you can see the planes of deep quakes
tracing plates sinking into the mantle. "Strongest" tours the biggest events; a panel says whether
the last 24 hours were busier than the past month.

Open source (Apache-2.0), with a tested platform-independent core and a browser preview:
<GitHub link>

I don't have a device of my own yet. If you try it, I'd love to hear how the hand interactions and
frame rate feel on hardware.
