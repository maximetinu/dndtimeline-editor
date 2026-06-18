// tests/dates.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { minutesToYMD, ymdToMinutes, yearLabel, dateText, relativeLabel } from "../js/dates.js";

test("minutesToYMD matches known LegendKeeper anchors", () => {
  assert.deepEqual(minutesToYMD(774722880), { year: 1474, month: 1, day: 1 });
  assert.deepEqual(minutesToYMD(775248480), { year: 1475, month: 1, day: 1 });
  assert.deepEqual(minutesToYMD(775482109), { year: 1475, month: 6, day: 12 });
});

test("BCE minutes resolve to non-positive years", () => {
  assert.equal(minutesToYMD(-788397513).year <= 0, true);
});

test("ymdToMinutes is the inverse for CE dates", () => {
  assert.equal(minutesToYMD(ymdToMinutes(1475, 6, 12)).year, 1475);
  assert.equal(minutesToYMD(ymdToMinutes(1475, 6, 12)).month, 6);
  assert.equal(minutesToYMD(ymdToMinutes(1475, 6, 12)).day, 12);
});

test("yearLabel formats CE and BCE", () => {
  assert.equal(yearLabel(1475), "1475 CE");
  assert.equal(yearLabel(0), "1 BCE");
  assert.equal(yearLabel(-1498), "1499 BCE");
});

test("dateText returns the formatted year for given minutes", () => {
  assert.equal(dateText(775248480), "1475 CE");   // 1475-01-01
  assert.equal(dateText(-788397513), "1499 BCE");  // BCE event
});

test("relativeLabel: years vs days vs none", () => {
  assert.equal(relativeLabel(null, 100), "");
  assert.equal(relativeLabel(774722880, 775248480), "1 year later"); // 1474-01-01 → 1475-01-01
  assert.equal(relativeLabel(775248480, 775482109), "162 days later"); // 1475-01-01 → 1475-06-12
});
