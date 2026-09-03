# Estado — backend

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: YYYY-MM-DD

## Qué cubre este dominio
<!-- Server Actions, route handlers, módulos de servidor e integraciones externas.
     El esquema y las migraciones van en `data.md`; auth/authz en `security.md`;
     el motor de recomendaciones y sus evals en `recs.md`. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `src/app/actions/backlog-actions.ts` | Mutaciones de backlogs |
| `src/app/actions/backlog-item-actions.ts` | Membresía de ítems y estado por título |
| `src/app/actions/account-actions.ts` | Cuenta, username, perfil |
| `src/app/actions/crossmedia-actions.ts` · `crossmedia-feedback-actions.ts` | Recos cross-media y su feedback (ver `recs.md`) |
| `src/app/actions/palette-backfill-actions.ts` · `palette-cache-actions.ts` | Backfill y caché de la paleta (ADN) de portadas |
| `src/app/actions/report-actions.ts` | Reportes de contenido |
| `src/app/actions/review-actions.ts` · `review-moderation-actions.ts` | Reseñas F3.9 (guardar/borrar/reportar) y su moderación admin |
| `src/app/actions/social-actions.ts` | F3.10: follow/unfollow + paginación del feed y las listas; `searchProfilesAction` (F3.10.2 Buscar gente: needle ≤60 chars, todo lo demás lo decide `searchProfiles`) |
| `src/modules/social/` | F3.10: `queries.ts` (chunk keyset privado de 4 ramas `fetchFeedChunk` + `getFeedCards`, la ÚNICA forma pública del feed — páginas de CARDS; sugerencias, listas, `searchProfiles` = Buscar gente: `LIKE` sobre `username` + `ILIKE` sobre `name` con escape de `%_\\`, ranking exacto→prefijo→substring→nombre, seguidores desc; ≥2 chars, cap 20 sin paginar; **fold de acentos** en dos mitades: needle NFD-strip en JS (`normalizeProfileQuery`) y `name` vía `translate()` en SQL sobre diacríticos latinos (`FOLD_FROM/FOLD_TO`) — sin extensión `unaccent` a propósito, sería migración en la DB compartida), `group.ts` (puro/isomorfo: `groupIntoCards` — ráfagas por autor+`backlogId`+brecha ≤ `BURST_GAP` — `closedPrefix`, `liftGems`), `types.ts` (knobs `FEED_EVENT_CHUNK`/`FEED_CARDS_PER_PAGE`/`FEED_MAX_CHUNKS`). Los cursores keyset se producen SOLO con `encodeCursor` (reviews/queries.ts) y los instantes entran a `sql` vía `atParam` |
| `src/modules/reviews/` | F3.9: `queries.ts` (feed público de reseñas, `avatarHexesFor` compartido), `format.ts`, `types.ts` |
| `src/app/actions/waitlist-actions.ts` | Alta en waitlist y referidos |
| `src/app/api/auth/[...nextauth]/` · `src/app/api/auth/otp/request/` | Handlers de NextAuth v5 y solicitud de OTP |
| `src/app/api/catalog/search/` | Búsqueda en catálogo externo |
| `src/app/api/links/resolve/` | Resolución de links a servicios |
| `src/app/api/analytics/capture/` | Ingesta de eventos |
| `src/app/api/cron/recap/` | Job del recap |
| `src/modules/backlog/` | `queries.ts`, `public.ts`, `palette.ts`, `lenses.ts`, `era.ts`, `status.ts`, `recap.ts` |
| `src/modules/catalog/` | TMDB (`tmdb.ts`, `tmdb.fixtures.ts`), iTunes, `search.ts`, `cache.ts`, `display-media.ts` |
| `src/modules/links/` | `resolve.ts` (`resolveMusicLink(item, service, region)`: cache `media_link` → despacho por servicio → piso de búsqueda; `ResolveOutcome` exact/none/**unavailable** — unavailable NO cachea para que el siguiente tap reintente), `resolvers/tidal.ts` (API oficial v2 JSON:API, client credentials `TIDAL_CLIENT_ID/SECRET`, token en memoria, `searchResults?include=albums,albums.artists` + `/albums?filter[id]` si faltan créditos), `resolvers/match.ts` (puro: título Y artistas iguales tras normalizar, sin containment; guardrail `scripts/check-album-match.ts`), Apple Music exacto desde `catalog_item.raw.collectionViewUrl` (cero upstream), Spotify/YouTube Music → búsqueda. Odesli retiró su API 2026-07-31 y se eliminó. Brief: `~/Documents/Baclog/requerimientos/brief-link-out-post-odesli.md`; learning `2026-09-02-tidal-search-endpoint-y-fold-latino.md` |
| `src/modules/analytics/` | `capture.ts`, `aggregate.ts` |
| `src/modules/growth/` | `waitlist.ts`, `founder.ts` |
| `src/modules/admin/` | Torre de Control: `guard.ts`, `metrics.ts`, `checks.ts`, `costs.ts` |
| `src/modules/cards/` | Generación de cards/stickers compartibles (`adapter.ts`, `render/`, `double-feature/`) |
| `src/lib/` | `env.ts`, `color.ts`, `format.ts`, `plural.ts` |
| `src/auth/` | Config de NextAuth, OTP, mailer, sesión (detalle en `security.md`) |

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda. -->

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->
- **Link-out de música: un resolver por servicio, fail-open al piso de búsqueda (2026-09-02).** Odesli («una llamada trae todo») murió; ahora cada servicio resuelve solo y un fallo transitorio (sin key, 429/5xx, timeout) devuelve la búsqueda SIN cachearla. Un link exacto equivocado es peor que una búsqueda: el matcher exige título y artistas iguales, nunca containment.
- **Spotify se queda en búsqueda profunda por ahora (2026-09-02).** Desde 2026-02 la Web API en Development Mode exige cuenta Premium del desarrollador, 1 Client ID y uso «no comercial»; la app quedó sin crear, pendiente de decisión del founder. YouTube Music no tiene API de álbumes: búsqueda por diseño.
- **Los links de música se cachean sin región** aunque la búsqueda de TIDAL use `countryCode` del viewer: los ids de álbum son globales; la disponibilidad por país es problema de la página de TIDAL, no nuestro.

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
- Hay `catalog_item` de tipo álbum cuyo `title` es una pista (p. ej. «Black Boy (Alternative)») y cuyo `collectionViewUrl` apunta al álbum contenedor (*Drowning*): Apple Music aterriza bien, pero el matcher de TIDAL no encontrará un álbum con ese título → búsqueda. Costo: menos links exactos; arreglo real = normalizar el catálogo al importar.
