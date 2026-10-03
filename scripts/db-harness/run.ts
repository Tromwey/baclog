/**
 * DB harness — the real modules and the real cron route handlers against a
 * throwaway LOCAL Postgres (never the shared database: see db.ts).
 *
 *   initdb -D /tmp/kura-pg -U postgres -A trust
 *   LC_ALL=en_US.UTF-8 pg_ctl -D /tmp/kura-pg -o "-p 54399 -k /tmp -c timezone=UTC" start
 *   createdb -h 127.0.0.1 -p 54399 -U postgres kura
 *   for f in drizzle/0*.sql; do psql -h 127.0.0.1 -p 54399 -U postgres -d kura -v ON_ERROR_STOP=1 -q -f "$f"; done
 *   pnpm test:db          # HARNESS_DATABASE_URL overrides the default URL
 *
 * How it works: `tsconfig.json` here remaps `@/db` to db.ts (node-postgres,
 * `batch` = BEGIN/COMMIT on the single pooled connection, like neon-http's
 * one-transaction batch) and `@/auth/mailer` to mailer.ts (records sends,
 * throws for addresses starting with "fail"). Everything else is the code
 * that ships. It TRUNCATEs `user` and `catalog_item` (cascade) at the start.
 *
 * Covers what no pure check can: the membership batch + GC, the atomic and
 * idempotent collection copy, the merge with two pinned collections, the
 * palette validation at the write point, and both crons end to end (bearer,
 * claim → send → release, stale claims, the retry on the next run), the
 * add/remove serialization on a title (a SECOND connection plays the other
 * writer), what deleting a collection keeps, the Torre's recap check, and —
 * with `fetch` stubbed, never the network — the link cache (an upstream that
 * didn't answer is not cached), the link graph's 15-minute backoff, the
 * TIDAL token refresh under concurrency (only `invalid_grant` drops a link;
 * the shared refresh keeps its own deadline), a hung ISRC lookup that the
 * title search outlives,
 * the app token's 401 retry, and the real TIDAL step/start over a party in
 * the DB: an app-token 400 is a 503, the step's time budget (two cases wait
 * out a 6 s timeout — ~12 s of wall clock), two starts on a deleted playlist.
 *
 * `timezone=UTC` matters: the app stores UTC in `timestamp` columns and the
 * fixtures below write `now()` — a server in another zone makes the recap
 * month disagree with the JS side around midnight.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import pg from "pg";
import { db, pool } from "./db";
import { sentTo } from "./mailer";
import { addTitleToBacklog, removeTitleFromBacklog, removeTitleFromLibrary, saveCollectionCopy, collectionCopyId } from "@/modules/backlog/membership";
import { deleteBacklog } from "@/modules/backlog/collections";
import { previousMonthKey } from "@/modules/backlog/recap";
import { mergeAccounts } from "@/modules/account/merge";
import { fillCatalogPalette } from "@/modules/catalog/cache";
import { clearVerdict, getOwnTitleState, setMark, setObsessed } from "@/modules/backlog/state";
import { saveReview } from "@/modules/reviews/write";
import { completeOnboarding } from "@/modules/account/onboarding";
import { loadUserById } from "@/auth/user-row";
import { apiContext } from "@/authz/api-context";
import { getCollectionAllAction, getCollectionPageAction } from "@/app/actions/collection-page-actions";
import { COLLECTION_PAGE_SIZE, PAGED_SORTS, stateRank, type PagedSort } from "@/modules/backlog/collection-cursor";
import { getBacklogItems, getBacklogItemsPage, getBacklogKindCounts } from "@/modules/backlog/queries";

const q = async <T = Record<string, unknown>>(s: ReturnType<typeof sql>) => (await db.execute(s)).rows as T[];
const one = async (s: ReturnType<typeof sql>) => Number(((await q(s))[0] as { n: number }).n);
let n = 0;
const ok = (name: string) => console.log(`ok ${++n} ${name}`);

async function main() {
  await db.execute(sql`truncate "user", catalog_item cascade`);
  for (const u of ["a", "b", "c", "d", "e", "o", "dd"]) {
    await db.execute(sql`insert into "user" (id, email, username, name, is_public) values (${u}, ${(u === "b" ? "fail-" : "") + u + "@x.test"}, ${"user_" + u}, ${"U " + u}, true)`);
  }
  const cat = async (id: string, media: string, release: string | null) =>
    db.execute(sql`insert into catalog_item (id, source, external_id, media_type, title, release_date) values (${id}, 'tmdb', ${id}, ${media}::media_type, ${"T " + id}, ${release}::timestamp)`);
  const X = "00000000-0000-4000-8000-000000000001", Y = "00000000-0000-4000-8000-000000000002", Z = "00000000-0000-4000-8000-000000000003", S = "00000000-0000-4000-8000-000000000004";
  await cat(X, "film", null); await cat(Y, "series", null); await cat(Z, "album", null); await cat(S, "track", null);
  const bl = async (id: string, user: string, pub = true, pinned = false) =>
    db.execute(sql`insert into backlog (id, user_id, name, is_public, show_on_profile, pinned_at) values (${id}, ${user}, ${"B " + id}, ${pub}, ${pub}, ${pinned ? sql`now()` : sql`null`})`);
  await bl("b1", "a"); await bl("b2", "a"); await bl("bb", "b");

  // ---- addTitleToBacklog (single probe)
  assert.deepEqual(await addTitleToBacklog("a", "bb", X), { ok: false, error: "backlog_not_found" });
  assert.deepEqual(await addTitleToBacklog("a", "b1", "00000000-0000-4000-8000-0000000000ff"), { ok: false, error: "title_not_found" });
  assert.deepEqual(await addTitleToBacklog("a", "b1", S), { ok: false, error: "title_not_found" });
  const add1 = await addTitleToBacklog("a", "b1", X, ["#112233"]);
  assert.ok(add1.ok);
  const add1b = await addTitleToBacklog("a", "b1", X);
  assert.ok(add1b.ok && add1.ok && add1b.membershipId === add1.membershipId && add1b.userItemId === add1.userItemId);
  assert.ok((await addTitleToBacklog("a", "b2", X)).ok);
  ok("addTitleToBacklog: ajeno/desconocido/canción rechazados, idempotente");

  // ---- palette validated at the write point
  await fillCatalogPalette(Y, ["javascript:alert(1)"]);
  await fillCatalogPalette(Z, ["#aabbcc", "#ddeeff"]);
  assert.equal((await q(sql`select palette_hex from catalog_item where id = ${Y}`))[0].palette_hex, null);
  assert.deepEqual((await q(sql`select palette_hex from catalog_item where id = ${Z}`))[0].palette_hex, ["#aabbcc", "#ddeeff"]);
  assert.deepEqual((await q(sql`select palette_hex from catalog_item where id = ${X}`))[0].palette_hex, ["#112233"]);
  ok("fillCatalogPalette: inválida descartada, válida escrita");

  // ---- removeTitleFromBacklog
  await db.execute(sql`insert into item_review (id, user_id, catalog_item_id, body) values ('r1', 'a', ${X}, 'hola')`);
  await removeTitleFromBacklog("a", "b1", X);
  assert.equal(await one(sql`select count(*) n from user_item where user_id='a' and catalog_item_id=${X}`), 1);
  assert.equal(await one(sql`select count(*) n from item_review where user_id='a'`), 1);
  ok("quitar de UNA colección con otra membresía: estado y reseña se quedan");
  await removeTitleFromBacklog("a", "b2", X);
  assert.equal(await one(sql`select count(*) n from backlog_item where user_id='a'`), 0);
  assert.equal(await one(sql`select count(*) n from user_item where user_id='a'`), 0);
  assert.equal(await one(sql`select count(*) n from item_review where user_id='a'`), 0);
  await removeTitleFromBacklog("a", "b2", X); // retry = no-op
  ok("quitar la última membresía: GC de user_item + reseña en el mismo batch; repetir es no-op");
  await addTitleToBacklog("a", "b1", X); await addTitleToBacklog("a", "b2", X);
  await db.execute(sql`insert into item_review (id, user_id, catalog_item_id, body) values ('r2', 'a', ${X}, 'hola')`);
  await addTitleToBacklog("b", "bb", X);
  await removeTitleFromLibrary("a", X);
  assert.equal(await one(sql`select count(*) n from backlog_item where user_id='a'`) + await one(sql`select count(*) n from user_item where user_id='a'`) + await one(sql`select count(*) n from item_review where user_id='a'`), 0);
  assert.equal(await one(sql`select count(*) n from user_item where user_id='b'`), 1);
  ok("removeTitleFromLibrary: todo lo propio, nada ajeno");

  // ---- add vs. remove of the same title: serialized on titleStateLock.
  // `other` is a second connection playing the concurrent writer, with the
  // same statements the module runs; the module call must WAIT for it.
  const other = new pg.Client({ connectionString: pool.options.connectionString });
  await other.connect();
  const lockSql = "select pg_advisory_xact_lock(hashtextextended($1, 0))";
  const lockKey = `kura:user_item:a:${X}`;
  const settled = async (p: Promise<unknown>, ms: number) => {
    let done = false;
    void p.then(() => { done = true; }, () => { done = true; });
    await new Promise((r) => setTimeout(r, ms));
    return done;
  };
  assert.ok((await addTitleToBacklog("a", "b1", X)).ok);
  // (a) an ADD to b2 in flight (uncommitted) while the module removes b1,
  //     the title's only committed membership.
  await other.query("begin");
  await other.query(lockSql, [lockKey]);
  await other.query(`insert into user_item (id, user_id, catalog_item_id) values ('ui-race', 'a', $1) on conflict (user_id, catalog_item_id) do nothing`, [X]);
  await other.query(`insert into backlog_item (id, backlog_id, user_id, catalog_item_id) values ('bi-race', 'b2', 'a', $1)`, [X]);
  const removing = removeTitleFromBacklog("a", "b1", X);
  assert.equal(await settled(removing, 400), false, "el quitar debe esperar al add en vuelo");
  await other.query("commit");
  await removing;
  assert.equal(await one(sql`select count(*) n from user_item where user_id='a' and catalog_item_id=${X}`), 1);
  assert.deepEqual((await q(sql`select backlog_id from backlog_item where user_id='a' and catalog_item_id=${X}`)).map((r) => r.backlog_id), ["b2"]);
  ok("add en vuelo + quitar la última OTRA membresía: el quitar espera y NO borra el user_item (sin membresía huérfana de estado)");
  // (b) a REMOVE of the last membership in flight while the module adds to b1.
  await other.query("begin");
  await other.query(lockSql, [lockKey]);
  await other.query(`delete from backlog_item where user_id = 'a' and backlog_id = 'b2' and catalog_item_id = $1`, [X]);
  await other.query(`delete from user_item where user_id = 'a' and catalog_item_id = $1 and not exists (select 1 from backlog_item where user_id = 'a' and catalog_item_id = $1)`, [X]);
  const adding = addTitleToBacklog("a", "b1", X);
  assert.equal(await settled(adding, 400), false, "el add debe esperar al quitar en vuelo");
  await other.query("commit");
  const added = await adding;
  assert.ok(added.ok);
  const stateRows = await q<{ id: string }>(sql`select id from user_item where user_id='a' and catalog_item_id=${X}`);
  assert.deepEqual(stateRows.map((r) => r.id), [added.ok ? added.userItemId : ""]);
  assert.equal(await one(sql`select count(*) n from backlog_item bi where bi.user_id='a' and not exists (select 1 from user_item ui where ui.user_id = bi.user_id and ui.catalog_item_id = bi.catalog_item_id)`), 0);
  await other.end();
  ok("quitar en vuelo + add: el add espera y deja estado + membresía juntos (id devuelto = fila real)");

  // ---- the review goes with the reaction (founder, 2026-10-01): an
  // item_review exists only while `obsessed OR verdict IS NOT NULL`, and the
  // write that turns the last one off deletes it in the SAME transaction.
  // Own user + collections, removed at the end (later sections count rows).
  await db.execute(sql`insert into "user" (id, email, username, name, is_public, birth_year) values ('rv', 'rv@x.test', 'user_rv', 'U rv', true, 1990)`);
  await bl("r1", "rv"); await bl("r2", "rv");
  const reviewsOf = () => one(sql`select count(*) n from item_review where user_id='rv' and catalog_item_id=${Y}`);
  const reaction = async () => (await q<{ status: string; verdict: string | null; obsessed: boolean }>(sql`select status, verdict, obsessed from user_item where user_id='rv' and catalog_item_id=${Y}`))[0];
  const write = () => saveReview("rv", Y, { body: "qué buena", hasSpoiler: false });
  assert.ok((await addTitleToBacklog("rv", "r1", Y)).ok); assert.ok((await addTitleToBacklog("rv", "r2", Y)).ok);
  assert.deepEqual(await write(), { error: "locked" });
  assert.equal(await reviewsOf(), 0);
  ok("reseña sin reacción: locked, y no queda fila");
  assert.deepEqual(await setMark("rv", Y, "liked"), { ok: true, reviewDeleted: false });
  const saved = await write();
  assert.ok("ok" in saved);
  const reviewId = "ok" in saved ? saved.id : "";
  await db.execute(sql`insert into report (id, reporter_user_id, target_user_id, target_review_id, reason) values ('rep1', 'a', 'rv', ${reviewId}, 'spam')`);
  assert.deepEqual(await setMark("rv", Y, "obsessed"), { ok: true, reviewDeleted: false });
  assert.deepEqual(await reaction(), { status: "completed", verdict: "liked", obsessed: true });
  assert.deepEqual(await setMark("rv", Y, "liked"), { ok: true, reviewDeleted: false });
  assert.deepEqual(await reaction(), { status: "completed", verdict: "liked", obsessed: false });
  assert.equal((await getOwnTitleState("rv", Y))?.reviewId, reviewId);
  assert.equal(await one(sql`select count(*) n from report where id='rep1'`), 1);
  ok("Me gusta → Me obsesiona → Me gusta: la reseña (y su reporte) NO se borran");
  await removeTitleFromBacklog("rv", "r1", Y);
  assert.equal(await reviewsOf(), 1);
  assert.deepEqual(await setMark("rv", Y, "completed"), { ok: true, reviewDeleted: true });
  assert.deepEqual(await reaction(), { status: "completed", verdict: null, obsessed: false });
  assert.equal(await reviewsOf(), 0);
  assert.equal(await one(sql`select count(*) n from report where id='rep1'`), 0);
  assert.equal((await getOwnTitleState("rv", Y))?.reviewId, null);
  assert.equal(await one(sql`select count(*) n from backlog_item where user_id='rv' and catalog_item_id=${Y}`), 1);
  assert.deepEqual(await setMark("rv", Y, "completed"), { ok: true, reviewDeleted: false }); // retry
  assert.deepEqual(await write(), { error: "locked" });
  ok("título en dos colecciones: quitar UNA no borra; Completo sin reacción borra reseña + reporte, deja estado y membresía; TitleState.reviewId = null; repetir = no-op");
  // The web's per-axis writes: one axis off keeps it, the last one deletes.
  await setMark("rv", Y, "liked"); await setObsessed("rv", Y, true);
  assert.ok("ok" in (await write()));
  assert.deepEqual(await setObsessed("rv", Y, false), { reviewDeleted: false });
  assert.equal(await reviewsOf(), 1);
  assert.deepEqual(await clearVerdict("rv", Y), { reviewDeleted: true });
  assert.equal(await reviewsOf(), 0);
  await setObsessed("rv", Y, true);
  assert.ok("ok" in (await write()));
  assert.deepEqual(await clearVerdict("rv", Y), { reviewDeleted: false }); // no verdict to clear, still obsessed
  assert.equal(await reviewsOf(), 1);
  assert.deepEqual(await setObsessed("rv", Y, false), { reviewDeleted: true });
  assert.equal(await reviewsOf(), 0);
  ok("web por eje: quitar un eje con el otro encendido conserva; quitar el último (veredicto u obsesión) borra");
  await db.execute(sql`update user_item set verdict = 'disliked' where user_id='rv' and catalog_item_id=${Y}`);
  assert.ok("ok" in (await write()));
  assert.deepEqual(await setMark("rv", Y, null), { ok: true, reviewDeleted: true });
  assert.deepEqual(await reaction(), { status: "on_my_radar", verdict: null, obsessed: false });
  assert.equal(await reviewsOf(), 0);
  // Another user's review of the same title is never touched.
  await addTitleToBacklog("a", "b1", Y);
  await db.execute(sql`update user_item set obsessed = true, obsessed_at = now() where user_id='a' and catalog_item_id=${Y}`);
  assert.ok("ok" in (await saveReview("a", Y, { body: "mía", hasSpoiler: false })));
  await setMark("rv", Y, "liked"); assert.ok("ok" in (await write()));
  assert.deepEqual(await setMark("rv", Y, null), { ok: true, reviewDeleted: true });
  assert.equal(await one(sql`select count(*) n from item_review where user_id='a' and catalog_item_id=${Y}`), 1);
  ok("quitar la marca con un No me gusta borra la reseña; la reseña AJENA del mismo título no se toca");
  // Same transaction, behind titleStateLock: a second connection holds the
  // pair's lock; the module's write must wait, and until it runs NEITHER the
  // reaction nor the review has changed (no window with one and not the other).
  await setMark("rv", Y, "obsessed"); assert.ok("ok" in (await write()));
  const peer = new pg.Client({ connectionString: pool.options.connectionString });
  await peer.connect();
  const rvKey = `kura:user_item:rv:${Y}`;
  await peer.query("begin"); await peer.query(lockSql, [rvKey]);
  const clearing = setMark("rv", Y, "completed");
  assert.equal(await settled(clearing, 400), false, "quitar la reacción debe esperar el lock del par");
  assert.deepEqual((await peer.query(`select ui.obsessed, (select count(*)::int from item_review r where r.user_id = ui.user_id and r.catalog_item_id = ui.catalog_item_id) as reviews from user_item ui where ui.user_id = 'rv' and ui.catalog_item_id = $1`, [Y])).rows, [{ obsessed: true, reviews: 1 }]);
  await peer.query("commit");
  assert.deepEqual(await clearing, { ok: true, reviewDeleted: true });
  assert.equal(await reviewsOf(), 0);
  ok("quitar reacción espera el titleStateLock y aplica estado + borrado juntos (mismo batch)");
  // A "quitar reacción" in flight (uncommitted) while the module SAVES a
  // review: the save's own read still sees the reaction, so only the sweep
  // inside its batch can stop the orphan.
  await setMark("rv", Y, "liked");
  await peer.query("begin"); await peer.query(lockSql, [rvKey]);
  await peer.query(`update user_item set verdict = null, obsessed = false where user_id = 'rv' and catalog_item_id = $1`, [Y]);
  const saving = write();
  assert.equal(await settled(saving, 400), false, "guardar la reseña debe esperar el lock del par");
  await peer.query("commit");
  assert.deepEqual(await saving, { error: "locked" });
  assert.equal(await reviewsOf(), 0);
  await peer.end();
  assert.equal(await one(sql`select count(*) n from item_review r where not exists (select 1 from user_item ui where ui.user_id = r.user_id and ui.catalog_item_id = r.catalog_item_id and (ui.obsessed or ui.verdict is not null))`), 0);
  ok("quitar reacción en vuelo + guardar reseña: la reseña NO queda huérfana (locked); invariante global = 0 reseñas sin reacción");
  await removeTitleFromLibrary("a", Y);
  await db.execute(sql`delete from "user" where id = 'rv'`);

  // ---- F2.2 exact age gate (founder, 2026-10-01): the full date decides,
  // only the YEAR is stored. Own users, removed at the end.
  {
    // "Today" for the gate is the most advanced date on Earth (UTC+14,
    // `latestToday` in account/age.ts) — a plain UTC today fails this case
    // 14 hours a day.
    const today = new Date(Date.now() + 14 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const y13 = today.getUTCFullYear() - 13;
    const thirteenToday = new Date(Date.UTC(y13, today.getUTCMonth(), today.getUTCDate()));
    const thirteenTomorrow = new Date(thirteenToday.getTime() + 86_400_000);
    for (const u of ["g1", "g2", "g3", "g4"]) await db.execute(sql`insert into "user" (id, email) values (${u}, ${u + "@x.test"})`);
    const row = async (id: string) => (await q<{ name: string | null; birth_year: number | null; is_minor: boolean }>(sql`select name, birth_year, is_minor from "user" where id = ${id}`))[0];
    assert.deepEqual(await completeOnboarding("g1", { name: "Trece", birthDate: iso(thirteenToday) }), { ok: true });
    assert.deepEqual(await row("g1"), { name: "Trece", birth_year: thirteenToday.getUTCFullYear(), is_minor: false });
    assert.deepEqual(await completeOnboarding("g2", { name: "Doce", birthDate: iso(thirteenTomorrow) }), { ok: false, error: "underage" });
    assert.deepEqual(await row("g2"), { name: null, birth_year: thirteenTomorrow.getUTCFullYear(), is_minor: true });
    const ambiguous = await completeOnboarding("g3", { name: "Legado", birthYear: y13 });
    assert.ok(!ambiguous.ok && ambiguous.error === "invalid_birth" && ambiguous.field === "birthYear");
    assert.deepEqual(await row("g3"), { name: null, birth_year: null, is_minor: false });
    assert.deepEqual(await completeOnboarding("g3", { name: "Legado", birthYear: y13 - 1 }), { ok: true });
    assert.deepEqual(await completeOnboarding("g4", { name: "Peque", birthYear: y13 + 1 }), { ok: false, error: "underage" });
    const bad = await completeOnboarding("g1", { birthDate: "2013-02-30" });
    assert.ok(!bad.ok && bad.error === "invalid_birth" && bad.field === "birthDate");
    assert.equal(await one(sql`select count(*) n from information_schema.columns where table_name = 'user' and column_name like 'birth%'`), 1);
    await db.execute(sql`delete from "user" where id in ('g1', 'g2', 'g3', 'g4')`);
    ok("gate de edad exacto: cumple 13 hoy pasa, mañana = menor (bloqueada), año legado ambiguo no escribe ni bloquea, solo se guarda birth_year");
  }

  // ---- deleteBacklog: founder's rule (ios/API.md §7.7) — the per-title
  // state and the review of a title that lived only there are KEPT.
  await bl("bdel", "a");
  assert.ok((await addTitleToBacklog("a", "bdel", Y)).ok);
  await db.execute(sql`insert into item_review (id, user_id, catalog_item_id, body) values ('r-del', 'a', ${Y}, 'hola')`);
  assert.equal(await deleteBacklog("b", "bdel"), false);
  assert.equal(await deleteBacklog("a", "bdel"), true);
  assert.equal(await one(sql`select count(*) n from backlog_item where user_id='a' and catalog_item_id=${Y}`), 0);
  assert.equal(await one(sql`select count(*) n from user_item where user_id='a' and catalog_item_id=${Y}`), 1);
  assert.equal(await one(sql`select count(*) n from item_review where id='r-del'`), 1);
  await removeTitleFromLibrary("a", Y);
  await removeTitleFromLibrary("a", X);
  ok("deleteBacklog: ajena = false; la propia cascadea membresías y CONSERVA estado + reseña (regla del founder)");

  // ---- deleteBacklog({ purge: true }) (founder, 2026-10-01: "borrar todo o
  // conservarlo"): a title that lived ONLY there loses state + review (+ its
  // reports, by FK); one that is also in another collection is not touched.
  {
    await bl("bpurge", "a"); await bl("bkeep", "a");
    assert.ok((await addTitleToBacklog("a", "bpurge", Y)).ok);
    assert.ok((await addTitleToBacklog("a", "bpurge", X)).ok);
    assert.ok((await addTitleToBacklog("a", "bkeep", X)).ok);
    await db.execute(sql`insert into item_review (id, user_id, catalog_item_id, body) values ('r-p-y', 'a', ${Y}, 'solo aquí'), ('r-p-x', 'a', ${X}, 'en dos')`);
    await db.execute(sql`insert into report (id, reporter_user_id, target_user_id, target_review_id, reason) values ('rep-p-y', 'c', 'a', 'r-p-y', 'spam'), ('rep-p-x', 'c', 'a', 'r-p-x', 'spam')`);
    const othersBefore = await one(sql`select count(*) n from user_item where user_id <> 'a'`);
    assert.equal(await deleteBacklog("b", "bpurge", { purge: true }), false);
    assert.equal(await one(sql`select count(*) n from user_item where user_id='a' and catalog_item_id in (${X}, ${Y})`), 2);
    assert.equal(await deleteBacklog("a", "bpurge", { purge: true }), true);
    assert.equal(await one(sql`select count(*) n from backlog where id='bpurge'`), 0);
    assert.equal(await one(sql`select count(*) n from user_item where user_id='a' and catalog_item_id=${Y}`), 0);
    assert.equal(await one(sql`select count(*) n from item_review where id='r-p-y'`), 0);
    assert.equal(await one(sql`select count(*) n from report where id='rep-p-y'`), 0);
    assert.equal(await one(sql`select count(*) n from backlog_item where user_id='a' and catalog_item_id=${X}`), 1);
    assert.equal(await one(sql`select count(*) n from user_item where user_id='a' and catalog_item_id=${X}`), 1);
    assert.equal(await one(sql`select count(*) n from item_review where id='r-p-x'`), 1);
    assert.equal(await one(sql`select count(*) n from report where id='rep-p-x'`), 1);
    assert.equal(await one(sql`select count(*) n from user_item where user_id <> 'a'`), othersBefore);
    assert.equal(await deleteBacklog("a", "bpurge", { purge: true }), false); // retry
    // An empty collection purges nothing and still goes away.
    await bl("bempty", "a");
    assert.equal(await deleteBacklog("a", "bempty", { purge: true }), true);
    assert.equal(await deleteBacklog("a", "bkeep", { purge: true }), true);
    assert.equal(await one(sql`select count(*) n from user_item where user_id='a' and catalog_item_id=${X}`), 0);
    assert.equal(await one(sql`select count(*) n from report where id='rep-p-x'`), 0);
    ok("deleteBacklog purge: ajena = false sin tocar nada; borra estado + reseña + reporte de lo que solo estaba ahí, conserva lo que sigue en otra colección y lo de otros usuarios; repetir = false");
  }

  // ---- saveCollectionCopy: atomic + idempotent
  await db.execute(sql`insert into user_item (id, user_id, catalog_item_id, status) values ('ui-c-y', 'c', ${Y}, 'completed')`);
  const src = { backlogId: "bb", name: "Fuente", vibe: null, catalogItemIds: [Z, Y, X, S, "nope"], coverCatalogItemId: Y };
  const [c1, c2] = await Promise.all([saveCollectionCopy("c", src), saveCollectionCopy("c", src)]);
  assert.equal(c1.id, c2.id); assert.equal(c1.id, collectionCopyId("c", "bb"));
  assert.match(c1.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(await one(sql`select count(*) n from backlog where user_id='c'`), 1);
  const copy = (await q(sql`select is_public, show_on_profile, cover_catalog_item_id, name from backlog where id=${c1.id}`))[0];
  assert.deepEqual(copy, { is_public: false, show_on_profile: false, cover_catalog_item_id: Y, name: "Fuente" });
  const members = await q<{ catalog_item_id: string; position: number }>(sql`select catalog_item_id, position from backlog_item where backlog_id=${c1.id} order by position`);
  assert.deepEqual(members.map((m) => m.catalog_item_id), [Z, Y, X]);
  assert.equal(await one(sql`select count(*) n from user_item where user_id='c'`), 3);
  assert.equal((await q(sql`select status from user_item where id='ui-c-y'`))[0].status, "completed");
  await removeTitleFromBacklog("c", c1.id, Z);
  await saveCollectionCopy("c", src);
  assert.equal(await one(sql`select count(*) n from backlog_item where backlog_id=${c1.id}`), 2);
  ok("saveCollectionCopy: doble tap = 1 copia, orden/portada/privada, estado previo intacto, canción fuera, re-guardar no re-agrega");

  // ---- merge: both pinned
  await bl("po", "o", true, true); await bl("pd", "dd", true, true); await bl("po2", "o");
  await mergeAccounts("dd", "o");
  const pins = await q<{ id: string }>(sql`select id from backlog where user_id='dd' and pinned_at is not null`);
  assert.deepEqual(pins.map((p) => p.id), ["pd"]);
  assert.equal(await one(sql`select count(*) n from backlog where user_id='dd'`), 3);
  ok("mergeAccounts con las dos cuentas fijadas: no aborta, gana el pin del destino");
  await db.execute(sql`insert into "user" (id, email, username, name, is_public) values ('o2', 'o2@x.test', 'user_o2', 'U', true), ('d2', 'd2@x.test', 'user_d2', 'U', true)`);
  await bl("po3", "o2", true, true);
  await mergeAccounts("d2", "o2");
  assert.equal(await one(sql`select count(*) n from backlog where user_id='d2' and pinned_at is not null`), 1);
  ok("mergeAccounts: el pin del origen sobrevive si el destino no tenía");

  // ---- cron/release
  process.env.CRON_SECRET = "s3cret";
  process.env.AUTH_SECRET ??= "harness";
  process.env.DATABASE_URL ??= "postgres://unused.invalid/harness";
  const { GET: release } = await import("@/app/api/cron/release/route");
  const R = "00000000-0000-4000-8000-0000000000a1";
  await db.execute(sql`insert into catalog_item (id, source, external_id, media_type, title, release_date) values (${R}, 'tmdb', 'r', 'film', 'Estreno', now() - interval '1 day')`);
  for (const u of ["a", "b", "c", "d", "e"]) await db.execute(sql`insert into user_item (id, user_id, catalog_item_id, added_at) values (${"ui-r-" + u}, ${u}, ${R}, now() - interval '30 days')`);
  await db.execute(sql`insert into release_notice (id, user_id, catalog_item_id, created_at) values ('stale', 'c', ${R}, now() - interval '2 hours')`);
  await db.execute(sql`insert into release_notice (id, user_id, catalog_item_id, created_at) values ('fresh', 'd', ${R}, now())`);
  await db.execute(sql`insert into release_notice (id, user_id, catalog_item_id, created_at, email_sent_at) values ('done', 'e', ${R}, now() - interval '2 hours', now())`);
  const req = (auth: string | null) => new Request("http://x/api/cron/release", { headers: auth ? { authorization: auth } : {} });
  assert.equal((await release(req("Bearer nope"))).status, 401);
  assert.equal((await release(req(null))).status, 401);
  assert.equal((await release(req("Bearer s3cret-x"))).status, 401);
  sentTo.length = 0;
  const res = await release(req("Bearer s3cret"));
  const body = await res.json();
  console.log("   release:", JSON.stringify(body));
  assert.equal(res.status, 500);
  assert.equal(body.sent, 2); assert.equal(body.failed, 1); assert.equal(body.timedOut, false);
  assert.deepEqual([...sentTo].sort(), ["a@x.test", "c@x.test"]);
  const notices = await q<{ user_id: string; sent: boolean; id: string }>(sql`select user_id, id, email_sent_at is not null as sent from release_notice order by user_id`);
  assert.deepEqual(notices.map((r) => [r.user_id, r.sent]), [["a", true], ["c", true], ["d", false], ["e", true]]);
  assert.equal(notices.find((r) => r.user_id === "c")!.id, "stale");
  ok("cron/release: 401 con secreto malo; envía a pendiente + claim viejo sin correo; libera el claim del que falló; respeta claim fresco y enviado; 500");
  sentTo.length = 0;
  await db.execute(sql`update "user" set email = 'b@x.test' where id = 'b'`);
  const res2 = await release(req("Bearer s3cret"));
  const body2 = await res2.json();
  assert.equal(res2.status, 200); assert.equal(body2.sent, 1); assert.deepEqual(sentTo, ["b@x.test"]);
  ok("cron/release: el siguiente run reintenta solo al que falló → 200");

  // ---- cron/recap
  const { GET: recap } = await import("@/app/api/cron/recap/route");
  await db.execute(sql`update "user" set email = 'fail-b@x.test' where id = 'b'`);
  await db.execute(sql`update user_item set status = 'completed', status_changed_at = date_trunc('month', now()) - interval '10 days', added_at = date_trunc('month', now()) - interval '40 days' where catalog_item_id = ${R} and user_id in ('a','b')`);
  sentTo.length = 0;
  const reqR = new Request("http://x/api/cron/recap", { headers: { authorization: "Bearer s3cret" } });
  assert.equal((await recap(new Request("http://x", { headers: { authorization: "Bearer s3cre" } }))).status, 401);
  const r1 = await recap(reqR); const b1 = await r1.json();
  console.log("   recap:", JSON.stringify(b1));
  assert.equal(r1.status, 500); assert.equal(b1.failed, 1); assert.ok(b1.sent >= 1); assert.ok(sentTo.includes("a@x.test"));
  assert.equal(await one(sql`select count(*) n from recap_send where user_id='b'`), 0);
  assert.equal(await one(sql`select count(*) n from recap_send where user_id='a' and email_sent_at is not null`), 1);
  await db.execute(sql`update "user" set email = 'b@x.test' where id = 'b'`);
  sentTo.length = 0;
  const r2 = await recap(reqR); const b2 = await r2.json();
  assert.equal(r2.status, 200); assert.equal(b2.sent, 1); assert.equal(b2.total, 1); assert.deepEqual(sentTo, ["b@x.test"]);
  ok("cron/recap: fallo libera el claim y responde 500; re-run solo procesa al pendiente → 200");

  // ---- cron/recap: days 2–3 address the same month, and resume it
  const cron = JSON.parse(readFileSync("vercel.json", "utf8")).crons.find((c: { path: string }) => c.path === "/api/cron/recap");
  assert.equal(cron.schedule, "0 9 1-3 * *");
  for (const [y, m] of [[2026, 9], [2026, 0], [2027, 2]]) {
    const keys = [1, 2, 3].map((d) => previousMonthKey(new Date(Date.UTC(y, m, d, 9))));
    assert.equal(new Set(keys).size, 1, `días 1–3 → un solo eraKey (${keys.join(",")})`);
  }
  assert.equal(previousMonthKey(new Date(Date.UTC(2026, 0, 3, 9))), "2025-12");
  const era = previousMonthKey();
  // Nobody without activity that month took a claim (c, d, e only have this month's).
  assert.equal(await one(sql`select count(*) n from recap_send where user_id in ('c','d','e')`), 0);
  // c: abandoned claim (the run died between claim and send). d: a live claim
  // of an overlapping run. e: a pre-existing "nothing to say" row, no activity.
  await db.execute(sql`update user_item set status_changed_at = date_trunc('month', now()) - interval '10 days', added_at = date_trunc('month', now()) - interval '40 days' where catalog_item_id = ${R} and user_id in ('c','d')`);
  await db.execute(sql`insert into recap_send (id, user_id, era_key, created_at) values ('rs-stale', 'c', ${era}, now() - interval '2 hours'), ('rs-live', 'd', ${era}, now()), ('rs-empty', 'e', ${era}, now() - interval '2 hours')`);
  sentTo.length = 0;
  const r3 = await recap(reqR); const b3 = await r3.json();
  console.log("   recap (reanudación):", JSON.stringify(b3));
  assert.equal(r3.status, 200); assert.equal(b3.eraKey, era); assert.equal(b3.total, 1); assert.equal(b3.sent, 1);
  assert.deepEqual(sentTo, ["c@x.test"]);
  const sends = await q<{ id: string; sent: boolean }>(sql`select id, email_sent_at is not null as sent from recap_send where user_id in ('c','d','e') order by user_id`);
  assert.deepEqual(sends, [{ id: "rs-stale", sent: true }, { id: "rs-live", sent: false }, { id: "rs-empty", sent: false }]);
  ok("cron/recap: días 1–3 = mismo mes; adopta el claim huérfano (misma fila), respeta el claim vivo, no toca a quien no tuvo actividad");
  // The live claim's run died too: once stale, the next day's run sends it.
  await db.execute(sql`update recap_send set created_at = now() - interval '1 day' where id = 'rs-live'`);
  sentTo.length = 0;
  const r4 = await recap(reqR); const b4 = await r4.json();
  assert.equal(r4.status, 200); assert.equal(b4.sent, 1); assert.deepEqual(sentTo, ["d@x.test"]);
  const r5 = await recap(reqR); const b5 = await r5.json();
  assert.equal(r5.status, 200); assert.equal(b5.total, 0); assert.equal(b5.sent, 0);
  ok("cron/recap: el run del día siguiente termina lo que quedó a medias; otro más = 0 pendientes");

  // ---- Torre de Control: recapCronCheck (no false PROBLEMA)
  const { recapCronCheck } = await import("@/modules/admin/checks");
  const at = (iso: string) => new Date(iso);
  // 2019-11: nobody active → never a problem, whatever the day.
  for (const d of ["2019-12-02T12:00:00Z", "2019-12-20T12:00:00Z"]) {
    const c = await recapCronCheck(at(d));
    assert.equal(c.status, "none", d); assert.match(c.value, /nadie con actividad en 2019-11/);
  }
  assert.match((await recapCronCheck(at("2019-12-01T03:00:00Z"))).value, /corre hoy · días 1–3/);
  // 2019-12: 'a' was active (and wants the recap); 'e' was active but opted out.
  await db.execute(sql`insert into catalog_item (id, source, external_id, media_type, title) values ('00000000-0000-4000-8000-0000000000b1', 'tmdb', 'old', 'film', 'Vieja')`);
  await db.execute(sql`insert into user_item (id, user_id, catalog_item_id, added_at, status_changed_at) values ('ui-old-a', 'a', '00000000-0000-4000-8000-0000000000b1', '2019-12-10', '2019-12-10'), ('ui-old-e', 'e', '00000000-0000-4000-8000-0000000000b1', '2019-12-11', '2019-12-11')`);
  await db.execute(sql`update "user" set notify_recap = false where id = 'e'`);
  const day2 = await recapCronCheck(at("2020-01-02T12:00:00Z"));
  assert.equal(day2.status, "warn"); assert.match(day2.value, /día 2: aún sin envíos \(1 pendientes de 2019-12\) · quedan runs hasta el día 3/);
  const day3late = await recapCronCheck(at("2020-01-03T12:00:00Z"));
  assert.equal(day3late.status, "bad"); assert.match(day3late.value, /no envió nada en los días 1–3/);
  assert.equal((await recapCronCheck(at("2020-01-15T12:00:00Z"))).status, "bad");
  await db.execute(sql`insert into recap_send (id, user_id, era_key, created_at) values ('rs-old', 'a', '2019-12', '2020-01-02 09:00')`);
  assert.equal((await recapCronCheck(at("2020-01-15T12:00:00Z"))).status, "bad", "un claim sin correo no es un envío");
  await db.execute(sql`update recap_send set email_sent_at = '2020-01-02 09:01' where id = 'rs-old'`);
  const done = await recapCronCheck(at("2020-01-15T12:00:00Z"));
  assert.equal(done.status, "ok"); assert.match(done.value, /corrió · 1 recaps de 2019-12/);
  await db.execute(sql`delete from user_item where id in ('ui-old-a', 'ui-old-e')`);
  ok("recapCronCheck: mes sin nadie activo = sin señal (no PROBLEMA); día 2 sin envíos = aviso; pasado el día 3 = PROBLEMA; quien se dio de baja no cuenta");

  // ---- everything below talks to "the network" through a stub
  const realFetch = globalThis.fetch;
  let calls: string[] = [];
  const stubFetch = (h: (url: URL, init?: RequestInit) => Response | Promise<Response>) => {
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(`${url.host}${url.pathname}`);
      return h(url, init);
    }) as typeof fetch;
  };
  const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  try {
    // ---- resolveVideoLink: a TMDB that didn't answer is not cached
    const { env } = await import("@/lib/env");
    const { resolveVideoLink } = await import("@/modules/links/resolve");
    const { catalogItems } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rowOf = async (id: string) => (await db.select().from(catalogItems).where(eq(catalogItems.id, id)))[0] as never;
    const keyBefore = env.TMDB_API_KEY;
    (env as { TMDB_API_KEY?: string }).TMDB_API_KEY = "harness-key";
    const links = () => q<{ url: string; is_search_fallback: boolean }>(sql`select url, is_search_fallback from media_link where catalog_item_id = ${X} and service = 'other' and region = 'MX'`);
    const floor = `https://www.themoviedb.org/movie/${X}/watch?locale=MX`;
    stubFetch(() => jsonRes({}, 503));
    assert.equal(await resolveVideoLink(await rowOf(X), "MX"), floor);
    assert.deepEqual(await links(), [], "un 503 no se cachea");
    stubFetch(() => { throw new DOMException("timeout", "TimeoutError"); });
    assert.equal(await resolveVideoLink(await rowOf(X), "MX"), floor);
    assert.deepEqual(await links(), [], "un timeout no se cachea");
    const exact = "https://www.themoviedb.org/movie/1-x/watch?locale=MX";
    stubFetch(() => jsonRes({ results: { MX: { link: exact, flatrate: [{ provider_name: "Mubi" }] } } }));
    assert.equal(await resolveVideoLink(await rowOf(X), "MX"), exact);
    assert.deepEqual(await links(), [{ url: exact, is_search_fallback: false }]);
    stubFetch(() => { throw new Error("no debería llamar: hay caché"); });
    assert.equal(await resolveVideoLink(await rowOf(X), "MX"), exact);
    assert.equal(calls.length, 0);
    // An ANSWER without a link for the region IS cached (as the floor).
    stubFetch(() => jsonRes({ results: {} }));
    const floorY = `https://www.themoviedb.org/tv/${Y}/watch?locale=MX`;
    assert.equal(await resolveVideoLink(await rowOf(Y), "MX"), floorY);
    assert.deepEqual(await q(sql`select url, is_search_fallback from media_link where catalog_item_id = ${Y}`), [{ url: floorY, is_search_fallback: true }]);
    (env as { TMDB_API_KEY?: string }).TMDB_API_KEY = keyBefore;
    ok("resolveVideoLink: 503/timeout de TMDB = piso servido SIN cachear; respuesta real (con o sin link) sí se cachea");

    // ---- linkgraph: provider down = short backoff, not the 180-day stamp
    const { getOrMaterializeLinkEdges, LINK_EDGES_STALE_MS, LINK_EDGES_RETRY_MS } = await import("@/modules/recs/linkgraph");
    // Age measured IN the database (UTC on both sides): node-postgres reads a
    // `timestamp` in the machine's zone, which is not what the app wrote.
    const freshFor = async () => {
      const [r] = await q<{ age: string | null }>(sql`select extract(epoch from ((now() at time zone 'utc') - link_edges_checked_at)) * 1000 as age from catalog_item where id = ${X}`);
      return r.age === null ? null : LINK_EDGES_STALE_MS - Number(r.age);
    };
    await db.execute(sql`update catalog_item set link_edges_checked_at = null where id = ${X}`);
    stubFetch(() => jsonRes({}, 503));
    assert.deepEqual(await getOrMaterializeLinkEdges(await rowOf(X)), []);
    assert.ok(calls.some((c) => c.startsWith("itunes.apple.com")), "pidió a iTunes");
    const left = await freshFor();
    assert.ok(left !== null && left > LINK_EDGES_RETRY_MS - 60_000 && left <= LINK_EDGES_RETRY_MS, `backoff ≈ 15 min, no 180 días (quedan ${left} ms)`);
    stubFetch(() => { throw new Error("no debería reintentar dentro del backoff"); });
    assert.deepEqual(await getOrMaterializeLinkEdges(await rowOf(X)), []);
    assert.equal(calls.length, 0, "dentro del backoff no se vuelve a pedir");
    // Backoff over: asked again; this time iTunes ANSWERS (nothing) → the long stamp.
    await db.execute(sql`update catalog_item set link_edges_checked_at = link_edges_checked_at - interval '16 minutes' where id = ${X}`);
    stubFetch(() => jsonRes({ resultCount: 0, results: [] }));
    assert.deepEqual(await getOrMaterializeLinkEdges(await rowOf(X)), []);
    assert.ok(calls.length > 0, "vencido el backoff se vuelve a pedir");
    const sealed = await freshFor();
    assert.ok(sealed !== null && sealed > LINK_EDGES_STALE_MS - 60_000, "una respuesta real sí sella 180 días");
    ok("linkgraph: proveedor caído = reintento en 15 min (ni en cada petición ni sellado 180 días); respuesta real = sello largo");

    // ---- TIDAL: refresh races and the app token's 401
    process.env.AUTH_SECRET ??= "harness";
    process.env.TIDAL_CLIENT_ID = "cid"; process.env.TIDAL_CLIENT_SECRET = "csecret";
    process.env.TIDAL_OAUTH_REDIRECT_URI = "https://get-kura.app/api/music/tidal/callback";
    const { sealSecret } = await import("@/lib/secret-box");
    const { getTidalAccess } = await import("@/modules/music-export/tidal-auth");
    const { tidalTracksByIsrc, resetTidalAppTokenForTests } = await import("@/modules/music-export/tidal-api");
    const { tidalOAuthConfig } = await import("@/modules/music-export/config");
    const seal = (v: string, field: "access" | "refresh") => sealSecret(v, "music-token", `music-connection:a:tidal:${field}`);
    const expired = async () => {
      await db.execute(sql`delete from music_connection where user_id = 'a'`);
      await db.execute(sql`insert into music_connection (user_id, provider, access_token_enc, refresh_token_enc, expires_at, country_code, updated_at) values ('a', 'tidal', ${seal("old-access", "access")}, ${seal("r1", "refresh")}, now() - interval '1 hour', 'MX', now() - interval '1 day')`);
    };
    const conns = () => one(sql`select count(*) n from music_connection where user_id = 'a'`);
    const tokenCalls = () => calls.filter((c) => c === "auth.tidal.com/v1/oauth2/token").length;
    // (a) same instance: N concurrent callers share ONE refresh.
    await expired();
    stubFetch(async () => { await new Promise((r) => setTimeout(r, 80)); return jsonRes({ access_token: "new-access", refresh_token: "r2", expires_in: 3600 }); });
    const shared = await Promise.all([getTidalAccess("a"), getTidalAccess("a"), getTidalAccess("a")]);
    assert.deepEqual(shared.map((s) => s.accessToken), ["new-access", "new-access", "new-access"]);
    assert.equal(tokenCalls(), 1, "un solo refresh para tres llamadas concurrentes");
    assert.equal(await conns(), 1);
    // (b) another instance won the rotation: TIDAL refuses OUR (now old)
    //     refresh token and the winner's row lands a moment later. The loser
    //     must wait for it instead of deleting a healthy link.
    await expired();
    stubFetch(() => {
      setTimeout(() => {
        // (a drizzle query is lazy: it only runs once something awaits it)
        db.execute(sql`update music_connection set access_token_enc = ${seal("winner-access", "access")}, refresh_token_enc = ${seal("r2", "refresh")}, expires_at = now() + interval '1 hour', updated_at = now() where user_id = 'a'`).then(() => undefined, console.error);
      }, 400);
      return jsonRes({ error: "invalid_grant" }, 400);
    });
    const loser = await getTidalAccess("a");
    assert.equal(loser.accessToken, "winner-access");
    assert.equal(await conns(), 1, "la conexión sana sigue ahí");
    // (c) nobody else refreshed: the link really is dead → dropped, not_connected.
    await expired();
    stubFetch(() => jsonRes({ error: "invalid_grant" }, 400));
    await assert.rejects(getTidalAccess("a"), (e: { reason?: string }) => e.reason === "not_connected");
    assert.equal(await conns(), 0);
    // (d) TIDAL down (5xx) is not a refusal: the link stays.
    await expired();
    stubFetch(() => jsonRes({}, 503));
    await assert.rejects(getTidalAccess("a"), (e: { reason?: string }) => e.reason === "service_failed");
    assert.equal(await conns(), 1);
    ok("TIDAL refresh: concurrentes comparten uno; el que pierde la rotación espera la fila del ganador y NO borra la conexión; rechazo real = se suelta; 5xx = se queda");

    // (d2) a 4xx that is NOT `invalid_grant` says nothing about this user's
    //      refresh token (a rotated client secret, a malformed request, a
    //      WAF): service_failed, and the link stays — for every user.
    for (const [status, body] of [[401, { error: "invalid_client" }], [400, { error: "invalid_request" }], [403, {}], [400, { errors: [{ code: "invalid_grant" }] }]] as const) {
      await expired();
      stubFetch(() => jsonRes(body, status));
      await assert.rejects(getTidalAccess("a"), (e: { reason?: string }) => e.reason === "service_failed", `${status} ${JSON.stringify(body)}`);
      assert.equal(await conns(), 1, `${status} ${JSON.stringify(body)}: el vínculo sigue`);
      assert.equal(tokenCalls(), 1, "sin esperas ni reintentos: no es una carrera de rotación");
    }
    ok("TIDAL refresh: solo `error: invalid_grant` suelta el vínculo; invalid_client / invalid_request / 403 = service_failed con el vínculo intacto");

    // The shared refresh does NOT inherit the deadline of the request that
    // started it: a step with 300 ms left starts a 600 ms refresh, a second
    // caller with time to spare joins it. The first runs out (its own 503);
    // the second gets the token, from the ONE refresh, and the row is saved.
    {
      const { withDeadline } = await import("@/modules/music-export/budget");
      await expired();
      stubFetch((_url, init) => new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(jsonRes({ access_token: "late-access", refresh_token: "r9", expires_in: 3600 })), 600);
        init?.signal?.addEventListener("abort", () => { clearTimeout(t); reject(init.signal!.reason); }, { once: true });
      }));
      const [hurried, patient] = await Promise.allSettled([
        withDeadline(Date.now() + 300, () => getTidalAccess("a")),
        getTidalAccess("a"),
      ]);
      assert.equal(hurried.status, "rejected");
      assert.equal((hurried as PromiseRejectedResult).reason?.reason, "service_failed");
      assert.equal(patient.status, "fulfilled", "el segundo llamador NO hereda el plazo del primero");
      assert.equal((patient as PromiseFulfilledResult<{ accessToken: string }>).value.accessToken, "late-access");
      assert.equal(tokenCalls(), 1); assert.equal(await conns(), 1);
      assert.equal((await getTidalAccess("a")).accessToken, "late-access", "el par nuevo quedó guardado");
      assert.equal(tokenCalls(), 1);
      ok("TIDAL refresh: el refresh compartido corre con su propio plazo — quien lo inició con el presupuesto agotado recibe 503, el otro recibe el token");
    }

    // (e) app token refused (401) → cache emptied, one retry with a new token.
    resetTidalAppTokenForTests();
    let minted = 0;
    const seen: string[] = [];
    const app = (alwaysRefuse: boolean) => stubFetch((url, init) => {
      if (url.host === "auth.tidal.com") return jsonRes({ access_token: `app-${++minted}`, expires_in: 3600 });
      const bearer = String(new Headers(init?.headers).get("authorization"));
      seen.push(bearer);
      if (alwaysRefuse || bearer === "Bearer app-1") return jsonRes({ errors: [{ code: "UNAUTHORIZED" }] }, 401);
      return jsonRes({ data: [{ id: "t-9", type: "tracks", attributes: { isrc: "USRC17607839" } }] });
    });
    app(false);
    const cfg = tidalOAuthConfig()!;
    assert.deepEqual([...(await tidalTracksByIsrc(cfg, ["USRC17607839"], "MX"))], [["USRC17607839", "t-9"]]);
    assert.deepEqual(seen, ["Bearer app-1", "Bearer app-2"]); assert.equal(minted, 2);
    await tidalTracksByIsrc(cfg, ["USRC17607839"], "MX");
    assert.equal(minted, 2, "el token nuevo queda en caché");
    app(true);
    await assert.rejects(tidalTracksByIsrc(cfg, ["USRC17607839"], "MX"), (e: { status?: number }) => e.status === 401);
    assert.equal(minted, 3, "un solo reintento: 401 dos veces se propaga");
    ok("TIDAL app token: 401 vacía la caché y reintenta UNA vez con token nuevo");

    // ---- TIDAL export: the real step / start against a party in the DB
    const { stepTidalExport, startExport } = await import("@/modules/music-export/exports");
    const T1 = "00000000-0000-4000-8000-00000000e0a1", T2 = "00000000-0000-4000-8000-00000000e0a2", T3 = "00000000-0000-4000-8000-00000000e0a3";
    await bl("pt", "a", false);
    await db.execute(sql`insert into party (backlog_id) values ('pt')`);
    for (const [i, id] of [T1, T2, T3].entries()) {
      await db.execute(sql`insert into catalog_item (id, source, external_id, media_type, title, byline) values (${id}, 'itunes-track', ${"trk" + i}, 'track', ${"Song " + i}, ${"Artist " + i})`);
      await db.execute(sql`insert into backlog_item (id, backlog_id, user_id, catalog_item_id) values (${"pi" + i}, 'pt', 'a', ${id})`);
      await db.execute(sql`insert into party_song (backlog_item_id, backlog_id, added_by_user_id, added_at) values (${"pi" + i}, 'pt', 'a', now() + ${i} * interval '1 second')`);
    }
    const live = async () => {
      await db.execute(sql`delete from music_connection where user_id = 'a'`);
      await db.execute(sql`insert into music_connection (user_id, provider, access_token_enc, refresh_token_enc, expires_at, country_code, scope) values ('a', 'tidal', ${seal("user-access", "access")}, ${seal("r1", "refresh")}, now() + interval '1 hour', 'MX', 'playlists.write user.read')`);
    };
    const items = () => q<{ id: string; outcome: string }>(sql`select catalog_item_id id, outcome from party_export_item order by 1`);
    const exportRow = async () => (await q<{ remote_playlist_id: string | null; generation: number; lease_until: Date | null }>(sql`select remote_playlist_id, generation, lease_until from party_export where backlog_id = 'pt' and provider = 'tidal'`))[0];
    const isAppToken = (url: URL, init?: RequestInit) => url.host === "auth.tidal.com" && String(init?.body).includes("client_credentials");
    /** A search hit TIDAL would give for "Song {i} Artist {i}". */
    const hit = (i: string) => jsonRes({
      data: { id: "q", type: "searchResults", relationships: { tracks: { data: [{ id: "tr" + i, type: "tracks" }] } } },
      included: [
        { id: "tr" + i, type: "tracks", attributes: { title: "Song " + i, duration: "PT3M" }, relationships: { artists: { data: [{ id: "ar" + i, type: "artists" }] } } },
        { id: "ar" + i, type: "artists", attributes: { name: "Artist " + i } },
      ],
    });
    /** A response that never comes: settles only when the caller's signal aborts. */
    const hang = (init?: RequestInit) => new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });

    // (f) the APP token request refused with a 400: the catalog is down for
    //     everyone — 503, and NOT "none of your songs is on TIDAL".
    await live(); resetTidalAppTokenForTests();
    stubFetch((url, init) => (isAppToken(url, init) ? jsonRes({ error: "invalid_client" }, 400) : jsonRes({}, 500)));
    await assert.rejects(stepTidalExport("a", "pt"), (e: { reason?: string; code?: string }) => e.reason === "service_failed" && e.code === "unavailable");
    assert.deepEqual(await items(), [], "ninguna canción marcada «no encontrada»");
    assert.equal((await exportRow()).lease_until, null, "el lease se suelta");
    assert.equal(await conns(), 1);
    // control: a 400 of the SEARCH itself still means "no result" for that song.
    resetTidalAppTokenForTests();
    stubFetch((url, init) => (isAppToken(url, init) ? jsonRes({ access_token: "app-x", expires_in: 3600 }) : jsonRes({ errors: [{ code: "INVALID_QUERY" }] }, 400)));
    const allMissing = await stepTidalExport("a", "pt");
    assert.equal(allMissing.status, "done"); assert.equal(allMissing.missing.length, 3); assert.equal(allMissing.playlist, null);
    ok("TIDAL step: 400 del token de aplicación = 503 service_failed sin marcar canciones; 400 de la búsqueda = «no encontrada»");

    // (g) the step's time budget: one song answers, two searches hang. The
    //     step cuts at the matching budget and ANSWERS with the one it has;
    //     the other two stay pending (never `missing`) for the next step.
    await db.execute(sql`delete from party_export_item`);
    let slow = true;
    const writes: string[] = [];
    stubFetch((url, init) => {
      if (isAppToken(url, init)) return jsonRes({ access_token: "app-x", expires_in: 3600 });
      const method = init?.method ?? "GET";
      if (url.pathname.endsWith("/searchResults")) {
        const term = url.searchParams.get("filter[query]") ?? "";
        const i = /Song (\d)/.exec(term)?.[1] ?? "?";
        return slow && i !== "0" ? hang(init) : hit(i);
      }
      if (method === "POST" && url.pathname.endsWith("/playlists")) { writes.push("create"); return jsonRes({ data: { id: "pl-1", type: "playlists", attributes: {} } }, 201); }
      if (method === "POST" && url.pathname.endsWith("/relationships/items")) {
        writes.push("add:" + (JSON.parse(String(init?.body)) as { data: { id: string }[] }).data.map((d) => d.id).join(","));
        return jsonRes({}, 201);
      }
      return jsonRes({}, 500);
    });
    const t0 = Date.now();
    const partial = await stepTidalExport("a", "pt");
    const took = Date.now() - t0;
    assert.ok(took >= 5_500 && took < 12_000, `el step respondió en ${took} ms (cada búsqueda colgada cuesta su timeout de 6 s; matching ≤ 7 s, total ≤ 12 s)`);
    assert.equal(partial.status, "in_progress"); assert.equal(partial.busy, false);
    assert.equal(partial.processed, 1); assert.equal(partial.total, 3); assert.equal(partial.exported, 1);
    assert.equal(partial.missing.length, 0, "lo que el presupuesto no alcanzó NO es «no encontrada»");
    assert.equal(partial.playlist?.id, "pl-1");
    assert.deepEqual(await items(), [{ id: T1, outcome: "added" }]);
    assert.deepEqual(writes, ["create", "add:tr0"]);
    assert.equal((await exportRow()).lease_until, null);
    slow = false;
    const rest = await stepTidalExport("a", "pt");
    assert.equal(rest.status, "done"); assert.equal(rest.processed, 3); assert.equal(rest.exported, 3);
    assert.deepEqual(writes, ["create", "add:tr0", "add:tr1,tr2"], "el siguiente step toma solo lo pendiente, sin crear otra playlist");
    // …and a step whose budget runs out with NOTHING decided fails loudly.
    await db.execute(sql`delete from party_export_item`);
    slow = true;
    stubFetch((url, init) => (isAppToken(url, init) ? jsonRes({ access_token: "app-x", expires_in: 3600 }) : hang(init)));
    await assert.rejects(stepTidalExport("a", "pt"), (e: { reason?: string }) => e.reason === "service_failed");
    assert.deepEqual(await items(), []); assert.equal((await exportRow()).lease_until, null);
    ok(`TIDAL step: presupuesto — responde parcial (in_progress, 1/3, en ${took} ms) y el resto queda pendiente; sin nada decidido = service_failed`);

    // (g2) the ISRC lookup hangs (TIDAL's `/tracks?filter[isrc]` slow) while
    //      the title search answers: the lookup is cut at its own slice and
    //      the batch is matched by title+artist — the step ADVANCES instead
    //      of answering 503 for as long as the ISRC endpoint is slow.
    await db.execute(sql`delete from party_export_item`);
    await db.execute(sql`update catalog_item set raw = jsonb_build_object('_isrc', 'USRC1760783' || right(external_id, 1), '_isrc_at', now()::text) where id in (${T1}, ${T2}, ${T3})`);
    let isrcCalls = 0;
    const writes2: string[] = [];
    stubFetch((url, init) => {
      if (isAppToken(url, init)) return jsonRes({ access_token: "app-x", expires_in: 3600 });
      const method = init?.method ?? "GET";
      if (method === "GET" && url.pathname.endsWith("/tracks") && url.searchParams.has("filter[isrc]")) { isrcCalls++; return hang(init); }
      if (url.pathname.endsWith("/searchResults")) return hit(/Song (\d)/.exec(url.searchParams.get("filter[query]") ?? "")?.[1] ?? "?");
      if (method === "POST" && url.pathname.endsWith("/playlists")) { writes2.push("create"); return jsonRes({ data: { id: "pl-2", type: "playlists", attributes: {} } }, 201); }
      if (method === "POST" && url.pathname.endsWith("/relationships/items")) {
        writes2.push("add:" + (JSON.parse(String(init?.body)) as { data: { id: string }[] }).data.map((d) => d.id).join(","));
        return jsonRes({}, 201);
      }
      return jsonRes({}, 500);
    });
    const t1 = Date.now();
    const byTitle = await stepTidalExport("a", "pt");
    const took2 = Date.now() - t1;
    assert.equal(isrcCalls, 1, "la búsqueda por ISRC sí se intentó");
    assert.ok(took2 >= 2_000 && took2 < 6_000, `el step respondió en ${took2} ms (ISRC cortado en su rebanada de 2.5 s, no en el timeout de 6 s)`);
    assert.equal(byTitle.status, "done"); assert.equal(byTitle.processed, 3); assert.equal(byTitle.exported, 3);
    assert.equal(byTitle.missing.length, 0);
    assert.ok(writes2.some((w) => w === "add:tr0,tr1,tr2"), `las tres canciones se agregaron por título (${writes2.join(" | ")})`);
    assert.equal((await exportRow()).lease_until, null);
    await db.execute(sql`update catalog_item set raw = null where id in (${T1}, ${T2}, ${T3})`);
    await db.execute(sql`delete from party_export_item`);
    ok(`TIDAL step: ISRC colgado — se corta en su rebanada y el lote avanza por título+artista (3/3 en ${took2} ms), sin 503`);

    // (h) two `POST …/exports/tidal` at once on a "done" export whose
    //     playlist was deleted in TIDAL: both see the 404, ONE bumps the
    //     generation, and the other answers the fresh row (not a 503).
    const doneWith = async (playlist: string, bumped: boolean) => {
      await db.execute(sql`update party_export set remote_playlist_id = ${playlist}, remote_url = null, generation = 0, generation_bumped_at = ${bumped ? sql`now()` : sql`null`}, lease_until = null where backlog_id = 'pt'`);
      await db.execute(sql`delete from party_export_item`);
      await db.execute(sql`insert into party_export_item (export_id, catalog_item_id, outcome) select e.id, c.id, 'added' from party_export e, catalog_item c where e.backlog_id = 'pt' and c.source = 'itunes-track'`);
    };
    await doneWith("pl-gone", false);
    stubFetch(async () => { await new Promise((r) => setTimeout(r, 60)); return jsonRes({ errors: [{ code: "NOT_FOUND" }] }, 404); });
    const both = await Promise.all([startExport("a", "pt", "tidal"), startExport("a", "pt", "tidal")]);
    for (const st of both) { assert.equal(st.status, "in_progress"); assert.equal(st.playlist, null); assert.equal(st.processed, 0); }
    assert.equal(calls.filter((c) => c.endsWith("/playlists/pl-gone")).length, 2, "los dos confirmaron el 404 antes del bump");
    assert.equal((await exportRow()).generation, 1, "UNA generación nueva, no dos");
    // control: a playlist that vanishes AGAIN inside the cooldown is still refused.
    await doneWith("pl-gone-2", true);
    await assert.rejects(startExport("a", "pt", "tidal"), (e: { reason?: string }) => e.reason === "service_failed");
    assert.equal((await exportRow()).remote_playlist_id, "pl-gone-2");
    ok("TIDAL start: dos concurrentes sobre una playlist borrada = una generación y la fila fresca para ambos; segunda desaparición en 10 min = 503");
  } finally {
    globalThis.fetch = realFetch;
  }
  await collectionPaging();
}

