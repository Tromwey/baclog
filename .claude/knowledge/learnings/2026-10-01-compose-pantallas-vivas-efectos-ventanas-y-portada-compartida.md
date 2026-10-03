---
id: 2026-10-01-compose-pantallas-vivas-efectos-ventanas-y-portada-compartida
domain: android
guardrail: android/app/src/test/java/com/tromwey/kura/app/StackWindowTest.kt (la ventana viva y la entrada activa); el resto es visual, sin tests de UI
status: resolved
---

# Compose: mantener viva la pantalla de abajo cambia qué significa "entró en composición"

## Síntoma
Al pasar el stack de `AnimatedContent` (la pantalla de abajo se desmonta) a entradas vivas (siguen compuestas, sin
colocarse), cuatro cosas que dependían de "componer = aparecer" dejan de funcionar sin dar error: las lecturas de una
pantalla no se repiten al volver; un `BackHandler` de una página tapada se queda con el Atrás; una búsqueda expandida
(`ExpandedFullScreenSearchBar`, que es otra VENTANA) sigue encima de la página nueva; y la portada compartida de la
página de arriba se queda dibujada en el overlay.

## Causa raíz
- `LaunchedEffect`/`DisposableEffect` siguen el ciclo de la composición, no la visibilidad.
- `BackHandler` se registra en el dispatcher mientras su `LifecycleOwner` esté STARTED; el último registrado gana.
- No colocar un nodo lo saca del dibujo, de los toques y de TalkBack, pero un `Dialog`/`Popup` no es un nodo: es una ventana.
- `sharedElement`: dos estados con la misma llave compuestos a la vez y uno visible = `foundMatch` permanente, y el
  visible se dibuja en el overlay (por encima del cromo de su página) aunque no haya transición.

## Prevención
- `designsystem/EntryActive.kt`: `LocalEntryActive`, `ActiveEffect` (el `.task` de iOS), `OnEntryCovered`, y un
  `LifecycleOwner` por entrada que baja a CREATED mientras está tapada (apaga sus `BackHandler` y los re-registra al
  volver, últimos = primeros en la fila).
- La portada: solo la entrada de arriba y las que se mueven reciben `LocalHeroVisibilityScope`; la tapada no registra
  su `sharedElement` hasta que empieza el pop (igual que cuando se componía de cero).
- Atrás predictivo: NO con `SeekableTransitionState` sobre springs (la fracción recorre el TIEMPO del spring: con 30 %
  de dedo la página ya hizo ~80 % del camino). El gesto es un desplazamiento encima de la transición (`draggedOffset`)
  que se queda congelado al soltar mientras el spring del pop termina el recorrido.
- Callejón sin salida: `movableContentOf` para "estacionar" la página que `AnimatedContent` suelta — no hay forma
  fiable de moverla en el mismo frame en que `AnimatedContent` la retira.
- Regla para pantallas nuevas en `state/android.md` › Stack con pantallas vivas.
