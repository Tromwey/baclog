---
id: 2026-09-02-date-crudo-en-sql-template-pierde-offset
domain: data
guardrail: none (no hay lint que distinga un `${date}` dentro de sql`` de un `lt(col, date)`; queda la regla en el helper `atParam` de `modules/social/queries.ts` y en `state/data.md`)
status: resolved
---

# "Ver más" del feed salta una ventana de horas — solo fuera de UTC

## Síntoma
En dev (máquina en America/Mexico_City) la página 2 del feed omitía todos los eventos de las ~6 h
anteriores al cursor (21 de 51 eventos desaparecían sin error) y aun así decía "fin del feed". En beta/prod
(Vercel, TZ=UTC) el mismo código paginaba perfecto — por eso la verificación "28 = 28" del feed v2 pasó
allá y el bug se vio hasta que un escenario QA local cruzó una frontera de página con eventos de más de
6 h de antigüedad.

## Causa raíz
`olderThan` (y el keyset de `getPeoplePage`) interpolaban el `Date` del cursor CRUDO en un template
`sql\`…\``. Sin columna a la que atarse, Drizzle lo pasa tal cual al driver de Neon, que lo serializa con el
offset LOCAL del proceso (`2026-09-02T10:13:12-06:00`). Las columnas son `timestamp` SIN zona, y Postgres
descarta el offset al comparar → el cursor aterriza 6 h antes de lo que debe. Verificado con el mismo
predicado: `Date` crudo → 0 filas; `toISOString()` → 20.

## Prevención
- Fix: `atParam(d)` = `sql\`${d.toISOString()}::timestamp\`` en `modules/social/queries.ts`; todo instante
  que entre a un template `sql` pasa por ahí. Los operadores atados a columna (`lt(itemReviews.createdAt,
  date)`) NO tienen el problema: codifican por la columna (`toISOString`).
- Guardrail: ninguno ejecutable hoy. `grep -rn '\${[a-zA-Z.]*[Aa]t}' src` sobre templates `sql` es la
  revisión manual; el helper es la barrera.
- El callejón sin salida: "en beta funciona, es tu máquina". Sí es la máquina — y también es cualquier
  proceso que no corra en UTC. Tampoco culpes al `date_trunc('milliseconds')` del learning anterior (ese
  resuelve µs-vs-ms; este es otro bug encima del mismo predicado).
