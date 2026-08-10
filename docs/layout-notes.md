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
- `+X` runs toward the sketch's right end of the main theater hall.
- `+Z` runs from the front entrance through the lobby toward the north-side auditoriums.
- `+Y` is elevation.
- The player begins outside the main lobby entrance at approximately `(1.5, 0, -5.2)`.

## Auditorium families

| Family | Theaters | Approximate footprint | Capacities |
| --- | --- | --- | --- |
| Compact | 1, 2 | 9.5 × 13 m | 38, 38 |
| Medium | 4, 5 | 11.5 × 15.5 m | 58, 58 |
| Large | 3, 6, 7, 8 | 17.5 × 23 m | 148, 148, 153, 152 |
| Standard | 9–14 | 10.5 × 13.5 m | 50 each |

Every auditorium has a procedural screen, raised seating tiers, a walkable stepped center aisle, acoustic panels, entry signage, and instanced seat components. Theater 3 uses the large-format/TITAN LUXE scale. These are proportional gameplay interpretations rather than real construction dimensions.

## Sketch interpretations

- The entrance leads into the lobby/service block, then a narrower ticket approach, then the long east–west theater hall.
- The upper-right handwritten room is interpreted as **Candy Storage**.
- `KS`, `K`, `B`, `C`, and `OFF` are Kitchen Storage, Kitchen, Bar, Concession, and Office.
- `BB` and `GB` are represented as men's and women's restrooms. The supplied green/blue/yellow fixture key is translated to stalls/sinks/urinals.
- The dotted `STOCK` area behind Theaters 4/5 is treated as lower-level usher/soda stock, not as a main-floor room.
- Other dotted storage is represented as below-tier storage associated with the stadium rake. Doors are shown as spatial markers, but the lower floor is reserved for a later vertical-layout pass.
- Theater 3 receives a narrow access passage around the restroom block. The dogleg entries around Theaters 7/8 are simplified until measurements are available.
- Red sketch marks are interpreted as public doors or egress points where the circulation context supports that reading. Door swing and exact handing are provisional.
- The lobby mural is an original procedural island-botanical composition inspired by local design character; it is not a copy of an existing artwork.

## Best next corrections

The model will improve fastest with any of the following, even as phone photos or rough measurements:

1. Lobby width and entrance-to-ticket walking distance
2. Main hall width and approximate door-to-door spacing
3. Which side of each auditorium door the seating aisle begins on
4. Theater row counts, aisle locations, and accessible seating gaps
5. A clearer service-block plan showing employee doors between concession, kitchen, storage, office, and bar
6. Confirmation of the dotted lower-storage footprints and their stair/door access
7. Restroom entry turns and fixture counts/positions

The complete spatial data is centralized in `src/layout-data.js`, so corrected measurements can be applied without rewriting the renderer or controller.
