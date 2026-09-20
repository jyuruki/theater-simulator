# Asset reference and reconstruction notes

Research date: 2026-09-19. Reference images guide modeling; they are not shipping game textures. No third-party asset was downloaded as part of this reference review.

## Directly inspected user photo

The recovered attachment `IMG_7955.jpeg` was visually inspected. It shows the ticket desk and kiosk wall. The source image has a blurred upper band; that band provides no architectural evidence.

- Four freestanding kiosk cabinets are visible, with the rightmost partly cropped. Each has a dark charcoal portrait display surround, a silver-gray lower cabinet, an inset lower service-panel outline, and a low plinth. Small round fittings and horizontal slot details appear on the lower front; their exact function and dimensions are unconfirmed.
- The ticket counter has a broad white customer-facing panel, a light wood vertical-grain right return, a pale projecting countertop, and a dark base/toe-kick. Two angled landscape POS displays are fully visible; another device is partially cropped at far left. A narrow upright information display and small countertop signs should not be mistaken for more landscape POS units.
- Three adjacent landscape menu/display panels sit above the kiosk row. A black trash bin is left of the row, and a black sanitizer stand is between the second and third kiosks from the left.
- Black belt stanchions stand on a polished gray-beige floor with large square joints. A pale partition rises behind the counter, and black stair railings appear at left.
- The large mural above this side of the lobby places foliage on the LEFT and a warm-toned face on the RIGHT. Treat this as a separate composition from the concession-side mural.

These observations support silhouette, material, and placement matching. Camera perspective and the lack of a measurement reference prevent exact dimensions. Use established project dimensions for the first asset pass and label any new dimensions as estimates.

## Cross-reference status

The root agent directly opened and visually inspected the [Yelp kiosk photo, Ross T., January 6, 2025](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=J17tqk4C7qSzSS-rXU0Yng) in the normal browser during this session. The web retrieval tool initially reported a restricted URL, but browser access succeeded after the site's automatic device check cleared without intervention.

The specific Yelp image agrees with `IMG_7955.jpeg` on four silver/charcoal portrait cabinets, three joined landscape displays above them, a pale wall, and the sanitizer stand between the middle kiosks. Its clearer view establishes additional front details:

- Black upper housings have softly rounded corners and substantial screen bezels.
- A narrow vertical card slot lies at the right side near the lower quarter of the screen; a small reader pad protrudes near the bottom-right bezel.
- Two roughly circular wave-shaped grilles sit near the top of each silver lower access panel, each formed by five curved horizontal slots.
- A small horizontal receipt slot is centered between the two grilles. A broad perimeter seam outlines the service door, above a low black base.

These details refine the initially ambiguous round fittings and slot observations in the user attachment. They are now fresh visual evidence from the specified Yelp photo, rather than only the earlier written description in [v18 notes](v18-notes.md). Other Yelp sources listed in the v18 document retain their historical verification status unless individually stated otherwise here.

An accessible [Yelp-hosted concession image](https://s3-media0.fl.yelpcdn.com/bphoto/I-wtW3d5ANixZcq6a-0A0w/l.jpg), surfaced by the [Mililani MapQuest listing](https://www.mapquest.com/us/hawaii/consolidated-theatres-mililani-with-titan-luxe-303599582), was visually inspected. It shows a tall concession area, warm illuminated glass equipment, small rectangular backsplash, and a woman/botanical mural with the face LEFT and foliage RIGHT. It does not show enough kiosk detail for kiosk modeling. Attribution to the location is through the listing; broad image search frequently mixes Mililani with Ward and Olino. The reversed mural composition is consistent with the two distinct lobby murals already recorded in [layout notes](layout-notes.md), not evidence that one image should be mirrored.

## Additional useful sources

- [Cinema Treasures: auditorium 3 entrance](https://cinematreasures.org/photos/525671), marked taken June 5, 2024, was visually inspected: gray walls, raised metallic TITAN LUXE lettering, exposed black ceiling/ducts, black wall handrail, burgundy double doors, vision panels, silver handles/kickplates/closers, wood-look approach flooring, purple patterned carpet beyond, and a monitor above the doorway. [Mililani collection](https://cinematreasures.org/theaters/26257/photos).
- [Official Town Center theater listing](https://towncenterofmililani.com/stores/consolidated-theatres-mililani-14/) identifies tenant 900 and self-service ticket kiosks.
- [Landlord site plan](https://www.wilkow.com/wp-content/uploads/2024/10/Town_Center_of_Mililani_Site_Plan_Update_October_2025.pdf) supports the exterior footprint/context and lists 49,119 sq ft. It is a general leasing diagram, not a measured interior plan.
- [2019 Mililani concession menu](https://www.towncenterofmililani.com/wp-content/uploads/2019/08/mililani-concession-menu-main-online-85x11-20190625_411.pdf) is a historical visual reference; it does not establish current prices or menu contents.

## Candidate reusable libraries

These are researched candidates only. Asset selection and downloads remain separate work.

| Library | Intended use | License evidence |
| --- | --- | --- |
| [ambientCG](https://ambientcg.com/) | Tile, wood, painted walls, metal, upholstery base materials | [CC0 1.0; modification, commercial use, and inclusion of raw files permitted](https://docs.ambientcg.com/license/) |
| [Poly Haven](https://polyhaven.com/) | PBR materials, HDRI lighting, selected generic props | [CC0 assets; attribution optional](https://polyhaven.com/license) |
| [The Base Mesh](https://www.thebasemesh.com/) | Editable generic prop and furnishing starting meshes | [CC0; modification and commercial use allowed](https://www.thebasemesh.com/faq) |

Custom-model the recognizable kiosk housing, counter, doors, and theater-specific fixtures. Keep original Blender files and reusable exports, with source URL/license records for any later third-party downloads. Build original screen graphics and mural interpretations; do not copy reference photos or real movie posters into the distributed game.
