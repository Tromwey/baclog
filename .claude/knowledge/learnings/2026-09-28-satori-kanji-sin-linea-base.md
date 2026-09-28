---
id: 2026-09-28-satori-kanji-sin-linea-base
domain: frontend
guardrail: none (visual; se verifica midiendo la tinta de /prototype/og/perfil — ver Prevención)
status: resolved
---

# El 蔵 del lockup en los OG flotaba y "kura" quedaba pegado arriba

## Síntoma
En las vistas previas de link (`lib/og-cards.tsx`, Satori) el lockup «蔵 kura» salía con *kura*
alineado al tope del kanji, no a su centro, aunque la fila era `alignItems: "center"`.

## Causa raíz
Satori no alinea por línea base y centra CAJAS, no tinta. Con `lineHeight: 1` pone la línea base a
`(1 + asc − desc) / 2` em del tope de la caja, con las métricas **hhea** de cada fuente: Newsreader
0.735/0.265 → 0.735 em; el kanji recortado de Noto Serif CJK trae hhea 1.151/0.286 → 0.9325 em. Dos
fuentes con métricas tan distintas quedan desfasadas ~0.2 em aunque sus cajas estén centradas.

## Prevención
- `OgLockup` alinea las cajas arriba (`flex-start`) y baja 蔵 con esas dos constantes
  (`OG_NEWS_BASE`, `OG_KANJI_BASE`) + `LOCKUP_C.drop`. Medido: centro de tinta de 蔵 a 0.7 px del
  centro óptico de *kura* a 40 px.
- Si cambias cualquiera de las dos fuentes, recalcula con fontTools (`hhea.ascent/descent`) y mide la
  tinta del PNG (PIL, píxeles > 150 en la zona del lockup) — no lo ajustes a ojo.
- Callejón: `alignItems: "baseline"` o `center` "casi" funcionan con Newsreader sola y engañan; el
  error solo aparece al mezclar la fuente CJK.
