# Working at Mililani 14

This is the user's recreation of their time working at this movie theater.
The intended player is an employee, starting as an usher. The building and its
equipment are the play space, not a backdrop for menu-driven job selection.
These requirements were clarified on September 23, 2026.

## Career and work

1. **Usher:** follow a physical schedule sheet for theater breaks, clean rooms,
   sweep popcorn, wipe spills, clean bathrooms, replace soda BIBs, service ICEE
   stations, and perform sound and picture checks.
2. **Concession / box office:** take food and ticket orders at the actual register.
   Scoop popcorn, prepare drinks, handle containers and serve the customer.
3. **Kitchen:** place patties on the grill and food in fryer baskets, wait for
   cooking, then transfer and plate the food at the kitchen-side Expo counter.
4. **Captain:** responsibilities will be defined with the user.
5. **Manager:** a possible later progression step, not a confirmed feature set.

## Interaction rule

Minimize menus. Aim at and physically operate equipment in the 3D world. A POS
screen should contain clickable buttons on its own surface; the user will
provide the actual menu layout later. Do not invent a final register layout now.
A work schedule belongs on a sheet or clipboard that the employee can inspect.
Tasks should follow the object state: lifting, placing, connecting, sweeping,
wiping, scooping and cooking. Avoid abstract completion buttons, progress-only
dialogs, and inventory grids as substitutes for the physical action.

Settings, accessibility and pause controls may remain concise overlays. Use
small contextual prompts where needed, but keep task information on equipment,
labels, gauges, tickets and paperwork whenever practical. Interactions must
remain accessible with keyboard and touch as well as mouse input.

## Asset and furnishing requirements

- Model items that move as separate objects: broom, dustpan, popcorn pieces,
  wiping cloth, cups, scoops, patties, baskets, BIB cartons, caps and connectors.
- Use real meter scale, clear grip points, stable origins and sensible collision
  shapes. Put pivots at hinges, handles and rotation axes. Keep room around tools
  for the player, carried items and opened doors.
- Give stations clear work surfaces and physical storage. Treat the counter
  shell as architecture; movable tools and food must not be baked into it.
- Keep the visual and simulated object states together. A dirty patch, connected
  hose, filled cup or cooking patty should visibly reflect the task state.
- Prefer constrained physics where appropriate: hinged doors, spring return,
  tool contact, connector attachment and stable resting positions. A full rigid
  body simulation is useful where it supports the task, rather than as a source
  of uncontrolled jitter or blocked passages.
- Build one complete physical usher task before broadening into every job.
  Keep the browser build playable and test performance with many small props.

## Current implementation boundary

Version 0.21 starts the player as an usher beside a physical cart and schedule
sheet in Theater 2. Its first repeatable task is playable: sweep loose popcorn
into a visible dustpan, empty it in the theater trash can, wipe two spills by
moving a cloth over them, and return the tools. The sheet reflects actual dirt
and disposal state. Progress saves locally. Cleaning uses constrained contact
physics within the rear aisle; this is not yet a general rigid-body system.

The old visitor ticket/order prototype is disabled in the employee experience.
The broader career, timed theater-break scheduling, other usher duties, food
preparation and physical POS workflows remain future work. Preserve the minimal
menu approach while extending this first complete task.

Theater 3's full-height anteroom leads through doors to legitimately lower
under-seat storage. The lower inner ceiling is intentional, per the user's
clarification; do not shrink that storage or raise it through the seating deck.
