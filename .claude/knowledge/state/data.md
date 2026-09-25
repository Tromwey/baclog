# Estado — data

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: 2026-09-24 (migración 0027 aplicada: `token_version` + `notify_recap` · 0028 `user_block` generada, SIN aplicar)

## Qué cubre este dominio
<!-- Esquema Drizzle, migraciones, conexión a Neon y forma de las queries.
     Quién puede leer/escribir qué va en `security.md`; las Server Actions que consumen esto, en `backend.md`. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `src/db/schema.ts` | Esquema completo: enums, tablas y `relations` de Drizzle |
| `src/db/index.ts` | Cliente Drizzle sobre `@neondatabase/serverless` |
| `drizzle/*.sql` | Migraciones versionadas, numeradas `0000…` en adelante |
| `drizzle/meta/` | Snapshots y journal de drizzle-kit (generados — no editar a mano) |
| `drizzle.config.ts` | Config de drizzle-kit (dialecto, rutas, credenciales) |
| `scripts/seed-curators.ts` | Único script de siembra del repo |

Tablas principales en `schema.ts`: `users` (con `token_version` y `notify_recap` desde 0027), `sessions`/`accounts`/`verificationTokens` (adapter de
NextAuth), `catalogItems`, `backlogs`, `backlogItems`, `userItems`, `itemReviews`, `userFollows`,
`mediaLinks`, `crossMediaLinks`, `crossMediaRecs`, `crossMediaRecUsage`, `crossMediaRecSeen`,
`crossMediaRecoFeedback`, `llmCallLog`, `analyticsEvents`, `waitlistEntries`, `waitlistReferrals`,
`recapSends`, `releaseNotices`, `reports`, `userAvatars` (F3.11), `userBlocks` (App Store 1.2, 0028 — sin aplicar).

Últimas migraciones: **0023 `user_follows`** (F3.10, aditiva-inocua — `user_follow` con unique
`(follower, followed)` + índice en `followed`) y **0024 `backlog_visibility`** (F3.10.1, aditiva —
`backlog.is_public` + `backlog.show_on_profile`, ambas boolean NOT NULL DEFAULT true; "featured"
se deriva como `is_public AND show_on_profile`, ver AGENTS.md). **Ambas aplicadas a la DB
compartida el 2026-08-26**, antes del deploy del código, según el patrón de la casa. El feed social
NO tiene tabla propia: se deriva (ver AGENTS.md). **0025 `tidal_service`** (2026-09-02, aditiva —
`ALTER TYPE ... ADD VALUE 'tidal'` en `preferred_service` y `link_service`; el cuarto servicio de
música junto a Spotify/Apple Music/YouTube Music). Los valores del enum viven en CUATRO listas que
hay que mantener a mano al agregar un servicio: `schema.ts` (ambos enums), el `z.enum` de
`api/links/resolve/route.ts`, el `valid` de `setPreferredServiceAction`, y la unión
`MusicService`/`buildSearchFallback` en `modules/links/` — más los `SERVICES` de onboarding/settings
y los botones de `u/[username]/item/`. **0026 `user_avatar`** (F3.11 foto de perfil, 2026-09-02,
aditiva, **aplicada por el founder en la DB compartida el 2026-09-02** con `drizzle-kit migrate` — tabla nueva `user_avatar(user_id PK→user cascade, key UNIQUE, content_type, bytes bytea,
updated_at)`; los bytes van en tabla propia para que la fila caliente `user` nunca cargue ~40 KB, y
`users.image` (la columna de Auth.js, antes sin uso) guarda la URL servida `/api/avatar/{key}`). El
`bytea` es un `customType` en `schema.ts`: sale como texto hex `\x…` (el driver HTTP de Neon
serializa params a JSON, un Buffer no sobrevive) y vuelve como Buffer. ⚠️ 0025 se escribió a mano SIN
snapshot en `drizzle/meta/`, así que el `generate` de 0026 re-emitió los `ADD VALUE 'tidal'` — se
quitaron del SQL a mano y el snapshot 0026 es el primero que incluye `tidal` (learning
`2026-09-02-migracion-a-mano-sin-snapshot-reemite-cambios.md`).
**0027 `user_token_version_notify_recap`** (fase 4b Kura iOS, **aplicada en la DB compartida el
2026-09-24**, aditiva sin backfill — dos `ALTER TABLE "user" ADD COLUMN`: `token_version integer DEFAULT 0
NOT NULL` y `notify_recap boolean DEFAULT true NOT NULL`; reemplazó a la `0027_user_token_version` que se
generó primero y nunca se aplicó, así que journal y snapshot 0027 ya llevan las dos columnas y `schema.ts` las
declara: `drizzle-kit generate` vuelve a ser seguro — no se corrió para comprobarlo en el cierre de 4b).
`token_version`: revocación del bearer móvil Y de la cookie web — cada bearer, cookie y handoff lleva el `tv`
con que se acuñó y la relectura por request lo compara; el ÚNICO escritor es `POST /api/v1/auth/logout`
(`token_version + 1` atómico). Viaja AL LADO del usuario (`loadUserWithTokenVersion` en
`src/auth/user-row.ts`), nunca en `CurrentUser`/`Me`. `notify_recap`: baja del correo mensual del recap
(default `true` como `notify_releases`, porque el correo ya existía); SÍ va en `USER_COLUMNS` → `CurrentUser`
→ `Me`, nunca en `Person`; lectores: `api/cron/recap` (audiencia) y Ajustes.

