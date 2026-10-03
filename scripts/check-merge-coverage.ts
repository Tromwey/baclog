/**
 * Guardrail for phase 4g (account merge): every table that references a user
 * — by FK to `user`, by a `*user_id` column, or by storing an email/handle as
 * text — must have an explicit entry in `MERGE_COVERAGE`
 * (`src/modules/account/merge-coverage.ts`, re-exported by `merge.ts`): move,
 * merge, cascade or scrub. A new table that points at `user` and is missing
 * there would otherwise be silently left to the FK's `on delete` when a
 * source account is absorbed — data lost (cascade) or orphaned (set null)
 * without anyone having decided it.
 *
 * Also checks: no stale entries (a table that no longer exists), every
 * `move`/`merge` table is actually named in merge.ts' SQL, every `scrub`
 * table in scrub.ts, and the pure "more advanced status" rule.
 *
 * Pure — no DB, no server: `pnpm tsx scripts/check-merge-coverage.ts`.
 * Exits 1 on any failure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema";
import {
  MERGE_COVERAGE,
  STATUS_RANK,
  mergedStatus,
} from "../src/modules/account/merge-coverage";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}

/** Columns that carry a person's identity as plain text (no FK). */
const IDENTITY_TEXT_COLUMNS = new Set(["email", "username", "target_username", "identifier"]);
const USER_ID_COLUMN = /(^|_)user_id$/;

const usersTableName = getTableConfig(schema.users).name;

const tables = Object.entries(schema)
  .filter(([, v]) => is(v, PgTable))
  .map(([exportName, t]) => ({ exportName, config: getTableConfig(t as PgTable) }));

const userReferencing = new Map<string, string[]>();
for (const { config } of tables) {
  const why: string[] = [];
  if (config.name === usersTableName) why.push("es la tabla de usuarios");
  for (const fk of config.foreignKeys) {
    const ref = fk.reference();
    if (getTableConfig(ref.foreignTable).name === usersTableName) {
      why.push(`FK ${ref.columns.map((c) => c.name).join(",")} → user`);
    }
  }
  for (const col of config.columns) {
    if (USER_ID_COLUMN.test(col.name)) why.push(`columna ${col.name}`);
    if (IDENTITY_TEXT_COLUMNS.has(col.name)) why.push(`texto de identidad ${col.name}`);
  }
  if (why.length > 0) userReferencing.set(config.name, why);
}

const mergeSrc = readFileSync(resolve("src/modules/account/merge.ts"), "utf8");
const scrubSrc = readFileSync(resolve("src/modules/account/scrub.ts"), "utf8");
const exportNameOf = new Map(tables.map((t) => [t.config.name, t.exportName]));

check("el esquema se leyó (hay tablas y la de usuarios está)", () => {
  assert.ok(tables.length > 10, `solo ${tables.length} tablas: ¿cambió la forma de schema.ts?`);
  assert.ok(userReferencing.has(usersTableName));
});

for (const [table, why] of [...userReferencing].sort()) {
  check(`${table} está en MERGE_COVERAGE (${why.join("; ")})`, () => {
    const entry = MERGE_COVERAGE[table];
    assert.ok(
      entry,
      `la tabla "${table}" referencia a un usuario y no está en MERGE_COVERAGE (src/modules/account/merge-coverage.ts): decide move/merge/cascade/scrub, impleméntalo en merge.ts y anótalo`,
    );
    assert.ok(entry.actions.length > 0, "sin acciones");
    assert.ok(entry.note.trim().length > 0, "sin nota");
  });
}

check("MERGE_COVERAGE no tiene tablas que ya no existen o que no referencian usuarios", () => {
  const stale = Object.keys(MERGE_COVERAGE).filter((t) => !userReferencing.has(t));
  assert.deepEqual(stale, [], `entradas sobrantes: ${stale.join(", ")}`);
});

