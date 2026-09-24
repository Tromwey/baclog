# Estado — infra

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: 2026-09-24 (API v1 · fases 0–3)

## Qué cubre este dominio
<!-- Build, deploy, entornos, variables de entorno y dependencias.
     Los checks automáticos (los que haya) se listan en `guardrails.md`, no aquí. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `package.json` | Scripts: `dev`, `build`, `start`, `lint`, `beta`, `ship`, `eval:recos`. Gestor: **pnpm**. Dependencia directa nueva (2026-09-24): **`jose` ^6.2.12** (JWT HS256 de la API v1, `src/authz/api.ts`; antes solo llegaba como transitiva de next-auth — pnpm dedupe una sola copia) |
| `pnpm-workspace.yaml` · `pnpm-lock.yaml` | Workspace y lockfile de pnpm |
| `next.config.ts` | `experimental.staleTimes` y los `rewrites` de fallback que sirven `/{username}` |
| `vercel.json` · `.vercel/` | Config y vínculo del proyecto en Vercel |
| `scripts/deploy-beta.sh` | Deploy a beta (`pnpm beta`) |
| `.env.example` · `.env.local` | Envs requeridos y valores locales (este último no versionado) |
| `eslint.config.mjs` · `postcss.config.mjs` · `tsconfig.json` | Lint, PostCSS/Tailwind v4 y TypeScript |
| `.claude/launch.json` | Config del dev server para el runner de preview (`pnpm dev`, puerto 3000, `autoPort`) |
| `drizzle.config.ts` | Aplicación de migraciones (ver `data.md`) |
| `ios/project.yml` | Proyecto Xcode de la app iOS Kura, generado con **xcodegen** (`/opt/homebrew/bin/xcodegen generate` desde `ios/`); build headless: `xcodebuild -project ios/Kura.xcodeproj -scheme Kura -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build`. No participa del deploy de Vercel. **TestFlight (2026-09-24):** `MARKETING_VERSION` 1.0.0 (se sube a mano), `CURRENT_PROJECT_VERSION` "1" de fallback (el script lo fija), `Config/Kura.xcconfig` hace `#include? "Team.xcconfig"` (gitignoreado, plantilla `Team.xcconfig.example`) → `DEVELOPMENT_TEAM = $(KURA_TEAM_ID)`; sin team el simulador compila sin firmar |
| `ios/scripts/archive.sh` · `ios/ExportOptions.plist` | Archive + export para TestFlight: exige `KURA_TEAM_ID` (o `Config/Team.xcconfig`), certificado **Apple Distribution** (o `KURA_CLOUD_SIGNING=1`, o llave ASC `KURA_ASC_KEY_ID/ISSUER_ID/KEY_PATH` para `--upload`), regenera con xcodegen, `xcodebuild archive` (Release, `generic/platform=iOS`, `-allowProvisioningUpdates`, build = `git rev-list --count HEAD` o `KURA_BUILD_NUMBER`), **aborta si el `Info.plist` archivado no trae `KuraAPIBase = https://baclog.app/api/v1`**, exporta con `ExportOptions.plist` (`app-store-connect`, automatic, `uploadSymbols`; `teamID` se rellena en una copia en `build/`) y falla si no hay `.ipa` o si el log no confirma export/subida. Salidas en `ios/build/` (ignorado). La subida la hace el founder (Transporter, `altool --apiKey`, `-p @keychain:…`, o `--upload`). Pasos que requieren su Apple ID: `ios/README.md` › TestFlight |
| `public/kura-icon.svg` | Fuente del ícono de app (sistema Kura §marca · ícono); los PNG (`icon-192/512`, `apple-touch-icon`) se rasterizan con `qlmanage -t -s 1024` + `sips -z` — `scripts/generate-icons.mjs` quedó obsoleto (dibujaba el destello lima) |

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
- **Un solo `next dev` por árbol de trabajo.** Next 16 toma un flock sobre `.next/dev/lock`
  (`{pid, port, appUrl}`) por `distDir`, no por puerto: un segundo `next dev -p <otro>` sobre el mismo
  directorio imprime `✓ Ready` y muere con "Another next dev server is already running". Antes de
  arrancar uno: `cat .next/dev/lock` y `curl -s -o /dev/null -w "%{http_code}"
  <appUrl>/api/v1/me` — `401` = vivo, úsalo (sirve el mismo árbol con HMR). Nunca borrar el lock a
  mano (mata el HMR del que lo tiene). Dos servidores a la vez = dos worktrees.
  Learning: `2026-09-24-next-dev-lock-un-servidor-por-arbol.md`.
