# Blender asset pass

The browser game remains Three.js/Vite and can continue using GitHub Pages. GitHub stores the source and serves the built website; it does not restrict the authoring tool used for 3D models.

## Completed

- Created an editable Blender 5.2 kiosk from the original IMG_7955.jpeg and the directly inspected January 6, 2025 Yelp kiosk close-up. References and uncertainty are recorded in asset-reference-notes.md.
- Exported one textureless GLB: 107,028 bytes, 2,778 triangles, six meshes. All four in-game kiosks share its resources.
- Retained the source-authored positions, collision, interaction targets, and working ticket interface. A failed asset request retains the existing procedural kiosk.
- Fixed the glTF/canvas vertical texture orientation without changing the fallback screen texture.
- Fixed a pre-existing visual issue: the three overhead showtime screens were buried inside the 18 cm lobby wall. Cases and display faces now sit outside the finished wall surface.
- Added a local `/asset-review.html` page with before/after buttons and three inspection angles. It runs through the normal Vite development server; it is not included in the production build.

## Validation

Blender export/reimport verified dimensions, normals, UV orientation, mesh count, and triangle count. The existing layout, rendered-world, player, navigation, and simulated visit tests pass. Additional tests verify resource sharing, fallback behavior, safe disposal during loading, screen texture ownership, and rendered raycast visibility of the overhead displays. The production build passes with the existing nonblocking bundle-size warning.

The local browser rendered all four imported kiosks and the overhead displays. Before/after switching and detail views were visually inspected. This is an asset inspection, not a complete manual walkthrough or a measured performance benchmark.

## Remaining fidelity work

This first pass establishes a repeatable Blender-to-browser workflow. It is not a complete theater rebuild. The 0.90 m kiosk cabinet depth comes from the existing collision footprint, not a measurement of the real cabinet; unphotographed side/back details remain estimates. Front-screen art is the game's original simulated content.

Next candidates are the box-office wood/white counter, stanchions and sanitizer stand, concessions equipment, doorway fittings, and seating. The original floor plan and explicit user corrections remain authoritative for layout. Open-licensed libraries are candidates for generic materials and props, but no downloaded third-party asset was included in this pass.

## Unreal option

Blender source and GLB models can be reused in a future Unreal project. Layout data and reference work can also guide that port. Three.js JavaScript, browser UI, movement/collision, audio, and interactions would need adaptation or rebuilding in Unreal; switching engines is not a one-click file conversion. The user selected continued browser playback, so this pass does not create or modify an Unreal project.

Technical references: [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [Unreal 5.7 Interchange import](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-assets-using-interchange-in-unreal-engine?application_version=5.7).
