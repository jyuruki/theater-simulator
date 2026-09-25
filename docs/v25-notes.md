# Version 0.25 · Opening day and smoother physical work

Fresh shifts begin at 11:45 AM, before the first noon show. The first fourteen
events are bold starts, staggered five minutes apart. All fourteen theaters have
four showings; every event falls on a five-minute mark, breaks stay at least ten
game minutes apart, and each room has thirty game minutes of turnover time.
The complete 112-event program ends just after midnight. Existing saved shifts
retain their old timeline until **Start new day** deliberately replaces them.

Choose 1×, 2×, 3× or 5× speed on the welcome or pause screen. Changes preserve
elapsed movie time. Paper pages contain 24 rows on desktop/portrait phones and
eight in short landscape viewports; arrows reach the entire program. Fold/page
controls sit below the paper and replace the overlapping interaction prompt.

Customers arrive in separate parties from fourteen game minutes before start
through the opening cue. They request closed doors, hold guest-opened doors
through following traffic, and return them closed after three clear seconds.
Doors deliberately left open by the usher remain the usher's responsibility.
Movement uses a bounded turn rate and interpolation between simulation ticks.

Popcorn brushed off seats can be swept into the left-hand pan from the row
walkway, including shallow viewing angles and tight chair clearances. Carried
bags retract against obstructions and stay held; wall contact never places them.
G still offers deliberate placement.

The feature rotation adds **Sintel**, **Tears of Steel**, and **Caminandes: Gran
Dillama** alongside **Big Buck Bunny**. These are complete licensed films,
including credits, looped during fictional showtimes. See [film attribution](../public/media/README.md).
Features stream as needed; **Save movies offline** is optional (~88 MB).
Updating/installing the app does not automatically download all four films.

## Performance and validation

- Lazy, cooperative route searches replace solving every auditorium at startup.
  Static spatial lookups and cached dynamic obstacles reduce per-customer work.
  See the repeatable [customer CPU measurements](v25-customer-performance.md).
- NPC bounds validation happens once per asset variant; preparing actor copies
  yields periodically so the browser can draw loading progress.
- More static architecture and pipe meshes share instanced batches, preserving
  materials, transforms and shadows. Static mesh matrices stop being recomputed
  every frame. In the same loaded hall inspection view, rendered draw calls
  decreased from 1,990 to 1,364 (31%). This is not a device-independent FPS claim.
- Trailer and feature playback share a two-decoder budget. Distant cues keep
  logical clocks without decoding video; the Hula soundtrack loads on demand.
- Loaded materials compile before the loading screen clears. Offline media
  ranges use slices rather than copying a complete film into an ArrayBuffer.
- Automated checks cover all 14 customer doors and routes, opposing traffic,
  early/late arrivals, all 164 seat-row sweep contacts, wall-held bags, new-day
  reset/speed persistence, responsive sheet bounds, media and PWA lifecycles.

Browser hardware still determines frame rate. Audiences remain 2–24 patrons per
show rather than full theater capacity. Concession, kitchen and career gameplay
remain future work; the existing physical usher tasks remain the focus.
