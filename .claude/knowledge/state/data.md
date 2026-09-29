# Estado — data

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: 2026-09-29 (migración 0033 `party_collections` generada, SIN aplicar — colecciones de fiesta, detrás de `MIGRATION_0033_LIVE`) · 2026-09-28 (migración 0032 `party_rsvp` generada — invitación /party) · 2026-09-27 (migración 0031 `follow_lists_visibility` generada, SIN aplicar — va DESPUÉS de 0030) · 2026-09-27 (migración 0030 `collection_curation` generada, SIN aplicar) · 2026-09-24 (fase 4g fusión de cuentas, sin migración · migración 0027 aplicada: `token_version` + `notify_recap` · 0028 `user_block` y 0029 `device_sessions_push` generadas, SIN aplicar)

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
`recapSends`, `releaseNotices`, `reports`, `userAvatars` (F3.11), `parties`/`partyInvites`/`partySongs` (colecciones de fiesta, 0033 — sin aplicar), `userBlocks` (App Store 1.2, 0028 — sin aplicar), `mobileSessions`, `deviceTokens` (+ enum `apns_environment`), `followPushNotices` (fases 4d/4e, 0029 — sin aplicar).

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

**0029 `device_sessions_push`** (Kura iOS fases 4d/4e, 2026-09-24; **generada con `drizzle-kit generate`, NO aplicada**). Aditiva: `CREATE TYPE apns_environment ('sandbox','production')`; `mobile_session (id uuid PK DEFAULT gen_random_uuid(), user_id text NOT NULL → user CASCADE, platform/device_name/app_version text NOT NULL, created_at/last_seen_at timestamp DEFAULT now() NOT NULL, revoked_at timestamp)` + índice `mobile_session_user_idx`; `device_token (token text PK, user_id → user CASCADE, session_id uuid → mobile_session CASCADE NULL, environment apns_environment NOT NULL, created_at, updated_at)` + índices por `user_id` y `session_id`; `follow_push_notice (follower_user_id, followed_user_id → user CASCADE, sent_at DEFAULT now(), PK (follower, followed))` + índice por `followed_user_id`; `ALTER TABLE "user" ADD COLUMN notify_followers boolean DEFAULT true NOT NULL`. Probada sobre Postgres 17 local limpio: 0000–0029 aplican en orden sin errores. ⚠️ `users.notifyFollowers` está **COMENTADA** en `schema.ts` (Drizzle nombra toda columna declarada en cada `insert(users)`: declararla antes del ALTER rompe todo alta de cuenta — learning 2026-09-24-columna-declarada-sin-migrar-rompe-inserts); se lee/escribe con SQL crudo detrás de `MIGRATION_0029_LIVE`. El snapshot 0029 SÍ la incluye: **nadie corre `drizzle-kit generate` mientras la línea esté comentada** (emitiría un DROP COLUMN). Las tres tablas nuevas sí están declaradas (declarar una tabla no afecta queries ajenas; solo se consultan con el switch en `true`). Borrar una cuenta cascadea sesiones, tokens y throttle.

**0030 `collection_curation`** (Colecciones formalizado, 2026-09-27; **generada con `drizzle-kit generate`, NO aplicada**). Aditiva: `backlog.pinned_at timestamp NULL` + índice único parcial `backlog_one_pinned_per_user (user_id) WHERE pinned_at IS NOT NULL` (una fijada por cuenta; `setBacklogPinned` limpia la vieja y fija la nueva en un `db.batch`), `backlog.cover_catalog_item_id text NULL → catalog_item ON DELETE SET NULL` (portada elegida; se resuelve contra las membresías y se ignora si el título ya no está — `fanOf` en `modules/backlog/fan.ts`; `setBacklogCover` exige la membresía EN la misma sentencia), `backlog_item.position integer NULL` (orden manual; leer con `MANUAL_ORDER` = `position asc nulls first, added_at desc` en `queries.ts` o su gemelo JS `byManualOrder`; `reorderBacklogItems` renumera toda la colección en UNA sentencia vía `jsonb_array_elements_text … with ordinality`, 0…n−1 sin huecos, ids ajenos no coinciden) y la tabla `backlog_collaborator (backlog_id → backlog CASCADE, user_id → user CASCADE, created_at, PK (backlog_id, user_id))` + índice por `user_id` — su único escritor es `joinParty` (colecciones de fiesta, 0033: un invitado que entra por el link de una fiesta; `blocked_at` es de 0033). Los lectores de crédito (`collaborators.ts`) solo leen colecciones NO fiesta (shelves excluye fiestas; `public.ts` solo públicas), así que hoy nunca muestran a nadie. Probada sobre Postgres 16 local limpio: 0000–0030 aplican en orden. ⚠️ **Orden obligatorio: aplicar 0030 ANTES de desplegar el código** — `backlogs`/`backlogItems` declaran las columnas nuevas y `assertOwnsBacklog` hace `select()` de toda la fila: sin la migración, TODA pantalla de colecciones responde 500 (42703). Desde 2026-09-27 la API v1 también lee el orden manual (`Collection.titleIds`/`PersonCollection.titleIds`, vía `byManualOrder`) y expone `pinned`, `chosenCoverTitleId` y `fanTitleIds`; escribe con `PATCH /collections/{id} { pinned, coverTitleId }` y `PUT /collections/{id}/order` (`reorderBacklogTitles`, por `catalog_item_id`). `backlog_collaborator` NO viaja por la API (le falta el gate `notBlockedWith` con viewer).

