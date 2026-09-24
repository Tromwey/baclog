# Kura · API para la app iOS — especificación y plan de orquestación

> Estado: **especificación aprobable, sin implementar** (2026-09-24). Es el brief para el agente que orqueste la construcción. Todo lo que dice "existe" ya está en el repo; todo lo que dice "nuevo" hay que escribirlo.

## 0. Contexto y principios

- La app web (Next 16, `src/`) habla con el servidor por **server actions** y route handlers internos; no hay API pública. La app iOS (`ios/`, SwiftUI) corre hoy con `MockAPI` detrás del protocolo `KuraAPI` (`ios/Kura/Services/KuraAPI.swift`). El trabajo es: **una API HTTP versionada en el mismo repo/deploy** (`src/app/api/v1/**`) + un `LiveAPI: KuraAPI` en iOS.
- **Misma verdad, mismo código.** Los handlers reutilizan `src/modules/**` (queries) y las mismas funciones que hoy usan las actions (`ensureUserItemAndMembership`, `completeItem*`, `saveReview*`, `follow*`…). **Nunca** llaman a una server action (redirigen, revalidan rutas y asumen cookies). Si una action tiene lógica que no está en un módulo, primero se extrae a `src/modules/**` y la action pasa a envolverla — así web y iOS no divergen.
- **Autorización 100 % app-layer, igual que hoy** (`AGENTS.md`): el usuario sale del token, nunca del body; propiedad re-checada por mutación (`assertOwnsBacklog`, `assertOwnsUserItem`); lecturas cross-user solo por los módulos que ya están gateados (`publicAuthor`, `public.ts`, `social/*`). La API **no abre ninguna excepción nueva de authz**.
- **Sin migraciones en la primera entrega.** Todo lo que el modelo no tiene (fijar, orden manual, portada elegida, visibilidad "seguidores", episodios vistos, notificaciones, solicitudes) queda fuera del contrato o se marca `unsupported`; el iOS ya lo trata como local/omitido. Migrar la base Neon compartida (local = beta = prod) requiere confirmación del founder, igual que siempre.
- El dominio sigue siendo `baclog.app`; la API vive en `https://baclog.app/api/v1`.

## 1. Convenciones

- **Base** `/api/v1`. JSON UTF-8, claves **camelCase** (los `Codable` del iOS son camelCase), fechas **ISO 8601 UTC** (`"2026-09-24T15:00:00Z"`), ids como string (UUID de la base; el handle `@usuario` identifica personas).
- **Errores**: `{ "error": { "code": "...", "message": "texto en español para mostrar tal cual" } }` con códigos fijos `unauthorized` (401) · `forbidden` (403) · `not_found` (404) · `invalid` (400, con `fields?: Record<string,string>`) · `conflict` (409) · `rate_limited` (429, con `retryAfterSeconds`) · `unsupported` (501) · `unavailable` (503, catálogo externo caído). Mensajes en la voz Kura (sin guiño: qué pasó y qué hacer).
- **Paginación** keyset: `?cursor=<opaco>&limit=` → `{ items, nextCursor|null }`. Reusar `encodeCursor/decodeCursor` de `modules/reviews/queries.ts` y el cursor `(at,id)` de `getFeedCards`.
- **Idempotencia** por clave natural: `PUT` para "poner en estado X" (membresía, marca, follow), `DELETE` para quitar; repetir no falla. Las escrituras devuelven el recurso resultante, no `{ok}`.
- **Caché**: `Cache-Control: private, no-store` en todo lo autenticado. Portadas: la API devuelve las URLs de TMDB/iTunes tal cual (ADR-007, hotlink); la app las carga con `AsyncImage`.
- **Versionado**: cambios incompatibles = `/api/v2`. Campos nuevos opcionales no rompen (el `Codable` del iOS debe tolerar claves desconocidas y campos opcionales: `decodeIfPresent`).
- **Límites**: 60 req/min por token en escrituras, 300 en lecturas (contador en memoria por instancia es suficiente en Vercel para empezar; documentar que no es global).

## 2. Autenticación

El web usa Auth.js v5 con estrategia **JWT en cookie** y el provider Credentials `otp` (`src/auth/config.ts`); `requireUser()` relee la fila del usuario en cada request (revocación instantánea al borrar la cuenta). Para móvil no hay cookies: se emite un **bearer token propio** con las mismas garantías.

