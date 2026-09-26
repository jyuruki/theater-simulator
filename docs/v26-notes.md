# Version 0.26 — Natural turnover

Customers stay seated until their departure route and standing space are clear.
Departing guests follow one another in narrow passages and throw packaging while
walking past a reachable can. They no longer converge on one disposal waypoint
or stop for a disposal animation. A full, unlined, held or obstructed can does
not stop the exit stream; guests carry their rubbish onward. Base walking speed
is 40% higher. Rolling cans hold 180 units instead of 120, preserving the actual
contents of existing saved bags and cans.

New shows have quieter attendance with occasional empty screenings and a busy
tail. The deterministic 1,400-show test averages 5.94 customers rather than 12.57;
2.6% are empty, 49.9% have one to four customers, and 7.4% have sixteen or more.
Larger rooms average more attendees. The browser population limit remains 24
per show, in contiguous parties of one to five. During live play, used trays
come from customers who actually reached a seat. Disabling customer visuals
retains the seeded cleaning workload.

Initial floor messes now occur in occupied row aisles. A customer has a 20%
chance of leaving floor popcorn and a 2.5% chance of a floor spill. Most popcorn
clusters have one to three kernels; rare dropped bags contain 18–30. Spill
footprints also vary. There are no guaranteed screen-front messes. An empty
show has no cleanup. The broom and dustpan are black with yellow broom bristles.

New days use the reference sheet's mixed opening order:
13, 14, 8, 5, 9, 4, 6, 3, 12, 1, 11, 2, 10, 7. All fourteen theaters participate,
times stay on five-minute increments, and breaks remain at least ten game
minutes apart. Startup and pause settings now include 20× and 50× fast forward.
The clock and supply consumption use the selected rate. Customers accelerate
up to four times their new base simulation pace in fast forward; player tools
remain at their normal pace. Obsolete unspawned arrivals are canceled when a
show ends, preventing a backlog of people boarding a finished movie.

Existing saved shifts keep their timetable and original audience recipe until
**Start new day** is selected. Partially cleaned rooms retain the exact old
mess recipe, dirt cells and swept kernels through repeated reloads. New breaks
use the new aisle mess recipe, including on preserved schedules.

## Validation

- Attendance distribution and exact compatibility with 1,400 released audience
  plans, including seat and party identities.
- 896 generated cleaning samples: 7,692 supported, collision-free aisle kernels,
  296 occasional floor spills, all fourteen rooms and old/new partial saves.
- Theater 5 busy exit fixture: all 18 guests exit, at most two standing at once,
  ten moving tosses before the initially partly full can fills, and no bin jam.
- A second 19-person Theater 5 fixture reproduces a player blocking the row aisle
  for 95 seconds before leaving. A strict exit-progress priority prevents circular
  yielding at the merge; all 19 leave after the obstruction clears. Additional
  13-person Theater 2 and 24-person Theater 8 tests clear with available and full cans.
- Full, moved, held, unlined and obstructed bin behavior; guest door operation;
  adjacent-room turnover; player avoidance; fast-forward cancellation and used
  seat tracking.
- All 112 daily events delivered once at 50× across reload, v25/legacy timetable
  compatibility, mobile speed controls and synchronized supply consumption.
- Existing geometry, navigation, sweeping, media, PWA and rendering regressions
  remain part of the complete test suite.

The same 24-person arrival CPU fixture used for v0.25 measured 1.10 ms mean and
1.84 ms 95th-percentile customer updates, versus 1.31/2.56 ms for the prior release
on this computer. Both completed all 24 arrivals. This measures the customer
subsystem in Node, not total rendering FPS or iPhone performance.

The development inspection page includes sparse aisle mess views and a busy
seated-audience fixture for reviewing departure behavior without waiting through
a show. It is not included in the published production entry points.
