# Estado — android

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: 2026-09-30 (fase 1 en curso: andamiaje, design system, data y AppStore listos; pantallas en vuelo)

## Qué cubre este dominio
La app nativa Android de Kura (`android/`, Kotlin + Jetpack Compose, minSdk 26), espejo de la app iOS
(`ios/`) contra la misma API `/api/v1`. Decisiones cerradas y tabla de traducción iOS→Android en
`android/BRIEF.md`; cómo compilar/correr en `android/README.md`. Este archivo dice qué existe y qué no.

## Mapa — dónde vive cada cosa

| Ruta | Qué hay |
|---|---|
| `android/BRIEF.md` | Decisiones cerradas (nativo, stack, sin Liquid Glass, abanico y no card con lomo, fases) + tabla iOS→Android |
| `android/README.md` | Compilar, instalar, base URL por build type, carriles paralelos (`-PkuraBuildDir`, `-PkuraAppIdSuffix`, `-PkuraApiHost`), `--es kuraScreen`, pendientes |
| `android/gradle/libs.versions.toml` | Catálogo con la **envolvente de compatibilidad** documentada arriba del archivo (desde 2026-09-30: Gradle 9.8.0 → AGP 9.4.1 con Kotlin integrado, sin plugin `kotlin-android` → compileSdk 37 / targetSdk 36; Kotlin 2.3.21 por `buildscript`; Compose BOM 2026.09.00 = ui 1.12.1; **material3 1.5.0-alpha27** fijado fuera del BOM — no alpha28/29, que arrastran Compose 1.13.0-alpha01; Ktor 3.6.0; Coil 3.5.0). Ver `learnings/2026-09-29-android-compilesdk-37-transitivo.md` y `learnings/2026-09-30-android-material3-alpha-arrastra-compose.md` antes de subir nada |
| `android/app/google-services.json` | Firebase `kura-a1f94` (proyecto propio, NO el de OAuth). Solo se usa cuando llegue FCM (fase 2) |
| `app/src/main/java/com/tromwey/kura/designsystem/` | Kura en Compose: `Tokens.kt` (KColor/KRadius/KSize/KShadow/Tint/KMotion/KHaptic), `Theme.kt` (`KuraTheme` = `MaterialExpressiveTheme` con `KuraColorScheme`/`KuraShapes`/`kuraTypography` + `MotionScheme.expressive()`; los componentes aún son el cromo Kura plano), `Typography.kt` (KuraType, Wordmark), `Glyph.kt` (glifos como ImageVector propios + `expandArcFlags`), `components/` (Press, Buttons, Pills, Cover, TintedSurface, SectionTitle, Chrome = TopBar/Dock/Toast/Sheet/OfflineStrip, Controls, Seal, Skeleton, LoadingScreen, Fan, Masonry, HeroMotion) |
| `…/data/` | `models/` (espejo 1:1 de `ios/Kura/Models`, kotlinx.serialization, `Releases` = "no puedo esperar" con reloj explícito), `api/` (`KuraApi` 90 funciones = `KuraAPI.swift`, `LiveApi` Ktor, `ApiClient` con bearer/reintentos GET/`sessionExpired`, `KuraApiError` sellado), `SecureStore` (AES-GCM + Keystore), `Session` (exp/sid del JWT), `LocalPrefs` (DataStore), `CoverPalette` (algoritmo de iOS/web portado, NO androidx.palette) |
| `…/state/` | `AppStore` + `AppStore<Tema>.kt` (Auth, Loading, Library, Reactions, Onboarding, Social, Profile, Safety, Releases, Palette, LocalPrefs), `AppStoreFactory` (lo único con Android), `AvatarEncoder`. Estado = `mutableStateOf` con valores inmutables; Deshacer real con `undoWindow` (5 s / 15 s con TalkBack) |
| `…/app/` | `KuraApp`, `MainActivity`, `KuraRoot` (router por `store.phase`), `MainTabs`, `Screens.kt` (despachadores `RouteScreen`/`SheetContent`) |
| `…/features/<x>/` | Pantallas por flujo (onboarding, collections, collectiondetail, add, title, feed, discover, people, profile, settings) |
| `app/src/debug/` | `DebugLaunch` (`--es kuraScreen …`, `--es kuraBearer …`), `DesignGallery` (`kuraScreen gallery|gallery-sheet|gallery-fan`) |
| `app/src/test/` | JVM: fixtures reales del servidor (46 JSON, sin PII) decodificando con `KuraJson`; `Tint`, `GlyphPath`, `Session`, `Releases`, `ApiClient` (MockEngine), y el store con `FakeKuraApi` (sesión, biblioteca, reacciones/social, "no puedo esperar", prefs). 84 tests |

