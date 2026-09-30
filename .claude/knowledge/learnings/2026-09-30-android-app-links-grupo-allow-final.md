---
id: 2026-09-30-android-app-links-grupo-allow-final
domain: frontend
guardrail: android/app/src/test/java/com/tromwey/kura/state/AppStoreLinksTest.kt (parser + rutas solo-web); la verificación del manifest sigue siendo manual (`adb shell am start -a android.intent.action.VIEW -d "https://get-kura.app/item/<id>"`)
status: resolved
---

# Android 15+: el intent-filter de App Links con exclusiones no reclama NINGUNA ruta

## Síntoma
`adb shell am start -a android.intent.action.VIEW -d "https://get-kura.app/item/<id>" com.tromwey.kura`
no abre la app (o abre el navegador) aunque el `<intent-filter android:autoVerify="true">` tenga el
host y los `pathPrefix` correctos. Y el respaldo "abrir en el navegador" muestra un selector con Play
Store, Calendario y Cámara en vez de Chrome.

## Causa raíz
1. Desde Android 15 (`targetSdk 35+`), un filtro que usa **grupos de exclusión** (`<uri-relative-filter-group android:allow="false">` para `/settings`, `/admin`, `/api`, …) rechaza cualquier URI que no coincida con NINGÚN grupo. Sin un grupo final `allow="true"` con `pathPattern=".*"`, no hay ruta permitida.
2. `Intent.ACTION_VIEW` con `https://…` sin `<queries>` para navegadores no puede resolver el paquete del navegador, así que el sistema ofrece cualquier handler.

## Prevención
- El filtro de `MainActivity` termina SIEMPRE con el grupo `allow="true"` + `pathPattern=".*"` (está en `AndroidManifest.xml`), y el manifest declara `<queries>` con `android.intent.category.APP_BROWSER`/`ACTION_VIEW https`.
- Las rutas solo-web viven en TRES sitios que deben ir juntos: el AASA de iOS (`src/app/.well-known/apple-app-site-association/route.ts`), `webOnlyRoots` en `android/.../app/DeepLinks.kt` y los grupos de exclusión del manifest. Al agregar una página web nueva, tocar los tres.
- Verificación real (`adb shell pm get-app-links com.tromwey.kura` → `verified`) solo pasa con el paquete real, `/.well-known/assetlinks.json` desplegado en `get-kura.app` y la huella de la firma en `ANDROID_CERT_SHA256`.
- Callejón sin salida: quitar las exclusiones "para que funcione" — entonces la app reclama `/settings`, `/admin` y la web deja de abrirse desde links.
