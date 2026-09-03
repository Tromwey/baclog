---
id: 2026-09-02-browser-pane-oculto-suspense-no-revela
domain: infra
guardrail: none (es el entorno de verificación, no el producto; la receta vive en `state/infra.md`)
status: resolved
---

# Con el Browser pane oculto, las páginas con `loading.tsx` se quedan en el skeleton

## Síntoma
Verificando el feed v3 desde el Browser pane de la app de escritorio (que estaba OCULTO), `/feed/gente`
y `/feed` cargaban con 200 en el log del dev server pero `read_page`/`innerText` del `<main>` devolvían
el skeleton de `loading.tsx` para siempre; los botones "Seguir" existían en el DOM pero dentro de un
`<div hidden id="S:0">`, sin fiber de React, y `.click()` no hacía nada. Los clicks del tool `computer`
daban timeout ("The Browser pane is currently hidden").

## Causa raíz
Con el panel oculto `document.visibilityState === "hidden"` y el navegador no dispara
`requestAnimationFrame`. React 19.2 revela los Suspense boundaries streameados en lote: `$RC(b, s)`
encola el par en `$RB` y programa `$RV($RB)` con `requestAnimationFrame` — que nunca llega. Sin
revelado no hay hidratación del segmento, así que tampoco hay handlers. Las páginas sin boundary
pendiente (login, onboarding) sí funcionaban, lo que despistó.

## Prevención
- Receta desde `javascript_tool`, después de cada navegación completa:
  `if (window.$RB?.length) $RV($RB)` y luego recorrer los comentarios del body
  (`createTreeWalker(document.body, NodeFilter.SHOW_COMMENT)`) llamando `n._reactRetry?.()`; a partir
  de ahí los botones tienen fiber y `.click()` sirve. Polyfillear rAF con `setTimeout` NO basta si el
  `$RC` ya corrió antes.
- Los screenshots del panel oculto sí pintan, pero solo el primer paint: para revisar una página larga
  hay que `resize_window` a un viewport alto (p. ej. 430×5400) y capturar de una, no scrollear (sale
  negro).
- El callejón sin salida: culpar al HMR/"stale compile error" del otro learning. Aquí el SSR era
  correcto y el log limpio; el problema estaba en el navegador oculto, no en el servidor.