### 2.1 Flujo OTP (existe el 80 %)
1. `POST /api/v1/auth/otp/request` `{ email }` → `204`. Reusa `issueOtp` (`src/auth/otp.ts`); `429 rate_limited` en cooldown. (Hoy existe `POST /api/auth/otp/request`; el `v1` es un alias que responde con el contrato de errores de arriba.)
2. `POST /api/v1/auth/otp/verify` `{ email, code, device: { platform: "ios", name, appVersion } }` → `{ token, user: Me }`. **Nuevo.** Reusa `verifyOtp` (crea el usuario si no existe, igual que el web). El `token` es un JWT **HS256 firmado con `AUTH_SECRET`**, `sub = user.id`, `aud = "kura-ios"`, `iat`, `exp = +30 días`, `jti` aleatorio. Sin tabla de sesiones: la revocación es la misma que en web (si la fila del usuario no existe → 401). Refresh: `POST /api/v1/auth/refresh` con el bearer vigente → token nuevo (rota `jti`); la app lo llama al abrir si faltan < 7 días.
3. `POST /api/v1/auth/logout` → `204` (no hay estado que borrar; la app olvida el token. Si más adelante se quiere revocar por dispositivo, se agrega tabla `mobile_session` — decisión posterior).

`requireApiUser(request)` (**nuevo**, `src/authz/api.ts`): lee `Authorization: Bearer`, verifica firma/aud/exp, relee `users` por `sub`, devuelve el mismo `CurrentUser` que `requireUser()`; 401 en cualquier falla. Cero cookies. Los handlers de `v1` usan **solo** este helper (nunca `auth()`/`getCurrentUser()`).

### 2.2 Sign in with Apple / Google (fase 4)
La tabla `account` (adapter de Auth.js) existe pero está vacía para OTP. `POST /api/v1/auth/apple` `{ identityToken, authorizationCode, fullName? }` verifica el JWT de Apple (claves públicas de Apple, `aud` = bundle `io.communeo.kura`), busca `account(provider='apple', providerAccountId=sub)`; si no hay, enlaza por email verificado o crea el usuario; devuelve el mismo `{ token, user }`. **Fuera de la primera entrega**; la app puede lanzar solo con correo (Apple exige "Sign in with Apple" solo si ofreces otro login social de terceros — con OTP por correo no aplica).

## 3. Modelos del contrato (JSON) y su origen en la base

Los `struct` del iOS (`ios/Kura/Models/Models.swift`) son la referencia de forma; aquí va qué campo sale de dónde y qué NO existe.

| JSON | iOS | Origen | Notas |
|---|---|---|---|
| `Me` | `Person` propio | `users` + `getUserStats` + `getFollowCounts` + `getUserPalette` | `handle` puede ser `null` hasta reclamarlo; `stats {obsessed, liked, completed, reviews}`; `hexes` = paleta dominante; `featuredTitleId` = obsesión más reciente (`profile-hexes.ts`); `preferredService`; `notifyReleases`; `isPublic`; `avatarUrl` |
| `Title` | `Title` | `catalog_item` + `getItemDisplayMedia` | `format` ∈ `film|series|album`; `coverUrl`; `palette`; `year`; `creator` = `byline`; `release` = `{ kind: "day"|"month"|"year"|"unknown", date? }` desde `releaseDate`; `tracks`/`trackCount` (álbum), `seriesStatus` (serie); `counts` = `getTitleStats` (**solo `obsessed` y `completed`**; `liked`/`saved`/`waiting` no existen → omitir); `watch` = una sola opción JustWatch (`/api/links/resolve?catalogItemId=`) o el link del servicio preferido para álbum; sin `seasons`/episodios (no hay dato) |
| `Collection` | `KCollection` | `backlogs` + `backlog_item` | `visibility` ∈ `private|link|profile` (**no** `followers`): `private` = `isPublic=false`, `link` = `isPublic && !showOnProfile`, `profile` = ambos. `titleIds` en orden `addedAt desc`; `addedAt: {titleId: date}`; `coverTitleId` = el más reciente con portada (derivado, no persistido); **sin** `pinned`, `sort`, `layout` (locales del dispositivo) |
| `TitleState` | `UserTitleState` | `user_item` | `mark` ∈ `obsessed|liked|completed|null`, derivado con la precedencia de `markOf()` (`obsessed` → `liked` → `completed` si `status='completed'` sin veredicto); `savedAt` = primera membresía; `reviewId`; **sin** `watchedEpisodes` |
| `Person` | `Person` ajeno | `public.ts` (`getPublicProfile`, `getPublicReactionCounts`) + `isFollowing` | Solo perfiles públicos; `obsessions`, `followers`, `followingCount`, `collections` (solo `profile`), `common` (afinidad, `social/affinity.ts`), `isPrivate` = 404 idéntico a inexistente (nunca se dice cuál) |
| `Review` | `Review` | `item_review` | `mark` del autor vía `markOf`; `hasSpoiler`; `when` la calcula la app desde `createdAt` |
| `FeedEvent` | `FeedEvent` | `getFeedCards` | Tipos: `added` (con `collectionName`, `releaseDate?` para "no puede esperar"), `completed`, `obsessed`, `reviewed`, `suggest`. Ráfagas las agrupa la app (misma regla que `feed-list.tsx`) |
| `SearchResult` | `Title` parcial | `unifiedSearch` | Ítems externos aún no cacheados llevan `externalRef {source, externalId}`; al guardar uno, el `PUT` de membresía acepta `externalRef` y cachea (`cacheExternalItems`) |

