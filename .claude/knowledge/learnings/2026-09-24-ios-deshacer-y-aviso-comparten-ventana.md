---
id: 2026-09-24-ios-deshacer-y-aviso-comparten-ventana
domain: frontend
guardrail: none (no hay tests de UI en ios/; el acoplamiento vive en un solo símbolo, `AppStore.undoWindow`)
status: resolved
---

# iOS: alargar el aviso para VoiceOver rompe el Deshacer si el borrado diferido no se alarga igual

## Síntoma
Con VoiceOver, el aviso "Quitado de X · Deshacer" se alargó a 15 s para dar tiempo a llegar al botón. Si se toca Deshacer entre los segundos 5 y 15, el título vuelve a la colección en la app pero el `DELETE collections/{id}/titles/{titleId}` ya salió: al recargar, el título no está. No hay error ni aviso.

## Causa raíz
El Deshacer de quitar/mover NO hace round-trip: `deferRemove` retrasa el DELETE y el undo solo cancela esa tarea (`cancelRemove`). El retraso del DELETE y la vida del aviso eran dos `Task.sleep(for: .seconds(5))` independientes (`showToast` y `deferRemove`). Cambiar uno sin el otro deja un Deshacer visible que ya no puede cumplirse.

## Prevención
- El fix: una sola fuente, `AppStore.undoWindow` (5 s, o 15 s con `UIAccessibility.isVoiceOverRunning`), leída por `showToast` y por `deferRemove` en el mismo instante.
- Sin guardrail ejecutable (no hay tests de UI en `ios/`); anotado en `state/frontend.md`.
- El callejón: tocar solo la duración del aviso "porque es UI". Cualquier cambio a la vida del aviso es un cambio a la semántica de escritura diferida.

## Relacionado (misma sesión)
Un `DragGesture` cancelado (gesto del sistema, interrupción) no llama `onEnded`: el `@State` del arrastre de la hoja se quedaba a medio camino. `SheetHost` usa un `@GestureState dragging` —que sí se resetea al cancelar— para devolver la hoja a su sitio.
