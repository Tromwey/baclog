import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CURSOR_LEAD,
  PAGED_SORTS,
  compareRows,
  cursorOf,
  decodeCollectionCursor,
  encodeCollectionCursor,
  isAfterCursor,
  isPagedSort,
  stateRank,
  type CursorRow,
  type PagedSort,
} from "./collection-cursor";

/** The collection every cursor here is cut from. */
const BL = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (ms: number) => new Date(Date.UTC(2026, 8, 1, 12, 0, 0, ms));

function row(n: number, over: Partial<CursorRow> = {}): CursorRow {
  return {
    id: id(n),
    position: null,
    addedAt: at(n),
    year: 2020,
    obsessed: false,
    verdict: null,
    status: "on_my_radar",
    ...over,
  };
}

/** A collection that exercises every key: unplaced and placed titles, ties
 *  inside one millisecond, null years, every state. */
const ROWS: CursorRow[] = [
  row(1),
  row(2, { addedAt: at(1) }), // same instant as #1: the id breaks the tie
  row(3, { year: null }),
  row(4, { position: 0, obsessed: true }),
  row(5, { position: 1, verdict: "liked", year: 1999 }),
  row(6, { position: 2, status: "completed", year: null }),
  row(7, { position: 2, addedAt: at(9), year: 2024 }), // same position (legacy data)
  row(8, { position: 3, obsessed: true, verdict: "liked", status: "completed", year: 2024 }),
  row(9, { verdict: "disliked", year: 0 }),
];

test("solo los órdenes con cursor estable se paginan (título no)", () => {
  assert.deepEqual([...PAGED_SORTS], ["manual", "recent", "state", "year"]);
  assert.equal(isPagedSort("title"), false);
  assert.equal(isPagedSort("manual"), true);
});

test("stateRank: obsesiona · gusta · completo · nada, en ese orden de precedencia", () => {
  assert.equal(stateRank({ obsessed: true, verdict: "liked", status: "completed" }), 0);
  assert.equal(stateRank({ obsessed: false, verdict: "liked", status: "completed" }), 1);
  assert.equal(stateRank({ obsessed: false, verdict: "disliked", status: "completed" }), 2);
  assert.equal(stateRank({ obsessed: false, verdict: null, status: "on_my_radar" }), 3);
});

for (const sort of PAGED_SORTS) {
  test(`${sort}: codificar y decodificar son inversos para cada fila`, () => {
    for (const r of ROWS) {
      const c = cursorOf(sort, r);
      assert.equal(c.lead.length, CURSOR_LEAD[sort].length);
      const back = decodeCollectionCursor(encodeCollectionCursor(c, BL), sort, BL);
      assert.ok(back, `no decodifica: ${encodeCollectionCursor(c, BL)}`);
      assert.deepEqual(back.lead, c.lead);
      assert.equal(back.at.getTime(), c.at.getTime());
      assert.equal(back.id, c.id);
    }
  });

  test(`${sort}: paginar con el cursor recorre la lista entera, sin saltos ni repetidos`, () => {
    const ordered = [...ROWS].sort((a, b) => compareRows(sort, a, b));
    // The order is total: no two rows compare equal.
    for (let i = 1; i < ordered.length; i++) {
      assert.ok(compareRows(sort, ordered[i - 1], ordered[i]) < 0);
    }
    for (const size of [1, 2, 4]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 50; guard++) {
        const after = cursor === null ? null : decodeCollectionCursor(cursor, sort, BL);
        if (cursor !== null) assert.ok(after);
        const rest = after ? ordered.filter((r) => isAfterCursor(after, r)) : ordered;
        const page = rest.slice(0, size);
        seen.push(...page.map((r) => r.id));
        if (rest.length <= size) break;
        cursor = encodeCollectionCursor(cursorOf(sort, page[page.length - 1]), BL);
      }
      assert.deepEqual(seen, ordered.map((r) => r.id), `página de ${size}`);
    }
  });

  test(`${sort}: un cursor de otro orden se rechaza`, () => {
    for (const other of PAGED_SORTS) {
      if (other === sort) continue;
      const foreign = encodeCollectionCursor(cursorOf(other, ROWS[4]), BL);
      assert.equal(decodeCollectionCursor(foreign, sort, BL), null);
    }
  });
}

