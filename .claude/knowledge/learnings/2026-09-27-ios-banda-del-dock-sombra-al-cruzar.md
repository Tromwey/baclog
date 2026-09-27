---
id: 2026-09-27-ios-banda-del-dock-sombra-al-cruzar
domain: frontend
guardrail: none (efecto de composición visual; no hay snapshot test de iOS que mida una franja de 1–2 niveles de luminancia)
status: resolved
---

# iOS · Tus colecciones: "popea una sombra" abajo al arrastrar el carrusel

## Síntoma
Al arrastrar horizontalmente entre colecciones aparece una franja más oscura/de otro tono
sobre el dock (la banda de 150 pt), que desaparece al asentarse. En el video del founder, a
mitad del arrastre la franja mide ~(24,33,47) contra (17,36,53) del resto del fondo; en reposo
es invisible.

## Causa raíz
`CarouselDockBand` cruzaba DOS bandas semitransparentes apiladas:
`band(lo)` + `band(hi).opacity(t)`. Eso no es un crossfade: donde la rampa de alfa es parcial
(α ∈ (0,1)), el apilado da más opacidad que una sola banda y sesga el color hacia `lo`
(t = 0.5, α = 0.5 → 0.56·lo + 0.44·hi en vez de 0.5/0.5), mientras el fondo de abajo SÍ
cruza exacto (capas opacas). La diferencia es la "sombra". Las capas opacas
(`CarouselSurface`, `CarouselTail`) no tienen el problema: `a` + `b.opacity(t)` es un lerp
exacto solo si `a` es opaca.

## Prevención
- Fix: una sola banda cuyo relleno es el tail que cruza (`CarouselTail`, opaco) enmascarado
  por la rampa — `kFeedDockBand(fill:)` en `ios/Kura/DesignSystem/Tokens.swift`.
- Regla: para cruzar dos capas con alfa parcial, cruza el COLOR (capa opaca) y aplica el alfa
  una vez (mask). Nunca apiles dos semitransparentes con `opacity(t)`.
- La web ya lo hacía bien (`carousel-motion.ts` mezcla `feedTail` con `mixHex` y pinta un
  solo gradiente).
- Callejón sin salida: ocultar/atenuar la banda durante el drag, o culpar a la sombra del
  abanico o al fade del cuerpo — el fade del cuerpo oscurece TODO por igual; la franja es
  solo la zona de la rampa.
