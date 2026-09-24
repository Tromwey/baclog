# Kura · iOS

> **Backend real:** la especificación de la API y el plan por fases para conectarla están en [`API.md`](API.md). Hoy la app corre con `MockAPI`.

App nativa (SwiftUI, iOS 17+, sin dependencias) que implementa el sistema de diseño **Kura** y los **Flujos v2** con datos mock. Fuentes de verdad: `BRIEF.md`, `design/kura/sistema-de-diseno.dc.html`, `design/kura/flujos-v2.dc.html`.

## Generar y correr

```sh
cd ios
/opt/homebrew/bin/xcodegen generate          # project.yml → Kura.xcodeproj
xcodebuild -project Kura.xcodeproj -scheme Kura \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -configuration Debug build
xcrun simctl install booted <DerivedData>/Build/Products/Debug-iphonesimulator/Kura.app
xcrun simctl launch booted io.communeo.kura
```

`Kura.xcodeproj` se regenera desde `project.yml`: no lo edites a mano. Si agregas un archivo, vuelve a correr `xcodegen generate`.

### Abrir directo en una pantalla (DEBUG)

`xcrun simctl launch booted io.communeo.kura -kuraScreen <nombre>`

| flujo | nombres |
|---|---|
| 01 primera vez | `splash` · `onboarding` · `signup` · `username` · `pick` · `people` · `login` |
| 02 tus colecciones | `collections` · `loading` · `empty` · `offline` · `newcollection` |
| 03–05 colección | `collection` · `shelf` · `list` · `auto` · `emptycollection` · `more` · `actions` · `add` · `toast` |
| 06 obra | `title` · `series` · `album` · `waiting` (37a) · `nostate` (24d) · `slider` / `complete` (26a) · `today` (C4) · `unavailable` (E4) · `announced` (37c) · `aviso` (31c) |
| 07 descubrir | `discover` (19a) · `recents` (19d) · `typing` (19e) · `results` (19f) · `saveto` (19h) · `noresults` (19g) · `creator` (O7) |
| 08 gente | `feed` · `feedreview` · `feedsuggest` · `feedempty` (E1) · `notifications` (31a) · `notificationsempty` (31b) · `person` (20a) · `personoptions` (O10a) · `unfollow` (O10b) · `followers` (20e) · `private` (20d) · `requested` (35d) · `stranger` (K1d) · `strangerprivate` (K1e) |
| 09 tu perfil | `profile` (20c) · `editprofile` (20f) · `profileempty` (E2) |
| 10 recap | `recap` (08) · `recapcard` (tarjeta / C2) · `recaphistory` (O8) · `recapempty` (09) |
| 11 ajustes | `settings` (30a) · `privacy` (K1c) · `musicapp` (30b) · `deleteaccount` (C3) |

Al arrancar en DEBUG se verifica que las 9 fuentes estén registradas (`[Kura] fonts OK: 9 faces registered`); si falta alguna se imprimen `UIFont.familyNames`.

## Estructura

```
ios/
  project.yml                 xcodegen (bundle io.communeo.kura, iOS 17, portrait, UIAppFonts, Dark)
  Kura/
    App/                      KuraApp, RootView (router splash → onboarding → tabs, SheetHost/ToastHost), DebugLaunch
    DesignSystem/
      Tokens.swift            colores, radios, medidas, sombras, Tint (mezcla de paleta, 168°/180°), movimiento
      Typography.swift        Font.kura.* (Newsreader / Hanken Grotesk / Red Hat Mono), monoLabel, Wordmark, FontCheck
      Glyph.swift             glifos → SF Symbols con su color; íconos del dock dibujados
      Components/             Buttons (Glass/Solid/Honey/IconChip44/Follow/Radio), Cover, Pills (StatusPill,
                              CountRibbon, Seal, SectionTitle, MonoSegmented, FlowLayout, Skeleton),
                              CollectionCard/WaitingCard, Chrome (Dock, Toast, SheetHost, SheetRow, GlassField…),
                              ZoomTransition (portada compartida)
    Models/                   Title, KCollection, Mark, Release, Person, Review, FeedEvent, rutas
    Mock/MockData.swift       todo el mock del brief (hoy = jue 24 sep 2026, 10:00 CDMX)
    Services/KuraAPI.swift    protocolo KuraAPI + MockAPI
    State/AppStore.swift      @Observable: navegación, hojas, avisos, colecciones, reacciones, seguidos, undo
    Features/                 Onboarding · Collections · CollectionDetail · Title · Feed (+ notificaciones) ·
                              Discover (+ búsqueda) · People (perfil ajeno, seguidores, creador) · Profile ·
                              Recap · Settings · Add
    Resources/                fuentes TTF, Assets.xcassets (AppIcon 1024 + LaunchBackground)
```

