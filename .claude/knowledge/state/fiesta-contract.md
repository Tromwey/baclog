# Contrato — Colecciones de fiesta (backend compartido web + iOS)

> Fuente de verdad para los carriles **web** (UI Next) e **iOS** (SwiftUI). Construye SOLO con este
> archivo. Diseño: `design/kura/fiesta-app-v2.dc.html`. Generado 2026-09-29 (rama `feat/fiesta-colecciones`).
> Si el backend cambia, este archivo cambia en el mismo commit.

## Cambios de la ronda 2 (2026-09-29) — resumen

| # | Cambio | Dónde |
|---|---|---|
| C1 | Switch apagado → `GET /invites/{token}` = **503 `unavailable`** para todo token (no oráculo); web `/f/*` y `/c/*` → pantalla **"las fiestas llegan muy pronto."** (no el link muerto, no 404). `getPartySummaryByToken` sigue `null` + `console.warn`. | §0, §4.1, §5 |
| C2 | **Bloqueo GLOBAL** (`user_block`, cualquier sentido) invitado↔anfitrión ⇒ la fiesta desaparece para ese invitado: `getPartyAccess` = null (404 idéntico en `/c`, `GET/PATCH/…/parties/{id}`), fuera de `GET /parties`. Ya NO es `viewer.blocked`. Levantar el bloqueo la devuelve. | §6.6 |
| C3 | **`POST /parties/{id}/leave`** (solo invitado) → 204; web `leavePartyAction`. Regla de regreso abajo (§6.12). | §4.2, §5, §6.12 |
| C4 | Invitado **bloqueado por la fiesta** SÍ quita SUS canciones (`DELETE …/songs/{id}` 200; `canRemove: true` en las suyas). Sigue sin poder agregar. | §6.4–5 |
| C5 | **409 `conflict` sin `reason`** (copy genérico) cuando un add/quitar no escribió y el estado fresco no explica por qué (logueado en servidor). Nunca `cap_reached` para el anfitrión. Quitar / quitar-y-bloquear usan RETURNING. | §5 |
| C6 | `PartySummary.perGuestLimit` (copy de /party con el número real, `playlistPitch`). | §4.1 |
| C7 | Máx **20 fiestas por anfitrión** → 409 `conflict` + `reason: "too_many_parties"` ("Ya tienes 20 fiestas. Borra alguna para crear otra."). **10 links por hora por fiesta** (el de creación cuenta) → 429 `rate_limited` + `retryAfterSeconds`. | §5 |
| — | Web: toda action de fiesta con sesión vencida responde `{ error: "signin_required", loginPath }` (ya no lanza). `guestRef` = HMAC con `AUTH_SECRET`. `GET /invites/{token}` con bucket propio `invite-ip` (60/min). Esquema: `backlog_collaborator.left_at` (0033 regenerada, sigue SIN aplicar). | §4.2, §1 |

## 0. Estado de despliegue — LEER PRIMERO

- Migración **`drizzle/0033_party_collections.sql`** (aditiva). Hasta aplicarla, el switch
  **`MIGRATION_0033_LIVE = false`** (`src/modules/party-collections/live.ts`) hace que TODO lo de fiestas
  responda "no disponible": server actions → `{ error: "unavailable" }`; API → **503 `unavailable`**
  (incluida `GET /invites/{token}`, para todo token); web `/f/*` y `/c/*` → "las fiestas llegan muy pronto."
  (`components/party/party-soon.tsx`); `getInvitePreview` LANZA `PartyUnavailableError`;
  `getPartySummaryByToken` → `null` + `console.warn` (la tarjeta de /party no se pinta).
  El resto de la app funciona igual con o sin la migración.
- Orden: `drizzle-kit migrate` (founder, DB compartida) → poner `MIGRATION_0033_LIVE = true` → deploy.
  Nunca `true` sin la tabla (Colecciones daría 500 en todas sus pantallas).
- Exportar a Apple Music/Tidal: **fase 2, NO existe backend**. La UI lo muestra como "próximamente".

## 1. Modelo de datos

Una fiesta ES una colección (`backlog`) con una fila en `party`. Nada nuevo en la tabla caliente `backlog`.

