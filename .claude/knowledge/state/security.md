# Estado — security

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: 2026-09-24 (API v1 · fase 0)

## Qué cubre este dominio
<!-- Autenticación, autorización app-layer, gates de admin, superficies públicas y manejo de secretos.
     El esquema de las tablas de auth vive en `data.md`. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `src/auth/config.ts` · `index.ts` | Configuración de NextAuth v5 y sus exports |
| `src/auth/otp.ts` · `mailer.ts` | Flujo de código de un solo uso y su envío |
| `src/auth/session.ts` · `types.d.ts` | Lectura de sesión y tipos aumentados |
| `src/authz/index.ts` | `assertUser` / `assertOwnsBacklog` / `assertOwnsUserItem` — toda la autorización |
| `src/authz/errors.ts` | Errores de autorización |
| `src/authz/api.ts` · `api-context.ts` | **API v1 (Kura iOS, `ios/API.md`)**: `requireApiUser(request)` (bearer HS256 firmado con `AUTH_SECRET`, `aud=kura-ios`, `sub=user.id`, 30 días, `jti` aleatorio, sin tabla de sesiones — relee `users` por `sub` en cada request con `loadUserById`, la MISMA lista de campos que la cookie, nunca `birthYear`), `issueMobileToken`, `verifyMobileToken`, `withApi`/`withPublicApi` (contrato de errores §1, rate limit, `Cache-Control: private, no-store` en toda respuesta), `apiError`/`ApiError`. `api-context.ts` es el `AsyncLocalStorage` que hace que `getCurrentUser()` devuelva el usuario del bearer dentro de un handler v1 (ver Decisiones) |
| `src/app/api/v1/**` | Route handlers de la API móvil. Solo `auth/otp/*` es público (`withPublicApi`, rate limit por IP); todo lo demás va tras `withApi`. `_lib/schemas.ts` = los zod del contrato de wire (`Me` es el ÚNICO payload con `email`; ningún esquema lleva `birthYear` ni `userId` de entrada) |
| `src/modules/admin/guard.ts` | `requireAdmin()` — gate del panel Torre de Control |
| `src/modules/backlog/public.ts` | `getPublicProfile` (+ conteo de seguidores F3.10), superficie pública gated por `users.isPublic` |
| `src/modules/social/queries.ts` | F3.10: lecturas cross-user CON sesión pero re-gateadas en `isPublic + username` por query (postura público-safe; reglas en AGENTS.md). Incluye `searchProfiles` (F3.10.2 Buscar gente): busca por handle o **nombre** solo entre perfiles públicos — un privado no se encuentra por nombre igual que no se encuentra por URL; excluye al viewer; metacaracteres de LIKE escapados |
| `src/modules/social/trending.ts` · `title-activity.ts` · `affinity.ts` | **Revamp UI (2026-09-03)**: tres lecturas cross-user CON sesión, misma postura que `social/queries.ts` — cada rama re-gatea `publicAuthor` (`isPublic = true AND username IS NOT NULL`) DENTRO de la query con lista blanca; `trending` y `affinity` gatean además `backlog.is_public` del dueño; `title-activity` jamás devuelve un "no me gustó" ajeno; `affinity` devuelve null para el propio dueño |
| `src/modules/backlog/title-stats.ts` | **Revamp UI**: `getTitleStats` — conteo de obsesionados/completados de un título sobre TODOS los usuarios (públicos y privados). Es un AGREGADO sin identidad ni campo per-user (postura de las métricas admin), servido en el ítem público. **Decisión del founder 2026-09-03: cuenta públicos y privados**, a propósito |
| `src/modules/backlog/onboarding-pool.ts` | **Revamp UI**: agregado de conteos por título del catálogo (sin identidad) para el paso "Elige tres" |
| `src/modules/reviews/queries.ts` | Feed público de reseñas (excepción authz #4, gated en `isPublic` + `hidden_at IS NULL`) |
| `src/app/api/auth/**` | Route handlers de auth y OTP |
| `src/app/api/avatar/[key]/route.ts` | F3.11: sirve la foto de perfil por `key` aleatorio por subida. Gate: dueño **público** → se sirve a cualquiera con la URL; dueño **privado** → solo a su propia sesión; key inválido/inexistente/ajeno = mismo 404 vacío (sin oráculo). `users.image` entra en las listas blancas público-safe (public.ts, social, reviews) bajo el MISMO gate que `username`: es identidad, no estado; en las listas de gente un seguido que se volvió privado devuelve `avatarUrl: null` |
| `src/lib/env.ts` | Acceso a variables de entorno |
| `.env.example` | Envs requeridos (los valores reales viven en `.env.local`, no versionado) |

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda.
     Los invariantes duros (autorización 100% app-layer sin RLS; nunca aceptar un `userId` cruzando
     un límite RPC; `isFounder` es badge y NO rol — los gates operativos usan `users.isAdmin`;
     las tres excepciones deliberadas al modelo de ownership) están en AGENTS.md. -->

## Decisiones tomadas (y por qué)

- **API v1 · bearer JWT sin tabla de sesiones (2026-09-24)** — la app iOS no tiene cookies; el token es un JWS HS256 con `AUTH_SECRET` (distinto del JWE de Auth.js: la cookie no se acepta como bearer ni al revés, y `aud=kura-ios` lo refuerza). Revocación = la misma que la web: `requireApiUser` relee la fila del usuario en CADA request (cuenta borrada o `isMinor` → 401). Todo 401 es el MISMO cuerpo (sin header / firma / aud / exp / usuario) — nunca se dice qué falló. `refresh` rota el `jti` pero el token viejo vive hasta su `exp`: revocación por dispositivo requerirá tabla (`mobile_session`, fase 4).
- **API v1 · el usuario llega a los módulos por `AsyncLocalStorage`, no por parámetro (2026-09-24)** — `withApi` corre el handler dentro de `apiContext.run({ user })` y `getCurrentUser()` (`src/auth/session.ts`) consulta ese store ANTES de `auth()`: dentro de un request v1 jamás se lee la cookie, y todo `assertUser`/`assertOwnsBacklog`/`assertOwnsUserItem` y los módulos que llaman a `getCurrentUser()` funcionan sin cambios bajo un bearer. `GET /me` usa `assertUser()` a propósito para que el puente se ejercite en cada smoke. Consecuencia: **ningún handler v1 acepta `userId`** en body/query/path — el actor sale del token y solo del token.
- **API v1 · rate limit en memoria por instancia (2026-09-24)** — ventana deslizante de 60 s, 60 escrituras / 300 lecturas por `sub` (por IP en `auth/*`). NO es global entre instancias de Vercel ni sobrevive un cold start: frena a un cliente desbocado, no es frontera de seguridad. La defensa real del OTP sigue siendo la de `src/auth/otp.ts` (cooldown en DB + 5 intentos por código).

- **Lecturas cross-user nuevas con Kura (2026-09-24)** — misma postura que F3.10 (gate `publicAuthor` DENTRO de la query + lista blanca): `src/modules/social/people.ts` (onboarding "tu gente": perfiles públicos que obsesionan los mismos títulos que elegiste; devuelve handle, nombre, foto y el título compartido; completa con `getFollowSuggestions`). Además `modules/backlog/public.ts` expone dos agregados/catálogo más del perfil público: `followingCount` (conteo sobre `user_follow`, nunca la lista) y `obsessions` (títulos con `user_item.obsessed`, campos de catálogo). Lecturas PROPIAS nuevas (no cross-user): `(app)/descubrir/library-index.ts`, `(app)/item/[catalogItemId]/collections-index.ts`, las dos queries del loader en `backlogs/backlog-zoom-view.tsx`, `recap/recap-data.ts` — todas filtran por el usuario de sesión. `checkUsernameAction` (solo lectura) responde si un handle existe: no revela nada nuevo (la URL pública ya lo hace).
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
