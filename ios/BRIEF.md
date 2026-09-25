# Kura iOS — brief de implementación

App nativa iOS (SwiftUI, iOS 17+) que implementa el sistema de diseño **Kura** y los **Flujos v2**.
Fuentes de verdad (léelas antes de escribir código):

- `design/kura/sistema-de-diseno.dc.html` — tokens, tipografía, glifos, componentes, patrones, voz, movimiento. Su `<script>` al final tiene los datos (colores, escala tipográfica, radios, sombras, medidas, glifos, estados, patrones, vocabulario, movimiento).
- `design/kura/flujos-v2.dc.html` — pantallas 390×844 por flujo (01 primera vez · 02 tus colecciones · 03 dentro de una colección · 04 opciones · 05 llenar · 06 obra). El archivo está truncado al final (la mitad de 24c Álbum y el script de datos no están); todo lo demás está.
- Extractos por pantalla (mismo HTML, ya partido): `/private/tmp/claude-501/-Users-ericbriseno-baclog/a2c82526-37dc-4405-8355-afb9150bdade/scratchpad/kura/screens/*.html`. Los `{{ … }}` son bindings del mock; los valores reales van en la sección **Datos de ejemplo** de abajo.
- Reglas de "no puedo esperar": sección al final de este brief.

## Tokens (copiar tal cual)

Colores: `bg #0b0b0d` · `s1 #141417` · `s2 #1c1c21` · `text #f4f3ee` · `text2 #b9b8c2` · `text3 #8f8e9b` · `glassBg rgba(255,255,255,.075)` · `glassArt rgba(11,11,13,.5)` · `accent (miel) #efce8d` · `onAccent #0b0b0d` · `stObsessed (coral) #ec8e76` · `stLiked (pizarra) #9cbae1` · `stCompleted (salvia) #a0cba0` · `stWaiting (lavanda) #b9a6e8`. **Sin rojo.** El miel aparece **una vez por pantalla** (Seguir). Dock: `rgba(20,20,26,.5)` + blur.

Radios: cover-s 8 · cover-l 14 · surface 18 · screen 26 · pill 999.
Sombras: cover `0 18 36 -16 rgba(0,0,0,.88)` · stack `0 -8 18 rgba(0,0,0,.42)` · float `0 14 44 rgba(0,0,0,.55)`.
Medidas: toque mínimo 44 · Volver/Opciones 44 px a 64 del borde superior y 24 de los lados · margen lateral 20–24 · filas 52 (ajustes) / 72 (gente) / 80 (título en lista) · lomo 40 · portada en card de colección 150 (fijada) / 120 (compacta), todas del mismo alto en una card · disco 1:1, póster 2:3.

Tipografía (fuentes en `ios/Kura/Resources/Fonts/`, PostScript names entre paréntesis):
- **Newsreader** (Newsreader-Regular, Newsreader-Medium, Newsreader-Italic, Newsreader-MediumItalic): voz de marca. Perfil 40 · Título de pantalla 36 · Frase de vacío 32–34 · Título de obra *itálica* 30 · Sección 24 · Título de hoja 22 · Título de obra en fila *itálica* 19 / 14. Siempre en minúscula. Wordmark "kura" = MediumItalic, tracking −3.5%.
- **Hanken Grotesk** (HankenGrotesk-Regular/Medium/SemiBold): interfaz. Cuerpo 15–16 (400), filas 500, botones y handles 600. Nota 13 text2.
- **Red Hat Mono** (RedHatMono-Regular/Medium): datos. 11 px MAYÚSCULAS tracking +8% (fechas, conteos, etiquetas), 12–13 en conteos y lomos. Sello "KURA" = Medium, tracking +24%.
- Kanji 蔵 (solo en Bienvenida/onboarding, nunca en la interfaz): usar `HiraMinProN-W6` del sistema.

