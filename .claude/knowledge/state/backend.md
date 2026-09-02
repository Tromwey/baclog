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
| `src/app/actions/social-actions.ts` | F3.10: follow/unfollow + paginación del feed y las listas |
| `src/modules/social/` | F3.10: `queries.ts` (chunk keyset privado de 4 ramas `fetchFeedChunk` + `getFeedCards`, la ÚNICA forma pública del feed — páginas de CARDS; sugerencias, listas), `group.ts` (puro/isomorfo: `groupIntoCards` — ráfagas por autor+`backlogId`+brecha ≤ `BURST_GAP` — `closedPrefix`, `liftGems`), `types.ts` (knobs `FEED_EVENT_CHUNK`/`FEED_CARDS_PER_PAGE`/`FEED_MAX_CHUNKS`). Los cursores keyset se producen SOLO con `encodeCursor` (reviews/queries.ts) y los instantes entran a `sql` vía `atParam` |
| `src/modules/reviews/` | F3.9: `queries.ts` (feed público de reseñas, `avatarHexesFor` compartido), `format.ts`, `types.ts` |
| `src/app/actions/waitlist-actions.ts` | Alta en waitlist y referidos |
| `src/app/api/auth/[...nextauth]/` · `src/app/api/auth/otp/request/` | Handlers de NextAuth v5 y solicitud de OTP |
| `src/app/api/catalog/search/` | Búsqueda en catálogo externo |
| `src/app/api/links/resolve/` | Resolución de links a servicios |
| `src/app/api/analytics/capture/` | Ingesta de eventos |
| `src/app/api/cron/recap/` | Job del recap |
| `src/modules/backlog/` | `queries.ts`, `public.ts`, `palette.ts`, `lenses.ts`, `era.ts`, `status.ts`, `recap.ts` |
| `src/modules/catalog/` | TMDB (`tmdb.ts`, `tmdb.fixtures.ts`), iTunes, `search.ts`, `cache.ts`, `display-media.ts` |
| `src/modules/links/` | `odesli.ts`, `providers.ts`, `resolve.ts`, `fallback.ts` |
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

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
