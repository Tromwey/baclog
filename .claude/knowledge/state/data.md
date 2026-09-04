# Estado — data

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: YYYY-MM-DD

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

Tablas principales en `schema.ts`: `users`, `sessions`/`accounts`/`verificationTokens` (adapter de
NextAuth), `catalogItems`, `backlogs`, `backlogItems`, `userItems`, `itemReviews`, `userFollows`,
`mediaLinks`, `crossMediaLinks`, `crossMediaRecs`, `crossMediaRecUsage`, `crossMediaRecSeen`,
`crossMediaRecoFeedback`, `llmCallLog`, `analyticsEvents`, `waitlistEntries`, `waitlistReferrals`,
`recapSends`, `releaseNotices`, `reports`, `userAvatars` (F3.11).

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

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
