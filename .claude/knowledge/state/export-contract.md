# Contrato — "Llévala a otra app" (exportar una colección de fiesta a Apple Music / TIDAL)

> Fuente de verdad para los carriles **web** (UI Next) e **iOS** (SwiftUI). Construye SOLO con este archivo
> + `state/fiesta-contract.md`. Diseño: `design/kura/fiesta-app-v2.dc.html` (hoja `shExport`, pantalla
> `isExport`). Generado 2026-09-29 (rama `feat/fiesta-exportar`). Si el backend cambia, este archivo
> cambia en el mismo commit.
>
> **Revisión de seguridad 2026-09-29 (ronda 2) — cambios que TOCAN a iOS:**
> 1. OAuth TIDAL iOS: el rebote trae **`claim`** y `POST /music/tidal/complete` lo exige (§4.2). Sin él = 409.
> 2. `services.apple_music` gana **`webAvailable`** (aditivo). **iOS decide con `apple_music.available`**
>    (nada cambia para iOS); la web decide con `apple_music.webAvailable` (§3). El servidor **no** manda
>    `reason: "web_key_missing"`: "sin llave web" se expresa SOLO como `available: true, webAvailable: false`
>    (el carril iOS tolera ese `reason` por si acaso; no se emite).
> 3. `PUT …/exports/apple_music` acepta **`playlistId: null`** (aditivo, §6.1 paso 6) y ahora puede dar
>    **429 `rate_limited`** (30 reportes/min): esperar `retryAfterSeconds` y reenviar el MISMO reporte.
> 4. TIDAL: `POST …/exports/tidal` puede devolver `in_progress` con `playlist: null` aunque antes estaba
>    `done` (la playlist se borró en TIDAL → se rehace) — el cliente ya lo maneja si sigue el bucle de §5.

## 0. Estado de despliegue — LEER PRIMERO

- Migración **`drizzle/0034_music_export.sql`** (aditiva: 4 tablas nuevas, nada en tablas existentes).
  **SIN aplicar.** Switch **`MIGRATION_0034_LIVE = false`** (`src/modules/music-export/live.ts`). Apagado:
  - API (`/api/v1/music/**`, `/api/v1/parties/{id}/exports/**`) → **503 `unavailable`, `reason: "migration"`**;
  - web actions (`music-export-actions.ts`) → `{ error: "unavailable", message }`;
  - `/api/music/tidal/start|callback` → 302 de regreso con `?music=tidal&connected=0&reason=unavailable`
    (iOS: `kura://music/tidal/connected?ok=0&reason=unavailable`).
  - La UI debe tratar `unavailable` como **"Próximamente"** (igual que hoy).
- Orden: `drizzle-kit migrate` (founder) → `MIGRATION_0034_LIVE = true` → deploy. Nunca `true` sin las tablas.
- **Segundo gate, por configuración** (con el switch encendido): `GET /api/v1/music/services` dice qué
  servicio está disponible. `available: false` → "Próximamente" en ese botón (nunca falla a mitad del flujo).
- `PartySong.appleMusicId` (nuevo, aditivo) ya viaja en `GET /parties/{id}` y en `PartyDetail` web
  **sin depender del switch** (sale de `catalog_item.raw.trackId`).

## 1. Decisiones (founder + backend)

