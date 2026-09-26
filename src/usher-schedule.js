import { AUDITORIUMS } from "./layout-data.js";
import { SHOWS } from "./showtimes.js";

export const SHIFT_TIME_SCALE = 2;
export const SHIFT_SPEEDS = Object.freeze([1, 2, 3, 5, 20, 50]);
export const SHIFT_START_MINUTE = 11 * 60 + 45;
export const LEGACY_SHIFT_START_MINUTE = 17 * 60;
export const SCHEDULE_STORAGE_KEY = "mililani-schedule-v22";
export const NEW_DAY_REQUEST_KEY = "mililani-new-day-v25";
export const SHEET_PAGE_SIZE = 24;
const PREVIOUS_ORDER = [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
// The reference sheet mixes rooms throughout the opening wave. Keep this
// program deterministic so a saved sheet never changes underneath the usher.
const OPENING_ORDER = [13, 14, 8, 5, 9, 4, 6, 3, 12, 1, 11, 2, 10, 7];
const sortEvents = (a, b) => a.time - b.time || (a.kind === b.kind ? 0 : a.kind === "break" ? -1 : 1) || a.number - b.number;
export function formatShiftTime(minutes) {
  const whole = Math.floor(minutes + 1e-7);
  return `${String(Math.floor(whole / 60) % 24).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
export function formatSheetTime(minutes) {
  const whole = Math.floor(minutes + 1e-7), hour = Math.floor(whole / 60) % 24;
  return `${hour % 12 || 12}:${String(whole % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
const roundFive = minute => Math.round(minute / 5) * 5;

/** A quiet opening, followed by a complete fourteen-screen daily program.
 * Reserve break slots globally: two rooms never finish less than ten minutes
 * apart, including across rounds. Fictional runtimes may include pre-show time. */
export function createBreakEvents(cycles = 4) {
  return createDayBreakEvents(cycles, OPENING_ORDER, 26);
}

export function createV25BreakEvents(cycles = 4) {
  return createDayBreakEvents(cycles, PREVIOUS_ORDER, 24);
}

function createDayBreakEvents(cycles, order, attendanceVersion) {
  const events = [], reservedBreaks = [];
  let shows = order.map((number, index) => ({ number, start: 12 * 60 + index * 5 }));
  for (let cycle = 0; cycle < cycles; cycle++) {
    const next = [];
    for (const entry of shows.sort((a, b) => (a.start + SHOWS[a.number - 1].minutes) - (b.start + SHOWS[b.number - 1].minutes) || a.number - b.number)) {
      const { number, start } = entry, show = SHOWS[number - 1];
      let end = roundFive(start + show.minutes);
      while (reservedBreaks.some(time => Math.abs(time - end) < 10)) end += 5;
      reservedBreaks.push(end);
      for (const [kind, time] of [["start", start], ["break", end]]) events.push({
        id: `theater-${number}-${cycle}-${kind}`, theaterId: `theater-${number}`, number,
        title: show.title, kind, time, cycle, audienceCycle: cycle, attendanceVersion,
      });
      next.push({ number, start: end + 30 });
    }
    shows = next;
  }
  return events.sort(sortEvents);
}

/** Existing shifts retain their event identities and times until the employee
 * deliberately starts a new day, so partial cleaning and attendance stay valid. */
export function createLegacyBreakEvents(cycles = 8) {
  const events = [];
  for (const [index, number] of PREVIOUS_ORDER.entries()) {
    const show = SHOWS[number - 1];
    for (let cycle = 0; cycle < cycles; cycle++) {
      const time = LEGACY_SHIFT_START_MINUTE + index * 8 + cycle * (show.minutes + 28);
      for (const kind of ["break", "start"]) events.push({
        id: `theater-${number}-${cycle}-${kind}`, theaterId: `theater-${number}`, number,
        title: show.title, kind, time: time + (kind === "start" ? 28 : 0), cycle, attendanceVersion: 24,
      });
    }
  }
  return events.sort(sortEvents);
}

export function requestNewUsherDay(storage, { timeScale = SHIFT_TIME_SCALE } = {}) {
  if (!storage?.setItem) return false;
  try { storage.setItem(NEW_DAY_REQUEST_KEY, JSON.stringify({ timeScale: SHIFT_SPEEDS.includes(timeScale) ? timeScale : SHIFT_TIME_SCALE })); return true; } catch { return false; }
}
export function consumeNewUsherDay(storage) {
  try {
    const request = JSON.parse(storage?.getItem(NEW_DAY_REQUEST_KEY));
    if (!request || !SHIFT_SPEEDS.includes(request.timeScale)) return null;
    // This is only reached after the explicit Start new day action. A marker
    // survives pagehide saves; clearing progress before reload would not.
    for (const key of [SCHEDULE_STORAGE_KEY, "mililani-doors-v22", "v22-cleaning", "v22-waste", "mililani-v22-supplies", NEW_DAY_REQUEST_KEY]) {
      if (storage.removeItem) storage.removeItem(key); else storage.setItem(key, "null");
    }
    return request;
  } catch { return null; }
}

export function createUsherSchedule({ storage, onBreak = () => {}, onStart = () => {}, seed = Date.now() >>> 0,
  timeScale: initialScale = SHIFT_TIME_SCALE } = {}) {
  let events = createBreakEvents(), mode = "day", programVersion = 26, minute = SHIFT_START_MINUTE, started = false;
  let done = new Set(), clean = new Set(), elapsedSave = 0, timeScale = SHIFT_SPEEDS.includes(initialScale) ? initialScale : SHIFT_TIME_SCALE;
  let speedHistory = [{ minute, timeScale }], restored = false;
  try {
    const saved = JSON.parse(storage?.getItem(SCHEDULE_STORAGE_KEY));
    const savedProgram = saved?.version === 1 ? 22
      : saved?.version === 2 ? (saved.mode === "legacy" ? 22 : 25) : saved?.programVersion;
    const candidateEvents = savedProgram === 22 ? createLegacyBreakEvents()
      : savedProgram === 25 ? createV25BreakEvents() : events;
    const validIds = new Set(candidateEvents.map(e => e.id));
    const lowerBound = savedProgram === 22 ? LEGACY_SHIFT_START_MINUTE : SHIFT_START_MINUTE;
    if ([1, 2, 3].includes(saved?.version) && [22, 25, 26].includes(savedProgram)
      && Number.isFinite(saved.minute) && saved.minute >= lowerBound
      && saved.minute < candidateEvents.at(-1).time + 1 && Number.isInteger(saved.seed)
      && Array.isArray(saved.done) && saved.done.every(id => validIds.has(id))
      && Array.isArray(saved.clean) && saved.clean.every(id => validIds.has(id))) {
      events = candidateEvents; mode = lowerBound === LEGACY_SHIFT_START_MINUTE ? "legacy" : "day";
      programVersion = savedProgram;
      minute = saved.minute; seed = saved.seed >>> 0; started = Boolean(saved.started); restored = true;
      done = new Set(saved.done); clean = new Set(saved.clean);
      timeScale = SHIFT_SPEEDS.includes(saved.timeScale) ? saved.timeScale : SHIFT_TIME_SCALE;
      speedHistory = Array.isArray(saved.speedHistory) && saved.speedHistory.length
        && saved.speedHistory.every((segment, i, all) => Number.isFinite(segment.minute) && segment.minute >= lowerBound
          && segment.minute <= minute && SHIFT_SPEEDS.includes(segment.timeScale) && (!i || segment.minute > all[i - 1].minute))
        && saved.speedHistory[0].minute === lowerBound
        ? saved.speedHistory : [{ minute: lowerBound, timeScale }];
    }
  } catch { /* Local saves are optional. */ }
  const save = () => { try { storage?.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ version: 3, mode, programVersion, minute, seed, started, timeScale, speedHistory, done: [...done], clean: [...clean] })); } catch {} };
  const lastBreaks = new Map(), firstBreaks = new Map(), pages = new Map();
  for (const event of events) if (event.kind === "break") {
    if (!firstBreaks.has(event.theaterId)) firstBreaks.set(event.theaterId, event);
    if (done.has(event.id)) lastBreaks.set(event.theaterId, event);
  }
  let cursor = 0, nextBreaks = null;
  while (cursor < events.length && done.has(events[cursor].id)) cursor++;
  const currentBreak = id => lastBreaks.get(id) ?? firstBreaks.get(id);
  const pageCount = Math.ceil(events.length / SHEET_PAGE_SIZE);
  return {
    events, pageCount,
    get minute() { return minute; }, get seed() { return seed; }, get started() { return started; },
    get mode() { return mode; }, get restored() { return restored; }, get timeScale() { return timeScale; },
    get programVersion() { return programVersion; },
    get time() { return formatShiftTime(minute); },
    begin() { started = true; save(); },
    setTimeScale(value) {
      if (!SHIFT_SPEEDS.includes(value)) return false;
      if (value === timeScale) return true;
      timeScale = value;
      if (speedHistory.at(-1).minute === minute) speedHistory.at(-1).timeScale = value;
      else speedHistory.push({ minute, timeScale: value });
      save(); return true;
    },
    secondsSince(fromMinute) {
      if (!Number.isFinite(fromMinute) || fromMinute >= minute) return 0;
      let elapsed = 0;
      for (let i = 0; i < speedHistory.length; i++) {
        const segment = speedHistory[i], start = Math.max(fromMinute, segment.minute);
        const end = Math.min(minute, speedHistory[i + 1]?.minute ?? minute);
        if (end > start) elapsed += (end - start) * 60 / segment.timeScale;
      }
      return elapsed;
    },
    update(delta, active) {
      if (!active || !started) return;
      const dt = Number.isFinite(delta) ? Math.min(.1, Math.max(0, delta)) : 0;
      minute = Math.min(events.at(-1).time + .5, minute + dt * timeScale / 60);
      while (cursor < events.length && events[cursor].time <= minute + 1e-7) {
        const event = events[cursor++];
        if (done.has(event.id)) continue;
        done.add(event.id); nextBreaks = null;
        if (event.kind === "break") {
          lastBreaks.set(event.theaterId, event);
          onBreak(event, (seed ^ Math.imul(event.number, 2654435761) ^ Math.imul(event.cycle + 1, 1597334677)) >>> 0);
        } else onStart(event);
        save();
      }
      elapsedSave += dt; if (elapsedSave >= 2) { elapsedSave = 0; save(); }
    },
    markReady(id) { const event = lastBreaks.get(id); if (event && !clean.has(event.id)) { clean.add(event.id); nextBreaks = null; save(); return true; } return false; },
    getNextBreaks() {
      if (!nextBreaks) {
        const seen = new Set();
        nextBreaks = events.filter(e => e.kind === "break" && !clean.has(e.id)).filter(e => {
          if (seen.has(e.theaterId)) return false; seen.add(e.theaterId); return true;
        }).map(e => ({ ...e, eventId: e.id, id: e.theaterId }));
      }
      return nextBreaks.map(event => ({ ...event, due: event.time <= minute }));
    },
    get sheetPage() { return Math.min(pageCount - 1, Math.floor(Math.max(0, cursor - 4) / SHEET_PAGE_SIZE)); },
    sheetRows(page = this.sheetPage, size = SHEET_PAGE_SIZE) {
      size = [8, SHEET_PAGE_SIZE].includes(size) ? size : SHEET_PAGE_SIZE;
      page = Math.max(0, Math.min(Math.ceil(events.length / size) - 1, Math.floor(page)));
      const key = `${page}/${size}`;
      if (!pages.has(key)) pages.set(key, events.slice(page * size, (page + 1) * size)
        .map(e => ({ ...e, textTime: formatSheetTime(e.time), bold: e.kind === "start" })));
      return pages.get(key);
    },
    currentBreak,
    hasBroken(id) { return lastBreaks.has(id); },
    getSnapshot() { return { minute, time: formatShiftTime(minute), mode, programVersion, startOfDay: mode === "day", timeScale, started, seed, done: [...done], clean: [...clean], next: this.getNextBreaks(), rows: this.sheetRows() }; },
    dispose: save,
  };
}

export const isTheaterId = id => AUDITORIUMS.some(room => room.id === id);
