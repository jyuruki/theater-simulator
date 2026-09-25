import * as THREE from "three";
import { AUDITORIUMS, PUBLIC_SPACES } from "./layout-data.js";
import { planToWorldBounds, planToWorldX } from "./coordinates.js";
import { auditoriumDoorLayout } from "./auditorium-door-layout.js";
import { createCleaningPlans } from "./usher-cleaning-layout.js";

export const PATRON_RADIUS = .24, PATRON_HEIGHT = 1.74;
export const PATRON_LOBBY = Object.freeze([1.925, 0, 2.2]);
export const PATRON_EXIT = Object.freeze([1.925, 0, -7]);
const STEP = .4, HASH = 3;
const inside = (x, z, b) => x >= b.xMin && x <= b.xMax && z >= b.zMin && z <= b.zMax;

class Heap {
  list = [];
  push(value) { let i = this.list.length; this.list.push(value); while (i) { const p = (i - 1) >> 1; if (this.list[p].f <= value.f) break; this.list[i] = this.list[p]; i = p; } this.list[i] = value; }
  pop() {
    const first = this.list[0], last = this.list.pop(); if (!this.list.length) return first;
    let i = 0;
    while (i * 2 + 1 < this.list.length) {
      let c = i * 2 + 1; if (c + 1 < this.list.length && this.list[c + 1].f < this.list[c].f) c++;
      if (last.f <= this.list[c].f) break; this.list[i] = this.list[c]; i = c;
    }
    this.list[i] = last; return first;
  }
}

/** Static routes use authored public floors and real wall/fixture collision.
 * Moving doors, cans and people are checked again by the walking simulation. */
