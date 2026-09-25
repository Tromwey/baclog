---
id: 2026-09-25-ios-sesion-caducada-no-limpia-prefs-ni-push
domain: frontend
guardrail: none (no hay tests en ios/; la defensa es estructural: `SessionData` se reemplaza entera y todas las salidas pasan por `AppStore.endSession()`)
status: resolved
---

# iOS: tras un 401, la cuenta siguiente heredaba episodios vistos, silenciados y avisos de la anterior

## Síntoma
En un iPhone compartido: la cuenta A caduca (401 por token vencido o sesión revocada desde otro dispositivo), entra la cuenta B y ve los episodios marcados de A en series que ambas tienen, "Avísame" de A, la última colección usada de A, la búsqueda a medias de A. Si A vuelve a entrar después de su propio 401, en cambio, perdía sus silenciados/avisos y el siguiente `saveLocal()` los sobreescribía con vacío. Además los recordatorios locales de estreno no volvían: el dispositivo seguía creyendo que su token de push estaba registrado en el servidor.

## Causa raíz
Tres fugas juntas:
1. `resetData()` limpiaba ~60 campos **a mano** y se le escapaban varios (`lastUsedCollectionID`, `revealedSpoilers`, `searchQuery`/`searchError`, `onboardingGridError`, `feedFollowingKey`, banderas de carga). Cada campo nuevo del store era una fuga esperando pasar.
2. El `local` en memoria (el `LocalPrefs.Payload`) nunca se reiniciaba, y `sessionExpired` —a diferencia de `leaveSession`— no llamaba `prefs.clear()`: `applyLocalEpisodes()` aplicaba los episodios de A sobre los títulos de B, y nadie volvía a llamar `loadLocal()` al entrar.
3. `sessionExpired` no llamaba `PushRegistration.markUnregistered()`, así que `ReleaseNotifier` seguía creyendo que el servidor mandaba los push y no agendaba locales.

## Prevención
- El fix: todo el estado por cuenta vive en `SessionData` (misma `AppStore.swift`) y `resetData()` es `s = SessionData()` — exhaustivo por construcción. Las tres salidas (cerrar sesión, cuenta borrada, 401) pasan por `endSession()`: reset + `prefs.clear()` + sesión web + `markUnregistered()` + `ReleaseNotifier.cancelAll()`. `enterMain()` vuelve a `loadLocal()`. Cada `sync` queda atado a su `SessionData`: un fallo tardío o un Reintentar de A nunca corre con el token de B.
- Decisión: un 401 **sí** borra las prefs del disco, igual que cerrar sesión (privacidad en iPhone compartido). El costo aceptado: re-entrar a la MISMA cuenta tras caducar empieza de cero esas comodidades locales; la biblioteca del servidor no se toca.
- Sin guardrail ejecutable (no hay tests en `ios/`). Regla escrita en `state/frontend.md` › "iOS · el store": un campo nuevo por cuenta va en `SessionData`, nunca como propiedad guardada de `AppStore`.
- El callejón: "agregar el campo que faltaba a `resetData()`". Arregla el caso de hoy y deja la misma trampa para el próximo campo. Y no copiar `leaveSession` en `sessionExpired` a medias: por eso hay un solo `endSession()`.
- Pendiente conocido: las LECTURAS en vuelo de A (p. ej. `loadTitle`) que aterrizan después del reset todavía escriben en la sesión nueva (registro de títulos/personas). Es menor (catálogo compartido), pero `register(Person)` con `isFollowing` puede tocar `following`; atarlas a la sesión como las escrituras sería el siguiente paso.
