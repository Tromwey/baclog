import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BIRTH_DATE_INVALID,
  BIRTH_DATE_NEEDED,
  BIRTH_DATE_REQUIRED,
  BIRTH_YEAR_INVALID,
  ageOn,
  decideAge,
  latestToday,
  parseBirthDate,
} from "./age";

/**
 * "Today" for every case: 2026-10-01 in UTC AND at UTC+14 (09:30Z + 14 h =
 * 23:30 of the same day), so the fixed-NOW cases read the same either way.
 */
const NOW = new Date("2026-10-01T09:30:00Z");
const date = (birthDate: string, now = NOW) => decideAge({ birthDate }, now);
const year = (birthYear: number, now = NOW) => decideAge({ birthYear }, now);

test("fecha: cumple 13 HOY → pasa, y solo sale el año", () => {
  assert.deepEqual(date("2013-10-01"), { kind: "ok", birthYear: 2013 });
});

test("fecha: nació hace 13 años MENOS un día (cumple mañana) → menor", () => {
  assert.deepEqual(date("2013-10-02"), { kind: "underage", birthYear: 2013 });
});

test("fecha: el caso que el gate por años dejaba pasar (12, cumple en diciembre) → menor", () => {
  assert.deepEqual(date("2013-12-31"), { kind: "underage", birthYear: 2013 });
  assert.deepEqual(date("2013-01-01"), { kind: "ok", birthYear: 2013 });
});

test("fecha: \"hoy\" es la fecha más adelantada del mundo (UTC+14)", () => {
  // 2026-09-30T10:00Z is already Oct 1 at UTC+14: whoever turns 13 there passes.
  assert.deepEqual(date("2013-10-01", new Date("2026-09-30T10:00:00Z")), { kind: "ok", birthYear: 2013 });
  assert.equal(date("2013-10-01", new Date("2026-09-30T09:59:59Z")).kind, "underage");
  // Still Oct 1 nowhere on Earth → the birthday hasn't started anywhere.
  assert.equal(date("2013-10-02", new Date("2026-10-01T09:59:59Z")).kind, "underage");
  assert.equal(date("2013-10-02", new Date("2026-10-01T10:00:00Z")).kind, "ok");
  assert.equal(latestToday(new Date("2026-12-31T10:00:00Z")).getUTCFullYear(), 2027);
});

test("fecha futura y birthYear legado también leen el día de UTC+14", () => {
  const eve = new Date("2026-12-31T12:00:00Z"); // 2027-01-01 at UTC+14
  // "Born today" for someone already in 2027: a valid date, not a future one.
  assert.deepEqual(date("2027-01-01", eve), { kind: "underage", birthYear: 2027 });
  assert.equal(date("2027-01-02", eve).kind, "invalid");
  // Legacy year: 2014 is n = 13 there (could be 13 already) → ask, never block.
  assert.deepEqual(year(2014, eve), { kind: "invalid", field: "birthYear", message: BIRTH_DATE_NEEDED });
  assert.equal(year(2015, eve).kind, "underage");
  assert.equal(year(2013, eve).kind, "ok");
});

test("29 de febrero: en año no bisiesto cumple el 1 de marzo", () => {
  const born = "2012-02-29";
  // 2025 is not a leap year: 13th birthday lands on 2025-03-01.
  // (the gate's day is UTC+14: Mar 1 starts there at 2025-02-28T10:00Z).
  assert.equal(date(born, new Date("2025-02-28T09:59:59Z")).kind, "underage");
  assert.deepEqual(date(born, new Date("2025-02-28T10:00:00Z")), { kind: "ok", birthYear: 2012 });
  // Leap-year birthday, on the day itself.
  assert.equal(ageOn({ year: 2012, month: 2, day: 29 }, new Date("2028-02-28T12:00:00Z")), 15);
  assert.equal(ageOn({ year: 2012, month: 2, day: 29 }, new Date("2028-02-29T00:00:00Z")), 16);
});

test("fecha: forma y calendario estrictos, nunca futura, año ≥ 1900", () => {
  for (const bad of [
    "2023-02-29", // not a leap year
    "2013-13-01",
    "2013-00-10",
    "2013-04-31",
    "2013-1-1",
    "01/10/2013",
    "2013-10-01T00:00:00Z",
    " 2013-10-01",
    "",
    "1899-12-31",
    "2026-10-02", // tomorrow (UTC+14 too)
    "2999-01-01",
  ]) {
    assert.deepEqual(date(bad), { kind: "invalid", field: "birthDate", message: BIRTH_DATE_INVALID }, bad);
  }
  assert.equal(parseBirthDate("2024-02-29")?.day, 29);
  // Born today: a valid date, age 0.
  assert.deepEqual(date("2026-10-01"), { kind: "underage", birthYear: 2026 });
  assert.deepEqual(date("1900-01-01"), { kind: "ok", birthYear: 1900 });
});

test("birthYear legado: ≥ 14 años de diferencia → pasa como antes", () => {
  assert.deepEqual(year(2012), { kind: "ok", birthYear: 2012 });
  assert.deepEqual(year(1990), { kind: "ok", birthYear: 1990 });
});

test("birthYear legado: ≤ 12 años de diferencia → menor como antes", () => {
  assert.deepEqual(year(2014), { kind: "underage", birthYear: 2014 });
  assert.deepEqual(year(2026), { kind: "underage", birthYear: 2026 });
});

test("birthYear legado: exactamente 13 → ni pasa ni bloquea: pide la fecha completa", () => {
  assert.deepEqual(year(2013), { kind: "invalid", field: "birthYear", message: BIRTH_DATE_NEEDED });
});

test("birthYear legado: fuera de rango o no entero → inválido", () => {
  for (const bad of [1899, 2027, 2013.5, Number.NaN]) {
    assert.deepEqual(year(bad), { kind: "invalid", field: "birthYear", message: BIRTH_YEAR_INVALID }, String(bad));
  }
});

test("llegan ambos: manda birthDate (en los dos sentidos)", () => {
  // The year alone would pass; the date says 12.
  assert.equal(decideAge({ birthDate: "2013-12-31", birthYear: 1990 }, NOW).kind, "underage");
  // The year alone would block; the date says 13.
  assert.deepEqual(decideAge({ birthDate: "2013-10-01", birthYear: 2020 }, NOW), { kind: "ok", birthYear: 2013 });
  // The ambiguous year is resolved by the date.
  assert.equal(decideAge({ birthDate: "2013-01-15", birthYear: 2013 }, NOW).kind, "ok");
  // A bad date is NOT rescued by a good year.
  assert.equal(decideAge({ birthDate: "nope", birthYear: 1990 }, NOW).kind, "invalid");
});

test("ninguno de los dos → se pide la fecha", () => {
  assert.deepEqual(decideAge({}, NOW), { kind: "invalid", field: "birthDate", message: BIRTH_DATE_REQUIRED });
  assert.deepEqual(decideAge({ birthDate: null, birthYear: null }, NOW), {
    kind: "invalid",
    field: "birthDate",
    message: BIRTH_DATE_REQUIRED,
  });
});

test("ningún mensaje repite lo que se envió", () => {
  const sent = "2013-12-31";
  for (const d of [date(sent), date("2013-13-40"), year(2013)]) {
    assert.ok(!JSON.stringify(d).includes("12-31") && !JSON.stringify(d).includes("13-40"));
  }
});
