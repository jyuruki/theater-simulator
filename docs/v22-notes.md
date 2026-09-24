# Version 0.22 — Usher rounds

The employee shift now covers all fourteen theaters. One real minute advances
the schedule by five game minutes while playing. Pausing stops the shift.

## Cleaning

Take the portable kit from the cart in Theater 2. Use **1** for the right-hand
broom and left-hand dustpan, **2** for the cloth, and **Q** to holster them locally.
The broom pulls kernels toward the player into the pan.

Each break selects three to six used seats across that theater's rows and
columns. Their trays are swung open. Wipe each tray even when it has no obvious
spill, wipe its cushion, sweep chair popcorn onto the floor, then press **E** to
close the tray. Clean the floor after all used seats are ready. Wiping requires
moving the cloth across the surface; holding still does not finish it. Empty
the dustpan into a rolling can. Full or unlined cans retain unaccepted debris
in the pan. A later break never erases unfinished work.

## Break sheet and doors

**B** unfolds the employee's paper sheet anywhere. Its narrow, ruled three-column
layout follows the supplied reference: theater number, fictional movie, time.
Entire start rows are bold; breaks are regular weight. Close the auditorium's
doors when its movie starts. Door leaves have moving collision and stop for
the player or a can in their swing. The sheet blocks tool actions while being
read, but the clock continues.

## Rolling waste

Three circular gray cans begin beside the next three breaks. Aim at a handle
and press **E**, then walk to push. **Q** releases the can. After a theater is
clean, its can's label recommends the next unserved break; physically roll it
there. Breaking customers visibly toss packaging into available cans. The
stationary auditorium bins remain fixtures for the later janitorial shift.

Aim at a full can's opening and press **E** to lift its liner. Hold the action
button to tie it, carry it to the trash room opposite Theaters 1/2, then hold
and release to throw the tied bag into the gondola. Take a spare from the can's
pouch, hold to open it, and fit it around the empty rim. Extra liners are in the
trash room. Cans have constrained collision, inertia and rotating casters; bags
use gravity, collision and a throwing arc. This is not a general rigid-body
simulation for every furnishing.

## Supplies and washing

The room behind the fountains now contains a three-flavor BIB rack, supply
cartons, and a tray-washing bench. Disconnect an empty BIB, lift and recycle it,
carry a matching full carton into its slot, then reconnect the hose. Gauges
show actual remaining syrup. Carry straw, lid, ketchup or salt stock to the
matching fountain-side dispenser and hold to refill it. Pick up a dirty kitchen
tray, hold it under the faucet to wash, then place it on the clean stack.

Hands are shared across all tasks: holster or set down the current item before
picking up another. Opening the sheet, switching tools, losing focus or cancelling
a touch gesture cannot accidentally launch a charged bag throw. Saves retain
schedule, cleaning, supplies and waste state locally on the same browser.

## Scope and verification

Room footprints, all 1,093 seats, screens and existing service routes are retained.
Seat-cleaning views exposed older open stair risers and uncovered sidewall margins.
These now have continuous surfaces at their existing heights, preserving entrance
passages and the intentionally lower storage rooms.
The new interactions use separate movable parts and visible physical states.
Seeded messes are sparse occupancy samples rather than a full audience simulation.
Bathroom cleaning, ICEE servicing, sound/picture checks, career progression,
cooking and physical POS ordering remain future work.

`npm test` covers cleaning contact/order, all fourteen standing routes, schedule
timing, tray masking with real GLB assets, moving door collision, shared hands,
bin movement and bag replacement, stock refills, tray washing, persistence and
input cancellation. `/shift-review.html` provides development-only inspection
views and task controls; the production build exposes the employee game only.
