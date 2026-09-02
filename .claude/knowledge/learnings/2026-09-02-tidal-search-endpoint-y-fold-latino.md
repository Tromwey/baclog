# TIDAL v2: la búsqueda es `/searchResults?filter[query]=` (los foros viejos mienten) · y un fold solo-latino mata los títulos en cirílico

**Fecha:** 2026-09-02 · **Dominio:** backend (`src/modules/links/resolvers/`) · **Brief:** `~/Documents/Baclog/requerimientos/brief-link-out-post-odesli.md`

## Qué pasó

1. Un agente revisor, apoyado en ejemplos de GitHub Discussions de `tidal-music`, reportó como **crítico** que
   `GET /v2/searchResults?filter[query]=…` "no existe" y que la forma correcta era `/v2/searchresults/{query}`.
   Era al revés: esa era la forma **antigua**; el OpenAPI vigente
   (`https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json`) define `/searchResults` con
   `filter[query]` (obligatorio), `countryCode` e `include` (albums, artists, …, y anidado `albums.artists`
   sí funciona). Verificado en vivo: 200 con 20 álbumes y 18 artistas incluidos.
2. El matcher (`match.ts`) plegaba con `[^a-z0-9\s]` → «Там, где рассвет» quedaba en `""` y nunca
   igualaba; además partía «Earth, Wind & Fire» en tres artistas solo del lado del catálogo, así que una
   banda con separador en el nombre era un "sin match" permanente (cacheado).

## Por qué muerde

- La ruta vieja devolvería 404, y un 404 mapeado a `none` se **cachea para siempre** en `media_link`
  (`is_search_fallback = true`, sin TTL). Por eso ahora 404 → `unavailable` (no cachea).
- Un "sin match" equivocado no es un error visible: el botón sigue funcionando (búsqueda), solo peor.

## Cómo se evita

- Fuente de verdad de la API de TIDAL: el JSON OpenAPI de arriba, no ejemplos de terceros ni foros.
  Descargarlo y leer `paths` antes de discutir el contrato.
- `fold` usa `\p{L}\p{N}` con flag `u`; `splitArtists` se aplica a **ambos** lados (catálogo y upstream)
  y se comparan conjuntos de tokens.
- Guardrail: `pnpm tsx scripts/check-album-match.ts` (cirílico, Earth Wind & Fire, Florence + The
  Machine, X Ambassadors, «Cars» vs «Cars 2», featurings en el título vs acreditados).
