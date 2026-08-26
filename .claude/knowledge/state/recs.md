# Estado — recs

> Cómo está **hoy** este dominio. Archivo **mutable**: se sobreescribe cuando la realidad cambia.
> No es un changelog — si algo dejó de ser cierto, se borra, no se tacha.
> Los errores ya resueltos NO van aquí: van a `learnings/` (append-only).
>
> Actualizado: YYYY-MM-DD

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
| `scripts/eval-runs/*.json` | Resultados de corridas de eval, con fecha y modelo en el nombre |

## Convenciones vigentes
<!-- Las reglas que un agente debe respetar al tocar este dominio, con un ejemplo correcto/incorrecto si ayuda. -->

## Decisiones tomadas (y por qué)
<!-- Una línea por decisión de arquitectura viva, con la razón. Si se revierte, se reescribe la línea. -->

## En progreso
<!-- Trabajo a medias que otro agente podría pisar. Vaciar al terminar. -->

## Deuda conocida
<!-- Lo que sabemos que está mal y aún no arreglamos, con el costo de dejarlo así. -->
