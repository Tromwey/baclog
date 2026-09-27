---
id: 2026-09-27-hstack-sin-limite-ensancha-la-pagina
domain: frontend
guardrail: none (layout de SwiftUI que depende de los datos; se ve con `-kuraScreen recap`, cuyo mock ahora trae 6 títulos en "También en tu mes")
status: resolved
---

# iOS: el Recap sale más ancho que la pantalla, centrado y cortado por ambos lados

## Síntoma
En un iPhone real, el recap del mes con el título cortado ("…iembre"), la portada de "lo más tuyo" y la
columna izquierda de stats fuera de pantalla, el botón "…r tarjeta" cortado. En el simulador con el mock
de 4 títulos se veía bien (o casi).

## Causa raíz
"También en tu mes" era un `HStack` desnudo de portadas de tamaño fijo (96 alto; un álbum 1:1 = 96 de
ancho) dentro del `VStack` de la página. Un `HStack` de hijos fijos pide su ancho ideal completo; con 5
álbumes (5·96 + 4·10 = 520 pt > 345 de contenido) el `VStack` adopta ese ancho y el `ScrollView` vertical
lo centra: TODA la página se ensancha, no solo la tira. Depende de los datos del mes, no de un commit
(el código no cambió entre c2c5eb9 y 2ca9262).

## Prevención
- Una fila de N elementos de tamaño fijo con N variable va en `ScrollView(.horizontal)` (a sangre con
  padding interno/externo negativo y margen vertical para la sombra), nunca en un `HStack` suelto dentro
  de una página.
- El mock del recap ahora trae 6 títulos (`MockAPI.recap`), así `-kuraScreen recap` reproduce el caso.
- Callejón sin salida: culpar al HeroHost / `.heroRecedes()` / safe area de los commits del día. El
  síntoma (todo desplazado y centrado) es de un hijo que pide más ancho, no de geometría del host.
