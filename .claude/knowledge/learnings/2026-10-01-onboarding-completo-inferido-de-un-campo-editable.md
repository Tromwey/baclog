---
id: 2026-10-01-onboarding-completo-inferido-de-un-campo-editable
domain: security
guardrail: none (no hay runner con DB; `isOnboarded` en `src/auth/user-row.ts` es el único sitio que lo decide — `grep -rn "name !== null\|!user.name" src` es la revisión manual)
status: resolved
---

# "Onboarding completo" se infería de `name`, y `name` se podía escribir sin pasar el gate de edad

## Síntoma
Salió en la auditoría: una cuenta recién creada podía mandar `PATCH /api/v1/me { name }` (o `PUT /me/username`,
que además ponía `isPublic = true`) y quedar "onboardeada", pública y con todas las escrituras abiertas — seguir,
reseñar, reportar — sin haber dado nunca su año de nacimiento (F2.2, bloqueo de menores de 13).

## Causa raíz
El gate de edad vivía en UN endpoint (`POST /me/onboarding` → `completeOnboarding`), pero la señal de "ya pasó"
era un efecto secundario suyo (`name` no nulo) que otra ruta de escritura también producía. Y nada en el servidor
exigía esa señal: era solo el criterio con el que las apps y el layout web ENRUTAN. Un gate que solo existe como
navegación del cliente no es un gate.

## Prevención
- La señal es el dato del gate, no un vecino: `isOnboarded(user)` = `name` Y `ageVerified` (`birth_year IS NOT
  NULL` como booleano en la lista de campos por request; el año no sale).
- La única ruta que escribe `name`/`isPublic: true` (`updateProfile`) lleva `birth_year IS NOT NULL` en el WHERE.
- Las escrituras UGC/sociales de v1 llaman `requireOnboarded(user)` (403 `onboarding_required`).
- Antes de gatear un endpoint, leer el ORDEN de llamadas de los clientes instalados: iOS y Android reclaman el
  handle ANTES de `POST /me/onboarding`. Gatear el reclamo los rompía; la salida fue que el reclamo previo reserve
  sin publicar y que el onboarding publique.
- Pendiente: las acciones web equivalentes (ver `state/security.md`).
- **Resuelto el mismo día (ronda 1b)**: las acciones web llevan `notOnboarded(user)` (`src/authz/index.ts`) —
  seguir, reseñar, reclamar handle, reportar con sesión — y `(app)/layout.tsx`, `/c/[id]`, `/onboarding` y
  `/onboarding/gente` enrutan con `isOnboarded`. La trampa al cerrar un gate de ENRUTADO: el destino del redirect
  tiene que aceptar al mismo usuario que el origen rechaza. `/onboarding` decidía su paso con `user.name`; con el
  layout ya en `isOnboarded`, una cuenta vieja con nombre y sin año habría caído en "elige 3" → `/backlogs` →
  `/onboarding` para siempre. Las dos páginas cambian JUNTAS y con el mismo predicado.