| Tabla | Qué guarda |
|---|---|
| `backlog` | El contenedor: `id`, `user_id` = **anfitrión**, `name`. **Siempre privada** (`is_public = show_on_profile = false`): nunca sale en `/u/**`, perfil, feed, tendencias ni `GET /collections`. |
| `party` (nueva) | `backlog_id` PK→backlog CASCADE · `per_guest_limit smallint NULL` (0 = solo ver · 1..5 · NULL = ilimitadas; CHECK 0..50) · `created_at`. Existencia = "es fiesta". |
| `party_invite` (nueva) | `id uuid` · `backlog_id` · `token text UNIQUE` (16 chars base64url, 96 bits) · `created_at` · `revoked_at NULL`. **Un solo link activo** por fiesta (índice único parcial). Los revocados se quedan (su token nunca vuelve a funcionar). |
| `backlog_collaborator` (0030) + `blocked_at` + `left_at` (nuevas col.) | Miembro = invitado que entró por el link. `blocked_at` = "Quitar y bloquear" del anfitrión (sigue VIENDO, no agrega; SÍ quita las suyas). `left_at` = un invitado BLOQUEADO que salió (la fila se conserva para que el bloqueo sobreviva); un invitado no bloqueado que sale se BORRA. Toda lectura de membresía filtra `left_at IS NULL`. |
| `backlog_item` | La canción en la fiesta (membresía). `user_id` = **el anfitrión** siempre (invariante de dueño de la casa). Único `(backlog_id, catalog_item_id)` = una canción una vez por fiesta. |
| `party_song` (nueva) | **Quién la puso**: `backlog_item_id` PK→backlog_item CASCADE · `backlog_id` · `added_by_user_id`→user **SET NULL** · `added_at`. Autor borra su cuenta → la canción queda, "Puso alguien". |
| `catalog_item` | La canción: `media_type = 'track'` (valor nuevo del enum), `source = "itunes-track"`, `external_id = trackId`, `title`, `byline` = artista, `poster_url` 600×600, `raw` = lista blanca (`previewUrl`, `trackViewUrl`, `collectionName`, `trackTimeMillis`, …), `palette_hex` (on-device, compartida). Nunca `release_date`. |

Reglas de modelo:
- **Una canción de fiesta NO crea `user_item`** (ni del invitado ni del anfitrión): no es estado por título de
  nadie → no cuenta en perfil, recap, reacciones, reseñas, recos, estrenos.
- Una canción (`track`) jamás es un `Title` ni entra a una colección normal; una fiesta jamás recibe una
  película/serie/álbum. Los caminos genéricos lo rechazan (ver §7).

## 2. URLs

| URL | Quién | Qué |
|---|---|---|
| `https://get-kura.app/f/{token}` | cualquiera (con o sin sesión) | Landing de invitación ("entra a kura para poner tus 3 canciones"). Token inválido/revocado = pantalla "este link ya no funciona" (idéntica para inexistente). |
| `/c/{backlogId}` | anfitrión + miembros (sesión) | **Página de la fiesta** (recomendación: `/c/…` como en el diseño, NO `/backlogs/[id]`, que es solo-dueño y de colecciones normales). No-miembro/inexistente → `notFound()`. Sin sesión → redirigir a `/login?to=/c/{id}`. |
| `/api/v1/…` | app iOS | §5. |

Helpers (`src/modules/party-collections/rules.ts`): `inviteUrl(token)` → `https://get-kura.app/f/{token}`,
`invitePath(token)` → `/f/{token}`, `partyPath(id)` → `/c/{id}`.

**Universal links (carril iOS/infra):** el AASA (`src/app/.well-known/apple-app-site-association/route.ts`)
tiene que incluir `/f/*` y `/c/*`. `DeepLink.parse` valida: token `^[A-Za-z0-9_-]{16}$`, id UUID.

## 3. Flujo de login con regreso (web)