**0031 `follow_lists_visibility`** (listas de seguidores como ajuste, founder 2026-09-27; **generada con `drizzle-kit generate`, NO aplicada**). Aditiva, sin backfill: `ALTER TABLE "user" ADD COLUMN "follow_lists_visibility" text DEFAULT 'private' NOT NULL` + `ADD CONSTRAINT "user_follow_lists_visibility_check" CHECK (… in ('public', 'mutuals', 'private'))`. TEXT + CHECK y no `pgEnum` para poder quitar un valor sin reconstruir un tipo; los valores viven en `FOLLOW_LISTS_VISIBILITY` (`schema.ts`) y de ahí salen el tipo de la columna, el zod de `PATCH /me` y el del wire. Default `private` = la postura previa para todas las cuentas existentes. Probada sobre Postgres 17 local limpio: 0000–0031 aplican en orden, el default se lee `private` y un valor fuera del CHECK se rechaza. ⚠️ **Orden obligatorio: aplicar 0031 ANTES de desplegar el código** (y después de 0030, que tampoco está aplicada) — `users.followListsVisibility` está declarada en `schema.ts` (Drizzle la nombra en cada `insert(users)`: sin la columna, toda alta de cuenta da 42703) y va en `USER_COLUMNS` (`src/auth/user-row.ts`), la lectura de CADA request con sesión (cookie y bearer): sin la migración, **toda la app responde 500**. Tampoco se puede correr el `next dev` compartido con este código antes de aplicarla. Se evaluó un kill-switch estilo `live-0029` (columna comentada + SQL crudo detrás de una constante) y se descartó: la columna es un ALTER aditivo de segundos, sin datos que migrar, y el switch duplicaría cada lectura/escritura en crudo; el orden basta. Pasos: `drizzle-kit migrate` (aplica 0030 y 0031) → deploy → smoke `reads` + `writes` (casos "GET /people/{h}/followers…" y "E1 PATCH /me { followListsVisibility }…").

Deuda anotada: las ramas del feed ordenan por timestamps sin índice compuesto `(user_id, <at>)`
(escanean por `user_id` y ordenan). Costo por página de `/feed` (feed v2): 1 query de ids seguidos + por
chunk 4 ramas en paralelo (`limit+1` = 25 filas cada una) + 1 query de ADN solo para autores no vistos;
lo normal es 1 chunk (3 saltos serie), el techo es `FEED_MAX_CHUNKS` = 6 chunks (una ráfaga de >144 adds
se corta ahí). Irrelevante a decenas de usuarios, revisar si el feed crece.

Regla de queries: un instante JS en un template `sql\`…\`` va SIEMPRE como `toISOString()::timestamp`
(`atParam` en `modules/social/queries.ts`), nunca como `Date` crudo — el driver lo serializa con el offset
local y las columnas `timestamp` sin zona lo descartan (learning 2026-09-02-date-crudo-…).

**0032 `party_rsvp`** (invitación /party, 2026-09-28; generada con `drizzle-kit generate`). Aditiva-inocua: tabla nueva `party_rsvp (id uuid PK, event_slug, guest_token, name, attending, plus_one, plus_name, diets text[], drink, costume, created_at, updated_at)` + único `(event_slug, guest_token)`. **Sin FK a `user`** (los invitados son anónimos) → no entra en `MERGE_COVERAGE`. Ningún código existente la lee, así que el orden migración/deploy da igual para el resto de la app; solo el envío del RSVP en /party falla sin ella.

