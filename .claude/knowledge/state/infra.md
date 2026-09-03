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

- **Login local para verificar en runtime**: `.env.local` NO tiene `RESEND_API_KEY`, así que el OTP
  no se manda por correo — se imprime en el log del dev server como `[dev-mailer] OTP para <email>:
  Tu código de acceso es NNNNNN`. Con eso se entra con una cuenta QA desechable (la DB local ES la de
  prod, ver `AGENTS.md`/memoria: borrar la cuenta al terminar). El route de sesión y las páginas
  autenticadas se prueban así, no con curl.
- **Browser pane oculto = página a medias**: si el panel del navegador de la app de escritorio está oculto, `document.visibilityState` es `hidden`, `requestAnimationFrame` no dispara y React 19.2 NUNCA revela los Suspense boundaries streameados (`$RC` encola en `$RB` y espera un rAF): la página se queda en el `loading.tsx` y `read_page` ve vacío. Destrabar desde `javascript_tool`: `if ($RB.length) $RV($RB)` y luego `_reactRetry()` en los nodos comentario `<!--$-->` (ver `learnings/2026-09-02-browser-pane-oculto-suspense-no-revela.md`). Los screenshots sí pintan, pero solo el primer paint: para ver toda la página, `resize_window` a un viewport alto (430×5400) en vez de scrollear.
- **Dev server desde un worktree**: `.claude/launch.json` (y por tanto `preview_start`) arranca el
  árbol principal, no el worktree. Para verificar código de un worktree se lanza `pnpm exec next dev
  -p 3010` ahí (con los symlinks `.env.local` y `node_modules`) y se abre la URL en el navegador.

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
