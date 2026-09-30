---
id: 2026-09-29-oauth-codigo-estacionado-csrf
domain: security
guardrail: scripts/check-music-export.ts ("claim…", "CSRF OAuth iOS…", "OAuth: complete exige claim…") + harness desechable contra Postgres (caso "CSRF OAuth iOS: el atacante EMPIEZA…")
status: resolved
---

# OAuth de TIDAL en iOS: "ligado a quien empezó + mismo bearer al final" NO cerraba el CSRF

## Síntoma
Revisión de seguridad del export (2026-09-29). `state/security.md` decía "CSRF de OAuth cerrado por diseño".
En iOS no lo estaba: un atacante podía quedarse con el TIDAL de una víctima ligado a SU cuenta de kura
(y escribir playlists en él), sin que ningún check fallara.

## Causa raíz
Flujo iOS: `POST /music/tidal/start` (bearer A) → `authorizeUrl` con `state` → el callback del servidor
estaciona el código y rebota `kura://music/tidal/authorized?ref=<state>` → la app llama
`POST /music/tidal/complete { ref }` con su bearer, y el servidor exige que sea el usuario que empezó.
El problema: **`ref` ES el `state`, y el que empieza ya lo conoce** (va en SU `authorizeUrl`). El atacante
empieza con su bearer, manda el `authorizeUrl` a la víctima, ella consiente en TIDAL, el callback estaciona
el código de la VÍCTIMA, y el atacante completa con `{ ref }` + su propio bearer: "mismo usuario que empezó"
se cumple perfectamente. Atar el final a la credencial del que empezó solo protege si el que termina además
prueba que estuvo en el navegador que volvió del proveedor. En web eso lo da la cookie del callback; en iOS,
con el callback en el servidor y el final por API, faltaba esa prueba.

## Prevención
- El callback genera un `claim` aleatorio (32 bytes base64url), guarda solo `sha256(claim)`
  (`music_oauth_state.claim_hash`) y lo pone ÚNICAMENTE en el rebote (`?ref&claim`). `complete` exige
  ref + claim (comparación en tiempo constante, `claimMatches` en `pkce.ts`) + el bearer que empezó; juzga
  ANTES de consumir la fila, así que un intento sin claim / con claim ajeno es el mismo 409 `auth_expired`
  y no quema el código del dueño.
- Guardrail: `scripts/check-music-export.ts` modela el ataque con las piezas puras (el claim nunca aparece
  en el `authorizeUrl`; sin él no hay match) y un grep exige `claimMatches` antes del `delete` en
  `completeTidalAuth`. El harness contra Postgres corre el ataque completo.
- El callejón sin salida: "el state es de un solo uso, está ligado al usuario y el final exige su bearer →
  cerrado". Todo cierto y aun así roto: la pregunta correcta es **qué sabe el atacante** (su propio state) y
  si algo del final depende de un secreto que SOLO llega al navegador de la víctima. Cualquier flujo "el
  servidor estaciona y el cliente termina por API" necesita ese secreto en el rebote.
