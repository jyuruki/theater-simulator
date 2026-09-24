# Version 0.20 — walkthrough corrections and employee direction

This update follows the user's ten marked walkthrough screenshots and September 23, 2026 clarifications. The building remains a 14-auditorium recreation with 1,093 seats. Its dimensions are gameplay approximations informed by the employee plan, reference photographs and the user's corrections.

## Screenshot corrections

| Image | Reported issue | Result |
| --- | --- | --- |
| 1 | Counter access at the office end is too wide; Expo belongs at the other white counter; counter joins look disconnected. | A 1.7 m service opening has two swinging leaves. Expo moves to the kitchen-side white counter. The continuous counter surfaces meet at shared corners. |
| 2 | Box-office L corner overlaps and flickers. | The architectural counter joins use one consistent corner rather than overlapping counter modules. |
| 3 | A tall opening remains above the Theater 3 storage entrance. | The doorway's wall and header continue to the full anteroom ceiling. |
| 4 | Theater 3's storage anteroom ceiling is too low. | The anteroom rises to 4.6 m. The room behind the two inner doors remains at 2.32 m, preserving the real stepped ceiling and seating above. |
| 5 | The small auditorium's last row is too close to the entry-cubby wall. | Clear rear passage width doubles in all eight small rooms: Theaters 1/2 and 9–14. The inner cubby wall retreats while the seat bank and front screen apron stay fixed. |
| 6 | Theater 6's entrance hallway ceiling is too low. | All three public entrance passages rise by 50%, from 2.32 to 3.48 m. Lights and wall headers follow the higher ceiling; the separate storage room stays lower. |
| 7 | Front rows A and B should each step down from the hall-level seating. | In Theaters 3, 6, 7 and 8, A is at −0.88 m, B at −0.44 m, and C and the B/C crosswalk remain at 0 m. |
| 8 | A roof is missing over part of the kitchen service area. | A low ceiling closes the service-floor strip between kitchen storage and the partition, meeting the existing kitchen and connector-nook roofs. |
| 9 | A narrow black slit remains at the office/front-window jamb. | A full-height return closes the 0.4 m setback between the storefront and office block. The office doorway remains open. |
| 10 | The tall wall above the front doors/windows should be glass. | Transparent upper glazing and slim framing continue to the 10.8 m lobby roof across the public frontage. |

The user's additional request enlarges every auditorium screen. Screens retain a 2.08:1 aspect ratio, fill more than 90% of the room width, and remain clear of the side walls, floor and ceiling.

## Seating and screen dimensions

For the four revised large rooms, rows D–H remain at 0.66, 1.32, 1.98, 2.64 and 3.30 m. Each front transition uses two 0.22 m steps; each upper transition uses three. The 1.30 m B/C crosswalk remains at hall level. A guard separates the ground-level side approach from the lowered front bank, whose access is through the side stairs.

Theater 1/2 rear clearance changes from 0.87 to 1.74 m. Theater 9–14 clearance changes from 0.89 to 1.78 m. Their inner cubby walls retreat by 0.87 or 0.89 m, and the side doorways recenter within the resulting 2.73 or 2.51 m-deep cubbies. Seat banks, front screen aprons, row pitch, seat counts, outer doors and room footprints remain fixed. Theater 4/5 retain their existing front-side entry arrangement.

| Auditorium family | Screen width × height |
| --- | ---: |
| Large — 3, 6, 7, 8 | 16.536 × 7.950 m |
| Medium — 4, 5 | 10.800 × 5.192 m |
| Compact — 1, 2 | 8.800 × 4.231 m |
| Standard — 9–14 | 9.800 × 4.712 m |

Screens sit 0.18 m above their front floor. These are fitted model dimensions, not claims about measured theater screen sizes. See [seating details and validation coverage](seating-update.md).

## Theater 3 clarification

The user confirmed that the smaller area behind the inner storage doors can remain lower, as it is in the real theater. Only the approach anteroom needs the ordinary hallway height. The inner storage footprint, doors and 2.32 m roof are retained; its ceiling is not raised through the upper seating deck. The higher anteroom walls close the old sightline above the entrance and above the two inner doors.

## Asset and interaction boundary

The concession and box-office counter shells are now continuous architectural geometry, with joined tops and separate finished base panels. The candy and water bays retain actual openings rather than placing opaque cabinet fronts over their products. The two service-gate leaves open away from an approaching player on either side. Blender appliances, displays, kiosks, seating, people and other furnishings remain part of the asset pipeline. Counter shells provide stable working surfaces for later physical tasks; movable tools and food should remain separate objects.

The intended game follows the user's work at the theater: usher, concession/box office, kitchen, captain, and possibly manager. Usher work includes a physical schedule sheet, cleaning auditoriums and bathrooms, replacing soda BIBs, servicing ICEE stations, and sound/picture checks. Later service tasks should involve actual equipment, food and containers in the scene. The user will provide the POS layout; no final register workflow is invented in this release.

Those mechanics are future work. The current implementation is still a spatial walkthrough with an older visitor ticket/order prototype. The [employee gameplay brief](gameplay-direction.md) defines the physical interactions, props, constrained physics and minimal-menu direction.

## Validation coverage

- [World checks](../scripts/smoke-world.mjs) raycast the Theater 3 door header and stepped ceilings, verify Theater 6's rendered headroom and lights, and compare visual surfaces with the ground/ceiling samplers.
- [Lobby repair checks](../scripts/smoke-lobby-repair.mjs) sample the full kitchen service-floor area for roof coverage and overlapping slabs, inspect upper glazing from both sides, verify the office jamb at multiple heights, and retain the public and office door openings.
- [Seating checks](../scripts/smoke-seating.mjs) exercise the front drops, both stair aisles, crosswalks, all eight enlarged rear passages, lower-storage clearance and all fourteen screen bounds.
- [Counter checks](../scripts/smoke-counter-geometry.mjs) cover joined counter surfaces, the box-office corner, product openings, service-gate clearance and the kitchen-side Expo location.
- Existing layout, navigation, player, visit and asset suites remain part of the regression checks.

Run `npm test` and `npm run build` before release. Full-suite results, the browser walkthrough and deployment verification are recorded during the release process rather than inferred from these coverage descriptions.
