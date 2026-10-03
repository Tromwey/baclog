# Kura Android — brief de implementación

App nativa Android (Kotlin + Jetpack Compose, minSdk 26) que implementa el sistema de diseño **Kura** y los
**Flujos v2**, espejo de la app iOS (`ios/`). Misma API (`/api/v1`), misma verdad, mismo vocabulario.

## Fuentes de verdad (léelas antes de escribir código)

- `ios/BRIEF.md` — **tokens, tipografía, glifos, medidas, movimiento, voz, todas las pantallas con su
  frame de referencia, datos de ejemplo y las reglas de "no puedo esperar"**. Este brief NO los repite: lo
  que allí dice "SwiftUI" aquí se traduce con la tabla de abajo.
- `design/kura/sistema-de-diseno.dc.html` (reglas) + `design/kura/flujos-v2.dc.html` (12 flujos, 89
  pantallas 390×844; leer la copia del repo, la importación de DesignSync la trunca).
- `ios/API.md` (contrato vigente) + `src/app/api/v1/_lib/schemas.ts` (la forma exacta de cada payload;
  si se contradicen, manda `schemas.ts`) + `scripts/api-smoke.ts` (qué responde el servidor vivo).
- `ios/README.md` — cómo se resolvió cada cosa en iOS (sesión, refresh, carga por recurso, push, links).
- `.claude/knowledge/state/frontend.md` — secciones "Voz de kura" y "Desviaciones intencionales del
  diseño": decisiones del founder que mandan sobre el frame.
- El código Swift es la referencia de comportamiento: `ios/Kura/State/AppStore*.swift` (estado y
  mutaciones con Deshacer), `ios/Kura/Services/LiveAPI.swift` (cliente), `ios/Kura/Models/*.swift`
  (modelos), `ios/Kura/DesignSystem/**` (tokens y componentes), `ios/Kura/Features/**` (pantallas).

## Decisiones cerradas (no re-litigar)

- **Nativo, Kotlin + Compose.** Sin Flutter/RN/KMP. `applicationId` = `com.tromwey.kura` (= bundle iOS).
- **Navegación como `NavigationStack`/`TabView` (founder, 2026-10-01)**: las páginas de un stack y las pestañas ya visitadas siguen vivas (compuestas, sin dibujarse) para que Volver encuentre todo como estaba; tope de 4 entradas vivas por stack; atrás predictivo = el deslizar-para-volver de iOS. Las lecturas de una pantalla van en `ActiveEffect` (el `.task` de iOS), no en `LaunchedEffect`. Detalle en `state/android.md` › Stack con pantallas vivas.
- **Stack**: navegación propia en el `AppStore` (`tab` + `paths` de `Route`; Navigation Compose, `androidx.palette`
  y `lifecycle-viewmodel-compose` se quitaron del build el 2026-10-01: sin un solo uso) · Ktor 3 (motor OkHttp) +
  kotlinx.serialization · Coil 3 para portadas · `CoverPalette` propio (algoritmo de iOS/web) · Credential
  Manager + `googleid` para Google · sin framework de DI (construcción manual, como iOS) · un solo
  `AppStore` (`StateFlow`/`mutableStateOf`, `ViewModel` de proceso) espejo de `ios/Kura/State/`, para
  que Deshacer funcione de verdad.
- **Material no se ve.** `material3` solo como base técnica (`ModalBottomSheet`, `Scaffold` sin colores).
  El tema raíz es propio (`designsystem/Tokens.kt`), oscuro siempre. Sin bordes, sin glows, sin pulsos,
  sin rojo. Miel una vez por pantalla.
- **Base URL**: debug `http://10.0.2.2:3000/api/v1` (la web local, `pnpm dev`), release
  `https://get-kura.app/api/v1`. Una sola constante (`BuildConfig.API_BASE`).
- **Sesión**: bearer en prefs cifradas con llave del Android Keystore (`SecureStore`), nunca en prefs
  planas. `Session` lee `exp` del JWT sin verificar firma y llama `POST auth/refresh` como iOS.
