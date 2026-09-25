---
id: 2026-09-24-rubberband-doble-y-deshacer-con-timer-propio
domain: frontend
guardrail: none (gesto y temporización del navegador; `scripts/check-spring.ts` cubre la física pero no se tocó — el fix vive en `src/lib/spring.ts` `unrubberband` y en `kura/toast.tsx`)
status: resolved
---

# Agarrar una hoja a medio rebote la hace saltar; y un "Deshacer" con timer propio miente si el aviso se pausa

## Síntoma
1. Soltar una hoja tirándola hacia ARRIBA: regresa con rebote (damping .8) y pasa un poco por encima de
   su reposo. Si la agarras justo en ese sobrepaso, el panel da un salto hacia su reposo bajo el dedo.
2. (Latente, apareció al pausar el reloj del toast.) En la ficha, "Quitar de tus colecciones" mostraba
   "Deshacer" 5 s, pero el borrado real corría en un `setTimeout(commit, 5000)` APARTE del toast. En cuanto
   el toast deja de durar exactamente 5 s (pausa con la pestaña oculta, hover, foco, un dedo encima), el
   botón "Deshacer" sigue en pantalla después de que el título ya se borró en el servidor — y pulsarlo no
   hace nada.

## Causa raíz
1. `dragY` guarda lo que se VE: por encima del reposo es `rubberband(raw)`. `onPointerDown` usaba
   `base: s.dragY` y el siguiente move hacía `rubberband(base + dy)`: la resistencia se aplicaba dos veces
   sobre el mismo tramo, así que el valor visible caía de golpe hacia 0.
2. Dos relojes para una sola promesa ("tienes 5 s para deshacer"). Mientras ambos valían 5 s coincidían por
   casualidad.

## Prevención
- La base de un agarre es el offset CRUDO: `unrubberband(visible, dimension)` (inversa exacta de
  `rubberband`, en `src/lib/spring.ts`), solo cuando el visible es negativo (el tramo con banda). Lo usan
  `use-sheet-motion.ts` y el swipe del toast.
- Un commit diferido se cuelga del `onExpire` del toast que lo anuncia, nunca de un timer paralelo.
  `onExpire` corre exactamente cuando el aviso se va sin su acción (tiempo, swipe, reemplazo, desmontaje),
  y guárdalo con identidad (`pendingRemoval.current === entry`) porque también puede llegar el flush
  temprano o el desmontaje del provider.
- Guardrail ejecutable: ninguno para el navegador (arrastre real, pestaña oculta). La inversa se puede
  comprobar a mano: `unrubberband(rubberband(x, d), d) ≈ x` para x < 0.
- Callejón sin salida: "arreglar" el salto quitando el rubber-band al re-agarrar, o bajando el damping del
  regreso para que no sobrepase. Las dos cosas cambian el feel; el bug era la base, no la banda.
