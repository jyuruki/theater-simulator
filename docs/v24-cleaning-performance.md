# Cleaning CPU investigation

Holding the cloth triggered expensive work unrelated to the wipe. At every
120 Hz physics step, each stationary popcorn kernel queried the entire world
for movement collisions even though its velocity was zero. With the old 1,093
used-seat jobs, the scene had 829 world colliders. Node CPU sampling identified
the collision callback, `segmentHitsBox`, and `canMove` as the leading work.

The fix skips movement queries for resting kernels, rejects distant collision
boxes before expanding them or doing segment tests, and resolves only the tool
actually held. It preserves collision checks for moving kernels and valid tool
contact. The regression suite asserts that stationary debris across all 1,093
chairs generates zero movement collision queries, alongside through-wall and
chair-edge collection tests.

Measured on the development computer using 1,400 updates after 100 warm-up
frames, holding the cloth at a Theater 2 tray:

| Workload | Mean CPU/update | 95th percentile |
| --- | ---: | ---: |
| v23, all 1,093 seats | 7.63 ms | 8.87 ms |
| v24, identical 1,093-seat fixture | 0.85 ms | 1.01 ms |
| v24, 185 occupied seats across 14 shows | 0.40 ms | 0.50 ms |

The identical workload improvement is about 89%. These are CPU-only subsystem
measurements with canvas drawing stubbed; they are not total GPU frame time or
an iPhone frame-rate claim. Run `node scripts/benchmark-cleaning.mjs --all-seats`
for the comparison fixture, or omit the flag for current show attendance.
