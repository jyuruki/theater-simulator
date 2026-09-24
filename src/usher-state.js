// Deterministic, constrained floor physics. The renderer supplies contact poses
// and collision queries; this module has no DOM, input, or rendering dependency.
export const USHER_PARTICLE_COUNT = 30;
export const USHER_STEP = 1 / 120;
export const USHER_WORK_BOUNDS = Object.freeze({ minX: 23.12, maxX: 28.40, minZ: 51.35, maxZ: 54.05 });
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function createUsherState() {
  return {
    version: 1, started: false, shift: 1, heldTool: null, completed: false,
    pouring: 0, elapsed: 0,
    particles: Array.from({ length: USHER_PARTICLE_COUNT }, (_, i) => ({
      id: i, x: (i < 15 ? 24.95 : 27.10) + ((i % 5) - 2) * .12,
      z: 52.18 + (Math.floor((i % 15) / 5) - 1) * .13,
      vx: 0, vz: 0, mode: "floor",
    })),
    spills: [[23.75, 52.04], [27.65, 53.24]].map(([x, z], id) => ({
      id, x, z,
      cells: Array.from({ length: 25 }, (_, i) => {
        const angle = i * 2.399963229728653;
        const radius = .25 * Math.sqrt(i / 24);
        return { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius, dirt: 1 };
      }),
    })),
  };
}

export function usherSummary(state) {
  const floor = state.particles.filter(p => p.mode === "floor").length;
  const pan = state.particles.filter(p => p.mode === "pan").length;
  const trash = state.particles.filter(p => p.mode === "trash").length;
  const spills = state.spills.filter(s => s.cells.every(c => c.dirt <= .001)).length;
  return { floor, pan, trash, spills, total: state.particles.length,
    complete: floor === 0 && pan === 0 && trash === state.particles.length && spills === state.spills.length };
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

/** One small simulation step. Brush and cloth contact require actual travel. */
export function stepUsherState(state, seconds, contact = {}) {
  if (!state.started || state.completed || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, 1 / 30);
  state.elapsed += dt;
  const { brush, pan, cloth } = contact;
  const canMove = contact.canMove ?? (() => true);
  if (state.pouring > 0) {
    state.pouring = Math.max(0, state.pouring - dt);
    if (state.pouring <= 1e-8) {
      state.pouring = 0;
      for (const p of state.particles) if (p.mode === "pan") p.mode = "trash";
    }
  }
  for (const p of state.particles) {
    if (p.mode !== "floor") continue;
    if (brush && !state.pouring) {
      const dx = brush.to.x - brush.from.x, dz = brush.to.z - brush.from.z;
      const travel = Math.hypot(dx, dz);
      // The head is a .42 m bar. Sweep its center and both ends so a kernel
      // cannot tunnel between bristles at a low frame rate.
      const touching = [-.19, 0, .19].some(offset => distanceToSegment(p,
        { x: brush.from.x + brush.right.x * offset, z: brush.from.z + brush.right.z * offset },
        { x: brush.to.x + brush.right.x * offset, z: brush.to.z + brush.right.z * offset }) < .105);
      if (travel > .00001 && travel < .18 && touching && canMove(brush.from, p)) {
        const speed = Math.min(1.7, travel / dt * .94);
        p.vx = dx / travel * speed; p.vz = dz / travel * speed;
      }
    }
    const before = { x: p.x, z: p.z };
    const after = { x: p.x + p.vx * dt, z: p.z + p.vz * dt };
    if (canMove(before, after)) { p.x = after.x; p.z = after.z; }
    else { p.vx = 0; p.vz = 0; }
    // A bounded work patch keeps kernels on the level aisle instead of letting
    // a missed sweep strand one beneath the seating deck.
    const bx = clamp(p.x, USHER_WORK_BOUNDS.minX, USHER_WORK_BOUNDS.maxX);
    const bz = clamp(p.z, USHER_WORK_BOUNDS.minZ, USHER_WORK_BOUNDS.maxZ);
    if (bx !== p.x) p.vx = 0;
    if (bz !== p.z) p.vz = 0;
    p.x = bx; p.z = bz;
    const speed = Math.hypot(p.vx, p.vz);
    if (pan && state.heldTool === "broom" && speed > .06 && !state.pouring) {
      const rx = p.x - pan.x, rz = p.z - pan.z;
      const forward = rx * pan.forward.x + rz * pan.forward.z;
      const side = rx * pan.right.x + rz * pan.right.z;
      const toward = p.vx * pan.forward.x + p.vz * pan.forward.z;
      if (Math.abs(side) < .255 && forward > -.19 && forward < .18 && toward > .04
        && canMove(before, { x: pan.x, z: pan.z })) {
        p.mode = "pan"; p.vx = 0; p.vz = 0;
      }
    }
    const damping = Math.exp(-5.8 * dt);
    p.vx *= damping; p.vz *= damping;
    if (speed < .012) p.vx = p.vz = 0;
  }
  if (cloth && state.heldTool === "cloth") {
    const travel = Math.hypot(cloth.to.x - cloth.from.x, cloth.to.z - cloth.from.z);
    // Holding still never cleans. The cloth must travel across each dirty cell;
    // cap travel to prevent a camera teleport from wiping an entire patch.
    if (travel > .00005 && travel < .15) for (const spill of state.spills) for (const cell of spill.cells) {
      if (cell.dirt > 0 && distanceToSegment(cell, cloth.from, cloth.to) < .16 && canMove(cloth.from, cell)) {
        cell.dirt = Math.max(0, cell.dirt - travel * 6.5);
      }
    }
  }
  state.completed = usherSummary(state).complete;
}

export function beginUsherPour(state) {
  if (state.heldTool !== "broom" || state.pouring > 0 || !state.particles.some(p => p.mode === "pan")) return false;
  state.pouring = .85;
  return true;
}

export function serializeUsherState(state) {
  return JSON.stringify({ version: 1, started: state.started, shift: state.shift,
    particles: state.particles.map(({ x, z, mode }) => ({ x, z, mode })),
    spills: state.spills.map(s => s.cells.map(c => c.dirt)) });
}

export function restoreUsherState(raw) {
  const state = createUsherState();
  try {
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || saved.particles?.length !== 30 || saved.spills?.length !== 2) return state;
    if (!saved.particles.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)
      && p.x >= USHER_WORK_BOUNDS.minX && p.x <= USHER_WORK_BOUNDS.maxX
      && p.z >= USHER_WORK_BOUNDS.minZ && p.z <= USHER_WORK_BOUNDS.maxZ && ["floor", "pan", "trash"].includes(p.mode))) return state;
    if (!saved.spills.every(s => s.length === 25 && s.every(d => Number.isFinite(d) && d >= 0 && d <= 1))) return state;
    state.started = Boolean(saved.started);
    state.shift = Number.isInteger(saved.shift) && saved.shift > 0 ? saved.shift : 1;
    saved.particles.forEach((p, i) => Object.assign(state.particles[i], p));
    saved.spills.forEach((s, i) => s.forEach((d, j) => { state.spills[i].cells[j].dirt = d; }));
    state.completed = usherSummary(state).complete;
  } catch { /* Unavailable or obsolete storage starts a fresh physical shift. */ }
  return state;
}
