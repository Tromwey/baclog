# Estado — infra

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: YYYY-MM-DD

## Qué cubre este dominio
<!-- Build, deploy, entornos, variables de entorno y dependencias.
     Los checks automáticos (los que haya) se listan en `guardrails.md`, no aquí. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `package.json` | Scripts: `dev`, `build`, `start`, `lint`, `beta`, `ship`, `eval:recos`. Gestor: **pnpm** |
| `pnpm-workspace.yaml` · `pnpm-lock.yaml` | Workspace y lockfile de pnpm |
| `next.config.ts` | `experimental.staleTimes` y los `rewrites` de fallback que sirven `/{username}` |
| `vercel.json` · `.vercel/` | Config y vínculo del proyecto en Vercel |
| `scripts/deploy-beta.sh` | Deploy a beta (`pnpm beta`) |
| `.env.example` · `.env.local` | Envs requeridos y valores locales (este último no versionado) |
| `eslint.config.mjs` · `postcss.config.mjs` · `tsconfig.json` | Lint, PostCSS/Tailwind v4 y TypeScript |
| `.claude/launch.json` | Config del dev server para el runner de preview (`pnpm dev`, puerto 3000, `autoPort`) |
| `drizzle.config.ts` | Aplicación de migraciones (ver `data.md`) |

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda.
     Regla dura ya documentada en AGENTS.md: los deploys son MANUALES (`vercel --prod`);
     mergear a `main` no despliega, y no hay checks de Vercel en PRs. -->

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
