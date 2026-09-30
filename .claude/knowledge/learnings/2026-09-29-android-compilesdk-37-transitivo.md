---
id: 2026-09-29-android-compilesdk-37-transitivo
domain: infra
guardrail: none (lo atrapa el propio build — `checkDebugAarMetadata` falla — pero solo DESPUÉS de subir la versión; el guardrail real es la tabla de compatibilidad al inicio de `android/gradle/libs.versions.toml`)
status: resolved
---

# Android: una dependencia "más nueva" rompe el build pidiendo compileSdk 37 por vía transitiva

## Síntoma
`./gradlew :app:assembleDebug` falla en `checkDebugAarMetadata` con "Dependency 'okhttp-android:5.5.0'
requires libraries and applications that depend on it to compile against version 37 or later of the
Android APIs" (o el equivalente con `minAGP=9.1`). Aparece al subir Ktor a 3.6, Coil a 3.5+, core-ktx
a 1.19, Compose BOM ≥ 2026.08 — aunque la librería que subiste no diga nada de compileSdk.

## Causa raíz
El proyecto Android de Kura está en la envolvente Gradle 8.14.3 → AGP 8.13.x → compileSdk 36 (AGP 9
necesita Gradle 9). Varias releases de 2026 declaran en su `aar-metadata.properties`
`minCompileSdk=37` y `minAGP=9.1`, y llegan **transitivamente** (Ktor 3.6 → okhttp-android 5.5.0).
Además kotlinx-serialization 1.11 y Ktor 3.5 se compilan con Kotlin 2.3.2x y el runtime rechaza un
plugin de compilador más viejo, por eso Kotlin está en 2.3.21 y no en 2.2.

## Prevención
- Antes de subir cualquier versión en `android/gradle/libs.versions.toml`, leer
  `META-INF/com/android/build/gradle/aar-metadata.properties` del AAR (y de sus transitivas) en
  `~/.gradle/caches/modules-2/files-2.1/`, o subir toda la envolvente junta (Gradle 9 + AGP 9.1 +
  compileSdk 37) en un carril propio.
- La tabla de "por qué estas versiones" vive al inicio de `libs.versions.toml`; mantenerla al día es
  parte del cambio.
- Callejón sin salida: bajar solo la librería que "se quejó" (okhttp) con un `force`/`strictly` — el
  siguiente bump vuelve a romper y el runtime de Ktor puede quedar desalineado con su motor.
