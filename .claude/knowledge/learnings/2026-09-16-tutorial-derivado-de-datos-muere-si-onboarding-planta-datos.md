# Un tutorial derivado de datos muere en silencio cuando el onboarding empieza a plantar esos datos

**Fecha:** 2026-09-16 · **Dominio:** frontend / producto

## Qué pasó
El welcome onboarding v1 (`7a3d50f`, 2026-08-01) derivaba su paso de `backlogs / user_item / LOVED_FILTER`
("paso 1 = cero backlogs, 2 = cero títulos, 3 = nada amado") y no persistía nada, a propósito. El
onboarding v2 del Revamp UI (`23e38c7`, 2026-09-03) agregó "elige tres": crea el primer backlog, agrega
tres títulos y los marca `obsessed`. Desde ese commit TODA cuenta nueva llegaba en paso 0 y la pantalla
"Empieza tu backlog", el medidor y los coach marks nunca se renderizaron. Nadie lo notó durante dos
semanas porque el código seguía compilando, `state/frontend.md` decía "Vacío FirstUse intacto" y el
Revamp además borró el coach del ítem (`reaction-coach.tsx`). El founder lo reportó como "los
tutoriales se perdieron".

## Por qué engaña
- Un gate derivado de datos no falla: simplemente deja de cumplirse. No hay error, no hay 404, no hay
  test que lo mida — solo una rama muerta.
- El copy que sobrevivió ("toca una fila", "el chevron abre el ticket", "«me gusta» en el menú de
  opciones") describía la UI vieja: aunque se hubiera disparado, habría mentido.

## Regla
Cuando cambies lo que el onboarding ESCRIBE (backlog inicial, ítems plantados, flags como `obsessed`),
recorre todo lo que se gatea en "el usuario todavía no tiene X" (`grep -rn "getFirstRunCounts\|firstRunCoach"`)
y pregúntate si un usuario nuevo puede seguir cumpliendo la condición. Y si borras una superficie
(menú ⋯, filas), busca el copy que la nombra en coach marks/empties.

## Cómo quedó
`modules/backlog/first-run.ts` ahora expone `firstRunCoach(counts)` con tres momentos que enseñan la
INTERFAZ (el "+", los glifos, la fila de reacción) y usan señales que v2 no puede plantar (`judged` =
veredicto o completado; obsesión sola no cuenta). Sigue siendo derivado y sin "visto" persistido.

## Guardrail
`pnpm tsx scripts/check-first-run.ts` (asserts de `first-run-coach.ts`, pura y sin DB): fija que una
cuenta recién salida de v2 vea las tres notas y que la obsesión sola no cuente como reacción. La mitad
de runtime (que las páginas la llamen, que v2 siga escribiendo lo mismo) sigue siendo manual — ver
`guardrails.md` · Huecos conocidos.