Lista blanca pura y client-safe: **`src/lib/return-to.ts`**
```ts
export function safeReturnTo(raw: string | null | undefined): string | null; // solo "/f/{token}" o "/c/{uuid}", exactos
export function loginPathFor(to: string): string;                           // "/login?to=%2Ff%2F…" o "/login"
```
Flujo que tiene que implementar el carril web (páginas de `(auth)` hoy van fijas a `/backlogs`):
1. `/f/{token}` sin sesión → CTA a `loginPathFor("/f/{token}")` = `/login?to=%2Ff%2F{token}`.
2. `/login` conserva `to` por las tres puertas: correo → `/verify?email=…&to=…` (`carryReturnTo`); Apple →
   input hidden `to` → `continueWithAppleAction(formData)` lo re-valida con `safeReturnTo` →
   `signIn("apple", { redirectTo })`; Apple rechazado → `/login?error=apple&to=…` (`appleErrorUrl` en
   `auth/config.ts`, leído de la cookie callback-url de Auth.js). En `/verify`, "Enviar otro código" →
   `/login?to=…`. Guardrail: `scripts/check-party-rules.ts` › "login: cada entrada propaga ?to=".
3. `/verify` tras `signIn("otp")` OK: `window.location.href = safeReturnTo(to) ?? "/backlogs"`.
4. De vuelta en `/f/{token}` con sesión: llamar `joinPartyAction(token)`:
   - `{ error: "onboarding_required", onboardingPath }` → ir a `onboardingPath` = `/onboarding?to=%2Ff%2F{token}`.
     El onboarding debe conservar `to` y, al terminar el paso **usuario** (edad 13+ + nombre + handle —
     `completeOnboarding` + `claimUsername`, sin cambios), ir a `safeReturnTo(to)` en vez de "elige 3"
     (picks/gente/servicio quedan opcionales: el layout `(app)` solo exige `user.name`). La regla de edad
     sigue siendo la del onboarding existente.
   - `{ ok: true, path, joined }` → navegar a `path` (`/c/{id}`) y mostrar la hoja de bienvenida:
     `joined: "new"` → "ya estás dentro." · `"already"` → regreso (la variante "returning" del diseño es
     "entraste con tu cuenta" — la decide la UI según si pasó por onboarding) · `"host"` → sin hoja.
   - `{ error: "invalid_link" }` → pantalla "este link ya no funciona".
Nunca pongas en `to` otra cosa: `safeReturnTo` devuelve `null` y se cae a `/backlogs`.

**iOS:** abre `get-kura.app/f/{token}` → `GET /api/v1/invites/{token}` (funciona sin sesión) → si no hay
sesión, su login/onboarding nativo → `POST /api/v1/invites/{token}/join` (403 `onboarding_required` = termina
onboarding y reintenta).

## 4. Web — funciones de servidor

### 4.1 Lecturas para Server Components (import directo, pasan `user.id` de la sesión)
`src/modules/party-collections/queries.ts` (tipos en `types.ts`):
```ts
getPartyDetail(viewerId: string, backlogId: string): Promise<PartyDetail | null>   // /c/{id}; null → notFound()
getInvitePreview(token: string, viewerId: string | null): Promise<InvitePreview | null> // /f/{token}; null → "ya no funciona"; LANZA sin 0033
getPartySummaryByToken(token: string): Promise<PartySummary | null>                 // /party (anónimo)
listPartiesForUser(userId: string): Promise<PartyCard[]>                            // "Tus colecciones · De fiesta" (lanza PartyUnavailableError sin 0033)
```
`/party` (invitación de Halloween, carril party): con el token configurado,
`const s = await getPartySummaryByToken(token); s && presenceLine(s)` →
`"8 canciones · @ana, @rodri y 2 más ya están dentro"` (`presenceLine` en `rules.ts`; variantes: sin nadie
→ `"8 canciones"`; un nombre → `"… · @ana ya está dentro"`; sin nombres públicos → `"… · 3 personas ya están dentro"`).
`s.artworkUrls` (≤ 5) sirve para el abanico; `s.perGuestLimit` da el copy con el número real
(`playlistPitch(limit)` → "Pon tus 3 canciones. …"). `null` = link muerto o migración no aplicada → no pintar la
tarjeta (`getPartyPlaylistAction` loguea por qué).