| # | Decisión |
|---|---|
| D1 | Servicios: **Apple Music + TIDAL**, en **iOS y web** (founder). |
| D2 | Pueden exportar **anfitrión e invitados**: cualquiera que `getPartyAccess` deja ver la fiesta, **incluido un invitado bloqueado por la fiesta** ("Quitar y bloquear": solo le impide agregar; exportar solo lee). Un **bloqueo global** (`user_block`) con el anfitrión = sin acceso = el 404 de fiesta (founder). |
| D3 | Cada persona exporta a **SU** cuenta del servicio. Un export = (fiesta, usuario, servicio). La playlist se llama **como la fiesta**. Descripción TIDAL: "La colección de fiesta «{nombre}», desde kura.". TIDAL `accessType: UNLISTED`. |
| D4 | Se exportan las canciones **actuales** de la fiesta, **en su orden** (primero agregada primero). Una canción quitada de la fiesta **se queda** en la playlist remota (nunca borramos allá). Una canción nueva, al re-exportar, se agrega **al final**. |
| D5 | **Sin duplicados al reintentar**: la playlist remota se crea **una vez** (`party_export.remote_playlist_id`; TIDAL además con `Idempotency-Key` = export + generación + hash del nombre, para que renombrar la fiesta entre un intento fallido y su reintento no choque con el 422 de TIDAL), y cada canción ya `added` nunca se vuelve a mandar (`party_export_item`). TIDAL agrega con `onDuplicates: "SKIP"`. |
| D6 | "Reintentar" / volver a exportar (`POST …/exports/{svc}`) **re-encola las `missing`** (el catálogo cambia). |
| D7 | **Apple Music lo hace el CLIENTE** (MusicKit JS en web, MusicKit en iOS) y **reporta** al servidor. **TIDAL lo hace el SERVIDOR** (OAuth por usuario), en pasos que el cliente va llamando para pintar el progreso. |
| D8 | TIDAL empareja por **ISRC** (Apple catalog → ISRC → `GET /tracks?filter[isrc]`), con respaldo **título + artista** con matcher estricto (título igual sin contención, todos los artistas acreditados, duración ≤ 7 s, versión "Live"/"Acoustic" ≠ estudio; remaster sí). Lo que no se encuentra con confianza va a "No están en TIDAL". |
| D9 | Si la persona borró la playlist en TIDAL (confirmado con `GET /playlists/{id}` = 404), el siguiente paso **crea otra** y le pone la fiesta completa (generación nueva; máx. 1 cada 10 min). En Apple Music, el cliente lo detecta (404) y reporta con `replace: true` (con `playlistId: null` si ya no hay nada que poner). |
| D10 | Fusión de cuentas: las tablas 0034 de la cuenta absorbida **cascadean** (el vínculo de TIDAL se reconecta; un re-export del destino crea playlist nueva). Borrar cuenta: todo cascadea. |

## 2. Modelo de datos (0034)

| Tabla | Qué guarda |
|---|---|
| `music_connection` | Vínculo OAuth por (usuario, proveedor) — hoy solo `tidal`. `access_token_enc` / `refresh_token_enc` **cifrados** (AES-256-GCM, `lib/secret-box.ts`, AAD = usuario + proveedor + campo), `expires_at`, `scope`, `external_user_id`, `country_code`. Único `(user_id, provider)`. CASCADE con el usuario. |
| `music_oauth_state` | Autorización pendiente: PK = sha256(state), `user_id`, `client` (`web`\|`ios`), `code_verifier_enc` (PKCE, cifrado), `return_to` (web), `code_enc` (iOS: código estacionado por el callback), `claim_hash` (iOS: sha256 del claim del rebote), `expires_at` (+10 min, índice para el GC global). Un solo uso. |
| `party_export` | (backlog, usuario, proveedor) único: `remote_playlist_id`, `remote_url`, `generation` (sube si la playlist remota desapareció — confirmado con GET), `generation_bumped_at` (TIDAL: máx. una generación nueva cada 10 min), `lease_until` (un paso a la vez). CASCADE con la fiesta y el usuario. |
| `party_export_item` | (export, canción) → `outcome` `added`\|`missing`, `remote_track_id`. |
| `catalog_item.raw._isrc` / `._isrc_at` | Caché del ISRC de cada canción (Apple catalog, storefront `mx`); un "no hay" se re-pregunta a los 30 días. Claves con `_` = nuestras. |

## 3. Capacidades — `GET /api/v1/music/services` · web `getMusicServicesAction()`

```jsonc
{ "apple_music": { "available": true, "webAvailable": true },   // | { available: true, webAvailable: false }
                                                                 // | { available: false, webAvailable: false, reason: "not_configured" | "key_rejected" }
  "tidal": { "available": true, "connected": false } }           // | { available: false, connected: false, reason: "not_configured" }
```
- **iOS lee `apple_music.available`**: el servidor tiene una llave con MusicKit que Apple acepta — la
  dedicada (`APPLE_MUSIC_KEY_ID`/`APPLE_MUSIC_PRIVATE_KEY`) o, si falta, la compartida
  (`APPLE_KEY_ID`/`APPLE_PRIVATE_KEY`, con MusicKit habilitado por el founder). iOS usa MusicKit nativo
  (no pide developer token); la llave es la del lookup de ISRC y el interruptor del founder.
