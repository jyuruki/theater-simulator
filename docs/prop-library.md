# Blender theater prop library

The library contains 33 original Blender models for the theater's movable furnishings, concession displays, restroom fixtures, and equipment. The existing photo-guided ticket kiosk remains in its separate library. Walls, ceilings, ducts, screens, stairs and door openings remain architectural geometry.

`assets-source/build_theater_props.py` builds the editable `assets-source/theater-props.blend` source, exports `public/models/theater-props.glb`, and writes a measured manifest. No external models, font downloads, image textures, or brand packaging are required. Candy logos are invented project graphics.

Rebuild from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python assets-source/build_theater_props.py -- --preview work/prop-library-contact-sheet.png
node scripts/smoke-prop-assets.mjs
```

The editable blend includes an arranged contact-sheet stage; the exported GLB has every named model root at its authored origin. Rebuild with the script to exclude the preview floor, captions, camera and lights.

## Models and detail

| Family | Models | Detail |
| --- | --- | --- |
| Seating | `recliner`, `shared_armrest` | Cushioned back/headrest/lumbar support, steel sled, foot pad, swivel snack tray; shared consoles with cupholders and recline controls. |
| Concessions | `candy_display`, `water_display`, `popcorn_popper`, `soda_fountain`, `icee_machine`, `cup_caddy`, `pos` | 21 distinct colorful candy cartons; 24 ribbed water bottles with caps and labels; kettle, crank and popcorn; flavor buttons/nozzles/drip slots; frozen-drink barrels/taps; nested cups, straws, card reader and receipt printer. |
| Ticketing and circulation | `ticket_podium`, `trash_can`, `sanitizer`, `stanchion` | Sloped lectern/scanner, recessed waste opening, freestanding dispenser and weighted belt post. |
| Restrooms | `toilet`, `urinal`, `sink`, `sink_basin`, `mirror`, `paper_dispenser`, `stall_partition`, `stall_door`, `drinking_fountain` | Rounded porcelain, taps, controls, dispenser window and hanging paper, partition hardware, fountain basin/spout/chiller. `sink_basin` fits the existing long trough. |
| Kitchen and storage | `turbo_oven`, `fryer`, `grill`, `bar_well`, `storage_rack`, `storage_box` | Oven window/controls/handle, fryer baskets and controls, ribbed grill, ice well, steel shelf rack and labeled cartons. |
| Office | `office_desk`, `office_chair` | Drawer/handle, wheeled pedestal chair with arms. |
| Counter modules | `counter_blue`, `counter_white`, `counter_wood` | Reusable library modules. V20 uses continuous architectural solids for lobby counters; only the long restroom vanity still uses a fitted wood module. |

Measured export: **1,543,792 bytes**, **31,102 triangles** in the complete library. The recliner uses 380 triangles and four material components (brown leather, powder-coated steel, chrome hardware and espresso tray); a shared armrest uses 288 triangles and three components. Repeated objects use GPU instancing, including every auditorium chair. Dimensions are gameplay fitted rather than surveyed theater measurements.

## Runtime placement contract

```js
const assets = createPropAssets({
  root,
  url: `${import.meta.env.BASE_URL}models/theater-props.glb`,
  placements: [{
    id: "concession-water", model: "water_display",
    position: [worldX, floorY, z], rotationY: Math.PI,
    size: [bayWidth, bayHeight, bayDepth],
    fallback: existingDisplayGroup,
  }],
  onLoaded: () => refreshStaticShadows(),
});
await assets.ready;
// Later, when the world is destroyed:
assets.dispose();
```

Axes are meters, +Y up and +Z guest-facing. A placement may supply `parent` to preserve an auditorium's visibility group; coordinates then use that parent's local space. Models share geometry and materials across parents, while batching is partitioned by parent so hidden rooms stay hidden.

`size:[width,height,depth]` fits exact measured bounds and places their bottom center at `position`. `scale:[x,y,z]` instead preserves the authored floor-relative origin. Use only one sizing mode. This distinction matters for seats: the recliner body starts at Y=0.06m, while the shared armrest starts at Y=0.28m and ends at Y=0.825m. Both may use the same floorY with `scale`. The recliner width is 0.54m and its depth is 0.73049m; reduce its width for dense rows. Place one 0.104m armrest between neighboring bodies plus one at each row end, rather than overlapping two armrests.

Other useful measured dimensions (width × height × depth): candy 1.8 × 1.05 × 0.223m; water 1.4 × 1.055 × 0.344m; sink basin 0.47553 × 0.291 × 0.418m; counter modules 1 × 1.21 × 1.0065m. All exact min/max bounds and component/triangle counts are in `theater-props.manifest.json`.

The loader owns imported resources, hides fallback visuals only after complete validation, preserves world-owned colliders and interactions, restores original visibility on disposal, and safely rejects malformed/missing models or late results after disposal. `ready` resolves to `false` on failure while existing geometry remains playable.

Validation parses the actual GLB with Three.js, compares all 33 measured bounds against the manifest, checks triangle budgets and normals, exercises 128 chairs in two independently visible rooms, verifies rotated exact-size fitting, and tests resource ownership, offline fallback, invalid transforms, missing models and late-load disposal. The Blender contact sheet was rendered and visually inspected, including the candy/water displays and restroom equipment.

`node scripts/smoke-integrated-assets.mjs` also loads the actual library into the complete theater world. V20 checks 2,414 placements using 209 shared-material batches, all 1,093 recliners and 1,175 shared armrests, every one of the 82 seating rows against actual row colliders and neighboring meshes, all 30 used model families (the spare stanchion and blue/white counter modules are unused), guest-facing candy/water display orientation, unchanged collision data, fitted footprints, retained fallback ownership, and disposal of imported and furnishing resources. Eighteen rays hit the actual candy and bottle surfaces, with a negative control proving that an unbroken cabinet face would obstruct the displays.

V20 counter tops use continuous polygons with common miter edges. The customer counter retains real product-bay openings; the box-office L has one top and white/wood bases sharing one diagonal. `scripts/smoke-counter-geometry.mjs` checks rendered joins, kitchen-side Expo placement, both directions through the 1.70m service gate, moving collision, and gate clearance from the wall and counter.