- **Entrada v1**: correo (OTP) + Google. **Apple no existe en Android**; los botones se pintan según
  `GET auth/providers` (nunca un botón que no funcione). Google queda cableado pero **apagado hasta la
  fase 2**: el servidor hoy verifica `aud = GOOGLE_IOS_CLIENT_ID` y Android emite tokens con `aud` = el
  Web client id — requiere backend + un cliente OAuth Android en Google Cloud (pendiente del founder).
- **Push**: el servidor solo habla APNs (`/me/devices/{apnsToken}`); FCM es fase 2 (backend incluido).
  Mientras tanto, los avisos de estreno son locales (`ReleaseNotifier` → `AlarmManager` + canal de
  notificación), igual que iOS sin push.
- **Links**: App Links (`/.well-known/assetlinks.json`) son fase 2 (necesitan el SHA-256 de la firma).
- **El cromo es Material 3 Expressive (founder, 2026-09-30).** Nada de vidrio ni de imitar iOS/web: la
  capa de *interacción* (navegación, botones, hojas, barras, carga, movimiento, ripple, formas) son los
  componentes de Material 3 Expressive tematizados con los tokens Kura vía `MaterialExpressiveTheme`;
  la *identidad* (paleta, Newsreader/Hanken/Mono, portadas, abanico, sello, superficie teñida, ribbon,
  pills mono de estado, glifos, wordmark, voz) sigue siendo Kura. Regla: lo que muestra contenido es
  Kura; lo que opera la app es Material. Propuesta aprobada con la tabla de sustitución completa:
  https://claude.ai/artifact/RpBxBwRBN5tPCVzT4nX2DH. Decisiones: versión completa (no la intermedia) ·
  dock = `ShortNavigationBar` pegada al borde · rol `error` = coral desaturado `#d9a08c` solo para
  validación de campos · sin color dinámico · `primary` = text (botón sólido), `tertiary` = miel (una
  acción por pantalla), `secondaryContainer` = s2 (tonal), `outline` transparente.
- **Precedente para echar atrás un componente (founder, 2026-09-30).** El cromo Kura plano anterior
  quedó en el tag `android-cromo-kura-v1` (commit `de7ea4a`): cualquier componente se recupera por
  archivo desde ahí. Y cada componente Material vive DETRÁS de su envoltorio Kura del mismo nombre
  (`GlassButton`, `KuraDock`, `KuraToastHost`, `KuraSheet`, `KuraSwitch`, `KuraTextField`,
  `MonoSegmented`, …): las pantallas nunca llaman a Material directamente, así que revertir uno es
  cambiar el cuerpo de un solo archivo en `designsystem/components/`. Registrar en `state/android.md`
  cualquier componente que se revierta y por qué.
- **Envolvente de compilación**: Gradle 9.8 · AGP 9.4.1 · compileSdk 37 (targetSdk 36) · Compose BOM
  2026.09.00 (ui 1.12.1) · material3 **1.5.0-alpha27 fijado explícito** (el BOM trae 1.4.0, que NO tiene
  los componentes Expressive; alpha28/29 declaran Compose 1.13.0-alpha01 y arrastrarían todo Compose a
  alpha — founder, 2026-09-30: "prefiero Compose estable"; alpha27 tiene todos los componentes y declara
  1.12.0-beta01). No subir de alpha sin un carril propio. AGP 9 = Kotlin integrado (sin plugin
  `kotlin-android`).
- **Vocabulario**: colección, tus colecciones, completar, guardar, tu gente, recap, crear cuenta. Nunca
  "backlog", "lista" ni "estante" en texto visible.
  Formatos (2026-10-03): **película, serie, álbum** y **título** para cualquier formato; nunca "cine",
  "música"/"disco" (como formato) ni "obra". Chips «Películas · Series · Álbumes». Regla y excepciones:
  `design/kura/copy-unificado.md` regla 6.
