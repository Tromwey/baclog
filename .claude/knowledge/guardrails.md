# Guardrails — checks automáticos y qué error previene cada uno

La documentación ayuda a *recordar*; un guardrail ejecutable es lo que **impide que un error vuelva**.
La meta: cada aprendizaje en `learnings/` que se pueda automatizar termina como una fila de esta tabla.

Una fila se escribe desde el error, no desde el check: la columna *"Qué previene"* debe nombrar el bug
concreto que ya ocurrió, no describir lo que el test hace.

| Guardrail | Dónde corre | Qué previene | Archivo |
|---|---|---|---|
| `pnpm tsx scripts/check-album-match.ts` | manual (correr al tocar `resolvers/match.ts`) | Que el link-out exacto a TIDAL mande a un álbum equivocado: containment («Cars» reclamando «Cars 2», como pasó en recs), matching solo por título sin artista, sufijos «- Single»/«(Deluxe)» rompiendo la igualdad, y que un «(Alternative)» legítimo se colapse | `scripts/check-album-match.ts` |
| `pnpm tsx scripts/check-series-status.ts` | manual (correr al tocar `catalog/series-status.ts`) | Que el pill de serie mienta: un `Ended` con `in_production` viejo en true leyéndose como "En emisión", un `Planned` con 0 temporadas pintando "0 temporadas", un `raw` de `/search/tv` sin marcador contando como "ya enriquecido" (y el pill quedándose vacío para siempre), o una serie terminada re-pegándole a TMDB cada semana | `scripts/check-series-status.ts` |
| `pnpm tsx scripts/check-first-run.ts` | manual (correr al tocar `first-run-coach.ts` o lo que el onboarding ESCRIBE) | Que el coach de primer uso vuelva a morir en silencio: una cuenta recién salida del onboarding v2 (3 títulos, todos `obsessed`, nada juzgado) TIENE que ver las tres notas (v1 no las veía y nadie lo notó dos semanas); que la obsesión sola cuente como "ya reaccionó" (v2 la planta); que la nota de Backlogs mienta con biblioteca vacía o títulos no amados | `scripts/check-first-run.ts` |
| `pnpm tsx scripts/check-spring.ts` | manual (correr al tocar `src/lib/spring.ts` o `hooks/use-sheet-motion.ts`) | Que las hojas dejen de SENTIRSE bien sin ningún error de tipos: un spring con damping 1 que rebota al aparecer, un soltado que pierde la velocidad del dedo (costura entre arrastrar y animar), `onRest` disparando dos veces o tras `stop()` (= `onClose` doble / desmontar una hoja que el usuario re-agarró), la proyección cambiada a `v²/2a`, o un dedo que pausó antes de soltar leyéndose como flick | `scripts/check-spring.ts` |
| `pnpm tsx scripts/api-smoke.ts --base http://localhost:<puerto>/api/v1 --email ericbriseno@baclog.app --log .next/dev/logs/next-development.log --only auth,reads` | manual (correr al tocar `src/authz/api.ts`, `src/auth/session.ts`, `src/app/api/v1/**`, `_lib/schemas.ts` o cualquier módulo que un handler v1 reutilice; y antes de `pnpm ship` con cambios de API). **Solo lecturas**, con la cuenta del founder | Que la API móvil deje pasar lo que no debe o rompa el contrato con la app sin que nadie lo vea: un bearer manipulado / con `aud` ajeno / expirado / de usuario borrado devolviendo algo que no sea el MISMO 401; un `Me` con `birthYear` o `isAdmin`; un payload con `email` o `birthYear` AJENO (solo `Me` lleva `email`); una respuesta v1 sin `private, no-store`; un error fuera del contrato `{ error: { code, message, reason?, fields? } }`; una lista fuera de `{ items }`; un 404 de perfil privado distinto del de inexistente o del malformado; el puente `apiContext` → `getCurrentUser()` dejando de ver al usuario del bearer (`GET /me` pasa por `assertUser()` a propósito) | `scripts/api-smoke.ts` |
| `pnpm tsx scripts/api-smoke.ts --base … --email qa-api-<epoch>@baclog.dev --log … --only writes` | manual (mismos disparadores; obligatorio al tocar cualquier handler que muta o `modules/{account,avatar,backlog,reviews,social}/**`). Crea una **cuenta QA desechable** al inicio y la borra al final con `DELETE /me` (`e1DeleteMe` entra por `writes.push` DESPUÉS del literal: siempre es el último caso, y su assert cuenta `qa-api-%` en la DB = 0). `SMOKE_UPCOMING_TITLE_ID=<catalog id con releaseDate futura>` habilita el caso `not_released` (sin él se salta con aviso) | Que una escritura de la API acepte un `userId` en body/query/path; que una escritura no sea idempotente (PUT repetido de membresía/marca/follow fallando o re-estampando `obsessedAt`/`statusChangedAt`); que la regla de estreno se salte en servidor (marca sobre un título sin estrenar sin `preview: true` que no sea 409 `not_released`); que quitar la última membresía deje viva la reseña (`item_review` no cascadea desde `user_item`); que reseñar sin reaccionar no sea 409 `reaction_required`; que `POST /me/onboarding` con < 13 años no bloquee la cuenta (bearer sigue vivo); que `DELETE /me` deje filas. **Ojo (learnings 2026-09-24)**: el runner aborta en el PRIMER fallo, así que tras un FAIL la cuenta QA puede quedar viva en la DB (que ES prod) — `delete from "user" where email like 'qa-api-%'` a mano; y el 429 de 60 escrituras/min es COMPARTIDO entre los bloques E1/E2/E3 (una sola cuenta, un solo minuto): `e2call` reintenta una vez tras `retryAfterSeconds`, no subir `RATE_LIMIT_WRITES` | `scripts/api-smoke.ts` |
| `pnpm tsx scripts/check-wire.ts` | manual (correr al tocar `src/app/api/v1/_lib/wire/*`, `_lib/schemas.ts` o `modules/backlog/mark.ts`) | Que los serializadores de wire dejen de cumplir el contrato sin que ningún tipo lo note: una fecha con fracción de segundo (`.000Z`, que el `JSONDecoder.iso8601` de Swift rechaza), la precedencia de marca cambiada (`obsessed` → `liked` → `completed`; un `disliked` propio DEBE leerse como `completed`), una colección con `titleIds` fuera de `addedAt desc` o con `coverTitleId` apuntando a un título sin portada, `visibility` mal plegada desde `(isPublic, showOnProfile)`, o un `Person` que lleve `id`/`email`. Puro: sin DB ni servidor | `scripts/check-wire.ts` |

