# Mililani 14 Theater Simulator

[Play the theater](https://jyuruki.github.io/theater-simulator/)

A first-person browser recreation of Consolidated Theatres Mililani 14, built from Jacob's employee floor plans, corrections, and location photos. The existing 14 auditoriums, 1,093 seats, stadium elevations, service routes, two original murals, and exposed lobby pipework remain the foundation.

This is an independent recreation with approximate dimensions, not an official architectural survey or ticket service.

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

The five test suites cover the authoritative layout, rendered structural geometry, movement, all 14 auditorium routes and 152 retained location probes, and V18's actual door movement and visit interfaces. The V18 suite raycasts rendered kitchen floors and roofs, exercises all six entrances with a moving player capsule, checks all 19 interaction points, and completes the ticket/order/pickup/drink flow in a DOM test environment.

GitHub Actions runs the same tests and production build for pull requests and deploys `dist` to GitHub Pages after a merge to `main`.

## Current scope

This release adds a small single-player visit to the spatial recreation. It does not implement employee shifts, cleaning tasks, persistent saves, real cinema listings, or multiplayer networking. Materials and characters remain an approximation. The reference photographs are documented but are not bundled into the game; artwork, programming and sounds are original.