## Convenciones vigentes
- **Mismos nombres que iOS** en modelos, `KuraApi`, `AppStore` y componentes, para portar cambios en ambos sentidos. `ID`/`URL` → `Id`/`Url`; URLs como `String?`.
- **Sin bordes, glows, pulsos ni rojo; miel una vez por pantalla.** El único contorno permitido es el del `Switch` apagado de Material (es del sistema). `error` de Material = `KColor.fieldError` (`#d9a08c`) solo en validación de campos.
- **El cromo es Material 3 Expressive, la identidad es Kura (founder, 2026-09-30).** Componentes Material (`ShortNavigationBar`, `FilledTonalButton`/`Button`, `ButtonGroup`+`ToggleButton`, `SplitButton`, `FloatingActionButtonMenu`, `ModalBottomSheet`, `Snackbar`, `Switch`, `TextField`, `SearchBar`, `LoadingIndicator`, `PullToRefreshBox`, `ListItem`, `LargeFlexibleTopAppBar`, `MotionScheme.expressive()`) tematizados con tokens Kura vía `MaterialExpressiveTheme`; contenido (portadas, abanico, sello, tinte, ribbon, pills de estado, glifos, wordmark) sigue propio. Tabla completa y antes/después: https://claude.ai/artifact/RpBxBwRBN5tPCVzT4nX2DH. **Siempre a través del envoltorio Kura del mismo nombre** (`GlassButton`, `KuraDock`, `KuraSheet`, …): las pantallas nunca importan Material.
- **Precedente de reversión**: el cromo Kura plano previo está en el tag `android-cromo-kura-v1` (`de7ea4a`). Revertir un componente = reemplazar el cuerpo de su archivo en `designsystem/components/` con el de ese tag, y anotarlo aquí. Componentes revertidos hasta hoy: ninguno.
- **Las colecciones son el abanico** (`Fan.kt`: `FanView`, `FanHeader`, `FanCollectionTile`, `FanPickRow`, `NewCollectionRow`). La card con lomo NO existe (founder, 2026-09-29).
- **Bearer**: solo en `SecureStore`; nunca en prefs planas ni en el repo (`grep -r "eyJ" android/` debe salir vacío). `device.platform = "android"` (el servidor lo acepta desde 2026-09-29, `schemas.ts` `DeviceSchema`).
- **Nunca `POST auth/logout` desde pruebas**: revoca TODAS las sesiones del founder. Cerrar una sesión de prueba = `DELETE me/sessions/{sid}`.
- **Carriles en paralelo**: build aislado con `-PkuraBuildDir` + `-PkuraAppIdSuffix` + `-Pkotlin.project.persistent.dir` + `--project-cache-dir` (README); un solo emulador `communeo-pixel` compartido; cada carril desinstala su variante y borra su scratch.
- **Verificación**: no hay CI. Cierre = `assembleDebug` + `assembleRelease` + `testDebugUnitTest` sin warnings de Kotlin, más capturas del emulador contra `flujos-v2`.

## Decisiones tomadas (y por qué)
- **Nativo Kotlin + Compose (2026-09-29)**, igual que iOS es SwiftUI nativo: la app vive del feel del design system. Sin Flutter/RN/KMP.
- **`applicationId = com.tromwey.kura`** (= bundle iOS). Debug apunta a `http://10.0.2.2:3010/api/v1`, release a `https://get-kura.app/api/v1` (host en un solo sitio: `kuraPublicHost` en `app/build.gradle.kts`).
- **`CoverPalette` porta el algoritmo de iOS/web** en vez de usar `androidx.palette`: la paleta es un caché compartido en `catalog_item.paletteHex` donde gana el primero que escribe; otro algoritmo daría colores distintos por plataforma.
- **Google sign-in con Credential Manager** (idToken con `aud` = client id web). Proyecto de Google Cloud "kura" (`418089003955`): clientes Android (debug, SHA-1 de esta Mac), web (`GOOGLE_WEB_CLIENT_ID`) e iOS (`GOOGLE_IOS_CLIENT_ID`) ya en Vercel y `.env.local` (2026-09-30). El backend todavía verifica solo `aud = GOOGLE_IOS_CLIENT_ID` → fase 2 lo extiende al web id.
- **Push por FCM en fase 2**: Firebase `kura-a1f94`, `FCM_SERVICE_ACCOUNT_JSON` (sensitive) en Vercel y `.env.local`. Hasta entonces, avisos de estreno locales.
- **Apple sign-in no existe en Android**; los botones de entrada salen de `GET auth/providers`.

## En progreso
- **Fase 1, ronda de pantallas (2026-09-30)**: marco (`app/`, flujo 01) → luego colecciones/colección/agregar, ficha, feed, descubrir, gente+perfil+ajustes en paralelo.

## Deuda conocida
- Sin FCM (el servidor solo habla APNs), sin App Links (`assetlinks.json` no existe en la web; necesita el SHA-256 de la firma de Play), sin firma de release ni Play Console (la cuenta ya existe; falta crear la app "kura" y aceptar Play App Signing).
- `+Parties`, `+MusicExport`, `+AccountLink` del store no están portados (fase 2); sesiones activas e inicio de sesión/fusionar dependen de `+AccountLink`.
- `migrateLegacyCuration` no se portó (ninguna build Android guardó curaduría local).
- No hay tests instrumentados: `SecureStore` (Keystore real), `CoverPalette` sobre `Bitmap` y DataStore se verifican a mano en el emulador.
- Hoja con animaciones de Material (no `sheetIn/sheetOut`); Wordmark C con la serif CJK del sistema.
