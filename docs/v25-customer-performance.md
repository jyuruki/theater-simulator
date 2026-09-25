# Customer simulation performance and flow

The v0.24 customer loader solved routes to all fourteen theaters and three waste
stations before play. Each walking actor then considered twelve steering choices
through the entire collision world, repeatedly rescanning long corridor segments
for companion formation. Heading changes were immediate at the 20 Hz simulation
rate. Closed auditorium doors never received a request from a waiting customer.

Version 0.25 prepares only the short lobby exit during startup. Seat paths are
requested when an actual party needs them, serialized, and cooperatively yielded
to the event loop with a 2 ms work target. The target is a soft CPU budget; individual
operations and garbage collection can exceed it. Failed transient routes retry.
Actor movement uses the spatial static-collider index, a cached list of movable
obstacles, and nearby bodies. A 6 cm maximum movement step is shorter than the 24 cm
capsule radius, so endpoint collision checks remain solid. Companion clearance
looks ahead locally instead of scanning the entire remaining corridor each tick.

Walking retains 20 Hz collision updates while interpolating rendered positions and
yaw between steps at the display frame rate. Heading changes are limited to
3.5 radians/sec. Seated actors render only inside the current auditorium; moving
actors render within 30 meters. Invisible customers still progress through the show.

## Repeatable CPU fixture

Run `node scripts/benchmark-customers.mjs` for the working tree, or pass a Git ref
as the first argument to load its customer/navigation implementation. The same
current world, NPC loader, 24-person T2/T6 audience, 4,000 simulation steps, and
prewarmed seat routes are used to isolate this subsystem. Measurements below
compare release 463d3f9 with the v0.25 changes on the development computer.

| Customer workload | v0.24 | v0.25 |
| --- | ---: | ---: |
| Customer asset/route preparation | 10,379 ms | 317 ms |
| Mean update while people move | 13.42 ms | 1.32 ms |
| 95th-percentile moving update | 21.56 ms | 2.46 ms |
| Largest measured moving update | 106.57 ms | 10.65 ms |

All 24 patrons reached their seats in both measurements. This is roughly 90% less
mean customer-update CPU and 97% less customer preparation time. These are local
Node subsystem measurements, not total game loading time, rendering FPS, or an
iPhone benchmark. The long-route yielding test observed occasional 16 ms slices
including shared-machine scheduling/GC, rather than a guarantee that every slice
finishes within 2 ms.

## Behavioral validation

`smoke-customer-flow-v25.mjs` exercises all fourteen doors: a patron request opens
a closed door, following traffic renews a three-second hold, and the door closes
after traffic clears. A full T2 audience trickles through an initially closed door
in three schedule windows (5 early, 8 cumulative before start, 10 after the late party).
The test also checks empty opening-day restoration, no fourteen-room startup
search, event-loop yielding during a long route, and the heading-rate bound. Separate reload fixtures preserve the eight due
pre-show patrons while leaving two late patrons queued, and restore a full
mid-show audience without a duplicate boarding event. A forward cursor visits
each scheduled start once, rather than scanning every event each frame.

`smoke-show-customers.mjs` validates real wall/seat routes for all fourteen rooms,
varied party sizes, paired walking, all 32 T2/T6 departures, actual bin trash disposal,
T13/T14 opposing turnover, stationary-player avoidance, pause, and deterministic
seat/attendance restoration. The automatic hold only returns a guest-opened door
to its closed state; doors deliberately left open by the usher remain under the
usher's control.
