/** One deterministic audience is shared by the visible customers and cleaning.
 * A break's cycle identifies the show that just ended; start cycle N boards N+1. */
export const MAX_SHOW_AUDIENCE = 24;
function randomFrom(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => { value += 0x6D2B79F5; let x = value; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
export function attendanceCycle(event, kind = event?.kind) {
  const cycle = Number.isInteger(event?.cycle) ? event.cycle : 0;
  return cycle + (kind === "start" ? 1 : 0);
}
export function createShowAttendance(plan, { cycle = 0 } = {}) {
  const random = randomFrom(`${plan.id}:audience-v24:${cycle}`), seats = plan.seats;
  const popularity = random(), capacity = Math.min(MAX_SHOW_AUDIENCE, Math.max(7, Math.round(seats.length * .34)));
  const count = Math.min(seats.length, popularity < .2 ? 2 + Math.floor(random() * 4)
    : Math.max(5, Math.round(capacity * (.45 + popularity * .55))));
  const rows = [...new Set(seats.map(seat => seat.row))].map(row => seats.filter(seat => seat.row === row).sort((a, b) => a.column - b.column));
  const used = new Set(), groups = [];
  while (used.size < count) {
    let size = Math.min(count - used.size, 1 + Math.floor(random() * 5));
    let candidates = [];
    while (size && !candidates.length) {
      for (const row of rows) for (let i = 0; i <= row.length - size; i++) {
        const block = row.slice(i, i + size);
        if (block.every(seat => !used.has(seat.id))) candidates.push(block);
      }
      if (!candidates.length) size--;
    }
    if (!size) break;
    const block = candidates[Math.floor(random() * candidates.length)], id = `${plan.id}-${cycle}-party-${groups.length}`;
    block.forEach(seat => used.add(seat.id));
    groups.push({ id, seatIds: block.map(seat => seat.id), arrivalDelay: groups.length * 5 + random() * 5 });
  }
  return { cycle, count: used.size, popularity, groups, seatIds: [...used] };
}
