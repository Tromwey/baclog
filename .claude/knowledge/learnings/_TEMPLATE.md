---
id: YYYY-MM-DD-slug-corto
domain: <uno de los dominios de state/ — backend | frontend | data | security | recs | infra>
guardrail: <archivo del test/lint/CI que ahora lo atrapa, o "none (motivo)">
status: resolved
---

# <Título en una línea: el síntoma tal como se ve>

## Síntoma
Cómo se reconoce rápido: el mensaje de error, el comportamiento, dónde aparece (logs, UI, build).

## Causa raíz
Qué lo provoca de verdad (no el síntoma).

## Prevención
- El fix.
- ¿Qué guardrail ejecutable lo atrapa ahora? Si no aplica (bug de entorno, de un tercero, proceso), dilo explícito y por qué.
- El callejón sin salida: qué NO hacer / la conclusión equivocada en la que es fácil caer.