export function createCustomerNavigation(world, getObstacles = () => []) {
  const regions = [...PUBLIC_SPACES.flatMap(space => space.footprintRects ?? [space.bounds]),
    ...AUDITORIUMS.map(room => room.bounds),
    ...[...world.auditoriumLayouts.values()].flatMap(layout => layout.routeSurfaces.map(surface => surface.bounds))].map(planToWorldBounds);
  const dynamic = new Set(world.dynamicColliders ?? []);
  const fixed = world.colliders.filter(c => !dynamic.has(c));
  const buckets = new Map(), nodes = new Map(), cachedRoutes = new Map();
  const seatPlans = createCleaningPlans(world), cachedSeats = new Map(), clearanceCache = new Map();
  const pendingRoutes = new Map(), pendingSeats = new Map(); let cancelled = false;
  const stats = { searches: 0, expanded: 0, slices: 0, maxSliceMs: 0, active: 0 };
  for (const c of fixed) for (let x = Math.floor((c.minX - PATRON_RADIUS) / HASH); x <= Math.floor((c.maxX + PATRON_RADIUS) / HASH); x++)
    for (let z = Math.floor((c.minZ - PATRON_RADIUS) / HASH); z <= Math.floor((c.maxZ + PATRON_RADIUS) / HASH); z++) {
      const key = `${x},${z}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(c);
    }
  function clearPoint(x, z, y = world.groundHeight(x, z, 0)) {
    if (!Number.isFinite(y)) return false;
    for (const dx of [-PATRON_RADIUS, PATRON_RADIUS]) for (const dz of [-PATRON_RADIUS, PATRON_RADIUS])
      if (!regions.some(b => inside(x + dx, z + dz, b))) return false;
    for (const c of buckets.get(`${Math.floor(x / HASH)},${Math.floor(z / HASH)}`) ?? []) {
      if (c.enabled === false || y + .04 >= c.maxY || y + PATRON_HEIGHT <= c.minY) continue;
      const nx = THREE.MathUtils.clamp(x, c.minX, c.maxX), nz = THREE.MathUtils.clamp(z, c.minZ, c.maxZ);
      if (Math.hypot(x - nx, z - nz) < PATRON_RADIUS + .025) return false;
    }
    return true;
  }
  function clearSegment(a, b) {
    const length = Math.hypot(a.x - b.x, a.z - b.z), count = Math.max(1, Math.ceil(length / .12));
    let lastY = a.y;
    for (let i = 0; i <= count; i++) {
      const t = i / count, x = THREE.MathUtils.lerp(a.x, b.x, t), z = THREE.MathUtils.lerp(a.z, b.z, t);
      const y = world.groundHeight(x, z, lastY);
      if (Math.abs(y - lastY) > .30 || !clearPoint(x, z, y)) return false;
      lastY = y;
    }
    return true;
  }
  function clearance(x, z, y = world.groundHeight(x, z, 0)) {
    const key = `${Math.round(x * 10)},${Math.round(z * 10)},${Math.round(y * 10)}`;
    if (clearanceCache.has(key)) return clearanceCache.get(key);
    let distance = 2;
    for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
      for (const c of buckets.get(`${Math.floor(x / HASH) + ix},${Math.floor(z / HASH) + iz}`) ?? []) {
        if (c.enabled === false || y + .04 >= c.maxY || y + PATRON_HEIGHT <= c.minY) continue;
        distance = Math.min(distance, Math.hypot(x - THREE.MathUtils.clamp(x, c.minX, c.maxX), z - THREE.MathUtils.clamp(z, c.minZ, c.maxZ)));
      }
    }
    clearanceCache.set(key, distance); return distance;
  }
  function node(ix, iz) {
    const key = `${ix},${iz}`; if (nodes.has(key)) return nodes.get(key);
    const x = ix * STEP, z = iz * STEP, y = world.groundHeight(x, z, 0);
    const n = clearPoint(x, z, y) ? { key, ix, iz, x, y, z } : null; nodes.set(key, n); return n;
  }
  const vector = p => p?.isVector3 ? p.clone() : new THREE.Vector3(...p);
  function dynamicClear(p, obstacles) {
    return !obstacles.some(c => c.enabled !== false && p.y + .035 < c.maxY && p.y + PATRON_HEIGHT > c.minY
      && Math.hypot(p.x - THREE.MathUtils.clamp(p.x, c.minX, c.maxX), p.z - THREE.MathUtils.clamp(p.z, c.minZ, c.maxZ)) < PATRON_RADIUS + .055);
  }
  function dynamicSegment(a, b, obstacles) {
    const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .1));
    for (let i = 0; i <= n; i++) if (!dynamicClear({ x: THREE.MathUtils.lerp(a.x, b.x, i / n), y: THREE.MathUtils.lerp(a.y, b.y, i / n), z: THREE.MathUtils.lerp(a.z, b.z, i / n) }, obstacles)) return false;
    return true;
  }
  function nearest(p, obstacles) {
    const ix = Math.round(p.x / STEP), iz = Math.round(p.z / STEP), candidates = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const n = node(ix + dx, iz + dz); if (n && clearSegment(p, n) && dynamicSegment(p, n, obstacles)) candidates.push(n); }
    return candidates.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] ?? null;
  }
  function* pathSteps(from, to, options = {}) {
    stats.searches++;
    const startPoint = vector(from), endPoint = vector(to);
    const obstacles = [...getObstacles(), ...(options.obstacles ?? [])];
    const segment = (a, b) => clearSegment(a, b) && dynamicSegment(a, b, obstacles);
    const comfortable = (a, b) => {
      if (!segment(a, b)) return false;
      const margin = Math.min(options.clearance ?? .72, clearance(a.x, a.z, a.y), clearance(b.x, b.z, b.y));
      const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .4));
      for (let i = 1; i < steps; i++) {
        const x = THREE.MathUtils.lerp(a.x, b.x, i / steps), z = THREE.MathUtils.lerp(a.z, b.z, i / steps);
        if (clearance(x, z) < margin - .03) return false;
      }
      return true;
    };
    startPoint.y = world.groundHeight(startPoint.x, startPoint.z, startPoint.y);
    endPoint.y = world.groundHeight(endPoint.x, endPoint.z, endPoint.y);
    if (comfortable(startPoint, endPoint)) return [startPoint, endPoint];
    const start = nearest(startPoint, obstacles), goal = nearest(endPoint, obstacles); if (!start || !goal) return null;
    const open = new Heap(), best = new Map([[start.key, 0]]), previous = new Map(), closed = new Set();
    const heuristic = n => Math.hypot(n.x - goal.x, n.z - goal.z);
    open.push({ node: start, f: heuristic(start), g: 0 });
    while (open.list.length && closed.size < (options.maxNodes ?? 40000)) {
      const entry = open.pop(), current = entry.node; if (closed.has(current.key)) continue;
      if (current.key === goal.key) {
        const result = [endPoint]; let p = current;
        while (p) { result.push(new THREE.Vector3(p.x, p.y, p.z)); p = previous.get(p.key); }
        result.push(startPoint); result.reverse();
        const smooth = [result[0]]; let at = 0;
        while (at < result.length - 1) {
          let next = Math.min(result.length - 1, at + 60);
          while (next > at + 1 && !comfortable(result[at], result[next])) { next--; if (next % 8 === 0) yield; }
          smooth.push(result[next]); at = next; yield;
        }
        return smooth;
      }
      closed.add(current.key); stats.expanded++;
      if (closed.size % 32 === 0) yield;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const next = node(current.ix + dx, current.iz + dz); if (!next || closed.has(next.key) || !segment(current, next)) continue;
        // Prefer the middle of a usable aisle even when a wall-skimming corner
        // would save a few centimeters. Tight doors remain traversable.
        const g = entry.g + STEP * Math.hypot(dx, dz) * (1 + Math.max(0, .9 - clearance(next.x, next.z, next.y)) * 1.8);
        if (g >= (best.get(next.key) ?? Infinity)) continue;
        best.set(next.key, g); previous.set(next.key, current); open.push({ node: next, g, f: g + heuristic(next) });
      }
    }
    return null;
  }
  function path(from, to, options = {}) {
    const search = pathSteps(from, to, options); let result;
    do { result = search.next(); } while (!result.done);
    return result.value;
  }
  async function pathAsync(from, to, options = {}) {
    stats.active++;
    const search = pathSteps(from, to, options); let result;
    try {
      do {
        if (cancelled) return null;
        const began = performance.now();
        do { result = search.next(); } while (!result.done && performance.now() - began < 2);
        const elapsed = performance.now() - began;
        stats.slices++; stats.maxSliceMs = Math.max(stats.maxSliceMs, elapsed);
        if (!result.done) await new Promise(resolve => setTimeout(resolve, 0));
      } while (!result.done);
      return result.value;
    } finally { stats.active--; }
  }
  async function theaterPathAsync(id) {
    if (cachedRoutes.has(id)) return cachedRoutes.get(id)?.map(p => p.clone()) ?? null;
    if (!pendingRoutes.has(id)) pendingRoutes.set(id, (async () => {
      const target = theaterDestination(id), route = target ? await pathAsync(PATRON_LOBBY, target) : null;
      if (route) cachedRoutes.set(id, route); return route;
    })());
    const route = await pendingRoutes.get(id); pendingRoutes.delete(id); return route?.map(p => p.clone()) ?? null;
  }
  async function theaterSeatAsync(id, seatId) {
    if (cachedSeats.has(seatId)) return cachedSeats.get(seatId);
    if (!pendingSeats.has(seatId)) pendingSeats.set(seatId, (async () => {
      const plan = seatPlans.find(plan => plan.id === id), seat = plan?.seats.find(seat => seat.id === seatId);
      const base = await theaterPathAsync(id); if (!seat || !base) return null;
      const tail = await pathAsync(base.at(-1), seat.stand); if (!tail) return null;
      const item = { seat, route: [...base, ...tail.slice(1)] }; cachedSeats.set(seatId, item); return item;
    })());
    const item = await pendingSeats.get(seatId); pendingSeats.delete(seatId); return item;
  }
  function theaterDestination(id) {
    const room = AUDITORIUMS.find(room => room.id === id), layout = world.auditoriumLayouts.get(id);
    if (!room || !layout) return null;
    const door = auditoriumDoorLayout(room);
    if (door.small) return new THREE.Vector3(...door.route.inside).add(new THREE.Vector3(...door.normal).multiplyScalar(.35));
    const cross = layout.entryCross ?? layout.frontCross, b = cross.bounds;
    const planX = layout.routeReserve?.side === "east" ? b.xMax - 1.6 : b.xMin + 1.6;
    const target = new THREE.Vector3(planToWorldX(planX), cross.elevation, (b.zMin + b.zMax) / 2);
    for (const dz of [0, .3, -.3, .6, -.6, .9, -.9, 1.2, -1.2, 1.5, 1.8, 2.1]) for (const dx of [0, .4, -.4]) {
      const p = target.clone().add(new THREE.Vector3(dx, 0, dz));
      p.y = world.groundHeight(p.x, p.z, cross.elevation);
      if (Math.abs(p.y - cross.elevation) < .05 && clearPoint(p.x, p.z, p.y)) return p;
    }
    return target;
  }
  function theaterPath(id) {
    if (!cachedRoutes.has(id)) {
      const target = theaterDestination(id); cachedRoutes.set(id, target ? path(PATRON_LOBBY, target) : null);
    }
    return cachedRoutes.get(id)?.map(p => p.clone()) ?? null;
  }
  function theaterSeats(id, seatIds = null) {
    const layout = world.auditoriumLayouts.get(id), plan = seatPlans.find(p => p.id === id), base = theaterPath(id);
    if (!plan || !base) return [];
    const rowIndex = layout.entryCross ? layout.groundRowIndex : layout.access === "top" ? layout.rows.length - 1 : 0;
    const seats = seatIds ? seatIds.map(seatId => plan.seats.find(seat => seat.id === seatId)).filter(Boolean)
      : plan.seats.filter(s => s.row === rowIndex).sort((a, b) => Math.abs(a.x - base.at(-1).x) - Math.abs(b.x - base.at(-1).x)).slice(0, 4);
    const results = [];
    for (const seat of seats) {
      if (cachedSeats.has(seat.id)) { results.push(cachedSeats.get(seat.id)); continue; }
      const approach = new THREE.Vector3(...seat.stand);
      if (!clearPoint(approach.x, approach.z, approach.y)) continue;
      const tail = path(base.at(-1), approach); if (!tail) continue;
      const result = { seat, route: [...base.map(p => p.clone()), ...tail.slice(1)] };
      results.push(result); cachedSeats.set(seat.id, result);
    }
    return results;
  }
  return { path, pathAsync, theaterPath, theaterPathAsync, theaterSeats, theaterSeatAsync, theaterDestination, clearPoint, clearance, seatPlans, stats,
    clearSegment: (a, b) => clearSegment(a, b) && dynamicSegment(a, b, getObstacles()),
    clearLivePoint: (x, z, y) => clearPoint(x, z, y) && dynamicClear({ x, z, y }, getObstacles()),
    dispose() { cancelled = true; pendingRoutes.clear(); pendingSeats.clear(); },
    get cachedNodes() { return nodes.size; } };
}
