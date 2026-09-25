---
id: 2026-09-25-ios-paleta-gris-titulo-solo-visto-en-la-app
domain: frontend
guardrail: none (no hay tests de iOS ni CI de Xcode; el smoke `writes` cubre el contrato de `PUT /titles/{id}/palette`, no que la app lo llame)
status: resolved
---

# En iOS la tarjeta teñida de un título sale gris (`#6c6b76`) aunque la portada tenga color

## Síntoma
Descubrir › "recomendado para ti" (y cualquier `Tint.card` / `Tint.header`) pinta el gris de respaldo para
algunos títulos — visto con el álbum "Obsession (Original Motion Picture Soundtrack)" de Rock Burwell. En la
web el mismo título sí se tiñe si alguien lo agregó o lo abrió ahí.

## Causa raíz
`catalog_item.paletteHex` se extrae EN EL DISPOSITIVO y solo la web lo hacía (al agregar y al ver). La app iOS
solo leía `palette` de la API, así que un título que nunca pasó por la web llegaba con `palette: []`
para siempre. Además `register` reemplazaba la paleta con la de cada payload nuevo, aunque viniera vacía.

## Prevención
- Extractor en Swift (`ios/Kura/Services/CoverPalette.swift`, mismo algoritmo que `src/modules/cards/palette.ts`)
  disparado por `CoverView` → `AppStore+Palette.swift`; al servidor por `PUT /api/v1/titles/{id}/palette`
  (o `paletteHex` en el `PUT` de membresía para un `ext:`). Todas las escrituras pasan por
  `fillCatalogPalette` (`WHERE palette_hex IS NULL`).
- `register` conserva la paleta conocida si el payload nuevo trae `[]`.
- Callejón sin salida: "arreglar" el gris cambiando el color de respaldo en `Tint.ends`, o calcular la paleta en
  el servidor. El servidor nunca toca la portada (ADR-007/008); la paleta se calcula en el cliente.
