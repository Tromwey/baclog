---
id: 2026-09-27-derived-data-de-agentes-llena-el-disco
domain: infra
guardrail: none (proceso; la regla va en cada brief de agente iOS)
status: resolved
---

# ENOSPC: Bash, Edit y los dev servers dejan de funcionar a mitad de la sesión

## Síntoma
Todas las herramientas fallan con `ENOSPC: no space left on device` (incluso abrir el archivo de salida de un comando), los agentes se quedan a medias y un dev server queda vivo sin poder apagarse.

## Causa raíz
Varios agentes iOS en paralelo, cada uno con su `-derivedDataPath` (2–3 GB cada uno) más simuladores propios, más `~/Library/Developer/Xcode/DerivedData` (3 GB) y `ios/build/` (1.7 GB). El disco tenía ~6 GB libres.

## Prevención
- Cada brief de agente iOS: derivedData en el scratchpad con nombre propio y **borrarlo al terminar**; simulador propio y **borrarlo al terminar**.
- Antes de lanzar ≥3 carriles iOS, revisar `df -h /`.
- Si ya pasó: Bash no sirve (no puede escribir su salida); usar la terminal del panel para `rm -rf` de derivedData viejos, `~/Library/Developer/Xcode/DerivedData/*` (se regenera) y `xcrun simctl delete unavailable`. Luego avisar a los agentes vivos que verifiquen con `git diff` que sus ediciones quedaron completas.