- **La web lee `apple_music.webAvailable`** = `available` Y existe la llave **dedicada** Y Apple la acepta:
  solo ella firma el developer token que va al navegador (la compartida es la de APNs/SIWA y su token
  nunca sale del servidor). `webAvailable: false` → "Próximamente" en la web; iOS sigue.
- Sondas: cada llave se prueba contra Apple (`GET /v1/storefronts/mx`), cacheada 1 h por llave.
- `tidal.available` = `TIDAL_CLIENT_ID` + `TIDAL_CLIENT_SECRET` + `TIDAL_OAUTH_REDIRECT_URI`.
- `tidal.connected` = hay vínculo guardado (puede resultar muerto en el siguiente refresh → `not_connected`).
- UI de la hoja `shExport`: `available: false` → botón con "Próximamente"; TIDAL `connected: false` → paso
  "conecta tidal." (`connect`) con "Conectar TIDAL"; si no, directo a "pasando la colección.".

## 4. Conectar TIDAL (OAuth 2.1 authorization code + PKCE)

Scopes pedidos: **`playlists.write user.read`** (crear playlists + país de la cuenta; no lee la biblioteca —
el copy del diseño "kura solo crea la playlist … No lee ni cambia tu biblioteca." es verdad).

### 4.1 Web
1. Botón "Conectar TIDAL" = **navegación** (no fetch) a
   `tidalStartPath(returnTo)` (`@/modules/music-export/rules`, client-safe) →
   `GET /api/music/tidal/start?return=/c/{backlogId}` (también vale `/settings` o `/settings/musica`;
   cualquier otra cosa cae a `/settings/musica`).
   - Sin sesión → 302 `/login?to=%2Fc%2F{id}` (vuelve a la fiesta tras entrar).
2. 302 a `https://login.tidal.com/authorize?...` (consentimiento de TIDAL).
3. TIDAL → `GET /api/music/tidal/callback?code&state` → 302 a
   - éxito: **`/c/{id}?music=tidal&connected=1`**
   - fallo: **`/c/{id}?music=tidal&connected=0&reason=denied|expired|session|exchange|unavailable|rate_limited`**
4. La página `/c/{id}` (carril web) lee `?music=tidal&connected=1` → reabre la hoja de exportar en TIDAL y
   arranca el export (§5). `connected=0` → toast según `reason`:
   `denied` "No diste permiso en TIDAL." · `session` "Abre el link en el mismo navegador donde entraste a kura." ·
   `expired|exchange` "La conexión con TIDAL caducó. Vuelve a intentarlo." · `unavailable` "TIDAL todavía no está
   disponible en kura." · `rate_limited` "Demasiados intentos. Espera un momento.". Luego limpiar el query.
   El callback **solo termina para la MISMA sesión de cookie** que empezó (ver §9).
5. "Desconectar TIDAL" → `disconnectTidalAction()`.

### 4.2 iOS
1. `POST /api/v1/music/tidal/start` → `{ "authorizeUrl": "https://login.tidal.com/authorize?..." }`.
2. `ASWebAuthenticationSession(url: authorizeUrl, callbackURLScheme: "kura")`
   (`prefersEphemeralWebBrowserSession` a gusto; no depende de cookies de kura).
3. El callback de TIDAL cae en nuestro servidor, que **rebota** a uno de:
   - `kura://music/tidal/authorized?ref=<ref>&claim=<claim>` → paso 4 (`claim` = 32 bytes aleatorios en
     base64url, 43 chars; el servidor solo guarda `sha256(claim)`);
   - `kura://music/tidal/connected?ok=0&reason=denied|expired|unavailable|rate_limited` → mostrar error.
   Solo procesar ese rebote si ESTA app tiene una `ASWebAuthenticationSession` de TIDAL en curso (tomar
   `ref` y `claim` del `callbackURL` que entrega la sesión, no de un deep link suelto).
4. `POST /api/v1/music/tidal/complete` body **`{ "ref": "<ref>", "claim": "<claim>" }`** (con el bearer del
   MISMO usuario que hizo `start`) → 200 `MusicServices` con `tidal.connected: true`.
   - Exige los TRES: ref + claim (hash comparado en tiempo constante) + el bearer que empezó.
   - 409 `conflict` `reason: "auth_expired"` = caducó (10 min), ya se usó, no es tuyo, **o falta / no
     coincide el `claim`** (mismo error, a propósito) → volver al paso 1. Un intento fallido NO quema el
     código del dueño. `ref` malformado sigue siendo 400 `fields.ref`; `claim` ausente/malformado = 409.
   - 503 `unavailable` `reason: "service_failed"` = TIDAL no respondió.
   - Por qué el claim: el `ref` ES el `state`, que el que EMPIEZA ya conoce (va en su `authorizeUrl`). Sin
     claim, un atacante manda su `authorizeUrl` a una víctima, ella consiente, y él completa con su bearer
     → el TIDAL de la víctima queda ligado a la cuenta de kura del atacante. El claim solo viaja en el
     rebote, al navegador que de verdad volvió de TIDAL.
