# Version 18 — photo references and validation

The kitchen floor mismatch is corrected while preserving the connector nook and established theater layout. This release also adds photo-informed finishes and a simulated visitor experience.

## Photo evidence

The employee floor plan and the user's corrections govern adjacency and geometry. These post-renovation photos guide finishes and fixture details; their dates are observation dates, not a claim about current operations.

| Reference | What it supports |
|---|---|
| [Yelp hallway, Deb B., March 2023](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=1omXTsm_-hIzQQCkwXJomA) | Burgundy overlapping circular carpet, pale upper walls, dark dado, round downlights, suspended auditorium signs |
| [Yelp restroom, Deb B., March 2023](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=5ziVaKaGZXx4U9cEyPDvWA) | Square white tile, gray lower band, red stripe, diamond accents, dark sink counter, broad mirror |
| [Yelp restroom, Randal Y., July 2026](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=qa8k0MJoNm2S9mKrNrAhLA) | Retained tile treatment and dark flecked partitions |
| [Yelp kiosks, Ross T., January 2025](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=J17tqk4C7qSzSS-rXU0Yng) | Four silver cabinets, portrait heads, three compact landscape displays |
| [Yelp concessions, Ross T., January 2025](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=MswO5Ucis7RVoDsCDBMyuQ) | Navy speckled panels, silver bases, pale mosaic backsplash, warm tan concrete and exposed mechanicals |
| [Yelp ticket approach, Craig T., November 2022](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=Bxtz6EENN7VnwPJTOnGoTg) | Broad concrete/carpet threshold, digital poster bank and ticket checkpoint |
| [Yelp drink station, Deb B., March 2023](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=EtCPK7pDshWxIyfl9KTJsg) | Long beverage counter, silver base, paired frozen-drink machines |
| [Artist's Mililani Naupaka project](https://www.kameahadar.com/murals/consolidated-naupaka) | Distinct female and male mural compositions on opposite lobby sides; existing original in-game artwork retained |

The review included the user's recovered reference images and Yelp's 45-image Inside gallery, with full-size inspection of the useful dated views. Archival pre-renovation auditorium images were excluded. No reference photographs or real film posters are redistributed in the build.

## Interaction and rendering choices

- `showtimes.js` provides all 14 fictional shows to the kiosk interface, compact wall screens, hanging signs, and original pre-show.
- `visit-state.js` validates real row/seat counts and manages ticket checks, preparation timing, pickup and drinks. It accepts no payments or external data.
- `visit-ui.js` uses range, viewing direction and a finite collision-ray test so fixtures cannot be used through a wall. Native dialogs pause movement, handle focus and support touch controls.
- `entrance-doors.js` keeps visible hinges and small moving collision segments synchronized. Doors open outward to avoid the kiosk immediately inside the last assembly.
- `atmosphere.js` validates visitor paths and staff positions against the existing collision world. Visitors stop near the player. Disabling people also disables their collision. Audio starts on an entry gesture and has mute/volume controls.
- `photo-finishes.js` positions tile and trim in world units, keeping the red restroom band and hallway chair rail at consistent heights on walls of different sizes.
- Static fixture shadows and a modest reflection environment add surface depth. Equal face materials share draw groups. Projection textures update at six frames per second only while an auditorium is occupied; adaptive resolution can disable the extra shadows on slower devices.

## Verification and limits

All layout, world, player, navigation and V18 visit tests pass, followed by the production build. The new test suite checks the rendered floor/roof triangles, actual animated door traversal, actor positions, outward-facing hanging signs, all 19 usable targets, all 14 seat plans, and the DOM ticket/order/pickup/drink/options flows.

This environment's local preview URL is blocked. Its connected browser also cannot create a WebGL context on the unchanged public V17 baseline. Therefore these checks do not constitute a GPU-rendered visual walkthrough, a browser audio audition, or a measured frame-rate result. GitHub CI and the deployed version/assets are checked during release. The existing nonblocking JavaScript bundle-size warning remains.
