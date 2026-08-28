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
`recapSends`, `releaseNotices`, `reports`.

Últimas migraciones: **0023 `user_follows`** (F3.10, aditiva-inocua — `user_follow` con unique
`(follower, followed)` + índice en `followed`) y **0024 `backlog_visibility`** (F3.10.1, aditiva —
`backlog.is_public` + `backlog.show_on_profile`, ambas boolean NOT NULL DEFAULT true; "featured"
se deriva como `is_public AND show_on_profile`, ver AGENTS.md). **Ambas aplicadas a la DB
compartida el 2026-08-26**, antes del deploy del código, según el patrón de la casa. El feed social
NO tiene tabla propia: se deriva (ver AGENTS.md).

Deuda anotada: las ramas del feed ordenan por timestamps sin índice compuesto `(user_id, <at>)`
(escanean por `user_id` y ordenan); irrelevante a decenas de usuarios, revisar si el feed crece.

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda.
     El modelo de datos de ítems en tres niveles (backlog_item = membresía, user_item = estado por
     título, catalog_item.paletteHex = paleta compartida) está documentado en AGENTS.md. -->

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
