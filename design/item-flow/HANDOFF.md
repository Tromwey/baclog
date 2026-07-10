# Baclog — Handoff de implementación (flujo de ítem)

Notas para quien implemente. Los mockups (`Baclog - App implementada.dc.html`) muestran layout y estilo; **este documento cubre la lógica, el comportamiento y las reglas que un mock estático no comunica.** La versión anotada con el razonamiento y la comparación de tratamientos está en `Baclog - Flujo de ítem.dc.html`.

Baclog es una app **para descubrir** cine, series y álbumes — **no** para trackear actividad. Evitar UI de estadísticas/tracking.

---

## 1. Modelo de datos — dos ejes independientes por ítem

**Progreso** (consumo, no emocional): `en_el_radar` → `en_progreso` → `completado`.
- `en_el_radar` es el **estado por defecto**: agregar un ítem a un backlog ya implica "en el radar". No requiere que el usuario lo toque.
- Solo `en_progreso` y `completado` son transiciones que el usuario marca activamente.
- Control en el detalle = **un solo botón**: *tap* → en progreso · *mantener presionado* → completado.

**Reacción** (emocional, independiente del progreso): `no_me_gusta` / `me_gusta` / `me_obsesiona`.
- `me_obsesiona` es una **señal aparte**, no un nivel más alto de "me gusta". Se puede marcar **en cualquier momento** (a mitad de una serie, sin terminar).
- `no_me_gusta` / `me_gusta` son un "veredicto" (más considerado, típicamente al terminar).
- Técnicamente los tres pueden vivir en el mismo campo por simplicidad, pero deben **leerse como cosas distintas**.

**Privacidad**
- La reacción **no se muestra en el perfil público hasta que el ítem esté `completado`**.
- **Excepción: `me_obsesiona`** se comparte en tiempo real (es la señal "obsessing over" pública). Por eso el detalle NO lleva nota de privacidad sobre la obsesión.

---

## 2. Dónde viven los controles

- **Editar** estado y reacción ocurre **solo en el detalle del ítem** (`/item/[id]`). Es la única fuente de verdad.
- Las filas del backlog (zoom) muestran una **señal de solo-lectura**; nunca editan inline.
- En el detalle: **solo "Me obsesiona"** se muestra prominente (gesto grande con su propia aura). `me gusta` / `no me gusta` viven en el menú **⋯** (superior).
- Modelo de gestos de la fila: **tap en el cuerpo = reproducir** (deep-link a la app de streaming preferida) · **chevron › = abrir detalle/ticket**.

---

## 3. Sistema de glifos de señal (implementar tal cual)

Dos símbolos con significado único:
- **Destello (✦) = "recomendado por IA"** (procedencia). Nunca reusarlo para obsesión.
- **Llama = "me obsesiona".**

Matriz de la fila (procedencia × reacción):

| | manual | recomendado (IA) |
|---|---|---|
| sin reacción | nada | destello gris |
| me gusta | punto gris | destello blanco |
| me obsesiona | llama roja | llama roja + destello ember (arriba-der.) |

- Los **números** de fila son índice neutro (gris), **sin** codificar estado en su color.
- El destello se dibuja ~15–20% más grande que el punto/llama para igualar su masa óptica (la forma de 4 puntas se ve más chica de lo que es).
- El progreso **no** se muestra en la fila (vive en el detalle); la fila surface solo la capa emocional.

---

## 4. Backlogs curados vs. lentes inteligentes

- **Estantes curados** (manuales) = la lista de `/backlogs`. Se crean con la tarjeta "Nuevo estante".
- **Lentes inteligentes**: *Obsesiones, En progreso, Completados, En el radar* son **filtros autogenerados** sobre la biblioteca, **no** estantes.
  - No contarlas como estantes ni sumar sus ítems a un total (un ítem aparece en un estante manual **y** en varias lentes → el conteo se duplica si se suma).
  - Se acceden desde **acciones en el header** (botón ★ = Obsesiones; chevron ⌄ = despliega En progreso / En el radar / Completados), no como tarjetas de estante.
  - Las **vistas de lente agrupan los ítems por estante de origen** (encabezados "De Julio '26", "De Sci-fi que duele"…).

