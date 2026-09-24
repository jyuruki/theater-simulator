# Mililani 14 Theater Simulator

[Play the published theater](https://jyuruki.github.io/theater-simulator/)

A first-person browser recreation of Consolidated Theatres Mililani 14, built from Jacob's employee floor plans, corrections, and location photos. The existing 14 auditoriums, 1,093 seats, service routes, two original murals, and exposed lobby pipework remain the foundation.

This is an independent recreation with approximate dimensions, not an official architectural survey or ticket service.

The game starts as an usher with a portable cleaning kit and a handheld break sheet. Follow the fivefold shift clock through all fourteen theaters, clean used trays and seats, sweep into a left-hand dustpan, move three rolling trash cans, replace full bags, service soda BIBs, refill supplies and wash kitchen trays. The [employee gameplay direction](docs/gameplay-direction.md) records the broader career and minimal-menu approach.

## Version 0.22

- **Used-seat cleaning:** each break generates different used seats and messes. Wipe the open tray and cushion, sweep chair popcorn down, close the tray, then clean the floor. The right-hand broom pulls toward the left-hand pan.
- **Physical shift schedule:** a pocket sheet follows the supplied three-column reference. Bold rows start movies; regular rows break. Close auditorium doors at starts. One real minute equals five game minutes.
- **Three rolling cans:** push cans between upcoming breaks, accept customer rubbish, lift and tie full bags, throw them into the trash-room gondola, and fit opened replacement liners.
- **BIB and tray-wash room:** exchange keyed syrup cartons and hoses, refill straws/lids/ketchup/salt, and physically wash kitchen trays. Shared hands and local saves connect all tasks.

See [v0.22 controls, behavior and limits](docs/v22-notes.md). Development inspection is available at `/shift-review.html`.

## Version 0.21 (historical)

- **Raised screens:** every screen begins 1.8 m above its front floor, with taller presentation surfaces and ceilings fitted around them. Images fit the unobstructed viewing space, preserving room footprints and entrance routes. All 1,093 seated views are checked across the entire image.
- **Dimmer halls:** warmer local light pools replace the broad, uniform hall lighting. Ambient light fades smoothly between the halls and lobby.
- **First usher task:** a physical clipboard, broom, dustpan and cloth support a complete Theater 2 cleanup loop. Popcorn moves into the pan before disposal; wiping requires cloth movement. The task is repeatable and saves progress on this device. Visitor ticket menus are disabled.

See [v0.21 details and limits](docs/v21-notes.md).

## Version 0.20 (historical)

This update addresses the ten marked walkthrough screenshots and enlarges all fourteen auditorium screens.

- **Counters and access:** the concession counter has continuous joined surfaces, a 1.7 m opening with two swinging service-gate leaves at the office end, and Expo on the white counter near the kitchen. The box-office L corner also meets cleanly. Counter shells are generated as continuous architecture; Blender appliances, displays and other furnishings remain in use.
- **Storage and entrance ceilings:** Theater 3's entry wall closes above the storage doorway and its anteroom has a regular 4.6 m ceiling. The smaller room behind its inner doors deliberately keeps the lower 2.32 m ceiling, as confirmed by the user. Theater 6's public entrance passages rise from 2.32 to 3.48 m, with the inner storage ceiling retained.
- **Seating and screens:** Theaters 3, 6, 7 and 8 now step down separately to rows B and A, while C and the B/C walkway stay at hall level. The last-row-to-cubby clearance doubles in Theaters 1, 2 and 9–14. All screens fill more than 90% of their room width while keeping a 2.08:1 aspect ratio. Seat counts and auditorium footprints are preserved.
- **Lobby enclosure:** a missing low roof over the kitchen service strip and the narrow office/window-jamb slit are closed. Upper storefront glazing continues above the front doors and windows to the high lobby roof, allowing views outside.

See the [ten-image correction notes](docs/v20-notes.md) and [seating dimensions](docs/seating-update.md).

## Version 0.19 (historical)

This release adds original Blender props and people, shorter hallways, and the revised seating arrangement described below.

- **Blender props:** a library of 33 original models replaces the theater's prop families, including auditorium recliners and shared armrests, concession machines and counters, restroom fixtures, waste bins, service equipment, storage and office furniture. The candy selection bay has colorful cartons; the adjacent water selection bay has individually modeled bottles. Repeated props use GPU instancing. The existing Blender ticket kiosks remain in use.
- **Blender people:** all three staff and three visitors receive new faces, hair, clothing, hands and shoes. Staff have teal uniforms and badges. Animated shoulder and hip pivots retain their existing walking, player avoidance and station behavior.
- **Shorter hallways:** the Theater 1/2 hall run is 30% shorter. The long eastern hall ends 9.7m closer to the podium, with Theater 6, the women's restroom, Theaters 7/8 and the other affected modules moved together with their doors, interior routes and fixtures. Room footprints, hall widths, entrance handedness and the order of room groups are preserved. The two ticket-podium nooks have 75% less floor area, shrinking from 6 × 5.8m to 3 × 2.9m.
- **Seating in Theaters 3, 6, 7 and 8 only:** rows A and B form the front bank, followed by the B/C walkway. A, B and C are level with the hall; stairs begin at D. A wall sits closely behind the last row instead of an oversized rear passage. The other ten seating profiles and all 1,093 seats are retained.

See the [prop library and runtime contract](docs/prop-library.md), [NPC asset notes](docs/npc-assets.md), [seating reference interpretation](docs/seating-update.md), and [Blender source and rebuild commands](assets-source/README.md). Existing colliders and interactions remain authoritative while visual assets load; a failed download retains the playable fallback models.

## Earlier walkthrough fixes and Blender assets

The walkthrough fixes close the raised auditorium edges and upper exterior wall gaps in theaters 3 and 6, fit seat bodies and shared armrests to the actual row spacing, distinguish upper auditoriums from storage below in the location display, correct buried and reversed signs, and restore structural shadows in the office and kitchen. All 14 auditoriums and 1,093 seats are retained.

The four ticket kiosks now share a small photo-guided Blender model, with the existing ticket interface and collision retained. The three overhead showtime screens have also been moved out of the wall surface so they render correctly. See [asset pass notes](docs/blender-first-pass.md), [photo evidence](docs/asset-reference-notes.md), and [editable Blender source](assets-source/README.md).

Run the development server, then open `/asset-review.html` for an interactive comparison with the original kiosks. This inspection page is available during development; the public game uses the new models.

## Version 18

- **Kitchen floor corrected:** the separating wall follows the original straight service-floor edge, closing only the light-floor triangle. The kitchen-storage connector nook remains open. The main kitchen receives its own dark floor polygon, and the kitchen/nook/soffit roofs meet at their existing low ceiling height.
- **Reference-based finishes:** warmer polished lobby concrete, burgundy ripple carpet, gray hallway walls above charcoal panels, white restroom tile with a red band and diamond accents, dark sinks, taps, dispensers, and flecked stall partitions. Counts and room footprints are retained.
- **Detailed service fixtures:** silver kiosk cabinets, portrait touchscreens, card readers and receipt slots; white mosaic concession backsplash and stainless counter bases. Counter overhangs and readers have collision.
- **Working visit:** choose any of 14 fictional shows and a seat from its actual auditorium layout, collect a simulated ticket, check it at the wooden podium, order food, pick it up at Expo, and fill a drink.
- **Living theater:** three staff, three visitors on checked paths, optional ambient sound and footsteps, movie posters, two-sided hanging show signs, and an original animated auditorium pre-show.
- **Entrance movement:** the six double-door assemblies keep their V17 positions. Twelve hinged leaves open toward the front walk as you approach, with collision following their motion. They stay open while a player is in the threshold.

See [V18 implementation and reference notes](docs/v18-notes.md) and the [established layout notes](docs/layout-notes.md).

## Controls

| Input | Action |
|---|---|
| WASD / mouse | Move / look |
| Shift / Space | Run / jump |
| E | Operate the focused prop: take, place, connect, close, or empty |
| Hold left mouse / F | Sweep, wipe while moving, refill, wash, tie, or open a liner; release a charged tied bag to throw |
| B / 1 / 2 | Read the break sheet / select broom and pan / select cloth |
| Q | Holster cleaning tools, release a rolling can, or set down a carried item |
| M | Floor plan |
| O | Sound, volume, and settings |
| R | Return to the usher cart |
| Esc | Close a dialog or pause and release the mouse |

On touch devices, use the movement stick, drag to look, tap the interaction prompt, and hold the task-action button. Sheet, tool, map and settings shortcuts are touch-accessible. Shift progress saves locally on this device.

## Development

Node.js 24 and a WebGL 2-capable browser are required.

```bash
npm ci
npm run dev
```

```bash
npm test
npm run build
```

The regression suites cover:

| Suite | Coverage |
|---|---|
| [Layout](scripts/validate-layout.mjs) | Room geometry, counts, adjacencies, door stations, fixture layouts and preserved lobby details. |
| [World](scripts/smoke-world.mjs) | Rendered floors, ceilings, walls, thresholds, fixture geometry and reflected coordinates. |
| [Player](scripts/smoke-player.mjs) | Collision stopping/sliding, stairs, jumping, headroom and recovery. |
| [Navigation](scripts/smoke-navigation.mjs) | All 14 bowls and the retained route targets, rendered floor/ceiling support, containment and structural overlaps. |
| [Visit](scripts/smoke-visit.mjs) | Six moving entrance assemblies, six safe actors, 19 interaction points and ticket/order/pickup/drink interface flows. |
| [Kiosk assets](scripts/smoke-kiosk-assets.mjs) | Shared models, live screen materials, failed loads and asynchronous disposal. |
| [Enclosure](scripts/smoke-enclosure.mjs) | Raised edges, close rear walls, seat spacing, stacked zones, visible signs and structural shadows. |
| [Prop assets](scripts/smoke-prop-assets.mjs) | Real GLB bounds, normals, budgets, shared instances, visibility, fitting and resource ownership. |
| [NPC assets](scripts/smoke-npc-assets.mjs) | Six real GLB characters, animation pivots, retained avoidance/colliders, atomic fallback and disposal. |
| [Seating](scripts/smoke-seating.mjs) | Separate A/B drops, C at hall level, B/C crosswalks, stair climbing, doubled small-room rear clearances, screen bounds and lower-storage clearance. |
| [Compaction](scripts/smoke-compaction.mjs) | Original room footprints, exact rigid translations, moved fixtures, hall reductions and smaller ticket nooks. |
| [Integrated assets](scripts/smoke-integrated-assets.mjs) | Actual props loaded into the complete theater, all 1,093 chairs and shared armrests, row clearance, display orientation, fitted bounds and unchanged collision data. |
| [Lobby repairs](scripts/smoke-lobby-repair.mjs) | Rendered service-roof coverage and overlap, transparent upper glazing, full-height office-jamb closure and preserved door apertures. |
| [Counter geometry](scripts/smoke-counter-geometry.mjs) | Continuous counter joins, the box-office L corner, display openings, 1.7 m service-gate clearance and kitchen-side Expo. |
| [Screens](scripts/smoke-screens.mjs) | Every seated view across the full image, occupied-row clearance, raised ceilings and retained low entrance roofs. |
| [Lighting](scripts/smoke-lighting.mjs) | Smooth hall transitions, fixture positions and localized light pools. |
| [Usher task](scripts/smoke-usher.mjs) | Seeded used seats in all 14 theaters, ordered contact cleaning, inward sweeping, partial disposal, carryover and bounded visuals. |
| [Shift](scripts/smoke-shift.mjs) | Fivefold clock, reference sheet, all auditorium doors and async GLB tray masking. |
| [Waste](scripts/smoke-waste.mjs) | Three physical cans, routes, leapfrogging, customer throws and full bag/liner cycle. |
| [Supplies](scripts/smoke-supplies.mjs) | BIB replacement, keyed refills, tray washing, contact poses, save recovery and route access. |
| [Combined shift](scripts/smoke-usher-shift.mjs) | Shared hands, paper/tool isolation, timing across all 14 rooms, pause and keyed persistence. |
| [Usher controls](scripts/smoke-usher-ui.mjs) | Mouse, keyboard and multi-touch actions, cancellation and disabled visitor menus. |

GitHub Actions runs the same tests and production build for pull requests and deploys `dist` to GitHub Pages on updates to `main`.

## Current scope

The playable build includes the theater walkthrough and the locally saved usher tasks described above. Bathroom cleaning, ICEE servicing, sound/picture checks, employee progression, cooking and an in-world POS workflow remain future work. The intended register layout will come from the user. See the [gameplay direction](docs/gameplay-direction.md) before adding job mechanics. Cloud saves, real cinema listings and multiplayer networking are outside the current implementation. Materials, characters and dimensions remain an approximation. The reference photographs are documented but are not bundled into the game; models, artwork, programming and sounds are original.
