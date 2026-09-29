# Estado — recs

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: 2026-09-29 (Descubrir sin motor: "los más esperados" y "lo nuevo de tus favoritos")

## Qué cubre este dominio
<!-- El motor de recomendaciones cross-media: proveedores LLM, prompts, moderación, grafo de links,
     telemetría/costos y el harness de evaluación. Las tablas que lo respaldan se describen en
     `data.md`; las pantallas que lo muestran, en `frontend.md`. -->

## Mapa — dónde vive cada cosa
<!-- Rutas reales del repo con una línea de qué hay en cada una. Es lo primero que lee un agente nuevo. -->

| Ruta | Qué hay |
|---|---|
| `src/modules/recs/crossmedia.ts` | Lógica del motor cross-media |
| `src/modules/recs/crossmedia-provider.ts` | Capa de proveedor LLM (`@anthropic-ai/sdk`, `@google/genai`) |
| `src/modules/recs/moderation.ts` | Filtros/moderación de las recomendaciones generadas |
| `src/modules/recs/linkgraph.ts` | Grafo de links entre títulos |
| `src/modules/recs/metrics.ts` · `telemetry.ts` | Métricas y registro de llamadas LLM (`llmCallLog`) |
| `src/modules/recs/feedback-reasons.ts` | Catálogo de razones de feedback |
| `src/app/actions/crossmedia-actions.ts` · `crossmedia-feedback-actions.ts` | Server Actions de recos y feedback |
| `src/app/(app)/para-ti/` | Pantalla que consume las recos |
| `src/app/(app)/admin/recos/` · `admin/salud/` | Medidores de recos y salud/costos LLM |
| `scripts/eval-crossmedia.ts` | Harness de evaluación (`pnpm eval:recos`) |
| `src/modules/discover/anticipated.ts` · `creators-new.ts` | **Descubrir sin motor (2026-09-29)** — ninguno llama al LLM ni mide generaciones (ADR-009: visitar Descubrir es gratis). "Los más esperados" = conteo de Kura (`waiting`) + popularidad TMDB de lo que aún no sale; "lo nuevo de tus favoritos" = discografía/filmografía reciente y próxima de los artistas, directores y creadores de tus títulos favoritos (proveedores, no recos). Ambos excluyen la biblioteca del viewer. Detalle en `backend.md` |
| `scripts/eval-runs/*.json` | Resultados de corridas de eval, con fecha y modelo en el nombre |

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda. -->

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->
- **Descubrir no muestra nada que ya tengas (founder, 2026-09-29: "no tiene caso ver cosas que ya conoces en descubrir").** Tendencias, más esperados y lo nuevo de tus favoritos excluyen todo título con `user_item` del viewer (`modules/discover/library-gate.ts` `notInLibrary`, dentro de la query). Los rails de recos (`getObsessionRails`) ya descartaban lo que tienes (su propio anti-join sobre `user_item`).
- **"Los más esperados" se ordena por cuántas personas de Kura lo guardaron (founder, 2026-09-29)**, luego por popularidad del proveedor y luego por fecha. Antes esta sección era "tus estrenos" (tu propia biblioteca), que ahora vive solo en `/backlogs` (`getLibraryUpcoming`).

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
