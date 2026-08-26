# Estado — overview

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: YYYY-MM-DD

## Qué cubre este dominio
<!-- El norte del proyecto: qué se está construyendo, en qué fase está, qué hay en vuelo y cuál es la
     deuda que cruza dominios. Lo específico de un dominio va en su propio state/. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `src/app/(app)/` | App autenticada: backlogs, item, descubrir, para-ti, recap, search, perfil, settings, admin |
| `src/app/(auth)/` | Login, verify (OTP), onboarding, blocked |
| `src/app/(marketing)/` | Waitlist y créditos |
| `src/app/u/[username]/` | Perfiles y backlogs públicos (URLs bonitas vía `rewrites` en `next.config.ts`) |
| `src/app/actions/` | Server Actions (una por dominio funcional) |
| `src/app/api/` | Route handlers: auth, otp, catalog/search, links/resolve, analytics/capture, cron/recap |
| `src/modules/` | Lógica de dominio: `admin`, `analytics`, `backlog`, `cards`, `catalog`, `growth`, `links`, `recs` |
| `src/components/` + `src/components/ui/` | Componentes de producto y primitivos de UI |
| `src/auth/`, `src/authz/` | Autenticación (NextAuth v5 + OTP) y autorización app-layer |
| `src/db/`, `drizzle/` | Esquema Drizzle y migraciones SQL versionadas |
| `src/lib/`, `src/hooks/` | Utilidades y hooks compartidos |
| `scripts/` | Deploy beta, eval de recos, seed de curadores, generación de íconos |
| `design/item-flow/` | HANDOFF de diseño (fuente de las reglas visuales) |
| `~/Documents/Baclog` (fuera del repo) | Vault de Obsidian con el estado de producto — empezar por `estado-actual.md` |

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda. -->

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
