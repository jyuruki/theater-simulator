# Photo-referenced ticket kiosk

`mililani-ticket-kiosk.blend` is the editable Blender 5.2 source. Its **Preview stage (not exported)** collection supplies the inspection lighting, floor and original mock screen. The six other meshes make up the runtime asset. No reference photograph, signage image or third-party texture is embedded.

`build_ticket_kiosk.py` recreates the source, exports `public/models/mililani-ticket-kiosk.glb`, reimports the GLB, validates its dimensions, normals, UV presence, mesh count and triangle budget, then optionally renders the inspection still. Use Blender's background command:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python assets-source/build_ticket_kiosk.py -- --output-dir public/models --blend assets-source/mililani-ticket-kiosk.blend --preview 'C:/absolute/path/kiosk-preview.png'
```

## Reference and limits

The front appearance comes from the user's `IMG_7955.jpeg`, cross-checked against the [kiosk close-up by Ross T., January 6, 2025 on Yelp](https://www.yelp.com/biz_photos/consolidated-theatres-mililani-with-titan-luxe-mililani?select=J17tqk4C7qSzSS-rXU0Yng): dark portrait upper housing with beveled edges, matte silver lower cabinet, inset access-door seam, two small circles containing five wavy slits, a narrow central slot, right-edge card slot and lower reader pad, and low black plinth. Photographs establish appearance, not measured dimensions or the purpose of every fitting. Side and rear geometry are inferred; overall dimensions fit the existing simulator collider. In particular, the 0.90m main housing depth is inherited from the game footprint and is not a measured theater dimension.

The geometry and preview graphics are original project work. There are no downloaded third-party assets or textures requiring attribution or additional licenses. The preview screen is illustrative; the game replaces the display material with the working touchscreen.

## Runtime contract

- Meters; floor-centered origin; glTF +Y up, +Z front, X width.
- Bounds: X `[-0.36, 0.36]`, Y `[0, 1.60]`, Z `[-0.45, 0.52]`. The reader is the furthest front detail; main housing ends at Z `0.45`.
- Five shared-material static meshes plus the separate `KioskScreen` mesh.
- `KioskScreen`: center `[0, 1.135, 0.461]`, width `0.53`, height `0.80`, outward normal +Z, one material named `Kiosk_DisplayPlaceholder`.
- Standard glTF texture coordinates use top-left origin. Set `CanvasTexture.flipY = false` when replacing the glTF screen material in Three.js.
- All static materials are textureless PBR. The GLB is uncompressed, so no decoder is required.
- The JSON manifest alongside the GLB records current exported bounds, file size and triangle count.