**0033 `party_collections`** (colecciones de fiesta, 2026-09-29; **generada con `drizzle-kit generate`, NO aplicada**). Aditiva: `ALTER TYPE media_type ADD VALUE 'track'`; tablas `party (backlog_id PK → backlog CASCADE, per_guest_limit smallint NULL CHECK 0..50, created_at)`, `party_invite (id uuid PK, backlog_id → backlog CASCADE, token text, created_at, revoked_at NULL)` + único `token` + único PARCIAL `(backlog_id) WHERE revoked_at IS NULL` (un link activo), `party_song (backlog_item_id PK → backlog_item CASCADE, backlog_id → backlog CASCADE, added_by_user_id → user SET NULL, added_at)` + índices `(backlog_id, added_by_user_id)` y `(added_by_user_id)`; y `backlog_collaborator.blocked_at timestamp NULL`. Probada sobre Postgres 17 local limpio: 0000–0033 aplican en orden, y un harness desechable (copia de `src` con `@/db` → node-postgres, `batch` = BEGIN/COMMIT en una conexión, switch en `true`) corrió 28 casos de fiestas contra ella (crear, unirse, topes, duplicados, bloqueo, link, lecturas anónimas, guards genéricos, borrar cuenta, fusionar). **Orden: aplicar 0033 → `MIGRATION_0033_LIVE = true` (`src/modules/party-collections/live.ts`) → deploy.** Con el switch en `false` el código corre igual que antes sobre una DB sin 0033 (ninguna ruta caliente nombra `party`/`party_song`/`blocked_at` ni el literal `'track'`); con `true` sin la migración, Colecciones da 500. El contrato completo para web/iOS: `state/fiesta-contract.md`.

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda.
     El modelo de datos de ítems en tres niveles (backlog_item = membresía, user_item = estado por
     título, catalog_item.paletteHex = paleta compartida) está documentado en AGENTS.md. -->