## 4. Endpoints

Todos bajo `/api/v1`, todos con bearer salvo `auth/*`. Entre paréntesis, el módulo que se reutiliza.

**Cuenta**
- `GET /me` → `Me` (`session.ts` + queries de perfil).
- `PATCH /me` `{ name?, preferredService?, notifyReleases?, isPublic? }` → `Me` (misma validación que `updateDisplayNameAction`, `setPreferredServiceAction`, `setNotifyReleasesAction`, `setPublicAction`).
- `GET /me/username/check?u=` → `{ status: "free"|"taken"|"invalid" }` (`checkUsernameAction` → extraer a `modules/account`).
- `PUT /me/username` `{ username }` → `Me` (`claimUsernameAction` → módulo; `409 conflict` si está tomado).
- `POST /me/onboarding` `{ name, birthYear }` → `Me` (`completeOnboardingAction`; `403 forbidden` con `code: "underage"` → la app muestra 13 años).
- `POST /me/onboarding/picks` `{ titles: [{ id? , externalRef? }] }` (3 títulos) → `{ collection: Collection }` (`completePicksAction`).
- `GET /me/onboarding/people` → `[Person]` (`modules/social/people.ts`).
- `PUT /me/avatar` (multipart o base64 WebP/JPEG ≤ límite actual) / `DELETE /me/avatar` (`avatar-actions`; sniffea magic bytes, SVG jamás).
- `DELETE /me` → `204` (`deleteAccountAction` sin redirect).

**Colecciones**
- `GET /collections` → `{ items: [Collection] }` (`getShelvesForUser` / `getBacklogsForUser`).
- `POST /collections` `{ name, vibe?, visibility }` → `Collection` (`createBacklogAction`).
- `GET /collections/{id}` → `Collection` + `titles: [Title]` + `states: {titleId: TitleState}` (`getBacklogItems`).
- `PATCH /collections/{id}` `{ name?, vibe?, visibility? }` → `Collection` (`renameBacklogAction`, `setBacklogVisibilityAction`).
- `DELETE /collections/{id}` → `204` (`deleteBacklogAction`; la única confirmación destructiva vive en la app).
- `PUT /collections/{id}/titles/{titleId}` `{ externalRef? }` → `{ title: Title, state: TitleState }` (`ensureUserItemAndMembership`; cachea si viene `externalRef`).
- `DELETE /collections/{id}/titles/{titleId}` → `204` (`removeMembershipAction`: GC del `user_item` si era la última — la app ya difiere 5 s para el Deshacer).

