# Blender theater people

All six people have original Blender-authored visuals: three visitors and three theater employees. Faces have eyes, eyebrows, noses, mouths and ears; each has a distinct hairstyle. Staff wear teal uniforms with a collar, badge and gold trim. Visitors wear a maroon overshirt, an olive vest, and an ochre patterned shirt. Cuffs, hands, watches, shoe soles and laces remain visible at close range.

The editable source is `assets-source/theater-npcs.blend`. Run `assets-source/build_theater_npcs.py` in Blender's background mode to rebuild it and `public/models/theater-npcs.glb`. Pass `--preview PATH` to render a contact sheet. The `.blend` displays a lineup; the export puts each named character at its own floor origin for runtime placement.

The six characters total 19,916 triangles in 30 meshes and share one vertex-color material without external textures. Each person has a body and four meshes whose origins sit at the shoulders and hips. The existing walking and idle motion animates these pivots; no animation mixer or skinning is required.

`createTheaterCrowd(...).loadAssets({ url })` loads and validates all six variants before replacing their fallback visuals. The actor roots, routes, avoidance, personal-space colliders and staff behavior stay intact. Loading failure keeps the existing people. Disposal cancels attachment of a late response and releases every shared geometry/material once. The NPCs receive lighting and shadows; they do not cast into the world's cached static shadow maps.

`node scripts/smoke-npc-assets.mjs` parses the real GLB, checks geometry and pivots, walks a visitor, checks player avoidance and stationary staff, and verifies atomic failure and pending-load disposal.
