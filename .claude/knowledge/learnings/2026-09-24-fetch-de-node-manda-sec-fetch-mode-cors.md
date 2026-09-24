---
id: 2026-09-24-fetch-de-node-manda-sec-fetch-mode-cors
domain: security
guardrail: scripts/api-smoke.ts (W1: `wRaw` sobre `node:http`; los rechazos del handoff se cruzaron uno a uno con su `reason=` en el log)
status: resolved
---

# Con un chequeo de Fetch Metadata en el servidor, todo test hecho con `fetch` de Node "pasa" por la razón equivocada

## Síntoma
Al meter la mitigación de login-CSRF en `GET /api/auth/handoff` (rechazar si `Sec-Fetch-Mode` ≠ `navigate`),
cada caso negativo de W1 (segundo GET, bearer como `t`, handoff sin fila…) seguía en verde — pero el log decía
`reason=cross_site` en todos: ninguno estaba probando lo que su nombre dice. Y la apertura legítima fallaba.

## Causa raíz
El `fetch` de Node (undici) manda **siempre** `sec-fetch-mode: cors` (cumple la spec de Fetch) y no se puede
sobreescribir: pasar `Sec-Fetch-Mode: navigate` en `headers` no cambia lo que sale al cable. Un servidor que
use Fetch Metadata ve a TODO cliente `fetch` de Node como una petición embebida.

## Prevención
- En el smoke, las peticiones a la ruta de handoff van por `node:http(s)` (`wRaw`): en el cable salen
  exactamente los headers que el caso pasa — ninguno por defecto, como un cliente viejo —, así que cada
  rechazo es el que el caso nombra. La apertura legítima manda `Sec-Fetch-Site: none` + `Sec-Fetch-Mode:
  navigate` (lo que manda un `SFSafariViewController`).
- Verificación: cruzar los `[auth/handoff] rid=… reason=…` del log con los casos (bad_to, cross_site ×2,
  used, used, used, bad_aud, no_token, used) — un caso negativo que "pasa" sin su motivo esperado no prueba nada.
- El callejón sin salida: "setear el header en `fetch`" (undici lo ignora) o "quitar el chequeo en dev"
  (entonces el smoke deja de cubrir la mitigación). Y no concluir que la mitigación rompe clientes reales: un
  navegador sí manda `navigate`; el que no es el script.
