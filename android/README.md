# Kura · Android

App nativa Android de Kura: **Kotlin + Jetpack Compose**, espejo de [`ios/`](../ios/README.md) (SwiftUI) contra la misma API `/api/v1` (especificación en [`ios/API.md`](../ios/API.md), contrato de wire en `src/app/api/v1/_lib/schemas.ts`). Hoy: el marco de la app (splash → entrada → pestañas con dock, pilas por pestaña, hojas, avisos, franja sin conexión) y el flujo 01 completo contra la API real; las demás pantallas son placeholders con su firma final (`app/Screens.kt`). Lo de abajo es el contrato.

## Requisitos

- **JDK 17+ para correr Gradle** (AGP 9 lo exige; el de Homebrew: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`; también sirve el JBR de Android Studio). El código compila a JVM 17.
- **Android SDK** con `platforms;android-37.0` (compileSdk 37) y `build-tools;36.0.0` (el default de AGP 9.4). El emulador puede seguir en android-36: targetSdk es 36. Gradle lo encuentra por `ANDROID_HOME` o por `local.properties` (`sdk.dir=/Users/<tú>/Library/Android/sdk`, gitignoreado; créalo si no existe).
- No hace falta `gradle` instalado: se usa el wrapper versionado (`./gradlew`, Gradle 9.8.0, con checksum fijado).

## Generar y correr

```sh
cd android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
./gradlew :app:assembleDebug                  # → app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:assembleRelease                # → app/build/outputs/apk/release/app-release-unsigned.apk (R8 + shrink)

# emulador (AVD de esta Mac: communeo-pixel, Pixel 8, android-36)
~/Library/Android/sdk/emulator/emulator -avd communeo-pixel -no-snapshot-load -no-boot-anim &
adb wait-for-device && until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 2; done

adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.tromwey.kura/.MainActivity
adb exec-out screencap -p > captura.png
```

`adb` vive en `~/Library/Android/sdk/platform-tools/`. Android Studio abre `android/` tal cual (proyecto Gradle); no hay nada generado que versionar aparte.

## Backend real

- **Base URL = `BuildConfig.API_BASE`**, por build type (`app/build.gradle.kts`):
  - **debug** → `http://10.0.2.2:3010/api/v1`. `10.0.2.2` es el loopback del Mac visto desde el emulador; levanta la web con `pnpm dev --port 3010` (igual que iOS). `-PkuraApiHost=host:puerto` sustituye host y puerto, p. ej. para un teléfono físico en el mismo wifi: `./gradlew :app:assembleDebug -PkuraApiHost=192.168.1.20:3010`.
  - **release** → `https://get-kura.app/api/v1`.
- **El host público vive en UNA constante** dentro de `android/`: `kuraPublicHost` en `app/build.gradle.kts` (de ahí salen `API_BASE` de release y `BuildConfig.SITE_URL`, para los links compartidos). Fuera de `android/` el host vive en `src/lib/site.ts` (web) y `ios/project.yml` (iOS): si cambia el dominio, se cambia en los tres.
- **Cleartext solo en debug y solo para los hosts de desarrollo.** El manifest toma `networkSecurityConfig` de un placeholder por build type:
  - release → `res/xml/network_security_config.xml` (sin cleartext).
  - debug → `network_security_config_debug.xml`, **generado** por la tarea `:app:generateDebugNetworkSecurityConfig` con `10.0.2.2`, `localhost`, `127.0.0.1` y el host de `-PkuraApiHost`. No lo edites en `build/`: se cambia en `app/build.gradle.kts`.
- Sin respaldo en la nube ni transferencia entre dispositivos (`allowBackup=false` + `data_extraction_rules.xml`): la sesión nunca debe viajar a otro teléfono (misma postura que el Keychain de iOS).

## Abrir directo en una pantalla (DEBUG)

`src/debug/…/app/DebugLaunch.kt` (release: `src/release/…`, no hace nada). Siempre con `-S` (el store vive todo el proceso: uno caliente ignora los extras):

```sh
adb shell am start -S -n com.tromwey.kura<.lane>/com.tromwey.kura.MainActivity --es kuraScreen pick
adb shell am start -S -n com.tromwey.kura<.lane>/com.tromwey.kura.MainActivity --es kuraBearer "$JWT" --es kuraScreen feed
```

- `--es kuraBearer <jwt>` escribe ese bearer en el `SecureStore` (Keystore) ANTES de crear el store: la app arranca con sesión, sin OTP. Sin `kuraScreen`, el splash lo refresca si caduca en < 7 días y entra a las pestañas.
- `--ez kuraPrintBearer true` loguea (tag `KuraDebugLaunch`) el bearer de ESTA instalación con su `sid` y expiración, para pasarlo a otra con `kuraBearer`. Desinstalar borra la llave del Keystore: saca el token antes. Limpia logcat después (`adb logcat -c`).
- `--es kuraScreen <nombre>` pone el store REAL (API viva; en Android no hay mock todavía) en una pantalla:
  - entrada: `splash` (se queda, no enruta) · `onboarding` (bienvenida) · `signup` = `login` = `loginemail` ("entra a kura.", una sola puerta como iOS) · `code` (el código; `--es kuraEmail <correo>` es el que se muestra) · `username` · `pick` · `people` (picks = las tres portadas de la bienvenida) · `underage`
  - pestañas (necesitan sesión, p. ej. `kuraBearer`): `collections` · `discover` · `feed` · `profile` · `settings` (Perfil › Ajustes, sin dock) · `toast` (Colecciones + un aviso con Deshacer sobre el dock) · `sheet` (Colecciones + la hoja "Nueva colección")
  - design system: `gallery` · `gallery-sheet` · `gallery-fan` (cualquier otro nombre abre la galería diciendo que no lo conoce)

**Nunca** `POST auth/logout` ni `store.signOut(global = true)` para probar: revoca TODAS las sesiones de la cuenta (el iPhone del founder incluido). Para salir en local: `signOut(global = false)` / `leaveSession`, que solo olvidan el token de este teléfono.

## El marco (`app/`)

- `KuraApp` (Application) tiene el ÚNICO `AppStore` del proceso (`val store by lazy { AppStore.create(this) }`), lee Vibraciones (`KHaptic.init`) y es el `SingletonImageLoader.Factory` de Coil (el bearer va solo a `<API>/api/avatar/…`).
- `KuraRoot`: router por `store.phase` (splash → `OnboardingFlow` → `MainTabs`, fundido) dentro del marco `KuraScaffold` (= `Scaffold` de Material): `bottomBar` = `MainDock` (la `ShortNavigationBar`, pegada al borde, visible donde `store.dockVisible(tab)`; entra/sale encogiéndose para que la página no brinque), `notices` = el aviso (`KuraToastHost`, snackbar) o, sin aviso, la franja sin conexión, que Material coloca justo encima de la barra; el contenido recibe el alto de la barra como padding. Encima de todo, el host de hojas (`store.sheet` → `KuraSheet`, estilo por `SheetRoute.style`; con `sheetLocked` la hoja se niega a cerrar y vuelve a subir), los efectos del store (`events` → `KHaptic` / `announceForAccessibility`) y el ciclo de vida (`ON_RESUME` → `sceneBecameActive`, `ON_PAUSE` → `sceneWentInactive`).
- `MainTabs`: una pila por pestaña (la barra de 4 = `MainDock`: `store.select`, `Badge` del feed = `hasUnread`) (`store.paths[tab]`), cambio de pestaña 0 ms, solo la pestaña visible se compone (su estado `rememberSaveable` sobrevive). Atrás del sistema: `pop()`; en la raíz de otra pestaña → Colecciones; en la raíz de Colecciones sale de la app.
- `Screens.kt`: los despachadores `TabRootScreen` / `RouteScreen` / `KuraSheetScope.SheetContent` (`when` exhaustivos). Firma de cada pantalla: `XxxScreen(store, route)`; de cada hoja: `KuraSheetScope.XxxSheet(store, sheet)` (`close()` la baja animada).
- Portada compartida: cada pila es un `KuraHeroLayout` y cada entrada un `HeroDestination`; basta `Modifier.kHeroCover("cover-<titleId>")` en la card y en la ficha.
- `UiSupport.kt`: `Title.art` (→ `CoverArt`), `Person.photo`, `KuraApiError.loadCopy` (titular + nota de los errores de carga), `siteHost`.
- `DeepLinks.kt`: solo el mapa de links web → rutas (App Links son fase 2; nada lo llama aún).

## Design system (`designsystem/`)

Regla (founder, 2026-09-30): **lo que opera la app es Material 3 Expressive; lo que muestra contenido es Kura.** Cada componente Material vive DETRÁS del envoltorio Kura del mismo nombre: `app/` y `features/` nunca importan `androidx.compose.material3` (`grep -rn "androidx.compose.material3" app/src/main/java/com/tromwey/kura/app app/src/main/java/com/tromwey/kura/features` debe salir vacío).

| Envoltorio Kura (archivo) | Material por dentro |
|---|---|
| `GlassButton` · `SolidButton` / `HoneyButton` · `IconChip44` / `BackChip` · `KuraTextButton` · `FollowButton` · `SaveChip` · `RadioDot` · `RadioMark` (`Buttons.kt`) | `FilledTonalButton` (s2) · `Button` (`primary` = text / `tertiary` = miel) · `FilledTonalIconButton` · `TextButton` · `Button` tertiary / `FilledTonalButton` · `FilledTonalButton` / `FilledTonalIconButton` · `RadioButton` · `Checkbox`. Todos: píldora en reposo, esquina 14 (`shapes.small`) al presionar + ripple |
| `ReactionGroup` (+ `KuraReaction`) · `ActionPair` (+ `KuraToggle`) · `SplitActionButton` · `KuraFab` · `KuraFabMenu` (+ `KuraFabItem`) (`ButtonGroups.kt`) | `ButtonGroup` conectado de `ToggleButton` · ídem de 2 · `SplitButtonLayout` + `DropdownMenu` · `FloatingActionButton` · `FloatingActionButtonMenu` + `ToggleFloatingActionButton` |
| `MonoSegmented` · `ChipRow` · `KuraSwitch` · `KuraTextField` (`label`, `error` nuevos) · `GroupedList` / `SettingsRow` / `ListDivider` · `KuraSearchBar` (`Controls.kt`) | `ButtonGroup` conectado · `FilterChip` · `Switch` salvia · `TextField` filled sin línea · `SegmentedListItem` (el grupo recorta las esquinas; `ListDivider` no pinta dentro de un grupo) · `SearchBar` + `ExpandedFullScreenSearchBar` |
| `KuraScaffold` · `KuraTopBar` · `TabTitleBar` (+ `rememberKuraTitleScroll` / `Modifier.kuraTitleScroll`) · `KuraDock` (+ `KuraDockDefaults.height`) · `KuraToast` / `KuraToastHost` · `KuraSheet` / `Grabber` / `SheetRow` (`Chrome.kt`) | `Scaffold` · `TopAppBar` transparente · `LargeFlexibleTopAppBar` (36 → 22 al deslizar) · `ShortNavigationBar` + `Badge` · `Snackbar` / `SnackbarHost` (`Indefinite`; la ventana es `KMotion.undoWindowMs`) · `ModalBottomSheet` + `BottomSheetDefaults.DragHandle` · `ListItem` |
| `LoadingScreen` / `KuraLoadingIndicator` · `KuraPullToRefresh` · `KuraWavyProgress` (`LoadingScreen.kt`) | `LoadingIndicator` (experimental; el fallback a `CircularProgressIndicator` es UN `const` en ese archivo) · `PullToRefreshBox` + `PullToRefreshDefaults.LoadingIndicator` · `LinearWavyProgressIndicator` |

Se quedan Kura: `Cover`, `Fan`, `Seal`, `TintedSurface`, `Pills`, `Glyph`, `Typography`, `Masonry`, `SectionTitle`, `HeroMotion`, `Skeleton`, `TopVeil`, `OfflineStrip`. `Modifier.kPressable` es SOLO para contenido (portadas, cards, abanico, filas de contenido), sin ripple; ningún botón lo usa. El movimiento de componente es el de Material (`KMotion.fastSpatial/defaultSpatial/fastEffects/defaultEffects` leen `MaterialTheme.motionScheme`); los `spring` propios quedan para la portada compartida (y el deslizamiento de la pila que viaja con ella), el tinte y la presión de contenido.

**Revertir un componente**: cada archivo trae arriba un comentario de dos líneas con el Material que envuelve y el comando, p. ej. `git show android-cromo-kura-v1:android/app/src/main/java/com/tromwey/kura/designsystem/components/Buttons.kt > android/app/src/main/java/com/tromwey/kura/designsystem/components/Buttons.kt` (tag del cromo plano, `de7ea4a`). Revertir `Chrome.kt` exige devolver `kDockPosition`/`DockReach` a `app/`. Anotar en `.claude/knowledge/state/android.md` cualquier reversión.

La galería (`--es kuraScreen gallery`) muestra cada componente y estado; `gallery-sheet` abre la hoja y `gallery-fan` solo las colecciones.

## Carriles en paralelo

Varios agentes pueden compilar e instalar el **mismo checkout** a la vez, sin pisarse. Tres propiedades opcionales (se pasan con `-P`, nunca se fijan en `gradle.properties`):

| Propiedad | Efecto | Default |
|---|---|---|
| `-PkuraBuildDir=/ruta/abs` | `layout.buildDirectory` de cada proyecto bajo esa ruta (raíz → `<ruta>/root`, `:app` → `<ruta>/app`) | el `build/` de cada proyecto |
| `-PkuraAppIdSuffix=.lane` | solo debug: `applicationIdSuffix` `.lane` + `versionNameSuffix` `-lane` + nombre visible `kura lane`, para instalar varias variantes en el mismo emulador | sin sufijo |
| `-PkuraApiHost=host:puerto` | host de la API en debug (ver arriba) | `10.0.2.2:3010` |

Receta por carril (`<scratch>` = el directorio temporal del agente, `<lane>` = nombre corto del carril):

```sh
cd android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
./gradlew :app:assembleDebug \
  -PkuraBuildDir=<scratch>/build-<lane> \
  -PkuraAppIdSuffix=.<lane> \
  -Pkotlin.project.persistent.dir=<scratch>/kotlin-<lane> \
  --project-cache-dir <scratch>/gradle-<lane>
adb install -r <scratch>/build-<lane>/app/outputs/apk/debug/app-debug.apk
adb shell am start -n com.tromwey.kura.<lane>/com.tromwey.kura.MainActivity
```

- `--project-cache-dir` saca el `.gradle/` del proyecto y `kotlin.project.persistent.dir` saca el `.kotlin/` (sesiones del daemon de Kotlin) del checkout; la caché global `~/.gradle` sí se comparte (está hecha para eso).
- Ojo con `am start`: con sufijo, el paquete cambia (`com.tromwey.kura.<lane>`) pero la clase no (`com.tromwey.kura.MainActivity`), por eso va el nombre completo después de la `/`.
- Al terminar: `adb uninstall com.tromwey.kura.<lane>` y borrar `<scratch>/*-<lane>`. No apagues el emulador si otros carriles lo usan.
- La caché de build de Gradle (`org.gradle.caching=true`) hace que un carril que compila lo mismo que otro tarde segundos.

## Estructura

```
android/
  settings.gradle.kts        repos + :app (módulo único)
  build.gradle.kts           plugins (apply false) + -PkuraBuildDir
  gradle.properties          AndroidX, R no transitivo, caché de build; documenta las -P de carriles
  gradle/libs.versions.toml  catálogo: TODAS las dependencias (también las que aún no se usan) y por qué esas versiones
  gradle/wrapper/            wrapper 9.8.0 (jar versionado, checksum fijado)
  app/
    build.gradle.kts         namespace/applicationId com.tromwey.kura, min 26 · compile 37 / target 36, API_BASE por build
                             type, sufijo de carril, tarea del network security config de debug, R8 en release
    proguard-rules.pro       kotlinx.serialization + Ktor (OkHttp) + coroutines
    src/main/
      AndroidManifest.xml    portrait, Theme.Kura.Starting → Theme.Kura, INTERNET + ACCESS_NETWORK_STATE + POST_NOTIFICATIONS, sin backup
      assets/licenses/OFL-fonts.txt   licencia SIL OFL de las fuentes (viaja con la app, como exige la OFL)
      java/com/tromwey/kura/
        MainActivity.kt      splash (core-splashscreen) + enableEdgeToEdge + DebugLaunch (seed/configure) + setContent { KuraRoot }
        app/                 KuraApp (store + Coil), KuraRoot, MainTabs, Screens, Pending (placeholders), UiSupport, DeepLinks, LaunchOptions
        features/            onboarding/ (flujo 01, real) + un placeholder por paquete (collections, collectiondetail, add, title, feed, discover, people, profile, settings)
      res/
        font/                9 TTF + newsreader.xml / hanken_grotesk.xml / red_hat_mono.xml
        mipmap-*/            ícono adaptativo (foreground por densidad, fondo #0b0b0d)
        values/, values-v29/ Theme.Kura (sin ActionBar, sin Material visible), Theme.Kura.Starting, colores de ventana
        xml/                 network_security_config (release), data_extraction_rules
```

### Paquetes (convención; se crean cuando haya código que ponerles)

Espejo de `ios/Kura/`, todo bajo `com.tromwey.kura`:

| Paquete | Qué va | Espejo iOS |
|---|---|---|
| `app/` | raíz de navegación (splash → onboarding → tabs), host de hojas y toasts, arranque en pantalla (debug) | `App/` |
| `designsystem/` | tokens (colores, radios, medidas, tint 168°/180°), tipografía (`KuraType`), glifos, componentes (botones, chips 44, Cover 2:3/1:1, pills, CollectionCard, dock, hojas) | `DesignSystem/` |
| `data/` | modelos `@Serializable` (wire de `/api/v1`) + cliente Ktor (`KuraApi`, reintentos, bearer), sesión, prefs locales | `Models/` + `Services/` |
| `state/` | el store de la app (estado por cuenta, mutaciones optimistas con Deshacer), por dominio | `State/` |
| `features/` | una carpeta por flujo: onboarding, collections, collectiondetail, title, feed, discover, people, profile, recap, settings, add | `Features/` |

### Fuentes

Los TTF son copias de `ios/Kura/Resources/Fonts/` con nombre de recurso válido (minúsculas y `_`): `newsreader_regular`, `newsreader_italic`, `newsreader_medium`, `newsreader_medium_italic`, `hanken_grotesk_regular`, `hanken_grotesk_medium`, `hanken_grotesk_semibold`, `red_hat_mono_regular`, `red_hat_mono_medium`. **En Compose se usan los TTF sueltos**:

```kotlin
val Newsreader = FontFamily(
    Font(R.font.newsreader_regular, FontWeight.Normal),
    Font(R.font.newsreader_italic, FontWeight.Normal, FontStyle.Italic),
    Font(R.font.newsreader_medium, FontWeight.Medium),
    Font(R.font.newsreader_medium_italic, FontWeight.Medium, FontStyle.Italic),
)
```

Las familias XML (`R.font.newsreader`, `hanken_grotesk`, `red_hat_mono`) son para Views/TextAppearance (p. ej. un `RemoteViews` de widget o notificación); en Compose cada `Font(...)` apunta a un TTF y declara su peso y estilo, que es lo que el design system necesita para elegir la cara correcta. Si cambias una fuente en iOS, cópiala aquí también. `OFL.txt` no puede vivir en `res/font/` (el merger de recursos solo acepta fuentes y XML), por eso va en `assets/licenses/`.

### Ícono y splash

- Ícono adaptativo: `mipmap-anydpi-v26/ic_launcher.xml` (+ `_round`) = fondo `@color/ic_launcher_background` (`#0b0b0d`) + `ic_launcher_foreground.png` por densidad (mdpi 108 px … xxxhdpi 432 px), generado desde `ios/Kura/Resources/AppIcon-1024.png` con el ícono ocupando el viewport visible de 72 dp (el launcher recorta con su máscara, como iOS con su squircle). Si el ícono de iOS cambia, regenera los cinco PNG (script de PIL: escalar a 72/108 del lienzo y centrar sobre transparente).
- Nombre visible: `kura` (minúscula, voz de marca), vía `resValue` por build type.
- Splash del sistema (Android 12+ lo muestra siempre): solo color `#0b0b0d` con ícono transparente, igual que el `LaunchBackground` de iOS; el wordmark lo pinta `KuraRoot`, así no hay dos marcas seguidas.

## Versiones

Viven en `gradle/libs.versions.toml`, con la razón de cada tope en el encabezado. Resumen: **Gradle 9.8.0 · AGP 9.4.1 · Kotlin 2.3.21 · compileSdk 37 / targetSdk 36 · Compose BOM 2026.09.00 (ui 1.12.1) · material3 1.5.0-alpha27 (fijado fuera del BOM) · Ktor 3.6.0 · Coil 3.5.0**.

- **AGP 9 trae Kotlin integrado**: no hay plugin `org.jetbrains.kotlin.android` (aplicarlo falla); el KGP 2.3.21 entra por el `buildscript` del `build.gradle.kts` raíz. Los plugins de compilador `kotlin.plugin.compose` y `kotlin.plugin.serialization` siguen.
- **material3 1.5.0-alpha27, no alpha28/29**: desde alpha28 material3 declara Compose 1.13.0-alpha01 y arrastraría todo Compose a alpha; alpha27 tiene todos los componentes Expressive y declara 1.12.0-beta01, así que manda el 1.12.1 estable del BOM. Nunca fuerces Compose con `strictly`.
- **Material 3 Expressive**: tema en `designsystem/Theme.kt` (`KuraTheme` → `MaterialExpressiveTheme` con `KuraColorScheme`, `KuraShapes`, `kuraTypography` y `MotionScheme.expressive()`); los componentes viven detrás de su envoltorio Kura en `designsystem/components/` (ver "Design system" abajo).
- Antes de subir cualquier versión, lee `aar-metadata.properties` (minCompileSdk / minAGP) del AAR y de sus transitivas (`learnings/2026-09-29-android-compilesdk-37-transitivo.md`).

## Pendiente

- **Cliente API** (`data/`): modelos del wire, Ktor con bearer + reintentos, sesión guardada (DataStore cifrado con una llave del Android Keystore), `sid`, logout.
- **Pantallas** (`features/`) según `design/kura/flujos-v2.dc.html`: hoy solo el flujo 01; el resto son placeholders con su firma final.
- **Entrar con Google**: el botón ya está cableado (Credential Manager + `GetGoogleIdOption(serverClientId = auth/providers.google.clientId)` → `POST auth/google`) y sale solo si el servidor anuncia un client id; falta el backend (aceptar el `aud` de Android/Web). Apple no existe en Android.
- **Push**: FCM (el backend hoy solo habla APNs vía `pushToUsers` en `src/modules/push/apns.ts` — necesita un transporte FCM detrás del mismo punto de entrada).
- **App Links**: `/.well-known/assetlinks.json` en la web (hoy solo existe el AASA de iOS) + `intent-filter` `autoVerify` para `get-kura.app`.
- **Firma y Play**: keystore de subida (nunca versionado), Play App Signing, `versionCode` automático (como `archive.sh` con `git rev-list --count HEAD`), ficha en Play Console, aviso de privacidad.
- Ícono temático (capa `monochrome` de Android 13).
