# Kura · iOS

> **Backend real:** la especificación de la API está en [`API.md`](API.md) y el contrato de wire en `src/app/api/v1/_lib/schemas.ts`. La app habla con `/api/v1` por `LiveAPI` (por defecto) y conserva `MockAPI` para capturas y demo — ver [Backend real](#backend-real).

App nativa (SwiftUI, iOS 17+, sin dependencias) que implementa el sistema de diseño **Kura** y los **Flujos v2**. Fuentes de verdad: `BRIEF.md`, `design/kura/sistema-de-diseno.dc.html`, `design/kura/flujos-v2.dc.html`.

## Generar y correr

```sh
cd ios
/opt/homebrew/bin/xcodegen generate          # project.yml → Kura.xcodeproj
xcodebuild -project Kura.xcodeproj -scheme Kura \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -configuration Debug build
xcrun simctl install booted <DerivedData>/Build/Products/Debug-iphonesimulator/Kura.app
xcrun simctl launch booted com.tromwey.kura
```

`Kura.xcodeproj` se regenera desde `project.yml`: no lo edites a mano. Para probar en el simulador una build que conserve la sesión entre lanzamientos, firma ad-hoc (`CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO`): con `CODE_SIGNING_ALLOWED=NO` el Keychain no persiste y cada relanzamiento cae en la bienvenida. Si agregas un archivo, vuelve a correr `xcodegen generate`.

## Backend real

- **Base URL** = `KuraAPIBase` en `Info.plist`, armada desde `KURA_API_SCHEME` + `KURA_API_HOST` por configuración en `project.yml` (partida en dos para que `//` nunca entre a un build setting):
  - **Debug** → `http://localhost:3010/api/v1`. El simulador llega al Mac por `localhost`; levanta la web con `pnpm dev --port 3010` (o cambia `KURA_API_HOST` en `project.yml` y regenera). Debug usa `Kura/Info-Debug.plist` (gemelo de `Info.plist` + `NSAppTransportSecurity › NSAllowsLocalNetworking`): si cambias `info.properties` en `project.yml`, replica el cambio ahí.
  - **Release** → `https://baclog.app/api/v1`, sin ATS local.
- **Sesión**: `POST auth/otp/request` → `POST auth/otp/verify` → JWT en el **Keychain** (`Services/Keychain.swift`, service `com.tromwey.kura`, account `bearer`; nunca `UserDefaults`). `Services/Session.swift` lee `exp` del payload (sin verificar firma) y la app llama `POST auth/refresh` al abrir si faltan < 7 días. Un **401 en cualquier llamada** borra el token, manda `.kuraSessionExpired` y el store vuelve a la entrada.
- **Cliente** (`Services/LiveAPI.swift`): `APIClient` (URLSession, bearer, `KuraJSON.decoder` que acepta ISO 8601 con y sin fracción, mapeo `error.code`/`reason` → `KuraAPIError`) + `LiveAPI: KuraAPI` endpoint por endpoint. Reintento con backoff (0.5 / 1 / 2 s) **solo en GET**; las escrituras no reintentan: el toast "Reintentar" es el reintento.
- **Carga por recurso**: al arrancar `GET /me` + `/collections` + `/me/titles` + `/me/following`, luego `GET /titles?ids=` para lo que falte; ficha, colección, feed, descubrir, persona, listas y recap cargan al entrar (`store.load*`). Lo `unsupported` (fijar, orden manual, portada elegida, orden/vista, episodios) vive en `Services/LocalPrefs.swift` (UserDefaults, apagado en mock).
- **Mock**: `-kuraScreen <nombre>` o `-kuraMock` (DEBUG) arrancan con `MockAPI` sin servidor; `KuraRuntime.usesMock` lo expone a los modelos (p. ej. `Privacy.options`).

### Abrir directo en una pantalla (DEBUG)

`xcrun simctl launch booted com.tromwey.kura -kuraScreen <nombre>`

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
  project.yml                 xcodegen (bundle com.tromwey.kura, iOS 17, portrait, UIAppFonts, Dark)
  Config/                     Kura.xcconfig (base del target: DEVELOPMENT_TEAM = $(KURA_TEAM_ID)),
                              Team.xcconfig.example (copia → Team.xcconfig, gitignoreado)
  ExportOptions.plist         plantilla de export app-store-connect (el script pone el teamID)
  scripts/archive.sh          archive + .ipa para TestFlight (ver TestFlight)
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
    Services/                 KuraAPI (protocolo + MockAPI), LiveAPI (APIClient + endpoints), Keychain, Session (JWT exp),
                              LocalPrefs (lo unsupported, en el dispositivo), ReleaseNotifier
    State/AppStore.swift      @Observable: sesión, hidratación por recurso, navegación, hojas, avisos, colecciones,
                              membresías (Deshacer diferido 5 s), reacciones, seguidos
    Features/                 Onboarding · Collections · CollectionDetail · Title · Feed (+ notificaciones) ·
                              Discover (+ búsqueda) · People (perfil ajeno, seguidores, creador) · Profile ·
                              Recap · Settings · Add
    Resources/                fuentes TTF, AppIcon.icon (Liquid Glass por capas), Assets.xcassets (AppIcon 1024 heredado + LaunchBackground)
```

### Cómo está armado

- **Estado real en `AppStore`**: toda mutación se aplica optimista en memoria y luego llama a la API. Deshacer funciona de verdad (cada operación guarda su inversa) con aviso de 5 s; si la API falla sale "No se pudo guardar · Reintentar" con el triángulo.
- **El estado del título es por título, no por colección** (igual que `user_item` en la web): la reacción y la reseña son idénticas en todas las colecciones; si un título sale de su última colección, su estado se va con él.
- **No puedo esperar es derivada**: títulos guardados y sin completar cuyo estreno no ha llegado, o que guardaste antes del estreno (`savedAt < inicio del estreno`; lo que ya había salido cuando lo guardaste nunca entra). Orden: lo que ya salió → lo más próximo → "sin fecha". Etiquetas: `14 h`, `3 d`, `16 oct`, `oct 2026`, `2027`, `sin fecha`, `hoy`, `ya salió`. Antes del estreno la ficha muestra "Sale el …". En **álbum** no hay Completar (37c); en **cine/series** sí (37a, preestreno o festival), y tanto Completar como "La vi en preestreno" mandan `preview: true`, también el día del estreno.
- **Hojas propias** (`SheetHost`), no `.sheet` del sistema, para calzar con los frames: inset 8, radio 36, s2, velo `rgba(5,5,6,.62)`, asa 36×5, 280 ms; se cierran arrastrando o tocando fuera. "Agregar" es la hoja alta (s1, a 54 del borde).
- **Navegación**: un `NavigationStack` por tab (cambio de tab instantáneo), chrome propio (Volver/Opciones a 64/24) y swipe-back conservado. En iOS 18+ la portada crece a la ficha/colección con la transición zoom (`matchedTransitionSource`); en iOS 17 es el push normal. En el onboarding las 3 portadas elegidas viajan de 32a a 32b con `matchedGeometryEffect`.
- **Completar** es el slider de tres paradas de 26a (Completo → Me gusta → Me obsesiona): relleno en el tono de la parada, imán con spring y háptica (ligera; media en Me obsesiona).
- **Colección**: se agrupa por formato solo si hay ≥ 2 formatos y cada uno tiene ≥ 3 títulos (`adapt()` del script de Flujos v2); si no, repisa.
- **Aviso de estreno (31c)**: al guardar un título anunciado se programa una notificación local el día del estreno (`Services/ReleaseNotifier.swift`); `-kuraScreen aviso` solo pinta una vista previa de la pantalla bloqueada.
- **Feed** = pila: cada card se fija bajo el header (`visualEffect`) y la siguiente la tapa; alturas L/M/S topadas a la pantalla; snap por card (`scrollTargetBehavior(.viewAligned)`).

## Dónde enchufar la API real

1. `Services/LiveAPI.swift` ya es la implementación real de `KuraAPI`; `KuraApp.init` elige `LiveAPI` salvo `-kuraScreen`/`-kuraMock`.
2. Un endpoint nuevo = un método en el protocolo `KuraAPI` + su versión en `LiveAPI` (ruta) y `MockAPI` (dato de `MockData`) + un `load*`/`sync` en `AppStore`.
3. La autorización se queda en el servidor (como en la web): la app nunca manda un `userId`; las escrituras van por título (`catalogItemId`) o por colección.
4. `MockData` se queda para previews y para `-kuraScreen`.

## TestFlight

### `scripts/archive.sh`

```sh
export KURA_TEAM_ID=ABCDE12345        # tu Team ID (Membership details)
ios/scripts/archive.sh                # → ios/build/export/Kura.ipa
ios/scripts/archive.sh --upload       # además lo sube (necesita la llave ASC, abajo)
```

En orden: revisa las herramientas (xcodegen, xcodebuild, git, plutil, security) → exige `KURA_TEAM_ID` → revisa que el llavero tenga una identidad de firma y un certificado **Apple Distribution** → corre `xcodegen generate` → `xcodebuild archive` (Release, `generic/platform=iOS`, `-allowProvisioningUpdates`, DerivedData propio en `build/DerivedData`) → `xcodebuild -exportArchive` con una copia de `ExportOptions.plist` (`method app-store-connect`, `signingStyle automatic`, `uploadSymbols`) con el `teamID` ya puesto → imprime la ruta del `.ipa`, la versión, el build y la base de la API que quedó en el binario. Entre el archive y el export **revisa el binario**: si `KuraAPIBase` del `.app` archivado no es exactamente `https://baclog.app/api/v1` (p. ej. `localhost`), o si el build no es el que se pidió, aborta sin exportar ni subir nada. No dice "Listo." hasta ver `** EXPORT SUCCEEDED **` en el log y además el `.ipa` en `build/export`, o, con `--upload`, la confirmación de subida en el log. Si no aparece, imprime el final del log y falla. Todo sale en `ios/build/` (gitignoreado), con `archive.log` / `export.log`. Si xcodebuild falla, el script no te avienta el log: resume la causa probable (sin cuenta en Xcode para ese team, no hay App ID, no hay iPhone registrado, falta el certificado, acuerdo pendiente, build repetido…), muestra las líneas `error:` y te dice dónde está el log completo.

| variable | |
|---|---|
| `KURA_TEAM_ID` | **Obligatoria.** Si no está en el entorno, la lee de `Config/Team.xcconfig`. |
| `KURA_BUILD_NUMBER` | `CFBundleVersion`. Por defecto `git rev-list --count HEAD`, que siempre crece en `main`. Si subes dos veces sin commit, pon uno mayor. |
| `KURA_ASC_KEY_ID` · `KURA_ASC_ISSUER_ID` · `KURA_ASC_KEY_PATH` | Llave de la App Store Connect API (`AuthKey_….p8`). Obligatoria con `--upload`; si está, xcodebuild también la usa para firmar y aprovisionar, así que no hace falta la cuenta en Xcode. |
| `KURA_CLOUD_SIGNING=1` | No exigir el certificado Apple Distribution en el llavero: el export usa el certificado que Apple administra en la nube (necesitas ser Account Holder o Admin). ⚠️ **No sirve para este team**: el nombre lleva Ñ y la firma en la nube produce un `.ipa` que App Store Connect rechaza con *Invalid Signature* (el script ahora lo detecta antes de subir). Usa el certificado local. |

**Versión:** `MARKETING_VERSION` (`1.0.0`, en `project.yml`) se sube a mano en cada versión de la App Store. `CURRENT_PROJECT_VERSION` vale `"1"` en `project.yml` solo como respaldo; el script lo pisa en la línea de xcodebuild.

**Firma (`DEVELOPMENT_TEAM`):** el Team ID nunca se versiona. `Config/Kura.xcconfig` (versionado, es la configuración base del target) tiene `#include? "Team.xcconfig"` y `DEVELOPMENT_TEAM = $(KURA_TEAM_ID)`. Sin `Config/Team.xcconfig`, el team queda vacío y el build de simulador se hace sin firma, igual que siempre. El script no depende de ese archivo: pasa `DEVELOPMENT_TEAM=$KURA_TEAM_ID` directo a xcodebuild, y eso le gana a cualquier xcconfig. Para correr en un iPhone físico desde Xcode, copia `Config/Team.xcconfig.example` → `Config/Team.xcconfig`, pon tu ID y regenera. Firma automática, **sin entitlements**: nada de Sign in with Apple, push ni Keychain compartido. No fijes `CODE_SIGN_IDENTITY`/perfiles en `project.yml`, porque con Automatic chocan.

### Lo que solo puede hacer el founder (Apple ID), en orden

1. **Apple Developer Program activo** (developer.apple.com › Account; la renovación es anual).
2. **Aceptar los acuerdos pendientes**: el banner de developer.apple.com y App Store Connect › Business. El de Paid Apps no hace falta porque la app es gratis.
3. **Anotar el Team ID**: developer.apple.com › Account › Membership details.
4. **Registrar el Bundle ID** en developer.apple.com › Certificates, IDs & Profiles › Identifiers › + › App IDs › App: Bundle ID **explícito** `com.tromwey.kura`, descripción "Kura", **sin capacidades** (no marques Sign in with Apple, Push ni nada más).
5. **Crear la app** en App Store Connect › Apps › + › New App: plataforma iOS, nombre de la ficha ("Kura" estaba tomado; el nombre bajo el ícono sigue siendo Kura, `CFBundleDisplayName`), idioma principal **Spanish (Mexico)**, Bundle ID `com.tromwey.kura`, SKU p. ej. `kura-ios`, acceso completo. Categoría principal: Entertainment (secundaria: Lifestyle o Music).
6. **Tu Apple ID en Xcode** (Xcode › Settings › Apple Accounts › +) y crea **Apple Distribution**: en Xcode 27 el botón está **dentro del team** (clic en la fila del team › Manage Certificates… › + › Apple Distribution › Done). Es obligatorio aunque exista el certificado en la nube: con la Ñ del team, la firma en la nube genera un `.ipa` inválido (ver `KURA_CLOUD_SIGNING`). La primera vez que `codesign` use la llave nueva, macOS abre un diálogo del llavero: **Always Allow** (con tu contraseña de la Mac); si no lo respondes, el export se queda esperando en silencio. Si el team no tiene ningún iPhone registrado, conecta el tuyo y ábrelo una vez en Xcode: la firma automática necesita un dispositivo para el perfil de desarrollo del archive.
7. **Generar el build**: `export KURA_TEAM_ID=…` y `ios/scripts/archive.sh`.
8. **Subir el `.ipa`**, con una de estas cuatro. La primera es la que se usó el 2026-09-24 (build 203) y no necesita contraseña ni llave, porque `xcodebuild` sube con la cuenta que Xcode tiene abierta:
   - **`xcodebuild -exportArchive` con `destination = upload`**: copia `build/ExportOptions.plist` (la que el script ya rellenó con el team) a `build/UploadOptions.plist`, cambia `destination` a `upload` (`plutil -replace destination -string upload build/UploadOptions.plist`) y corre `xcodebuild -exportArchive -archivePath build/Kura.xcarchive -exportOptionsPlist build/UploadOptions.plist -exportPath build/upload -allowProvisioningUpdates`. Vuelve a firmar el archive (mismo certificado local) y sube; el log termina en `Upload succeeded.` Necesita que la app exista en App Store Connect (paso 5), si no: `App record with bundle identifier "com.tromwey.kura" not found`.
   - **Transporter** (app gratis de la Mac App Store): arrastra `ios/build/export/Kura.ipa` › Deliver.
   - `xcrun altool` **sin la contraseña a la vista** (en la línea de comandos queda en el historial y en `ps`):
     - con la llave ASC: pon el `.p8` en `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` y corre `xcrun altool --upload-app -f ios/build/export/Kura.ipa -t ios --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>`;
     - con contraseña de app (se crea en account.apple.com › Sign-In and Security): guárdala una vez en el llavero con `security add-generic-password -a <apple-id> -s AC_PASSWORD -l AC_PASSWORD -w` (sin valor después de `-w`, así te la pide sin mostrarla) y sube con `xcrun altool --upload-app -f ios/build/export/Kura.ipa -t ios -u <apple-id> -p @keychain:AC_PASSWORD`.
   - `ios/scripts/archive.sh --upload` con la llave de App Store Connect › Users and Access › Integrations › App Store Connect API › + (rol App Manager; el `.p8` solo se descarga una vez; guárdalo fuera del repo).
9. **TestFlight › el build** (tarda de 5 a 30 min en procesarse): el cumplimiento de exportación ya viene resuelto porque `ITSAppUsesNonExemptEncryption = false` (solo HTTPS). En "Test Information" pon el correo de feedback y la descripción beta.
10. **Grupo interno** (TestFlight › Internal Testing › +): hasta 100 personas que ya estén en el equipo de App Store Connect, sin revisión de Apple. Un grupo **externo** (link público) pasa por Beta App Review y necesita lo del checklist de abajo.

### Checklist antes del primer envío

- [x] Ícono Liquid Glass por capas: `Resources/AppIcon.icon` (Icon Composer), generado con
  `python3 ios/scripts/build-app-icon.py`. 4 grupos planos (fantasmas · washi · miel · k); el
  vidrio lo pone el sistema. Reemplaza al `AppIcon.appiconset` (queda como respaldo) y Xcode genera
  desde él las versiones planas para iOS < 26. Previsualizar sin abrir Icon Composer:
  `"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" ios/Kura/Resources/AppIcon.icon --export-image --output-file out.png --platform iOS --rendition Default --width 1024 --height 1024 --scale 1`
  (renditions: `Default`, `Dark`, `ClearLight`, `ClearDark`, `TintedLight`, `TintedDark`).
- [x] `UILaunchScreen` → `UIColorName: LaunchBackground` (color en el catálogo), idéntico en `Info.plist` e `Info-Debug.plist`.
- [x] `ITSAppUsesNonExemptEncryption = false`, `LSRequiresIPhoneOS`, solo iPhone (`TARGETED_DEVICE_FAMILY 1`), solo vertical, `CFBundleDevelopmentRegion es-MX`.
- [x] Release apunta a `https://baclog.app/api/v1`, sin excepciones de ATS (solo Debug permite `localhost`).
- [x] dSYM en Release (`dwarf-with-dsym`) + `uploadSymbols`, para que los crashes de TestFlight vengan simbolizados.
- [ ] `PrivacyInfo.xcprivacy` (APIs de razón requerida como UserDefaults, sin tracking): lo agrega el carril iOS de la fase 4a. Confirma que el archivo esté en el target antes de subir.
- [ ] **URL de la política de privacidad: `https://baclog.app/privacidad`** — la página ya existe (aviso de privacidad integral, pública y sin sesión; texto en `src/app/(marketing)/privacidad/content.ts`). Va en App Store Connect › App Information › Privacy Policy URL (también la pide TestFlight externo). Antes de mandarla, el founder rellena `[RAZÓN SOCIAL]`, `[DOMICILIO]` y `[CORREO DE CONTACTO]` en ese archivo y despliega. En la app, Ajustes › privacidad › "Aviso de privacidad" ya abre esa URL en `SFSafariViewController`.
- [ ] **App Privacy** (App Store Connect › App Privacy): declarar correo, nombre de usuario, foto de perfil, contenido del usuario (reseñas) e identificadores, ligados a la identidad y sin tracking.
- [ ] **Cuenta para la revisión**: el acceso es solo con código por correo, así que Beta App Review (TestFlight externo) y App Review necesitan una cuenta demo cuyo código puedan recibir, o un acceso para el revisor. Hay que decidirlo antes del primer grupo externo.
- [ ] Clasificación por edad (el cuestionario; las reseñas son UGC, así que hay que declarar moderación y reporte) y borrar la cuenta desde la app (Ajustes › Borrar cuenta, requisito 5.1.1(v)): confirmar que funcione contra prod.

## Pendiente

Cerrado en la fase 4a (2026-09-24): fotos de perfil (`DesignSystem/Components/Avatar.swift`, subida desde Editar perfil con recorte a 512 px y JPEG ≤ 400 KB), colección pública ajena (`Features/People/PublicCollectionView.swift`), "más reseñas" paginado (`GET /titles/{id}/reviews`), estados vacío/error/sin conexión en cada `load*` (`loadErrors`, `RetryStrip`, reintento al volver la red), Dynamic Type (escala con tope `xxxLarge`; mono, wordmark, sello y dock fijos a propósito), `PrivacyInfo.xcprivacy`, ventana pintada con `bg` desde el primer frame, y el recorrido real contra `next dev` de punta a punta (dos veces, cuenta QA borrada).

- Apple / Google (API.md §2.2, fase 4): hoy solo correo → código; esos botones avisan.
- Bloquear/reportar (hoy un aviso), push real (hoy notificación local; `device_token` es fase 4b).
- Recap: la tarjeta se comparte como link, falta exportarla como imagen (`POST /auth/web-session` es fase 4b). Compartir → "Historia" igual.
- Modo ordenar usa el `List` del sistema para arrastrar (asa y levantado nativos, no los del frame).
- Persistencia local / sincronización real del modo sin conexión (hoy la franja + reintento; no hay caché de datos).
- Tests (unitarios del `AppStore`: undo, no puedo esperar, membresías) y snapshot tests por pantalla.
- "Más reseñas" no se ha visto con una segunda página real: ningún título de la base tiene más de una reseña pública.
