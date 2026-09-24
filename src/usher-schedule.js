import { AUDITORIUMS } from "./layout-data.js";
import { SHOWS } from "./showtimes.js";

export const SHIFT_TIME_SCALE = 5;
export const SHIFT_START_MINUTE = 17 * 60;
const ORDER = [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export function formatShiftTime(minutes) {
  const whole = Math.floor(minutes + 1e-7);
  return `${String(Math.floor(whole / 60) % 24).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
export function createBreakEvents(cycles = 8) {
  const events = [];
  for (const [index, number] of ORDER.entries()) {
    const show = SHOWS[number - 1];
    for (let cycle = 0; cycle < cycles; cycle++) {
      const time = SHIFT_START_MINUTE + index * 8 + cycle * (show.minutes + 28);
      for (const kind of ["break", "start"]) events.push({
        id: `theater-${number}-${cycle}-${kind}`, theaterId: `theater-${number}`, number,
        title: show.title, kind, time: time + (kind === "start" ? 28 : 0), cycle,
      });
    }
  }
  return events.sort((a, b) => a.time - b.time || (a.kind === b.kind ? 0 : a.kind === "break" ? -1 : 1) || a.number - b.number);
}
export function createUsherSchedule({ storage, onBreak = () => {}, onStart = () => {}, seed = Date.now() >>> 0 } = {}) {
  const events = createBreakEvents();
  let minute = SHIFT_START_MINUTE, started = false, done = new Set(), clean = new Set(), elapsedSave = 0;
  try {
    const saved = JSON.parse(storage?.getItem("mililani-schedule-v22"));
    const validIds = new Set(events.map(e => e.id));
    if (saved?.version === 1 && Number.isFinite(saved.minute) && saved.minute >= SHIFT_START_MINUTE
      && saved.minute < events.at(-1).time + 1 && Number.isInteger(saved.seed)
      && Array.isArray(saved.done) && saved.done.every(id => validIds.has(id))
      && Array.isArray(saved.clean) && saved.clean.every(id => validIds.has(id))) {
      minute = saved.minute; seed = saved.seed >>> 0; started = Boolean(saved.started);
      done = new Set(saved.done); clean = new Set(saved.clean);
    }
  } catch { /* Local saves are optional. */ }
  const save = () => { try { storage?.setItem("mililani-schedule-v22", JSON.stringify({ version: 1, minute, seed, started, done: [...done], clean: [...clean] })); } catch {} };
  const latestBreak = id => events.filter(e => e.theaterId === id && e.kind === "break" && done.has(e.id)).at(-1);
  const currentBreak = id => latestBreak(id) ?? events.find(e => e.theaterId === id && e.kind === "break");
  return {
    events,
    get minute() { return minute; }, get seed() { return seed; }, get started() { return started; },
    get time() { return formatShiftTime(minute); },
    begin() { started = true; save(); },
    update(delta, active) {
      if (!active || !started) return;
      const dt = Number.isFinite(delta) ? Math.min(.1, Math.max(0, delta)) : 0;
      minute = Math.min(events.at(-1).time + .5, minute + dt * SHIFT_TIME_SCALE / 60);
      for (const event of events) {
        if (event.time > minute || done.has(event.id)) continue;
        done.add(event.id);
        if (event.kind === "break") onBreak(event, (seed ^ Math.imul(event.number, 2654435761) ^ Math.imul(event.cycle + 1, 1597334677)) >>> 0);
        else onStart(event);
        save();
      }
      elapsedSave += dt; if (elapsedSave >= 2) { elapsedSave = 0; save(); }
    },
    markReady(id) { const event = latestBreak(id); if (event && !clean.has(event.id)) { clean.add(event.id); save(); return true; } return false; },
    getNextBreaks() {
      const seen = new Set();
      return events.filter(e => e.kind === "break" && !clean.has(e.id)).filter(e => {
        if (seen.has(e.theaterId)) return false; seen.add(e.theaterId); return true;
      }).map(e => ({ ...e, eventId: e.id, id: e.theaterId, due: e.time <= minute }));
    },
    sheetRows() {
      const upcomingIndex = Math.max(0, events.findIndex(e => e.time >= minute) - 4);
      return events.slice(upcomingIndex, upcomingIndex + 24).map(e => ({ ...e, textTime: formatShiftTime(e.time), bold: e.kind === "start" }));
    },
    currentBreak,
    hasBroken(id) { return Boolean(latestBreak(id)); },
    getSnapshot() { return { minute, time: formatShiftTime(minute), started, seed, done: [...done], clean: [...clean], next: this.getNextBreaks(), rows: this.sheetRows() }; },
    dispose: save,
  };
}

export const isTheaterId = id => AUDITORIUMS.some(room => room.id === id);
