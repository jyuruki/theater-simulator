import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createShowAttendance, MAX_SHOW_AUDIENCE } from "../src/show-attendance.js";
import { createCleaningPlans } from "../src/usher-cleaning-layout.js";

const plans = createCleaningPlans(), shows = [], legacy = [];
for (let cycle = 0; cycle < 100; cycle++) for (const plan of plans) {
  const show = createShowAttendance(plan, { cycle });
  assert.deepEqual(show, createShowAttendance(plan, { cycle }), "Reload preserves the audience");
  assert.ok(show.count >= 0 && show.count <= MAX_SHOW_AUDIENCE && show.count <= plan.seats.length);
  assert.equal(new Set(show.seatIds).size, show.count);
  assert.deepEqual(show.groups.flatMap(group => group.seatIds), show.seatIds);
  for (const group of show.groups) {
    assert.ok(group.seatIds.length >= 1 && group.seatIds.length <= 5);
    const seats = group.seatIds.map(id => plan.seats.find(seat => seat.id === id));
    assert.ok(seats.every(seat => seat && seat.row === seats[0].row));
    assert.ok(seats.every((seat, i) => !i || seat.column === seats[i - 1].column + 1), "Parties share adjacent seats");
  }
  shows.push({ capacity: plan.seats.length, ...show });
  legacy.push(createShowAttendance(plan, { cycle, version: 24 }));
}
// Captured from the released v0.25 recipe for the same 1,400 shows. A schedule
// upgraded in place must retain its occupants, including every seat and party.
assert.equal(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"),
  "e042eb966fdd5c9e914547bac6d57bcd77f69607db63c563fbae2483c0189b69");
const mean = entries => entries.reduce((sum, show) => sum + show.count, 0) / entries.length;
const empty = shows.filter(show => show.count === 0).length / shows.length;
const quiet = shows.filter(show => show.count > 0 && show.count <= 4).length / shows.length;
const busy = shows.filter(show => show.count >= 16).length / shows.length;
assert.ok(empty > .01 && empty < .05, `Empty shows remain rare: ${empty}`);
assert.ok(quiet > .3 && quiet < .6, `Small audiences remain common: ${quiet}`);
assert.ok(busy > .02 && busy < .16, `Busy shows still occur: ${busy}`);
assert.ok(mean(shows) < mean(legacy) * .65, "Ordinary shifts have substantially lighter attendance");
assert.ok(mean(shows.filter(show => show.capacity >= 100)) > mean(shows.filter(show => show.capacity < 100)) * 1.15,
  "Larger rooms skew toward more attendees");
assert.equal(Math.max(...shows.map(show => show.count)), MAX_SHOW_AUDIENCE);
console.log(JSON.stringify({ shows: shows.length, meanAttendance: mean(shows), previousMean: mean(legacy), empty, quiet, busy }));
console.log("Attendance v26 valid: quiet and empty screenings, busier large rooms, varied contiguous parties, deterministic old-save compatibility.");