### 4.2 Server actions — `src/app/actions/party-collection-actions.ts`
Todas: sesión obligatoria; **sin sesión devuelven `{ error: "signin_required", loginPath }`** (ya no lanzan;
`loginPath` = `/login?to=/c/{id}` cuando hay fiesta). Nunca lanzan por resultados esperados. Cualquiera puede
devolver `{ error: "unavailable" }` (sin 0033). La UI mapea cada código en `components/party/party-errors.ts`
(`not_found` → `/backlogs` + toast "Esa fiesta ya no está disponible.").
```ts
getPartyAction(backlogId: string)
  → { ok: true, party: PartyDetail } | { error: "not_found" }
listMyPartiesAction()
  → { ok: true, parties: PartyCard[] }
createPartyAction(input: { name: string; perGuestLimit?: number | null })   // omitido = 3; null = ilimitadas
  → { ok: true, id: string, path: string, invite: PartyInvite } | { error: "invalid" }
  | { error: "too_many_parties", message: string }                          // 20 por anfitrión (C7)
updatePartyAction(backlogId: string, input: { name?: string; perGuestLimit?: number | null })  // solo anfitrión
  → { ok: true } | { error: "invalid" | "not_found" }
deletePartyAction(backlogId: string)                                         // solo anfitrión
  → { ok: true } | { error: "not_found" }
rotatePartyInviteAction(backlogId: string)   // "Crear link nuevo": el anterior deja de funcionar
  → { ok: true, invite: PartyInvite } | { error: "not_found" | "conflict" }
  | { error: "rate_limited", retryAfterSeconds: number }                    // 10 links/h por fiesta (C7)
revokePartyInviteAction(backlogId: string)   // "Desactivar": nadie más entra; miembros siguen
  → { ok: true } | { error: "not_found" }
joinPartyAction(token: string)
  → { ok: true, id: string, path: string, joined: "new" | "already" | "host", blocked: boolean }
  | { error: "signin_required", loginPath: string }
  | { error: "onboarding_required", onboardingPath: string }
  | { error: "invalid_link" }
leavePartyAction(backlogId: string)          // "Salir de la fiesta" (invitados; C3)
  → { ok: true } | { error: "not_found" }                                    // anfitrión / no miembro = not_found
searchPartySongsAction(backlogId: string, query: string)                     // 1..100 chars
  → { ok: true, items: PartySongHit[] }
  | { ok: false, error: "not_found" | "invalid" | "unavailable" }            // unavailable = iTunes caído → estado "Reintentar"
  | { ok: false, error: "rate_limited", retryAfterSeconds: number }          // 30 búsquedas/min por usuario
addPartySongAction(backlogId: string, titleId: string, paletteHex?: string[])
  → { ok: true, party: PartyDetail }
  | { error: "duplicate_mine" | "duplicate_other", addedBy: PartyPerson | null, message: string } // toast tal cual
  | { error: "cap_reached" | "blocked" | "view_only", addedBy: null }
  | { error: "not_found" | "song_not_found" | "conflict" }                   // conflict = no escribió, causa desconocida (C5)
removePartySongAction(backlogId: string, titleId: string)                   // anfitrión: cualquiera; invitado: las suyas (también bloqueado, C4)
  → { ok: true, party: PartyDetail } | { error: "not_found" | "forbidden" | "conflict" }
removeAndBlockPartyGuestAction(backlogId: string, titleId: string)          // solo anfitrión; por la CANCIÓN
  → { ok: true, party: PartyDetail } | { error: "not_found" | "not_blockable" | "conflict" }
unblockPartyGuestAction(backlogId: string, guestRef: string)                // guestRef de party.blockedGuests
  → { ok: true } | { error: "not_found" }
```
Portada/aura: la paleta de una canción se llena con la action existente `cacheItemPaletteAction(titleId, hexes)`
(primer escritor gana) o pasando `paletteHex` al agregar.

Copy del diseño ya resuelto en servidor: `duplicateMessage(mine, handle)` → `"Ya la pusiste tú."` /
`"Ya está, la puso @ana"` / `"Ya está, la puso alguien"`.

## 5. API v1 (iOS)

Convenciones de siempre (`ios/API.md` §1): bearer, `{ error: { code, message, reason?, … } }`, fechas ISO UTC
sin fracción, `Cache-Control: private, no-store`. Todo 503 `unavailable` mientras 0033 no esté viva.
Un `{id}` o `{titleId}` que no es UUID = 404. Fiesta no visible (no miembro / inexistente) = **el mismo 404**
(`"No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella."`).