**Títulos y estado propio**
- `GET /titles/{id}` → `Title` + `state: TitleState|null` + `following: [{ handle, mark }]` (`title-activity.ts`) + `reviews: { items, nextCursor }` + `collections: [id]`.
- `GET /titles?ids=a,b,c` (≤ 50) → `{ items: [Title] }` para hidratar colecciones y feed.
- `GET /me/titles` → `{ items: [{ titleId, state }] }` (todo `user_item` del usuario).
- `PUT /me/titles/{id}/mark` `{ mark: "obsessed"|"liked"|"completed"|null }` → `TitleState`. Semántica Kura = la de `completeItemAction`: cualquier marca implica `status='completed'`; `obsessed` = `obsessed=true`; `liked` = `verdict='liked'`; `completed` = completo sin veredicto ni obsesión; `null` = quitar completado (vuelve a `on_my_radar`, limpia veredicto y obsesión). **Regla de estreno**: si `releaseDate > now` y no viene `preview: true` → `409 conflict` (`code: "not_released"`); la app manda `preview: true` desde "La vi en preestreno".
- `PUT /me/titles/{id}/review` `{ body, hasSpoiler }` → `Review` (`saveReviewAction`: exige reacción previa; `409` `code: "reaction_required"`). `DELETE` → `204`.
- `DELETE /me/titles/{id}` → `204` (`removeFromLibraryAction`: todas las membresías + estado + reseña).
- `PUT /me/titles/{id}/episodes/{key}` → `501 unsupported` (sin modelo; la app lo guarda local).

**Descubrir y búsqueda**
- `GET /search?q=&kind=all|film|series|album` → `{ items: [SearchResult] }` (`unifiedSearch`; `503 unavailable` si TMDB/iTunes fallan).
- `GET /discover` → `{ recommended: [{ title, reason, seedTitleId }], trending: [{ title, saves }], upcoming: [{ title, releaseDate }] }` (`getObsessionRails`, `getTrendingAmongFollowed`, `getLibraryUpcoming`).
- `GET /discover/double-feature` → `LatestDoubleFeature|null` (fase 3; hoy la reco cross-media es web-first).

**Gente y feed**
- `GET /people/{handle}` → `Person` (404 idéntico para privado/inexistente).
- `GET /people/{handle}/collections/{id}` → como `GET /collections/{id}` pero público (`getPublicBacklog`).
- `GET /people/suggestions` → `[Person]` (`getFollowSuggestions`).
- `GET /people/search?q=` → `[Person]` (`searchProfiles`).
- `GET /me/following` · `GET /me/followers` → `{ items: [Person], nextCursor }` (`getPeoplePage`; listas solo del dueño, conteos públicos).
- `PUT /me/following/{handle}` → `204` (`followUserAction`; solo perfiles públicos). `DELETE` → `204` (`unfollowUserAction`; **no** gatea en `isPublic`, ver `AGENTS.md`).
- `GET /feed?cursor=` → `{ items: [FeedEvent], nextCursor }` (`getFeedCards`).
- `GET /feed/suggestion` → `FeedEvent(suggest)|null` (`getFeedSuggestion`).

**Recap**
- `GET /recap/months` → `[{ era: "2026-08", label: "agosto 2026" }]`; `GET /recap/{era}` → `{ stats, top: Title, also: [Title] }` (`modules/backlog/recap.ts` — exportar la query que hoy copia `recap/recap-data.ts`). La tarjeta exportable se sigue generando en web (`/recap/tarjeta`): la app abre esa URL con el token intercambiado por cookie (`POST /api/v1/auth/web-session` → `Set-Cookie` de Auth.js; fase 3) o comparte el link público.

**Notificaciones y dispositivos (fase 4)**
- `PUT /me/devices/{apnsToken}` `{ platform: "ios", environment: "sandbox"|"production" }` / `DELETE`. Tabla nueva `device_token` (**migración → confirmar con el founder**). El cron `api/cron/release` que hoy manda correo también empuja APNs a los dispositivos del usuario (`release_notice` ya evita duplicados).
- `GET /me/notifications` → `501 unsupported` hasta que exista el modelo (la app no muestra la pantalla).

## 5. Lo que iOS debe cambiar para conectarse

- `LiveAPI: KuraAPI` (`ios/Kura/Services/LiveAPI.swift`, nuevo): `URLSession`, base URL configurable (`KURA_API_BASE` en `project.yml` → `Info.plist`; Debug apunta al Mac local por `http://<ip>:3000/api/v1` con `NSAllowsLocalNetworking`), bearer en Keychain, `JSONDecoder` con `.iso8601`, mapeo de `error.code` → `KuraAPIError`. Reintento con backoff solo en lecturas.
- El protocolo `KuraAPI` **cambia de forma** para dejar de ser "todo en memoria": `collections()` sigue igual pero `catalog()` desaparece (los títulos llegan con cada recurso o por `GET /titles?ids=`); `search` devuelve `SearchResult` con `externalRef`; `setMark` acepta `preview`; se agregan `signIn(email, code)`, `refresh()`, `me()`, `createTitleMembership(collectionId, titleRef)`, `feed(cursor)`, `person(handle)`, `people(kind, cursor)`, `discover()`. `MockAPI` se adapta al mismo protocolo (sigue sirviendo para capturas y tests).
- `AppStore` deja de cargar todo al arrancar: hidrata `me` + colecciones + estados, y el resto por pantalla. El Deshacer diferido de "quitar" y "mover" se mantiene tal cual (la API es idempotente).
- Pantalla de entrada real: correo → código (O1c/O1a) contra `auth/otp/*`; guardar token; `Volver` en O1b = `logout`.
- Lo que la API marca `unsupported` se queda local y sin UI de sincronización (episodios, fijar, orden manual, portada elegida, notificaciones).