### Cómo está armado

- **Estado real en `AppStore`**: toda mutación se aplica optimista en memoria y luego llama a la API. Deshacer funciona de verdad (cada operación guarda su inversa) con aviso de 5 s; si la API falla sale "No se pudo guardar · Reintentar" con el triángulo.
- **El estado del título es por título, no por colección** (igual que `user_item` en la web): la reacción y la reseña son idénticas en todas las colecciones; si un título sale de su última colección, su estado se va con él.
- **No puedo esperar es derivada**: títulos anunciados que guardaste y no has completado. Orden: lo que ya salió → lo más próximo → "sin fecha". Etiquetas: `14 h`, `3 d`, `16 oct`, `oct 2026`, `2027`, `sin fecha`, `hoy`, `ya salió`. Antes del estreno la ficha muestra el reloj (indicador, no botón) y no hay Completar; "La vi en preestreno" en Opciones abre la hoja.
- **Hojas propias** (`SheetHost`), no `.sheet` del sistema, para calzar con los frames: inset 8, radio 36, s2, velo `rgba(5,5,6,.62)`, asa 36×5, 280 ms; se cierran arrastrando o tocando fuera. "Agregar" es la hoja alta (s1, a 54 del borde).
- **Navegación**: un `NavigationStack` por tab (cambio de tab instantáneo), chrome propio (Volver/Opciones a 64/24) y swipe-back conservado. En iOS 18+ la portada crece a la ficha/colección con la transición zoom (`matchedTransitionSource`); en iOS 17 es el push normal. En el onboarding las 3 portadas elegidas viajan de 32a a 32b con `matchedGeometryEffect`.
- **Completar** es el slider de tres paradas de 26a (Completo → Me gusta → Me obsesiona): relleno en el tono de la parada, imán con spring y háptica (ligera; media en Me obsesiona).
- **Colección**: se agrupa por formato solo si hay ≥ 2 formatos y cada uno tiene ≥ 3 títulos (`adapt()` del script de Flujos v2); si no, repisa.
- **Aviso de estreno (31c)**: al guardar un título anunciado se programa una notificación local el día del estreno (`Services/ReleaseNotifier.swift`); `-kuraScreen aviso` solo pinta una vista previa de la pantalla bloqueada.
- **Feed** = pila: cada card se fija bajo el header (`visualEffect`) y la siguiente la tapa; alturas L/M/S topadas a la pantalla; snap por card (`scrollTargetBehavior(.viewAligned)`).

## Dónde enchufar la API real

1. Escribe `struct LiveAPI: KuraAPI` en `Services/` (URLSession contra el backend de Next.js). El protocolo ya separa lecturas (`catalog`, `collections`, `userTitles`, `feed`, `search`…) de escrituras (`createCollection`, `updateCollection`, `setMark`, `saveReview`, `setFollowing`…).
2. En `KuraApp.init` cambia `AppStore(api: MockAPI())` por `AppStore(api: LiveAPI(...))`.
3. La autorización se queda en el servidor (como en la web): la app nunca manda un `userId`; las escrituras van por título (`catalogItemId`) o por colección.
4. `MockData` se queda para previews y para `-kuraScreen`.

## Pendiente

- Auth real (Apple / Google / link por correo): hoy los botones solo avanzan el flujo.
- Búsqueda contra el catálogo real (hoy filtra el mock) y "dónde ver" real (hoy abre la web del proveedor).
- Fotos de perfil (hoy todo es sello), bloquear/reportar (hoy un aviso), push real (hoy notificación local).
- Recap: datos fijos de agosto; la tarjeta se comparte como link, falta exportarla como imagen. Compartir → "Historia" igual.
- Modo ordenar usa el `List` del sistema para arrastrar (asa y levantado nativos, no los del frame).
- Tipografía fija (`fixedSize`) para calzar con los frames; falta decidir la escala con Dynamic Type.
- Persistencia local / sincronización real del modo sin conexión (hoy "Simular sin conexión" en Ajustes solo muestra la franja).
- Tests (unitarios del `AppStore`: undo, no puedo esperar, membresías) y snapshot tests por pantalla.
