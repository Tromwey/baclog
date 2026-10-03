---
id: 2026-10-02-parche-con-comentario-de-linea-rompe-el-laberinto
domain: frontend
guardrail: scripts/sync-party-design.py → check_syntax() (node --check de cada módulo de public/party/laberinto y del <script> del Mausoleo; si uno no parsea, el script falla y no hay nada que desplegar)
status: resolved
---

# Un `// comentario` dentro de un parche de una línea dejó el laberinto sin arrancar en beta

## Síntoma
Tras cambiar los textos de los cuervos, `/party/laberinto` en beta se quedaba en negro: `app.js` no
parseaba (`SyntaxError: Unexpected token '{'` en la línea siguiente).

## Causa raíz
Los módulos del diseño traen objetos enteros en UNA línea (`cuervo(id, n, tot) { …; mensaje(…, 3200); },`).
El parche reemplazó solo el `mensaje(…, 3200);` y le añadió `// [Kura] …` al final: el comentario de línea
se tragó el `},` que seguía en la misma línea. Además el deploy iba encadenado con `;` después del
`node --check`, así que el chequeo falló y beta se publicó igual.

## Prevención
- En parches sobre código minificado o de una línea, comentar con `/* … */`, nunca `//`.
- El script de sincronización ahora corre `node --check` sobre todo lo que genera y aborta si algo no parsea.
- Encadenar el deploy con `&&` detrás de cualquier chequeo, nunca con `;`.