Glifos → SF Symbols (un glifo, un significado; el color refuerza): llama `flame.fill` coral · pulgar `hand.thumbsup.fill` pizarra · check `checkmark` salvia (grosor bold) · reloj `clock.fill` lavanda · marcador `bookmark.fill` text · globo `bubble.fill` text · personas `person.2.fill` · candado `lock.fill` · triángulo `exclamationmark.triangle.fill` · Volver `chevron.left` · Opciones `ellipsis` · más `plus` · buscar `magnifyingglass` · compartir `square.and.arrow.up`.

Superficie teñida (la única forma en que entra el color): paleta de dos hex de la portada → degradado 168°: `mix(h1, #101013, k)` arriba y `mix(h2, #0c0c10, k+.08)` abajo con `k = 1 − 0.45·0.78 ≈ 0.649`. Fuera del feed se funde a `bg` en su último tercio. Sin portada no hay color. Sin glow, sin blur de color, sin aura, sin bordes.

Sello (avatar sin foto): dos iniciales en minúscula, Newsreader MediumItalic al 42% del diámetro. Fondo = tono oscuro de la obsesión destacada **invertido** (0xffffff ^ hex) y mezclado 72% hacia bg; iniciales = tono claro invertido mezclado 55% hacia text. Sin obsesión: s2 + text. Tamaños 128 perfil / 48 fila / 32–36 lista.

Movimiento: portada compartida 320 ms spring (`matchedGeometryEffect` card → ficha/colección) · tinte 240 ms fundido · hoja 280 ms · cambio de tab 0 ms · lo que cambia solo no se anima · esqueletos pulso de opacidad 1.6 s entre s1 y s2. Háptica ligera en me gusta, media en me obsesiona.

Movimiento y accesibilidad (auditoría Apple, 2026-09-24) — todas las curvas salen de `KMotion` (`DesignSystem/Tokens.swift`): lo que dispara un tap es spring sin rebote (`snappy`, damping 0.92); rebote solo tras un arrastre con inercia (`momentum`: el snap del slider, el regreso de la hoja); fundidos con ease (`tint`, `fade`); hojas `sheetIn`/`sheetOut` son springs `.smooth`. Presionar: la entrada es instantánea y la salida `release` (`KPressStyle`; para vistas que no son `Button`, `kPressable` en `Components/Press.swift`, con long press opcional). **Reducir movimiento**: todo lo espacial (mover, zoom, escala, rebote) pasa a fundido — `KMotion.slide(_:reduce:)`, `.kAnimation`, `.kScale`; el zoom de portada se apaga y el esqueleto queda quieto. Háptica por `KHaptic` (generadores preparados, nunca uno nuevo por tap). Las hojas son modales para VoiceOver (`isModal` + gesto escape "Z"; lo de atrás queda oculto); el aviso se anuncia (`AccessibilityNotification.Announcement`, "Deshacer disponible") y con VoiceOver dura 15 s — `AppStore.undoWindow` gobierna a la vez el aviso y el borrado diferido. Dynamic Type crece hasta tamaños de accesibilidad; solo el cromo de geometría fija se topa en xxxLarge con `kFixedChrome()`. Objetivos táctiles ≥ 44 pt con `kHitArea` (sin mover nada).

Voz: títulos en minúscula con punto final en frases ("aquí va lo que más vale."). Vocabulario: **colección** (nunca backlog/lista), **tus colecciones**, **completar**, **guardar** (abre siempre la hoja "guardar en"), **tu gente**, **recap de agosto**, **crear cuenta**. Primera persona para lo tuyo ("Me gusta"), tercera para otros ("Le gusta"). Errores sin guiño.

## Pantallas (todas, con su archivo de referencia)

