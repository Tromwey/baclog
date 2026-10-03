---
id: 2026-10-01-error-tsx-retry-no-unstable-retry
domain: frontend
guardrail: none (TypeScript no tipa las props de `error.tsx`: el componente declara las suyas y Next pasa lo que pasa; solo se nota al tocar el botón con el boundary activo)
status: resolved
---

# El "Reintentar" de la ficha lanzaba: `error.tsx` recibía `retry`, no `unstable_retry`

## Síntoma
`(app)/item/[catalogItemId]/error.tsx` desestructuraba `unstable_retry` y lo llamaba en "Reintentar".
`tsc`, `eslint` y `next build` limpios. Con el boundary en pantalla, tocar el botón era
`TypeError: unstable_retry is not a function` — el único camino de recuperación de la ficha estaba roto,
y nadie lo veía porque un boundary solo se ejercita cuando algo ya falló.

## Causa raíz
La prop cambió de nombre entre versiones de Next: `unstable_retry` (16.2) → `retry` (el 16.3.8 instalado;
`node_modules/next/dist/client/components/error-boundary.js` pasa `{ error, reset, retry }`). El archivo
se escribió contra la doc de 16.2 y sobrevivió al upgrade porque las props de un archivo de convención
las declara el propio componente: para TypeScript cualquier nombre es válido.

## Prevención
- Antes de escribir o tocar un `error.tsx`, leer
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` DE LA VERSIÓN
  INSTALADA y, si hay duda, `grep -n "retry\|reset" node_modules/next/dist/client/components/error-boundary.js`
  (es la fuente de lo que realmente llega). AGENTS.md ya lo dice: "This is NOT the Next.js you know".
- Tras subir Next, `grep -rn "unstable_" src/app` — los nombres `unstable_*` son los que se renombran.
- Un boundary se prueba forzándolo (un `throw` temporal en la página) y TOCANDO su botón; compilar no
  prueba nada.
- ~~Hoy los cuatro boundaries usan `retry` o `reset`, que sí existen.~~ **Corrección (ronda 2, mismo día):**
  esa frase escondía un segundo bug. `feed/error.tsx` usaba `reset`, que existe pero NO re-pide el segmento:
  solo limpia el boundary y vuelve a renderizar los mismos hijos, así que tras una lectura fallida del feed
  "Reintentar" volvía a lanzar el mismo error. "Existe" no es "hace lo que el botón promete". Desde la ronda 2
  los SEIS boundaries — `app/error.tsx`, `app/global-error.tsx`, `(app)/error.tsx`, `u/error.tsx`,
  `feed/error.tsx`, la ficha — llaman `retry()`. Revisión manual: `grep -rn "reset" src/app --include=error.tsx
  --include=global-error.tsx` debe salir vacío.