## 6. Plan de orquestación (para el agente que lo lleve)

Trabaja en `main` con commits por fase; cada fase termina con `tsc` + `eslint` + `next build` limpios y el smoke test verde. **No** toques la app web salvo para extraer lógica de actions a módulos (y entonces la action pasa a envolver el módulo, misma firma). Lee antes `AGENTS.md`, `.claude/knowledge/state/backend.md` y `state/security.md`, y `grep -ri "action\|authz\|userId" .claude/knowledge/learnings/`.

| Fase | Entrega | Archivos | Guardrail |
|---|---|---|---|
| **0 · cimientos** | `src/authz/api.ts` (`requireApiUser`, `issueMobileToken`, `apiError`, `withApi()` que envuelve handlers con try/catch → contrato de errores, rate limit y `no-store`); `src/app/api/v1/_lib/` (zod de request/response compartidos, `paginate`); `auth/otp/request`, `auth/otp/verify`, `auth/refresh`, `auth/logout`; `GET /me` | `src/authz/api.ts`, `src/app/api/v1/**` | `scripts/api-smoke.ts` (tsx): pide OTP a una cuenta QA, lee el código del log del dev server, verifica, pega a cada endpoint y valida contra los zod. Corre contra `pnpm dev` local. Documentar en `guardrails.md` |
| **1 · lecturas** | colecciones, títulos, estados propios, búsqueda, descubrir, gente, feed, recap | idem + extracciones a `src/modules/**` | smoke con la cuenta del founder (`ericbriseno@baclog.app`, OTP en el log) — solo lecturas |
| **2 · escrituras** | colecciones CRUD, membresías, marca, reseña, follow, `/me` | idem; extraer de `complete-actions`, `backlog-*-actions`, `review-actions`, `social-actions`, `account-actions` lo que aún viva ahí | smoke con cuenta QA desechable (crear al inicio, `DELETE /me` al final — la base es la de prod) |
| **3 · iOS Live** | `LiveAPI`, Keychain, pantalla de entrada, `AppStore` por recursos, `KURA_API_BASE` | `ios/**` | build + capturas con `-kuraScreen`; recorrido real en el simulador contra `pnpm dev` (el simulador llega al Mac por `localhost`) |
| **4 · después** | Apple sign-in, `device_token` + APNs en el cron de estrenos, `web-session` para la tarjeta | requiere migración → confirmación del founder | — |

Reglas que el orquestador debe hacer cumplir: (1) ningún handler acepta `userId` en body/query; (2) ninguna lectura cross-user fuera de `public.ts` / `social/*` / `reviews/queries` / `title-stats`; (3) los mensajes de error son texto final en español; (4) cada endpoint nuevo aparece en este archivo (es el contrato) y en `state/backend.md`; (5) no se despliega a prod (`pnpm ship`) hasta que las fases 0–2 pasen el smoke; el deploy no rompe la web porque `v1` es aditivo.

## 7. Preguntas abiertas para el founder

1. **Cuentas móviles sin correo**: ¿se lanza solo con OTP por correo (suficiente para App Store si no hay login social) o se quiere Apple/Google desde el día uno (fase 4 adelantada)?
2. **Notificaciones push de estreno**: implican la tabla `device_token` (migración en la base compartida). ¿Ahora o después del primer TestFlight?
3. **Fijar / portada elegida / orden manual**: ¿se modelan (columnas `pinned_at`, `cover_catalog_item_id`, `position`) o siguen siendo locales del dispositivo? Hoy web e iOS los omiten o los guardan en local.
4. **Visibilidad "solo seguidores"**: el diseño la pide (K1a/K1b); el modelo tiene privado / con link / en perfil. Requiere columna y gates nuevos en `public.ts` y el feed.
