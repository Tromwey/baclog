import "server-only";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { partyLabAttempts, partyLabPlayers, partyLabSeals } from "@/db/schema";
import mapa from "../../../public/party/laberinto/mapa.json";
import logros from "../../../public/party/mausoleo/logros.json";
import { PARTY_EVENT, costumeKey } from "./event";
import { LAB_ELENCO_FUERA, LAB_EVENTO, LAB_NICHOS, LAB_OUIJA, LAB_RSVP_UMBRAL, normalNombre } from "./lab-config";
import { partyRsvps } from "@/db/schema";
import { saveRsvp } from "./rsvp";

/*
 * The seal server of the /party labyrinth — the contract of the design's
 * "PLAN - Laberinto.md", which the labyrinth's own client (public/party/
 * laberinto/api.js) already speaks; before this it was answered by a mock in
 * localStorage. Players are anonymous (one link for everyone): a device id the
 * page mints + a nickname. Nothing is validated beyond "the tombstone exists
 * and the token is single-use" — that is the design's decision, not an
 * oversight: the token only makes saving idempotent.
 */

/** Tombstones that give a seal: the ones with a minigame. */
const LAPIDAS: string[] = Object.values(mapa.lapidas as Record<string, { id: string; juego?: string }>)
  .filter((l) => l.juego)
  .map((l) => l.id);
export const LAB_SEALS = LAPIDAS.length;

/**
 * Seals won INSIDE the Mausoleum (design v3): the tarot table's drawer and one
 * drawer per achievement plaque. The client registers them at the urn
 * (`POST /mausoleo/entregar { extras }`) and they count like the tombstones'
 * — total, niches, scoreboard. Only these ids are accepted.
 */
const EXTRAS = new Set(["extra:mesa", ...(logros.logros as { id: string }[]).map((l) => "extra:logro-" + l.id)]);

/**
 * Every seal a player can get — a seal is a seal, wherever it was earned (founder, 2026-10-02: tombstones and
 * the Mausoleum's drawers are just different ways to get one). "Finished" = all of them.
 */
export const LAB_SEALS_TOTAL = LAB_SEALS + EXTRAS.size;

/** Anonymous writes: these bound a flood. */
const MAX_PLAYERS = 2000;
const MAX_ATTEMPTS_PER_DEVICE = 200;
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

const SLUG = PARTY_EVENT.slug;

export class LabError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** The page's device id: a UUID, or its `d…` fallback where crypto.randomUUID is missing. */
export function parseDevice(raw: string | null): string {
  const v = (raw ?? "").trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(v)) throw new LabError(400, "dispositivo_invalido");
  return v;
}

const cleanApodo = (raw: unknown) =>
  String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 24) || null;

type Sello = { ganado: string; entregado: string | null };

/** The player's row, created on first contact. */
async function touch(deviceId: string) {
  const [row] = await db
    .update(partyLabPlayers)
    .set({ lastSeenAt: new Date() })
    .where(eq(partyLabPlayers.deviceId, deviceId))
    .returning();
  if (row) return row;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(partyLabPlayers)
    .where(eq(partyLabPlayers.eventSlug, SLUG));
  if (n >= MAX_PLAYERS) throw new LabError(503, "lleno");
  await db.insert(partyLabPlayers).values({ deviceId, eventSlug: SLUG }).onConflictDoNothing();
  const [made] = await db.select().from(partyLabPlayers).where(eq(partyLabPlayers.deviceId, deviceId));
  return made;
}

async function sellosOf(deviceId: string): Promise<Record<string, Sello>> {
  const rows = await db.select().from(partyLabSeals).where(eq(partyLabSeals.deviceId, deviceId));
  return Object.fromEntries(
    rows.map((r) => [r.lapida, { ganado: r.wonAt.toISOString(), entregado: r.deliveredAt?.toISOString() ?? null }]),
  );
}

/**
 * Everyone's seals, as bare numbers — what any player may see (the collective
 * count). Never who.
 */
export async function labResumen() {
  const [r] = await db
    .select({
      ganados: sql<number>`count(*)::int`,
      entregados: sql<number>`count(${partyLabSeals.deliveredAt})::int`,
    })
    .from(partyLabSeals)
    .innerJoin(partyLabPlayers, eq(partyLabPlayers.deviceId, partyLabSeals.deviceId))
    .where(eq(partyLabPlayers.eventSlug, SLUG));
  return { ganados: r.ganados, entregados: r.entregados, porJugador: LAB_SEALS_TOTAL };
}

