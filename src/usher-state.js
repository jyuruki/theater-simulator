export const USHER_STEP = 1 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function seededRandom(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => { n += 0x6d2b79f5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function createUsherState() {
  const state = { version: 22, jobs: [], heldTool: null, kit: false, pouring: 0, pourTarget: null, elapsed: 0 };
  Object.defineProperty(state, "particles", { get: () => state.jobs.flatMap(j => j.particles) });
  Object.defineProperty(state, "surfaces", { get: () => state.jobs.flatMap(j => j.surfaces) });
  return state;
}
const cells = (width, depth, count = 3) => Array.from({ length: count * count }, (_, i) => ({
  x: ((i % count) / (count - 1) - .5) * width * .72,
  z: (Math.floor(i / count) / (count - 1) - .5) * depth * .72, dirt: 1,
}));
export function beginCleaningBreak(state, plan, seed) {
  const existing = state.jobs.find(j => j.id === plan.id);
  if (existing && (existing.seed === String(seed) || !theaterSummary(existing).complete)) return false;
  const random = seededRandom(`${plan.id}/${seed}`);
  const shuffled = plan.seats.map(s => ({ s, score: random() })).sort((a, b) => a.score - b.score);
  const count = 3 + Math.floor(random() * 4);
  const job = { id: plan.id, number: plan.number, seed: String(seed), seats: [], surfaces: [], particles: [], completed: false };
  for (const { s } of shuffled.slice(0, count)) {
    const seat = { ...s, trayOpen: true, trayAngle: -1.8, trayTarget: -1.8 };
    job.seats.push(seat);
    for (const kind of ["tray", "seat"]) job.surfaces.push({ id: `${s.id}-${kind}`, seatId: s.id, kind,
      width: kind === "tray" ? .36 : s.width * .82, depth: kind === "tray" ? .25 : .39,
      spill: random() < .5, cells: cells(kind === "tray" ? .36 : s.width * .82, kind === "tray" ? .25 : .39) });
    const kernels = 2 + Math.floor(random() * 4);
    for (let i = 0; i < kernels; i++) job.particles.push({ id: `${s.id}-kernel-${i}`, seatId: s.id,
      x: s.x + (random() - .5) * s.width * .55, z: s.z + (random() - .5) * .22,
      y: s.floorY + .625, floorY: s.floorY, vx: 0, vz: 0, vy: 0, mode: "chair", bounds: s.floorBounds });
  }
  plan.patches.forEach((patch, index) => {
    job.surfaces.push({ id: `${plan.id}-floor-spill-${index}`, kind: "floor", x: patch.x + .45, y: patch.y + .008, z: patch.z,
      width: .50, depth: .50, spill: true, cells: cells(.5, .5, 4) });
    const count = 5 + Math.floor(random() * 5);
    for (let i = 0; i < count; i++) job.particles.push({ id: `${plan.id}-floor-${index}-${i}`, x: patch.x + (random() - .5) * .42,
      z: patch.z + (random() - .5) * .4, y: patch.y + .035, floorY: patch.y, vx: 0, vz: 0, vy: 0,
      mode: "floor", bounds: patch.bounds });
  });
  if (existing) state.jobs.splice(state.jobs.indexOf(existing), 1, job); else state.jobs.push(job);
  return job;
}
export const surfaceClean = surface => surface.cells.every(c => c.dirt <= .001);
export function seatStage(job, seat) {
  if (!surfaceClean(job.surfaces.find(s => s.id === `${seat.id}-tray`))) return "wipe tray";
  if (!surfaceClean(job.surfaces.find(s => s.id === `${seat.id}-seat`))) return "wipe seat";
  if (job.particles.some(p => p.seatId === seat.id && ["chair", "falling"].includes(p.mode))) return "sweep seat";
  if (seat.trayOpen || Math.abs(seat.trayAngle) > .02) return "close tray";
  return "ready";
}
export function theaterSummary(job) {
  if (!job) return { active: false, complete: false, usedSeats: 0, seatsReady: 0, floor: 0, pan: 0, trash: 0, spills: 0, floorUnlocked: false };
  const seatsReady = job.seats.filter(s => seatStage(job, s) === "ready").length;
  const floor = job.particles.filter(p => ["floor", "chair", "falling"].includes(p.mode)).length;
  const pan = job.particles.filter(p => ["pan", "pouring"].includes(p.mode)).length;
  const trash = job.particles.filter(p => p.mode === "trash").length;
  const floorSurfaces = job.surfaces.filter(s => s.kind === "floor"), spills = floorSurfaces.filter(surfaceClean).length;
  return { active: true, id: job.id, number: job.number, usedSeats: job.seats.length, seatsReady, floor, pan, trash,
    total: job.particles.length, spills, totalSpills: floorSurfaces.length, floorUnlocked: seatsReady === job.seats.length,
    complete: seatsReady === job.seats.length && floor === 0 && pan === 0 && spills === floorSurfaces.length };
}
export function usherSummary(state) {
  const summaries = state.jobs.map(theaterSummary);
  return { floor: summaries.reduce((n, s) => n + s.floor, 0), pan: summaries.reduce((n, s) => n + s.pan, 0),
    trash: summaries.reduce((n, s) => n + s.trash, 0), total: summaries.reduce((n, s) => n + s.total, 0),
    spills: summaries.reduce((n, s) => n + s.spills, 0), theatersReady: summaries.filter(s => s.complete).length,
    complete: summaries.length > 0 && summaries.every(s => s.complete) };
}
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
export function closeCleaningTray(job, seat) {
  if (seatStage(job, seat) !== "close tray") return false;
  seat.trayOpen = false; seat.trayTarget = 0; return true;
}
export function stepUsherState(state, seconds, contact = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, 1 / 30); state.elapsed += dt;
  const canMove = contact.canMove ?? (() => true);
  if (state.pouring > 0) {
    const pouringJobs = state.jobs.filter(j => j.particles.some(p => p.mode === "pouring"));
    state.pouring = Math.max(0, state.pouring - dt);
    if (state.pouring < 1e-8) {
      state.pouring = 0; for (const p of state.particles) if (p.mode === "pouring") p.mode = "trash";
      for (const job of pouringJobs) job.completed = theaterSummary(job).complete;
    }
  }
  for (const job of state.jobs) {
    if (contact.activeTheaterId !== undefined && contact.activeTheaterId !== job.id
      && !job.seats.some(s => Math.abs(s.trayTarget - s.trayAngle) > .001)
      && !job.particles.some(p => p.mode === "falling" || p.mode === "pouring" || Math.hypot(p.vx, p.vz) > .001)) continue;
    for (const s of job.seats) s.trayAngle += clamp(s.trayTarget - s.trayAngle, -dt * 2.8, dt * 2.8);
    const floorUnlocked = theaterSummary(job).floorUnlocked;
    const { brush, pan, cloth } = contact;
    if (cloth && state.heldTool === "cloth") {
      const surface = job.surfaces.find(s => s.id === cloth.surfaceId);
      const seat = surface?.seatId && job.seats.find(s => s.id === surface.seatId);
      const allowed = surface && (surface.kind === "floor" ? floorUnlocked : surface.kind === "tray" || seatStage(job, seat) !== "wipe tray");
      const travel = Math.hypot(cloth.to.x - cloth.from.x, cloth.to.z - cloth.from.z);
      if (allowed && travel > .00005 && travel < .15) for (const c of surface.cells) {
        if (segmentDistance(c, cloth.from, cloth.to) < .12) c.dirt = Math.max(0, c.dirt - travel * 7.0);
      }
    }
    for (const p of job.particles) {
      if (!["floor", "chair", "falling"].includes(p.mode)) continue;
      const seat = p.seatId && job.seats.find(s => s.id === p.seatId), chair = p.mode === "chair";
      const canSweep = chair ? seatStage(job, seat) === "sweep seat" : floorUnlocked;
      if (brush && state.heldTool === "broom" && canSweep && p.mode !== "falling"
        && (chair ? brush.seatId === p.seatId : !brush.seatId) && Math.abs(brush.y - p.y) < .12) {
        const dx = brush.to.x - brush.from.x, dz = brush.to.z - brush.from.z, travel = Math.hypot(dx, dz);
        const touching = [-.15, 0, .15].some(o => segmentDistance(p,
          { x: brush.from.x + brush.right.x * o, z: brush.from.z + brush.right.z * o },
          { x: brush.to.x + brush.right.x * o, z: brush.to.z + brush.right.z * o }) < .09);
        if (travel > .00001 && travel < .18 && touching && canMove(brush.from, p, p, chair ? seat.rowColliderId : null)) {
          const speed = Math.min(1.7, travel / dt * .96); p.vx = dx / travel * speed; p.vz = dz / travel * speed;
        }
      }
      const before = { x: p.x, y: p.y, z: p.z }, after = { x: p.x + p.vx * dt, y: p.y, z: p.z + p.vz * dt };
      if (canMove(before, after, p, p.mode !== "floor" ? seat?.rowColliderId : null)) { p.x = after.x; p.z = after.z; }
      else p.vx = p.vz = 0;
      if (chair && (p.z - seat.z) * seat.forward > .30) { p.mode = "falling"; p.vy = 0; }
      if (p.mode === "falling") {
        p.vy -= 9.81 * dt; p.y += p.vy * dt;
        if (p.y <= p.floorY + .035) {
          p.y = p.floorY + .035; p.mode = "floor"; p.vy = 0;
          // Resolve the kernel's full radius outside the chair-front solid.
          // Otherwise friction can leave its center just beyond .39 m while
          // its body still overlaps the expanded seat collider, trapping it.
          if (seat && (p.z - seat.z) * seat.forward < .45) p.z = seat.z + seat.forward * .45;
        }
      }
      if (p.mode === "floor") {
        const b = p.bounds; p.x = clamp(p.x, b.xMin + .04, b.xMax - .04); p.z = clamp(p.z, b.zMin + .04, b.zMax - .04);
        const speed = Math.hypot(p.vx, p.vz);
        if (pan && floorUnlocked && speed > .06 && Math.abs(pan.y - p.floorY) < .05 && !state.pouring) {
          const dx = p.x - pan.x, dz = p.z - pan.z;
          const front = dx * pan.forward.x + dz * pan.forward.z, side = dx * pan.right.x + dz * pan.right.z;
          if (Math.abs(side) < .25 && front > -.19 && front < .18 && p.vx * pan.forward.x + p.vz * pan.forward.z > .035
            && canMove(before, { x: pan.x, y: p.y, z: pan.z }, p)) { p.mode = "pan"; p.vx = p.vz = 0; }
        }
      }
      const damping = Math.exp(-(p.mode === "chair" ? 3.5 : 5.8) * dt); p.vx *= damping; p.vz *= damping;
      if (Math.hypot(p.vx, p.vz) < .012) p.vx = p.vz = 0;
    }
    job.completed = theaterSummary(job).complete;
  }
}
export function beginUsherPour(state, target, acceptedCount) {
  if (state.heldTool !== "broom" || state.pouring > 0) return false;
  const contents = state.particles.filter(p => p.mode === "pan").slice(0, Math.max(0, Math.floor(acceptedCount)));
  if (!contents.length) return false;
  for (const p of contents) p.mode = "pouring";
  state.pourTarget = target; state.pouring = .85; return true;
}
export function serializeUsherState(state) {
  return JSON.stringify({ version: 22, kit: state.kit, jobs: state.jobs.map(j => ({ id: j.id, seed: j.seed,
    seats: j.seats.map(s => ({ id: s.id, trayOpen: s.trayOpen })),
    surfaces: j.surfaces.map(s => ({ id: s.id, dirt: s.cells.map(c => c.dirt) })),
    particles: j.particles.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, mode: p.mode === "pouring" ? "trash" : p.mode })),
  })) });
}
export function restoreUsherState(raw, plans = []) {
  const state = createUsherState();
  try {
    const saved = JSON.parse(raw);
    if (saved?.version !== 22 || !Array.isArray(saved.jobs) || saved.jobs.length > 14) return state;
    state.kit = saved.kit === true;
    for (const data of saved.jobs) {
      const plan = plans.find(p => p.id === data.id); if (!plan || state.jobs.some(j => j.id === data.id) || typeof data.seed !== "string") continue;
      const job = beginCleaningBreak(state, plan, data.seed);
      if (!job || data.particles?.length !== job.particles.length || data.surfaces?.length !== job.surfaces.length) continue;
      for (const s of job.surfaces) {
        const source = data.surfaces.find(d => d.id === s.id);
        if (source?.dirt.length === s.cells.length && source.dirt.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) source.dirt.forEach((v, i) => { s.cells[i].dirt = v; });
      }
      for (const p of job.particles) {
        const source = data.particles.find(d => d.id === p.id);
        if (!source || ![source.x, source.y, source.z].every(Number.isFinite) || !["floor", "chair", "falling", "pan", "trash"].includes(source.mode)) continue;
        if (source.x < plan.bounds.xMin || source.x > plan.bounds.xMax || source.z < plan.bounds.zMin || source.z > plan.bounds.zMax || Math.abs(source.y - p.floorY) > 1) continue;
        Object.assign(p, source);
        if (p.mode === "floor" && p.seatId) {
          const seat = job.seats.find(s => s.id === p.seatId);
          if ((p.z - seat.z) * seat.forward < .45) p.z = seat.z + seat.forward * .45;
        }
      }
      for (const seat of job.seats) if (data.seats?.find(s => s.id === seat.id)?.trayOpen === false && seatStage(job, seat) === "close tray") {
        seat.trayOpen = false; seat.trayAngle = seat.trayTarget = 0;
      }
      job.completed = theaterSummary(job).complete;
    }
  } catch { /* Invalid or unavailable storage starts a fresh shift. */ }
  return state;
}
