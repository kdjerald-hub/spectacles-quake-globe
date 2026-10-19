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
