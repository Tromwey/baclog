---
id: 2026-09-17-hojas-con-gesto-css-keyframes-y-touch-action
domain: frontend
guardrail: scripts/check-spring.ts (la física); el resto es del navegador — none, ver Prevención
status: resolved
---

# Una hoja arrastrable no puede entrar con `@keyframes`, y sin `touch-action` el dedo nunca llega

## Síntoma
Al volver `<Sheet>` arrastrable (capa de movimiento Apple, 2026-09-17) aparecen cuatro trampas que no dan
error, solo "no se siente":
1. El panel **ignora el arrastre**: el `transform` inline que escribe el gesto no hace nada.
2. En touch el arrastre **se corta a los ~10px** (llega `pointercancel`) aunque con mouse funciona perfecto.
3. La hoja que un server component renderiza de entrada (Novedades, F3.8) **nunca anima la entrada** y queda
   invisible.
4. Verificando desde el Browser pane OCULTO, los springs "saltan" al final o `onClose` tarda ~700 ms.

## Causa raíz
1. Una animación CSS con `animation-fill-mode: both` (la vieja `.bl-sheet`) **gana en la cascada al estilo
   inline**: mientras la clase esté puesta, su `transform` final pisa al del gesto. Entrada por keyframes y
   arrastre por JS son incompatibles sobre el mismo elemento.
2. `touch-action` por defecto deja que el navegador reclame el pan vertical (para scrollear la página de
   atrás) y cancela el stream de Pointer Events. El valor efectivo se intersecta con los ancestros **solo
   hasta el scroller más cercano**, así que un scroller interno sigue scrolleando aunque el panel sea
   `none` — pero un scroller que NO desborda también reclama el gesto y no scrollea nada.
3. `useSheetMotion` mide el panel en un `useLayoutEffect` de montaje. Con el gate de hidratación
   (`useSyncExternalStore` → `null` en el primer render) el efecto corre con `panelRef.current === null` y no
   se repite.
4. El panel oculto no entrega `requestAnimationFrame` (mismo origen que
   `2026-09-02-browser-pane-oculto-suspense-no-revela.md`, aunque aquí `visibilityState` decía `visible`).
   El spring es de forma cerrada: al llegar el siguiente frame cae directo en su valor correcto, por eso
   "salta" en vez de romperse.

## Prevención
- **Todo el movimiento de una superficie arrastrable es JS** (`src/hooks/use-sheet-motion.ts` sobre
  `src/lib/spring.ts`): entrada, salida y gesto escriben el mismo `transform`. `.bl-sheet` se quedó sin
  usuarios; no la reintroduzcas en algo que se arrastra. En reposo el hook LIMPIA el `transform` (si queda,
  el panel es containing block de sus `fixed`).
- **Receta de `touch-action`**: panel `touch-none`; cada scroller interno pasa por
  `useScrollerTouchAction(ref)`, que lo pone en `pan-y` solo mientras desborda. Inputs/textarea quedan fuera
  del arrastre por arbitraje (`closest("input, textarea…")`), no por CSS.
- **Gate de hidratación FUERA del componente que usa el hook** (`Sheet` → `SheetBody`), o pasar
  `enabled: hydrated` cuando el componente tiene demasiados hooks para partirlo (`search-sheet.tsx`,
  `complete-sheet.tsx`).
- `onClose` ahora corre DESPUÉS de la salida. Un botón DENTRO de la hoja que llama al setter del padre
  (`setOpen(false)`) desmonta en seco y se salta la salida: usar `useSheetDismiss()`.
- `spring()` aterriza de inmediato si `document.visibilityState === "hidden"`, para que `onRest` (= desmontar)
  no espere a que la pestaña vuelva.
- Guardrail: `pnpm tsx scripts/check-spring.ts` cubre la física (sin overshoot con damping 1, handoff de
  velocidad, `onRest` una sola vez, proyección, rubber-band, velocidad de soltado). Lo del navegador
  (cascada, `touch-action`) no es automatizable sin un runner E2E con touch real: verificación manual en un
  teléfono cada vez que se toque el hook.
- El callejón sin salida: probar el arrastre con `PointerEvent` sintéticos y concluir que "no captura" —
  `setPointerCapture` LANZA con un `pointerId` sintético (por eso `capture()` lo envuelve en try/catch); y el
  `left_click_drag` del tool es instantáneo, o sea siempre un flick: para probar el regreso hay que despachar
  `pointermove` espaciados y soltar tras una pausa.