Flujo 01 primera vez: `01-Splash` (wordmark 76) → `02-Onboarding` (蔵 + kura, abanico de 3 portadas, "la bodega donde guardas lo que más vale.", botón vidrio Empezar) → `03-O1a Crear cuenta` (1 de 2, portada 44×66 + "Para guardar *El viaje de Chihiro* en una colección.", "crea tu cuenta.", Apple sólido · Google vidrio · correo vidrio, "¿Ya tienes cuenta? Entrar") → `04-O1b Elige tu usuario` (campo @usuario con "libre" en salvia, nombre, "Crear cuenta" sólido) → `05-32a Elige 3` (grid 3 columnas masonry, selección numerada, CTA que cambia "Elige 3" → "Continuar"; el fondo se tiñe con las 3) → `06-32b Tu gente` (3 portadas 120 arriba, filas 72 de personas con "Le obsesiona X", Seguir vidrio ↔ Siguiendo, "Entrar a kura" sólido) · `07-O1c Entrar` (rama propia).

Flujo 02 tus colecciones: `08-15b Cargando` y `09-15c Cargando portadas` (esqueletos con la forma real) → `10-v.label` = **Tus colecciones** (header "tus colecciones" 36 + chip +, segmentado mono Todas/Cine/Series/Música en vidrio, card automática "no puedo esperar" con lomo y pill "auto", cards de colección con lomo de 40 px y portadas 150 alineadas a la base, deslizables en horizontal; abajo "listas" con nombre Newsreader 28 + tira; **mantener presionado** abre hoja s2 radio 36 con Fijar/Agregar títulos/Compartir/Renombrar; dock de 4 tabs) · `11-15a Sin colecciones` (card "tu primera" en s1 con + , "aquí va lo que más vale.", botón vidrio Nueva colección) · `12-O2a Nueva colección` (hoja: nombre en Newsreader 20 dentro de campo vidrio radio 16, "Quién la ve" con selector, Crear sólido) · `13-35c Sin conexión` (franja s1 arriba).

Flujo 03 dentro de una colección: `14-x.label` = **Colección** (cabecera teñida: Volver/Opciones a 64/24, portada elegida 240 alto centrada, nombre Newsreader 24, pills de formato con glifo + conteo que filtran; cuerpo `grouped` = secciones por formato con tiras, o `shelved` = grid de portadas con título itálica 14 + sub mono 10) · `15-O3a Ordenar` (hoja: Manual · Recientes · Título · Estado · Año) · `16-O3b Modo ordenar` (lista arrastrable con Listo) · `17-23a Cabecera portada grande` · `18-16c Lista` (filas 80: portada en slot 60, título itálica 19, meta mono 11, glifo de estado a la derecha) · `19-37b Colección con estrenos` (pill "auto", portadas con pill reloj + fecha).

Flujo 04 opciones: `20-18a Más` (hoja: Agregar títulos · Fijar · Compartir · Ver como lista · Ordenar · Cambiar portada · Renombrar · Privacidad · Borrar colección) → `21-O2b Renombrar` ("Los links que ya compartiste siguen funcionando.") · `22-K1a Quién ve la colección` (Pública / Seguidores / Solo yo con sus notas) · `23-18b Cambiar portada` (grid; "Elige la portada. Su color tiñe la cabecera y la card") · `24-O5 Compartir` (kura.app/c/musica-2026 · Copiar link · Historia · Más) · `25-35a Borrar colección` (única confirmación destructiva, texto explica, "Borrar colección" sólido + Cancelar) · `26-18c Mantener presionado un título` (hoja: Tu reacción con 3 opciones · Reseñar · Usar como portada · Mover a otra colección · Quitar de la colección) → `27-O4a Mover a` → `28-O4b Movido` (aviso "Movido a ghibli completo · Deshacer") · `29-35b Avisos` (píldora s2 sobre el dock, 5 s: Deshacer / Reintentar con triángulo).

Flujo 05 llenar: `30-15d Colección vacía` ("colección nueva, repisa vacía.") → `31-27a Agregar · sugerencias` ("para esta colección" / "por lo que ya tiene") → `32-27b Agregar · buscando` (resultados con coincidencia resaltada, + que se vuelve ✓, aviso "Agregado · Deshacer").

