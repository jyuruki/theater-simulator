# Mililani 14 Theater Simulator

![First-person prototype preview](docs/preview.png)

A first-person, browser-based layout prototype for a multiplayer movie-theater simulator. This build reconstructs the relationship and approximate scale of the Consolidated Theatres Mililani 14 from a hand-drawn employee floor plan, public location details, and visual references.

This is a spatial prototype—not an official measured architectural plan. It is unaffiliated with Consolidated Theatres.

## What is in v0.4

- A physically corrected left/right plan: concessions are on the guest's left when entering, with the map and first-person heading using the same orientation
- A much larger gray-stone lobby rebuilt from the detailed lobby sketch: three double-door banks, two ticket kiosks, the corrected L-shaped box office, a reserved future stair footprint, and an overflow-room-to-office sequence
- The deliberately bent concession/bar counter, with six POS systems only on its diagonal face, a separate back bar, the sketched angled kitchen partition, two poppers, two fryers, grill, and turbo oven
- A real diagonal doorway connecting kitchen storage to the kitchen, while retaining the separate service doorway shown in the lobby sketch
- All 14 stadium-style auditoriums with 1,093 procedurally placed brown-leather seats and tray tables
- Matching footprint families for Theaters 1/2, 4/5, 3/6/7/8, and 9–14
- Two explicit stadium models: Theaters 3–8 enter at the bottom and climb dual side stairs, while Theaters 1/2 and 9–14 enter level with the top row and descend—without an artificial entry ramp
- One continuous dark-gray-tile fountain courtyard with Theater 3, the future task room, Theater 4, and Theater 5 aligned on the same recessed back wall
- Sketch-specific circulation: Theater 3's horizontal under-tier room and gentle-incline side hall, Theater 6's short straight vestibule before its right-turn/transverse/long route and shared two-door lower room, mirrored 4/5 doglegs, straight gentle-incline routes for 7/8, and corrected trash-can cubbies for 1/2 and 9–14
- An extended concession counter with six POS stations, plus the self-serve island with two soda fountains, two ICEE bookends, cup/lid/straw caddies, and a matching rear counter
- Concession backline, bar, hot line, kitchen storage, office overflow, manager office, box office, candy storage, trash room, the room behind the fountain counters, both main restrooms, and a closed electrical room
- The corrected BB-then-trash ordering, BB privacy entry, and two drinking fountains outside the restroom, plus stalls, sinks, and urinals from the sketch
- Detail-ready placeholders and stable IDs for both poppers, soda fountains, drinking fountains, grill, fryers, turbo oven, and bar well
- Dashed lower-storage volumes on the map only where the sketch calls for them: the Theater 3 and Theater 6 under-tier rooms
- Desktop and touch first-person controls, grounded jump, wall sliding without teleport recovery, stadium aisle elevations, and a live floor-plan minimap
- Always-resident auditorium interiors, extended fog distance, and single-owner floors/walls to eliminate proximity pop-in and the most common flashing surfaces
- Procedural materials, original island-botanical lobby art, room signs, screens, acoustic panels, leather, trays, and instanced seating

The exact capacities represented are: 38 seats each in Theaters 1–2; 148 in 3; 58 each in 4–5; 148, 153, and 152 in 6–8; and 50 each in 9–14.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Look |
| `Shift` | Run |
| `Space` | Jump |
| `M` | Show or hide the map |
| `R` | Return to the entrance |
| `Esc` | Pause / release mouse |

Touch devices get a movement stick, drag-to-look, hold-to-run, and jump buttons.

## Run locally

Requires Node.js 24 or a current compatible Node release.

```bash
npm install
npm run dev
```

Validation and production build:

```bash
npm test
npm run build
```

`npm test` protects the 14-theater grouping, exact 1,093-seat total, shared courtyard door plane, top/bottom entry models, half-step side stairs, lower-storage roof clearance, mirrored coordinate transform, room IDs, lobby-counter vertices, equipment anchors, and six diagonal POS stations. It constructs the complete Three.js world headlessly and runs focused wall-stop, wall-slide, no-teleport, jump, and manual-recovery regressions. GitHub Actions runs the same checks and deploys the built `dist` directory after changes reach `main` once the repository's Pages source is set to **GitHub Actions**.

## Layout decisions and current limits

See [docs/layout-notes.md](docs/layout-notes.md) for the sketch translation, coordinate plan, known ambiguities, and the most useful measurements or corrections for the next pass.

This version deliberately stops at the spatial shell. It does not yet implement shifts, guests, orders, cleaning, closing tasks, or multiplayer networking. Equipment anchors and player state are separated from presentation so those systems can be added without rebuilding the floor plan.
