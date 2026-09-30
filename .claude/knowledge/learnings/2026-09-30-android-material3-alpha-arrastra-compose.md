---
id: 2026-09-30-android-material3-alpha-arrastra-compose
domain: infra
guardrail: none (Gradle lo resuelve en silencio — el BOM es solo una recomendación y gana la versión más alta; el guardrail real es la tabla de envolvente al inicio de `android/gradle/libs.versions.toml` + mirar `:app:dependencies`)
status: resolved
---

# Android: fijar material3 1.5.0-alpha28+ sube TODO Compose a 1.13.0-alpha01 sin avisar

## Síntoma
Pones `material3 = "1.5.0-alpha29"` explícito (para tener los componentes Expressive) junto al Compose
BOM 2026.09.00 (ui 1.12.1) y el build pasa, pero `./gradlew :app:dependencies --configuration
debugRuntimeClasspath` muestra `androidx.compose.ui:ui:1.12.1 -> 1.13.0-alpha01` (y foundation,
runtime, animation-core igual). La app queda sobre un Compose alpha que nadie eligió.

## Causa raíz
El POM de material3 1.5.0-alpha28 y alpha29 declara `foundation`/`ui`/`runtime` **1.13.0-alpha01**;
alpha24–27 declaran 1.12.0-beta01. El BOM es una restricción "recomendada", no estricta: en conflicto
Gradle elige la versión más alta, así que un solo artefacto alpha arrastra todo Compose.

## Prevención
- Antes de fijar una versión de material3 fuera del BOM, leer sus dependencias declaradas:
  `curl -s https://dl.google.com/dl/android/maven2/androidx/compose/material3/material3-android/<v>/material3-android-<v>.pom | grep -A1 foundation-android`.
- Hoy: **material3 1.5.0-alpha27** (founder, 2026-09-30: "prefiero Compose estable"). Tiene todo lo
  Expressive que el cromo necesita (comprobado con `javap` en el AAR: ButtonGroupKt, ToggleButtonKt,
  SplitButtonKt, FloatingToolbarKt, LoadingIndicatorKt, FloatingActionButtonMenuKt, ShortNavigationBarKt,
  Large/MediumFlexibleTopAppBar en AppBarKt, ListItem expresivo, MaterialExpressiveTheme); alpha29 solo
  suma `ComponentStylesKt`.
- Callejón sin salida: fijar alpha29 y forzar Compose abajo con `strictly("1.12.1")`. material3 está
  compilado contra la API que declara; el build compila y revienta en runtime con `NoSuchMethodError`.
- Relacionado: `2026-09-29-android-compilesdk-37-transitivo.md` (el otro modo en que una dependencia
  "nueva" cambia la envolvente por vía transitiva).
