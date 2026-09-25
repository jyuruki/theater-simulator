# v0.24 — Customer flow and practical cleaning

Small-theater red doors keep their inner-cubby positions with hinges on the
opposite side. Blind pockets beside these cubbies are closed flush with the
back wall, with full-height walls and matching collision. The usable entrance
route, seats and legitimate storage passages remain intact. Hall fixtures use
broader overlapping light with approximately the previous average brightness,
reducing alternating bright and dark patches.

## Customers and occupied seats

Audience size varies with the show's seeded popularity: 2–24 patrons per movie,
divided into parties of 1–5. Parties use adjacent seats and walk beside one
another where the corridor permits, narrowing into single file at tight spots.
Routes favor clearance from walls; local steering and replanning handle the
player, other patrons and movable obstructions. Departures have priority before
new parties enter a congested auditorium. Closed doors still require opening;
patrons do not pass through solid obstacles.

The same attendance plan determines which trays open when that movie breaks.
Unused chairs stay closed. This is a bounded browser audience, not a simulation
of all 1,093 seats being occupied. A party can still wait when a passage is
physically blocked and there is no safe route around it.

## Cleaning and rolling cans

Select the cloth with **2**, aim at a used tray or cushion and hold the action
button. Routine wiping takes about one second; a visible spill takes about six
broad swipes. While working on a chair, the cloth/hand action pushes popcorn
onto the floor. The broom stays off the upholstery. After tray, cushion and
chair debris are clean, **E** closes the tray. Open trays swing outward into the
row's front aisle. Select **1** to sweep floor popcorn whenever convenient,
including before finishing the seats.

The wiping slowdown came largely from stationary kernels checking all world
colliders at every physics step. Those redundant checks are removed, distant
boxes are rejected early, and only held tools receive contact resolution. The
same 1,093-seat CPU fixture improved from 7.63 to 0.85 ms per cleaning update.
This is subsystem CPU timing, not total frame time or an iPhone benchmark; see
the [investigation and reproducible benchmark](v24-cleaning-performance.md).

Gripping a rolling can couples it to the player at the handle. It follows normal
walking, reversing and turns; wall contact also stops the player's end of the
handle. Both bodies keep collision. **Q** releases the can. Full liner removal,
tying, gondola disposal and spare-liner replacement retain their physical steps.
Completed saved rooms and matching partial seat progress survive the update.

## Clock, sheet and placement

The on-screen shift clock replaces the wristwatch; one real minute remains two
game minutes. **B** opens the reference-style sheet: **time → theater # → title**.
Start rows are entirely bold with the time flush left. Break rows use regular
type and an indented time, reproducing the photographed staggered layout without
the blue pen marks.

**G** opens a carried item's placement preview. Click, **E**, or the touch confirm
button places it; **G** or **Q** cancels. Green means supported and clear, red
means blocked. Touch shortcuts remain available.

## Screen program and audio

The supplied Hula trailer remains the opening cue. It is followed by the complete
9:56 Big Buck Bunny, including its credits, licensed under CC BY 3.0. The film
loops for the remaining fictional showtime; all rooms currently share this one
program rather than a movie catalog. Credits, source and conversion details are
in [media attribution](../public/media/README.md).

At most two nearby feature videos decode simultaneously. Distant show clocks
continue logically, so approaching a room resumes its current film position.
Feature audio streams through Web Audio instead of decoding a ten-minute PCM
buffer. The film and trailer use directional auditorium audio, with door
muffling and a smooth transition into the room rather than a sudden volume
drop. Pause and backgrounding pause playback along with the shift.

The installed web app retains offline caching and update controls. Media must
finish downloading before it is available offline. Device-specific iPhone
behavior still needs confirmation on actual hardware.
