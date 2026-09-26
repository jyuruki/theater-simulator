export const SUPPLY_SAVE_KEY = "mililani-v22-supplies";
export const BIB_TYPES = Object.freeze([
  { id: "cola", label: "COLA", color: 0xb9493f, initial: 0 },
  { id: "diet", label: "DIET COLA", color: 0xaab6bc, initial: .16 },
  { id: "lemon", label: "LEMON LIME", color: 0x76a952, initial: .42 },
]);
export const SUPPLY_TYPES = Object.freeze([
  { id: "straws", label: "STRAWS", color: 0xedd8ad, initial: .08 },
  { id: "lids", label: "DRINK LIDS", color: 0xc6d6dc, initial: .17 },
  { id: "ketchup", label: "KETCHUP", color: 0xb54134, initial: .22 },
  { id: "salt", label: "SALT", color: 0xe7e4d2, initial: 0 },
]);
const unit = n => Number.isFinite(n) && n >= 0 && n <= 1;
const count = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)
  && Math.abs(p[0]) < 200 && p[1] >= -3 && p[1] <= 15 && p[2] > -30 && p[2] < 120;
const clone = value => JSON.parse(JSON.stringify(value));

export function createSuppliesState() {
  return { version: 1, elapsed: 0, nextId: 1, held: null, loose: [], trayClock: 0,
    bibs: BIB_TYPES.map(({ id, initial }) => ({ id, level: initial, installed: true, connected: true,
      pendingConnection: false, spares: [1, 1], exchanges: 0 })),
    stock: SUPPLY_TYPES.map(({ id, initial }) => ({ id, level: initial, reserves: [1, 1, 1], delivered: 0 })),
    dirtyTrays: 3, cleanTrays: 0, washed: 0,
  };
}

export function validCarriedSupply(item) {
  if (!item || !count(item.uid, 100000) || !point(item.position)) return false;
  if (item.kind === "bib") return BIB_TYPES.some(type => type.id === item.id) && unit(item.amount) && typeof item.used === "boolean";
  if (item.kind === "refill") return SUPPLY_TYPES.some(type => type.id === item.id) && unit(item.amount);
  return item.kind === "tray" && item.id === "tray" && unit(item.dirt);
}

/** Save a held item at its latest safe nearby floor point, never at a remote shelf. */
export function serializeSuppliesState(state) {
  const saved = clone(state);
  if (saved.held) { saved.loose.push(saved.held); saved.held = null; }
  return JSON.stringify(saved);
}

export function restoreSuppliesState(raw) {
  const fresh = createSuppliesState();
  try {
    const s = JSON.parse(raw);
    if (!s || s.version !== 1 || !Number.isFinite(s.elapsed) || s.elapsed < 0 || s.elapsed > 1e9
      || !count(s.nextId, 100000) || s.nextId < 1 || s.held !== null
      || !Array.isArray(s.loose) || s.loose.length > 32 || !s.loose.every(validCarriedSupply)
      || !count(s.dirtyTrays, 6) || !count(s.cleanTrays, 6) || s.dirtyTrays + s.cleanTrays > 6
      || !count(s.washed, 100000) || !Number.isFinite(s.trayClock) || s.trayClock < 0 || s.trayClock >= 240
      || !Array.isArray(s.bibs) || s.bibs.length !== BIB_TYPES.length
      || !Array.isArray(s.stock) || s.stock.length !== SUPPLY_TYPES.length) return fresh;
    if (!s.bibs.every((b, i) => b?.id === BIB_TYPES[i].id && unit(b.level)
      && typeof b.installed === "boolean" && typeof b.connected === "boolean" && typeof b.pendingConnection === "boolean"
      && (!b.connected || b.installed) && (b.installed || b.level === 0)
      && Array.isArray(b.spares) && b.spares.length <= 4 && b.spares.every(unit) && count(b.exchanges, 100000))) return fresh;
    if (!s.stock.every((b, i) => b?.id === SUPPLY_TYPES[i].id && unit(b.level)
      && Array.isArray(b.reserves) && b.reserves.length <= 4 && b.reserves.every(unit)
      && Number.isFinite(b.delivered) && b.delivered >= 0 && b.delivered <= 100000)) return fresh;
    if (new Set(s.loose.map(item => item.uid)).size !== s.loose.length
      || s.loose.some(item => item.uid >= s.nextId)
      || s.dirtyTrays + s.cleanTrays + s.loose.filter(item => item.kind === "tray").length !== 3) return fresh;
    return clone(s);
  } catch { return fresh; }
}

/** Work time is real time; only simulated customer consumption uses the shift clock. */
export function stepSuppliesState(state, delta, { active = false, timeScale = 2, pour = null, wash = false } = {}) {
  if (!active || !Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(delta, .1);
  const gameTime = dt * (Number.isFinite(timeScale) ? Math.max(0, Math.min(50, timeScale)) : 2);
  state.elapsed += gameTime;
  for (const bib of state.bibs) if (bib.installed && bib.connected) bib.level = Math.max(0, bib.level - gameTime / 5400);
  for (const item of state.stock) item.level = Math.max(0, item.level - gameTime / 3600);
  state.trayClock += gameTime;
  while (state.trayClock >= 240) {
    state.trayClock -= 240;
    if (state.cleanTrays > 0 && state.dirtyTrays < 6) { state.cleanTrays--; state.dirtyTrays++; }
  }
  if (state.held?.kind === "refill" && state.held.id === pour) {
    const target = state.stock.find(item => item.id === pour);
    if (target) {
      const amount = Math.min(state.held.amount, 1 - target.level, dt / 6);
      state.held.amount -= amount; target.level += amount; target.delivered += amount;
    }
  }
  if (wash && state.held?.kind === "tray") {
    const before = state.held.dirt;
    const after = before - dt / 4;
    state.held.dirt = after <= 1e-6 ? 0 : after;
    if (before > 0 && state.held.dirt === 0) state.washed++;
  }
}
