---
id: 2026-09-29-compose-path-arc-flags-pegadas
domain: frontend
guardrail: android/app/src/test/java/com/tromwey/kura/designsystem/GlyphPathTest.kt (expandArcFlags sobre cada path del DS)
status: resolved
---

# Android: los glifos del DS salen como "medias lunas" en Compose (reloj, lupa, feed, personas)

## Síntoma
En la galería de Android varios glifos aparecen deformados: el reloj es una media luna, la lupa un
gajo, el icono de Feed y el de personas pierden sus círculos. Los mismos paths se ven bien en la web
(SVG) y en iOS (SF Symbols no los usa).

## Causa raíz
Los paths de `design/kura/sistema-de-diseno.dc.html` vienen del SVG minificado, donde las banderas de
los arcos van pegadas al siguiente número (`A2 2 0 1 0 ...` escrito como `a2 2 0 100 20`, legal en
SVG porque `large-arc` y `sweep` son un solo dígito). `addPathNodes` de `androidx.compose.ui.graphics.vector`
no tokeniza así: lee `100` como un número y corre todos los argumentos del arco.

## Prevención
- `expandArcFlags` en `android/app/src/main/java/com/tromwey/kura/designsystem/Glyph.kt` normaliza
  cada path del DS antes de `addPathNodes` (separa las dos banderas y el `x` que les sigue).
  `GlyphPathTest` lo cubre para todos los glifos declarados.
- Cualquier glifo nuevo copiado del DS o de un SVG minificado pasa por la misma función; no pegues el
  path "arreglado a mano" (el DS es la fuente y se vuelve a copiar).
- Callejón sin salida: redibujar los glifos "porque Compose los pinta distinto" — el trazo era el
  mismo, solo estaba mal tokenizado.
