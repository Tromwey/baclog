---
id: 2026-09-29-audiocontext-cerrado-tras-remontar
domain: frontend
guardrail: none (efecto de runtime en el navegador; sin tests de UI en el repo)
status: resolved
---

# /party se quedó mudo: "context is closed" al entrar

## Síntoma
En dev, la invitación /party dejó de sonar por completo (reja, zumbido, efectos). La consola
llena de `Construction of OscillatorNode is not useful when context is closed` y
`InvalidStateError: Cannot suspend/close a closed AudioContext`.

## Causa raíz
`PartyInvitation` (componente de CLASE) creó el `AudioContext` en `componentDidMount` y lo cerró en
`componentWillUnmount`, pero dejó la referencia en `this.ctx`. React StrictMode (dev) monta →
desmonta → vuelve a montar **la misma instancia**: el segundo `componentDidMount` vio `this.ctx`
ya existente (cerrado) y no creó otro. Además `party-sfx.ts` marcaba la carga de muestras como hecha
con un booleano global, así que tampoco recargaba con el contexto nuevo.

## Prevención
- Al cerrar un recurso en `componentWillUnmount`/cleanup, **anula la referencia** (`this.ctx = null`
  y resetea sus flags, p. ej. `droneOn`). En clases, la instancia sobrevive al remontaje de StrictMode.
- Carga ligada al contexto, no a un booleano global (`loadingFor === ctx`); los `AudioBuffer` no
  están atados a un contexto, así que se reutilizan y solo se baja lo que falte.
- Callejón sin salida: "en producción no hay StrictMode, no importa" — el founder prueba en su
  iPhone contra el dev server; y un remontaje real (navegación) rompería igual.