/**
 * Colecciones largas (ronda 8) — the keyset pages of a collection against
 * real rows. 150 titles built to hurt: 40 added in the SAME instant (what a
 * copied collection looks like), ties of four per second, twenty inside one
 * millisecond (microseconds apart), null and repeated years, every state,
 * manual positions with gaps, nulls and a repeated value, and membership ids
 * whose order has nothing to do with the insertion order.
 *
 * The oracle is what the web did BEFORE paging: `getBacklogItems` whole, then
 * the client's `sortItems` (copied below from collection-body.tsx as it was).
 * Only what that left undefined is pinned here: rows equal on every key of
 * the manual order read by membership id, descending.
 */
async function collectionPaging() {
  const uuid = (p: number, i: number) => `00000000-0000-4000-9${String(p).padStart(3, "0")}-${String(i).padStart(12, "0")}`;
  const MEDIA = ["film", "series", "album"] as const;
  type Format = (typeof MEDIA)[number];
  const N = 150;
  const B = "pg-main", OTHER = "pg-other", FOREIGN = "pg-foreign";
  for (const u of ["pg1", "pg2"]) {
    await db.execute(sql`insert into "user" (id, email, username, name, is_public) values (${u}, ${u + "@x.test"}, ${"user_" + u}, ${"U " + u}, true)`);
  }
  await db.execute(sql`insert into backlog (id, user_id, name) values (${B}, 'pg1', 'larga'), (${OTHER}, 'pg1', 'otra'), (${FOREIGN}, 'pg2', 'ajena')`);
  const two = (v: number) => String(v).padStart(2, "0");
  for (let i = 0; i < N; i++) {
    const cid = uuid(1, i);
    const year = i % 7 === 0 ? null : [2024, 2010, 2010, 1999, 0, 2024][i % 6];
    const verdict = i % 3 === 1 ? "liked" : i % 10 === 2 ? "disliked" : null;
    const position = i % 5 === 0 ? null : i % 11 === 0 ? 30 : i * 3;
    const addedAt =
      i < 40 ? "2026-09-01 12:00:00"
      : i < 80 ? `2026-09-01 13:00:${two(Math.floor(i / 4))}`
      : i < 100 ? `2026-09-02 08:00:00.123${String(i).padStart(3, "0")}`
      : `2026-08-01 10:${two(i - 100)}:00.5`;
    await db.execute(sql`insert into catalog_item (id, source, external_id, media_type, title, year) values (${cid}, 'tmdb', ${"pg-" + i}, ${MEDIA[i % 3]}::media_type, ${"P " + i}, ${year})`);
    await db.execute(sql`insert into user_item (id, user_id, catalog_item_id, status, verdict, obsessed) values (${"pg-ui-" + i}, 'pg1', ${cid}, ${i % 2 ? "completed" : "on_my_radar"}::item_status, ${verdict}::item_verdict, ${i % 4 === 0})`);
    await db.execute(sql`insert into backlog_item (id, backlog_id, user_id, catalog_item_id, position, added_at) values (${uuid(2, (i * 37) % N)}, ${B}, 'pg1', ${cid}, ${position}, ${addedAt}::timestamp)`);
    if (i < 70) await db.execute(sql`insert into backlog_item (id, backlog_id, user_id, catalog_item_id) values (${uuid(3, i)}, ${OTHER}, 'pg1', ${cid})`);
    if (i < 5) {
      await db.execute(sql`insert into user_item (id, user_id, catalog_item_id) values (${"pg-ui2-" + i}, 'pg2', ${cid})`);
      await db.execute(sql`insert into backlog_item (id, backlog_id, user_id, catalog_item_id) values (${uuid(4, i)}, ${FOREIGN}, 'pg2', ${cid})`);
    }
  }

  // ---- the oracle: the unpaged read + the client sort the web used before
  type Row = Awaited<ReturnType<typeof getBacklogItems>>[number] & { position: number | null };
  const reference = async (sort: PagedSort, format: Format | null): Promise<string[]> => {
    const pos = new Map((await q<{ id: string; position: number | null }>(sql`select id, position from backlog_item where backlog_id = ${B}`)).map((r) => [r.id, r.position]));
    const whole: Row[] = (await getBacklogItems(B)).map((r) => ({ ...r, position: pos.get(r.id) ?? null }));
    // MANUAL_ORDER, with its undefined ties pinned (id desc).
    whole.sort((a, b) =>
      a.position === b.position
        ? b.addedAt.getTime() - a.addedAt.getTime() || (a.id < b.id ? 1 : -1)
        : a.position === null ? -1 : b.position === null ? 1 : a.position - b.position);
    const out = format ? whole.filter((r) => r.mediaType === format) : [...whole];
    // `sortItems` of collection-body.tsx before ronda 8, verbatim (stable).
    switch (sort) {
      case "recent": out.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()); break;
      case "state": out.sort((a, b) => stateRank(a) - stateRank(b)); break;
      case "year": out.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity)); break;
      default: break;
    }
    return out.map((r) => r.id);
  };

  const walk = async (backlogId: string, sort: PagedSort, format: Format | null, limit: number, from?: Awaited<ReturnType<typeof getBacklogItemsPage>>) => {
    const ids: string[] = from ? from.rows.map((r) => r.id) : [];
    let after = from ? from.next : null;
    let pages = from ? 1 : 0;
    while (pages === 0 || after) {
      const page = await getBacklogItemsPage(backlogId, { sort, format, after, limit });
      assert.ok(++pages <= 200, "la paginación no termina");
      assert.ok(page.rows.length <= limit);
      if (page.next) assert.equal(page.rows.length, limit, "una página con siguiente va llena");
      ids.push(...page.rows.map((r) => r.id));
      after = page.next;
    }
    return { ids, pages };
  };
  const pg1 = await loadUserById("pg1");
  assert.ok(pg1);
  const asPg1 = <T>(fn: () => Promise<T>) => apiContext.run({ user: pg1 }, fn);
  const real = await q<{ media_type: Format; n: number }>(sql`select c.media_type, count(*)::int n from backlog_item b join catalog_item c on c.id = b.catalog_item_id where b.backlog_id = ${B} group by 1`);
  const realCount = (f: Format | null) => real.filter((r) => !f || r.media_type === f).reduce((s, r) => s + r.n, 0);
  assert.equal(realCount(null), N);

  // ---- (a) (b) (c): every paged order, whole and per format
  for (const sort of PAGED_SORTS) {
    const sizes: number[] = [];
    for (const format of [null, ...MEDIA]) {
      const expected = await reference(sort, format);
      assert.equal(expected.length, realCount(format));
      // 17 leaves a short last page; 25 divides 150 and 50 exactly (the last
      // page is FULL and must still say "no more").
      for (const limit of [17, 25]) {
        const got = await walk(B, sort, format, limit);
        const label = `${sort}/${format ?? "todos"}/${limit}`;
        assert.equal(new Set(got.ids).size, got.ids.length, `${label}: hay repetidos`);
        assert.deepEqual([...got.ids].sort(), [...expected].sort(), `${label}: el conjunto no es el de la colección`);
        assert.deepEqual(got.ids, expected, `${label}: el orden no es el de la lectura sin paginar`);
        assert.equal(got.pages, Math.ceil(expected.length / limit), `${label}: la última página debe venir sin cursor`);
      }
      // …and through the action: the cursor on the WIRE, the real page size.
      const wire: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 20; guard++) {
        const page = await asPg1(() => getCollectionPageAction({ backlogId: B, sort, format, cursor }));
        assert.ok(!page.error, `la action rechazó su propio cursor: ${cursor}`);
        wire.push(...page.items.map((it) => it.backlogItemId));
        assert.deepEqual(page.counts, { film: realCount("film"), series: realCount("series"), album: realCount("album") });
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      assert.equal(cursor, null);
      assert.deepEqual(wire, expected, `${sort}/${format ?? "todos"}: por la action (páginas de ${COLLECTION_PAGE_SIZE})`);
      sizes.push(expected.length);
    }
    ok(`colección paginada · ${sort}: ${sizes.join("/")} títulos (todos/film/series/album) en páginas de 17, 25 y ${COLLECTION_PAGE_SIZE} = la lectura sin paginar, sin repetidos ni huecos, última página sin cursor`);
  }

  // ---- (d) a title added and titles removed BETWEEN two pages
  const TOP = uuid(5, 1), BOTTOM = uuid(5, 2);
  for (const sort of PAGED_SORTS) {
    for (const [format, limit] of [[null, 17], ["film", 7]] as const) {
      await db.execute(sql`begin`);
      try {
        const before = await reference(sort, format);
        const first = await getBacklogItemsPage(B, { sort, format, limit });
        const anchor = first.rows[limit - 1].id; // the row the cursor was cut from
        const victim = before[limit + 5]; // not read yet
        assert.equal(before[limit - 1], anchor);
        // One title that reads FIRST in every order and one that reads LAST.
        for (const [id, year, obsessed, position, at] of [[TOP, 2030, true, null, "2026-09-30 00:00:00"], [BOTTOM, null, false, 2_000_000, "2001-01-01 00:00:00"]] as const) {
          await db.execute(sql`insert into catalog_item (id, source, external_id, media_type, title, year) values (${id}, 'tmdb', ${id}, 'film', 'nuevo', ${year})`);
          await db.execute(sql`insert into user_item (id, user_id, catalog_item_id, obsessed) values (${"pg-ui-" + id}, 'pg1', ${id}, ${obsessed})`);
          await db.execute(sql`insert into backlog_item (id, backlog_id, user_id, catalog_item_id, position, added_at) values (${id}, ${B}, 'pg1', ${id}, ${position}, ${at}::timestamp)`);
        }
        await db.execute(sql`delete from backlog_item where id in (${anchor}, ${victim})`);
        assert.equal((await reference(sort, format))[0], TOP, "el título nuevo de arriba sí lee primero");
        const got = await walk(B, sort, format, limit, first);
        const label = `${sort}/${format ?? "todos"}`;
        assert.equal(new Set(got.ids).size, got.ids.length, `${label}: una escritura entre páginas repitió filas`);
        // Everything that was there and still is, once and in order; the row
        // the cursor came from may vanish; what was added behind the cursor
        // shows up, what was added ahead of it doesn't (a refresh brings it).
        assert.deepEqual(got.ids, [...before.filter((id) => id !== victim), BOTTOM], `${label}: una escritura entre páginas saltó o movió filas`);
      } finally {
        await db.execute(sql`rollback`);
      }
    }
    ok(`colección paginada · ${sort}: insertar (antes y después del cursor) y borrar (la fila del cursor y una sin leer) entre dos páginas no repite ni salta nada`);
  }
  assert.equal(await one(sql`select count(*) n from backlog_item where backlog_id = ${B}`), N);

  // ---- (e) the counts the header and the pills read
  assert.deepEqual(await getBacklogKindCounts(B), { film: realCount("film"), series: realCount("series"), album: realCount("album") });
  assert.deepEqual(await getBacklogKindCounts(OTHER), { film: 24, series: 23, album: 23 });
  assert.deepEqual(await getBacklogKindCounts("pg-nope"), { film: 0, series: 0, album: 0 });
  ok("getBacklogKindCounts = el conteo real por formato (150 = 50/50/50; 70 = 24/23/23; vacía = ceros)");

  // ---- (f) a cursor that this list did not emit is refused, never "page 1"
  const firstOf = async (backlogId: string, sort: PagedSort) => {
    const page = await asPg1(() => getCollectionPageAction({ backlogId, sort, limit: 10 }));
    assert.ok(!page.error && page.nextCursor);
    return page.nextCursor;
  };
  for (const sort of PAGED_SORTS) {
    const own = await firstOf(B, sort);
    const again = await asPg1(() => getCollectionPageAction({ backlogId: B, sort, cursor: own, limit: 10 }));
    assert.ok(!again.error && again.items.length === 10, "control: su propio cursor sí pasa");
    for (const other of PAGED_SORTS) {
      if (other === sort) continue;
      assert.deepEqual(await asPg1(async () => getCollectionPageAction({ backlogId: B, sort, cursor: await firstOf(B, other), limit: 10 })), { error: "invalid" }, `${sort}: aceptó un cursor de ${other}`);
    }
    for (const bad of ["", "x", own.slice(0, -1), own + "0", own.replace(/\d{4}-\d{2}-\d{2}T/, "2026-02-30T"), `${sort}~~~`, own.replace("|", "|' or 1=1--")]) {
      assert.deepEqual(await asPg1(() => getCollectionPageAction({ backlogId: B, sort, cursor: bad, limit: 10 })), { error: "invalid" }, `${sort}: aceptó el cursor malformado "${bad}"`);
    }
    const elsewhere = await firstOf(OTHER, sort);
    assert.deepEqual(await asPg1(() => getCollectionPageAction({ backlogId: B, sort, cursor: elsewhere, limit: 10 })), { error: "invalid" }, `${sort}: aceptó un cursor de otra colección`);
  }
  ok("colección paginada: un cursor de otro orden, uno malformado y uno de OTRA colección se rechazan (invalid), en los cuatro órdenes");

  // ---- (g) the action re-authorizes every call
  for (const sort of PAGED_SORTS) {
    const foreign = await asPg1(() => getCollectionPageAction({ backlogId: FOREIGN, sort }));
    assert.deepEqual(foreign, { error: "not_found" });
    assert.deepEqual(await asPg1(() => getCollectionPageAction({ backlogId: "pg-nope", sort })), foreign, "ajena = inexistente");
  }
  assert.deepEqual(await asPg1(() => getCollectionAllAction(FOREIGN)), { error: "not_found" });
  const whole = await asPg1(() => getCollectionAllAction(B));
  assert.ok(!whole.error && whole.items.length === N);
  ok("collection-page-actions: una colección ajena responde not_found idéntico a una inexistente, sin filas (página y colección entera)");
}

main().then(() => { console.log(`\nharness ok (${n})`); return pool.end(); }).catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