| Método | Path | Body | 200 | Errores |
|---|---|---|---|---|
| GET | `/parties` | — | `{ items: PartyCard[] }` (anfitrión + invitado, bloqueado incluido; más reciente primero) | 503 |
| POST | `/parties` | `{ name: string(1..60), perGuestLimit?: 0..5 \| null }` | `Party` (vista anfitrión, link activo) | 400 `fields` · 409 `conflict` + `reason: "too_many_parties"` (20 por anfitrión) |
| GET | `/parties/{id}` | — | `Party` | 404 |
| PATCH | `/parties/{id}` | `{ name?, perGuestLimit? }` | `Party` | 404 (invitado también), 400 |
| DELETE | `/parties/{id}` | — | 204 | 404 |
| POST | `/parties/{id}/invite` | — | `Party` (link nuevo; el viejo muere) | 404 · 429 `rate_limited` + `retryAfterSeconds` (10 links/h por fiesta, el de creación cuenta) · 409 `conflict` |
| POST | `/parties/{id}/leave` | — | **204** ("Salir de la fiesta", solo invitado; C3) | 404 (anfitrión, no miembro, inexistente: el mismo) |
| DELETE | `/parties/{id}/invite` | — | `Party` (`invite.active: false`) | 404 |
| GET | `/parties/{id}/songs?q=` | — | `{ items: PartySongHit[] }` (`[]` = sin resultados) | 404 · 400 `fields.q` · 503 iTunes caído · 429 |
| PUT | `/parties/{id}/songs/{titleId}` | `{ paletteHex?: hex[≤6] }` (opcional) | `Party` | 404 · 404 no es canción · 403 `blocked` · 403 `view_only` · 409 `duplicate_mine` · 409 `duplicate_other` (+ `addedBy`) · 409 `cap_reached` · 409 `conflict` sin reason (C5) |
| DELETE | `/parties/{id}/songs/{titleId}` | — | `Party` (idempotente; un invitado bloqueado quita LAS SUYAS, C4) | 404 · 403 `not_yours` · 409 `conflict` |
| POST | `/parties/{id}/songs/{titleId}/block` | — | `Party` ("Quitar y bloquear") | 404 · 409 `not_blockable` · 409 `conflict` |
| PUT | `/parties/{id}/songs/{titleId}/palette` | `{ paletteHex: hex[1..6] }` | 204 | 404 (también si el invitado está bloqueado) |
| DELETE | `/parties/{id}/blocked/{guestRef}` | — | `Party` (desbloquear) | 404 |
| GET | `/invites/{token}` | — | `InvitePreview` — **pública** (bucket propio `invite-ip`, 60/min por IP); bearer OPCIONAL llena `viewer` | 404 `"Este link ya no funciona. Pídele a quien te invitó uno nuevo."` (malformado = desconocido = revocado = bloqueo con el anfitrión) · **503 `unavailable` sin 0033, para todo token (C1)** |
| POST | `/invites/{token}/join` | — | `{ party: Party, joined: "new" \| "already" \| "host" }` | 404 (mismo texto) · 403 `onboarding_required` |

`message` de cada error es el copy final en español: muéstralo tal cual. Zod exacto en
`src/app/api/v1/_lib/schemas.ts` (sección "Parties"); serializadores en `_lib/wire/party.ts`.

