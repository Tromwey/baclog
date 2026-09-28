---
id: 2026-09-27-vercel-sube-ios-build-sin-vercelignore
domain: infra
guardrail: .vercelignore (excluye ios/) — no hay check ejecutable; ver Prevención
status: resolved
---

# `vercel deploy --prod` tarda ~46 min y termina en "Unexpected error"

## Síntoma
El deploy de producción se queda en "Downloading 14046 deployment files…" y a los ~46 min Vercel marca el deployment como **Error** ("Unexpected error. Please try again later."). Antes tardaba ~1 min.

## Causa raíz
El repo no tenía `.vercelignore`, así que la CLI subía TODO el árbol, incluido `ios/build/` (DerivedData de los builds al iPhone y del archive de TestFlight: ~1.7 GB). Estar en `.gitignore` no basta para excluirlo del upload.

## Prevención
- `.vercelignore` en la raíz con `ios/` (la web no lee nada de ahí). Con él el deploy vuelve a ~1 min.
- Sin guardrail automático: si aparece una carpeta grande nueva fuera de `ios/` (p.ej. artefactos de otra herramienta), añádela al `.vercelignore`.
- Callejón sin salida: reintentar el deploy sin mirar el tamaño del upload — vuelve a fallar igual. La línea "Downloading N deployment files" con N en miles es la pista.
