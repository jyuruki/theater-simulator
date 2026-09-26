import { AUDITORIUMS } from "./layout-data.js";
import { createUsherGameplay } from "./usher-gameplay.js";
import { createUsherWaste } from "./usher-waste.js";
import { createUsherSupplies } from "./usher-supplies.js";
import { createUsherSchedule, consumeNewUsherDay } from "./usher-schedule.js";
import { createUsherBreaksheet } from "./usher-breaksheet.js";
import { createUsherDoors } from "./usher-doors.js";

export function createUsherShift(options) {
  const { scene, camera, collisionWorld, storage, showToast = () => {} } = options;
  const newDay = consumeNewUsherDay(storage);
  const hands = { owner: null };
  let cleaning, waste, doors;
  const schedule = createUsherSchedule({ storage, seed: options.seed, timeScale: newDay?.timeScale,
    onBreak(event, seed) {
      cleaning.beginBreak(event.theaterId, seed, { cycle: event.cycle, attendanceVersion: event.attendanceVersion,
        seatIds: options.getUsedSeatIds?.(event) });
      waste.onTheaterBreak(event.theaterId);
      doors.onBreak(event.theaterId);
      options.onBreak?.(event);
      showToast(`Theater ${event.number} is breaking. Used trays are left open.`, 3000);
    },
    onStart(event) { doors.onStart(event.theaterId); options.onStart?.(event); showToast(`Theater ${event.number} starts at ${schedule.time}. Close its doors.`, 3500); },
  });
  doors = createUsherDoors({ scene, camera, collisionWorld, storage, showToast });
  waste = createUsherWaste({ ...options, hands, getNextBreaks: () => schedule.getNextBreaks(),
    getRoomReady: id => cleaning?.isTheaterReady(id) ?? false });
  const supplies = createUsherSupplies({ ...options, hands, timeScale: () => schedule.timeScale });
  cleaning = createUsherGameplay({ ...options, hands, schedule,
    getBinTargets: () => waste.getBinTargets(), depositTrash: (id, count) => waste.depositTrash(id, count) });
  const sheet = createUsherBreaksheet({ scene, camera, schedule });
  const modules = { cleaning, waste, supplies };
  let active = false, disposed = false, selected = null, cancelAction = false;
  // Separate saves may be unavailable or independently cleared. Reconstruct a
  // due cleaning job without replaying guest throws or discarding saved work.
  for (const room of AUDITORIUMS) {
    const event = schedule.currentBreak(room.id);
    if (schedule.hasBroken(room.id) && !cleaning.getTheaterSummary(room.id).active) {
      const seed = (schedule.seed ^ Math.imul(room.number, 2654435761) ^ Math.imul(event.cycle + 1, 1597334677)) >>> 0;
      cleaning.beginBreak(room.id, seed, { cycle: event.cycle, attendanceVersion: event.attendanceVersion });
    }
  }
  function chooseFocus() {
    if (sheet.visible) return null;
    const owner = modules[hands.owner];
    if (owner) return owner.focusedPrompt ? owner : null;
    return [cleaning, waste, supplies, doors].filter(m => m.focusedPrompt)
      .sort((a, b) => (a.focusDistance ?? Infinity) - (b.focusDistance ?? Infinity))[0] ?? null;
  }
  return {
    cleaning, waste, supplies, schedule, doors, sheet, hands,
    update(delta, input = {}) {
      if (disposed) return;
      active = Boolean(input.active);
      if (active && !schedule.started) schedule.begin();
      schedule.update(delta, active);
      const reading = sheet.visible;
      const action = active && !reading && !this.placementActive && Boolean(input.action);
      for (const [owner, module] of Object.entries(modules)) module.update(delta, { active, action: action && (!hands.owner || hands.owner === owner), cancelAction: cancelAction || Boolean(input.cancelAction) || reading });
      cancelAction = false;
      doors.update(delta, { active });
      for (const room of AUDITORIUMS) if (cleaning.isTheaterReady(room.id)) {
        if (schedule.markReady(room.id)) showToast(`Theater ${room.number} ready. Roll its can to the next unserved break.`, 3200);
      }
      selected = active ? chooseFocus() : null;
      sheet.update();
    },
    interact() {
      if (!active) return false;
      if (sheet.visible) { sheet.hide(); return true; }
      if (this.placementActive) return this.confirmPlacement();
      selected = chooseFocus(); return selected?.interact() ?? false;
    },
    returnTool() {
      if (!active) return false;
      if (sheet.visible) { sheet.hide(); return true; }
      cancelAction = true;
      return modules[hands.owner]?.returnTool() ?? false;
    },
    selectTool(kind) {
      if (!active) return false;
      cancelAction = true; sheet.hide(); return cleaning.selectTool(kind);
    },
    toggleSheet() { if (active) { cancelAction = true; modules[hands.owner]?.cancelPlacement?.(); return sheet.toggle(); } return false; },
    turnSheetPage(direction) { return active && sheet.visible ? sheet.turnPage(direction) : false; },
    togglePlacement() { if (!active) return false; cancelAction = true; sheet.hide(); return modules[hands.owner]?.togglePlacement?.() ?? false; },
    confirmPlacement() { if (!active) return false; cancelAction = true; return modules[hands.owner]?.confirmPlacement?.() ?? false; },
    get placementActive() { return Boolean(modules[hands.owner]?.placementActive); },
    get canPlace() { return active && !sheet.visible && Boolean(modules[hands.owner]?.canPlace); },
    get heldTool() { return sheet.visible ? null : modules[hands.owner]?.heldTool ?? null; },
    get sheetVisible() { return sheet.visible; },
    get sheetPage() { return sheet.page; },
    get sheetPageCount() { return sheet.pageCount; },
    get actionLabel() { const owner = modules[hands.owner]; return owner?.actionLabel ?? (owner?.heldTool === "cloth" ? "HOLD TO WIPE" : "HOLD TO SWEEP"); },
    get focusedPrompt() { return sheet.visible ? "Fold break sheet" : selected?.focusedPrompt ?? ""; },
    get time() { return schedule.time; },
    get hint() {
      if (sheet.visible) return "Bold rows start: close doors. Regular rows break: clean the theater. Arrow keys turn pages; B folds the sheet.";
      const owner = modules[hands.owner]; if (owner) return owner.hint;
      const due = doors.due;
      if (due.length) return `${schedule.time} · Close show-start doors: ${due.join(", ")} · B break sheet`;
      const next = schedule.getNextBreaks()[0];
      return `${schedule.time} · ${next ? `Next break: Theater ${next.number}` : "Shift complete"} · B sheet · 1 broom / 2 cloth · Q holster or release`;
    },
    getSnapshot() { return { schedule: schedule.getSnapshot(), cleaning: cleaning.getSnapshot(), waste: waste.getSnapshot(), supplies: supplies.getSnapshot(), doors: doors.getSnapshot(), heldTool: this.heldTool, sheetVisible: sheet.visible, placementActive: this.placementActive, hands: { ...hands } }; },
    dispose() { if (disposed) return; disposed = true; sheet.dispose(); Object.values(modules).forEach(m => m.dispose()); doors.dispose(); schedule.dispose(); },
  };
}