5. Desconectar: `DELETE /api/v1/music/tidal` → 204.

## 5. Exportar a TIDAL (servidor, por pasos)

```
POST /api/v1/parties/{id}/exports/tidal          → ExportState   (crea/reanuda; re-encola missing)
loop:
  si state.busy        → esperar ~1 s y volver a llamar step
  si state.status == "in_progress":
     pintar barra processed/total y "Buscando {state.current.title} en TIDAL…"
     POST /api/v1/parties/{id}/exports/tidal/step → ExportState   (≤ 10 canciones por paso)
  si state.status == "done" → pantalla "lista."
```
Web: `startPartyExportAction(backlogId, "tidal")` y `stepTidalExportAction(backlogId)` (mismo `state`).

- Pantalla "lista.": `doneLine("tidal", state.exported, state.total)` = "N de M canciones ya están en tu playlist de
  TIDAL." + lista **"No están en TIDAL"** = `state.missing` (portada `artworkUrl`, `title`, `artist`,
  "Puso @{addedBy.handle}" / "Pusiste" si `mine` / "Puso alguien" si `addedBy === null`) + botón
  **"Abrir en TIDAL"** → `state.playlist.url` (null solo si NINGUNA canción se encontró: no pintar el botón).
- Errores de un paso (el progreso guardado se conserva; reintentar = llamar `step` otra vez):
  - 503 `unavailable` `reason: "service_failed"` → pantalla **"no se pudo exportar."** con el `message`
    ("TIDAL dejó de responder a mitad del proceso. Tu colección sigue intacta en kura; al reintentar no se duplican canciones.");
  - 429 `rate_limited` `reason: "service_rate_limited"` + `retryAfterSeconds` → esperar y seguir solo;
  - 429 `rate_limited` `reason: "rate_limited"` (nuestro límite: 30 pasos/min, 20 starts/min) → esperar `retryAfterSeconds`;
  - 409 `conflict` `reason: "not_connected"` → el vínculo murió (refresh rechazado, 401 tras refrescar, o
    un 403 de TIDAL por auth/scope) → paso "conecta tidal.".
  - Un 403 de TIDAL que NO es de auth (términos nuevos sin aceptar, cuota, otro) **no** desconecta: 503
    `service_failed` con un `message` específico ("TIDAL pide que aceptes sus términos nuevos…", "Tu cuenta
    de TIDAL llegó a su límite…", "TIDAL no dejó escribir en tu cuenta…"). Pintar `message` tal cual.
  - "La playlist se borró": solo se concluye con `GET /playlists/{id}` = 404 (un 404 al AGREGAR puede ser
    de una canción: entonces se reintenta canción por canción y las rechazadas quedan en `missing`). Borrada
    → generación nueva (la siguiente llamada crea otra con toda la fiesta), **máximo una vez cada 10 min**;
    una segunda desaparición en ese lapso = 503 `service_failed` ("TIDAL no encuentra la playlist que
    acabamos de crear. Espera unos minutos…"), progreso intacto.
  - `POST …/exports/tidal` (start) con todo agregado verifica la playlist antes de responder: si TIDAL la
    borró, responde `in_progress` con `playlist: null` (nunca `done` con un link muerto).
- Solo `tidal` tiene `/step` (`/exports/apple_music/step` = 404).

## 6. Exportar a Apple Music (cliente con MusicKit, reporta al servidor)

Ids: cada canción trae **`appleMusicId`** = id de CATÁLOGO de Apple Music (= trackId de iTunes, storefront
`mx`). El export también trae `isrc` cuando se conoce (para encontrarla en otro storefront).

### 6.1 Flujo (igual en web e iOS)
1. `POST /api/v1/parties/{id}/exports/apple_music` (web: `startPartyExportAction(id, "apple_music")`) →
   `ExportState`: `playlistName`, `playlist` (null la primera vez), `songs[]` con `state` y `appleMusicId`/`isrc`.
2. Autorizar al usuario en MusicKit (web: `await music.authorize()`; iOS: `MusicAuthorization.request()`).
3. **Pendientes** = `songs.filter(s => s.state === "pending")`.
4. **Disponibilidad en SU storefront** (el usuario puede no ser de MX):
   `GET https://api.music.apple.com/v1/catalog/{userStorefront}/songs?ids={appleMusicId,…}` (≤ 300 por llamada;
   web: `music.storefrontId`; iOS: `MusicDataRequest`/`MusicCatalogResourceRequest`). Ids ausentes en la respuesta
   → para los que tengan `isrc`: `GET …/catalog/{sf}/songs?filter[isrc]={isrc,…}` y usar el id que vuelva.
   Lo que siga sin id → **missing**.
5. **Playlist**:
   - `state.playlist === null` → crear: `POST /v1/me/library/playlists`
     `{ "attributes": { "name": playlistName, "description": "La colección de fiesta «{playlistName}», desde kura." },
        "relationships": { "tracks": { "data": [{ "id": "<catalogId>", "type": "songs" }, …] } } }`
     → el id de biblioteca (`p.XXXX`). **Reportar INMEDIATAMENTE** (paso 6) aunque falten canciones.
   - `state.playlist.id` existe → **antes de agregar**, leer `GET /v1/me/library/playlists/{id}/tracks` y
     descartar de los pendientes los que ya estén (`attributes.playParams.catalogId`) — es lo que evita
     duplicados si un intento anterior agregó y murió antes de reportar. Luego
     `POST /v1/me/library/playlists/{id}/tracks` `{ "data": [{ "id": "<catalogId>", "type": "songs" }, …] }`.
   - Si esa playlist da **404** (la borró) → crear una nueva y reportar con **`replace: true`**.
6. **Reportar**: `PUT /api/v1/parties/{id}/exports/apple_music`
   (web: `reportAppleMusicExportAction(id, { playlistId, replace?, added, missing })`)
   `{ "playlistId": "p.XXXX", "replace": false, "added": [titleId…], "missing": [titleId…] }` → `ExportState`.
   - `added` = titleIds que QUEDARON en la playlist (incluye los que ya estaban); `missing` = no encontrados.
   - Solo cuentan titleIds de la fiesta; `added` gana sobre `missing`; un `added` nunca vuelve a `missing`.
   - **`playlistId: null`** (aditivo) = "no hay playlist": NINGUNA pendiente existe en su storefront y no hay
     playlist a la cual agregar → reportar `{ playlistId: null, missing: [todas las de este intento] }`, y con
     **`replace: true`** si la registrada dio 404 (la borró): el servidor la olvida y `state.playlist` queda
     `null` → la pantalla "lista." NO pinta "Abrir en Apple Music". Con `playlistId: null` no cuenta ningún
     `added`.
   - 409 `conflict` `reason: "playlist_exists"` = ya hay OTRA playlist registrada (otro dispositivo) →
     `GET …/exports/apple_music` y seguir en `state.playlist.id`. (También: `playlistId: null` sin `replace`
     contra una registrada.)
   - 429 `rate_limited` (30 reportes/min por usuario) → esperar `retryAfterSeconds` y reenviar el mismo.
7. Pintar progreso localmente ("Buscando {title} en Apple Music…" mientras se procesan) y "lista." con
   `doneLine("apple_music", exported, total)`, `missing` y **"Abrir en Apple Music"** → `state.playlist.url`
   (`https://music.apple.com/library/playlist/p.XXXX`; abre la app Música en iOS).
8. Fallo de MusicKit a mitad → pantalla "no se pudo exportar." con
   `SERVICE_FAILED_MESSAGE("apple_music")`; reintentar = volver al paso 1 (no duplica: pasos 5–6).

### 6.2 Web — MusicKit JS v3
- Script: `https://js-cdn.music.apple.com/musickit/v3/musickit.js` (no hay CSP en el repo).
- Developer token: `getAppleMusicDeveloperTokenAction()` → `{ ok, token, expiresAt }` — **1 h** y con claim
  **`origin`** = `https://get-kura.app`, `https://beta.get-kura.app` (+ `http://localhost:3010|3000` fuera de
  producción): Apple lo rechaza desde cualquier otra página (p. ej. `baclog-beta.vercel.app` NO sirve para
  Apple Music web). Firmado SOLO con la llave dedicada; pedir otro al vencer.
  `await MusicKit.configure({ developerToken: token, app: { name: "kura", build: "1" } })`.
- Llamadas: `music.api.music(path, query?, { fetchOptions: { method, body: JSON.stringify(…) } })`.
- `webAvailable: false` en `services.apple_music` → no cargar MusicKit; "Próximamente".

### 6.3 iOS — MusicKit
- Requiere el servicio **MusicKit** habilitado en el App ID `com.tromwey.kura` (developer.apple.com) y
  `NSAppleMusicUsageDescription` en Info.plist (carril iOS). MusicKit en iOS genera su developer token solo;
  **no** necesita `GET /music/apple/developer-token` (existe por paridad).
- Usar `MusicCatalogResourceRequest<Song>(matching: \.id, memberOf: …)`/`MusicDataRequest` para el storefront, y
  `MusicLibrary.shared.createPlaylist(name:description:items:)` / `add(_:to:)` (iOS 16+) o `MusicDataRequest`
  contra `/v1/me/library/playlists` (mismos cuerpos que §6.1). El id que se reporta es el de biblioteca (`p.…`).
- Si `apple_music.available` es false, mostrar "Próximamente". **iOS ignora `webAvailable`** (es solo de la web).

## 7. Web — server actions (`src/app/actions/music-export-actions.ts`)

Todas: sin sesión → `{ error: "signin_required", loginPath }` (con fiesta: `/login?to=/c/{id}`); errores
esperados → `{ error: <reason>, message, retryAfterSeconds? }` (nunca lanzan); `migration` llega como
`"unavailable"`; input malo → `{ error: "invalid" }`.
```ts
getMusicServicesAction()
  → { ok: true, services: MusicServices }
getAppleMusicDeveloperTokenAction()                                     // 30/min por usuario; 1 h, origin-bound
  → { ok: true, token: string, expiresAt: string /* ISO */ } | { error: "not_configured" | "rate_limited" | "unavailable", … }
getPartyExportAction(backlogId: string, provider: "apple_music" | "tidal")
  → { ok: true, state: ExportState } | { error: "not_found" | … }
startPartyExportAction(backlogId, provider)
  → { ok: true, state } | { error: "not_connected" | "not_configured" | "not_found" | "rate_limited" | … }
stepTidalExportAction(backlogId)
  → { ok: true, state } | { error: "service_failed" | "service_rate_limited" | "not_connected" | "rate_limited" | … }
reportAppleMusicExportAction(backlogId, { playlistId: string | null, replace?, added?, missing? })
  → { ok: true, state } | { error: "playlist_exists" | "not_found" | "invalid" | "rate_limited" | … }
disconnectTidalAction()
  → { ok: true }
```
Helpers client-safe en `@/modules/music-export/rules`: `tidalStartPath`, `serviceLabel`, `doneLine`,
`SERVICE_FAILED_MESSAGE`, `parseProvider`. Tipos en `@/modules/music-export/types`.

## 8. API v1 (iOS)

Convenciones de siempre (bearer, `{ error: { code, message, reason?, retryAfterSeconds? } }`, `private, no-store`).
Todo 503 `unavailable` (`reason: "migration"`) con el switch apagado. `{id}` no-UUID o fiesta no visible =
el 404 de fiesta. Provider desconocido = 404.

| Método | Path | Body | 200 | Errores |
|---|---|---|---|---|
| GET | `/music/services` | — | `MusicServices` | 503 |
| GET | `/music/apple/developer-token` | — | `{ token, expiresAt }` (web: 1 h, `origin`) | 503 `not_configured` (sin llave dedicada o rechazada) · 429 |
| POST | `/music/tidal/start` | — | `{ authorizeUrl }` | 503 `not_configured` · 429 `rate_limited` (10/min) |
| POST | `/music/tidal/complete` | `{ ref, claim }` | `MusicServices` | 400 `fields.ref` · 409 `auth_expired` (también sin claim / claim incorrecto) · 503 `service_failed` |
| DELETE | `/music/tidal` | — | 204 | 503 |
| GET | `/parties/{id}/exports/{apple_music\|tidal}` | — | `ExportState` (`idle` si nunca empezó) | 404 |
| POST | `/parties/{id}/exports/{apple_music\|tidal}` | — | `ExportState` | 404 · 409 `not_connected` (tidal) · 503 `not_configured` (tidal) · 429 |
| POST | `/parties/{id}/exports/tidal/step` | — | `ExportState` | 404 · 409 `not_connected` · 503 `service_failed` · 429 `service_rate_limited` / `rate_limited` |
| PUT | `/parties/{id}/exports/apple_music` | `{ playlistId \| null, replace?, added?, missing? }` | `ExportState` | 400 `fields` · 404 · 409 `playlist_exists` · 429 `rate_limited` (30/min) |

Zod exacto: `src/app/api/v1/_lib/schemas.ts` › "Music export"; serializador `_lib/wire/music.ts`.

### 8.1 Formas (JSON)
```jsonc
// ExportSong
{ "titleId": "uuid", "title": "Thriller", "artist": "Michael Jackson" | null, "album": "Thriller" | null,
  "artworkUrl": "https://is1-ssl.mzstatic.com/…/600x600bb.jpg" | null, "durationMs": 357000 | null,
  "appleMusicId": "1440833098" | null, "isrc": "USSM18200530" | null,
  "state": "pending" | "added" | "missing",
  "addedBy": PartyPerson | null,      // null → "Puso alguien" (mismo gate de identidad que la fiesta)
  "mine": false }                     // → "Pusiste"

// ExportState
{ "provider": "tidal" | "apple_music",
  "playlistName": "la fiesta de eric",
  "status": "idle" | "in_progress" | "done",
  "total": 12, "exported": 11, "processed": 12,          // barra = processed/total; "N de M" = exported/total
  "current": { "titleId", "title", "artist" } | null,    // "Buscando {title} en {svc}…"
  "playlist": { "id": "…", "url": "https://tidal.com/…" | "https://music.apple.com/library/playlist/p.…" | null } | null,
  "missing": [ExportSong],                               // "No están en {svc}", en orden de la fiesta
  "songs": [ExportSong],                                 // todas, en orden (Apple Music las usa)
  "busy": false }                                        // true = otro paso en curso: reintentar en ~1 s

// PartySong (fiesta-contract §5.1) gana, aditivo:
{ …, "appleMusicId": "1440833098" | null }
```

## 9. Seguridad (lo que el servidor garantiza)

- Autorización app-layer: toda lectura de la fiesta pasa por `getPartyDetail` → `getPartyAccess` (host/miembro,
  bloqueo global = 404). Nunca viaja un `userId` por RPC; `reportAppleMusicExport` ignora titleIds ajenos.
- OAuth: `state` = pista de cliente + 256 bits, **solo su hash** en DB, **un solo uso**, 10 min, **ligado al
  usuario que empezó**, y el final exige **la misma credencial**: cookie (web) o bearer (iOS `complete`) **+ en
  iOS el `claim` de un solo uso que el callback solo pone en el rebote** (el `ref` solo no basta: el que empieza
  ya lo conoce). Así un atacante no puede hacer que el TIDAL de una víctima quede ligado a SU cuenta de kura
  (CSRF de OAuth). PKCE S256; el verifier y el código estacionado van cifrados; los states vencidos de TODOS
  se barren en cada `start`. `GET /api/music/tidal/start` (web) solo arranca con `Sec-Fetch-Site`
  `same-origin`/`none` (un link de otro sitio regresa a `return` sin empezar nada).
- Tokens de TIDAL: cifrados en reposo, AAD por fila/campo, nunca en logs, URLs ni respuestas. El único
  credencial que sale al cliente es el **developer token de Apple para la web** (público por diseño): llave
  dedicada, 1 h, `origin`-bound, y solo si Apple acepta esa llave. El token del servidor (sin `origin`,
  12 h, puede ir firmado con la llave compartida) nunca sale.
- `return` web con lista blanca exacta (`safeMusicReturn`); el callback responde `no-store` +
  `Referrer-Policy: no-referrer` (la URL trae un código de un solo uso).
- URLs "Abrir en …" derivadas en servidor (nunca un href del cliente; `href` de TIDAL solo si es https de `tidal.com`).
- Límites: start OAuth 10/min, callback 30/min por IP, developer token 30/min, start export 20/min, step 30/min,
  reporte Apple 30/min (en memoria por instancia, como el resto de v1) + los 60 escrituras/min de `withApi`.

## 10. Supuestos NO verificados en vivo (verificar con la primera conexión real)

- **TIDAL token endpoint** (no está en el OpenAPI): campos `grant_type=authorization_code`, `client_id`, `code`,
  `redirect_uri`, `code_verifier` **sin `client_secret`** (cliente público PKCE); refresh con `client_id` +
  `refresh_token` + `scope`; respuesta `access_token`, `refresh_token`, `expires_in`, `scope`, `user_id`/`user.countryCode`
  opcionales. Si TIDAL exige secreto en el intercambio (cliente confidencial), el síntoma es `reason=exchange`
  en el callback: agregar `Authorization: Basic` en `exchangeTidalCode`/`refreshTidalToken` (`tidal-api.ts`).
- Verificado contra el OpenAPI vigente (descargado 2026-09-29): authorize/token URLs, scopes `playlists.write`
  y `user.read` (tier THIRD_PARTY), `POST /playlists` + `Idempotency-Key`, `POST /playlists/{id}/relationships/items`
  (1..50, `meta.onDuplicates: SKIP`), `GET /tracks?filter[isrc]` (varios ISRC → uno por ISRC, client credentials),
  `GET /searchResults?include=tracks`, `GET /users/me` → `country`. Supuesto: `/users/me` acepta `user.read` solo
  (el OAS lista `r_usr` y `user.read`); si no, el país cae a `MX` (no es fatal).
- **Apple**: `GET /v1/catalog/{sf}/songs?ids=` → `attributes.isrc`; library playlist ids `p.…` y la URL
  `music.apple.com/library/playlist/p.…`; `filter[isrc]` en catálogo. Sonda: `GET /v1/storefronts/mx` (401/403 =
  llave sin MusicKit).
- El `accessType: "UNLISTED"` al crear la playlist en TIDAL (si TIDAL lo rechaza, quitarlo en `tidalCreatePlaylist`).

## 11. Pasos del founder (en orden)

1. **Apple (developer.apple.com, team F975J7TBHP)**:
   a. Identifiers › App ID `com.tromwey.kura` › Capabilities/App Services › habilitar **MusicKit** (lo necesita iOS).
   b. Identifiers › **Media IDs** › "+" › p. ej. `media.com.tromwey.kura`, con **MusicKit** habilitado.
   c. Keys › "+" › llave NUEVA con **Media Services (MusicKit, ShazamKit…)** ligada a ese Media ID → descargar el
      `.p8` (una sola vez) y anotar su Key ID. Es la ÚNICA que firma el token de la web. (La compartida
      `APPLE_KEY_ID`/`APPLE_PRIVATE_KEY` — ya con MusicKit — basta para iOS y el lookup de ISRC: sin la
      dedicada, `services` dice `available: true, webAvailable: false` → la web muestra "Próximamente".)
   d. `vercel env add APPLE_MUSIC_KEY_ID` y `vercel env add APPLE_MUSIC_PRIVATE_KEY` (contenido del `.p8`;
      Production y Preview). `APPLE_TEAM_ID` ya existe.
2. **TIDAL (developer.tidal.com › la app del link-out)**:
   a. Agregar redirect URIs: `https://get-kura.app/api/music/tidal/callback`,
      `https://beta.get-kura.app/api/music/tidal/callback` y (dev) `http://localhost:3010/api/music/tidal/callback`.
   b. Habilitar los scopes **`playlists.write`** y **`user.read`** para la app.
   c. `vercel env add TIDAL_OAUTH_REDIRECT_URI` — Production: `https://get-kura.app/api/music/tidal/callback`;
      Preview: `https://beta.get-kura.app/api/music/tidal/callback` (la cookie de sesión es por host: el callback
      tiene que caer en el mismo host donde la persona empezó).
   d. **Recomendado en producción**: `vercel env add MUSIC_TOKEN_KEY` (32+ bytes aleatorios, p. ej.
      `openssl rand -base64 48`) — sin ella la llave de cifrado se deriva de `AUTH_SECRET` y rotarlo
      desconectaría TIDAL a todos. Ponerla ANTES de la primera conexión real (cambiarla después obliga a
      reconectar).
3. `drizzle-kit migrate` (aplica 0034) → `MIGRATION_0034_LIVE = true` → deploy (`pnpm ship` desde el repo padre).
4. Smoke: `scripts/api-smoke.ts --only reads` (casos "GET /music/services" y "/exports").
5. Primera conexión real a TIDAL (web) y un export pequeño; revisar el log por `[music-export]`.
