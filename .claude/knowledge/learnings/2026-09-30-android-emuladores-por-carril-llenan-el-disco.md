---
id: 2026-09-30-android-emuladores-por-carril-llenan-el-disco
domain: infra
guardrail: none (proceso: revisar `df -h /` antes de levantar más de un emulador y borrar los AVDs desechables al terminar)
status: resolved
---

# Android: un emulador por carril llena el disco del Mac en una hora

## Síntoma
`adb` falla con "no space left on device", las capturas salen truncadas y `df -h /` muestra ~300 MB
libres. Pasó con 5 emuladores en paralelo (uno por carril de pantallas) sobre un disco que ya iba
lleno.

## Causa raíz
Cada AVD escribe su `userdata` y sus snapshots en `~/.android/avd/<nombre>.avd/` (1.8–2.5 GB cada
uno recién creado, 6.6 GB el principal con uso), más el `build/` aislado de cada carril. Cuatro AVDs
extra = ~9 GB en una hora. Además, una segunda instancia del MISMO AVD solo arranca con `-read-only`
si la primera también lo tiene; por eso hubo que crear AVDs nuevos (`avdmanager create avd`), que
duplican el espacio.

## Prevención
- Antes de levantar ≥2 emuladores: `df -h /`; con menos de ~15 GB libres, turnar los carriles de
  gestos en un solo emulador en vez de multiplicarlos.
- Los AVDs de carril son desechables: `avdmanager delete avd -n <nombre>` al terminar la ronda (el
  orquestador, no el carril). Las distribuciones viejas de Gradle en `~/.gradle/wrapper/dists/`
  también se van tras subir de versión.
- Es el gemelo del learning de iOS `2026-09-27-derived-data-de-agentes-llena-el-disco.md`.
- Callejón sin salida: compartir un emulador entre carriles que inyectan gestos con `adb input`;
  cada `am start` roba el frente y los toques caen en la app de otro carril.
