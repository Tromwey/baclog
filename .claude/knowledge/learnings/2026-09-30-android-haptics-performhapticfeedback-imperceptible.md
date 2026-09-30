---
id: 2026-09-30-android-haptics-performhapticfeedback-imperceptible
domain: frontend
guardrail: none (se siente solo en un teléfono real; el emulador no vibra — verificar con `adb shell dumpsys vibrator_manager` que cada evento produce un efecto con nombre y duración)
status: resolved
---

# Android: `performHapticFeedback` no se siente (o devuelve false) en un Pixel real

## Síntoma
El founder: "se perdió el háptico al navegar entre colecciones" en un Pixel 4 (Android 13) con la
respuesta táctil del sistema encendida. `dumpsys vibrator_manager` mostraba `TEXTURE_TICK` de 10–12 ms
(imperceptible) en el release y, con toques inyectados por `adb`, `View.performHapticFeedback` devolvía
`false` y no vibraba nada.

## Causa raíz
`HapticFeedbackConstants` se traduce a efectos muy débiles en algunos dispositivos (CLOCK_TICK →
TEXTURE_TICK en Pixel 4) y la vía de la vista depende de la ventana/foco y del ajuste del sistema.
Los efectos predefinidos del `Vibrator` (`VibrationEffect.createPredefined`, API 29+) son los que
Google calibra por dispositivo (TICK/CLICK/HEAVY_CLICK/DOUBLE_CLICK) y no pasan por ese filtro.

## Prevención
- `KHaptic.play` (`designsystem/Tokens.kt`) usa el `Vibrator` con efectos predefinidos desde API 29
  (Selection = TICK, Tap = CLICK, Firm = HEAVY_CLICK, Success = DOUBLE_CLICK, Warning/Error =
  HEAVY_CLICK; Hit/Pull por intensidad) y `performHapticFeedback` solo como respaldo < 29. Requiere
  `android.permission.VIBRATE`. Sigue honrando Ajustes › Vibraciones y el filtro de 40 ms.
- Verificación en dispositivo: deslizar el carrusel y leer `dumpsys vibrator_manager` (una entrada
  por cambio de colección, 17–19 ms TICK).
- Callejón sin salida: "en el emulador no vibra, así que el código está mal" — el emulador nunca
  vibra; solo un teléfono real o `dumpsys` dicen la verdad.