- **Las colecciones son el abanico, nunca la card con lomo (founder, 2026-09-29).** La card horizontal
  con el nombre en el lomo que describen `ios/BRIEF.md` y `flujos-v2` (pantalla 10) está DEPRECADA
  desde el 27 de septiembre: manda `.claude/knowledge/state/frontend.md` §"iOS · colecciones abanico" y
  §"iOS · transiciones de colecciones", con `design/kura/colecciones-propuesta.dc.html` +
  `colecciones-transiciones.dc.html` y el Swift actual (`Fan.swift`, `CollectionsView.swift`). No existe
  `CollectionCard`/`Spine` en Android.

## Traducción iOS → Android

| iOS | Android |
|---|---|
| `Font.kura.*` (Newsreader / Hanken / Red Hat Mono) | `KuraType` con `FontFamily(R.font.…)`; mismos tamaños en `sp`, mismo tracking (em) |
| SF Symbols (`Glyph`) | Vector drawables propios en `designsystem/Glyph.kt` (`ImageVector`), un glifo = un significado, mismo color por estado |
| `TintedSurface` 168°/180° | `Brush.linearGradient` con el mismo `mix()` y `k = 1 − 0.45·0.78` (copiar la fórmula de `Tokens.swift`, no reinventar) |
| `KuraSheet` (detents, fondo s1/s2, asa 36×5, radio 36) | `ModalBottomSheet` con `containerColor` s1/s2, `dragHandle` propio 36×5, `shape` 36 arriba, scrim `rgba(4,4,6,.32)`, sin borde |
| `matchedGeometryEffect` portada card → ficha (320 ms spring) | `SharedTransitionLayout` + `sharedElement` en la portada; misma curva (`spring` sin rebote) |
| `KMotion` (snappy/momentum/tint/fade/sheetIn/out) | `KMotion` en `Tokens.kt` con `spring(dampingRatio, stiffness)` / `tween(ms, easing)` equivalentes |
| Reducir movimiento → todo fundido | `Settings.Global.ANIMATOR_DURATION_SCALE == 0` o `Settings.Global.TRANSITION_ANIMATION_SCALE == 0` ⇒ `KMotion.reduce = true`; lo espacial pasa a `fade` |
| `KHaptic` (ligera / media, un solo punto de entrada) | `KHaptic` con `HapticFeedbackConstants` (`CLOCK_TICK` = ligera, `CONFIRM`/`CONTEXT_CLICK` = media); ajuste Vibraciones respeta el mismo flag |
| `kPressable` (entrada instantánea, salida `release`) | `Modifier.kPressable` con `interactionSource` + `animateFloatAsState` (scale .98 / alpha) |
| Dynamic Type hasta accesibilidad, cromo fijo en xxxLarge | Respetar `fontScale`; el cromo de geometría fija se topa con `kFixedChrome()` (`LocalDensity` con `fontScale` acotado) |
| `Keychain` | `SecureStore` (Keystore AES-GCM + `SharedPreferences` privadas) |
| `UserDefaults` / `LocalPrefs` | `DataStore<Preferences>` |
| `AsyncImage` + fallback de paleta | Coil `AsyncImage` + placeholder de paleta + glifo de esquina + pill de espera (`Cover`) |
| `Toast` sobre el dock, 5 s, Deshacer/Reintentar | `KuraToast` en el `KuraRoot`, mismo timing; con TalkBack 15 s (`AppStore.undoWindow`) |
| `Dock` (iOS 26 = TabView del sistema) | `KuraDock` propio (fallback plano de iOS 17–25); 4 tabs; cambio de tab 0 ms |
| VoiceOver: hojas modales, anuncios | `semantics { … }`, `liveRegion`, `announceForAccessibility` |
| `-kuraScreen <nombre>` / `-kuraMock` (DEBUG) | `adb shell am start … --es kuraScreen <nombre>` / `--ez kuraMock true`; el mock (`MockApi`) vive solo en `src/debug/` |
| Universal Links (`DeepLinks.swift`) | `intent-filter` con `autoVerify` (fase 2) + el mismo mapa de rutas |
| ATS local en Debug | `network_security_config.xml` (cleartext solo `10.0.2.2`/`localhost`, solo debug) |