Flujo 06 obra: `33-24a Ficha · película` (cabecera teñida 180°, portada 200×300, título itálica 30, autor, mono "2001 · 125 min", ribbon de conteos con glifo, acciones: [Me obsesiona | Completar] vidrio · "En 2 colecciones" vidrio · Reseñar 44; secciones Newsreader 24: dónde ver (filas 56 con logo 40 en s2 + Incluido/Renta), sinopsis, gente que sigues (filas 52 con sello 36), reseñas (card s1 radio 18), en tus colecciones (pills Newsreader 17), también de …) · `34-24b Ficha · serie` (T3 · sin fecha, "Viendo · T2 3 de 10", episodios) · `35-24c Ficha · álbum` (240×240, "Abrir en Apple Music", canciones con número mono). Hoja **Completar** (26a, no está en el archivo; sigue el DS): título "¿qué te pareció?", tres opciones (Me gusta / Me obsesiona / Solo completo), reseña opcional 280 caracteres, switch "Contiene spoilers", Publicar sólido; al guardar, Completar se transforma en tu reacción (spring 320 ms).

Feed (tab Feed, mock `Feed v10 Kura`): pila de cards teñidas de 26 px de radio arriba, pegadas al header (sticky), snap por card, tres alturas L 620 / M 500 / S 370, chip de autor (sello 28 + @handle + "hace N h" mono), portada sola centrada o tira horizontal (ráfaga de altas) o abanico de 3 (sugerencia con Seguir en miel), pills mono de estado (Le obsesiona / Le gusta / Completo / Agregó a … / No puede esperar · sale el 17 jul / Reseñó), título itálica 26 con " · autor" en text2, cuerpo 15 con clamp 3, spoiler = texto borroso + pill "Contiene spoiler · Mostrar". Header: "tu feed" Newsreader 36 + campana 44 vidrio con punto.

Descubrir y Perfil: no hay frame; construir según el DS (Descubrir = campo de búsqueda vidrio 48 + secciones editoriales con tiras; Perfil propio = cabecera teñida por las 3 obsesiones, sello 128, nombre Newsreader 40, ribbon de conteos por estado, "tus colecciones" como cards, Ajustes en Opciones).

## Arquitectura

- `ios/project.yml` (xcodegen) → `ios/Kura.xcodeproj`, target `Kura`, bundle `com.tromwey.kura`, iOS 17.0, SwiftUI, portrait only, `UIAppFonts` con los 9 TTF, `UIUserInterfaceStyle = Dark`, icono desde `ios/Kura/Resources/AppIcon-1024.png` (asset catalog con un solo 1024 universal).
- `Kura/App` (KuraApp, RootRouter con estado `onboarded`), `Kura/DesignSystem` (Tokens, Typography con `Font.kura.*`, Components: `GlassButton`, `SolidButton`, `HoneyButton`, `IconChip44`, `StatusPill`, `CountRibbon`, `Cover` (AsyncImage + fallback de paleta + glifo de esquina + pill de espera), `CollectionCard` (lomo vertical + portadas), `TintedSurface`, `SectionTitle`, `KuraSheet` (presentationDetents + fondo s1/s2, asa 36×5), `Toast`, `Dock`, `Skeleton`, `Seal`), `Kura/Models`, `Kura/Mock/MockData.swift`, `Kura/Services/KuraAPI.swift` (protocol + `MockAPI`; nada de red real salvo imágenes), `Kura/Features/{Onboarding,Collections,CollectionDetail,Title,Feed,Discover,Profile,Add}`.
- Estado en un `@Observable AppStore` (colecciones, títulos, reacciones, seguidos, toasts) para que Deshacer funcione de verdad.
- Sin dependencias externas. Sin bordes en botones/cards/campos, sin glows, sin pulsos.

## Datos de ejemplo (hoy = jueves 24 sep 2026)

