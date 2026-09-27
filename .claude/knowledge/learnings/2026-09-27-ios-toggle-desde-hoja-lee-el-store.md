---
id: 2026-09-27-ios-toggle-desde-hoja-lee-el-store
domain: frontend
guardrail: none (no reproducido en simulador; el fix es estructural — ver Prevención)
status: resolved
---

# "Ver como lista" va un paso atrasado desde el segundo toque (iOS)

## Síntoma
Founder, iPhone: columnas → "lista" = lista; → "columnas" = se queda en lista; → "lista" = pasa a
columnas. A partir del segundo toque la vista refleja el valor ANTERIOR.

## Causa raíz
La fila de `CollectionOptionsSheet` calculaba el nuevo valor con el `c` que la hoja capturó en su
último render: `setLayout(c.id, c.layout == .list ? .covers : .list)`. Si ese `c` está viejo (una
hoja cuyo body no se re-evaluó: misma `.id(route.id)` en cada presentación de `.more(id)`, una vista
en transición de salida que se reusa), el toque escribe el valor que YA está en pantalla y todos los
siguientes quedan desfasados uno. En simulador (mock, con y sin LocalPrefs, 10a y 10b, cadencias de
0.8–3 s, pulsando el Button real vía accesibilidad) el modelo y el body siempre dieron el valor
correcto: la captura vieja es la única ruta que produce exactamente ese patrón, pero no quedó
demostrada en el simulador.

## Prevención
- Fix: `AppStore.toggleLayout(id)` voltea lo que la colección tiene EN EL STORE al tocar; la fila
  solo lo llama. Regla: una acción que "voltea" nunca calcula el valor nuevo desde una copia
  capturada por la vista — lo lee del store (una sola fuente de verdad).
- Para reproducir sin dedo: `-kuraLayoutDemo <id>` (+ `-kuraLayoutDemoStep s`) presenta Opciones y
  pulsa la fila real con `DebugTap.activate` (accesibilidad). En el simulador hay que encender la
  accesibilidad antes (`xcrun simctl spawn <udid> defaults write com.apple.Accessibility
  ApplicationAccessibilityEnabled -bool true`), si no el árbol no existe y no encuentra nada.
  `-kuraMockPrefs YES` enciende LocalPrefs en el mock (el camino live de sort/layout).
- Callejón sin salida: re-invocar la lógica del closure desde un hook DEBUG (lee el store fresco)
  "prueba" que todo funciona sin ejercitar la captura de la vista. Hay que pulsar el Button real.