### 5.1 Formas (JSON)
```jsonc
// PartyPerson — donde es nullable, null = "alguien"
{ "handle": "ana", "name": "Ana", "avatarUrl": "/api/avatar/…" | null }

// PartySong
{ "titleId": "uuid", "title": "Thriller", "artist": "Michael Jackson" | null, "album": "Thriller" | null,
  "artworkUrl": "https://is1-ssl.mzstatic.com/…/600x600bb.jpg" | null,
  "previewUrl": "https://audio-ssl.itunes.apple.com/…m4a" | null,   // 30 s
  "durationMs": 357000 | null, "appleMusicUrl": "https://music.apple.com/…" | null,
  "palette": ["#211c28", …],            // [] hasta que alguien la extraiga
  "addedAt": "2026-10-20T18:00:00Z",
  "addedBy": PartyPerson | null,        // null → "Puso alguien"
  "mine": true,                          // → "Pusiste"
  "byHost": false, "canRemove": true, "canBlockAuthor": false }

// Party (GET /parties/{id} y respuestas de escritura)
{ "id": "uuid", "name": "la fiesta de eric", "perGuestLimit": 3 | null, "createdAt": "…Z",
  "host": PartyPerson | null,
  "viewer": { "role": "host" | "guest", "blocked": false, "mineCount": 1,
              "remaining": 2 | null,     // null = sin tope (anfitrión o ilimitadas)
              "canAdd": true },
  "songs": [PartySong],                  // orden de playlist: primero agregada primero
  "contributors": [{ "person": PartyPerson | null, "isYou": true, "songCount": 3 }], // nombrados por conteo; "alguien" al final
  "guestCount": 4,                       // miembros no bloqueados
  "invite": { "active": true, "token": "AbCd…16", "url": "https://get-kura.app/f/…", "createdAt": "…Z" } | null, // solo anfitrión
  "blockedGuests": [{ "guestRef": "22chars", "person": PartyPerson | null, "blockedAt": "…Z" }] }            // solo anfitrión, [] invitado

// PartyCard (GET /parties)
{ "id", "name", "role": "host" | "guest", "perGuestLimit", "songCount", "peopleCount",
  "host": PartyPerson | null, "artworkUrls": [url | null] /* ≤ 3 */, "palette": [hex], "updatedAt" }

// InvitePreview (GET /invites/{token})
{ "token": "…", "party": { "id", "name", "perGuestLimit", "host", "songs": [PartySong], "contributors", "guestCount" },
  "viewer": null | { "role": "host" | "guest" | null, "joined": false, "blocked": false } }
// En el preview los songs nunca traen canRemove/canBlockAuthor en true.

// PartySongHit (búsqueda)
{ "titleId", "title", "artist", "album", "artworkUrl", "previewUrl", "durationMs", "appleMusicUrl", "palette",
  "inParty": null | { "mine": true, "addedBy": PartyPerson | null } }  // null → "Agregar"; mine → "Ya la pusiste"; si no → "Ya está · la puso @x"

// 409 duplicate_other
{ "error": { "code": "conflict", "reason": "duplicate_other", "message": "Ya está, la puso @ana",
             "addedBy": PartyPerson | null } }
```

## 6. Reglas de negocio (servidor las impone; la UI solo las dibuja)

1. **Tope por invitado** (`perGuestLimit`): 0 = solo ver (403 `view_only`) · 1..5 · null = ilimitadas.
   Default al crear: 3. **El anfitrión no tiene tope** (decisión: el que organiza pone lo que quiera; `remaining: null`).
   Bajar el tope no borra canciones: el invitado queda en `remaining: 0` hasta quitar.
2. **Orden de chequeo al agregar** (`decideAdd`): bloqueado → solo ver → **duplicado** → tope. Un duplicado se
   reporta aunque ya hayas usado tus 3 (el diseño dice "Ya está, la puso @ana").
3. **Duplicados**: una canción una vez por fiesta (`(backlog, catalog_item)` único). "Ya la pusiste tú." vs
   "Ya está, la puso @x" / "alguien".
4. **Quitar**: anfitrión cualquier canción ("sale de la colección para todos"); invitado solo las suyas —
   **también estando bloqueado** (C4).
5. **Quitar y bloquear a @x** (anfitrión, por canción): quita ESA canción y bloquea a su autor en ESTA fiesta.
   Sus otras canciones se quedan. El autor NO recibe aviso, sigue viendo la fiesta, ve `viewer.blocked: true`
   ("Ya no puedes agregar canciones"), no puede agregar y sí puede quitar las suyas. No aplica a canciones del
   anfitrión ni de cuentas borradas (409/`not_blockable`). Si el autor ya había salido, igual queda bloqueado
   (fila con `blocked_at` + `left_at`). Volver a entrar por el link **no** desbloquea; solo "Desbloquear"
   (y desbloquear a alguien que salió solo borra su fila: puede volver limpio).
