---
id: 2026-09-21-pnpm-ship-sale-1-con-el-deploy-ya-vivo
domain: infra
guardrail: none (comportamiento del CLI de Vercel — la verificación es leer la API, ver Prevención)
status: resolved
---

# `pnpm ship` (y `pnpm beta`) salen con código 1 aunque el deploy haya quedado READY

## Síntoma

`pnpm ship` (= `vercel --prod`) termina con:

```
 ELIFECYCLE  Command failed with exit code 1.
```

precedido de un sobre JSON de error (`"command": "vercel deploy"`, `"when": "retry deploy"`) y del
aviso `Update available! v59.11.7 ≫ v59.23.2`. El log ANTERIOR a eso dice
`✓ Compiled successfully`, genera las 38 páginas y imprime la tabla de rutas completa: el build
remoto **no falló**.

La lectura natural ("el deploy falló, lo vuelvo a correr") es la trampa: cada reintento crea
**otro deployment de producción**. En esta sesión se dispararon tres antes de comprobar el estado.

## Causa raíz

El fallo es del CLI **después** de que el deployment terminó y de que el alias se movió, no del
deploy. Los dos deployments creados quedaron en `state: "READY"` con el sha correcto, y
`baclog.app` / `www.baclog.app` ya colgaban del más nuevo. El CLI local está desactualizado
(59.11.7 contra 59.23.2) y revienta en un paso posterior; el efecto en prod ya estaba hecho.

## También rompe `pnpm beta`, y ahí SÍ deja el alias viejo

`scripts/deploy-beta.sh` corre con `set -e -o pipefail` y toma la URL de
`vercel deploy --yes | grep …`. Cuando el CLI sale 1, `pipefail` re-expone el
fallo y el script aborta **antes de aliasear** — su "fail closed" a propósito.
Diferencia clave con `ship`: el deployment queda READY pero `beta.baclog.app`
sigue apuntando al ANTERIOR, así que `curl` devuelve 200 y parece que funcionó.
El arreglo es aliasear a mano con la URL que el deploy sí imprimió:

```sh
npx vercel alias set https://baclog-XXXX-communeodevteams-projects.vercel.app baclog-beta.vercel.app
npx vercel alias set https://baclog-XXXX-communeodevteams-projects.vercel.app beta.baclog.app
```

## Prevención

- **Antes de reintentar, comprobar el estado real** en vez de fiarse del exit code. Con el MCP de
  Vercel (equipo `communeodevteam`): `list_deployments` con `app: "baclog"`, `target: "production"`
  — si el más reciente dice `state: "READY"` y su `meta.githubCommitSha` es tu HEAD, el deploy
  salió. Después `list_deployment_aliases` con ese `id`: si aparece `baclog.app`, prod ya te está
  sirviendo. Confirmación final barata: `git rev-parse HEAD` contra el sha desplegado, y
  `curl -s -o /dev/null -w "%{http_code}" https://baclog.app/login`.
- **No hay guardrail ejecutable**: es el CLI de un tercero y el repo no tiene CI (ver
  `guardrails.md`). Lo que evita la recaída es el chequeo de arriba, no un test.
- **Callejón sin salida**: correr `pnpm ship` otra vez "por si acaso". No es idempotente — cada
  corrida sube y despliega de nuevo. Y tampoco basta con mirar el `Production  https://baclog-xxxx…`
  que imprime el CLI: esa es la URL del deployment, no el dominio de producción; que exista no
  prueba que el alias se haya movido.
- Actualizar el CLI (`npm i -g vercel@latest`) es la solución de fondo, pero es una decisión del
  founder sobre su máquina, no algo que se cambie en el repo.
