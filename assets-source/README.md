# Editable Blender assets

Version 0.19 adds original theater props and six NPC models to the existing photo-referenced ticket kiosk. Rebuilding these files does not publish the game.

| Editable source | Rebuild script | Runtime export |
|---|---|---|
| `mililani-ticket-kiosk.blend` | `build_ticket_kiosk.py` | `public/models/mililani-ticket-kiosk.glb` |
| `theater-props.blend` | `build_theater_props.py` | `public/models/theater-props.glb` |
| `theater-npcs.blend` | `build_theater_npcs.py` | `public/models/theater-npcs.glb` |

All commands below run from the repository root with Blender 5.2. Each builder writes the editable `.blend`, browser GLB and a JSON manifest alongside the GLB. The preview stage stays out of the runtime export. Use the scripts when rebuilding from the arranged source scenes so preview floors, lights and cameras are excluded correctly.

## Theater props

`theater-props.blend` contains 33 named models: recliners and shared armrests; candy cartons and bottled-water displays; popcorn, soda and ICEE machines; registers, cup caddies and counters; podium, trash can and sanitizer; restroom fixtures; cooking equipment, shelving, stock boxes and office furniture. A spare stanchion is included in the library but has no existing placement. Architecture remains in the world geometry.

```powershell
New-Item -ItemType Directory -Force work | Out-Null
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python assets-source/build_theater_props.py -- --preview work/prop-library-contact-sheet.png
node scripts/smoke-prop-assets.mjs
node scripts/smoke-integrated-assets.mjs
```

The complete library has 31,102 triangles, uses textureless materials and requires no external decoder. Repeated placements use shared geometry and GPU instancing. The manifest records measured bounds and triangle counts for every model. Runtime fitting preserves authored collision envelopes and audience-room visibility groups; failures leave the previous visuals available. See [prop details and placement contract](../docs/prop-library.md).

## Staff and visitors

`theater-npcs.blend` contains three visitor and three staff variants, arranged in a lineup for editing. Exported roots are named `NPC_Visitor_01` through `NPC_Visitor_03` and `NPC_Staff_01` through `NPC_Staff_03`; each is reset to its floor origin in the GLB. Faces, hair, badges, clothing details, hands and shoes are modeled geometry.

```powershell
New-Item -ItemType Directory -Force work | Out-Null
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python assets-source/build_theater_npcs.py -- --preview work/npc-contact-sheet.png
node scripts/smoke-npc-assets.mjs
```

The six people total 19,916 triangles and 30 meshes with one shared vertex-color material and no image textures. Each person has a body plus four limbs with shoulder/hip pivots; existing walking code animates these rigid parts. `createTheaterCrowd(...).loadAssets({ url })` replaces all six visual bodies together after validation, retaining routes, avoidance and personal-space colliders. See [NPC runtime and validation notes](../docs/npc-assets.md).

## Photo-referenced ticket kiosk

`mililani-ticket-kiosk.blend` is the editable Blender 5.2 source. Its **Preview stage (not exported)** collection supplies the inspection lighting, floor and original mock screen. The six other meshes make up the runtime asset. No reference photograph, signage image or third-party texture is embedded.

`build_ticket_kiosk.py` recreates the source, exports `public/models/mililani-ticket-kiosk.glb`, reimports the GLB, validates its dimensions, normals, UV presence, mesh count and triangle budget, then optionally renders the inspection still. Use Blender's background command:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python assets-source/build_ticket_kiosk.py -- --output-dir public/models --blend assets-source/mililani-ticket-kiosk.blend --preview 'C:/absolute/path/kiosk-preview.png'
```

### Kiosk reference and limits

The front appearance comes from the user's `IMG_7955.jpeg`, cross-checked against the [kiosk close-up by Ross T., January 6, 2025 on Yelp](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=J17tqk4C7qSzSS-rXU0Yng): dark portrait upper housing with beveled edges, matte silver lower cabinet, inset access-door seam, two small circles containing five wavy slits, a narrow central slot, right-edge card slot and lower reader pad, and low black plinth. Photographs establish appearance, not measured dimensions or the purpose of every fitting. Side and rear geometry are inferred; overall dimensions fit the existing simulator collider. In particular, the 0.90m main housing depth is inherited from the game footprint and is not a measured theater dimension.

The geometry and preview graphics are original project work. There are no downloaded third-party assets or textures requiring attribution or additional licenses. The preview screen is illustrative; the game replaces the display material with the working touchscreen.

### Kiosk runtime contract

- Meters; floor-centered origin; glTF +Y up, +Z front, X width.
- Bounds: X `[-0.36, 0.36]`, Y `[0, 1.60]`, Z `[-0.45, 0.52]`. The reader is the furthest front detail; main housing ends at Z `0.45`.
- Five shared-material static meshes plus the separate `KioskScreen` mesh.
- `KioskScreen`: center `[0, 1.135, 0.461]`, width `0.53`, height `0.80`, outward normal +Z, one material named `Kiosk_DisplayPlaceholder`.
- Standard glTF texture coordinates use top-left origin. Set `CanvasTexture.flipY = false` when replacing the glTF screen material in Three.js.
- All static materials are textureless PBR. The GLB is uncompressed, so no decoder is required.
- The JSON manifest alongside the GLB records current exported bounds, file size and triangle count.

## Scope and validation

The new prop and NPC models are original project geometry with invented packaging graphics. No downloaded third-party models, photographs, fonts or textures are embedded. Dimensions are fitted to the simulator and are not measured theater dimensions.

The current spatial update moves complete auditorium/service modules to shorten the west hall by 30% and the east hall by 9.7m, and reduces the ticket nooks by 75% in floor area. Seating profiles change only in Theaters 3, 6, 7 and 8; their A/B/C rows are at ground level, the walkway lies between B and C, stairs start at D, and a close rear partition replaces the extra passage. All 14 room footprints and 1,093 seats are retained. See [seating notes](../docs/seating-update.md).

Run `npm test` for all twelve layout, movement, navigation, visit, asset, seating and integration suites, then `npm run build` for the browser build. See the [main README](../README.md#development) for the individual checks and deployment workflow.
