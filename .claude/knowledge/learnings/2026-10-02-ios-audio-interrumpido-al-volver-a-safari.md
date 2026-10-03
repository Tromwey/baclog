---
id: 2026-10-02-ios-audio-interrumpido-al-volver-a-safari
domain: frontend
guardrail: none (comportamiento de Safari iOS en dispositivo; no hay pruebas de UI)
status: resolved
---

# /party se quedaba mudo al salir de Safari y volver

## Síntoma
En el iPhone, salir de Safari (o cambiar de app) y volver dejaba la reja, el laberinto y el Mausoleo sin
sonido hasta recargar.

## Causa raíz
Dos cosas de iOS: (1) al mandar Safari al fondo, iOS pone el `AudioContext` en el estado no estándar
`"interrupted"` (a veces ANTES de que llegue `visibilitychange`), y (2) al volver no deja reanudarlo fuera
de un gesto del usuario. Nuestro handler solo reanudaba si el contexto estaba `"running"` al ocultarse (con
`"interrupted"` ni lo marcaba) y lo hacía sin gesto; `sfx.js` del diseño solo reanudaba `"suspended"`.

## Prevención
- Tratar cualquier estado distinto de `"suspended"`/`"closed"` como "estaba sonando" (`"interrupted"` incluido).
- Al volver (`visibilitychange` visible / `pageshow`): intentar `resume()` y ADEMÁS armar el siguiente
  toque/tecla para reanudar con certeza (`pauseAmbienceWhenHidden` en `src/app/party/party-drone.ts`).
- Reanudar si `state !== "running" && state !== "closed"`, no solo si `=== "suspended"`.

## Segundo caso (mismo día): mudo al cruzar de la reja al laberinto
Al llegar caminando desde la reja no hay pantalla "toca para entrar", y el primer toque en el laberinto suele
ser un ARRASTRE (mirar, joystick). iOS no da permiso de audio con un `touchend` que termina un arrastre; el
desbloqueo se intentaba una vez y quitaba sus listeners. Regla: no quitar los listeners de desbloqueo hasta que
`ctx.state === "running"` (laberinto-client.tsx y el script del Mausoleo).
