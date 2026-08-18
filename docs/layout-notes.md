# Layout reconstruction notes

## Source hierarchy

The layout uses three kinds of evidence:

1. The [employee hand-drawn plan](reference-floor-plan.png) is authoritative for room order, adjacencies, screen direction, service-room labels, restroom fixture types, and dotted lower storage.
2. Public location and renovation information informs the 14-screen identity, seat capacities, full food-and-beverage program, and remodeled lobby character.
3. Public photos inform broad facade/lobby atmosphere only. They are not treated as measurable plans.

No emergency, security, or restricted operational details beyond what was present in the supplied sketch are represented. Dimensions are approximate gameplay dimensions, not surveyed measurements.

## Public research used

- The [Town Center of Mililani directory](https://towncenterofmililani.com/stores/consolidated-theatres-mililani-14/) identifies the current Mililani 14 at location 900 and lists stadium seating among its amenities.
- Reading International's [2019 annual report](https://www.sec.gov/Archives/edgar/data/716634/000071663420000003/rdi-20191231x10k.htm) describes completion of a top-to-bottom renovation with 14 screens, recliners, TITAN LUXE, full food-and-beverage service, alcohol service, and a redesigned lobby.
- Reading's [June 2019 venue announcement](https://www.businesswire.com/news/home/20190627005879/en/) describes the new kitchen and lobby artwork honoring the local Naupaka legend. The prototype uses that only as broad design context and contains original artwork.
- The landlord's [October 2025 site-plan PDF](https://www.wilkow.com/wp-content/uploads/2024/10/Town_Center_of_Mililani_Site_Plan_Update_October_2025.pdf) labels unit 900 as 49,119 square feet and helps establish the exterior footprint. The document itself warns that its general layout is not a guarantee of exact dimensions.
- The individual auditorium capacities come from a [June 2026 Cinema Treasures community report](https://cinematreasures.org/theaters/26257/comments), not from an operator drawing or permit. They total 1,093 and are protected by automated tests, but remain provisional until confirmed by an authoritative seating plan or on-site count.

The official sources establish TITAN LUXE at the complex but do not identify its auditorium number. Theater 3 is treated as the large-format room because the supplied sketch and community seating report support that interpretation; it should still be field-checked.

## Coordinate system

- One world unit equals one meter.
- Layout data remains in hand-drawn **plan space**, where `+X` runs toward the sketch's right end of the main theater hall.
- The rendered world reflects plan X about the entrance centerline at `X = 1.5`: `worldX = 3 - planX`. This is why sketch-left concessions are physically on an entering guest's left without mirroring signs or text.
- The HUD and minimap transform both player position and look direction back into plan space; mouse input itself is not inverted.
- `+Z` runs from the front entrance through the lobby toward the north-side auditoriums.
- `+Y` is elevation.
- The player begins outside the translated main-lobby entrance. V14 retains the concession/office side's established plan-X translation and compact box-office/stair edge; the ticket approach, theater hall, and auditorium modules remain fixed.

## Auditorium families

| Family | Theaters | Approximate footprint | Capacities |
| --- | --- | --- | --- |
| Compact | 1, 2 | 9.5 × 13 m | 38, 38 |
| Medium | 4, 5 | 11.5 × 15.5 m | 58, 58 |
| Large | 3, 6, 7, 8 | 17.5 × 27 m | 148, 148, 153, 152 |
| Standard | 9–14 | 10.5 × 13.5 m | 50 each |

Every auditorium has a procedural screen, brown leather seating with tray tables, acoustic panels, entry signage, and instanced seat components. Theaters 3–8 enter at the bottom/front of the bowl and rise toward the rear. Theaters 1/2 and 9–14 enter at a rear landing exactly level with the hall, then descend toward the screen. All rooms use stairs at both outer sides, with two half-height treads per row transition and no center aisle. Theater 3 uses the large-format/TITAN LUXE scale. These are proportional gameplay interpretations rather than real construction dimensions.

## Sketch interpretations

- The entrance leads into a large gray-stone lobby/service block, then a long maroon-carpeted ticket approach, then the east–west theater hall. The long Theater 9-side run is 6.7 meters wide; it steps down to the previous 4.2-meter width exactly at the wall carrying the two drinking fountains and remains that width through the Theater 2 exit. V10 shortens the hall by roughly 15% through rigid plan-space translations of complete room modules. Their interior footprints, cubbies, seating bowls, and routes are not scaled. Walking from ticket check toward Theater 9 now passes the simultaneous 14/13/6 group, Women's Restroom, 12, 7, 11, 10, 8, then the simultaneous Theater 9/Candy Storage group.
- A fountain-width maroon-carpeted approach runs from the lobby to ticket check, with open 90-degree alcoves at its far end: the physical-left alcove is reserved for a movie poster and the physical-right alcove is empty. A compact dark-gray-tile court begins beyond it. Its first island carries `ICEE | soda | cups/lids/straws | soda | ICEE`; the equal-length rear counter is flush to the back wall and intentionally empty for later gameplay. Theater 4 begins immediately past that counter, Theater 5 sits beside it close to the end wall, and Theater 3/future task/4/5 all open from the same recessed plane.
- The upper-right handwritten room is interpreted as **Candy Storage**.
- `KS`, `K`, `B`, `C`, and `OFF` are Kitchen Storage, Kitchen, Bar, Concession, and Office. V14 retains the complete front service block's rigid translation and the guest-bar alignment with the fixed ticket-approach wall. The five traced counter vertices remain intact: the horizontal guest bar stays wood, while the concession face reads white service → blue register/candy → white Expo. The blue run carries the explicit sequence `2 POS · candy · 2 POS · candy · 2 POS`. The taller paired poppers sit against the restored two-thirds counter-parallel service wall. The earlier kitchen footprint and connector-door nook are preserved; only the small triangular floor remnant is sealed, with complete roof ownership and no overlapping slabs. The first office door enters an interim candy-overflow room; a second door reaches the manager office.
- The public stone lobby alone uses the high exposed volume at three times the standard corridor height. The red-carpet corridors, dark-tile fountain court, manager office, overflow/snack room, kitchen storage, and kitchen service areas stay at the established 4.6-meter height. V14 runs the diagonal mural structure from the kitchen-door side to the isolated back-bar start. Its botanical artwork keeps the established dimensions, while equal gray panels occupy only the left and right ends—never above or below it. A continuous clipped soffit closes the entire underside without projecting into the kitchen roof, and larger exposed pipes and ducts span the overhead volume. Three customer kiosks, one POS on the long box-office leg, one central wooden lectern, and two ceiling-height fountain-island pillars are source-authored fixtures rather than renderer-only guesses.
- The box-office side is intentionally compact: the perpendicular reveal beside the ticket-hall wall is roughly two feet, the cubby is narrower and flush with the future-stair wall, and the L-shaped return is half its previous length. The stair construction face is white, so the view from inside the box office reads primarily down the ticket hall rather than into an oversized side bay.
- `BB` and `GB` are represented as men's and women's restrooms using the individual drawings rather than a shared template. BB keeps its left-left privacy path, nine south-wall stalls, six north-wall urinals, one long north-wall sink, and wide clear fixture aisle. Its exterior is split into a distinct vertical drinking-fountain nook and the separate recessed `MEN` cubby immediately beside it. V10 makes that cubby 50% wider and moves the complete BB/water-fountain/nook/trash frontage only a few inches away from Theater 3, creating the intended small jamb reveal without rearranging the cluster. BB's finished back wall meets Theater 3's lower-storage/service side as one shared boundary rather than two overlapping shells. GB keeps fourteen stalls and three separate north-wall sinks, with its two six-stall banks aligned on the same partition grid. Fixtures are wall-relative so mirrors, sinks, and partitions remain inside their rooms.
- The previously inferred `STOCK` area behind Theaters 4/5 has been removed; the clarified drawing does not place a lower stock room there.
- Other dotted storage is represented as below-tier storage associated with the stadium rake. Theater 3 enters beside an open usher waiting nook, then has one door into a horizontal anteroom and two doors from that anteroom into the secondary lower room. Theater 6 has two doors into one shared lower room. Both structures have explicit roofs and elevation-aware ground/headroom sampling so the player remains on the correct stacked level.
- Theater 3's courtyard door sits roughly five feet from the future-task door. Its gentle ramp now continues directly into the front of the auditorium on the same sightline, without an invented side doorway or final left turn; the usher nook and two-stage lower-storage module remain beside that route. A waist-high divider runs between the T3/task doors from the back wall to the fountain island. Theater 6 remains across from the Theater 13/14 pair and retains its short vestibule, right-turn transverse passage, shared two-door lower room, and continuously low-roofed under-tier side passage. The closed future-upstairs door is now correctly cut into the left wall of that short vestibule rather than presented as a separate main-hall door.
- Theaters 4 and 5 are tightly recessed after the rear fountain counter. Theater 4 turns west into its east-side bowl route; Theater 5 turns east and continues along its own east edge. Their final corridors open directly into the bowls without invented doorways. Theaters 7 and 8 use gently inclined straight routes with open usher/trash waiting nooks immediately right of their entrances.
- Theaters 1/2 and 13/14 are adjoining back-to-back pairs whose deeper cubbies meet at their shared walls. Their physical hallway door sides match the individual drawings: 1 left/2 right and 13 left/14 right. Theater 9's inner entrance is on the player's left side of its cubby and the auditorium extends left from that opening; this relationship remains in plan space and is not separately mirrored by the minimap. All eight small theaters now keep a clear rear cross-landing between the final seat row and entry wall so both side stairs remain accessible.
- The unlabeled approach door is a closed electrical-room door. The trash room's door is at its right end and the room opens left. Candy storage is a shallow horizontal rectangle with one south-wall door near its left end; the previously invented exterior candy-room exit is removed.
- Kitchen storage connects directly to the hot-line area through a doorway cut into the intentional diagonal partition. The original red service doorway farther along the partition remains separate.
- Red sketch marks are interpreted as doors. Closed exterior doors are present at both ends of the main theater hall; the outdoor continuation remains a future phase. Door swing animation is still provisional.
- The lobby mural is an original procedural island-botanical composition inspired by local design character; it is not a copy of the photographed artwork. Its projecting wall volume, scale, and placement are informed by the supplied lobby photograph.
- The V14 minimap reads the translated lobby and compact box-office edge, compressed two-piece stepped hall, reordered auditorium/service modules, drinking-fountain transition, widened `MEN` cubby, BB footprint, Theater 6 vestibule stair, Theater 3 route and lower-storage rectangles, courtyard west edge, and Theater 9 cubby directly from `src/layout-data.js`. The fountain island and pillars also use their shifted source coordinates. The map deliberately has no second coordinate table, so later proportional corrections remain synchronized with the first-person world.

## Best next corrections

The model will improve fastest with any of the following, even as phone photos or rough measurements:

1. Lobby width and entrance-to-ticket walking distance
2. Main hall width and approximate door-to-door spacing
3. Which side of each auditorium door the seating aisle begins on
4. Theater row counts, aisle locations, and accessible seating gaps
5. A clearer service-block plan showing employee doors between concession, kitchen, storage, office, and bar
6. Confirmation of the dotted lower-storage footprints, elevations, and stair/door access
7. Restroom entry turns and fixture counts/positions

The complete spatial data is centralized in `src/layout-data.js`, so corrected measurements can be applied without rewriting the renderer or controller.
