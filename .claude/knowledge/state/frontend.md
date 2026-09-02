# Estado — frontend

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: YYYY-MM-DD

## Qué cubre este dominio
<!-- Pantallas, componentes, sistema visual (aura/paleta), navegación y texto visible.
     La lógica de servidor que alimenta esas pantallas va en `backend.md`. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `src/app/layout.tsx` · `src/app/globals.css` · `src/app/manifest.ts` | Layout raíz, estilos globales (Tailwind v4) y manifest PWA |
| `src/app/(app)/layout.tsx` · `nav-dock.tsx` · `aura-background.tsx` · `page-slide.tsx` · `template.tsx` · `nav-direction.ts` | Shell de la app autenticada: dock flotante, aura de fondo, transición entre páginas |
| `src/app/(app)/backlogs/` | Lista, detalle, `@modal` interceptado, `card`, `lentes/[kind]` |
| `src/app/(app)/item/[catalogItemId]/` | Detalle de título y su `card` compartible |
| `src/app/(app)/descubrir/` · `search/` · `para-ti/` · `recap/` | Descubrimiento, búsqueda, recos y recap |
| `src/components/cover-thumb.tsx` · `src/components/ui/load-more-button.tsx` | Portada a tamaño nombrado (xs/sm/md/lg, aspecto nativo, lazy) y el "Ver más" de las listas keyset (feed, gente, reseñas) |
| `src/app/(app)/feed/` | F3.10 feed social v2: cards en 4 formas (ráfaga colapsable con tira ≤12 + tile "+N", joyas obsesión/reseña, compacta con link estirado al ítem y @handle/backlog con href propio), vacíos 1b/1c, skeleton v2, error, búsqueda por @handle. Agrupación pura en `modules/social/group.ts`, paginación por CARDS en `getFeedCards`; "Ver más" fallido lo dice en el botón (no error boundary) |
| `src/app/(app)/perfil/` · `settings/` | Perfil propio (F3.10: forma de perfil público + "Tu gente" + escaparate de estantes; `edit-shelves.tsx` = hoja Privado/Público/Perfil por backlog F3.10.1; `siguiendo/`·`seguidores/`) y Ajustes (absorbió instalar/admin/cerrar sesión tras el chip) |
| `src/app/(app)/admin/` | Torre de Control: `analytics`, `recos`, `salud`, `trafico`, `usuarios`, `palette-backfill` |
| `src/app/(auth)/` | `login`, `verify`, `onboarding`, `blocked` |
| `src/app/(marketing)/` | `waitlist`, `creditos` |
| `src/app/u/[username]/` | Vistas públicas de perfil, backlog e ítem |
| `src/components/ui/` | Primitivos: `aura-field.tsx`, `aura-presets.ts`, `surface.tsx`, `button.tsx`, `status-chip.tsx`, `screen-header.tsx`, `back-button.tsx`, `mono-meta.tsx`, `auth-aura-backdrop.tsx` (barrel en `index.ts`) |
| `src/components/` | Componentes de producto: `backlog-hero`, `item-hero-aura`, `item-row-*`, `item-status`, `card-exporter`, `tracklist`, `cross-media-feedback`, `theme-color-sync`, `glyph-paths`, `follow-button` (F3.10, optimista), `adn-avatar` (orbe ADN a cualquier tamaño), `reviews/` (F3.9) |
| `src/hooks/` | `use-long-press.ts`, `use-scroll-into-view-on-keyboard.ts` |
| `design/item-flow/` | HANDOFF de diseño — origen de las reglas visuales (§7: "el aura es la única fuente de luz") |

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda.
     Las reglas duras y evergreen (sistema sin bordes/glow/pulse, copy "backlog" no "estante",
     portalear modales a <body>) viven en AGENTS.md — no las dupliques aquí. -->

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