## Estructura de paquetes (`android/app/src/main/java/com/tromwey/kura/`)

```
app/            KuraApp, MainActivity, KuraRoot (router raíz: splash → onboarding → tabs), Nav (rutas
                tipadas), DeepLinks, DebugLaunch (kuraScreen/kuraMock, solo debug)
designsystem/   Tokens.kt (colores, radios, sombras, medidas, KMotion, KHaptic) · Typography.kt ·
                Glyph.kt · components/ (Buttons, Chips/Pills, Cover, Fan (la colección), TintedSurface,
                SectionTitle, KuraSheet, Toast, Dock, Skeleton, Seal, CountRibbon, Fan, Masonry, Press,
                LoadingScreen)
data/           models/ (Account, Collection, Title, Person, Feed, Party, MusicExport, Navigation —
                espejo 1:1 de ios/Kura/Models) · api/ (KuraApi interface, LiveApi, ApiClient, Errors,
                KuraJson) · SecureStore · Session · LocalPrefs · CoverPalette
state/          AppStore.kt + AppStore+<tema>.kt (Auth, Loading, Library, Reactions, Onboarding, Social,
                Profile, Safety, Releases, Palette, LocalPrefs, Parties, MusicExport, AccountLink) —
                mismos nombres que iOS para que un cambio se porte fácil en ambos sentidos
features/       onboarding/ collections/ collectiondetail/ add/ title/ feed/ discover/ people/ profile/
                recap/ settings/ party/
```

`src/debug/java/com/tromwey/kura/mock/` = `MockData` + `MockApi` (solo debug; nada de producción los
referencia salvo bajo `BuildConfig.DEBUG`).

## Fases

**Fase 1 (esta ronda) — la app corre contra la API real con el bucle central:**
1. Andamiaje (`android/README.md`): Gradle, fuentes, ícono, splash, base URL, carriles paralelos.
2. Design system completo (tokens, tipografía, glifos, componentes).
3. `data/` + `state/`: modelos, cliente, sesión, `AppStore` (auth, carga por recurso, biblioteca,
   reacciones, onboarding, social, perfil, releases, palette, prefs).
4. Pantallas: flujo 01 (splash, onboarding, crear cuenta / entrar con correo OTP, usuario, elige 3, tu
   gente) · 02 tus colecciones (+ nueva, vacía, cargando, sin conexión) · 03–04 colección (grouped,
   shelved, lista, ordenar, opciones, renombrar, privacidad, portada, compartir, borrar, mantener
   presionado, mover) · 05 llenar (agregar: sugerencias, buscando) · 06 obra (película, serie, álbum,
   completar, reseñar) · feed · descubrir · perfil propio + persona + listas · ajustes (cuenta, privacidad,
   notificaciones locales, sesiones, bloqueados, borrar cuenta).

**Fase 2 — paridad:** Google sign-in (backend acepta `aud` Android/Web + `auth/providers` lo anuncia),
FCM (backend: `device_token` con proveedor), App Links + `assetlinks.json`, recap, fiestas + exportar a
TIDAL, inicio de sesión/fusionar cuentas, firma de release, Play Console (pendientes del founder).

## Definición de terminado (por carril y para la ronda)

- `./gradlew :app:assembleDebug` y `:app:assembleRelease` sin errores ni warnings nuevos de Kotlin
  (`-Werror` no; pero `allWarningsAsErrors` se activará en fase 2 — no dejes warnings).
- Instalada en el emulador `communeo-pixel` (Pixel 8, API 36) contra la web local, entrando con correo
  (el OTP sale en el log del dev server como `[dev-mailer] OTP para <email>: …`).
- Capturas (`adb exec-out screencap -p`) de cada pantalla del carril, revisadas contra los frames de
  `flujos-v2` y contra las capturas del simulador iOS cuando exista duda; las desviaciones se anotan.
- `android/README.md` al día (cómo correr, `--es kuraScreen`, qué queda pendiente) y
  `.claude/knowledge/state/frontend.md` § Android (lo consolida el orquestador con lo que reporte cada
  carril).
