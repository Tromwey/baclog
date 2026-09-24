---
id: 2026-09-24-dia-de-estreno-impreso-en-zona-equivocada
domain: backend
guardrail: scripts/check-wire.ts ("releaseDayInstant: día TMDB → 06:00Z …" — afirma que las formas 00/06/07/08/12Z imprimen su propio día)
status: resolved
---

# "Sale el 30 sep" para un título que sale el 1 de octubre

## Síntoma
La ficha, la píldora del estante o el correo de estreno muestran el día ANTERIOR al estreno real. Ya pasaba con los 75 álbumes guardados a `00:00Z` (el feed de charts de iTunes manda `YYYY-MM-DD` pelado) y habría pasado con TODA película y serie al persistir el día de TMDB.

## Causa raíz
`catalog_item.release_date` es un INSTANTE, pero en casi todas las fuentes lo único real es un DÍA, y cada proveedor lo ancla a otra hora: iTunes búsqueda 07:00Z/08:00Z (medianoche Los Ángeles) o 12:00Z, charts 00:00Z, video 06:00Z (medianoche CDMX). Las etiquetas de día (`release.ts`, `components/kura/tint.ts`) formateaban en America/Los_Angeles: bien para 07/08/12Z, pero 00:00Z y 06:00Z caen la tarde/noche anterior en LA → día anterior. La cuenta regresiva nunca falló (es una resta de timestamps).

## Prevención
- Las etiquetas de día se imprimen en **UTC**: toda forma guardada cae dentro de su día UTC. Es la misma regla que la app iOS (`KuraJSON.dayAtNoon` lee componentes UTC). Un instante que NO es fecha de estreno (cuándo alguien guardó el título) se imprime con `homeDayLong` (America/Mexico_City).
- Guardrail: `scripts/check-wire.ts` afirma que las cinco formas imprimen el mismo día.
- Callejón sin salida: NO "arreglarlo" moviendo la hora guardada para que cuadre con la zona de la etiqueta. La hora decide cuándo cambian `isUpcoming`, el `409 not_released` y el cron, y para TMDB es medianoche CDMX a propósito (`RELEASE_DAY_UTC_HOUR`). Se cambia la impresión, no el dato. Si agregas otra etiqueta con zona fija, pruébala contra todas las formas de arriba.