## Comandos

- `pnpm lint` — ESLint (`eslint.config.mjs`, base `eslint-config-next`).
- `pnpm build` — `next build`; hoy es también el typecheck de facto (falla ante errores de TS).
- `npx tsc --noEmit` — typecheck aislado, más rápido que el build (`tsconfig.json`, `strict`).
- `pnpm tsx scripts/check-album-match.ts` — asserts del matcher de álbumes (puro, sin DB ni red); sale 1 al primer fallo.
- `pnpm tsx scripts/check-series-status.ts` — asserts del mapeo status TMDB → pill de serie + staleness (puro, sin DB ni red); sale 1 al primer fallo.
- `pnpm tsx scripts/check-first-run.ts` — asserts de `firstRunCoach` (puro, sin DB ni red); sale 1 al primer fallo.
- `pnpm tsx scripts/check-spring.ts` — asserts de la física de movimiento (spring/proyección/rubber-band/velocidad de soltado; puro, reloj de frames falso); sale 1 al primer fallo.
- `pnpm tsx scripts/api-smoke.ts --base <url>/api/v1 --email <cuenta> --log <archivo> [--only auth,reads|writes] [--token <jwt>] [--code NNNNNN]` — smoke de la API v1 contra un servidor VIVO; valida cada respuesta contra los zod de `src/app/api/v1/_lib/schemas.ts`; sale 1 al primer fallo. Un solo `next dev` por árbol (`.next/dev/lock`): si ya hay uno, se usa su puerto y `--log .next/dev/logs/next-development.log` (el OTP del dev-mailer queda ahí como JSON). `--only auth,reads` (default) con la cuenta del founder; `--only writes` SOLO con cuenta QA `qa-api-…` (la DB es prod), que el propio smoke crea y borra; `SMOKE_UPCOMING_TITLE_ID` para el caso de estreno. Sin `AUTH_SECRET` en el entorno se saltan los casos que acuñan tokens.
- `pnpm tsx scripts/check-wire.ts` — asserts de los serializadores de wire de la API v1 + `kuraMarkOf`/`publicMarkOf` (puro, sin DB ni red); sale 1 al primer fallo.
- `pnpm eval:recos` — corre el harness de evaluación de recomendaciones
  (`scripts/eval-crossmedia.ts`); mide calidad de recos, **no** es una suite de tests.

