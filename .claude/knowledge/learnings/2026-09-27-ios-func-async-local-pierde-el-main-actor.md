---
id: 2026-09-27-ios-func-async-local-pierde-el-main-actor
domain: frontend
guardrail: none (Swift 5 no lo marca; el trap solo sale en runtime)
status: resolved
---

# Demo DEBUG que mueve un UIScrollView muere con `_dispatch_assert_queue_fail` a mitad de camino

## Síntoma
La app se cierra (EXC_BREAKPOINT) en un `CA::Transaction::commit` desde `_pthread_wqthread` con `-[UIImageView _mainQ_beginLoadingIfApplicable]` arriba del stack, unos segundos después de que empieza el demo `-kuraFeedHitDemo`. Parece un bug de la vista (el feed), no del demo. El log se corta sin error visible si capturas con `simctl launch --console-pty`.

## Causa raíz
Dentro de `Task { @MainActor in … }`, una `func line(…) async` LOCAL no hereda el aislamiento de la Task en modo Swift 5: corre en el executor genérico. Lo que hace (`scroll.contentOffset.y = …`) toca UIKit fuera del hilo principal y la layout pass siguiente atrapa.

## Prevención
- Marcar las funciones locales async que tocan UIKit con `@MainActor` (`FeedHitDemo` en `Features/Feed/FeedView.swift`).
- Sin guardrail ejecutable: el compilador en Swift 5 no avisa. Si ves un crash de UIKit en un worker thread con un demo DEBUG corriendo, revisa primero las funciones locales async del demo.
- El callejón: buscar el bug en la vista o en SwiftUI; el stack no nombra ningún frame propio. Mira `~/Library/Logs/DiagnosticReports/Kura-*.ips`.
