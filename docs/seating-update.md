# Large-auditorium seating update

Theater 3, 6, 7, and 8 use the supplied eight-row seating reference. The other
auditoriums retain their existing seating profiles. The opt-in is
`stadium.seatingProfile: "front-cross-aisle"`.

## Arrangement

Rows are labeled A through H from the screen toward the rear wall. A and B
form the front bank. A continuous crosswalk separates B from C. Rows A, B,
and C are at the main hallway datum, y = 0. The first stairs lead from C to
D, then continue to H on both side aisles.

| Row | Distance behind A | Floor elevation |
| --- | ---: | ---: |
| A | 0.00 m | 0.00 m |
| B | 2.10 m | 0.00 m |
| C | 5.50 m | 0.00 m |
| D | 7.60 m | 0.66 m |
| E | 9.70 m | 1.32 m |
| F | 11.80 m | 1.98 m |
| G | 13.90 m | 2.64 m |
| H | 16.00 m | 3.30 m |

Each raised transition has three 0.22 m stair treads. The dedicated B/C
crosswalk slab is 1.30 m deep; the clear distance between the seat bodies is
larger. Row C joins that crosswalk without a step. The existing exterior
entrances and route handedness are preserved. Their inner divider ends now
open at the crosswalk; the approach surfaces reach y = 0 before that opening.

A new full-height partition stands 0.72 m behind the center of the H seats.
Its inner face leaves only a small maintenance gap behind the seat backs,
with no rear circulation passage. Where it crosses a lower storage room, the
partition starts at the upper deck; its other sections extend down to ground
to enclose the unused rear volume. Lower storage rooms and approach passages
remain clear. The former empty
rear landing is removed from both rendered floors and ground sampling.

The row pitch and rise keep the seating deck and solid stair slabs above the
existing Theater 3 and 6 storage roofs. No lower room footprint was changed.
All positions derive from each auditorium's bounds, so corridor compaction
can translate a whole auditorium without changing its seating shape.

## Reference interpretation

The reference establishes the front two-row bank, B/C crosswalk, eight-row
sequence, and compact rear wall. Gray X marks were treated as unavailable
seats, not holes in the seating bank. Existing per-row capacities are
retained: Theater 3 has 148 seats, 6 has 148, 7 has 153, and 8 has 152. The
whole game remains at 1,093 seats. No unsupported wheelchair bay dimensions
or capacity changes were inferred from the reservation diagram.

## Validation

`node scripts/smoke-seating.mjs` checks the four selected rooms, unchanged
capacities, level A/B/C rows, the B/C walkway, stair geometry and sampled
elevations, direct rear-wall spacing, absence of a hidden rear walking floor,
and translation invariance. It samples the retained lower storage footprints
to check slab clearance, ray-tests the rendered crosswalk and stair floors,
walks the player up both aisles in each large room, and traverses all four
crosswalks with the real collision and ground samplers.

The enclosure regression also walks toward the new rear walls and the
Theater 6 side divider, while retaining its seat-overlap, stacked-zone,
sign-visibility, and shadow-occlusion checks.
