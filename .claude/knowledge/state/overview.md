# Estado — overview

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: 2026-09-24 (API v1 iOS)

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
| `src/app/api/` | Route handlers: auth, otp, catalog/search, links/resolve, analytics/capture, cron/recap, y **`v1/**` = la API de la app iOS** (contrato en `ios/API.md`, mapa en `state/backend.md`, authz en `state/security.md`) |
| `src/modules/` | Lógica de dominio: `account`, `admin`, `analytics`, `avatar`, `backlog`, `cards`, `catalog`, `growth`, `links`, `recs`, `reviews`, `social` — las server actions son wrappers finos de estos módulos y la API v1 los reutiliza tal cual |
| `src/components/` + `src/components/ui/` | Componentes de producto y primitivos de UI |
| `src/auth/`, `src/authz/` | Autenticación (NextAuth v5 + OTP; bearer HS256 para iOS en `authz/api.ts`) y autorización app-layer |
| `src/db/`, `drizzle/` | Esquema Drizzle y migraciones SQL versionadas |
| `src/lib/`, `src/hooks/` | Utilidades y hooks compartidos |
| `scripts/` | Deploy beta, eval de recos, seed de curadores, generación de íconos, y los guardrails manuales (`check-*.ts`, `api-smoke.ts` — ver `guardrails.md`) |
| `design/item-flow/` | HANDOFF de diseño del Revamp (reglas visuales de la app firmada) |
| `design/kura/` | **Sistema de diseño Kura + Flujos v2** (rebrand 2026-09-24): fuente de verdad de las superficies públicas y de la app iOS |
| `ios/` | **App nativa iOS Kura** (SwiftUI + xcodegen), **ya corre contra `/api/v1`** por `LiveAPI` (mock solo con `-kuraMock`/`-kuraScreen`). Ver `ios/README.md`, `ios/BRIEF.md` y `ios/API.md` |
| `~/Documents/Baclog` (fuera del repo) | Vault de Obsidian con el estado de producto — empezar por `estado-actual.md` |

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda. -->

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->
- **La marca es Kura (2026-09-24).** El producto se renombró de Baclog a Kura ("la bodega donde guardas lo que más vale"). El rebrand se aplicó primero a la marca global y a las superficies públicas y, la misma tarde (decisión del founder), a **toda la app web firmada** (ver `state/frontend.md` § Estado Kura); la experiencia nativa se construye en `ios/`. El repo, el proyecto de Vercel, el dominio `baclog.app` y la base siguen con el nombre viejo: renombrarlos es una decisión de infra aparte.

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->
- **API v1 para iOS — fases 0–3 hechas (2026-09-24), fase 4 pendiente de decisiones del founder** (`ios/API.md` §6–§7): Apple sign-in, push de estrenos (`device_token`), `web-session` para la tarjeta y `users.token_version` para revocar bearers — todas requieren migración en la base compartida. Norte inmediato: primer recorrido real de la app iOS contra el backend en el simulador y decidir las 7 preguntas de §7 antes del TestFlight.

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->

- **Feed rankeado (trabajo posterior, sin fecha)**: el founder quiere que el feed se genere por gustos + grafo + azar (Instagram/TikTok) en vez de cronológico "sin algoritmo" (F3.10). Producto lo mapea en el vault `requerimientos/feed-rankeado.md`. Implicación de código a recordar: el cursor keyset `(at, id)` de `getFeedCards` no sobrevive a un ranking global — la opción barata es rankear dentro de ventanas temporales; una lista materializada contradice "el feed es derivado, sin tabla" (`AGENTS.md`). No hay señal de engagement: `analytics_event` no registra taps en cards del feed.
