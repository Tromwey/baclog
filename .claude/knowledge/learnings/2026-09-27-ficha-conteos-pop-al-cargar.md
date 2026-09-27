---
id: 2026-09-27-ficha-conteos-pop-al-cargar
domain: frontend
guardrail: none (salto visual de runtime; se verifica con frames del simulador con mock lento)
status: resolved
---

# Al abrir un título, la cinta de conteos aparece tarde y empuja los botones

## Síntoma
iOS: al abrir la ficha desde una celda (vuelo de portada `TitleHeroHost` o push), el nombre, la línea mono y los botones Completar/Guardar/Reseñar se pintan, y ~medio segundo después aparece la fila "(flama) 12,4 k · (pulgar) … · (check) …" y los botones bajan ~22 pt. En el simulador con mock NO se ve: `MockData.titles` ya trae `counts`.

## Causa raíz
La ficha se dibuja con el `Title` que ya está en el store — el RESUMEN que llegó con la colección/biblioteca, sin `counts` (solo `GET /titles/{id}` los trae). `TitleHeader` tenía `if let c = t.counts { CountRibbon(...) }`, así que la fila entera (alto de la cinta + 12 de spacing del VStack) se insertaba cuando terminaba `loadTitle`, en medio del aterrizaje de la portada. Cualquier bloque condicionado a un campo "solo de detalle" (`isDetailed`) en la CABECERA tiene el mismo riesgo; debajo del pliegue (sinopsis, secciones) crecer no mueve nada visible.

## Prevención
- Fix: la fila se reserva siempre (una `CountRibbon` oculta de un conteo en un `ZStack` fija el alto a cualquier Dynamic Type) y los conteos entran con `.transition(.opacity)` + `kAnimation(KMotion.short)`. Sin conteos se queda el hueco: colapsarlo al llegar la respuesta es el mismo salto. Web: `CountRibbon reserve` en la ficha (su skeleton ya pinta esa fila).
- Para reproducirlo en mock hay que quitar `counts` a los títulos registrados al arrancar (`AppStore` registra `MockData.titles`) y retrasar `MockAPI.title(id:)`; y desinstalar la app entre corridas (si no, el título ya cargado sigue en caché y el "antes" se ve bien).
- Callejón: no lo "arregles" animando la inserción (sigue moviendo los botones, solo que despacio) ni con un pulso de placeholder (el sistema prohíbe pulsos fuera de skeletons).
