# Estado — security

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: YYYY-MM-DD

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
| `src/modules/admin/guard.ts` | `requireAdmin()` — gate del panel Torre de Control |
| `src/modules/backlog/public.ts` | `getPublicProfile` (+ conteo de seguidores F3.10), superficie pública gated por `users.isPublic` |
| `src/modules/social/queries.ts` | F3.10: lecturas cross-user CON sesión pero re-gateadas en `isPublic + username` por query (postura público-safe; reglas en AGENTS.md). Incluye `searchProfiles` (F3.10.2 Buscar gente): busca por handle o **nombre** solo entre perfiles públicos — un privado no se encuentra por nombre igual que no se encuentra por URL; excluye al viewer; metacaracteres de LIKE escapados |
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
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