- **OTP cuando el dev server lo levantó otro proceso**: sin stdout propio, el `[dev-mailer]` queda en
  `.next/dev/logs/next-development.log` (líneas JSON con `"message":"[dev-mailer] OTP para …"`); el
  `--log` de `scripts/api-smoke.ts` lo lee tal cual.

## Decisiones tomadas (y por qué)

- **API v1 para iOS vive en el mismo deploy (`src/app/api/v1/**`, 2026-09-24, fases 0–3 en `main`)** — aditiva: no toca la web, así que desplegarla no rompe nada; `pnpm ship` se corre **desde el repo padre** (no desde un worktree — ver memoria `baclog-beta-deploy`) con el smoke verde (`scripts/api-smoke.ts --only reads` y `--only writes`, ver `guardrails.md`) contra el `next dev` local. Los handlers son Node runtime (usan `node:async_hooks`), nunca edge. La app iOS (`ios/`) apunta en Release a `https://baclog.app/api/v1` y en Debug a `http://localhost:3010/api/v1` (`KURA_API_SCHEME`/`KURA_API_HOST` en `ios/project.yml`); `jose` ^6.2.12 es dependencia directa por el bearer HS256.

<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

- **iOS → TestFlight sin secretos en el repo (2026-09-24)** — el Team ID (público, pero por cuenta) nunca se versiona: `ios/Config/Team.xcconfig` gitignoreado con include opcional, y `archive.sh` lo pasa por línea de comando (gana a cualquier xcconfig). Firma automática, sin entitlements (no SIWA, no push, no keychain sharing — decisiones del founder para la v1). `.gitignore` raíz e `ios/.gitignore` ignoran `*.p8`, `*.p12`, `*.mobileprovision`, `*.cer`, `*.xcarchive`, `*.ipa`. **Publicador = Tromwey (founder, 2026-09-24), nada de Communeo en la app**: Bundle ID `com.tromwey.kura` (aún sin registrar en Apple; también es el service del Keychain, el subsystem de `os.Logger` y la clave de `LocalPrefs`, así que cambiarlo después de publicar cierra la sesión de todos), y el aviso de privacidad (`src/app/(marketing)/privacidad/content.ts`) nombra a Tromwey como responsable; siguen los placeholders de correo y domicilio, y mientras existan `/privacidad` responde 404 (App Store la exige antes de testers externos). El nombre de vendedor que ve la gente en App Store lo fija la cuenta de Apple Developer (individual = nombre legal; organización = nombre del D-U-N-S), no el código. **Primer build en TestFlight: 1.0.0 (203), subido 2026-09-24 16:59** con `xcodebuild -exportArchive` + `destination = upload` (cuenta de Xcode, sin llave ASC ni contraseña; receta en `ios/README.md` › paso 8). Team `F975J7TBHP` (cuenta individual tromwey@gmail.com, Admin), Bundle ID registrado por `-allowProvisioningUpdates`, ficha creada a mano en App Store Connect ("Kura" estaba tomado). ⚠️ **La firma en la nube NO sirve para este team** (la Ñ del nombre rompe el designated requirement → *Invalid Signature*; `learnings/2026-09-24-firma-en-la-nube-ñ.md`): certificado Apple Distribution local obligatorio, y `archive.sh` ahora verifica el requisito de firma del .ipa antes de subir.

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
