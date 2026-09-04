# Estado — backend

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: 2026-09-03 (Revamp UI)

## Qué cubre este dominio
<!-- Server Actions, route handlers, módulos de servidor e integraciones externas.
     El esquema y las migraciones van en `data.md`; auth/authz en `security.md`;
     el motor de recomendaciones y sus evals en `recs.md`. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `src/app/actions/backlog-actions.ts` | Mutaciones de backlogs (`renameBacklogAction(id, name, vibe?)` desde el Revamp UI) |
| `src/app/actions/backlog-item-actions.ts` | Membresía de ítems y estado por título |
| `src/app/actions/account-actions.ts` | Cuenta, username, perfil (`chooseServiceAndFinishAction` volvió en onboarding v2 pero vive en `onboarding-actions.ts`, no aquí) |
| `src/app/actions/onboarding-actions.ts` · `complete-actions.ts` | Revamp UI: `completePicksAction` (crea "Obsesiones" + picks obsesionados, misma ruta que `addItemAction`) · `chooseServiceAndFinishAction(service)` (onboarding v2: zod sobre `preferredServiceEnum`, escribe `users.preferredService` y `redirect("/backlogs")` server-side — `finishOnboardingAction` ya no existe); `completeItemAction` (status → reacción → `saveReviewAction`, todas las gates intactas) · `setMembershipAction` |
| `src/app/actions/crossmedia-actions.ts` · `crossmedia-feedback-actions.ts` | Recos cross-media y su feedback (ver `recs.md`) |
| `src/app/actions/palette-backfill-actions.ts` · `palette-cache-actions.ts` | Backfill y caché de la paleta (ADN) de portadas |
| `src/app/actions/report-actions.ts` | Reportes de contenido |
| `src/app/actions/review-actions.ts` · `review-moderation-actions.ts` | Reseñas F3.9 (guardar/borrar/reportar) y su moderación admin |
| `src/app/actions/social-actions.ts` | F3.10: follow/unfollow + paginación del feed y las listas; `searchProfilesAction` (F3.10.2 Buscar gente: needle ≤60 chars, todo lo demás lo decide `searchProfiles`) |
| `src/modules/social/` | **Revamp UI (2026-09-03)**: `trending.ts` (`getTrendingAmongFollowed` — títulos con más seguidos activos en 7 días, 4 ramas gated `publicAuthor` + `backlogs.isPublic`), `title-activity.ts` (`getTitleActivityAmongFollowed` — seguidos que reseñaron/obsesionan/completaron/gustaron un título, sin "no me gustó"), `affinity.ts` (`getAffinity` — seguidos en común + títulos en común gated en `backlog.is_public` del dueño). F3.10: `queries.ts` (chunk keyset privado de 4 ramas `fetchFeedChunk` + `getFeedCards`, la ÚNICA forma pública del feed — páginas de CARDS; sugerencias, listas, `searchProfiles` = Buscar gente: `LIKE` sobre `username` + `ILIKE` sobre `name` con escape de `%_\\`, ranking exacto→prefijo→substring→nombre, seguidores desc; ≥2 chars, cap 20 sin paginar; **fold de acentos** en dos mitades: needle NFD-strip en JS (`normalizeProfileQuery`) y `name` vía `translate()` en SQL sobre diacríticos latinos (`FOLD_FROM/FOLD_TO`) — sin extensión `unaccent` a propósito, sería migración en la DB compartida), **`getFeedSuggestion`** (feed v3, 2026-09-02: la card "Quizá quieras seguir" — candidato = perfil público NO seguido que sigue a MÁS de los seguidos del viewer (empate: follow más reciente) → línea `common` "Sigue a @a y @b"; si el grafo no da nadie, cae a `getFollowSuggestions(…,1)` sin `common`; `reason` = obsesión compartida → "N títulos en común" → "Tiene N backlogs" → "Acaba de llegar"; 3 portadas recientes con `paletteHex`; todas las lecturas re-gatean `publicAuthor`, un privado jamás se nombra ni como follow común; null si el viewer no sigue a nadie). Los `FeedEvent` llevan **`paletteHex`** (paleta de portada, público-safe) para el glow del feed v3. `group.ts` (puro/isomorfo: `groupIntoCards` — ráfagas por autor+`backlogId`+brecha ≤ `BURST_GAP` — `closedPrefix`, `liftGems`), `types.ts` (knobs `FEED_EVENT_CHUNK`/`FEED_CARDS_PER_PAGE`/`FEED_MAX_CHUNKS`). Los cursores keyset se producen SOLO con `encodeCursor` (reviews/queries.ts) y los instantes entran a `sql` vía `atParam` |
| `src/modules/reviews/` | F3.9: `queries.ts` (feed público de reseñas, `avatarHexesFor` compartido), `format.ts`, `types.ts` |
| `src/app/actions/waitlist-actions.ts` | Alta en waitlist y referidos |
| `src/app/actions/avatar-actions.ts` · `src/modules/avatar/` · `src/app/api/avatar/[key]/` | F3.11 foto de perfil: `uploadAvatarAction(FormData)` re-checa tamaño (`AVATAR_MAX_BYTES`) y **sniffea magic bytes** (`sniff.ts`: webp/jpeg/png, nunca SVG) antes de guardar en `user_avatar` con `key` nuevo por subida y apuntar `users.image` a `/api/avatar/{key}`; `removeAvatarAction` borra puntero y bytes. El recorte/resize a 512px es **on-device** (`client.ts`, canvas → WebP con fallback JPEG), sin librería de imagen en servidor. El route handler sirve los bytes con `Cache-Control: private, immutable` (el CDN NO cachea: "privado" debe ser inmediato) + `nosniff` + CSP `sandbox`; la lógica de visibilidad está en `security.md` |
| `src/app/api/auth/[...nextauth]/` · `src/app/api/auth/otp/request/` | Handlers de NextAuth v5 y solicitud de OTP |
| `src/app/api/catalog/search/` | Búsqueda en catálogo externo |
| `src/app/api/onboarding/pool/` | Onboarding v2 (2026-09-03): `GET ?page=N` (1..20, sesión requerida vía `getCurrentUser`, 401/400) → `{ items: OnboardingPoolItem[], nextPage: number \| null }`; delega en `getOnboardingPoolPage` |
| `src/app/api/links/resolve/` | Resolución de links a servicios |
| `src/app/api/analytics/capture/` | Ingesta de eventos |
| `src/app/api/cron/recap/` | Job del recap |
| `src/modules/backlog/` | `queries.ts`, `public.ts` (+ `getPublicReactionCounts`, `upcoming` con `mediaType`/`paletteHex`, `backlogs[].covers`), `palette.ts`, `lenses.ts`, `era.ts`, `status.ts`, `recap.ts`, `visibility.ts` (`visibilityOf` PLANO), y los del **Revamp UI (2026-09-03)**: `library.ts` (`getLibraryUpcoming` — estrenos de toda la biblioteca), `shelves.ts` (`getShelvesForUser` — backlogs con portadas+estado+conteos en 2 queries), `profile-stats.ts` (`getReactionCounts`/`getObsessions`/`getProfileCards`, solo del propio usuario), `title-stats.ts` (`getTitleStats` — conteo obsesión/completado de un título sobre TODOS los usuarios, agregado sin identidad), `onboarding-pool.ts` (onboarding v2: `getOnboardingPoolPage(page)` — pool CURADO de proveedores, no de la DB: por página 4 film · 4 series · 4 álbum intercalados; página 1 = populares TMDB, 2–10 = ciclo de géneros drama·comedia·sci-fi·animación·terror·documental·romance·crimen·thriller tomando los primeros 4 de cada `discover`, 11–20 = mismo ciclo tomando los siguientes 4; álbumes = charts Apple mx+us fusionados, 4 por página; todo pasa por `cacheExternalItems` para tener `catalogItemId`/`paletteHex`; sin poster se descarta; 20 páginas) |
| `src/modules/catalog/` | TMDB (`tmdb.ts`, `tmdb.fixtures.ts`), iTunes, `search.ts`, `cache.ts`, `display-media.ts`, y **`series-status.ts`** (Revamp UI 06c/06d, 2026-09-03 — pill "Terminada · 1 temporada" / "En emisión · N temporadas": módulo PURO con el mapeo `status` TMDB → `ended`/`airing`, el copy y la regla de staleness; el fetch `getSeriesFacts` vive en `tmdb.ts` (`GET /tv/{id}?language=es-MX`, solo `status`/`number_of_seasons`/`in_production`/`last_air_date`), la persistencia `cacheSeriesFacts` en `cache.ts` (jsonb `raw || patch` + marcador `_series_facts_at`, SIN columna nueva) y el orquestador `getSeriesStatus` en `display-media.ts`, que ya viaja en `getItemDisplayMedia().seriesStatus` a ambas páginas de ítem. Fail-open a null en cualquier fallo upstream. Guardrail: `scripts/check-series-status.ts`). Y los del **pool de onboarding v2 (2026-09-03)**: `tmdb-discover.ts` (`discoverVideo` — `/discover/{movie,tv}` por popularidad con `vote_count.gte` y género opcional, `language=en-US` como la búsqueda para que el título guardado siga en inglés, fetch cacheado 1 h, sin key ⇒ `[]`) · `itunes-charts.ts` (`mostPlayedAlbums(mx\|us)` — RSS `rss.marketingtools.apple.com/api/v2/{sf}/music/most-played/100/albums.json`, keyless, 1 h; `id` = collectionId de iTunes y `raw` reconstruido en la forma de una colección de iTunes Search para que resolver/artist-upcoming lo lean igual) |
| `src/modules/links/` | `resolve.ts` (`resolveMusicLink(item, service, region)`: cache `media_link` → despacho por servicio → piso de búsqueda; `ResolveOutcome` exact/none/**unavailable** — unavailable NO cachea para que el siguiente tap reintente), `resolvers/tidal.ts` (API oficial v2 JSON:API, client credentials `TIDAL_CLIENT_ID/SECRET`, token en memoria, `searchResults?include=albums,albums.artists` + `/albums?filter[id]` si faltan créditos), `resolvers/match.ts` (puro: título Y artistas iguales tras normalizar, sin containment; guardrail `scripts/check-album-match.ts`), Apple Music exacto desde `catalog_item.raw.collectionViewUrl` (cero upstream), Spotify/YouTube Music → búsqueda. Odesli retiró su API 2026-07-31 y se eliminó. Brief: `~/Documents/Baclog/requerimientos/brief-link-out-post-odesli.md`; learning `2026-09-02-tidal-search-endpoint-y-fold-latino.md` |
| `src/modules/recs/discover-rails.ts` | Revamp UI: `getObsessionRails` (recos YA cacheadas por semilla obsesionada, sin motor al cargar) · `getLatestDoubleFeature` (último par visto por el usuario) |
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
- **Los hechos de serie (estado/temporadas) se funden en `catalog_item.raw`, no en columnas (2026-09-03).** Migrar la DB compartida necesita al founder; el jsonb ya existe y el `/search/tv` guardado no trae esos campos. La frescura se lee de un marcador propio dentro de `raw` (`_series_facts_at`) y NO de `refreshed_at`, porque el upsert de búsqueda bumpea `refreshed_at` sin tocar `raw` (una re-búsqueda haría parecer frescos hechos de hace semanas). Series terminadas nunca se re-consultan; en emisión, cada 7 días.
- **Link-out de música: un resolver por servicio, fail-open al piso de búsqueda (2026-09-02).** Odesli («una llamada trae todo») murió; ahora cada servicio resuelve solo y un fallo transitorio (sin key, 429/5xx, timeout) devuelve la búsqueda SIN cachearla. Un link exacto equivocado es peor que una búsqueda: el matcher exige título y artistas iguales, nunca containment.
- **Spotify se queda en búsqueda profunda por ahora (2026-09-02).** Desde 2026-02 la Web API en Development Mode exige cuenta Premium del desarrollador, 1 Client ID y uso «no comercial»; la app quedó sin crear, pendiente de decisión del founder. YouTube Music no tiene API de álbumes: búsqueda por diseño.
- **Los links de música se cachean sin región** aunque la búsqueda de TIDAL use `countryCode` del viewer: los ids de álbum son globales; la disponibilidad por país es problema de la página de TIDAL, no nuestro.

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
- Hay `catalog_item` de tipo álbum cuyo `title` es una pista (p. ej. «Black Boy (Alternative)») y cuyo `collectionViewUrl` apunta al álbum contenedor (*Drowning*): Apple Music aterriza bien, pero el matcher de TIDAL no encontrará un álbum con ese título → búsqueda. Costo: menos links exactos; arreglo real = normalizar el catálogo al importar.