**0028 `user_block`** (App Store 1.2 — reportar y bloquear, 2026-09-24; **generada con `drizzle-kit generate`, NO
aplicada**: la aplica el founder en la DB compartida). Aditiva-inocua: `CREATE TABLE user_block (blocker_user_id
text NOT NULL → user ON DELETE CASCADE, blocked_user_id text NOT NULL → user ON DELETE CASCADE, created_at
timestamp DEFAULT now() NOT NULL, PK (blocker_user_id, blocked_user_id))` + índice `user_block_blocked_idx` en
`blocked_user_id` (la otra mitad del gate). Guardada en un sentido, **mutua en visibilidad** (AGENTS.md). ⚠️ **Orden
obligatorio: aplicar 0028 ANTES de desplegar el código** — `notBlockedWith` vive en queries calientes (feed,
reseñas de la ficha, búsqueda, `followUser`) y sin la tabla responden 500 (42P01); no hay kill-switch. Probada
sobre un Postgres 17 local limpio: 0000–0028 aplican en orden sin errores. Borrar una cuenta cascadea sus
bloqueos en ambos sentidos (no hace falta tocar `deleteAccount`).

Deuda anotada: las ramas del feed ordenan por timestamps sin índice compuesto `(user_id, <at>)`
(escanean por `user_id` y ordenan). Costo por página de `/feed` (feed v2): 1 query de ids seguidos + por
chunk 4 ramas en paralelo (`limit+1` = 25 filas cada una) + 1 query de ADN solo para autores no vistos;
lo normal es 1 chunk (3 saltos serie), el techo es `FEED_MAX_CHUNKS` = 6 chunks (una ráfaga de >144 adds
se corta ahí). Irrelevante a decenas de usuarios, revisar si el feed crece.

Regla de queries: un instante JS en un template `sql\`…\`` va SIEMPRE como `toISOString()::timestamp`
(`atParam` en `modules/social/queries.ts`), nunca como `Date` crudo — el driver lo serializa con el offset
local y las columnas `timestamp` sin zona lo descartan (learning 2026-09-02-date-crudo-…).

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda.
     El modelo de datos de ítems en tres niveles (backlog_item = membresía, user_item = estado por
     título, catalog_item.paletteHex = paleta compartida) está documentado en AGENTS.md. -->
- **`catalog_item.raw` NO es solo el payload de búsqueda.** Para series TMDB se le funden (jsonb `||`) cuatro campos de `GET /tv/{id}` (`status`, `number_of_seasons`, `in_production`, `last_air_date`) más un marcador nuestro `_series_facts_at` (ISO) — ver `modules/catalog/series-status.ts`. El upsert de `search.ts` no toca `raw` en conflicto, así que sobreviven; cualquier código que REEMPLACE `raw` entero (en vez de fundir) borra el enriquecimiento y el siguiente view lo vuelve a pedir a TMDB (se autocura, pero cuesta una llamada). Claves con `_` inicial dentro de `raw` son nuestras, nunca del proveedor.

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->
- **0028 `user_block` pendiente de aplicar (2026-09-24)** — `drizzle/0028_user_block.sql` + snapshot/journal 0028
  en el árbol, sin commit. Aplicarla (founder) antes de cualquier deploy que incluya `modules/social/block-gate.ts`.
  Después: `pnpm tsx scripts/api-smoke.ts --only writes` con cuenta QA corre los casos E1 de reportar/bloquear.

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
