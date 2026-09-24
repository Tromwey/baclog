---
id: 2026-09-24-404-identico-con-mensaje-distinto-es-oraculo
domain: security
guardrail: scripts/api-smoke.ts (los casos "404 idéntico" comparan el CUERPO con `assert.deepEqual`, no solo el status: `GET /people/{inexistente}` vs `{inválido}`, `PUT /me/following/{propio|inexistente|malformado}`, `GET /people/{h}/collections/{privada|inexistente}`)
status: resolved
---

# Dos "404 idénticos" de la API v1 tenían el mismo status pero distinto `message`: un oráculo de forma

## Síntoma
Al unificar handles malformados → 404 (C6), el smoke de writes falló en
`E1 PUT /me/following/…`: `malformado es el mismo 404 (sin oráculo de forma)`, con
`message: "No encontramos lo que buscas…"` (genérico) contra `"No encontramos ese perfil…"`
(el del handler). Ambos 404 `not_found`; solo el texto delataba que uno venía de
`parseHandle` (forma) y el otro del módulo (existencia/privacidad).

## Causa raíz
La regla "privado, inexistente y malformado son el MISMO 404" se cumplía a nivel de
status y `code`, pero cada capa ponía su propio copy: el helper de path (`parseHandle`
en `_lib/http.ts`) lanza `new ApiError("not_found")` con el mensaje por defecto, y el
handler lanzaba el suyo específico solo en la rama del módulo. Un cliente (o un prober)
distingue "la forma es inválida" de "no existe / es privado" leyendo el mensaje — que es
exactamente lo que el 404 uniforme quiere impedir.

## Prevención
- Fix: en `me/following/[handle]/route.ts` un solo `NOT_FOUND_MSG` para las tres ramas
  (forma, inexistente/privado en PUT, forma en DELETE). Regla general: si un endpoint
  devuelve un 404 con copy propio, TODAS sus ramas 404 usan ese copy — o ninguna.
- Guardrail: el smoke compara los cuerpos completos (`assert.deepEqual(a, b)`) en cada
  caso de "404 idéntico"; un `expectError(res, 404, "not_found")` por rama NO basta.
- El callejón sin salida: "ya da 404 en las dos, listo". El status es la mitad del
  contrato; el cuerpo es la otra mitad, y `X-Request-Id`/`Cache-Control` no cuentan
  porque varían por request.