## Dónde corre cada capa

- **pre-commit / pre-push**: no hay. El repo no tiene `.husky/` ni `.pre-commit-config.yaml`; nada
  se ejecuta automáticamente al commitear.
- **CI**: no hay. No existe `.github/workflows/` ni equivalente, y Vercel no corre checks en PRs.
- **Deploy**: manual (`pnpm ship` → `vercel --prod`, `pnpm beta` → `scripts/deploy-beta.sh`).
  Mergear a `main` **no** despliega.

Consecuencia: hoy todo check es manual y voluntario. La primera fila de la tabla de arriba
probablemente exija crear también la capa donde corra.

## Huecos conocidos (sin guardrail — cuidado manual)

- **Tokens de Tailwind scopeados por pantalla — `@theme inline` los vuelve inertes.** Redefinir un
  token del bloque `@theme inline` (p. ej. `--font-mono`) en un subárbol compila limpio, emite la
  regla… y no tiene efecto, porque la utility lleva el VALOR sustituido y nunca lee la variable.
  Verificación manual al scopear cualquier token: el estilo COMPUTADO en el navegador
  (`getComputedStyle(el).fontFamily`), dentro y fuera del scope — el CSS emitido no distingue "la
  regla existe" de "la regla manda". Origen:
  `learnings/2026-09-21-theme-inline-redefinir-un-token-por-subarbol-no-hace-nada.md`.

<!--
Lo que sabemos que puede romperse y NADIE atrapa automáticamente. Cada hueco dice por qué no es
automatizable (o qué falta para serlo) y cuál es la verificación manual mientras tanto. Al crearse el
check, la entrada se mueve a la tabla de arriba.
-->

- **Coach marks de primer uso — la mitad de RUNTIME.** `check-first-run.ts` cubre la lógica pura, pero no
  que las páginas la llamen ni que el onboarding siga escribiendo lo que el check asume (3 picks
  `obsessed`, sin veredicto). Verificación manual cada vez que cambie lo que el onboarding ESCRIBE:
  cuenta QA en local (OTP en el log del dev server), pasar el onboarding y confirmar que las tres notas
  aparecen y se levantan al agregar/completar/juzgar. Origen:
  `learnings/2026-09-16-tutorial-derivado-de-datos-muere-si-onboarding-planta-datos.md`.
- **API v1 — el recorrido REAL desde la app iOS.** El smoke ejercita cada endpoint con `fetch`, no la app:
  no atrapa un `Decodable` de Swift que rechace un campo, un `LiveAPI` que mande el body en otra forma
  (multipart vs raw en `PUT /me/avatar`), ni el flujo completo (OTP → username → picks → gente →
  colecciones → marca → reseña). Verificación manual: simulador (`iPhone 17 Pro`) contra el `next dev`
  del árbol en `localhost:3010`, cuenta QA, OTP del log, y borrar la cuenta al terminar. No hay CI para
  `ios/`.
- **API v1 — los 503 `unavailable` de proveedores caídos** (`search`, `onboarding/pool`, `titles/{id}`
  de álbum sin caché): no se pueden provocar sin mockear la red o quitar `TMDB_API_KEY` a un servidor
  dedicado; el smoke solo cubre el camino feliz. Verificación manual cuando se toque `unifiedSearchDetailed`
  o el pool: arrancar sin la key y confirmar 503 con `{ error: { code: "unavailable" } }`, no 500 ni `[]`.
- **Gestos de las hojas — la mitad de NAVEGADOR.** `check-spring.ts` cubre la física, pero no la cascada
  (una clase con `@keyframes … both` pisando el `transform` del gesto) ni `touch-action` (el navegador
  reclamando el pan y cancelando el pointer stream), que solo fallan con un dedo real. Verificación manual
  en un teléfono al tocar `use-sheet-motion.ts`, `sheet.tsx` o `search-sheet.tsx`: arrastrar lento y soltar
  (regresa), flick (se va), arrastrar hacia arriba (resiste), agarrar a media salida (sigue al dedo), y que
  una hoja con contenido que desborda siga scrolleando. Origen:
  `learnings/2026-09-17-hojas-con-gesto-css-keyframes-y-touch-action.md`.
