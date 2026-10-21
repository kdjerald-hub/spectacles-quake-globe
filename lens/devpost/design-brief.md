---
status: approved
---

# Design brief: Live Quake Globe

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

## The one spatial moment
I live in an earthquake zone, where quakes big and small happen all the time. When the national
earthquake alert pops up on my phone, my glasses immediately mark both positions: where the epicenter
is and how close it is to me, and my safe spot at home. I may only need it a few times in my life, but
I want it to be something you remember for the rest of your life after using it once.

## Why it belongs on glasses
- Uses: draws in the world (the safe spot is marked where it really is in my home, and the epicenter
  sits on a globe in my room) and leaves your body free (eyes up and hands free to take cover).
- Why it's better than the phone or laptop version: the phone alert only says to take cover; the
  glasses show where the quake is, how far away it is, and where my safe spot is, without looking
  down at a screen. (default)

## Product or overlay
- Type: overlay: it responds to something real, the national earthquake alert on my phone, and
  marks a real place, my safe spot. The globe of live quakes is the product around it.
- What the real version would sense: the national-level earthquake alert shown on my phone, after
  which the glasses show our screen.
- Stand-in for the preview:
  - Alert detection: a big "Phone alert received" button (default name) that plays a simulated
    national earthquake alert. The simulated quake is hard-coded: the M7.4 Hualien, Taiwan earthquake
    of 2024-04-03, with its location, depth and magnitude taken from the USGS catalog at build time
    (default). The alert card says plainly that this is a simulation.
  - Safe spot: I mark it myself with a pinch in the room (stand-in for recognizing my home).
  - Home location: I set it myself (my own set location). In the preview I pinch a point on the
    globe and choose "Set as home" (default, because the keyboard does not appear in the preview).
  - Emergency contacts: sending is simulated; the Lens only shows "Sent to emergency contacts".

## Where things live
- Where the user is looking during the main task: straight ahead at the globe, then toward the safe
  spot. (default)
- Globe: about 24 cm across, about 1 m in front of me, a little below eye level, with the panel below
  it, as in the current build. (default)
- Alert card: appears next to the globe, inside the view, about 1 m away, a little below eye level,
  never covering the globe's interior. (default)
- Epicenter marker: a pulsing ring on the globe at the quake's location, with a line from my home
  marker to it and the distance in km. (default)
- Home marker: a small marker on the globe at the location I set. (default)
- Safe spot marker: a glowing marker about 40 cm wide where I pinched in the room, at floor or table
  height. (default)
- Emergency-contacts message: on the alert card.

## Hands and input
- Set home: pinch a point on the globe, then pinch "Set as home". (default)
- Set safe spot: pinch "Set safe spot", then pinch where it is in the room. (default)
- Trigger the simulated alert: pinch "Phone alert received". (default)
- Send to emergency contacts: pinch a big button on the alert card; the card then shows "Sent to
  emergency contacts". (default)
- Inspect a quake: pinch a quake on the globe to see its details card.
- Grab the globe to move, turn or resize it; existing buttons stay: 24 h, 7 days, 30 days,
  Strongest, Spin.
- Targets are big and highlight when aimed at.
- Voice (if any) and the button that does the same job: none.

## When things show
- Normal: the globe with live quakes, map detail, continent and country names, and plate boundaries.
  Names show a few at a time and fade before the globe's edge. (default)
- Quake details card: shows when I pinch a quake, hides when I pinch its close button or another
  quake. (default)
- Alert: when the stand-in fires, the alert card and a chime appear at once, the epicenter ring pulses
  on the globe, the home-to-epicenter line and distance show, and the card shows the official
  guidance "Drop, Cover, Hold On". (default)
- Alert hides when I pinch "I'm safe" on the card. (default)
- If something needs attention out of view: if the safe spot is out of view during the alert, a chime
  and a small arrow point to it. (default)

## Done criteria
Each one can be checked in Lens Studio's preview.
1. Map detail: the globe shows detailed coastlines, continent and country names, and plate
   boundaries, and I can see more detail when I make the globe bigger.
2. Quake details: pinching a quake shows a card with its coordinates, magnitude, depth, time, place,
   and the nearest plate boundary.
3. Alert: pinching "Phone alert received" shows the alert card within a second, marks the epicenter on
   the globe, and shows its distance from my home.
4. Safe spot: after I mark my safe spot, the alert points me to it with an arrow and a chime, and the
   card says "Drop, Cover, Hold On".
5. Emergency contacts: pinching the send button on the alert card shows "Sent to emergency contacts".

