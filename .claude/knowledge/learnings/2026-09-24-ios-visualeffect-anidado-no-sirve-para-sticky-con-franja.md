---
id: 2026-09-24-ios-visualeffect-anidado-no-sirve-para-sticky-con-franja
domain: frontend
guardrail: none (comportamiento de layout de SwiftUI; solo se ve scrolleando en el simulador)
status: resolved
---

# Feed iOS: la card fijada queda a media altura y la franja de color no sube

## Síntoma
En el apilado del Feed v10 (`ios/Kura/Features/Feed/FeedView.swift`), cada card se fija bajo el
header y sube una "franja" de su color para teñir el header. Con un `.visualEffect` para el pin en
la card y OTRO `.visualEffect` para la franja (en un `.background` de la misma card), la card
fijada quedaba ~26 pt por encima de su lugar y la franja no terminaba de subir: se veía el color de
la card anterior detrás del header.

## Causa raíz
El `GeometryProxy` de un `visualEffect` anidado no mide lo que uno cree cuando un ancestro también
tiene `visualEffect`, y además se combina con `contentMargins` y el snap `.viewAligned`. Dos lecturas de
geometría independientes para un mismo movimiento se desincronizan.

## Prevención
- El fix: un solo `@State scrolled`, medido con un `GeometryReader` en el fondo del `VStack`
  (espacio de coordenadas con nombre sobre el `ScrollView`; `onScrollGeometryChange` es iOS 18 y
  el target es iOS 17). Como las alturas de las cards son deterministas (tiers), el `top` de cada
  card se calcula a mano y el pin y la franja salen de `.offset` normales.
- No hay guardrail ejecutable: verificarlo scrolleando en el simulador. La posición de depuración
  (`-kuraScreen feedreview`) sirve para comprobar que la card fijada tiñe el header.
- Callejón sin salida: ajustar constantes (±26 pt) hasta que "cuadre" en una captura. El error
  cambia con la posición del scroll; el problema está en tener dos fuentes de verdad.