- **`catalog_item.raw` NO es solo el payload de búsqueda.** Para series TMDB se le funden (jsonb `||`) cuatro campos de `GET /tv/{id}` (`status`, `number_of_seasons`, `in_production`, `last_air_date`) más un marcador nuestro `_series_facts_at` (ISO) — ver `modules/catalog/series-status.ts`. El upsert de `search.ts` no toca `raw` en conflicto, así que sobreviven; cualquier código que REEMPLACE `raw` entero (en vez de fundir) borra el enriquecimiento y el siguiente view lo vuelve a pedir a TMDB (se autocura, pero cuesta una llamada). Claves con `_` inicial dentro de `raw` son nuestras, nunca del proveedor.

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->
- **Colecciones de fiesta: la fiesta es un `backlog` + fila en `party`, sin columna nueva en `backlog` (2026-09-29).** Una columna `kind`/`per_guest_limit` en la tabla caliente haría que cada `select()`/`insert(backlogs)` dependiera de la migración (la 0030 ya lo sufrió); la existencia de la fila `party` ES el tipo. La fiesta es **siempre privada** (`is_public = show_on_profile = false`; `updateBacklog` con `visibility` sobre una fiesta no matchea), así que todo lector cross-user que ya gatea `backlogs.isPublic` (feed, tendencias, `public.ts`, kurada, colecciones seguidas) la excluye sin tocarlo.
- **Atribución "quién puso cuál" en tabla lateral `party_song`, NO en `backlog_item` (2026-09-29).** `backlog_item.user_id` sigue siendo el DUEÑO (el anfitrión) — el invariante que usan `assertOwnsBacklogItem`, el move de `mergeAccounts` y todo lector owner-side —; poner ahí al invitado haría que sus canciones aparecieran como "sus" membresías (feed "agregó a…", biblioteca, cascada al borrar SU cuenta que se llevaría canciones de la fiesta ajena). `added_by_user_id` es `SET NULL`: borrar la cuenta del autor deja la canción como "Puso alguien" (lo pide el diseño). Columna en `backlog_item` descartada también por la razón de la tabla caliente.
- **Una canción de fiesta no crea `user_item` para nadie (2026-09-29).** No es estado por título (no se marca, no se reseña, no cuenta en perfil/recap/recos/estrenos). Se hace cumplir en los DOS lugares donde nace un `user_item`: `ensureUserItemAndMembership` (sondea "título de biblioteca Y colección no-fiesta" en una query y lanza NotFound) y `setMark` (lee el título por `getCatalogItem`, que es solo-biblioteca). Por eso todo lector que llega al catálogo A TRAVÉS de `user_item` está limpio por construcción (su `mediaType` se tipa con `libraryMediaType()`); los que llegan sin `user_item` filtran con `libraryMedia()`.
- **`'track'` en `media_type`, filtrado como `IN ('film','series','album')` (2026-09-29).** `libraryMedia()` / `libraryMediaType()` / `asLibraryRow()` en `src/modules/catalog/library-media.ts` (= `MEDIA_TYPES`). Nunca `<> 'track'` en SQL: el literal da 22P02 en una DB sin 0033 y esos filtros viven en rutas calientes. `CatalogItemRow` (cache.ts) ahora ES la fila de biblioteca (`mediaType: MediaType`); la fila con canciones es `AnyCatalogItemRow` y solo la lee `modules/party-collections`. Canciones: `source = "itunes-track"` (nunca colisiona con los álbumes `source = "itunes"` ni los toma el código de álbumes), sin `release_date` (el cron de estrenos nunca las ve).
- **Fusionar cuentas (fase 4g, 2026-09-24) no tiene tabla ni migración.** Vínculos de proveedor = filas `account` (PK `(provider, provider_account_id)`: una cuenta puede quedar con dos `sub` del mismo proveedor tras fusionar). Un solo uso en `verificationToken` con dos espacios de nombres nuevos: `merge:<destinoId>:<correo>` (código de fusión, hash sha256 como el OTP; lleva el correo del ORIGEN en texto, por eso `identityScrubStatements` lo limpia al borrar o fusionar cualquiera de las dos cuentas — con `starts_with`/`right`, nunca LIKE: `_` es comodín y es común en correos) y `merge-token:<jti>` (sin PII). La semántica por tabla (qué se mueve, qué se funde con qué regla de choque, qué cae por cascada) vive en `src/modules/account/merge-coverage.ts` (`MERGE_COVERAGE`): **una tabla nueva con FK a `user`, columna `*user_id` o correo/handle en texto rompe `scripts/check-merge-coverage.ts` hasta que se decida su regla en `merge.ts`**. `user_item.added_at` tras un choque = el menor (el gate de "guardado antes del estreno" sigue siendo verdad); `cross_media_rec_usage` se SUMA por mes (fusionar no reinicia la cuota); `release_notice` se conserva (no re-avisa un estreno ya avisado).

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->
- **0033 `party_collections` pendiente de aplicar (2026-09-29)** — `drizzle/0033_party_collections.sql` + snapshot/journal 0033 en la rama `feat/fiesta-colecciones`, sin commit. Si otra rama genera su propia 0033 en paralelo, la segunda en mergear regenera la suya (journal/snapshot chocan). Pasos: `drizzle-kit migrate` → `MIGRATION_0033_LIVE = true` → deploy → smoke `reads` (casos "GET /parties…").
- **0031 `follow_lists_visibility` pendiente de aplicar (2026-09-27)** — `drizzle/0031_follow_lists_visibility.sql` + snapshot/journal 0031 en la rama `fix/seguidores-no-abre`, sin commit. Aplicar 0030 y 0031 (founder) ANTES de cualquier deploy que incluya este código. Si otra rama genera su propia 0031 en paralelo, la segunda en mergear tiene que regenerar la suya (journal/snapshot chocan).
- **0028 `user_block` pendiente de aplicar (2026-09-24)** — `drizzle/0028_user_block.sql` + snapshot/journal 0028
  en el árbol, sin commit. Aplicarla (founder) antes de cualquier deploy que incluya `modules/social/block-gate.ts`.
  Después: `pnpm tsx scripts/api-smoke.ts --only writes` con cuenta QA corre los casos E1 de reportar/bloquear.
- **0028 `user_block` y 0029 `device_sessions_push` APLICADAS en la DB compartida (2026-09-24, por el founder; 30 migraciones; `notifyFollowers` descomentada y `MIGRATION_0029_LIVE = true`).** Nota histórica — 0029 pendiente de aplicar (2026-09-24) — `drizzle/0029_device_sessions_push.sql` + snapshot/journal 0029 en el árbol, sin commit. Aplicarla (founder) es independiente del deploy (el código corre sin ella con `MIGRATION_0029_LIVE = false`). Al aplicarla, en este orden: `drizzle-kit migrate` → descomentar `notifyFollowers` en `src/db/schema.ts` → `MIGRATION_0029_LIVE = true` en `src/auth/live-0029.ts` → deploy → smoke `writes` (W4).

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
