# Version 0.27 — entrance and accessible-landing references

The September 28 entrance sketches and location photos drive this architectural revision.

## Entrances and equipment recesses

Theaters 6, 7 and 8 now have open hall-side entrance recesses before their double doors. Theater 6's upstairs door sits inside its own left-hand mini-cubby. Its existing transverse approach, two under-seat storage doors, long side passage and lower storage roof remain connected.

All six large/medium auditorium entrances use burgundy paired leaves with square dark vision windows, bent stainless pull handles and kickplates. The eight small rooms use single burgundy leaves with square windows, vertical pushplates, kickplates and overhead closers. Physical hinges, solid leaves and guest-held passage remain active.

Three recessed cabinets reproduce the reference: a left broom closet with two stored broom/dustpan kits; a right half-depth metal tray shelf, circular trash opening and gray can; and independent closet/lower access doors. Aim at a handle and use E or the touch interaction button. Both doors stop against obstructions and remember their open state. The cabinet contents are furnishings in this layout pass; the existing rolling-can, bag-service and tray-washing gameplay continues separately.

## Small auditoriums

Theaters 1, 2 and 9–14 retain their footprints, orientation and single-door entrances. Each now has four normal accessible recliners on a ground-level rear landing, arranged as two pairs with a broad center gap. Three conventional rows remain below the landing.

- Theaters 1–2: 32 seats; approximately 2.9 m between the accessible pairs; 3.04 m landing depth; 1.32 m row passages.
- Theaters 9–14: 34 seats; approximately 3.9 m between pairs; 3.66 m landing depth; 1.57 m row passages.
- Two 0.19 m steps connect each tier. The clear floor before the first steps is approximately 1.26 m / 1.88 m in front of the accessible chairs.
- Total capacity is 985; the large and medium theaters' seating is unchanged.

Seat placement, armrests, row collision, cleaning targets and customer seating share one coordinate model. Groups cannot be assigned across the accessible center gap. On old cleanup saves, surviving dirt/tray progress is retained and debris is settled onto the new seat/aisle instead of restoring old coordinates inside moved geometry.

## Validation

Geometry and behavioral coverage includes all fourteen auditorium routes, all 985 seat approaches, actual-model seat clearance, screen sightlines, rendered floor/roof enclosure, full-width row crossings, accessible center passages, stair climbs, cleaning contact and save migration. Focused entrance checks exercise six player doorway traversals and fourteen guests arriving and leaving through initially closed doors in 6–8. Cabinet checks exercise all six doors, approach clearance, true circular openings, persistence and disposal.

The browser inspection includes the 6–8 recesses, single/double door art, both cabinet doors, the four-seat landing and physical descent/ascent of the small-theater stairs. Door detail stays at three material batches per leaf; each cabinet uses eight batches. Production build and generated offline shell validation are part of the release checks.