---

## 5. Aura ADN

- Colores dominantes **extraídos on-device** de las portadas del usuario (blend `screen`, grano sutil).
- Animada: respirar/derivar **lento y de baja amplitud** (dos capas desfasadas para un efecto orgánico); **respetar `prefers-reduced-motion`**.
- **Pantallas internas de la app → llevan arte real** (portadas). **Contenido compartible (ticket / recibo / cassette) → solo aura, sin arte.**
- Backlog vacío = **sin aura** hasta el primer ítem (el color aparece con la primera portada).

---

## 6. Navegación y estructura

- **Dock flotante glass persistente**: Estantes / Discover / Perfil. (Discover y Perfil se diseñan en el otro proyecto.)
- **Detalle** = vista tipo *zoom* empujada (back + ⋯, **sin dock**). Acciones primarias (**Reproducir · Agregar a backlog · Progreso**) fijas en una **barra inferior**; el contenido scrollea detrás; hero con aura.
- **Reproducir** es genérico del medio (ícono play + texto), la acción por defecto del ítem.
- Padding lateral de contenido consistente: **20px**.

---

## 7. Design system

- Tipografías: **Bricolage Grotesque** (display/títulos grandes), **Instrument Serif** *itálica* (títulos de obras y voz emocional), **Hanken Grotesk** (cuerpo), **Space Mono** (meta/labels — única zona en MAYÚSCULAS; las etiquetas del nav son la excepción: Hanken, sentence-case).
- Colores: `bg #0B0B0D`, superficies `#141417/#1C1C21/#26262C`, texto `#F4F3EE/#A9A8B2/#6C6B76`, **lima `#D8FF3E`** (firma + completado), **hot `#FF2D55`** (obsesión), **radar `#7AA2FF`**.
- **Sin bordes** (estética plana) y **sin irradiación/glow** en botones y glifos — el aura es la única fuente de "luz". El botón activo del dock usa una píldora oscura, no un fondo lima.

---

## 8. Comportamientos que el mock NO incluye (construir)

- Long-press del botón de progreso (→ completado) y su tap (→ en progreso).
- Tap-en-fila = reproducir (deep-link); chevron = detalle.
- Apertura del menú ⋯ (contiene me gusta / no me gusta / ocultar recomendación).
- Filtrado/agrupación de las lentes por estante de origen.
- Extracción de la paleta de la portada para el aura.
- Las portadas en el mock son *image-slots* (placeholders); en producción es arte real.

**Descubribilidad (pendiente de diseño fino):** el long-press de progreso y el veredicto-en-⋯ son poco descubribles. Resolverlos con **coach marks de primer uso** (ya presentes en la pantalla de primer uso: *toca = reproducir · › = ticket · ✦ = recomendado*).

---

## 9. Inventario de pantallas (en `Baclog - App implementada.dc.html`)

1. `/backlogs` — lista de estantes curados + tarjeta "Nuevo estante" + acceso a lentes.
2. Zoom de estante (ej. "Julio '26") — hero con aura + lista de ítems con señal de reacción.
3. `/item/[id]` (detalle) — portada, título, sinopsis, barra de acciones fija, gesto Me obsesiona, ¿Por qué? (rec IA).
4. Lente **Me obsesiona** (agrupada por estante).
5. Lente **En progreso** (agrupada por estante).
6. Lente **Completados** (agrupada por estante).
7. **Backlog vacío** (estado).
8. **Primer uso** / onboarding (estado; aloja los coach marks).

Faltan (en el otro proyecto): **Discover** y **Perfil/ticket**; y flujos secundarios: sheet "Agregar a un backlog", preview de "Compartir ticket", búsqueda.
