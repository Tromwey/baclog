# Kura · iOS

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

| grupo | nombres |
|---|---|
| primera vez | `splash` · `onboarding` · `signup` · `username` · `pick` · `people` · `login` |
| tus colecciones | `collections` · `loading` · `empty` · `offline` · `newcollection` |
| colección | `collection` (agrupada) · `shelf` (cuadrícula) · `list` · `auto` · `emptycollection` · `more` · `actions` · `add` · `toast` |
| obra | `title` · `series` · `album` · `waiting` · `complete` |
| otros tabs | `feed` · `feedreview` · `feedsuggest` · `discover` · `profile` |

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
    Features/                 Onboarding · Collections · CollectionDetail · Title · Feed · Discover · Profile · Add
    Resources/                fuentes TTF, Assets.xcassets (AppIcon 1024 + LaunchBackground)
```

### Cómo está armado

- **Estado real en `AppStore`**: toda mutación se aplica optimista en memoria y luego llama a la API. Deshacer funciona de verdad (cada operación guarda su inversa) con aviso de 5 s; si la API falla sale "No se pudo guardar · Reintentar" con el triángulo.
- **El estado del título es por título, no por colección** (igual que `user_item` en la web): la reacción y la reseña son idénticas en todas las colecciones; si un título sale de su última colección, su estado se va con él.
- **No puedo esperar es derivada**: títulos anunciados que guardaste y no has completado. Orden: lo que ya salió → lo más próximo → "sin fecha". Etiquetas: `14 h`, `3 d`, `16 oct`, `oct 2026`, `2027`, `sin fecha`, `hoy`, `ya salió`. Antes del estreno la ficha muestra el reloj (indicador, no botón) y no hay Completar; "La vi en preestreno" en Opciones abre la hoja.
- **Hojas propias** (`SheetHost`), no `.sheet` del sistema, para calzar con los frames: inset 8, radio 36, s2, velo `rgba(5,5,6,.62)`, asa 36×5, 280 ms; se cierran arrastrando o tocando fuera. "Agregar" es la hoja alta (s1, a 54 del borde).
- **Navegación**: un `NavigationStack` por tab (cambio de tab instantáneo), chrome propio (Volver/Opciones a 64/24) y swipe-back conservado. En iOS 18+ la portada crece a la ficha/colección con la transición zoom (`matchedTransitionSource`); en iOS 17 es el push normal. En el onboarding las 3 portadas elegidas viajan de 32a a 32b con `matchedGeometryEffect`.
- **Feed** = pila: cada card se fija bajo el header (`visualEffect`) y la siguiente la tapa; alturas L/M/S topadas a la pantalla; snap por card (`scrollTargetBehavior(.viewAligned)`).

## Dónde enchufar la API real

1. Escribe `struct LiveAPI: KuraAPI` en `Services/` (URLSession contra el backend de Next.js). El protocolo ya separa lecturas (`catalog`, `collections`, `userTitles`, `feed`, `search`…) de escrituras (`createCollection`, `updateCollection`, `setMark`, `saveReview`, `setFollowing`…).
2. En `KuraApp.init` cambia `AppStore(api: MockAPI())` por `AppStore(api: LiveAPI(...))`.
3. La autorización se queda en el servidor (como en la web): la app nunca manda un `userId`; las escrituras van por título (`catalogItemId`) o por colección.
4. `MockData` se queda para previews y para `-kuraScreen`.

## Pendiente

- Auth real (Apple / Google / link por correo): hoy los botones solo avanzan el flujo.
- Búsqueda contra el catálogo real (hoy filtra el mock) y "dónde ver" real (hoy abre la web del proveedor).
- Perfil ajeno, notificaciones (la campana solo muestra un aviso), recap de agosto, Editar perfil, borrar cuenta.
- Compartir → "Historia" hoy comparte el link; falta generar la tarjeta exportable.
- Modo ordenar usa el `List` del sistema para arrastrar (asa y levantado nativos, no los del frame).
- Tipografía fija (`fixedSize`) para calzar con los frames; falta decidir la escala con Dynamic Type.
- Persistencia local / sincronización real del modo sin conexión (hoy "Simular sin conexión" en Ajustes solo muestra la franja).
- Tests (unitarios del `AppStore`: undo, no puedo esperar, membresías) y snapshot tests por pantalla.