for (const [table, entry] of Object.entries(MERGE_COVERAGE).sort()) {
  if (entry.actions.includes("move") || entry.actions.includes("merge")) {
    check(`${table} (${entry.actions.join("+")}) aparece en el SQL de merge.ts`, () => {
      assert.ok(mergeSrc.includes(`"${table}"`), `merge.ts no nombra "${table}"`);
    });
  }
  if (entry.actions.includes("scrub")) {
    check(`${table} (scrub) aparece en scrub.ts`, () => {
      const exportName = exportNameOf.get(table);
      assert.ok(exportName && scrubSrc.includes(exportName), `scrub.ts no usa ${exportName ?? table}`);
    });
  }
  if (entry.actions.includes("identity")) {
    check(`${table} (identity) se borra al final de merge.ts`, () => {
      assert.ok(/db\.delete\(users\)\.where\(eq\(users\.id, sourceId\)\)/.test(mergeSrc));
      assert.ok(mergeSrc.includes("...identityScrubStatements(sourceId)"));
      assert.ok(
        mergeSrc.indexOf("...identityScrubStatements(sourceId)") <
          mergeSrc.indexOf("db.delete(users).where(eq(users.id, sourceId))"),
        "las limpiezas de identidad deben ir ANTES de borrar el user (leen el correo por subconsulta)",
      );
    });
  }
}

// A table that is only MOVED (re-keyed O → D, no collision handling) can
// still collide if a UNIQUE index includes the user column: both accounts
// may hold "the one row per user". It happened with
// `backlog_one_pinned_per_user` (partial unique on backlog.user_id): two
// accounts with a pinned collection each aborted the whole merge with 23505.
// So every such index must be NAMED in merge.ts next to the statement that
// resolves the collision. (`merge` tables declare collision handling by
// definition; `cascade`/`scrub` rows never change owner.)
for (const { config } of tables) {
  const entry = MERGE_COVERAGE[config.name];
  if (!entry || !entry.actions.includes("move") || entry.actions.includes("merge")) continue;
  const uniques: { name: string; columns: string[] }[] = [
    ...config.indexes
      .filter((i) => i.config.unique)
      .map((i) => ({
        name: i.config.name ?? "(sin nombre)",
        columns: i.config.columns.map((c) => ("name" in c ? String(c.name) : "")),
      })),
    ...config.primaryKeys.map((p) => ({ name: p.getName(), columns: p.columns.map((c) => c.name) })),
    ...config.uniqueConstraints.map((u) => ({
      name: u.name ?? "(sin nombre)",
      columns: u.columns.map((c) => c.name),
    })),
    ...config.columns
      .filter((c) => c.isUnique || c.primary)
      .map((c) => ({ name: c.uniqueName ?? `${config.name}.${c.name}`, columns: [c.name] })),
  ];
  for (const u of uniques) {
    if (!u.columns.some((c) => USER_ID_COLUMN.test(c))) continue;
    check(`${config.name} (move): el único ${u.name} (${u.columns.join(",")}) está resuelto en merge.ts`, () => {
      assert.ok(
        mergeSrc.includes(u.name),
        `"${config.name}" se MUEVE al destino y su índice único ${u.name} incluye la columna de usuario: dos cuentas con una fila cada una chocan (23505) y abortan la fusión. Resuelve el choque ANTES del move en merge.ts y nombra el índice ahí`,
      );
    });
  }
}

check("orden de estado: on_my_radar < in_progress (= custom) < completed; empate gana el destino", () => {
  assert.ok(STATUS_RANK.on_my_radar < STATUS_RANK.in_progress);
  assert.ok(STATUS_RANK.in_progress < STATUS_RANK.completed);
  assert.equal(STATUS_RANK.custom, STATUS_RANK.in_progress);
  assert.deepEqual(
    Object.keys(STATUS_RANK).sort(),
    [...schema.itemStatusEnum.enumValues].sort(),
    "STATUS_RANK debe cubrir exactamente item_status",
  );
  assert.equal(mergedStatus("on_my_radar", "completed"), "source");
  assert.equal(mergedStatus("completed", "in_progress"), "destination");
  assert.equal(mergedStatus("in_progress", "in_progress"), "destination");
  assert.equal(mergedStatus("custom", "in_progress"), "destination");
});

console.log(failures === 0 ? "\ncheck-merge-coverage ok" : `\n${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
