import { AUDITORIUMS } from "./layout-data.js";
import { SHOWS, CONCESSION_MENU } from "./showtimes.js";

/** Small deterministic visit model. Time advances only while the game is running. */
export function createVisitState() {
  let ticket = null;
  let order = null;
  let elapsed = 0;
  let orderNumber = 1;
  let drink = null;
  return {
    get ticket() {
      return ticket;
    },
    get order() {
      return order;
    },
    get drink() {
      return drink;
    },
    reserve(showId, time, row, seat) {
      const show = SHOWS.find((candidate) => candidate.id === showId);
      const room = AUDITORIUMS.find(
        (candidate) => candidate.number === show?.auditorium,
      );
      if (
        !show ||
        !show.times.includes(time) ||
        !Number.isInteger(row) ||
        !Number.isInteger(seat) ||
        row < 0 ||
        row >= room.rows.length ||
        seat < 1 ||
        seat > room.rows[row]
      ) {
        throw new RangeError(
          "Choose a listed showtime and a seat in this auditorium.",
        );
      }
      ticket = Object.freeze({
        show,
        time,
        row,
        seat,
        seatLabel: `${String.fromCharCode(65 + row)}${seat}`,
        checked: false,
      });
      return ticket;
    },
    checkTicket() {
      if (!ticket) return false;
      ticket = Object.freeze({ ...ticket, checked: true });
      return ticket;
    },
    placeOrder(itemId) {
      if (order && order.status !== "collected")
        throw new Error("Collect your current order at Expo first.");
      const item = CONCESSION_MENU.find((candidate) => candidate.id === itemId);
      if (!item) throw new RangeError("That item is not on the menu.");
      order = Object.freeze({
        number: orderNumber++,
        item,
        readyAt: elapsed + item.preparation,
        status: "preparing",
      });
      return order;
    },
    collectOrder() {
      if (order?.status !== "ready") return false;
      order = Object.freeze({ ...order, status: "collected" });
      return order;
    },
    pourDrink(flavor) {
      if (
        ![
          "Cola",
          "Lemon-lime",
          "Cherry ICEE",
          "Blue raspberry ICEE",
          "Water",
        ].includes(flavor)
      )
        throw new RangeError("Unknown drink.");
      drink = flavor;
      return drink;
    },
    update(delta) {
      if (!Number.isFinite(delta) || delta <= 0) return false;
      elapsed += Math.min(delta, 0.1);
      if (order?.status === "preparing" && elapsed + 1e-8 >= order.readyAt) {
        order = Object.freeze({ ...order, status: "ready" });
        return true;
      }
      return false;
    },
    secondsRemaining() {
      return Math.max(0, Math.ceil((order?.readyAt ?? 0) - elapsed));
    },
  };
}

// A finite segment test, shared by interaction and clipping regression tests.
export function segmentHitsBox(start, end, box) {
  if (box.enabled === false) return false;
  let near = 0;
  let far = 1;
  for (const [axis, min, max] of [
    ["x", "minX", "maxX"],
    ["y", "minY", "maxY"],
    ["z", "minZ", "maxZ"],
  ]) {
    const d = end[axis] - start[axis];
    if (Math.abs(d) < 1e-8) {
      if (start[axis] < box[min] || start[axis] > box[max]) return false;
    } else {
      let a = (box[min] - start[axis]) / d;
      let b = (box[max] - start[axis]) / d;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (near > far) return false;
    }
  }
  return far > 0.001 && near < 0.985;
}
