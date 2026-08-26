# Cerebro compartido de agentes

Este directorio es la **fuente de verdad viva** del proyecto para cualquier agente, sin importar su
especialidad ni si se acaba de incorporar. Está versionado en el repo, así que viaja a todas las
máquinas, agentes y compañeros.

Separa el conocimiento por su **ciclo de vida**:

- **`state/`** — cómo está el proyecto **hoy**. Mutable: se sobreescribe cuando la realidad cambia.
- **`learnings/`** — errores ya resueltos y gotchas. **Append-only: nunca se borra** (borrar = perder la lección = el error puede volver).
- **`guardrails.md`** — los checks automáticos que impiden que esos errores regresen.

> `AGENTS.md` (raíz, importado por `CLAUDE.md`) = reglas evergreen, *"cómo se hacen las cosas"*.
> Este directorio = *"cómo está el proyecto"* (`state/`) + *"qué ya nos mordió"* (`learnings/`).

## Router — según tu tarea, lee esto primero

| Vas a tocar… | Lee | Subagente |
|---|---|---|
| Server Actions, route handlers, módulos de servidor, integraciones externas, cron | `state/backend.md` | `backend` |
| UI, componentes, aura/paleta, layout, texto visible | `state/frontend.md` | `frontend` |
| Esquema Drizzle, migraciones, queries, Neon | `state/data.md` | `backend` |
| Auth (NextAuth + OTP), autorización app-layer (`src/authz`), gates de admin, perfil público | `state/security.md` | `security` |
| Recomendaciones cross-media, LLM providers, evals, telemetría de recos | `state/recs.md` | `backend` |
| Build, deploy manual a Vercel, envs, dependencias | `state/infra.md` | — |
| Cualquier cosa (norte, en progreso, deuda) | `state/overview.md` | — |

Este repo **no tiene** suite de tests ni CI, así que no hay `state/qa.md`. Si se agrega una capa de
tests, créalo entonces (y sumá su fila a este router).

Y **siempre**, antes de debuggear: `grep -ri "<keyword del área>" .claude/knowledge/learnings/`.

## El ciclo que mantiene esto vivo (parte del "definition of done", no opcional)

1. **Antes de empezar** → lee el `state/{tu-dominio}.md` que te toca y busca en `learnings/`.
2. **Al resolver un bug no obvio** → agrega una entrada en `learnings/` (copia `learnings/_TEMPLATE.md`).
   Si pudiste blindarlo con un guardrail ejecutable (test/lint/CI), regístralo — **eso** es lo que de
   verdad evita la recaída; la doc es el respaldo.
3. **Al cambiar el estado** (feature nueva, migración, decisión de arquitectura) → actualiza el
   `state/` correspondiente **en el mismo PR**. Actualizar el estado es parte de terminar la tarea.

## Cómo agregar un dominio nuevo

Crea `state/<dominio>.md` (copia el stub de un `state/` existente), agrégalo al router de arriba y, si
amerita un especialista, un subagente en `.claude/agents/<dominio>.md` que arranque leyendo ese
`state/` + `learnings/`.
