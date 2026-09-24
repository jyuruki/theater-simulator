# Version 0.21: raised screens and the first usher shift

## Screens and enclosure

All fourteen screen bottoms sit 1.8 m above their auditorium's front floor.
The visible image uses a 1.60:1 presentation, with its canvas rendered at the
same aspect ratio. The image rectangle is fitted to sightlines past the existing
entrance dividers, guards and lower route roofs. Those routes and room footprints
stay in place. Auditorium ceilings, upper shell walls and closures rise together;
Theater 3 and Theater 6 retain their intentionally lower storage and entrance roofs.
The newly exposed floor beneath each screen meets the surrounding wall faces;
front apron seams are closed with matching walkable floor coverage.

| Theaters | Image width × height | Ceiling elevation |
|---|---|---|
| 1–2 | 8.80 × 5.50 m | 6.60 m |
| 3 | 14.57 × 9.11 m | 10.50 m |
| 4–5 | 9.21 × 5.76 m | 8.00 m |
| 6–8 | 14.47 × 9.04 m | 10.40 m |
| 9–14 | 9.80 × 6.13 m | 6.90 m |

Compared with v0.20, small screens gain 30% image area. Large screens retain
approximately the same area with 14% more height. Theaters 4/5 trade about 5%
area for an unobstructed, 11% taller image. This avoids displaying an apparently
wide screen with part of its image hidden behind architecture.

The screen regression casts 105 image samples from each of 1,093 seats against
the rendered architecture and Blender chairs. Additional occupied-row envelopes
check a 1.25 m seated eye and 1.40 m seated head height; these are model assumptions,
not a claim of visibility for every possible occupant height or posture.

## Hall lighting

Eleven warm, short-range fixtures create local pools of light. Hall ambient,
sun and environment intensity are lower, with smooth transitions to the lobby.
The lobby's baseline brightness is retained. Fixtures do not add shadow maps.

## First playable employee task

Start beside the Theater 2 cart and use its schedule sheet to begin a break.
Take the broom and dustpan, hold the action and move across the loose popcorn.
Pieces move with contact and friction, collect visibly in the pan, and must be
poured into the existing cubby trash can. Take the cloth and move it over both
spills while holding the action. Return the tools to the cart, then use the
completed sheet to begin another break.

- E: use the object under the crosshair.
- Hold left mouse or F: apply the held tool; cloth movement removes dirt.
- Q near the cart: return the held tool.
- Touch: move/look normally, with separate use, held-action and return buttons.
- R: return to the usher station. Map, pause and settings remain available.

Thirty popcorn pieces and two spills form this first task. Progress and pan
contents persist in local storage. Tools return to the cart on reload. Pausing
stops work, and blocked tools cannot act through walls. Movable tool bounds are
checked independently; obstructed tools and their contents retract from view.

The simulation uses constrained, fixed-step contact physics in Theater 2's rear
aisle. It does not yet provide general object grabbing, a full career, scheduled
show breaks, bathroom or machine maintenance, cooking, or physical POS service.
Those are subsequent extensions of the saved employee design direction.

## Validation

The normal regression chain includes raised-screen geometry and sightlines,
hall-light continuity, complete sweeping/disposal/wiping/repeat workflows,
save/restore, collision, frame-rate independence, pause/input isolation and
multi-touch release behavior. The development inspection page contains all
fourteen screens plus the usher equipment and working poses for visual checks.
