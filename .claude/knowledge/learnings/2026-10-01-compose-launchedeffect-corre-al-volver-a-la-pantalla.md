# Compose: un `LaunchedEffect(key)` también corre al VOLVER a la pantalla

**Fecha:** 2026-10-01 · **Dominio:** android · **Reportado por:** un usuario (feed)

## Síntoma
En el feed de Android: hacer scroll, abrir un título y volver → el feed aparece al principio, no donde estaba.

## Causa
`FeedStack` (`android/.../features/feed/FeedScreen.kt`) tenía

```kotlin
LaunchedEffect(firstId) { if (no está arriba) listState.scrollToItem(0) }
```

pensado para "un refresh trajo una primera card nueva → empezar desde arriba". Pero un `LaunchedEffect` corre
**cada vez que entra en composición**, no solo cuando cambia su llave. Al volver de la ficha, la entrada del
stack se recompone desde cero: `rememberLazyListState()` restaura bien el scroll (es saveable, vive en el
`SaveableStateProvider` de `MainTabs`), y acto seguido el efecto lo manda a 0.

## Fix
Recordar la última llave vista con `rememberSaveable` y actuar solo si CAMBIÓ:

```kotlin
var seenFirstId by rememberSaveable { mutableStateOf(firstId) }
LaunchedEffect(firstId) {
    if (seenFirstId == firstId) return@LaunchedEffect
    seenFirstId = firstId
    …scrollToItem(0)
}
```

## Regla
Un efecto que debe reaccionar a un CAMBIO de valor (no a "la pantalla apareció") necesita comparar contra el
valor anterior guardado en `rememberSaveable`. Sospechar de todo `LaunchedEffect(x) { scrollTo… / reset… }`
en una pantalla a la que se vuelve desde otra.

## Guardrail
Ninguno automático: no hay tests de UI (Compose) en `android/`. Paso de prueba manual añadido en
`state/android.md` (feed: scroll → abrir título → volver conserva la posición).
