# `git add -A` en un árbol que comparten dos sesiones barre el WIP ajeno

**Fecha:** 2026-09-02 · **Dominio:** infra / flujo de trabajo

## Qué pasó
Dos sesiones de Claude trabajaban en el mismo working tree (`/Users/ericbriseno/baclog`): una
implementaba el feed v2, la otra agregaba TIDAL como cuarto servicio (migración 0025 + enum + links).
La sesión del feed cerró con `git add -A && git commit` y se llevó dentro de `b9ed302` **19
archivos**, 9 de ellos del trabajo de Tidal que la otra sesión aún no había commiteado — y luego
pusheó y desplegó beta con `pnpm beta` (que sube el working dir completo). Resultado: un commit
mezclado e irreversible en `origin/main`, y **beta sirviendo código que escribe `'tidal'` en enums
que la DB todavía no tenía** (la migración 0025 existía como archivo pero nadie la había aplicado).
La otra sesión quedó con un commit-cola (`689cef2`) de 2 archivos.

## Por qué una persona razonable cae
`git status` se ve "limpio de conflictos" y `git add -A` es el reflejo de cierre. Nada avisa de que
parte de lo untracked/modified es de OTRO agente: el árbol no distingue autores. El gotcha previo
("2 sesiones al mismo tree", `estado-actual.md`) documentaba el conflicto *semántico* al rebasear;
esta es la variante silenciosa: no hay conflicto, hay absorción.

## La regla
1. **Stagear por rutas explícitas, nunca `-A`**, cuando exista la más mínima posibilidad de otra
   sesión en el árbol: `git add src/modules/social src/app/\(app\)/feed …`. Antes de commitear,
   `git status --short` y preguntarse por cada archivo "¿esto lo toqué yo?".
2. **`pnpm beta` sube el working dir**: revisar `git status` ANTES de desplegar; si hay cambios que
   no son tuyos, o se commitean por su dueño o se stashean, pero no viajan a beta por accidente.
3. Si aun así se coló una migración ajena al deploy: aplicarla (si es aditiva) es el remedio, no
   revertir el deploy — el código ya está fuera y la DB debe alcanzarlo.

## Guardrail
Ninguno ejecutable todavía. Candidato: un hook de pre-commit que aborte si el commit toca
`drizzle/*.sql` sin que el mensaje mencione la migración, o simplemente el hábito de arriba.
