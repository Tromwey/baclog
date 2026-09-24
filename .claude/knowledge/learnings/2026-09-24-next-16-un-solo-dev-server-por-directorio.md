---
id: 2026-09-24-next-16-un-solo-dev-server-por-directorio
domain: infra
guardrail: none (comportamiento de Next 16, no del repo; el síntoma está en el log del segundo servidor)
status: resolved
---

# Un segundo `next dev -p <otro puerto>` en el mismo repo arranca, dice "Ready" y muere sin escuchar

## Síntoma
Con carriles en paralelo, cada uno lanza `pnpm exec next dev -p 301X > log &`. El segundo (y siguientes)
imprime `✓ Ready in 294ms` y a continuación `⨯ Another next dev server is already running. Local:
http://localhost:3015 · PID: 91047 · Run kill 91047 to stop it.` y sale. `curl localhost:301X` da
`ECONNREFUSED` (código 000), aunque el log empezó igual que un arranque bueno. Si solo miras la
primera línea del log crees que está levantado.

## Causa raíz
Next 16 (Turbopack) mantiene `.next/dev/lock` (`{pid, port, appUrl}`) por directorio de proyecto y
rechaza un segundo dev server sobre el mismo árbol aunque el puerto sea distinto: comparten `.next/`.
El lock es de OTRO carril (o de la sesión principal), así que "mátalo" no es opción.

## Prevención
- Antes de lanzar, `cat .next/dev/lock` y `curl -s -o /dev/null -w "%{http_code}" <appUrl>/api/v1/me`:
  si responde (401 = vivo), **usa ese servidor** — sirve el mismo árbol con HMR, tus rutas nuevas
  aparecen solas. Si no responde, el lock es huérfano y puedes arrancar el tuyo.
- Para el OTP del smoke sobre un servidor ajeno no hace falta su stdout: `.next/dev/logs/next-development.log`
  captura los `console.log` del servidor como JSON (`"message":"[dev-mailer] OTP para …"`) y el regex de
  `scripts/api-smoke.ts --log` lo encuentra ahí tal cual.
- Verifica readiness con el código HTTP, nunca con el `✓ Ready` del log.
- El callejón sin salida: creer que el puerto es la unidad de aislamiento. No lo es: lo es el
  directorio. Dos worktrees sí pueden convivir; dos carriles sobre `main` no.
