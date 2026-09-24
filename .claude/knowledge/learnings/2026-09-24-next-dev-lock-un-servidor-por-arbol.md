---
id: 2026-09-24-next-dev-lock-un-servidor-por-arbol
domain: infra
guardrail: none (es comportamiento de Next 16, no del repo; la regla operativa queda en este learning y en `state/infra.md` cuando se anote)
status: resolved
---

# `next dev -p <otro puerto>` arranca, imprime "Ready" y muere: "Another next dev server is already running"

## Síntoma
Con varios carriles en paralelo sobre el MISMO árbol de trabajo, el segundo `pnpm exec next dev -p 3013`
imprime `✓ Ready in 791ms` y acto seguido `⨯ Another next dev server is already running` con el PID y el
puerto del otro (`http://localhost:3015`), y sale. El puerto 3013 queda libre; `curl` da `000`. Un bucle
de espera "hasta que responda" nunca termina. El log del smoke (`--log <ruta propia>`) queda vacío porque
el OTP lo imprime el servidor del OTRO carril.

## Causa raíz
Next 16 toma un **flock sobre `.next/dev/lock`** (`node_modules/next/dist/esm/build/lockfile.js`) al
arrancar `next dev`, y el lock es por `distDir`, no por puerto. Dos `next dev` en el mismo directorio
son imposibles por diseño, cualquiera que sea el `-p`. El archivo `.next/dev/lock` guarda
`{"pid","port","hostname","appUrl","startedAt"}` del que manda.

## Prevención
- **Un `next dev` por árbol.** Si hay uno vivo, úsalo: lee el puerto de `.next/dev/lock`, comprueba que
  responde (`curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/api/v1/me` → `401`) y
  apunta el smoke ahí. Sirve el MISMO código (HMR recoge tus archivos); el OTP del dev-mailer aparece en
  el log compartido `.next/dev/logs/next-development.log` (líneas JSON, la regex del smoke sigue
  matcheando). Si nadie tiene el lock, arranca el tuyo. Los servidores de otros carriles se apagan sin
  aviso: haz el "elegir o arrancar" al inicio de cada corrida, no una vez.
- Si de verdad hacen falta dos servidores a la vez, hacen falta dos árboles (`git worktree`) — un
  `distDir` distinto por config sería un cambio compartido que pisa a los demás.
- Guardrail: ninguno ejecutable (es Next). Verificación manual: si `next dev` "arranca" pero el puerto
  no escucha, mira `.next/dev/lock` antes de perseguir nada.
- El callejón sin salida: creer que el servidor tarda en compilar y alargar la espera, o pensar que el
  puerto está ocupado. No es el puerto: es el lock. Tampoco borres `.next/dev/lock` a mano — matarías el
  HMR del carril que lo tiene.
- Relacionado: el runner de `scripts/api-smoke.ts` se detiene en el PRIMER fallo, así que un caso ajeno a
  medio escribir bloquea los tuyos. Para correr solo tu bloque sin tocar el script compartido: copia a
  la scratchpad con los imports `../src/` reescritos a absolutos, un `ln -s <repo>/node_modules` en la
  scratchpad (la resolución ESM no mira fuera) y un filtro por nombre de caso. Mejor aún: un `--grep`
  en el runner (pendiente).