Autores (handle · iniciales · hex [oscuro, claro] de su obsesión destacada): mariel.ok · mo · [#c53e42,#794244] · tono_v · tv · [#b57a56,#685746] · luciarrr · lr · [#b4562f,#9b5832] · danpix · dp · [#c33d3b,#ae4c69] · nico.ve · nv · [#5ca6cb,#33566e]. Usuaria: mariel ortega (@mariel.ok).

Títulos (paleta [h1,h2] · portada):
- El viaje de Chihiro · cine · 2001 · Hayao Miyazaki · 125 min · [#c53e42,#794244] · https://image.tmdb.org/t/p/w500/2RcxjDykOssx4SfqshewyI9vfSl.jpg · sinopsis: "Chihiro, de diez años, queda atrapada en un mundo de espíritus después de que sus padres se transforman en cerdos. Para salvarlos entra a trabajar en una casa de baños y tiene que recordar su propio nombre."
- The Odyssey · cine · 2026 (estrenó 15 jul, ya salió, no completada) · Christopher Nolan · [#5ca6cb,#33566e] · https://image.tmdb.org/t/p/w500/mKPGRRyXIwN8JOLhAbWnxV1gNrS.jpg
- Pearl · cine · 2022 · Ti West · [#c45a4a,#785d53] · https://image.tmdb.org/t/p/w500/orYlKu8i5NRdbdhSXWg1cbRn3eB.jpg
- Spider-Man 3 · cine · 2007 · Sam Raimi · [#74524d,#3b3235] · https://image.tmdb.org/t/p/w500/etRvHz9ElAP0TMwltAZV1ufyfnW.jpg
- Severance · serie · 2022 · Dan Erickson · 2 temporadas · T3 sin fecha · [#7f95a5,#2b3a44] · https://image.tmdb.org/t/p/w500/1sylo2yeVyJ8KMZgcZLSopR66DA.jpg
- La princesa Mononoke · cine · 1997 · https://image.tmdb.org/t/p/w500/7fUjg7jky5FnnNSiSbWyOlxVYGU.jpg · Mi vecino Totoro · 1988 · https://image.tmdb.org/t/p/w500/uu6RaEAfkIQaolf20axWaRU4h3w.jpg · El niño y la garza · 2023 · https://image.tmdb.org/t/p/w500/8KqWfVuKP7aBt3XVrDUN6irqwZm.jpg
- Avengers: Doomsday · cine · sale 18 dic 2026 · https://image.tmdb.org/t/p/w500/7WU8xhLhiCYuRB2VcBnUMvo6kST.jpg
- You Can See Everything · cine · A24 · sale 16 oct 2026 · https://image.tmdb.org/t/p/w500/qhFWz1BsEMg5rcs6TAstmGQggMT.jpg
- Mind of Mine · álbum · 2016 · ZAYN · 18 canciones · [#b57a56,#685746] · https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/8b/73/a1/8b73a1fe-27eb-ef0d-535b-950b29769f9d/886445750782.jpg/600x600bb.jpg
- Ma · álbum · 2019 · Devendra Banhart · 14 canciones · [#c33d3b,#ae4c69] · https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/b3/84/c8/b384c84d-b4a8-8f05-a37e-8aab02ba698d/075597924053.jpg/600x600bb.jpg
- eduardo · álbum · 2021 · Ed Maverick · 12 canciones · [#997541,#5d4629] · https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1e/45/20/1e452034-12e8-a346-3b4a-f1661c115808/21UMGIM35580.rgb.jpg/600x600bb.jpg
- LA NUBE EN EL JARDÍN · álbum · 2025 · Ed Maverick · 12 canciones · [#78774a,#535841] · https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/43/d9/34/43d9342e-119d-31ef-17ac-e5cb5a8dc230/24UMGIM84395.rgb.jpg/600x600bb.jpg
- Mala · álbum · 2013 · Devendra Banhart · 15 canciones · [#b4562f,#9b5832] · https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/f4/71/c1/f471c1db-528f-bd53-3eee-2a2d078780d5/075597958836.jpg/600x600bb.jpg
- The Life of a Showgirl: The Encore · álbum · Taylor Swift · sale 25 sep 2026 (mañana → "14 h") · 16 canciones, disponibles 12 (nuevas 13–16: Patient Zero, Cleveland!, Pink Clouding, Babylon) · [#e1844d,#774934] · https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f1/a3/c7/f1a3c711-ff60-caee-2314-37c0dd3f7616/26UM1IM21436.rgb.jpg/600x600bb.jpg

Colecciones de mariel: "música 2026" (fijada; Ma, Mind of Mine, eduardo, LA NUBE EN EL JARDÍN; Seguidores) · "ghibli completo" (Chihiro ✓ obsesión, Mononoke ✓, Totoro ✓ me gusta; Pública) · "pendientes" (Pearl, Spider-Man 3, The Odyssey, Severance; Solo yo) · "con mi hermana" (Chihiro, The Odyssey, Pearl, Mala, Showgirl; Pública, 12 títulos en la copy de borrar) · "para correr" (vacía) · automática "no puedo esperar" (Showgirl 14 h · You Can See Everything 16 oct · Avengers: Doomsday 18 dic · Severance T3 sin fecha · The Odyssey "ya salió").

Reseñas: danpix sobre Chihiro (obsesión, con spoiler): "La volví a ver veinte años después y cambió de película. Lo que antes era una aventura ahora es sobre el trabajo, el nombre que te sacan y lo que cuesta recuperarlo. La secuencia del tren sigue siendo lo más cerca que estuvo el cine de un sueño real." · mariel sobre Pearl (me gusta): "Mia Goth sostiene una toma de seis minutos que debería estar en cualquier clase de actuación. El technicolor falso hace todo el trabajo de contraste: cuanto más bonito el campo, peor lo que pasa adentro de la casa."

Feed (edades en horas): luciarrr obsesionada con Mala (2 h) · tono_v completó Mind of Mine, le gustó (27 h) · danpix reseñó Chihiro (3 d) · mariel agregó 5 títulos a pendientes (6 d, ráfaga) · sugerencia nico.ve ("También le obsesiona El viaje de Chihiro" · "Siguen a @danpix y @luciarrr", abanico Chihiro/Pearl/Ma) · danpix agregó The Odyssey a estrenos, "No puede esperar · sale el 17 jul" · tono_v obsesionado con Mind of Mine (12 d) · mariel reseñó Pearl (13 d) · luciarrr completó Ma (15 d) · tono_v agregó eduardo a música 2026 (16 d).

Conteos de ficha (ribbon): Chihiro 12,4 k / 30,1 k / 48,7 k / 21,3 k · Severance 8,2 k / 14,6 k / 9,1 k / 6,3 k / ◷ 17,8 k · álbum 4,9 k / 9,3 k / 11,5 k / 7,2 k. Dónde ver (México): Max Incluido · Apple TV Renta · Prime Video Renta.

## Reglas "no puedo esperar" (acordadas con el founder)
- Solo títulos anunciados, aún no lanzados. No es un estado manual; el reloj de la ficha es indicador, no botón.
- ≤7 días: cuenta regresiva mono "3 d"; último día "14 h". >7 días: "17 jul" (año solo si no es este). Parcial: "oct 2026", "2027"; nada: "sin fecha".
- Guardar un anunciado: entra a la colección elegida + a la automática, siempre fijada arriba. Al salir sigue en la automática hasta completarlo; "hoy" el día del estreno, después "ya salió". Automática vacía se oculta; no se edita.
- Orden: primero lo que ya salió, luego lo más próximo; "sin fecha" al final.
- Álbumes: "X de Y disponibles"; "Abrir en" abre el ÁLBUM. Series: temporada nueva cuenta → "T3 · fecha".
- ◷ en la ficha = cuánta gente guardó el título antes del estreno (solo ícono + número, se queda para siempre).

## Definición de terminado
`xcodegen generate` + `xcodebuild -project ios/Kura.xcodeproj -scheme Kura -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -configuration Debug build` sin errores ni warnings de fuentes faltantes; instalada en el simulador arrancado (`xcrun simctl install booted <app>` + `launch`), y capturas (`xcrun simctl io booted screenshot`) de Splash, Tus colecciones, Colección, Ficha y Feed revisadas contra los frames. `ios/README.md` con cómo generar, correr, dónde enchufar la API real y qué queda pendiente.
