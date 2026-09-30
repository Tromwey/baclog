---
id: 2026-09-30-compose-graphicslayer-alpha-recorta-sombras
domain: frontend
guardrail: none (visual; verificar con capturas a 0/40/80 % de la subida de la card del feed y midiendo la luminancia sobre el borde)
status: resolved
---

# Compose: una sombra dentro de `graphicsLayer { alpha < 1 }` se corta en el borde de la caja

## Síntoma
En el feed de Android, la sombra hacia arriba de la card que se está fijando desaparecía de golpe
justo cuando la banda de color empezaba a subir (founder, Pixel 4). La luminancia sobre el borde
pasaba de 40 a 33 sin transición.

## Causa raíz
Cuando `alpha < 1`, Compose renderiza esa capa en un búfer fuera de pantalla del tamaño exacto del
nodo (`CompositingStrategy.Auto` → offscreen) y todo lo que se dibuja fuera de sus límites — el
difuminado de `kShadow`/`shadow` — queda recortado. Con `alpha == 1` se dibuja directo y la sombra
se ve completa; por eso "se corta justo al empezar".

## Prevención
- `graphicsLayer { alpha = …; compositingStrategy = CompositingStrategy.ModulateAlpha }` en capas
  que llevan sombra u otro dibujo fuera de límites (`FeedScreen.kt`, sombra de la banda).
- Mejor aún: la sombra y la superficie que la proyecta son una sola capa que se mueve junta (la card
  fijada del feed ya es una superficie única con su pincel; la banda plana aparte se eliminó, y con
  ella la costura de la esquina redondeada).
- Callejón sin salida: agrandar la caja de la sombra "para que quepa" — sigue recortando en cuanto
  cambia el alpha.