## Out of scope
- Detecting the real phone alert (reading the phone screen through the camera); the preview uses the
  stand-in button.
- Sending real messages to contacts; this version only shows the confirmation.
- Air-raid alerts and government shelters: noted for a later version.
- Remembering home and safe spot between sessions (the preview can't show it).
- Real early warning before shaking: the Lens is not a warning system.

## Risks and open questions
- The Lens runs only while it is open and cannot receive alerts on its own. On real glasses it would
  have to detect the phone's alert through the camera, which needs camera permission; with internet
  access that means Snap's Transparent Permission (a prompt at launch and a blinking LED). Kept by the
  learner; the demo must label the alert as a simulation.
- Official guidance during shaking is to drop, cover and hold on where you are, not to move to another
  place. The safe spot should be right next to where the user usually is.
- Sending to emergency contacts needs a messaging service and the contacts' consent; simulated only.
- Feel unproven: comfort over time and real hand tracking.

## Design notes after the first build (2026-10-19, from an AI-assisted review, approved by the learner)
Judging the first build against official guidance changed the alert. Official guidance during
shaking is to drop, cover and hold on where you are, and phone alerts don't say where the quake is.
- The alert leads with "Drop, Cover, Hold On" in the biggest text. The safe spot becomes a **cover
  spot**: cover within a step of where I usually am, such as the table next to me. The arrow and
  chime show only when the cover spot is out of view.
- The globe still marks the epicenter and its distance from home at once, but nothing needs a pinch
  while the ground shakes.
- When the shaking stops, I pinch "Shaking stopped". Then the card shows the quake details with the
  nearest plate boundary, the "Send to emergency contacts" button, and "I'm safe".
- Every alert screen says SIMULATION, the card doesn't copy the look of an official alert, and the
  video ends with "Not a warning system. Follow official guidance."
- The demo home is Hualien City. In 2024 the real alert went to Hualien and 11 other counties, but
  not to Taipei, which still shook at intensity 5-.
- The magnitude shows both scales: USGS M7.4 (Taiwan's Central Weather Administration: ML 7.1 in
  its official report No. 019; 7.2 was the first figure reported that morning).

Done criteria 4 and 5 now read:
4. Cover spot: after I mark my cover spot, the alert leads with "Drop, Cover, Hold On" and shows the
   cover spot, with an arrow and a chime when it is out of view; nothing needs a gesture while
   shaking.
5. After the shaking: pinching "Shaking stopped" shows the quake details, and pinching the send button
   shows "Sent to emergency contacts".

## Polish notes after judging the third build (2026-10-20)
The learner asked the agents to judge the build and fix what they found before filming.
- Text must read easily from where I stand. The alert headline "Drop, Cover, Hold On" is clearly the
  biggest thing on the card, about twice its current size, and every other line on the side cards
  is easy to read in a screen recording.
- Buttons on the side cards are full width with labels on one line; "Send to emergency contacts" no
  longer wraps inside a small button.
- The cover spot sits on the real surface I pinch (a table or the floor in the preview room), as the
  brief says ("at floor or table height"). Where no surface is found, the current placement plane is
  the fallback.

## Notes from the video review (2026-10-21)
A four-member AI review committee judged the first cut of the demo video; the learner asked the
agents to fix what they found. For the Lens:
- During the alert the dashboard steps aside: the main panel and its buttons hide while the alert
  is open, so the only thing to tap while shaking is "Shaking stopped". They come back after
  "I'm safe".
- The alert card takes the panel's place, centred below the globe at about 1 m, big enough to read
  in a screen recording, and never over the off-view arrow.
- The globe labels the epicentre ring with its distance from home ("15 km from home").
- While setting the cover spot, the hint ("Point at a table or the floor and pinch...") stays near
  where I am looking, so it is still readable when I look down.
- The card says "Taiwan CWA: ML 7.1" (the official report) and "Depth 40 km (USGS)".
- The alert picks its wording from the hazard profile that matches the alert's event type.

## Notes from checking the second cut (2026-10-21)
An AI-assisted check of the second cut, at full size, before it went back to the committee. The
learner asked the agents to fix what they found. For the Lens:
- The off-view arrow must read at a glance as pointing at the cover spot. Its near-equilateral
  triangle reads as pointing at the alert card instead: when the spot is down and to the right,
  the triangle's right edge stands upright and the whole shape reads as "pointing left". Make it a
  shape whose tip is unmistakable, like a navigation arrow.
- The "15 km from home" label must read cleanly. It sits on top of the country names and the dense
  coastline south of Taiwan ("Indonesia" runs through it). Map names keep clear of it, and it sits
  in open space near the ring.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