test("manual: sin colocar va antes que colocado; dentro, lo más reciente primero", () => {
  const ordered = [...ROWS].sort((a, b) => compareRows("manual", a, b)).map((r) => r.id);
  assert.deepEqual(ordered, [9, 3, 2, 1, 4, 5, 7, 6, 8].map(id));
});

test("recientes: lo agregado en el mismo instante lee en el orden manual (una colección copiada)", () => {
  const copied = [3, 1, 2, 0].map((position, i) => row(20 + i, { position, addedAt: at(500) }));
  const unplaced = row(30, { addedAt: at(500) });
  const newer = row(31, { position: 9, addedAt: at(501) });
  const ordered = [...copied, unplaced, newer].sort((a, b) => compareRows("recent", a, b)).map((r) => r.id);
  assert.deepEqual(ordered, [31, 30, 23, 21, 22, 20].map(id));
});

test("año: descendente con los sin año al final", () => {
  const years = [...ROWS].sort((a, b) => compareRows("year", a, b)).map((r) => r.year);
  assert.deepEqual(years, [2024, 2024, 2020, 2020, 2020, 1999, 0, null, null]);
});

test("cursores forjados se rechazan (learning 2026-09-24: Date no valida)", () => {
  const good = encodeCollectionCursor(cursorOf("manual", ROWS[4]), BL);
  assert.ok(decodeCollectionCursor(good, "manual", BL));
  const uuid = id(1);
  const bad: [unknown, PagedSort][] = [
    [null, "manual"],
    [undefined, "manual"],
    [42, "manual"],
    ["", "manual"],
    ["manual", "manual"],
    [`manual~-~1|${uuid}~${BL}`, "manual"], // `new Date("1")` es 2001 para V8
    [`manual~-~2026|${uuid}~${BL}`, "manual"],
    [`manual~-~0000-01-01T00:00:00.000Z|${uuid}~${BL}`, "manual"], // año que Postgres rechaza
    [`manual~-~2026-02-30T00:00:00.000Z|${uuid}~${BL}`, "manual"], // día imposible
    [`manual~-~2026-09-01T12:00:00.000Z|x`, "manual"], // el id no es un uuid
    [`manual~-~2026-09-01T12:00:00.000Z|${uuid}' or 1=1--~${BL}`, "manual"],
    [`manual~~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "manual"], // falta la posición
    [`manual~1,2~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "manual"], // sobra una llave
    [`manual~-1~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "manual"],
    [`manual~1.5~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "manual"],
    [`manual~007~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "manual"],
    [`manual~1e3~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "manual"],
    [`manual~99999999999~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "manual"],
    [`recent~~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "recent"], // recientes lleva la posición (desempate)
    [`state~-,0~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "state"], // el rango nunca es null
    [`state~4,0~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "state"], // rango fuera de 0..3
    [`year~10000,-~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "year"],
    [`title~~2026-09-01T12:00:00.000Z|${uuid}~${BL}`, "manual"],
    [`manual~-~2026-09-01T12:00:00.000Z|${uuid}~extra~${BL}`, "manual"],
    ["x".repeat(500), "manual"],
    [`manual~-~2026-09-01T12:00:00.000Z|${uuid}`, "manual"], // sin colección
    [`manual~-~2026-09-01T12:00:00.000Z|${uuid}~`, "manual"],
    [`manual~-~2026-09-01T12:00:00.000Z|${uuid}~22222222-2222-4222-8222-222222222222`, "manual"], // de otra colección
  ];
  for (const [raw, sort] of bad) {
    assert.equal(decodeCollectionCursor(raw, sort, BL), null, `debió rechazar ${String(raw)}`);
  }
});
