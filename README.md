# Mililani 14 Theater Simulator

[Play the published theater](https://jyuruki.github.io/theater-simulator/)

A first-person browser recreation of Consolidated Theatres Mililani 14, built from Jacob's employee floor plans, corrections, and location photos. The existing 14 auditoriums, 1,093 seats, service routes, two original murals, and exposed lobby pipework remain the foundation.

This is an independent recreation with approximate dimensions, not an official architectural survey or ticket service.

## Version 0.19

This release adds original Blender props and people, shorter hallways, and the revised seating arrangement described below.

- **Blender props:** a library of 33 original models replaces the theater's prop families, including auditorium recliners and shared armrests, concession machines and counters, restroom fixtures, waste bins, service equipment, storage and office furniture. The candy selection bay has colorful cartons; the adjacent water selection bay has individually modeled bottles. Repeated props use GPU instancing. The existing Blender ticket kiosks remain in use.
- **Blender people:** all three staff and three visitors receive new faces, hair, clothing, hands and shoes. Staff have teal uniforms and badges. Animated shoulder and hip pivots retain their existing walking, player avoidance and station behavior.
- **Shorter hallways:** the Theater 1/2 hall run is 30% shorter. The long eastern hall ends 9.7m closer to the podium, with Theater 6, the women's restroom, Theaters 7/8 and the other affected modules moved together with their doors, interior routes and fixtures. Room footprints, hall widths, entrance handedness and the order of room groups are preserved. The two ticket-podium nooks have 75% less floor area, shrinking from 6 × 5.8m to 3 × 2.9m.
- **Seating in Theaters 3, 6, 7 and 8 only:** rows A and B form the front bank, followed by the B/C walkway. A, B and C are level with the hall; stairs begin at D. A wall sits closely behind the last row instead of an oversized rear passage. The other ten seating profiles and all 1,093 seats are retained.

See the [prop library and runtime contract](docs/prop-library.md), [NPC asset notes](docs/npc-assets.md), [seating reference interpretation](docs/seating-update.md), and [Blender source and rebuild commands](assets-source/README.md). Existing colliders and interactions remain authoritative while visual assets load; a failed download retains the playable fallback models.

## Walkthrough fixes and Blender assets

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
| E | Use the kiosk, register, podium, Expo or drink machine you are looking at |
| I | Your ticket and orders |
| M | Floor plan |
| O | Sound, volume, and visitor options |
| R | Return to the entrance |
| Esc | Close a dialog or pause and release the mouse |

On touch devices, use the movement stick, drag to look, and tap the interaction prompt. The ticket, map and options buttons are also touch-accessible. Shows, seats and orders are simulated; there is no payment, external reservation, or saved personal information. Reloading starts a fresh visit.

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

`npm test` runs twelve suites:

| Suite | Coverage |
|---|---|
| [Layout](scripts/validate-layout.mjs) | Room geometry, counts, adjacencies, door stations, fixture layouts and preserved lobby details. |
| [World](scripts/smoke-world.mjs) | Rendered floors, ceilings, walls, thresholds, fixture geometry and reflected coordinates. |
| [Player](scripts/smoke-player.mjs) | Collision stopping/sliding, stairs, jumping, headroom and recovery. |
| [Navigation](scripts/smoke-navigation.mjs) | All 14 bowls and 164 other route targets, rendered floor/ceiling support, containment and structural overlaps. |
| [Visit](scripts/smoke-visit.mjs) | Six moving entrance assemblies, six safe actors, 19 interaction points and ticket/order/pickup/drink interface flows. |
| [Kiosk assets](scripts/smoke-kiosk-assets.mjs) | Shared models, live screen materials, failed loads and asynchronous disposal. |
| [Enclosure](scripts/smoke-enclosure.mjs) | Raised edges, close rear walls, seat spacing, stacked zones, visible signs and structural shadows. |
| [Prop assets](scripts/smoke-prop-assets.mjs) | Real GLB bounds, normals, budgets, shared instances, visibility, fitting and resource ownership. |
| [NPC assets](scripts/smoke-npc-assets.mjs) | Six real GLB characters, animation pivots, retained avoidance/colliders, atomic fallback and disposal. |
| [Seating](scripts/smoke-seating.mjs) | Selected-room profiles, level A/B/C rows, B/C crosswalks, stair climbing, rear walls and lower-storage clearance. |
| [Compaction](scripts/smoke-compaction.mjs) | Original room footprints, exact rigid translations, moved fixtures, hall reductions and smaller ticket nooks. |
| [Integrated assets](scripts/smoke-integrated-assets.mjs) | Actual props loaded into the complete theater, all 1,093 chairs and shared armrests, row clearance, display orientation, fitted bounds and unchanged collision data. |

GitHub Actions runs the same tests and production build for pull requests and deploys `dist` to GitHub Pages on updates to `main`.

## Current scope

The game provides a small single-player visit to the spatial recreation. It does not implement employee shifts, cleaning tasks, persistent saves, real cinema listings, or multiplayer networking. Materials, characters and dimensions remain an approximation. The reference photographs are documented but are not bundled into the game; models, artwork, programming and sounds are original.