6. **Bloqueo global de usuarios (App Store 1.2)** entre un invitado y el anfitrión (cualquier sentido): la
   fiesta **desaparece** para ese invitado (C2): no puede unirse (mismo "link ya no funciona"), y si ya era
   miembro `getPartyAccess` = null → el mismo 404 en todo `/parties/{id}` y `/c/{id}`, fuera de `GET /parties`
   (su fila se queda; levantar el bloqueo la devuelve tal cual). El anfitrión sigue viendo su fiesta, con esa
   persona como "alguien". Además la identidad de alguien con quien el viewer tiene bloqueo se muestra como
   "alguien" (canciones, contributors, host).
7. **Link**: uno activo a la vez. Crear nuevo = el anterior muere al instante; desactivar = nadie más entra.
   Quien ya entró sigue. Un link muerto/malformado/inexistente es la misma respuesta (sin oráculo).
8. **Unirse** exige cuenta con onboarding terminado (nombre + edad verificada). Idempotente.
9. **Identidad**: una persona se nombra solo si es pública con handle (`is_public AND username`) y sin bloqueo
   con el viewer; si no, "alguien". `mine` (Pusiste) no depende de eso. Nunca viajan ids de usuario.
10. **Visibilidad**: fiesta siempre privada. La ven: anfitrión, miembros (incl. bloqueados) y quien tenga un
    link ACTIVO (preview). No aparece en perfil, feed, tendencias, búsqueda, recap ni `GET /collections`.
11. Borrar la cuenta de un invitado: sus canciones quedan como "Puso alguien"; sale de miembros. Borrar la
    cuenta del anfitrión borra la fiesta entera.
12. **Salir de la fiesta** (C3, `POST /parties/{id}/leave`, solo invitado; anfitrión = 404): la fiesta sale de
    sus listas; sus canciones se quedan, atribuidas. **Regla de regreso** (`rules.ts` `leaveEffect` /
    `joinOutcome`, y el SQL de `joinParty` en una sola sentencia):
    - no bloqueado → su fila se BORRA; puede volver a entrar con un link ACTIVO como cualquiera nuevo (`joined: "new"`);
    - bloqueado → su fila se CONSERVA con `left_at`; si vuelve a entrar con un link activo, `left_at` se limpia y
      **vuelve bloqueado** (`joined: "new"`, `blocked: true`): salir nunca lava un bloqueo;
    - con link revocado/rotado nadie que salió vuelve a entrar; con bloqueo global con el anfitrión, tampoco.
13. **Límites** (C7): 20 fiestas existentes por anfitrión (lock por anfitrión + recuento dentro del INSERT;
    borrar una libera el cupo). 10 links por hora por fiesta, contados en `party_invite` (DB, global).

## 7. Qué NO hacer (lo rechaza el servidor)

- Agregar una canción por `PUT /collections/{id}/titles/{titleId}` o `addItemAction`: 404/`title_not_found`.
- Agregar película/serie/álbum a una fiesta por los caminos genéricos: `backlog_not_found`.
- `GET /titles/{songId}`, `PUT /titles/{songId}/palette`, `/api/links/resolve` con una canción: 404
  (una canción no es `Title`). Para abrir en Apple Music usa `appleMusicUrl`.
- Cambiar la visibilidad de una fiesta con `updateBacklogAction`/`PATCH /collections/{id}`: no aplica (false/404).
- La fiesta NO sale en `getShelvesForUser`, `getBacklogNames`, `getCollectionFans`, `GET /collections`: la
  lista "De fiesta" se arma con `listPartiesForUser` / `GET /parties`.

## 8. Pendientes reales (no son backend)

- **AASA**: `src/app/.well-known/apple-app-site-association/route.ts` debe incluir `/f/*` y `/c/*` (está
  modificado en el checkout padre por otra sesión; confirmar antes de desplegar).
- **Cableado /party**: `PartyPlaylistCard` (`src/app/party/party-playlist-card.tsx`) existe pero ninguna pantalla
  de `/party` lo monta todavía; montarlo tras el RSVP y configurar `PARTY_PLAYLIST_TOKEN` en Vercel.
- **URL de la App Store**: la tarjeta "kura para iPhone." no trae "Ver en App Store" hasta tener la URL.
- **Aplicar 0033** (regenerada con `left_at`, sigue sin aplicar) → `MIGRATION_0033_LIVE = true` → deploy.
- Exportar a Apple Music/Tidal: fase 2.