/** GET /progreso */
export async function labProgreso(deviceId: string) {
  const player = await touch(deviceId);
  const [sellos, todos] = await Promise.all([sellosOf(deviceId), labResumen()]);
  return { sellos, apodo: player.apodo, mausoleo: { abierto: true }, todos };
}

/** PUT /jugador { apodo } */
export async function labSetApodo(deviceId: string, raw: unknown) {
  await touch(deviceId);
  const apodo = cleanApodo(raw);
  await db
    .update(partyLabPlayers)
    .set({ apodo, apodoKey: apodo ? costumeKey(apodo) : null })
    .where(eq(partyLabPlayers.deviceId, deviceId));
  return { apodo };
}

/** POST /intentos { lapida } — 404 unknown tombstone, 409 already sealed. */
export async function labIniciar(deviceId: string, lapida: unknown) {
  if (typeof lapida !== "string" || !LAPIDAS.includes(lapida)) throw new LabError(404, "lapida_desconocida");
  await touch(deviceId);
  const [has] = await db
    .select({ lapida: partyLabSeals.lapida })
    .from(partyLabSeals)
    .where(and(eq(partyLabSeals.deviceId, deviceId), eq(partyLabSeals.lapida, lapida)));
  if (has) throw new LabError(409, "ya_sellada");
  // Old unanswered attempts go; what's left bounds how many one device can pile up.
  await db
    .delete(partyLabAttempts)
    .where(
      and(
        eq(partyLabAttempts.deviceId, deviceId),
        isNull(partyLabAttempts.respuesta),
        lt(partyLabAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    );
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(partyLabAttempts)
    .where(eq(partyLabAttempts.deviceId, deviceId));
  if (n >= MAX_ATTEMPTS_PER_DEVICE) throw new LabError(429, "demasiados_intentos");
  const token = "int_" + randomBytes(12).toString("hex");
  await db.insert(partyLabAttempts).values({ token, deviceId, lapida });
  return {
    token,
    semilla: randomBytes(4).readUInt32BE(0),
    expira: new Date(Date.now() + ATTEMPT_TTL_MS).toISOString(),
  };
}

/** POST /intentos/{token}/resultado { gano, ms } — idempotent per token. */
export async function labResultado(deviceId: string, token: string, body: { gano?: unknown; ms?: unknown }) {
  const [it] = await db
    .select()
    .from(partyLabAttempts)
    .where(and(eq(partyLabAttempts.token, token), eq(partyLabAttempts.deviceId, deviceId)));
  if (!it) throw new LabError(404, "token_desconocido");
  if (it.respuesta) return it.respuesta as { sello: ({ lapida: string } & Sello) | null };
  let sello: ({ lapida: string } & Sello) | null = null;
  if (body.gano === true) {
    const ms = typeof body.ms === "number" && Number.isFinite(body.ms) ? Math.max(0, Math.min(Math.round(body.ms), 3_600_000)) : null;
    await db.insert(partyLabSeals).values({ deviceId, lapida: it.lapida, ms }).onConflictDoNothing();
    const [row] = await db
      .select()
      .from(partyLabSeals)
      .where(and(eq(partyLabSeals.deviceId, deviceId), eq(partyLabSeals.lapida, it.lapida)));
    sello = { lapida: it.lapida, ganado: row.wonAt.toISOString(), entregado: row.deliveredAt?.toISOString() ?? null };
  }
  const respuesta = { sello };
  await db.update(partyLabAttempts).set({ respuesta }).where(eq(partyLabAttempts.token, token));
  return respuesta;
}

/** How many seals this player has delivered. */
async function entregadosDe(deviceId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(${partyLabSeals.deliveredAt})::int` })
    .from(partyLabSeals)
    .where(eq(partyLabSeals.deviceId, deviceId));
  return n;
}

/**
 * GET /mausoleo — the group state: seals delivered by everyone, the caller's
 * own, and the niches. A closed niche travels as id + threshold only; its
 * title and text leave the server once the group total opens it.
 */
export async function labMausoleo(deviceId: string) {
  await touch(deviceId);
  const [{ entregados: total }, tuyos] = await Promise.all([labResumen(), entregadosDe(deviceId)]);
  return {
    total,
    tuyos,
    nichos: LAB_NICHOS.map((n) => (total >= n.umbral ? { ...n, abierto: true } : { id: n.id, umbral: n.umbral, abierto: false })),
  };
}

/**
 * GET /calendario — the party as an .ics, or null until the group has opened the last niche (the credits that
 * link here only play then; before that the date and place are still being earned).
 */
export async function labCalendario(): Promise<string | null> {
  const { entregados } = await labResumen();
  if (entregados < LAB_NICHOS[LAB_NICHOS.length - 1].umbral) return null;
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kura//Party//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${SLUG}@get-kura.app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${LAB_EVENTO.inicio}`,
    `DTEND:${LAB_EVENTO.fin}`,
    `SUMMARY:${esc(LAB_EVENTO.titulo)}`,
    `LOCATION:${esc(LAB_EVENTO.lugar)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** POST /mausoleo/entregar { extras } — registers the Mausoleum's own seals, then delivers every seal the player holds. */
export async function labEntregar(deviceId: string, rawExtras: unknown) {
  await touch(deviceId);
  const extras = Array.isArray(rawExtras) ? [...new Set(rawExtras.filter((x): x is string => typeof x === "string" && EXTRAS.has(x)))] : [];
  if (extras.length) {
    await db
      .insert(partyLabSeals)
      .values(extras.map((lapida) => ({ deviceId, lapida })))
      .onConflictDoNothing();
  }
  const en = new Date();
  const rows = await db
    .update(partyLabSeals)
    .set({ deliveredAt: en })
    .where(and(eq(partyLabSeals.deviceId, deviceId), isNull(partyLabSeals.deliveredAt)))
    .returning({ lapida: partyLabSeals.lapida });
  return { entregados: rows.map((r) => r.lapida), en: en.toISOString(), ...(await labMausoleo(deviceId)) };
}

/**
 * GET /mausoleo/marcador — who delivered the most. Only players who signed
 * with a nickname appear (the anonymous still count in the total); the
 * nickname is what they chose to show, and nothing else about them travels.
 */
export async function labMarcador(deviceId: string) {
  const player = await touch(deviceId);
  const rows = await db
    .select({
      deviceId: partyLabPlayers.deviceId,
      apodo: partyLabPlayers.apodo,
      sellos: sql<number>`count(${partyLabSeals.deliveredAt})::int`,
    })
    .from(partyLabPlayers)
    .innerJoin(partyLabSeals, eq(partyLabSeals.deviceId, partyLabPlayers.deviceId))
    .where(and(eq(partyLabPlayers.eventSlug, SLUG), sql`${partyLabPlayers.apodo} is not null`))
    .groupBy(partyLabPlayers.deviceId)
    .having(sql`count(${partyLabSeals.deliveredAt}) > 0`);
  const firmados = await db
    .select({ apodo: partyLabPlayers.apodo })
    .from(partyLabPlayers)
    .where(and(eq(partyLabPlayers.eventSlug, SLUG), sql`${partyLabPlayers.apodo} is not null`));
  const filas = rows
    .map((r) => ({ ...r, apodo: r.apodo as string }))
    .sort((a, b) => b.sellos - a.sellos || a.apodo.localeCompare(b.apodo, "es"));
  const puesto = filas.findIndex((f) => f.deviceId === deviceId) + 1;
  return {
    top: filas.slice(0, 8).map((f, i) => ({ puesto: i + 1, apodo: f.apodo, sellos: f.sellos, tu: f.deviceId === deviceId })),
    tu: { puesto: puesto || null, sellos: await entregadosDe(deviceId), apodo: player.apodo },
    firmados: filas.length,
    /** Everyone who signed with a nickname (minus the host), delivered or not, A–Z, one line per nickname — the cast of the final credits. */
    elenco: [...new Map(firmados.map((f) => [normalNombre(f.apodo as string), f.apodo as string])).values()]
      .filter((apodo) => !LAB_ELENCO_FUERA.includes(normalNombre(apodo)))
      .sort((x, y) => x.localeCompare(y, "es", { sensitivity: "base" }))
      .slice(0, 120),
  };
}

/**
 * POST /ouija { nombre } — the message depends on the name: each name walks
 * its texts in order; no match gets a generic one.
 */
export async function labOuija(deviceId: string, raw: unknown) {
  const n = normalNombre(raw);
  if (!n) throw new LabError(400, "falta_nombre");
  const player = await touch(deviceId);
  const uno = n.split(" ")[0];
  const k = LAB_OUIJA.mensajes.findIndex((m) =>
    m.para.some((p) => {
      const q = normalNombre(p);
      return q === n || q === uno;
    }),
  );
  const textos = k >= 0 ? LAB_OUIJA.mensajes[k].textos : LAB_OUIJA.generico;
  const clave = k >= 0 ? "m" + k : "g";
  const veces = player.ouija ?? {};
  const i = veces[clave] ?? 0;
  await db
    .update(partyLabPlayers)
    .set({ ouija: { ...veces, [clave]: i + 1 } })
    .where(eq(partyLabPlayers.deviceId, deviceId));
  return { texto: textos[i % textos.length] ?? "...", para: k >= 0 };
}

/**
 * RSVP through the ouija. It lands in `party_rsvp` (the /party invitation's
 * table, already read by /admin/party) under the guest token `lab:<device>`
 * and the player's nickname. Open only once the group revealed the place.
 */
const rsvpToken = (deviceId: string) => "lab:" + deviceId;

/** GET /rsvp → { abierta, umbral, total, respuesta: { va, acompanante } | null } */
export async function labRsvpEstado(deviceId: string) {
  await touch(deviceId);
  const [{ entregados: total }, [r]] = await Promise.all([
    labResumen(),
    db
      .select({ va: partyRsvps.attending, acompanante: partyRsvps.plusOne })
      .from(partyRsvps)
      .where(and(eq(partyRsvps.eventSlug, SLUG), eq(partyRsvps.guestToken, rsvpToken(deviceId)))),
  ]);
  return { abierta: total >= LAB_RSVP_UMBRAL, umbral: LAB_RSVP_UMBRAL, total, respuesta: r ?? null };
}

/** POST /rsvp { va, acompanante } — 403 before the place is revealed, 400 without a nickname. */
export async function labRsvp(deviceId: string, body: { va?: unknown; acompanante?: unknown }) {
  const estado = await labRsvpEstado(deviceId);
  if (!estado.abierta) throw new LabError(403, "cerrada");
  const [p] = await db.select({ apodo: partyLabPlayers.apodo }).from(partyLabPlayers).where(eq(partyLabPlayers.deviceId, deviceId));
  if (!p?.apodo) throw new LabError(400, "falta_nombre");
  const va = body.va === true;
  const acompanante = va && body.acompanante === true;
  const r = await saveRsvp({
    guestToken: rsvpToken(deviceId),
    name: p.apodo,
    attending: va,
    plusOne: acompanante,
    plusName: "",
    diets: [],
    drink: "",
    costume: "",
  });
  if (r === "full") throw new LabError(503, "lleno");
  return { respuesta: { va, acompanante } };
}

/**
 * The host's live monitor (Torre › /admin/party, refreshed every few seconds). Admin-only: callers gate with
 * requireAdmin(). Only what the server knows — seals, deliveries, nicknames, RSVPs; cards, achievements and
 * the like live on each phone. A seal is a seal: no split by where it was earned.
 */
export async function labMonitor() {
  const [jugadores, sellos, rsvps] = await Promise.all([
    db
      .select({ deviceId: partyLabPlayers.deviceId, apodo: partyLabPlayers.apodo, lastSeenAt: partyLabPlayers.lastSeenAt, createdAt: partyLabPlayers.createdAt })
      .from(partyLabPlayers)
      .where(eq(partyLabPlayers.eventSlug, SLUG)),
    db
      .select({ deviceId: partyLabSeals.deviceId, wonAt: partyLabSeals.wonAt, deliveredAt: partyLabSeals.deliveredAt })
      .from(partyLabSeals)
      .innerJoin(partyLabPlayers, eq(partyLabPlayers.deviceId, partyLabSeals.deviceId))
      .where(eq(partyLabPlayers.eventSlug, SLUG)),
    db
      .select({ token: partyRsvps.guestToken, va: partyRsvps.attending, acompanante: partyRsvps.plusOne, updatedAt: partyRsvps.updatedAt })
      .from(partyRsvps)
      .where(and(eq(partyRsvps.eventSlug, SLUG), sql`${partyRsvps.guestToken} like 'lab:%'`)),
  ]);
  const rsvpDe = new Map(rsvps.map((r) => [r.token.slice(4), r]));
  const porJugador = new Map<string, { ganados: number; entregados: number }>();
  for (const s of sellos) {
    const p = porJugador.get(s.deviceId) ?? { ganados: 0, entregados: 0 };
    p.ganados++;
    if (s.deliveredAt) p.entregados++;
    porJugador.set(s.deviceId, p);
  }
  const nombre = new Map(jugadores.map((j) => [j.deviceId, j.apodo ?? "sin apodo"]));
  const entregados = sellos.filter((s) => s.deliveredAt).length;

  // Activity: seals won, deliveries (grouped: one urn = one event), RSVPs — newest first.
  type Evento = { at: Date; quien: string; codigo: string; que: string };
  const eventos: Evento[] = [];
  const entregas = new Map<string, Evento & { n: number }>();
  for (const s of sellos) {
    eventos.push({ at: s.wonAt, quien: nombre.get(s.deviceId) ?? "?", codigo: s.deviceId.slice(0, 4), que: "ganó un sello" });
    if (s.deliveredAt) {
      const k = s.deviceId + "|" + s.deliveredAt.getTime();
      const e = entregas.get(k) ?? { at: s.deliveredAt, quien: nombre.get(s.deviceId) ?? "?", codigo: s.deviceId.slice(0, 4), que: "", n: 0 };
      e.n++;
      entregas.set(k, e);
    }
  }
  for (const e of entregas.values()) eventos.push({ ...e, que: e.n === 1 ? "entregó 1 sello" : `entregó ${e.n} sellos` });
  for (const r of rsvps) {
    const id = r.token.slice(4);
    eventos.push({ at: r.updatedAt, quien: nombre.get(id) ?? "?", codigo: id.slice(0, 4), que: r.va ? (r.acompanante ? "confirmó que va, con acompañante" : "confirmó que va") : "dijo que no va" });
  }
  eventos.sort((a, b) => b.at.getTime() - a.at.getTime());

  const ahora = Date.now();
  return {
    ahora,
    total: {
      entregados,
      ganados: sellos.length,
      jugadores: jugadores.length,
      activos: jugadores.filter((j) => ahora - j.lastSeenAt.getTime() < 15 * 60 * 1000).length,
      porJugador: LAB_SEALS_TOTAL,
    },
    nichos: LAB_NICHOS.map((n) => ({ id: n.id, titulo: n.titulo, umbral: n.umbral, abierto: entregados >= n.umbral })),
    rsvp: {
      umbral: LAB_RSVP_UMBRAL,
      abierta: entregados >= LAB_RSVP_UMBRAL,
      van: rsvps.filter((r) => r.va).length,
      personas: rsvps.reduce((n, r) => n + (r.va ? (r.acompanante ? 2 : 1) : 0), 0),
      noVan: rsvps.filter((r) => !r.va).length,
    },
    jugadores: jugadores
      .map((j) => {
        const p = porJugador.get(j.deviceId) ?? { ganados: 0, entregados: 0 };
        const r = rsvpDe.get(j.deviceId);
        return {
          codigo: j.deviceId.slice(0, 4),
          apodo: j.apodo,
          ganados: p.ganados,
          entregados: p.entregados,
          lastSeenAt: j.lastSeenAt,
          rsvp: r ? (r.va ? (r.acompanante ? "va +1" : "va") : "no va") : null,
        };
      })
      .sort((a, b) => b.ganados - a.ganados || b.lastSeenAt.getTime() - a.lastSeenAt.getTime()),
    actividad: eventos.slice(0, 30),
  };
}

/** Admin-only read (Torre › /admin/party). Callers gate with requireAdmin(). */
export async function listLabPlayers() {
  return db
    .select({
      deviceId: partyLabPlayers.deviceId,
      apodo: partyLabPlayers.apodo,
      createdAt: partyLabPlayers.createdAt,
      lastSeenAt: partyLabPlayers.lastSeenAt,
      ganados: sql<number>`count(${partyLabSeals.lapida})::int`,
      entregados: sql<number>`count(${partyLabSeals.deliveredAt})::int`,
      ultimoSello: sql<Date | null>`max(${partyLabSeals.wonAt})`,
    })
    .from(partyLabPlayers)
    .leftJoin(partyLabSeals, eq(partyLabSeals.deviceId, partyLabPlayers.deviceId))
    .where(eq(partyLabPlayers.eventSlug, SLUG))
    .groupBy(partyLabPlayers.deviceId)
    .orderBy(desc(sql`count(${partyLabSeals.lapida})`), desc(partyLabPlayers.lastSeenAt));
}
